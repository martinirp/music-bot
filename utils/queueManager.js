// utils/queueManager.js - VERSÃO COMPLETA COM AUTOPLAY MELHORADO
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const downloadManager = require('./download');
const dibuiador = require('./dibuiador');

class QueueManager {
  constructor() {
    this.queues = new Map();
    this.connections = new Map();
    this.players = new Map();
    this.autoPlay = new Map();
    this.djEffects = new Map();

    this.stats = {
      errors: 0,
      totalServers: 0
    };

    this.cleanupIntervalMs = 5 * 60 * 1000;
    this.startCleanupInterval();
  }

  getQueue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, {
        songs: [],
        isPlaying: false,
        currentSong: null,
        voiceChannel: null,
        lastActivity: Date.now(),
        lastPlayed: null
      });
    }
    return this.queues.get(guildId);
  }

  getQueueInfo(guildId) {
    const queue = this.getQueue(guildId);
    return {
      isPlaying: queue.isPlaying,
      queue: queue.songs,
      currentSong: queue.currentSong
    };
  }

  getAutoPlay(guildId) {
    return this.autoPlay.get(guildId) || false;
  }

  setAutoPlay(guildId, status) {
    this.autoPlay.set(guildId, status);
    console.log(`📻 AutoPlay ${status ? 'ATIVADO' : 'DESATIVADO'} para guild: ${guildId}`);
  }

  getDJEffects(guildId) {
    return this.djEffects.get(guildId) || 'normal';
  }

  setDJEffects(guildId, effect) {
    this.djEffects.set(guildId, effect);
    
    const player = this.getPlayer(guildId);
    if (player && effect !== 'normal') {
      this.applyAudioEffect(guildId, effect);
    }
  }

  applyAudioEffect(guildId, effect) {
    const player = this.getPlayer(guildId);
    if (!player) return;

    try {
      const currentResource = player.state.resource;
      if (!currentResource) return;

      console.log(`🎛️ Aplicando efeito ${effect} para guild: ${guildId}`);
      
      switch (effect) {
        case 'bassboost':
          break;
        case 'nightcore':
          break;
        case 'vaporwave':
          break;
        case 'reverse':
          break;
      }
      
    } catch (error) {
      console.error('❌ Erro ao aplicar efeito DJ:', error);
    }
  }

  async prepareNextAutoPlay(guildId, currentSong) {
    const queue = this.getQueue(guildId);
    
    if (!this.getAutoPlay(guildId) || queue.songs.length > 3) {
      return;
    }

    try {
      console.log(`🎯 AutoPlay: Preparando próxima música similar a "${currentSong.title}"`);
      
      let similarSong = null;
      
      // Estratégia 1: Buscar por artista
      const artistMatch = currentSong.title.match(/(.+?)\s+-/);
      if (artistMatch) {
        const artist = artistMatch[1].trim();
        console.log(`🎤 AutoPlay: Buscando por artista "${artist}"`);
        similarSong = await dibuiador.buscarMusica(`${artist}`);
      }
      
      // Estratégia 2: Se não encontrou, buscar por gênero similar
      if (!similarSong) {
        console.log(`🎵 AutoPlay: Buscando música similar a "${currentSong.title}"`);
        similarSong = await dibuiador.buscarMusica(`music similar to ${currentSong.title}`);
      }
      
      // Estratégia 3: Se ainda não encontrou, buscar trending
      if (!similarSong) {
        console.log(`🔥 AutoPlay: Buscando música popular`);
        similarSong = await dibuiador.buscarMusica(`popular music`);
      }

      // FILTRAR: Não adicionar a mesma música
      if (similarSong && similarSong.videoId === currentSong.videoId) {
        console.log('❌ AutoPlay: Música igual à atual, ignorando...');
        return;
      }
      
      // FILTRAR: Não adicionar músicas já na fila
      if (similarSong && queue.songs.some(song => song.videoId === similarSong.videoId)) {
        console.log('❌ AutoPlay: Música já está na fila, ignorando...');
        return;
      }

      if (similarSong) {
        console.log(`✅ AutoPlay: Encontrada "${similarSong.title}"`);
        
        const downloadResult = await downloadManager.downloadSong(
          similarSong.url,
          similarSong.videoId,
          similarSong.title
        );

        if (downloadResult.success) {
          const songInfo = {
            url: similarSong.url,
            title: similarSong.title,
            videoId: similarSong.videoId,
            requestedBy: '🤖 AutoPlay',
            channel: currentSong.channel,
            fromCache: downloadResult.fromCache,
            file: downloadResult.file // 🆕 USAR FILE DO DOWNLOAD
          };

          queue.songs.push(songInfo);
          
          console.log(`✅ AutoPlay: "${similarSong.title}" preparada na posição ${queue.songs.length}`);
          
          try {
            await currentSong.channel.send(`🎯 | **AutoPlay:** "${similarSong.title}"`);
          } catch (err) {
            console.log('⚠️ Não foi possível enviar mensagem do AutoPlay');
          }
        }
      } else {
        console.log('❌ AutoPlay: Nenhuma música similar encontrada');
      }
    } catch (error) {
      console.error('❌ Erro no AutoPlay preparatório:', error);
    }
  }

  getStats() {
    this.stats.totalServers = this.queues.size;
    const downloadStats = downloadManager.getStats();
    return { ...this.stats, ...downloadStats };
  }

  resetGuild(guildId) {
    const player = this.players.get(guildId);
    if (player) player.stop();

    const connection = this.connections.get(guildId);
    if (connection) {
      try {
        connection.destroy();
      } catch {}
    }

    this.players.delete(guildId);
    this.connections.delete(guildId);
    this.queues.delete(guildId);
    this.autoPlay.delete(guildId);
    this.djEffects.delete(guildId);

    console.log(`🔄 Resetado guild: ${guildId}`);
  }

  async addToQueue(guildId, songInfo, voiceChannel) {
    const queue = this.getQueue(guildId);
    queue.voiceChannel = voiceChannel;
    queue.lastActivity = Date.now();

    // 🆕 NÃO GERAR O NOME DO ARQUIVO AQUI - usar o file que já vem do download
    // songInfo.file já deve vir preenchido pelo downloadManager com o caminho correto
    
    const position = queue.songs.length + 1;
    queue.songs.push(songInfo);

    console.log('➕ Adicionada à fila:', songInfo.title, 'pos', position);
    console.log('📁 Arquivo:', songInfo.file); // 🆕 LOG PARA DEBUG

    const fileExists = downloadManager.checkFileExists(songInfo.file);
    
    if (fileExists) {
      songInfo.fromCache = true;
      console.log('✅ Arquivo encontrado no cache');
    } else {
      console.log('❌ Arquivo não encontrado no cache, será baixado durante reprodução');
    }

    if (!queue.isPlaying && queue.songs.length === 1) {
      console.log('🚀 Iniciando reprodução da primeira música');
      await this.playNextSong(guildId);
    }

    return position;
  }

  async playNextSong(guildId) {
    const queue = this.getQueue(guildId);
    
    if (!queue.songs || queue.songs.length === 0) {
      console.log('❌ Fila vazia, parando reprodução');
      queue.isPlaying = false;
      queue.currentSong = null;
      
      if (this.getAutoPlay(guildId) && queue.lastPlayed) {
        console.log('🎯 AutoPlay: Fila vazia, buscando nova música...');
        await this.autoPlayNext(guildId, queue.lastPlayed);
        return;
      }
      
      this.cleanupConnection(guildId);
      return;
    }

    const nextSong = queue.songs[0];
    console.log('🎵 Iniciando playNextSong para:', nextSong.title);
    console.log('📁 Arquivo esperado:', nextSong.file); // 🆕 LOG PARA DEBUG

    try {
      queue.isPlaying = true;
      queue.currentSong = nextSong;
      queue.lastPlayed = nextSong;
      queue.lastActivity = Date.now();

      // 🆕 USAR O FILE QUE JÁ VEM DA MÚSICA, NÃO GERAR NOVAMENTE
      console.log('📁 Verificando arquivo:', nextSong.file);

      if (!downloadManager.checkFileExists(nextSong.file)) {
        console.log('❌ Arquivo não existe, tentando encontrar por videoId...');
        
        // 🆕 TENTAR ENCONTRAR O ARQUIVO PELO VIDEOID
        const files = fs.readdirSync('./music_cache');
        const videoId = nextSong.videoId;
        const matchingFiles = files.filter(f => 
          f.includes(videoId) && f.endsWith('.mp3')
        );
        
        if (matchingFiles.length > 0) {
          const foundFile = matchingFiles[0];
          nextSong.file = path.join('./music_cache', foundFile);
          console.log(`✅ Arquivo encontrado: ${foundFile}`);
        } else {
          throw new Error(`Arquivo não existe: ${nextSong.file}`);
        }
      }

      if (!fs.existsSync(nextSong.file)) {
        throw new Error(`Arquivo não existe: ${nextSong.file}`);
      }

      const fileStats = fs.statSync(nextSong.file);
      console.log('✅ Arquivo verificado:', fileStats.size, 'bytes');

      let connection = this.connections.get(guildId);
      if (!connection) {
        if (!queue.voiceChannel) {
          throw new Error('Voice channel não disponível');
        }

        console.log('🔌 Conectando ao canal de voz...');
        connection = joinVoiceChannel({
          channelId: queue.voiceChannel.id,
          guildId: queue.voiceChannel.guild.id,
          adapterCreator: queue.voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: false
        });

        this.connections.set(guildId, connection);
      }

      console.log('⏳ Aguardando conexão...');
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      console.log('✅ Conectado e pronto');

      let player = this.players.get(guildId);
      if (!player) {
        player = createAudioPlayer();
        this.players.set(guildId, player);
        connection.subscribe(player);
        console.log('🎹 Player criado e inscrito');
      }

      const currentEffect = this.getDJEffects(guildId);
      if (currentEffect !== 'normal') {
        this.applyAudioEffect(guildId, currentEffect);
      }

      player.removeAllListeners();

      player.on(AudioPlayerStatus.Playing, () => {
        console.log('▶️ Música iniciada com sucesso!');
        
        if (this.getAutoPlay(guildId) && queue.songs.length <= 2) {
          setTimeout(() => {
            this.prepareNextAutoPlay(guildId, nextSong);
          }, 5000);
        }
        
        // ✅ APENAS LOG NO CONSOLE - SEM MENSAGEM NO DISCORD
        console.log(`🎵 Tocando agora: ${nextSong.title}`);
      });

      player.on(AudioPlayerStatus.Idle, () => {
        console.log('⏹️ Música terminou, próxima...');
        queue.songs.shift();
        this.playNextSong(guildId);
      });

      player.on('error', error => {
        console.error('❌ Erro no player:', error.message);
        this.stats.errors++;
        queue.songs.shift();
        this.playNextSong(guildId);
      });

      console.log('🔊 Criando audio resource...');
      const resource = createAudioResource(nextSong.file, {
        inlineVolume: true,
        metadata: {
          title: nextSong.title
        }
      });

      console.log('🎵 Iniciando reprodução...');
      player.play(resource);
      console.log('✅ Comando play executado');

    } catch (error) {
      console.error('❌ Erro em playNextSong:', error.message);
      this.stats.errors++;
      queue.songs.shift();
      setTimeout(() => this.playNextSong(guildId), 1000);
    }
  }

  async autoPlayNext(guildId, lastSong) {
    try {
      console.log(`🎯 AutoPlay (fila vazia): Buscando música similar a "${lastSong.title}"`);
      
      let similarSong = null;
      
      const artistMatch = lastSong.title.match(/(.+?)\s+-/);
      if (artistMatch) {
        const artist = artistMatch[1].trim();
        similarSong = await dibuiador.buscarMusica(`${artist}`);
      }
      
      if (!similarSong) {
        similarSong = await dibuiador.buscarMusica(`music similar to ${lastSong.title}`);
      }
      
      if (!similarSong) {
        similarSong = await dibuiador.buscarMusica(`popular music`);
      }

      if (similarSong) {
        console.log(`✅ AutoPlay: Encontrada "${similarSong.title}"`);
        
        const downloadResult = await downloadManager.downloadSong(
          similarSong.url,
          similarSong.videoId,
          similarSong.title
        );

        if (downloadResult.success) {
          const songInfo = {
            url: similarSong.url,
            title: similarSong.title,
            videoId: similarSong.videoId,
            requestedBy: '🤖 AutoPlay',
            channel: lastSong.channel,
            fromCache: downloadResult.fromCache,
            file: downloadResult.file // 🆕 USAR FILE DO DOWNLOAD
          };

          const queue = this.getQueue(guildId);
          queue.songs.push(songInfo);
          
          console.log(`✅ AutoPlay: "${similarSong.title}" adicionada à fila`);
          
          if (!queue.isPlaying) {
            await this.playNextSong(guildId);
          }
          
          try {
            await lastSong.channel.send(`🎯 | **AutoPlay:** "${similarSong.title}"`);
          } catch (err) {
            console.log('⚠️ Não foi possível enviar mensagem do AutoPlay');
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro no AutoPlay:', error);
    }
  }

  cleanupConnection(guildId) {
    const conn = this.connections.get(guildId);
    if (conn) {
      try {
        conn.destroy();
      } catch {}
    }
    this.connections.delete(guildId);
    this.players.delete(guildId);
    console.log('🔌 Conexão limpa para guild:', guildId);
  }

  getPlayer(guildId) {
    return this.players.get(guildId);
  }

  isPaused(guildId) {
    const player = this.getPlayer(guildId);
    return player ? player.state.status === AudioPlayerStatus.Paused : false;
  }

  skipSong(guildId) {
    const player = this.getPlayer(guildId);
    if (player) {
      player.stop();
    }
  }

  getCurrentSong(guildId) {
    const queue = this.getQueue(guildId);
    return queue.currentSong;
  }

  removeFromQueue(guildId, position) {
    const queue = this.getQueue(guildId);
    
    if (position < 1 || position > queue.songs.length) {
      throw new Error('Posição inválida! Use um número entre 1 e ' + queue.songs.length);
    }
    
    const removedSong = queue.songs.splice(position - 1, 1)[0];
    return removedSong;
  }

  // 🆕 FUNÇÃO PARA LIMPAR TÍTULO - CORRIGIDA
  cleanYouTubeTitle(title) {
    if (!title) return 'Título desconhecido';
    
    return title
      .replace(/\s*\[[^\]]*\]/g, '') // Remove [videoId] e similares
      .replace(/\s*\([^)]*\)/g, '')  // Remove (Official Video) etc
      // 🆕 REMOVER APENAS: Não remove tudo depois do -
      .replace(/\s*\[Official Music Video\]/gi, '')
      .replace(/\s*\(Official Audio\)/gi, '')
      .replace(/\s*\(Lyrics\)/gi, '')
      .replace(/\s*\(Letra\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  // 🆕 FUNÇÃO PARA FORMATAR DURAÇÃO
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '[--:--]';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `[${minutes}:${remainingSeconds.toString().padStart(2, '0')}]`;
  }

  createControlMessage(guildId) {
    const queue = this.getQueue(guildId);
    const currentSong = queue.currentSong;
    
    if (!currentSong) {
      return {
        content: '❌ | Nenhuma música tocando no momento!',
        components: []
      };
    }

    // 🆕 CRIAR LISTA DA FILA (apenas próximas músicas)
    let queueList = '';
    const queueSongs = queue.songs.slice(0, 8); // Mostrar até 8 músicas
    
    if (queueSongs.length === 0) {
      queueList = '`Nenhuma música na fila`\n';
    } else {
      queueSongs.forEach((song, index) => {
        const position = index + 1;
        const duration = song.duration ? this.formatDuration(song.duration) : '[--:--]';
        const cleanTitle = this.cleanYouTubeTitle(song.title);
        queueList += `${position}. ${duration} [${cleanTitle}](${song.url})\n`;
      });
      
      if (queue.songs.length > 8) {
        queueList += `\n... e mais ${queue.songs.length - 8} música(s)`;
      }
    }

    const isPaused = this.isPaused(guildId);
    const autoPlayStatus = this.getAutoPlay(guildId) ? '✅' : '❌';
    const djEffect = this.getDJEffects(guildId);

    // 🆕 EMBED SIMPLES APENAS COM A FILA
    const embed = {
      color: 0x3498db,
      description: `🎵 **Tocando Agora:** [${this.cleanYouTubeTitle(currentSong.title)}](${currentSong.url})\n\n📋 **Próximas na fila:**\n${queueList}`,
      footer: {
        text: `Pedido por ${currentSong.requestedBy} • AutoPlay: ${autoPlayStatus} • DJ: ${djEffect}`,
        icon_url: 'https://cdn.discordapp.com/emojis/🎵.png'
      },
      timestamp: new Date().toISOString()
    };

    // 🆕 COMPONENTES SIMPLES
    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            label: isPaused ? '▶️ Retomar' : '⏸️ Pausar',
            style: 1,
            customId: 'music_pause'
          },
          {
            type: 2,
            label: '⏭️ Pular',
            style: 1,
            customId: 'music_skip'
          },
          {
            type: 2,
            label: '⏹️ Parar',
            style: 4,
            customId: 'music_stop'
          }
        ]
      }
    ];

    return {
      embeds: [embed],
      components: components
    };
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const inactiveTime = 30 * 60 * 1000; // 30 minutos
      
      for (const [guildId, queue] of this.queues.entries()) {
        if (now - queue.lastActivity > inactiveTime) {
          console.log(`🧹 Limpando guild inativa: ${guildId}`);
          this.resetGuild(guildId);
        }
      }
    }, this.cleanupIntervalMs);
  }
}

const instance = new QueueManager();
module.exports = instance;
module.exports.QueueManager = QueueManager;
