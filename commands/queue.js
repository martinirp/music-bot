const queueManager = require('../utils/queueManager');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'queue',
    aliases: ['q', 'fila'],
    inVoiceChannel: false,

    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const queue = queueManager.getQueue(guildId);

        if (!queue?.songs?.length && !queue?.currentSong) {
            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6) // Cinza
                        .setTitle('📭 Fila Vazia')
                        .setDescription('A fila de músicas está vazia no momento.')
                        .addFields({
                            name: '💡 Dica',
                            value: 'Use `!play` para adicionar músicas à fila!',
                            inline: false
                        })
                ]
            });
        }

        // Criar embed estilo Bootstrap
        const embed = new EmbedBuilder()
            .setColor(0x3498db) // Azul
            .setTitle('🎵 **Music Queue**')
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/3658/3658776.png')
            .setFooter({ text: 'Music Bot • Bootstrap Style', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        // Música atual - Card style
        if (queue.currentSong) {
            // Limpar título da música atual
            const cleanCurrentTitle = queue.currentSong.title
                .replace(/\s*\[[^\]]*\]/g, '')
                .replace(/\s*\([^)]*\)/g, '')
                .replace(/\s*[-–].*$/, '')
                .trim();
                
            const artistMatch = cleanCurrentTitle.match(/(.+?)\s+[-–]/);
            const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
            const songName = cleanCurrentTitle.replace(/^.+\s[-–]\s*/, '').trim();

            embed.setDescription(`
🎶 **Now Playing** 
\`\`\`css
[${songName} by ${artist}]
\`\`\`
**👤 Requested by:** ${queue.currentSong.requestedBy}
**📊 Queue length:** ${queue.songs?.length || 0} tracks

${queue.songs?.length > 0 ? '▼ **Up Next**' : ''}
            `);
        }

        // Próximas na fila - Bootstrap table style
        if (queue.songs?.length > 0) {
            const rows = [];
            
            // Limitar para mostrar apenas as primeiras 5 músicas (devido à limitação do Discord)
            const songsToShow = queue.songs.slice(0, 5);
            
            // Criar uma ActionRow para CADA música (máximo 5)
            songsToShow.forEach((song, index) => {
                const position = index + 1;
                const badgeColor = position <= 3 ? '🟢' : '🔵';
                
                // Limpar título da música
                const cleanTitle = song.title
                    .replace(/\s*\[[^\]]*\]/g, '')
                    .replace(/\s*\([^)]*\)/g, '')
                    .replace(/\s*[-–].*$/, '')
                    .trim();
                
                // Criar uma linha para cada música com estilo Bootstrap
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`remove_queue_${position}_${Date.now()}`)
                        .setLabel('×')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️'),
                    new ButtonBuilder()
                        .setCustomId(`dummy_${position}`)
                        .setLabel(`${badgeColor} #${position} | ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
                
                rows.push(row);
            });

            // Adicionar informação sobre músicas restantes se houver mais de 5
            if (queue.songs.length > 5) {
                embed.addFields({
                    name: '📋 More Tracks',
                    value: `...and ${queue.songs.length - 5} more tracks in queue`,
                    inline: false
                });
            }
            
            // Adicionar badges de status
            embed.addFields(
                {
                    name: '📈 Queue Stats',
                    value: `🟢 **Now Playing** • 🔵 **In Queue** • 🔴 **Remove**`,
                    inline: false
                }
            );

            // Enviar mensagem com embed e botões
            const queueMessage = await message.channel.send({
                embeds: [embed],
                components: rows
            });

            // Criar collector para os botões
            const filter = (interaction) => 
                interaction.isButton() && 
                interaction.customId.startsWith('remove_queue_') &&
                interaction.message.id === queueMessage.id;

            const collector = queueMessage.createMessageComponentCollector({ 
                filter, 
                time: 60000
            });

            let repliedInteractions = new Set();

            collector.on('collect', async (interaction) => {
                if (repliedInteractions.has(interaction.id)) return;
                repliedInteractions.add(interaction.id);

                if (!interaction.member.voice.channel) {
                    await interaction.reply({ 
                        content: '❌ | Você precisa estar em um canal de voz!', 
                        flags: 64
                    });
                    return;
                }

                try {
                    const position = parseInt(interaction.customId.split('_')[2]);
                    const removedSong = queueManager.removeFromQueue(guildId, position);
                    
                    // Limpar título da música removida
                    const cleanRemovedTitle = removedSong.title
                        .replace(/\s*\[[^\]]*\]/g, '')
                        .replace(/\s*\([^)]*\)/g, '')
                        .replace(/\s*[-–].*$/, '')
                        .trim();
                    
                    // Bootstrap-style alert
                    await interaction.reply({ 
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71) // Verde sucesso
                                .setTitle('✅ Removed Successfully')
                                .setDescription(`**Track:** ${cleanRemovedTitle}`)
                                .setFooter({ text: 'Bootstrap Alert • Success' })
                        ],
                        flags: 64
                    });

                    // Atualizar a mensagem da fila
                    setTimeout(async () => {
                        try {
                            await queueMessage.delete();
                            await module.exports.execute(message, client, args);
                        } catch (error) {
                            console.log('Erro ao atualizar fila:', error.message);
                        }
                    }, 1000);
                    
                } catch (error) {
                    if (!interaction.replied) {
                        await interaction.reply({ 
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xe74c3c) // Vermelho erro
                                    .setTitle('❌ Error')
                                    .setDescription(error.message)
                                    .setFooter({ text: 'Bootstrap Alert • Error' })
                            ],
                            flags: 64
                        });
                    }
                }
            });

            collector.on('end', () => {
                queueMessage.edit({ 
                    components: [],
                    embeds: [
                        embed.setColor(0x95a5a6) // Muda para cinza quando expira
                         .setFooter({ text: 'Music Bot • Session Expired', iconURL: client.user.displayAvatarURL() })
                    ]
                }).catch(() => {});
                repliedInteractions.clear();
            });

        } else {
            // Se não há músicas na fila - Empty state
            await message.channel.send({
                embeds: [
                    embed.setColor(0xf39c12) // Amarelo warning
                    .addFields({
                        name: '📭 Queue Empty',
                        value: 'No tracks in the queue. Add some music to get started!',
                        inline: false
                    })
                ]
            });
        }
    },
};
