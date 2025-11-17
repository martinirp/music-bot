// utils/dibuiador.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

class Dibuiador {
    constructor() {
        this.cache = new Map();
    }

    async buscarMusica(query) {
        console.log('🔍 Buscando música:', query);

        const camadas = this.gerarCamadasBusca(query);
        
        for (let i = 0; i < camadas.length; i++) {
            const camada = camadas[i];
            console.log(`🎯 Camada ${i + 1}: "${camada}"`);
            
            const cacheResult = await this.buscarNoCache(camada);
            if (cacheResult) {
                console.log(`⚡ CACHE HIT na camada ${i + 1}: ${cacheResult.title}`);
                return cacheResult;
            }
        }

        console.log('❌ CACHE MISS em todas camadas, buscando no YouTube...');

        try {
            if (this.isYouTubeUrl(query)) {
                return await this.buscarInfoYouTube(query);
            } else {
                return await this.buscarPorTexto(query);
            }
        } catch (error) {
            console.error('❌ Erro ao buscar música:', error);
            return null;
        }
    }

    gerarCamadasBusca(query) {
        const camadas = [];
        
        // Camada 1: Query original
        camadas.push(query);
        
        // Camada 2: Remove comandos
        const semComando = this.removerComandos(query);
        if (semComando !== query) camadas.push(semComando);
        
        // Camada 3: Reordenada (música primeiro)
        const reordenada = this.reordenarQuery(semComando);
        if (reordenada !== semComando) camadas.push(reordenada);
        
        // 🆕 REMOVER CAMADAS 4, 5, 6 - SÓ ATÉ CAMADA 3
        
        // Remove duplicatas
        return [...new Set(camadas.filter(c => c && c.length > 0))];
    }

    removerComandos(query) {
        return query.replace(/^(#p|#play|!p|!play|p|play)\s+/i, '').trim();
    }

    reordenarQuery(query) {
        const palavras = query.split(' ');
        if (palavras.length <= 2) return query;
        
        // Tenta colocar a música primeiro
        const ultimasPalavras = palavras.slice(-3).join(' ');
        const primeirasPalavras = palavras.slice(0, -3).join(' ');
        
        if (primeirasPalavras && ultimasPalavras) {
            return `${ultimasPalavras} ${primeirasPalavras}`.trim();
        }
        
        return query;
    }

    async buscarNoCache(query) {
        try {
            const cacheDir = './music_cache';
            if (!fs.existsSync(cacheDir)) return null;

            const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.mp3'));
            if (files.length === 0) return null;

            const fuse = new Fuse(files, {
                includeScore: true,
                threshold: 0.2, // 90% de similaridade
                ignoreLocation: true,
                minMatchCharLength: 2
            });

            const result = fuse.search(query);
            if (result.length > 0) {
                const bestMatch = result[0].item;
                const fileName = path.basename(bestMatch, '.mp3');
                const filePath = path.join(cacheDir, bestMatch);
                
                const videoIdMatch = fileName.match(/\[([^\]]+)\]/);
                const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';
                
                const titleParts = fileName.split(' • ');
                let title = titleParts[0] || 'Unknown Title';

                console.log(`✅ Cache encontrado: ${title} (${videoId})`);

                return {
                    title: title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId: videoId,
                    duration: null,
                    fromCache: true,
                    file: filePath
                };
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao buscar no cache:', error);
            return null;
        }
    }

    async buscarPlaylist(url) {
        console.log('🔍 Buscando playlist:', url);
        
        try {
            const command = `yt-dlp --flat-playlist --print "%(title)s|||%(id)s|||%(duration)s" "${url}" --no-warnings`;
            
            const { stdout, stderr } = await execPromise(command);
            
            if (stderr) {
                console.error('❌ Erro na playlist:', stderr);
            }

            const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
            const videos = [];

            console.log('📄 Playlist resultado:', lines.length, 'vídeos');

            for (const line of lines) {
                const parts = line.split('|||');
                if (parts.length >= 2) {
                    const video = {
                        title: parts[0] || 'Título desconhecido',
                        videoId: parts[1] || 'unknown',
                        duration: parts[2] || '0',
                        url: `https://www.youtube.com/watch?v=${parts[1]}`
                    };
                    videos.push(video);
                    console.log('🎵 Vídeo da playlist:', video.title);
                }
            }

            if (videos.length === 0) {
                throw new Error('Playlist vazia ou não encontrada');
            }

            return {
                title: `Playlist com ${videos.length} músicas`,
                videoCount: videos.length,
                videos: videos
            };

        } catch (error) {
            console.error('❌ Erro ao buscar playlist:', error);
            
            if (url.includes('watch?v=')) {
                console.log('🔄 Tentando buscar como vídeo único...');
                const videoResult = await this.buscarMusica(url);
                if (videoResult) {
                    return {
                        title: `Vídeo: ${videoResult.title}`,
                        videoCount: 1,
                        videos: [videoResult]
                    };
                }
            }
            
            throw new Error('Não foi possível carregar a playlist: ' + error.message);
        }
    }

    async buscarInfoYouTube(url) {
        try {
            const command = `yt-dlp --print "%(title)s|||%(id)s|||%(duration)s" --no-playlist "${url}"`;
            const { stdout, stderr } = await execPromise(command);
            
            if (stderr && !stdout) {
                throw new Error(stderr);
            }

            const parts = stdout.trim().split('|||');
            if (parts.length >= 3) {
                const duration = parts[2] ? parseInt(parts[2]) : null;
                return {
                    title: parts[0],
                    videoId: parts[1],
                    duration: duration,
                    url: url,
                    fromCache: false
                };
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao buscar info YouTube:', error);
            return null;
        }
    }

    async buscarPorTexto(query) {
        try {
            console.log(`🎯 Buscando: "${query}"`);
            
            // 🆕 BUSCA DIRETA - SEM MODIFICAÇÕES
            const command = `yt-dlp "ytsearch1:${query}" --print "%(title)s|||%(id)s|||%(duration)s" --no-playlist`;
            const { stdout, stderr } = await execPromise(command);
            
            if (stderr) {
                console.error('❌ Erro na busca:', stderr);
            }

            if (!stdout || stdout.trim() === '') {
                console.log('❌ Nenhum resultado encontrado');
                return null;
            }

            const parts = stdout.trim().split('|||');
            if (parts.length >= 3) {
                const duration = parts[2] ? parseInt(parts[2]) : null;
                const result = {
                    title: parts[0],
                    videoId: parts[1],
                    duration: duration,
                    url: `https://www.youtube.com/watch?v=${parts[1]}`,
                    fromCache: false
                };
                console.log(`✅ Resultado: ${result.title}`);
                return result;
            }
            
            console.log('❌ Resultado incompleto');
            return null;
            
        } catch (error) {
            console.error('❌ Erro ao buscar por texto:', error);
            return null;
        }
    }

    isYouTubeUrl(url) {
        return url.includes('youtube.com') || url.includes('youtu.be');
    }

    limparCache() {
        this.cache.clear();
        console.log('🧹 Cache limpo');
    }
}

module.exports = new Dibuiador();
