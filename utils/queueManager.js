const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class QueueManager {
    constructor() {
        this.queues = new Map();
        this.connections = new Map();
        this.players = new Map();
        this.currentResources = new Map(); // Para controlar recursos atuais
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                songs: [],
                isPlaying: false,
                currentSong: null,
                voiceChannel: null
            });
        }
        return this.queues.get(guildId);
    }

    async addToQueue(guildId, songInfo, voiceChannel) {
        const queue = this.getQueue(guildId);
        
        // Se não tem canal de voz definido, definir agora
        if (!queue.voiceChannel) {
            queue.voiceChannel = voiceChannel;
        }

        const position = queue.songs.length + 1;
        queue.songs.push(songInfo);

        // Se não está tocando, iniciar reprodução
        if (!queue.isPlaying) {
            await this.playNextSong(guildId);
        } else {
            // Se já está tocando, baixar a próxima música em background
            this.downloadSong(songInfo.url, songInfo.file);
        }

        return position;
    }

    async downloadSong(url, filePath) {
        return new Promise((resolve, reject) => {
            console.log('🔧 Baixando em background:', url);
            const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${filePath}" --no-playlist "${url}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Erro no download:', error);
                    reject(error);
                } else {
                    console.log('✅ Áudio baixado (background):', filePath);
                    resolve(filePath);
                }
            });
        });
    }

    async playNextSong(guildId) {
        const queue = this.getQueue(guildId);
        const nextSong = queue.songs.shift();
        
        if (!nextSong) {
            queue.isPlaying = false;
            queue.currentSong = null;
            return;
        }

        try {
            queue.isPlaying = true;
            queue.currentSong = nextSong;

            // CONECTAR AO CANAL PRIMEIRO
            let connection = this.connections.get(guildId);
            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: queue.voiceChannel.id,
                    guildId: queue.voiceChannel.guild.id,
                    adapterCreator: queue.voiceChannel.guild.voiceAdapterCreator,
                });
                this.connections.set(guildId, connection);
            }

            await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

            // AGORA BAIXAR A MÚSICA (se ainda não foi baixada)
            if (!fs.existsSync(nextSong.file)) {
                console.log('🔧 Baixando música atual:', nextSong.url);
                await this.downloadSong(nextSong.url, nextSong.file);
            }

            // CRIAR RECURSO E PLAYER
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

            // CONFIGURAR EVENTOS
            player.removeAllListeners();

            player.on(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Tocando música da fila!');
                nextSong.channel.send(`🎶 | **Tocando agora:** Música #${nextSong.position} da fila`);
            });

            player.on('error', error => {
                console.error('❌ Player Error:', error);
                nextSong.channel.send('❌ Erro ao tocar música!');
                this.safeCleanup(nextSong.file);
                this.playNextSong(guildId);
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('✅ Música terminou, próxima...');
                // Aguardar um pouco antes de limpar o arquivo
                setTimeout(() => {
                    this.safeCleanup(nextSong.file);
                }, 1000);
                this.playNextSong(guildId);
            });

            // TOCAR
            this.currentResources.set(guildId, resource);
            player.play(resource);

        } catch (error) {
            console.error('❌ Erro ao tocar próxima música:', error);
            this.safeCleanup(nextSong.file);
            this.playNextSong(guildId);
        }
    }

    safeCleanup(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                // Tentar deletar, mas se falhar (arquivo em uso), ignorar
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.log('⚠️ Arquivo ainda em uso, será deletado depois:', filePath);
                    } else {
                        console.log('✅ Arquivo deletado:', filePath);
                    }
                });
            }
        } catch (error) {
            console.log('⚠️ Erro ao deletar arquivo (ignorado):', error.message);
        }
    }

    skipSong(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
        }
    }

    getQueueInfo(guildId) {
        const queue = this.getQueue(guildId);
        return {
            current: queue.currentSong,
            queue: queue.songs,
            isPlaying: queue.isPlaying
        };
    }
}

module.exports = new QueueManager();