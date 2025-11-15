require('dotenv').config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// 🆕 FUNÇÃO ESPECÍFICA PARA IDENTIFICAR MÚSICA (não gerar mix)
async function identifySpotifyTrack(query) {
    console.log(`🎵 [SPOTIFY] Identificando: "${query}"`);
    
    try {
        const token = await getSpotifyToken();
        if (!token) {
            throw new Error('Não foi possível obter token do Spotify');
        }

        // 🎯 BUSCA ESPECÍFICA POR TRACK com filtros
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        const response = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const track = data.tracks?.items[0];
            
            if (track) {
                console.log(`✅ [SPOTIFY] Encontrada: "${track.name}" por ${track.artists[0]?.name}`);
                return {
                    artist: track.artists[0]?.name,
                    track: track.name,
                    fullTitle: `${track.artists[0]?.name} - ${track.name}`
                };
            }
        }
        return null;
    } catch (error) {
        console.log(`❌ [SPOTIFY] Erro identificação: ${error.message}`);
        return null;
    }
}

/**
 * Gera um mix de músicas usando Spotify API
 * @param {string} query - Qualquer query (artista, música, ou ambos)
 * @returns {Promise<Array>} Array de strings no formato "Artista - Música"
 */
async function getSpotifyPlaylist(query) {
    console.log(`🎵 [SPOTIFY] Gerando mix para: "${query}"`);
    
    try {
        const token = await getSpotifyToken();
        if (!token) {
            throw new Error('Não foi possível obter token do Spotify');
        }

        // 1. Buscar artista base a partir da query
        const baseArtist = await findBaseArtist(token, query);
        if (!baseArtist) {
            throw new Error('Nenhum artista encontrado para a query');
        }

        console.log(`✅ [SPOTIFY] Artista base: ${baseArtist.name}`);

        // 2. Construir mix
        const mixTracks = await buildSpotifyMix(token, baseArtist);
        
        if (mixTracks.length === 0) {
            throw new Error('Nenhuma música válida encontrada');
        }

        // 3. Formatar no padrão limpo "Artista - Música"
        const formattedTracks = mixTracks.map(track => {
            const artists = track.artists.map(a => a.name).join(', ');
            const cleanTrackName = cleanTrackTitle(track.name);
            return `${artists} - ${cleanTrackName}`;
        });

        console.log(`✅ [SPOTIFY] Mix gerado: ${formattedTracks.length} músicas`);
        return formattedTracks;

    } catch (error) {
        console.log(`❌ [SPOTIFY] Erro: ${error.message}`);
        throw error; // Propaga o erro para o fallback
    }
}

// 🎵 Função para limpar título da música
function cleanTrackTitle(title) {
    if (!title) return '';
    
    return title
        // Remove informações de remasterização
        .replace(/\s*[-–—]\s*(Remastered|Remaster|Remasterizado|Remasterização).*$/i, '')
        .replace(/\s*\(\s*(Remastered|Remaster|Remasterizado)\s*\d*\s*\)/gi, '')
        // Remove anos entre parênteses
        .replace(/\s*\(\s*\d{4}\s*\)/g, '')
        // Remove versões (Live, Acoustic, etc.)
        .replace(/\s*[-–—]\s*(Live|Acoustic|Unplugged|Version|Mix|Radio Edit).*$/i, '')
        .replace(/\s*\(\s*(Live|Acoustic|Unplugged|Version|Mix|Radio Edit).*?\)/gi, '')
        // Remove informações entre parênteses no final
        .replace(/\s*\([^)]*\)$/, '')
        // Remove informações entre colchetes
        .replace(/\s*\[[^\]]*\]/g, '')
        // Remove espaços extras e trim
        .replace(/\s+/g, ' ')
        .trim();
}

// 🎵 Encontrar artista base a partir de qualquer query
async function findBaseArtist(token, query) {
    // Primeiro tenta buscar como track (música específica)
    const trackResult = await searchTrack(token, query);
    if (trackResult && trackResult.artists && trackResult.artists.length > 0) {
        console.log(`🔍 [SPOTIFY] Encontrado como música: "${trackResult.name}"`);
        return trackResult.artists[0]; // Retorna o artista principal da música
    }

    // Se não encontrou como música, busca como artista
    const artistResult = await searchArtist(token, query);
    if (artistResult) {
        console.log(`🔍 [SPOTIFY] Encontrado como artista: "${artistResult.name}"`);
        return artistResult;
    }

    // Tenta buscar qualquer resultado e pegar o primeiro artista relevante
    const searchResult = await searchAny(token, query);
    if (searchResult.artist) {
        console.log(`🔍 [SPOTIFY] Encontrado em busca geral: "${searchResult.artist.name}"`);
        return searchResult.artist;
    }

    return null;
}

