const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

class Dibuiador {
    constructor() {
        this.cache = new Map();
        this.cacheDir = './music_cache';
    }

    // 🔍 BUSCA NO CACHE PRIMEIRO, DEPOIS NO YOUTUBE
    async buscarMusica(query) {
        const cacheKey = query.toLowerCase().trim();
        
        // ✅ PRIMEIRO: Verificar no cache em memória
        if (this.cache.has(cacheKey)) {
            console.log('🔍 Retornando do cache em memória:', cacheKey);
            return this.cache.get(cacheKey);
        }

        // ✅ SEGUNDO: Verificar no cache de arquivos
        const cachedResult = await this.buscarNoCacheArquivos(query);
        if (cachedResult) {
            console.log('💾 Retornando do cache de arquivos:', cachedResult.title);
            this.cache.set(cacheKey, cachedResult);
            return cachedResult;
        }

        // ✅ TERCEIRO: Buscar no YouTube (fallback)
        console.log('🌐 Buscando no YouTube:', query);
        return await this.buscarNoYouTube(query);
    }

    // 🔎 BUSCA INTELIGENTE NO CACHE DE ARQUIVOS
    async buscarNoCacheArquivos(query) {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                return null;
            }

            const files = fs.readdirSync(this.cacheDir);
            const queryLower = query.toLowerCase();
            
            // Procurar por correspondência no nome do arquivo
            for (const file of files) {
                if (file.endsWith('.mp3')) {
                    const fileName = path.basename(file, '.mp3');
                    const [title, videoId] = this.decodeFileName(fileName);
                    
                    // Verificar se o título corresponde à busca
                    if (title && title.toLowerCase().includes(queryLower)) {
                        console.log('🎯 Cache hit no arquivo:', title);
                        return {
                            title: title,
                            url: `https://www.youtube.com/watch?v=${videoId}`,
                            videoId: videoId,
                            duration: 'N/A',
                            query: query,
                            fromCache: true
                        };
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.log('⚠️ Erro ao buscar no cache de arquivos:', error.message);
            return null;
        }
    }

    // 🌐 BUSCA NO YOUTUBE (FALLBACK)
    async buscarNoYouTube(query) {
        try {
            const command = `yt-dlp "ytsearch1:${query}" --get-title --get-id --get-duration --skip-download --no-warnings --no-playlist`;
            
            const { stdout } = await execPromise(command);
            const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
            
            console.log('📄 Resultado bruto:', lines);

            let videoId = null;
            let title = null;
            let duration = 'N/A';

            for (const line of lines) {
                if (line.match(/^[a-zA-Z0-9_-]{11}$/)) {
                    videoId = line;
                } else if (line.match(/^\d+:\d+$/)) {
                    duration = line;
                } else if (line && !title) {
                    title = line;
                }
            }

            if (!videoId) {
                console.log('⚠️ Nenhum videoId encontrado, gerando fallback...');
                videoId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }

            if (!title) {
                title = query;
            }

            const resultado = {
                title: title,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                videoId: videoId,
                duration: duration,
                query: query,
                fromCache: false
            };

            console.log('✅ Música encontrada no YouTube:', title);
            this.cache.set(query.toLowerCase().trim(), resultado);
            return resultado;

        } catch (error) {
            console.error('❌ Erro na busca no YouTube:', error);
            return null;
        }
    }

    // 🏷️ CODIFICAR NOME DO ARQUIVO (título + videoId)
    encodeFileName(title, videoId) {
        // Remover caracteres inválidos para arquivos
        const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
        return `${safeTitle}_${videoId}`;
    }

    // 🏷️ DECODIFICAR NOME DO ARQUIVO
    decodeFileName(fileName) {
        const lastUnderscore = fileName.lastIndexOf('_');
        if (lastUnderscore === -1) return [fileName, fileName];
        
        const title = fileName.substring(0, lastUnderscore);
        const videoId = fileName.substring(lastUnderscore + 1);
        
        return [title, videoId];
    }

    limparCache() {
        this.cache.clear();
        console.log('🧹 Cache limpo');
    }
}

module.exports = new Dibuiador();