require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ==========================================
// 1. КОНФИГУРАЦИЯ (из .env)
// ==========================================

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Массив ID администраторов (в .env через запятую)
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const FRONTEND_DIR = process.env.FRONTEND_DIR || '/var/www/voblakah-kryma/frontend';

// Проверка обязательных переменных окружения
for (const [k, v] of Object.entries({
    DB_USER: DB_CONFIG.user, DB_PASSWORD: DB_CONFIG.password, DB_NAME: DB_CONFIG.database,
    TELEGRAM_TOKEN, PUBLIC_URL, WEBHOOK_SECRET
})) {
    if (!v) { console.error(`❌ Не задана переменная окружения: ${k}. Проверьте .env`); process.exit(1); }
}

const app = express();

// ==========================================
// 2. НАСТРОЙКА СЕРВЕРА
// ==========================================

app.set('trust proxy', 1); // за nginx — чтобы rate-limit видел реальный IP
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(FRONTEND_DIR));

// Ограничитель для публичных форм: не более 5 запросов за 10 минут с IP
const publicLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

const pool = mysql.createPool(DB_CONFIG);

// Бот в режиме webhook (без polling) — стабильно для РФ-хостинга
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

bot.setMyCommands([
    { command: '/menu', description: '📋 Список активных броней' }
]).catch(err => console.error("Ошибка установки команд бота:", err));

bot.on('webhook_error', (err) => {
    console.error('[webhook_error]', err && err.message ? err.message : err);
});

const mainKeyboard = {
    keyboard: [
        [{ text: "📋 Список броней" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

// ==========================================
// 2b. ПРИЁМ ОБНОВЛЕНИЙ TELEGRAM (WEBHOOK)
// ==========================================

app.post(`/api/tg/${WEBHOOK_SECRET}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ==========================================
// 2c. ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
// ==========================================

function isNonEmptyString(v, max) {
    return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}
function isValidEmail(v) {
    return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isValidPhone(v) {
    if (typeof v !== 'string') return false;
    const digits = v.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 && v.length <= 30;
}
function isValidDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}

// ==========================================
// 3. ФУНКЦИЯ ОТПРАВКИ СПИСКА (REUSABLE)
// ==========================================

async function sendBookingList(chatId) {
    try {
        // 1. Добавили email в SELECT
        const [rows] = await pool.execute(
            "SELECT id, apartment_name, start_date, end_date, user_name, phone, email, telegram, status, adults, children, total_price FROM bookings WHERE status IN ('pending', 'confirmed') ORDER BY id ASC"
        );

        if (rows.length === 0) {
            return bot.sendMessage(chatId, "📭 Активных бронирований нет.", { reply_markup: mainKeyboard });
        }

        let response = "📋 <b>Список активных броней:</b>\n\n";
        let grandTotal = 0;
        const inline_keyboard_array = [];

        rows.forEach(row => {
            const start = new Date(row.start_date).toLocaleDateString('ru-RU');
            const end = new Date(row.end_date).toLocaleDateString('ru-RU');
            const icon = row.status === 'confirmed' ? '🟢' : '🟡';
            const price = Number(row.total_price) || 0;
            const prepayment = Math.round(price * 0.2); // Рассчитываем 20%
            grandTotal += price;

            // Формируем текст: добавили 📧 Email и Пр (предоплату)
            response += `${icon} <b>#${row.id}</b> ${escapeHTML(row.apartment_name)}\n` +
                        `👤 ${escapeHTML(row.user_name)} (${start}-${end})\n` +
                        `👥 ${row.adults} взр., ${row.children} дет. | 💰 ${price} руб. (Пр: ${prepayment})\n` +
                        `📧 ${escapeHTML(row.email) || 'Не указан'}\n` +
                        `📞 ${row.phone} | 🌐 ${row.telegram ? '@' + escapeHTML(row.telegram.replace('@', '')) : 'Не указан'}\n\n`;

            inline_keyboard_array.push([{ text: `Управлять #${row.id} (${row.user_name})`, callback_data: `manage_${row.id}` }]);
        });

        response += `\n💰 <b>ОБЩИЙ ЗАРАБОТОК: ${grandTotal} руб.</b>`;

        await bot.sendMessage(chatId, response, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: inline_keyboard_array }
        });

    } catch (err) {
        console.error("Ошибка в sendBookingList:", err);
        bot.sendMessage(chatId, "❌ Ошибка вывода списка.");
    }
}

// ==========================================
// 4. API МЕТОДЫ (ДЛЯ САЙТА)
// ==========================================

