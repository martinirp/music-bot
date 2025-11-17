// utils/download.js
const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);

class DownloadManager {
    constructor() {
        this.downloadQueue = new Map();
        this.cacheIndex = new Map();
        this.stats = {
            totalDownloads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };
    }

    // 🆕 BUSCAR METADADOS COMPLETOS DO YOUTUBE COM FALLBACK MELHORADO
    async getYouTubeMetadata(url) {
        try {
            const command = `yt-dlp "${url}" --print "%(title)s ||| %(id)s ||| %(artist)s ||| %(track)s" --no-download`;
            const { stdout } = await execPromise(command);
            
            const parts = stdout.trim().split(' ||| ');
            
            let title = parts[0] || 'Unknown Title';
            const videoId = parts[1] || 'unknown';
            let artist = parts[2];
            let track = parts[3];
            
            // 🆕 CORRIGIR VALORES "NA" E FALLBACK INTELIGENTE
            if (artist === 'NA' || !artist || artist === 'Unknown Artist') {
                artist = this.extractArtistFromTitle(title);
                console.log(`🎤 Artista extraído do título: ${artist}`);
            }
            
            if (track === 'NA' || !track || track === 'Unknown Track') {
                track = this.extractTrackFromTitle(title);
                console.log(`🎵 Track extraída do título: ${track}`);
            }
            
            console.log('📋 Metadados processados:');
            console.log('   Título:', title);
            console.log('   Artista:', artist);
            console.log('   Track:', track);
            console.log('   Video ID:', videoId);
            
            return { title, videoId, artist, track };
            
        } catch (error) {
            console.log('❌ Erro ao buscar metadados:', error.message);
            // Fallback: extrair do URL
            const videoId = url.match(/[?&]v=([^&]+)/)?.[1] || 'unknown';
            const title = 'Unknown Title';
            return {
                title: title,
                videoId: videoId,
                artist: this.extractArtistFromTitle(title),
                track: this.extractTrackFromTitle(title)
            };
        }
    }

