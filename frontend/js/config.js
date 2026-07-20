// =============================================================
// КОНФИГ САЙТА «В облаках Крыма»
// Здесь меняются данные без правки логики: квартиры, достопримечательности,
// даты сезона и цены по месяцам. Загружается ПЕРЕД app.js.
// =============================================================

// --- Квартиры, достопримечательности, фото главного экрана ---
        const apartmentsData = {
            'breeze': { 
                name: 'Квартира "Морской бриз"', 
                description: 'Светлые апартаменты площадью 40 м² подарят вам великолепные виды на бескрайнее море и горные вершины. Пространство продумано до мелочей и оборудовано всей нужной техникой. Отличный выбор для комфортного семейного отдыха с детьми.', 
                photos: ['img/1/common.jpg', 'img/1/all1.jpg', 'img/1/all2.jpg', 'img/1/all3.jpg', 'img/1/all4.jpg', 'img/1/bathroom1.jpg', 'img/1/bedroom1.jpg', 'img/1/bedroom2.jpg', 'img/1/hanger1.jpg', 'img/1/hanger2.jpg', 'img/1/wardrobe1.jpg', 'img/1/view1.jpg', 'img/2/view2.jpg', 'img/common/house.jpg', 'img/common/pavilion1.jpg', 'img/common/pavilion2.jpg', 'img/common/pavilion3.jpg', 'img/common/parking.jpg', 'img/common/view1.jpg', 'img/common/view2.jpg', 'img/common/view4.jpg', 'img/common/view6.jpg', 'img/common/view7.jpg', 'img/common/view8.jpg'] 
            },
            'mountain': { 
                name: 'Квартира "Горный воздух"', 
                description: 'Эта квартира (40 м²) очарует вас чистейшим воздухом и панорамами моря в сочетании с зеленью заповедника. Внутри подготовлено абсолютно всё для беззаботного проживания. Прекрасный вариант для тех, кто путешествует всей семьёй.', 
                photos: ['img/2/all1.jpg', 'img/2/common.jpg', 'img/2/bathroom1.jpg', 'img/2/bathroom2.jpg', 'img/2/bedroom1.jpg', 'img/2/bedroom2.jpg', 'img/2/kitchen1.jpg', 'img/2/view1.jpg', 'img/2/view2.jpg', 'img/common/house.jpg', 'img/common/pavilion1.jpg', 'img/common/pavilion2.jpg', 'img/common/pavilion3.jpg', 'img/common/parking.jpg', 'img/common/view1.jpg', 'img/common/view2.jpg', 'img/common/view4.jpg', 'img/common/view6.jpg', 'img/common/view7.jpg', 'img/common/view8.jpg'] 
            },
            'sunny': { 
                name: 'Квартира "Солнечная"', 
                description: 'Теплая и уютная квартира на 40 м² с завораживающим видом на морское побережье и горы. Полная комплектация мебелью и современной бытовой техникой гарантирует домашний уют. Идеальное решение для спокойного отпуска с малышами.', 
                photos: ['img/3/bedroom1.jpg', 'img/3/bedroom2.jpg', 'img/3/all1.jpg', 'img/3/bathroom1.jpg', 'img/3/kitchen1.jpg', 'img/common/house.jpg', 'img/common/pavilion1.jpg', 'img/common/pavilion2.jpg', 'img/common/pavilion3.jpg', 'img/common/parking.jpg', 'img/common/view1.jpg', 'img/common/view2.jpg', 'img/common/view4.jpg', 'img/common/view6.jpg', 'img/common/view7.jpg', 'img/common/view8.jpg'] 
            },
            'zapovednik': { 
                name: 'Квартира "Заповедник"', 
                description: 'Просторная квартира 40 м², где окна выходят на живописный природный заповедник и море. Квартира обставлена стильной мебелью и техникой для вашего максимального удобства. Замечательное место для гармоничного семейного отдыха.', 
                photos: ['img/4/view1.jpg', 'img/4/all1.jpg', 'img/4/all2.jpg', 'img/4/bathroom1.jpg', 'img/4/bedroom2.jpg', 'img/4/bedroom3.jpg', 'img/4/bedroom4.jpg', 'img/4/bedroom5.jpg', 'img/4/wardrobe1.jpg', 'img/4/view2.jpg', 'img/common/house.jpg', 'img/common/pavilion1.jpg', 'img/common/pavilion2.jpg', 'img/common/pavilion3.jpg', 'img/common/parking.jpg', 'img/common/view1.jpg', 'img/common/view2.jpg', 'img/common/view4.jpg', 'img/common/view6.jpg', 'img/common/view7.jpg', 'img/common/view8.jpg'] 
            }
        };
        
        const sightsData = {
            'aquapark': { title: 'Аквапарк "Симеиз"', description: 'Единственный в Крыму аквапарк с настоящей морской водой, расположенный у подножия живописной горы Кошка. Вас ждут захватывающие горки, волновой бассейн и зоны отдыха для всей семьи.', images: ['img/simeiz/1.png', 'img/simeiz/2.png'], link: 'https://aquapark-simeiz.ru/' },
            'observatory': { title: 'Крымская астрофизическая обсерватория', description: 'Легендарный научный центр в горах, где можно прикоснуться к тайнам Вселенной. Вас ждут увлекательные ночные экскурсии и наблюдение за звездами в мощные телескопы. Идеальное место для романтики и познавательного отдыха.', images: ['img/observatory/1.png', 'img/observatory/2.png'], link: 'https://обсерватория.симеиз.ялта.рф/' },
            'diva': { title: 'Скала Дива и гора Кошка', description: 'Знаменитые природные символы Южного берега Крыма, овеянные древними легендами. Преодолейте ступени на вершину скалы Дива, чтобы увидеть море с высоты птичьего полета. Живописный массив горы Кошка очарует вас реликтовой зеленью и фантастическими видами на Симеиз.', images: ['img/koshkadiva/1.png', 'img/koshkadiva/2.png'], link: 'https://yandex.ru/profile/92812290540?lang=ru' },
            'vorontsov': { title: 'Воронцовский дворец', description: 'Архитектурная жемчужина Крыма у подножия Ай-Петри, где английская строгость переплетается с восточным колоритом. Прогуляйтесь по роскошным залам дворца и тенистым аллеям знаменитого парка с водопадами и лебедиными озерами. Величие природы и истории здесь сливаются воедино.', images: ['img/vorontsov/1.png', 'img/vorontsov/2.png'], link: 'https://worontsovpalace.ru/' },
            'ai-petri': { title: 'Небесная тропа на Ай-Петри', description: 'Пройдите по подвесным мостам над живописной пропастью у знаменитых зубцов Ай-Петри. Это безопасный источник адреналина, который подарит вам ощущение полёта и невероятные виды на всё побережье. С высоты 1234 метра открывается лучшая панорама для ваших самых эффектных фотографий.', images: ['img/aipetri/1.png', 'img/aipetri/2.png'], link: 'https://aipetri.land/' },
            'swallow': { title: 'Ласточкино гнездо', description: 'Главный символ Крыма, словно парящий между небом и морем на краю отвесной 40-метровой скалы. Этот миниатюрный готический замок поражает своим изяществом и захватывающими дух видами на морскую бездну. Прикоснитесь к легенде и сделайте незабываемые фотографии в самом живописном месте побережья.', images: ['img/swallow/1.png', 'img/swallow/2.png'], link: 'https://замок-ласточкино-гнездо.рф/' },
            'foros': { title: 'Форосская церковь', description: 'Белоснежный храм, венчающий вершину отвесной Красной скалы на высоте более 400 метров над морем. С его смотровой площадки открывается невероятная панорама побережья, от которой захватывает дух. Посетите это намоленное место силы, чтобы насладиться тишиной и величием крымской природы.', images: ['img/foros/1.png', 'img/foros/2.png'], link: 'https://vk.com/hramvoskreseniyaxristova' },
            'livadia': { title: 'Ливадийский дворец', description: 'Белоснежная летняя резиденция последнего российского императора, утопающая в зелени старинного парка. Восхититесь изяществом итальянской архитектуры и прогуляйтесь по залам, где вершилась мировая история. Здесь царская роскошь гармонично сочетается с уютом и красотой южного берега.', images: ['img/livadia/1.png', 'img/livadia/2.png'], link: 'http://ливадийский-дворец.рф/' },
            'nikitsky': { title: 'Никитский ботанический сад', description: 'Зеленая сокровищница Крыма, собравшая тысячи экзотических растений со всех уголков планеты. Прогуляйтесь по благоухающим аллеям и посетите знаменитые Балы цветов, сменяющие друг друга круглый год. Это идеальное место для неспешных прогулок и единения с живой природой.', images: ['img/nikitskiy/1.png', 'img/nikitskiy/2.png'], link: 'https://nikitasad.ru/' },
            'massandra': { title: 'Массандровский дворец', description: 'Самый загадочный и романтичный дворец Крыма, напоминающий сказочный рыцарский замок посреди густого леса. Его уникальная архитектура в стиле французского Возрождения перенесет вас в атмосферу старой Европы. Насладитесь тишиной и красотой этого уединенного императорского имения.', images: ['img/massandra/1.png', 'img/massandra/2.png'], link: 'https://worontsovpalace.ru/massandrovskij-dvorecz-kontakty/' },
            'sun_temple': { title: 'Храм Солнца (Ласпи)', description: 'Загадочный природный комплекс, напоминающий раскрытый каменный цветок на вершине горы. Это знаменитое место силы, где путешественники загадывают сокровенные желания и заряжаются энергией. Вас ждут захватывающие дух виды на бухту Ласпи и ощущение полного единения с природой.', images: ['img/suntemple/1.png', 'img/suntemple/2.png'], link: 'https://yandex.ru/profile/72410646387?lang=ru' },
            'balaklava_museum': { title: 'Балаклавский подземный музей', description: 'Бывшая сверхсекретная база подводных лодок, скрытая в недрах горы Таврос. Исследуйте гигантские подземные тоннели и каналы этого уникального памятника Холодной войны. Погрузитесь в атмосферу тайны и инженерной мощи, от которой захватывает дух.', images: ['img/balaklavamuseum/1.png', 'img/balaklavamuseum/2.png'], link: 'https://muzey-sevastopol.ru/' }
        };
        const heroImages = ['img/common/house.jpg', 'img/common/view1.jpg', 'img/common/view2.jpg', 'img/common/view3.jpg', 'img/common/view4.jpg', 'img/common/view5.jpg', 'img/common/view6.jpg', 'img/common/view7.jpg', 'img/common/view8.jpg'];

// --- Сезон и цены (месяц: 0=янв ... 4=май ... 8=сен) ---
        const CALENDAR_START_DATE = new Date(2026, 4, 1);
        const CALENDAR_END_DATE = new Date(2026, 8, 30);
        const PRICES_BY_MONTH = { 4: 3500, 5: 3800, 6: 5500, 7: 4500, 8: 4000 };
