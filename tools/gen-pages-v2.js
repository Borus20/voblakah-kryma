#!/usr/bin/env node
// =============================================================
// Отдельные страницы нового дизайна (v2): квартиры /v2/kvartiry/<id>/ и политика /v2/privacy.html.
// Данные — из frontend/js/config.js (как у главной). Общие шапка/подвал — здесь, чтобы страницы не расходились.
// Запуск: node /var/www/voblakah-kryma/tools/gen-pages-v2.js
// =============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONT = path.join(__dirname, '..', 'frontend');
const OUT = path.join(FRONT, 'v2');
const BASE = '/v2';                       // после переключения v2 на главную поменять на ''
const SITE = 'https://voblakah-kryma.ru';
const cfg = vm.runInNewContext(fs.readFileSync(path.join(FRONT, 'js', 'config.js'), 'utf8') +
    '\n;({ apartmentsData, CALENDAR_START_DATE, CALENDAR_END_DATE, PRICES_BY_MONTH })', {});

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (n) => String(n).replace(/^Квартира\s+/, '').replace(/"/g, '');
const full = (n) => `Квартира «${short(n)}»`;
const rub = (n) => Number(n).toLocaleString('ru-RU') + ' ₽';
const ids = Object.keys(cfg.apartmentsData);
const year = cfg.CALENDAR_START_DATE.getFullYear();
const prices = Object.entries(cfg.PRICES_BY_MONTH).map(([m, p]) => ({ m: +m, p })).sort((a, b) => a.m - b.m);
const minPrice = Math.min(...prices.map(x => x.p)), maxPrice = Math.max(...prices.map(x => x.p));
const season = `с ${cfg.CALENDAR_START_DATE.getDate()} ${MONTHS_GEN[cfg.CALENDAR_START_DATE.getMonth()]} по ${cfg.CALENDAR_END_DATE.getDate()} ${MONTHS_GEN[cfg.CALENDAR_END_DATE.getMonth()]}`;
const ICON = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    tg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-1.37.2-1.64l16.4-5.99c.75-.27 1.45.24 1.2 1.12l-2.43 11.4c-.22.99-1.01 1.24-1.74.77l-4.93-3.6-2.4 2.31c-.26.26-.6.39-.94.26z"/></svg>'
};

function head({ title, desc, canonical, extra = '' }) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <!-- Сгенерировано tools/gen-pages-v2.js из js/config.js — правьте генератор/config.js, а не этот файл -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${canonical}">
    <meta name="theme-color" content="#0b1b33">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="preload" href="/v2/fonts/cormorant-cyrillic-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/inter-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/v2/fonts/cormorant.css">
    <link rel="stylesheet" href="/v2/v2.css?v=8">
    <link rel="stylesheet" href="/v2/page.css?v=2">
${extra}</head>
<body class="subpage">`;
}

function header(cta) {
    const nav = [['#about', 'О нас'], ['#apartments', 'Квартиры'], ['#map', 'Карта'], ['#sights', 'Что рядом'], ['#rules', 'Правила'], ['#contact', 'Контакты']];
    return `
<header class="hdr is-solid" id="hdr">
    <a href="${BASE}/" class="hdr-logo" aria-label="В облаках Крыма — на главную">В облаках <em>Крыма</em></a>
    <nav class="hdr-nav" aria-label="Разделы">${nav.map(([h, t]) => `<a href="${BASE}/${h}">${t}</a>`).join('')}</nav>
    <a href="${cta}" class="btn btn--gold hdr-cta">Забронировать</a>
    <button type="button" class="hdr-burger" aria-label="Меню" aria-expanded="false"><span></span><span></span></button>
</header>
<div class="menu" id="menu" hidden>
    <nav>${nav.map(([h, t]) => `<a href="${BASE}/${h}">${t === 'Карта' ? '3D-карта' : t}</a>`).join('')}</nav>
    <div class="menu-contacts"><a href="tel:+79093553729">+7 (909) 355-37-29</a><a href="https://t.me/+79093553729" target="_blank" rel="noopener">Telegram</a></div>
</div>`;
}

function footer() {
    return `
