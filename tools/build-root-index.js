#!/usr/bin/env node
// Собирает основную главную (frontend/index.html) из нового дизайна (frontend/v2/index.html):
// убирает noindex, переносит из старой главной всё для поисковиков и статистики
// (title/description/keywords, Open Graph, canonical, Яндекс.Вебмастер, Метрика, JSON-LD LodgingBusiness),
// ссылки на политику ведут в корень. Запуск: node tools/build-root-index.js <старая_главная.html>
const fs = require('fs');
const path = require('path');
const FRONT = path.join(__dirname, '..', 'frontend');
const oldPath = process.argv[2];
if (!oldPath) { console.error('укажите путь к старой главной (для SEO-тегов)'); process.exit(1); }
const old = fs.readFileSync(oldPath, 'utf8');
let html = fs.readFileSync(path.join(FRONT, 'v2', 'index.html'), 'utf8');

const one = (re, what) => { const m = old.match(re); if (!m) { console.error('нет в старой главной: ' + what); process.exit(1); } return m[0]; };
const all = (re) => old.match(re) || [];

const title = one(/<title>[\s\S]*?<\/title>/, 'title');
const desc = one(/<meta name="description"[^>]*>/, 'description');
const keywords = one(/<meta name="keywords"[^>]*>/, 'keywords');
const yv = one(/<meta name="yandex-verification"[^>]*>/, 'yandex-verification');
const og = all(/<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g);
const canonical = one(/<link rel="canonical"[^>]*>/, 'canonical');
const icon192 = one(/<link rel="icon"[^>]*sizes="192x192"[^>]*>/, 'icon 192');
const manifest = one(/<link rel="manifest"[^>]*>/, 'manifest');
const metrika = one(/<script type="text\/javascript">\s*\(function\(m,e,t,r,i,k,a\)[\s\S]*?<\/script>\s*<noscript>[\s\S]*?<\/noscript>/, 'Метрика');
const jsonld = one(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, 'JSON-LD');
if (og.length < 8) { console.error('мало og/twitter тегов: ' + og.length); process.exit(1); }

const rep = (a, b, what) => { if (!html.includes(a)) { console.error('нет в v2: ' + what); process.exit(1); } html = html.replace(a, () => b); };
rep('    <meta name="robots" content="noindex, nofollow">\n', '', 'noindex');
html = html.replace(/<title>[\s\S]*?<\/title>/, () => title);
html = html.replace(/<meta name="description"[^>]*>/, () => [desc, keywords, yv, ...og, canonical].join('\n    '));
rep('    <link rel="apple-touch-icon"', `    ${icon192}\n    <link rel="apple-touch-icon"`, 'apple-touch-icon');
rep('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">', `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n    ${manifest}`, 'manifest anchor');
rep('</head>', `    ${metrika}\n    ${jsonld}\n</head>`, '</head>');
html = html.split('href="/v2/privacy.html"').join('href="/privacy.html"');
html = html.replace('<head>', '<head>\n    <!-- Собрано tools/build-root-index.js из frontend/v2/index.html (+ SEO и Метрика старой главной). Правьте v2/index.html и пересоберите. -->');

fs.writeFileSync(path.join(FRONT, 'index.html'), html);
console.log('index.html собран:', html.length, 'байт; og/twitter:', og.length);
