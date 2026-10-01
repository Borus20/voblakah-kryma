require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const vm = require('vm');

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
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = Date.parse(v + 'T00:00:00Z');
    // Отсекаем несуществующие даты вроде 2027-02-31 (Date их «перекатывает» на март)
    return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

// ==========================================
// 2d. СЕЗОН, ЦЕНЫ, КВАРТИРЫ — из того же config.js, что и сайт
// (единый источник: поменяли цены в config.js — сервер подхватит сам, без перезапуска)
// ==========================================

const SITE_CONFIG_PATH = path.join(FRONTEND_DIR, 'js', 'config.js');
const MIN_NIGHTS = 4;
const DEFAULT_NIGHT_PRICE = 3500; // как в app.js, если месяц не указан в PRICES_BY_MONTH
let siteConfigCache = { mtimeMs: 0, data: null };

function getSiteConfig() {
    try {
        const { mtimeMs } = fs.statSync(SITE_CONFIG_PATH);
        if (!siteConfigCache.data || mtimeMs !== siteConfigCache.mtimeMs) {
            const code = fs.readFileSync(SITE_CONFIG_PATH, 'utf8') +
                '\n;({ apartmentsData, CALENDAR_START_DATE, CALENDAR_END_DATE, PRICES_BY_MONTH })';
            const data = vm.runInNewContext(code, {}, { timeout: 1000 });
            siteConfigCache = { mtimeMs, data };
        }
    } catch (err) {
        // Сломанный config.js не должен ронять брони — работаем на последней удачной версии
        console.error('Ошибка чтения config.js:', err.message);
    }
    return siteConfigCache.data;
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Сегодня по Москве (Крым) в виде YYYY-MM-DD
function todayMsk() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

// Ночи и сумма — ровно как считает сайт: каждая ночь по цене своего месяца
function calcStay(startDate, endDate, pricesByMonth) {
    let nights = 0, total = 0;
    const end = Date.parse(endDate + 'T00:00:00Z');
    for (let t = Date.parse(startDate + 'T00:00:00Z'); t < end; t += 86400000) {
        total += pricesByMonth[new Date(t).getUTCMonth()] || DEFAULT_NIGHT_PRICE;
        nights++;
    }
    return { nights, total };
}

// ==========================================
// 3. БОТ: ОБЩИЕ ФУНКЦИИ (список, кнопки, письма гостям)
// ==========================================

const isAdmin = (chatId) => ADMIN_CHAT_IDS.includes(String(chatId));
// 'YYYY-MM-DD' -> 'DD.MM.YYYY' (строкой, без Date — не зависит от часового пояса)
const fmtDate = (s) => String(s).slice(0, 10).split('-').reverse().join('.');
const rub = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const MENU_PREFIX = 'Выберите действие';

// Кнопки под бронью в зависимости от статуса. inMenu — отдельное меню «Управлять» (у него есть «Скрыть»)
function bookingKeyboard(id, status, inMenu) {
    const rows = [];
    if (status === 'pending') {
        rows.push([
            { text: '✅ Подтвердить', callback_data: `pre_confirm_${id}` },
            { text: '❌ Отменить', callback_data: `pre_cancel_${id}` }
        ]);
    } else if (status === 'confirmed') {
        rows.push([{ text: '❌ Отменить эту бронь', callback_data: `pre_cancel_${id}` }]);
    }
    if (inMenu) rows.push([{ text: '🔙 Скрыть', callback_data: 'close_menu' }]);
    return { inline_keyboard: rows };
}

// Список ПРЕДСТОЯЩИХ броней (прошедшие не показываем). Длинный список делится на несколько сообщений.
async function sendBookingList(chatId) {
    try {
        const [rows] = await pool.execute(
            "SELECT id, apartment_name, start_date, end_date, user_name, phone, email, telegram, status, adults, children, total_price FROM bookings WHERE status IN ('pending', 'confirmed') AND end_date >= ? ORDER BY start_date ASC, id ASC",
            [todayMsk()]
        );

        if (rows.length === 0) {
            return await bot.sendMessage(chatId, "📭 Предстоящих бронирований нет.", { reply_markup: mainKeyboard });
        }

        let confirmedSum = 0, confirmedCount = 0, pendingSum = 0, pendingCount = 0;
        const items = rows.map(row => {
            const price = Number(row.total_price) || 0;
            if (row.status === 'confirmed') { confirmedSum += price; confirmedCount++; }
            else { pendingSum += price; pendingCount++; }
            const icon = row.status === 'confirmed' ? '🟢' : '🟡';
            return {
                button: [{ text: `Управлять #${row.id} (${String(row.user_name).slice(0, 30)})`, callback_data: `manage_${row.id}` }],
                text: `${icon} <b>#${row.id}</b> ${escapeHTML(row.apartment_name)}\n` +
                      `📅 ${fmtDate(row.start_date)} — ${fmtDate(row.end_date)}\n` +
                      `👤 ${escapeHTML(row.user_name)} | 👥 ${row.adults} взр., ${row.children} дет.\n` +
                      `💰 ${rub(price)} руб. (предоплата ${rub(price * 0.2)})\n` +
                      `📞 ${escapeHTML(row.phone)} | 🌐 ${row.telegram ? '@' + escapeHTML(String(row.telegram).replace('@', '')) : 'не указан'}\n` +
                      `📧 ${escapeHTML(row.email) || 'не указан'}\n\n`
            };
        });

        // Telegram не принимает сообщения длиннее 4096 символов — режем на части
        const chunks = [];
        let cur = { text: '📋 <b>Предстоящие брони</b>\n🟢 подтверждена · 🟡 ждёт решения\n\n', keyboard: [] };
        for (const it of items) {
            if (cur.text.length + it.text.length > 3500 || cur.keyboard.length >= 50) {
                chunks.push(cur);
                cur = { text: '', keyboard: [] };
            }
            cur.text += it.text;
            cur.keyboard.push(it.button);
        }
        cur.text += `🟢 Подтверждено: ${confirmedCount} на ${rub(confirmedSum)} руб.\n` +
                    `🟡 Ждут решения: ${pendingCount} на ${rub(pendingSum)} руб.`;
        chunks.push(cur);

        for (const c of chunks) {
            await bot.sendMessage(chatId, c.text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: c.keyboard } });
        }
    } catch (err) {
        console.error("Ошибка в sendBookingList:", err);
        bot.sendMessage(chatId, "❌ Ошибка вывода списка.").catch(() => {});
    }
}

