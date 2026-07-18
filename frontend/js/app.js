// =============================================================
// ЛОГИКА САЙТА «В облаках Крыма».
// Данные и конфиг — в config.js (загружается перед этим файлом).
// =============================================================

        // === 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
        let keyboardNav = { prev: null, next: null };
        let myMapInstance = null;
        let currentApartmentId = null;
        let currentSightId = null;
        let currentCalendarDate;
        let checkInDate = null, checkOutDate = null;
        let apartmentBookings = [];
        let lastScrollPosition = 0;

        // Эффективное начало календаря: полностью прошедшие месяцы скрываются
        function getCalendarStartDate() {
            const today = new Date(); today.setHours(0,0,0,0);
            const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const seasonLastMonthStart = new Date(CALENDAR_END_DATE.getFullYear(), CALENDAR_END_DATE.getMonth(), 1);
            let start = currentMonthStart > CALENDAR_START_DATE ? currentMonthStart : CALENDAR_START_DATE;
            if (start > seasonLastMonthStart) start = seasonLastMonthStart;
            return start;
        }
        // FULLSCREEN VARS
        let currentFullscreenImages = [];
        let currentFullscreenIndex = 0;

        // === 3. ГЛОБАЛЬНЫЕ ФУНКЦИИ ===
        // Возвращает <picture> с WebP (современные браузеры) и фолбэком на исходный файл.
        // eager=true — без lazy (для hero/первого экрана).
        function pictureTag(src, imgClass, alt, eager, sizes) {
            const cls = imgClass ? ` class="${imgClass}"` : '';
            const loading = eager ? '' : ' loading="lazy"';
            const a = alt || '';
            // Телефон получает версию 1280px вместо 2560px — вчетверо меньше пикселей, отсюда плавность
            const sz = sizes || '(max-width: 767px) 100vw, 50vw';
            return `<picture><source type="image/webp" srcset="${src}.w1280.webp 1280w, ${src}.webp 2560w" sizes="${sz}"><img src="${src}"${cls} alt="${a}"${loading} decoding="async" onload="imgLoaded(this)" onerror="imgLoaded(this)"></picture>`;
        }

        // Фото загрузилось — плавно проявляем его и гасим скелетон-заглушку
        window.imgLoaded = function(img) {
            img.classList.add('img-loaded');
            const slide = img.closest('.inner-carousel-slide, .details-photo-slide, .fullscreen-slide');
            if (slide) slide.classList.add('img-done');
        };

        // Заранее подгружает текущий и соседние кадры карусели, чтобы свайп/переключение шли плавно (без «прыжка» загрузки)
        function preloadAround(parent, index) {
            if (!parent) return;
            const slides = parent.children;
            [index, index - 1, index + 1].forEach(i => {
                if (i >= 0 && i < slides.length) {
                    const img = slides[i].querySelector('img');
                    if (img && img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
                }
            });
        }

        function setKeyboardNav(prev, next) {
            keyboardNav.prev = prev;
            keyboardNav.next = next;
        }

        function updateDots(container, index) {
            const dots = container.querySelectorAll('.dot');
            dots.forEach((dot, i) => {
                if (i === index) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        }
        
        function showToast(message) {
            const toast = document.getElementById('toast-notification');
            const msg = document.getElementById('toast-message');
            if (!toast || !msg) return;
            msg.textContent = message;
            toast.classList.remove('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
            }, 3000);
            
            document.getElementById('toast-close').onclick = () => {
                toast.classList.add('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
            };
        }

        // --- КАРУСЕЛЬ ФУНКЦИИ ---
        window.goToSlide = function(dot, index) {
            const container = dot.closest('.inner-carousel-container');
            if(!container) return;
            const carousel = container.querySelector('.inner-carousel');
            const dotsContainer = container.querySelector('.dots-container');
            
            carousel.setAttribute('data-idx', index);
            carousel.style.transform = `translateX(-${index * 100}%)`;
            preloadAround(carousel, index);
            updateDots(container, index);
            
            if(dotsContainer && dotsContainer.children[index]) {
                const activeDot = dotsContainer.children[index];
                const scrollLeft = activeDot.offsetLeft - (dotsContainer.clientWidth / 2) + (activeDot.clientWidth / 2);
                dotsContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        };

        window.nextSlide = function(btn) {
            const container = btn.closest('.inner-carousel-container');
            const carousel = container.querySelector('.inner-carousel');
            const count = carousel.children.length;
            let idx = parseInt(carousel.getAttribute('data-idx') || '0');
            idx = (idx + 1) % count;
            const dot = container.querySelector(`.dot:nth-child(${idx + 1})`);
            window.goToSlide(dot, idx);
            container.focus({ preventScroll: true });
            setKeyboardNav(() => window.prevSlide(btn), () => window.nextSlide(btn));
        };

        window.prevSlide = function(btn) {
            const container = btn.closest('.inner-carousel-container');
            const carousel = container.querySelector('.inner-carousel');
            const count = carousel.children.length;
            let idx = parseInt(carousel.getAttribute('data-idx') || '0');
            idx = (idx - 1 + count) % count;
            const dot = container.querySelector(`.dot:nth-child(${idx + 1})`);
            window.goToSlide(dot, idx);
            container.focus({ preventScroll: true });
            setKeyboardNav(() => window.prevSlide(btn), () => window.nextSlide(btn));
        };

        function showPage(pageToShow) {
            const mainPage = document.getElementById('main-page');
            const detailsPage = document.getElementById('details-page');
            const apartmentDetailsPage = document.getElementById('apartment-details-page');
            const aboutPage = document.getElementById('about-page');
            const rulesPage = document.getElementById('rules-page');

            if (!mainPage.classList.contains('hidden') && pageToShow !== mainPage) {
                lastScrollPosition = window.scrollY;
            }

            [mainPage, detailsPage, apartmentDetailsPage, aboutPage, document.getElementById('rules-page')].forEach(p => p.classList.add('hidden'));
            pageToShow.classList.remove('hidden');
            
            if (pageToShow === mainPage) {
                  history.replaceState(null, null, ' ');
                  requestAnimationFrame(() => {
                      window.scrollTo({ top: lastScrollPosition, behavior: 'auto' });
                      if (myMapInstance) myMapInstance.container.fitToViewport();
                  });
            } else {
                window.scrollTo(0, 0);
            }
        }

        // FULLSCREEN LOGIC (С АНИМАЦИЕЙ)
        function openFullscreen(images, startIndex) {
            document.body.classList.add('gallery-open');
            currentFullscreenImages = images;
            currentFullscreenIndex = startIndex;
            const gallery = document.getElementById('fullscreen-gallery');
            const track = document.getElementById('fullscreen-track');
            
            // Генерируем слайды
            track.innerHTML = images.map(src => `<div class="fullscreen-slide">${pictureTag(src, '', 'Фото', false, '95vw')}</div>`).join('');
            
            // Сдвигаем на нужный слайд
            track.style.transform = `translateX(-${startIndex * 100}%)`;
            preloadAround(track, startIndex);

            renderFullscreenDots();
            gallery.classList.add('active');
            gallery.focus({ preventScroll: true }); 
            history.pushState({modal: true}, '');
        }

        function renderFullscreenDots() {
             const dotsContainer = document.getElementById('fullscreen-dots');
             if(!dotsContainer) return;
             dotsContainer.innerHTML = currentFullscreenImages.map((_, i) => `<div class="dot ${i === currentFullscreenIndex ? 'active' : ''}"></div>`).join('');
             
             const dots = dotsContainer.querySelectorAll('.dot');
             dots.forEach((dot, idx) => {
                 dot.addEventListener('click', (e) => {
                     e.stopPropagation();
                     currentFullscreenIndex = idx;
                     updateFullscreenView();
                 });
             });
        }
        
        function updateFullscreenView() {
            const track = document.getElementById('fullscreen-track');
            track.style.transform = `translateX(-${currentFullscreenIndex * 100}%)`;
            preloadAround(track, currentFullscreenIndex);
            renderFullscreenDots();
        }

        function closeFullscreen() {
            const gallery = document.getElementById('fullscreen-gallery');
            if (gallery.classList.contains('active')) {
                document.body.classList.remove('gallery-open');
                gallery.classList.remove('active');
                if (history.state && history.state.modal) {
                      history.back();
                }
            }
        }

        function nextFullscreenImage(e) {
            if(e) e.stopPropagation();
            currentFullscreenIndex = (currentFullscreenIndex + 1) % currentFullscreenImages.length;
            updateFullscreenView();
        }

        function prevFullscreenImage(e) {
            if(e) e.stopPropagation();
            currentFullscreenIndex = (currentFullscreenIndex - 1 + currentFullscreenImages.length) % currentFullscreenImages.length;
            updateFullscreenView();
        }

        // === 4. ЛОГИКА КАЛЕНДАРЯ ===
        async function loadBookingsForApartment(aptId) {
             try {
                 const response = await fetch(`/api/bookings?apartmentId=${aptId}`);
                 if (!response.ok) throw new Error('Network response was not ok');
                 const data = await response.json();
                 
                 apartmentBookings = data.map(booking => {
                     const startParts = booking.start_date.split('-');
                     const endParts = booking.end_date.split('-');
                     return {
                         start: new Date(startParts[0], startParts[1] - 1, startParts[2]),
                         end: new Date(endParts[0], endParts[1] - 1, endParts[2])
                     };
                 });
             } catch (error) {
                 console.error("Ошибка загрузки броней:", error);
                 showToast("Не удалось загрузить данные о занятости");
                 apartmentBookings = [];
             }
        }

        function resetBookingState() {
             checkInDate = null;
             checkOutDate = null;
             document.getElementById('selected-dates-display').innerHTML = '<span class="font-bold text-blue-600">не выбраны</span>';
             document.getElementById('booking-nights').textContent = '--';
             document.getElementById('booking-sum').textContent = 'Сумма: -- руб.';
             const btn = document.getElementById('initiate-booking-btn');
             btn.disabled = true;
             btn.classList.add('cursor-not-allowed', 'bg-gray-400');
             btn.classList.remove('bg-green-500', 'hover:bg-green-600');
        }

        function renderApartmentCalendar() {
             const calendarContainer = document.getElementById('apartment-details-calendar');
             calendarContainer.innerHTML = '';
             
             const monthsToShow = window.innerWidth >= 768 ? 2 : 1;
             
             // === 1. ЛОГИКА СКРЫТИЯ СТРЕЛОК КАЛЕНДАРЯ ===
             const prevBtn = document.getElementById('apartment-details-calendar-prev');
             const nextBtn = document.getElementById('apartment-details-calendar-next');
             
             // Рассчитываем максимально возможную дату начала (сентябрь минус количество показываемых месяцев)
             const maxStartDate = new Date(CALENDAR_END_DATE);
             maxStartDate.setMonth(maxStartDate.getMonth() - (monthsToShow - 1));
             maxStartDate.setDate(1);

             if (prevBtn) {
                 // Скрываем "Назад", если текущий месяц <= стартовой даты (Май)
                 prevBtn.style.visibility = (currentCalendarDate.getTime() <= getCalendarStartDate().getTime()) ? 'hidden' : 'visible';
             }
             if (nextBtn) {
                 // Скрываем "Вперед", если текущий месяц >= максимальной стартовой даты (чтобы последний месяц был Сентябрь)
                 nextBtn.style.visibility = (currentCalendarDate.getTime() >= maxStartDate.getTime()) ? 'hidden' : 'visible';
             }

             for (let i = 0; i < monthsToShow; i++) {
                 const monthDate = new Date(currentCalendarDate);
                 monthDate.setMonth(monthDate.getMonth() + i);

                 // Не выходим за пределы сезона (последний месяц — CALENDAR_END_DATE)
                 const seasonLastMonthStart = new Date(CALENDAR_END_DATE.getFullYear(), CALENDAR_END_DATE.getMonth(), 1);
                 if (monthDate > seasonLastMonthStart) break;

                 const monthDiv = document.createElement('div');
                 monthDiv.className = 'calendar-container';
                 
                 const monthName = monthDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
                 monthDiv.innerHTML = `<div class="calendar-header">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>`;
                 
                 const grid = document.createElement('div');
                 grid.className = 'calendar';
                 
                 ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d => {
                     grid.innerHTML += `<div class="calendar-day header"><div class="day-number">${d}</div></div>`;
                 });
                 
                 const year = monthDate.getFullYear();
                 const month = monthDate.getMonth();
                 const daysInMonth = new Date(year, month + 1, 0).getDate();
                 let firstDayIndex = new Date(year, month, 1).getDay();
                 firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 
                 
                 for(let j=0; j<firstDayIndex; j++) {
                     grid.innerHTML += `<div class="calendar-day empty"></div>`;
                 }
                 
                 for(let d=1; d<=daysInMonth; d++) {
                     const date = new Date(year, month, d);
                     const el = document.createElement('div');
                     
                     let classes = ['day-number'];
                     let isBooked = false;
                     let isBookedStart = false;
                     let isBookedEnd = false;
                     
                     apartmentBookings.forEach(b => {
                         if (date > b.start && date < b.end) isBooked = true;
                         if (date.getTime() === b.start.getTime()) isBookedStart = true;
                         if (date.getTime() === b.end.getTime()) isBookedEnd = true;
                     });

                     const isPast = date.getTime() < new Date().setHours(0,0,0,0);
                     const parentClass = [];

                     const isSeasonFirst = date.getTime() === CALENDAR_START_DATE.getTime();
                     const isSeasonLast = date.getTime() === CALENDAR_END_DATE.getTime();

                     if (isPast) {
                         // Прошедшие дни всегда серые (даже если были заняты) и без цены
                         parentClass.push('past');
                     }
                     else if (isBooked) parentClass.push('booked');
                     else if (isBookedStart && isBookedEnd) parentClass.push('booked-double');
                     // Занятый крайний день календаря: внешней (зелёной) половинки быть не должно — красим полностью
                     else if (isBookedStart && isSeasonFirst) parentClass.push('booked');
                     else if (isBookedEnd && isSeasonLast) parentClass.push('booked');
                     else if (isBookedStart) parentClass.push('booked-start');
                     else if (isBookedEnd) parentClass.push('booked-end');
                     else parentClass.push('selectable');

                     // Selection Logic
                     if (checkInDate && date.getTime() === checkInDate.getTime()) parentClass.push('selected-start');
                     if (checkOutDate && date.getTime() === checkOutDate.getTime()) parentClass.push('selected-end');
                     if (checkInDate && checkOutDate && date > checkInDate && date < checkOutDate) {
                         if (!isBooked && !isBookedStart && !isBookedEnd) {
                             parentClass.push('in-range');
                         }
                     }

                     el.className = `calendar-day ${parentClass.join(' ')}`;
                     // Цена только если доступно
                     let priceHtml = (!parentClass.includes('booked') && !parentClass.includes('booked-double') && !parentClass.includes('past')) 
                        ? `<div class="day-price">${PRICES_BY_MONTH[month] || 3500}</div>` : '';
                     
                     el.innerHTML = `<div class="${classes.join(' ')}">${d}</div>${priceHtml}`;
                     
                     if (!parentClass.includes('booked') && !parentClass.includes('booked-double') && !parentClass.includes('past')) {
                        el.onclick = () => selectDate(date);
                     }
                     grid.appendChild(el);
                 }
                 monthDiv.appendChild(grid);
                 calendarContainer.appendChild(monthDiv);
             }
        }

        function selectDate(date) {
            // ЛОГИКА ОТМЕНЫ ВЫБОРА (п.1 из предыдущих требований)
            if (checkInDate && date.getTime() === checkInDate.getTime()) {
                resetBookingState();
                renderApartmentCalendar();
                return;
            }
            if (checkOutDate && date.getTime() === checkOutDate.getTime()) {
                resetBookingState();
                renderApartmentCalendar();
                return;
            }

            if (!checkInDate || (checkInDate && checkOutDate)) {
                checkInDate = date;
                checkOutDate = null;
            } else if (date > checkInDate) {
                checkOutDate = date;
                
                let valid = true;
                apartmentBookings.forEach(b => {
                     if (checkInDate < b.end && checkOutDate > b.start) valid = false;
                });
                
                if (!valid) {
                    showToast("Выбранный период пересекается с занятыми датами");
                    checkOutDate = null;
                    checkInDate = null; // СБРОС (согласно требованию)
                    resetBookingState(); 
                } else {
                    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
                    if (nights < 4) {
                        showToast("Минимальный срок бронирования - 4 ночи");
                        // СБРОС (согласно требованию очищать выделение при ошибке)
                        checkOutDate = null;
                        checkInDate = null;
                        resetBookingState();
                    }
                }
            } else {
                checkInDate = date;
            }
            updateBookingUI();
            renderApartmentCalendar();
        }

        function updateBookingUI() {
             const display = document.getElementById('selected-dates-display');
             const btn = document.getElementById('initiate-booking-btn');
             const nightsDisplay = document.getElementById('booking-nights');
             const sumDisplay = document.getElementById('booking-sum');
             
             if (checkInDate && checkOutDate) {
                 display.innerHTML = `${checkInDate.toLocaleDateString()} - ${checkOutDate.toLocaleDateString()}`;
                 const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
                 nightsDisplay.textContent = nights;
                 
                 let totalPrice = 0;
                 let tempDate = new Date(checkInDate);
                 while (tempDate < checkOutDate) {
                     totalPrice += PRICES_BY_MONTH[tempDate.getMonth()] || 3500;
                     tempDate.setDate(tempDate.getDate() + 1);
                 }
                 sumDisplay.textContent = `Сумма: ${totalPrice} руб.`;
                 const prepayment = Math.round(totalPrice * 0.2);
                 sumDisplay.innerHTML = `Сумма: ${totalPrice} руб.<br><span class="text-sm text-blue-500"> Предоплата (20%): ${prepayment} руб.</span>`;
                 
                 if (nights >= 4) {
                     btn.disabled = false;
                     btn.classList.remove('cursor-not-allowed', 'bg-gray-400');
                     btn.classList.add('bg-green-500', 'hover:bg-green-600');
                 } else {
                     btn.disabled = true;
                     btn.classList.add('cursor-not-allowed', 'bg-gray-400');
                     btn.classList.remove('bg-green-500', 'hover:bg-green-600');
                 }
                 
             } else if (checkInDate) {
                 display.innerHTML = `${checkInDate.toLocaleDateString()} - ...`;
                 nightsDisplay.textContent = '--';
                 sumDisplay.textContent = 'Сумма: -- руб.';
                 btn.disabled = true;
                 btn.classList.add('cursor-not-allowed', 'bg-gray-400');
             } else {
                 display.innerHTML = 'не выбраны';
                 nightsDisplay.textContent = '--';
                 sumDisplay.textContent = 'Сумма: -- руб.';
                 btn.disabled = true;
                 btn.classList.add('cursor-not-allowed', 'bg-gray-400');
             }
        }

        // === 5. ОСНОВНОЙ КОД ===
        async function main() {
            // === ФИКС ДЛЯ КЛАВИАТУРЫ (чтобы не вылезала заглушка "переверните телефон") ===
            const handleFocus = () => document.body.classList.add('keyboard-open');
            const handleBlur = () => document.body.classList.remove('keyboard-open');

            // Вешаем обработчики на все существующие и будущие поля ввода
            document.addEventListener('focusin', (e) => {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) handleFocus();
            });
            document.addEventListener('focusout', (e) => {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) handleBlur();
            });
            
            document.addEventListener('keydown', (e) => {
                // === FIX: Если фокус в поле ввода - не перехватываем стрелки ===
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                const gallery = document.getElementById('fullscreen-gallery');
                
                // === FIX: ПРОВЕРКА ОТКРЫТЫХ МОДАЛЬНЫХ ОКОН ===
                const bookingModal = document.getElementById('booking-modal');
                const contactModal = document.getElementById('contact-form-modal');
                const postBookingModal = document.getElementById('post-booking-modal');

                // Если открыта полноэкранная галерея, управляем ей
                if (gallery.classList.contains('active')) {
                    if (e.key === 'Escape') closeFullscreen();
                    if (e.key === 'ArrowRight') nextFullscreenImage();
                    if (e.key === 'ArrowLeft') prevFullscreenImage();
                    return; 
                }

                // === ЕСЛИ ОТКРЫТО ЛЮБОЕ ДРУГОЕ МОДАЛЬНОЕ ОКНО - ЗАПРЕЩАЕМ НАВИГАЦИЮ ПО ФОНУ ===
                if (!bookingModal.classList.contains('hidden') || 
                    !contactModal.classList.contains('hidden') || 
                    !postBookingModal.classList.contains('hidden')) {
                    return; // Просто выходим, ничего не делая
                }

                // Обычная навигация (если ни одно окно не открыто)
                if (e.key === 'ArrowLeft' && keyboardNav.prev) { e.preventDefault(); e.stopPropagation(); keyboardNav.prev(); }
                if (e.key === 'ArrowRight' && keyboardNav.next) { e.preventDefault(); e.stopPropagation(); keyboardNav.next(); }
            });

            const fsGallery = document.getElementById('fullscreen-gallery');
            const fsClose = document.getElementById('fullscreen-close');
            const fsNext = document.getElementById('fullscreen-next');
            const fsPrev = document.getElementById('fullscreen-prev');
            
            // СВАЙПЫ
            addSwipeSupport(fsGallery, () => nextFullscreenImage(), () => prevFullscreenImage());

            fsClose.addEventListener('click', closeFullscreen);
            fsNext.addEventListener('click', nextFullscreenImage);
            fsPrev.addEventListener('click', prevFullscreenImage);
            
            // Клик на фон закрывает (но не на картинку)
            fsGallery.addEventListener('click', (e) => {
                 if(e.target.id === 'fullscreen-gallery' || e.target.id === 'fullscreen-track' || e.target.classList.contains('fullscreen-slide')) {
                     closeFullscreen();
                 }
            });

            window.addEventListener('popstate', (e) => {
                if (fsGallery.classList.contains('active')) { fsGallery.classList.remove('active'); }
            });

            // Элементы
            // Модальные окна
            const bookingModal = document.getElementById('booking-modal');
            const postBookingModal = document.getElementById('post-booking-modal');
            const contactFormModal = document.getElementById('contact-form-modal');
            
            const mainPage = document.getElementById('main-page');
            const detailsPage = document.getElementById('details-page');
            const apartmentDetailsPage = document.getElementById('apartment-details-page');
            const aboutPage = document.getElementById('about-page');
            const rulesPage = document.getElementById('rules-page'); // ADDED

            const aptDetailsTitle = document.getElementById('apartment-details-title');
            const aptDetailsPhotoSlides = document.getElementById('apartment-details-photo-slides');
            const detailsTitle = document.getElementById('details-title');
            const detailsDescription = document.getElementById('details-description');
            const detailsLink = document.getElementById('details-link');
            const detailsPhotoSlidesContainer = document.getElementById('details-photo-slides');

            // Генерация HTML
            const sightsCarousel = document.getElementById('sights-carousel');
            const sightsHTML = Object.keys(sightsData).map(sightId => {
                const data = sightsData[sightId];
                const dotsHTML = data.images.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation(); window.goToSlide(this, ${i})"></div>`).join('');
                return `<div class="carousel-item p-2 group relative min-w-[280px] sm:min-w-[320px]" data-sight-id="${sightId}" onclick="window.showDetailsPage('${sightId}')">
                    <div class="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden h-full transition-transform transform hover:scale-105 cursor-pointer">
                        <div class="inner-carousel-container relative z-10">
                            <div class="inner-carousel transition-transform duration-300" data-idx="0">${data.images.map(src => `<div class="inner-carousel-slide flex-shrink-0 w-full h-full">${pictureTag(src, 'w-full h-full object-cover', '', false)}</div>`).join('')}</div>
                            <button class="inner-nav prev opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); window.prevSlide(this)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button>
                            <button class="inner-nav next opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); window.nextSlide(this)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></button>
                            <div class="dots-container">${dotsHTML}</div>
                        </div>
                        <div class="p-4 relative z-0"><h3 class="font-bold text-center">${data.title}</h3><p class="text-sm text-gray-700 text-justify indent-4">${data.description.substring(0, 50)}...</p></div></div></div>`;
            }).join('');
            sightsCarousel.innerHTML = sightsHTML;

            const apartmentGrid = document.getElementById('apartment-grid');
            const apartmentsHTML = Object.keys(apartmentsData).map(aptId => {
                const data = apartmentsData[aptId];
                const dotsHTML = data.photos.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation(); window.goToSlide(this, ${i})"></div>`).join('');
                return `<div class="apartment-photo-card p-2 group relative" data-apartment-id="${aptId}" onclick="window.showApartmentDetailsPage('${aptId}')">
                    <div class="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden h-full cursor-pointer transition-transform transform hover:scale-105 relative">
                        <div class="inner-carousel-container relative z-10">
                            <div class="inner-carousel transition-transform duration-300" data-idx="0">${data.photos.map(src => `<div class="inner-carousel-slide flex-shrink-0 w-full h-full">${pictureTag(src, 'w-full h-full object-cover', '', false)}</div>`).join('')}</div>
                            <button class="inner-nav prev opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); window.prevSlide(this)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button>
                            <button class="inner-nav next opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); window.nextSlide(this)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></button>
                            <div class="dots-container">${dotsHTML}</div>
                        </div>
                        <div class="p-4 relative z-0"><h3 class="font-bold whitespace-nowrap text-xl md:text-xl text-center overflow-hidden text-ellipsis px-1">${data.name}</h3><p class="hidden md:block text-gray-700 text-justify indent-4">${data.description}</p><button class="md:hidden mt-3 w-full bg-blue-500 text-white px-5 py-2 rounded-full hover:bg-blue-600 transition flex items-center justify-center font-bold">Забронировать</button></div></div></div>`;
            }).join('');
            apartmentGrid.innerHTML = apartmentsHTML;

            const heroCarousel = document.getElementById('hero-carousel');
            if(heroCarousel) {
                let currentHeroIndex = 0;
                heroImages.forEach((src, index) => { const img = document.createElement('img'); img.src = src + '.webp'; img.srcset = `${src}.w1280.webp 1280w, ${src}.webp 2560w`; img.sizes = '100vw'; img.onerror = () => { img.onerror = null; img.removeAttribute('srcset'); img.src = src; }; img.decoding = 'async'; img.className = 'hero-slide'; if (index === 0) img.classList.add('active'); heroCarousel.appendChild(img); });
                setInterval(() => { const slides = heroCarousel.querySelectorAll('.hero-slide'); if(slides.length > 0) { slides[currentHeroIndex].classList.remove('active'); currentHeroIndex = (currentHeroIndex + 1) % slides.length; slides[currentHeroIndex].classList.add('active'); } }, 3000);
            }

            const mobileMenuButton = document.getElementById('mobile-menu-button');
            const mobileMenu = document.getElementById('mobile-menu');
            const closeMenu = () => { if (mobileMenu && !mobileMenu.classList.contains('hidden')) { mobileMenu.classList.add('hidden'); } };
            document.addEventListener('click', (e) => { if (mobileMenu && !mobileMenu.classList.contains('hidden')) { if (!mobileMenu.contains(e.target) && !mobileMenuButton.contains(e.target)) { closeMenu(); } } });
            window.addEventListener('scroll', () => { closeMenu(); });
            if (mobileMenuButton && mobileMenu) mobileMenuButton.addEventListener('click', (e) => { e.stopPropagation(); mobileMenu.classList.toggle('hidden'); });

            // === МЯГКОЕ ПОЯВЛЕНИЕ СЕКЦИЙ ПРИ ПРОКРУТКЕ ===
            // Класс .reveal вешаем из JS, чтобы без JS контент оставался видимым
            if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const revealObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('revealed');
                            revealObserver.unobserve(entry.target);
                        }
                    });
                }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
                document.querySelectorAll('#main-page section').forEach(section => {
                    section.classList.add('reveal');
                    revealObserver.observe(section);
                });
            }

            // MODAL LOCK SCROLL LOGIC
            function openModal(modal) { 
                history.pushState({ modalOpen: true }, '', window.location.hash); 
                modal.classList.remove('hidden'); 
                document.body.classList.add('overflow-hidden'); // LOCK BODY SCROLL
            }

            function closeModalManual(modal) { 
                document.body.classList.remove('overflow-hidden'); // UNLOCK BODY SCROLL
                history.back(); 
            }

            window.addEventListener('popstate', (event) => {
                let modalClosed = false;
                [bookingModal, postBookingModal, contactFormModal].forEach(modal => { 
                    if (!modal.classList.contains('hidden')) { 
                        modal.classList.add('hidden'); 
                        modalClosed = true; 
                        document.body.classList.remove('overflow-hidden'); // UNLOCK ON BACK BUTTON
                        if (modal === postBookingModal) window.location.reload(); 
                    } 
                });
                if (modalClosed) return;
                
                const hash = window.location.hash;
                if (hash.startsWith('#apartment-')) { const aptId = hash.replace('#apartment-', ''); if (apartmentsData[aptId]) window.showApartmentDetailsPage(aptId, false); } 
                else if (hash.startsWith('#sight-')) { const sightId = hash.replace('#sight-', ''); if (sightsData[sightId]) window.showDetailsPage(sightId, false); } 
                // ИЗМЕНЕНИЕ 2: Добавлена обработка хеша #about при загрузке страницы
                else if (hash === '#about') { window.showAboutPage(false); }
                else if (hash === '#rules') { window.showRulesPage(false); }
                else { showPage(mainPage); }
            });
            document.querySelectorAll('.modal-close-btn').forEach(btn => { btn.addEventListener('click', (e) => closeModalManual(e.target.closest('.fixed.inset-0'))); });
            [contactFormModal, bookingModal, postBookingModal].forEach(modal => { if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) closeModalManual(modal); }); });

            const openContactBtn = document.getElementById('open-contact-modal-btn');
            if(openContactBtn) openContactBtn.addEventListener('click', () => openModal(contactFormModal));
            
            const initiateBookingBtn = document.getElementById('initiate-booking-btn');
            if(initiateBookingBtn) initiateBookingBtn.addEventListener('click', () => {
                 const bookingInfo = document.getElementById('booking-modal-info');
                 const bookingSumModal = document.getElementById('modal-booking-sum');
                 if(bookingInfo && currentApartmentId && apartmentsData[currentApartmentId] && checkInDate && checkOutDate) {
                     bookingInfo.textContent = `Бронирование: ${apartmentsData[currentApartmentId].name} (${checkInDate.toLocaleDateString()} - ${checkOutDate.toLocaleDateString()})`;
                     const sumText = document.getElementById('booking-sum').textContent;
                     bookingSumModal.textContent = sumText;
                 }
                 openModal(bookingModal);
            });

            // 1. Форма Бронирования (итоговая правильная версия)
            document.getElementById('bookingForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('booking-submit-button');
                const statusDiv = document.getElementById('booking-form-status');
                
                // Сбор данных из полей
                const name = document.getElementById('booking-name').value;
                const phone = document.getElementById('booking-phone').value;
                const email = document.getElementById('booking-email').value; // Новое поле
                const telegram = document.getElementById('booking-telegram').value;
                const message = document.getElementById('booking-message').value;
                const adults = document.getElementById('booking-adults').value;
                const children = document.getElementById('booking-children').value;
                const consent = document.getElementById('booking-consent').checked; // Чекбокс согласия
                
                // 1. Валидация обязательных полей и корректности Email
                if (!name || name.trim() === '' || !phone || phone.trim() === '' || !email || !email.includes('@')) {
                    statusDiv.textContent = 'Пожалуйста, заполните обязательные поля (*) и корректный Email!';
                    statusDiv.className = 'mb-4 text-center text-red-600 font-bold';
                    return;
                }

                // 2. Проверка согласия на обработку данных
                if (!consent) {
                    statusDiv.textContent = 'Необходимо Ваше согласие на обработку данных!';
                    statusDiv.className = 'mb-4 text-center text-red-600 font-bold';
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Отправка...';
                statusDiv.textContent = '';
                
                const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                
                // 3. Расчет итоговой стоимости (totalPrice)
                let totalPrice = 0;
                let tempDateForm = new Date(checkInDate);
                while (tempDateForm < checkOutDate) {
                    totalPrice += PRICES_BY_MONTH[tempDateForm.getMonth()] || 3500;
                    tempDateForm.setDate(tempDateForm.getDate() + 1);
                }

                // 4. Формирование объекта для отправки
                const payload = {
                    apartmentId: currentApartmentId, 
                    apartmentName: apartmentsData[currentApartmentId].name,
                    startDate: formatDate(checkInDate), 
                    endDate: formatDate(checkOutDate),
                    name: name, 
                    phone: phone, 
                    email: email, // Добавлено
                    telegram: telegram, 
                    message: message,
                    adults: adults,
                    children: children,
                    totalPrice: totalPrice
                };

                try {
                    // 5. Отправка данных на сервер
                    const response = await fetch('/api/book', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(payload) 
                    });

                    if (response.ok) {
                        // Успешное завершение: закрываем форму, показываем модальное окно спасибо
                        document.getElementById('booking-modal').classList.add('hidden');
                        document.getElementById('post-booking-modal').classList.remove('hidden');
                        e.target.reset(); // Очистка формы
                        
                        // Обновляем календарь (загружаем новые брони)
                        loadBookingsForApartment(currentApartmentId).then(() => renderApartmentCalendar());
                    } else { 
                        throw new Error('Ошибка сервера'); 
                    }
                } catch (err) {
                    statusDiv.textContent = 'Ошибка отправки. Попробуйте позже или свяжитесь с нами напрямую';
                    statusDiv.className = 'mt-4 text-center text-red-600';
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Отправить заявку';
                }
            });

            // 2. Форма Контактов (итоговая версия для главной страницы)
            document.getElementById('contactForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('submit-button');
                const statusDiv = document.getElementById('form-status');
                
                // Сбор данных из полей
                const name = document.getElementById('name').value;
                const phone = document.getElementById('phone').value;
                const email = document.getElementById('contact-email').value; // Новое поле
                const msg = document.getElementById('message').value;
                const telegram = document.getElementById('telegram').value;
                const consent = document.getElementById('contact-consent').checked; // Чекбокс согласия
                
                // 1. Валидация (обязательно Имя, Телефон, Почта и Сообщение)
                if (!name || !phone || !email || !email.includes('@') || !msg) {
                      statusDiv.textContent = 'Пожалуйста, заполните обязательные поля (*) и корректный Email!';
                      statusDiv.className = 'mb-4 text-center text-red-600 font-bold';
                      return;
                }

                // 2. Проверка галочки согласия
                if (!consent) {
                    statusDiv.textContent = 'Необходимо Ваше согласие на обработку данных!';
                    statusDiv.className = 'mb-4 text-center text-red-600 font-bold';
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Отправка...';
                statusDiv.textContent = '';

                // 3. Формируем объект (добавляем email)
                const payload = { 
                    name: name, 
                    phone: phone, 
                    email: email, // Передаем почту на сервер
                    telegram: telegram, 
                    message: msg 
                };

                try {
                    // 4. Отправка на сервер
                    const response = await fetch('/api/contact', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(payload) 
                    });

                    if (response.ok) {
                        // Успех: закрываем форму и показываем окно благодарности
                        document.getElementById('contact-form-modal').classList.add('hidden');
                        document.getElementById('post-booking-modal').classList.remove('hidden'); 
                        e.target.reset(); // Очистка полей
                    } else { 
                        throw new Error('Ошибка сервера'); 
                    }
                } catch (err) {
                    statusDiv.textContent = 'Ошибка отправки. Попробуйте позже.';
                    statusDiv.className = 'mt-4 text-center text-red-600';
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Отправить';
                }
            });

            document.querySelectorAll('.nav-link').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault(); if(mobileMenu) mobileMenu.classList.add('hidden');
                    const target = this.getAttribute('href');
                    if (target === '#about') { window.showAboutPage(); } 
                    else if (target === '#rules') { window.showRulesPage(); }
                    else { showPage(mainPage); setTimeout(() => { const targetElement = document.querySelector(target); if (targetElement) { targetElement.scrollIntoView({ behavior: 'smooth' }); } }, 50); }
                });
            });
            document.querySelectorAll('#back-to-main-from-sight, #back-to-main-from-apt, #back-to-main-from-about').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); history.back(); }));

            const titleElement = document.getElementById('home-link');
            if (titleElement) {
                titleElement.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    // Если анимация уже идет, игнорируем повторные клики
                    if (this.classList.contains('click-anim')) return;
                    
                    // Запускаем красивую волну и градиент
                    this.classList.add('click-anim');
                    
                    // Ждем 1 секунду, чтобы волна успела пробежать по всем буквам
                    setTimeout(() => {
                        this.classList.remove('click-anim'); // очищаем класс
                        
                        // Выполняем стандартное действие (переход на главную или обновление)
                        if (document.getElementById('main-page').classList.contains('hidden')) { 
                            window.location.href = window.location.origin + window.location.pathname; 
                        } else { 
                            if (window.scrollY > 10) { 
                                window.scrollTo({ top: 0, behavior: 'smooth' }); 
                                setTimeout(() => { window.location.reload(); }, 600); 
                            } else { 
                                window.location.reload(); 
                            } 
                        }
                    }, 1000); // 1000 миллисекунд = 1 секунда удовольствия
                });
            }
            
            window.showAboutPage = function(pushHistory = true) { if (pushHistory) window.location.hash = 'about'; showPage(document.getElementById('about-page')); }
            
            const backRulesBtn = document.getElementById('back-to-main-from-rules');
            if(backRulesBtn) backRulesBtn.addEventListener('click', (e) => { e.preventDefault(); history.back(); });

            window.showRulesPage = function(pushHistory = true) { 
                if (pushHistory) window.location.hash = 'rules'; 
                showPage(document.getElementById('rules-page')); 
            }

            const sCarousel = document.getElementById('sights-carousel');
            const sPrev = document.getElementById('sights-prev');
            const sNext = document.getElementById('sights-next');
            function checkScroll() { const maxScroll = sCarousel.scrollWidth - sCarousel.clientWidth; sPrev.classList.toggle('disabled', sCarousel.scrollLeft <= 10); sNext.classList.toggle('disabled', sCarousel.scrollLeft >= maxScroll - 10); }
            const sScrollLeft = () => { sCarousel.scrollBy({ left: -320, behavior: 'smooth' }); setKeyboardNav(sScrollLeft, sScrollRight); };
            const sScrollRight = () => { sCarousel.scrollBy({ left: 320, behavior: 'smooth' }); setKeyboardNav(sScrollLeft, sScrollRight); };
            sPrev.addEventListener('click', sScrollLeft); sNext.addEventListener('click', sScrollRight); sCarousel.addEventListener('scroll', checkScroll); checkScroll(); window.addEventListener('resize', checkScroll);

            // ===============================================
            // ФУНКЦИИ ПЕРЕКЛЮЧЕНИЯ (КВАРТИРЫ И ДОСТОПРИМЕЧАТЕЛЬНОСТИ)
            // ===============================================

            // Массивы ID для навигации
            const allApartmentIds = Object.keys(apartmentsData);
            const allSightIds = Object.keys(sightsData);

            window.showApartmentDetailsPage = function(aptId, pushHistory = true) {
                currentApartmentId = aptId;
                const data = apartmentsData[aptId];
                if (!data) return;
                
                if (pushHistory) window.location.hash = 'apartment-' + aptId;
                aptDetailsTitle.textContent = data.name;
                
                // === НАСТРОЙКА НАВИГАЦИИ (СТРЕЛКИ + КЛАВИАТУРА) ===
                const currentIndex = allApartmentIds.indexOf(aptId);
                const prevAptId = allApartmentIds[(currentIndex - 1 + allApartmentIds.length) % allApartmentIds.length];
                const nextAptId = allApartmentIds[(currentIndex + 1) % allApartmentIds.length];
                
                const navPrev = document.getElementById('apartment-details-prev');
                const navNext = document.getElementById('apartment-details-next');
                
                const goPrev = () => window.showApartmentDetailsPage(prevAptId);
                const goNext = () => window.showApartmentDetailsPage(nextAptId);
                
                navPrev.onclick = goPrev;
                navNext.onclick = goNext;
                
                // Устанавливаем клавиши для переключения квартир (пока не кликнули на карусель)
                setKeyboardNav(goPrev, goNext);

                // === 2.1 СВАЙП ПО ЗАГОЛОВКУ (ДЛЯ КВАРТИР) ===
                // Добавляем поддержку свайпа к заголовку квартиры
                addSwipeSupport(aptDetailsTitle, goNext, goPrev);

                const prev = document.getElementById('apartment-details-photo-prev');
                const next = document.getElementById('apartment-details-photo-next');
                const dots = document.getElementById('apartment-details-dots');
                setupCarousel(aptDetailsPhotoSlides, prev, next, data.photos, (src, alt) => `<div class="details-photo-slide">${pictureTag(src, '', alt, false)}</div>`, dots);
                const slideImages = aptDetailsPhotoSlides.querySelectorAll('img');
                slideImages.forEach((img, idx) => { img.style.cursor = 'zoom-in'; img.addEventListener('click', (e) => { e.stopPropagation(); openFullscreen(data.photos, idx); }); });
                
                showPage(apartmentDetailsPage);
                
                const calendarWrapper = document.getElementById('calendar-wrapper');
                const bookingSection = document.getElementById('booking-section');
                calendarWrapper.innerHTML = `<div id="loading-calendar" class="text-center p-4">Загрузка календаря...</div>`;
                currentCalendarDate = getCalendarStartDate();
                loadBookingsForApartment(aptId).then(() => {
                    calendarWrapper.innerHTML = `<div class="relative"><div id="apartment-details-calendar" class="grid grid-cols-1 md:grid-cols-2 gap-x-8" tabindex="0" style="outline:none;"></div><button id="apartment-details-calendar-prev" class="calendar-arrow-styled"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button><button id="apartment-details-calendar-next" class="calendar-arrow-styled"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></button></div>`;
                    const calNext = document.getElementById('apartment-details-calendar-next');
                    const calPrev = document.getElementById('apartment-details-calendar-prev');
                    const calContainer = document.getElementById('apartment-details-calendar');
                    if(calContainer) addSwipeSupport(calContainer, handleNextMonth, handlePrevMonth);
                    calContainer.onclick = () => calContainer.focus({ preventScroll: true });
                    function handleNextMonth() { 
                        const nextMonth = new Date(currentCalendarDate); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(1); 
                        const monthsToShow = window.innerWidth >= 768 ? 2 : 1; const maxStartDate = new Date(CALENDAR_END_DATE); maxStartDate.setMonth(maxStartDate.getMonth() - (monthsToShow - 1)); maxStartDate.setDate(1); 
                        if (nextMonth <= maxStartDate) { currentCalendarDate = nextMonth; renderApartmentCalendar(); setKeyboardNav(handlePrevMonth, handleNextMonth); calContainer.focus({ preventScroll: true }); }
                    };
                    function handlePrevMonth() { 
                        const prevMonth = new Date(currentCalendarDate); prevMonth.setMonth(prevMonth.getMonth() - 1); prevMonth.setDate(1); 
                        if (prevMonth >= getCalendarStartDate()) { currentCalendarDate = prevMonth; renderApartmentCalendar(); setKeyboardNav(handlePrevMonth, handleNextMonth); calContainer.focus({ preventScroll: true }); }
                    };
                    calNext.addEventListener('click', () => { handleNextMonth(); }); calPrev.addEventListener('click', () => { handlePrevMonth(); });
                    bookingSection.style.display = 'block'; resetBookingState(); renderApartmentCalendar();
                });
            }

            window.showDetailsPage = function(sightId, pushHistory = true) { 
                currentSightId = sightId; const data = sightsData[sightId]; if (!data) return; 
                if (pushHistory) window.location.hash = 'sight-' + sightId; 
                if(detailsTitle) detailsTitle.textContent = data.title; if(detailsDescription) detailsDescription.innerHTML = data.description; 
                if(detailsLink) { detailsLink.href = data.link; if (sightId === 'diva' || sightId === 'sun_temple') { detailsLink.textContent = "Показать на карте"; } else { detailsLink.textContent = "Официальный сайт"; } }
                
                // === НАСТРОЙКА НАВИГАЦИИ (СТРЕЛКИ + КЛАВИАТУРА) ===
                const currentIndex = allSightIds.indexOf(sightId);
                const prevSightId = allSightIds[(currentIndex - 1 + allSightIds.length) % allSightIds.length];
                const nextSightId = allSightIds[(currentIndex + 1) % allSightIds.length];

                const navPrev = document.getElementById('details-prev');
                const navNext = document.getElementById('details-next');

                const goPrev = () => window.showDetailsPage(prevSightId);
                const goNext = () => window.showDetailsPage(nextSightId);

                navPrev.onclick = goPrev;
                navNext.onclick = goNext;

                // Устанавливаем клавиши для переключения достопримечательностей
                setKeyboardNav(goPrev, goNext);

                // === 2.2 СВАЙП ПО ЗАГОЛОВКУ И ОПИСАНИЮ (ДЛЯ ДОСТОПРИМЕЧАТЕЛЬНОСТЕЙ) ===
                // Добавляем поддержку свайпа к заголовку
                addSwipeSupport(detailsTitle, goNext, goPrev);
                
                // Находим контейнер с описанием и ссылкой (правая колонка в grid)
                const descContainer = detailsDescription.parentElement; 
                if (descContainer) {
                    addSwipeSupport(descContainer, goNext, goPrev);
                }


                const prev = document.getElementById('details-photo-prev'); const next = document.getElementById('details-photo-next'); const dots = document.getElementById('details-dots');
                setupCarousel(detailsPhotoSlidesContainer, prev, next, data.images, (src, alt) => `<div class="details-photo-slide">${pictureTag(src, '', alt, false)}</div>`, dots); 
                const slideImages = detailsPhotoSlidesContainer.querySelectorAll('img'); slideImages.forEach((img, idx) => { img.style.cursor = 'zoom-in'; img.addEventListener('click', (e) => { e.stopPropagation(); openFullscreen(data.images, idx); }); });
                showPage(detailsPage); 
            }

            const hash = window.location.hash;
            if (hash) { 
                if (hash.startsWith('#apartment-')) { const aptId = hash.replace('#apartment-', ''); if (apartmentsData[aptId]) window.showApartmentDetailsPage(aptId, false); } 
                else if (hash.startsWith('#sight-')) { const sightId = hash.replace('#sight-', ''); if (sightsData[sightId]) window.showDetailsPage(sightId, false); } 
                // ИЗМЕНЕНИЕ 2: Добавлена обработка хеша #about при загрузке страницы
                else if (hash === '#about') { window.showAboutPage(false); }
                else if (hash === '#rules') { window.showRulesPage(false); }
            }

            if (typeof ymaps !== 'undefined') {
                ymaps.ready(() => {
                    const mapCenter = [44.396062, 33.969208]; myMapInstance = new ymaps.Map("map", { center: mapCenter, zoom: 17, controls: ['zoomControl', 'fullscreenControl', 'typeSelector'] });
                    const BalloonContentLayout = ymaps.templateLayoutFactory.createClass('<div style="width: 320px; min-height: 120px;" class="p-4 font-sans relative bg-white rounded-xl shadow-lg"><h3 class="text-lg font-bold text-gray-800 mb-2 leading-tight pr-6">В облаках Крыма</h3><div class="my-3 space-y-2"><p class="text-sm text-gray-600 leading-snug flex items-start"><span class="mr-1">📍</span> пгт. Кацивели, ул. Академика Шулейкина, д. 53</p><div class="flex items-center text-sm text-gray-600">📞 <a href="tel:+79093553729" class="text-blue-500 font-bold hover:underline mr-2">+7 (909) 355-37-29</a><a href="https://t.me/+79093553729" target="_blank" class="text-sky-500 hover:text-sky-600 transition-transform hover:scale-110 inline-block align-middle ml-1" style="display:inline-block; vertical-align:middle; transition: transform 0.2s;"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-1.37.2-1.64l16.4-5.99c.75-.27 1.45.24 1.2 1.12l-2.43 11.4c-.22.99-1.01 1.24-1.74.77l-4.93-3.6-2.4 2.31c-.26.26-.6.39-.94.26z"></path></svg></a></div></div><div class="flex gap-2 mt-4 pb-1"><a href="https://yandex.ru/maps/?rtext=~44.396062,33.969208" target="_blank" class="bg-yellow-400 hover:bg-yellow-500 text-black py-2 px-3 rounded-full text-center text-xs font-bold uppercase transition flex-1 flex items-center justify-center shadow-md">🚖 Маршрут</a><a href="#apartments" class="bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-full text-center text-xs font-bold uppercase transition flex-1 flex items-center justify-center shadow-md" onclick="event.preventDefault(); document.getElementById(\'apartments\').scrollIntoView({ behavior: \'smooth\' });">🏠 Квартиры</a></div></div>');
                    // Добавляем стиль для hover эффекта в балуне программно, так как класс сложнее прокинуть
                    const style = document.createElement('style');
                    style.innerHTML = `.text-sky-500:hover { transform: scale(1.1); }`;
                    document.head.appendChild(style);
                    
                    const myPlacemark = new ymaps.Placemark(mapCenter, {}, { balloonContentLayout: BalloonContentLayout, preset: 'islands#blueHomeIcon', hideIconOnBalloonOpen: false, balloonPanelMaxMapArea: 0 });
                    myMapInstance.geoObjects.add(myPlacemark);
                });
            }

            function setupCarousel(container, prevBtn, nextBtn, items, renderFunc, dotsContainer = null) { 
                if (!container) return; 
                if (container.autoSlideInterval) clearInterval(container.autoSlideInterval);
                container.setAttribute('tabindex', '0'); container.style.outline = 'none';
                let currentIndex = 0; container.innerHTML = items.map(renderFunc).join(''); 
                let dots = [];
                if (dotsContainer) {
                    dotsContainer.innerHTML = items.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
                    dots = dotsContainer.querySelectorAll('.dot');
                    dots.forEach((dot, index) => { dot.addEventListener('click', (e) => { e.stopPropagation(); currentIndex = index; update(); container.focus({ preventScroll: true }); }); });
                }
                const update = () => { container.style.transform = `translateX(-${currentIndex * 100}%)`; preloadAround(container, currentIndex); if (dots.length > 0) { dots.forEach(d => d.classList.remove('active')); if(dots[currentIndex]) { const activeDot = dots[currentIndex]; activeDot.classList.add('active'); const scrollLeft = activeDot.offsetLeft - (dotsContainer.clientWidth / 2) + (activeDot.clientWidth / 2); dotsContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' }); } } }; 
                const handleNext = () => { currentIndex = (currentIndex + 1) % items.length; update(); container.focus({ preventScroll: true }); setKeyboardNav(handlePrev, handleNext); }; 
                const handlePrev = () => { currentIndex = (currentIndex - 1 + items.length) % items.length; update(); container.focus({ preventScroll: true }); setKeyboardNav(handlePrev, handleNext); }; 
                
                // === ИСПРАВЛЕНИЕ: УБРАНО КЛОНИРОВАНИЕ КНОПОК ===
                // Клонирование кнопок создавало лишнюю нагрузку на DOM и могло вызывать "зависание"
                // Теперь мы просто переназначаем обработчики событий (старые затираются автоматически, т.к. мы присваиваем onclick)
                
                // Сохраняем ссылки на кнопки
                // (В предыдущем коде мы клонировали, теперь просто используем переданные элементы)
                
                // Чтобы избежать накопления слушателей через addSwipeSupport (который внутри вызывает click), 
                // мы просто используем свойство onclick, которое перезаписывается. 
                // Для свайпов используем уже оптимизированную addSwipeSupport.

                nextBtn.onclick = (e) => { e.stopPropagation(); handleNext(); container.focus({ preventScroll: true }); }; 
                prevBtn.onclick = (e) => { e.stopPropagation(); handlePrev(); container.focus({ preventScroll: true }); }; 
                
                container.onclick = () => container.focus({ preventScroll: true });
                container.onkeydown = (e) => { if (e.key === 'ArrowRight') { e.stopPropagation(); handleNext(); } if (e.key === 'ArrowLeft') { e.stopPropagation(); handlePrev(); } };
                
                // Добавляем поддержку свайпов (функция сама очистит старые слушатели)
                addSwipeSupport(container, () => { handleNext(); }, () => { handlePrev(); });
                
                update(); 
            }
            
            // === ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ ДЛЯ УСТРАНЕНИЯ УТЕЧЕК ПАМЯТИ ===
            // Удаляет старые обработчики перед добавлением новых
            function addSwipeSupport(element, onNext, onPrev) {
                // Если обработчики уже были, удаляем их
                if (element._touchStartHandler) {
                    element.removeEventListener('touchstart', element._touchStartHandler);
                }
                if (element._touchEndHandler) {
                    element.removeEventListener('touchend', element._touchEndHandler);
                }

                let touchStartX = 0; 
                let touchEndX = 0;
                
                // Создаем новые обработчики
                const handleStart = (e) => { 
                    touchStartX = e.changedTouches[0].screenX; 
                };
                
                const handleEnd = (e) => { 
                    touchEndX = e.changedTouches[0].screenX; 
                    if (touchEndX < touchStartX - 50) onNext(); 
                    if (touchEndX > touchStartX + 50) onPrev(); 
                };

                // Сохраняем ссылки на функции в свойстве элемента
                element._touchStartHandler = handleStart;
                element._touchEndHandler = handleEnd;

                // Добавляем новые слушатели
                element.addEventListener('touchstart', handleStart, {passive: true});
                element.addEventListener('touchend', handleEnd, {passive: true});
            }

            setTimeout(() => { 
                document.querySelectorAll('.inner-carousel-container').forEach(container => { 
                    const carousel = container.querySelector('.inner-carousel'); 
                    
                    // Находим родительский элемент (карточку) для поиска кнопок
                    const card = container.closest('.carousel-item, .apartment-photo-card');
                    
                    // Находим кнопки внутри контейнера или через родителя
                    let nextBtn = container.querySelector('.next');
                    let prevBtn = container.querySelector('.prev');
                    
                    if(carousel && nextBtn && prevBtn) {
                        // Подгружаем второй кадр заранее, чтобы первый свайп был плавным
                        preloadAround(carousel, 0);
                        // Свайп на самой картинке (уже был)
                        addSwipeSupport(carousel, () => nextBtn.click(), () => prevBtn.click());
                        
                        // === 2.3 СВАЙП НА ТЕКСТЕ КАРТОЧКИ (НА ГЛАВНОЙ) ===
                        // Добавляет переключение фоток при свайпе по тексту на главной
                        if (card) {
                            if (card.classList.contains('apartment-photo-card')) {
                                const textContainer = card.querySelector('.p-4');
                                if (textContainer) {
                                    addSwipeSupport(textContainer, () => nextBtn.click(), () => prevBtn.click());
                                }
                            }
                        }
                    } 
                }); 
            }, 100);
        }
        document.addEventListener('DOMContentLoaded', main);
