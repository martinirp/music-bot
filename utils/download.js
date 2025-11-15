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
            errors: 0,
            spotifyIdentifications: 0
        };
    }

    generateOrganizedFilename(videoId, title, artist = null, track = null) {
        let baseName, invertedName;
        
        if (artist && track) {
            baseName = `${this.sanitizeFilename(artist)} - ${this.sanitizeFilename(track)}`;
            invertedName = `${this.sanitizeFilename(track)} - ${this.sanitizeFilename(artist)}`;
        } else if (artist) {
            baseName = `${this.sanitizeFilename(artist)} - ${this.sanitizeFilename(title)}`;
            invertedName = `${this.sanitizeFilename(title)} - ${this.sanitizeFilename(artist)}`;
        } else {
            baseName = `${this.sanitizeFilename(title)}`;
            invertedName = baseName;
        }
        
        return `${baseName} || ${invertedName} [${videoId}].mp3`;
    }

    sanitizeFilename(name) {
        return name
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    getCacheFilePath(videoId, title, artist = null, track = null) {
        const tempDir = './music_cache';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filename = this.generateOrganizedFilename(videoId, title, artist, track);
        let finalPath = path.join(tempDir, filename);
        
        finalPath = finalPath.replace('.mp3.mp3', '.mp3');
        return finalPath;
    }

    async identifyArtistWithSpotify(trackName) {
        try {
            const { identifySpotifyTrack } = require('./getSpotifyPL');
            console.log(`🎤 Consultando Spotify para: "${trackName}"`);
            
            // 🆕 LIMPAR O NOME ANTES DE CONSULTAR
            const cleanTrackName = trackName
                .replace(/\(Official Music Video\)/gi, '')
                .replace(/\(Official Video\)/gi, '')
                .replace(/\(Official Audio\)/gi, '')
                .replace(/\[[^\]]*\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            console.log(`🔧 Nome limpo: "${cleanTrackName}"`);
            
            const result = await identifySpotifyTrack(cleanTrackName);
            
            if (result && result.artist) {
                console.log(`✅ Artista identificado: "${result.artist}"`);
                this.stats.spotifyIdentifications++;
                return result.artist;
            }
        } catch (error) {
            console.log('❌ Identificação Spotify falhou:', error.message);
        }
        return null;
    }

    checkFileExists(filePath) {
        const dir = path.dirname(filePath);
        const expectedName = path.basename(filePath);
        
        if (fs.existsSync(filePath)) {
            return true;
        }
        
        const mp3mp3Path = filePath + '.mp3';
        if (fs.existsSync(mp3mp3Path)) {
            console.log('🔄 Corrigindo arquivo .mp3.mp3 para .mp3');
            try {
                fs.renameSync(mp3mp3Path, filePath);
                return true;
            } catch (e) {
                console.log('⚠️ Não foi possível corrigir arquivo:', e.message);
            }
        }
        
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const videoId = expectedName.split('[')[1]?.split(']')[0] || 'unknown';
            
            const matchingFiles = files.filter(f => 
                f.includes(videoId) && f.endsWith('.mp3')
            );
            
            if (matchingFiles.length > 0) {
                const foundFile = matchingFiles[0];
                const foundPath = path.join(dir, foundFile);
                
                console.log(`🔄 Arquivo encontrado com nome diferente: ${foundFile}`);
                
                if (foundFile !== expectedName) {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                        fs.renameSync(foundPath, filePath);
                        console.log(`✅ Arquivo renomeado para: ${path.basename(filePath)}`);
                        return true;
                    } catch (e) {
                        console.log('⚠️ Não foi possível renomear:', e.message);
                    }
                }
                return true;
            }
        }
        
        return false;
    }

    async downloadSong(url, videoId, title, maxRetries = 3) {
        let cacheFile = this.getCacheFilePath(videoId, title);
        
        console.log(`🔍 Verificando cache para: ${title}`);
        
        if (this.checkFileExists(cacheFile)) {
            this.stats.cacheHits++;
            console.log(`✅ Cache hit: ${title}`);
            return { success: true, file: cacheFile, fromCache: true };
        }

        this.stats.cacheMisses++;
        console.log(`❌ Cache miss, baixando: ${title}`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const downloadedFile = await this.downloadToCache(url, videoId, title);
                
                try {
                    const artist = await this.identifyArtistWithSpotify(title);
                    if (artist) {
                        console.log(`🎤 Artista identificado via Spotify: ${artist}`);
                        
                        const finalFile = this.getCacheFilePath(videoId, title, artist, title);
                        
                        if (fs.existsSync(finalFile)) {
                            console.log('⚠️ Arquivo final já existe, mantendo original');
                        } else {
                            fs.renameSync(downloadedFile, finalFile);
                            console.log(`🔄 Arquivo renomeado: ${path.basename(downloadedFile)} → ${path.basename(finalFile)}`);
                            return { 
                                success: true, 
                                file: finalFile, 
                                fromCache: false, 
                                artist: artist,
                                spotifyIdentified: true 
                            };
                        }
                    }
                } catch (spotifyError) {
                    console.log('⚠️ Identificação Spotify falhou:', spotifyError.message);
                }
                
                return { 
                    success: true, 
                    file: downloadedFile, 
                    fromCache: false,
                    spotifyIdentified: false 
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

    async downloadToCache(url, videoId, title = '') {
        if (this.downloadQueue.has(videoId)) {
            console.log('⏳ Download já em andamento:', videoId);
            while (this.downloadQueue.has(videoId)) {
                await new Promise(r => setTimeout(r, 100));
            }
            return;
        }

        this.downloadQueue.set(videoId, true);

        try {
            let cacheFile = this.getCacheFilePath(videoId, title);

            if (this.checkFileExists(cacheFile)) {
                console.log('✅ Arquivo já existe no cache, pulando download:', title || videoId);
                this.downloadQueue.delete(videoId);
                return cacheFile;
            }

            const dir = path.dirname(cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            console.log('📥 Baixando:', title || videoId);

            const args = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--no-playlist',
                '--embed-metadata',
                '--embed-thumbnail',
                '--restrict-filenames',
                '--no-overwrites',
                '--continue',
                '--output', `"${cacheFile}"`,
                `"${url}"`
            ];

            console.log('🔧 Executando: yt-dlp', args.join(' '));
            await execPromise(`yt-dlp ${args.join(' ')}`, { shell: true });

            if (!fs.existsSync(cacheFile)) {
                const files = fs.readdirSync(dir);
                const foundFile = files.find(f => 
                    f.endsWith('.mp3') && 
                    (f.includes(videoId) || f.includes(title.replace(/[^a-zA-Z0-9]/g, '_')))
                );
                
                if (foundFile) {
                    const foundPath = path.join(dir, foundFile);
                    console.log(`🔄 Arquivo encontrado com nome restrito: ${foundFile}`);
                    
                    if (foundPath !== cacheFile) {
                        if (fs.existsSync(cacheFile)) {
                            fs.unlinkSync(cacheFile);
                        }
                        fs.renameSync(foundPath, cacheFile);
                        console.log(`✅ Arquivo renomeado para: ${path.basename(cacheFile)}`);
                    }
                } else {
                    throw new Error(`Arquivo não foi criado: ${cacheFile}`);
                }
            }

            const stats = fs.statSync(cacheFile);
            if (stats.size === 0) {
                throw new Error(`Arquivo vazio: ${cacheFile}`);
            }

            console.log(`✅ Download concluído: ${title || videoId} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

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
            if (f.startsWith(oldestKey)) {
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
