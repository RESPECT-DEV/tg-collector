// Загружаем переменные окружения из файла .env в process.env
// Это должно быть первой строкой, до любых других импортов
import 'dotenv/config';

import express from 'express';

// Импортируем объект бота и функции управления webhook из bot.js
import { bot, registerWebhook, deregisterWebhook } from './bot.js';

// Импортируем обработчик входящих сообщений из handlers.js
import { handleMessage } from './handlers.js';

// Создаём Express-приложение — это HTTP-сервер, который будет принимать
// POST-запросы от Telegram
const app = express();

// Говорим Express автоматически парсить тело запроса как JSON.
// Без этого req.body был бы undefined
app.use(express.json());

// Регистрируем маршрут для приёма webhook-запросов от Telegram.
// Telegram будет слать POST на этот URL каждый раз, когда в чате появится новое сообщение.
// Токен бота в URL — первый уровень защиты: посторонний не знает этот адрес
// и не сможет слать фиктивные запросы.
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {

  // Проверяем secret_token — второй уровень защиты.
  // Telegram добавляет значение WEBHOOK_SECRET в заголовок X-Telegram-Bot-Api-Secret-Token
  // каждого запроса. Если заголовок отсутствует или не совпадает —
  // отклоняем запрос со статусом 403, не обрабатывая его
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.warn('⚠️ Unauthorized webhook request — invalid secret token');
    return res.sendStatus(403);
  }

  // Передаём тело запроса в библиотеку node-telegram-bot-api.
  // Она разберёт объект update и вызовет нужные обработчики событий (bot.on(...))
  bot.processUpdate(req.body);

  // Обязательно отвечаем Telegram статусом 200.
  // Если не ответить или ответить ошибкой — Telegram будет повторно
  // присылать этот же запрос несколько раз
  res.sendStatus(200);
});

// Подписываемся на событие 'message' — оно срабатывает каждый раз,
// когда бот получает новое сообщение из любого чата.
// handleMessage — функция из handlers.js, которая обработает сообщение
bot.on('message', handleMessage);

// Запускаем HTTP-сервер на указанном порту.
// После старта сразу регистрируем webhook в Telegram
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await registerWebhook();
});

// Слушаем системные сигналы завершения процесса:
// SIGINT  — Ctrl+C в терминале
// SIGTERM — команда kill или остановка через PM2/Docker
// В обоих случаях корректно удаляем webhook перед выходом,
// чтобы Telegram не продолжал слать запросы на уже остановленный сервер
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('Shutting down...');
  await deregisterWebhook();
  process.exit(0);
}
