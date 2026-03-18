# tg-collector

Телеграм-бот для сбора сообщений из чатов и отправки их на бэкенд.

Бот только читает сообщения — не пишет в чат и не реагирует на команды.
Данные каждого сообщения (включая медиафайлы) передаются на бэкенд через HTTP POST.

## Установка

```bash
npm install
cp .env.example .env
# заполнить .env своими значениями
```

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `BOT_TOKEN` | ✅ | Токен бота от @BotFather |
| `WEBHOOK_URL` | ✅ | Публичный HTTPS-адрес сервера (без слэша в конце) |
| `BACKEND_ENDPOINT` | ✅ | URL эндпоинта, куда бот шлёт сообщения |
| `WEBHOOK_SECRET` | ✅ | Секрет для проверки подлинности запросов от Telegram |
| `ALLOWED_ADMINS` | ✅ | Список user_id через запятую — кому разрешено добавлять бота в чаты |
| `PORT` | — | Порт Express-сервера (по умолчанию 3000) |

Сгенерировать `WEBHOOK_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Узнать свой `user_id` Telegram — написать боту [@userinfobot](https://t.me/userinfobot).

## Запуск

```bash
node index.js
```

Для продакшна через PM2:
```bash
pm2 start index.js --name tg-collector
pm2 startup && pm2 save
```

## Структура

```
index.js      — Express-сервер, приём webhook от Telegram, подписка на события
bot.js        — инициализация бота, регистрация webhook, контроль доступа в чаты
handlers.js   — парсинг сообщения, скачивание медиафайлов, отправка на бэкенд
```

## Безопасность

Webhook защищён двумя уровнями:
1. **Токен в URL** — адрес webhook содержит `BOT_TOKEN`, посторонний не знает маршрут
2. **WEBHOOK_SECRET** — Telegram добавляет секрет в заголовок `X-Telegram-Bot-Api-Secret-Token`, запросы без корректного заголовка отклоняются с кодом 403

Контроль доступа к чатам:
- Бот отслеживает событие `my_chat_member` — кто добавил бота в группу
- Если пользователь не в списке `ALLOWED_ADMINS` — бот немедленно покидает чат

## Данные сообщения

Бот отправляет на бэкенд следующие поля:

| Поле | Описание |
|---|---|
| `message_id` | ID сообщения внутри чата |
| `chat_id` | Уникальный ID чата |
| `chat_title` | Название группы |
| `chat_type` | `private` / `group` / `supergroup` / `channel` |
| `user_id` | ID отправителя |
| `username` | @username отправителя |
| `first_name` | Имя отправителя |
| `last_name` | Фамилия отправителя |
| `text` | Текст сообщения |
| `caption` | Подпись к медиафайлу |
| `has_media` | `true` если есть вложение |
| `media_type` | `photo` / `video` / `document` / `audio` / `voice` / `sticker` / `animation` |
| `file_id` | ID файла на серверах Telegram |
| `file_mime_type` | MIME-тип файла |
| `file_url` | Ссылка на скачивание файла (действует ~1 час) |
| `file_base64` | Содержимое файла в base64 |
| `is_bot` | `true` если отправитель — бот |
| `reply_to_msg_id` | ID сообщения, на которое ответили |
| `forward_origin` | Объект пересылки (если сообщение переслано) |
| `message_date` | Время отправки (ISO 8601) |

## Подписки на события Telegram

| Событие | Назначение |
|---|---|
| `message` | Сбор входящих сообщений из чатов |
| `my_chat_member` | Контроль кто добавляет бота в группы |
