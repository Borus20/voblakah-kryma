#!/usr/bin/env node
// =============================================================
// Генератор отдельных страниц квартир для поисковиков (/kvartiry/<id>/)
// и sitemap.xml. Данные берутся из frontend/js/config.js — того же файла,
// что использует сайт. После правки описаний/фото/цен в config.js запустите:
//     node /var/www/voblakah-kryma/tools/gen-pages.js
// Бронирование на страницах ведёт в основной сайт: /#apartment-<id>
// =============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'frontend');
const SITE = 'https://voblakah-kryma.ru';
const cfg = vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8') +
    '\n;({ apartmentsData, CALENDAR_START_DATE, CALENDAR_END_DATE, PRICES_BY_MONTH })', {});

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plainName = (n) => n.replace(/^Квартира\s+/, '').replace(/"/g, '');          // Морской бриз
const niceName = (n) => `Квартира «${plainName(n)}»`;                               // Квартира «Морской бриз»
const rub = (n) => Number(n).toLocaleString('ru-RU');
const today = new Date().toISOString().slice(0, 10);
const year = cfg.CALENDAR_START_DATE.getFullYear();

const prices = Object.entries(cfg.PRICES_BY_MONTH).map(([m, p]) => ({ m: Number(m), p })).sort((a, b) => a.m - b.m);
const minPrice = Math.min(...prices.map(x => x.p));
const maxPrice = Math.max(...prices.map(x => x.p));
const ids = Object.keys(cfg.apartmentsData);

function picture(src, alt, eager) {
    const s = '/' + src.replace(/^\//, '');
    return `<picture><source type="image/webp" srcset="${s}.w1280.webp 1280w, ${s}.webp 2560w" sizes="(max-width: 767px) 100vw, 50vw">` +
        `<img src="${s}" alt="${esc(alt)}"${eager ? '' : ' loading="lazy"'} decoding="async"></picture>`;
}

function page(id) {
    const apt = cfg.apartmentsData[id];
    const name = niceName(apt.name);
    const url = `${SITE}/kvartiry/${id}/`;
    // Сначала фото самой квартиры, потом общие (двор, вид) — не больше 12
    const own = apt.photos.filter(p => !p.includes('/common/'));
    const common = apt.photos.filter(p => p.includes('/common/'));
    const photos = own.concat(common).slice(0, 12);
    const title = `${name} в Кацивели — снять у моря от ${rub(minPrice)} ₽/сутки | В облаках Крыма`;
    const desc = `${apt.description.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.')} Кацивели, Большая Ялта. Сезон ${year}: от ${rub(minPrice)} ₽ за сутки.`.slice(0, 300);
    const others = ids.filter(x => x !== id);
    const areaMatch = apt.description.match(/(\d+)\s*м²/);
    const area = areaMatch ? Number(areaMatch[1]) : null;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'Apartment',
        '@id': url + '#apartment',
        name: `${name} — В облаках Крыма`,
        description: apt.description,
        url,
        image: photos.slice(0, 5).map(p => `${SITE}/${p}`),
        ...(area ? { floorSize: { '@type': 'QuantitativeValue', value: area, unitCode: 'MTK' } } : {}),
        address: { '@type': 'PostalAddress', streetAddress: 'ул. Шулейкина, 53', addressLocality: 'пгт Кацивели', addressRegion: 'Республика Крым', addressCountry: 'RU' },
        containedInPlace: { '@id': `${SITE}/#lodging` },
        offers: { '@type': 'AggregateOffer', priceCurrency: 'RUB', lowPrice: minPrice, highPrice: maxPrice, url: `${SITE}/#apartment-${id}` }
    };
    const breadcrumbs = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'В облаках Крыма', item: SITE + '/' },
            { '@type': 'ListItem', position: 2, name, item: url }
        ]
    };

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <!-- Страница сгенерирована tools/gen-pages.js из js/config.js — правьте config.js и перезапустите генератор -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:site_name" content="В облаках Крыма">
    <meta property="og:title" content="${esc(name)} — отдых в Кацивели">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${SITE}/${photos[0]}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#eaf5fb">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" href="/fonts/inter-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/css/apartment-page.css">
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>
    <script>
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=106346948', 'ym');
        ym(106346948, 'init', {ssr:true, webvisor:true, clickmap:true, accurateTrackBounce:true, trackLinks:true});
    </script>