// 🎵 Buscar como música específica
async function searchTrack(token, query) {
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.tracks?.items[0] || null;
        }
        return null;
    } catch (error) {
        console.log('❌ Erro ao buscar track:', error.message);
        return null;
    }
}

// 🎵 Buscar como artista
async function searchArtist(token, query) {
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=1`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.artists?.items[0] || null;
        }
        return null;
    } catch (error) {
        console.log('❌ Erro ao buscar artista:', error.message);
        return null;
    }
}

// 🎵 Buscar qualquer coisa e tentar extrair artista
async function searchAny(token, query) {
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist&limit=5`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            
            // Primeiro tenta pegar artista dos resultados de tracks
            if (data.tracks?.items?.[0]?.artists?.[0]) {
                return { artist: data.tracks.items[0].artists[0] };
            }
            
            // Depois tenta pegar dos resultados de artistas
            if (data.artists?.items?.[0]) {
                return { artist: data.artists.items[0] };
            }
        }
        return {};
    } catch (error) {
        console.log('❌ Erro em busca geral:', error.message);
        return {};
    }
}

// 🎵 Construir mix com Spotify
async function buildSpotifyMix(token, mainArtist) {
    const mixTracks = [];

    // FASE 1: Top tracks do artista principal (4-5 músicas)
    const topTracks = await getTopTracks(token, mainArtist.id);
    if (topTracks && topTracks.length > 0) {
        const mainTracks = topTracks.slice(0, 5);
        mixTracks.push(...mainTracks);
    }

    // FASE 2: Artistas relacionados (3-4 artistas, 2 músicas cada)
    const relatedArtists = await getRelatedArtists(token, mainArtist.id);
    if (relatedArtists && relatedArtists.length > 0) {
        const selectedRelated = relatedArtists.slice(0, 4);
        
        for (const artist of selectedRelated) {
            const artistTracks = await getTopTracks(token, artist.id);
            if (artistTracks && artistTracks.length > 0) {
                const bestTracks = artistTracks.slice(0, 2);
                mixTracks.push(...bestTracks);
            }
            await delay(200);
        }
    }

    // FASE 3: Buscar por gênero (3-4 músicas)
    if (mainArtist.genres && mainArtist.genres.length > 0) {
        const genreTracks = await searchByGenre(token, mainArtist.genres[0], 4);
        if (genreTracks && genreTracks.length > 0) {
            // Filtrar duplicatas
            const existingIds = new Set(mixTracks.map(t => t.id));
            const newTracks = genreTracks.filter(track => !existingIds.has(track.id));
            mixTracks.push(...newTracks.slice(0, 4));
        }
    }

    // Remover duplicatas
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of mixTracks) {
        if (track && !trackIds.has(track.id)) {
            trackIds.add(track.id);
            uniqueTracks.push(track);
        }
    }

    return uniqueTracks.slice(0, 15); // Limitar a 15 músicas
}

// 🎵 Funções auxiliares
async function getTopTracks(token, artistId, market = 'BR') {
    try {
        const url = `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=${market}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.tracks || [];
        }
        return null;
    } catch (error) {
        console.log('❌ Erro top tracks:', error.message);
        return null;
    }
}

async function getRelatedArtists(token, artistId) {
    try {
        const url = `https://api.spotify.com/v1/artists/${artistId}/related-artists`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.artists || [];
        }
        return null;
    } catch (error) {
        console.log('❌ Erro related artists:', error.message);
        return null;
    }
}

async function searchByGenre(token, genre, limit = 5) {
    try {
        const url = `https://api.spotify.com/v1/search?q=genre:"${genre}"&type=track&limit=${limit}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.tracks?.items || [];
        }
        return [];
    } catch (error) {
        console.log('❌ Erro busca por gênero:', error.message);
        return [];
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getSpotifyToken() {
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.log('❌ Erro ao obter token do Spotify:', error.message);
        return null;
    }
}

module.exports = { getSpotifyPlaylist, identifySpotifyTrack };
