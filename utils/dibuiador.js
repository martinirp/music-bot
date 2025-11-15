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
        
        // Camada 4: Ordenada alfabeticamente
        const alfabetica = this.ordenarAlfabetica(semComando);
        if (alfabetica !== semComando) camadas.push(alfabetica);
        
        // Camada 5: Componentes (artista + música)
        const componentes = this.extrairComponentes(semComando);
        camadas.push(...componentes);
        
        // Camada 6: Termos chave
        const termos = this.extrairTermosChave(semComando);
        camadas.push(...termos);
        
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

    ordenarAlfabetica(query) {
        return query.split(' ')
            .filter(palavra => palavra.length > 2)
            .sort()
            .join(' ')
            .trim();
    }

    extrairComponentes(query) {
        const componentes = [];
        const palavras = query.split(' ');
        
        if (palavras.length >= 4) {
            // Primeiras 2 palavras (possível artista)
            componentes.push(palavras.slice(0, 2).join(' '));
            // Últimas 2-3 palavras (possível música)
            componentes.push(palavras.slice(-2).join(' '));
            componentes.push(palavras.slice(-3).join(' '));
        }
        
        return componentes.filter(c => c.length > 0);
    }

    extrairTermosChave(query) {
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'de', 'da', 'do'];
        return query.split(' ')
            .filter(palavra => 
                palavra.length > 2 && 
                !stopWords.includes(palavra.toLowerCase())
            )
            .slice(0, 4); // Limita a 4 termos principais
    }

    async buscarNoCache(query) {
        try {
            const cacheDir = './music_cache';
            if (!fs.existsSync(cacheDir)) return null;

            const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.mp3'));
            if (files.length === 0) return null;

            const fuse = new Fuse(files, {
                includeScore: true,
                threshold: 0.2, // 80% de similaridade
            });

            const result = fuse.search(query);
            if (result.length > 0) {
                const bestMatch = result[0].item;
                const fileName = path.basename(bestMatch, '.mp3');
                
                const title = fileName.split(' || ')[0]; // Pega apenas o primeiro nome
                const videoIdMatch = fileName.match(/\[([^\]]+)\]$/);
                const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

                return {
                    title: title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId: videoId,
                    fromCache: true,
                    file: path.join(cacheDir, bestMatch)
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

    async buscarMusicaSimilar(query, excludeVideoId = null) {
        try {
            console.log(`🔍 Buscando música similar: ${query}`);
            
            const searchQueries = [
                `similar to ${query}`,
                `music like ${query}`,
                `${query} genre`,
                `related to ${query}`
            ];
            
            for (const searchQuery of searchQueries) {
                try {
                    const result = await this.buscarMusica(searchQuery);
                    if (result && result.videoId !== excludeVideoId) {
                        console.log(`✅ Encontrada similar: ${result.title}`);
                        return result;
                    }
                } catch (error) {
                    // Continua para a próxima estratégia
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ Erro ao buscar música similar:', error);
            return null;
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
            if (parts.length >= 2) {
                return {
                    title: parts[0],
                    videoId: parts[1],
                    duration: parts[2] || '0',
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
            const command = `yt-dlp "ytsearch1:${query}" --print "%(title)s|||%(id)s|||%(duration)s" --no-playlist`;
            const { stdout, stderr } = await execPromise(command);
            
            if (stderr && !stdout) {
                throw new Error(stderr);
            }

            const parts = stdout.trim().split('|||');
            if (parts.length >= 2) {
                return {
                    title: parts[0],
                    videoId: parts[1],
                    duration: parts[2] || '0',
                    url: `https://www.youtube.com/watch?v=${parts[1]}`,
                    fromCache: false
                };
            }
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
