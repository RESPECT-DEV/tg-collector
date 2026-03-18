// URL нашего бэкенда, куда будем отправлять данные каждого сообщения.
// Берётся из переменных окружения (.env)
const BACKEND_ENDPOINT = process.env.BACKEND_ENDPOINT;
const BOT_TOKEN        = process.env.BOT_TOKEN;

// Список user_id пользователей, которым разрешено писать боту в личку.
// Тот же список что и ALLOWED_ADMINS в bot.js — берётся из одной переменной .env.
// Сообщения от остальных пользователей в private-чате игнорируются
const ALLOWED_ADMINS = process.env.ALLOWED_ADMINS
  ? process.env.ALLOWED_ADMINS.split(',').map(Number)
  : [];

// MIME-типы для медиа, которые Telegram не сообщает явно.
// Для document Telegram сам присылает mime_type в объекте вложения —
// остальные типы фиксированы и не меняются
const MIME_TYPE_MAP = {
  photo:     'image/jpeg',
  video:     'video/mp4',
  audio:     'audio/mpeg',
  voice:     'audio/ogg',
  sticker:   'image/webp',
  animation: 'image/gif',
  // document — определяется динамически из msg.document.mime_type
};

// Главный обработчик входящего сообщения.
// Вызывается из index.js через bot.on('message', handleMessage)
// каждый раз, когда в чат приходит новое сообщение
export async function handleMessage(msg) {

  // Фильтр личных сообщений — защита от спама.
  // В групповых чатах бот уже защищён через handleMyChatMember в bot.js:
  // туда попадают только чаты добавленные разрешёнными пользователями.
  // Но в личку боту может написать кто угодно — поэтому фильтруем здесь:
  // если chat_type === 'private' и отправитель не в ALLOWED_ADMINS — игнорируем
  if (msg.chat.type === 'private' && !ALLOWED_ADMINS.includes(msg.from?.id)) {
    console.warn(`⛔ Ignored private message from unauthorized user ${msg.from?.id} (@${msg.from?.username})`);
    return;
  }

  // Собираем из сырого объекта Telegram только нужные нам поля
  const payload = await buildPayload(msg);

  // Выводим payload в консоль — удобно для отладки.
  // file_base64 не логируем — он слишком длинный
  const { file_base64, ...payloadForLog } = payload;
  console.log('📨 Incoming message:', JSON.stringify(payloadForLog, null, 2));
  if (file_base64) console.log('📎 File attached, base64 length:', file_base64.length);

  // Отправляем данные на бэкенд POST-запросом.
  // Бэкенд вызовет plpgsql-функцию, которая запишет сообщение в БД
  try {
    const res = await fetch(BACKEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log('✅ Sent to backend successfully');
    } else {
      // Бэкенд ответил ошибкой — логируем статус и тело ответа
      console.error(`❌ Backend error: ${res.status}`, await res.text());
    }
  } catch (err) {
    // Сетевая ошибка — бэкенд недоступен или упал
    console.error('❌ Failed to send message to backend:', err.message);
  }
}

// Запрашивает у Telegram API информацию о файле по file_id.
// Возвращает объект { file_path } или null если запрос не удался.
// file_path нужен для формирования ссылки на скачивание
async function getFilePath(fileId) {
  try {
    const res  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (data.ok) return data.result.file_path;
    console.error('❌ getFile error:', data.description);
    return null;
  } catch (err) {
    console.error('❌ getFile request failed:', err.message);
    return null;
  }
}

// Скачивает файл по file_path с серверов Telegram.
// Возвращает строку base64 или null если скачивание не удалось.
// Telegram гарантирует что ссылка активна минимум 1 час после вызова getFile
async function downloadFileAsBase64(filePath) {
  try {
    const res    = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.error('❌ File download failed:', err.message);
    return null;
  }
}

// Определяет MIME-тип файла.
// Для document берём mime_type из объекта Telegram — он передаёт его явно.
// Для остальных типов используем фиксированную таблицу MIME_TYPE_MAP
function getMimeType(msg, mediaType) {
  if (mediaType === 'document' && msg.document?.mime_type) {
    return msg.document.mime_type;
  }
  return MIME_TYPE_MAP[mediaType] || null;
}