app.get('/api/bookings', async (req, res) => {
    try {
        const { apartmentId } = req.query;
        const [rows] = await pool.execute(
            "SELECT start_date, end_date FROM bookings WHERE apartment_id = ? AND status IN ('pending', 'confirmed')",
            [apartmentId]
        );
        res.json(rows);
    } catch (err) {
        console.error("Ошибка БД (bookings):", err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/contact', publicLimiter, async (req, res) => {
    const { name, phone, telegram, message, email } = req.body;

    // Валидация
    if (!isNonEmptyString(name, 100) || !isValidPhone(phone) || !isNonEmptyString(message, 2000)) {
        return res.status(400).json({ error: 'Проверьте правильность заполнения полей.' });
    }
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Некорректный email.' });
    }
    if (telegram && (typeof telegram !== 'string' || telegram.length > 100)) {
        return res.status(400).json({ error: 'Некорректный Telegram.' });
    }

    const text = `📬 <b>Вопрос с сайта (Контакты)</b>\n\n` +
                 `👤 <b>Имя:</b> ${escapeHTML(name)}\n` +
                 `📧 <b>Email:</b> ${escapeHTML(email)}\n` +
                 `📞 <b>Телефон:</b> ${escapeHTML(phone)}\n` +
                 `🌐 <b>TG:</b> ${telegram ? '@' + escapeHTML(telegram.replace('@', '')) : 'Не указан'}\n` +
                 `💬 <b>Сообщение:</b> ${escapeHTML(message)}`;
    try {
        for (const adminId of ADMIN_CHAT_IDS) {
            await bot.sendMessage(adminId, text, { parse_mode: 'HTML' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Telegram error' });
    }
});

app.post('/api/book', publicLimiter, async (req, res) => {
    const { apartmentName, startDate, endDate, name, phone, telegram, message, adults, children, totalPrice, email } = req.body;

    // Валидация
    const adultsNum = Number(adults);
    const childrenNum = Number(children);
    const priceNum = Number(totalPrice);
    if (
        req.body.apartmentId === undefined || req.body.apartmentId === null ||
        !isNonEmptyString(apartmentName, 200) ||
        !isValidDate(startDate) || !isValidDate(endDate) || Date.parse(startDate) >= Date.parse(endDate) ||
        !isNonEmptyString(name, 100) || !isValidPhone(phone) ||
        !Number.isInteger(adultsNum) || adultsNum < 1 || adultsNum > 50 ||
        !Number.isInteger(childrenNum) || childrenNum < 0 || childrenNum > 50 ||
        !Number.isFinite(priceNum) || priceNum < 0
    ) {
        return res.status(400).json({ error: 'Проверьте правильность заполнения формы бронирования.' });
    }
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Некорректный email.' });
    }
    if (message && (typeof message !== 'string' || message.length > 2000)) {
        return res.status(400).json({ error: 'Слишком длинный комментарий.' });
    }
    if (telegram && (typeof telegram !== 'string' || telegram.length > 100)) {
        return res.status(400).json({ error: 'Некорректный Telegram.' });
    }

    try {
        const [result] = await pool.execute(
            "INSERT INTO bookings (apartment_id, apartment_name, start_date, end_date, user_name, phone, telegram, message, status, adults, children, total_price, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
            [req.body.apartmentId, apartmentName, startDate, endDate, name, phone, telegram, message, adults, children, totalPrice, email]
        );
        const bookingId = result.insertId;
        const prepayment = Math.round(totalPrice * 0.2);

        const text = `🔔 <b>Новая БРОНЬ! #${bookingId}</b>\n\n` +
                     `🏠 <b>Квартира:</b> ${escapeHTML(apartmentName)}\n` +
                     `📅 <b>Даты:</b> ${startDate} — ${endDate}\n` +
                     `👥 <b>Гости:</b> ${adults} взр. + ${children} дет.\n` +
                     `💰 <b>Сумма:</b> ${totalPrice} руб.\n` +
                     `💳 <b>ПРЕДОПЛАТА (20%): ${prepayment} руб.</b>\n\n` +
                     `👤 <b>Имя:</b> ${escapeHTML(name)}\n` +
                     `📧 <b>Email:</b> ${escapeHTML(email)}\n` +
                     `📞 <b>Телефон:</b> ${escapeHTML(phone)}\n` +
                     `🌐 <b>TG:</b> ${telegram ? '@' + escapeHTML(telegram.replace('@', '')) : 'Не указан'}\n` +
                     `💬 <b>Комментарий:</b> ${escapeHTML(message) || '-'}`;

        const keyboard = { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `pre_confirm_${result.insertId}` }, { text: '❌ Отменить', callback_data: `pre_cancel_${result.insertId}` }]] };
        for (const adminId of ADMIN_CHAT_IDS) {
            await bot.sendMessage(adminId, text, { parse_mode: 'HTML', reply_markup: keyboard });
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Ошибка при бронировании:", err);
        res.status(500).json({ error: 'Booking failed' });
    }
});

// ==========================================
// 5. ЛОГИКА TELEGRAM БОТА
// ==========================================

bot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    if (!ADMIN_CHAT_IDS.includes(chatId)) return;

    const text = msg.text;

    if (text === '/menu' || text === '📋 Список броней') {
        await sendBookingList(chatId);
    }
});

