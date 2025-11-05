const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class QueueManager {
    constructor() {
        this.queues = new Map();
        this.connections = new Map();
        this.players = new Map();
        this.downloadQueue = new Map();
        
        // 🔧 CACHE LIMIT CONFIGURÁVEL
        this.cacheLimit = 30;
        
        this.cacheIndex = new Map();
        this.cacheCounter = 0;
        this.stats = {
            totalDownloads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };
        
        console.log(`🎯 Cache limit configurado para: ${this.cacheLimit} músicas`);
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                songs: [],
                isPlaying: false,
                currentSong: null,
                voiceChannel: null,
                lastActivity: Date.now()
            });
        }
        return this.queues.get(guildId);
    }

    getCacheFilePath(songInfo) {
        const tempDir = './music_cache';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // 🏷️ USAR TÍTULO + VIDEO_ID COMO NOME DO ARQUIVO
        const dibuiador = require('./dibuiador');
        const fileName = dibuiador.encodeFileName(songInfo.title, songInfo.videoId);
        return path.join(tempDir, `${fileName}.mp3`);
    }

    // 🔥 RESET COMPLETO DO SERVIDOR
    resetGuild(guildId) {
        console.log('🔄 Resetando estado do servidor:', guildId);
        
        // Parar player
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
        }
        
        // Desconectar
        const connection = this.connections.get(guildId);
        if (connection) {
            try {
                connection.destroy();
                console.log('🔌 Conexão destruída no reset');
            } catch (error) {
                console.log('⚠️ Erro ao destruir conexão:', error.message);
            }
        }
        
        // Limpar tudo
        this.connections.delete(guildId);
        this.players.delete(guildId);
        this.queues.delete(guildId);
        
        console.log('✅ Reset completo do servidor');
    }

    // 🧹 LIMPEZA AUTOMÁTICA DE SERVIDORES INATIVOS
    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            const inactiveTime = 30 * 60 * 1000; // 30 minutos
            
            for (const [guildId, connection] of this.connections) {
                const queue = this.getQueue(guildId);
                
                // Se não está tocando e não tem música na fila há mais de 30min
                if (!queue.isPlaying && queue.songs.length === 0) {
                    const lastActivity = queue.lastActivity || now;
                    if (now - lastActivity > inactiveTime) {
                        console.log(`🧹 Limpando servidor inativo: ${guildId}`);
                        this.resetGuild(guildId);
                    }
                } else {
                    // Atualizar timestamp de atividade
                    queue.lastActivity = now;
                }
            }
        }, 10 * 60 * 1000); // Verificar a cada 10 minutos
    }

    // ✅ VALIDAÇÃO DE ARQUIVO DE CACHE
    async validateCacheFile(filePath) {
        try {
            const stats = fs.statSync(filePath);
            
            // Verificar se o arquivo tem tamanho razoável (> 100KB)
            if (stats.size < 100 * 1024) {
                console.log('🗑️ Arquivo de cache muito pequeno, removendo...');
                fs.unlinkSync(filePath);
                return false;
            }
            
            return true;
        } catch (error) {
            console.log('⚠️ Erro ao validar cache:', error.message);
            return false;
        }
    }

    // 🔄 SISTEMA DE RETRY PARA DOWNLOADS
    async downloadToCacheWithRetry(url, videoId, title = '', maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.downloadToCache(url, videoId, title);
                return true;
            } catch (error) {
                console.log(`❌ Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
                
                if (attempt === maxRetries) {
                    this.stats.errors++;
                    throw error;
                }
                
                // Esperar progressivamente mais entre tentativas
                await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            }
        }
    }

    async addToQueue(guildId, songInfo, voiceChannel) {
        const queue = this.getQueue(guildId);
        
        // 🔥 SEMPRE ATUALIZAR O CANAL DE VOZ
        queue.voiceChannel = voiceChannel;
        queue.lastActivity = Date.now();

        // 🏷️ AGORA O NOME DO ARQUIVO INCLUI O TÍTULO
        const cacheFile = this.getCacheFilePath(songInfo);
        songInfo.file = cacheFile;
        
        const position = queue.songs.length + 1;
        queue.songs.push(songInfo);

        console.log('🎯 Música adicionada à fila:', {
            title: songInfo.title,
            position: position,
            videoId: songInfo.videoId,
            cacheFile: path.basename(cacheFile),
            fromCache: songInfo.fromCache || false
        });

        // ✅ SE VEIO DO CACHE, JÁ PODE TOCAR IMEDIATAMENTE
        if (songInfo.fromCache) {
            console.log('⚡ Música já está em cache, pronta para tocar!');
            this.stats.cacheHits++;
            this.cacheIndex.set(songInfo.videoId, this.cacheCounter++);
        } else if (!fs.existsSync(cacheFile)) {
            console.log('📥 Cache não encontrado, baixando ANTES de tocar...');
            this.stats.cacheMisses++;
            await this.downloadToCacheWithRetry(songInfo.url, songInfo.videoId, songInfo.title);
        } else {
            // Validar arquivo de cache existente
            const isValid = await this.validateCacheFile(cacheFile);
            if (!isValid) {
                console.log('🔄 Cache inválido, baixando novamente...');
                this.stats.cacheMisses++;
                await this.downloadToCacheWithRetry(songInfo.url, songInfo.videoId, songInfo.title);
            } else {
                console.log('✅ MP3 já está em cache:', songInfo.title);
                this.stats.cacheHits++;
                this.cacheIndex.set(songInfo.videoId, this.cacheCounter++);
            }
        }

        if (!queue.isPlaying) {
            await this.playNextSong(guildId);
        }

        return position;
    }

    async downloadToCache(url, videoId, title = '') {
        if (this.downloadQueue.has(videoId)) {
            console.log('⏳ Download já em andamento para:', videoId);
            while (this.downloadQueue.has(videoId)) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }
        
        this.downloadQueue.set(videoId, true);

        try {
            // 🏷️ CRIAR songInfo TEMPORÁRIO PARA GERAR NOME DO ARQUIVO
            const tempSongInfo = { title: title || videoId, videoId: videoId };
            const cacheFile = this.getCacheFilePath(tempSongInfo);
            
            console.log('📥 Baixando para cache permanente:', title || videoId);
            
            const command = `yt-dlp -x --audio-format mp3 --audio-quality 5 --extract-audio --no-playlist --no-warnings -o "${cacheFile}" "${url}"`;
            await execPromise(command);
            
            this.manageCacheLimit(videoId);
            this.stats.totalDownloads++;
            
            console.log('✅ Download para cache concluído:', title || videoId);
        } catch (error) {
            console.error('❌ Erro no download para cache:', error);
            this.stats.errors++;
            throw error;
        } finally {
            this.downloadQueue.delete(videoId);
        }
    }

    manageCacheLimit(newVideoId) {
        this.cacheIndex.set(newVideoId, this.cacheCounter++);
        
        if (this.cacheIndex.size > this.cacheLimit) {
            let oldestVideoId = null;
            let oldestCounter = Infinity;
            
            for (const [videoId, counter] of this.cacheIndex) {
                if (counter < oldestCounter) {
                    oldestCounter = counter;
                    oldestVideoId = videoId;
                }
            }
            
            if (oldestVideoId) {
                // Encontrar o arquivo correspondente no cache
                const cacheDir = './music_cache';
                if (fs.existsSync(cacheDir)) {
                    const files = fs.readdirSync(cacheDir);
                    for (const file of files) {
                        if (file.includes(oldestVideoId)) {
                            const oldCacheFile = path.join(cacheDir, file);
                            try {
                                if (fs.existsSync(oldCacheFile)) {
                                    fs.unlinkSync(oldCacheFile);
                                    console.log('🗑️ Removido do cache (limite excedido):', file);
                                }
                                this.cacheIndex.delete(oldestVideoId);
                                break;
                            } catch (error) {
                                console.log('⚠️ Erro ao remover do cache:', error.message);
                            }
                        }
                    }
                }
            }
        }
    }

    async playNextSong(guildId) {
        const queue = this.getQueue(guildId);
        const nextSong = queue.songs.shift();
        
        if (!nextSong) {
            console.log('📭 Fila vazia, SAINDO DO CANAL...');
            queue.isPlaying = false;
            queue.currentSong = null;
            
            // 🔥 SAIR DO CANAL QUANDO ACABAR
            this.cleanupConnection(guildId);
            return;
        }

        try {
            queue.isPlaying = true;
            queue.currentSong = nextSong;
            queue.lastActivity = Date.now();

            // 🔥 CONECTAR AO CANAL (sempre criar nova conexão)
            console.log('🔌 Conectando ao canal de voz...');
            const connection = joinVoiceChannel({
                channelId: queue.voiceChannel.id,
                guildId: queue.voiceChannel.guild.id,
                adapterCreator: queue.voiceChannel.guild.voiceAdapterCreator,
            });
            this.connections.set(guildId, connection);

            await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

            if (!fs.existsSync(nextSong.file)) {
                console.log('⚡ Cache não encontrado no playNextSong, baixando...');
                try {
                    await this.downloadToCacheWithRetry(nextSong.url, nextSong.videoId, nextSong.title);
                } catch (downloadError) {
                    console.error('❌ Download falhou:', downloadError);
                    throw new Error('Não foi possível baixar a música');
                }
            } else {
                // Validar cache antes de usar
                const isValid = await this.validateCacheFile(nextSong.file);
                if (!isValid) {
                    console.log('🔄 Cache inválido, baixando novamente...');
                    await this.downloadToCacheWithRetry(nextSong.url, nextSong.videoId, nextSong.title);
                } else {
                    console.log('✅ Usando cache permanente:', nextSong.title);
                    this.cacheIndex.set(nextSong.videoId, this.cacheCounter++);
                }
            }

            if (!fs.existsSync(nextSong.file)) {
                throw new Error('Arquivo de áudio não foi baixado corretamente');
            }

            console.log('🎵 Criando recurso de áudio...');
            const resource = createAudioResource(nextSong.file, {
                inputType: 'mp3',
                inlineVolume: true
            });

            let player = this.players.get(guildId);
            if (!player) {
                player = createAudioPlayer();
                this.players.set(guildId, player);
                connection.subscribe(player);
            }

            player.removeAllListeners();

            player.on(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Tocando música!');
                nextSong.channel.send(`🎶 | **Tocando agora:** ${nextSong.title} (por ${nextSong.requestedBy})`);
            });

            player.on('error', error => {
                console.error('❌ Player Error:', error);
                this.stats.errors++;
                nextSong.channel.send('❌ Erro ao tocar música!');
                this.cleanupConnection(guildId);
                this.playNextSong(guildId);
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('✅ Música terminou, próxima...');
                this.playNextSong(guildId);
            });

            console.log('▶️ Iniciando reprodução...');
            player.play(resource);

        } catch (error) {
            console.error('❌ Erro ao tocar música:', error);
            this.stats.errors++;
            nextSong.channel.send(`❌ Erro: ${error.message}`);
            this.cleanupConnection(guildId);
            this.playNextSong(guildId);
        }
    }

    // 🔥 LIMPAR CONEXÃO
    cleanupConnection(guildId) {
        const connection = this.connections.get(guildId);
        if (connection) {
            try {
                connection.destroy();
                this.connections.delete(guildId);
                this.players.delete(guildId);
                console.log('🔌 Conexão limpa - bot saiu do canal');
            } catch (error) {
                console.log('🔌 Erro ao desconectar:', error.message);
            }
        }
    }

    skipSong(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
            console.log('⏭️ Música pulada');
        }
    }

    getQueueInfo(guildId) {
        const queue = this.getQueue(guildId);
        return {
            current: queue.currentSong,
            queue: queue.songs,
            isPlaying: queue.isPlaying,
            total: queue.songs.length + (queue.currentSong ? 1 : 0)
        };
    }

    // 📊 ESTATÍSTICAS DO SISTEMA
    getStats() {
        return {
            ...this.stats,
            totalServers: this.queues.size,
            totalConnections: this.connections.size,
            totalPlayers: this.players.size,
            cacheSize: this.cacheIndex.size,
            cacheLimit: this.cacheLimit
        };
    }

    // 🎮 MÉTODOS PARA CONTROLE INTERATIVO
    getPlayer(guildId) {
        return this.players.get(guildId);
    }

    getCurrentSong(guildId) {
        const queue = this.getQueue(guildId);
        return queue.currentSong;
    }

    isPaused(guildId) {
        const player = this.players.get(guildId);
        return player && player.state.status === 'paused';
    }

    // 📱 MÉTODO PARA CRIAR MENSAGEM DE CONTROLE
    createControlMessage(guildId) {
        const currentSong = this.getCurrentSong(guildId);
        const isPaused = this.isPaused(guildId);
        
        if (!currentSong) return null;

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        // Embed da música atual
        const embed = new EmbedBuilder()
            .setTitle('🎶 Controles de Música')
            .setDescription(`**Tocando Agora:** ${currentSong.title}`)
            .addFields(
                { name: '👤 Pedido por', value: currentSong.requestedBy, inline: true },
                { name: '🎵 Status', value: isPaused ? '⏸️ Pausada' : '▶️ Tocando', inline: true }
            )
            .setColor(isPaused ? '#FFA500' : '#00FF00')
            .setTimestamp();

        // Botões de controle
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('music_pause')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setLabel(isPaused ? 'Continuar' : 'Pausar')
                .setStyle(ButtonStyle.Primary),
            
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setEmoji('⏭️')
                .setLabel('Pular')
                .setStyle(ButtonStyle.Secondary),
            
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setEmoji('⏹️')
                .setLabel('Parar')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setEmoji('📋')
                .setLabel('Fila')
                .setStyle(ButtonStyle.Success),
            
            new ButtonBuilder()
                .setCustomId('music_refresh')
                .setEmoji('🔄')
                .setLabel('Atualizar')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row] };
    }
}

module.exports = new QueueManager();