    // 🆕 EXTRAIR ARTISTA DO TÍTULO - MELHORADO
    extractArtistFromTitle(title) {
        if (!title) return 'Unknown Artist';
        
        // Remover informações entre parênteses e colchetes primeiro
        const cleanTitle = title
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*\[[^\]]*\]/g, '')
            .replace(/\s*[-–—].*$/, '')
            .trim();
        
        // Padrões comuns em títulos do YouTube
        const patterns = [
            /^([^-—–]+?)\s*[-—–]\s*(.+)/i, // "ARTIST - MÚSICA"
            /^([^:]+?)\s*:\s*(.+)/i,        // "ARTIST: MÚSICA"
            /^(.+?)\s+by\s+(.+)/i,          // "MÚSICA by ARTIST"
            /^(.+?)\s+-\s+(.+)/i,           // "ARTIST - MÚSICA" (outro formato)
        ];
        
        for (const pattern of patterns) {
            const match = cleanTitle.match(pattern);
            if (match) {
                let artist = match[1].trim();
                // Remover palavras comuns que não são parte do artista
                artist = artist.replace(/\s*(Official|Music|Video|Lyrics|Audio|VEVO)\s*$/gi, '').trim();
                if (artist && artist.length > 1 && artist !== 'NA') {
                    return artist;
                }
            }
        }
        
        // Se for um título muito específico como "BAD OMENS - Impose (Official Music Video)"
        const specificMatch = title.match(/^([A-Z][A-Z\s]+)\s*[-—–]\s*(.+?)(?:\s*\(|$)/);
        if (specificMatch) {
            const artist = specificMatch[1].trim();
            if (artist && artist !== 'NA') {
                return artist;
            }
        }
        
        return 'Various Artists';
    }

    // 🆕 EXTRAIR MÚSICA DO TÍTULO - MELHORADO
    extractTrackFromTitle(title) {
        if (!title) return 'Unknown Track';
        
        // Remover informações entre parênteses e colchetes primeiro
        const cleanTitle = title
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*\[[^\]]*\]/g, '')
            .trim();
        
        // Padrões comuns em títulos do YouTube
        const patterns = [
            /^([^-—–]+?)\s*[-—–]\s*(.+?)(?:\s*\(|$)/i, // "ARTIST - MÚSICA"
            /^([^:]+?)\s*:\s*(.+?)(?:\s*\(|$)/i,        // "ARTIST: MÚSICA"
            /^(.+?)\s+by\s+(.+?)(?:\s*\(|$)/i,          // "MÚSICA by ARTIST"
            /^(.+?)\s+-\s+(.+?)(?:\s*\(|$)/i,           // "ARTIST - MÚSICA"
        ];
        
        for (const pattern of patterns) {
            const match = cleanTitle.match(pattern);
            if (match) {
                let track = match[2] ? match[2].trim() : match[1].trim();
                // Limpar informações extras
                track = track
                    .replace(/\s*\([^)]*\)\s*$/, '')
                    .replace(/\s*\[[^\]]*\]\s*$/, '')
                    .replace(/\s*(Official|Music|Video|Lyrics|Audio|VEVO|HD)\s*$/gi, '')
                    .trim();
                
                if (track && track.length > 1 && track !== 'NA') {
                    return track;
                }
            }
        }
        
        // Se não encontrou padrão, usa o título limpo
        const finalTrack = cleanTitle
            .replace(/\s*[-—–].*$/, '') // Remove tudo depois do separador
            .trim();
            
        return finalTrack || 'Unknown Track';
    }

    // 🆕 GERAR NOME COM METADADOS REAIS E VALIDAÇÃO
    generateOrganizedFilename(videoId, title, artist, track) {
        // 🆕 VALIDAÇÃO ROBUSTA CONTRA "NA"
        const safeArtist = (artist && artist !== 'NA' && artist !== 'Unknown Artist') 
            ? artist 
            : this.extractArtistFromTitle(title) || 'Various Artists';
            
        const safeTrack = (track && track !== 'NA' && track !== 'Unknown Track') 
            ? track 
            : this.extractTrackFromTitle(title) || title || 'Unknown Track';
            
        const safeVideoId = videoId && videoId !== 'unknown' ? videoId : 'unknown';
        
        const cleanArtist = this.sanitizeFilename(safeArtist);
        const cleanTrack = this.sanitizeFilename(safeTrack);
        
        console.log(`💾 Gerando nome: ${cleanArtist} - ${cleanTrack}`);
        
        // 🆕 USAR SEPARADOR • QUE NÃO SEJA RESTRITO
        return `${cleanArtist} - ${cleanTrack} • [${safeVideoId}] • ${cleanTrack} - ${cleanArtist}.mp3`;
    }

    sanitizeFilename(name) {
        // 🆕 GARANTIR QUE NAME NÃO SEJA UNDEFINED OU "NA"
        if (!name || name === 'NA') return 'Unknown';
        
        return name
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 50);
    }

    getCacheFilePath(videoId, title, artist, track) {
        const tempDir = './music_cache';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filename = this.generateOrganizedFilename(videoId, title, artist, track);
        let finalPath = path.join(tempDir, filename);
        
        finalPath = finalPath.replace('.mp3.mp3', '.mp3');
        return finalPath;
    }

    checkFileExists(filePath) {
        const dir = path.dirname(filePath);
        const expectedName = path.basename(filePath);
        
        if (fs.existsSync(filePath)) {
            return true;
        }
        
        // Busca por videoId
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const videoId = this.extractVideoId(expectedName);
            
            if (videoId) {
                const matchingFiles = files.filter(f => 
                    f.includes(videoId) && f.endsWith('.mp3')
                );
                
                if (matchingFiles.length > 0) {
                    const foundFile = matchingFiles[0];
                    console.log(`🔄 Arquivo encontrado com nome diferente: ${foundFile}`);
                    console.log(`📁 Procurando por: ${expectedName}`);
                    return true;
                }
            }
        }
        
        return false;
    }

    extractVideoId(filename) {
        const match = filename.match(/\[([^\]]+)\]/);
        return match ? match[1] : null;
    }

    async downloadSong(url, videoId, title, maxRetries = 3) {
        // 🆕 PRIMEIRO BUSCAR METADADOS COMPLETOS
        console.log('🔍 Buscando metadados do YouTube...');
        const metadata = await this.getYouTubeMetadata(url);
        
        // 🆕 USAR METADADOS REAIS PARA O NOME DO ARQUIVO
        let cacheFile = this.getCacheFilePath(
            metadata.videoId, 
            metadata.title, 
            metadata.artist, 
            metadata.track
        );
        
        console.log(`🔍 Verificando cache para: ${metadata.artist} - ${metadata.track}`);
        
        if (this.checkFileExists(cacheFile)) {
            this.stats.cacheHits++;
            console.log(`✅ Cache hit: ${metadata.artist} - ${metadata.track}`);
            return { 
                success: true, 
                file: cacheFile, 
                fromCache: true,
                metadata: metadata
            };
        }

        this.stats.cacheMisses++;
        console.log(`❌ Cache miss, baixando: ${metadata.artist} - ${metadata.track}`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const downloadedFile = await this.downloadToCache(url, metadata);
                
                return { 
                    success: true, 
                    file: downloadedFile, 
                    fromCache: false,
                    metadata: metadata
                };
                
            } catch (e) {
                console.log(`❌ Download tentativa ${attempt} falhou:`, e.message);
                if (attempt === maxRetries) {
                    this.stats.errors++;
                    return { success: false, error: e.message };
                }
                await new Promise(r => setTimeout(r, attempt * 1500));
            }
        }
    }

    async downloadToCache(url, metadata) {
        const videoId = metadata.videoId;
        
        if (this.downloadQueue.has(videoId)) {
            console.log('⏳ Download já em andamento:', videoId);
            while (this.downloadQueue.has(videoId)) {
                await new Promise(r => setTimeout(r, 100));
            }
            return;
        }

        this.downloadQueue.set(videoId, true);

        try {
            // 🆕 USAR METADADOS PARA GERAR NOME DO ARQUIVO
            let cacheFile = this.getCacheFilePath(
                metadata.videoId, 
                metadata.title, 
                metadata.artist, 
                metadata.track
            );

            if (this.checkFileExists(cacheFile)) {
                console.log('✅ Arquivo já existe no cache, pulando download:', `${metadata.artist} - ${metadata.track}`);
                this.downloadQueue.delete(videoId);
                return cacheFile;
            }

            const dir = path.dirname(cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            console.log('📥 Baixando:', `${metadata.artist} - ${metadata.track}`);
            console.log('💾 Salvar como:', path.basename(cacheFile));

            const args = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--no-playlist',
                '--embed-metadata',
                '--embed-thumbnail',
                '--no-overwrites',
                '--continue',
                '--output', `"${cacheFile}"`,
                `"${url}"`
            ];

            console.log('🔧 Executando: yt-dlp', args.join(' '));
            await execPromise(`yt-dlp ${args.join(' ')}`, { shell: true });

            // Verificar se arquivo foi criado
            if (!fs.existsSync(cacheFile)) {
                const files = fs.readdirSync(dir);
                const foundFile = files.find(f => 
                    f.endsWith('.mp3') && f.includes(videoId)
                );
                
                if (foundFile) {
                    const foundPath = path.join(dir, foundFile);
                    console.log(`🔄 Arquivo encontrado com nome diferente: ${foundFile}`);
                    cacheFile = foundPath; // Usar o arquivo encontrado
                } else {
                    throw new Error(`Arquivo não foi criado: ${cacheFile}`);
                }
            }

            const stats = fs.statSync(cacheFile);
            if (stats.size === 0) {
                throw new Error(`Arquivo vazio: ${cacheFile}`);
            }

            console.log(`✅ Download concluído: ${metadata.artist} - ${metadata.track} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

            this.stats.totalDownloads++;
            this.manageCacheLimit(videoId);

            return cacheFile;

        } catch (e) {
            console.error('❌ Erro no download:', e.message);
            this.stats.errors++;
            throw e;
        } finally {
            this.downloadQueue.delete(videoId);
            this.removeDuplicateFiles(videoId);
        }
    }

    removeDuplicateFiles(videoId) {
        const dir = './music_cache';
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir);
        const duplicates = files.filter(f => f.endsWith('.mp3.mp3'));

        duplicates.forEach(file => {
            const full = path.join(dir, file);
            const fixed = path.join(dir, file.replace('.mp3.mp3', '.mp3'));

            try {
                if (fs.existsSync(fixed)) {
                    console.log('🗑 Removendo duplicado:', file);
                    fs.unlinkSync(full);
                } else {
                    console.log('✔️ Corrigindo nome duplicado:', file);
                    fs.renameSync(full, fixed);
                }
            } catch (e) {
                console.log('⚠️ Não foi possível corrigir duplicado:', e.message);
            }
        });
    }

    manageCacheLimit(newVideoId) {
        this.cacheIndex.set(newVideoId, Date.now());
        if (this.cacheIndex.size <= 1000) return;

        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [videoId, time] of this.cacheIndex.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = videoId;
            }
        }

        if (!oldestKey) return;

        const dir = './music_cache';
        const files = fs.readdirSync(dir);

        for (const f of files) {
            if (f.includes(`[${oldestKey}]`)) {
                try {
                    fs.unlinkSync(path.join(dir, f));
                    console.log('🗑 Removido do cache por limite:', f);
                } catch {}
            }
        }

        this.cacheIndex.delete(oldestKey);
    }

    getStats() {
        return this.stats;
    }
}

const instance = new DownloadManager();
module.exports = instance;
