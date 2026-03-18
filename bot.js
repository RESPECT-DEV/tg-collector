import TelegramBot from 'node-telegram-bot-api';

// Создаём экземпляр бота, передавая токен из переменных окружения.
// Второй аргумент не передаём — это отключает polling.
// В режиме webhook бот не опрашивает Telegram сам,
// а пассивно ждёт входящих POST-запросов на наш сервер
export const bot = new TelegramBot(process.env.BOT_TOKEN);

// Список user_id пользователей, которым разрешено добавлять бота в чаты.
// Берётся из ALLOWED_ADMINS в .env — через запятую без пробелов.
// Пример: ALLOWED_ADMINS=257906360,987654321
const ALLOWED_ADMINS = process.env.ALLOWED_ADMINS
  ? process.env.ALLOWED_ADMINS.split(',').map(Number)
  : [];

// Регистрирует webhook в Telegram — говорит Telegram, на какой URL слать обновления.
// Вызывается один раз при старте сервера
export async function registerWebhook() {
  const token = process.env.BOT_TOKEN;

  // URL, на который Telegram будет слать POST-запросы с новыми сообщениями.
  // Формат: https://<наш домен>/webhook/<токен бота>
  const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${token}`;

  // Запрашиваем у Telegram информацию о текущем webhook.
  // Это позволяет не перерегистрировать его каждый раз при перезапуске —
  // если URL уже правильный, просто пропускаем регистрацию
  const current = await bot.getWebHookInfo();
  console.log('Current webhook info:', current);

  if (current.url === webhookUrl) {
    console.log('Webhook already registered, skipping.');
    return;
  }

  // Отправляем запрос в Telegram API: setWebhook.
  // После этого Telegram запомнит наш URL и начнёт слать на него все обновления
  await bot.setWebHook(webhookUrl, {

    // allowed_updates — фильтр типов событий.
    // 'message'        — обычные сообщения из чатов
    // 'my_chat_member' — изменение статуса бота в чате (добавление, удаление и т.д.)
    //                    нужен для отслеживания кто добавил бота в группу
    allowed_updates: ['message', 'my_chat_member'],

    // secret_token — дополнительная защита webhook.
    // Telegram будет добавлять это значение в заголовок
    // X-Telegram-Bot-Api-Secret-Token каждого запроса.
    // В index.js мы проверяем этот заголовок и отклоняем запросы без него —
    // так посторонний не сможет отправить фиктивный update даже зная URL
    secret_token: process.env.WEBHOOK_SECRET,
  });

  // После регистрации ещё раз запрашиваем информацию о webhook
  // и проверяем, что URL действительно установился.
  // Если что-то пошло не так — завершаем процесс с ошибкой
  const info = await bot.getWebHookInfo();
  if (info.url === webhookUrl) {
    console.log(`✅ Webhook registered: ${webhookUrl}`);
  } else {
    console.error('❌ Webhook registration failed:', info);
    process.exit(1);
  }
}

// Удаляет webhook из Telegram.
// Вызывается при корректном завершении процесса (Ctrl+C, kill и др.),
// чтобы Telegram перестал слать запросы на уже остановленный сервер.
// Также полезно при переходе на polling в процессе разработки
export async function deregisterWebhook() {
  await bot.deleteWebHook();
  console.log('Webhook removed.');
}

// Обработчик события my_chat_member — срабатывает когда статус бота в чате меняется.
// Используем для контроля кто добавляет бота в группы:
// если пользователь не в списке ALLOWED_ADMINS — бот сразу покидает чат
export async function handleMyChatMember(update) {

  // Интересует только момент когда бота добавляют в чат —
  // new_chat_member.status становится 'member' или 'administrator'.
  // Игнорируем остальные изменения (бота кикнули, забанили и т.д.)
  const newStatus = update.new_chat_member?.status;
  if (newStatus !== 'member' && newStatus !== 'administrator') return;

  const addedBy = update.from.id;     // user_id того, кто добавил бота
  const chat    = update.chat;        // чат куда добавили

  if (ALLOWED_ADMINS.includes(addedBy)) {
    // Пользователь в белом списке — бот остаётся в чате
    console.log(`✅ Bot added to "${chat.title}" (${chat.id}) by allowed admin ${addedBy}`);
  } else {
    // Пользователь не в белом списке — покидаем чат немедленно
    console.warn(`⛔ Unauthorized add attempt by user ${addedBy} in chat "${chat.title}" (${chat.id}) — leaving`);
    try {
      await bot.leaveChat(chat.id);
      console.log(`👋 Left chat "${chat.title}" (${chat.id})`);
    } catch (err) {
      console.error(`❌ Failed to leave chat ${chat.id}:`, err.message);
    }
  }
}
