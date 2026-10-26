// =============================================================
// 3D-карта побережья «В облаках Крыма».
// Рельеф: Copernicus DEM GLO-30; снимки: Copernicus Sentinel-2 (лето 23.08.2026, зима 01.03.2026).
// Данные собирает /root/mapbuild/build.py → /v2/map/data/. Собирается esbuild в map3d.min.js.
// =============================================================
import {
    WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Mesh, ShaderMaterial,
    TextureLoader, LinearFilter, LinearMipmapLinearFilter, Vector3, Color, Sprite, SpriteMaterial,
    CanvasTexture, Spherical, MathUtils, SRGBColorSpace, NoColorSpace,
    InstancedMesh, InstancedBufferAttribute, Object3D, DoubleSide, BackSide, SphereGeometry, PlaneGeometry
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const EXAG = 1.8;                 // вертикальное преувеличение рельефа (горы выразительнее)
// Цвет моря: снимки дают почти чёрно-синюю воду — сдвигаем к голубому (летом ярче, зимой спокойнее)
const SEA_SUMMER = new Color('#2a6eab');
const SEA_WINTER = new Color('#245d93');

// Расстояние по прямой между двумя точками (км)
function haversineKm(a, b) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
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
uniform float uEdge; uniform vec3 uSea; uniform vec3 uSeaTex; uniform float uSeaFlat;
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vW;
void main() {
    vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, uMix);
    // море: высота ~0 и синий цвет на снимке (пляжи и низкий берег не блестят)
    float sea = (1.0 - smoothstep(0.0, 0.006, vW.y)) * step(c.r, c.b + 0.015);
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    // вода: тон сдвигается к голубому uSea, но перепады снимка (бирюза мелководья, рябь) сохраняются;
    // на подложке и у краёв основной карты — ровный цвет (нет полос между снимками и шва)
    float flatK = max(uSeaFlat, 1.0 - smoothstep(0.0, 0.06, edge));
    vec3 water = uSea + (c - uSeaTex) * 1.15 * (1.0 - flatK);
    c = mix(c, water, sea);
    float d = max(dot(normalize(vN), uLight), 0.0);
    c *= 0.66 + 0.5 * d;                                   // подсветка рельефа низким солнцем
    float g = sin(vW.x * 95.0 + uTime * 1.6) * sin(vW.z * 77.0 - uTime * 1.25) * sin((vW.x + vW.z) * 41.0 + uTime * 0.7);
    float glint = pow(max(g, 0.0), 30.0) * (1.0 - smoothstep(6.0, 26.0, vDepth));
    c += sea * (glint * 0.4 * vec3(1.0, 0.96, 0.86) + vec3(0.0, 0.012, 0.03));
    // края подложки плавно переходят в бесконечное море (у основной карты uEdge = 0 — края нет)
    if (uEdge > 0.0) c = mix(uSea, c, smoothstep(0.0, uEdge, edge));
    c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vDepth)); // воздушная перспектива, дымка у горизонта
    gl_FragColor = vec4(c, 1.0);
}`;

// Бесконечное море до горизонта
const SEA_VERT = `
varying vec3 vW; varying float vDepth;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    vec4 mv = viewMatrix * w; vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}`;
const SEA_FRAG = `
uniform vec3 uSea; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uTime;
varying vec3 vW; varying float vDepth;
void main() {
    float g = sin(vW.x * 95.0 + uTime * 1.6) * sin(vW.z * 77.0 - uTime * 1.25) * sin((vW.x + vW.z) * 41.0 + uTime * 0.7);
    float glint = pow(max(g, 0.0), 30.0) * (1.0 - smoothstep(6.0, 26.0, vDepth));
    vec3 c = uSea * 0.97 + glint * 0.4 * vec3(1.0, 0.96, 0.86) + vec3(0.0, 0.012, 0.03);   // 0.97 — как освещение ровной воды на карте
    c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(c, 1.0);
}`;

// Небо: от голубого зенита к светлой дымке у горизонта
const SKY_VERT = `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;   // всегда на дальней плоскости
}`;
const SKY_FRAG = `
uniform vec3 uHorizon; uniform vec3 uZenith;
varying vec3 vDir;
void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.55, h), 0.8));
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
            <button type="button" class="m3d-close" aria-label="Закрыть карту">${X_ICON}</button>
            <button type="button" class="m3d-home" aria-label="Показать наш дом на карте">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg>
                <span>Наш дом</span>
            </button>
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

    // --- Рельеф: сетка по карте высот. offX/offZ — сдвиг левого-верхнего угла (км) относительно основной карты;
    //     lowerInside — опустить участок под основной картой (для подложки), чтобы они не спорили ---
    function terrainGeometry(hts, gw, gh, wKm, hKm, offX, offZ, stp, lowerInside) {
        const at = (u, v) => {
            const x = Math.min(gw - 1.001, Math.max(0, u * (gw - 1))), y = Math.min(gh - 1.001, Math.max(0, v * (gh - 1)));
            const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * gw + x0;
            return (hts[i] * (1 - fx) + hts[i + 1] * fx) * (1 - fy) + (hts[i + gw] * (1 - fx) + hts[i + gw + 1] * fx) * fy;
        };
        const nx = Math.floor((gw - 1) / stp) + 1, ny = Math.floor((gh - 1) / stp) + 1;
        const pos = new Float32Array(nx * ny * 3), uvs = new Float32Array(nx * ny * 2);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const u = i / (nx - 1), v = j / (ny - 1), k = j * nx + i;
            const x = offX + u * wKm - W / 2, z = offZ + v * hKm - H / 2;
            let y = at(u, v) / 1000 * EXAG;
            if (lowerInside && x > -W / 2 + 0.05 && x < W / 2 - 0.05 && z > -H / 2 + 0.05 && z < H / 2 - 0.05) y -= 0.08;
            pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
            uvs[k * 2] = u; uvs[k * 2 + 1] = 1 - v;
        }
        const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
        let p = 0;
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
            const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(pos, 3));
        g.setAttribute('uv', new BufferAttribute(uvs, 2));
        g.setIndex(new BufferAttribute(idx, 1));
        g.computeVertexNormals();
        return g;
    }
    const geo = terrainGeometry(heights, hw, hh, W, H, 0, 0, small ? 2 : 1, false);

    // состояние цикла отрисовки (объявлено до первого resize/wake)
    let visible = true, running = false, last = performance.now(), idleSince = performance.now();

    const HORIZON = new Color('#c4d3e1'), ZENITH = new Color('#4f7fb5');
    const renderer = new WebGLRenderer({ antialias: !small, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(HORIZON);
    stage.appendChild(renderer.domElement);
    const texSize = (!small && renderer.capabilities.maxTextureSize >= 4096) ? 4096 : 2048;

    const loader = new TextureLoader();
    const loadFile = (file) => new Promise((res, rej) => loader.load(base + file, (t) => {
        t.colorSpace = NoColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; res(t);
    }, undefined, rej));
    const loadTex = (name) => loadFile(`${name}_${texSize}.webp`);
    const summer = await loadTex('summer');
    let winter = null;

    const FOG_NEAR = 38, FOG_FAR = 150;
    const terrainUniforms = (tex, edge) => ({
        tA: { value: tex }, tB: { value: tex }, uMix: { value: 0 }, uTime: { value: 0 },
        uLight: { value: new Vector3(-0.55, 0.62, 0.56).normalize() },
        uFog: { value: HORIZON.clone() }, uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR },
        uEdge: { value: edge }, uSea: { value: SEA_SUMMER.clone() }, uSeaTex: { value: new Color('#0e1e3c') },
        uSeaFlat: { value: edge > 0 ? 1 : 0 }
    });
    const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: terrainUniforms(summer, 0) });
    const scene = new Scene();
    scene.add(new Mesh(geo, mat));

    // --- Небо ---
    const skyMat = new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false,
        uniforms: { uHorizon: { value: HORIZON }, uZenith: { value: ZENITH } } });
    const sky = new Mesh(new SphereGeometry(500, 32, 16), skyMat);
    sky.renderOrder = -1; sky.frustumCulled = false;
    scene.add(sky);

    // --- Бесконечное море (цвет — средний цвет моря на снимках) и широкая подложка вокруг ---
    // средний цвет воды на самих снимках — от него считается сдвиг к голубому
    const seaRGB = (meta.outer && meta.outer.sea_rgb) || { summer: [12, 18, 48], winter: [12, 18, 48] };
    const seaTexSummer = new Color(seaRGB.summer[0] / 255, seaRGB.summer[1] / 255, seaRGB.summer[2] / 255);
    const seaTexWinter = new Color(seaRGB.winter[0] / 255, seaRGB.winter[1] / 255, seaRGB.winter[2] / 255);
    mat.uniforms.uSeaTex.value.copy(seaTexSummer);
    const seaMat = new ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
        uniforms: { uSea: { value: SEA_SUMMER.clone() }, uFog: { value: HORIZON.clone() }, uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR }, uTime: { value: 0 } } });
    const seaPlane = new Mesh(new PlaneGeometry(1600, 1600), seaMat);
    seaPlane.rotation.x = -Math.PI / 2; seaPlane.position.y = -0.03;
    scene.add(seaPlane);

    let outerMat = null, outerInfo = null;
    if (meta.outer) {
        const o = meta.outer;
        const oh = new Int16Array(await (await fetch(base + o.height.file)).arrayBuffer());
        outerInfo = { hts: oh, w: o.height.w, h: o.height.h, wKm: o.width_m / 1000, hKm: o.height_m / 1000, offX: o.offset_m[0] / 1000, offZ: o.offset_m[1] / 1000 };
        const oGeo = terrainGeometry(oh, o.height.w, o.height.h, o.width_m / 1000, o.height_m / 1000,
            o.offset_m[0] / 1000, o.offset_m[1] / 1000, small ? 2 : 1, true);
        const oTex = await loadFile(`outer_summer_${small ? 1024 : 2048}.webp`);
        outerMat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: terrainUniforms(oTex, 0.05) });
        outerMat.uniforms.uSeaTex.value.copy(seaTexSummer);
        const outer = new Mesh(oGeo, outerMat);
        outer.position.y = -0.004;   // чуть ниже основной карты на её границе
        scene.add(outer);
    }

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
    const camera = new PerspectiveCamera(40, 1, 0.3, 1200);
    const controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 2.2; controls.maxDistance = 34;          // дальше — только размытая подложка
    controls.minPolarAngle = 0.15; controls.maxPolarAngle = 1.38;   // можно наклониться почти к горизонту
    controls.screenSpacePanning = false;
    controls.enabled = false;
    // двигать можно только в пределах основной (чёткой) карты, где отмечены места
    const clampTarget = () => {
        controls.target.x = MathUtils.clamp(controls.target.x, -W / 2 * 0.9, W / 2 * 0.9);
        controls.target.z = MathUtils.clamp(controls.target.z, -H / 2 * 0.85, H / 2 * 0.85);
    };
    // Высота земли (в единицах сцены) в любой точке: основная карта, затем подложка, иначе море
    function groundY(x, z) {
        const u = x / W + 0.5, v = z / H + 0.5;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return Math.max(0, hAt(u, v) / 1000 * EXAG);
        if (outerInfo) {
            const o = outerInfo, ou = (x + W / 2 - o.offX) / o.wKm, ov = (z + H / 2 - o.offZ) / o.hKm;
            if (ou >= 0 && ou <= 1 && ov >= 0 && ov <= 1) {
                const gx = Math.min(o.w - 1.001, ou * (o.w - 1)), gy = Math.min(o.h - 1.001, ov * (o.h - 1));
                const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, i = y0 * o.w + x0;
                const hh2 = (o.hts[i] * (1 - fx) + o.hts[i + 1] * fx) * (1 - fy) + (o.hts[i + o.w] * (1 - fx) + o.hts[i + o.w + 1] * fx) * fy;
                return Math.max(0, hh2 / 1000 * EXAG);
            }
        }
        return 0;
    }
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
        // маршрут на машине от нашего дома в Яндекс Картах
        const route = (!isHouse && places[id]) ? `https://yandex.ru/maps/?rtext=${houseLL.lat},${houseLL.lon}~${places[id].lat},${places[id].lon}&rtt=auto` : null;
        const pic = img ? `<picture><source type="image/webp" srcset="/${img}.w1280.webp"><img src="/${img}" alt="${esc(isHouse ? houseInfo.title : s.title)}" loading="lazy"></picture>` : '';
        card.innerHTML = `
            <button type="button" class="m3d-card-close" aria-label="Закрыть">${X_ICON}</button>
            <div class="m3d-card-img">${pic}</div>
            <div class="m3d-card-body">
                ${dist ? `<div class="m3d-card-kicker">${dist} км от нашего дома по прямой</div>` : `<div class="m3d-card-kicker">Наш дом</div>`}
                <h3>${esc(isHouse ? houseInfo.title : s.title)}</h3>
                <p>${esc(isHouse ? houseInfo.text : s.description)}</p>
                <div class="m3d-card-actions">
                    ${isHouse
                        ? `<a class="m3d-btn m3d-btn--primary" href="${esc(houseInfo.href)}">Выбрать квартиру</a>`
                        : `<a class="m3d-btn m3d-btn--primary" href="${esc(opts.sightHref ? opts.sightHref(id) : '/#sight-' + id)}">Подробнее</a>${route ? `<a class="m3d-btn" href="${esc(route)}" target="_blank" rel="noopener">Маршрут</a>` : ''}${s.link ? `<a class="m3d-btn" href="${esc(s.link)}" target="_blank" rel="noopener">Сайт места</a>` : ''}`}
                </div>
            </div>`;
        card.hidden = false;
        card.querySelector('.m3d-card-close').addEventListener('click', closeCard);
        // ссылка на раздел сайта (#apartments, #sight-…) — сначала выходим из полноэкранной карты
        card.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => {
            closeCard();
            if (root.classList.contains('is-full')) setFull(false);
        }));
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
            const [w, ow] = await Promise.all([loadTex('winter'), outerMat ? loadFile(`outer_winter_${small ? 1024 : 2048}.webp`) : null]);
            winter = w;
            btn.classList.remove('is-loading');
            mat.uniforms.tB.value = winter;
            if (outerMat && ow) outerMat.uniforms.tB.value = ow;
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
    // Метка за горой? Идём по лучу камера → метка и сравниваем высоту луча с рельефом (по карте высот, без тяжёлых пересечений)
    const q = new Vector3();
    function occluded(p) {
        for (let i = 1; i < 26; i++) {           // последние ~7% пути не проверяем: у самой метки луч идёт вдоль склона
            q.lerpVectors(camera.position, p, i / 28);
            const u = q.x / W + 0.5, w = q.z / H + 0.5;
            if (u < 0 || u > 1 || w < 0 || w > 1) continue;
            if (q.y < hAt(u, w) / 1000 * EXAG - 0.03) return true;
        }
        return false;
    }
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
        // Нельзя «нырнуть» в землю: точка вращения лежит на поверхности, камера всегда над рельефом
        if (introDone && !fly) {
            const gT = groundY(controls.target.x, controls.target.z);
            controls.target.y += (gT + 0.05 - controls.target.y) * 0.2;
        }
        const gC = groundY(camera.position.x, camera.position.z);
        if (camera.position.y < gC + 0.45) camera.position.y = gC + 0.45;

        const um = mat.uniforms.uMix;
        um.value += (mixTo - um.value) * Math.min(1, dt * 2.5);
        const t = now / 1000;
        mat.uniforms.uTime.value = t;
        gullMat.uniforms.uTime.value = t;
        seaMat.uniforms.uTime.value = t;
        const seaNow = seaMat.uniforms.uSea.value.copy(SEA_SUMMER).lerp(SEA_WINTER, um.value);
        mat.uniforms.uSea.value.copy(seaNow);
        mat.uniforms.uSeaTex.value.copy(seaTexSummer).lerp(seaTexWinter, um.value);
        if (outerMat) {
            outerMat.uniforms.uMix.value = um.value;
            outerMat.uniforms.uSea.value.copy(seaNow);
            outerMat.uniforms.uSeaTex.value.copy(mat.uniforms.uSeaTex.value);
        }
        sky.position.copy(camera.position);
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
            if (onScreen) {
                m.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * rw}px, ${(-v.y * 0.5 + 0.5) * rh}px)`;
                m.el.classList.toggle('is-behind', occluded(m.pos));
            }
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
