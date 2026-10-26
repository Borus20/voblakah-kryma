// =============================================================
// «В облаках Крыма» — новый дизайн (v2).
// Данные (квартиры, достопримечательности, сезон, цены) — из /js/config.js, как и на старом сайте.
// Логика бронирования перенесена из js/app.js без изменений правил.
// =============================================================
(function () {
    'use strict';
    document.documentElement.classList.add('js');

    // ---------- утилиты ----------
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rub = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';   // неразрывный пробел: «4 000 ₽» не рвётся
    const aptName = (n) => 'Квартира «' + String(n).replace(/^Квартира\s+/, '').replace(/"/g, '') + '»';
    const aptShort = (n) => String(n).replace(/^Квартира\s+/, '').replace(/"/g, '');
    const areaOf = (d) => { const m = String(d).match(/(\d+)\s*м²/); return m ? m[1] : null; };
    // <picture> с WebP: 1280px для телефонов, полная для широких экранов
    function pic(src, alt, opts = {}) {
        const s = '/' + String(src).replace(/^\//, '');
        const sizes = opts.sizes || '100vw';
        return `<picture><source type="image/webp" srcset="${s}.w1280.webp 1280w, ${s}.webp 2560w" sizes="${sizes}">` +
            `<img src="${s}" alt="${esc(alt || '')}"${opts.eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${opts.cls ? ` class="${opts.cls}"` : ''}></picture>`;
    }
    function toast(msg) {
        const t = $('#toast'); t.textContent = msg; t.classList.add('is-on');
        clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('is-on'), 4200);
    }
    const lock = (on) => document.documentElement.classList.toggle('is-locked', on);

    const prices = Object.entries(PRICES_BY_MONTH).map(([m, p]) => ({ m: +m, p })).sort((a, b) => a.m - b.m);
    const minPrice = Math.min(...prices.map(x => x.p)), maxPrice = Math.max(...prices.map(x => x.p));
    const fmtD = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const DAY = 86400000;

    // После нажатия пальцем/мышью кнопка не остаётся выделенной (в т.ч. когда вернулись на страницу кнопкой «Назад»).
    // e.detail > 0 — нажатие мышью или пальцем; при управлении с клавиатуры фокус не трогаем.
    document.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('a, button, [role="button"]');
        if (el && e.detail > 0) setTimeout(() => el.blur(), 0);
    }, true);
    addEventListener('pageshow', () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); });
    const nightsBetween = (a, b) => Math.round((b - a) / DAY);
    const MIN_NIGHTS = 7;

    // ---------- перезагрузка страницы: всегда наверх, как при первом заходе ----------
    // (иначе браузер восстанавливает позицию или прокручивает к #contact и т.п. из адреса)
    const navType = ((performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {}).type;
    if (navType === 'reload') {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        scrollTo(0, 0);
        addEventListener('load', () => scrollTo(0, 0), { once: true });
    }

    // ---------- шапка и меню ----------
    const hdr = $('#hdr'), menu = $('#menu'), burger = $('.hdr-burger');
    const onScroll = () => hdr.classList.toggle('is-solid', scrollY > 40 && !document.documentElement.classList.contains('menu-open'));
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const setMenu = (open) => {
        menu.hidden = !open;
        document.documentElement.classList.toggle('menu-open', open);
        burger.setAttribute('aria-expanded', String(open));
        lock(open); onScroll();
    };
    burger.addEventListener('click', () => setMenu(menu.hidden));
    $$('#menu a').forEach(a => a.addEventListener('click', () => setMenu(false)));

    // ---------- главный экран: слайд-шоу ----------
    const slidesEl = $('#hero-slides'), counter = $('#hero-counter');
    const heroList = (typeof heroImages !== 'undefined' && heroImages.length) ? heroImages : ['img/common/house.jpg'];
    slidesEl.innerHTML = heroList.map((src, i) => `<div class="hero-slide${i === 0 ? ' is-on' : ''}">${i === 0 ? pic(src, 'Вид на дом «В облаках Крыма» и побережье', { eager: true }) : ''}</div>`).join('');
    const slides = $$('.hero-slide', slidesEl);
    let heroIdx = 0;
    const pad2 = (n) => String(n).padStart(2, '0');
    const setCounter = () => { counter.textContent = `${pad2(heroIdx + 1)} / ${pad2(slides.length)}`; };
    const ensureSlide = (i) => { if (!slides[i].innerHTML) slides[i].innerHTML = pic(heroList[i], 'Кацивели, Южный берег Крыма'); };
    setCounter();
    if (slides.length > 1) {   // смена фото — и при «Уменьшить движение» (это плавное перетекание, не движение)
        ensureSlide(1);
        setInterval(() => {
            if (document.hidden) return;
            slides[heroIdx].classList.remove('is-on');
            heroIdx = (heroIdx + 1) % slides.length;
            ensureSlide(heroIdx); ensureSlide((heroIdx + 1) % slides.length);
            slides[heroIdx].classList.add('is-on');
            setCounter();
        }, 6500);
    }

    // ---------- появление блоков ----------
    const io = new IntersectionObserver((es) => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    const observeReveal = (root = document) => $$('.reveal:not(.is-in)', root).forEach((el, i) => { el.style.transitionDelay = (i % 4) * 0.08 + 's'; io.observe(el); });
    observeReveal();

    // счётчики в блоке цифр
    const countIO = new IntersectionObserver((es) => es.forEach(e => {
        if (!e.isIntersecting) return;
        countIO.unobserve(e.target);
        const el = e.target, to = +el.dataset.count, t0 = performance.now();
        if (reduceMotion) return;
        const tick = (now) => { const k = Math.min(1, (now - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    $$('[data-count]').forEach(el => countIO.observe(el));

    // ---------- о нас: коллаж с параллаксом ----------
    const collage = $('#about-collage');
    const collagePics = [['img/common/house.jpg', 'Дом «В облаках Крыма»'], ['img/common/view2.jpg', 'Вид на море'], ['img/common/pavilion1.jpg', 'Беседка на территории']];
    collage.innerHTML = collagePics.map(([s, a]) => `<figure>${pic(s, a, { sizes: '(max-width: 1000px) 70vw, 34vw' })}</figure>`).join('');
    $('#contact-bg').style.backgroundImage = "image-set(url('/img/common/view1.jpg.webp') type('image/webp'), url('/img/common/view1.jpg') type('image/jpeg'))";
    const parallaxEls = [...$$('figure', collage).map((el, i) => [el, [-0.06, 0.1, 0.04][i]]), [$('#contact-bg'), 0.12]];
    let pxTick = false;
    const parallax = () => {
        pxTick = false;
        for (const [el, k] of parallaxEls) {
            const r = el.parentElement.getBoundingClientRect();
            if (r.bottom < -200 || r.top > innerHeight + 200) continue;
            el.style.setProperty('--py', ((r.top + r.height / 2 - innerHeight / 2) * k).toFixed(1) + 'px');
        }
    };
    if (!reduceMotion) { addEventListener('scroll', () => { if (!pxTick) { pxTick = true; requestAnimationFrame(parallax); } }, { passive: true }); parallax(); }

    // ---------- квартиры ----------
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const seasonText = `Сезон ${CALENDAR_START_DATE.getFullYear()}: с ${fmtD(CALENDAR_START_DATE)} по ${fmtD(CALENDAR_END_DATE)}. ` +
        `Цена за сутки за всю квартиру — от ${rub(minPrice)} до ${rub(maxPrice)} в зависимости от месяца. Бронирование от ${MIN_NIGHTS} ночей.`;
    $('#apts-lead').textContent = seasonText;
    $('#apts-grid').innerHTML = Object.entries(apartmentsData).map(([id, a]) => {
        const area = areaOf(a.description);
        const p1 = a.photos[0], p2 = a.photos[1];
        return `<article class="apt reveal">
            <div class="apt-media" data-open-apt="${id}" role="button" tabindex="0" aria-label="${esc(aptName(a.name))}: фото и даты">
                <div class="apt-slides" data-slides="${id}">${pic(p1, aptName(a.name), { sizes: '(max-width: 760px) 100vw, 50vw', cls: 'is-on' })}</div>
                ${area ? `<span class="apt-badge">${area} м²</span>` : ''}
                <span class="apt-count">${a.photos.length} фото</span>
            </div>
            <div class="apt-body">
                <h3 class="apt-name">${esc(aptShort(a.name))}</h3>
                <p class="apt-desc">${esc(a.description)}</p>
                <div class="apt-meta"><span>от <b>${rub(minPrice)}</b> / сутки</span><span>отдельный вход</span></div>
                <div class="apt-actions">
                    <button type="button" class="btn btn--dark" data-open-apt="${id}">Даты и цены</button>
                    <a class="btn btn--outline" href="/v2/kvartiry/${id}/">Подробнее</a>
                </div>
            </div>
        </article>`;
    }).join('');
    observeReveal($('#apts-grid'));

    // Пока курсор на карточке — фото листаются по кругу (следующие подгружаются по мере показа)
    const HOVER_STEP = 2000;
    $$('.apt').forEach(card => {
        const box = $('.apt-slides', card), id = box.dataset.slides, photos = apartmentsData[id].photos;
        let i = 0, timer = null;
        const show = (n) => {
            let el = box.querySelector(`[data-n="${n}"]`);
            if (!el) {
                box.insertAdjacentHTML('beforeend', `<div class="apt-slide" data-n="${n}">${pic(photos[n], '', { sizes: '(max-width: 760px) 100vw, 50vw' })}</div>`);
                el = box.querySelector(`[data-n="${n}"]`);
            }
            $$('img.is-on, .apt-slide.is-on', box).forEach(x => x.classList.remove('is-on'));
            const target = n === 0 ? box.querySelector('img') : el;
            void target.offsetWidth;            // новый слайд сначала отрисуется прозрачным — тогда сработает плавный переход
            target.classList.add('is-on');
            i = n;
        };
        if (!box.querySelector('[data-n="0"]')) box.firstElementChild.setAttribute('data-n', '0');
        const media = $('.apt-media', card);
        media.addEventListener('mouseenter', () => {
            if (photos.length < 2) return;
            card.classList.add('is-cycling');
            show((i + 1) % photos.length);
            timer = setInterval(() => show((i + 1) % photos.length), HOVER_STEP);
        });
        media.addEventListener('mouseleave', () => { clearInterval(timer); card.classList.remove('is-cycling'); show(0); });
    });
    $$('[data-open-apt]').forEach(el => {
        const go = () => openDrawer(el.dataset.openApt, true);
        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
    $('#ftr-apts').innerHTML = Object.entries(apartmentsData).map(([id, a]) => `<a href="/v2/kvartiry/${id}/">${esc(aptShort(a.name))}</a>`).join(' · ');

    // ---------- координаты мест (для расстояний и карты) ----------
    let places = null;
    const placesReady = fetch('/v2/map/data/places.json').then(r => r.json()).then(p => (places = p)).catch(() => null);
    function kmBetween(a, b) {
        const R = 6371, rad = (d) => d * Math.PI / 180;
        const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    }
    const fmtKm = (km) => km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km));
    function distKm(id) {
        if (!places || !places[id] || !places.house) return null;
        return fmtKm(kmBetween(places.house, places[id]));
    }
    // Маршрут на машине от нашего дома в Яндекс Картах (rtext: широта,долгота~широта,долгота)
    const routeUrl = (id) => places && places[id] && places.house
        ? `https://yandex.ru/maps/?rtext=${places.house.lat},${places.house.lon}~${places[id].lat},${places[id].lon}&rtt=auto` : null;

    // ---------- достопримечательности ----------
    const rail = $('#sights-rail');
    function renderSights() {
        rail.innerHTML = Object.entries(sightsData).map(([id, s]) => {
            const d = distKm(id);
            return `<button type="button" class="sight" data-sight="${id}">
                ${pic(s.images[0], s.title, { sizes: '340px' })}
                <span class="sight-info">${d ? `<span class="sight-dist">${d} км от нас</span>` : ''}<span class="sight-title">${esc(s.title)}</span></span>
            </button>`;
        }).join('');
        $$('.sight', rail).forEach(b => b.addEventListener('click', () => openSight(b.dataset.sight, true)));
    }
    renderSights();
    placesReady.then(renderSights);
    $('#sights-prev').addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }));
    $('#sights-next').addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }));

    // ---------- окна: общий механизм ----------
    let openLayer = null;
    function showLayer(el) {
        if (openLayer && openLayer !== el) hideLayer(openLayer, true);
        el.hidden = false; openLayer = el; lock(true);
    }
    function hideLayer(el, silent) {
        el.hidden = true;
        if (openLayer === el) openLayer = null;
        if (!openLayer) lock(false);
        if (!silent && /^#(apartment|sight)-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    }
    $$('[data-close]').forEach(b => b.addEventListener('click', () => hideLayer(b.closest('.drawer, .modal'))));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && openLayer) hideLayer(openLayer); });

    // ---------- окно достопримечательности ----------
    let smTimer = null, smCurrent = null;
    function openSight(id, pushHash) {
        const s = sightsData[id]; if (!s) return;
        if (mapApi && document.querySelector('.m3d.is-full')) mapApi.setFull(false);   // окно не должно открываться под полноэкранной картой
        smCurrent = id;
        // открыли по прямой ссылке до загрузки координат — дополним окно маршрутом и соседями, когда они придут
        if (!places) placesReady.then(() => { if (places && smCurrent === id && !$('#sight-modal').hidden) openSight(id, false); });
        const d = distKm(id);
        $('#sm-dist').textContent = d ? `${d} км от нашего дома по прямой` : 'Рядом с нами';
        $('#sm-title').textContent = s.title;
        $('#sm-desc').textContent = s.description;
        // расширенный рассказ о месте (sights-details.js) — то, чего нет в карточке на карте
        const det = (typeof sightsDetails !== 'undefined' && sightsDetails[id]) || null;
        $('#sm-facts').innerHTML = det ? det.facts.map(f => `<li>${esc(f)}</li>`).join('') : '';
        $('#sm-more').innerHTML = det ? det.more.map(p => `<p>${esc(p)}</p>`).join('') : '';
        const link = $('#sm-link');
        if (s.link) { link.href = s.link; link.hidden = false; } else link.hidden = true;
        const g = $('#sm-gallery');
        g.innerHTML = s.images.map((src, i) => pic(src, s.title, { sizes: '(max-width: 1000px) 100vw, 960px', cls: i === 0 ? 'is-on' : '' })).join('');
        $('.modal-panel--sight').scrollTop = 0;
        clearInterval(smTimer);
        const imgs = $$('img', g); let k = 0;
        // фото всего два — меняем спокойно, раз в 5 секунд, чтобы не мельтешило
        if (imgs.length > 1) smTimer = setInterval(() => showImg((k + 1) % imgs.length), 5000);   // showImg объявлена ниже, вызывается позже
        $('#sm-onmap').onclick = () => { hideLayer($('#sight-modal')); showOnMap(id); };
        // маршрут и расстояние
        const route = routeUrl(id), routeBox = $('.sm-route');
        routeBox.hidden = !route;
        if (route) { $('#sm-route').href = route; $('#sm-km').textContent = `${d} км по прямой`; }
        // три ближайших места к этому
        const near = places && places[id] ? Object.keys(sightsData).filter(k => k !== id && places[k])
            .map(k => ({ k, km: kmBetween(places[id], places[k]) })).sort((a, b) => a.km - b.km).slice(0, 3) : [];
        $('.sm-near').hidden = !near.length;
        $('#sm-near').innerHTML = near.map(({ k, km }) => `<button type="button" class="sm-near-item" data-near="${k}">
            ${pic(sightsData[k].images[0], sightsData[k].title, { sizes: '120px' })}
            <span><b>${esc(sightsData[k].title)}</b><small>${fmtKm(km)} км отсюда</small></span></button>`).join('');
        $$('[data-near]', $('#sm-near')).forEach(b => b.addEventListener('click', () => { history.replaceState(null, '', '#sight-' + b.dataset.near); openSight(b.dataset.near, false); $('.modal-panel--sight').scrollTop = 0; $('.sm-body').scrollTop = 0; }));
        // точки-переключатели фото
        g.insertAdjacentHTML('beforeend', imgs.length > 1 ? `<div class="sm-dots">${imgs.map((_, i) => `<button type="button" data-dot="${i}" class="${i === 0 ? 'is-on' : ''}" aria-label="Фото ${i + 1}"></button>`).join('')}</div>` : '');
        const dots = $$('[data-dot]', g);
        const showImg = (i) => { imgs[k].classList.remove('is-on'); dots[k] && dots[k].classList.remove('is-on'); k = i; imgs[k].classList.add('is-on'); dots[k] && dots[k].classList.add('is-on'); };
        dots.forEach(b => b.addEventListener('click', () => { clearInterval(smTimer); showImg(+b.dataset.dot); }));
        if (pushHash) history.pushState(null, '', '#sight-' + id);
        showLayer($('#sight-modal'));
    }

    // ---------- 3D-карта: загружается, когда раздел рядом с экраном ----------
    let mapApi = null, mapInit = null;
    function initMap() {
        if (mapInit) return mapInit;
        mapInit = new Promise((resolve) => {
            const start = async () => {
                await placesReady;
                const meta = await fetch('/v2/map/data/meta.json').then(r => r.json());
                mapApi = await window.__initMap3D($('#map3d'), {
                    base: '/v2/map/data/', sights: sightsData, places: places || {}, attribution: meta.attribution,
                    sightHref: (id) => '#sight-' + id,
                    house: {
                        title: 'В облаках Крыма',
                        text: 'Наш дом в Кацивели: четыре квартиры по 40 м² с видом на море и горы. Республика Крым, пгт. Кацивели, ул. Академика Шулейкина, д. 53.',
                        img: 'img/common/house.jpg', href: '#apartments',
                        lat: places && places.house ? places.house.lat : 44.396062, lon: places && places.house ? places.house.lon : 33.969208
                    }
                });
                resolve(mapApi);
            };
            if (window.__initMap3D) start(); else addEventListener('map3d-ready', start, { once: true });
        });
        return mapInit;
    }
    new IntersectionObserver((es, obs) => { if (es[0].isIntersecting) { obs.disconnect(); initMap(); } }, { rootMargin: '600px 0px' }).observe($('#map3d'));
    async function showOnMap(id) {
        $('#map').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        const api = await initMap();
        setTimeout(() => api && api.openCard(id), 700);
    }

    // =============================================================
    // БРОНИРОВАНИЕ (правила как в js/app.js)
    // =============================================================
    const drawer = $('#drawer');
    let curApt = null, bookings = [], calStart = null, checkIn = null, checkOut = null, galIdx = 0;

    function seasonStartView() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const curMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonth = new Date(CALENDAR_END_DATE.getFullYear(), CALENDAR_END_DATE.getMonth(), 1);
        let s = curMonth > CALENDAR_START_DATE ? curMonth : new Date(CALENDAR_START_DATE.getFullYear(), CALENDAR_START_DATE.getMonth(), 1);
        if (s > lastMonth) s = lastMonth;
        return s;
    }
    const monthsToShow = () => ($('#cal').clientWidth >= 500 ? 2 : 1);
    const maxStart = (n) => { const d = new Date(CALENDAR_END_DATE); d.setDate(1); d.setMonth(d.getMonth() - (n - 1)); return d; };

    async function loadBookings(id) {
        try {
            const r = await fetch('/api/bookings?apartmentId=' + encodeURIComponent(id));
            if (!r.ok) throw new Error();
            bookings = (await r.json()).map(b => {
                const s = b.start_date.split('-'), e = b.end_date.split('-');
                return { start: new Date(s[0], s[1] - 1, s[2]), end: new Date(e[0], e[1] - 1, e[2]) };
            });
        } catch (e) {
            bookings = [];
            toast('Не удалось загрузить занятые даты. Попробуйте обновить страницу.');
        }
    }

    function renderGallery(a) {
        const g = $('#dr-gallery');
        // большое фото грузится, только когда до него дошли (и соседние заранее), миниатюры — лёгкие 320px
        g.innerHTML = `<div class="dr-main">${a.photos.map((src, i) => `<img ${i === 0 ? 'src' : 'data-src'}="/${src}.webp" alt="${esc(aptName(a.name))} — фото ${i + 1}" class="${i === 0 ? 'is-on' : ''}" decoding="async">`).join('')}
            <div class="dr-arrows"><button type="button" class="ico-btn ico-btn--glass" data-g="-1" aria-label="Предыдущее фото"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button type="button" class="ico-btn ico-btn--glass" data-g="1" aria-label="Следующее фото"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>
            <span class="dr-count" aria-hidden="true"></span></div>
            <div class="dr-thumbs">${a.photos.map((src, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'is-on' : ''}" aria-label="Фото ${i + 1}"><img src="/${src}.t320.webp" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`;
        galIdx = 0;
        const show = (i) => {
            const imgs = $$('.dr-main img', g), th = $$('.dr-thumbs button', g);
            galIdx = (i + imgs.length) % imgs.length;
            imgs.forEach((im, k) => {
                im.classList.toggle('is-on', k === galIdx);
                const near = Math.abs(k - galIdx) <= 1 || Math.abs(k - galIdx) === imgs.length - 1;
                if (near && im.dataset.src && !im.getAttribute('src')) im.src = im.dataset.src;
            });
            th.forEach((t, k) => t.classList.toggle('is-on', k === galIdx));
            $('.dr-count', g).textContent = `${galIdx + 1} / ${imgs.length}`;
            th[galIdx].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        };
        $('.dr-count', g).textContent = `1 / ${a.photos.length}`;
        [1, a.photos.length - 1].forEach(k => { const im = $$('.dr-main img', g)[k]; if (im && im.dataset.src) im.src = im.dataset.src; });
        $$('[data-g]', g).forEach(b => b.addEventListener('click', () => show(galIdx + +b.dataset.g)));
        $$('.dr-thumbs button', g).forEach(b => b.addEventListener('click', () => show(+b.dataset.i)));
        // свайп
        let x0 = null;
        const main = $('.dr-main', g);
        main.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        main.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(galIdx + (dx < 0 ? 1 : -1)); x0 = null; });
    }

    async function openDrawer(id, pushHash) {
        const a = apartmentsData[id]; if (!a) return;
        curApt = id; checkIn = checkOut = null;
        $('#dr-title').textContent = aptName(a.name);
        $('#dr-desc').textContent = a.description;
        $('#dr-more').href = `/v2/kvartiry/${id}/`;
        $('#dr-prices').innerHTML = `<h4>Цена за сутки, сезон ${CALENDAR_START_DATE.getFullYear()}</h4>` +
            prices.map(x => `<div><span>${monthNames[x.m][0].toUpperCase() + monthNames[x.m].slice(1)}</span><b>${rub(x.p)}</b></div>`).join('') +
            `<p>За всю квартиру. От ${MIN_NIGHTS} ночей. Заезд после 14:00, выезд до 12:00.</p>`;
        renderGallery(a);
        setStep('dates');
        $('#dr-status').textContent = '';
        if (pushHash) history.pushState(null, '', '#apartment-' + id);
        showLayer(drawer);
        $('.drawer-scroll').scrollTop = 0;
        $('#cal').innerHTML = '<p style="color:#667487">Загружаем свободные даты…</p>';
        await loadBookings(id);
        calStart = seasonStartView();
        renderCal(); updateSummary();
    }

    function setStep(step) {
        $('#dr-step-dates').hidden = step !== 'dates';
        $('#dr-step-form').hidden = step !== 'form';
        $('#dr-step-done').hidden = step !== 'done';
        if (step !== 'dates') $('.drawer-scroll').scrollTo({ top: $('.dr-steps').getBoundingClientRect().top - $('.drawer-scroll').getBoundingClientRect().top + $('.drawer-scroll').scrollTop - 20, behavior: 'smooth' });
    }

    function renderCal() {
        const cal = $('#cal');
        const n = monthsToShow();
        const lastMonth = new Date(CALENDAR_END_DATE.getFullYear(), CALENDAR_END_DATE.getMonth(), 1);
        if (calStart > maxStart(n)) calStart = maxStart(n);
        $('#cal-prev').disabled = calStart.getTime() <= seasonStartView().getTime();
        $('#cal-next').disabled = calStart.getTime() >= maxStart(n).getTime();
        cal.style.setProperty('--months', n);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let html = '';
        for (let i = 0; i < n; i++) {
            const md = new Date(calStart.getFullYear(), calStart.getMonth() + i, 1);
            if (md > lastMonth) break;
            const y = md.getFullYear(), m = md.getMonth();
            const days = new Date(y, m + 1, 0).getDate();
            let first = new Date(y, m, 1).getDay(); first = first === 0 ? 6 : first - 1;
            html += `<div class="cal-month"><h4>${monthNames[m]} ${y}</h4><div class="cal-grid">` +
                ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div class="cal-dow">${d}</div>`).join('') +
                '<div class="day day--empty"></div>'.repeat(first);
            for (let d = 1; d <= days; d++) {
                const date = new Date(y, m, d), t = date.getTime();
                let booked = false, bStart = false, bEnd = false;
                for (const b of bookings) {
                    if (date > b.start && date < b.end) booked = true;
                    if (t === b.start.getTime()) bStart = true;
                    if (t === b.end.getTime()) bEnd = true;
                }
                const outOfSeason = date < CALENDAR_START_DATE || date > CALENDAR_END_DATE;
                const seasonFirst = t === CALENDAR_START_DATE.getTime(), seasonLast = t === CALENDAR_END_DATE.getTime();
                let cls;
                if (t < today.getTime() || outOfSeason) cls = 'day--past';
                else if (booked) cls = 'day--busy';
                else if (bStart && bEnd) cls = 'day--busy-double';
                else if (bStart && seasonFirst) cls = 'day--busy';
                else if (bEnd && seasonLast) cls = 'day--busy';
                else if (bStart) cls = 'day--busy-start';
                else if (bEnd) cls = 'day--busy-end';
                else cls = 'day--free';
                const sel = [];
                if (checkIn && t === checkIn.getTime()) sel.push('is-start');
                if (checkOut && t === checkOut.getTime()) sel.push('is-end');
                if (checkIn && checkOut && date > checkIn && date < checkOut && !booked && !bStart && !bEnd) sel.push('is-range');
                const clickable = !['day--past', 'day--busy', 'day--busy-double'].includes(cls);
                const price = clickable ? `<small>${(PRICES_BY_MONTH[m] || minPrice).toLocaleString('ru-RU')}</small>` : '';
                html += `<div class="day ${cls} ${sel.join(' ')}"${clickable ? ` data-t="${t}" role="button" tabindex="0"` : ''}>${d}${price}</div>`;
            }
            html += '</div></div>';
        }
        cal.innerHTML = html;
        $$('[data-t]', cal).forEach(el => {
            const go = () => selectDate(new Date(+el.dataset.t));
            el.addEventListener('click', go);
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
    }
    $('#cal-prev').addEventListener('click', () => { const n = monthsToShow(); calStart = new Date(calStart.getFullYear(), calStart.getMonth() - n, 1); const s = seasonStartView(); if (calStart < s) calStart = s; renderCal(); });
    $('#cal-next').addEventListener('click', () => { const n = monthsToShow(); calStart = new Date(calStart.getFullYear(), calStart.getMonth() + n, 1); renderCal(); });
    let calW = 0;
    new ResizeObserver(() => { const w = $('#cal').clientWidth; if (curApt && !drawer.hidden && Math.abs(w - calW) > 20) { calW = w; renderCal(); } }).observe($('#cal'));

    function selectDate(date) {
        const t = date.getTime();
        if ((checkIn && t === checkIn.getTime()) || (checkOut && t === checkOut.getTime())) { checkIn = checkOut = null; }
        else if (!checkIn || (checkIn && checkOut)) { checkIn = date; checkOut = null; }
        else if (date > checkIn) {
            checkOut = date;
            if (bookings.some(b => checkIn < b.end && checkOut > b.start)) {
                toast('Выбранный период пересекается с занятыми датами'); checkIn = checkOut = null;
            } else if (nightsBetween(checkIn, checkOut) < MIN_NIGHTS) {
                toast(`Минимальный срок бронирования — ${MIN_NIGHTS} ночей`); checkIn = checkOut = null;
            }
        } else { checkIn = date; }
        renderCal(); updateSummary();
    }

    function stayTotal() {
        let total = 0;
        for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) total += PRICES_BY_MONTH[d.getMonth()] || 3500;
        return total;
    }
    function updateSummary() {
        const ok = checkIn && checkOut;
        $('#sum-dates').textContent = ok ? `${fmtD(checkIn)} — ${fmtD(checkOut)}` : (checkIn ? `${fmtD(checkIn)} — …` : 'не выбраны');
        $('#sum-nights').textContent = ok ? nightsBetween(checkIn, checkOut) : '—';
        const total = ok ? stayTotal() : 0;
        $('#sum-total').textContent = ok ? rub(total) : '—';
        $('#sum-prepay').textContent = ok ? rub(Math.round(total * 0.2)) : '—';
        $('#dr-continue').disabled = !(ok && nightsBetween(checkIn, checkOut) >= MIN_NIGHTS);
    }
    $('#dr-continue').addEventListener('click', () => {
        const total = stayTotal();
        $('#dr-picked').innerHTML = `<b>${esc(aptName(apartmentsData[curApt].name))}</b><br>${fmtD(checkIn)} — ${fmtD(checkOut)} ${checkOut.getFullYear()} · ${nightsBetween(checkIn, checkOut)} ночей · ${rub(total)} (предоплата 20% — ${rub(Math.round(total * 0.2))})`;
        setStep('form');
        setTimeout(() => $('#dr-step-form [name=name]').focus({ preventScroll: true }), 400);
    });
    $('#dr-back').addEventListener('click', () => setStep('dates'));

    $('#dr-step-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target, st = $('#dr-status'), btn = f.querySelector('[type=submit]');
        const v = (n) => f.elements[n].value.trim();
        if (!v('name') || !v('phone') || !v('email').includes('@')) { st.textContent = 'Пожалуйста, заполните обязательные поля (*) и корректный Email!'; return; }
        if (!f.elements.consent.checked) { st.textContent = 'Необходимо Ваше согласие на обработку данных!'; return; }
        st.textContent = ''; btn.disabled = true; btn.textContent = 'Отправка…';
        const payload = {
            apartmentId: curApt, apartmentName: apartmentsData[curApt].name,
            startDate: ymd(checkIn), endDate: ymd(checkOut),
            name: v('name'), phone: v('phone'), email: v('email'), telegram: v('telegram'), message: v('message'),
            adults: f.elements.adults.value, children: f.elements.children.value, totalPrice: stayTotal()
        };
        try {
            const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (r.ok) {
                f.reset(); setStep('done');
                await loadBookings(curApt); checkIn = checkOut = null; renderCal(); updateSummary();
            } else {
                const data = await r.json().catch(() => ({}));
                if (r.status === 409) {
                    await loadBookings(curApt); checkIn = checkOut = null; renderCal(); updateSummary();
                    setStep('dates'); toast(data.error || 'Эти даты уже заняты. Выберите, пожалуйста, другие.');
                } else {
                    st.textContent = (r.status < 500 && data.error) ? data.error : 'Ошибка отправки. Попробуйте позже или свяжитесь с нами напрямую';
                }
            }
        } catch (err) {
            st.textContent = 'Ошибка отправки. Попробуйте позже или свяжитесь с нами напрямую';
        } finally { btn.disabled = false; btn.textContent = 'Отправить заявку'; }
    });

    // ---------- «Написать нам» ----------
    $$('[data-open="contact-modal"]').forEach(b => b.addEventListener('click', () => {
        $('#contact-form').hidden = false; $('#cm-done').hidden = true; $('#cm-status').textContent = '';
        showLayer($('#contact-modal'));
    }));
    $('#contact-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target, st = $('#cm-status'), btn = f.querySelector('[type=submit]');
        const v = (n) => f.elements[n].value.trim();
        if (!v('name') || !v('phone') || !v('email').includes('@') || !v('message')) { st.textContent = 'Пожалуйста, заполните обязательные поля (*) и корректный Email!'; return; }
        if (!f.elements.consent.checked) { st.textContent = 'Необходимо Ваше согласие на обработку данных!'; return; }
        st.textContent = ''; btn.disabled = true; btn.textContent = 'Отправка…';
        try {
            const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: v('name'), phone: v('phone'), email: v('email'), telegram: v('telegram'), message: v('message') }) });
            if (r.ok) { f.reset(); f.hidden = true; $('#cm-done').hidden = false; }
            else { const data = await r.json().catch(() => ({})); st.textContent = (r.status < 500 && data.error) ? data.error : 'Ошибка отправки. Попробуйте позже или позвоните нам'; }
        } catch (err) { st.textContent = 'Ошибка отправки. Попробуйте позже или позвоните нам'; }
        finally { btn.disabled = false; btn.textContent = 'Отправить'; }
    });

    // ---------- ссылки вида #apartment-…, #sight-… (в т.ч. со страниц квартир и с карты) ----------
    function route() {
        const h = location.hash;
        if (h.startsWith('#apartment-')) { const id = h.slice(11); if (apartmentsData[id]) { if (curApt !== id || drawer.hidden) openDrawer(id, false); return; } }
        if (h.startsWith('#sight-')) { const id = h.slice(7); if (sightsData[id]) { openSight(id, false); return; } }
        if (openLayer && !/^#(apartment|sight)-/.test(h)) hideLayer(openLayer, true);
    }
    addEventListener('hashchange', route);
    addEventListener('popstate', route);
    route();
    // переход с отдельных страниц по ссылкам шапки (/v2/#map, /v2/#rules …) — прокрутить к разделу
    if (['#about', '#apartments', '#map', '#sights', '#rules', '#contact'].includes(location.hash)) {
        const go = () => { const el = $(location.hash); if (el) el.scrollIntoView({ behavior: 'instant' }); };   // сразу, без пролёта через всю страницу
        setTimeout(go, 60);
        addEventListener('load', () => setTimeout(go, 60), { once: true });   // после загрузки фото высоты могли измениться
    }

    // ---------- cookie ----------
    (function () {
        const b = $('#cookie-banner'); if (!b) return;
        let seen = false; try { seen = localStorage.getItem('cookieNoticeOk') === '1'; } catch (e) {}
        if (seen) return;
        b.hidden = false;
        $('#cookie-ok').addEventListener('click', () => { b.hidden = true; try { localStorage.setItem('cookieNoticeOk', '1'); } catch (e) {} });
    })();
})();
