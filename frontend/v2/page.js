// Отдельные страницы нового дизайна (квартиры, политика): меню, галерея, плашка cookie
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    // после нажатия пальцем/мышью кнопка не остаётся выделенной (и при возврате «Назад»)
    document.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('a, button');
        if (el && e.detail > 0) setTimeout(() => el.blur(), 0);
    }, true);
    addEventListener('pageshow', () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); });

    // ---------- меню (как на главной) ----------
    const menu = $('#menu'), burger = $('.hdr-burger');
    if (menu && burger) {
        const setMenu = (open) => {
            menu.hidden = !open;
            document.documentElement.classList.toggle('menu-open', open);
            document.documentElement.classList.toggle('is-locked', open);
            burger.setAttribute('aria-expanded', String(open));
        };
        burger.addEventListener('click', () => setMenu(menu.hidden));
        $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
        addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
    }

    // ---------- галерея квартиры ----------
    const gal = $('[data-gallery]');
    if (gal) {
        const imgs = $$('.gal-main img', gal), thumbs = $$('.gal-thumbs button', gal), count = $('.gal-count', gal);
        let i = 0;
        const show = (n) => {
            i = (n + imgs.length) % imgs.length;
            imgs.forEach((im, k) => {
                im.classList.toggle('is-on', k === i);
                // фото грузится, только когда до него дошли (и соседние — заранее), а не все сразу
                const near = Math.abs(k - i) <= 1 || (i === 0 && k === imgs.length - 1) || (i === imgs.length - 1 && k === 0);
                if (near && im.dataset.src && !im.src) im.src = im.dataset.src;
            });
            thumbs.forEach((t, k) => t.classList.toggle('is-on', k === i));
            thumbs[i] && thumbs[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
            if (count) count.textContent = `${i + 1} / ${imgs.length}`;
        };
        $$('[data-step]', gal).forEach(b => b.addEventListener('click', () => show(i + +b.dataset.step)));
        thumbs.forEach(b => b.addEventListener('click', () => show(+b.dataset.i)));
        addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
        show(0);   // подгрузить соседние с первым
        let x0 = null;
        const main = $('.gal-main', gal);
        main.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        main.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
    }

    // ---------- cookie ----------
    const b = $('#cookie-banner');
    if (b) {
        let seen = false; try { seen = localStorage.getItem('cookieNoticeOk') === '1'; } catch (e) {}
        if (!seen) {
            b.hidden = false;
            $('#cookie-ok').addEventListener('click', () => { b.hidden = true; try { localStorage.setItem('cookieNoticeOk', '1'); } catch (e) {} });
        }
    }
})();
