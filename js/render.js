/* Рисование изометрии на canvas — чистый low-poly, всё фигурами.
   Никаких картинок: сцена должна работать даже без папки assets. */
window.CC = window.CC || {};

CC.Render = (function () {
  'use strict';

  const G = CC.GRID;
  const TW = CC.TW;
  const TH = CC.TH;
  const P = CC.Iso.project;
  // Потолок прокачки: уровень постройки и командного центра (1..10).
  const MAXLVL = CC.MAX_TH || 10;

  let t = 0;

  /* ---------- детализация ----------
     tilePx — сколько экранных пикселей занимает тайл. На мелком масштабе
     мелкие штрихи превращаются в шум: их убираем, силуэт оставляем. */
  let tilePx = TW;
  let lod = 2;                  // 2 — близко, 1 — средне, 0 — далеко
  let spritesOn = true;

  function setLod(scale) {
    tilePx = TW * (scale || 1);
    lod = tilePx < 26 ? 0 : (tilePx < 42 ? 1 : 2);
  }

  function mid() { return lod >= 1; }
  function near() { return lod >= 2; }

  // Видимая часть мира: по ней отсекаем постройки и стены за экраном.
  const worldView = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };

  function updateWorldView(view) {
    const s = view.scale || 1;
    worldView.x0 = -view.ox / s - 90;
    worldView.x1 = (view.w - view.ox) / s + 90;
    worldView.y0 = -view.oy / s - 90;
    worldView.y1 = (view.h - view.oy) / s + 90;
  }

  // Пятно постройки в мировых пикселях пересекает экран?
  function footprintVisible(x0, y0, x1, y1, topPx) {
    const left = (x0 - y1) * TW / 2;
    const right = (x1 - y0) * TW / 2;
    const bottom = (x1 + y1) * TH / 2;
    const top = (x0 + y0) * TH / 2 - (topPx || 120);
    return left < worldView.x1 && right > worldView.x0 &&
      bottom > worldView.y0 && top < worldView.y1;
  }

  function pointVisible(x, y, topPx) {
    return x > worldView.x0 - 40 && x < worldView.x1 + 40 &&
      y > worldView.y0 - 40 && y < worldView.y1 + (topPx || 60);
  }

  /* ---------- палитра сцены: 8 базовых цветов + 3 акцента ---------- */

  const PAL = {
    // марсианский реголит
    grass: '#b4552f',
    grassDark: '#c96b3f',
    regolith: '#b4552f',
    regolithLight: '#c96b3f',
    regolithDark: '#8e3f22',

    // камень
    stone: '#7a5a4a',
    stoneLight: '#9a7a68',
    stoneDark: '#5e4437',

    // металл и панели
    plaster: '#d9dde0',
    panel: '#d9dde0',
    roof: '#8e3f22',
    rust: '#8e3f22',
    dark: '#4c565c',
    wood: '#6f7b82',
    metal: '#6f7b82',
    metalLight: '#9aa7ad',
    metalDark: '#4c565c',

    // акценты
    gold: '#ffcf4a',
    amber: '#ffcf4a',
    elixir: '#b04fe0',
    violet: '#b04fe0',
    cold: '#46e0c8',
    cyan: '#46e0c8',
    glass: '#7fe9ff'
  };

  // высота построек и их окрас
  const LOOK = {
    townhall: { h: 40, rise: 17, wall: PAL.plaster, roof: PAL.roof, flag: PAL.gold, door: PAL.wood },
    barracks: { h: 28, rise: 13, wall: PAL.wood, roof: PAL.roof, flag: PAL.elixir, door: PAL.dark },
    cannon: { h: 12, wall: PAL.stone, roof: PAL.stoneDark, flag: null },
    archer: { h: 44, rise: 0, wall: PAL.wood, roof: PAL.stoneLight, flag: null },
    airdef: { h: 26, rise: 0, wall: PAL.stone, roof: PAL.stoneLight, flag: null },
    mage: { h: 50, rise: 0, wall: PAL.stoneDark, roof: PAL.elixir, flag: null },
    goldmine: { h: 22, wall: PAL.wood, roof: PAL.wood, flag: null },
    elixir: { h: 18, wall: PAL.stone, roof: PAL.elixir, flag: null },
    storage: { h: 20, wall: PAL.wood, roof: PAL.wood, flag: null },
    wall: { h: 16, wall: PAL.stone, roof: PAL.stone, flag: null }
  };

  /* ---------- утилиты ---------- */

  // цвет → [r,g,b] (понимает и #hex, и rgb(...))
  function parseColor(c) {
    if (typeof c !== 'string') return [0, 0, 0];
    if (c.charAt(0) === '#') {
      const n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) {
      const p = m[1].split(',');
      return [parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0];
    }
    return [0, 0, 0];
  }

  function shade(hex, p) {
    const c = parseColor(hex);
    let r = c[0];
    let g = c[1];
    let b = c[2];

    if (p < 0) {
      const k = 1 + p;
      r = Math.round(r * k);
      g = Math.round(g * k);
      b = Math.round(b * k);
    } else {
      r = Math.round(r + (255 - r) * p);
      g = Math.round(g + (255 - g) * p);
      b = Math.round(b + (255 - b) * p);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // смешивание двух цветов палитры (для соломы → черепицы)
  function mix(a, b, t) {
    const ca = parseColor(a);
    const cb = parseColor(b);
    const r = Math.round(ca[0] * (1 - t) + cb[0] * t);
    const g = Math.round(ca[1] * (1 - t) + cb[1] * t);
    const bl = Math.round(ca[2] * (1 - t) + cb[2] * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  function diamond(ctx, a, b, c, d) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }

  function poly(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // детерминированный ГПСЧ: трава одинаковая в каждом кадре
  let seed = 987654321;
  function reseed(n) { seed = n >>> 0; }
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  /* ---------- объёмы ---------- */

  // Призма по пятну (x0,y0)-(x1,y1) в клетках. lift — подъём основания в пикселях,
  // h — высота. Видны верх и две передние грани.
  function prism(ctx, x0, y0, x1, y1, lift, h, cTop, cLeft, cRight, caps) {
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);
    const b = -lift;

    // caps: {left:false} / {right:false} — не рисуем торцы на стыке секций стены
    if (!caps || caps.left !== false) {
      ctx.fillStyle = cLeft;
      ctx.beginPath();
      ctx.moveTo(D.x, D.y + b);
      ctx.lineTo(C.x, C.y + b);
      ctx.lineTo(C.x, C.y + b - h);
      ctx.lineTo(D.x, D.y + b - h);
      ctx.closePath();
      ctx.fill();
    }

    if (!caps || caps.right !== false) {
      ctx.fillStyle = cRight;
      ctx.beginPath();
      ctx.moveTo(C.x, C.y + b);
      ctx.lineTo(B.x, B.y + b);
      ctx.lineTo(B.x, B.y + b - h);
      ctx.lineTo(C.x, C.y + b - h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = cTop;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y + b - h);
    ctx.lineTo(B.x, B.y + b - h);
    ctx.lineTo(C.x, C.y + b - h);
    ctx.lineTo(D.x, D.y + b - h);
    ctx.closePath();
    ctx.fill();
  }

  function box(ctx, x0, y0, x1, y1, h, cBase) {
    prism(ctx, x0, y0, x1, y1, 0, h,
      shade(cBase, 0.1), cBase, shade(cBase, -0.18));
  }

  // мягкая тень под объёмом
  function castShadow(ctx, x0, y0, x1, y1, k) {
    const s = k || 1;
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    ctx.fillStyle = 'rgba(60,28,14,.16)';
    diamond(ctx,
      { x: A.x + 5 * s, y: A.y + 9 * s }, { x: B.x + 5 * s, y: B.y + 9 * s },
      { x: C.x + 5 * s, y: C.y + 9 * s }, { x: D.x + 5 * s, y: D.y + 9 * s });
    ctx.fill();

    ctx.fillStyle = 'rgba(60,28,14,.22)';
    diamond(ctx,
      { x: A.x + 2 * s, y: A.y + 4 * s }, { x: B.x + 2 * s, y: B.y + 4 * s },
      { x: C.x + 2 * s, y: C.y + 4 * s }, { x: D.x + 2 * s, y: D.y + 4 * s });
    ctx.fill();
  }

  // подстриженный газон под постройкой: ромб в границах футпринта
  function grassPad(ctx, x0, y0, x1, y1) {
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    // мягкая тень по краю
    ctx.fillStyle = 'rgba(78,32,16,.2)';
    diamond(ctx,
      { x: A.x + 4, y: A.y + 6 }, { x: B.x + 4, y: B.y + 6 },
      { x: C.x + 4, y: C.y + 6 }, { x: D.x + 4, y: D.y + 6 });
    ctx.fill();
    ctx.fillStyle = 'rgba(78,32,16,.15)';
    diamond(ctx,
      { x: A.x + 7, y: A.y + 10 }, { x: B.x + 7, y: B.y + 10 },
      { x: C.x + 7, y: C.y + 10 }, { x: D.x + 7, y: D.y + 10 });
    ctx.fill();

    // сам газон — на тон темнее поля
    ctx.fillStyle = shade(PAL.grassDark, -0.05);
    diamond(ctx, A, B, C, D);
    ctx.fill();

    // светлая кромка по верхним рёбрам
    ctx.strokeStyle = 'rgba(255,220,180,.2)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(D.x, D.y);
    ctx.lineTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(78,32,16,.24)';
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(D.x, D.y);
    ctx.stroke();
  }

  // прямоугольник на вертикальной грани: a,b — концы нижнего ребра,
  // h — высота стены, u0..u1 вдоль ребра, v0..v1 по высоте (0 низ, 1 верх)
  function wallPatch(ctx, a, b, h, u0, u1, v0, v1, color) {
    const ax = a.x + (b.x - a.x) * u0;
    const ay = a.y + (b.y - a.y) * u0;
    const bx = a.x + (b.x - a.x) * u1;
    const by = a.y + (b.y - a.y) * u1;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay - h * v0);
    ctx.lineTo(bx, by - h * v0);
    ctx.lineTo(bx, by - h * v1);
    ctx.lineTo(ax, ay - h * v1);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- фон ---------- */

  const bgCache = { key: '', canvas: null, paints: 0, pad: 0, shift: 0 };

  // pad — запас кэша по краям под параллакс: видимая часть кадра начинается
  // на pad пикселей правее левого края картинки, поэтому небо/солнце/луны
  // ставим с учётом этого сдвига, а землю и холмы тянем на всю ширину кэша.
  function paintBackground(ctx, w, h, horizon, pad) {
    const unit = Math.min(w, h);
    const padX = pad > 0 ? pad : 0;
    const W = w + padX * 2;   // полная ширина кэша, включая запас
    const ax = padX;          // где в кэше находится экранный x = 0

    // марсианское небо: пыльная дымка от охры к горизонту
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 40);
    sky.addColorStop(0, '#e8b98a');
    sky.addColorStop(0.55, '#e0a578');
    sky.addColorStop(1, '#d98f63');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, h);

    // слабое солнце в пыли
    const sunR = Math.max(160, unit * 0.62);
    const sunX = ax + w * 0.17;
    const sunY = h * 0.07;
    const sun = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunR);
    sun.addColorStop(0, 'rgba(255,246,220,.72)');
    sun.addColorStop(0.18, 'rgba(255,232,190,.24)');
    sun.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, h);

    // две маленькие луны
    const moonR = Math.max(5, unit * 0.011);
    ctx.fillStyle = 'rgba(238,222,204,.75)';
    ctx.beginPath();
    ctx.arc(ax + w * 0.76, h * 0.1, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,190,170,.55)';
    ctx.beginPath();
    ctx.arc(ax + w * 0.83, h * 0.17, moonR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // кратерки на большой луне
    ctx.fillStyle = 'rgba(160,140,125,.35)';
    ctx.beginPath();
    ctx.arc(ax + w * 0.76 - moonR * 0.3, h * 0.1 - moonR * 0.2, moonR * 0.28, 0, Math.PI * 2);
    ctx.arc(ax + w * 0.76 + moonR * 0.35, h * 0.1 + moonR * 0.25, moonR * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // пыльные облака: вытянутые, фиксированного размера
    reseed(90210);
    const nClouds = Math.max(3, Math.round(w / 520));
    const cloudSize = Math.max(30, Math.min(90, unit * 0.1));

    for (let i = 0; i < nClouds; i++) {
      const cx = ax + ((i + 0.2 + rnd() * 0.5) / nClouds) * w;
      const cy = horizon * (0.12 + rnd() * 0.55);
      const r = cloudSize * (0.6 + rnd() * 0.7);
      const a = (0.07 + rnd() * 0.06).toFixed(2);

      ctx.fillStyle = 'rgba(255,225,195,' + a + ')';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - r * 0.4, cy + r * 0.04, r * 0.5, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // дальний скальный гребень
    reseed(3311);
    ctx.fillStyle = 'rgba(142,63,34,.45)';
    for (let x = -30; x < W + 40; x += 34) {
      const th = 5 + rnd() * 16;
      ctx.beginPath();
      ctx.moveTo(x - 20, horizon + 2);
      ctx.lineTo(x + rnd() * 10, horizon - th);
      ctx.lineTo(x + 22, horizon + 2);
      ctx.closePath();
      ctx.fill();
    }

    // холмы: волна в пикселях, не растягивается на широком экране
    function hills(baseY, amp, phase, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-20, h);
      ctx.lineTo(-20, baseY);
      for (let x = -20; x <= W + 20; x += 14) {
        const wave =
          Math.sin(x / 240 + phase) * 0.52 +
          Math.sin(x / 91 + phase * 1.7) * 0.3 +
          Math.sin(x / 39 + phase * 2.3) * 0.18;
        ctx.lineTo(x, baseY - amp * (0.55 + wave * 0.45));
      }
      ctx.lineTo(W + 20, h);
      ctx.closePath();
      ctx.fill();
    }

    const amp1 = Math.max(10, Math.min(34, h * 0.028));
    const amp2 = Math.max(7, Math.min(24, h * 0.02));
    hills(horizon - 7, amp1, 0.4, 'rgba(164,74,42,.62)');
    hills(horizon + 6, amp2, 2.1, 'rgba(142,63,34,.72)');

    // реголит до низа экрана
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#c96b3f');
    ground.addColorStop(0.35, '#b4552f');
    ground.addColorStop(1, '#8e3f22');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon + 6, W, h - horizon);

    // пыльная дымка у горизонта
    const haze = ctx.createLinearGradient(0, horizon - 26, 0, horizon + 64);
    haze.addColorStop(0, 'rgba(232,185,138,0)');
    haze.addColorStop(0.42, 'rgba(232,185,138,.28)');
    haze.addColorStop(1, 'rgba(232,185,138,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 26, W, 90);

    // пятна пыли и тёмной породы
    reseed(5511);
    const nPatches = Math.max(5, Math.round(W / 190));
    for (let i = 0; i < nPatches; i++) {
      const cx = (i / nPatches) * (W + 160) - 80 + rnd() * 90;
      const cy = horizon + 30 + rnd() * Math.max(20, h - horizon - 46);
      const rx = 70 + rnd() * 120;
      const ry = 6 + rnd() * 9;
      const light = rnd() < 0.5;
      ctx.fillStyle = light
        ? 'rgba(255,220,180,.06)'
        : 'rgba(90,40,22,.09)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // позёмка
    ctx.fillStyle = 'rgba(255,215,175,.05)';
    for (let i = 0; i < 4; i++) {
      const y = horizon + 40 + i * 34;
      ctx.fillRect(0, y, W, 2);
    }
  }

  /* ---------- параллакс фона ----------
     Фон — «дальний план»: он едет за камерой, но медленнее поля, иначе
     панорама читается как «база едет по неподвижному фону».
     K — доля смещения камеры, которую проходит фон (0.3: поле уходит на
     100 px, холмы — на 30 px). На очень больших панорамах смещение мягко
     упирается в запас кэша, чтобы никогда не открыть пустой край. */
  const BG_PARALLAX_X = 0.3;
  const BG_PAD_MIN = 160;    // запас кэша по краям, px
  const BG_PAD_MAX = 720;
  const BG_PAD_STEP = 80;

  // Панорама в экранных пикселях от «домашнего» положения камеры. Камера
  // хранит panX; если сцену рисуют без камеры (проверки/скриншоты) — 0.
  function bgPanX(view) {
    if (typeof view.panX === 'number' && isFinite(view.panX)) return view.panX;
    if (typeof view.homeX === 'number' && isFinite(view.homeX) && typeof view.ox === 'number') {
      return view.ox - view.homeX;
    }
    return 0;
  }

  function drawBackground(ctx, view) {
    // Горизонт ставим выше верхней точки поля, чтобы база стояла на земле,
    // а не висела в небе. Округляем до 12 px, чтобы не перерисовывать фон
    // на каждый пиксель панорамы.
    const top = (typeof view.oy === 'number' && isFinite(view.oy)) ? view.oy : view.h * 0.42;
    const scale = (typeof view.scale === 'number' && isFinite(view.scale) && view.scale > 0) ? view.scale : 1;
    // держим горизонт чуть выше игровой зоны, но оставляем полосу неба
    const horizon = Math.max(24, Math.min(view.h * 0.42, top + 3 * TH * scale));
    const hq = Math.round(horizon / 12) * 12;

    // Запас кэша считаем от возможной панорамы поля при текущем масштабе:
    // при зуме поле шире экрана, значит и уехать камера может дальше.
    // Берём полный запас (а не половину): база может стоять не в центре
    // поля, и тогда «дом» камеры смещён к краю.
    const fieldW = G * TW * scale;
    const need = BG_PARALLAX_X * Math.max(0, fieldW - view.w) + 48;
    const pad = Math.min(BG_PAD_MAX, Math.max(BG_PAD_MIN,
      Math.ceil(need / BG_PAD_STEP) * BG_PAD_STEP));
    const key = view.w + 'x' + view.h + '@' + hq + 'p' + pad;

    if (bgCache.key !== key || !bgCache.canvas) {
      try {
        const c = makeCanvas(view.w + pad * 2, view.h);
        const cx = c.getContext('2d');
        paintBackground(cx, view.w, view.h, hq, pad);
        bgCache.canvas = c;
        bgCache.key = key;
        bgCache.paints++;
      } catch (e) {
        bgCache.canvas = null;
      }
    }

    if (bgCache.canvas) {
      // Мягкое ограничение: около нуля фон идёт ровно с коэффициентом K,
      // у края запаса плавно замедляется и не выходит за пределы кэша.
      const lim = pad - 8;
      const raw = BG_PARALLAX_X * bgPanX(view);
      const shift = lim * Math.tanh(raw / lim);
      // Целые пиксели: без дробного ресемплинга кэша каждый кадр (резче и дешевле).
      const dx = -pad + Math.round(shift);
      bgCache.pad = pad;
      bgCache.shift = shift;
      ctx.drawImage(bgCache.canvas, dx, 0, view.w + pad * 2, view.h);
    } else {
      paintBackground(ctx, view.w, view.h, hq, 0);
    }
  }

  /* ---------- земля ---------- */

  const groundCache = Object.create(null);
  const GROUND_PAD = 200;
  const FADE = 42;   // на сколько пикселей трава растворяется в фоне

  // ромб поля, растянутый на e пикселей от центра
  function grownDiamond(e) {
    const cy = G * TH / 2;
    const pts = [P(0, 0), P(G, 0), P(G, G), P(0, G)];
    const out = [];

    for (let i = 0; i < 4; i++) {
      const dx = pts[i].x;
      const dy = pts[i].y - cy;
      const len = Math.hypot(dx, dy) || 1;
      out.push({ x: pts[i].x + dx / len * e, y: pts[i].y + dy / len * e });
    }
    return out;
  }

  // мягкое растворение края по четырём нормалям ромба
  function feather(ctx, e0, e1, area) {
    const A = P(0, 0);
    const B = P(G, 0);
    const C = P(G, G);
    const D = P(0, G);
    const cy = G * TH / 2;
    const edges = [[A, B], [B, C], [C, D], [D, A]];

    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';

    for (let i = 0; i < edges.length; i++) {
      const p = edges[i][0];
      const q = edges[i][1];
      let nx = q.y - p.y;
      let ny = -(q.x - p.x);
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2 - cy;

      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }

      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;

      const g = ctx.createLinearGradient(
        mx - nx * e0, (p.y + q.y) / 2 - ny * e0,
        mx + nx * e1, (p.y + q.y) / 2 + ny * e1);

      g.addColorStop(0, 'rgba(0,0,0,1)');
      const te = e0 / (e0 + e1);
      g.addColorStop(Math.min(0.98, te), 'rgba(0,0,0,1)');
      for (let k = 1; k <= 8; k++) {
        const tt = te + (1 - te) * (k / 8);
        const v = Math.pow(Math.cos((k / 8) * Math.PI / 2), 1.5);
        g.addColorStop(Math.min(1, tt), 'rgba(0,0,0,' + v.toFixed(3) + ')');
      }

      ctx.fillStyle = g;
      ctx.fillRect(area.x, area.y, area.w, area.h);
    }

    ctx.restore();
  }

  function paintGround(ctx, far) {
    const simple = !!far;
    reseed(20261117);

    // еле заметная сетка только внутри игрового поля
    const gridA = simple ? 0.05 : 0.085;
    ctx.strokeStyle = 'rgba(255,220,180,' + gridA + ')';
    ctx.lineWidth = 1.15;
    for (let i = 1; i < G; i++) {
      let a = P(i, 0);
      let b = P(i, G);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      a = P(0, i);
      b = P(G, i);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // колея ровера
    ctx.strokeStyle = 'rgba(232,185,138,.14)';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    const mid = P(G / 2, G / 2);
    const exit = P(G, G);
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.quadraticCurveTo((mid.x + exit.x) / 2 - 12, (mid.y + exit.y) / 2, exit.x, exit.y);
    ctx.stroke();

    // пыльные пятна по всему полю и за кромкой
    const patches = simple ? 60 : 130;
    for (let i = 0; i < patches; i++) {
      const p = P(-2 + rnd() * (G + 4), -2 + rnd() * (G + 4));
      const r = 10 + rnd() * 30;
      const kind = rnd();
      ctx.fillStyle = kind < 0.4
        ? 'rgba(255,214,170,' + (0.035 + rnd() * 0.05).toFixed(2) + ')'
        : kind < 0.75
          ? 'rgba(78,32,16,' + (0.035 + rnd() * 0.06).toFixed(2) + ')'
          : 'rgba(201,107,63,' + (0.04 + rnd() * 0.06).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!simple) {
      // кратеры — и внутри поля, и за ним
      for (let i = 0; i < 26; i++) {
        const p = P(-2 + rnd() * (G + 4), -2 + rnd() * (G + 4));
        const r = 4 + rnd() * 10;

        ctx.fillStyle = 'rgba(78,32,16,.3)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(201,107,63,.26)';
        ctx.beginPath();
        ctx.ellipse(p.x - r * 0.15, p.y - r * 0.12, r * 0.62, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,170,.13)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x - r * 0.1, p.y - r * 0.1, r * 0.82, r * 0.4, 0, Math.PI * 0.15, Math.PI * 0.9);
        ctx.stroke();
      }

      // пыльные вихри
      for (let i = 0; i < 26; i++) {
        const p = P(rnd() * G, rnd() * G);
        const s = 3 + rnd() * 6;
        ctx.strokeStyle = 'rgba(232,185,138,' + (0.07 + rnd() * 0.09).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.quadraticCurveTo(p.x, p.y - s * 0.7, p.x + s, p.y - s * 0.15);
        ctx.stroke();
      }

      // камешки по всей площади
      for (let i = 0; i < 60; i++) {
        const p = P(-2 + rnd() * (G + 4), -2 + rnd() * (G + 4));
        ctx.fillStyle = rnd() < 0.55
          ? 'rgba(94,68,55,.55)'
          : 'rgba(154,122,104,.45)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 1.4 + rnd() * 2.2, 1 + rnd() * 1.2, rnd(), 0, Math.PI * 2);
        ctx.fill();
      }

      // мелкие обломки техники
      for (let i = 0; i < 16; i++) {
        const p = P(-1.5 + rnd() * (G + 3), -1.5 + rnd() * (G + 3));
        const w = 2 + rnd() * 5;
        ctx.fillStyle = 'rgba(76,86,92,.5)';
        ctx.fillRect(p.x, p.y, w, 2);
        ctx.fillStyle = 'rgba(255,207,74,.2)';
        ctx.fillRect(p.x + w * 0.35, p.y, 1.2, 1);
      }
    }

    // жизнь вокруг поля
    paintDecor(ctx, simple);
  }

  // кусты, деревья, камни и трава за пределами игровых клеток
  function paintDecor(ctx, far) {
    reseed(77123);

    const items = [];
    const want = far ? 13 : 22;
    let guard = 0;

    while (items.length < want && guard < 500) {
      guard++;
      const gx = -3.4 + rnd() * (G + 6.8);
      const gy = -3.4 + rnd() * (G + 6.8);

      // только вне поля, с запасом от кромки
      if (gx > -1.8 && gx < G + 1.8 && gy > -1.8 && gy < G + 1.8) continue;

      // не липнем друг к другу
      let clash = false;
      for (let i = 0; i < items.length; i++) {
        if (Math.hypot(items[i].gx - gx, items[i].gy - gy) < 1.4) { clash = true; break; }
      }
      if (clash) continue;

      const r = rnd();
      items.push({ gx: gx, gy: gy, kind: r < 0.28 ? 'wreck' : r < 0.6 ? 'rock' : r < 0.8 ? 'antenna' : 'dust' });
    }

    // ближние рисуем последними
    items.sort(function (a, b) { return (a.gx + a.gy) - (b.gx + b.gy); });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = P(it.gx, it.gy);

      if (it.kind === 'wreck') {
        // обломки техники: ржавая плита, стойка, осколок панели
        ctx.fillStyle = 'rgba(60,28,14,.18)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 1, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.moveTo(p.x - 13, p.y);
        ctx.lineTo(p.x + 5, p.y - 5);
        ctx.lineTo(p.x + 12, p.y + 1);
        ctx.lineTo(p.x - 8, p.y + 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = PAL.rust;
        ctx.beginPath();
        ctx.moveTo(p.x - 9, p.y - 1);
        ctx.lineTo(p.x + 2, p.y - 4);
        ctx.lineTo(p.x - 1, p.y + 2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = PAL.metalLight;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - 2, p.y - 4);
        ctx.lineTo(p.x + 4, p.y - 13);
        ctx.lineTo(p.x + 10, p.y - 12);
        ctx.stroke();

        if (!far) {
          ctx.fillStyle = 'rgba(70,224,200,.35)';
          ctx.fillRect(p.x + 4, p.y - 11, 3, 2);
        }
      } else if (it.kind === 'rock') {
        ctx.fillStyle = 'rgba(60,28,14,.16)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, 8, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PAL.stoneDark;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 2, 7, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.stone;
        ctx.beginPath();
        ctx.ellipse(p.x - 1.5, p.y - 3.5, 5.4, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.stoneLight;
        ctx.beginPath();
        ctx.ellipse(p.x - 2.5, p.y - 4.5, 2.6, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === 'antenna') {
        const h = 20 + rnd() * 12;

        ctx.fillStyle = 'rgba(60,28,14,.14)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, 7, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PAL.metalDark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - h);
        ctx.stroke();

        ctx.fillStyle = PAL.metalLight;
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y - h + 2, 7, 3, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.arc(p.x + 3, p.y - h + 2, 1.4, 0, Math.PI * 2);
        ctx.fill();

        if (!far) {
          ctx.strokeStyle = 'rgba(70,224,200,.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - h * 0.4);
          ctx.lineTo(p.x - 5, p.y - h * 0.4 - 3);
          ctx.stroke();
        }
      } else {
        // пыльный вихрь
        ctx.strokeStyle = 'rgba(232,185,138,.22)';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          const rr = 3 + k * 3;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 2 - k, rr, rr * 0.4, 0, Math.PI * 0.15, Math.PI * 1.2);
          ctx.stroke();
        }
      }
    }
  }

  function drawGround(ctx) {
    const far = lod === 0;
    // качество кэша привязано к экранному размеру тайла: не растим
    // гигантскую текстуру, когда камера и так показывает поле мелко
    let q;
    let ss;
    if (tilePx < 34) { q = 'lo'; ss = 0.7; }
    else if (tilePx < 72) { q = 'mid'; ss = 1.0; }
    else if (tilePx < 110) { q = 'hi'; ss = 1.45; }
    else { q = 'max'; ss = 1.8; }
    q += far ? 'f' : 'n';

    let cache = groundCache[q];

    if (!cache) {
      try {
        const bx = -G * TW / 2 - GROUND_PAD;
        const by = -GROUND_PAD;
        const bw = G * TW + GROUND_PAD * 2;
        const bh = G * TH + GROUND_PAD * 2;

        const c = makeCanvas(bw * ss, bh * ss);
        const cx = c.getContext('2d');
        cx.setTransform(ss, 0, 0, ss, -bx * ss, -by * ss);
        paintGround(cx, far);

        cache = { canvas: c, x: bx, y: by, w: bw, h: bh };
        groundCache[q] = cache;
      } catch (e) {
        cache = null;
      }
    }

    if (cache) {
      ctx.drawImage(cache.canvas, cache.x, cache.y, cache.w, cache.h);
    } else {
      paintGround(ctx, far);
    }
  }

  const vigCache = { key: '', canvas: null };

  function drawVignette(ctx, view) {
    const key = view.w + 'x' + view.h;

    if (vigCache.key !== key || !vigCache.canvas) {
      try {
        const c = makeCanvas(view.w, view.h);
        const cx = c.getContext('2d');
        const g = cx.createRadialGradient(
          view.w / 2, view.h * 0.45, Math.min(view.w, view.h) * 0.28,
          view.w / 2, view.h * 0.5, Math.max(view.w, view.h) * 0.8);
        g.addColorStop(0, 'rgba(40,18,10,0)');
        g.addColorStop(1, 'rgba(40,18,10,.26)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, view.w, view.h);
        vigCache.canvas = c;
        vigCache.key = key;
      } catch (e) {
        vigCache.canvas = null;
      }
    }

    if (vigCache.canvas) ctx.drawImage(vigCache.canvas, 0, 0, view.w, view.h);
    else {
      const g = ctx.createRadialGradient(
        view.w / 2, view.h * 0.45, Math.min(view.w, view.h) * 0.28,
        view.w / 2, view.h * 0.5, Math.max(view.w, view.h) * 0.8);
      g.addColorStop(0, 'rgba(40,18,10,0)');
      g.addColorStop(1, 'rgba(40,18,10,.26)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* ---------- стены ---------- */

  let wallRunCache = { src: null, alive: -1, lvl: -1, runs: [] };

  // Склеиваем соседние сегменты в непрерывные участки: сначала горизонтальные
  // цепочки длиной 2+, потом вертикальные, одиночные остаются как есть.
  function wallRuns(buildings) {
    const map = {};
    let count = 0;
    let top = 1;

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.dead || b.type !== 'wall') continue;
      map[b.x + ',' + b.y] = b;
      count++;
      const l = levelOf(b);
      if (l > top) top = l;
    }
    if (!count) return [];

    // Тот же массив (бой) и то же число живых стен — участки не пересчитываем.
    if (wallRunCache.src === buildings && wallRunCache.alive === count && wallRunCache.lvl === top) {
      return wallRunCache.runs;
    }

    const used = {};
    const runs = [];

    // горизонтальные
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        if (!map[x + ',' + y] || used[x + ',' + y]) continue;
        let len = 1;
        while (map[(x + len) + ',' + y] && !used[(x + len) + ',' + y]) len++;
        if (len < 2) continue;

        const cells = [];
        for (let i = 0; i < len; i++) {
          used[(x + i) + ',' + y] = true;
          cells.push(map[(x + i) + ',' + y]);
        }
        runs.push({
          x: x, y: y, w: len, h: 1, cells: cells, lvl: runLevel(cells),
          extA: map[(x - 1) + ',' + y] ? 0.5 : 0,
          extB: map[(x + len) + ',' + y] ? 0.5 : 0
        });
        x += len - 1;
      }
    }

    // вертикальные и одиночные
    for (let x = 0; x < G; x++) {
      for (let y = 0; y < G; y++) {
        if (!map[x + ',' + y] || used[x + ',' + y]) continue;
        let len = 1;
        while (map[x + ',' + (y + len)] && !used[x + ',' + (y + len)]) len++;

        const cells = [];
        for (let i = 0; i < len; i++) {
          used[x + ',' + (y + i)] = true;
          cells.push(map[x + ',' + (y + i)]);
        }
        runs.push({
          x: x, y: y, w: 1, h: len, cells: cells, lvl: runLevel(cells),
          extA: map[x + ',' + (y - 1)] ? 0.5 : 0,
          extB: map[x + ',' + (y + len)] ? 0.5 : 0
        });
        y += len - 1;
      }
    }

    wallRunCache = { src: buildings, alive: count, lvl: top, runs: runs };
    return runs;
  }

  // участок стены выглядит по самому прокачанному сегменту
  function runLevel(cells) {
    let lvl = 1;
    for (let i = 0; i < cells.length; i++) {
      const l = levelOf(cells[i]);
      if (l > lvl) lvl = l;
    }
    return lvl;
  }

  // зубец на верхней грани участка


  // Пролёт режем на клеточные секции: каждая попадает в общий список глубины
  // отдельно, поэтому соседняя постройка встаёт между нужными клетками стены.
  function wallSections(run) {
    const alongX = run.w >= run.h;
    const len = Math.max(run.w, run.h);
    const out = [];

    for (let i = 0; i < len; i++) {
      const cell = run.cells && run.cells[i];
      out.push({
        x: alongX ? run.x + i : run.x,
        y: alongX ? run.y : run.y + i,
        w: alongX ? 1 : run.w,
        h: alongX ? run.h : 1,
        cells: cell ? [cell] : [],
        lvl: cell ? runLevel([cell]) : (run.lvl || 1),
        extA: i === 0 ? (run.extA || 0) : 0,
        extB: i === len - 1 ? (run.extB || 0) : 0,
        alongX: alongX,
        first: i === 0,
        last: i === len - 1
      });
    }

    return out;
  }

  // торцы секции: на стыке с соседней клеткой грань не рисуем, иначе шов


  /* Клетка стены — тоже статичный спрайт. Торцы на стыках не рисуются,
     поэтому соседние спрайты стыкуются без шва. */
  const wallSpriteCache = new Map();

  function wallSprite(r) {
    const key = 'w|' + r.lvl + '|' + (r.alongX ? 1 : 0) + '|' +
      (r.first ? 1 : 0) + (r.last ? 1 : 0) + '|' +
      (r.extA || 0) + '|' + (r.extB || 0) + '|' + lod;

    if (wallSpriteCache.has(key)) return wallSpriteCache.get(key);

    const left = 42;
    const top = 76;
    const cw = 84;
    const ch = 126;
    const ss = lod === 0 ? 1 : 1.5;

    let sp = null;
    try {
      const c = makeCanvas(cw * ss, ch * ss);
      const cx = c.getContext('2d');
      cx.setTransform(ss, 0, 0, ss, left * ss, top * ss);
      drawWallRun(cx, {
        x: 0, y: 0, w: r.w, h: r.h, cells: [],
        lvl: r.lvl, alongX: r.alongX, first: r.first, last: r.last,
        extA: r.extA || 0, extB: r.extB || 0
      }, { section: true });
      sp = { canvas: c, left: left, top: top, w: cw, h: ch };
    } catch (e) {
      sp = null;
    }

    wallSpriteCache.set(key, sp);
    return sp;
  }

  function wallPulse(ctx, r) {
    if (lod === 0) return;
    const lvl = r.lvl || 1;
    const H = 23 + (lvl >= 3 ? 5 : 0);
    const pts = wallFieldPoints(r);
    const a = pts.a;
    const b = pts.b;
    const pulse = lvl >= 10
      ? 0.14 + 0.09 * (0.5 + 0.5 * Math.sin(t * 3 + (r.x + r.y) * 0.8))
      : 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.6 + (r.x + r.y) * 0.8));

    poly(ctx, [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: b.x, y: b.y - H },
      { x: a.x, y: a.y - H }
    ], lvl >= 5
      ? 'rgba(255,207,74,' + pulse.toFixed(3) + ')'
      : 'rgba(70,224,200,' + pulse.toFixed(3) + ')');
  }

  function drawWallSection(ctx, r) {
    if (!spritesOn || tilePx > 96) {
      drawWallRun(ctx, r, { section: true });
      wallPulse(ctx, r);
      return;
    }

    const sp = wallSprite(r);
    if (!sp) {
      drawWallRun(ctx, r, { section: true });
      wallPulse(ctx, r);
      return;
    }

    const p = P(r.x, r.y);
    ctx.drawImage(sp.canvas, p.x - sp.left, p.y - sp.top, sp.w, sp.h);
    wallPulse(ctx, r);
  }

  // Точки силового поля участка (с учётом стыков на углах).
  function wallFieldPoints(run) {
    const a0 = -(run.extA || 0);
    const a1 = (run.alongX ? run.w : run.h) + (run.extB || 0);
    if (run.alongX) {
      return {
        a: P(run.x + a0 + 0.02, run.y + 0.5),
        b: P(run.x + a1 - 0.02, run.y + 0.5)
      };
    }
    return {
      a: P(run.x + 0.5, run.y + a0 + 0.02),
      b: P(run.x + 0.5, run.y + a1 - 0.02)
    };
  }

  function barrierPost(ctx, px, py, H, lvl) {
    // тумба
    prism(ctx, px - 0.12, py - 0.12, px + 0.12, py + 0.12, 0, 3,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    // столб
    prism(ctx, px - 0.075, py - 0.075, px + 0.075, py + 0.075, 3, H,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    // наконечник
    prism(ctx, px - 0.1, py - 0.1, px + 0.1, py + 0.1, H + 3, 3,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    if (lvl >= 5) {
      spot(ctx, px + (0), py - H - 7, 1.8, PAL.gold);
    } else if (lvl >= 3 && mid()) {
      spot(ctx, px, py - H - 6, 1.1, PAL.cyan);
    }

    /* 6-10: столб обрастает индикацией и рёбрами */
    if (lvl >= 6) {
      spot(ctx, px - 0.05, py - H * 0.55, 1.1, PAL.glass);
    }
    if (lvl >= 7) {
      // боковые рёбра у основания
      prism(ctx, px - 0.16, py - 0.04, px - 0.08, py + 0.04, 3, 7,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      prism(ctx, px + 0.08, py - 0.04, px + 0.16, py + 0.04, 3, 7,
        PAL.metalDark, PAL.metal, PAL.metalDark);
    }
    if (lvl >= 8) {
      // короткий эмиттерный шип над наконечником
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py - H - 10);
      ctx.lineTo(px, py - H - 16);
      ctx.stroke();
      spot(ctx, px, py - H - 17, 1.5, PAL.cold);
    }
    if (lvl >= 9) {
      prism(ctx, px - 0.11, py - 0.11, px + 0.11, py + 0.11, H + 6, 2,
        PAL.gold, PAL.gold, PAL.gold);
    }
    if (lvl >= 10) {
      prism(ctx, px - 0.14, py - 0.03, px - 0.08, py + 0.03, H - 8, 10,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      prism(ctx, px + 0.08, py - 0.03, px + 0.14, py + 0.03, H - 8, 10,
        PAL.metalDark, PAL.metal, PAL.metalDark);
    }
  }

  function drawWallRun(ctx, run, opts) {
    const part = !!(opts && opts.section);
    const lvl = run.lvl || 1;
    const alongX = typeof run.alongX === 'boolean' ? run.alongX : (run.w >= run.h);
    const H = 23 + (lvl >= 3 ? 5 : 0);
    const x0 = run.x;
    const y0 = run.y;
    const x1 = run.x + run.w;
    const y1 = run.y + run.h;

    // газон и тень — один раз на пролёт, до построек
    if (!part || opts.pad) {
      grassPad(ctx, x0, y0, x1, y1);
      castShadow(ctx, x0, y0, x1, y1, 0.9);
    }

    const pts = wallFieldPoints({
      x: x0, y: y0, w: run.w, h: run.h,
      extA: run.extA || 0, extB: run.extB || 0, alongX: alongX
    });
    const a = pts.a;
    const b = pts.b;

    // силовое поле
    const field = lvl >= 5 ? PAL.amber : PAL.cyan;
    poly(ctx, [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: b.x, y: b.y - H },
      { x: a.x, y: a.y - H }
    ], lvl >= 5 ? 'rgba(255,207,74,.32)' : 'rgba(70,224,200,.3)');

    // внутреннее свечение и кромка
    ctx.strokeStyle = lvl >= 5 ? 'rgba(255,207,74,.9)' : 'rgba(70,224,200,.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 2);
    ctx.lineTo(b.x, b.y - 2);
    ctx.moveTo(a.x, a.y - H + 1);
    ctx.lineTo(b.x, b.y - H + 1);
    ctx.stroke();

    // решётка усиленного поля
    if (lvl >= 3 && mid()) {
      ctx.strokeStyle = lvl >= 5 ? 'rgba(255,207,74,.3)' : 'rgba(70,224,200,.26)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 1; k <= 2; k++) {
        ctx.moveTo(a.x, a.y - H * k / 3);
        ctx.lineTo(b.x, b.y - H * k / 3);
      }
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.moveTo(mx, my);
      ctx.lineTo(mx, my - H);
      ctx.stroke();
    }

    /* --- 6-10: поле набирает мощность --- */

    // 6: нижняя световая кромка и мелкая насечка
    if (lvl >= 6) {
      ctx.strokeStyle = lvl >= 9 ? 'rgba(255,207,74,.55)' : 'rgba(127,233,255,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 3);
      ctx.lineTo(b.x, b.y - 3);
      ctx.stroke();
      if (mid()) {
        ctx.strokeStyle = 'rgba(127,233,255,.22)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let k = 1; k <= 3; k++) {
          const u = k / 4;
          const px = a.x + (b.x - a.x) * u;
          const py = a.y + (b.y - a.y) * u;
          ctx.moveTo(px, py - 2);
          ctx.lineTo(px, py - H + 2);
        }
        ctx.stroke();
      }
    }

    // 7: второй контур — рейка над полем на коротких стойках
    if (lvl >= 7) {
      ctx.strokeStyle = 'rgba(154,167,173,.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 4);
      ctx.lineTo(b.x, b.y - H - 4);
      ctx.moveTo(a.x, a.y - H - 4);
      ctx.lineTo(a.x, a.y - H);
      ctx.moveTo(b.x, b.y - H - 4);
      ctx.lineTo(b.x, b.y - H);
      ctx.stroke();
    }

    // 9: золотая рейка по верху поля
    if (lvl >= 9) {
      ctx.strokeStyle = 'rgba(255,207,74,.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 6);
      ctx.lineTo(b.x, b.y - H - 6);
      ctx.stroke();
    }

    // 10: второй слой поля — пульсирующая надстройка
    if (lvl >= 10) {
      const band = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.4 + (run.x + run.y) * 0.6));
      poly(ctx, [
        { x: a.x, y: a.y - H - 6 },
        { x: b.x, y: b.y - H - 6 },
        { x: b.x, y: b.y - H - 13 },
        { x: a.x, y: a.y - H - 13 }
      ], 'rgba(255,207,74,' + band.toFixed(3) + ')');
      ctx.strokeStyle = 'rgba(255,207,74,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 13);
      ctx.lineTo(b.x, b.y - H - 13);
      ctx.stroke();
    }

    // столбы на концах; на стыке секций они совпадают и закрывают шов
    if (alongX) {
      barrierPost(ctx, x0, y0 + 0.5, H, lvl);
      barrierPost(ctx, x1, y0 + 0.5, H, lvl);
    } else {
      barrierPost(ctx, x0 + 0.5, y0, H, lvl);
      barrierPost(ctx, x0 + 0.5, y1, H, lvl);
    }

    // полоска здоровья — одна на участок
    if (!part || opts.bar) wallHpBar(ctx, run, H + 10);
  }

  // частокол: насыпь + плотный ряд заострённых брёвен без просветов


  // полоска HP участка стены
  function wallHpBar(ctx, run, topPx) {
    let hp = 0;
    let maxHp = 0;
    for (let i = 0; i < run.cells.length; i++) {
      hp += run.cells[i].hp;
      maxHp += run.cells[i].maxHp;
    }
    if (!(maxHp > 0) || hp >= maxHp) return;

    const A = P(run.x, run.y);
    const B = P(run.x + run.w, run.y);
    const C = P(run.x + run.w, run.y + run.h);
    const D = P(run.x, run.y + run.h);

    const cx = (A.x + B.x + C.x + D.x) / 4;
    const w = Math.min(40, 10 + run.cells.length * 8);
    const y = Math.min(A.y, B.y, C.y, D.y) - topPx - 6;

    ctx.fillStyle = 'rgba(40,36,28,.45)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, 4);
    ctx.fillStyle = hpColor(hp / maxHp);
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, hp / maxHp), 2);
  }

  // вертикальные стыки кладки на грани


  /* ---------- постройки ---------- */

  // уровень постройки: 1..10, на любых данных — без падений
  function levelOf(b) {
    let l = 1;
    try {
      if (b && typeof b.__level === 'number') l = b.__level;
      else if (CC.Game && typeof CC.Game.level === 'function') l = CC.Game.level(b.id);
      else if (b && typeof b.level === 'number') l = b.level;
    } catch (e) {
      l = 1;
    }
    l = Math.floor(Number(l));
    if (!isFinite(l) || l < 1) return 1;
    return l > MAXLVL ? MAXLVL : l;
  }

  function spot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // вымпел на древке
  function pennant(ctx, x, y, h, color, w) {
    ctx.strokeStyle = PAL.dark;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();

    poly(ctx, [
      { x: x, y: y - h },
      { x: x + w, y: y - h + w * 0.38 },
      { x: x, y: y - h + w * 0.76 }
    ], color);
  }

  // прямоугольное знамя
  function banner(ctx, x, y, h, w, hh, color) {
    ctx.strokeStyle = PAL.dark;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();

    poly(ctx, [
      { x: x + 1, y: y - h + 1 },
      { x: x + 1 + w, y: y - h + 3 },
      { x: x + 1 + w, y: y - h + 3 + hh },
      { x: x + 1, y: y - h + 1 + hh }
    ], color);
  }

  // деталь на грани: высоты в пикселях, чтобы не зависеть от высоты стены
  function patchPx(ctx, a, b, H, u0, u1, y0, y1, color) {
    wallPatch(ctx, a, b, H, u0, u1, y0 / H, y1 / H, color);
  }

  /* ---------- детали верхних ступеней (6-10) ----------
     Лестница 1-5 остаётся как была, дальше накапливаем детали поверх.
     Всё статичное запекается в спрайт постройки, поэтому в кадре новые
     ступени почти ничего не стоят; пульсируют только акценты 10 уровня. */

  // Ряд окон по грани: тёмная рамка и стекло. a,b — нижнее ребро грани.
  function windowRow(ctx, a, b, H, u0, u1, y0, y1, n, glass) {
    const gap = (u1 - u0) / n;
    for (let i = 0; i < n; i++) {
      const k0 = u0 + gap * i + gap * 0.2;
      const k1 = u0 + gap * (i + 1) - gap * 0.2;
      patchPx(ctx, a, b, H, k0, k1, y0 - 1.5, y1 + 1.5, 'rgba(18,30,36,.72)');
      patchPx(ctx, a, b, H, k0, k1, y0, y1, glass || PAL.glass);
    }
  }

  // Вертикальные рёбра жёсткости по грани — один path на все штрихи.
  function ribLines(ctx, a, b, H, u0, u1, y0, y1, n, color, width) {
    ctx.strokeStyle = color || 'rgba(76,86,92,.5)';
    ctx.lineWidth = width || 1.3;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = u0 + (u1 - u0) * (i / n);
      const px = a.x + (b.x - a.x) * k;
      const py = a.y + (b.y - a.y) * k;
      ctx.moveTo(px, py - y0);
      ctx.lineTo(px, py - y1);
    }
    ctx.stroke();
  }

  // Мачта-антенна с огоньком на конце.
  function antennaMast(ctx, x, y, h, color, tip) {
    ctx.strokeStyle = color || PAL.metalLight;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    spot(ctx, x, y - h - 1.5, 1.7, tip || PAL.cyan);
    if (mid()) spot(ctx, x - 0.6, y - h - 2, 0.7, 'rgba(255,250,235,.8)');
  }

  // Выхлопной патрубок с дымком (статичный, чтобы не стоить кадров).
  function exhaustStack(ctx, x, y, h, w, hot) {
    ctx.fillStyle = PAL.metalDark;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(x - w / 2, y - h, Math.max(1, w * 0.42), h);
    ctx.fillStyle = shade(PAL.metalDark, -0.12);
    ctx.fillRect(x - w / 2 - 1.2, y - h - 1.6, w + 2.4, 2);
    ctx.fillStyle = hot || 'rgba(226,213,180,.2)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y - h - 6, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4, y - h - 11, 2.2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Золотое навершие: шпиль и бирюзовый камень.
  function spire(ctx, x, y, h, gem) {
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    poly(ctx, [
      { x: x, y: y - h - 4.5 },
      { x: x + 2.6, y: y - h - 0.6 },
      { x: x, y: y - h + 3.2 },
      { x: x - 2.6, y: y - h - 0.6 }
    ], gem || PAL.cold);
  }

  // Кольцо-оправа на круглой детали (купол, бак, платформа).
  function ring(ctx, x, y, rx, ry, color, width) {
    ctx.strokeStyle = color || PAL.gold;
    ctx.lineWidth = width || 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Пульсирующая полоса максимального уровня: золотая рамка по пятну.
  // Рисуется в кадре, но это один stroke на постройку уровня 10.
  function maxBand(ctx, b, lvl) {
    if (lvl < MAXLVL || !mid()) return;
    const a = 0.32 + 0.26 * (0.5 + 0.5 * Math.sin(t * 2.2 + (b.x + b.y) * 0.7));
    const A = P(b.x + 0.05, b.y + 0.05);
    const B = P(b.x + b.w - 0.05, b.y + 0.05);
    const C = P(b.x + b.w - 0.05, b.y + b.h - 0.05);
    const D = P(b.x + 0.05, b.y + b.h - 0.05);
    ctx.strokeStyle = 'rgba(255,207,74,' + a.toFixed(3) + ')';
    ctx.lineWidth = 2;
    diamond(ctx, A, B, C, D);
    ctx.stroke();
  }

  // цвет крыши по уровню: солома → черепица


  // солнечная панель на экране: тёмное стекло и циановая сетка
  function solarPanel(ctx, x, y, w, h, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = '#263f4d';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(70,224,200,.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(-w / 2 + w * i / 4, -h / 2);
      ctx.lineTo(-w / 2 + w * i / 4, h / 2);
    }
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.stroke();
    ctx.restore();
  }

  function drawHouse(ctx, b, look, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 22 + (lvl >= 4 ? 6 : 0);
    const baseH = lvl >= 3 ? 8 : 4;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 1.15);

    // опорная плита
    prism(ctx, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 0, baseH,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    // основной модуль
    box(ctx, x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, H, PAL.panel);

    // световая полоса по корпусу
    const D = P(x0 + 0.2, y1 - 0.2);
    const C = P(x1 - 0.2, y1 - 0.2);
    const B = P(x1 - 0.2, y0 + 0.2);
    patchPx(ctx, D, C, H, 0.12, 0.88, 8, 11, PAL.cyan);
    patchPx(ctx, D, C, H, 0.2, 0.5, 15, 20, PAL.glass);
    patchPx(ctx, C, B, H, 0.2, 0.45, 14, 19, PAL.glass);

    // второй модуль с 4 уровня
    if (lvl >= 4) {
      prism(ctx, x0 + 0.12, y0 + 0.12, x0 + 0.62, y0 + 0.62, baseH + 4, 16,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, P(x0 + 0.37, y0 + 0.37).x, P(x0 + 0.37, y0 + 0.37).y - baseH - 22, 2.2, PAL.cyan);
    }

    // купол
    const topY = baseH + H;
    const drx = b.w * TW * 0.22;
    const dry = b.w * TH * 0.42;

    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx, dry * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx, dry, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // циановая полоса по основанию купола
    ctx.strokeStyle = lvl >= 5 ? PAL.gold : PAL.cyan;
    ctx.lineWidth = lvl >= 5 ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx, dry * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    // блик купола
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.beginPath();
    ctx.ellipse(p.x - drx * 0.3, p.y - topY - dry * 0.45, drx * 0.24, dry * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // антенна с маяком
    const mastY = p.y - topY - dry;
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, mastY);
    ctx.lineTo(p.x, mastY - 24 - (lvl >= 5 ? 8 : 0));
    ctx.stroke();
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, mastY - 12);
    ctx.lineTo(p.x - 7, mastY - 17);
    ctx.moveTo(p.x, mastY - 16);
    ctx.lineTo(p.x + 7, mastY - 21);
    ctx.stroke();
    spot(ctx, p.x, mastY - 27 - (lvl >= 5 ? 8 : 0), lvl >= 5 ? 2.6 : 2, lvl >= 5 ? PAL.gold : PAL.amber);
    if (mid()) spot(ctx, p.x - 0.6, mastY - 27.8 - (lvl >= 5 ? 8 : 0), 0.8, 'rgba(255,250,235,.8)');

    // солнечные панели по бокам
    solarPanel(ctx, p.x - drx - 14, p.y - topY + 2, 26, 15, -0.22);
    solarPanel(ctx, p.x + drx + 12, p.y - topY + 1, 24, 14, 0.2);
    if (lvl >= 2) {
      solarPanel(ctx, p.x - drx - 10, p.y - topY + 18, 20, 12, -0.18);
    }
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - topY, drx + 3, dry * 0.55 + 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* --- 6-10: командный центр растёт ярусами --- */

    // 6: светящиеся окна по фасаду и огни на цоколе
    if (lvl >= 6) {
      windowRow(ctx, D, C, H, 0.12, 0.88, 24, 30, 4);
      windowRow(ctx, C, B, H, 0.2, 0.62, 22, 27, 2);
      spot(ctx, P(x0 + 0.34, y1 - 0.18).x, P(x0 + 0.34, y1 - 0.18).y - 4, 1.5, PAL.gold);
      spot(ctx, P(x1 - 0.34, y1 - 0.18).x, P(x1 - 0.34, y1 - 0.18).y - 4, 1.5, PAL.gold);
    }

    // 7: рёбра жёсткости на корпусе и второй контур купола
    if (lvl >= 7) {
      ribLines(ctx, D, C, H, 0.08, 0.92, 5, H - 5, 5, 'rgba(76,86,92,.42)', 1.2);
      ctx.strokeStyle = 'rgba(154,167,173,.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - topY - 3, drx * 0.8, dry * 0.92, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    // 8: вторая антенна и выхлопной патрубок за куполом
    if (lvl >= 8) {
      antennaMast(ctx, p.x - drx * 0.62, p.y - topY - 1, 20, PAL.metalLight, PAL.cyan);
      exhaustStack(ctx, p.x + drx * 0.66, p.y - topY + 1, 14, 4.4);
    }

    // 9: золотые навершия и два вымпела на цоколе
    if (lvl >= 9) {
      spire(ctx, p.x - drx * 0.92, p.y - topY + 4, 12);
      spire(ctx, p.x + drx * 0.92, p.y - topY + 4, 12);
      pennant(ctx, p.x - drx - 6, p.y - topY + 12, 17, PAL.gold, 7);
      pennant(ctx, p.x + drx + 6, p.y - topY + 12, 15, PAL.cold, 6);
    }

    // 10: верхний ярус — кольцевая площадка связи над куполом
    if (lvl >= 10) {
      const deckY = p.y - topY - dry - 8;
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(p.x, deckY + 2, 13, 5.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalLight;
      ctx.beginPath();
      ctx.ellipse(p.x, deckY, 13, 5.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ring(ctx, p.x, deckY, 13, 5.4, PAL.gold, 1.8);
      spot(ctx, p.x - 8, deckY - 0.5, 1.5, PAL.glass);
      spot(ctx, p.x + 8, deckY - 0.5, 1.5, PAL.glass);
      // стойки площадки к куполу
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, deckY + 3);
      ctx.lineTo(p.x - 5, p.y - topY - dry * 0.5);
      ctx.moveTo(p.x + 9, deckY + 3);
      ctx.lineTo(p.x + 5, p.y - topY - dry * 0.5);
      ctx.stroke();
    }
  }

  /* Ангар — низкий широкий модуль с воротами, из которых выходят бойцы. */
  function drawBarracks(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 22 + (lvl >= 4 ? 4 : 0);

    const hy0 = y0 + 0.12;
    const hy1 = y1 - 0.66;
    const hx0 = x0 + 0.1;
    const hx1 = x1 - 0.1;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 1.1);

    if (lvl >= 3) {
      prism(ctx, hx0 - 0.05, hy0 - 0.05, hx1 + 0.05, hy1 + 0.05, 0, 6,
        PAL.stoneLight, PAL.stone, PAL.stoneDark);
    }

    box(ctx, hx0, hy0, hx1, hy1, H, PAL.metal);

    const D = P(hx0, hy1);
    const C = P(hx1, hy1);
    const B = P(hx1, hy0);

    // плоская крыша: светлая панель с рёбрами
    prism(ctx, hx0 - 0.06, hy0 - 0.06, hx1 + 0.06, hy1 + 0.06, H, 4,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // вентиляция на крыше
    const vx = P((hx0 + hx1) / 2, (hy0 + hy1) / 2);
    prism(ctx, hx0 + 0.62, hy0 + 0.2, hx0 + 0.98, hy0 + 0.44, H + 4, 5,
      PAL.metalDark, PAL.metal, PAL.metalDark);
    if (lvl >= 4) {
      prism(ctx, hx0 + 0.2, hy0 + 0.24, hx0 + 0.5, hy0 + 0.46, H + 4, 7,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, P(hx0 + 0.35, hy0 + 0.35).x, P(hx0 + 0.35, hy0 + 0.35).y - H - 14, 1.8, PAL.cyan);
    }

    // большие ворота
    patchPx(ctx, D, C, H, 0.28, 0.72, 0, H * 0.78, PAL.dark);
    patchPx(ctx, D, C, H, 0.3, 0.7, 1, H * 0.74, shade(PAL.metalDark, -0.04));
    // створки
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo((D.x + C.x) / 2, (D.y + C.y) / 2 - 2);
    ctx.lineTo((D.x + C.x) / 2, (D.y + C.y) / 2 - H * 0.76);
    ctx.stroke();
    // циановая рамка
    patchPx(ctx, D, C, H, 0.25, 0.3, 0, H * 0.8, PAL.cyan);
    patchPx(ctx, D, C, H, 0.7, 0.75, 0, H * 0.8, PAL.cyan);
    patchPx(ctx, D, C, H, 0.25, 0.75, H * 0.76, H * 0.8, PAL.cyan);

    // янтарные полосы у ворот
    patchPx(ctx, D, C, H, 0.2, 0.24, 0, H * 0.4, PAL.amber);
    patchPx(ctx, D, C, H, 0.76, 0.8, 0, H * 0.4, PAL.amber);

    // боковые окна
    patchPx(ctx, C, B, H, 0.28, 0.45, 8, 15, PAL.glass);
    patchPx(ctx, C, B, H, 0.55, 0.72, 8, 15, PAL.glass);

    // посадочная площадка перед ангаром
    const ap = P((x0 + x1) / 2, y1 - 0.18);
    ctx.fillStyle = 'rgba(76,86,92,.55)';
    ctx.beginPath();
    ctx.ellipse(ap.x, ap.y, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,224,200,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(ap.x, ap.y, 19, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (mid()) {
      ctx.strokeStyle = 'rgba(255,207,74,.45)';
      ctx.beginPath();
      ctx.moveTo(ap.x - 8, ap.y);
      ctx.lineTo(ap.x + 8, ap.y);
      ctx.stroke();
    }

    // 5: золотая окантовка крыши и маяк
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.8;
      const RA = P(hx0 - 0.06, hy0 - 0.06);
      const RB = P(hx1 + 0.06, hy0 - 0.06);
      const RC = P(hx1 + 0.06, hy1 + 0.06);
      const RD = P(hx0 - 0.06, hy1 + 0.06);
      ctx.beginPath();
      ctx.moveTo(RA.x, RA.y - H - 4);
      ctx.lineTo(RB.x, RB.y - H - 4);
      ctx.lineTo(RC.x, RC.y - H - 4);
      ctx.lineTo(RD.x, RD.y - H - 4);
      ctx.closePath();
      ctx.stroke();
      spot(ctx, vx.x, vx.y - H - 18, 2.2, PAL.amber);
    }

    /* --- 6-10: ангар обрастает техникой --- */

    // 6: фонари у ворот и светящиеся окна вдоль борта
    if (lvl >= 6) {
      const lx = D.x + (C.x - D.x) * 0.2;
      const ly = D.y + (C.y - D.y) * 0.2;
      spot(ctx, lx, ly - H * 0.84, 2.2, PAL.glass);
      spot(ctx, D.x + (C.x - D.x) * 0.8, D.y + (C.y - D.y) * 0.8 - H * 0.84, 2.2, PAL.glass);
      windowRow(ctx, C, B, H, 0.24, 0.76, 8, 14, 3);
      spot(ctx, P(hx0 + 0.14, hy1 - 0.14).x, P(hx0 + 0.14, hy1 - 0.14).y - 2, 1.5, PAL.cyan);
    }

    // 7: рёбра на крыше и стяжки борта
    if (lvl >= 7) {
      const RA = P(hx0 - 0.06, hy0 - 0.06);
      const RB = P(hx1 + 0.06, hy0 - 0.06);
      const RC = P(hx1 + 0.06, hy1 + 0.06);
      const RD = P(hx0 - 0.06, hy1 + 0.06);
      ctx.strokeStyle = 'rgba(76,86,92,.5)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 1; i <= 4; i++) {
        const k = i / 5;
        ctx.moveTo(RA.x + (RB.x - RA.x) * k, RA.y + (RB.y - RA.y) * k - H - 4);
        ctx.lineTo(RD.x + (RC.x - RD.x) * k, RD.y + (RC.y - RD.y) * k - H - 4);
      }
      ctx.stroke();
      ribLines(ctx, C, B, H, 0.1, 0.9, 4, H - 3, 4, 'rgba(76,86,92,.4)', 1.1);
    }

    // 8: два выхлопа за крышей и антенна связи
    if (lvl >= 8) {
      const e1 = P(hx1 - 0.24, hy0 + 0.16);
      const e2 = P(hx1 - 0.5, hy0 + 0.2);
      exhaustStack(ctx, e1.x, e1.y - H - 4, 15, 4.6);
      exhaustStack(ctx, e2.x, e2.y - H - 4, 11, 3.6);
      const a = P(hx0 + 0.16, hy0 + 0.2);
      antennaMast(ctx, a.x, a.y - H - 4, 18, PAL.metalLight, PAL.cyan);
    }

    // 9: золотые навершия по углам крыши и вымпелы у ворот
    if (lvl >= 9) {
      spire(ctx, P(hx0 - 0.06, hy0 - 0.06).x, P(hx0 - 0.06, hy0 - 0.06).y - H - 4, 11);
      spire(ctx, P(hx1 + 0.06, hy0 - 0.06).x, P(hx1 + 0.06, hy0 - 0.06).y - H - 4, 11);
      pennant(ctx, P(hx0 + 0.24, hy1 + 0.06).x, P(hx0 + 0.24, hy1 + 0.06).y - H, 15, PAL.gold, 6);
      pennant(ctx, P(hx1 - 0.24, hy1 + 0.06).x, P(hx1 - 0.24, hy1 + 0.06).y - H, 13, PAL.cold, 5);
    }

    // 10: диспетчерская башенка на крыше — верхняя ступень силуэта
    if (lvl >= 10) {
      const t = P(hx1 - 0.36, hy0 + 0.34);
      prism(ctx, hx1 - 0.56, hy0 + 0.16, hx1 - 0.16, hy0 + 0.52, H + 4, 13,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(t.x - 6, t.y - H - 17, 12, 3.4);
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(t.x - 6, t.y - H - 13.6, 12, 1.4);
      prism(ctx, hx1 - 0.58, hy0 + 0.14, hx1 - 0.14, hy0 + 0.54, H + 17, 3,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, t.x, t.y - H - 22, 2, PAL.amber);
      antennaMast(ctx, t.x + 7, t.y - H - 20, 10, PAL.metalLight, PAL.gold);
    }

    barracksProps(ctx, b, lvl);
  }

  // техника у ангара: ящики, цистерна, антенна
  function barracksProps(ctx, b, lvl) {
    const x0 = b.x;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;

    // контейнеры слева
    const c1 = P(x0 + 0.3, y1 - 0.3);
    prism(ctx, x0 + 0.16, y1 - 0.44, x0 + 0.48, y1 - 0.24, 0, 9,
      PAL.metalDark, PAL.metal, PAL.metalDark);
    ctx.strokeStyle = PAL.amber;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c1.x - 5, c1.y - 5);
    ctx.lineTo(c1.x + 1, c1.y - 7);
    ctx.stroke();

    if (lvl >= 2) {
      prism(ctx, x0 + 0.5, y1 - 0.4, x0 + 0.76, y1 - 0.22, 0, 7,
        PAL.metalLight, PAL.metal, PAL.metalDark);
    }

    // цистерна справа
    const t = P(x1 - 0.22, y1 - 0.28);
    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(t.x - 6, t.y - 10, 12, 12);
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 10, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,224,200,.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 3, 6, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // антенна
    if (lvl >= 3) {
      const a = P(x1 - 0.12, y1 - 0.08);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x, a.y - 20);
      ctx.stroke();
      spot(ctx, a.x, a.y - 21, 1.5, lvl >= 5 ? PAL.gold : PAL.cyan);
    }

    // прожектор у ворот
    if (lvl >= 4 && mid()) {
      const l = P(x0 + 0.14, y1 - 0.5);
      spot(ctx, l.x, l.y - 12, 2.6, PAL.metalDark);
      spot(ctx, l.x, l.y - 12, 1.5, PAL.glass);
    }
  }

  // ствол: толстая тёмная труба, светлая верхняя грань, раструб и дуло
  function barrel(ctx, x, y, dx, dy, len, w, flare, rings) {
    const px = -dy;
    const py = dx;

    ctx.strokeStyle = PAL.dark;
    ctx.lineWidth = w;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * len, y + dy * len);
    ctx.stroke();

    // светлая грань вдоль ствола
    const ox = px * w * 0.3;
    const oy = py * w * 0.3;
    ctx.strokeStyle = shade(PAL.stone, -0.05);
    ctx.lineWidth = Math.max(1.6, w * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy);
    ctx.lineTo(x + dx * len + ox, y + dy * len + oy);
    ctx.stroke();

    const mx = x + dx * len;
    const my = y + dy * len;

    if (flare) {
      const hw = w * 0.62;
      poly(ctx, [
        { x: mx - px * hw, y: my - py * hw },
        { x: mx + px * hw, y: my + py * hw },
        { x: mx + dx * 5 + px * hw * 1.7, y: my + dy * 5 + py * hw * 1.7 },
        { x: mx + dx * 5 - px * hw * 1.7, y: my + dy * 5 - py * hw * 1.7 }
      ], PAL.dark);

      const ex = mx + dx * 4;
      const ey = my + dy * 4;
      spot(ctx, ex, ey, hw * 1.15, shade(PAL.stoneDark, -0.05));
      spot(ctx, ex, ey, hw * 0.7, PAL.dark);
      spot(ctx, ex - 0.8, ey - 0.8, hw * 0.3, 'rgba(255,250,235,.18)');
    } else {
      spot(ctx, mx, my, w * 0.5, shade(PAL.stoneDark, -0.08));
      spot(ctx, mx, my, w * 0.22, PAL.dark);
    }

    if (rings) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2.4;
      const fr = [0.3, 0.62];
      for (let i = 0; i < fr.length; i++) {
        const bx = x + dx * len * fr[i];
        const by = y + dy * len * fr[i];
        const r = w * 0.62;
        ctx.beginPath();
        ctx.moveTo(bx - px * r, by - py * r);
        ctx.lineTo(bx + px * r, by + py * r);
        ctx.stroke();
      }
    }
  }



  // Направление ствола в экранных пикселях: угол b.aim (мировые радианы)
  // переводим в изометрическую проекцию и нормируем. Так башня, ствол и
  // прицельная ось всегда смотрят в одну сторону.
  function aimVec(b) {
    const a = typeof b.aim === 'number' && isFinite(b.aim) ? b.aim : -0.6;
    let dx = Math.cos(a) - Math.sin(a);
    let dy = (Math.cos(a) + Math.sin(a)) * 0.55;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  // Турель: массивная броневая тумба, заметный поворотный погон, вертлюг,
  // коробчатая вращающаяся башня и длинный ствол с дульным тормозом.
  // Силуэт читается как «пушка» даже в 44 px: широкое основание, ось
  // наведения и развитый дульный срез важнее мелкой фактуры.
  function drawCannon(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + 0.5, y0 + 0.5);
    const f = aimVec(b);
    const rx = -f.y;
    const ry = f.x;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.85);

    /* --- массивное основание --- */
    const baseH = 8 + (lvl >= 3 ? 3 : 0) + (lvl >= 7 ? 2 : 0);
    prism(ctx, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0, baseH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // нижняя броневая юбка шире пятна: турель «стоит», а не парит
    const topY = p.y - baseH;
    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, topY + 2.5, 25, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // верхняя плита-погон
    ctx.fillStyle = PAL.metal;
    ctx.beginPath();
    ctx.ellipse(p.x, topY, 23.5, 10.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(p.x, topY, 21.5, 9.8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // гусеничные башмаки по бокам — тяжёлая опора
    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(p.x - 25, p.y - 6, 8, 5, 2);
      ctx.roundRect(p.x + 17, p.y - 6, 8, 5, 2);
    } else {
      ctx.rect(p.x - 25, p.y - 6, 8, 5);
      ctx.rect(p.x + 17, p.y - 6, 8, 5);
    }
    ctx.fill();
    if (mid()) {
      ctx.fillStyle = PAL.metalLight;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(p.x - 24 + i * 2.6, p.y - 4.8, 1.4, 2.2);
        ctx.fillRect(p.x + 18 + i * 2.6, p.y - 4.8, 1.4, 2.2);
      }
    }

    // золотые предупреждающие полосы на передней грани
    const D = P(x0 + 0.02, y1 - 0.02);
    const C = P(x1 - 0.02, y1 - 0.02);
    const nSeg = lvl >= 5 ? 5 : 4;
    for (let i = 0; i < nSeg; i++) {
      const u0 = 0.05 + i * 0.9 / nSeg;
      const u1 = 0.05 + (i + 0.55) * 0.9 / nSeg;
      wallPatch(ctx, D, C, baseH, u0, u1, 0.12 / baseH, 0.72 / baseH,
        i % 2 ? PAL.metalDark : PAL.gold);
    }

    // болты погона
    if (mid()) {
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 + 0.2;
        spot(ctx, p.x + Math.cos(a) * 18.5, topY + Math.sin(a) * 8.6, 0.9,
          i % 2 ? PAL.metalLight : PAL.metalDark);
      }
    }

    /* --- поворотный погон и вертлюг --- */
    const ttH = 7 + (lvl >= 4 ? 1 : 0);
    const ttTop = topY - ttH;

    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, topY, 16.5, 7.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(p.x - 16, ttTop, 32, ttH);
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(p.x, ttTop, 16.5, 7.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(p.x, ttTop, 13.5, 6.2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // золотое кольцо погона и насечки азимута
    ctx.strokeStyle = lvl >= 5 ? PAL.gold : PAL.cold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, ttTop, 15.2, 6.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.strokeStyle = 'rgba(70,224,200,.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(p.x + c * 14.2, ttTop + s * 6.4);
      ctx.lineTo(p.x + c * 16.2, ttTop + s * 7.3);
      ctx.stroke();
    }

    const hubX = p.x;
    const hubY = ttTop - 2;

    // ось наведения: короткий бирюзовый луч через центр погона
    ctx.strokeStyle = 'rgba(70,224,200,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hubX - f.x * 20, hubY + 2 - f.y * 11);
    ctx.lineTo(hubX + f.x * 20, hubY + 2 + f.y * 11);
    ctx.stroke();

    /* --- вращающаяся башня --- */
    function lp(a, s) {
      return { x: hubX + f.x * a + rx * s, y: hubY + f.y * a + ry * s };
    }

    // нижняя тень корпуса
    poly(ctx, [
      lp(-11, 10), lp(-4, 12), lp(8, 11), lp(12, 5),
      lp(12, -5), lp(8, -11), lp(-4, -12), lp(-11, -10)
    ], PAL.metalDark);

    // сам корпус: скошенная лобовая плита
    poly(ctx, [
      lp(-11, 9), lp(-5, 11), lp(7, 10), lp(12, 4),
      lp(12, -4), lp(7, -10), lp(-5, -11), lp(-11, -9)
    ], PAL.metal);
    poly(ctx, [
      lp(-10, 8), lp(-4, 9.5), lp(6, 8.6), lp(10, 3.4),
      lp(10, -3.4), lp(6, -8.6), lp(-4, -9.5), lp(-10, -8)
    ], PAL.metal);
    // световая кромка крыши: корпус читается коробкой, а не куполом
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(lp(-10, 8).x, lp(-10, 8).y);
    ctx.lineTo(lp(10, 3.4).x, lp(10, 3.4).y);
    ctx.lineTo(lp(10, -3.4).x, lp(10, -3.4).y);
    ctx.stroke();

    // лобовая броня и маска ствола
    poly(ctx, [
      lp(8, 8), lp(13, 5), lp(14, -5), lp(8, -8)
    ], PAL.metalDark);
    poly(ctx, [
      lp(9, 6), lp(13, 4), lp(13, -4), lp(9, -6)
    ], PAL.metal);

    // вертлюги по бокам — видно, что башня качается и вращается
    spot(ctx, lp(1, 10).x, lp(1, 10).y, 2.6, PAL.metalDark);
    spot(ctx, lp(1, 10).x, lp(1, 10).y, 1.4, PAL.metalLight);
    spot(ctx, lp(1, -10).x, lp(1, -10).y, 2.6, PAL.metalDark);
    spot(ctx, lp(1, -10).x, lp(1, -10).y, 1.4, PAL.metalLight);

    // командирская башенка и прицел
    const cup = lp(-3, 4);
    spot(ctx, cup.x, cup.y - 3, 3.6, PAL.metalDark);
    spot(ctx, cup.x, cup.y - 3, 2.4, PAL.metalLight);
    ctx.fillStyle = lvl >= 6 ? PAL.cold : PAL.glass;
    ctx.fillRect(cup.x + rx * 2 - 1.4, cup.y - 3 + ry * 2 - 1, 2.8, 2);

    /* --- ствол --- */
    const len = 23 + (lvl >= 4 ? 3 : 0) + (lvl >= 8 ? 2 : 0);
    const bw = lvl >= 5 ? 8.5 : 7.5;
    const mz = lp(13, 0);
    const bx = mz.x;
    const by = mz.y - 1;

    barrel(ctx, bx, by, f.x, f.y, len, bw, false, false);

    // дульный тормоз: расширенный блок с боковыми окнами
    const ex = bx + f.x * len;
    const ey = by + f.y * len;
    const hw = bw * 0.78;
    const bl = 6.5;
    poly(ctx, [
      { x: ex - rx * hw - f.x * 2, y: ey - ry * hw - f.y * 2 },
      { x: ex + rx * hw - f.x * 2, y: ey + ry * hw - f.y * 2 },
      { x: ex + rx * hw * 1.2 + f.x * bl, y: ey + ry * hw * 1.2 + f.y * bl },
      { x: ex - rx * hw * 1.2 + f.x * bl, y: ey - ry * hw * 1.2 + f.y * bl }
    ], PAL.metalDark);
    // боковые окна тормоза — главный признак «пушки»
    ctx.strokeStyle = PAL.dark;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const k = 0.35 + i * 0.34;
      const sx = ex + rx * hw * 1.1 + f.x * bl * k;
      const sy = ey + ry * hw * 1.1 + f.y * bl * k;
      ctx.beginPath();
      ctx.moveTo(sx - rx * hw * 1.05, sy - ry * hw * 1.05);
      ctx.lineTo(sx + rx * hw * 0.2, sy + ry * hw * 0.2);
      ctx.stroke();
    }
    // тёмное дуло
    spot(ctx, ex + f.x * (bl + 1), ey + f.y * (bl + 1), hw * 0.72, PAL.dark);
    if (near()) {
      spot(ctx, ex + f.x * (bl + 1) - 0.8, ey + f.y * (bl + 1) - 0.8,
        hw * 0.3, 'rgba(127,233,255,.35)');
    }

    // 7+: кожух отката и амортизаторы на стволе
    if (lvl >= 7) {
      const k1 = 0.22;
      const k2 = 0.5;
      for (let i = 0; i < 2; i++) {
        const k = i ? k2 : k1;
        const cx = bx + f.x * len * k;
        const cy = by + f.y * len * k;
        ctx.strokeStyle = PAL.metalLight;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - rx * (bw * 0.62), cy - ry * (bw * 0.62));
        ctx.lineTo(cx + rx * (bw * 0.62), cy + ry * (bw * 0.62));
        ctx.stroke();
      }
    }

    // 9+: золотой обруч у дульного тормоза
    if (lvl >= 9) {
      const gx = ex + f.x * (bl - 1.4);
      const gy = ey + f.y * (bl - 1.4);
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx - rx * hw * 1.15, gy - ry * hw * 1.15);
      ctx.lineTo(gx + rx * hw * 1.15, gy + ry * hw * 1.15);
      ctx.stroke();
    }

    // 10: спаренный малый ствол под основным
    if (lvl >= 10) {
      const cx = bx - rx * 5;
      const cy = by - ry * 5 + 2;
      barrel(ctx, cx, cy, f.x, f.y, len * 0.72, 4.2, false, false);
      spot(ctx, cx + f.x * len * 0.72, cy + f.y * len * 0.72, 2, PAL.dark);
    }

    // сенсор на башне
    spot(ctx, lp(-5, -5).x, lp(-5, -5).y - 3, 1.7,
      lvl >= 5 ? PAL.gold : PAL.cold);

    /* --- 6-10: детали, но силуэт не меняется --- */

    // 6: подсветка погона и прицельный глаз
    if (lvl >= 6) {
      spot(ctx, p.x - 12, ttTop + 2, 1.3, PAL.glass);
      spot(ctx, p.x + 12, ttTop + 3, 1.3, PAL.cold);
      spot(ctx, p.x - 6, ttTop - 1, 0.9, PAL.cold);
      spot(ctx, p.x + 6, ttTop - 1, 0.9, PAL.glass);
    }

    // 7: короб боеприпасов сбоку и рёбра на плите
    if (lvl >= 7) {
      const am = lp(-8, -8);
      prism(ctx, x0 + 0.08, y1 - 0.28, x0 + 0.3, y1 - 0.1, 0, 7,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, am.x, am.y + 7, 1.3, PAL.gold);
      const F2 = P(x0 + 0.04, y1 - 0.04);
      const G2 = P(x1 - 0.04, y1 - 0.04);
      ribLines(ctx, F2, G2, baseH, 0.12, 0.88, 1, baseH - 1, 4,
        'rgba(30,38,42,.4)', 1.1);
    }

    // 8: выхлоп и антенна наведения
    if (lvl >= 8) {
      const e1 = P(x0 + 0.16, y0 + 0.22);
      exhaustStack(ctx, e1.x, e1.y - baseH - 1, 10, 3.4);
      antennaMast(ctx, p.x + 11, ttTop - 12, 12, PAL.metalLight, PAL.cold);
    }

    // 9: золотой вымпел на корме башни
    if (lvl >= 9) {
      const pe = lp(-10, -6);
      pennant(ctx, pe.x, pe.y - 4, 14, PAL.gold, 5);
    }

    // 10: компактный дальномер на крыше и второй контур погона
    if (lvl >= 10) {
      const rf = lp(-4, 2);
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(rf.x, rf.y - 6, 5.2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalLight;
      ctx.fillRect(rf.x - 3.4, rf.y - 8.2, 6.8, 2.2);
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(rf.x - 2.6, rf.y - 7.8, 5.2, 1.2);
      spot(ctx, rf.x, rf.y - 9.4, 1.2, PAL.gold);

      // золотые болты по погону вместо лишнего кольца
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * 0.2 + i * Math.PI * 0.6;
        spot(ctx, p.x + Math.cos(a) * 20.5, topY + 1 + Math.sin(a) * 9.4, 1, PAL.gold);
      }
      spot(ctx, p.x, topY + 1, 1.6, PAL.cold);
    }
  }

  function drawTower(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 46 + (lvl >= 4 ? 6 : 0);
    const baseH = lvl >= 3 ? 10 : 3;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.9);

    prism(ctx, x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, 0, baseH,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    // тонкая опора
    prism(ctx, x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3, baseH, H - baseH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // циановые кольца на опоре
    if (lvl >= 2) {
      const k = lvl >= 4 ? 3 : 2;
      for (let i = 1; i <= k; i++) {
        const yy = p.y - baseH - (H - baseH) * i / (k + 1);
        ctx.strokeStyle = 'rgba(70,224,200,.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(p.x, yy, 8, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // радиаторные рёбра
    if (lvl >= 4 && mid()) {
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + i * 6, p.y - baseH - 12);
        ctx.lineTo(p.x + i * 6, p.y - H + 12);
        ctx.stroke();
      }
    }

    // площадка излучателя
    prism(ctx, x0 + 0.16, y0 + 0.16, x1 - 0.16, y1 - 0.16, H, 5,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    const lensY = p.y - H - 11;
    const lens = lvl >= 5 ? 8 : 7;

    // линза
    spot(ctx, p.x, lensY, lens + 1.6, PAL.metalDark);
    spot(ctx, p.x, lensY, lens, PAL.glass);
    spot(ctx, p.x, lensY, lens * 0.58, 'rgba(70,224,200,.9)');
    spot(ctx, p.x - 1.8, lensY - 1.8, 1.7, 'rgba(255,255,255,.8)');

    // эмиттерные рожки
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y - H - 2);
    ctx.lineTo(p.x - 5, lensY - 4);
    ctx.moveTo(p.x + 7, p.y - H - 2);
    ctx.lineTo(p.x + 5, lensY - 4);
    ctx.stroke();

    // второй излучатель со 2 уровня
    if (lvl >= 2) {
      spot(ctx, p.x + 10, lensY + 7, 2.4, PAL.metalDark);
      spot(ctx, p.x + 10, lensY + 7, 1.5, PAL.glass);
    }

    // 5: золотая оправа и лучи
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, lensY, lens + 3.4, 0, Math.PI * 2);
      ctx.stroke();
      if (mid()) {
        ctx.strokeStyle = 'rgba(127,233,255,.5)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(a) * (lens + 6), lensY + Math.sin(a) * (lens + 6));
          ctx.lineTo(p.x + Math.cos(a) * (lens + 11), lensY + Math.sin(a) * (lens + 11));
          ctx.stroke();
        }
      }
    }

    /* --- 6-10: вышка наращивает опору и излучатели --- */
    const sA = P(x0 + 0.3, y1 - 0.3);
    const sB = P(x1 - 0.3, y1 - 0.3);

    // 6: светящиеся полосы по стволу и ярче линза
    if (lvl >= 6) {
      patchPx(ctx, sA, sB, H, 0.16, 0.2, baseH + 6, H - 9, 'rgba(127,233,255,.55)');
      patchPx(ctx, sA, sB, H, 0.8, 0.84, baseH + 6, H - 9, 'rgba(127,233,255,.55)');
      spot(ctx, p.x - 1, lensY - 1, lens * 0.4, 'rgba(255,255,255,.5)');
    }

    // 7: наклонные распорки и второй контур площадки
    if (lvl >= 7) {
      const bL = P(x0 + 0.16, y1 - 0.16);
      const bR = P(x1 - 0.16, y1 - 0.16);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bL.x, bL.y);
      ctx.lineTo(p.x - 7, p.y - H * 0.52);
      ctx.moveTo(bR.x, bR.y);
      ctx.lineTo(p.x + 7, p.y - H * 0.52);
      ctx.stroke();
      ring(ctx, p.x, p.y - H + 2, 13, 4.6, 'rgba(154,167,173,.7)', 1.3);
    }

    // 8: шпиль-антенна над линзой и боковой излучатель
    if (lvl >= 8) {
      antennaMast(ctx, p.x, lensY - lens - 3, 17, PAL.metalLight, PAL.cyan);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y - H + 3);
      ctx.lineTo(p.x + 15, p.y - H - 3);
      ctx.stroke();
      spot(ctx, p.x + 15, p.y - H - 3, 1.6, PAL.glass);
    }

    // 9: золотая оправа площадки и вымпел
    if (lvl >= 9) {
      ring(ctx, p.x, p.y - H + 2, 14, 5, PAL.gold, 1.6);
      pennant(ctx, p.x - 12, p.y - H + 4, 16, PAL.gold, 6);
    }

    // 10: второй ярус излучателей — четыре рожка вокруг линзы
    if (lvl >= 10) {
      const rr = lens + 7;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        const ax = p.x + Math.cos(a) * rr;
        const ay = lensY + Math.sin(a) * rr * 0.62;
        ctx.strokeStyle = PAL.metalLight;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * 4, ay + Math.sin(a) * 2.2);
        ctx.stroke();
        spot(ctx, ax + Math.cos(a) * 4, ay + Math.sin(a) * 2.2, 1.5, PAL.cold);
      }
      ring(ctx, p.x, lensY, lens + 5, lens + 5, 'rgba(70,224,200,.45)', 1.2);
    }
  }

  // ракета воздушной обороны: тонкий корпус, задранный в небо, стабилизаторы
  function aaRocket(ctx, x, y, ang, len, w, lvl) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const px = -dy;
    const py = dx;
    const tipX = x + dx * len;
    const tipY = y + dy * len;

    // стабилизаторы у основания
    poly(ctx, [
      { x: x - px * w * 0.8, y: y - py * w * 0.8 },
      { x: x - dx * 5 - px * w * 1.7, y: y - dy * 5 - py * w * 1.7 },
      { x: x - dx * 5 + px * w * 1.7, y: y - dy * 5 + py * w * 1.7 }
    ], PAL.stoneDark);

    // корпус
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX - dx * 5, tipY - dy * 5);
    ctx.stroke();

    // светлая грань
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = Math.max(1, w * 0.32);
    ctx.beginPath();
    ctx.moveTo(x + px * w * 0.3, y + py * w * 0.3);
    ctx.lineTo(tipX - dx * 7 + px * w * 0.3, tipY - dy * 7 + py * w * 0.3);
    ctx.stroke();

    // боеголовка: холодный бирюзовый наконечник
    poly(ctx, [
      { x: tipX - dx * 6 - px * w * 0.55, y: tipY - dy * 6 - py * w * 0.55 },
      { x: tipX, y: tipY },
      { x: tipX - dx * 6 + px * w * 0.55, y: tipY - dy * 6 + py * w * 0.55 }
    ], PAL.cold);
    if (mid()) spot(ctx, tipX - dx * 2, tipY - dy * 2, w * 0.22, PAL.glass);

    // 5: бирюзовые обручи ракет — холодный акцент обороны
    if (lvl >= 5 && mid()) {
      ctx.strokeStyle = PAL.cold;
      ctx.lineWidth = 2;
      for (let i = 1; i <= 2; i++) {
        const k = i / 3;
        const bx = x + dx * len * k;
        const by = y + dy * len * k;
        ctx.beginPath();
        ctx.moveTo(bx - px * w * 0.7, by - py * w * 0.7);
        ctx.lineTo(bx + px * w * 0.7, by + py * w * 0.7);
        ctx.stroke();
      }
    }
  }

  // воздушная оборона: каменная тумба и ракетная стойка, стволы в небо
  function drawAirdef(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + 0.5, y0 + 0.5);
    const stoneBase = lvl >= 3;
    const baseH = stoneBase ? 14 : 7;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.7);

    // основание: деревянный настил или каменная тумба
    if (stoneBase) {
      prism(ctx, x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, 0, baseH,
        PAL.stoneLight, PAL.stone, PAL.stoneDark);
    } else {
      prism(ctx, x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 0, baseH,
        shade(PAL.metal, 0.12), PAL.metal, PAL.metalDark);
    }

    // короткая тумба под установкой
    prism(ctx, x0 + 0.34, y0 + 0.34, x1 - 0.34, y1 - 0.34, baseH, 14,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    const hubY = p.y - baseH - 14;

    // направляющие и ракеты — смотрят вверх, а не в сторону
    const rx0 = p.x - 8;
    const ry0 = hubY + 8;
    const rx1 = p.x + 12;
    const ry1 = hubY - 14;

    // бронеплита пусковой рамы: широкий прямоугольник за направляющими,
    // чтобы комплекс читался как установка, а не как фигурка с палками
    poly(ctx, [
      { x: rx0 - 1.5, y: ry0 + 3 }, { x: rx1 - 1, y: ry1 + 3 },
      { x: rx1 + 6, y: ry1 + 5 }, { x: rx0 + 6, y: ry0 + 5 }
    ], PAL.metalDark);
    poly(ctx, [
      { x: rx0, y: ry0 + 1 }, { x: rx1 - 0.5, y: ry1 + 1 },
      { x: rx1 + 4.5, y: ry1 + 2.2 }, { x: rx0 + 4.5, y: ry0 + 2.2 }
    ], shade(PAL.metal, -0.12));

    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(rx0, ry0);
    ctx.lineTo(rx1, ry1);
    ctx.moveTo(rx0 + 5, ry0 + 1);
    ctx.lineTo(rx1 + 5, ry1 + 1);
    ctx.stroke();

    // поперечины рамы: пусковая установка, а не просто палка
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const ax = rx0 + (rx1 - rx0) * k;
      const ay = ry0 + (ry1 - ry0) * k;
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 5, ay + 1);
    }
    ctx.stroke();

    // короб привода наведения
    ctx.fillStyle = PAL.metal;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(p.x - 2, hubY + 13, 12, 6, 2);
    else ctx.rect(p.x - 2, hubY + 13, 12, 6);
    ctx.fill();
    spot(ctx, p.x + 8, hubY + 15, 1.1, PAL.cold);

    aaRocket(ctx, p.x - 3, hubY + 5, -1.3, 32, 6, lvl);
    if (lvl >= 2) {
      aaRocket(ctx, p.x + 7, hubY + 8, -1.12, 27, 4.8, lvl);
    }

    // ступица установки
    spot(ctx, p.x, hubY + 2, 4.6, PAL.stoneDark);
    spot(ctx, p.x, hubY + 2, 2.8, PAL.stone);

    // 4+: радар на мачте
    if (lvl >= 4) {
      const rd = P(x0 + 0.2, y0 + 0.24);
      const top = rd.y - baseH - 24;

      ctx.strokeStyle = PAL.dark;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(rd.x, rd.y - baseH);
      ctx.lineTo(rd.x, top);
      ctx.stroke();

      ctx.fillStyle = shade(PAL.stone, 0.12);
      ctx.beginPath();
      ctx.ellipse(rd.x + 2, top + 1, 10, 5, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(rd.x + 2, top + 1, 10, 5, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      spot(ctx, rd.x + 2, top + 1, 1.4, PAL.cold);

      if (lvl >= 5) pennant(ctx, rd.x, top - 2, 12, PAL.gold, 7);
    }

    /* --- 6-10: зенитный комплекс доращивает ракеты и радар --- */

    // 6: огни наведения на тумбе и подсветка ракет
    if (lvl >= 6) {
      spot(ctx, p.x - 8, hubY + 10, 1.6, PAL.glass);
      spot(ctx, p.x + 9, hubY + 12, 1.6, PAL.cyan);
      spot(ctx, p.x - 3, hubY + 5, 1.2, PAL.gold);
    }

    // 7: броневые щитки по бокам тумбы
    if (lvl >= 7) {
      prism(ctx, x0 + 0.06, y0 + 0.26, x0 + 0.2, y1 - 0.26, 0, baseH + 8,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      prism(ctx, x1 - 0.2, y0 + 0.26, x1 - 0.06, y1 - 0.26, 0, baseH + 6,
        PAL.metalDark, PAL.metal, PAL.metalDark);
    }

    // 8: третья ракета на направляющей и выхлоп у основания
    if (lvl >= 8) {
      aaRocket(ctx, p.x + 2, hubY + 13, -1.18, 21, 4, lvl);
      const e1 = P(x0 + 0.18, y0 + 0.2);
      exhaustStack(ctx, e1.x, e1.y - baseH, 10, 3.4);
    }

    // 9: золотые наконечники и два вымпела
    if (lvl >= 9) {
      spot(ctx, p.x - 3 + Math.cos(-1.3) * 32, hubY + 5 + Math.sin(-1.3) * 32, 1.4, PAL.gold);
      pennant(ctx, p.x - 10, hubY + 15, 16, PAL.gold, 6);
      pennant(ctx, p.x + 12, hubY + 16, 13, PAL.cold, 5);
    }

    // 10: радар с разверткой и второй ярус направляющих
    if (lvl >= 10) {
      const rd2 = P(x0 + 0.2, y0 + 0.24);
      const top2 = rd2.y - baseH - 26;
      ctx.fillStyle = shade(PAL.stone, 0.14);
      ctx.beginPath();
      ctx.ellipse(rd2.x + 2, top2 + 1, 10, 4.8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(rd2.x + 2, top2 + 1, 10, 4.8, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(127,233,255,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(rd2.x + 2, top2 + 1);
      ctx.lineTo(rd2.x + 11, top2 - 4);
      ctx.stroke();
      spot(ctx, rd2.x + 2, top2 + 1, 1.6, PAL.cold);
      // вторая направляющая с ракетой
      ctx.strokeStyle = shade(PAL.wood, -0.28);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + 4, hubY + 13);
      ctx.lineTo(p.x + 14, hubY + 2);
      ctx.stroke();
      ring(ctx, p.x, hubY + 8, 12, 4.4, PAL.metalLight, 1.2);
    }
  }

  // башня магов: тонкая высокая башня со светящимся кристаллом
  function drawMage(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 42 + (lvl >= 4 ? 5 : 0);
    const baseH = lvl >= 3 ? 12 : 0;
    const p = P(x0 + 0.5, y0 + 0.5);
    const magic = mix(PAL.elixir, PAL.cold, 0.38);
    const magicLight = mix(PAL.cold, '#ffffff', 0.25);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.8);

    // 3+: каменное основание
    if (lvl >= 3) {
      prism(ctx, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, 0, baseH,
        PAL.stoneLight, PAL.stone, PAL.stoneDark);
    }

    // тонкий ствол башни
    prism(ctx, x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3, baseH, H - baseH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // вертикальные рёбра
    if (mid()) {
      const a = P(x0 + 0.3, y1 - 0.3);
      const c = P(x1 - 0.3, y1 - 0.3);
      ctx.strokeStyle = 'rgba(74,63,54,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - baseH);
      ctx.lineTo(a.x, a.y - H);
      ctx.moveTo(c.x, c.y - baseH);
      ctx.lineTo(c.x, c.y - H);
      ctx.stroke();
    }

    // окно-руна
    const D = P(x0 + 0.3, y1 - 0.3);
    const C = P(x1 - 0.3, y1 - 0.3);
    patchPx(ctx, D, C, H, 0.38, 0.62, H * 0.36, H * 0.62, PAL.dark);
    ctx.fillStyle = magic;
    ctx.fillRect((D.x + C.x) / 2 - 1.6, (D.y + C.y) / 2 - H * 0.48, 3.2, 8);

    // площадка под кристаллом
    prism(ctx, x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, H, 4,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    const orbX = p.x;
    const orbY = p.y - H - 14;
    const orbR = 9 + (lvl >= 4 ? 1 : 0);

    // свечение
    const glow = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, orbR * 2.4);
    glow.addColorStop(0, 'rgba(143,212,232,.5)');
    glow.addColorStop(0.5, 'rgba(155,111,208,.22)');
    glow.addColorStop(1, 'rgba(155,111,208,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(orbX, orbY, orbR * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // 4: кольцо вокруг шара
    if (lvl >= 4) {
      ctx.strokeStyle = magicLight;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(orbX, orbY, orbR + 4, orbR * 0.45, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // сам кристалл
    spot(ctx, orbX, orbY, orbR, shade(magic, -0.35));
    spot(ctx, orbX, orbY, orbR - 1.6, magic);
    spot(ctx, orbX - 2.4, orbY - 2.4, orbR * 0.4, magicLight);

    // 2: второй кристалл сбоку
    if (lvl >= 2) {
      spot(ctx, orbX + 10, orbY + 5, 4.6, shade(magic, -0.2));
      spot(ctx, orbX + 10, orbY + 5, 3, magic);
      spot(ctx, orbX + 9, orbY + 4, 1.2, magicLight);
    }

    // 5: золотая оправа и лучи
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(orbX, orbY + orbR * 0.6, orbR + 2, 0.2, Math.PI - 0.2);
      ctx.stroke();

      if (mid()) {
        ctx.strokeStyle = 'rgba(224,176,69,.75)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 - 0.2;
          ctx.beginPath();
          ctx.moveTo(orbX + Math.cos(a) * (orbR + 4), orbY + Math.sin(a) * (orbR + 4));
          ctx.lineTo(orbX + Math.cos(a) * (orbR + 10), orbY + Math.sin(a) * (orbR + 10));
          ctx.stroke();
        }
      }
    }

    /* --- 6-10: плазменная башня напитывается энергией --- */

    // 6: руны на стволе и огни у основания
    if (lvl >= 6) {
      for (let i = 0; i < 3; i++) {
        const yy = baseH + 14 + i * 10;
        poly(ctx, [
          { x: p.x, y: yy - 4 }, { x: p.x + 2.4, y: yy },
          { x: p.x, y: yy + 4 }, { x: p.x - 2.4, y: yy }
        ], 'rgba(196,138,224,.8)');
      }
      spot(ctx, P(x0 + 0.16, y1 - 0.16).x, P(x0 + 0.16, y1 - 0.16).y - 3, 1.5, PAL.glass);
      spot(ctx, P(x1 - 0.16, y1 - 0.16).x, P(x1 - 0.16, y1 - 0.16).y - 3, 1.5, PAL.glass);
    }

    // 7: внешние распорки и второй контур площадки
    if (lvl >= 7) {
      const bL = P(x0 + 0.06, y1 - 0.06);
      const bR = P(x1 - 0.06, y1 - 0.06);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bL.x, bL.y);
      ctx.lineTo(p.x - 8, p.y - H * 0.55);
      ctx.moveTo(bR.x, bR.y);
      ctx.lineTo(p.x + 8, p.y - H * 0.55);
      ctx.stroke();
      ring(ctx, p.x, p.y - H + 1, 12, 4.4, 'rgba(196,138,224,.55)', 1.3);
    }

    // 8: выхлоп фиолетового пара у основания
    if (lvl >= 8) {
      const e1 = P(x0 + 0.18, y0 + 0.22);
      exhaustStack(ctx, e1.x, e1.y - baseH, 10, 3.4, 'rgba(196,138,224,.24)');
      spot(ctx, e1.x + 2, e1.y - baseH - 15, 2.2, 'rgba(196,138,224,.25)');
    }

    // 9: золотые шипы вокруг шара и вымпелы
    if (lvl >= 9) {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.55;
        spire(ctx, orbX + Math.cos(a) * (orbR + 3), orbY + Math.sin(a) * (orbR + 3), 8, PAL.cold);
      }
      pennant(ctx, p.x - 11, p.y - H + 2, 15, PAL.gold, 6);
      pennant(ctx, p.x + 11, p.y - H + 2, 13, PAL.cold, 5);
    }

    // 10: ореол осколков — второе кольцо и верхний кристалл
    if (lvl >= 10) {
      ctx.strokeStyle = 'rgba(196,138,224,.6)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(orbX, orbY, orbR + 9, (orbR + 9) * 0.34, 0.5, 0, Math.PI * 2);
      ctx.ellipse(orbX, orbY, orbR + 9, (orbR + 9) * 0.34, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      spot(ctx, orbX + orbR + 9, orbY - 1, 2, PAL.cold);
      spot(ctx, orbX - orbR - 9, orbY + 1, 2, PAL.cold);
      spot(ctx, orbX, orbY - orbR - 8, 3, magicLight);
      spot(ctx, orbX, orbY - orbR - 8, 1.4, '#ffffff');
    }
  }

  // живое дыхание кристалла: мягкое пятно поверх спрайта башни
  function drawMageHalo(ctx, b, lvl) {
    if (!mid()) return;
    const p = P(b.x + 0.5, b.y + 0.5);
    const H = 42 + (lvl >= 4 ? 5 : 0);
    const y = p.y - H - 14;
    const a = 0.14 + 0.07 * (0.5 + 0.5 * Math.sin(t * 2.1));

    const g = ctx.createRadialGradient(p.x, y, 1, p.x, y, 30);
    g.addColorStop(0, 'rgba(143,212,232,' + a.toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(155,111,208,' + (a * 0.5).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(155,111,208,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // мортира: широкий каменный котёл на срубе, короткий ствол вверх-в сторону
  function drawMortar(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.75);

    const stoneBase = lvl >= 3;
    const baseH = stoneBase ? 12 : 11;

    // основание: сруб или каменная кладка
    if (stoneBase) {
      prism(ctx, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, 0, baseH,
        PAL.metalLight, PAL.metal, PAL.metalDark);

      const a = P(x0 + 0.08, y1 - 0.08);
      const c = P(x1 - 0.08, y1 - 0.08);
      const bb = P(x1 - 0.08, y0 + 0.08);

      ctx.strokeStyle = 'rgba(74,66,54,.28)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const yy = baseH * i / 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - yy);
        ctx.lineTo(c.x, c.y - yy);
        ctx.lineTo(bb.x, bb.y - yy);
        ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const k = i / 4;
        const sx = a.x + (c.x - a.x) * k;
        const sy = a.y + (c.y - a.y) * k;
        ctx.moveTo(sx, sy - 2);
        ctx.lineTo(sx, sy - baseH + 2);
      }
      ctx.stroke();
    } else {
      prism(ctx, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, 0, baseH,
        shade(PAL.metal, 0.12), PAL.metal, PAL.metalDark);

      const a = P(x0 + 0.1, y1 - 0.1);
      const c = P(x1 - 0.1, y1 - 0.1);
      const bb = P(x1 - 0.1, y0 + 0.1);

      ctx.strokeStyle = 'rgba(30,38,42,.42)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const yy = baseH * i / 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - yy);
        ctx.lineTo(c.x, c.y - yy);
        ctx.lineTo(bb.x, bb.y - yy);
        ctx.stroke();
      }
    }

    // котёл
    const bY = p.y - baseH;
    const bowlH = 14;
    const rBot = 11;
    const rTop = 16;

    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, bY, rBot, rBot * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    poly(ctx, [
      { x: p.x - rBot, y: bY }, { x: p.x + rBot, y: bY },
      { x: p.x + rTop, y: bY - bowlH }, { x: p.x - rTop, y: bY - bowlH }
    ], PAL.metal);

    // объём котла
    poly(ctx, [
      { x: p.x - rBot, y: bY }, { x: p.x - rBot * 0.35, y: bY },
      { x: p.x - rTop * 0.35, y: bY - bowlH }, { x: p.x - rTop, y: bY - bowlH }
    ], shade(PAL.metal, 0.16));

    poly(ctx, [
      { x: p.x + rBot * 0.4, y: bY }, { x: p.x + rBot, y: bY },
      { x: p.x + rTop, y: bY - bowlH }, { x: p.x + rTop * 0.4, y: bY - bowlH }
    ], shade(PAL.metal, -0.2));

    // срез
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH, rTop, rTop * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // светлый внутренний край среза
    ctx.fillStyle = shade(PAL.metal, 0.3);
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH + 0.5, rTop * 0.72, rTop * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    // тёмное жерло
    ctx.fillStyle = PAL.dark;
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH + 1, rTop * 0.42, rTop * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2+: железные обручи
    const hoops = lvl >= 4 ? 2 : (lvl >= 2 ? 1 : 0);
    for (let i = 0; i < hoops; i++) {
      const hh = bowlH * (0.34 + i * 0.3);
      const rr = rBot + (rTop - rBot) * (hh / bowlH);
      ctx.strokeStyle = PAL.dark;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(p.x, bY - hh, rr + 0.5, (rr + 0.5) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5: золотая окантовка среза
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, bY - bowlH, rTop + 0.5, (rTop + 0.5) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ствол: короткий, толстый, вверх-вправо
    const thick = lvl >= 4 ? 10 : 8;
    const bx = p.x + 1;
    const by = bY - bowlH + 1;
    const ex = bx + 8;
    const ey = by - 12;

    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // светлая грань ствола
    ctx.strokeStyle = PAL.metal;
    ctx.lineWidth = thick * 0.45;
    ctx.beginPath();
    ctx.moveTo(bx - 1, by - 1.5);
    ctx.lineTo(ex - 1.5, ey + 1.5);
    ctx.stroke();

    // 4+: раструб
    if (lvl >= 4) {
      poly(ctx, [
        { x: ex - 5.5, y: ey + 2 }, { x: ex + 5.5, y: ey - 3 },
        { x: ex + 7.5, y: ey - 7.5 }, { x: ex - 4, y: ey - 2.5 }
      ], PAL.metalDark);
      spot(ctx, ex + 1.6, ey - 5.2, 2.4, PAL.dark);
      spot(ctx, ex + 1.6, ey - 5.6, 0.9, 'rgba(255,250,235,.35)');
    } else {
      spot(ctx, ex, ey, thick * 0.42, PAL.dark);
    }

    // 3+: ящик с ядрами рядом
    if (lvl >= 3) {
      const cx = x0 + 0.14;
      const cy = y1 + 0.02;

      prism(ctx, cx, cy, cx + 0.3, cy + 0.2, 0, 8,
        shade(PAL.wood, 0.16), PAL.wood, shade(PAL.wood, -0.2));

      const q = P(cx + 0.15, cy + 0.1);
      spot(ctx, q.x - 3, q.y - 10, 2.6, PAL.dark);
      spot(ctx, q.x + 2.5, q.y - 10.5, 2.6, PAL.dark);
      spot(ctx, q.x - 0.5, q.y - 13.5, 2.6, PAL.dark);
      spot(ctx, q.x - 3.6, q.y - 11, 0.9, 'rgba(255,250,235,.5)');
    }

    // 5: флажок
    if (lvl >= 5) {
      const fx = bx - 9;
      const fy = by - 5;

      ctx.strokeStyle = PAL.dark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 14);
      ctx.stroke();

      poly(ctx, [
        { x: fx, y: fy - 14 }, { x: fx + 8, y: fy - 11 }, { x: fx, y: fy - 8 }
      ], PAL.gold);
    }

    /* --- 6-10: гаубица наращивает ствол и механику --- */

    // 6: прицельный огонёк и свечение внутри чаши
    if (lvl >= 6) {
      spot(ctx, ex - 2, ey + 4, 1.5, PAL.glass);
      ctx.strokeStyle = 'rgba(70,224,200,.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(p.x, bY - bowlH + 1, rTop * 0.5, rTop * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 7: рёбра на основании и хомуты на стволе
    if (lvl >= 7) {
      const rA = P(x0 + 0.08, y1 - 0.08);
      const rB = P(x1 - 0.08, y1 - 0.08);
      ribLines(ctx, rA, rB, baseH, 0.12, 0.88, 1, baseH - 1, 4, 'rgba(74,66,54,.4)', 1.1);
      const nx = -(ey - by);
      const ny = ex - bx;
      const nl = Math.hypot(nx, ny) || 1;
      ctx.strokeStyle = PAL.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 1; i <= 2; i++) {
        const k = i / 3;
        const mx = bx + (ex - bx) * k;
        const my = by + (ey - by) * k;
        ctx.moveTo(mx - nx / nl * 4.6, my - ny / nl * 4.6);
        ctx.lineTo(mx + nx / nl * 4.6, my + ny / nl * 4.6);
      }
      ctx.stroke();
    }

    // 8: выхлопные патрубки за чашей
    if (lvl >= 8) {
      const e1 = P(x0 + 0.16, y0 + 0.2);
      const e2 = P(x1 - 0.16, y0 + 0.24);
      exhaustStack(ctx, e1.x, e1.y - baseH - 2, 11, 3.6);
      exhaustStack(ctx, e2.x, e2.y - baseH - 2, 9, 3.2);
    }

    // 9: золотой раструб и бирюзовый вымпел
    if (lvl >= 9) {
      ring(ctx, p.x, bY - bowlH, rTop + 1, (rTop + 1) * 0.5, PAL.gold, 1.8);
      pennant(ctx, p.x + 12, bY - bowlH + 2, 18, PAL.cold, 6);
      spot(ctx, bx - 3, by - 2, 1.2, PAL.gold);
    }

    // 10: поворотный погон и броневой фартук под чашей
    if (lvl >= 10) {
      ring(ctx, p.x, bY + 2, rBot + 4, (rBot + 4) * 0.5, PAL.metalLight, 1.6);
      ring(ctx, p.x, bY + 2, rBot + 2, (rBot + 2) * 0.5, PAL.gold, 1.2);
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(p.x, bY + 5, rBot + 7, (rBot + 7) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      spot(ctx, p.x - rBot - 4, bY, 1.4, PAL.glass);
      spot(ctx, p.x + rBot + 4, bY, 1.4, PAL.glass);
    }
  }

  function drawGoldmine(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 20;
    const inset = 0.12;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.8);

    // порода: невысокий сруб
    box(ctx, x0 + inset, y0 + inset, x1 - inset, y1 - inset, H, PAL.wood);

    /* Копёр — высокий деревянный треугольник над штольней. Именно он
       отличает шахту от приземистого склада на мелком зуме. */
    const ap = P(x0 + 0.54, y0 + 0.28);
    const le = P(x0 + 0.18, y0 + 0.16);
    const re = P(x1 - 0.16, y0 + 0.46);
    const headY = ap.y - H - 34 - (lvl >= 4 ? 5 : 0);

    ctx.strokeStyle = shade(PAL.wood, -0.16);
    ctx.lineWidth = lod === 0 ? 4.2 : 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(le.x, le.y - H);
    ctx.lineTo(ap.x, headY);
    ctx.moveTo(re.x, re.y - H);
    ctx.lineTo(ap.x, headY);
    ctx.stroke();

    // светлая грань левой стойки
    if (mid()) {
      ctx.strokeStyle = shade(PAL.wood, 0.28);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(le.x - 1, le.y - H - 1);
      ctx.lineTo(ap.x - 1, headY + 2);
      ctx.stroke();
    }

    // раскосы
    if (mid()) {
      ctx.strokeStyle = shade(PAL.wood, -0.05);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(le.x + (ap.x - le.x) * 0.42, le.y - H + (headY - le.y + H) * 0.42);
      ctx.lineTo(re.x + (ap.x - re.x) * 0.42, re.y - H + (headY - re.y + H) * 0.42);
      ctx.moveTo(le.x + (ap.x - le.x) * 0.72, le.y - H + (headY - le.y + H) * 0.72);
      ctx.lineTo(re.x + (ap.x - re.x) * 0.72, re.y - H + (headY - re.y + H) * 0.72);
      ctx.stroke();
    }

    // шкив на вершине
    spot(ctx, ap.x, headY, 5, PAL.dark);
    spot(ctx, ap.x, headY, 3.8, PAL.wood);
    spot(ctx, ap.x, headY, 1.3, shade(PAL.stoneLight, 0.2));

    // трос и бадья
    if (mid()) {
      ctx.strokeStyle = 'rgba(58,47,34,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ap.x + 3, headY + 2);
      ctx.lineTo(ap.x + 5, ap.y - H - 4);
      ctx.stroke();
      ctx.fillStyle = shade(PAL.wood, -0.1);
      ctx.fillRect(ap.x + 2, ap.y - H - 8, 7, 6);
    }

    // буровой конус над штольней
    const drill = p;
    prism(ctx, x0 + 0.42, y0 + 0.42, x0 + 0.58, y0 + 0.58, H, 12,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    poly(ctx, [
      { x: drill.x - 7, y: drill.y - H - 12 },
      { x: drill.x + 7, y: drill.y - H - 12 },
      { x: drill.x, y: drill.y - H - 28 }
    ], PAL.metalLight);
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const yy = drill.y - H - 12 - i * 4;
      ctx.moveTo(drill.x - 6 + i, yy);
      ctx.lineTo(drill.x + 6 - i, yy - 1.6);
    }
    ctx.stroke();
    if (mid()) spot(ctx, drill.x, drill.y - H - 29, 1.2, PAL.amber);

    const C = P(x1 - inset, y1 - inset);
    const D = P(x0 + inset, y1 - inset);

    // тёмный проём штольни
    patchPx(ctx, D, C, H, 0.25, 0.75, 0, 16, PAL.dark);

    // П-образная деревянная крепь — светлая, чтобы читалась издалека
    const wood = shade(PAL.wood, 0.45);
    patchPx(ctx, D, C, H, 0.12, 0.28, 0, 19, wood);
    patchPx(ctx, D, C, H, 0.72, 0.88, 0, 19, wood);
    patchPx(ctx, D, C, H, 0.12, 0.88, 0.7, 0.96, wood);

    // тёмная тень под перекладиной
    patchPx(ctx, D, C, H, 0.14, 0.86, 0.66, 0.72, 'rgba(58,47,34,.45)');

    // светлая грань крепи
    patchPx(ctx, D, C, H, 0.15, 0.19, 0, 18, shade(PAL.wood, 0.5));
    patchPx(ctx, D, C, H, 0.74, 0.78, 0, 18, shade(PAL.wood, 0.5));

    // 2+: подкосы
    if (lvl >= 2) {
      ctx.strokeStyle = shade(PAL.wood, -0.12);
      ctx.lineWidth = 1.6;
      const a = P(x0 + 0.16, y1 - inset);
      const bb = P(x1 - 0.16, y1 - inset);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 2);
      ctx.lineTo(a.x + 5, a.y - 12);
      ctx.moveTo(bb.x, bb.y - 2);
      ctx.lineTo(bb.x - 5, bb.y - 12);
      ctx.stroke();
    }

    // 4+: второй проём на правой грани
    if (lvl >= 4) {
      const B = P(x1 - inset, y0 + inset);
      patchPx(ctx, C, B, H, 0.3, 0.66, 0, 11, PAL.dark);
      patchPx(ctx, C, B, H, 0.24, 0.3, 0, 14, wood);
      patchPx(ctx, C, B, H, 0.66, 0.72, 0, 14, wood);
      patchPx(ctx, C, B, H, 0.24, 0.72, 0.56, 0.7, wood);
    }

    // 5: золотые прожилки в породе
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const yy = 4 + i * 4;
        ctx.beginPath();
        ctx.moveTo(D.x + (C.x - D.x) * 0.04, D.y + (C.y - D.y) * 0.04 - yy);
        ctx.lineTo(D.x + (C.x - D.x) * 0.14, D.y + (C.y - D.y) * 0.14 - yy - 3);
        ctx.stroke();
      }
    }

    // отвал породы справа — низкий серый холмик, второй признак шахты
    const dump = P(x1 - 0.16, y1 - 0.02);
    ctx.fillStyle = shade(PAL.stoneDark, -0.08);
    ctx.beginPath();
    ctx.ellipse(dump.x, dump.y, 10, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.stoneDark;
    ctx.beginPath();
    ctx.ellipse(dump.x - 1.5, dump.y - 3.4, 8, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(PAL.stone, -0.06);
    ctx.beginPath();
    ctx.ellipse(dump.x - 3, dump.y - 5, 4.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mid()) {
      spot(ctx, dump.x + 3, dump.y - 4, 1.3, shade(PAL.stoneLight, 0.1));
      spot(ctx, dump.x - 5, dump.y - 2, 1.1, shade(PAL.stoneLight, 0.05));
    }

    // куча руды на земле слева
    const ore = P(x0 + 0.18, y1 + 0.06);
    ctx.fillStyle = shade(PAL.gold, -0.2);
    ctx.beginPath();
    ctx.ellipse(ore.x, ore.y, 9, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.ellipse(ore.x - 1, ore.y - 2.5, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.ellipse(ore.x + 5, ore.y - 1, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(PAL.gold, 0.35);
    spot(ctx, ore.x - 3, ore.y - 4, 1.5, shade(PAL.gold, 0.35));
    spot(ctx, ore.x + 3.5, ore.y - 3, 1.1, shade(PAL.gold, 0.35));

    if (lvl >= 5) spark(ctx, ore.x - 7, ore.y - 7, 3);

    // 3+: рельсы и вагонетка
    if (lvl >= 3 && mid()) {
      const ry = y1 - 0.02;
      const a = P(x0 + 0.2, ry);
      const b2 = P(x1 - 0.06, ry);

      ctx.strokeStyle = PAL.stoneDark;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 1 + i * 2.4);
        ctx.lineTo(b2.x, b2.y - 1 + i * 2.4);
        ctx.stroke();
      }

      ctx.strokeStyle = PAL.wood;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        const k = i / 6;
        const sx = a.x + (b2.x - a.x) * k;
        const sy = a.y + (b2.y - a.y) * k;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 2.5);
        ctx.lineTo(sx, sy + 2.5);
        ctx.stroke();
      }

      // вагонетка с золотом
      const cv = P(x1 - 0.34, ry);
      prism(ctx, x1 - 0.52, ry - 0.14, x1 - 0.16, ry + 0.12, 3, 11,
        shade(PAL.wood, 0.16), PAL.wood, shade(PAL.wood, -0.2));
      ctx.fillStyle = shade(PAL.gold, -0.1);
      ctx.beginPath();
      ctx.ellipse(cv.x, cv.y - 13, 6.2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.ellipse(cv.x - 1, cv.y - 15, 4.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      spot(ctx, cv.x - 6.5, cv.y - 1, 2.6, PAL.dark);
      spot(ctx, cv.x + 6.5, cv.y - 1, 2.6, PAL.dark);
    }

    /* --- 6-10: бур уходит вглубь и ввысь --- */

    // 6: лампа на копре и окна в породе
    if (lvl >= 6) {
      spot(ctx, ap.x + 4, headY + 5, 1.5, PAL.glass);
      windowRow(ctx, D, C, H, 0.3, 0.7, 6, 11, 2, 'rgba(255,207,74,.8)');
    }

    // 7: стальные раскосы и смотровая площадка на копре
    if (lvl >= 7) {
      ctx.strokeStyle = 'rgba(154,167,173,.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(le.x + 2, le.y - H - 4);
      ctx.lineTo(ap.x - 3, headY + 6);
      ctx.moveTo(re.x - 2, re.y - H - 4);
      ctx.lineTo(ap.x + 3, headY + 6);
      ctx.stroke();
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ap.x - 10, headY + 13);
      ctx.lineTo(ap.x + 10, headY + 13);
      ctx.stroke();
      spot(ctx, ap.x - 10, headY + 13, 1.4, PAL.metalLight);
      spot(ctx, ap.x + 10, headY + 13, 1.4, PAL.metalLight);
    }

    // 8: отвод пара от бура
    if (lvl >= 8) {
      exhaustStack(ctx, dump.x + 4, dump.y - 5, 9, 3.2);
      spot(ctx, dump.x + 8, dump.y - 17, 2.4, 'rgba(226,213,180,.22)');
    }

    // 9: золотое навершие копра и вымпел на буре
    if (lvl >= 9) {
      spire(ctx, ap.x, headY - 5, 10);
      pennant(ctx, drill.x + 6, drill.y - H - 26, 13, PAL.gold, 5);
      spot(ctx, ore.x + 6, ore.y - 5, 1.4, PAL.gold);
    }

    // 10: вторая площадка копра и спаренный бур
    if (lvl >= 10) {
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ap.x - 14, headY + 26);
      ctx.lineTo(ap.x + 14, headY + 26);
      ctx.stroke();
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ap.x - 14, headY + 26);
      ctx.lineTo(ap.x - 12, headY + 13);
      ctx.moveTo(ap.x + 14, headY + 26);
      ctx.lineTo(ap.x + 12, headY + 13);
      ctx.stroke();
      // второй буровой конус рядом
      prism(ctx, x0 + 0.62, y0 + 0.42, x0 + 0.78, y0 + 0.58, H, 9,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      poly(ctx, [
        { x: drill.x + 12, y: drill.y - H - 9 },
        { x: drill.x + 20, y: drill.y - H - 9 },
        { x: drill.x + 16, y: drill.y - H - 21 }
      ], PAL.metalLight);
      spot(ctx, drill.x + 16, drill.y - H - 22, 1.3, PAL.cyan);
    }
  }

  // четырёхлучевой блеск
  function spark(ctx, x, y, r) {
    ctx.fillStyle = shade(PAL.gold, 0.35);
    poly(ctx, [
      { x: x, y: y - r }, { x: x + r * 0.28, y: y - r * 0.28 },
      { x: x + r, y: y }, { x: x + r * 0.28, y: y + r * 0.28 },
      { x: x, y: y + r }, { x: x - r * 0.28, y: y + r * 0.28 },
      { x: x - r, y: y }, { x: x - r * 0.28, y: y - r * 0.28 }
    ], shade(PAL.gold, 0.35));
  }

  // бак энергии
  function tank(ctx, x, baseY, r, h, hoops) {
    const energy = mix(PAL.elixir, PAL.cold, 0.3);

    ctx.fillStyle = shade(energy, -0.35);
    ctx.beginPath();
    ctx.ellipse(x, baseY + 2, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    poly(ctx, [
      { x: x - r, y: baseY + 2 }, { x: x + r, y: baseY + 2 },
      { x: x + r, y: baseY - h }, { x: x - r, y: baseY - h }
    ], energy);

    ctx.fillStyle = shade(energy, 0.22);
    ctx.beginPath();
    ctx.ellipse(x, baseY - h, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, baseY - h * 0.45, 2, h * 0.32, 0.08, 0, Math.PI * 2);
    ctx.fill();

    if (hoops) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const yy = baseY - h * (0.32 + i * 0.34);
        ctx.beginPath();
        ctx.ellipse(x, yy, r + 0.6, r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawElixir(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const H = 12;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.8);

    // бетонный подиум
    box(ctx, x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, H, PAL.metalDark);

    // 4+: свечение вокруг бака
    if (lvl >= 4) {
      ctx.fillStyle = 'rgba(70,224,200,.13)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - H - 16, 27, 21, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3+: второй бак слева-сзади
    if (lvl >= 3) {
      const q = P(x0 + 0.26, y0 + 0.34);
      tank(ctx, q.x, q.y - H + 2, 8, 12, false);
    }

    // главный бак
    tank(ctx, p.x, p.y - H, 14, 15 + (lvl >= 4 ? 4 : 0), lvl >= 5);

    // 2+: катушка-индуктор и вентиль
    if (lvl >= 2) {
      ctx.strokeStyle = PAL.cyan;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - H - 8, 15, 5.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      spot(ctx, p.x - 15, p.y - H - 4, 1.6, PAL.amber);
    }

    // труба с коленом и каплей
    const top = p.y - H - 15 - (lvl >= 4 ? 4 : 0);
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + 9, top + 4);
    ctx.lineTo(p.x + 20, top + 8);
    ctx.lineTo(p.x + 20, p.y - 4);
    ctx.stroke();

    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x + 9.5, top + 2.6);
    ctx.lineTo(p.x + 18.6, top + 6.4);
    ctx.lineTo(p.x + 18.6, p.y - 5);
    ctx.stroke();

    // капля энергии
    ctx.fillStyle = PAL.cold;
    ctx.beginPath();
    ctx.ellipse(p.x + 20, p.y - 2, 2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,224,200,.45)';
    ctx.beginPath();
    ctx.ellipse(p.x + 20, p.y + 1.5, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    /* --- 6-10: реактор наращивает контур охлаждения --- */

    // 6: яркое ядро и светодиоды на подиуме
    if (lvl >= 6) {
      spot(ctx, p.x - 3, p.y - H - 10, 2.2, 'rgba(255,255,255,.65)');
      spot(ctx, p.x - 14, p.y - H + 1, 1.4, PAL.glass);
      spot(ctx, p.x + 14, p.y - H + 1, 1.4, PAL.glass);
    }

    // 7: клетка-каркас вокруг бака
    if (lvl >= 7) {
      ctx.strokeStyle = 'rgba(154,167,173,.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 1; i <= 2; i++) {
        const yy = p.y - H - i * 6;
        ctx.ellipse(p.x, yy, 15, 6.2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      ribLines(ctx, P(x0 + 0.08, y1 - 0.08), P(x1 - 0.08, y1 - 0.08), H,
        0.2, 0.8, 3, 2, H - 2, 'rgba(70,224,200,.4)', 1.1);
    }

    // 8: сбросной патрубок с паром
    if (lvl >= 8) {
      const e1 = P(x0 + 0.18, y0 + 0.22);
      exhaustStack(ctx, e1.x, e1.y - H, 12, 3.6, 'rgba(176,79,224,.22)');
    }

    // 9: золотые обручи и вымпел
    if (lvl >= 9) {
      ring(ctx, p.x, p.y - H - 19, 14.6, 6, PAL.gold, 1.6);
      pennant(ctx, p.x + 20, p.y - H - 2, 16, PAL.cold, 6);
    }

    // 10: конденсатор над баком и второй контур
    if (lvl >= 10) {
      const cy = p.y - H - 30;
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(p.x - 10, cy, 20, 6);
      ctx.fillStyle = PAL.metalLight;
      ctx.beginPath();
      ctx.ellipse(p.x, cy, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metal;
      ctx.beginPath();
      ctx.ellipse(p.x, cy + 6, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ring(ctx, p.x, cy + 6, 10.6, 3.2, PAL.gold, 1.4);
      ctx.strokeStyle = 'rgba(70,224,200,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, cy + 2);
      ctx.lineTo(p.x + 7, cy + 2);
      ctx.stroke();
      spot(ctx, p.x, cy - 3, 1.6, PAL.cold);
    }
  }

  function drawStorage(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + 0.5, y0 + 0.5);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.9);

    // бетонная плита
    prism(ctx, x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, 0, 5,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    // основной контейнер
    const h1 = 17 + (lvl >= 4 ? 3 : 0);
    box(ctx, x0 + 0.08, y0 + 0.1, x1 - 0.26, y1 - 0.26, h1, PAL.metal);

    const D = P(x0 + 0.08, y1 - 0.26);
    const C = P(x1 - 0.26, y1 - 0.26);
    const B = P(x1 - 0.26, y0 + 0.1);

    // рёбра и янтарная маркировка
    patchPx(ctx, D, C, h1, 0.12, 0.16, 2, h1 - 2, PAL.metalDark);
    patchPx(ctx, D, C, h1, 0.84, 0.88, 2, h1 - 2, PAL.metalDark);
    patchPx(ctx, D, C, h1, 0.24, 0.42, h1 * 0.4, h1 * 0.55, PAL.amber);
    patchPx(ctx, D, C, h1, 0.45, 0.62, h1 * 0.4, h1 * 0.55, PAL.metalDark);
    patchPx(ctx, C, B, h1, 0.2, 0.34, h1 * 0.3, h1 * 0.45, PAL.glass);

    // второй контейнер со 2 уровня
    if (lvl >= 2) {
      prism(ctx, x0 + 0.42, y0 + 0.52, x1 - 0.06, y1 - 0.06, 5, 11,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      const q = P(x1 - 0.24, y1 - 0.18);
      ctx.strokeStyle = PAL.cyan;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q.x - 4, q.y - 8);
      ctx.lineTo(q.x + 2, q.y - 8);
      ctx.stroke();
    }

    // цистерна сбоку с 3 уровня
    if (lvl >= 3) {
      const t = P(x0 + 0.26, y0 + 0.34);
      const th = 16 + (lvl >= 5 ? 4 : 0);
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - 1, 7, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metal;
      ctx.fillRect(t.x - 7, t.y - th, 14, th);
      ctx.fillStyle = PAL.metalLight;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - th, 7, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // уровень энергии
      ctx.fillStyle = 'rgba(70,224,200,.6)';
      ctx.fillRect(t.x - 1.6, t.y - th + 4, 3.2, th - 7);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x - 7, t.y - th * 0.4);
      ctx.lineTo(t.x + 7, t.y - th * 0.4);
      ctx.stroke();
    }

    // трубопровод
    if (lvl >= 3 && mid()) {
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - 10);
      ctx.lineTo(p.x + 2, p.y - 12);
      ctx.lineTo(p.x + 2, p.y - 3);
      ctx.stroke();
    }

    // 4: второй бак
    if (lvl >= 4) {
      const t2 = P(x1 - 0.18, y0 + 0.24);
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(t2.x, t2.y - 1, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalLight;
      ctx.fillRect(t2.x - 5, t2.y - 15, 10, 15);
      ctx.fillStyle = PAL.metal;
      ctx.beginPath();
      ctx.ellipse(t2.x, t2.y - 15, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5: золотые вентили и маяк
    if (lvl >= 5) {
      spot(ctx, p.x + 1, p.y - h1 - 10, 2.2, PAL.gold);
      spot(ctx, p.x - 13, p.y - 13, 1.6, PAL.gold);
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x + 1, p.y - h1 - 8);
      ctx.lineTo(p.x + 1, p.y - h1 - 3);
      ctx.stroke();
    }

    /* --- 6-10: хранилище растёт стеллажами и надстройкой --- */

    // 6: окна-индикаторы и подсветка стыков
    if (lvl >= 6) {
      windowRow(ctx, D, C, h1, 0.4, 0.8, 6, 11, 2);
      spot(ctx, p.x - 14, p.y - 8, 1.4, PAL.glass);
      spot(ctx, p.x + 8, p.y - h1 - 2, 1.4, PAL.cyan);
    }

    // 7: стойки-рёбра и второй контур контейнера
    if (lvl >= 7) {
      ribLines(ctx, D, C, h1, 0.06, 0.94, 2, h1 - 2, 5, 'rgba(76,86,92,.45)', 1.2);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(D.x, D.y - h1 - 1);
      ctx.lineTo(C.x, C.y - h1 - 1);
      ctx.lineTo(B.x, B.y - h1 - 1);
      ctx.stroke();
    }

    // 8: антенна на крыше и вытяжка
    if (lvl >= 8) {
      const a = P(x0 + 0.2, y0 + 0.24);
      antennaMast(ctx, a.x, a.y - h1 - 4, 16, PAL.metalLight, PAL.cyan);
      const e1 = P(x0 + 0.5, y0 + 0.18);
      exhaustStack(ctx, e1.x, e1.y - h1 - 3, 9, 3.2);
    }

    // 9: золотые угловые накладки и вымпел
    if (lvl >= 9) {
      spot(ctx, D.x, D.y - 2, 2, PAL.gold);
      spot(ctx, C.x, C.y - 2, 2, PAL.gold);
      pennant(ctx, C.x - 2, C.y - h1 - 2, 15, PAL.gold, 6);
    }

    // 10: верхний стеллаж — второй контейнер ярусом выше
    if (lvl >= 10) {
      const tH = 9;
      prism(ctx, x0 + 0.16, y0 + 0.14, x1 - 0.44, y1 - 0.44, h1 + 5, tH,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      const uD = P(x0 + 0.16, y1 - 0.44);
      const uC = P(x1 - 0.44, y1 - 0.44);
      windowRow(ctx, uD, uC, h1 + 5 + tH, 0.18, 0.82, h1 + 7, h1 + 12, 3, 'rgba(255,207,74,.75)');
      ring(ctx, p.x - 4, p.y - h1 - 5, 9, 3.2, PAL.gold, 1.3);
      spot(ctx, p.x - 15, p.y - h1 - 4, 1.5, PAL.gold);
    }
  }

  /* ---------- ловушки и скрытая оборона ----------
     Пять новых типов: мина, пружина, воздушная мина, засадная турель и
     орбитальный луч. Все 1x1, поэтому рисуем их в пределах одного ромба.

     Статика (корпус, воронка, раскрытый люк, башня) запекается в спрайт по
     паре тип+уровень+состояние. Динамика — мигающий индикатор, дым, ствол
     засады, свечение линзы и сам луч — рисуется вектором поверх и стоит
     несколько пиксельных операций на кадр.

     Состояния читаем терпимо к именам: кодер может отдать triggered/spent,
     armed=false, revealed/open или charge. Любое поле, которого ещё нет,
     считается «не сработало» и не ломает кадр. */

  const TRAP_TYPES = { mine: 1, spring: 1, airmine: 1, ambush: 1, beam: 1 };
  const LURK_TYPES = { mine: 1, spring: 1, airmine: 1, ambush: 1 };

  const trapStats = { hidden: 0, drawn: 0 };

  function isTrapType(type) { return !!TRAP_TYPES[type]; }
  function isLurker(type) { return !!LURK_TYPES[type]; }

  function trapNum(b, names) {
    if (!b) return null;
    for (let i = 0; i < names.length; i++) {
      const v = b[names[i]];
      if (typeof v === 'number' && isFinite(v)) return v;
    }
    return null;
  }

  function trapFlag(b, names) {
    if (!b) return false;
    for (let i = 0; i < names.length; i++) {
      const v = b[names[i]];
      if (v === true) return true;
      if (typeof v === 'number' && isFinite(v) && v > 0) return true;
      if (typeof v === 'string' && v && v !== '0' && v !== 'false') return true;
    }
    return false;
  }

  function trapStateText(b) {
    if (!b) return '';
    return String(b.state || b.status || b.phase || '').toLowerCase();
  }

  // Сработавшая ловушка. armed === false тоже считаем взведённой/сработавшей:
  // так удобнее кодеру, который снимает флаг при подрыве.
  function trapFired(b) {
    if (!b) return false;
    if (b.__trapVariant === 'spent') return true;
    if (b.armed === false) return true;
    if (trapNum(b, ['triggerT', 'firedAt', 'triggeredAt', 'detonatedAt']) !== null) return true;
    if (trapFlag(b, ['triggered', 'sprung', 'fired', 'used', 'spent',
      'exploded', 'detonated', 'blown'])) return true;
    return /trig|spr|fir|spent|used|deton|expl|blown/.test(trapStateText(b));
  }

  // Засадная турель: закрытый люк или поднятая крышка со стволом.
  function ambushOpen(b) {
    if (!b) return false;
    if (b.__trapVariant === 'open') return true;
    if (b.__trapVariant === 'closed') return false;
    if (b.revealed === false) return false;
    if (trapFlag(b, ['revealed', 'open', 'opened', 'risen', 'raised',
      'triggered', 'deployed', 'extended'])) return true;
    return /reveal|open|risen|raised|deploy|active|trig/.test(trapStateText(b));
  }

  // На чужой базе ловушки невидимы до срабатывания. На своей — видны всегда.
  function trapHidden(b) {
    if (!b || !isLurker(b.type)) return false;
    if (b.own === true || b.friendly === true || b.isOwn === true) return false;

    let battle = false;
    try { battle = !!(CC.App && CC.App.mode === 'battle'); } catch (e) { battle = false; }
    if (!battle) return false;

    if (b.type === 'ambush') return !ambushOpen(b);
    return !trapFired(b);
  }

  // Состояние, которое попадает в ключ спрайта.
  function trapVariant(b) {
    if (!b) return '';
    if (b.__trapVariant) return b.__trapVariant;
    if (b.type === 'ambush') return ambushOpen(b) ? 'open' : 'closed';
    if (isLurker(b.type)) return trapFired(b) ? 'spent' : 'armed';
    return '';
  }

  // 0..3 ступени заряда луча. Дробный заряд тоже допустим.
  function beamCharge(b) {
    let v = trapNum(b, ['charge', 'chargeLevel', 'power', 'chargeT']);
    if (v === null && b && b.beam && typeof b.beam.charge === 'number') v = b.beam.charge;
    if (v === null) v = 0;
    return v < 0 ? 0 : (v > 3 ? 3 : v);
  }

  // Луч держит цель через beamTarget. Сам по себе charge=1 ещё не выстрел:
  // кодер ставит его и в покое, когда цели нет.
  function beamFiring(b) {
    if (!b) return false;
    if (trapFlag(b, ['firing', 'beamOn', 'shooting'])) return true;
    return !!(b.beamTarget && typeof b.beamTarget.x === 'number');
  }

  function beamH(lvl) {
    return 46 + Math.max(0, Math.min(9, lvl - 1)) * 2.6;
  }

  // Тёмный монтажный пятак под ловушкой: сразу видно, что клетка занята.
  function trapPad(ctx, b) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + (b.w || 1);
    const y1 = b.y + (b.h || 1);
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    ctx.fillStyle = 'rgba(52,34,24,.22)';
    diamond(ctx, A, B, C, D);
    ctx.fill();

    if (!mid()) return;
    const e = 0.1;
    ctx.strokeStyle = 'rgba(255,207,74,.24)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    diamond(ctx,
      P(x0 + e, y0 + e), P(x1 - e, y0 + e),
      P(x1 - e, y1 - e), P(x0 + e, y1 - e));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function trapScorch(ctx, b, rx, ry) {
    const p = P(b.x + 0.5, b.y + 0.5);
    groundEllipse(ctx, p.x, p.y + 1, rx, ry, 'rgba(44,26,16,.28)');
    groundEllipse(ctx, p.x, p.y, rx * 0.68, ry * 0.68, 'rgba(28,17,11,.42)');
  }

  // Радиальные трещины вокруг воронки. Без Math.random: кадр детерминирован.
  function trapCracks(ctx, b, count, inner, outer) {
    const p = P(b.x + 0.5, b.y + 0.5);
    ctx.strokeStyle = 'rgba(30,18,12,.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count + (b.x + b.y) * 0.71;
      const k = Math.cos(a) * 0.28;
      ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner * 0.5);
      ctx.lineTo(p.x + Math.cos(a) * outer * (1 + k), p.y + Math.sin(a) * outer * 0.5);
    }
    ctx.stroke();
  }

  /* --- мина: приплюснутый диск с мигающим индикатором --- */

  function mineLamp(b, lvl) {
    const p = P(b.x + 0.5, b.y + 0.5);
    return { x: p.x + 7.5, y: p.y - 6 - (lvl >= 6 ? 1.5 : 0) };
  }

  function drawMine(ctx, b, lvl, armed) {
    const p = P(b.x + 0.5, b.y + 0.5);
    trapPad(ctx, b);

    if (!armed) {
      trapScorch(ctx, b, 17, 8.5);
      trapCracks(ctx, b, 6, 5, 17);
      groundEllipse(ctx, p.x - 1, p.y + 1, 12, 5.8, 'rgba(58,38,24,.55)');
      groundEllipse(ctx, p.x - 1, p.y, 8.5, 4, 'rgba(20,13,9,.7)');
      ring(ctx, p.x - 1, p.y + 1, 12.5, 6, 'rgba(120,78,50,.55)', 1.1);

      // вырванные куски корпуса
      poly(ctx, [
        { x: p.x - 14, y: p.y + 3 }, { x: p.x - 7, y: p.y - 2 },
        { x: p.x - 9, y: p.y + 5 }
      ], PAL.metalDark);
      poly(ctx, [
        { x: p.x + 9, y: p.y - 1 }, { x: p.x + 15, y: p.y + 3 },
        { x: p.x + 10, y: p.y + 5 }
      ], PAL.metal);
      if (mid()) {
        spot(ctx, p.x + 4, p.y - 3, 1.4, PAL.stoneDark);
        spot(ctx, p.x - 5, p.y - 1, 1, PAL.stoneDark);
      }
      return;
    }

    castShadow(ctx, b.x + 0.12, b.y + 0.12, b.x + 0.88, b.y + 0.88, 0.4);

    // низкий корпус: три вложенных эллипса дают приплюснутый диск
    groundEllipse(ctx, p.x, p.y + 2.5, 16, 8, 'rgba(34,20,13,.3)');
    groundEllipse(ctx, p.x, p.y + 1, 15.5, 7.8, shade(PAL.metalDark, -0.12));
    groundEllipse(ctx, p.x, p.y - 0.8, 15, 7.2, PAL.metalDark);
    groundEllipse(ctx, p.x, p.y - 2.6, 14, 6.5, PAL.metal);
    groundEllipse(ctx, p.x - 0.8, p.y - 3.8, 10.6, 5.1, shade(PAL.metal, 0.1));

    // внутренний обод и болты
    ring(ctx, p.x - 0.8, p.y - 3.8, 9.4, 4.5, 'rgba(38,44,48,.65)', 1.2);
    const bolts = lvl >= 7 ? 6 : (lvl >= 3 ? 5 : 4);
    for (let i = 0; i < bolts; i++) {
      const a = i * Math.PI * 2 / bolts + 0.4;
      spot(ctx, p.x + Math.cos(a) * 11.2, p.y - 3.4 + Math.sin(a) * 5.3,
        lvl >= 9 ? 1.5 : 1.2, lvl >= 9 ? PAL.gold : PAL.metalLight);
    }

    // центральная ступица
    spot(ctx, p.x, p.y - 4.3, 3.4, shade(PAL.metalDark, -0.1));
    spot(ctx, p.x - 0.4, p.y - 4.7, 2.3, PAL.metalLight);
    spot(ctx, p.x - 0.8, p.y - 5.1, 0.9, 'rgba(255,250,235,.55)');

    // 2: кольцевая канавка и второй ряд заклёпок
    if (lvl >= 2) {
      ring(ctx, p.x - 0.8, p.y - 3.9, 12.2, 5.8, 'rgba(30,36,40,.5)', 1.1);
    }

    // 3: предупреждающие шевроны и боковые ручки
    if (lvl >= 3) {
      for (let i = -1; i <= 1; i += 2) {
        poly(ctx, [
          { x: p.x + i * 6.6, y: p.y - 6.8 },
          { x: p.x + i * 8.4, y: p.y - 5.2 },
          { x: p.x + i * 6.6, y: p.y - 3.6 },
          { x: p.x + i * 5.2, y: p.y - 5.2 }
        ], PAL.amber);
      }
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(p.x - 17, p.y - 3, 3.4, 2.4);
      ctx.fillRect(p.x + 13.6, p.y - 3, 3.4, 2.4);
    }

    // 4: наружные броневые сегменты и кабель
    if (lvl >= 4) {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.78;
        const x = p.x + Math.cos(a) * 13.4;
        const y = p.y - 3.2 + Math.sin(a) * 6.1;
        ctx.fillStyle = shade(PAL.metalDark, i % 2 ? -0.05 : 0.08);
        ctx.fillRect(x - 2.4, y - 1.4, 4.8, 2.8);
      }
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + 13, p.y - 2);
      ctx.lineTo(p.x + 17, p.y + 2.5);
      ctx.lineTo(p.x + 15, p.y + 5);
      ctx.stroke();
    }

    // 5: золотое кольцо и гексагональная крышка
    if (lvl >= 5) {
      ring(ctx, p.x - 0.8, p.y - 3.9, 10.2, 4.9, 'rgba(224,176,69,.8)', 1.5);
      poly(ctx, [
        { x: p.x, y: p.y - 8.4 }, { x: p.x + 3.2, y: p.y - 6.4 },
        { x: p.x + 3.2, y: p.y - 3.2 }, { x: p.x, y: p.y - 1.2 },
        { x: p.x - 3.2, y: p.y - 3.2 }, { x: p.x - 3.2, y: p.y - 6.4 }
      ], PAL.metalDark);
      spot(ctx, p.x, p.y - 4.8, 1.3, PAL.cold);
    }

    /* --- 6-10: мина обрастает сенсорами и вторым контуром --- */

    // 6: сенсорная мачта
    if (lvl >= 6) {
      const m = mineLamp(b, lvl);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y + 2);
      ctx.lineTo(m.x, m.y - 6);
      ctx.stroke();
      spot(ctx, m.x, m.y - 7, 1.5, PAL.metalLight);
      spot(ctx, m.x, m.y - 8.4, 1.1, 'rgba(226,88,62,.85)');
    }

    // 7: второй бронепояс и кабельные зажимы
    if (lvl >= 7) {
      ring(ctx, p.x - 0.8, p.y - 2.4, 14.4, 6.8, 'rgba(30,36,40,.45)', 1.4);
      if (mid()) {
        spot(ctx, p.x - 12, p.y - 6, 1.2, PAL.glass);
        spot(ctx, p.x + 11, p.y - 7, 1.2, PAL.glass);
      }
    }

    // 8: канистра и предохранитель сбоку
    if (lvl >= 8) {
      const cx = P(b.x + 0.18, b.y + 0.28);
      prism(ctx, b.x + 0.1, b.y + 0.34, b.x + 0.3, b.y + 0.62, 1, 6,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, cx.x, cx.y - 9, 1.2, PAL.amber);
    }

    // 9: золотые заклёпки по внешнему ободу
    if (lvl >= 9) {
      ring(ctx, p.x - 0.8, p.y - 3.9, 13.2, 6.2, 'rgba(255,207,74,.55)', 1.3);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.78;
        spot(ctx, p.x + Math.cos(a) * 13.6, p.y - 3 + Math.sin(a) * 6.4,
          1.5, PAL.gold);
      }
    }

    // 10: двойной обод и второй индикатор
    if (lvl >= 10) {
      ring(ctx, p.x - 0.8, p.y - 2.2, 15.4, 7.4, 'rgba(255,207,74,.7)', 1.6);
      spot(ctx, p.x - 8, p.y - 8, 1.5, 'rgba(226,88,62,.75)');
      if (mid()) spot(ctx, p.x - 8, p.y - 9.4, 0.8, 'rgba(255,210,190,.65)');
    }

    // тёмный колпак индикатора: сам огонёк мигает в overlay
    const lamp = mineLamp(b, lvl);
    spot(ctx, lamp.x, lamp.y, 2.4, 'rgba(22,14,11,.75)');
    spot(ctx, lamp.x, lamp.y, 1.7, 'rgba(92,34,24,.9)');
  }

  /* --- пружина: стальная пластина с витой пружиной --- */

  function drawSpring(ctx, b, lvl, armed) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + (b.w || 1);
    const y1 = b.y + (b.h || 1);
    const p = P(x0 + 0.5, y0 + 0.5);
    const plateH = 3 + (lvl >= 4 ? 1 : 0);

    trapPad(ctx, b);

    if (!armed) {
      // раскрытая пластина: две откинутые створки, тёмная щель и вылезшая пружина
      trapScorch(ctx, b, 16, 8);
      const hole = { x: p.x, y: p.y - 1 };
      groundEllipse(ctx, hole.x, hole.y, 10, 5, 'rgba(18,12,9,.7)');
      ring(ctx, hole.x, hole.y, 10.6, 5.4, 'rgba(140,150,155,.45)', 1.2);

      poly(ctx, [
        { x: hole.x - 12, y: hole.y + 1 }, { x: hole.x - 4, y: hole.y + 5 },
        { x: hole.x - 5, y: hole.y - 5 }, { x: hole.x - 13, y: hole.y - 8 }
      ], PAL.metalDark);
      poly(ctx, [
        { x: hole.x + 12, y: hole.y + 1 }, { x: hole.x + 4, y: hole.y + 5 },
        { x: hole.x + 5, y: hole.y - 5 }, { x: hole.x + 13, y: hole.y - 8 }
      ], shade(PAL.metal, 0.06));
      poly(ctx, [
        { x: hole.x - 13, y: hole.y - 8 }, { x: hole.x - 5, y: hole.y - 5 },
        { x: hole.x - 6, y: hole.y - 7 }
      ], PAL.amber);

      // пружина выброшена вверх и в сторону
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hole.x - 1, hole.y + 1);
      ctx.lineTo(hole.x + 4, hole.y - 15);
      ctx.lineTo(hole.x + 12, hole.y - 24);
      ctx.stroke();
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(hole.x, hole.y);
      ctx.lineTo(hole.x + 5, hole.y - 15);
      ctx.lineTo(hole.x + 13, hole.y - 23);
      ctx.stroke();

      // витки, растянувшиеся на земле
      if (mid()) {
        for (let i = 0; i < 3; i++) {
          const a = i * 1.9 + 0.4;
          spot(ctx, hole.x + Math.cos(a) * (12 + i * 2), hole.y + Math.sin(a) * 4,
            1.4, PAL.metalLight);
        }
      }
      return;
    }

    castShadow(ctx, b.x + 0.12, b.y + 0.12, b.x + 0.88, b.y + 0.88, 0.5);

    // вкопанная плита
    prism(ctx, x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 0, plateH,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    const A = P(x0 + 0.12, y0 + 0.12);
    const B = P(x1 - 0.12, y0 + 0.12);
    const C = P(x1 - 0.12, y1 - 0.12);
    const D = P(x0 + 0.12, y1 - 0.12);

    // предупреждающая кромка на передней грани
    const seg = lvl >= 3 ? 5 : 4;
    for (let i = 0; i < seg; i++) {
      const u0 = 0.06 + i * 0.88 / seg;
      const u1 = 0.06 + (i + 1) * 0.88 / seg;
      wallPatch(ctx, D, C, plateH, u0, u1, 0.05 / plateH, 0.82 / plateH,
        i % 2 ? PAL.amber : PAL.metalDark);
    }

    // верхняя накладка и её обод
    ctx.fillStyle = shade(PAL.metal, 0.08);
    diamond(ctx,
      { x: A.x, y: A.y - plateH }, { x: B.x, y: B.y - plateH },
      { x: C.x, y: C.y - plateH }, { x: D.x, y: D.y - plateH });
    ctx.fill();
    ctx.strokeStyle = 'rgba(36,42,46,.6)';
    ctx.lineWidth = 1.1;
    diamond(ctx,
      { x: A.x + 1, y: A.y - plateH - 1 }, { x: B.x - 1, y: B.y - plateH - 1 },
      { x: C.x - 1, y: C.y - plateH + 1 }, { x: D.x + 1, y: D.y - plateH + 1 });
    ctx.stroke();

    // витая пружина: витки с зазором, иначе на мелком масштабе она
    // сливается в гладкий цилиндр
    const coils = near() ? 6 : (mid() ? 5 : 4);
    const stepY = 3.6;
    const baseY = p.y - plateH;
    const topY = baseY - coils * stepY;
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= coils; i++) {
      const yy = baseY - i * stepY;
      const r = 7 - i * 0.2;
      ctx.moveTo(p.x + r, yy);
      ctx.ellipse(p.x, yy, r, 2.2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= coils; i++) {
      const yy = baseY - i * stepY - 0.7;
      const r = 7 - i * 0.2;
      ctx.moveTo(p.x + r, yy);
      ctx.ellipse(p.x, yy, r, 2.2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();

    // верхняя чашка
    spot(ctx, p.x, topY - 0.6, 7.4, PAL.metalDark);
    spot(ctx, p.x, topY - 1.2, 6.7, PAL.metalLight);
    spot(ctx, p.x - 1.4, topY - 2.4, 2, 'rgba(255,250,235,.45)');

    // 2: заклёпки по углам
    if (lvl >= 2) {
      const pts = [A, B, C, D];
      for (let i = 0; i < pts.length; i++) {
        spot(ctx, pts[i].x + (i === 0 || i === 3 ? 2 : -2),
          pts[i].y - plateH + (i < 2 ? 1 : -1), 1.1, PAL.metalDark);
      }
    }

    // 3: боковые упоры-кронштейны
    if (lvl >= 3) {
      prism(ctx, x0 + 0.03, y0 + 0.26, x0 + 0.12, y1 - 0.26, 0, 4,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      prism(ctx, x1 - 0.12, y0 + 0.26, x1 - 0.03, y1 - 0.26, 0, 4,
        PAL.metalDark, PAL.metal, PAL.metalDark);
    }

    // 4: вторая, малая пружина сбоку
    if (lvl >= 4) {
      const sx = p.x + 12;
      const sy = p.y - 3;
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const yy = sy - i * 2.2;
        ctx.moveTo(sx + 3.6, yy);
        ctx.ellipse(sx, yy, 3.6, 1.4, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      spot(ctx, sx, sy - 6.6, 1.3, PAL.metalLight);
    }

    // 5: золотая чашка пружины
    if (lvl >= 5) {
      ring(ctx, p.x, topY - 0.8, 7.8, 3, 'rgba(224,176,69,.8)', 1.4);
      spot(ctx, p.x + 7, p.y - 6, 1.4, PAL.gold);
    }

    /* --- 6-10: пружина получает гидравлику и датчики --- */

    // 6: гидроцилиндр и манометр
    if (lvl >= 6) {
      const cy = P(x0 + 0.2, y1 - 0.2);
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(cy.x - 2.2, cy.y - 14, 4.4, 12);
      ctx.fillStyle = PAL.metalLight;
      ctx.fillRect(cy.x - 2.2, cy.y - 14, 1.6, 12);
      spot(ctx, cy.x, cy.y - 16, 2.2, PAL.stoneDark);
      spot(ctx, cy.x, cy.y - 16, 1.3, 'rgba(226,88,62,.9)');
    }

    // 7: рёбра жёсткости на плите
    if (lvl >= 7) {
      ribLines(ctx, D, C, plateH, 0.08, 0.92, 1, plateH - 0.5, 4,
        'rgba(42,50,54,.45)', 1.1);
    }

    // 8: напорный бак и трубка к плите
    if (lvl >= 8) {
      const tx = P(x1 - 0.18, y0 + 0.24);
      prism(ctx, x1 - 0.3, y0 + 0.12, x1 - 0.06, y0 + 0.36, 1, 8,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, tx.x, tx.y - 10, 1.4, PAL.cyan);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx.x, tx.y - 8);
      ctx.lineTo(p.x + 6, p.y - 5);
      ctx.stroke();
    }

    // 9: золотые накладки и антенна
    if (lvl >= 9) {
      spot(ctx, D.x + 2, D.y - plateH + 1, 1.4, PAL.gold);
      spot(ctx, B.x - 2, B.y - plateH + 1, 1.4, PAL.gold);
      antennaMast(ctx, p.x - 11, p.y - 2, 12, PAL.metalLight, PAL.gold);
    }

    // 10: двойная пружина и золотой обод
    if (lvl >= 10) {
      ring(ctx, p.x, p.y - plateH - 1, 13, 5.8, 'rgba(255,207,74,.6)', 1.5);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = baseY - 2 - i * 2.2;
        ctx.moveTo(p.x + 3 + 6.4, yy);
        ctx.ellipse(p.x + 3, yy, 6.4, 2.2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  /* --- воздушная мина: парящий шипованный шар --- */

  function airMineCenter(b, lvl) {
    const p = P(b.x + 0.5, b.y + 0.5);
    return { x: p.x, y: p.y - 21 - (lvl >= 6 ? 2 : 0), groundY: p.y };
  }

  function drawAirMine(ctx, b, lvl, armed) {
    const p = P(b.x + 0.5, b.y + 0.5);
    const c = airMineCenter(b, lvl);
    trapPad(ctx, b);

    if (!armed) {
      trapScorch(ctx, b, 16, 8);
      trapCracks(ctx, b, 5, 4, 15);

      // искорёженные обломки оболочки
      poly(ctx, [
        { x: c.x - 13, y: c.groundY + 1 }, { x: c.x - 6, y: c.groundY - 6 },
        { x: c.x - 2, y: c.groundY + 3 }
      ], PAL.metalDark);
      poly(ctx, [
        { x: c.x + 11, y: c.groundY }, { x: c.x + 4, y: c.groundY - 5 },
        { x: c.x + 2, y: c.groundY + 3 }
      ], PAL.metal);
      poly(ctx, [
        { x: c.x - 3, y: c.groundY - 8 }, { x: c.x + 3, y: c.groundY - 10 },
        { x: c.x + 1, y: c.groundY - 3 }
      ], shade(PAL.metal, 0.12));
      ctx.strokeStyle = PAL.stoneDark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c.x - 8, c.groundY + 2);
      ctx.lineTo(c.x - 11, c.groundY - 5);
      ctx.moveTo(c.x + 7, c.groundY + 1);
      ctx.lineTo(c.x + 10, c.groundY - 7);
      ctx.stroke();
      if (mid()) {
        spot(ctx, c.x - 6, c.groundY - 1, 1.2, PAL.cold);
        spot(ctx, c.x + 4, c.groundY - 2, 1, PAL.gold);
      }
      return;
    }

    castShadow(ctx, b.x + 0.18, b.y + 0.18, b.x + 0.82, b.y + 0.82, 0.35);

    // антиграв: мягкое пятно под шаром и три тонких луча
    groundEllipse(ctx, c.x, c.groundY, 11, 4.6, 'rgba(70,224,200,.10)');
    ring(ctx, c.x, c.groundY, 10.5, 4.4, 'rgba(70,224,200,.22)', 1);
    if (mid()) {
      ctx.strokeStyle = 'rgba(70,224,200,.18)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.5;
        ctx.moveTo(c.x + Math.cos(a) * 4, c.groundY + 1);
        ctx.lineTo(c.x + Math.cos(a) * 2, c.y + 7);
      }
      ctx.stroke();
    }

    const R = 8.2 + (lvl >= 7 ? 0.8 : 0);
    const spikes = 8 + Math.min(7, Math.floor(lvl * 0.7));

    // шипы: треугольники вокруг шара
    for (let i = 0; i < spikes; i++) {
      const a = i * Math.PI * 2 / spikes - Math.PI / 2 + 0.18;
      const x0 = c.x + Math.cos(a) * (R - 1.4);
      const y0 = c.y + Math.sin(a) * (R - 1.4);
      const x1 = c.x + Math.cos(a) * (R + 5.6);
      const y1 = c.y + Math.sin(a) * (R + 5.6);
      const nx = -Math.sin(a) * 2.6;
      const ny = Math.cos(a) * 2.6;
      poly(ctx, [
        { x: x0 + nx, y: y0 + ny * 0.7 },
        { x: x1, y: y1 },
        { x: x0 - nx, y: y0 - ny * 0.7 }
      ], lvl >= 9 && i % 3 === 0 ? PAL.gold : PAL.stoneDark);
      if (mid()) {
        ctx.strokeStyle = 'rgba(6,10,12,.45)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x0 + nx * 0.3, y0 + ny * 0.2);
        ctx.stroke();
      }
    }

    // корпус и бронепластины
    spot(ctx, c.x, c.y, R, shade(PAL.metalDark, -0.08));
    spot(ctx, c.x, c.y, R - 1.2, PAL.metalDark);
    spot(ctx, c.x - 1, c.y - 1.2, R - 2.8, PAL.metal);
    if (mid()) {
      ring(ctx, c.x, c.y, R - 3.4, (R - 3.4) * 0.52, 'rgba(30,38,42,.5)', 1.1);
      spot(ctx, c.x - 2.8, c.y - 3, 2.4, 'rgba(255,250,235,.22)');
    }

    // ядро индикатора (сам свет мигает в overlay)
    spot(ctx, c.x + 1.5, c.y + 0.5, 2.8, 'rgba(18,12,9,.8)');
    spot(ctx, c.x + 1.5, c.y + 0.5, 1.8, 'rgba(226,88,62,.9)');

    // 2: экваториальный обруч
    if (lvl >= 2) {
      ring(ctx, c.x, c.y + 1, R - 2, (R - 2) * 0.38, 'rgba(154,167,173,.6)', 1.1);
    }

    // 3: три стабилизатора
    if (lvl >= 3) {
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 + 0.7;
        poly(ctx, [
          { x: c.x + Math.cos(a) * (R - 2), y: c.y + Math.sin(a) * (R - 2) },
          { x: c.x + Math.cos(a + 0.22) * (R + 4), y: c.y + Math.sin(a + 0.22) * (R + 4) },
          { x: c.x + Math.cos(a - 0.22) * (R + 4), y: c.y + Math.sin(a - 0.22) * (R + 4) }
        ], PAL.metalLight);
      }
    }

    // 4: верхняя антенна
    if (lvl >= 4) {
      antennaMast(ctx, c.x, c.y - R + 1, 10, PAL.metalLight, PAL.cold);
    }

    // 5: золотая полоса
    if (lvl >= 5) {
      ctx.strokeStyle = 'rgba(255,207,74,.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 0.5, R - 2.4, (R - 2.4) * 0.55, 0, 0.3, Math.PI - 0.3);
      ctx.stroke();
      spot(ctx, c.x + 1.5, c.y + 0.5, 1.9, PAL.amber);
    }

    /* --- 6-10: шар становится орбитальной миной --- */

    // 6: второе кольцо и более частые шипы
    if (lvl >= 6) {
      ring(ctx, c.x, c.y - 0.5, R + 6.5, (R + 6.5) * 0.26, 'rgba(70,224,200,.32)', 1.1);
      spot(ctx, c.x - 6, c.y - 6, 1.2, PAL.glass);
    }

    // 7: малые маневровые дюзы
    if (lvl >= 7) {
      for (let i = 0; i < 2; i++) {
        const sx = c.x + (i ? 6 : -6);
        const sy = c.y + 5;
        ctx.fillStyle = PAL.metalDark;
        ctx.fillRect(sx - 1.6, sy - 1, 3.2, 3.4);
        spot(ctx, sx, sy + 3.2, 1.3, 'rgba(255,138,92,.55)');
      }
    }

    // 8: руны-огни по корпусу
    if (lvl >= 8) {
      for (let i = 0; i < 3; i++) {
        const a = -0.9 + i * 0.9;
        spot(ctx, c.x + Math.cos(a) * (R - 4), c.y + Math.sin(a) * (R - 4),
          1.1, PAL.cyan);
      }
    }

    // 9: золотые наконечники шипов
    if (lvl >= 9) {
      for (let i = 0; i < spikes; i += 3) {
        const a = i * Math.PI * 2 / spikes - Math.PI / 2 + 0.18;
        spot(ctx, c.x + Math.cos(a) * (R + 5.6), c.y + Math.sin(a) * (R + 5.6),
          1.3, PAL.gold);
      }
    }

    // 10: внешнее кольцо-орбита
    if (lvl >= 10) {
      ring(ctx, c.x, c.y - 1, R + 9, (R + 9) * 0.2, 'rgba(255,207,74,.55)', 1.4);
      spot(ctx, c.x + R + 9, c.y - 1, 1.7, PAL.gold);
      spot(ctx, c.x - R - 9, c.y - 1, 1.7, PAL.gold);
    }
  }

  /* --- засадная турель: пандус-люк, после раскрытия — ствол --- */

  function drawAmbush(ctx, b, lvl, open) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + (b.w || 1);
    const y1 = b.y + (b.h || 1);
    const p = P(x0 + 0.5, y0 + 0.5);

    trapPad(ctx, b);
    castShadow(ctx, b.x + 0.1, b.y + 0.1, b.x + 0.9, b.y + 0.9, 0.55);

    if (!open) {
      // закрытый люк: бронеплита вровень с землёй
      const lidH = 3 + (lvl >= 4 ? 1 : 0);
      prism(ctx, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, 0, lidH,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      const A = P(x0 + 0.08, y0 + 0.08);
      const B = P(x1 - 0.08, y0 + 0.08);
      const C = P(x1 - 0.08, y1 - 0.08);
      const D = P(x0 + 0.08, y1 - 0.08);

      // диагональный шов посередине
      ctx.strokeStyle = 'rgba(30,38,42,.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo((A.x + D.x) / 2, (A.y + D.y) / 2 - lidH);
      ctx.lineTo((B.x + C.x) / 2, (B.y + C.y) / 2 - lidH);
      ctx.stroke();

      // косынки-предупреждения на передней грани
      const seg = lvl >= 5 ? 5 : 4;
      for (let i = 0; i < seg; i++) {
        const u0 = 0.06 + i * 0.88 / seg;
        const u1 = 0.06 + (i + 1) * 0.88 / seg;
        wallPatch(ctx, D, C, lidH, u0, u1, 0.05 / lidH, 0.78 / lidH,
          i % 2 ? PAL.amber : PAL.metalDark);
      }

      // защёлки по углам
      const clamps = [
        { x: D.x + 3, y: D.y - lidH + 1 },
        { x: C.x - 3, y: C.y - lidH + 1 },
        { x: A.x + 3, y: A.y - lidH + 1 },
        { x: B.x - 3, y: B.y - lidH + 1 }
      ];
      for (let i = 0; i < clamps.length; i++) {
        ctx.fillStyle = lvl >= 9 ? PAL.gold : PAL.metalDark;
        ctx.fillRect(clamps[i].x - 1.6, clamps[i].y - 1.2, 3.2, 2.4);
      }

      // 2: заклёпки, 3: второй шов и петли
      if (lvl >= 2) {
        spot(ctx, p.x - 5, p.y - lidH - 1, 1.1, PAL.metalDark);
        spot(ctx, p.x + 5, p.y - lidH - 1, 1.1, PAL.metalDark);
      }
      if (lvl >= 3) {
        ctx.strokeStyle = 'rgba(30,38,42,.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(A.x + 4, A.y - lidH + 1);
        ctx.lineTo(D.x - 2, D.y - lidH - 1);
        ctx.moveTo(B.x - 4, B.y - lidH + 1);
        ctx.lineTo(C.x + 2, C.y - lidH - 1);
        ctx.stroke();
      }

      // 4: сенсорный купол
      if (lvl >= 4) {
        spot(ctx, p.x + 2, p.y - lidH - 2, 2.2, PAL.stoneDark);
        spot(ctx, p.x + 2, p.y - lidH - 2.6, 1.4, PAL.glass);
      }

      // 5: золотые углы
      if (lvl >= 5) {
        spot(ctx, D.x + 2, D.y - lidH + 1, 1.4, PAL.gold);
        spot(ctx, C.x - 2, C.y - lidH + 1, 1.4, PAL.gold);
      }

      // 6: вентиляционные щели
      if (lvl >= 6) {
        ribLines(ctx, D, C, lidH + 1, 0.18, 0.82, 0.5, lidH, 5,
          'rgba(18,24,28,.45)', 1);
      }

      // 7: боковые бронещитки
      if (lvl >= 7) {
        prism(ctx, x0 + 0.02, y0 + 0.24, x0 + 0.1, y1 - 0.24, 0, 6,
          PAL.metalLight, PAL.metal, PAL.metalDark);
        prism(ctx, x1 - 0.1, y0 + 0.24, x1 - 0.02, y1 - 0.24, 0, 6,
          PAL.metalDark, PAL.metal, PAL.metalDark);
      }

      // 8: антенна наводки
      if (lvl >= 8) {
        antennaMast(ctx, p.x - 10, p.y - 3, 13, PAL.metalLight, PAL.cyan);
        exhaustStack(ctx, p.x + 11, p.y - 1, 7, 3);
      }

      // 9: золотые накладки на петлях
      if (lvl >= 9) {
        ring(ctx, p.x, p.y - lidH - 1, 11, 4.4, 'rgba(255,207,74,.55)', 1.3);
      }

      // 10: дополнительная бронеплита и второй контур
      if (lvl >= 10) {
        prism(ctx, x0 + 0.22, y0 + 0.22, x1 - 0.22, y1 - 0.22, lidH, 2,
          PAL.metalLight, PAL.metal, PAL.metalDark);
        spot(ctx, p.x, p.y - lidH - 5, 1.6, PAL.gold);
      }
      return;
    }

    // Раскрытый люк: тёмный проём, поднятая крышка, кольцо погона.
    const A = P(x0 + 0.16, y0 + 0.16);
    const B = P(x1 - 0.16, y0 + 0.16);
    const C = P(x1 - 0.16, y1 - 0.16);
    const D = P(x0 + 0.16, y1 - 0.16);
    ctx.fillStyle = 'rgba(14,11,9,.86)';
    diamond(ctx, A, B, C, D);
    ctx.fill();
    ctx.strokeStyle = 'rgba(154,167,173,.55)';
    ctx.lineWidth = 1.4;
    diamond(ctx, A, B, C, D);
    ctx.stroke();

    // внутренние стенки шахты
    poly(ctx, [
      { x: A.x, y: A.y }, { x: B.x, y: B.y },
      { x: B.x, y: B.y + 5 }, { x: A.x, y: A.y + 5 }
    ], 'rgba(48,44,40,.9)');

    // откинутая крышка за задним краем
    const lidLift = 12 + (lvl >= 6 ? 3 : 0);
    const lidA = { x: A.x - 2, y: A.y - 1 };
    const lidB = { x: B.x + 2, y: B.y - 1 };
    poly(ctx, [
      lidA, lidB,
      { x: lidB.x, y: lidB.y - lidLift },
      { x: lidA.x, y: lidA.y - lidLift }
    ], PAL.metalDark);
    poly(ctx, [
      { x: lidA.x, y: lidA.y - lidLift },
      { x: lidB.x, y: lidB.y - lidLift },
      { x: lidB.x - 3, y: lidB.y - lidLift + 2 },
      { x: lidA.x + 3, y: lidA.y - lidLift + 2 }
    ], PAL.metalLight);
    // косынки на поднятой крышке
    if (mid()) {
      for (let i = 0; i < 3; i++) {
        const u = 0.2 + i * 0.26;
        const x = lidA.x + (lidB.x - lidA.x) * u;
        const y = lidA.y + (lidB.y - lidA.y) * u;
        ctx.fillStyle = i % 2 ? PAL.amber : PAL.metalDark;
        ctx.fillRect(x - 2, y - lidLift + 3, 4, 2);
      }
    }

    // распорки крышки
    beam(ctx, D.x + 5, D.y - 1, lidA.x + 5, lidA.y - lidLift + 2, 1.4);
    beam(ctx, C.x - 5, C.y - 1, lidB.x - 5, lidB.y - lidLift + 2, 1.4);

    // погон турели
    groundEllipse(ctx, p.x, p.y - 1, 9.5, 4.6, PAL.metalDark);
    groundEllipse(ctx, p.x, p.y - 2.4, 8.6, 4.1, PAL.metal);
    ring(ctx, p.x, p.y - 2.4, 8.6, 4.1, 'rgba(30,38,42,.55)', 1.1);
    spot(ctx, p.x, p.y - 4.4, 3.8, PAL.metalDark);
    spot(ctx, p.x - 0.6, p.y - 4.9, 2.6, PAL.metalLight);

    // 5+: золотой обод погона
    if (lvl >= 5) ring(ctx, p.x, p.y - 2.6, 10.6, 5, 'rgba(255,207,74,.65)', 1.3);

    // 6+: датчики на кромке шахты
    if (lvl >= 6) {
      spot(ctx, A.x + 3, A.y - 1, 1.3, PAL.cyan);
      spot(ctx, B.x - 3, B.y - 1, 1.3, PAL.cyan);
    }

    // 8+: выхлоп и кабель питания
    if (lvl >= 8) {
      exhaustStack(ctx, p.x + 12, p.y - 1, 8, 3.2);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(D.x + 2, D.y - 1);
      ctx.lineTo(p.x - 8, p.y - 3);
      ctx.stroke();
    }

    // 10: второй погон и золотые зубцы
    if (lvl >= 10) {
      ring(ctx, p.x, p.y - 1.4, 12, 5.6, 'rgba(255,207,74,.75)', 1.5);
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + 0.78;
        spot(ctx, p.x + Math.cos(ang) * 11.2, p.y - 1.6 + Math.sin(ang) * 5.2,
          1.2, PAL.gold);
      }
    }
  }

  // ствол засады и вспышка выстрела — вектор поверх запечённого люка
  function drawAmbushGun(ctx, b, lvl) {
    if (!ambushOpen(b)) return;
    const p = P(b.x + 0.5, b.y + 0.5);
    const a = typeof b.aim === 'number' && isFinite(b.aim) ? b.aim : -0.7;
    let dx = Math.cos(a) - Math.sin(a);
    let dy = (Math.cos(a) + Math.sin(a)) * 0.55;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;

    const bx = p.x;
    const by = p.y - 7;
    const len = 15 + Math.min(5, lvl * 0.5);

    barrel(ctx, bx, by, dx, dy, len, 5.6, true, lvl >= 5);

    const mx = bx + dx * (len + 3);
    const my = by + dy * (len + 3);

    // вспышка: поле может быть числом (таймер) или флагом firing.
    // У засады выстрел обычный, поэтому если флага нет — ловим первые
    // ~0.16 с после сброса кулдауна (cd), этого хватает на вспышку.
    let f = trapNum(b, ['flash', 'muzzle', 'flashT', 'shotT', 'fireT']);
    if (f !== null) f = f > 1 ? Math.min(1, f / 4) : Math.max(0, f);
    else if (beamFiring(b)) f = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 26));
    else if (typeof b.cd === 'number' && isFinite(b.cd)) {
      const period = 1 / ((b.def && b.def.rate) || 1);
      const since = period - b.cd;
      f = since >= 0 && since < 0.16 ? 1 - since / 0.16 : 0;
    } else {
      f = 0;
    }

    if (f > 0.02) {
      const r = 3 + f * 5;
      ctx.fillStyle = 'rgba(255,207,74,' + (0.75 * f).toFixed(2) + ')';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4 + 0.3;
        const rr = i % 2 ? r * 0.45 : r * 1.25;
        const px = mx + Math.cos(ang) * rr;
        const py = my + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      spot(ctx, mx, my, r * 0.4, 'rgba(255,250,235,' + (0.9 * f).toFixed(2) + ')');
    }

    // подсветка казённика
    spot(ctx, bx, by, 2.2, PAL.cold);
  }

  /* --- орбитальный луч: тонкая высокая башня с линзой --- */

  function drawBeamTower(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + (b.w || 1);
    const y1 = b.y + (b.h || 1);
    const p = P(x0 + 0.5, y0 + 0.5);
    const H = beamH(lvl);
    const baseH = 4 + (lvl >= 3 ? 4 : 0) + (lvl >= 7 ? 3 : 0);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.85);

    prism(ctx, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, 0, baseH,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    // узкий ствол
    prism(ctx, x0 + 0.36, y0 + 0.36, x1 - 0.36, y1 - 0.36, baseH, H - baseH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // вертикальные рёбра
    if (mid()) {
      const l = P(x0 + 0.36, y1 - 0.36);
      const r = P(x1 - 0.36, y1 - 0.36);
      ctx.strokeStyle = 'rgba(30,38,42,.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - baseH);
      ctx.lineTo(l.x, l.y - H);
      ctx.moveTo(r.x, r.y - baseH);
      ctx.lineTo(r.x, r.y - H);
      ctx.stroke();
    }

    // кольца-обоймы по стволу
    const bands = lvl >= 4 ? 4 : (lvl >= 2 ? 2 : 1);
    for (let i = 1; i <= bands; i++) {
      const yy = p.y - baseH - (H - baseH) * i / (bands + 1);
      const rad = 7.2 - i * 0.25;
      ctx.strokeStyle = i === 1 && lvl >= 5 ? 'rgba(255,207,74,.75)' : 'rgba(70,224,200,.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, yy, rad, rad * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // верхняя площадка
    prism(ctx, x0 + 0.16, y0 + 0.16, x1 - 0.16, y1 - 0.16, H, 4,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // Два вертикальных излучателя-рога: силуэт «вилки» отличает луч от
    // лазерной вышки с одиночной линзой даже на мелком тайле.
    for (let s = -1; s <= 1; s += 2) {
      const bx0 = p.x + s * 6.2;
      const by0 = p.y - baseH - 4;
      const bx1 = p.x + s * 11.5;
      const by1 = p.y - H - 2;
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx0 + s * 0.7, by0);
      ctx.lineTo(bx1 + s * 0.7, by1);
      ctx.stroke();
      ring(ctx, bx1, by1 - 0.5, 2.6, 1.5, PAL.cold, 1.1);
      spot(ctx, bx1, by1 - 0.5, 1, PAL.glass);
    }

    const ly = p.y - H - 9;
    const lr = 5.4 + (lvl >= 8 ? 0.8 : 0);

    // оправа линзы
    ring(ctx, p.x, ly, lr + 4.4, (lr + 4.4) * 0.5, PAL.metalLight, 1.8);
    ring(ctx, p.x, ly, lr + 2.8, (lr + 2.8) * 0.52, PAL.metalDark, 1.1);

    // стекло и блик (яркость по charge — в overlay)
    spot(ctx, p.x, ly, lr, shade(PAL.cold, -0.5));
    spot(ctx, p.x, ly, lr - 1.3, mix(PAL.cold, PAL.glass, 0.55));
    spot(ctx, p.x - 1.8, ly - 1.8, lr * 0.34, 'rgba(255,255,255,.7)');

    // 2: боковая планка настройки
    if (lvl >= 2) {
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + lr + 4, ly + 2);
      ctx.lineTo(p.x + lr + 9, ly + 6);
      ctx.stroke();
      spot(ctx, p.x + lr + 10, ly + 7, 1.5, PAL.metalLight);
    }

    // 3: нижние распорки
    if (lvl >= 3) {
      const bl = P(x0 + 0.08, y1 - 0.08);
      const br = P(x1 - 0.08, y1 - 0.08);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.lineTo(p.x - 6, p.y - H * 0.48);
      ctx.moveTo(br.x, br.y);
      ctx.lineTo(p.x + 6, p.y - H * 0.48);
      ctx.stroke();
    }

    // 4: малая антенна-тарелка сбоку линзы
    if (lvl >= 4) {
      ctx.fillStyle = shade(PAL.metal, 0.1);
      ctx.beginPath();
      ctx.ellipse(p.x - lr - 7, ly - 3, 6, 3, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x - lr - 7, ly - 3, 6, 3, -0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5: золотая оправа
    if (lvl >= 5) {
      ring(ctx, p.x, ly, lr + 5.4, (lr + 5.4) * 0.48, 'rgba(255,207,74,.8)', 1.5);
      spot(ctx, p.x + lr + 5, ly - 4, 1.3, PAL.gold);
    }

    /* --- 6-10: башня наращивает кабели и вторую линзу --- */

    // 6: кабель по стволу и окна-индикаторы
    if (lvl >= 6) {
      ctx.strokeStyle = 'rgba(70,224,200,.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y - baseH - 2);
      ctx.quadraticCurveTo(p.x - 8, p.y - H * 0.6, p.x - 5, p.y - H + 4);
      ctx.stroke();
      spot(ctx, p.x + 5, p.y - baseH - 10, 1.2, PAL.glass);
      spot(ctx, p.x + 5, p.y - baseH - 16, 1.2, PAL.cyan);
    }

    // 7: конденсаторы у основания
    if (lvl >= 7) {
      const c1 = P(x0 + 0.16, y0 + 0.22);
      prism(ctx, x0 + 0.08, y0 + 0.12, x0 + 0.26, y0 + 0.34, 1, 10,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, c1.x, c1.y - 13, 1.4, PAL.cold);
      const c2 = P(x1 - 0.16, y0 + 0.22);
      prism(ctx, x1 - 0.26, y0 + 0.12, x1 - 0.08, y0 + 0.34, 1, 8,
        PAL.metalDark, PAL.metal, PAL.metalDark);
      spot(ctx, c2.x, c2.y - 11, 1.2, PAL.glass);
    }

    // 8: выхлоп и антенна
    if (lvl >= 8) {
      exhaustStack(ctx, p.x + 10, p.y - 1, 9, 3.2);
      antennaMast(ctx, p.x - 10, p.y - H + 4, 10, PAL.metalLight, PAL.cyan);
    }

    // 9: золотые ребра линзы и вымпел
    if (lvl >= 9) {
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + 0.4;
        spot(ctx, p.x + Math.cos(ang) * (lr + 4.8), ly + Math.sin(ang) * (lr + 4.8) * 0.5,
          1.3, PAL.gold);
      }
      pennant(ctx, p.x + 8, p.y - H + 1, 14, PAL.gold, 5);
    }

    // 10: вторая линза и внешнее кольцо
    if (lvl >= 10) {
      spot(ctx, p.x, ly - lr - 6, 3.2, PAL.metalDark);
      spot(ctx, p.x, ly - lr - 6, 2.2, PAL.cold);
      spot(ctx, p.x - 0.6, ly - lr - 6.6, 0.9, 'rgba(255,255,255,.85)');
      ring(ctx, p.x, ly, lr + 8.6, (lr + 8.6) * 0.3, 'rgba(255,207,74,.5)', 1.2);
    }
  }

  // Свечение линзы и предвыстрел: яркость растёт по charge 0..3.
  function drawBeamGlow(ctx, b, lvl) {
    const p = P(b.x + 0.5, b.y + 0.5);
    const H = beamH(lvl);
    const ly = p.y - H - 9;
    const charge = beamCharge(b);
    const pulse = 0.5 + 0.5 * Math.sin(t * (1.8 + charge * 0.9));
    const a = 0.08 + charge * 0.11 + pulse * 0.03;
    const r = 10 + charge * 5 + pulse * 1.4;

    if (mid()) {
      const g = ctx.createRadialGradient(p.x, ly, 1, p.x, ly, r * 2.1);
      g.addColorStop(0, 'rgba(214,255,250,' + Math.min(0.85, a + 0.32).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(70,224,200,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(70,224,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, ly, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      spot(ctx, p.x, ly, r * 0.5, 'rgba(70,224,200,' + a.toFixed(3) + ')');
    }

    // ядро линзы
    const core = 2.4 + charge * 0.9;
    spot(ctx, p.x, ly, core + 1.2, 'rgba(70,224,200,' + Math.min(0.9, a + 0.45).toFixed(3) + ')');
    spot(ctx, p.x, ly, core, 'rgba(236,255,251,' + Math.min(1, 0.35 + charge * 0.2).toFixed(3) + ')');

    // ступени заряда: кольца-сектора
    for (let i = 0; i < Math.floor(charge); i++) {
      const rr = 9 + i * 3.2;
      ctx.strokeStyle = 'rgba(127,233,255,' + (0.26 + i * 0.12).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, ly, rr, rr * 0.45, 0, -0.4, Math.PI + 0.4);
      ctx.stroke();
    }

    // на заряде 2+ над линзой дрожит тонкая нить энергии
    if (charge >= 2 && mid()) {
      ctx.strokeStyle = 'rgba(157,255,244,' + (0.18 + charge * 0.07).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, ly - 4);
      ctx.lineTo(p.x + Math.sin(t * 9) * 1.6, ly - 16 - charge * 2);
      ctx.stroke();
    }

    // сам выстрел: короткие лучи от линзы
    if (beamFiring(b) && charge >= 1) {
      ctx.strokeStyle = 'rgba(214,255,250,' + (0.22 + charge * 0.1).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = t * 2 + i * Math.PI / 2;
        ctx.moveTo(p.x + Math.cos(ang) * 7, ly + Math.sin(ang) * 3.5);
        ctx.lineTo(p.x + Math.cos(ang) * (12 + charge * 2), ly + Math.sin(ang) * (6 + charge));
      }
      ctx.stroke();
    }
  }

  // Луч к цели. Точка старта — линза башни: если рядом есть постройка beam,
  // берём её уровень, иначе высота по умолчанию.
  function beamMountY(S, x, y) {
    if (S && S.buildings) {
      for (let i = 0; i < S.buildings.length; i++) {
        const b = S.buildings[i];
        if (!b || b.type !== 'beam') continue;
        if (Math.abs(b.x + 0.5 - x) < 0.8 && Math.abs(b.y + 0.5 - y) < 0.8) {
          return beamH(levelOf(b)) + 11;
        }
      }
    }
    return 72;
  }

  // Одна полоса луча: ореол, тело, белое ядро, вспышки на концах.
  function paintBeam(ctx, ax, ay, bx, by, charge, fade) {
    const jitter = Math.sin(t * 44) * 0.8;

    ctx.lineCap = 'round';

    // широкий ореол
    ctx.strokeStyle = 'rgba(70,224,200,' + (0.10 + charge * 0.03).toFixed(3) + ')';
    ctx.lineWidth = 9 + charge * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + jitter, by);
    ctx.stroke();

    // тело луча
    ctx.strokeStyle = 'rgba(157,255,244,' + (0.30 * fade).toFixed(3) + ')';
    ctx.lineWidth = 3.4 + charge * 0.7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + jitter, by);
    ctx.stroke();

    // белое ядро
    ctx.strokeStyle = 'rgba(240,255,252,' + (0.75 * fade).toFixed(3) + ')';
    ctx.lineWidth = 1.2 + charge * 0.35;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + jitter, by);
    ctx.stroke();

    // вспышка на линзе и в точке попадания
    spot(ctx, ax, ay, 3.4 + charge, 'rgba(236,255,251,.7)');
    spot(ctx, bx, by, 5 + charge * 1.4, 'rgba(70,224,200,.28)');
    spot(ctx, bx, by, 2.2 + charge * 0.6, 'rgba(236,255,251,.8)');
  }

  function drawBeamShot(ctx, s, S, k) {
    const a = P(s.x1, s.y1);
    const b = P(s.x2, s.y2);
    const z1 = trapNum(s, ['z1', 'top', 'fromY']);
    const z2 = trapNum(s, ['z2', 'toY']);
    const ay = a.y - (z1 !== null ? z1 : beamMountY(S, s.x1, s.y1));
    const by = b.y - (z2 !== null ? z2 : 8);
    const charge = Math.max(1, Math.min(3, trapNum(s, ['charge', 'power']) || 3));
    paintBeam(ctx, a.x, ay, b.x, by, charge, 1 - k * 0.55);
  }

  // Непрерывный луч из состояния постройки: coder держит beamTarget,
  // пока цель в радиусе, и растит charge 1..3.
  function drawBeamZap(ctx, b, lvl) {
    const tgt = b && b.beamTarget;
    if (!tgt || typeof tgt.x !== 'number' || typeof tgt.y !== 'number') return;

    const p = P(b.x + 0.5, b.y + 0.5);
    const q = P(tgt.x, tgt.y);
    const charge = Math.max(1, Math.min(3,
      typeof tgt.charge === 'number' ? tgt.charge : beamCharge(b)));
    const pulse = 0.9 + 0.1 * Math.sin(t * 9);
    paintBeam(ctx, p.x, p.y - beamH(lvl) - 11, q.x, q.y - 8, charge, pulse);
  }

  /* --- динамика ловушек поверх спрайтов --- */

  function drawMineFx(ctx, b, lvl) {
    if (trapFired(b)) {
      // дым из воронки
      const p = P(b.x + 0.5, b.y + 0.5);
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.35 + i * 0.33) % 1;
        const a = (1 - k) * 0.2;
        if (a <= 0) continue;
        ctx.fillStyle = 'rgba(226,213,190,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x - 4 + i * 4 + Math.sin(t + i) * 2, p.y - 5 - k * 14,
          2.4 + k * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const lamp = mineLamp(b, lvl);
    const blink = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * 4.2 + (b.x + b.y) * 0.9));
    spot(ctx, lamp.x, lamp.y, 3.2 + blink, 'rgba(226,88,62,' + (0.16 * blink).toFixed(3) + ')');
    spot(ctx, lamp.x, lamp.y, 1.9, 'rgba(255,138,92,' + (0.85 * blink + 0.1).toFixed(3) + ')');
    spot(ctx, lamp.x - 0.4, lamp.y - 0.5, 0.8, 'rgba(255,236,214,' + blink.toFixed(3) + ')');
  }

  function drawSpringFx(ctx, b) {
    if (!trapFired(b)) return;
    const p = P(b.x + 0.5, b.y + 0.5);
    // остывающий пар
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.4 + i * 0.5) % 1;
      ctx.fillStyle = 'rgba(226,236,236,' + ((1 - k) * 0.13).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x + 4 + i * 3, p.y - 8 - k * 12, 2 + k * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAirMineFx(ctx, b, lvl) {
    const c = airMineCenter(b, lvl);
    if (trapFired(b)) {
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.5 + i * 0.5) % 1;
        ctx.fillStyle = 'rgba(214,226,224,' + ((1 - k) * 0.14).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(c.x - 2 + i * 5, c.groundY - 4 - k * 12, 2.2 + k * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.1 + b.x * 0.8));
    spot(ctx, c.x + 1.5, c.y + 0.5, 2.7, 'rgba(70,224,200,' + (0.16 * blink).toFixed(3) + ')');
    spot(ctx, c.x + 1.5, c.y + 0.5, 1.4, 'rgba(255,138,92,' + (0.7 * blink + 0.15).toFixed(3) + ')');

    // медленное вращение орбитального кольца на 6+ уровнях
    if (lvl >= 6 && mid()) {
      ctx.strokeStyle = 'rgba(70,224,200,.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 16, 5.4, Math.sin(t * 0.7) * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // высота постройки для вспышек и полосок
  const BODY_H = {
    townhall: 40, barracks: 28, archer: 44, cannon: 30,
    mortar: 38, airdef: 26, mage: 50,
    goldmine: 22, elixir: 18, storage: 20, wall: 18,
    mine: 10, spring: 18, airmine: 34, ambush: 16, beam: 62
  };

  function bodyHeight(b) {
    const h = BODY_H[b.type] || 26;
    if (b.type === 'townhall' && levelOf(b) >= 4) return h + 12;
    if (b.type === 'ambush') return ambushOpen(b) ? 28 : 14;
    if (b.type === 'beam') return beamH(levelOf(b)) + 12;
    return h;
  }

  /* ---------- спрайты статичных построек ----------
     Постройки не анимируются, поэтому рисуем их один раз в маленький canvas
     и дальше только блитим. На сильном зуме (тайл > 96 px) возвращаемся
     к вектору, чтобы линии оставались резкими. */
  const spriteCache = new Map();

  function spriteFor(b, lvl) {
    const detail = lod;
    const variant = trapVariant(b);
    const key = b.type + '|' + lvl + '|' + detail + '|' + b.w + 'x' + b.h +
      (variant ? '|' + variant : '');
    if (spriteCache.has(key)) return spriteCache.get(key);

    const w = b.w || 1;
    const h = b.h || 1;
    const crownPx = crown(b, lvl);
    const left = h * TW / 2 + 44;
    const top = crownPx + 50;
    const cw = Math.ceil(left + w * TW / 2 + 44);
    const ch = Math.ceil(top + (w + h) * TH / 2 + 22);
    const ss = detail === 0 ? 1 : 1.5;

    let sp = null;
    try {
      const c = makeCanvas(cw * ss, ch * ss);
      const cx = c.getContext('2d');
      cx.setTransform(ss, 0, 0, ss, left * ss, top * ss);
      drawBuildingBody(cx, {
        id: -1, type: b.type, def: b.def,
        x: 0, y: 0, w: w, h: h,
        hp: 1, maxHp: 1, aim: -0.6, dead: false, __level: lvl,
        __trapVariant: variant
      });
      sp = { canvas: c, left: left, top: top, w: cw, h: ch };
    } catch (e) {
      sp = null;
    }

    spriteCache.set(key, sp);
    return sp;
  }

  function drawSprite(ctx, sp, b) {
    const dx = (b.x - b.y) * TW / 2;
    const dy = (b.x + b.y) * TH / 2;
    ctx.drawImage(sp.canvas, dx - sp.left, dy - sp.top, sp.w, sp.h);
  }

  /* ---------- стройплощадка ----------
     Пока постройка строится (Base.renderList отдаёт building/build), на её
     месте рисуем стройку: утоптанное пятно, полупрозрачный «недоделанный»
     корпус, леса из тонких балок, заливку прогресса снизу вверх и полоску
     прогресса над зданием.

     Кэш: каркас с материалами не зависит от прогресса, поэтому печётся в
     спрайт один раз по типу/уровню/масштабу/пятну. Прогресс живёт отдельным
     векторным слоем поверх кэша — каждый кадр это несколько полигонов, а не
     новый canvas. После завершения building снимается, и здание рисуется
     обычным путём, без остатков лесов. */

  const siteCache = new Map();
  let siteBakes = 0;

  // высота лесов: короткой турели нужен каркас выше корпуса, иначе он не читается
  function siteH(b) {
    return Math.max(bodyHeight(b) + 8, 28);
  }

  // Одно состояние «идут работы»: постановка (build) или улучшение (upgrade).
  // Апгрейд приоритетнее, если данные почему-то пришли одновременно.
  // В бою лесов нет: там свои id и своя логика.
  function workOf(b) {
    if (!b) return null;
    if (CC.App && CC.App.mode === 'battle') return null;

    const game = CC.Game;
    if (game && typeof game.isUpgrading === 'function' &&
        typeof game.upgradeInfo === 'function') {
      let up = null;
      try {
        if (game.isUpgrading(b.id)) up = game.upgradeInfo(b.id);
      } catch (e) {
        up = null;
      }
      if (up && up.active) {
        const total = Number(up.total);
        const left = Number(up.left);
        let p = total > 0 && isFinite(left) ? 1 - left / total : 0;
        if (!isFinite(p)) p = 0;
        return {
          kind: 'upgrade',
          progress: p < 0 ? 0 : (p > 1 ? 1 : p),
          to: Number(up.to) || 0,
          left: isFinite(left) ? left : 0
        };
      }
    }

    if (b.building || (b.build && typeof b.build.progress === 'number')) {
      return {
        kind: 'build',
        progress: siteProgress(b),
        to: 0,
        left: b.build ? Math.max(0, (Number(b.build.leftMs) || 0) / 1000) : 0
      };
    }

    return null;
  }

  function siteProgress(b) {
    const p = b && b.build ? Number(b.build.progress) : 0;
    if (!isFinite(p)) return 0;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  // тонкая балка: тёмный металл и светлая кромка сверху
  function beam(ctx, ax, ay, bx, by, w) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#37424a';
    ctx.lineWidth = w || 1.8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(186,204,212,.55)';
    ctx.lineWidth = Math.max(0.5, (w || 1.8) * 0.34);
    ctx.beginPath();
    ctx.moveTo(ax, ay - 0.7);
    ctx.lineTo(bx, by - 0.7);
    ctx.stroke();
  }

  function groundEllipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    else ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
  }

  // утоптанная земля вокруг пятна и светлая разметка: сразу видно стройку
  function sitePad(ctx, b) {
    const e = 0.13;
    const A = P(b.x - e, b.y - e);
    const B = P(b.x + b.w + e, b.y - e);
    const C = P(b.x + b.w + e, b.y + b.h + e);
    const D = P(b.x - e, b.y + b.h + e);

    ctx.fillStyle = 'rgba(104,62,36,.34)';
    diamond(ctx, A, B, C, D);
    ctx.fill();

    if (!mid()) return;

    ctx.strokeStyle = 'rgba(240,214,170,.28)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    diamond(ctx, A, B, C, D);
    ctx.stroke();
    ctx.setLineDash([]);

    // след от тачки вдоль переднего края
    const t0 = P(b.x - e + 0.12, b.y + b.h + e - 0.05);
    const t1 = P(b.x + b.w * 0.5, b.y + b.h + e - 0.05);
    ctx.strokeStyle = 'rgba(66,38,22,.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.stroke();
  }

  // статичная часть стройки: стойки, прогоны, настил, материалы.
  // (ox, oy) — левый верхний угол пятна: при запекании это 0,0.
  function siteArt(ctx, b, ox, oy) {
    const w = b.w || 1;
    const h = b.h || 1;
    const H = siteH(b);
    const D = P(ox, oy + h);
    const C = P(ox + w, oy + h);
    const B = P(ox + w, oy);

    const oD = { x: D.x - 1.8, y: D.y + 2.4 };
    const oC = { x: C.x, y: C.y + 3.4 };
    const oB = { x: B.x + 1.8, y: B.y + 2.4 };
    const lw = near() ? 2 : 1.5;

    // материалы: песок у левого угла и штабель плит у правого
    const sand = P(ox - 0.24, oy + h + 0.03);
    groundEllipse(ctx, sand.x + 2, sand.y + 2, 10, 4, 'rgba(58,30,16,.26)');
    groundEllipse(ctx, sand.x, sand.y, 9.5, 4.2, PAL.regolithLight);
    groundEllipse(ctx, sand.x - 2, sand.y - 1.2, 4.6, 1.9, shade(PAL.regolithLight, 0.28));

    prism(ctx, ox + w + 0.06, oy + 0.16, ox + w + 0.3, oy + 0.4, 0, 5,
      '#8d7156', '#9d8166', '#6c5440');
    prism(ctx, ox + w + 0.1, oy + 0.2, ox + w + 0.26, oy + 0.36, 5, 3,
      '#a88c6c', '#b89a7a', '#7d6349');

    // арматура, прислонённая к левой стойке
    beam(ctx, D.x - 6, D.y + 1, D.x + 1, D.y - 16, 1.1);
    beam(ctx, D.x - 4, D.y + 1, D.x + 3, D.y - 15, 1.1);

    // угловые стойки по передним граням
    beam(ctx, oD.x, oD.y, oD.x, oD.y - H - 3, lw);
    beam(ctx, oC.x, oC.y, oC.x, oC.y - H - 3, lw);
    beam(ctx, oB.x, oB.y, oB.x, oB.y - H - 3, lw);

    const midL = { x: (oD.x + oC.x) / 2, y: (oD.y + oC.y) / 2 };
    const midR = { x: (oC.x + oB.x) / 2, y: (oC.y + oB.y) / 2 };
    if (near() && w + h > 2) {
      beam(ctx, midL.x + 1, midL.y + 0.6, midL.x + 1, midL.y - H - 3, lw * 0.8);
      beam(ctx, midR.x - 1, midR.y + 0.6, midR.x - 1, midR.y - H - 3, lw * 0.8);
    }

    // прогоны: три яруса
    const levels = [H * 0.3, H * 0.6, H * 0.9];
    for (let i = 0; i < levels.length; i++) {
      const y = levels[i];
      beam(ctx, oD.x, oD.y - y, oC.x, oC.y - y, lw * 0.85);
      beam(ctx, oC.x, oC.y - y, oB.x, oB.y - y, lw * 0.85);
    }

    // раскосы крест-накрест по передним граням
    if (mid()) {
      beam(ctx, oD.x, oD.y - H * 0.12, oC.x, oC.y - H * 0.9, 1.05);
      beam(ctx, oC.x, oC.y - H * 0.12, oD.x, oD.y - H * 0.9, 1.05);
      beam(ctx, oC.x, oC.y - H * 0.12, oB.x, oB.y - H * 0.9, 1.05);
      beam(ctx, oB.x, oB.y - H * 0.12, oC.x, oC.y - H * 0.9, 1.05);
    }

    // деревянный настил верхнего яруса
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a9805a';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(oD.x, oD.y - H);
    ctx.lineTo(oC.x, oC.y - H);
    ctx.lineTo(oB.x, oB.y - H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(206,168,120,.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(oD.x, oD.y - H - 1);
    ctx.lineTo(oC.x, oC.y - H - 1);
    ctx.lineTo(oB.x, oB.y - H - 1);
    ctx.stroke();

    // бирюзовый фонарик на углу — общий акцент с искрами сварки
    spot(ctx, oC.x, oC.y - H - 1, 2, 'rgba(70,224,200,.8)');
    spot(ctx, oC.x, oC.y - H - 1, 0.8, 'rgba(236,255,251,.9)');

    // кран-укосина над углом: мачта, стрела, тросик с грузом
    if (near()) {
      const mast = { x: oC.x + 2, y: oC.y - H - 4 };
      const top = { x: mast.x, y: mast.y - 15 };
      const jib = { x: mast.x - 24, y: top.y - 2 };
      beam(ctx, mast.x, mast.y, top.x, top.y, 1.6);
      beam(ctx, mast.x + 2, top.y + 2, jib.x, jib.y, 1.4);
      beam(ctx, mast.x - 3, top.y + 6, top.x, top.y - 1, 0.9);

      ctx.strokeStyle = 'rgba(38,46,52,.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(jib.x + 1, jib.y + 1);
      ctx.lineTo(jib.x + 1, jib.y + 11);
      ctx.stroke();
      // бадья на крюке — в экранных пикселях, не в клетках
      const bx = jib.x - 1;
      const by = jib.y + 9;
      poly(ctx, [
        { x: bx, y: by }, { x: bx + 4.5, y: by - 1.5 },
        { x: bx + 4.5, y: by + 3.5 }, { x: bx, y: by + 5 }
      ], '#8a6a50');
      poly(ctx, [
        { x: bx, y: by }, { x: bx + 4.5, y: by - 1.5 },
        { x: bx + 4.5, y: by - 0.4 }, { x: bx, y: by + 1.1 }
      ], '#b89a7a');
      spot(ctx, top.x, top.y, 1.4, 'rgba(70,224,200,.9)');
    }
  }

  // каркас в спрайте: геометрия та же, что у спрайтов построек
  function siteSprite(b, lvl) {
    const detail = lod;
    const key = b.type + '|' + lvl + '|' + detail + '|' + b.w + 'x' + b.h;
    if (siteCache.has(key)) return siteCache.get(key);

    const w = b.w || 1;
    const h = b.h || 1;
    const crownPx = crown(b, lvl);
    const left = h * TW / 2 + 44;
    const top = crownPx + 50;
    const cw = Math.ceil(left + w * TW / 2 + 44);
    const ch = Math.ceil(top + (w + h) * TH / 2 + 22);
    const ss = detail === 0 ? 1 : 1.5;

    let sp = null;
    siteBakes++;
    try {
      const c = makeCanvas(cw * ss, ch * ss);
      const cx = c.getContext('2d');
      cx.setTransform(ss, 0, 0, ss, left * ss, top * ss);
      siteArt(cx, b, 0, 0);
      sp = { canvas: c, left: left, top: top, w: cw, h: ch };
    } catch (e) {
      sp = null;
    }

    siteCache.set(key, sp);
    return sp;
  }

  // заливка прогресса снизу вверх: полупрозрачная призма внутри пятна
  function siteFill(ctx, b, prog, H) {
    if (prog <= 0.004) return;

    const i = 0.04;
    const A = P(b.x + i, b.y + i);
    const B = P(b.x + b.w - i, b.y + i);
    const C = P(b.x + b.w - i, b.y + b.h - i);
    const D = P(b.x + i, b.y + b.h - i);
    const lift = H * prog;

    const uC = { x: C.x, y: C.y - lift };
    const uB = { x: B.x, y: B.y - lift };
    const uD = { x: D.x, y: D.y - lift };
    const uA = { x: A.x, y: A.y - lift };

    poly(ctx, [D, C, uC, uD], 'rgba(70,224,200,.20)');
    poly(ctx, [C, B, uB, uC], 'rgba(70,224,200,.15)');
    poly(ctx, [uA, uB, uC, uD], 'rgba(70,224,200,.14)');

    ctx.strokeStyle = 'rgba(126,246,226,.72)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(uD.x, uD.y);
    ctx.lineTo(uC.x, uC.y);
    ctx.lineTo(uB.x, uB.y);
    ctx.stroke();
  }

  // искры сварки и пыль: только динамика, кэш не трогаем
  function siteSparks(ctx, b, H) {
    if (!mid()) return;

    const C = P(b.x + b.w, b.y + b.h);
    const ph = (b.id || 0) * 0.37 + b.x * 0.7 + b.y * 1.3;

    for (let i = 0; i < 2; i++) {
      const f = Math.sin(t * 8.5 + ph + i * 2.3);
      if (f < 0.25) continue;
      const sx = C.x - 1 + Math.sin(t * 5.1 + ph + i * 1.7) * 4;
      const sy = C.y - H * (0.6 + i * 0.16) + Math.cos(t * 6.3 + ph + i) * 2;
      spot(ctx, sx, sy, 1.5, 'rgba(70,224,200,.5)');
      spot(ctx, sx, sy, 0.75, 'rgba(232,255,250,.9)');
    }

    // пыль поднимается от свежей кладки
    const k = (t * 0.28 + ph) % 1;
    spot(ctx, C.x - 6 - k * 5, C.y - 2 - k * 12, 1.1,
      'rgba(228,192,152,' + (0.3 * (1 - k)).toFixed(3) + ')');
  }

  // полоска прогресса над зданием: подложка + бирюзовое заполнение.
  // label — время работ (для улучшения), чтобы не терять таймер.
  function siteBar(ctx, b, lvl, prog, H, label) {
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const lift = Math.max(crown(b, lvl) + 4, H + 26);
    const top = p.y - lift;
    const w = 36;
    const h = 5;
    const x = p.x - w / 2;

    if (label) {
      ctx.font = '800 9px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = Math.max(28, ctx.measureText(label).width + 12);
      plate(ctx, p.x - tw / 2, top - 13, tw, 11, 'rgba(12,24,28,.86)');
      ctx.fillStyle = '#e4fbf7';
      ctx.fillText(label, p.x, top - 7.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = 'rgba(12,24,28,.84)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - 1.5, top - 1.5, w + 3, h + 3, 4);
    else ctx.rect(x - 1.5, top - 1.5, w + 3, h + 3);
    ctx.fill();

    const k = prog > 0.02 ? prog : 0.02;
    ctx.fillStyle = 'rgba(70,224,200,.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, top, w * k, h, 2.5);
    else ctx.rect(x, top, w * k, h);
    ctx.fill();

    // блик у кромки заполнения: видно, что работа ещё идёт
    if (prog < 0.995) {
      spot(ctx, x + w * k, top + h / 2, 1.7, 'rgba(236,255,251,.85)');
    }
  }

  // вся стройплощадка поверх обычного корпуса
  function drawSite(ctx, b, lvl, body, floating, work) {
    const prog = work ? work.progress : siteProgress(b);
    const H = siteH(b);

    if (!floating) sitePad(ctx, b);

    if (mid()) {
      const sp = spritesOn && tilePx <= 96 ? siteSprite(b, lvl) : null;
      if (sp) drawSprite(ctx, sp, b);
      else siteArt(ctx, b, b.x, b.y);
    }

    // недоделанный корпус поверх лесов: полупрозрачный, балки видны сквозь него
    ctx.save();
    ctx.globalAlpha = 0.66;
    body();
    ctx.restore();

    siteFill(ctx, b, prog, H);

    siteSparks(ctx, b, H);
    siteBar(ctx, b, lvl, prog, H,
      work && work.kind === 'upgrade' ? fmtLeft(work.left) : '');
  }

  function drawBuilding(ctx, b) {
    const st = CC.UI && CC.UI.state;
    const lvl = levelOf(b);
    const type = b.type;

    // Ловушки врага в бою до срабатывания не рисуются вообще: ни спрайта,
    // ни тени, ни полоски здоровья. Свои ловушки (base, own/friendly) видны.
    if (isLurker(type)) {
      if (trapHidden(b)) { trapStats.hidden++; return; }
      trapStats.drawn++;
    }

    const work = workOf(b);
    const site = !!work;
    const sp = spritesOn && type !== 'cannon' && tilePx <= 96 ? spriteFor(b, lvl) : null;

    function body() {
      if (sp) drawSprite(ctx, sp, b);
      else drawBuildingBody(ctx, b);
    }

    // Динамика поверх запечённого корпуса: мигание, дым, ствол, свечение.
    function deco() {
      if (type === 'mage') { drawMageHalo(ctx, b, lvl); return; }
      if (type === 'mine') { drawMineFx(ctx, b, lvl); return; }
      if (type === 'spring') { drawSpringFx(ctx, b); return; }
      if (type === 'airmine') { drawAirMineFx(ctx, b, lvl); return; }
      if (type === 'ambush') { drawAmbushGun(ctx, b, lvl); return; }
      if (type === 'beam') {
        drawBeamGlow(ctx, b, lvl);
        drawBeamZap(ctx, b, lvl);
      }
    }

    // в режиме переноса постройка «в руке»: покачивается и чуть приподнята
    if (st && st.moving === b.id) {
      const p = P(b.x + b.w / 2, b.y + b.h / 2);
      const wob = Math.sin(t * 5.2) * 0.02;
      const lift = 2 + Math.sin(t * 5.2) * 1.2;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(wob);
      ctx.scale(1.02, 1.02);
      ctx.translate(-p.x, -p.y - lift);
      if (site) drawSite(ctx, b, lvl, body, true, work);
      else body();
      ctx.restore();
      if (!site) deco();

      // светлое пятно под парящей постройкой
      const A = P(b.x, b.y);
      const C = P(b.x + b.w, b.y + b.h);
      ctx.strokeStyle = 'rgba(224,176,69,.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      diamond(ctx, A, P(b.x + b.w, b.y), C, P(b.x, b.y + b.h));
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    if (site) {
      drawSite(ctx, b, lvl, body, false, work);
      return;
    }

    body();
    deco();
    maxBand(ctx, b, lvl);
  }

  function drawBuildingBody(ctx, b) {
    const type = b.type;
    const lvl = levelOf(b);

    if (type === 'townhall') {
      drawHouse(ctx, b, LOOK.townhall, lvl);
      return;
    }
    if (type === 'barracks') {
      drawBarracks(ctx, b, lvl);
      return;
    }
    if (type === 'cannon') { drawCannon(ctx, b, lvl); return; }
    if (type === 'mortar') { drawMortar(ctx, b, lvl); return; }
    if (type === 'archer') { drawTower(ctx, b, lvl); return; }
    if (type === 'airdef') { drawAirdef(ctx, b, lvl); return; }
    if (type === 'mage') { drawMage(ctx, b, lvl); return; }
    if (type === 'goldmine') { drawGoldmine(ctx, b, lvl); return; }
    if (type === 'elixir') { drawElixir(ctx, b, lvl); return; }
    if (type === 'storage') { drawStorage(ctx, b, lvl); return; }
    if (type === 'mine') { drawMine(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'spring') { drawSpring(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'airmine') { drawAirMine(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'ambush') { drawAmbush(ctx, b, lvl, trapVariant(b) === 'open'); return; }
    if (type === 'beam') { drawBeamTower(ctx, b, lvl); return; }
    if (type === 'wall') {
      drawWallRun(ctx, { x: b.x, y: b.y, w: 1, h: 1, cells: [b], lvl: lvl, alongX: true, first: true, last: true }, { bar: true });
      return;
    }

    // неизвестный тип — просто коробка
    const look = LOOK[type] || { h: 26, wall: PAL.stone };
    grassPad(ctx, b.x, b.y, b.x + b.w, b.y + b.h);
    castShadow(ctx, b.x, b.y, b.x + b.w, b.y + b.h, 0.9);
    box(ctx, b.x, b.y, b.x + b.w, b.y + b.h, look.h, look.wall);
  }

  /* ---------- юниты ---------- */

  /* ---------- юниты ---------- */

  // высота силуэта и ширина по типу
  const UNIT_SPEC = {
    barb: { h: 24, w: 1.0 },
    archer: { h: 22, w: 0.78 },
    giant: { h: 36, w: 1.62 },
    goblin: { h: 17, w: 0.72 },
    gnome: { h: 20, w: 1.02 },
    airship: { h: 30, w: 1.25 }
  };

  // полоски здоровья: цвет от травы к золоту и красному (10 ступеней)
  const HP_COLORS = (function () {
    const out = [];
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      out.push(p > 0.5
        ? mix(PAL.cyan, PAL.amber, (1 - p) * 2)
        : mix(PAL.amber, PAL.roof, (0.5 - p) * 2));
    }
    return out;
  })();

  function hpColor(p) {
    const i = Math.max(0, Math.min(10, Math.round(p * 10)));
    return HP_COLORS[i];
  }

  // направление на цель в экранных координатах
  function faceDir(u) {
    const t = u.target;
    if (t && typeof t.x === 'number') {
      const a = P(t.x + (t.w || 1) / 2, t.y + (t.h || 1) / 2);
      const b = P(u.x, u.y);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    return { x: 0.75, y: 0.45 };
  }

  /* ---------- псевдо-3D модели войск ----------
     У юнита восемь направлений (N, NE, E, SE, S, SW, W, NW). Направление
     берётся из фактического смещения за кадр (плавно, без рывков), а если
     юнит стоит — из следующей точки пути. Рисуем корпус, голову, оружие
     и ноги в локальных координатах этого направления: дали/близкие конечности,
     визор спереди и ранец сзади. Спрайт печётся один раз на
     тип|уровень|направление|кадр и дальше только блитится. */

  const UNIT_DIRS = 8;
  const UNIT_FRAMES = 4;      // 0 покой, 1 шаг левой, 2 шаг правой, 3 атака
  const U_ARTW = 80;          // канва спрайта в мировых пикселях
  const U_ARTH = 76;
  const U_AX = 40;            // якорь: ступни по центру
  const U_AY = 64;
  const U_BAKE = 2;           // внутреннее разрешение (2x), рисуем в 1x

  const unitSpriteCache = new Map();
  const unitBakes = { count: 0, hits: 0 };
  const unitMv = new WeakMap();

  // 0..7 → единичный вектор направления в экране. fy > 0 — на зрителя.
  const DIR_FX = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071];
  const DIR_FY = [-1, -0.7071, 0, 0.7071, 1, 0.7071, 0, -0.7071];

  function dirFromDelta(dx, dy) {
    if (!dx && !dy) return -1;
    // изометрия: мировое смещение → экранное
    const sx = dx - dy;
    const sy = (dx + dy) * (TH / TW);
    let a = Math.atan2(sx, -sy);      // 0 — вверх экрана, дальше по часовой
    let i = Math.round(a / (Math.PI / 4)) % UNIT_DIRS;
    if (i < 0) i += UNIT_DIRS;
    return i;
  }

  // Направление и фаза шага. Храним прошлую позицию: так видно реальное
  // движение, а не только намерение, и спрайт не дёргается на месте.
  function unitMotion(u) {
    let m = unitMv.get(u);
    if (!m) {
      m = { x: u.x, y: u.y, dir: -1, phase: ((u.id || 0) * 0.37) % 2, frame: 0, walking: false };
      unitMv.set(u, m);
    }

    const dx = u.x - m.x;
    const dy = u.y - m.y;
    const moved = Math.hypot(dx, dy);

    if (moved > 0.002) {
      const d = dirFromDelta(dx, dy);
      if (d >= 0) m.dir = d;
      m.phase += moved / 0.22;
      m.walking = moved > 0.008;
    } else if (u.path && u.path.length) {
      const s = u.path[0];
      if (s && typeof s.x === 'number') {
        const d = dirFromDelta(s.x + 0.5 - u.x, s.y + 0.5 - u.y);
        if (d >= 0) m.dir = d;
      }
      m.walking = true;
      m.phase += 0.09;
    } else if (u.tx != null && u.ty != null && !(u.pause > 0)) {
      const d = dirFromDelta(u.tx - u.x, u.ty - u.y);
      if (d >= 0) m.dir = d;
      m.walking = Math.hypot(u.tx - u.x, u.ty - u.y) > 0.12;
    } else {
      m.walking = false;
    }

    if (m.dir < 0) m.dir = u.type === 'airship' ? 2 : 4;
    m.x = u.x;
    m.y = u.y;

    // отладочный кадр нужен сцене-чеку: она показывает оба шага без движения
    let frame = 0;
    if (typeof u.__frame === 'number') frame = u.__frame | 0;
    else if (u.atk > 0) frame = 3;
    else if (m.walking) frame = 1 + (Math.floor(m.phase) % 2);

    m.frame = frame;
    return m;
  }

  // уровень войск влияет на мелкие знаки различия; ключ кэша хранит точный
  // уровень, а рисунок — три ступени детализации, чтобы не плодить канвы
  function unitTier(lvl) {
    const l = Number(lvl) || 1;
    return l >= 8 ? 3 : (l >= 4 ? 2 : 1);
  }

  function unitLevel(u) {
    if (u && typeof u.level === 'number' && isFinite(u.level)) return u.level;
    try {
      if (u && CC.Game && typeof CC.Game.troopLevel === 'function') {
        const l = CC.Game.troopLevel(u.type);
        if (typeof l === 'number' && isFinite(l)) return l;
      }
    } catch (e) { /* нет прогресса — первый уровень */ }
    return 1;
  }

  // крошечные помощники рисования в локальных координатах юнита
  function uBar(ctx, x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function uBox(ctx, x, y, w, h, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function uFlash(ctx, x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const rr = i % 2 ? r * 0.38 : r;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Общая поза: f — направление в экране, p — «плечо» поперёк него.
  function unitPose(type, dir, frame, lvl, u) {
    const fx = DIR_FX[dir];
    const fy = DIR_FY[dir];
    const fl = Math.hypot(fx, fy * 0.58) || 1;
    const f = { x: fx / fl, y: (fy * 0.58) / fl };
    const p = { x: -f.y, y: f.x };
    const step = frame === 1 ? 1 : (frame === 2 ? -1 : 0);
    return {
      type: type,
      dir: dir,
      frame: frame,
      atk: frame === 3,
      step: step,
      fx: fx,
      fy: fy,
      f: f,
      p: p,
      tier: unitTier(lvl),
      u: u
    };
  }

  function unitLegs(ctx, q, o) {
    const spread = o.spread || 2.5;
    const stride = q.step * (o.stride || 2.4);
    const hip = o.hip || -7.5;
    const w = o.w || 3.2;
    const foot = o.foot || 2.1;

    // дальняя нога темнее и рисуется первой
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const far = (q.p.y * s) < 0;
      const hx = q.p.x * spread * s;
      const hy = hip + q.p.y * spread * s * 0.35;
      const tx = hx + q.f.x * stride * s;
      const lift = (q.step * s > 0) ? 1.1 : 0;
      const ty = Math.min(-0.6, hy + q.f.y * stride * s * 0.8 - lift);
      const kx = (hx + tx) / 2 + q.p.x * 0.7 * s;
      const ky = (hy + ty) / 2;
      const col = far ? shade(o.col, -0.3) : o.col;
      uBar(ctx, hx, hy, kx, ky, w, col);
      uBar(ctx, kx, ky, tx, ty, w * 0.9, far ? shade(o.col, -0.36) : shade(o.col, -0.12));
      ctx.fillStyle = o.boot || PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(tx + q.f.x * 1.1, ty + 0.4, foot, foot * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!far) {
        ctx.fillStyle = PAL.metalLight;
        ctx.fillRect(tx + q.f.x * 1.1 - foot * 0.4, ty - 0.1, foot * 0.9, 0.6);
      }
    }
  }

  function unitTorso(ctx, q, o) {
    const w = (o.w || 10) * (1 - 0.26 * Math.abs(q.fx));
    const top = o.top || -19;
    const bot = o.bot || -7;
    const waist = w * (o.waist == null ? 0.78 : o.waist);
    const sh = (o.shoulder || w * 0.92) * (1 - 0.2 * Math.abs(q.fx));
    // перенос веса с шага: верх корпуса чуть уходит в сторону опорной ноги
    const swayX = q.p.x * q.step * 0.35;
    const swayY = q.p.y * q.step * 0.18;
    poly(ctx, [
      { x: -waist / 2, y: bot },
      { x: waist / 2, y: bot },
      { x: sh / 2 + swayX, y: top + swayY },
      { x: -sh / 2 + swayX, y: top + swayY }
    ], o.col);
    // пояс отделяет ноги и читается на мелком тайле
    if (o.belt) uBox(ctx, -waist / 2 - 0.4, bot - 0.6, waist + 0.8, 1.8, 0.6, o.belt);
    // светлая нагрудная панель
    if (o.panel) {
      const pw = w * 0.46;
      poly(ctx, [
        { x: -pw / 2 + q.f.x * 0.8 + swayX * 0.6, y: bot + 1.8 },
        { x: pw / 2 + q.f.x * 0.8 + swayX * 0.6, y: bot + 1.8 },
        { x: pw / 2 + swayX, y: top + 3.4 + swayY },
        { x: -pw / 2 + swayX, y: top + 3.4 + swayY }
      ], o.panel);
    }
  }

  function unitHead(ctx, q, o) {
    const r = o.r || 3.6;
    const y = o.y || -23;
    const x = q.f.x * (o.forward || 0.4) + q.p.x * q.step * 0.25;
    spot(ctx, x, y, r, shade(o.col, -0.28));
    spot(ctx, x, y - 0.2, r - 0.7, o.col);

    if (q.fy > -0.22) {
      // визор виден спереди и в профиль
      const vx = x + q.fx * r * 0.32;
      ctx.fillStyle = o.visor || PAL.glass;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(vx - r * 0.72, y - 1.1, r * 1.44, 1.8, 0.8);
      else ctx.rect(vx - r * 0.72, y - 1.1, r * 1.44, 1.8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(vx - r * 0.3, y - 0.9, r * 0.5, 0.7);
    } else {
      // сзади — узкая вентиляционная пластина и антенна
      ctx.fillStyle = shade(o.col, -0.38);
      ctx.fillRect(x - r * 0.26, y - 1.4, r * 0.52, 2.8);
      if (o.antenna) {
        uBar(ctx, x - r * 0.5, y - r * 0.4, x - r * 1.1, y - r * 2.1, 0.8, o.antenna);
        spot(ctx, x - r * 1.1, y - r * 2.2, 0.8, o.visor || PAL.cold);
      }
    }

    // знаки различия: 2 — бирюзовая полоса на шлеме, 3 — золотой кант
    if (q.tier >= 2) {
      ctx.fillStyle = q.tier >= 3 ? PAL.gold : PAL.cold;
      ctx.fillRect(x - r * 0.62, y - r * 0.62, r * 1.24, 0.9);
    }
  }

  // Ствол/оружие: origin задаётся вдоль f и поперёк p. Глубину по вертикали
  // сжимаем: ствол, направленный на зрителя, выглядит короче, а не уезжает
  // в землю. baseY — высота крепления на корпусе.
  function unitGun(ctx, q, a, b, len, w, body, accent, flashCol, baseY) {
    const gl = Math.hypot(q.f.x, q.f.y * 0.45) || 1;
    const gx = q.f.x / gl;
    const gy = (q.f.y * 0.45) / gl;
    const rec = q.atk ? -1.7 : 0;
    const drop = q.atk ? 0 : 1.2;
    const chest = baseY == null ? -13 : baseY;
    const ox = q.f.x * a + q.p.x * b + gx * rec + q.p.x * q.step * 0.45;
    const oy = chest + q.f.y * a * 0.45 + q.p.y * b * 0.25 + drop + gy * rec +
      q.p.y * q.step * 0.25;
    const x1 = ox + gx * len;
    const y1 = oy + gy * len;

    uBar(ctx, ox, oy, x1, y1, w, body);
    uBar(ctx, ox, oy, x1, y1, Math.max(0.9, w * 0.3), PAL.metalLight);
    spot(ctx, x1, y1, Math.max(1, w * 0.42), PAL.dark);
    if (accent) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ox + gx * len * 0.35, oy + gy * len * 0.35);
      ctx.lineTo(x1 - gx * 1.4, y1 - gy * 1.4);
      ctx.stroke();
    }
    if (q.atk) {
      uFlash(ctx, x1 + gx * 2.2, y1 + gy * 2.2, 3.2 + (q.tier - 1) * 0.5,
        flashCol || 'rgba(255,207,74,.9)');
      spot(ctx, x1 + gx * 2.2, y1 + gy * 2.2, 1.2, 'rgba(255,255,255,.95)');
    }
    return { x: x1, y: y1 };
  }

  /* --- штурмовик: широкие плечи, карабин, ранец --- */
  function artBarb(ctx, q, color) {
    const armor = mix(PAL.metal, color, 0.42);
    const dark = shade(armor, -0.3);
    unitLegs(ctx, q, { col: dark, boot: PAL.metalDark, spread: 2.7, w: 3.8, hip: -7.6, stride: 4.0 });

    // ранец за спиной виден, когда юнит идёт от зрителя
    if (q.fy < 0.55) {
      uBox(ctx, -4.4 - q.f.x * 2.2, -17.5, 5.4, 8.4, 1.6, PAL.metalDark);
      uBox(ctx, -3.9 - q.f.x * 2.2, -16.6, 4.2, 2.2, 0.8, PAL.metal);
      spot(ctx, -2.4 - q.f.x * 2.2, -14.6, 0.9, PAL.cyan);
    }

    unitTorso(ctx, q, {
      col: armor, top: -18.8, bot: -7, w: 10.6, shoulder: 11,
      panel: PAL.panel, belt: PAL.metalDark
    });
    // нагрудный акцент
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(-3.6 + q.f.x * 0.8, -13.4, 7.2, 1.3);

    // плечи: при виде в профиль одно уходит за корпус
    const shx = q.p.x * 5.9;
    const shy = -17.4 + q.p.y * 5.9 * 0.5;
    spot(ctx, shx, shy, 2.9, PAL.metalLight);
    spot(ctx, -shx, -17.4 - q.p.y * 5.9 * 0.5, 2.6, PAL.metal);
    if (q.tier >= 2) {
      spot(ctx, shx, shy, 1.3, q.tier >= 3 ? PAL.gold : PAL.cold);
    }

    // оружие: перед корпусом при взгляде спереди, за ним — со спины
    const drawGun = function () {
      unitGun(ctx, q, 2.2, 3.4, 13.5, 2.6, PAL.metalDark, PAL.glass,
        'rgba(255,207,74,.9)', -13);
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 3.9, y: -22.7, col: PAL.panel, visor: PAL.glass, antenna: PAL.metalLight
    });

    if (q.fy >= -0.2) drawGun();
    // ствол поверх плеча легче читается
    if (q.tier >= 3) spot(ctx, 2.5 + q.f.x * 4, -20.2, 0.8, PAL.gold);
  }

  /* --- лазерщик: тонкий силуэт, длинная винтовка, батарея --- */
  function artArcher(ctx, q, color) {
    const suit = mix(PAL.metalDark, color, 0.32);
    const dark = shade(suit, -0.26);
    unitLegs(ctx, q, { col: dark, boot: PAL.metalDark, spread: 2.1, w: 2.9, hip: -7.2, stride: 4.0 });

    // батарея с антенной
    if (q.fy < 0.6) {
      uBox(ctx, -4.6 - q.f.x * 2.4, -16.4, 3.4, 8, 1.2, PAL.metal);
      ctx.fillStyle = PAL.cyan;
      ctx.fillRect(-4.1 - q.f.x * 2.4, -14.8, 1.3, 4.6);
      uBar(ctx, -4.2 - q.f.x * 2.4, -16.4, -5.3 - q.f.x * 2.4, -21.2, 0.7, PAL.metalLight);
      spot(ctx, -5.3 - q.f.x * 2.4, -21.4, 0.8, PAL.glass);
    }

    unitTorso(ctx, q, {
      col: suit, top: -18.4, bot: -6.8, w: 8.2, shoulder: 8.8,
      panel: shade(suit, 0.18), belt: PAL.metalDark
    });

    // длинная лазерная винтовка
    const drawGun = function () {
      const tip = unitGun(ctx, q, 1.8, 2.6, 19, 2.1, PAL.metalDark, PAL.cyan,
        'rgba(127,233,255,.95)', -12.5);
      // светящийся наконечник
      spot(ctx, tip.x + q.f.x * 0.8, tip.y + q.f.y * 0.4, 1.4, PAL.glass);
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 3.3, y: -21.6, col: mix(PAL.panel, color, 0.15),
      visor: PAL.glass, antenna: PAL.cyan
    });

    if (q.fy >= -0.2) drawGun();
    if (q.tier >= 2) {
      ctx.strokeStyle = q.tier >= 3 ? PAL.gold : PAL.cold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -9.4);
      ctx.lineTo(3, -9.4);
      ctx.stroke();
    }
  }

  /* --- мех: тяжёлый корпус, кабина, плечевые блоки, орудие --- */
  function artGiant(ctx, q, color) {
    const shell = mix(PAL.metal, color, 0.3);
    const dark = shade(shell, -0.32);
    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark, spread: 4.6, w: 5.8, hip: -10, stride: 4.4, foot: 3
    });

    // дальняя рука-манипулятор
    uBar(ctx, -7.4, -23, -10 + q.f.x * 2, -14, 3.2, shade(shell, -0.24));
    uBox(ctx, -12 + q.f.x * 2, -14, 4, 4, 1.4, PAL.rust);

    // корпус
    unitTorso(ctx, q, {
      col: shell, top: -28.6, bot: -9.8, w: 18, shoulder: 19,
      panel: PAL.metalDark, belt: PAL.metalDark
    });
    // кабина
    uBox(ctx, -5.6, -27.2, 11.2, 6, 1.6, PAL.metalLight);
    ctx.fillStyle = PAL.glass;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-3.8, -25.7, 7.6, 2.8, 1.1);
    else ctx.rect(-3.8, -25.7, 7.6, 2.8);
    ctx.fill();
    if (q.fy < -0.2) {
      // со спины виден реактор
      spot(ctx, 0, -27, 3, PAL.metalDark);
      spot(ctx, 0, -27, 1.8, q.tier >= 3 ? PAL.gold : PAL.amber);
    }

    // плечевые блоки
    const gx = q.p.x * 8.6;
    const gy = -26.4 + q.p.y * 8.6 * 0.5;
    spot(ctx, gx, gy, 4.4, PAL.metalDark);
    spot(ctx, gx, gy, 3.2, PAL.metal);
    spot(ctx, -gx, -26.4 - q.p.y * 8.6 * 0.5, 4, shade(shell, -0.2));

    // ближняя рука + орудие на плече
    const drawGun = function () {
      unitGun(ctx, q, 8.6, 3.4, 15, 3.8, PAL.metalDark, PAL.gold,
        'rgba(255,207,74,.95)', -20);
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 4.4, y: -33.4, col: PAL.metalLight, visor: PAL.amber, forward: 0.2,
      antenna: PAL.metalDark
    });
    // антенна
    uBar(ctx, 5, -34, 7.5, -39, 1, PAL.metalLight);
    spot(ctx, 7.5, -39.4, 1.1, q.tier >= 2 ? PAL.cold : PAL.amber);

    if (q.fy >= -0.2) drawGun();

    // гидравлика и золотые накладки на высоких уровнях
    if (q.tier >= 2) {
      uBar(ctx, -8, -19, -6, -10, 1.4, PAL.metalDark);
      uBar(ctx, 8, -19, 6, -10, 1.4, PAL.metalDark);
      spot(ctx, gx, gy, 1.2, q.tier >= 3 ? PAL.gold : PAL.cold);
    }
    if (q.tier >= 3) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(8, -12);
      ctx.stroke();
    }
  }

  /* --- мародёр: низкий, горбатый, клешня и мешок с добычей --- */
  function artGoblin(ctx, q, color) {
    const body = mix(PAL.metalDark, color, 0.45);
    const dark = shade(body, -0.28);
    unitLegs(ctx, q, { col: dark, boot: PAL.metalDark, spread: 2.2, w: 3.0, hip: -5.2, stride: 3.2 });

    // мешок с добычей на спине
    if (q.fy < 0.6) {
      spot(ctx, -3.6 - q.f.x * 2, -9.2, 4.2, PAL.metalDark);
      spot(ctx, -3.8 - q.f.x * 2, -9.6, 3.2, mix(PAL.amber, PAL.metal, 0.45));
      spot(ctx, -4.8 - q.f.x * 2, -10.4, 0.8, PAL.gold);
      spot(ctx, -2.4 - q.f.x * 2, -8.6, 0.7, PAL.gold);
    }

    unitTorso(ctx, q, {
      col: body, top: -12.8, bot: -5, w: 8.2, shoulder: 8.8,
      panel: PAL.metal, belt: PAL.metalDark
    });

    // голова выдвинута вперёд
    unitHead(ctx, q, {
      r: 3.4, y: -15.4, col: mix(PAL.metal, color, 0.25), visor: PAL.amber,
      forward: 1.6, antenna: PAL.metalDark
    });

    // клешня-манипулятор
    const reach = q.atk ? 3.2 : 0;
    const gx = 4.6 + q.f.x * (4 + reach);
    const gy = -8.4 + q.f.y * (4 + reach);
    uBar(ctx, 3, -9.4, gx, gy, 1.6, PAL.metalLight);
    ctx.strokeStyle = PAL.amber;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + q.f.x * 3 - q.p.x * 1.8, gy + q.f.y * 3 - q.p.y * 1.8);
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + q.f.x * 3 + q.p.x * 1.8, gy + q.f.y * 3 + q.p.y * 1.8);
    ctx.stroke();
    if (q.atk) spot(ctx, gx + q.f.x * 3, gy + q.f.y * 3, 1, PAL.gold);

    if (q.tier >= 2) {
      spot(ctx, -2.8, -9.6, 0.9, q.tier >= 3 ? PAL.gold : PAL.cyan);
      spot(ctx, 2.8, -9.6, 0.9, q.tier >= 3 ? PAL.gold : PAL.cyan);
    }
  }

  /* --- подрывник: коренастый, бур над головой, заряд на поясе --- */
  function artGnome(ctx, q, color) {
    const suit = mix(PAL.metal, color, 0.4);
    const dark = shade(suit, -0.3);
    unitLegs(ctx, q, { col: dark, boot: PAL.metalDark, spread: 3, w: 3.9, hip: -6.2, stride: 3.2 });

    unitTorso(ctx, q, {
      col: suit, top: -14.4, bot: -6, w: 11.4, shoulder: 11.8,
      panel: PAL.metalDark, belt: PAL.metalDark
    });

    // заряд за спиной
    uBox(ctx, -7.4 - q.f.x * 1.4, -15.5, 3.2, 6.4, 1, PAL.dark);
    if (q.fy < 0.55) {
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(-7 - q.f.x * 1.4, -14.8, 2.4, 1.4);
      spot(ctx, -5.8 - q.f.x * 1.4, -16.2, 1.1, PAL.cyan);
    }

    // бур: широкий конус над головой, в атаке наклоняется вперёд
    const swing = q.atk ? 0.55 : 0;
    ctx.save();
    ctx.translate(q.f.x * 1.2, -15);
    ctx.rotate(0.35 + swing);
    ctx.fillStyle = PAL.metalLight;
    ctx.fillRect(-1.8, -6, 3.6, 6);
    poly(ctx, [
      { x: -4.6, y: -6 }, { x: 4.6, y: -6 }, { x: 0, y: -18.5 }
    ], PAL.metalLight);
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const yy = -6 - i * 3.3;
      ctx.moveTo(-3.6 + i * 0.8, yy);
      ctx.lineTo(3.6 - i * 0.8, yy - 1.2);
    }
    ctx.stroke();
    spot(ctx, 0, -19, 1.1, q.atk ? PAL.gold : PAL.cyan);
    ctx.restore();

    // шлем с лампой
    unitHead(ctx, q, {
      r: 3.8, y: -18.9, col: PAL.panel, visor: PAL.glass, antenna: PAL.metalDark
    });
    if (q.tier >= 2) {
      ctx.fillStyle = q.tier >= 3 ? PAL.gold : PAL.amber;
      ctx.fillRect(-1.2, -21.4, 2.4, 1.3);
    }
  }

  /* --- дрон: корпус с носом по курсу, винты и крен на повороте --- */
  function artDrone(ctx, q, color) {
    const hull = mix(PAL.metal, color, 0.32);
    const bank = q.fx * 0.16;       // крен по направлению движения
    const ang = Math.atan2(q.f.y, q.f.x);
    const cy = -30;

    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(bank);

    // нос и хвост — направление читается сразу
    const nx = q.f.x * 16;
    const ny = q.f.y * 16;
    const tx = -q.f.x * 14;
    const ty = -q.f.y * 14;

    // хвостовое оперение
    poly(ctx, [
      { x: tx - q.p.x * 1.2, y: ty - q.p.y * 1.2 },
      { x: tx - q.p.x * 8, y: ty - q.p.y * 8 - 2 },
      { x: tx + q.f.x * 5 - q.p.x * 1.5, y: ty + q.f.y * 5 - q.p.y * 1.5 }
    ], PAL.metalDark);
    poly(ctx, [
      { x: tx - q.p.x * 1.2, y: ty - q.p.y * 1.2 },
      { x: tx + q.p.x * 8, y: ty + q.p.y * 8 - 2 },
      { x: tx + q.f.x * 5 + q.p.x * 1.5, y: ty + q.f.y * 5 + q.p.y * 1.5 }
    ], shade(hull, -0.18));

    // несущие балки винтов
    const arms = [
      { a: 7, b: 11 }, { a: 7, b: -11 },
      { a: -6, b: 10 }, { a: -6, b: -10 }
    ];
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 2.2;
    for (let i = 0; i < arms.length; i++) {
      const ax = q.f.x * arms[i].a + q.p.x * arms[i].b;
      const ay = q.f.y * arms[i].a + q.p.y * arms[i].b;
      ctx.beginPath();
      ctx.moveTo(q.f.x * 2, q.f.y * 2);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }

    // корпус
    ctx.fillStyle = shade(hull, -0.22);
    ctx.beginPath();
    ctx.ellipse(0, 2.2, 14, 7, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.6, 6.4, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(q.f.x * 1.2, -1.4, 8, 3.2, ang, 0, Math.PI * 2);
    ctx.fill();

    // носовой обтекатель и кабина
    ctx.fillStyle = shade(color, 0.08);
    ctx.beginPath();
    ctx.ellipse(nx, ny, 4.2, 5.2, ang, 0, Math.PI * 2);
    ctx.fill();
    const cxx = q.f.x * 8;
    const cyy = q.f.y * 8 - 1;
    spot(ctx, cxx, cyy, 3.1, PAL.metalDark);
    spot(ctx, cxx, cyy, 2.2, PAL.glass);
    spot(ctx, cxx - 0.8, cyy - 0.8, 0.9, 'rgba(255,255,255,.7)');

    // винты: два положения лопастей дают два кадра вращения
    const spin = q.frame === 2 ? Math.PI / 2 : 0;
    for (let i = 0; i < arms.length; i++) {
      const ax = q.f.x * arms[i].a + q.p.x * arms[i].b;
      const ay = q.f.y * arms[i].a + q.p.y * arms[i].b;
      spot(ctx, ax, ay, 3.4, PAL.metalDark);
      spot(ctx, ax, ay, 2.2, PAL.metalLight);
      const rr = 6.8;
      ctx.strokeStyle = 'rgba(154,167,173,.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(spin + i) * rr, ay - Math.sin(spin + i) * rr * 0.5);
      ctx.lineTo(ax + Math.cos(spin + i) * rr, ay + Math.sin(spin + i) * rr * 0.5);
      ctx.stroke();
      spot(ctx, ax, ay, 1, PAL.cyan);
    }

    // бомболюк и бомба
    ctx.fillStyle = PAL.dark;
    ctx.beginPath();
    ctx.ellipse(q.f.x * 1.5, q.f.y * 1.5 + 4.2, 3.6, 1.8, ang, 0, Math.PI * 2);
    ctx.fill();
    let bombOff = 0;
    if (q.atk) bombOff = 7;
    spot(ctx, q.f.x * 1.5, 9 + bombOff, 2.6, PAL.dark);
    spot(ctx, q.f.x * 1.5 - 0.6, 8.2 + bombOff, 0.8, 'rgba(255,250,235,.4)');
    if (q.atk) uFlash(ctx, q.f.x * 1.5, 11 + bombOff, 3, 'rgba(255,207,74,.8)');

    ctx.restore();

    // габаритные огни (вне крена)
    spot(ctx, q.f.x * 16, cy + q.f.y * 16 - 3, 1.2, q.tier >= 3 ? PAL.gold : PAL.cold);
    if (q.tier >= 2) {
      ctx.strokeStyle = q.tier >= 3 ? PAL.gold : PAL.cold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, cy, 15, 6, ang, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  // Кисть художника: рисует юнита в локальных координатах (ступни в 0,0).
  function paintUnitArt(ctx, type, dir, frame, lvl, u) {
    const q = unitPose(type, dir, frame, lvl, u);
    const def = (u && u.def) || CC.TROOPS[type] || {};
    const color = def.color || PAL.wood;

    if (type === 'giant') artGiant(ctx, q, color);
    else if (type === 'archer') artArcher(ctx, q, color);
    else if (type === 'goblin') artGoblin(ctx, q, color);
    else if (type === 'gnome') artGnome(ctx, q, color);
    else if (type === 'airship') artDrone(ctx, q, color);
    else artBarb(ctx, q, color);
  }

  // Спрайт: один раз печём выбранный кадр/направление и кладём в кэш.
  function unitSprite(type, dir, frame, lvl) {
    const key = type + '|' + lvl + '|' + dir + '|' + frame;
    const hit = unitSpriteCache.get(key);
    if (hit) { unitBakes.hits++; return hit; }

    const w = U_ARTW * U_BAKE;
    const h = U_ARTH * U_BAKE;
    let sp = null;
    try {
      const c = makeCanvas(w, h);
      const cx = c.getContext('2d');
      cx.setTransform(U_BAKE, 0, 0, U_BAKE, U_AX * U_BAKE, U_AY * U_BAKE);
      paintUnitArt(cx, type, dir, frame, lvl, null);
      sp = { canvas: c, ax: U_AX, ay: U_AY, w: U_ARTW, h: U_ARTH };
    } catch (e) {
      sp = null;
    }

    // ограничиваем кэш: старые кадры не нужны после смены боя
    if (unitSpriteCache.size >= 320) {
      const first = unitSpriteCache.keys().next().value;
      if (first !== undefined) unitSpriteCache.delete(first);
    }
    unitSpriteCache.set(key, sp);
    unitBakes.count++;
    return sp;
  }

  function drawUnit(ctx, u) {
    const p = P(u.x, u.y);
    const spec = UNIT_SPEC[u.type] || { h: 20, w: 1 };
    const def = u.def || CC.TROOPS[u.type] || {};
    const flying = def.fly === true;
    const lift = flying ? 22 : 0;

    const m = unitMotion(u);
    const dir = m.dir;
    const frame = m.frame;
    const lvl = unitLevel(u);

    // лёгкий кивок корпуса на шаге: не «прыжок», а перенос веса
    const bob = (!flying && m.walking)
      ? Math.sin(m.phase * Math.PI) * 0.45
      : Math.sin(t * 1.7 + ((u.id || 0) % 7)) * 0.18;

    // удар: короткий замах и выпад, без телепорта позиции
    const dirv = faceDir(u);
    let lunge = 0;
    if (u.atk > 0) {
      const q = 1 - Math.min(1, u.atk / 0.18);
      lunge = q < 0.4 ? -1.4 * (q / 0.4) : 2.1 * Math.sin((q - 0.4) / 0.6 * Math.PI);
    }

    // тень: у летающих — отдельный мягкий эллипс на земле
    if (flying) {
      const sway = Math.sin(t * 1.25 + ((u.id || 0) * 1.7) % 6.283) * 1.4;
      ctx.fillStyle = 'rgba(34,52,24,.15)';
      ctx.beginPath();
      ctx.ellipse(p.x + sway, p.y + 1, 13 * spec.w, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(34,52,24,.12)';
      ctx.beginPath();
      ctx.ellipse(p.x + sway, p.y + 1, 8 * spec.w, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(34,52,24,.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + dirv.x * lunge * 0.4, p.y,
        7.5 * spec.w * (spec.h / 24), 3 * (spec.h / 24), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const sx = p.x + dirv.x * lunge;
    const sy = p.y - bob - lift + dirv.y * lunge;

    const sp = spritesOn && tilePx <= 120 ? unitSprite(u.type, dir, frame, lvl) : null;
    if (sp) {
      ctx.drawImage(sp.canvas, sx - sp.ax, sy - sp.ay, sp.w, sp.h);
    } else {
      // векторный запасной путь: те же формы, без канвы (крупный зум и tools)
      ctx.save();
      ctx.translate(sx, sy);
      paintUnitArt(ctx, u.type, dir, frame, lvl, u);
      ctx.restore();
    }

    // полоска здоровья — тонкая, только у раненых
    if (typeof u.maxHp === 'number' && u.hp < u.maxHp && u.maxHp > 0) {
      const ratio = Math.max(0, u.hp / u.maxHp);
      const w = (u.type === 'giant' || flying ? 18 : 13);
      const y = p.y - bob - lift - spec.h - 4;

      ctx.fillStyle = 'rgba(30,26,20,.45)';
      ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 3);
      ctx.fillStyle = hpColor(ratio);
      ctx.fillRect(p.x - w / 2, y, w * ratio, 1.6);
    }
  }

  /* ---------- прогулка по деревне ---------- */

  // Небольшие отряды бродят вокруг казарм. Состояние живёт здесь, в рендере:
  // позиция, цель, пауза, фаза. Обновляется по кадру, пересобирается по сигнатуре.
  const walkers = { list: [], sig: '', bounds: null, timer: 0, ready: false };

  function walkerArmy() {
    const pool = [];
    try {
      const st = CC.Game && CC.Game.state;
      const army = st && st.army;
      if (!army) return pool;

      const order = CC.ARMY_ORDER || ['barb', 'archer', 'giant', 'goblin'];
      const counts = [];
      let total = 0;

      for (let i = 0; i < order.length; i++) {
        const n = Math.max(0, Math.floor(Number(army[order[i]]) || 0));
        counts.push(n);
        total += n;
      }

      // до девяти фигурок, типы вперемешку: сначала по одной каждого вида
      const limit = Math.min(9, total);
      for (let round = 0; pool.length < limit; round++) {
        let added = false;
        for (let i = 0; i < order.length && pool.length < limit; i++) {
          if (counts[i] <= round) continue;
          pool.push(order[i]);
          added = true;
        }
        if (!added) break;
      }
    } catch (e) {
      pool.length = 0;
    }
    return pool;
  }

  function walkerBarracks() {
    const out = [];
    try {
      const list = CC.Base.list();
      for (let i = 0; i < list.length; i++) {
        if (list[i].type !== 'barracks') continue;
        const s = CC.Base.size('barracks');
        out.push({
          x: list[i].x + (s.w || 2) / 2,
          y: list[i].y + (s.h || 2) / 2,
          left: list[i].x,
          top: list[i].y,
          w: s.w || 2,
          h: s.h || 2
        });
      }
    } catch (e) {
      out.length = 0;
    }
    return out;
  }

  function walkerBounds() {
    let x0 = G;
    let y0 = G;
    let x1 = 0;
    let y1 = 0;
    try {
      const list = CC.Base.list();
      for (let i = 0; i < list.length; i++) {
        const s = CC.Base.size(list[i].type);
        if (list[i].x < x0) x0 = list[i].x;
        if (list[i].y < y0) y0 = list[i].y;
        if (list[i].x + s.w > x1) x1 = list[i].x + s.w;
        if (list[i].y + s.h > y1) y1 = list[i].y + s.h;
      }
    } catch (e) {
      x0 = 0; y0 = 0; x1 = G; y1 = G;
    }
    if (!(x1 > x0)) return { x0: 0.5, y0: 0.5, x1: G - 0.5, y1: G - 0.5 };
    // без запаса: гуляющие не должны выходить за пятна построек,
    // иначе проверка «вне базы» ловит их на краю (и это случайный красный)
    return {
      x0: Math.max(0.35, x0),
      y0: Math.max(0.35, y0),
      x1: Math.min(G - 0.35, x1),
      y1: Math.min(G - 0.35, y1)
    };
  }

  function walkerFree(x, y) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gy < 0 || gx >= G || gy >= G) return false;
    try {
      if (CC.Base.itemAt(gx, gy)) return false;
    } catch (e) {
      /* нет данных базы — не мешаем гулять */
    }
    return true;
  }

  // Детерминированный запасной вариант: ближайшая свободная клетка вокруг точки.
  // Нужен, когда случайные попытки не нашли место (плотная база): иначе фигурка
  // остаётся стоять в центре казармы, то есть внутри постройки.
  function walkerFreeSpot(cx, cy, others) {
    const b = walkers.bounds || { x0: 0.5, y0: 0.5, x1: G - 0.5, y1: G - 0.5 };
    const ox = Math.floor(cx);
    const oy = Math.floor(cy);

    for (let pass = 0; pass < 2; pass++) {
      for (let d = 0; d <= 6; d++) {
        for (let dy = -d; dy <= d; dy++) {
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            const x = ox + dx + 0.5;
            const y = oy + dy + 0.5;
            if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
            if (!walkerFree(x, y)) continue;

            if (!pass && others) {
              let crowd = false;
              for (let i = 0; i < others.length; i++) {
                if (Math.hypot(others[i].x - x, others[i].y - y) < 0.85) {
                  crowd = true;
                  break;
                }
              }
              if (crowd) continue;
            }

            return { x: x, y: y };
          }
        }
      }
    }

    return null;
  }

  // Свободная точка рядом с казармой: не на постройке, не на стене, не в куче.
  function walkerTarget(w, others) {
    const b = walkers.bounds || { x0: 0.5, y0: 0.5, x1: G - 0.5, y1: G - 0.5 };

    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.9 + Math.random() * 1.7;      // радиус 2-3 тайла от казармы
      const x = Math.min(b.x1, Math.max(b.x0, w.bx + Math.cos(a) * r));
      const y = Math.min(b.y1, Math.max(b.y0, w.by + Math.sin(a) * r));

      if (!walkerFree(x, y)) continue;

      let crowd = false;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o === w) continue;
        if (Math.hypot(o.x - x, o.y - y) < 0.85) { crowd = true; break; }
      }
      if (crowd) continue;

      return { x: x, y: y };
    }

    // случайные попытки не нашли места — берём ближайшую свободную клетку
    return walkerFreeSpot(w.bx, w.by, others);
  }

  function walkerSync() {
    const barracks = walkerBarracks();
    const army = walkerArmy();

    if (!barracks.length || !army.length) {
      walkers.list.length = 0;
      walkers.sig = '';
      walkers.ready = true;
      return;
    }

    // сигнатура: состав армии и вся раскладка (мебель могла переехать)
    let sig = army.join(',') + '|';
    try {
      const all = CC.Base.list();
      for (let i = 0; i < all.length; i++) {
        sig += all[i].type.charAt(0) + all[i].x + '.' + all[i].y + ';';
      }
    } catch (e) {
      /* нет данных — хватит и казарм */
    }
    for (let i = 0; i < barracks.length; i++) {
      sig += barracks[i].left + '.' + barracks[i].top + ';';
    }
    if (walkers.ready && sig === walkers.sig) return;
    walkers.sig = sig;
    walkers.bounds = walkerBounds();

    // перемешиваем, чтобы типы не шли строгим строем
    for (let i = army.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = army[i];
      army[i] = army[j];
      army[j] = tmp;
    }

    const total = Math.min(9, army.length);
    const next = [];

    for (let i = 0; i < total; i++) {
      const type = army[i];
      const def = CC.TROOPS[type] || {};
      const base = barracks[i % barracks.length];

      // стартовая точка — сразу свободная клетка, а не центр казармы
      const spawn = walkerFreeSpot(base.x, base.y, next);
      if (!spawn) continue;

      const w = {
        id: 50000 + i,
        type: type,
        def: def,
        hp: 1,
        maxHp: 1,
        atk: 0,
        bx: base.x,
        by: base.y,
        x: spawn.x,
        y: spawn.y,
        tx: spawn.x,
        ty: spawn.y,
        pause: Math.random() * 2.2,
        speed: 0.16 + (def.speed || 2) * 0.07,
        path: [],
        target: null
      };

      const spot = walkerTarget(w, next);
      if (spot) {
        w.x = spot.x;
        w.y = spot.y;
        w.tx = spot.x;
        w.ty = spot.y;
      }
      next.push(w);
    }

    walkers.list = next;
    walkers.ready = true;
  }

  function updateWalkers(dt) {
    try {
      walkers.timer -= dt;
      if (walkers.timer <= 0) {
        walkers.timer = 0.5;
        walkerSync();
      }

      const list = walkers.list;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];

        if (w.pause > 0) {
          w.pause -= dt;
          w.path.length = 0;
          w.target = { x: w.tx, y: w.ty, w: 0, h: 0 };
          continue;
        }

        const dx = w.tx - w.x;
        const dy = w.ty - w.y;
        const d = Math.hypot(dx, dy);

        if (d < 0.09) {
          w.pause = 1.2 + Math.random() * 2.8;
          const spot = walkerTarget(w, list);
          if (spot) { w.tx = spot.x; w.ty = spot.y; }
          w.path.length = 0;
          continue;
        }

        const step = Math.min(d, w.speed * dt);
        const nx = w.x + (dx / d) * step;
        const ny = w.y + (dy / d) * step;

        // на чужую клетку не заходим: разворачиваемся и выбираем новую цель
        if (!walkerFree(nx, ny)) {
          w.pause = 0.5 + Math.random();
          const spot = walkerTarget(w, list);
          if (spot) { w.tx = spot.x; w.ty = spot.y; }
          w.path.length = 0;
          continue;
        }

        w.x = nx;
        w.y = ny;
        if (!w.path.length) w.path.push(1);
        w.target = { x: w.tx, y: w.ty, w: 0, h: 0 };
      }
    } catch (e) {
      walkers.list.length = 0;
      walkers.ready = false;
    }
  }

  /* ---------- эффекты ---------- */

  // Подсветка высадки: точки в центрах всех свободных клеток и чуть более
  // заметная рамка поля. Геометрия собирается один раз на бой (Path2D):
  // внутри кадра остаются один fill и один stroke, без обхода сетки.
  // Кэш пересобирается, только если сменился бой/массив или умерла постройка.
  const deployCache = {
    dep: null, occ: null, ver: -1, dead: -1, count: -1, tile: -1,
    dots: null, cells: null, border: null
  };

  // Полуразмер ромбика в клетках: ~1.4 px на экране на дальнем зуме и
  // ~2.4 px на ближнем. Пересчёт только при смене шага тайла (кэш).
  function deployDotR(tile) {
    const t = tile > 0 ? tile : TW;
    return Math.min(0.08, Math.max(0.014, (1.2 + t * 0.012) / t));
  }

  function deployDead(S) {
    let dead = 0;
    const list = S.buildings || [];
    for (let i = 0; i < list.length; i++) if (list[i].dead) dead++;
    return dead;
  }

  function deployGeometry(S, dep, occ, ver, dead) {
    const tileKey = Math.max(1, Math.round((tilePx || TW) / 8));
    if (deployCache.dep === dep && deployCache.occ === occ &&
        deployCache.ver === ver && deployCache.dead === dead &&
        deployCache.tile === tileKey &&
        deployCache.count === (S.buildings ? S.buildings.length : 0)) {
      return deployCache;
    }

    const hasPath = typeof Path2D !== 'undefined';
    const dots = hasPath ? new Path2D() : null;
    const cells = [];
    const border = hasPath ? new Path2D() : null;
    // Полуразмер ромбика в клетках — от текущего шага тайла.
    const r = deployDotR(tilePx);

    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        // Постройка или стена сейчас — клетка занята, не подсвечиваем.
        if (occ && occ[i] >= 0) continue;
        // deployable — маска свободной высадки; клетку, освободившуюся
        // после сноса, добираем по живой сетке occ.
        if (!dep[i] && !(occ && occ[i] < 0)) continue;

        const cx = x + 0.5;
        const cy = y + 0.5;
        if (dots) {
          dots.moveTo(cx, cy - r);
          dots.lineTo(cx + r, cy);
          dots.lineTo(cx, cy + r);
          dots.lineTo(cx - r, cy);
          dots.closePath();
        } else {
          cells.push(cx, cy);
        }
      }
    }

    if (border) border.rect(0, 0, G, G);

    deployCache.dep = dep;
    deployCache.occ = occ;
    deployCache.ver = ver;
    deployCache.dead = dead;
    deployCache.tile = tileKey;
    deployCache.count = S.buildings ? S.buildings.length : 0;
    deployCache.dots = dots;
    deployCache.cells = cells;
    deployCache.border = border;
    return deployCache;
  }

  function drawDeployZone(ctx, S) {
    if (!S || S.over) return;
    if (CC.App && CC.App.mode !== 'battle') return;
    if (!S.selected || !S.army || !S.army[S.selected]) return;

    const dep = S.deployable;
    if (!dep) return;

    // Версия массива — если код высадки её выставит; иначе хватает ссылки
    // и числа погибших построек.
    const ver = typeof S.deployVersion === 'number' ? S.deployVersion : -1;
    const dead = deployDead(S);
    const geo = deployGeometry(S, dep, S.occ, ver, dead);
    const scale = tilePx > 0 ? tilePx / TW : 1;
    const r = deployDotR(tilePx);

    // Свободные клетки: полупрозрачные ромбики в центрах, alpha 0.10.
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#d8fff4';
    if (geo.dots) {
      ctx.fill(geo.dots);
    } else if (geo.cells.length) {
      ctx.beginPath();
      for (let i = 0; i < geo.cells.length; i += 2) {
        const cx = geo.cells[i];
        const cy = geo.cells[i + 1];
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
      }
      ctx.fill();
    }

    // Рамка поля заметнее точек: 1.4 px на экране при зуме 44–96 px.
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = '#d8fff4';
    ctx.lineWidth = 1.4 / scale;
    if (geo.border) {
      ctx.stroke(geo.border);
    } else {
      ctx.beginPath();
      ctx.rect(0.5 / scale, 0.5 / scale, G - 1 / scale, G - 1 / scale);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  /* ---------- частицы (пул) ---------- */

  const P_MAX = 200;
  const pX = new Float32Array(P_MAX);
  const pY = new Float32Array(P_MAX);
  const pVX = new Float32Array(P_MAX);
  const pVY = new Float32Array(P_MAX);
  const pLife = new Float32Array(P_MAX);
  const pMax = new Float32Array(P_MAX);
  const pSize = new Float32Array(P_MAX);
  const pCol = new Uint8Array(P_MAX);
  const pKind = new Uint8Array(P_MAX);
  let pNext = 0;
  let pBudget = 0;

  const PCOL = [
    'rgb(154,146,127)', 'rgb(226,213,180)', 'rgb(224,176,69)',
    'rgb(122,114,100)', 'rgb(255,250,235)',
    'rgb(184,74,60)', 'rgb(138,106,69)', 'rgb(155,111,208)'
  ];

  function spawn(x, y, vx, vy, life, size, col, kind) {
    if (pBudget <= 0) return;
    pBudget--;

    const i = pNext;
    pNext = (pNext + 1) % P_MAX;

    pX[i] = x; pY[i] = y;
    pVX[i] = vx; pVY[i] = vy;
    pLife[i] = life; pMax[i] = life;
    pSize[i] = size; pCol[i] = col; pKind[i] = kind;
  }

  function burst(x, y, n, col, power, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.9);
      spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - power * 0.35,
        0.18 + Math.random() * 0.14, 1.2 + Math.random() * 1.4, col, kind || 0);
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < P_MAX; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pLife[i] = 0; continue; }
      pX[i] += pVX[i] * dt;
      pY[i] += pVY[i] * dt;
      pVY[i] += 240 * dt;
      pVX[i] *= (1 - 2.4 * dt);
    }
  }

  function drawParticles(ctx) {
    for (let i = 0; i < P_MAX; i++) {
      const life = pLife[i];
      if (life <= 0) continue;

      // издалека мелкие искры только шумят
      if (lod === 0 && pSize[i] < 2 && pKind[i] !== 3) continue;

      const a = life / pMax[i];
      ctx.globalAlpha = Math.min(1, a * 1.2);
      ctx.fillStyle = PCOL[pCol[i]];

      if (pKind[i] === 1) {
        ctx.fillRect(pX[i] - 0.7, pY[i] - 0.7, 1.4, 1.4);
      } else if (pKind[i] === 2) {
        // обломок: маленький квадратик
        const s = pSize[i];
        ctx.fillRect(pX[i] - s / 2, pY[i] - s / 2, s, s);
      } else if (pKind[i] === 3) {
        // мягкая пыль: полупрозрачное расширяющееся пятно
        ctx.globalAlpha = Math.min(1, a * 0.32);
        ctx.beginPath();
        ctx.arc(pX[i], pY[i], pSize[i] * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pX[i], pY[i], pSize[i] * (0.45 + a * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- оседающие тела ---------- */

  const C_MAX = 18;
  const corpses = [];
  for (let i = 0; i < C_MAX; i++) {
    corpses.push({ on: false, x: 0, y: 0, color: PAL.wood, w: 1, t: 0, dur: 0.55, type: '', fly: false });
  }
  let cNext = 0;

  function addCorpse(u) {
    const but = corpses[cNext];
    cNext = (cNext + 1) % C_MAX;

    const def = u.def || CC.TROOPS[u.type] || {};
    but.on = true;
    but.x = u.x;
    but.y = u.y;
    but.color = def.color || PAL.wood;
    but.w = u.type === 'giant' ? 1.6 : 1;
    but.type = u.type || '';
    but.fly = def.fly === true;
    but.t = 0;
    but.dur = but.fly ? 0.75 : 0.55;

    const p = P(u.x, u.y);
    if (but.fly) {
      // оболочка рвётся: обрывки ткани, гондола и пыль
      burst(p.x, p.y - 24, 7, 5, 40);
      burst(p.x, p.y - 12, 4, 1, 28);
    } else if (u.type === 'gnome') {
      // облачко пыли и каменная крошка
      burst(p.x, p.y - 4, 6, 1, 24);
      burst(p.x, p.y - 3, 3, 0, 26);
    } else {
      burst(p.x, p.y - 4, 4, 1, 26);
    }
  }

  function updateCorpses(dt) {
    for (let i = 0; i < C_MAX; i++) {
      const c = corpses[i];
      if (!c.on) continue;
      c.t += dt;
      if (c.t >= c.dur) c.on = false;
    }
  }

  function drawCorpses(ctx) {
    for (let i = 0; i < C_MAX; i++) {
      const c = corpses[i];
      if (!c.on) continue;

      const k = Math.min(1, c.t / c.dur);
      const p = P(c.x, c.y);

      // оседающая тень
      ctx.globalAlpha = 0.24 * (1 - k);
      ctx.fillStyle = 'rgb(60,28,14)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (7 + k * 4) * c.w, 3 + k * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (c.fly) {
        // сдувающийся дирижабль: оболочка проседает, гондола падает отдельно
        const fall = 1 - k;
        const ey = p.y - 22 * fall - 2;
        const ex = 1 + k * 0.35;
        const eyr = 8.5 * (1 - k * 0.6);

        ctx.globalAlpha = 0.7 * (1 - k * 0.6);
        ctx.fillStyle = shade(c.color, -0.1 + k * 0.12);
        ctx.beginPath();
        ctx.ellipse(p.x + k * 3, ey, 20 * ex, eyr, k * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // рваная дыра в оболочке
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = PAL.dark;
        poly(ctx, [
          { x: p.x + 6, y: ey + 1 },
          { x: p.x + 14, y: ey - 3 },
          { x: p.x + 9, y: ey + 6 }
        ], PAL.dark);

        // оторванный плавник
        ctx.fillStyle = shade(c.color, -0.25);
        poly(ctx, [
          { x: p.x + 15, y: ey - 2 },
          { x: p.x + 24, y: ey - 10 },
          { x: p.x + 27, y: ey - 4 }
        ], shade(c.color, -0.25));

        // гондола падает отдельно, быстрее оболочки
        ctx.globalAlpha = 0.75 * (1 - k);
        ctx.fillStyle = PAL.wood;
        ctx.fillRect(p.x - 3 + k * 5, p.y - 12 * fall * fall - 3, 9, 5);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(p.x - 1 + k * 5, p.y - 12 * fall * fall - 2, 1.8, 1.6);

        // обрывок ткани на земле
        ctx.fillStyle = shade(c.color, 0.12);
        poly(ctx, [
          { x: p.x - 16, y: p.y - 2 },
          { x: p.x - 6, y: p.y - 4 },
          { x: p.x - 10, y: p.y + 2 }
        ], shade(c.color, 0.12));
      } else {
        // сплющенное тело
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - (1 - k) * 5, (5.5 + k * 2) * c.w, 4.5 * (1 - k) + 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- отслеживание боя ---------- */

  /* ---------- тряска, вспышки, обломки ---------- */

  const shake = { t: 0, dur: 0, amp: 0 };
  const flashList = [];
  const final = { t: -1, win: false };

  // бюджет тряски: новая тряска не складывается с текущей, а обновляет её
  function addShake(amp) {
    const left = shake.dur > 0 ? shake.amp * Math.pow(1 - shake.t / shake.dur, 2) : 0;
    shake.amp = Math.min(6, Math.max(left, amp));
    shake.dur = 0.18;
    shake.t = 0;
  }

  function shakeOffset() {
    if (!shake.dur || shake.t >= shake.dur) return null;
    const k = 1 - shake.t / shake.dur;
    const a = shake.amp * k * k;
    return {
      x: Math.sin(shake.t * 94) * a,
      y: Math.cos(shake.t * 71) * a * 0.75
    };
  }

  function hitFlash(id) {
    if (typeof id !== 'number' && typeof id !== 'string') return;
    for (let i = 0; i < flashList.length; i++) {
      if (flashList[i].id === id) { flashList[i].t = 0.12; return; }
    }
    if (flashList.length > 24) flashList.shift();
    flashList.push({ id: id, t: 0.12 });
  }

  function flashOf(id) {
    for (let i = 0; i < flashList.length; i++) {
      if (flashList[i].id === id) return flashList[i].t / 0.12;
    }
    return 0;
  }

  const collapses = [];
  for (let i = 0; i < 10; i++) {
    collapses.push({ on: false, x: 0, y: 0, w: 1, h: 1, t: 0, dur: 0.6 });
  }
  let colNext = 0;

  // цвет обломков по типу постройки (индексы в PCOL)
  function debrisColor(type) {
    if (type === 'townhall' || type === 'barracks') return 5;
    if (type === 'goldmine' || type === 'storage') return 6;
    if (type === 'elixir') return 7;
    return 0;
  }

  function onDestroyed(b) {
    const cx = b.x + (b.w || 1) / 2;
    const cy = b.y + (b.h || 1) / 2;
    const p = P(cx, cy);
    const big = (b.w || 1) * (b.h || 1);

    addShake(4 + Math.min(2, big * 0.6));

    // разрушение не должно упираться в общий бюджет частиц
    pBudget = Math.max(pBudget, 34);

    // оседающая тень на месте здания
    const c = collapses[colNext];
    colNext = (colNext + 1) % collapses.length;
    c.on = true;
    c.x = b.x;
    c.y = b.y;
    c.w = b.w || 1;
    c.h = b.h || 1;
    c.t = 0;
    c.dur = 0.6;

    // пыль и обломки — тем крупнее, чем больше пятно постройки
    const col = debrisColor(b.type);
    const s = Math.min(2, 0.7 + big * 0.45);

    burst(p.x, p.y - 6, 8 + Math.round(big * 3), 3, 55 * s);
    burst(p.x, p.y - 10, 3 + Math.round(big * 2), 1, 42 * s);

    // медленное облако пыли (мягкое, полупрозрачное)
    for (let i = 0; i < 4 + Math.round(big); i++) {
      spawn(p.x + (Math.random() - 0.5) * 18 * s, p.y - 6 - Math.random() * 10,
        (Math.random() - 0.5) * 22, -6 - Math.random() * 14,
        0.55 + Math.random() * 0.25, (4 + Math.random() * 2.5) * Math.min(1.35, s), 1, 3);
    }

    for (let i = 0; i < 6 + Math.round(big * 3); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 45 + Math.random() * 80;
      spawn(p.x, p.y - 8, Math.cos(a) * sp, Math.sin(a) * sp - 55,
        0.32 + Math.random() * 0.22, (2.4 + Math.random() * 2) * Math.min(1.5, s), col, 2);
    }
  }

  function drawCollapses(ctx) {
    for (let i = 0; i < collapses.length; i++) {
      const c = collapses[i];
      if (!c.on) continue;

      const k = Math.min(1, c.t / c.dur);
      const a = 1 - k;
      const A = P(c.x, c.y);
      const B = P(c.x + c.w, c.y);
      const C = P(c.x + c.w, c.y + c.h);
      const D = P(c.x, c.y + c.h);
      const cx = (A.x + B.x + C.x + D.x) / 4;
      const cy = (A.y + B.y + C.y + D.y) / 4;
      const sc = 1 - k * 0.12;

      ctx.globalAlpha = 0.3 * a;
      ctx.fillStyle = 'rgb(60,28,14)';
      diamond(ctx,
        { x: cx + (A.x - cx) * sc, y: cy + (A.y - cy) * sc },
        { x: cx + (B.x - cx) * sc, y: cy + (B.y - cy) * sc },
        { x: cx + (C.x - cx) * sc, y: cy + (C.y - cy) * sc },
        { x: cx + (D.x - cx) * sc, y: cy + (D.y - cy) * sc });
      ctx.fill();

      // тёмное пятно внутри
      ctx.globalAlpha = 0.18 * a;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 12 * c.w * sc, 6 * c.h * sc, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // вспышка по граням цели
  function drawFlashFaces(ctx, x0, y0, x1, y1, h, k) {
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    ctx.fillStyle = 'rgba(255,250,235,' + (0.4 * k).toFixed(3) + ')';
    poly(ctx, [
      { x: D.x, y: D.y }, { x: C.x, y: C.y },
      { x: C.x, y: C.y - h }, { x: D.x, y: D.y - h }
    ], 'rgba(255,250,235,' + (0.4 * k).toFixed(3) + ')');

    poly(ctx, [
      { x: C.x, y: C.y }, { x: B.x, y: B.y },
      { x: B.x, y: B.y - h }, { x: C.x, y: C.y - h }
    ], 'rgba(255,250,235,' + (0.3 * k).toFixed(3) + ')');

    poly(ctx, [
      { x: A.x, y: A.y - h }, { x: B.x, y: B.y - h },
      { x: C.x, y: C.y - h }, { x: D.x, y: D.y - h }
    ], 'rgba(255,250,235,' + (0.24 * k).toFixed(3) + ')');
  }

  // финальная виньетка: тёплая вспышка при победе, затемнение по краям при поражении
  function drawFinal(ctx, view) {
    if (final.t < 0) return;

    if (final.win) {
      const k = Math.min(1, final.t / 0.55);
      if (k < 1) {
        ctx.fillStyle = 'rgba(255,246,214,' + (0.3 * (1 - k)).toFixed(3) + ')';
        ctx.fillRect(0, 0, view.w, view.h);
      }
    }

    const k = Math.min(1, final.t / 0.8);
    const inner = Math.min(view.w, view.h) * 0.2;
    const outer = Math.max(view.w, view.h) * 0.72;
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, inner, view.w / 2, view.h / 2, outer);
    const a = (final.win ? 0.18 : 0.42) * k;
    g.addColorStop(0, 'rgba(40,18,10,0)');
    g.addColorStop(1, 'rgba(40,18,10,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  const track = {
    state: null,
    list: [],
    alive: Object.create(null),
    atk: Object.create(null),
    dead: Object.create(null),
    budget: 0
  };

  function resetTrack(S) {
    track.state = S;
    track.list.length = 0;
    track.alive = Object.create(null);
    track.atk = Object.create(null);
    track.dead = Object.create(null);

    shake.dur = 0;
    shake.t = 0;
    shake.amp = 0;
    flashList.length = 0;
    final.t = -1;
    for (let i = 0; i < collapses.length; i++) collapses[i].on = false;
  }

  // ловим начало удара (для искр), гибель юнита и разрушение постройки
  function trackBattle(S, dt) {
    if (track.state !== S) resetTrack(S);

    // таймеры
    if (shake.dur > 0) shake.t = Math.min(shake.dur, shake.t + dt);
    for (let i = flashList.length - 1; i >= 0; i--) {
      flashList[i].t -= dt;
      if (flashList[i].t <= 0) flashList.splice(i, 1);
    }
    for (let i = 0; i < collapses.length; i++) {
      const c = collapses[i];
      if (!c.on) continue;
      c.t += dt;
      if (c.t >= c.dur) c.on = false;
    }

    const units = S.units || [];
    const alive = track.alive;

    // сбрасываем отметки прошлого кадра
    for (let i = 0; i < track.list.length; i++) alive[track.list[i].id] = 0;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || typeof u.x !== 'number') continue;
      alive[u.id] = 1;

      const prev = track.atk[u.id];
      if (typeof prev === 'number' && prev <= 0 && u.atk > 0) {
        // удар: пыль в точке контакта и вспышка граней цели
        const tgt = u.target;
        if (tgt && typeof tgt.x === 'number') {
          const cx = Math.max(tgt.x, Math.min(u.x, tgt.x + (tgt.w || 1)));
          const cy = Math.max(tgt.y, Math.min(u.y, tgt.y + (tgt.h || 1)));
          const hit = P(cx, cy);
          burst(hit.x, hit.y - 6, u.type === 'giant' ? 4 : 3, 0, 34);
          if (u.type === 'gnome' && tgt.type === 'wall') {
            // кирка выбивает каменную крошку и искру
            burst(hit.x, hit.y - 9, 3, 0, 46);
            if (Math.random() < 0.7) {
              spawn(hit.x + (Math.random() - 0.5) * 8, hit.y - 10,
                (Math.random() - 0.5) * 40, -22 - Math.random() * 26, 0.18, 1.1, 2, 1);
            }
          }
          if (Math.random() < 0.4) {
            spawn(hit.x, hit.y - 8, (Math.random() - 0.5) * 50, -30 - Math.random() * 30,
              0.2, 1.2, 2, 1);
          }
          hitFlash(tgt.id);
        }
      }
      track.atk[u.id] = u.atk > 0 ? u.atk : 0;
    }

    // кто пропал без взрыва — оседает
    let lost = 0;
    for (let i = 0; i < track.list.length; i++) {
      const e = track.list[i];
      if (alive[e.id]) continue;
      lost++;
      if (lost <= 3) addCorpse(e);
    }

    // разрушения построек: один раз на каждую
    const bs = S.buildings || [];
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || !b.dead || track.dead[b.id]) continue;
      track.dead[b.id] = 1;
      onDestroyed(b);
    }

    // финал боя
    if (S.over && final.t < 0) {
      final.t = 0;
      final.win = !!(S.result && S.result.win);
      if (final.win) addShake(4);
    } else if (!S.over && final.t >= 0) {
      final.t = -1;
    }
    if (final.t >= 0) final.t += dt;

    // запоминаем кадр
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u) continue;
      let e = track.list[i];
      if (!e) { e = {}; track.list[i] = e; }
      e.id = u.id;
      e.x = u.x;
      e.y = u.y;
      e.type = u.type;
      e.def = u.def;
    }
    track.list.length = units.length;

    void dt;
  }

  /* ---------- снаряды ---------- */

  // ядра мортиры, которые уже дали пыль при падении
  const landedShots = new WeakSet();

  function drawShots(ctx, S) {
    const shots = S.shots || [];

    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const dur = s.dur || 0.14;
      const k = Math.max(0, Math.min(1, (s.t || 0) / dur));

      // орбитальный луч — отдельная векторная полоса, а не снаряд
      if (s.kind === 'beam' || s.kind === 'lance' || s.kind === 'orbital') {
        drawBeamShot(ctx, s, S, k);
        continue;
      }

      const a = P(s.x1, s.y1);
      const b = P(s.x2, s.y2);
      const ax = a.x;
      const ay = a.y - 18;
      const bx = b.x;
      const by = b.y - 10;

      const x = ax + (bx - ax) * k;
      const y = ay + (by - ay) * k;

      if (s.kind === 'archer') {
        // стрела: короткая черта с оперением
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const arc = Math.sin(k * Math.PI) * 5;

        const hx = x;
        const hy = y - arc;

        ctx.strokeStyle = PAL.wood;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx - ux * 7, hy - uy * 7);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        // наконечник
        ctx.fillStyle = PAL.stoneLight;
        ctx.beginPath();
        ctx.moveTo(hx + ux * 2.6, hy + uy * 2.6);
        ctx.lineTo(hx - uy * 1.5, hy + ux * 1.5);
        ctx.lineTo(hx + uy * 1.5, hy - ux * 1.5);
        ctx.closePath();
        ctx.fill();

        // оперение
        ctx.strokeStyle = PAL.plaster;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hx - ux * 6.5 - uy * 1.8, hy - uy * 6.5 + ux * 1.8);
        ctx.lineTo(hx - ux * 4.6 - uy * 1.8, hy - uy * 4.6 + ux * 1.8);
        ctx.moveTo(hx - ux * 6.5 + uy * 1.8, hy - uy * 6.5 - ux * 1.8);
        ctx.lineTo(hx - ux * 4.6 + uy * 1.8, hy - uy * 4.6 - ux * 1.8);
        ctx.stroke();
      } else if (s.kind === 'mortar') {
        // каменное ядро по высокой дуге
        const arc = Math.sin(k * Math.PI) * 19;
        const cx = x;
        const cy = y - arc;

        ctx.strokeStyle = 'rgba(74,63,54,.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - (bx - ax) * 0.1, cy + 1);
        ctx.lineTo(cx, cy + 1);
        ctx.stroke();

        ctx.fillStyle = PAL.stoneDark;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,250,235,.34)';
        ctx.beginPath();
        ctx.arc(cx - 1.3, cy - 1.4, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // пыль при падении
        if (k > 0.88 && !landedShots.has(s)) {
          landedShots.add(s);
          const hit = P(s.x2, s.y2);
          burst(hit.x, hit.y - 4, 5, 3, 34);
          spawn(hit.x, hit.y - 6, 0, -10, 0.4, 4.5, 1, 3);
        }
      } else {
        // ядро: тёмный шар по дуге
        const arc = Math.sin(k * Math.PI) * 10;
        const cx = x;
        const cy = y - arc;

        // след
        ctx.strokeStyle = 'rgba(74,63,54,.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - (bx - ax) * 0.12, y - arc * 0.9 + 1);
        ctx.lineTo(cx, cy + 1);
        ctx.stroke();

        ctx.fillStyle = PAL.dark;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath();
        ctx.arc(cx - 1, cy - 1, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFx(ctx, S) {
    const fx = S.fx || [];

    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      const k = Math.min(1, f.t / (f.dur || 0.4));
      const p = P(f.x, f.y);

      if (f.kind === 'boom') {
        const size = (f.size || 1) * 10;
        const fade = (1 - k).toFixed(2);

        ctx.strokeStyle = 'rgba(240,176,69,' + fade + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, 8 + k * (18 + size), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,250,235,' + (0.7 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, 12 * (1 - k), 0, Math.PI * 2);
        ctx.fill();

        // пыль от разлома
        if (k < 0.3) burst(p.x, p.y - 8, 2, 3, 40);
      } else if (f.kind === 'trapBoom') {
        // подрыв ловушки: горячее кольцо, тёмный дым и песок
        const size = (f.size || 1.2) * 8;
        ctx.strokeStyle = 'rgba(255,207,74,' + (0.5 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 5, 5 + k * (14 + size), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(42,28,20,' + (0.24 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 7 - k * 8, 6 + k * 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,138,92,' + (0.45 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6, 3 + k * 5, 0, Math.PI * 2);
        ctx.fill();
        if (k < 0.3) burst(p.x, p.y - 4, 3, 3, 46);
      } else if (f.kind === 'spring') {
        // пружина: два разлетающихся металлических кольца
        const size = (f.size || 1) * 10;
        ctx.strokeStyle = 'rgba(201,211,220,' + (0.6 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4, 6 + k * size, 2.4 + k * size * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,207,74,' + (0.4 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 10 - k * 6, 3 + k * 7, 1.6 + k * 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'reveal') {
        // раскрытие засады: пыль из-под крышки и расширяющийся контур
        ctx.strokeStyle = 'rgba(224,176,69,' + (0.45 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 2, 6 + k * 16, 3 + k * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(226,213,190,' + (0.3 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 5 - k * 5, 3 + k * 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // облачко пыли на месте гибели
        ctx.fillStyle = 'rgba(240,236,224,' + (0.45 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6, 4 + k * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------- кадр ---------- */

  function drawBuildingHp(ctx, b) {
    if (!(b.maxHp > 0) || b.hp >= b.maxHp) return;

    const ratio = Math.max(0, Math.min(1, b.hp / b.maxHp));
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const y = p.y - crown(b, levelOf(b)) + 8;
    const w = b.w > 1 ? 34 : 24;

    ctx.fillStyle = 'rgba(30,26,20,.45)';
    ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 4);
    ctx.fillStyle = hpColor(ratio);
    ctx.fillRect(p.x - w / 2, y, w * ratio, 2);
  }

  let traceDraw = null;

  function drawEntities(ctx, buildings, units, traps) {
    const list = [];
    const runs = wallRuns(buildings);

    // газоны и тени стен — один раз и под всеми постройками, без двойных полос
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (!footprintVisible(r.x, r.y, r.x + r.w, r.y + r.h, 80)) continue;
      grassPad(ctx, r.x, r.y, r.x + r.w, r.y + r.h);
      castShadow(ctx, r.x, r.y, r.x + r.w, r.y + r.h, 0.9);
    }

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.dead || b.type === 'wall') continue;
      if (!footprintVisible(b.x, b.y, b.x + b.w, b.y + b.h, 170)) continue;
      list.push({ d: (b.x + b.w / 2) + (b.y + b.h / 2), kind: 'b', ref: b });
    }

    // каждая клетка стены — отдельный элемент сортировки
    for (let i = 0; i < runs.length; i++) {
      const parts = wallSections(runs[i]);
      for (let k = 0; k < parts.length; k++) {
        const s = parts[k];
        if (!footprintVisible(s.x, s.y, s.x + s.w, s.y + s.h, 70)) continue;
        list.push({ d: (s.x + 0.5) + (s.y + 0.5), kind: 'w', ref: s });
      }
    }

    // Ловушки в бою живут отдельным списком S.traps. До срабатывания
    // drawBuilding их скрывает, после — рисует воронку/раскрытую пружину.
    const tr = traps || [];
    for (let i = 0; i < tr.length; i++) {
      const t = tr[i];
      if (!t || t.dead) continue;
      const tw = t.w || 1;
      const th = t.h || 1;
      if (!footprintVisible(t.x, t.y, t.x + tw, t.y + th, 90)) continue;
      list.push({ d: (t.x + tw / 2) + (t.y + th / 2), kind: 'b', ref: t });
    }

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const wp = P(u.x, u.y);
      if (!pointVisible(wp.x, wp.y, 90)) continue;
      list.push({ d: u.x + u.y, kind: 'u', ref: u });
    }

    list.sort(function (a, b) {
      if (a.d !== b.d) return a.d - b.d;
      return a.kind === b.kind ? 0 : (a.kind === 'w' ? -1 : (b.kind === 'w' ? 1 : 0));
    });

    if (traceDraw) {
      traceDraw(list.map(function (e) {
        return {
          kind: e.kind,
          d: e.d,
          x: e.ref.x,
          y: e.ref.y,
          type: e.ref.type || (e.kind === 'w' ? 'wall' : '?')
        };
      }));
    }

    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === 'b') {
        const b = list[i].ref;
        drawBuilding(ctx, b);

        // скрытая ловушка не должна выдать себя даже вспышкой или полоской
        const lurks = isLurker(b.type) && trapHidden(b);
        if (!lurks) {
          const f = flashOf(b.id);
          if (f > 0) {
            drawFlashFaces(ctx, b.x, b.y, b.x + b.w, b.y + b.h, bodyHeight(b), f);
          }
          drawBuildingHp(ctx, b);
        }
      } else if (list[i].kind === 'w') {
        const r = list[i].ref;
        drawWallSection(ctx, r);

        let k = 0;
        for (let c = 0; c < r.cells.length; c++) {
          const f = flashOf(r.cells[c].id);
          if (f > k) k = f;
        }
        if (k > 0) drawFlashFaces(ctx, r.x, r.y, r.x + r.w, r.y + r.h, 18, k);
      } else {
        drawUnit(ctx, list[i].ref);
      }
    }

    // полоски здоровья стен — поверх всего, по одной на пролёт
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (!footprintVisible(r.x, r.y, r.x + r.w, r.y + r.h, 80)) continue;
      const lvl = r.lvl || 1;
      const H = 23 + (lvl >= 3 ? 5 : 0);
      const top = H + 10;
      wallHpBar(ctx, r, top);
    }
  }

  /* ---------- сетка режима «Постройки» ----------
     Рендер только читает CC.UI.state: buildMode — включить сетку,
     dragId — подсветить перетаскиваемую постройку. Сетка лежит поверх
     грунта и под постройками. Клетки рисуются одним путём: Path2D
     собирается один раз, без пересчёта на каждом кадре. */

  let gridPath = null;

  function buildModeState() {
    let st = null;
    try {
      st = CC.UI && CC.UI.state;
    } catch (e) {
      st = null;
    }
    return (st && st.buildMode) ? st : null;
  }

  function fieldGridPath() {
    if (typeof Path2D === 'undefined') return null;
    if (gridPath) return gridPath;
    const path = new Path2D();
    for (let i = 1; i < G; i++) {
      let a = P(i, 0);
      let b = P(i, G);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      a = P(0, i);
      b = P(G, i);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
    gridPath = path;
    return path;
  }

  function strokeFieldGrid(ctx) {
    const path = fieldGridPath();
    if (path) {
      ctx.stroke(path);
      return;
    }
    // запасной путь без Path2D: те же линии, но одним beginPath
    ctx.beginPath();
    for (let i = 1; i < G; i++) {
      let a = P(i, 0);
      let b = P(i, G);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      a = P(0, i);
      b = P(G, i);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // Пятно перетаскиваемой постройки. Позицию берём у Base.previewOf()
  // или Base.moveInfo() — это чтение, данные базы рендер не меняет.
  function dragFootprint(st) {
    if (!st || st.dragId == null) return null;

    let x = null;
    let y = null;
    let w = 1;
    let h = 1;
    let type = null;

    try {
      const list = CC.Base && typeof CC.Base.list === 'function' ? CC.Base.list() : [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].id !== st.dragId) continue;
        const size = CC.Base.size(list[i].type);
        x = list[i].x;
        y = list[i].y;
        w = (size && size.w) || 1;
        h = (size && size.h) || 1;
        type = list[i].type;
        break;
      }

      // режим перетаскивания: живая точка под курсором
      if (x !== null && CC.Base.previewOf) {
        const pv = CC.Base.previewOf(st.dragId);
        if (pv && typeof pv.x === 'number') {
          x = pv.x;
          y = pv.y;
        }
      }

      // старый режим переноса (если UI ещё им пользуется)
      if (x !== null && CC.Base.moveInfo) {
        const mi = CC.Base.moveInfo();
        if (mi && mi.id === st.dragId && typeof mi.x === 'number') {
          x = mi.x;
          y = mi.y;
          w = mi.w || w;
          h = mi.h || h;
          type = mi.type || type;
        }
      }
    } catch (e) {
      return null;
    }

    if (x === null || y === null) return null;
    return { x: x, y: y, w: w, h: h, type: type };
  }

  function drawBuildGrid(ctx) {
    const st = buildModeState();
    if (!st) return;
    if (CC.App && CC.App.mode === 'battle') return;

    const A = P(0, 0);
    const B = P(G, 0);
    const C = P(G, G);
    const D = P(0, G);

    // поле чуть темнее грунта — площадка читается как зона расстановки
    ctx.fillStyle = 'rgba(20,42,48,.08)';
    diamond(ctx, A, B, C, D);
    ctx.fill();

    // клетки 36x36: тонко, чтобы не спорить со сценой
    ctx.strokeStyle = 'rgba(127,233,255,.17)';
    ctx.lineWidth = 1;
    strokeFieldGrid(ctx);

    // границы поля заметнее: мягкое свечение и чёткая кромка
    ctx.strokeStyle = 'rgba(70,224,200,.2)';
    ctx.lineWidth = 6;
    diamond(ctx, A, B, C, D);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(127,233,255,.7)';
    ctx.lineWidth = 1.8;
    diamond(ctx, A, B, C, D);
    ctx.stroke();
  }

  // Подсветка перетаскиваемой постройки — поверх построек, иначе высокий
  // силуэт закрывает собственное пятно.
  function drawBuildDrag(ctx) {
    const st = buildModeState();
    if (!st) return;
    if (CC.App && CC.App.mode === 'battle') return;

    const drag = dragFootprint(st);
    if (!drag) return;

    const p0 = P(drag.x, drag.y);
    const p1 = P(drag.x + drag.w, drag.y);
    const p2 = P(drag.x + drag.w, drag.y + drag.h);
    const p3 = P(drag.x, drag.y + drag.h);
    const pulse = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3.2));

    ctx.fillStyle = 'rgba(70,224,200,' + pulse.toFixed(3) + ')';
    diamond(ctx, p0, p1, p2, p3);
    ctx.fill();

    ctx.strokeStyle = 'rgba(127,233,255,.9)';
    ctx.lineWidth = 2;
    diamond(ctx, p0, p1, p2, p3);
    ctx.stroke();

    // уголки-клещи
    const pts = [p0, p1, p2, p3];
    ctx.strokeStyle = 'rgba(255,207,74,.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const q = pts[i];
      const nx = pts[(i + 1) % 4];
      const pv = pts[(i + 3) % 4];
      ctx.moveTo(q.x + (nx.x - q.x) * 0.22, q.y + (nx.y - q.y) * 0.22);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(q.x + (pv.x - q.x) * 0.22, q.y + (pv.y - q.y) * 0.22);
    }
    ctx.stroke();
  }

  function drawPlacement(ctx) {
    const st = CC.UI && CC.UI.state;
    if (!st || !st.armed) return;

    const pulse = 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3.5));

    // в режиме стройки сетка чуть ярче — но это подсветка, а не плита
    ctx.strokeStyle = 'rgba(70,224,200,.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < G; i++) {
      let a = P(i, 0);
      let b = P(i, G);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      a = P(0, i);
      b = P(G, i);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(70,224,200,' + pulse.toFixed(3) + ')';
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        if (!CC.Base.fits(st.armed, x, y)) continue;
        diamond(ctx, P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1));
        ctx.fill();
      }
    }
  }

  function drawSelection(ctx) {
    const st = CC.UI && CC.UI.state;
    if (!st) return;

    const id = st.moving || st.selected;
    if (!id) return;

    const it = CC.Base.list().find(function (o) { return o.id === id; });
    if (!it) return;

    const s = CC.Base.size(it.type);
    const a = P(it.x, it.y);
    const b = P(it.x + s.w, it.y);
    const c = P(it.x + s.w, it.y + s.h);
    const d = P(it.x, it.y + s.h);

    const pulse = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5));
    ctx.strokeStyle = 'rgba(224,176,69,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 3;
    diamond(ctx, a, b, c, d);
    ctx.stroke();
  }

  /* ---------- индикаторы над постройками ---------- */

  // примерная высота силуэта над центром клетки, по типу и уровню (1..10)
  const CROWN = {
    townhall: [90, 92, 94, 110, 118, 122, 128, 140, 146, 152],
    barracks: [64, 66, 70, 76, 82, 86, 90, 100, 106, 118],
    archer: [64, 74, 74, 86, 88, 94, 100, 112, 118, 126],
    airdef: [58, 62, 66, 72, 78, 84, 90, 102, 108, 120],
    mage: [66, 68, 72, 78, 84, 90, 96, 104, 110, 122],
    cannon: [48, 50, 56, 58, 60, 64, 68, 76, 82, 90],
    mortar: [56, 56, 58, 60, 62, 66, 70, 78, 84, 92],
    goldmine: [64, 66, 68, 72, 78, 84, 88, 100, 106, 116],
    elixir: [56, 58, 60, 64, 66, 70, 74, 84, 90, 98],
    storage: [46, 48, 50, 56, 64, 68, 72, 82, 88, 98],
    mine: [26, 27, 28, 29, 30, 33, 34, 36, 37, 39],
    spring: [32, 33, 34, 36, 38, 41, 42, 44, 46, 49],
    airmine: [42, 43, 44, 46, 47, 50, 51, 52, 54, 56],
    ambush: [26, 27, 28, 31, 32, 35, 37, 40, 42, 46],
    beam: [64, 67, 70, 73, 76, 79, 82, 85, 88, 93]
  };

  function crown(b, lvl) {
    const arr = CROWN[b.type];
    if (!arr) return 40;
    return arr[Math.min(arr.length - 1, Math.max(0, lvl - 1))];
  }

  function plate(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function fmtLeft(sec) {
    const s = Math.max(0, Math.ceil(sec));
    if (s >= 3600) return Math.floor(s / 3600) + 'ч ' + Math.floor((s % 3600) / 60) + 'м';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function drawIndicators(ctx, buildings, iconsOnly) {
    const game = CC.Game;
    if (!game) return;

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (!b || b.dead || b.type === 'wall') continue;

      let up = null;

      if (!iconsOnly) {
        try {
          if (typeof game.upgradeInfo === 'function') up = game.upgradeInfo(b.id);
        } catch (e) {
          up = null;
        }
      }

      const showUp = !!(up && up.active);
      // у стройки/улучшения свой прогресс на площадке — не дублируем полоску
      const onSite = !iconsOnly && !!workOf(b);
      const res = b.type === 'goldmine' ? PAL.gold : b.type === 'elixir' ? PAL.elixir : null;
      // Полный буфер показывает сама иконка сбора в DOM (ui.js: .collect.is-full,
      // золотая обводка и пульсация), поэтому канвасной плашки «Полно» здесь нет.
      if (!res && !showUp) continue;

      const p = P(b.x + b.w / 2, b.y + b.h / 2);
      const top = p.y - crown(b, levelOf(b));

      // иконка ресурса — постоянная и заметная
      if (res) {
        spot(ctx, p.x, top - 7, 7.2, 'rgba(47,42,36,.8)');
        spot(ctx, p.x, top - 7, 5.6, res);

        if (b.type === 'goldmine') {
          spot(ctx, p.x, top - 7, 2.6, shade(PAL.gold, 0.4));
          spot(ctx, p.x, top - 7, 1.2, shade(PAL.gold, -0.3));
        } else {
          poly(ctx, [
            { x: p.x, y: top - 12 }, { x: p.x + 2.6, y: top - 7 },
            { x: p.x, y: top - 2 }, { x: p.x - 2.6, y: top - 7 }
          ], shade(PAL.elixir, 0.45));
          spot(ctx, p.x - 0.7, top - 8.4, 0.9, 'rgba(255,255,255,.7)');
        }
      }

      const y = top - (res ? 18 : 2);

      ctx.font = '800 9px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (showUp && !onSite) {
        const total = up.total > 0 ? up.total : 1;
        const left = Math.max(0, Number(up.left) || 0);
        const k = Math.min(1, Math.max(0, 1 - left / total));

        const label = fmtLeft(left);
        const tw = Math.max(26, ctx.measureText(label).width + 11);

        plate(ctx, p.x - tw / 2, y - 11, tw, 11, 'rgba(12,24,28,.86)');
        ctx.fillStyle = '#e4fbf7';
        ctx.fillText(label, p.x, y - 5);

        const w = 34;
        const by = y + 2;
        plate(ctx, p.x - w / 2, by, w, 4, 'rgba(7,14,17,.75)');
        ctx.fillStyle = PAL.cold;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(p.x - w / 2 + 0.6, by + 0.5, (w - 1.2) * k, 3, 1.5);
        else ctx.rect(p.x - w / 2 + 0.6, by + 0.5, (w - 1.2) * k, 3);
        ctx.fill();
      }

      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function draw(ctx, view) {
    const S = CC.Battle.state;
    const battle = CC.App.mode === 'battle' && S;

    t += 0.016;
    trapStats.hidden = 0;
    trapStats.drawn = 0;
    setLod(view.scale);
    updateWorldView(view);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawBackground(ctx, view);

    // тряска сдвигает только мир, интерфейс и фон остаются на месте
    const sh = shakeOffset();
    const sx = sh ? sh.x : 0;
    const sy = sh ? sh.y : 0;

    ctx.setTransform(
      view.dpr * view.scale, 0, 0, view.dpr * view.scale,
      view.dpr * (view.ox + sx), view.dpr * (view.oy + sy)
    );

    drawGround(ctx);
    drawBuildGrid(ctx);

    if (battle) {
      pBudget = lod === 0 ? 12 : 22;
      trackBattle(S, 1 / 60);
      updateParticles(1 / 60);
      updateCorpses(1 / 60);

      drawDeployZone(ctx, S);
      drawCollapses(ctx);
      drawCorpses(ctx);
      drawEntities(ctx, S.buildings || [], S.units || [], S.traps || []);
      drawIndicators(ctx, S.buildings || [], true);
      drawShots(ctx, S);
      drawFx(ctx, S);
      drawParticles(ctx);
    } else {
      const list = CC.Base.renderList();
      updateWalkers(1 / 60);
      drawPlacement(ctx);
      drawEntities(ctx, list, walkers.list);
      drawSelection(ctx);
      drawBuildDrag(ctx);
      drawIndicators(ctx, list);
    }

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawVignette(ctx, view);
    drawFinal(ctx, view);
  }

  /* =================================================================
     СТАРТОВАЯ ЗАСТАВКА «КОЛОНИЯ» — canvas 2D, без внешних картинок.
     drawIntro(ctx, view, t): view = { w, h, dpr }, t — секунды 0…6.5.
     Фазы: падение (0–2.5), удар (2.5–3.0), раскрытие (3.0–4.5),
     турели и отъезд камеры (4.5–5.7), база в свете (5.7–6.5).
     Небо, звёзды и дюны пекутся в offscreen-canvas и только рисуются
     картинкой; вся динамика (модуль, пыль, огни) — векторами.
     ================================================================= */

  const INTRO_TAU = Math.PI * 2;
  const introCache = {
    key: '', paints: 0, sky: null, dunes: null, glow: Object.create(null)
  };

  function iClamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function iLerp(a, b, k) {
    return a + (b - a) * k;
  }

  // 0…1 с мягкими краями: основной инструмент таймлайна
  function iSmooth(a, b, v) {
    if (b === a) return v < a ? 0 : 1;
    let k = (v - a) / (b - a);
    k = k < 0 ? 0 : (k > 1 ? 1 : k);
    return k * k * (3 - 2 * k);
  }

  function iEaseOut(k) {
    k = k < 0 ? 0 : (k > 1 ? 1 : k);
    return 1 - Math.pow(1 - k, 3);
  }

  function iHash(n) {
    n = (n | 0) * 2654435761 >>> 0;
    n ^= n >>> 15;
    n = (n * 2246822519) >>> 0;
    n ^= n >>> 13;
    return (n >>> 8) / 16777216;
  }

  function iRgba(color, a) {
    const c = parseColor(color);
    const al = a == null ? 1 : a;
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')';
  }

  function iGlowSprite(color) {
    if (introCache.glow[color]) return introCache.glow[color];
    let c = null;
    try {
      c = makeCanvas(96, 96);
      const g = c.getContext('2d');
      if (!g) return null;
      const rg = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      rg.addColorStop(0, 'rgba(255,255,255,.96)');
      rg.addColorStop(0.14, iRgba(color, 0.9));
      rg.addColorStop(0.52, iRgba(color, 0.26));
      rg.addColorStop(1, iRgba(color, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, 96, 96);
    } catch (e) {
      c = null;
    }
    introCache.glow[color] = c;
    return c;
  }

  function iGlow(ctx, x, y, r, color, a) {
    if (!(r > 0) || !(a > 0) || !isFinite(x) || !isFinite(y)) return;
    const s = iGlowSprite(color);
    if (!s) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * iClamp(a, 0, 1);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prev;
  }

  function iPoly(ctx, pts, color) {
    if (!pts || pts.length < 3) return;
    poly(ctx, pts, color);
  }

  function iStroke(ctx, pts, color, width, close) {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.25, width);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
    ctx.stroke();
  }

  function iEllipse(ctx, x, y, rx, ry, fill) {
    if (!(rx > 0) || !(ry > 0)) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, INTRO_TAU);
    ctx.fill();
  }

  function iEllipseStroke(ctx, x, y, rx, ry, color, width, dash) {
    if (!(rx > 0) || !(ry > 0)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.25, width);
    if (dash && ctx.setLineDash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, INTRO_TAU);
    ctx.stroke();
    if (dash && ctx.setLineDash) ctx.setLineDash([]);
    ctx.restore();
  }

  /* ---------- статические слои ---------- */

  function introBuildSky(w, h, cd) {
    let c = null;
    let g = null;
    try {
      c = makeCanvas(w * cd, h * cd);
      g = c.getContext('2d');
    } catch (e) {
      return null;
    }
    if (!g) return null;
    if (g.setTransform) g.setTransform(cd, 0, 0, cd, 0, 0);

    // ночное небо: почти чёрный зенит, пыльная охра у горизонта
    const sky = g.createLinearGradient(0, 0, 0, h * 0.78);
    sky.addColorStop(0, '#04050c');
    sky.addColorStop(0.34, '#080b17');
    sky.addColorStop(0.58, '#121120');
    sky.addColorStop(0.8, '#281823');
    sky.addColorStop(1, '#4a2420');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // млечная пыль — очень слабая диагональная полоса
    g.save();
    g.translate(w * 0.52, h * 0.22);
    g.rotate(-0.34);
    const band = g.createLinearGradient(0, -h * 0.11, 0, h * 0.11);
    band.addColorStop(0, 'rgba(120,140,190,0)');
    band.addColorStop(0.42, 'rgba(150,160,205,.055)');
    band.addColorStop(0.58, 'rgba(210,180,165,.05)');
    band.addColorStop(1, 'rgba(120,110,150,0)');
    g.fillStyle = band;
    g.fillRect(-w, -h * 0.11, w * 2, h * 0.22);
    g.restore();

    // звёзды: плотность и размер от площади, детерминированные
    const rnd = (function (seed) {
      let s = seed >>> 0;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })(0x51a7c0de);

    const count = Math.max(40, Math.round(w * h / 4600));
    const twinkles = [];
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.66;
      const r = 0.35 + Math.pow(rnd(), 2.6) * 1.55;
      const a = 0.2 + rnd() * 0.72;
      const warm = rnd() < 0.17;
      g.fillStyle = warm
        ? 'rgba(255,226,198,' + a.toFixed(3) + ')'
        : 'rgba(213,231,255,' + a.toFixed(3) + ')';
      g.beginPath();
      g.arc(x, y, r, 0, INTRO_TAU);
      g.fill();
      if (r > 1.15 && twinkles.length < 14) {
        twinkles.push({ x: x, y: y, r: r, a: a, ph: rnd() * INTRO_TAU });
      }
    }

    // две марсианские луны — маленькие, бледные
    const mr = iClamp(Math.min(w, h) * 0.012, 3, 9);
    const mx = w * 0.79;
    const my = h * 0.14;
    const mg = g.createRadialGradient(mx - mr * 0.35, my - mr * 0.4, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, 'rgba(255,250,240,.98)');
    mg.addColorStop(0.6, 'rgba(224,214,204,.9)');
    mg.addColorStop(1, 'rgba(178,166,158,.18)');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(mx, my, mr, 0, INTRO_TAU);
    g.fill();
    g.fillStyle = 'rgba(150,138,130,.32)';
    g.beginPath();
    g.arc(mx - mr * 0.28, my - mr * 0.12, mr * 0.19, 0, INTRO_TAU);
    g.arc(mx + mr * 0.3, my + mr * 0.24, mr * 0.14, 0, INTRO_TAU);
    g.fill();
    g.fillStyle = 'rgba(232,224,214,.62)';
    g.beginPath();
    g.arc(w * 0.865, h * 0.205, mr * 0.42, 0, INTRO_TAU);
    g.fill();

    // дымка у горизонта, чтобы звёзды не обрывались в грунт
    const hz = g.createLinearGradient(0, h * 0.38, 0, h * 0.62);
    hz.addColorStop(0, 'rgba(190,104,68,0)');
    hz.addColorStop(0.55, 'rgba(196,112,74,.16)');
    hz.addColorStop(1, 'rgba(90,38,26,.04)');
    g.fillStyle = hz;
    g.fillRect(0, h * 0.36, w, h * 0.28);

    return { canvas: c, twinkles: twinkles };
  }

  function introBuildDunes(w, h, cd) {
    const dh = iClamp(h * 0.23, 54, 196);
    let c = null;
    let g = null;
    try {
      c = makeCanvas(w * cd, dh * cd);
      g = c.getContext('2d');
    } catch (e) {
      return null;
    }
    if (!g) return null;
    if (g.setTransform) g.setTransform(cd, 0, 0, cd, 0, 0);

    function ridge(base, amp, color, edge, phase, freq) {
      const pts = [];
      g.beginPath();
      g.moveTo(-12, dh + 8);
      g.lineTo(-12, base);
      for (let x = -12; x <= w + 12; x += 9) {
        const u = x / Math.max(1, w);
        const yy = base -
          amp * (0.42 + 0.58 * (0.5 + 0.5 * Math.sin(u * freq + phase))) -
          amp * 0.32 * Math.sin(u * freq * 2.7 + phase * 1.9);
        pts.push({ x: x, y: yy });
        g.lineTo(x, yy);
      }
      g.lineTo(w + 12, dh + 8);
      g.closePath();
      g.fillStyle = color;
      g.fill();

      // подсветка гребня: тонкая, чтобы дюны читались на тёмном небе
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokeStyle = edge;
      g.lineWidth = 1;
      g.stroke();
    }

    ridge(dh * 0.48, dh * 0.17, 'rgba(55,26,22,.86)', 'rgba(196,104,68,.22)', 0.7, 7.2);
    ridge(dh * 0.62, dh * 0.14, 'rgba(39,18,16,.94)', 'rgba(170,86,58,.20)', 2.4, 9.4);
    ridge(dh * 0.76, dh * 0.1, 'rgba(27,13,12,.98)', 'rgba(150,74,50,.16)', 4.1, 12.7);

    return { canvas: c, h: dh };
  }

  function introEnsureCache(w, h, dpr) {
    const key = Math.round(w) + 'x' + Math.round(h) + '@' + dpr.toFixed(2);
    if (introCache.key === key && introCache.sky) return;
    introCache.key = key;

    // бюджет пикселей кэша: на retina не раздуваем память до сотен мегабайт
    const budget = 3.2e6;
    const cd = Math.max(1, Math.min(dpr, Math.sqrt(budget / Math.max(1, w * h))));
    introCache.sky = introBuildSky(w, h, cd);
    introCache.dunes = introBuildDunes(w, h, cd);
    introCache.paints++;
  }

  /* ---------- сама сцена ---------- */

  function drawIntro(ctx, view, t) {
    if (!ctx || !view) return;

    const w = Math.max(1, Number(view.w) || 1);
    const h = Math.max(1, Number(view.h) || 1);
    const dpr = iClamp(Number(view.dpr) || 1, 0.5, 4);
    const T = iClamp(Number(t) || 0, 0, 6.5);

    ctx.save();
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    introEnsureCache(w, h, dpr);

    /* --- камера: низко над дюнами -> отъезд и подъём --- */
    const pull = iSmooth(4.52, 5.82, T);
    const zoomBase = Math.min(w / 11, h / 5.6);
    const zoom = zoomBase * (1.5 - 0.5 * pull);
    const tilt = 0.19 + 0.25 * pull;
    const horizon = h * (0.56 - 0.18 * pull);
    const descend = iSmooth(0.12, 2.46, T);
    const dip = descend * (1 - pull);
    const camX = w * 0.5;
    const camY = h * (0.8 - 0.14 * pull) + h * 0.018 * dip;

    // тряска на ударе: короткий затухающий импульс
    let shakeX = 0;
    let shakeY = 0;
    const dtI = T - 2.5;
    if (dtI > 0 && dtI < 0.66) {
      const k = 1 - dtI / 0.66;
      const amp = Math.min(w, h) * 0.018 * k * k;
      shakeX = Math.sin(dtI * 94) * amp + Math.sin(dtI * 47 + 1.1) * amp * 0.6;
      shakeY = Math.cos(dtI * 87) * amp * 0.7;
    }

    const ox = camX + shakeX;
    const oy = camY + shakeY;
    const HF = 0.72;

    function P(x, y, z) {
      return {
        x: ox + (x - z) * zoom * 0.5,
        y: oy + (x + z) * zoom * tilt * 0.5 - y * zoom * HF
      };
    }

    function groundEllipse(r, y) {
      const p = P(0, y || 0, 0);
      return { x: p.x, y: p.y, rx: r * zoom * 0.7071, ry: r * zoom * 0.7071 * tilt };
    }

    // кэш неба
    const sky = introCache.sky;
    if (sky) {
      ctx.drawImage(sky.canvas, 0, 0, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#04050c');
      g.addColorStop(0.62, '#141120');
      g.addColorStop(1, '#4a2420');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // редкие мерцающие звёзды поверх кэша
    if (sky && sky.twinkles) {
      for (let i = 0; i < sky.twinkles.length; i++) {
        const s = sky.twinkles[i];
        const a = 0.16 + 0.3 * (0.5 + 0.5 * Math.sin(T * 1.7 + s.ph));
        ctx.fillStyle = 'rgba(235,244,255,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.9, 0, INTRO_TAU);
        ctx.fill();
      }
    }

    /* --- дальние дюны: кресты над горизонтом, низ съедает грунт --- */
    const dunes = introCache.dunes;
    if (dunes) {
      ctx.globalAlpha = 0.94;
      ctx.drawImage(dunes.canvas, 0, horizon - dunes.h * 0.44 + shakeY * 0.35, w, dunes.h);
      ctx.globalAlpha = 1;
    }

    /* --- грунт: градиент, длинные полосы позёмки и редкие кратеры --- */
    const gg = ctx.createLinearGradient(0, horizon, 0, h);
    gg.addColorStop(0, '#662d1a');
    gg.addColorStop(0.26, '#8a3e22');
    gg.addColorStop(0.7, '#74311c');
    gg.addColorStop(1, '#461c10');
    ctx.fillStyle = gg;
    ctx.fillRect(-2, horizon - 1, w + 4, h - horizon + 4);

    const unit = Math.min(w, h);
    for (let i = 0; i < 9; i++) {
      const px = iHash(i * 17 + 5) * w;
      const py = horizon + (0.14 + 0.84 * iHash(i * 11 + 2)) * (h - horizon);
      const rx = (40 + 95 * iHash(i * 7 + 9)) * (0.7 + unit / 1000);
      const ry = rx * (0.035 + 0.035 * iHash(i * 5 + 1));
      const light = i % 3 === 0;
      iEllipse(ctx, px, py, rx, ry,
        light ? 'rgba(255,198,150,.022)' : 'rgba(52,19,11,.036)');
    }

    for (let i = 0; i < 6; i++) {
      const px = iHash(i * 23 + 31) * w;
      const py = horizon + (0.2 + 0.74 * iHash(i * 13 + 7)) * (h - horizon);
      const rx = (9 + 24 * iHash(i * 29 + 4)) * (0.7 + unit / 1000);
      const ry = rx * 0.28;
      iEllipse(ctx, px, py, rx, ry, 'rgba(43,16,10,.13)');
      iEllipseStroke(ctx, px - rx * 0.08, py - ry * 0.18, rx * 0.92, ry * 0.9,
        'rgba(255,190,142,.055)', 1);
    }

    // дымка у горизонта: связывает дюны и грунт
    const haze = ctx.createLinearGradient(0, horizon - 24, 0, horizon + 64);
    haze.addColorStop(0, 'rgba(214,126,86,0)');
    haze.addColorStop(0.42, 'rgba(214,126,86,.15)');
    haze.addColorStop(1, 'rgba(120,52,34,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 24, w, 88);

    /* --- камни и мелочь на грунте --- */
    function rockAt(x, z, size, alpha) {
      const p = P(x, 0.02, z);
      const s = size * zoom * 0.5;
      if (p.x < -60 || p.x > w + 60 || p.y < horizon - 30 || p.y > h + 40) return;
      iEllipse(ctx, p.x + s * 0.3, p.y + s * 0.12, s * 1.2, s * 0.42, 'rgba(40,16,10,.22)');
      iPoly(ctx, [
        { x: p.x - s, y: p.y },
        { x: p.x - s * 0.45, y: p.y - s * 0.9 },
        { x: p.x + s * 0.35, y: p.y - s * 0.75 },
        { x: p.x + s, y: p.y - s * 0.05 }
      ], iRgba('#5c3a2c', alpha));
      iPoly(ctx, [
        { x: p.x - s * 0.45, y: p.y - s * 0.9 },
        { x: p.x + s * 0.35, y: p.y - s * 0.75 },
        { x: p.x + s * 0.05, y: p.y - s * 0.62 },
        { x: p.x - s * 0.32, y: p.y - s * 0.7 }
      ], iRgba('#87604a', alpha * 0.8));
    }

    for (let i = 0; i < 24; i++) {
      const a = iHash(i * 37 + 3) * INTRO_TAU;
      const r = 5.7 + iHash(i * 41 + 8) * 6.2;
      // дальние камни мельче и тонут в дымке — глубина без лишнего шума
      const farK = iClamp((r - 5.7) / 6.2, 0, 1);
      rockAt(Math.cos(a) * r, Math.sin(a) * r,
        (0.28 + iHash(i * 19 + 6) * 0.72) * (1 - farK * 0.4),
        0.42 + iHash(i * 3) * 0.28 - farK * 0.12);
    }

    /* --- посадочное поле: раскрывается после удара --- */
    const padK = iSmooth(2.46, 3.24, T);
    const padR = 5.0 * (0.26 + 0.74 * padK);
    if (padK > 0.01) {
      const c = P(0, 0.012, 0);
      const rx = padR * zoom * 0.7071;
      const ry = rx * tilt;
      ctx.save();
      ctx.globalAlpha = padK;

      // тёмная площадка и внутренний диск
      iEllipse(ctx, c.x, c.y, rx * 1.03, ry * 1.03, 'rgba(58,24,13,.45)');
      iEllipse(ctx, c.x, c.y, rx, ry, 'rgba(66,28,16,.72)');
      iEllipse(ctx, c.x, c.y - ry * 0.03, rx * 0.8, ry * 0.8, 'rgba(120,52,30,.62)');
      iEllipse(ctx, c.x, c.y - ry * 0.05, rx * 0.58, ry * 0.58, 'rgba(94,40,24,.5)');

      // разметка: кольца, сектора, посадочные шевроны
      iEllipseStroke(ctx, c.x, c.y, rx * 0.9, ry * 0.9, 'rgba(255,207,74,.15)', 1.1);
      iEllipseStroke(ctx, c.x, c.y, rx * 0.7, ry * 0.7, 'rgba(70,224,200,.12)', 1, [7, 9]);
      iEllipseStroke(ctx, c.x, c.y, rx * 0.38, ry * 0.38, 'rgba(255,207,74,.1)', 1);

      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const r0 = padR * 0.76;
        const r1 = padR * 0.9;
        const q = [
          P(Math.cos(a - 0.08) * r0, 0.02, Math.sin(a - 0.08) * r0),
          P(Math.cos(a) * r1, 0.02, Math.sin(a) * r1),
          P(Math.cos(a + 0.08) * r0, 0.02, Math.sin(a + 0.08) * r0)
        ];
        iPoly(ctx, q, 'rgba(255,207,74,.24)');
      }
      ctx.restore();
    }

    // тень под базой до появления площадки
    const sh = groundEllipse(2.2, 0.015);
    iEllipse(ctx, sh.x, sh.y, sh.rx, sh.ry, 'rgba(30,10,6,.28)');

    // тёплый свет, поднимающий базу из темноты
    const lightOn = iSmooth(3.5, 4.6, T);
    const breath = 0.92 + 0.08 * Math.sin((T - 5.7) * 1.9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    iGlow(ctx, ox, oy + 0.1 * zoom, 6.2 * zoom, '#ff9a4d', 0.11 * lightOn * breath);
    iGlow(ctx, ox, oy - 0.9 * zoom, 3.4 * zoom, '#46e0c8', 0.12 * lightOn * breath);
    ctx.restore();

    /* --- осколки и пыль удара --- */
    const impact = T - 2.5;
    if (impact > 0 && impact < 1.6) {
      for (let i = 0; i < 11; i++) {
        const tt = Math.min(impact, 1.35);
        const a = iHash(i * 31 + 5) * INTRO_TAU;
        const sp = 1.4 + iHash(i * 7 + 11) * 2.8;
        const vh = 2.2 + iHash(i * 13 + 2) * 2.6;
        const x = Math.cos(a) * sp * tt;
        const z = Math.sin(a) * sp * tt;
        const y = Math.max(0, vh * tt - 4.2 * tt * tt);
        const p = P(x, y + 0.05, z);
        const s = (0.06 + 0.09 * iHash(i * 3 + 7)) * zoom * 0.5;
        if (y > 0.08) {
          const gp = P(x, 0.01, z);
          iEllipse(ctx, gp.x, gp.y, s * 1.6, s * 0.5, 'rgba(35,13,8,.18)');
        }
        iPoly(ctx, [
          { x: p.x - s, y: p.y },
          { x: p.x - s * 0.2, y: p.y - s * 0.8 },
          { x: p.x + s * 0.8, y: p.y - s * 0.3 },
          { x: p.x + s * 0.6, y: p.y + s * 0.2 }
        ], iRgba('#6a4635', 0.9));
      }
    }

    /* --- вспышка и ударная волна --- */
    if (impact > 0 && impact < 0.62) {
      const k = impact / 0.62;
      const a = (1 - k) * (1 - k);
      const c = P(0, 0.1, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      iGlow(ctx, c.x, c.y, (1.8 + 4.2 * k) * zoom, '#ff9a45', a * 0.95);
      iGlow(ctx, c.x, c.y, (0.6 + 1.5 * k) * zoom, '#fff6d8', a * 1.0);
      // короткие горячие лучи из точки удара
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * INTRO_TAU + 0.3;
        const r0 = (0.35 + 0.7 * k) * zoom;
        const r1 = (1.3 + 3.6 * k) * zoom;
        iStroke(ctx, [
          { x: c.x + Math.cos(ang) * r0, y: c.y + Math.sin(ang) * r0 * tilt },
          { x: c.x + Math.cos(ang) * r1, y: c.y + Math.sin(ang) * r1 * tilt }
        ], 'rgba(255,216,156,' + (a * 0.45).toFixed(3) + ')',
          1 + 1.8 * (1 - k));
      }
      ctx.restore();
    }
    if (impact > 0 && impact < 1.15) {
      const k = impact / 1.15;
      const ring = 0.6 + 5.4 * iEaseOut(k);
      const g = groundEllipse(ring, 0.03);
      iEllipseStroke(ctx, g.x, g.y, g.rx, g.ry,
        'rgba(255,196,128,' + ((1 - k) * 0.55).toFixed(3) + ')', 1.8 + 3 * (1 - k));
      iEllipseStroke(ctx, g.x, g.y, g.rx * 0.82, g.ry * 0.82,
        'rgba(255,236,196,' + ((1 - k) * 0.26).toFixed(3) + ')', 1.2);
    }

    // клубы пыли от двигателей и удара
    if (impact > -0.6 && impact < 1.7) {
      const k = iClamp((impact + 0.5) / 1.9, 0, 1);
      const grow = iEaseOut(k);
      const fade = Math.pow(1 - k, 1.2);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * INTRO_TAU + iHash(i * 5 + 2) * 0.55;
        const dist = (0.5 + 4.8 * grow) * (0.62 + 0.6 * iHash(i * 7 + 9));
        const p = P(Math.cos(a) * dist, 0.08 + 0.4 * grow, Math.sin(a) * dist);
        const r = (0.32 + 1.35 * grow) * zoom * 0.72;
        iEllipse(ctx, p.x, p.y, r, r * 0.42,
          'rgba(224,166,124,' + (fade * 0.24).toFixed(3) + ')');
      }
    }

    /* ---------- база: панели, купол, антенна, турели ---------- */

    const platK = iSmooth(2.9, 3.52, T);
    const petalK = iSmooth(3.0, 3.86, T);
    const domeK = iSmooth(3.18, 4.0, T);
    const antK = iSmooth(3.52, 4.3, T);
    const solarK = iSmooth(3.58, 4.44, T);
    const baseLight = iSmooth(3.55, 4.52, T) * (0.9 + 0.1 * Math.sin(T * 2.1));

    function ringPts(cx, cz, r, y, n, phase) {
      const out = [];
      const off = phase || 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * INTRO_TAU + off;
        out.push(P(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
      }
      return out;
    }

    function prismAt(cx, cz, r, y0, y1, n, topColor, sideColor, phase) {
      const b = ringPts(cx, cz, r, y0, n, phase);
      const t = ringPts(cx, cz, r, y1, n, phase);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const shadeK = 0.5 + 0.5 * Math.cos((i / n) * INTRO_TAU + 0.9);
        iPoly(ctx, [b[i], b[j], t[j], t[i]],
          shade(sideColor, -0.16 + 0.26 * shadeK));
      }
      iPoly(ctx, t, topColor);
      return { b: b, t: t };
    }

    // панели-лепестки, расходящиеся из корпуса
    if (petalK > 0.01) {
      for (let s = 0; s < 4; s++) {
        const a0 = s * Math.PI / 2 + Math.PI / 4;
        const innerR = 1.75;
        const outerR = 1.85 + 1.45 * petalK;
        const yIn = iLerp(0.72, 0.58, petalK);
        const yOut = iLerp(1.15, 0.2, petalK);
        const spread = 0.4;
        const pts = [
          P(Math.cos(a0 - spread) * innerR, yIn, Math.sin(a0 - spread) * innerR),
          P(Math.cos(a0 + spread) * innerR, yIn, Math.sin(a0 + spread) * innerR),
          P(Math.cos(a0 + spread) * outerR, yOut, Math.sin(a0 + spread) * outerR),
          P(Math.cos(a0 - spread) * outerR, yOut, Math.sin(a0 - spread) * outerR)
        ];
        iPoly(ctx, pts, iRgba('#2b363c', 0.95));
        iStroke(ctx, pts, 'rgba(255,207,74,.32)', 1, true);
        const mid = [
          P(Math.cos(a0 - spread * 0.7) * (innerR + 0.2) , yIn - 0.02, Math.sin(a0 - spread * 0.7) * (innerR + 0.2)),
          P(Math.cos(a0 + spread * 0.7) * (innerR + 0.2), yIn - 0.02, Math.sin(a0 + spread * 0.7) * (innerR + 0.2))
        ];
        iStroke(ctx, mid, iRgba('#46e0c8', 0.16 + 0.3 * baseLight), 1.4);
      }
    }

    // солнечные крылья: раскладываются в стороны
    if (solarK > 0.01) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const k = 0.04 + 0.96 * solarK;
        const x0 = sgn * 1.85;
        const x1 = sgn * (1.85 + 2.35 * k);
        const y = iLerp(1.05, 0.56, solarK);
        const z0 = -0.78;
        const z1 = 0.78;
        const p00 = P(Math.min(x0, x1), y, z0);
        const p10 = P(Math.max(x0, x1), y, z0);
        const p11 = P(Math.max(x0, x1), y, z1);
        const p01 = P(Math.min(x0, x1), y, z1);
        iPoly(ctx, [p00, p10, p11, p01], '#17373d');

        // сетка фотоэлементов
        const cols = 4;
        const rows = 2;
        for (let ci = 0; ci < cols; ci++) {
          for (let ri = 0; ri < rows; ri++) {
            const u0 = ci / cols;
            const u1 = (ci + 0.92) / cols;
            const v0 = ri / rows;
            const v1 = (ri + 0.9) / rows;
            const cell = [
              P(iLerp(x0, x1, u0), y - 0.006, iLerp(z0, z1, v0)),
              P(iLerp(x0, x1, u1), y - 0.006, iLerp(z0, z1, v0)),
              P(iLerp(x0, x1, u1), y - 0.006, iLerp(z0, z1, v1)),
              P(iLerp(x0, x1, u0), y - 0.006, iLerp(z0, z1, v1))
            ];
            iPoly(ctx, cell, (ci + ri) % 2
              ? 'rgba(30,92,100,.92)'
              : 'rgba(24,72,80,.94)');
          }
        }
        // золотая рама и блик по внешнему краю
        iStroke(ctx, [p00, p10, p11, p01], 'rgba(255,207,74,.52)', 1.2, true);
        iStroke(ctx, [
          P(sgn > 0 ? x1 : x0, y - 0.01, z0),
          P(sgn > 0 ? x1 : x0, y - 0.01, z1)
        ], 'rgba(255,232,156,.5)', 1.4);
        // стойка к платформе
        iStroke(ctx, [
          P(x0 * 0.72, 0.38, 0),
          P(iLerp(x0, x1, 0.18), y, 0)
        ], 'rgba(95,110,118,.7)', 1.1);
      }
    }

    // турели выходят из грунта перед куполом: обе читаются силуэтом
    const turrets = [
      { x: -3.3, z: 3.5, s: 1.12, rise: iSmooth(4.52, 5.32, T), aim0: -1.2, aim1: 2.99, color: '#46e0c8' },
      { x: 4.0, z: 1.9, s: 1.0, rise: iSmooth(4.82, 5.6, T), aim0: 1.9, aim1: 0.15, color: '#ffcf4a' }
    ];

    function drawTurret(tr, idx) {
      const rise = tr.rise;
      const g = P(tr.x, 0.02, tr.z);
      const rGround = 0.98 * tr.s;
      iEllipseStroke(ctx, g.x, g.y, rGround * zoom * 0.7071, rGround * zoom * 0.7071 * tilt,
        iRgba(tr.color, 0.2 + 0.28 * rise), 1.2, [5, 6]);
      if (rise <= 0.02) return;

      const s = tr.s;
      const aimK = iSmooth(5.05, 5.72, T);
      const aim = iLerp(tr.aim0, tr.aim1, aimK);
      const hy = 0.86 * s * rise;
      const h1 = 1.02 * s * rise;

      // станина, погон и корпус башни
      prismAt(tr.x, tr.z, 0.58 * s, 0.02, 0.36 * s * rise, 8, '#3c484f', '#2a343a', Math.PI / 8);
      prismAt(tr.x, tr.z, 0.44 * s, 0.36 * s * rise, 0.64 * s * rise, 8, '#4a575e', '#333f45', Math.PI / 8);
      prismAt(tr.x, tr.z, 0.48 * s, 0.64 * s * rise, h1, 8, '#44525a', '#2f3b42', Math.PI / 8);
      iEllipseStroke(ctx, g.x, g.y - 0.02 * zoom,
        0.45 * s * zoom * 0.7071, 0.45 * s * zoom * 0.7071 * tilt,
        'rgba(255,207,74,.28)', 1);

      // ствол: тёмный металл, тонкий блик и бирюзовый торец
      const len = 1.62 * s * iSmooth(0.52, 1, rise);
      if (len > 0.02) {
        const from = P(tr.x, hy, tr.z);
        const to = P(tr.x + Math.cos(aim) * len, hy, tr.z + Math.sin(aim) * len);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl;
        const ny = dx / dl;
        const w0 = 0.12 * zoom * s;
        const w1 = 0.075 * zoom * s;
        const body = [
          { x: from.x + nx * w0, y: from.y + ny * w0 },
          { x: to.x + nx * w1, y: to.y + ny * w1 },
          { x: to.x - nx * w1, y: to.y - ny * w1 },
          { x: from.x - nx * w0, y: from.y - ny * w0 }
        ];
        iPoly(ctx, body, '#303b42');
        iStroke(ctx, [
          { x: from.x + nx * w0 * 0.62, y: from.y + ny * w0 * 0.62 },
          { x: to.x + nx * w1 * 0.62, y: to.y + ny * w1 * 0.62 }
        ], 'rgba(150,170,178,.55)', Math.max(1, 0.03 * zoom * s));
        iStroke(ctx, [
          { x: from.x - nx * w0 * 0.7, y: from.y - ny * w0 * 0.7 },
          { x: to.x - nx * w1 * 0.7, y: to.y - ny * w1 * 0.7 }
        ], 'rgba(16,22,26,.75)', Math.max(1, 0.035 * zoom * s));

        // маск-щит у основания
        iPoly(ctx, [
          { x: from.x + nx * w0 * 1.7, y: from.y + ny * w0 * 1.7 },
          { x: from.x + dx / dl * w0 * 1.1 + nx * w0 * 1.5, y: from.y + dy / dl * w0 * 1.1 + ny * w0 * 1.5 },
          { x: from.x + dx / dl * w0 * 1.1 - nx * w0 * 1.5, y: from.y + dy / dl * w0 * 1.1 - ny * w0 * 1.5 },
          { x: from.x - nx * w0 * 1.7, y: from.y - ny * w0 * 1.7 }
        ], '#43515a');

        // дульный тормоз
        const mx = to.x - dx / dl * 0.055 * zoom * s;
        const my = to.y - dy / dl * 0.055 * zoom * s;
        iPoly(ctx, [
          { x: mx + nx * w1 * 1.5, y: my + ny * w1 * 1.5 },
          { x: to.x + nx * w1 * 1.3, y: to.y + ny * w1 * 1.3 },
          { x: to.x - nx * w1 * 1.3, y: to.y - ny * w1 * 1.3 },
          { x: mx - nx * w1 * 1.5, y: my - ny * w1 * 1.5 }
        ], '#222c31');
        iEllipse(ctx, to.x, to.y, 0.07 * zoom * s, 0.045 * zoom * s,
          iRgba(tr.color, 0.55 * rise));
      }

      // бронещитки по бокам башни
      const sideA = aim + Math.PI / 2;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const px = tr.x + Math.cos(sideA) * 0.5 * s * sgn;
        const pz = tr.z + Math.sin(sideA) * 0.5 * s * sgn;
        const a = P(px, 0.72 * s * rise, pz);
        iPoly(ctx, [
          { x: a.x - 2.4 * s, y: a.y },
          { x: a.x, y: a.y - 0.22 * zoom * s },
          { x: a.x + 2.4 * s, y: a.y },
          { x: a.x, y: a.y + 0.16 * zoom * s }
        ], '#3b4951');
      }

      // маркер и подсветка
      if (baseLight > 0.02) {
        const head = P(tr.x, h1 + 0.08 * s, tr.z);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        iGlow(ctx, head.x, head.y, 0.5 * zoom * s,
          tr.color, 0.32 * baseLight * (idx ? 0.85 : 1));
        ctx.restore();
        iEllipse(ctx, head.x, head.y, 0.06 * zoom * s, 0.038 * zoom * s,
          iRgba('#fff8e0', 0.8 * baseLight));
      }

      if (T > 5.3) {
        const mk = iSmooth(5.3, 5.92, T);
        const pulse = 0.32 + 0.22 * Math.sin(T * 3.1 + idx * 1.7);
        iEllipseStroke(ctx, g.x, g.y,
          (1.08 + 0.08 * Math.sin(T * 3.1 + idx)) * zoom * 0.7071,
          (1.08 + 0.08 * Math.sin(T * 3.1 + idx)) * zoom * 0.7071 * tilt,
          iRgba(tr.color, mk * pulse), 1.4);
        for (let k = 0; k < 4; k++) {
          const ga = k * Math.PI / 2 + Math.PI / 4 + T * 0.12;
          const gp = P(tr.x + Math.cos(ga) * 1.2, 0.02, tr.z + Math.sin(ga) * 1.2);
          iPoly(ctx, [
            { x: gp.x, y: gp.y - 2.2 },
            { x: gp.x + 2.2, y: gp.y },
            { x: gp.x, y: gp.y + 2.2 },
            { x: gp.x - 2.2, y: gp.y }
          ], iRgba(tr.color, mk * 0.45));
        }
      }
    }

    // платформа командного центра
    if (platK > 0.01) {
      const y0 = 0.03;
      const y1 = 0.08 + 0.4 * platK;
      prismAt(0, 0, 2.05, y0, y1, 10, '#46545c', '#2f3a40', Math.PI / 10);
      iEllipseStroke(ctx, ox, P(0, y1, 0).y,
        2.05 * zoom * 0.7071, 2.05 * zoom * 0.7071 * tilt,
        'rgba(255,207,74,.42)', 1.3);
      iEllipseStroke(ctx, ox, P(0, y1 - 0.02, 0).y,
        1.72 * zoom * 0.7071, 1.72 * zoom * 0.7071 * tilt,
        'rgba(70,224,200,.22)', 1);

      // светящиеся сегменты по борту
      if (baseLight > 0.02) {
        for (let i = 0; i < 10; i++) {
          const a0 = (i / 10) * INTRO_TAU + Math.PI / 10 + 0.05;
          const a1 = a0 + 0.15;
          const q = [
            P(Math.cos(a0) * 2.06, y1 - 0.16, Math.sin(a0) * 2.06),
            P(Math.cos(a1) * 2.06, y1 - 0.16, Math.sin(a1) * 2.06),
            P(Math.cos(a1) * 2.06, y1 - 0.08, Math.sin(a1) * 2.06),
            P(Math.cos(a0) * 2.06, y1 - 0.08, Math.sin(a0) * 2.06)
          ];
          iPoly(ctx, q, iRgba(i % 3 === 0 ? '#ffcf4a' : '#46e0c8',
            0.16 + 0.55 * baseLight * (0.7 + 0.3 * Math.sin(T * 2.4 + i))));
        }
      }

      // золотые накладки на погоне
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const p = P(Math.cos(a) * 1.98, y1 + 0.01, Math.sin(a) * 1.98);
        iPoly(ctx, [
          { x: p.x - 3, y: p.y },
          { x: p.x, y: p.y - 2 },
          { x: p.x + 3, y: p.y },
          { x: p.x, y: p.y + 2 }
        ], 'rgba(255,207,74,.42)');
      }
    }

    // корпус модуля, пока он ещё не растворился в платформе
    const shellA = 1 - iSmooth(2.96, 3.52, T);
    if (shellA > 0.01) {
      const my = T < 2.5
        ? iLerp(2.8, 0.52, descend)
        : 0.52 + 0.1 * Math.sin((T - 2.5) * 22) * Math.exp(-(T - 2.5) * 9);
      const rot = iLerp(0.62, 0.16, descend) +
        (1 - descend) * 0.09 * Math.sin(T * 1.7);
      const legK = iSmooth(2.5, 2.9, T);
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);

      function MP(x, y, z) {
        const wx = x * cr - z * sr;
        const wz = x * sr + z * cr;
        return P(wx, my + y, wz);
      }

      // тень на грунте
      const sp0 = P(0, 0.01, 0);
      const shR = (1.2 + my * 0.22) * zoom * 0.7071;
      iEllipse(ctx, sp0.x, sp0.y, shR, shR * tilt,
        'rgba(32,12,7,' + (0.1 + 0.2 * (1 - my / 5)).toFixed(3) + ')');

      ctx.save();
      ctx.globalAlpha = shellA;

      const nb = 8;
      const rb = 1.16;
      const bodyBottom = [];
      const bodyTop = [];
      const capBottom = [];
      const capTop = [];
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * INTRO_TAU + Math.PI / 8;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        bodyBottom.push(MP(ca * rb, 0, sa * rb));
        bodyTop.push(MP(ca * rb, 1.0, sa * rb));
        capBottom.push(MP(ca * 0.76, 1.0, sa * 0.76));
        capTop.push(MP(ca * 0.76, 1.36, sa * 0.76));
      }

      // грани корпуса
      for (let i = 0; i < nb; i++) {
        const j = (i + 1) % nb;
        const lit = 0.5 + 0.5 * Math.cos((i / nb) * INTRO_TAU + rot + 0.9);
        iPoly(ctx, [bodyBottom[i], bodyBottom[j], bodyTop[j], bodyTop[i]],
          shade('#3d4a51', -0.2 + 0.3 * lit));
      }
      // нижний скос
      const bevel = [];
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * INTRO_TAU + Math.PI / 8;
        bevel.push(MP(Math.cos(a) * 0.92, -0.16, Math.sin(a) * 0.92));
      }
      for (let i = 0; i < nb; i++) {
        const j = (i + 1) % nb;
        iPoly(ctx, [bevel[i], bevel[j], bodyBottom[j], bodyBottom[i]], '#2b353b');
      }

      // рёбра-радиаторы делают силуэт угловатым, а не бочкообразным
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 8;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const fin = [
          MP(ca * (rb + 0.01), 0.18, sa * (rb + 0.01)),
          MP(ca * (rb + 0.28), 0.3, sa * (rb + 0.28)),
          MP(ca * (rb + 0.22), 0.78, sa * (rb + 0.22)),
          MP(ca * (rb + 0.01), 0.86, sa * (rb + 0.01))
        ];
        iPoly(ctx, fin, '#35424a');
        iStroke(ctx, [fin[1], fin[2]], 'rgba(255,207,74,.28)', 1);
      }

      iPoly(ctx, bodyTop, '#4d5a61');
      iStroke(ctx, bodyTop, 'rgba(255,207,74,.45)', 1.1, true);

      // верхняя рубка
      for (let i = 0; i < nb; i++) {
        const j = (i + 1) % nb;
        const lit = 0.5 + 0.5 * Math.cos((i / nb) * INTRO_TAU + rot + 1.1);
        iPoly(ctx, [capBottom[i], capBottom[j], capTop[j], capTop[i]],
          shade('#46535a', -0.16 + 0.26 * lit));
      }
      iPoly(ctx, capTop, '#556269');
      iStroke(ctx, capTop, 'rgba(255,207,74,.4)', 1, true);

      // тёмный люк, бирюзовый визор и сложенная антенна
      const hatch = [
        MP(-0.38, 1.365, 0.5),
        MP(0.38, 1.365, 0.5),
        MP(0.38, 1.365, 0.78),
        MP(-0.38, 1.365, 0.78)
      ];
      iPoly(ctx, hatch, '#222c31');
      iStroke(ctx, [MP(-0.34, 1.37, 0.56), MP(0.34, 1.37, 0.56)],
        'rgba(70,224,200,.38)', 1.2);
      if (T < 2.5) {
        const mastBase = MP(0.22, 1.36, 0.16);
        const mastTip = MP(0.5, 1.78, 0.34);
        iStroke(ctx, [mastBase, mastTip], 'rgba(150,168,175,.8)', 1.3);
        iEllipse(ctx, mastTip.x, mastTip.y, 0.035 * zoom, 0.035 * zoom, '#ffcf4a');
      }

      // предупреждающие полосы
      for (let i = 0; i < 3; i++) {
        const q = [
          MP(-0.9 + i * 0.55, 0.08, rb + 0.005),
          MP(-0.72 + i * 0.55, 0.08, rb + 0.005),
          MP(-0.72 + i * 0.55, 0.22, rb + 0.005),
          MP(-0.9 + i * 0.55, 0.22, rb + 0.005)
        ];
        iPoly(ctx, q, iRgba('#ffcf4a', 0.5));
      }

      // опоры: складываются в полёте, раскрываются на посадке
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const rr = iLerp(1.0, 1.72, legK);
        const fy = iLerp(-0.06, -my, legK);
        const hip = MP(Math.cos(a) * 1.08, 0.18, Math.sin(a) * 1.08);
        const knee = MP(Math.cos(a) * rr * 0.72, fy * 0.5 + 0.12, Math.sin(a) * rr * 0.72);
        const foot = MP(Math.cos(a) * rr, fy, Math.sin(a) * rr);
        ctx.lineCap = 'round';
        iStroke(ctx, [hip, knee, foot], '#1f282d', Math.max(2.4, 0.1 * zoom));
        iStroke(ctx, [hip, knee], '#707f86', Math.max(1.1, 0.04 * zoom));
        iEllipse(ctx, foot.x, foot.y, 0.16 * zoom, 0.07 * zoom, '#242e33');
        iEllipse(ctx, foot.x, foot.y - 0.015 * zoom, 0.1 * zoom, 0.04 * zoom,
          'rgba(255,207,74,.28)');
      }

      // тормозные двигатели
      let thrust = 0;
      if (T < 2.5) {
        const near = iSmooth(1.5, 2.48, T);
        thrust = 0.72 + 0.18 * Math.sin(T * 33) + 0.5 * near;
      } else if (T < 2.86) {
        thrust = Math.max(0, 1 - (T - 2.5) / 0.3) * 2.2;
      }
      const flare = T > 2.5 ? Math.max(0, 1 - (T - 2.5) / 0.36) : 0;

      // сопла: короткие тёмные раструбы под корпусом
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const nz = MP(Math.cos(a) * 0.82, -0.12, Math.sin(a) * 0.82);
        const nw = 0.13 * zoom;
        iPoly(ctx, [
          { x: nz.x - nw, y: nz.y - 0.06 * zoom },
          { x: nz.x + nw, y: nz.y - 0.06 * zoom },
          { x: nz.x + nw * 0.72, y: nz.y + 0.06 * zoom },
          { x: nz.x - nw * 0.72, y: nz.y + 0.06 * zoom }
        ], '#1c252a');
        iStroke(ctx, [
          { x: nz.x - nw * 0.8, y: nz.y + 0.055 * zoom },
          { x: nz.x + nw * 0.8, y: nz.y + 0.055 * zoom }
        ], 'rgba(255,207,74,.3)', 1);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const nz = MP(Math.cos(a) * 0.82, -0.14, Math.sin(a) * 0.82);
        const flick = 0.82 + 0.18 * Math.sin(T * 41 + i * 1.9);
        const baseLen = T < 2.5 ? (0.34 + 0.34 * thrust) : 0.18;
        const len = baseLen * zoom * 0.9 * flick * (1 + flare * 1.1);
        const wid = (0.1 + 0.04 * flare) * zoom;
        if (thrust > 0.02) {
          iPoly(ctx, [
            { x: nz.x - wid, y: nz.y },
            { x: nz.x + wid, y: nz.y },
            { x: nz.x + wid * 0.45, y: nz.y + len },
            { x: nz.x - wid * 0.45, y: nz.y + len }
          ], 'rgba(255,122,48,.55)');
          iPoly(ctx, [
            { x: nz.x - wid * 0.5, y: nz.y },
            { x: nz.x + wid * 0.5, y: nz.y },
            { x: nz.x + wid * 0.2, y: nz.y + len * 0.62 },
            { x: nz.x - wid * 0.2, y: nz.y + len * 0.62 }
          ], 'rgba(255,236,186,.8)');
          iGlow(ctx, nz.x, nz.y + len * 0.18, (0.45 + flare * 0.6) * zoom,
            '#ff8a3c', 0.28 * Math.min(1, thrust));
        }
      }
      ctx.restore();

      // тепловой шлейф над корпусом (только в полёте)
      if (T < 2.5 && thrust > 0.2) {
        ctx.save();
        ctx.globalAlpha = shellA * 0.5;
        for (let k = 0; k < 3; k++) {
          const pts = [];
          for (let j = 0; j <= 5; j++) {
            const yy = 1.2 + j * 0.42;
            const xx = Math.sin(T * 2.6 + j * 1.1 + k * 1.7) * 0.16 * j;
            pts.push(MP(xx, yy, 0));
          }
          iStroke(ctx, pts, 'rgba(255,150,92,.10)', 1.4 + k * 0.5);
        }
        ctx.restore();
      }

      ctx.restore();
    }

    // купол командного центра
    if (domeK > 0.01) {
      const R = 1.5 * (0.6 + 0.4 * domeK);
      const baseY = 0.45;
      const DH = 1.2 * domeK;
      const rings = 4;
      const segs = 10;
      const rows = [];
      for (let j = 0; j <= rings; j++) {
        const phi = (j / rings) * (Math.PI / 2);
        rows.push({
          r: R * Math.cos(phi),
          y: baseY + DH * Math.sin(phi)
        });
      }
      const rowPts = [];
      for (let j = 0; j <= rings; j++) {
        rowPts.push(ringPts(0, 0, Math.max(0.005, rows[j].r), rows[j].y, segs, Math.PI / 8));
      }
      for (let j = 0; j < rings; j++) {
        for (let i = 0; i < segs; i++) {
          const n = (i + 1) % segs;
          const lit = 0.5 + 0.5 * Math.cos((i / segs) * INTRO_TAU + 0.9);
          iPoly(ctx, [rowPts[j][i], rowPts[j][n], rowPts[j + 1][n], rowPts[j + 1][i]],
            shade('#38454c', -0.24 + 0.32 * lit - j * 0.02));
        }
      }
      // рёбра и золотой пояс
      for (let i = 0; i < segs; i += 2) {
        const line = [];
        for (let j = 0; j <= rings; j++) line.push(rowPts[j][i]);
        iStroke(ctx, line, 'rgba(160,180,188,.09)', 0.8);
      }
      iEllipseStroke(ctx, ox, P(0, baseY, 0).y,
        R * zoom * 0.7071, R * zoom * 0.7071 * tilt,
        'rgba(255,207,74,.34)', 1.1);
      iEllipseStroke(ctx, ox, P(0, baseY + 0.2 * domeK, 0).y,
        R * 0.94 * zoom * 0.7071, R * 0.94 * zoom * 0.7071 * tilt,
        'rgba(255,207,74,.18)', 0.9);

      // окна: светятся после раскрытия
      if (baseLight > 0.02) {
        const wins = [0.28, 0.78, 1.28, 2.0, 2.5];
        for (let wi = 0; wi < wins.length; wi++) {
          const a = wins[wi];
          for (let row = 0; row < 2; row++) {
            const phi = 0.42 + row * 0.28;
            const rr = R * Math.cos(phi);
            const p = P(Math.cos(a) * rr, baseY + DH * Math.sin(phi), Math.sin(a) * rr);
            const p2 = P(Math.cos(a + 0.1) * rr, baseY + DH * Math.sin(phi), Math.sin(a + 0.1) * rr);
            const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
            const on = baseLight * (0.72 + 0.28 * Math.sin(T * 2.2 + wi * 1.3 + row));
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(ang);
            ctx.fillStyle = iRgba('#46e0c8', 0.55 * on);
            ctx.fillRect(-0.085 * zoom, -0.028 * zoom, 0.17 * zoom, 0.056 * zoom);
            ctx.fillStyle = iRgba('#c6fff4', 0.5 * on);
            ctx.fillRect(-0.06 * zoom, -0.012 * zoom, 0.12 * zoom, 0.024 * zoom);
            ctx.restore();
            iGlow(ctx, p.x, p.y, 0.28 * zoom, '#46e0c8', 0.16 * on);
          }
        }
        // центральный визор
        const p = P(0, baseY + DH * 0.52, R * 0.86);
        iGlow(ctx, p.x, p.y, 0.42 * zoom, '#7fe9ff', 0.2 * baseLight);
      }
    }

    // антенна и маяк
    if (antK > 0.02) {
      const topY = 0.45 + 1.2 * domeK;
      const base = P(0, topY, 0);
      const tip = P(0, topY + 0.95 * antK, 0);
      iStroke(ctx, [base, tip], '#7b8a90', 1.7);
      iStroke(ctx, [base, tip], 'rgba(210,224,228,.35)', 0.6);
      for (let i = 1; i <= 2; i++) {
        const yy = topY + 0.95 * antK * (i / 3);
        const bar = P(0, yy, 0);
        iStroke(ctx, [
          { x: bar.x - 0.18 * zoom, y: bar.y },
          { x: bar.x + 0.18 * zoom, y: bar.y }
        ], 'rgba(150,168,175,.55)', 1);
      }
      // тарелка
      const dish = P(0.18, topY + 0.48 * antK, 0.1);
      iEllipseStroke(ctx, dish.x, dish.y, 0.22 * zoom, 0.1 * zoom,
        'rgba(255,207,74,.55)', 1.1);
      iEllipse(ctx, dish.x, dish.y, 0.1 * zoom, 0.045 * zoom, 'rgba(120,136,144,.35)');

      const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(T * 5.2));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      iGlow(ctx, tip.x, tip.y, 0.34 * zoom, '#ff6b4a', 0.5 * antK * blink);
      ctx.restore();
      iEllipse(ctx, tip.x, tip.y, 0.05 * zoom, 0.05 * zoom, '#ffd9c4');
    }

    drawTurret(turrets[0], 0);
    drawTurret(turrets[1], 1);

    /* --- огни по контуру площадки --- */
    if (lightOn > 0.02) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * INTRO_TAU + Math.PI / 12;
        const p = P(Math.cos(a) * 4.55, 0.04, Math.sin(a) * 4.55);
        const k = iSmooth(3.55 + i * 0.035, 4.1 + i * 0.035, T);
        if (k <= 0.01) continue;
        const color = i % 3 === 0 ? '#ffcf4a' : '#46e0c8';
        const pulse = 0.8 + 0.2 * Math.sin(T * 2.6 + i * 0.9);
        iGlow(ctx, p.x, p.y, (0.35 + 0.08 * pulse) * zoom, color, 0.32 * k * pulse);
        iEllipse(ctx, p.x, p.y - 0.03 * zoom, 0.055 * zoom, 0.032 * zoom,
          iRgba('#fff6da', 0.85 * k));
        iStroke(ctx, [
          { x: p.x, y: p.y },
          { x: p.x, y: p.y - 0.13 * zoom }
        ], iRgba(color, 0.4 * k), 1);
      }
    }

    /* --- оседающая пыль --- */
    const settle = iSmooth(3.0, 4.8, T);
    if (settle < 0.98) {
      for (let i = 0; i < 9; i++) {
        const a = iHash(i * 43 + 7) * INTRO_TAU;
        const rr = 1.6 + iHash(i * 17 + 3) * 3.2;
        const p = P(Math.cos(a) * rr, 0.12 + 0.2 * iHash(i * 9), Math.sin(a) * rr);
        const rx = (0.5 + 0.5 * iHash(i * 5)) * zoom;
        iEllipse(ctx, p.x, p.y, rx, rx * 0.34,
          'rgba(214,158,118,' + ((1 - settle) * 0.1).toFixed(3) + ')');
      }
    }

    // редкие пылинки в свете базы
    if (T > 3.4) {
      const motes = iSmooth(3.4, 4.8, T);
      for (let i = 0; i < 22; i++) {
        const a = iHash(i * 53 + 11) * INTRO_TAU;
        const rr = 1.2 + iHash(i * 23 + 5) * 4.0;
        const dr = 0.12 * Math.sin(T * 0.55 + i * 1.3);
        const p = P(Math.cos(a) * (rr + dr), 0.15 + 0.6 * iHash(i * 31 + 9), Math.sin(a) * (rr + dr));
        const alpha = (0.06 + 0.08 * iHash(i * 7 + 3)) * motes;
        iEllipse(ctx, p.x, p.y, 1.1, 1.1,
          'rgba(255,212,164,' + alpha.toFixed(3) + ')');
      }
    }

    /* --- передний план: тёмный гребень дюны внизу --- */
    ctx.fillStyle = 'rgba(28,12,10,.55)';
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    ctx.lineTo(-10, h * 0.94);
    for (let x = -10; x <= w + 10; x += 18) {
      const u = x / Math.max(1, w);
      const yy = h * 0.955 - h * 0.025 *
        (0.5 + 0.5 * Math.sin(u * 11 + 1.4)) -
        h * 0.012 * Math.sin(u * 27 + 0.6);
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fill();

    /* --- мягкая виньетка --- */
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.22,
      w * 0.5, h * 0.52, Math.max(w, h) * 0.76);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.68, 'rgba(2,4,9,.16)');
    vg.addColorStop(1, 'rgba(1,2,5,.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  return {
    draw: draw,
    // стартовая заставка: рисуется поверх/вместо сцены, пока идёт интро
    drawIntro: drawIntro,
    // отладочные счётчики кэша для tools/scene-check.js
    __intro: function () {
      return {
        key: introCache.key,
        paints: introCache.paints,
        sky: !!introCache.sky,
        dunes: !!introCache.dunes
      };
    },
    __introReset: function () {
      introCache.key = '';
      introCache.sky = null;
      introCache.dunes = null;
      introCache.paints = 0;
    },
    // отладочный доступ для tools/scene-check.js: кто сейчас гуляет по базе
    __walkers: function () { return walkers.list; },
    // сброс прогулки при смене сцены (сцена-чек и тесты)
    __resetWalkers: function () {
      walkers.list.length = 0;
      walkers.sig = '';
      walkers.ready = false;
      walkers.timer = 0;
    },
    // отладочная трассировка порядка отрисовки (только для tools)
    __trace: function (fn) { traceDraw = typeof fn === 'function' ? fn : null; },
    // состояние кэша фона для tools/parallax-shot.js: ключ, число перерисовок,
    // запас по краям и текущий сдвиг параллакса
    __bg: function () {
      return { key: bgCache.key, paints: bgCache.paints, pad: bgCache.pad, shift: bgCache.shift };
    },
    // включение/выключение спрайтов (tools/scene-check.js)
    __sprites: function (on) { spritesOn = !!on; },
    // счётчики ловушек за последний кадр: сколько скрыто и сколько нарисовано.
    // Нужны сцене-чеку, чтобы проверить невидимость до срабатывания.
    __traps: function () {
      return { hidden: trapStats.hidden, drawn: trapStats.drawn };
    },
    // счётчики псевдо-3D спрайтов войск: сколько канв запечено и сколько
    // обращений попало в готовый кэш. Ключ — тип|уровень|направление|кадр.
    __unitSprites: function () {
      return {
        bakes: unitBakes.count,
        hits: unitBakes.hits,
        cached: unitSpriteCache.size,
        keys: Array.from(unitSpriteCache.keys())
      };
    },
    // направление и кадр последнего кадра для конкретного юнита (tools)
    __unitInfo: function (u) {
      const m = unitMv.get(u);
      return m ? { dir: m.dir, frame: m.frame, walking: m.walking } : null;
    },
    // сброс кэша войск при смене сцены: canvas'ы не должны копиться между боями
    __resetUnitSprites: function () {
      unitSpriteCache.clear();
      unitBakes.count = 0;
      unitBakes.hits = 0;
    },
    // инструментам: погасить живые частицы перед чистой сценой
    __clearParticles: function () {
      for (let i = 0; i < pLife.length; i++) pLife[i] = 0;
    },
    // стройплощадка: сколько каркасов испечено и сколько лежит в кэше.
    // Прогресс в ключ не входит, поэтому при его изменении bakes не растёт.
    __sites: function () {
      return {
        bakes: siteBakes,
        cached: siteCache.size,
        keys: Array.from(siteCache.keys())
      };
    }
  };
})();
