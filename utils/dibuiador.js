const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class Dibuiador {
    constructor() {
        this.cache = new Map();
    }

    async buscarMusica(query) {
        const cacheKey = query.toLowerCase().trim();
        if (this.cache.has(cacheKey)) {
            console.log('🔍 Retornando do cache:', cacheKey);
            return this.cache.get(cacheKey);
        }

        console.log('🔍 Buscando via yt-dlp:', query);
        
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
                query: query
            };

            console.log('✅ Música encontrada:', title, 'VideoID:', videoId);
            this.cache.set(cacheKey, resultado);
            return resultado;

        } catch (error) {
            console.error('❌ Erro na busca:', error);
            return null;
        }
    }

    limparCache() {
        this.cache.clear();
        console.log('🧹 Cache limpo');
    }
}

module.exports = new Dibuiador();