// URL нашего бэкенда, куда будем отправлять данные каждого сообщения.
// Берётся из переменных окружения (.env)
const BACKEND_ENDPOINT = process.env.BACKEND_ENDPOINT;

// Главный обработчик входящего сообщения.
// Вызывается из index.js через bot.on('message', handleMessage)
// каждый раз, когда в чат приходит новое сообщение
export async function handleMessage(msg) {

  // Собираем из сырого объекта Telegram только нужные нам поля
  const payload = buildPayload(msg);

  // Выводим payload в консоль — удобно для отладки
  console.log('📨 Incoming message:', JSON.stringify(payload, null, 2));

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

// Собирает из сырого объекта Telegram (msg) плоский объект с нужными полями.
// Telegram присылает вложенную структуру — здесь мы её разворачиваем
// в удобный формат для передачи на бэкенд и записи в БД
function buildPayload(msg) {
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
    is_bot:          from?.is_bot || false,   // сообщение от другого бота?
    reply_to_msg_id: msg.reply_to_message?.message_id || null, // ID сообщения, на которое ответили
    forward_origin:  forwardOrigin,           // объект пересылки или null
    message_date:    new Date(date * 1000).toISOString(), // время отправки (Telegram даёт Unix timestamp в секундах)
  };
}
