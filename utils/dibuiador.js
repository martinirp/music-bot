const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class Dibuiador {
    constructor() {
        this.cache = new Map();
    }

    async buscarMusica(query) {
        try {
            // Verificar cache
            const cacheKey = query.toLowerCase().trim();
            if (this.cache.has(cacheKey)) {
                console.log('🔍 Retornando do cache:', cacheKey);
                return this.cache.get(cacheKey);
            }

            console.log('🔍 Buscando no YouTube:', query);
            
            // Comando mais robusto para buscar
            const command = `yt-dlp "ytsearch1:${query}" --get-id --get-title --get-duration --skip-download --no-warnings`;
            
            const { stdout, stderr } = await execPromise(command);
            
            // Ignorar warnings (só mostrar se for erro crítico)
            if (stderr && !stderr.includes('WARNING:')) {
                console.error('❌ Erro crítico na busca:', stderr);
            }

            const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
            
            console.log('📄 Resultado bruto:', lines);

            // Procurar o ID do vídeo (geralmente a primeira linha que parece um ID)
            let videoId = null;
            let title = null;
            let duration = 'Desconhecida';

            for (const line of lines) {
                // Verificar se é um ID do YouTube (11 caracteres)
                if (line.match(/^[a-zA-Z0-9_-]{11}$/)) {
                    videoId = line;
                    continue;
                }
                
                // Verificar se é título (não vazio e não parece ID)
                if (line && !line.match(/^[a-zA-Z0-9_-]{11}$/) && !title) {
                    title = line;
                    continue;
                }
                
                // Verificar se é duração (formato 00:00 ou 0:00)
                if (line.match(/^\d+:\d+$/)) {
                    duration = line;
                }
            }

            if (!videoId) {
                console.log('❌ Nenhum ID de vídeo encontrado');
                return null;
            }

            const url = `https://www.youtube.com/watch?v=${videoId}`;

            // Se não encontrou título, usar a query
            if (!title) {
                title = query;
            }

            const resultado = {
                title: title,
                url: url,
                videoId: videoId,
                duration: duration,
                query: query
            };

            // Salvar no cache
            this.cache.set(cacheKey, resultado);
            console.log('✅ Resultado encontrado:', title, '- URL:', url);

            return resultado;

        } catch (error) {
            console.error('❌ Erro no dibuiador:', error);
            
            // Tentar método alternativo se o primeiro falhar
            return await this.buscarAlternativo(query);
        }
    }

    async buscarAlternativo(query) {
        try {
            console.log('🔄 Tentando método alternativo para:', query);
            
            // Método alternativo: buscar e pegar primeiro resultado
            const command = `yt-dlp "ytsearch1:${query}" --print "%(title)s" --print "%(id)s" --print "%(duration)s" --skip-download --no-warnings`;
            
            const { stdout } = await execPromise(command);
            const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
            
            console.log('📄 Resultado alternativo:', lines);

            if (lines.length >= 1) {
                const title = lines[0];
                const videoId = lines[1] || 'dQw4w9WgXcQ'; // Fallback se não achar ID
                const duration = lines[2] || 'Desconhecida';

                const resultado = {
                    title: title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId: videoId,
                    duration: duration,
                    query: query
                };

                console.log('✅ Resultado alternativo encontrado:', title);
                return resultado;
            }

            return null;

        } catch (error) {
            console.error('❌ Erro no método alternativo:', error);
            return null;
        }
    }

    limparCache() {
        this.cache.clear();
        console.log('🧹 Cache limpo');
    }
}

module.exports = new Dibuiador();