// ОБРАБОТКА КНОПОК
bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // Закрытие меню
    if (data === 'close_menu') {
        await bot.answerCallbackQuery(query.id);
        return bot.deleteMessage(chatId, messageId);
    }

    const parts = data.split('_');
    const id = parts[parts.length - 1]; // ID брони

    // Проверка статуса в БД
    let currentStatus = null;
    try {
        const [rows] = await pool.execute("SELECT status FROM bookings WHERE id = ?", [id]);
        if (rows.length > 0) {
            currentStatus = rows[0].status;
        } else {
            return bot.answerCallbackQuery(query.id, { text: "Бронь не найдена в БД", show_alert: true });
        }
    } catch (e) {
        console.error(e);
        return;
    }

    // Если уже отменена
    if (currentStatus === 'cancelled') {
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Эта бронь уже отменена!", show_alert: true });

        // Удаляем кнопки у сообщения, на котором нажали, если это список
        if (data.startsWith('manage_')) {
            const currentKeyboard = query.message.reply_markup.inline_keyboard;
            const newKeyboard = currentKeyboard.filter(row => row[0].callback_data !== data);
            return bot.editMessageReplyMarkup({ inline_keyboard: newKeyboard }, { chat_id: chatId, message_id: messageId });
        }

        // Если это само меню управления - удаляем его
        return bot.deleteMessage(chatId, messageId);
    }

    // A. Нажали "Управлять #..." из списка
    if (data.startsWith('manage_')) {
        await bot.answerCallbackQuery(query.id);

        let actionsKeyboard = [];

        if (currentStatus === 'pending') {
            actionsKeyboard = [
                [
                    { text: '✅ Подтвердить', callback_data: `pre_confirm_${id}` },
                    { text: '❌ Отменить', callback_data: `pre_cancel_${id}` }
                ],
                [{ text: '🔙 Скрыть', callback_data: `close_menu` }]
            ];
        } else {
            // Если confirmed
            actionsKeyboard = [
                [{ text: '❌ Отменить эту бронь', callback_data: `pre_cancel_${id}` }],
                [{ text: '🔙 Скрыть', callback_data: `close_menu` }]
            ];
        }

        return bot.sendMessage(chatId, `Выберите действие для брони #${id}:`, {
            reply_markup: { inline_keyboard: actionsKeyboard }
        });
    }

    // B. Предварительное действие
    if (data.startsWith('pre_')) {
        const action = parts[1]; // confirm или cancel
        const confirmText = action === 'confirm' ? '✅ Да, подтвердить' : '❌ Да, отменить';

        bot.editMessageReplyMarkup({
            inline_keyboard: [
                [{ text: confirmText, callback_data: `do_${action}_${id}` }],
                [{ text: '🔙 Назад', callback_data: `back_${id}` }]
            ]
        }, { chat_id: chatId, message_id: messageId });
    }

    // C. Кнопка "Назад"
    if (data.startsWith('back_')) {
        let newKeyboard = [];
        if (currentStatus === 'pending') {
            newKeyboard = [
                [
                    { text: '✅ Подтвердить', callback_data: `pre_confirm_${id}` },
                    { text: '❌ Отменить', callback_data: `pre_cancel_${id}` }
                ],
                [{ text: '🔙 Скрыть', callback_data: `close_menu` }]
            ];
        } else if (currentStatus === 'confirmed') {
            newKeyboard = [
                [{ text: '❌ Отменить эту бронь', callback_data: `pre_cancel_${id}` }],
                [{ text: '🔙 Скрыть', callback_data: `close_menu` }]
            ];
        }
        bot.editMessageReplyMarkup({ inline_keyboard: newKeyboard }, { chat_id: chatId, message_id: messageId });
    }

    // D. Финальное действие
    if (data.startsWith('do_')) {
        const action = parts[1];
        const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
        const resultText = action === 'confirm' ? '✅ Бронь ПОДТВЕРЖДЕНА' : '❌ Бронь ОТМЕНЕНА';

        try {
            // 1. Достаем данные брони, чтобы знать, кому слать письмо
            const [rows] = await pool.execute("SELECT * FROM bookings WHERE id = ?", [id]);
            const booking = rows[0];

            // 2. Обновляем статус в базе
            await pool.execute("UPDATE bookings SET status = ? WHERE id = ?", [newStatus, id]);

            await bot.sendMessage(chatId, `Статус заявки #${id} изменен: ${resultText}`);
            try { await bot.deleteMessage(chatId, messageId); } catch(e) {}
            await sendBookingList(chatId);

            // 3. ОТПРАВКА ПИСЬМА ГОСТЮ
            if (booking && booking.email) {
                const isConfirm = action === 'confirm';
                const subject = isConfirm ? `Подтверждение бронирования #${id} — "В облаках Крыма"` : `Отмена бронирования #${id} — "В облаках Крыма"`;

                // Общие детали для обоих типов писем
                // Расширенные детали для письма
                const prepayment = Math.round(booking.total_price * 0.2);
                const bookingDetails = `
                    <p><b>Детали брони:</b></p>
                    <ul>
                        <li><b>Объект:</b> ${escapeHTML(booking.apartment_name)}</li>
                        <li><b>Даты:</b> ${new Date(booking.start_date).toLocaleDateString('ru-RU')} — ${new Date(booking.end_date).toLocaleDateString('ru-RU')}</li>
                        <li><b>Гости:</b> ${booking.adults} взр. + ${booking.children} дет.</li>
                        <li><b>Итоговая сумма:</b> ${Math.round(booking.total_price)} руб.</li>
                        <li><b>Предоплата (20%):</b> ${prepayment} руб.</li>
                    </ul>`;

                const signature = `<p>С уважением,<br><a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a></p>`;

                const mailHtml = isConfirm
                    ? `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #2c3e50;">Добрый день, ${escapeHTML(booking.user_name)}!</h2>
                        <p>Рады сообщить, что ваша бронь <b>#${id}</b> <a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a> успешно подтверждена.</p>
                        <hr style="border: 0; border-top: 1px solid #eee;">
                        ${bookingDetails}
                        <p>С нетерпением ждём вас в гости по адресу: <a href="https://yandex.ru/maps/?text=Крым,+Кацивели,+Шулейкина,+53" style="color: #2c3e50; text-decoration: underline;"><b>Республика Крым, пгт. Кацивели, ул. Шулейкина, 53</b></a>.</p>
                        <p style="background: #f0f7ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                            По всем вопросам звоните или пишите нам: <a href="tel:+79093553729" style="color: #3b82f6; text-decoration: underline;">+7 (909) 355-37-29</a>, <a href="mailto:polinadun@mail.ru" style="color: #3b82f6; text-decoration: underline;">polinadun@mail.ru</a>
                        </p>
                        ${signature}
                    </div>`
                    : `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #2c3e50;">Добрый день, ${escapeHTML(booking.user_name)}.</h2>
                        <p>Ваша бронь <b>#${id}</b> в апартаментах <a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a> была отменена.</p>
                        <hr style="border: 0; border-top: 1px solid #eee;">
                        ${bookingDetails}
                        <p style="background: #f0f7ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">По всем вопросам звоните или пишите нам: <a href="tel:+79093553729" style="color: #3b82f6; text-decoration: underline;">+7 (909) 355-37-29</a>, <a href="mailto:polinadun@mail.ru" style="color: #3b82f6; text-decoration: underline;">polinadun@mail.ru</a></p>
                        ${signature}
                    </div>`;

                transporter.sendMail({
                    from: '"В облаках Крыма" <polinadun@mail.ru>',
                    to: booking.email,
                    subject: subject,
                    html: mailHtml
                }).then(() => {
                    // Теперь присылает сообщение тебе в бот
                    bot.sendMessage(chatId, `📧 Письмо для #${id} успешно отправлено на ${booking.email}`);
                    console.log(`Письмо для #${id} отправлено`);
                }).catch(err => {
                    // И об ошибке тоже сообщит
                    bot.sendMessage(chatId, `❌ Ошибка при отправке письма гостю (#${id}): ${err.message}`);
                    console.error("Ошибка при отправке письма:", err);
                });
            }

        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, "Ошибка при обновлении базы данных.");
        }
    }

    try {
        await bot.answerCallbackQuery(query.id);
    } catch (e) {}
});

// ==========================================
// 6. ЗАПУСК
// ==========================================

app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    try {
        await bot.setWebHook(`${PUBLIC_URL}/api/tg/${WEBHOOK_SECRET}`);
        const info = await bot.getWebHookInfo();
        console.log(`📡 Webhook установлен: ${info.url}`);
    } catch (err) {
        console.error('❌ Ошибка установки webhook:', err && err.message ? err.message : err);
    }
});
