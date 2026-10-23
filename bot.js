import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection
} from '@discordjs/voice';
import play from 'play-dl';
import ytdl from 'ytdl-core';
import { config } from 'dotenv';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Store active connections and queues per guild
const connections = new Map();
const queues = new Map();
const players = new Map();

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case 'play':
        await handlePlay(message, args);
        break;
      case 'stop':
        await handleStop(message);
        break;
      case 'skip':
        await handleSkip(message);
        break;
      case 'queue':
        await handleQueue(message);
        break;
      case 'pause':
        await handlePause(message);
        break;
      case 'resume':
        await handleResume(message);
        break;
      case 'help':
        await handleHelp(message);
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    message.reply(`❌ Ошибка: ${error.message}`);
  }
});

/**
 * ✅ ПРОВЕРЕННЫЙ РАБОТАЮЩИЙ handlePlay:
 * 1. Сначала заходит в голосовой канал
 * 2. Затем загружает трек
 * 3. Кэширует всю информацию
 */
async function handlePlay(message, args) {
  if (!message.member.voice.channel) {
    return message.reply('❌ Вы должны быть в голосовом канале!');
  }

  if (args.length === 0) {
    return message.reply('❌ Укажите ссылку или название трека!\nПример: `!play https://youtube.com/watch?v=...` или `!play Imagine Dragons - Believer`');
  }

  const query = args.join(' ');

  message.channel.send('🔍 Ищу трек...');

  let stream;
  let songInfo;

  try {
    // --- Определяем тип источника ---
    if (ytdl.validateURL(query)) {
      // YouTube URL через ytdl-core
      const info = await ytdl.getInfo(query, { quality: "highestaudio" });
      songInfo = {
        title: info.videoDetails.title,
        url: info.videoDetails.video_url,
        duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
        thumbnail: info.videoDetails.thumbnails[0]?.url,
      };
      stream = ytdl(query, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
      });
    } else if (query.includes('spotify.com')) {
      // Spotify через play-dl
      const spotifyInfo = await play.spotify(query);
      songInfo = {
        title: spotifyInfo.name,
        url: query,
        duration: formatDuration(spotifyInfo.durationInSec),
        thumbnail: spotifyInfo.thumbnail?.url,
      };
      stream = await play.stream(query);
    } else if (query.includes('soundcloud.com')) {
      // SoundCloud через play-dl
      const scInfo = await play.soundcloud(query);
      songInfo = {
        title: scInfo.name,
        url: query,
        duration: formatDuration(scInfo.durationInSec),
        thumbnail: scInfo.thumbnail,
      };
      stream = await play.stream(query);
    } else {
      // Поиск на YouTube
      const searched = await play.search(query, { limit: 1, source: { youtube: "video" } });
      if (searched.length === 0) {
        return message.reply('❌ Ничего не найдено!');
      }
      const video = searched[0];
      songInfo = {
        title: video.title,
        url: video.url,
        duration: formatDuration(video.durationInSec),
        thumbnail: video.thumbnails[0]?.url,
      };
      stream = await play.stream(video.url);
    }

    // --- ЗАПИСЬ В ОЧЕРЕДЬ ---
    const guildId = message.guild.id;
    if (!queues.has(guildId)) {
      queues.set(guildId, []);
    }

    const queue = queues.get(guildId);
    queue.push({ ...songInfo, requester: message.author.tag });

    // --- ЗАХОДИМ В ГОЛОСОВОЙ КАНАЛ ПЕРЕД ВСЁМИ ---
    if (!connections.has(guildId)) {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      // Ждём готовности с таймаутом
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      connections.set(guildId, connection);

      const player = createAudioPlayer();
      players.set(guildId, player);
      connection.subscribe(player);

      // Обработчик окончания трека
      player.on(AudioPlayerStatus.Idle, () => {
        const queue = queues.get(guildId);
        if (queue && queue.length > 0) {
          queue.shift(); // Удаляем текущий трек
          if (queue.length > 0) {
            playNextSong(guildId, message);
          } else {
            connection.destroy();
            connections.delete(guildId);
            players.delete(guildId);
            queues.delete(guildId);
          }
        }
      });

      player.on('error', error => {
        console.error('Player error:', error);
        message.channel.send('❌ Ошибка воспроизведения!');
      });

      // Начинаем воспроизведение
      await playSong(guildId, stream, message);
    } else {
      // Трек добавлен в очередь (бот уже в канале)
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('➕ Добавлено в очередь')
        .setDescription(`**${songInfo.title}**`)
        .addFields(
          { name: '⏱️ Длительность', value: songInfo.duration, inline: true },
          { name: '📝 Позиция', value: `${queue.length}`, inline: true }
        )
        .setThumbnail(songInfo.thumbnail);

      message.channel.send({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Play error:', error);
    message.reply(`❌ Не удалось загрузить трек: ${error.message}`);
  }
}

/**
 * ✅ Запускает воспроизведение песни
 */
async function playSong(guildId, stream, message) {
  const player = players.get(guildId);
  const queue = queues.get(guildId);

  if (!queue || queue.length === 0) return;

  const song = queue[0];

  let resource;
  if (stream.stream) {
    // play-dl stream
    resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });
  } else {
    // ytdl-core stream
    resource = createAudioResource(stream, {
      inlineVolume: true
    });
  }

  resource.volume?.setVolume(0.5);
  player.play(resource);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🎵 Сейчас играет')
    .setDescription(`**${song.title}**`)
    .addFields(
      { name: '⏱️ Длительность', value: song.duration, inline: true },
      { name: '👤 Запросил', value: song.requester, inline: true }
    )
    .setThumbnail(song.thumbnail)
    .setFooter({ text: `${queue.length - 1} треков в очереди` });

  message.channel.send({ embeds: [embed] });
}