<footer class="ftr">
    <div class="ftr-logo">В облаках <em>Крыма</em></div>
    <p class="ftr-sub">Отдых в Крыму с комфортом</p>
    <p class="ftr-links">${ids.map(id => `<a href="${BASE}/kvartiry/${id}/">${esc(short(cfg.apartmentsData[id].name))}</a>`).join(' · ')}</p>
    <p class="ftr-links"><a href="${BASE}/privacy.html">Политика конфиденциальности</a></p>
    <p class="ftr-copy">© ${year} Квартиры «В облаках Крыма». Все права защищены</p>
</footer>
<div id="cookie-banner" class="cookie" role="region" aria-label="Уведомление о cookie" hidden>
    <p>Мы используем cookie и Яндекс.Метрику, чтобы понимать, как сделать сайт удобнее. <a href="${BASE}/privacy.html" target="_blank">Подробнее</a></p>
    <button type="button" id="cookie-ok">Понятно</button>
</div>
<script src="/v2/page.js?v=2"></script>
</body>
</html>
`;
}

function picture(src, alt, cls, eager) {
    const s = '/' + src.replace(/^\//, '');
    return `<picture><source type="image/webp" srcset="${s}.w1280.webp 1280w, ${s}.webp 2560w" sizes="(max-width: 1100px) 100vw, 1100px">` +
        `<img src="${s}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture>`;
}