// Письмо гостю о подтверждении/отмене (результат отправки сообщаем админу в бот)
function sendGuestEmail(booking, isConfirm, chatId) {
    const id = booking.id;
    const subject = isConfirm ? `Подтверждение бронирования #${id} — "В облаках Крыма"` : `Отмена бронирования #${id} — "В облаках Крыма"`;
    const total = Math.round(Number(booking.total_price) || 0);
    const prepayment = Math.round(total * 0.2);
    const bookingDetails = `
                    <p><b>Детали брони:</b></p>
                    <ul>
                        <li><b>Объект:</b> ${escapeHTML(booking.apartment_name)}</li>
                        <li><b>Даты:</b> ${fmtDate(booking.start_date)} — ${fmtDate(booking.end_date)}</li>
                        <li><b>Гости:</b> ${booking.adults} взр. + ${booking.children} дет.</li>
                        <li><b>Итоговая сумма:</b> ${total} руб.</li>
                        <li><b>Предоплата (20%):</b> ${prepayment} руб.</li>
                    </ul>`;

    const signature = `<p>С уважением,<br><a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a></p>`;
    const contacts = `<p style="background: #f0f7ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">По всем вопросам звоните или пишите нам: <a href="tel:+79093553729" style="color: #3b82f6; text-decoration: underline;">+7 (909) 355-37-29</a>, <a href="mailto:polinadun@mail.ru" style="color: #3b82f6; text-decoration: underline;">polinadun@mail.ru</a></p>`;

    const mailHtml = isConfirm
        ? `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #2c3e50;">Добрый день, ${escapeHTML(booking.user_name)}!</h2>
                        <p>Рады сообщить, что Ваша бронь <b>#${id}</b> <a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a> успешно подтверждена.</p>
                        <hr style="border: 0; border-top: 1px solid #eee;">
                        ${bookingDetails}
                        <p>С нетерпением ждём Вас в гости по адресу: <a href="https://yandex.ru/maps/?text=Крым,+Кацивели,+Шулейкина,+53" style="color: #2c3e50; text-decoration: underline;"><b>Республика Крым, пгт. Кацивели, ул. Шулейкина, 53</b></a>.</p>
                        ${contacts}
                        ${signature}
                    </div>`
        : `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #2c3e50;">Добрый день, ${escapeHTML(booking.user_name)}.</h2>
                        <p>Ваша бронь <b>#${id}</b> в апартаментах <a href="https://voblakah-kryma.ru" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">"В облаках Крыма"</a> была отменена.</p>
                        <hr style="border: 0; border-top: 1px solid #eee;">
                        ${bookingDetails}
                        ${contacts}
                        ${signature}
                    </div>`;

    transporter.sendMail({
        from: `"В облаках Крыма" <${process.env.SMTP_USER || 'polinadun@mail.ru'}>`,
        to: booking.email,
        subject: subject,
        html: mailHtml
    }).then(() => {
        bot.sendMessage(chatId, `📧 Письмо для #${id} отправлено гостю на ${booking.email}`).catch(() => {});
        console.log(`Письмо для #${id} отправлено`);
    }).catch(err => {
        bot.sendMessage(chatId, `❌ Не удалось отправить письмо гостю (#${id}): ${err.message}`).catch(() => {});
        console.error("Ошибка при отправке письма:", err);
    });
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

    // Квартира, сезон, минимум ночей и цена — проверяем на сервере, браузеру не доверяем
    const cfg = getSiteConfig();
    if (!cfg) {
        return res.status(500).json({ error: 'Бронирование временно недоступно. Свяжитесь с нами напрямую.' });
    }
    const apartmentId = String(req.body.apartmentId);
    const apartment = Object.prototype.hasOwnProperty.call(cfg.apartmentsData, apartmentId) ? cfg.apartmentsData[apartmentId] : null;
    if (!apartment) {
        return res.status(400).json({ error: 'Квартира не найдена.' });
    }
    const seasonStart = ymd(cfg.CALENDAR_START_DATE);
    const seasonEnd = ymd(cfg.CALENDAR_END_DATE);
    if (startDate < seasonStart || endDate > seasonEnd || startDate < todayMsk()) {
        return res.status(400).json({ error: `Бронирование доступно на даты с ${seasonStart.split('-').reverse().join('.')} по ${seasonEnd.split('-').reverse().join('.')}.` });
    }
    const stay = calcStay(startDate, endDate, cfg.PRICES_BY_MONTH);
    if (stay.nights < MIN_NIGHTS) {
        return res.status(400).json({ error: `Минимальный срок бронирования — ${MIN_NIGHTS} ночи.` });
    }
    if (stay.total !== priceNum) {
        console.warn(`Цена с сайта (${priceNum}) не совпала с расчётом сервера (${stay.total}) для ${apartmentId} ${startDate}—${endDate}`);
    }
    const serverPrice = stay.total;
    const serverAptName = apartment.name;

    let result, conn;
    const lockName = 'voblakah_booking_' + apartmentId;
    try {
        conn = await pool.getConnection();
        // Блокировка на квартиру: две одновременные заявки на одни даты не пройдут обе
        const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS ok', [lockName]);
        if (!lock || lock.ok !== 1) throw new Error('Не удалось получить блокировку брони');
        const [clash] = await conn.execute(
            "SELECT id FROM bookings WHERE apartment_id = ? AND status IN ('pending', 'confirmed') AND start_date < ? AND end_date > ? LIMIT 1",
            [apartmentId, endDate, startDate]
        );
        if (clash.length > 0) {
            return res.status(409).json({ error: 'К сожалению, эти даты уже заняты. Выберите, пожалуйста, другие даты.' });
        }
        [result] = await conn.execute(
            "INSERT INTO bookings (apartment_id, apartment_name, start_date, end_date, user_name, phone, telegram, message, status, adults, children, total_price, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
            [apartmentId, serverAptName, startDate, endDate, name, phone, telegram ?? null, message ?? null, adultsNum, childrenNum, serverPrice, email ?? null]
        );
    } catch (err) {
        console.error("Ошибка при бронировании:", err);
        return res.status(500).json({ error: 'Booking failed' });
    } finally {
        if (conn) {
            await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
            conn.release();
        }
    }

    try {
        const bookingId = result.insertId;
        const totalPrice = serverPrice;
        const prepayment = Math.round(totalPrice * 0.2);

        const text = `🔔 <b>Новая БРОНЬ! #${bookingId}</b>\n\n` +
                     `🏠 <b>Квартира:</b> ${escapeHTML(serverAptName)}\n` +
                     `📅 <b>Даты:</b> ${fmtDate(startDate)} — ${fmtDate(endDate)} (${stay.nights} ноч.)\n` +
                     `👥 <b>Гости:</b> ${adultsNum} взр. + ${childrenNum} дет.\n` +
                     `💰 <b>Сумма:</b> ${totalPrice} руб.\n` +
                     `💳 <b>ПРЕДОПЛАТА (20%): ${prepayment} руб.</b>\n\n` +
                     `👤 <b>Имя:</b> ${escapeHTML(name)}\n` +
                     `📧 <b>Email:</b> ${escapeHTML(email)}\n` +
                     `📞 <b>Телефон:</b> ${escapeHTML(phone)}\n` +
                     `🌐 <b>TG:</b> ${telegram ? '@' + escapeHTML(telegram.replace('@', '')) : 'Не указан'}\n` +
                     `💬 <b>Комментарий:</b> ${escapeHTML(message) || '-'}`;

        const keyboard = bookingKeyboard(bookingId, 'pending', false);
        for (const adminId of ADMIN_CHAT_IDS) {
            await bot.sendMessage(adminId, text, { parse_mode: 'HTML', reply_markup: keyboard });
        }
    } catch (err) {
        // Бронь уже сохранена в БД (видна в /menu бота) — гостю отвечаем успехом
        console.error("Ошибка отправки уведомления о брони:", err && err.message ? err.message : err);
    }
    res.json({ success: true, totalPrice: serverPrice });
});