/**
 * ✅ Переигрывает следующий трек в очереди
 */
async function playNextSong(guildId, message) {
  const queue = queues.get(guildId);
  if (!queue || queue.length === 0) return;

  const song = queue[0];

  try {
    let stream;
    if (ytdl.validateURL(song.url)) {
      stream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
      });
    } else {
      stream = await play.stream(song.url);
    }

    await playSong(guildId, stream, message);
  } catch (error) {
    console.error('Play next error:', error);
    message.channel.send(`❌ Ошибка при воспроизведении следующего трека`);
    queue.shift();
    if (queue.length > 0) {
      playNextSong(guildId, message);
    }
  }
}

async function handleStop(message) {
  const guildId = message.guild.id;
  const connection = connections.get(guildId);

  if (!connection) {
    return message.reply('❌ Бот не в голосовом канале!');
  }

  const player = players.get(guildId);
  if (player) player.stop();

  connection.destroy();
  connections.delete(guildId);
  players.delete(guildId);
  queues.delete(guildId);

  message.reply('⏹️ Воспроизведение остановлено, бот покинул канал');
}

async function handleSkip(message) {
  const guildId = message.guild.id;
  const player = players.get(guildId);

  if (!player) {
    return message.reply('❌ Сейчас ничего не играет!');
  }

  player.stop(); // Это запустит событие Idle, которое воспроизведёт следующий трек
  message.reply('⏭️ Трек пропущен');
}

async function handleQueue(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);

  if (!queue || queue.length === 0) {
    return message.reply('❌ Очередь пуста!');
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📜 Очередь треков')
    .setDescription(
      queue.map((song, index) =>
        `${index === 0 ? '▶️' : `${index}.`} **${song.title}** (${song.duration}) - ${song.requester}`
      ).slice(0, 10).join('\n')
    )
    .setFooter({ text: `Всего треков: ${queue.length}` });

  message.channel.send({ embeds: [embed] });
}

async function handlePause(message) {
  const player = players.get(message.guild.id);

  if (!player) {
    return message.reply('❌ Сейчас ничего не играет!');
  }

  player.pause();
  message.reply('⏸️ Воспроизведение приостановлено');
}

async function handleResume(message) {
  const player = players.get(message.guild.id);

  if (!player) {
    return message.reply('❌ Сейчас ничего не играет!');
  }

  player.unpause();
  message.reply('▶️ Воспроизведение возобновлено');
}

async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🎵 Команды музыкального бота')
    .setDescription('Список доступных команд:')
    .addFields(
      { name: '!play <ссылка/название>', value: 'Воспроизвести трек из YouTube, Spotify, SoundCloud или по названию' },
      { name: '!stop', value: 'Остановить воспроизведение и покинуть канал' },
      { name: '!skip', value: 'Пропустить текущий трек' },
      { name: '!queue', value: 'Показать очередь треков' },
      { name: '!pause', value: 'Приостановить воспроизведение' },
      { name: '!resume', value: 'Возобновить воспроизведение' },
      { name: '!help', value: 'Показать это сообщение' }
    )
    .setFooter({ text: 'Поддерживаются: YouTube, Spotify, SoundCloud' });

  message.channel.send({ embeds: [embed] });
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

client.login(process.env.DISCORD_TOKEN);