function apartmentPage(id) {
    const a = cfg.apartmentsData[id];
    const name = full(a.name);
    const area = (a.description.match(/(\d+)\s*м²/) || [])[1];
    const url = `${SITE}${BASE}/kvartiry/${id}/`;
    const book = `${BASE}/#apartment-${id}`;
    const others = ids.filter(x => x !== id);
    const ld = {
        '@context': 'https://schema.org', '@type': 'Apartment', name: `${name} — В облаках Крыма`, description: a.description, url,
        image: a.photos.slice(0, 5).map(p => `${SITE}/${p}`),
        ...(area ? { floorSize: { '@type': 'QuantitativeValue', value: +area, unitCode: 'MTK' } } : {}),
        address: { '@type': 'PostalAddress', streetAddress: 'ул. Академика Шулейкина, 53', addressLocality: 'пгт Кацивели', addressRegion: 'Республика Крым', addressCountry: 'RU' },
        offers: { '@type': 'AggregateOffer', priceCurrency: 'RUB', lowPrice: minPrice, highPrice: maxPrice, url: `${SITE}${book}` }
    };
    return head({
        title: `${name} в Кацивели — от ${rub(minPrice)} за сутки | В облаках Крыма`,
        desc: `${a.description.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.')} Кацивели, Большая Ялта.`,
        canonical: url,
        extra: `    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n`
    }) + header(book) + `
<main class="ap">
    <section class="ap-gallery" data-gallery>
        <div class="gal-main">
            ${a.photos.map((p, i) => i === 0
                ? `<img src="/${p}.webp" alt="${esc(name)} — фото 1" class="is-on" fetchpriority="high" decoding="async">`
                : `<img data-src="/${p}.webp" alt="${esc(name)} — фото ${i + 1}" decoding="async">`).join('\n            ')}
            <div class="gal-arrows">
                <button type="button" class="ico-btn ico-btn--glass" data-step="-1" aria-label="Предыдущее фото">${ICON.left}</button>
                <button type="button" class="ico-btn ico-btn--glass" data-step="1" aria-label="Следующее фото">${ICON.right}</button>
            </div>
            <span class="gal-count">1 / ${a.photos.length}</span>
        </div>
        <div class="gal-thumbs">${a.photos.map((p, i) => `<button type="button" data-i="${i}"${i === 0 ? ' class="is-on"' : ''} aria-label="Фото ${i + 1}"><img src="/${p}.t320.webp" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
    </section>

    <section class="ap-intro">
        <div class="ap-intro-main">
            <a class="ap-back" href="${BASE}/#apartments">← Все квартиры</a>
            <p class="kicker">Квартира в Кацивели</p>
            <h1 class="h2">${esc(short(a.name))}</h1>
            <p class="ap-lead">${esc(a.description)}</p>
            <ul class="ap-facts">
                ${area ? `<li><b>${area} м²</b><span>площадь</span></li>` : ''}
                <li><b>Отдельный</b><span>вход</span></li>
                <li><b>от ${rub(minPrice)}</b><span>за сутки</span></li>
                <li><b>от 7 ночей</b><span>срок брони</span></li>
            </ul>
        </div>
        <aside class="ap-card">
            <h2>Цены на сезон ${year}</h2>
            <p class="ap-card-sub">Сезон ${season}. Цена за всю квартиру.</p>
            <div class="ap-prices">${prices.map(x => `<div><span>${MONTHS[x.m][0].toUpperCase() + MONTHS[x.m].slice(1)}</span><b>${rub(x.p)}</b></div>`).join('')}</div>
            <a class="btn btn--gold btn--wide" href="${book}">Выбрать даты и забронировать</a>
            <a class="btn btn--outline btn--wide" href="tel:+79093553729">Позвонить: +7 (909) 355-37-29</a>
        </aside>
    </section>

    <section class="ap-section">
        <div class="ap-cols">
            <div>
                <p class="kicker">Условия</p>
                <h2 class="h2 h2--sm">Перед поездкой</h2>
                <ul class="ap-rules">
                    <li><b>Заезд и выезд</b>Заселение после 14:00, выезд — до 12:00.</li>
                    <li><b>Предоплата 20%</b>Вносится после того, как мы с Вами свяжемся. Полный расчёт — по приезде до заселения.</li>
                    <li><b>Отмена</b>Возврат предоплаты возможен при отмене не позднее, чем за 14 дней до заезда.</li>
                    <li><b>Документы</b>При необходимости предоставляем комплект отчётных документов.</li>
                    <li><b>Питомцы</b>Мы не принимаем гостей с домашними животными.</li>
                </ul>
                <a class="ap-link" href="${BASE}/#rules">Все правила проживания →</a>
            </div>
            <div>
                <p class="kicker">Где мы</p>
                <h2 class="h2 h2--sm">Кацивели, Южный берег</h2>
                <p class="ap-text">Небольшой дом среди можжевельников, где горный воздух встречается с морским бризом. На территории — парковка и мангальная зона. До Ялты — 18 км, до аквапарка Симеиз — полтора километра; рядом Воронцовский и Ливадийский дворцы, Ласточкино гнездо, скала Дива.</p>
                <p class="ap-addr">Республика Крым, городской округ Ялта, пгт. Кацивели, ул. Академика Шулейкина, д. 53</p>
                <div class="ap-actions">
                    <a class="btn btn--dark" href="${BASE}/#map">Побережье в 3D</a>
                    <a class="btn btn--outline" href="https://yandex.ru/maps/?pt=33.969208,44.396062&z=16&l=map" target="_blank" rel="noopener">Яндекс Карты</a>
                </div>
            </div>
        </div>
    </section>

    <section class="ap-section ap-others">
        <p class="kicker">Другие квартиры</p>
        <h2 class="h2 h2--sm">Посмотрите также</h2>
        <div class="ap-others-grid">
            ${others.map(o => { const b = cfg.apartmentsData[o]; return `<a class="ap-other" href="${BASE}/kvartiry/${o}/">${picture(b.photos[0], full(b.name), '', false)}<span>${esc(short(b.name))}</span></a>`; }).join('\n            ')}
        </div>
    </section>
</main>` + footer();
}

function privacyPage() {
    const body = fs.readFileSync(path.join(__dirname, 'privacy-body.html'), 'utf8');
    return head({
        title: 'Политика конфиденциальности — «В облаках Крыма»',
        desc: 'Политика обработки персональных данных гостевого дома «В облаках Крыма» (Кацивели, Крым): какие данные мы получаем через сайт, зачем и как их защищаем.',
        canonical: `${SITE}${BASE}/privacy.html`
    }) + header(`${BASE}/#apartments`) + `
<main class="doc">
    <a class="ap-back" href="${BASE}/">← На главную</a>
${body}
</main>` + footer();
}

for (const id of ids) {
    const dir = path.join(OUT, 'kvartiry', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), apartmentPage(id));
    console.log('✓ ' + BASE + '/kvartiry/' + id + '/');
}
fs.writeFileSync(path.join(OUT, 'privacy.html'), privacyPage());
console.log('✓ ' + BASE + '/privacy.html');
