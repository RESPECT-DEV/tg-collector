import TelegramBot from 'node-telegram-bot-api';

// Создаём экземпляр бота, передавая токен из переменных окружения.
// Второй аргумент не передаём — это отключает polling.
// В режиме webhook бот не опрашивает Telegram сам,
// а пассивно ждёт входящих POST-запросов на наш сервер
export const bot = new TelegramBot(process.env.BOT_TOKEN);

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
    // Указываем только 'message', чтобы получать обычные сообщения из чатов.
    // Остальные типы (callback_query, inline_query и др.) Telegram слать не будет —
    // это снижает лишний трафик и нагрузку на сервер
    allowed_updates: ['message'],

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
