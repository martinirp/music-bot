const queueManager = require('../utils/queueManager');
const dibuiador = require('../utils/dibuiador');
const downloadManager = require('../utils/download');
const { joinVoiceChannel } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// 🆕 FUNÇÃO PARA LIMPAR TÍTULO - CORRIGIDA
function cleanYouTubeTitle(title) {
    if (!title) return 'Unknown Title';
    
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

// 🆕 FUNÇÃO PARA DETECTAR PLAYLIST
function isPlaylistUrl(url) {
    return url.includes('list=') || 
           url.includes('playlist?') || 
           url.includes('/playlist/') ||
           url.includes('&start_radio=');
}

// 🆕 FUNÇÃO PARA FORMATAR DURAÇÃO
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '[--:--]';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `[${minutes}:${remainingSeconds.toString().padStart(2, '0')}]`;
}

// 🆕 CLASSE PARA GERENCIAR EMBED DE PLAYLIST
class PlaylistEmbedManager {
    constructor(message, playlistTitle, totalSongs) {
        this.message = message;
        this.playlistTitle = playlistTitle;
        this.totalSongs = totalSongs;
        this.processedSongs = 0;
        this.addedSongs = 0;
        this.failedSongs = 0;
        this.currentPage = 1;
        this.songsPerPage = 10;
        this.embedMessage = null;
        this.songsList = [];
        this.collector = null;
    }

    async createInitialEmbed() {
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📚 Carregando Playlist...')
            .setDescription(`**${this.playlistTitle}**\n\n🔄 Processando ${this.totalSongs} músicas...`)
            .addFields(
                { name: '✅ Adicionadas', value: '`0`', inline: true },
                { name: '❌ Falhas', value: '`0`', inline: true },
                { name: '⏳ Processadas', value: '`0/' + this.totalSongs + '`', inline: true }
            )
            .setFooter({ text: `Página 1/${Math.ceil(this.totalSongs / this.songsPerPage)} • Use os botões para navegar` });

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('playlist_prev')
                    .setLabel('◀️ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('playlist_next')
                    .setLabel('Próxima ▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.totalSongs <= this.songsPerPage)
            )
        ];

        this.embedMessage = await this.message.channel.send({
            embeds: [embed],
            components: components
        });

        // 🆕 CRIAR COLLECTOR PARA OS BOTÕES
        this.createButtonCollector();

        return this.embedMessage;
    }

    // 🆕 FUNÇÃO PARA CRIAR COLLECTOR DOS BOTÕES
    createButtonCollector() {
        this.collector = this.embedMessage.createMessageComponentCollector({
            filter: (interaction) => 
                interaction.customId === 'playlist_prev' || 
                interaction.customId === 'playlist_next',
            time: 300000 // 5 minutos
        });

        this.collector.on('collect', async (interaction) => {
            await interaction.deferUpdate();

            if (interaction.customId === 'playlist_prev') {
                this.currentPage--;
            } else if (interaction.customId === 'playlist_next') {
                this.currentPage++;
            }

            await this.updateEmbedDisplay();
        });

        this.collector.on('end', () => {
            console.log('Collector de botões da playlist finalizado');
        });
    }