</head>
<body>
<div class="wrap">
    <a class="back" href="/"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>На главную</a>
    <main class="card">
        <h1>${esc(name)}</h1>
        <p class="lead">Кацивели, Большая Ялта${area ? ` · ${area} м²` : ''} · от ${rub(minPrice)} ₽ за сутки</p>

        <div class="hero">${picture(photos[0], `${name} — фото 1`, true)}</div>

        <p class="text">${esc(apt.description)}</p>

        <a class="cta" href="/#apartment-${id}">Посмотреть свободные даты и забронировать</a>

        <h2>Цены на сезон ${year}</h2>
        <table class="prices">
            <thead><tr><th>Месяц</th><th>Цена за сутки</th></tr></thead>
            <tbody>
${prices.map(x => `                <tr><td>${MONTHS[x.m][0].toUpperCase() + MONTHS[x.m].slice(1)}</td><td>${rub(x.p)} ₽</td></tr>`).join('\n')}
            </tbody>
        </table>
        <p class="note">Цена указана за всю квартиру. Минимальный срок бронирования — 4 ночи.</p>

        <h2>Фотографии</h2>
        <div class="gallery">
${photos.slice(1).map((p, i) => `            <a href="/${p}" target="_blank" rel="noopener">${picture(p, `${name} — фото ${i + 2}`, false)}</a>`).join('\n')}
        </div>

        <h2>Условия проживания</h2>
        <ul class="rules">
            <li><b>Заезд</b> после 14:00, <b>выезд</b> до 12:00.</li>
            <li><b>Предоплата 20%</b> — после того, как мы свяжемся с вами и подтвердим бронь. Остальное — при заселении.</li>
            <li><b>Отмена:</b> предоплата возвращается при отмене не позднее чем за 14 дней до заезда.</li>
            <li>При необходимости предоставляем отчётные документы.</li>
        </ul>

        <h2>Где находится</h2>
        <p class="text">Республика Крым, пгт Кацивели, ул. Шулейкина, 53 — небольшой дом среди можжевельников, 18 км от Ялты. <a href="https://yandex.ru/maps/?text=Крым,+Кацивели,+Шулейкина,+53" target="_blank" rel="noopener">Открыть на карте</a></p>

        <a class="cta" href="/#apartment-${id}">Забронировать ${esc(name.replace('Квартира', 'квартиру'))}</a>

        <h2>Другие квартиры</h2>
        <ul class="others">
${others.map(o => `            <li><a href="/kvartiry/${o}/">${esc(niceName(cfg.apartmentsData[o].name))}</a></li>`).join('\n')}
        </ul>
    </main>
    <footer>
        <a href="tel:+79093553729">+7 (909) 355-37-29</a> · <a href="mailto:polinadun@mail.ru">polinadun@mail.ru</a><br>
        © ${year} Квартиры «В облаках Крыма» · <a href="/privacy.html">Политика конфиденциальности</a>
    </footer>
</div>
</body>
</html>
`;
}

for (const id of ids) {
    const dir = path.join(ROOT, 'kvartiry', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page(id));
    console.log('✓ /kvartiry/' + id + '/');
}

const urls = [
    { loc: SITE + '/', priority: '1.0', changefreq: 'weekly' },
    ...ids.map(id => ({ loc: `${SITE}/kvartiry/${id}/`, priority: '0.8', changefreq: 'monthly' })),
    { loc: SITE + '/privacy.html', priority: '0.2', changefreq: 'yearly' }
];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`);
console.log('✓ sitemap.xml (' + urls.length + ' адресов)');
