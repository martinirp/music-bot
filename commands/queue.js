const queueManager = require('../utils/queueManager');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// 🆕 FUNÇÃO PARA LIMPAR TÍTULO - CORRIGIDA
function cleanYouTubeTitle(title) {
    if (!title) return 'Título desconhecido';
    
    return title
        .replace(/\s*\[[^\]]*\]/g, '') // Remove [videoId] e similares
        .replace(/\s*\([^)]*\)/g, '')  // Remove (Official Video) etc
        // 🆕 REMOVER APENAS: Não remove tudo depois do -
        .replace(/\s*\[Official Music Video\]/gi, '')
        .replace(/\s*\(Official Audio\)/gi, '')
        .replace(/\s*\(Lyrics\)/gi, '')
        .replace(/\s*\(Letra\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
}

// 🆕 FUNÇÃO PARA FORMATAR DURAÇÃO
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '[--:--]';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `[${minutes}:${remainingSeconds.toString().padStart(2, '0')}]`;
}

module.exports = {
    name: 'queue',
    aliases: ['q', 'fila'],
    inVoiceChannel: false,

    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const queue = queueManager.getQueue(guildId);

        // Verificação mais precisa do estado da fila
        const hasCurrentSong = queue?.currentSong;
        const hasQueueSongs = queue?.songs?.length > 0;
        const isEmpty = !hasCurrentSong && !hasQueueSongs;

        if (isEmpty) {
            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('📭 Fila Vazia')
                        .setDescription('A fila de músicas está vazia no momento.')
                        .addFields({
                            name: '💡 Dica',
                            value: 'Use `#$%&*play` para adicionar músicas à fila!',
                            inline: false
                        })
                ]
            });
        }

        // 🆕 CRIAR LISTA CORRIGIDA - SEM DUPLICAÇÃO
        let queueDescription = '';
        
        // 🆕 ADICIONAR "TOCANDO AGORA" SEPARADO
        if (hasCurrentSong) {
            const cleanTitle = cleanYouTubeTitle(queue.currentSong.title);
            const duration = queue.currentSong.duration ? formatDuration(queue.currentSong.duration) : '[--:--]';
            queueDescription += `🎵 **Tocando Agora:** [${cleanTitle}](${queue.currentSong.url})\n\n`;
        }

        // 🆕 ADICIONAR "FILA" SEPARADO
        queueDescription += '📋 **Fila de Reprodução:**\n';
        
        if (!hasQueueSongs) {
            queueDescription += '`Nenhuma música na fila`\n';
        } else {
            // 🆕 MOSTRAR APENAS AS MÚSICAS DA FILA (não inclui a atual)
            // A música atual está separada em "Tocando Agora"
            const songsToShow = queue.songs.slice(0, 10); // Mostrar mais músicas
            
            songsToShow.forEach((song, index) => {
                const position = index + 1; // 🆕 COMEÇA NA POSIÇÃO 1
                const duration = song.duration ? formatDuration(song.duration) : '[--:--]';
                const cleanTitle = cleanYouTubeTitle(song.title);
                queueDescription += `${position}. ${duration} [${cleanTitle}](${song.url})\n`;
            });

            // 🆕 MOSTRAR CONTAGEM TOTAL SE HOUVER MAIS MÚSICAS
            if (queue.songs.length > 10) {
                queueDescription += `\n... e mais ${queue.songs.length - 10} música(s)`;
            }
        }

        // Criar componentes interativos
        const components = [];

        // Dropdown "Faça uma seleção"
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`queue_actions_${Date.now()}`)
            .setPlaceholder('🎵 Faça uma seleção')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('▶️ Pular para música...')
                    .setValue('jump_to')
                    .setDescription('Pular para uma música específica'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🔀 Embaralhar fila')
                    .setValue('shuffle')
                    .setDescription('Misturar a ordem das músicas'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🗑️ Limpar fila')
                    .setValue('clear')
                    .setDescription('Remover todas as músicas da fila'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🔁 Modo repetição')
                    .setValue('loop')
                    .setDescription('Alterar modo de repetição'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💾 Salvar fila')
                    .setValue('save')
                    .setDescription('Salvar esta fila como playlist')
            );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        components.push(selectRow);

        // Botão "cancel"
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`queue_cancel_${Date.now()}`)
                .setLabel('cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
        components.push(buttonRow);

        // Enviar embed com componentes
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎵 Fila de Reprodução')
            .setDescription(queueDescription)
            .setFooter({ text: 'Selecione uma ação abaixo', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const queueMessage = await message.channel.send({
            embeds: [embed],
            components: components
        });

        // Criar collector para interações
        const filter = (interaction) => 
            (interaction.isStringSelectMenu() || interaction.isButton()) &&
            interaction.message.id === queueMessage.id;

        const collector = queueMessage.createMessageComponentCollector({ 
            filter, 
            time: 60000 
        });

        collector.on('collect', async (interaction) => {
            if (interaction.isButton() && interaction.customId.includes('queue_cancel')) {
                // Ação do botão "cancel"
                await interaction.update({
                    embeds: [
                        embed.setColor(0x95a5a6)
                            .setFooter({ text: 'Fila fechada • Use #$%&*queue para abrir novamente', iconURL: client.user.displayAvatarURL() })
                    ],
                    components: []
                });
                collector.stop();
                return;
            }

            if (interaction.isStringSelectMenu() && interaction.customId.includes('queue_actions')) {
                const action = interaction.values[0];
                
                // Verificar se o usuário está em um canal de voz
                if (!interaction.member.voice.channel) {
                    await interaction.reply({
                        content: '❌ | Você precisa estar em um canal de voz!',
                        flags: 64
                    });
                    return;
                }

                switch (action) {
                    case 'jump_to':
                        await interaction.reply({
                            content: '⏭️ | Digite `#$%&*jump <número>` para pular para uma música específica! Exemplo: `#$%&*jump 3`',
                            flags: 64
                        });
                        break;
                        
                    case 'shuffle':
                        try {
                            // Verificar se há músicas para embaralhar
                            if (!hasQueueSongs || queue.songs.length <= 1) {
                                await interaction.reply({
                                    content: '❌ | Não há músicas suficientes na fila para embaralhar!',
                                    flags: 64
                                });
                                return;
                            }
                            
                            // Embaralhar a fila
                            for (let i = queue.songs.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
                            }
                            
                            await interaction.reply({
                                content: '🔀 | Fila embaralhada com sucesso!',
                                flags: 64
                            });
                            // Atualizar a mensagem da fila
                            setTimeout(() => {
                                queueMessage.delete().catch(() => {});
                                module.exports.execute(message, client, args);
                            }, 1500);
                        } catch (error) {
                            await interaction.reply({
                                content: '❌ | Erro ao embaralhar a fila!',
                                flags: 64
                            });
                        }
                        break;
                        
                    case 'clear':
                        try {
                            // Verificar se há músicas para limpar
                            if (!hasQueueSongs) {
                                await interaction.reply({
                                    content: '❌ | A fila já está vazia!',
                                    flags: 64
                                });
                                return;
                            }
                            
                            // Limpar a fila
                            queue.songs = [];
                            
                            await interaction.reply({
                                content: '🗑️ | Fila limpa com sucesso!',
                                flags: 64
                            });
                            // Atualizar a mensagem da fila
                            setTimeout(() => {
                                queueMessage.delete().catch(() => {});
                                module.exports.execute(message, client, args);
                            }, 1500);
                        } catch (error) {
                            await interaction.reply({
                                content: '❌ | Erro ao limpar a fila!',
                                flags: 64
                            });
                        }
                        break;
                        
                    case 'loop':
                        await interaction.reply({
                            content: '🔁 | Use `#$%&*loop` para alterar o modo de repetição!',
                            flags: 64
                        });
                        break;
                        
                    case 'save':
                        await interaction.reply({
                            content: '💾 | Use `#$%&*saveplaylist <nome>` para salvar esta fila como playlist!',
                            flags: 64
                        });
                        break;
                }
            }
        });

        collector.on('end', () => {
            queueMessage.edit({ 
                components: [],
                embeds: [
                    embed.setColor(0x95a5a6)
                        .setFooter({ text: 'Sessão expirada • Use #$%&*queue para abrir novamente', iconURL: client.user.displayAvatarURL() })
                ]
            }).catch(() => {});
        });
    },
};
