// =============================================================
// 3D-карта побережья «В облаках Крыма».
// Рельеф: Copernicus DEM GLO-30; снимки: Copernicus Sentinel-2 (лето 23.08.2026, зима 01.03.2026).
// Данные собирает /root/mapbuild/build.py → /v2/map/data/. Собирается esbuild в map3d.min.js.
// =============================================================
import {
    WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Mesh, ShaderMaterial,
    TextureLoader, LinearFilter, LinearMipmapLinearFilter, Vector3, Color, Sprite, SpriteMaterial,
    CanvasTexture, Spherical, MathUtils, SRGBColorSpace, NoColorSpace,
    InstancedMesh, InstancedBufferAttribute, Object3D, DoubleSide
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const EXAG = 1.8;                 // вертикальное преувеличение рельефа (горы выразительнее)
const SEA = new Color('#0b1b33');  // цвет фона/тумана — как тёмное море на снимках

// Расстояние по прямой между двумя точками (км)
function haversineKm(a, b) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtKm = (km) => km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

// Мягкое облако на canvas (несколько размытых «шапок»)
function cloudTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const puffs = [[70, 78, 46], [118, 60, 56], [168, 76, 44], [100, 86, 40], [146, 90, 38], [200, 84, 30]];
    for (const [x, y, r] of puffs) {
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)');
        grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

const VERT = `
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vW;
void main() {
    vUv = uv; vN = normal; vW = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D tA; uniform sampler2D tB; uniform float uMix; uniform float uTime;
uniform vec3 uLight; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vW;
void main() {
    vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, uMix);
    // море: высота ~0 и синий цвет на снимке (пляжи и низкий берег не блестят)
    float sea = (1.0 - smoothstep(0.0, 0.006, vW.y)) * step(c.r, c.b + 0.015);
    float d = max(dot(normalize(vN), uLight), 0.0);
    c *= 0.66 + 0.5 * d;                                   // подсветка рельефа низким солнцем
    float g = sin(vW.x * 95.0 + uTime * 1.6) * sin(vW.z * 77.0 - uTime * 1.25) * sin((vW.x + vW.z) * 41.0 + uTime * 0.7);
    float glint = pow(max(g, 0.0), 30.0) * (1.0 - smoothstep(6.0, 26.0, vDepth));
    c += sea * (glint * 0.4 * vec3(1.0, 0.96, 0.86) + vec3(0.0, 0.012, 0.03));
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    c = mix(uFog, c, smoothstep(0.0, 0.035, edge));        // края карты растворяются
    c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vDepth)); // воздушная перспектива
    gl_FragColor = vec4(c, 1.0);
}`;

// Чайка: крылья с «изломом», взмахи и парение считаются в шейдере (дёшево для процессора)
const GULL_VERT = `
attribute float aFlap; attribute float aPhase;
uniform float uTime; varying float vTip; varying float vShade;
void main() {
    vec3 p = position;
    float glide = smoothstep(-0.3, 0.5, sin(uTime * 0.33 + aPhase * 12.0));   // то машет, то парит
    float f = sin(uTime * 7.5 + aPhase * 6.2831) * glide;
    p.y += (f * 0.26 + 0.06) * aFlap * aFlap + 0.04 * aFlap * (1.0 - glide);
    vTip = aFlap; vShade = 0.86 + 0.14 * f * aFlap;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const GULL_FRAG = `
varying float vTip; varying float vShade;
void main() {
    vec3 c = mix(vec3(0.97, 0.97, 0.95), vec3(0.32, 0.35, 0.40), smoothstep(0.8, 0.9, vTip));
    gl_FragColor = vec4(c * vShade, 1.0);
}`;

function gullGeometry() {
    // вперёд — ось +X, размах вдоль Z; aFlap: 0 у тела, 1 на кончике крыла
    const v = [], f = [];
    const tri = (a, b, c) => { for (const p of [a, b, c]) { v.push(p[0], p[1], p[2]); f.push(Math.abs(p[2]) / 0.62); } };
    for (const s of [1, -1]) {
        const rootF = [0.10, 0, 0], rootB = [-0.08, 0, 0], elbow = [0.03, 0, 0.30 * s], elbowB = [-0.07, 0, 0.27 * s], tip = [-0.16, 0, 0.62 * s];
        tri(rootF, rootB, elbow); tri(rootB, elbowB, elbow); tri(elbow, elbowB, tip);
    }
    tri([0.24, 0, 0], [-0.26, 0, 0.035], [-0.26, 0, -0.035]);   // тело
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
    g.setAttribute('aFlap', new BufferAttribute(new Float32Array(f), 1));
    return g;
}

export async function initMap3D(root, opts) {
    const base = opts.base;                       // '/v2/map/data/'
    const sights = opts.sights || {};
    const houseInfo = opts.house;                 // { title, text, img, href, lat, lon }
    const places = opts.places;                   // { id: {lat, lon} } — реальные координаты
    const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;

    root.classList.add('m3d');
    root.innerHTML = `
        <div class="m3d-stage"></div>
        <div class="m3d-markers"></div>
        <div class="m3d-ui">
            <div class="m3d-season" role="group" aria-label="Сезон">
                <button type="button" data-season="0" class="is-on">Лето</button>
                <button type="button" data-season="1">Зима</button>
            </div>
            <button type="button" class="m3d-explore">Исследовать карту</button>
            <button type="button" class="m3d-close" aria-label="Закрыть карту">&times;</button>
            <button type="button" class="m3d-home" aria-label="К нашему дому" title="К нашему дому">⌂</button>
            <div class="m3d-hint">Тяните — двигать · два пальца или правая кнопка — поворот · колесо или щипок — приблизить</div>
        </div>
        <div class="m3d-card" hidden></div>
        <div class="m3d-loading">Загружаем рельеф и снимки со спутника…</div>
        <div class="m3d-attr">${esc(opts.attribution || '')}</div>`;
    const stage = root.querySelector('.m3d-stage');
    const markersEl = root.querySelector('.m3d-markers');
    const card = root.querySelector('.m3d-card');
    const loading = root.querySelector('.m3d-loading');

    if (!webglAvailable()) {
        loading.textContent = '';
        stage.innerHTML = `<img class="m3d-fallback" src="${base}summer_2048.webp" alt="Южный берег Крыма со спутника">`;
        return;
    }

    const meta = await (await fetch(base + 'meta.json')).json();
    const W = meta.width_m / 1000, H = meta.height_m / 1000;          // км
    const hw = meta.height.w, hh = meta.height.h;
    const heights = new Int16Array(await (await fetch(base + meta.height.file)).arrayBuffer());
    const hAt = (u, v) => {                                            // высота (м) в точке u,v [0..1], билинейно
        const x = Math.min(hw - 1.001, Math.max(0, u * (hw - 1))), y = Math.min(hh - 1.001, Math.max(0, v * (hh - 1)));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * hw + x0;
        const a = heights[i], b = heights[i + 1], c = heights[i + hw], d = heights[i + hw + 1];
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
    const world = (u, v) => new Vector3((u - 0.5) * W, hAt(u, v) / 1000 * EXAG, (v - 0.5) * H);

    // --- Рельеф ---
    const step = small ? 2 : 1;
    const nx = Math.floor((hw - 1) / step) + 1, ny = Math.floor((hh - 1) / step) + 1;
    const pos = new Float32Array(nx * ny * 3), uvs = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1), v = j / (ny - 1), k = j * nx + i;
        pos[k * 3] = (u - 0.5) * W; pos[k * 3 + 1] = hAt(u, v) / 1000 * EXAG; pos[k * 3 + 2] = (v - 0.5) * H;
        uvs[k * 2] = u; uvs[k * 2 + 1] = 1 - v;
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let p = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // состояние цикла отрисовки (объявлено до первого resize/wake)
    let visible = true, running = false, last = performance.now(), idleSince = performance.now();

    const renderer = new WebGLRenderer({ antialias: !small, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(SEA);
    stage.appendChild(renderer.domElement);
    const texSize = (!small && renderer.capabilities.maxTextureSize >= 4096) ? 4096 : 2048;

    const loader = new TextureLoader();
    const loadTex = (name) => new Promise((res, rej) => loader.load(`${base}${name}_${texSize}.webp`, (t) => {
        t.colorSpace = NoColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; res(t);
    }, undefined, rej));
    const summer = await loadTex('summer');
    let winter = null;

    const mat = new ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
            tA: { value: summer }, tB: { value: summer }, uMix: { value: 0 }, uTime: { value: 0 },
            uLight: { value: new Vector3(-0.55, 0.62, 0.56).normalize() },
            uFog: { value: SEA.clone() }, uFogNear: { value: 30 }, uFogFar: { value: 95 }
        }
    });
    const scene = new Scene();
    scene.add(new Mesh(geo, mat));

    // --- Облака ---
    const cloudTex = cloudTexture();
    const clouds = [];
    const nClouds = small ? 9 : 16;
    for (let i = 0; i < nClouds; i++) {
        const m = new SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.0 });
        const s = new Sprite(m);
        const sc = 5 + Math.random() * 7;
        s.scale.set(sc, sc / 2, 1);
        s.position.set((Math.random() - 0.5) * W * 0.95, 2.6 + Math.random() * 1.6, (Math.random() - 0.6) * H * 0.9);
        s.userData = { speed: 0.05 + Math.random() * 0.08, target: 0.32 + Math.random() * 0.3 };
        clouds.push(s); scene.add(s);
    }

    // --- Чайки: стайки кружат над берегом у реальных мест (дом, Ласточкино гнездо, Форос, Симеиз…) ---
    const gullSpots = ['house', 'diva', 'swallow', 'foros', 'vorontsov', 'balaklava_museum', 'livadia', 'sun_temple']
        .filter(id => meta.places[id]).map(id => meta.places[id]);
    const nGulls = small ? 12 : 26;
    const gullGeo = gullGeometry();
    const phases = new Float32Array(nGulls);
    const gulls = [];
    for (let i = 0; i < nGulls; i++) {
        const spot = gullSpots[i % gullSpots.length];
        const c = world(spot.u, spot.v);
        phases[i] = Math.random();
        gulls.push({
            cx: c.x + (Math.random() - 0.5) * 1.2, cz: c.z + 0.9 + Math.random() * 1.4,  // над морем у берега
            r: 0.5 + Math.random() * 1.3, a: Math.random() * Math.PI * 2,
            w: (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.12),           // рад/с
            y: 0.35 + Math.random() * 0.55, bob: Math.random() * 6.28,
            s: 0.17 + Math.random() * 0.07
        });
    }
    gullGeo.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));
    const gullMat = new ShaderMaterial({ vertexShader: GULL_VERT, fragmentShader: GULL_FRAG, side: DoubleSide, uniforms: { uTime: { value: 0 } } });
    const gullMesh = new InstancedMesh(gullGeo, gullMat, nGulls);
    gullMesh.frustumCulled = false;
    scene.add(gullMesh);
    const dummy = new Object3D();
    dummy.rotation.order = 'YXZ';
    function updateGulls(dt, t) {
        for (let i = 0; i < nGulls; i++) {
            const g = gulls[i];
            g.a += g.w * dt;
            const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r * 0.7;
            // направление полёта — касательная к орбите; крен внутрь поворота
            const vx = -Math.sin(g.a) * g.r * g.w, vz = Math.cos(g.a) * g.r * 0.7 * g.w;
            dummy.position.set(x, g.y + Math.sin(t * 0.6 + g.bob) * 0.06, z);
            dummy.rotation.set(Math.sign(g.w) * 0.42, Math.atan2(-vz, vx), 0);   // крен на крыло, обращённое к центру круга
            dummy.scale.setScalar(g.s);
            dummy.updateMatrix();
            gullMesh.setMatrixAt(i, dummy.matrix);
        }
        gullMesh.instanceMatrix.needsUpdate = true;
    }

    // --- Камера и управление ---
    const camera = new PerspectiveCamera(40, 1, 0.1, 400);
    const controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 2.2; controls.maxDistance = 48;
    controls.minPolarAngle = 0.15; controls.maxPolarAngle = 1.22;
    controls.screenSpacePanning = false;
    controls.enabled = false;
    const clampTarget = () => {
        controls.target.x = MathUtils.clamp(controls.target.x, -W / 2 * 0.95, W / 2 * 0.95);
        controls.target.z = MathUtils.clamp(controls.target.z, -H / 2 * 0.95, H / 2 * 0.95);
    };
    controls.addEventListener('change', clampTarget);

    const place = (id) => meta.places[id] ? world(meta.places[id].u, meta.places[id].v) : null;
    const houseW = place('house');
    const viewFrom = (target, dist, polar, azim) => {
        const s = new Spherical(dist, polar, azim);
        return new Vector3().setFromSpherical(s).add(target);
    };

    // Старт: высоко в облаках над побережьем, затем плавное снижение к дому
    camera.position.set(houseW.x + 2, 42, houseW.z + 26);
    controls.target.set(houseW.x, 0.3, houseW.z - 6);
    controls.update();

    let fly = null;
    function flyTo(target, dist = 7, polar = 0.95, azim = 0.12, dur = 1600) {
        fly = {
            t0: performance.now(), dur,
            fromPos: camera.position.clone(), fromTgt: controls.target.clone(),
            toTgt: target.clone(), toPos: viewFrom(target, dist, polar, azim)
        };
    }

    // --- Метки ---
    const markers = [];
    const addMarker = (id, title, isHouse) => {
        const w = place(id); if (!w) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'm3d-pin' + (isHouse ? ' m3d-pin--house' : '');
        b.innerHTML = `<span class="m3d-dot"></span><span class="m3d-label">${esc(title)}</span>`;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', (e) => { e.stopPropagation(); openCard(id); });
        markersEl.appendChild(b);
        markers.push({ id, el: b, pos: w.clone().add(new Vector3(0, 0.08, 0)) });
    };
    addMarker('house', houseInfo.title, true);
    for (const [id, s] of Object.entries(sights)) addMarker(id, s.title, false);

    const houseLL = { lat: houseInfo.lat, lon: houseInfo.lon };
    function openCard(id) {
        markers.forEach(m => m.el.classList.toggle('is-active', m.id === id));
        const isHouse = id === 'house';
        const s = isHouse ? null : sights[id];
        const img = isHouse ? houseInfo.img : (s.images && s.images[0]);
        const dist = (!isHouse && places[id]) ? fmtKm(haversineKm(houseLL, places[id])) : null;
        const pic = img ? `<picture><source type="image/webp" srcset="/${img}.w1280.webp"><img src="/${img}" alt="${esc(isHouse ? houseInfo.title : s.title)}" loading="lazy"></picture>` : '';
        card.innerHTML = `
            <button type="button" class="m3d-card-close" aria-label="Закрыть">&times;</button>
            <div class="m3d-card-img">${pic}</div>
            <div class="m3d-card-body">
                ${dist ? `<div class="m3d-card-kicker">${dist} км от нашего дома по прямой</div>` : `<div class="m3d-card-kicker">Наш дом</div>`}
                <h3>${esc(isHouse ? houseInfo.title : s.title)}</h3>
                <p>${esc(isHouse ? houseInfo.text : s.description)}</p>
                <div class="m3d-card-actions">
                    ${isHouse
                        ? `<a class="m3d-btn m3d-btn--primary" href="${esc(houseInfo.href)}">Выбрать квартиру</a>`
                        : `<a class="m3d-btn m3d-btn--primary" href="${esc(opts.sightHref ? opts.sightHref(id) : '/#sight-' + id)}">Подробнее</a>${s.link ? `<a class="m3d-btn" href="${esc(s.link)}" target="_blank" rel="noopener">Сайт места</a>` : ''}`}
                </div>
            </div>`;
        card.hidden = false;
        card.querySelector('.m3d-card-close').addEventListener('click', closeCard);
        const w = place(id);
        flyTo(w, isHouse ? 8.5 : 9, 1.08, 0.12);
        wake();
    }
    function closeCard() { card.hidden = true; markers.forEach(m => m.el.classList.remove('is-active')); }

    // --- Сезон ---
    let mixTo = 0;
    root.querySelectorAll('.m3d-season button').forEach(btn => btn.addEventListener('click', async () => {
        const s = Number(btn.dataset.season);
        root.querySelectorAll('.m3d-season button').forEach(b => b.classList.toggle('is-on', b === btn));
        if (s === 1 && !winter) {
            btn.classList.add('is-loading');
            winter = await loadTex('winter');
            btn.classList.remove('is-loading');
            mat.uniforms.tB.value = winter;
        }
        mixTo = s; wake();
    }));

    // --- Режимы: превью на странице / полноэкранное исследование ---
    const setFull = (on) => {
        root.classList.toggle('is-full', on);
        document.documentElement.classList.toggle('m3d-lock', on);
        controls.enabled = on;
        resize(); wake();
    };
    root.querySelector('.m3d-explore').addEventListener('click', () => setFull(true));
    root.querySelector('.m3d-close').addEventListener('click', () => setFull(false));
    root.querySelector('.m3d-home').addEventListener('click', () => openCard('house'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!card.hidden) closeCard(); else if (root.classList.contains('is-full')) setFull(false); } });

    function resize() {
        const r = root.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / Math.max(1, r.height);
        camera.updateProjectionMatrix();
        wake();
    }
    new ResizeObserver(resize).observe(root);
    resize();

    // --- Цикл отрисовки: только когда карта видна ---
    const intro = { t0: performance.now(), dur: 3600, fromPos: camera.position.clone(), fromTgt: controls.target.clone(),
        toTgt: houseW.clone().add(new Vector3(0.6, 0, -2.5)), toPos: viewFrom(houseW.clone().add(new Vector3(0.6, 0, -2.5)), 16, 1.0, 0.08) };
    let introDone = false;
    const v = new Vector3();
    function frame(now) {
        running = false;
        if (!visible) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;

        if (!introDone) {
            const t = Math.min(1, (now - intro.t0) / intro.dur), e = easeInOut(t);
            camera.position.lerpVectors(intro.fromPos, intro.toPos, e);
            controls.target.lerpVectors(intro.fromTgt, intro.toTgt, e);
            if (t >= 1) introDone = true;
        } else if (fly) {
            const t = Math.min(1, (now - fly.t0) / fly.dur), e = easeInOut(t);
            camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
            controls.target.lerpVectors(fly.fromTgt, fly.toTgt, e);
            if (t >= 1) fly = null;
        } else if (!controls.enabled && card.hidden) {
            // превью: медленный облёт вокруг текущей точки
            const off = camera.position.clone().sub(controls.target);
            off.applyAxisAngle(new Vector3(0, 1, 0), dt * 0.035);
            camera.position.copy(controls.target).add(off);
        }
        controls.update();

        const um = mat.uniforms.uMix;
        um.value += (mixTo - um.value) * Math.min(1, dt * 2.5);
        const t = now / 1000;
        mat.uniforms.uTime.value = t;
        gullMat.uniforms.uTime.value = t;
        updateGulls(dt, t);

        // облака: дрейф и проявление после интро
        for (const c of clouds) {
            c.position.x += c.userData.speed * dt;
            if (c.position.x > W / 2) c.position.x = -W / 2;
            const near = camera.position.distanceTo(c.position);
            const fadeNear = MathUtils.smoothstep(near, 2, 9);       // не застилать камеру
            c.material.opacity += ((introDone ? c.userData.target : 0.15) * fadeNear - c.material.opacity) * Math.min(1, dt * 1.5);
        }

        renderer.render(scene, camera);

        // метки: проекция на экран
        const rw = renderer.domElement.clientWidth, rh = renderer.domElement.clientHeight;
        const camDist = camera.position.distanceTo(controls.target);
        root.classList.toggle('m3d-near', camDist < 14);
        for (const m of markers) {
            v.copy(m.pos).project(camera);
            const onScreen = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
            m.el.style.display = onScreen ? '' : 'none';
            if (onScreen) m.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * rw}px, ${(-v.y * 0.5 + 0.5) * rh}px)`;
        }

        const animating = !introDone || fly || Math.abs(mixTo - um.value) > 0.002 || (!controls.enabled && card.hidden) || clouds.length;
        if (animating || now - idleSince < 1500) loop();
    }
    function loop() { if (!running) { running = true; requestAnimationFrame(frame); } }
    function wake() { idleSince = performance.now(); loop(); }
    controls.addEventListener('change', wake);
    new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) { last = performance.now(); loop(); }
    }, { threshold: 0.01 }).observe(root);

    loading.classList.add('is-done');
    setTimeout(() => loading.remove(), 800);
    loop();
    return { openCard, setFull };
}
