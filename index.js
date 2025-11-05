const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
client.aliases = new Collection();


// 🧹 GERENCIADOR DE CONTROLES
class ControlManager {
    constructor() {
        this.controlMessages = new Map(); // guildId -> messageId
    }
    
    async updateOrCreateControlMessage(guildId, channel) {
        try {
            const existingMessageId = this.controlMessages.get(guildId);
            
            if (existingMessageId) {
                try {
                    const existingMessage = await channel.messages.fetch(existingMessageId);
                    const queueManager = require('./utils/queueManager');
                    const newControlMessage = queueManager.createControlMessage(guildId);
                    
                    if (existingMessage.editable && newControlMessage) {
                        await existingMessage.edit(newControlMessage);
                        return existingMessage;
                    }
                } catch (error) {
                    // Mensagem foi deletada, criar nova
                    console.log('📝 Mensagem de controle anterior não encontrada, criando nova...');
                }
            }
            
            // Criar nova mensagem
            const queueManager = require('./utils/queueManager');
            const controlMessage = queueManager.createControlMessage(guildId);
            if (controlMessage) {
                const newMessage = await channel.send(controlMessage);
                this.controlMessages.set(guildId, newMessage.id);
                return newMessage;
            }
            
        } catch (error) {
            console.error('❌ Erro no gerenciamento de controles:', error);
        }
        return null;
    }
    
    removeControlMessage(guildId) {
        this.controlMessages.delete(guildId);
    }
}

const controlManager = new ControlManager();

client.once(Events.ClientReady, (c) => {
    console.log(`✅ Ready! Logged in as ${c.user.tag}`);
    
    // Iniciar limpeza automática
    const queueManager = require('./utils/queueManager');
    queueManager.startCleanupInterval();
});

client.on('messageCreate', async (message) => {
    const prefix = '$';

    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const commandTyped = args.shift().toLowerCase();

    // Carregar comandos dinamicamente
    let cmd;
    try {
        cmd = require(`./commands/${commandTyped}`);
    } catch (error) {
        // Tentar encontrar por alias
        const commandFiles = {
            'play': 'play',
            'p': 'play',
            'queue': 'queue', 
            'q': 'queue',
            'fila': 'queue',
            'skip': 'skip',
            's': 'skip',
            'pular': 'skip',
            'leave': 'leave',
            'dc': 'leave',
            'disconnect': 'leave',
            'sair': 'leave',
            'pause': 'pause',
            'pausar': 'pause',
            'resume': 'resume',
            'continuar': 'resume',
            'controls': 'controls',
            'controles': 'controls',
            'panel': 'controls',
            'stats': 'stats'
        };

        const actualCommand = commandFiles[commandTyped];
        if (actualCommand) {
            cmd = require(`./commands/${actualCommand}`);
        }
    }

    if (!cmd) return;

    if (cmd.inVoiceChannel && !message.member.voice.channel) {
        return message.channel.send('❌ | Você precisa estar em um canal de voz!');
    }

    try {
        console.log(`🔧 Executando comando: ${commandTyped} com args:`, args);
        await cmd.execute(message, client, args);
    } catch (e) {
        console.error('❌ Erro no comando:', e);
        message.channel.send(`❌ | Error: \`${e.message}\``);
    }
});

// 🎮 SISTEMA DE INTERAÇÃO COM BOTÕES
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        // ✅ VERIFICAÇÃO EXTRA DE SEGURANÇA
        if (!interaction.guild) {
            return await interaction.reply({ 
                content: '❌ | Este comando só funciona em servidores!', 
                ephemeral: true 
            });
        }

        const guildId = interaction.guild.id;
        const [action, type] = interaction.customId.split('_');
        
        // ✅ VERIFICAR SE É UM BOTÃO DE MÚSICA VÁLIDO
        if (action !== 'music' || !['pause', 'skip', 'stop', 'queue', 'refresh'].includes(type)) {
            return await interaction.reply({ 
                content: '❌ | Botão inválido!', 
                ephemeral: true 
            });
        }

        // ✅ VERIFICAR SE O BOT ESTÁ NO MESMO CANAL DE VOZ
        const voiceChannel = interaction.member.voice.channel;
        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        
        if (botVoiceChannel && voiceChannel?.id !== botVoiceChannel.id) {
            return await interaction.reply({ 
                content: '❌ | Você precisa estar no mesmo canal de voz que eu!', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const queueManager = require('./utils/queueManager');
        const player = queueManager.getPlayer(guildId);
        const currentSong = queueManager.getCurrentSong(guildId);

        if (!player || !currentSong) {
            await interaction.editReply('❌ | Nenhuma música tocando!');
            return;
        }

        let response = '';

        switch (type) {
            case 'pause':
                if (player.state.status === 'playing') {
                    player.pause();
                    response = '⏸️ | Música pausada';
                } else if (player.state.status === 'paused') {
                    player.unpause();
                    response = '▶️ | Música continuando...';
                }
                break;

            case 'skip':
                if (queueManager.getQueueInfo(guildId).queue.length === 0) {
                    response = '❌ | Não há próxima música na fila!';
                } else {
                    queueManager.skipSong(guildId);
                    response = '⏭️ | Pulando para próxima música...';
                }
                break;

            case 'stop':
                queueManager.resetGuild(guildId);
                controlManager.removeControlMessage(guildId);
                response = '⏹️ | Música parada e bot desconectado';
                break;

            case 'queue':
                const queueInfo = queueManager.getQueueInfo(guildId);
                let queueText = `**🎶 Tocando agora:** ${currentSong.title}\n\n`;
                
                if (queueInfo.queue.length > 0) {
                    queueText += '**📋 Próximas:**\n';
                    queueInfo.queue.slice(0, 5).forEach((song, index) => {
                        queueText += `**${index + 1}.** ${song.title}\n`;
                    });
                    if (queueInfo.queue.length > 5) {
                        queueText += `\n...e mais ${queueInfo.queue.length - 5} músicas`;
                    }
                } else {
                    queueText += '📭 | Nenhuma música na fila.';
                }
                
                response = queueText;
                break;

            case 'refresh':
                response = '🔄 | Controles atualizados!';
                break;

            default:
                response = '❌ | Ação desconhecida';
        }

        await interaction.editReply(response);

        // Atualizar mensagem de controles (exceto para refresh)
        if (type !== 'refresh' && interaction.message.editable) {
            try {
                await controlManager.updateOrCreateControlMessage(guildId, interaction.channel);
            } catch (editError) {
                console.log('⚠️ Não foi possível atualizar a mensagem:', editError.message);
            }
        }

    } catch (error) {
        console.error('❌ Button Interaction Error:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ 
                    content: '❌ | Erro ao processar comando!' 
                });
            } else {
                await interaction.reply({ 
                    content: '❌ | Erro ao processar comando!', 
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error('❌ Erro ao responder interação:', e);
        }
    }
});

client.login(token);