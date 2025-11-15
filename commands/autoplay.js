// autoplay.js
require('dotenv').config();
const dibuiador = require('../utils/dibuiador');
const downloadManager = require('../utils/download');
const { getSpotifyPlaylist } = require('../utils/getSpotifyPL');
const https = require('https');

const DEBUG = process.env.DEBUG_MODE === 'true';
const autoplayEnabled = new Map(); // guildId -> boolean

function log(...args) {
    if (DEBUG) console.log('[AUTOPLAY]', ...args);
}

// Função para gerar recomendações
async function gerarRecomendacoes(musicaBase) {
    let recomendadas = [];
    let fonte = '';

    try {
        log(`🎵 Tentando Spotify para: "${musicaBase}"`);
        recomendadas = await getSpotifyPlaylist(musicaBase);
        fonte = 'Spotify';
        log(`✅ Spotify retornou ${recomendadas.length} músicas`);
    } catch (spotifyError) {
        log(`❌ Spotify falhou: ${spotifyError.message}`);
        log(`🤖 Tentando Gemini...`);
        try {
            recomendadas = await getMixFromGemini(musicaBase);
            fonte = 'Gemini AI';
            log(`✅ Gemini retornou ${recomendadas.length} músicas`);
        } catch (geminiError) {
            log(`❌ Gemini também falhou: ${geminiError.message}`);
            return { recomendadas: [], fonte: 'Nenhuma' };
        }
    }

    return { recomendadas, fonte };
}

// Função Gemini atualizada
async function getMixFromGemini(musicaBase) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.log(`❌ GEMINI_API_KEY não encontrada no .env`);
        return null;
    }

    const modelo = 'gemini-2.0-flash-exp';
    const prompt = `Me recomende 5 músicas similares a "${musicaBase}" para criar uma playlist mix, pelo menos 3 do mesmo artista, as outras nao precisam ser.
Responda apenas com um array JavaScript no formato ["Artista - Música"], sem explicações, sem markdown.`;

    const data = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
    });

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`❌ Erro Gemini (${res.statusCode}):`, body);
                    return resolve(null);
                }

                try {
                    const result = JSON.parse(body);
                    const content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (!content) return resolve(null);

                    const match = content.match(/\[[\s\S]*\]/);
                    if (match) {
                        try {
                            const arr = JSON.parse(match[0]);
                            return resolve(arr);
                        } catch {
                            console.log(`⚠️ Erro ao interpretar JSON Gemini.`);
                            return resolve(null);
                        }
                    } else {
                        console.log(`⚠️ Gemini não retornou array válido:`, content);
                        return resolve(null);
                    }
                } catch (e) {
                    console.error(`❌ Erro ao parsear resposta Gemini:`, e.message);
                    resolve(null);
                }
            });
        });

        req.on('error', err => {
            console.error(`❌ Erro HTTP Gemini:`, err.message);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// Comando autoplay simples
module.exports = {
    name: 'autoplay',
    aliases: ['ap', 'auto'],
    inVoiceChannel: true,

    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const currentState = autoplayEnabled.get(guildId) || false;
        
        // Alternar estado
        autoplayEnabled.set(guildId, !currentState);
        const newState = autoplayEnabled.get(guildId);
        
        if (newState) {
            message.channel.send('✅ | **Autoplay ativado!** As próximas músicas gerarão recomendações automaticamente.');
        } else {
            message.channel.send('❌ | **Autoplay desativado!**');
        }
    },

    // Exportar para usar em outros lugares
    isAutoplayEnabled: (guildId) => autoplayEnabled.get(guildId) || false,
    gerarRecomendacoes
};