// Собирает из сырого объекта Telegram (msg) плоский объект с нужными полями.
// Если в сообщении есть медиафайл — дополнительно запрашивает ссылку на скачивание
// и скачивает файл, добавляя его в payload как base64-строку
async function buildPayload(msg) {
  const { message_id, chat, from, text, date } = msg;

  // Определяем тип медиа если есть вложение.
  // Telegram не даёт поле "тип медиа" напрямую — вместо этого
  // в объекте сообщения присутствует поле с названием типа (photo, video и т.д.)
  const mediaType =
    msg.photo     ? 'photo'     :
    msg.video     ? 'video'     :
    msg.document  ? 'document'  :
    msg.audio     ? 'audio'     :
    msg.voice     ? 'voice'     :
    msg.sticker   ? 'sticker'   :
    msg.animation ? 'animation' : null;

  // Извлекаем file_id из вложения — уникальный идентификатор файла на серверах Telegram.
  // По нему потом можно скачать файл через API.
  // Для фото берём последний элемент массива — Telegram присылает несколько
  // размеров одного фото, последний всегда самого высокого качества
  const fileId =
    msg.photo     ? msg.photo[msg.photo.length - 1].file_id :
    msg.video     ? msg.video.file_id     :
    msg.document  ? msg.document.file_id  :
    msg.audio     ? msg.audio.file_id     :
    msg.voice     ? msg.voice.file_id     :
    msg.sticker   ? msg.sticker.file_id   :
    msg.animation ? msg.animation.file_id : null;

  // Подпись к медиафайлу — пользователь может добавить текст при отправке фото/видео/документа.
  // У обычных текстовых сообщений caption отсутствует
  const caption = msg.caption || null;

  // Информация о пересылке сообщения (Bot API 7.0+).
  // Если сообщение переслано из другого чата — здесь будет объект с полем type:
  // 'user' | 'chat' | 'channel' | 'hidden_user'
  // и дополнительными полями в зависимости от источника.
  // Сохраняем объект целиком в JSONB — так проще, чем дробить на отдельные поля
  const forwardOrigin = msg.forward_origin || null;

  // Поля для файла — заполняем только если есть вложение
  let filePath   = null; // путь на серверах Telegram, нужен для формирования ссылки
  let fileUrl    = null; // полная ссылка на скачивание (действует ~1 час после getFile)
  let mimeType   = null; // MIME-тип файла
  let fileBase64 = null; // содержимое файла в base64

  if (fileId) {
    // Запрашиваем file_path у Telegram — без него не получить ссылку и не скачать файл
    filePath = await getFilePath(fileId);

    if (filePath) {
      // Формируем прямую ссылку на скачивание.
      // Ссылка содержит токен бота — не хранить в открытом доступе
      fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

      // Определяем MIME-тип
      mimeType = getMimeType(msg, mediaType);

      // Скачиваем файл и конвертируем в base64 для передачи через JSON
      fileBase64 = await downloadFileAsBase64(filePath);
    }
  }

  return {
    message_id,                               // ID сообщения внутри чата
    chat_id:         chat.id,                 // уникальный числовой ID чата
    chat_title:      chat.title || null,      // название группы (null для личных сообщений)
    chat_type:       chat.type,               // private | group | supergroup | channel
    user_id:         from?.id || null,        // ID отправителя (null если канал)
    username:        from?.username || null,  // @username (необязательное поле у пользователя)
    first_name:      from?.first_name || null,
    last_name:       from?.last_name || null,
    text:            text || null,            // текст сообщения (null если только медиа)
    caption,                                  // подпись к медиафайлу
    has_media:       !!mediaType,             // true если есть вложение
    media_type:      mediaType,               // тип вложения или null
    file_id:         fileId,                  // ID файла на серверах Telegram или null
    file_mime_type:  mimeType,                // MIME-тип файла или null
    file_url:        fileUrl,                 // ссылка на скачивание (действует ~1 час) или null
    file_base64:     fileBase64,              // содержимое файла в base64 или null
    is_bot:          from?.is_bot || false,   // сообщение от другого бота?
    reply_to_msg_id: msg.reply_to_message?.message_id || null, // ID сообщения, на которое ответили
    forward_origin:  forwardOrigin,           // объект пересылки или null
    message_date:    new Date(date * 1000).toISOString(), // время отправки (Telegram даёт Unix timestamp в секундах)
  };
}
