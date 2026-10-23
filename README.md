# Discord Music Bot 🎵

Музыкальный бот для Discord с поддержкой множества источников: YouTube, Spotify, SoundCloud и прямых ссылок.

## Возможности

- ✅ Воспроизведение музыки из YouTube (по ссылке или поиску)
- ✅ Поддержка Spotify треков
- ✅ Поддержка SoundCloud
- ✅ Очередь треков
- ✅ Управление воспроизведением (пауза, пропуск, стоп)
- ✅ Красивые embed-сообщения
- ✅ Автоматическое воспроизведение следующего трека

## Установка

### 1. Установите зависимости

```bash
npm install
```

### 2. Создайте Discord бота

1. Перейдите на https://discord.com/developers/applications
2. Нажмите "New Application"
3. Дайте боту имя и создайте
4. Перейдите в раздел "Bot"
5. Нажмите "Add Bot"
6. Включите следующие Privileged Gateway Intents:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
7. Скопируйте токен бота

### 3. Пригласите бота на сервер

1. Перейдите в раздел "OAuth2" → "URL Generator"
2. Выберите scope: `bot`
3. Выберите права:
   - Send Messages
   - Read Message History
   - Connect
   - Speak
   - Use Voice Activity
4. Скопируйте сгенерированную ссылку и откройте в браузере
5. Выберите сервер и подтвердите

### 4. Настройте переменные окружения

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Откройте `.env` и вставьте токен бота:

```env
DISCORD_TOKEN=ваш_токен_бота
```

### 5. Установите FFmpeg

**Windows:**
- Скачайте с https://www.gyan.dev/ffmpeg/builds/
- Распакуйте и добавьте `bin` папку в PATH

**Linux:**
```bash
sudo apt install ffmpeg
```

**Mac:**
```bash
brew install ffmpeg
```

## Запуск

```bash
npm start
```

Или в режиме разработки с авто-перезагрузкой:

```bash
npm run dev
```

## Команды

- `!play <ссылка или название>` - Воспроизвести трек
  - Примеры:
    - `!play https://youtube.com/watch?v=dQw4w9WgXcQ`
    - `!play https://open.spotify.com/track/...`
    - `!play https://soundcloud.com/...`
    - `!play Imagine Dragons - Believer`

- `!stop` - Остановить воспроизведение и покинуть канал
- `!skip` - Пропустить текущий трек
- `!queue` - Показать очередь треков
- `!pause` - Приостановить воспроизведение
- `!resume` - Возобновить воспроизведение
- `!help` - Показать список команд

## Поддерживаемые источники

1. **YouTube** - прямые ссылки или поиск по названию
2. **Spotify** - ссылки на треки (требуется API ключ для некоторых треков)
3. **SoundCloud** - прямые ссылки на треки
4. **Прямые MP3/аудио ссылки**

## Troubleshooting

### Бот не воспроизводит музыку
- Убедитесь что FFmpeg установлен
- Проверьте что у бота есть права на подключение к голосовому каналу
- Проверьте логи в консоли

### Ошибка "DISCORD_TOKEN is not defined"
- Убедитесь что создан файл `.env` с токеном
- Проверьте что токен скопирован правильно без пробелов

### Spotify треки не воспроизводятся
- Некоторые Spotify треки требуют API ключей
- Добавьте `SPOTIFY_CLIENT_ID` и `SPOTIFY_CLIENT_SECRET` в `.env`
- Получите их на https://developer.spotify.com/dashboard

## Деплой на сервер 24/7

Чтобы бот работал постоянно, можно развернуть его на:

- **VPS** (DigitalOcean, AWS, Timeweb)
- **Heroku** (нужен worker dyno)
- **Railway.app** (бесплатный tier)
- **Render.com**

Пример для Railway:
1. Подключите GitHub репозиторий
2. Добавьте переменную окружения `DISCORD_TOKEN`
3. Railway автоматически запустит бота

## Технологии

- discord.js - Discord API
- @discordjs/voice - Голосовые каналы
- ytdl-core - YouTube загрузка
- play-dl - Spotify, SoundCloud, поиск
- FFmpeg - Аудио обработка

## Лицензия

MIT
