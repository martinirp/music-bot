// utils/listManager.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ListManager {
    constructor() {
        this.cacheDir = './music_cache';
        this.catalogFile = path.join(this.cacheDir, 'music_catalog.json');
        this.catalog = this.loadCatalog();
    }

    // 🎯 CARREGAR CATÁLOGO
    loadCatalog() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            
            if (!fs.existsSync(this.catalogFile)) {
                console.log('📁 Criando novo catálogo...');
                this.saveCatalog({});
                return {};
            }
            
            const data = fs.readFileSync(this.catalogFile, 'utf8');
            const catalog = JSON.parse(data);
            console.log(`✅ Catálogo carregado: ${Object.keys(catalog).length} músicas`);
            return catalog;
        } catch (error) {
            console.error('❌ Erro ao carregar catálogo:', error);
            return {};
        }
    }

    // 🎯 SALVAR CATÁLOGO
    saveCatalog(catalog = null) {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            
            const data = JSON.stringify(catalog || this.catalog, null, 2);
            fs.writeFileSync(this.catalogFile, data, 'utf8');
            return true;
        } catch (error) {
            console.error('❌ Erro ao salvar catálogo:', error);
            return false;
        }
    }

    // 🎯 GERAR HASH PRECISO para identificação única
    generateMusicHash(title, artist = null) {
        const content = artist ? `${artist}|||${title}` : title;
        return crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');
    }

    // 🎯 NORMALIZAR NOME para busca
    normalizeName(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^\w\s]/g, ' ') // Remove caracteres especiais
            .replace(/\s+/g, ' ')     // Normaliza espaços
            .trim();
    }

    // 🎯 EXTRARIR PALAVRAS-CHAVE importantes
    extractKeywords(text) {
        const words = this.normalizeName(text).split(' ');
        
        // Remover palavras muito comuns (stop words)
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
            'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how'
        ]);
        
        return words.filter(word => 
            word.length > 2 && 
            !stopWords.has(word) &&
            !word.match(/^[0-9]+$/) // Remove apenas números
        );
    }

    // 🎯 CALCULAR SIMILARIDADE entre queries
    calculateSimilarity(query1, query2) {
        const words1 = new Set(this.extractKeywords(query1));
        const words2 = new Set(this.extractKeywords(query2));
        
        if (words1.size === 0 || words2.size === 0) return 0;
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    // 🎯 BUSCAR NO CATÁLOGO (BUSCA INTELIGENTE POR SIMILARIDADE)
    searchInCatalog(query, minSimilarity = 0.6) {
        if (!query || query.trim() === '') {
            return [];
        }

        const normalizedQuery = this.normalizeName(query);
        console.log(`🔍 Buscando no catálogo: "${query}" -> "${normalizedQuery}"`);
        
        const results = [];
        const queryHash = this.generateMusicHash(normalizedQuery);

        // 1. BUSCA POR HASH EXATO (MAIS PRECISO)
        if (this.catalog[queryHash]) {
            console.log(`✅ Cache HIT por hash: ${queryHash}`);
            this.updateLastAccessed(this.catalog[queryHash].primaryHash);
            return [this.catalog[queryHash]];
        }

        // 2. BUSCA POR SIMILARIDADE DE TEXTO
        const queryKeywords = this.extractKeywords(normalizedQuery);
        console.log(`🔑 Palavras-chave da busca:`, queryKeywords);
        
        if (queryKeywords.length === 0) {
            console.log(`❌ Nenhuma palavra-chave válida para busca`);
            return [];
        }

        for (const [hash, entry] of Object.entries(this.catalog)) {
            // Verificar se é uma entrada primária válida
            if (!entry.primaryHash || entry.primaryHash !== hash) continue;

            // Texto completo para busca (título + artista)
            const searchText = `${entry.normalizedTitle} ${entry.normalizedArtist || ''}`;
            const entryKeywords = this.extractKeywords(searchText);
            
            // Calcular similaridade
            const similarity = this.calculateSimilarity(normalizedQuery, searchText);
            
            console.log(`📊 "${entry.title}" -> Similaridade: ${similarity.toFixed(2)}`);
            
            if (similarity >= minSimilarity) {
                results.push({
                    ...entry,
                    similarity: similarity
                });
            }
        }

        // Ordenar por similaridade (maior primeiro)
        results.sort((a, b) => b.similarity - a.similarity);

        if (results.length > 0) {
            console.log(`✅ Cache HIT inteligente: ${results.length} resultado(s) para "${query}"`);
            console.log(`🎯 Melhor match: "${results[0].title}" (similaridade: ${results[0].similarity.toFixed(2)})`);
            
            results.forEach(entry => this.updateLastAccessed(entry.primaryHash));
            
            // Retornar apenas entradas limpas (sem similarity)
            return results.map(entry => {
                const { similarity, ...cleanEntry } = entry;
                return cleanEntry;
            });
        }

        console.log(`❌ Cache MISS: Nada encontrado para "${query}"`);
        return [];
    }

    // 🎯 ADICIONAR MÚSICA AO CATÁLOGO
    addToCatalog(filePath, metadata) {
        try {
            if (!fs.existsSync(filePath)) {
                console.log('❌ Arquivo não existe, não pode ser adicionado ao catálogo:', filePath);
                return false;
            }

            const fileName = path.basename(filePath);
            const { title, artist, videoId, originalQuery } = metadata;
            
            if (!title) {
                console.log('❌ Título não fornecido para o catálogo');
                return false;
            }

            // Gerar hashes para busca precisa
            const primaryHash = this.generateMusicHash(title, artist);
            const normalizedTitle = this.normalizeName(title);
            const normalizedArtist = artist ? this.normalizeName(artist) : null;
            
            const entry = {
                fileName,
                filePath,
                title,
                artist: artist || null,
                videoId: videoId || 'unknown',
                originalQuery: originalQuery || null,
                primaryHash,
                normalizedTitle,
                normalizedArtist,
                fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
                addedAt: Date.now(),
                lastAccessed: Date.now()
            };

            // Adicionar ao catálogo
            this.catalog[primaryHash] = entry;

            // Salvar catálogo
            this.saveCatalog();
            
            console.log(`✅ Adicionado ao catálogo: ${title}${artist ? ` - ${artist}` : ''}`);
            return true;

        } catch (error) {
            console.error('❌ Erro ao adicionar ao catálogo:', error);
            return false;
        }
    }

    // 🎯 ATUALIZAR ÚLTIMO ACESSO
    updateLastAccessed(primaryHash) {
        if (this.catalog[primaryHash]) {
            this.catalog[primaryHash].lastAccessed = Date.now();
        }
    }

    // 🎯 VERIFICAR SE ARQUIVO EXISTE
    validateFile(entry) {
        try {
            if (!fs.existsSync(entry.filePath)) {
                console.log(`❌ Arquivo não existe: ${entry.filePath}`);
                this.removeFromCatalog(entry.primaryHash);
                return false;
            }
            return true;
        } catch (error) {
            console.error('❌ Erro ao validar arquivo:', error);
            return false;
        }
    }

    // 🎯 REMOVER DO CATÁLOGO
    removeFromCatalog(primaryHash) {
        if (this.catalog[primaryHash]) {
            const entry = this.catalog[primaryHash];
            console.log(`🗑️ Removendo do catálogo: ${entry.title}`);
            delete this.catalog[primaryHash];
            this.saveCatalog();
            return true;
        }
        return false;
    }

    // 🎯 LIMPAR CATÁLOGO DE ENTRADAS INVÁLIDAS
    cleanupCatalog() {
        console.log('🧹 Iniciando limpeza do catálogo...');
        let removedCount = 0;
        
        for (const [hash, entry] of Object.entries(this.catalog)) {
            // Só processar entradas primárias
            if (!entry.primaryHash || entry.primaryHash !== hash) continue;
            
            if (!this.validateFile(entry)) {
                removedCount++;
            }
        }
        
        console.log(`✅ Limpeza concluída: ${removedCount} entradas removidas`);
        return removedCount;
    }

    // 🎯 ESTATÍSTICAS DO CATÁLOGO
    getStats() {
        const entries = Object.values(this.catalog).filter(entry => 
            entry.primaryHash && this.catalog[entry.primaryHash] === entry
        );
        
        const totalSize = entries.reduce((sum, entry) => sum + (entry.fileSize || 0), 0);
        const artists = new Set(entries.map(e => e.artist).filter(Boolean));
        
        return {
            totalSongs: entries.length,
            totalSize: totalSize,
            artists: artists.size,
            lastCleanup: Date.now()
        };
    }
}

// Exportar instância única
const instance = new ListManager();
module.exports = instance;
