import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from '@discordjs/voice';
import play from 'play-dl';
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

// Хранилища очередей и плееров для серверов
const connections = new Map();
const queues = new Map();
const players = new Map();

client.once('ready', () => {
  console.log(`✅ Бот успешно запущен как ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
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

async function handlePlay(message, args) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ Сначала зайдите в голосовой канал!');
  }

  if (args.length === 0) {
    return message.reply('❌ Укажите название трека или ссылку! Пример: `!play Imagine Dragons - Believer`');
  }

  const query = args.join(' ');
  const statusMsg = await message.channel.send('🔍 Ищу трек...');

  let songInfo = null;

  try {
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
      const info = await play.video_info(query);
      songInfo = {
        title: info.video_details.title,
        url: info.video_details.url,
        duration: formatDuration(info.video_details.durationInSec),
        thumbnail: info.video_details.thumbnails[0]?.url,
      };
    } else if (query.includes('soundcloud.com')) {
      const scInfo = await play.soundcloud(query);
      songInfo = {
        title: scInfo.name,
        url: scInfo.url,
        duration: formatDuration(scInfo.durationInSec),
        thumbnail: scInfo.thumbnail,
      };
    } else {
      // Поиск по названию
      const searched = await play.search(query, { limit: 1 });
      if (!searched || searched.length === 0) {
        return statusMsg.edit('❌ Ничего не найдено!');
      }
      const video = searched[0];
      songInfo = {
        title: video.title,
        url: video.url,
        duration: formatDuration(video.durationInSec),
        thumbnail: video.thumbnails[0]?.url,
      };
    }

    const guildId = message.guild.id;
    if (!queues.has(guildId)) {
      queues.set(guildId, []);
    }
    const queue = queues.get(guildId);
    queue.push({ ...songInfo, requester: message.author.tag });

    // Подключение к каналу
    if (!connections.has(guildId)) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      connections.set(guildId, connection);

      const player = createAudioPlayer();
      players.set(guildId, player);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        const q = queues.get(guildId);
        if (q && q.length > 0) {
          q.shift();
          if (q.length > 0) {
            playNext(guildId, message);
          } else {
            connection.destroy();
            connections.delete(guildId);
            players.delete(guildId);
            queues.delete(guildId);
          }
        }
      });

      player.on('error', (err) => {
        console.error('Audio Player error:', err);
        message.channel.send('❌ Ошибка при воспроизведении аудио.');
      });

      statusMsg.delete().catch(() => {});
      await playNext(guildId, message);
    } else {
      statusMsg.delete().catch(() => {});
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('➕ Добавлено в очередь')
        .setDescription(`**${songInfo.title}**`)
        .addFields(
          { name: '⏱️ Длительность', value: songInfo.duration || 'Неизвестно', inline: true },
          { name: '📝 В очереди', value: `${queue.length}`, inline: true }
        )
        .setThumbnail(songInfo.thumbnail || null);
      message.channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Play error:', err);
    statusMsg.edit(`❌ Не удалось воспроизвести: ${err.message}`);
  }
}

async function playNext(guildId, message) {
  const queue = queues.get(guildId);
  const player = players.get(guildId);
  if (!queue || queue.length === 0 || !player) return;

  const current = queue[0];

  try {
    const stream = await play.stream(current.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });

    resource.volume?.setVolume(0.5);
    player.play(resource);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🎵 Сейчас играет')
      .setDescription(`**${current.title}**`)
      .addFields(
        { name: '⏱️ Длительность', value: current.duration || 'Неизвестно', inline: true },
        { name: '👤 Запросил', value: current.requester, inline: true }
      )
      .setThumbnail(current.thumbnail || null);

    message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Stream error:', error);
    message.channel.send(`❌ Ошибка загрузки трека: ${current.title}`);
    queue.shift();
    if (queue.length > 0) {
      playNext(guildId, message);
    }
  }
}

async function handleStop(message) {
  const guildId = message.guild.id;
  const connection = connections.get(guildId);
  if (!connection) return message.reply('❌ Бот не находится в голосовом канале.');

  const player = players.get(guildId);
  if (player) player.stop();

  connection.destroy();
  connections.delete(guildId);
  players.delete(guildId);
  queues.delete(guildId);

  message.reply('⏹️ Воспроизведение остановлено, бот покинул канал.');
}

async function handleSkip(message) {
  const player = players.get(message.guild.id);
  if (!player) return message.reply('❌ Сейчас ничего не играет!');
  player.stop();
  message.reply('⏭️ Трек пропущен.');
}

async function handleQueue(message) {
  const queue = queues.get(message.guild.id);
  if (!queue || queue.length === 0) return message.reply('❌ Очередь пуста!');

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📜 Очередь треков')
    .setDescription(
      queue
        .map((s, i) => `${i === 0 ? '▶️' : `${i}.`} **${s.title}** (${s.duration || '?'}) — ${s.requester}`)
        .slice(0, 10)
        .join('\n')
    )
    .setFooter({ text: `Всего треков: ${queue.length}` });

  message.channel.send({ embeds: [embed] });
}

async function handlePause(message) {
  const player = players.get(message.guild.id);
  if (!player) return message.reply('❌ Сейчас ничего не играет!');
  player.pause();
  message.reply('⏸️ Пауза.');
}

async function handleResume(message) {
  const player = players.get(message.guild.id);
  if (!player) return message.reply('❌ Сейчас ничего не играет!');
  player.unpause();
  message.reply('▶️ Возобновлено.');
}

async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🎵 Музыкальный бот — Команды')
    .addFields(
      { name: '!play <название / ссылка>', value: 'Включить песню (YouTube, SoundCloud, поиск)' },
      { name: '!stop', value: 'Остановить и выйти' },
      { name: '!skip', value: 'Пропустить трек' },
      { name: '!queue', value: 'Список треков' },
      { name: '!pause / !resume', value: 'Пауза и продолжение' }
    );
  message.channel.send({ embeds: [embed] });
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

client.login(process.env.DISCORD_TOKEN);
