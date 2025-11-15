// commands/help.js
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'help',
    aliases: ['h', 'comandos', 'ajuda'],
    description: 'Mostra todos os comandos disponíveis',
    inVoiceChannel: false,
    
    execute: async (message, client, args) => {
        const commandsPath = path.join(__dirname);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        const categories = {
            '🎵 **MÚSICA PRINCIPAL**': [],
            '🎛️ **EFEITOS E CONTROLES**': [],
            '📊 **INFORMAÇÃO E ESTATÍSTICAS**': [],
            '⚙️ **ADMINISTRATIVOS**': [],
            '🎪 **DIVERSÃO E EXTRAS**': []
        };

        // Organizar comandos por categoria
        for (const file of commandFiles) {
            if (file === 'help.js') continue;
            
            try {
                const command = require(path.join(commandsPath, file));
                
                if (!command.name || !command.description) continue;
                
                // Determinar categoria
                let category = '🎪 **DIVERSÃO E EXTRAS**';
                
                if (['play', 'p', 'mix', 'm', 'search'].includes(command.name)) {
                    category = '🎵 **MÚSICA PRINCIPAL**';
                } else if (['dj', 'effects', 'reverse', 'autoplay', 'pause', 'resume', 'skip', 'stop'].includes(command.name)) {
                    category = '🎛️ **EFEITOS E CONTROLES**';
                } else if (['queue', 'q', 'nowplaying', 'np', 'lib', 'library', 'stats'].includes(command.name)) {
                    category = '📊 **INFORMAÇÃO E ESTATÍSTICAS**';
                } else if (['reload', 'rl', 'reset', 'restart'].includes(command.name)) {
                    category = '⚙️ **ADMINISTRATIVOS**';
                }
                
                const commandInfo = {
                    name: command.name,
                    description: command.description,
                    aliases: command.aliases || [],
                    inVoiceChannel: command.inVoiceChannel || false
                };
                
                categories[category].push(commandInfo);
            } catch (error) {
                console.log(`⚠️ Ignorando comando ${file}:`, error.message);
            }
        }

        // Criar embed principal
        const mainEmbed = {
            color: 0x0099ff,
            title: '🎵 **COMANDOS DO BOT DE MÚSICA**',
            description: `**Prefixos:** \`!\` ou \`$\`\n**Total de comandos:** ${commandFiles.length - 1}\n\nUse \`!help [comando]\` para detalhes específicos!`,
            fields: [],
            footer: {
                text: `Solicitado por ${message.author.tag}`,
                icon_url: message.author.displayAvatarURL()
            },
            timestamp: new Date()
        };

        // Se pediu ajuda específica para um comando
        if (args[0]) {
            const commandName = args[0].toLowerCase();
            const command = client.commands.get(commandName);
            
            if (!command) {
                return message.channel.send('❌ | Comando não encontrado! Use `!help` para ver todos os comandos.');
            }
            
            const detailedEmbed = {
                color: 0x00ff00,
                title: `📖 **Comando: ${command.name}**`,
                description: command.description,
                fields: [
                    {
                        name: '🔤 **Como usar**',
                        value: `\`!${command.name}\`` + (command.aliases ? `\n**Aliases:** \`!${command.aliases.join('`, `!')}\`` : ''),
                        inline: false
                    },
                    {
                        name: '🎤 **Canal de voz**',
                        value: command.inVoiceChannel ? '✅ Precisa estar em canal de voz' : '❌ Não precisa de canal de voz',
                        inline: true
                    },
                    {
                        name: '👑 **Permissão**',
                        value: command.permission ? `🔒 ${command.permission}` : '🔓 Todos podem usar',
                        inline: true
                    }
                ],
                footer: {
                    text: `Use !help para ver todos os comandos`
                }
            };
            
            return message.channel.send({ embeds: [detailedEmbed] });
        }

        // Adicionar categorias ao embed principal
        for (const [categoryName, commands] of Object.entries(categories)) {
            if (commands.length > 0) {
                let categoryText = '';
                
                for (const cmd of commands) {
                    const aliases = cmd.aliases.length > 0 ? ` (*${cmd.aliases.join(', ')}*)` : '';
                    const voiceIcon = cmd.inVoiceChannel ? ' 🎤' : '';
                    categoryText += `• \`!${cmd.name}\`${aliases}${voiceIcon} - ${cmd.description}\n`;
                }
                
                mainEmbed.fields.push({
                    name: categoryName,
                    value: categoryText || '*Nenhum comando nesta categoria*',
                    inline: false
                });
            }
        }

        // Adicionar exemplos de uso
        mainEmbed.fields.push({
            name: '🎯 **EXEMPLOS DE USO**',
            value: [
                '`!p never gonna give you up` - Toca uma música',
                '`!p https://youtube.com/...` - Toca de um link',
                '`!mix metallica` - Cria um mix de músicas similares',
                '`!dj bassboost` - Ativa efeito de graves',
                '`!autoplay on` - Ativa reprodução automática',
                '`!lib` - Lista músicas no cache',
                '`!reload` - Recarrega comandos (admin)'
            ].join('\n'),
            inline: false
        });

        // Adicionar dicas
        mainEmbed.fields.push({
            name: '💡 **DICAS RÁPIDAS**',
            value: [
                '• Use **!p** em vez de **!play** - é mais rápido!',
                '• Músicas no cache tocam **instantaneamente**!',
                '• **!mix** cria playlists automáticas incríveis!',
                '• **Botões** abaixo da música controlam reprodução'
            ].join('\n'),
            inline: false
        });

        await message.channel.send({ embeds: [mainEmbed] });
    }
};
