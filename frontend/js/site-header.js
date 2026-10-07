// Меню в шапке отдельных страниц (квартиры, политика): открыть/закрыть по кнопке,
// закрыть при нажатии мимо, при прокрутке и по Escape — как на главной.
(function () {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const button = header.querySelector('.sh-burger');
    const menu = header.querySelector('.sh-menu');
    if (!button || !menu) return;

    const setOpen = (open) => {
        menu.hidden = !open;
        header.classList.toggle('menu-open', open);
        button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) setOpen(false); });
    window.addEventListener('scroll', () => { if (!menu.hidden) setOpen(false); }, { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
})();

// Логотип: при нажатии — волна по буквам и градиент, через секунду переход на главную (как на главной)
(function () {
    const logo = document.querySelector('.sh-logo');
    if (!logo) return;
    logo.addEventListener('click', function (e) {
        e.preventDefault();
        if (this.classList.contains('click-anim')) return; // анимация уже идёт
        this.classList.add('click-anim');
        setTimeout(() => {
            this.classList.remove('click-anim');
            window.location.href = '/';
        }, 1000);
    });
})();
