require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const dibuiador = require('../utils/dibuiador');
const downloadManager = require('../utils/download');
const { getSpotifyPlaylist } = require('../utils/getSpotifyPL');

const DEBUG = process.env.DEBUG_MODE === 'true';
const CACHE_DIR = './music_cache';
const CHUNK_SIZE = 5;
const MAX_RECOMENDACOES = 5;

function log(...args) {
    if (DEBUG) console.log('[UPDATE]', ...args);
}

// 🆕 Função unificada de recomendações
async function getRecomendacoes(musicaBase) {
    let recomendadas = [];
    let fonte = '';

    try {
        recomendadas = await getSpotifyPlaylist(musicaBase);
        fonte = 'Spotify';
    } catch (spotifyError) {
        try {
            recomendadas = await getMixFromGemini(musicaBase);
            fonte = 'Gemini';
        } catch (geminiError) {
            throw new Error(`Falha ao obter recomendações para ${musicaBase}`);
        }
    }

    return { recomendadas, fonte };
}

// 🌐 Gemini
async function getMixFromGemini(musicaBase) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return [];

    const modelo = 'gemini-2.0-flash-exp';
    const prompt = `Me recomende ${MAX_RECOMENDACOES} músicas similares a "${musicaBase}". Responda apenas com um array JS no 
formato ["Artista - Música"].`;

    const data = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    return new Promise(resolve => {
        const req = https.request(options, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!text) return resolve([]);

                    const match = text.match(/\[[\s\S]*\]/);
                    if (!match) return resolve([]);

                    const arr = JSON.parse(match[0]);
                    resolve(arr);
                } catch {
                    resolve([]);
                }
            });
        });

        req.on('error', () => resolve([]));
        req.write(data);
        req.end();
    });
}

// 🛠️ Pega títulos atuais do cache
function getCacheTitles() {
    if (!fs.existsSync(CACHE_DIR)) return [];

    return fs.readdirSync(CACHE_DIR)
        .filter(f => f.endsWith('.mp3'))
        .map(file => {
            const decoded = dibuiador.decodeFileName(path.basename(file, '.mp3'));
            return decoded[0];
        })
        .filter(Boolean);
}

module.exports = {
    name: 'update',
    aliases: ['upd', 'cacheup'],
    inVoiceChannel: false,

    execute: async (message, client, args) => {

        dibuiador.carregarIndice();

        const musicasBase = getCacheTitles();
        if (!musicasBase.length) {
            return message.channel.send('⚠️ | O cache está vazio.');
        }

        await message.channel.send(`🔄 | Processando **${musicasBase.length}** músicas base...`);

        const todasRecomendacoes = new Set();
        let estatisticas = { Spotify: 0, Gemini: 0, Falhas: 0 };

        for (let i = 0; i < musicasBase.length; i += CHUNK_SIZE) {
            const bloco = musicasBase.slice(i, i + CHUNK_SIZE);

            const resultados = await Promise.allSettled(
                bloco.map(b => getRecomendacoes(b))
            );

            resultados.forEach(r => {
                if (r.status === 'fulfilled' && r.value?.recomendadas?.length) {
                    r.value.recomendadas.forEach(m => todasRecomendacoes.add(m));
                    estatisticas[r.value.fonte]++;
                } else {
                    estatisticas.Falhas++;
                }
            });

            await new Promise(r => setTimeout(r, 1500));
        }

        const lista = Array.from(todasRecomendacoes);

        await message.channel.send(`📥 | Obtidas **${lista.length}** recomendações únicas. Baixando...`);

        let novos = 0;
        let jaNoCache = 0;
        let falhas = 0;

        for (const recomendada of lista) {
            try {
                const res = await dibuiador.buscarMusica(recomendada);
                if (!res) {
                    falhas++;
                    continue;
                }

                // ✅ Checa se já existe no cache usando DownloadManager
                const expectedFile = downloadManager.getCacheFilePath(res.videoId, res.title);
                const existe = downloadManager.checkFileExists(expectedFile);
                
                if (existe) {
                    jaNoCache++;
                    continue;
                }

                // ✅ Baixa de forma PADRONIZADA usando DownloadManager
                await message.channel.send(`⏳ Baixando: ${res.title}`);
                const downloadResult = await downloadManager.downloadSong(res.url, res.videoId, res.title);
                
                if (downloadResult.success) {
                    novos++;
                } else {
                    falhas++;
                }
            } catch {
                falhas++;
            }

            await new Promise(r => setTimeout(r, 250));
        }

        const textoFinal = `
✅ **Atualização concluída!**

📊 **Resultados**
• 📥 Novos arquivos: ${novos}
• 📁 Já existiam: ${jaNoCache}
• ❌ Falhas: ${falhas}

📦 **Fontes**
Spotify: ${estatisticas.Spotify}
Gemini: ${estatisticas.Gemini}
Falhas: ${estatisticas.Falhas}
        `.trim();

        message.channel.send(textoFinal);
    }
};
