// index.js — versão completa com auto-reset e aviso no último canal

// No início do index.js - Limpar conexões antigas

// EVITAR MULTI INSTANCIAS.

if (global.botInstance) {
    console.log('🔄 Limpando instância anterior do bot...');
    try {

        // Fechar conexões de voz
        const voiceConnections = client.voice?.adapters || new Map();
        for (const [guildId, connection] of voiceConnections) {
            try {
                connection.destroy();
            } catch (e) {}
        }
        
        // Fechar client antigo
        if (client && client.destroy) {
            client.destroy();
        }
    } catch (error) {
        console.log('⚠️ Erro ao limpar instância anterior:', error.message);
    }
}

global.botInstance = true;


// CODIGO NORMAL 
require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ===============================================
// 🔧 Inicialização do Client
// ===============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const PREFIXES = ['#', '$' , '%' , '&' , '/' ]; // 🆕 Array com os prefixos
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ Token do bot não encontrado no .env (DISCORD_TOKEN).');
  process.exit(1);
}

// ===============================================
// 🧩 Carregar comandos
// ===============================================
client.commands = new Collection();
const commandPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandPath, file));
  if (command.name) {
    client.commands.set(command.name, command);
    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) client.commands.set(alias, command);
    }
  }
}

console.log(`✅ Comandos carregados: ${client.commands.size}`);

// ===============================================
// 🧠 Control Manager
// ===============================================
class ControlManager {
  constructor() {
    this.controlMessages = new Map();
  }

  async updateOrCreateControlMessage(guildId, channel) {
    try {
      const existingMessageId = this.controlMessages.get(guildId);
      const queueManager = require('./utils/queueManager');
      const newControlMessage = queueManager.createControlMessage(guildId);
      if (!newControlMessage) return null;

      if (existingMessageId) {
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          if (existingMessage && existingMessage.editable) {
            await existingMessage.edit(newControlMessage);
            return existingMessage;
          }
        } catch {
          console.log('📝 Mensagem antiga não encontrada, criando nova...');
        }
      }

      const newMsg = await channel.send(newControlMessage);
      this.controlMessages.set(guildId, newMsg.id);
      return newMsg;
    } catch (err) {
      console.error('❌ Erro no ControlManager:', err.message);
    }
    return null;
  }

  removeControlMessage(guildId) {
    this.controlMessages.delete(guildId);
  }
}

const controlManager = new ControlManager();
module.exports.controlManager = controlManager;

// ===============================================
// 🎧 Inicialização dos utilitários principais
// ===============================================
const dibuiador = require('./utils/dibuiador');
const queueManager = require('./utils/queueManager');

//dibuiador.carregarIndice();


// ===============================================
// 🤖 Bot pronto
// ===============================================
client.once(Events.ClientReady, c => {
  console.log(`✅ Bot online como ${c.user.tag}`);
});

// ===============================================
// 💬 Sistema de prefixo (! e $) - APENAS UM EVENTO
// ===============================================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  
  // 🆕 Verifica ambos os prefixos
  let usedPrefix = null;
  for (const prefix of PREFIXES) {
    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
      break;
    }
  }
  
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/g);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  if (command.inVoiceChannel && !message.member.voice.channel) {
    return message.channel.send('❌ | Você precisa estar em um canal de voz!');
  }

  try {
    console.log(`🔧 Executando comando: ${usedPrefix}${commandName} com args:`, args);
    await command.execute(message, client, args);
  } catch (err) {
    console.error(`❌ Erro no comando "${usedPrefix}${commandName}":`, err);
    await message.channel.send(`❌ | Ocorreu um erro: ${err.message}`);
  }
});

// ===============================================
// 🎮 Interações com botões
// ===============================================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const queueManager = require('./utils/queueManager');
  const guildId = interaction.guild.id;
  const player = queueManager.getPlayer(guildId);

  try {
    switch (interaction.customId) {
      case 'music_pause':
        if (player) {
          if (queueManager.isPaused(guildId)) {
            player.unpause();
            await interaction.reply({ content: '▶️ | Música retomada.', ephemeral: true });
          } else {
            player.pause();
            await interaction.reply({ content: '⏸️ | Música pausada.', ephemeral: true });
          }
        }
        break;

      case 'music_skip':
        queueManager.skipSong(guildId);
        await interaction.reply({ content: '⏭️ | Música pulada.', ephemeral: true });
        break;

      case 'music_stop':
        queueManager.resetGuild(guildId);
        await interaction.reply({ content: '⏹️ | Reprodução encerrada.', ephemeral: true });
        break;

      case 'music_queue':
        const info = queueManager.getQueueInfo(guildId);
        const list = info.queue.map((s, i) => `${i + 1}. ${s.title}`).join('\n') || 'Fila vazia.';
        await interaction.reply({ content: `🎶 Fila atual:\n${list}`, ephemeral: true });
        break;

      case 'music_refresh':
        await controlManager.updateOrCreateControlMessage(guildId, interaction.channel);
        await interaction.reply({ content: '🔄 | Controles atualizados.', ephemeral: true });
        break;
    }
  } catch (e) {
    console.error('❌ Erro em InteractionCreate:', e.message);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ | Erro interno.', ephemeral: true });
    }
  }
});

// ===============================================
// 🔌 Auto-reset quando o bot é kickado / movido
// ===============================================
const lastTextChannel = new Map(); // guildId -> canal onde o bot respondeu por último

// Guarda o último canal onde o bot enviou mensagem
client.on(Events.MessageCreate, msg => {
  if (!msg.guild || msg.author.bot) return;
  lastTextChannel.set(msg.guild.id, msg.channel);
});

// Monitora saídas e desconexões
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guild = oldState.guild;
    const guildId = guild.id;
    const queueManager = require('./utils/queueManager');

    // 1️⃣ Bot foi desconectado (kick, manual ou timeout)
    const botWasDisconnected =
      oldState.member?.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId;

    if (botWasDisconnected) {
      console.log(`🔌 Bot foi desconectado do canal em ${guild.name}`);
      queueManager.resetGuild(guildId);

      const channel = lastTextChannel.get(guildId);
      if (channel && channel.permissionsFor(guild.members.me).has('SendMessages')) {
        await channel.send('😤 Alguém me kickou!! \n Aposto que foi o <@rodrigopituba>!!');
      }
      return;
    }

    // 2️⃣ Canal de voz deletado
    const voiceChannelDeleted =
      oldState.channelId &&
      !newState.channelId &&
      oldState.channel?.deleted;

    if (voiceChannelDeleted) {
      console.log(`🗑️ Canal de voz deletado em ${guild.name}`);
      queueManager.resetGuild(guildId);
      const channel = lastTextChannel.get(guildId);
      if (channel && channel.permissionsFor(guild.members.me).has('SendMessages')) {
        await channel.send('🚫 O canal de voz foi deletado!');
      }
      return;
    }

    // 3️⃣ Bot movido de canal
    const botMoved =
      oldState.member?.id === client.user.id &&
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId;

    if (botMoved) {
      console.log(`➡️ Bot movido de canal em ${guild.name}`);
      queueManager.resetGuild(guildId);
      const channel = lastTextChannel.get(guildId);
      if (channel && channel.permissionsFor(guild.members.me).has('SendMessages')) {
        await channel.send('🤨 Fui movido pra outro canal!');
      }
      return;
    }

  } catch (e) {
    console.error('⚠️ Erro em VoiceStateUpdate:', e.message);
  }
});

// ===============================================
// 🚀 Login
// ===============================================
client.login(token);