    // 🆕 FUNÇÃO PARA ATUALIZAR A EXIBIÇÃO DO EMBED (APÓS CLIQUE NOS BOTÕES)
    async updateEmbedDisplay() {
        const totalPages = Math.ceil(this.songsList.length / this.songsPerPage);
        const startIndex = (this.currentPage - 1) * this.songsPerPage;
        const endIndex = Math.min(startIndex + this.songsPerPage, this.songsList.length);
        
        let songsDescription = '';
        if (this.songsList.length > 0) {
            const currentPageSongs = this.songsList.slice(startIndex, endIndex);
            currentPageSongs.forEach((song, index) => {
                const globalIndex = startIndex + index + 1;
                songsDescription += `${globalIndex}. ${song}\n`;
            });
        } else {
            songsDescription = '`Processando músicas...`\n';
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(this.processedSongs >= this.totalSongs ? '📚 Playlist Carregada' : '📚 Carregando Playlist...')
            .setDescription(`**${this.playlistTitle}**\n\n${songsDescription}`)
            .addFields(
                { name: '✅ Adicionadas', value: `\`${this.addedSongs}\``, inline: true },
                { name: '❌ Falhas', value: `\`${this.failedSongs}\``, inline: true },
                { name: '⏳ Processadas', value: `\`${this.processedSongs}/${this.totalSongs}\``, inline: true }
            )
            .setFooter({ text: `Página ${this.currentPage}/${totalPages} • ${this.processedSongs >= this.totalSongs ? 'Concluído!' : 'Processando...'}` });

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('playlist_prev')
                    .setLabel('◀️ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('playlist_next')
                    .setLabel('Próxima ▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.currentPage === totalPages || this.songsList.length <= this.songsPerPage)
            )
        ];

        await this.embedMessage.edit({
            embeds: [embed],
            components: components
        });
    }

    async updateEmbed(songTitle = null, success = true) {
        this.processedSongs++;
        if (success) {
            this.addedSongs++;
            if (songTitle) {
                this.songsList.push(songTitle);
            }
        } else {
            this.failedSongs++;
        }

        await this.updateEmbedDisplay();
    }

    async completeEmbed() {
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ Playlist Concluída')
            .setDescription(`**${this.playlistTitle}**\n\n✅ **${this.addedSongs}** músicas adicionadas à fila${this.failedSongs > 0 ? `\n❌ **${this.failedSongs}** falhas` : ''}`)
            .setFooter({ text: 'Playlist carregada com sucesso!' });

        // 🆕 PARAR O COLLECTOR AO FINALIZAR
        if (this.collector) {
            this.collector.stop();
        }

        await this.embedMessage.edit({
            embeds: [embed],
            components: []
        });
    }
}

// 🆕 FUNÇÃO PARA TRATAR PLAYLIST COM EMBED DINÂMICO (PROCESSAMENTO SEQUENCIAL)
async function handlePlaylist(message, guildId, playlistUrl, voiceChannel) {
    try {
        console.log('📚 Carregando playlist...');
        
        const playlist = await dibuiador.buscarPlaylist(playlistUrl);
        
        if (!playlist || !playlist.videos || playlist.videos.length === 0) {
            await message.channel.send('❌ | Playlist vazia ou não encontrada!');
            return;
        }

        // 🆕 CRIAR EMBED DINÂMICO
        const embedManager = new PlaylistEmbedManager(
            message, 
            playlist.title, 
            playlist.videos.length
        );
        await embedManager.createInitialEmbed();

        let adicionadas = 0;
        let falhas = 0;

        // 🆕 PROCESSAR MÚSICAS SEQUENCIALMENTE (UMA POR VEZ)
        for (let i = 0; i < playlist.videos.length; i++) {
            const video = playlist.videos[i];
            
            try {
                // Buscar música (pode encontrar no cache)
                const resultado = await dibuiador.buscarMusica(video.url);
                if (!resultado) {
                    falhas++;
                    await embedManager.updateEmbed(null, false);
                    continue;
                }

                let songInfo;
                
                if (resultado.fromCache) {
                    // Se veio do cache, usa diretamente
                    console.log(`✅ Usando arquivo do cache: ${resultado.title}`);
                    songInfo = {
                        url: resultado.url,
                        title: resultado.title,
                        videoId: resultado.videoId,
                        requestedBy: message.author.tag,
                        channel: message.channel,
                        fromCache: true,
                        file: resultado.file
                    };
                } else {
                    // Se não está no cache, faz download
                    console.log(`📥 Baixando: ${resultado.title}`);
                    const downloadResult = await downloadManager.downloadSong(
                        resultado.url,
                        resultado.videoId,
                        resultado.title
                    );

                    if (!downloadResult.success) {
                        falhas++;
                        await embedManager.updateEmbed(null, false);
                        continue;
                    }

                    songInfo = {
                        url: resultado.url,
                        title: resultado.title,
                        videoId: resultado.videoId,
                        requestedBy: message.author.tag,
                        channel: message.channel,
                        fromCache: downloadResult.fromCache,
                        file: downloadResult.file
                    };
                }

                // Adicionar à fila
                const position = await queueManager.addToQueue(guildId, songInfo, voiceChannel);
                adicionadas++;

                // 🆕 ATUALIZAR EMBED COM A MÚSICA ADICIONADA
                const cleanTitle = cleanYouTubeTitle(resultado.title);
                await embedManager.updateEmbed(cleanTitle, true);

                // 🆕 SE É A PRIMEIRA MÚSICA, INICIAR REPRODUÇÃO IMEDIATAMENTE
                if (i === 0 && position === 1) {
                    console.log(`🎵 Iniciando reprodução da primeira música: ${cleanTitle}`);
                    
                    // Forçar início da reprodução
                    const queue = queueManager.getQueue(guildId);
                    if (queue && !queue.playing) {
                        setTimeout(() => {
                            try {
                                queueManager.playNextSong(guildId);
                            } catch (error) {
                                console.error('❌ Erro ao iniciar reprodução:', error);
                            }
                        }, 1000);
                    }
                }

                // 🆕 PEQUENA PAUSA ENTRE MÚSICAS PARA NÃO SOBRECARREGAR
                if (i < playlist.videos.length - 1) {
                    await new Promise(res => setTimeout(res, 1000));
                }

            } catch (err) {
                console.log('❌ Erro ao processar música da playlist:', err);
                falhas++;
                await embedManager.updateEmbed(null, false);
            }
        }

        // 🆕 FINALIZAR EMBED
        await embedManager.completeEmbed();

        // Atualizar controles se alguma música foi adicionada
        const queue = queueManager.getQueue(guildId);
        if (adicionadas > 0) {
            setTimeout(async () => {
                const controlManager = require('../index.js').controlManager;
                if (controlManager) {
                    await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                }
            }, 2000);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar playlist:', error);
        await message.channel.send('❌ | Erro ao carregar a playlist: ' + error.message);
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    inVoiceChannel: true,

    execute: async (message, client, args) => {
        if (!args[0])
            return message.channel.send('❌ | Entre com um link ou nome da música!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel)
            return message.channel.send('❌ | Entre em um canal de voz!');

        const permissions = voiceChannel.permissionsFor(message.guild.members.me);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return message.channel.send('❌ | Não tenho permissão para entrar/falar nesse canal!');
        }

        let connection = queueManager.connections.get(message.guild.id);
        if (!connection) {
            try {
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: false
                });
                queueManager.connections.set(message.guild.id, connection);
            } catch (err) {
                console.error('❌ Falha ao conectar:', err);
                return message.channel.send('❌ | Não consegui entrar no canal de voz.');
            }
        }

        const guildId = message.guild.id;
        const query = args.join(" ");

        try {
            // 🆕 DETECTAR SE É PLAYLIST
            if (isPlaylistUrl(query)) {
                console.log('🎵 Detectada playlist, carregando...');
                return await handlePlaylist(message, guildId, query, voiceChannel);
            }

            // Busca normal de música única
            let resultado = await dibuiador.buscarMusica(query);
            if (!resultado) return message.channel.send('❌ | Não encontrei nada!');

            let songInfo;

            // 🆕 VERIFICAR SE JÁ VEIO DO CACHE
            if (resultado.fromCache) {
                console.log(`✅ Usando arquivo do cache: ${resultado.title}`);
                songInfo = {
                    url: resultado.url,
                    title: resultado.title,
                    videoId: resultado.videoId,
                    requestedBy: message.author.tag,
                    channel: message.channel,
                    fromCache: true,
                    file: resultado.file
                };
            } else {
                // Se não está no cache, faz download
                const downloadResult = await downloadManager.downloadSong(
                    resultado.url, 
                    resultado.videoId, 
                    resultado.title
                );

                if (!downloadResult.success) {
                    return message.channel.send('❌ | Erro ao baixar a música: ' + downloadResult.error);
                }

                songInfo = {
                    url: resultado.url,
                    title: resultado.title,
                    videoId: resultado.videoId,
                    requestedBy: message.author.tag,
                    channel: message.channel,
                    fromCache: downloadResult.fromCache,
                    file: downloadResult.file
                };
            }

            const position = await queueManager.addToQueue(guildId, songInfo, voiceChannel);
            
            // 🆕 SEMPRE USAR EMBED, MESMO QUANDO NÃO É A PRIMEIRA MÚSICA
            const cleanTitle = cleanYouTubeTitle(resultado.title);
            let embedDescription;
            
            if (position === 1) {
                embedDescription = `🎵 **Tocando Agora:** [${cleanTitle}](${resultado.url})`;
            } else {
                embedDescription = `✅ **Adicionado à fila:** [${cleanTitle}](${resultado.url})\n📊 **Posição:** #${position}`;
            }

            const embed = new EmbedBuilder()
                .setColor(position === 1 ? 0x3498db : 0x2ecc71) // Azul para "tocando agora", verde para "adicionado"
                .setDescription(embedDescription)
                .setFooter({ text: `Pedido por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

            const queue = queueManager.getQueue(guildId);
            if (queue?.songs?.length === 1) {
                setTimeout(async () => {
                    const controlManager = require('../index.js').controlManager;
                    if (controlManager) {
                        await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                    }
                }, 2000);
            }

        } catch (err) {
            console.error("❌ Play Error:", err);
            return message.channel.send('❌ | Ocorreu um erro: ' + err.message);
        }
    }
};