// ==========================================
// 5. ЛОГИКА TELEGRAM БОТА
// ==========================================

bot.on('message', async (msg) => {
    try {
        const chatId = String(msg.chat.id);
        const text = msg.text || '';

        if (!isAdmin(chatId)) {
            // Посторонним в личке — коротко, куда идти за бронью
            if (msg.chat.type === 'private') {
                await bot.sendMessage(chatId, 'Здравствуйте! Это служебный бот гостевого дома «В облаках Крыма». Забронировать квартиру и задать вопрос можно на сайте: https://voblakah-kryma.ru');
            }
            return;
        }

        if (text.startsWith('/start')) {
            await bot.sendMessage(chatId, 'Здравствуйте! Сюда приходят заявки с сайта. Кнопка «📋 Список броней» внизу покажет предстоящие брони.', { reply_markup: mainKeyboard });
            return sendBookingList(chatId);
        }
        if (text.startsWith('/menu') || text === '📋 Список броней') {
            return sendBookingList(chatId);
        }
    } catch (err) {
        console.error('[bot message]', err && err.message ? err.message : err);
    }
});

// ОБРАБОТКА КНОПОК
// Схема: «Подтвердить/Отменить» → «Да, подтвердить/Да, отменить» или «Назад» → смена статуса.
// Кнопки есть в уведомлении о новой брони и в меню «Управлять #…» из списка.
bot.on('callback_query', async (query) => {
    let answered = false;
    const answer = (opts) => {
        if (answered) return Promise.resolve();
        answered = true;
        return bot.answerCallbackQuery(query.id, opts).catch(() => {});
    };
    // Ошибки Telegram при правке сообщений (двойной клик, сообщение уже удалено) не должны ронять процесс
    const safe = (p) => p.catch(err => {
        const m = err && err.message ? err.message : String(err);
        if (!/message is not modified|message to delete not found|message to edit not found/.test(m)) console.error('[bot]', m);
    });

    try {
        const msg = query.message;
        if (!msg || !isAdmin(msg.chat.id)) return await answer();
        const data = query.data || '';
        const chatId = msg.chat.id;
        const messageId = msg.message_id;
        const where = { chat_id: chatId, message_id: messageId };
        const inMenu = (msg.text || '').startsWith(MENU_PREFIX);

        if (data === 'close_menu') {
            await answer();
            return await safe(bot.deleteMessage(chatId, messageId));
        }

        const m = data.match(/^(manage|pre_confirm|pre_cancel|back|do_confirm|do_cancel)_(\d+)$/);
        if (!m) return await answer();
        const kind = m[1];
        const id = Number(m[2]);

        const [rows] = await pool.execute("SELECT * FROM bookings WHERE id = ?", [id]);
        const booking = rows[0];
        if (!booking) return await answer({ text: 'Бронь не найдена в базе', show_alert: true });
        const status = booking.status;

        // Уже отменена — убираем кнопки (уведомление с данными гостя НЕ удаляем)
        if (status === 'cancelled') {
            await answer({ text: `⚠️ Бронь #${id} уже отменена`, show_alert: true });
            if (kind === 'manage') {
                const kb = ((msg.reply_markup && msg.reply_markup.inline_keyboard) || []).filter(r => r[0].callback_data !== data);
                return await safe(bot.editMessageReplyMarkup({ inline_keyboard: kb }, where));
            }
            if (inMenu) return await safe(bot.deleteMessage(chatId, messageId));
            return await safe(bot.editMessageReplyMarkup({ inline_keyboard: [] }, where));
        }

        // A. «Управлять #…» из списка — отдельное меню действий
        if (kind === 'manage') {
            await answer();
            return await bot.sendMessage(chatId,
                `${MENU_PREFIX} для брони #${id} (${booking.user_name}, ${fmtDate(booking.start_date)} — ${fmtDate(booking.end_date)}):`,
                { reply_markup: bookingKeyboard(id, status, true) });
        }

        // B. Первое нажатие — просим подтвердить действие
        if (kind === 'pre_confirm' || kind === 'pre_cancel') {
            const action = kind === 'pre_confirm' ? 'confirm' : 'cancel';
            if (action === 'confirm' && status !== 'pending') {
                await answer({ text: `Бронь #${id} уже подтверждена`, show_alert: true });
                return await safe(bot.editMessageReplyMarkup(bookingKeyboard(id, status, inMenu), where));
            }
            await answer();
            return await safe(bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [{ text: action === 'confirm' ? '✅ Да, подтвердить' : '❌ Да, отменить', callback_data: `do_${action}_${id}` }],
                    [{ text: '🔙 Назад', callback_data: `back_${id}` }]
                ]
            }, where));
        }

        // C. «Назад» — кнопки по текущему статусу
        if (kind === 'back') {
            await answer();
            return await safe(bot.editMessageReplyMarkup(bookingKeyboard(id, status, inMenu), where));
        }

        // D. Финальное действие
        const action = kind === 'do_confirm' ? 'confirm' : 'cancel';
        const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
        const allowedFrom = action === 'confirm' ? ['pending'] : ['pending', 'confirmed'];
        if (!allowedFrom.includes(status)) {
            await answer({ text: `Бронь #${id} уже подтверждена`, show_alert: true });
            return await safe(bot.editMessageReplyMarkup(bookingKeyboard(id, status, inMenu), where));
        }
        if (action === 'confirm') {
            const [clash] = await pool.execute(
                "SELECT id FROM bookings WHERE apartment_id = ? AND status = 'confirmed' AND id <> ? AND start_date < ? AND end_date > ? LIMIT 1",
                [booking.apartment_id, id, booking.end_date, booking.start_date]
            );
            if (clash.length > 0) {
                return await answer({ text: `Нельзя подтвердить: даты пересекаются с подтверждённой бронью #${clash[0].id}`, show_alert: true });
            }
        }

        // Меняем статус, только если его никто не успел изменить (два админа жмут одновременно)
        const [upd] = await pool.execute(
            `UPDATE bookings SET status = ? WHERE id = ? AND status IN (${allowedFrom.map(() => '?').join(', ')})`,
            [newStatus, id, ...allowedFrom]
        );
        if (upd.affectedRows === 0) {
            return await answer({ text: 'Статус брони уже изменён. Обновите список.', show_alert: true });
        }

        const resultText = action === 'confirm' ? '✅ Бронь ПОДТВЕРЖДЕНА' : '❌ Бронь ОТМЕНЕНА';
        await answer({ text: resultText });

        // Меню «Управлять» убираем, а уведомление с данными гостя оставляем — только обновляем кнопки
        if (inMenu) await safe(bot.deleteMessage(chatId, messageId));
        else await safe(bot.editMessageReplyMarkup(bookingKeyboard(id, newStatus, false), where));

        await bot.sendMessage(chatId, `Статус заявки #${id} изменён: ${resultText}`);

        // Остальным админам — чтобы не жали кнопки по уже решённой брони
        const who = [query.from.first_name, query.from.last_name].filter(Boolean).join(' ') || 'Администратор';
        for (const adminId of ADMIN_CHAT_IDS) {
            if (adminId === String(chatId)) continue;
            bot.sendMessage(adminId, `ℹ️ ${who}: бронь #${id} (${booking.user_name}, ${fmtDate(booking.start_date)} — ${fmtDate(booking.end_date)}) — ${resultText}`).catch(() => {});
        }

        await sendBookingList(chatId);

        if (booking.email) sendGuestEmail(booking, action === 'confirm', chatId);
    } catch (err) {
        console.error('[callback_query]', err);
        await answer({ text: 'Произошла ошибка, попробуйте ещё раз.', show_alert: true });
    } finally {
        await answer();
    }
});

// ==========================================
// 6. ЗАПУСК
// ==========================================

app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, '127.0.0.1', async () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    try {
        await bot.setWebHook(`${PUBLIC_URL}/api/tg/${WEBHOOK_SECRET}`);
        const info = await bot.getWebHookInfo();
        console.log(`📡 Webhook установлен: ${info.url}`);
    } catch (err) {
        console.error('❌ Ошибка установки webhook:', err && err.message ? err.message : err);
    }
});
