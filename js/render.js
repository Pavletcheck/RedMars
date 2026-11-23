/* Рисование изометрии на canvas — чистый low-poly, всё фигурами.
   Никаких картинок: сцена должна работать даже без папки assets. */
window.CC = window.CC || {};

CC.Render = (function () {
  'use strict';

  const G = CC.GRID;
  const TW = CC.TW;
  const TH = CC.TH;
  const P = CC.Iso.project;
  // Потолок прокачки: у центра — TH (1..19), у построек справочник — до 21,
  // у стен — до 20. Держим отдельные границы, иначе уровни 11+ рисовались
  // бы как десятый и лестница апгрейдов визуально обрывалась.
  const MAXLVL = CC.MAX_TH || 10;
  const MAX_LVL = 21;
  // Справочник TH19 доводит стены до 20 уровня: держим верхнюю ступень,
  // иначе L19-20 молча рисовались бы как L18 и теряли навершие.
  const WALL_MAX = 20;

  /* Камера смотрит сверху (~48° при 54:40): круг на грунте сжимается
     по вертикали в TH/TW (0.74). При прежних 2:1 (30°) это было 0.5,
     поэтому старые «плоские» радиусы поднимаем множителем GK.
     Всё считается от TH, поэтому смена угла не требует перерисовки. */
  const GQ = TH / TW;
  const GK = GQ / 0.5;
  // Тени на грунте заданы в экранных пикселях при TH=44; при другом угле
  // вертикальный вынос пересчитываем пропорционально TH.
  const SHY = GQ / 0.8148;

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

  // Ролевые акценты: оборона — медь, экономика — золото/фиолет,
  // армия — бирюза/сталь. Только детали, не основной объём.
  const ACC = {
    copper: '#c46a3a',
    copperLight: '#e08b55',
    copperDark: '#8e4126',
    army: '#46e0c8',
    armyDark: '#1f8f86',
    econ: '#ffcf4a',
    econDark: '#c99520',
    violet: '#b04fe0'
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
    estorage: { h: 34, wall: PAL.metal, roof: PAL.elixir, flag: null },
    // научная станция: тёмно-синие панели и бирюзовое стекло
    lab: { h: 32, wall: '#2f465a', roof: '#4d6b82', flag: null },
    // академия героя: бетон, красные знамёна и золото
    herohall: { h: 40, wall: '#8a8175', roof: '#5f584f', flag: PAL.gold, door: '#3a2a1f' },
    wall: { h: 16, wall: PAL.stone, roof: PAL.stone, flag: null },
    // --- новые типы: базовый окрас и высота. Форму рисуют свои функции,
    // LOOK нужен фолбэку и карточкам, чтобы тип не стал серой коробкой.
    sweeper: { h: 40, wall: '#4c6b72', roof: '#a7dbe0', flag: null },
    bombtower: { h: 40, wall: '#62564a', roof: '#d18a4a', flag: null },
    xbow: { h: 36, wall: '#555d66', roof: '#b8c2cc', flag: null },
    eagle: { h: 54, wall: '#5d4b3a', roof: '#d7a85a', flag: PAL.gold },
    scattershot: { h: 48, wall: '#5a5148', roof: '#c7a272', flag: null },
    monolith: { h: 68, wall: '#3f4550', roof: '#9fa9c0', flag: null },
    spelltower: { h: 52, wall: '#4a3f6b', roof: '#b49cff', flag: null },
    multiarcher: { h: 52, wall: '#7a5a44', roof: '#e0b78a', flag: null },
    ricochet: { h: 38, wall: '#4e6266', roof: '#a9d0d4', flag: null },
    multigear: { h: 46, wall: '#58605a', roof: '#bfc9b8', flag: null },
    firespitter: { h: 42, wall: '#6b4432', roof: '#ff9a5a', flag: null },
    revenge: { h: 52, wall: '#3c3049', roof: '#c98fe0', flag: null },
    superwizard: { h: 62, wall: '#4a356a', roof: '#e0a6ff', flag: null },
    spiky: { h: 44, wall: '#4a3a3a', roof: '#d6a06a', flag: null },
    firecracker: { h: 50, wall: '#6b4a32', roof: '#ffb05a', flag: null },
    darkdrill: { h: 30, wall: '#3f3548', roof: '#c77dff', flag: null },
    darkstorage: { h: 42, wall: '#3a3142', roof: '#b06adf', flag: null },
    train: { h: 34, wall: '#6f5a42', roof: '#d1b07a', flag: PAL.elixir },
    darktrain: { h: 34, wall: '#45394f', roof: '#b984d8', flag: PAL.violet },
    spellfactory: { h: 42, wall: '#3d5a7a', roof: '#8fd0ff', flag: PAL.glass },
    darkspellfactory: { h: 42, wall: '#443553', roof: '#c28fe8', flag: PAL.violet },
    pethouse: { h: 36, wall: '#5a3a4a', roof: '#d77fa0', flag: PAL.amber },
    blacksmith: { h: 40, wall: '#554a3e', roof: '#c8a15c', flag: PAL.amber },
    workshop: { h: 40, wall: '#4d5a4a', roof: '#b9c99a', flag: PAL.cold },
    clancastle: { h: 50, wall: '#4a5468', roof: '#a9b8d8', flag: PAL.glass },
    squadbarracks: { h: 34, wall: '#5a4e3a', roof: '#c8b07a', flag: PAL.cold },
    giantbomb: { h: 18, wall: '#5a3e2e', roof: '#ff8a4a', flag: null },
    seekingair: { h: 16, wall: '#38465c', roof: '#8fc4ff', flag: null },
    skeletontrap: { h: 14, wall: '#4b4a3a', roof: '#e3d6a2', flag: null },
    tornado: { h: 20, wall: '#3d5060', roof: '#a9d8e8', flag: null },
    gigabomb: { h: 22, wall: '#4a2e2e', roof: '#ff6a4a', flag: null }
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
      mix(cBase, '#ffe1b4', 0.08),
      mix(cBase, '#ffd2a0', 0.03),
      shade(cBase, -0.24));
  }

  // мягкая тень под объёмом. Тёплое солнце сбоку: тень чуть длиннее,
  // но размазана четырьмя слоями, без жёсткой кромки.
  function castShadow(ctx, x0, y0, x1, y1, k) {
    const s = k || 1;
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    ctx.fillStyle = 'rgba(60,28,14,.13)';
    diamond(ctx,
      { x: A.x + 8.4 * s, y: A.y + 8.6 * s * SHY }, { x: B.x + 8.4 * s, y: B.y + 8.6 * s * SHY },
      { x: C.x + 8.4 * s, y: C.y + 8.6 * s * SHY }, { x: D.x + 8.4 * s, y: D.y + 8.6 * s * SHY });
    ctx.fill();

    ctx.fillStyle = 'rgba(60,28,14,.15)';
    diamond(ctx,
      { x: A.x + 3.6 * s, y: A.y + 4.1 * s * SHY }, { x: B.x + 3.6 * s, y: B.y + 4.1 * s * SHY },
      { x: C.x + 3.6 * s, y: C.y + 4.1 * s * SHY }, { x: D.x + 3.6 * s, y: D.y + 4.1 * s * SHY });
    ctx.fill();

    // дальний мягкий хвост длинной тени
    ctx.fillStyle = 'rgba(60,28,14,.05)';
    diamond(ctx,
      { x: A.x + 16 * s, y: A.y + 15 * s * SHY }, { x: B.x + 16 * s, y: B.y + 15 * s * SHY },
      { x: C.x + 16 * s, y: C.y + 15 * s * SHY }, { x: D.x + 16 * s, y: D.y + 15 * s * SHY });
    ctx.fill();

    ctx.fillStyle = 'rgba(60,28,14,.026)';
    diamond(ctx,
      { x: A.x + 23 * s, y: A.y + 21 * s * SHY }, { x: B.x + 23 * s, y: B.y + 21 * s * SHY },
      { x: C.x + 23 * s, y: C.y + 21 * s * SHY }, { x: D.x + 23 * s, y: D.y + 21 * s * SHY });
    ctx.fill();
  }

  // подстриженный газон под постройкой: ромб в границах футпринта
  function grassPad(ctx, x0, y0, x1, y1) {
    const A = P(x0, y0);
    const B = P(x1, y0);
    const C = P(x1, y1);
    const D = P(x0, y1);

    // мягкая тень по краю
    ctx.fillStyle = 'rgba(78,32,16,.16)';
    diamond(ctx,
      { x: A.x + 4.6, y: A.y + 4.0 * SHY }, { x: B.x + 4.6, y: B.y + 4.0 * SHY },
      { x: C.x + 4.6, y: C.y + 4.0 * SHY }, { x: D.x + 4.6, y: D.y + 4.0 * SHY });
    ctx.fill();
    ctx.fillStyle = 'rgba(78,32,16,.10)';
    diamond(ctx,
      { x: A.x + 8.4, y: A.y + 7.0 * SHY }, { x: B.x + 8.4, y: B.y + 7.0 * SHY },
      { x: C.x + 8.4, y: C.y + 7.0 * SHY }, { x: D.x + 8.4, y: D.y + 7.0 * SHY });
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

  /* ---------- бесконечный реголит ----------
     В игровом режиме нет неба и горизонта: база и бой стоят на
     бесконечной марсианской равнине. Экран заливается базовым цветом,
     поверх него под мировой трансформацией идёт бесшовная плитка
     1024×1024. Она движется строго вместе с миром — без параллакса.
     Крупные пятна и трещины рисуются отдельным непериодическим слоем
     по хэшу мировых клеток, поэтому повтор плитки не читается. */

  const bgCache = {
    key: 'regolith-v2', canvas: null, pattern: null, patternCtx: null,
    paints: 0, pad: 0, shift: 0
  };
  const BG_TILE = 1024;

  /* ---------- 3D-фон карты ----------
     Бесшовный реголит, отрендеренный в Blender (1024×1024), и дальние
     скалы/дюны вокруг поля. Пока PNG не загрузился, работает прежняя
     процедурная плитка, поэтому фон не «мигает» и не ломается. */
  const BG3D_TILE_SRC = 'assets/bg3d/ground/regolith-1024.png';
  const bg3d = {
    tile: null,
    tileState: 0,           // 0 — ещё нет, 1 — грузится, 2 — готово, 3 — нет файла
    images: {},
    failed: {}
  };

  function bg3dTile() {
    if (bg3d.tileState === 2) return bg3d.tile;
    if (bg3d.tileState !== 0) return null;
    if (typeof document === 'undefined' || typeof Image !== 'function') {
      bg3d.tileState = 3;
      return null;
    }
    bg3d.tileState = 1;
    let img;
    try {
      img = new Image();
    } catch (e) {
      bg3d.tileState = 3;
      return null;
    }
    img.onload = function () {
      if (img.naturalWidth > 0) {
        bg3d.tile = img;
        bg3d.tileState = 2;
      } else {
        bg3d.tileState = 3;
      }
    };
    img.onerror = function () { bg3d.tileState = 3; };
    try {
      img.src = BG3D_TILE_SRC;
    } catch (e) {
      bg3d.tileState = 3;
    }
    return null;
  }

  // Дальние спрайты: размеры и якоря — из manifest.json (drawAt1x/anchor).
  // x/y — центр футпринта в клетках; поле 0…G, спрайты стоят снаружи.
  const BG3D_PROPS = [
    { f: 'rocks/arch-a.png', x: 22, y: -12, w: 178, h: 178, ax: 0.5, ay: 0.66 },
    { f: 'ridges/ridge-a.png', x: 12, y: -6, w: 614, h: 307, ax: 0.5, ay: 0.56 },
    { f: 'ridges/dune-a.png', x: 33, y: -8, w: 601, h: 300, ax: 0.5, ay: 0.53 },
    { f: 'rocks/mesa-b.png', x: 4, y: -9, w: 164, h: 164, ax: 0.5, ay: 0.64 },
    { f: 'rocks/mesa-a.png', x: 41, y: -10, w: 146, h: 146, ax: 0.5, ay: 0.66 },
    { f: 'ridges/ridge-b.png', x: -7, y: 12, w: 614, h: 307, ax: 0.5, ay: 0.56, mx: 1 },
    { f: 'ridges/dune-b.png', x: -8, y: 36, w: 601, h: 300, ax: 0.5, ay: 0.53, mx: 1 },
    { f: 'rocks/mesa-c.png', x: -10, y: 22, w: 198, h: 198, ax: 0.5, ay: 0.64 },
    { f: 'rocks/boulders-b.png', x: -5, y: 3, w: 111, h: 111, ax: 0.5, ay: 0.67 },
    { f: 'rocks/boulders-c.png', x: -6, y: 46, w: 102, h: 102, ax: 0.5, ay: 0.74 },
    { f: 'ridges/ridge-b.png', x: 30, y: 50, w: 614, h: 307, ax: 0.5, ay: 0.56, mx: 1 },
    { f: 'ridges/dune-b.png', x: 12, y: 52, w: 601, h: 300, ax: 0.5, ay: 0.53, mx: 1 },
    { f: 'rocks/mesa-c.png', x: 52, y: 12, w: 198, h: 198, ax: 0.5, ay: 0.64 },
    { f: 'rocks/boulders-a.png', x: 49, y: 32, w: 106, h: 106, ax: 0.5, ay: 0.75 },
    { f: 'rocks/mesa-a.png', x: 50, y: 49, w: 146, h: 146, ax: 0.5, ay: 0.66 },
    { f: 'rocks/boulders-c.png', x: 3, y: 52, w: 102, h: 102, ax: 0.5, ay: 0.74 }
  ];

  function bg3dPropImage(file) {
    const known = bg3d.images[file];
    if (known) {
      return (known.complete && known.naturalWidth > 0) ? known : null;
    }
    if (bg3d.failed[file]) return null;
    if (typeof document === 'undefined' || typeof Image !== 'function') return null;
    let img;
    try {
      img = new Image();
    } catch (e) {
      bg3d.failed[file] = true;
      return null;
    }
    img.onload = function () {
      if (img.naturalWidth > 0) bg3d.images[file] = img;
      else bg3d.failed[file] = true;
    };
    img.onerror = function () {
      bg3d.failed[file] = true;
      try { delete bg3d.images[file]; } catch (e) {}
    };
    bg3d.images[file] = img;
    try {
      img.src = 'assets/bg3d/' + file;
    } catch (e) {
      bg3d.failed[file] = true;
      return null;
    }
    return null;
  }

  function drawBg3dProps(ctx) {
    for (let i = 0; i < BG3D_PROPS.length; i++) {
      const p = BG3D_PROPS[i];
      const img = bg3dPropImage(p.f);
      if (!img) continue;
      const cx = (p.x - p.y) * TW / 2;
      const cy = (p.x + p.y) * TH / 2;
      if (!pointVisible(cx, cy, p.h)) continue;
      if (p.mx) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -p.w * p.ax, -p.h * p.ay, p.w, p.h);
        ctx.restore();
      } else {
        ctx.drawImage(img, cx - p.w * p.ax, cy - p.h * p.ay, p.w, p.h);
      }
    }
  }

  function paintRegolithTile(ctx) {
    const S = BG_TILE;
    ctx.fillStyle = PAL.regolith;
    ctx.fillRect(0, 0, S, S);

    // Мелкий бесшовный шум: целые периоды синусов дают одинаковые края.
    try {
      const img = ctx.createImageData(S, S);
      const d = img.data;
      for (let y = 0; y < S; y++) {
        const ny = y / S * Math.PI * 2;
        for (let x = 0; x < S; x++) {
          const nx = x / S * Math.PI * 2;
          const n = Math.sin(nx * 5 + 0.7) + Math.sin(ny * 7 + 1.1) +
            Math.sin(nx * 13 + ny * 11 + 2.3);
          // микрозерно, тоже бесшовное по повтору — зависит только от x,y
          let h = (x * 374761393 + y * 668265263) >>> 0;
          h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
          const grain = (((h >>> 16) & 255) / 255 - 0.5) * 2.4;
          const v = Math.round(n * 1.7 + grain);
          const i = (y * S + x) * 4;
          d[i] = 180 + v;
          d[i + 1] = 85 + Math.round(v * 0.55);
          d[i + 2] = 47 + Math.round(v * 0.35);
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      // Без ImageData (заглушка canvas) остаётся базовый тон.
    }

    // Обёртка 3×3: пятна, камешки и трещины продолжаются через край плитки.
    function wrap(fn) {
      for (let oy = -S; oy <= S; oy += S) {
        for (let ox = -S; ox <= S; ox += S) {
          ctx.save();
          ctx.translate(ox, oy);
          fn();
          ctx.restore();
        }
      }
    }

    reseed(512047);
    for (let i = 0; i < 4; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      const rx = 30 + rnd() * 55;
      const ry = 10 + rnd() * 18;
      const rot = rnd() * 0.5;
      ctx.fillStyle = rnd() < 0.52
        ? 'rgba(255,214,178,.022)'
        : 'rgba(88,38,20,.03)';
      wrap(function () {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Мелкие камешки: низкий контраст, без ярких повторяющихся пятен.
    for (let i = 0; i < 210; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      const r = 0.8 + rnd() * 2.1;
      const ry = r * (0.55 + rnd() * 0.35);
      const rot = rnd() * Math.PI;
      ctx.fillStyle = rnd() < 0.55
        ? 'rgba(94,68,55,.15)'
        : 'rgba(206,154,118,.14)';
      wrap(function () {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Трещины: короткие ломаные, тоже с обёрткой.
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const pts = [];
      let x = rnd() * S;
      let y = rnd() * S;
      let a = rnd() * Math.PI * 2;
      const seg = 3 + (rnd() * 3 | 0);
      for (let k = 0; k < seg; k++) {
        pts.push({ x: x, y: y });
        a += (rnd() - 0.5) * 1.2;
        const len = 5 + rnd() * 20;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
      }
      wrap(function () {
        ctx.strokeStyle = 'rgba(78,32,16,.16)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,170,.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y - 0.7);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y - 0.7);
        ctx.stroke();
      });
    }

    // Лёгкие следы техники.
    for (let i = 0; i < 22; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      const len = 6 + rnd() * 26;
      const rot = rnd() * Math.PI;
      wrap(function () {
        ctx.strokeStyle = 'rgba(255,218,178,.04)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(rot) * len / 2, cy - Math.sin(rot) * len / 2);
        ctx.lineTo(cx + Math.cos(rot) * len / 2, cy + Math.sin(rot) * len / 2);
        ctx.stroke();
      });
    }
    ctx.lineCap = 'butt';
  }

  function ensureRegolithTile() {
    if (bgCache.canvas) return bgCache.canvas;
    try {
      const c = makeCanvas(BG_TILE, BG_TILE);
      const cx = c.getContext('2d');
      paintRegolithTile(cx);
      bgCache.canvas = c;
      bgCache.key = 'regolith-v2';
      bgCache.paints++;
    } catch (e) {
      bgCache.canvas = null;
    }
    return bgCache.canvas;
  }

  function regolithPattern(ctx) {
    const tile = ensureRegolithTile();
    if (!tile) return null;
    if (bgCache.patternCtx !== ctx) {
      bgCache.pattern = null;
      bgCache.patternCtx = ctx;
    }
    if (!bgCache.pattern) {
      try {
        bgCache.pattern = ctx.createPattern(tile, 'repeat');
      } catch (e) {
        bgCache.pattern = null;
      }
    }
    return bgCache.pattern;
  }

  // Экранная подложка: тот же реголит без неба, солнца и горизонта.
  function drawBackground(ctx, view) {
    ctx.fillStyle = PAL.regolith;
    ctx.fillRect(0, 0, view.w, view.h);
    bgCache.pad = 0;
    bgCache.shift = 0;
  }

  // Детерминированный хэш для непериодического макро-слоя.
  function macroRand(ix, iy, salt) {
    let h = (ix * 374761393 + iy * 668265263 + salt * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Крупные пятна, ветровые полосы и трещины поверх плитки. Они привязаны
  // к мировым клеткам по хэшу, а не к тайлу 1024, поэтому при панораме
  // рисунок не повторяется и не выдаёт сетку.
  function drawRegolithMacro(ctx) {
    const CELL = 420;
    const far = lod === 0;
    const ix0 = Math.floor(worldView.x0 / CELL) - 1;
    const ix1 = Math.floor(worldView.x1 / CELL) + 1;
    const iy0 = Math.floor(worldView.y0 / CELL) - 1;
    const iy1 = Math.floor(worldView.y1 / CELL) + 1;
    const aMul = far ? 0.65 : 1;

    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const h0 = macroRand(ix, iy, 1);
        const h1 = macroRand(ix, iy, 2);
        const h2 = macroRand(ix, iy, 3);
        const h3 = macroRand(ix, iy, 4);
        const h4 = macroRand(ix, iy, 5);

        // Одно крупное пятно на клетку, иногда второе поменьше.
        const wx = (ix + 0.12 + h0 * 0.78) * CELL;
        const wy = (iy + 0.12 + h1 * 0.78) * CELL;
        const rx = (far ? 0.6 : 0.72) * (70 + h2 * 150);
        const ry = rx * (GQ * (0.42 + h3 * 0.5));
        const rot = h4 * Math.PI;
        const light = h2 > 0.46;
        const baseA = (0.027 + h3 * 0.028) * aMul;

        // Три вложенных эллипса дают мягкую кромку без filter/blur.
        ctx.fillStyle = light
          ? 'rgba(226,166,116,' + baseA.toFixed(3) + ')'
          : 'rgba(86,34,18,' + (baseA * 1.15).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light
          ? 'rgba(226,166,116,' + (baseA * 0.7).toFixed(3) + ')'
          : 'rgba(86,34,18,' + (baseA * 0.75).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(wx + rx * 0.08, wy - ry * 0.06, rx * 0.68, ry * 0.66,
          rot + 0.3, 0, Math.PI * 2);
        ctx.fill();

        if (!far && h0 > 0.58) {
          const wx2 = (ix + 0.15 + h4 * 0.7) * CELL + 120;
          const wy2 = (iy + 0.18 + h2 * 0.68) * CELL + 90;
          const rx2 = rx * 0.5;
          ctx.fillStyle = light
            ? 'rgba(84,34,18,' + (baseA * 0.7).toFixed(3) + ')'
            : 'rgba(230,170,120,' + (baseA * 0.6).toFixed(3) + ')';
          ctx.beginPath();
          ctx.ellipse(wx2, wy2, rx2, rx2 * GQ * 0.55, rot + 1.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ветровая полоса: длинный мягкий мазок в случайном направлении.
        const hs = macroRand(ix, iy, 6);
        if (!far && hs < 0.42) {
          const sx = (ix + 0.2 + macroRand(ix, iy, 7) * 0.6) * CELL;
          const sy = (iy + 0.2 + macroRand(ix, iy, 8) * 0.6) * CELL;
          const sa = macroRand(ix, iy, 9) * Math.PI;
          const sl = 75 + macroRand(ix, iy, 10) * 110;
          const sw = 8 + macroRand(ix, iy, 11) * 13;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sa);
          ctx.fillStyle = hs < 0.2
            ? 'rgba(255,210,170,' + (0.014 * aMul).toFixed(3) + ')'
            : 'rgba(76,30,16,' + (0.022 * aMul).toFixed(3) + ')';
          ctx.beginPath();
          ctx.ellipse(0, 0, sl, sw, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Трещина: редкая, длинная, с тёмным дном и светлой кромкой.
        const hc = macroRand(ix, iy, 12);
        if (!far && hc < 0.3) {
          let cx = (ix + 0.1 + macroRand(ix, iy, 13) * 0.8) * CELL;
          let cy = (iy + 0.1 + macroRand(ix, iy, 14) * 0.8) * CELL;
          let a = macroRand(ix, iy, 15) * Math.PI * 2;
          const seg = 3 + (hc < 0.12 ? 2 : 1);
          const pts = [];
          for (let k = 0; k < seg; k++) {
            pts.push({ x: cx, y: cy });
            a += (macroRand(ix, iy, 16 + k) - 0.5) * 1.1;
            const len = 28 + macroRand(ix, iy, 20 + k) * 58;
            cx += Math.cos(a) * len;
            cy += Math.sin(a) * len;
          }
          ctx.strokeStyle = 'rgba(70,28,14,' + (0.16 * aMul).toFixed(3) + ')';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,216,178,' + (0.055 * aMul).toFixed(3) + ')';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y - 1);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y - 1);
          ctx.stroke();
        }
      }
    }
  }

  // Бесконечный грунт в мировых координатах: тайлы кладём целыми мировыми
  // пикселями с перекрытием, чтобы при дробном масштабе камеры не было
  // волосяных швов. Поверх — непериодический макро-слой.
  function drawGroundTexture(ctx) {
    const art = bg3dTile();
    const tile = art || ensureRegolithTile();
    if (!tile) return;
    const T = BG_TILE;
    const overlap = 2;
    const step = T - overlap;
    const x0 = Math.floor((worldView.x0 - overlap) / step) * step;
    const y0 = Math.floor((worldView.y0 - overlap) / step) * step;
    const x1 = Math.ceil((worldView.x1 + overlap) / step) * step;
    const y1 = Math.ceil((worldView.y1 + overlap) / step) * step;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        ctx.drawImage(tile, x, y, T, T);
      }
    }
    drawRegolithMacro(ctx);
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

    // мягкие цветовые пятна под всем полем: грунт не выглядит однотонным
    for (let i = 0; i < (simple ? 14 : 24); i++) {
      const p = P(-4 + rnd() * (G + 8), -4 + rnd() * (G + 8));
      const rx = 40 + rnd() * 90;
      const ry = (16 + rnd() * 40) * GK;
      ctx.fillStyle = rnd() < 0.5
        ? 'rgba(201,107,63,.045)'
        : 'rgba(112,48,26,.05)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, rnd() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

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

    // колея ровера: две полосы и поперечные грунтозацепы
    ctx.strokeStyle = 'rgba(232,185,138,.06)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const midP = P(G / 2, G / 2);
    const exit = P(G, G);
    ctx.beginPath();
    ctx.moveTo(midP.x, midP.y);
    ctx.quadraticCurveTo((midP.x + exit.x) / 2 - 12, (midP.y + exit.y) / 2, exit.x, exit.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(82,36,20,.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midP.x + 7, midP.y + 2);
    ctx.quadraticCurveTo((midP.x + exit.x) / 2 - 5, (midP.y + exit.y) / 2 + 2, exit.x + 8, exit.y + 1);
    ctx.stroke();
    if (!simple) {
      ctx.strokeStyle = 'rgba(232,185,138,.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const k = i / 16;
        const qx = midP.x + (exit.x - midP.x) * k - 12 * Math.sin(k * Math.PI);
        const qy = midP.y + (exit.y - midP.y) * k;
        ctx.beginPath();
        ctx.moveTo(qx - 4, qy - 2.5);
        ctx.lineTo(qx + 4, qy + 2.5);
        ctx.stroke();
      }
    }

    // Утоптанные дорожки и следы техники, расходящиеся от центра поля.
    // Это фон: к реальной раскладке не привязан, кэш земли не инвалидируется.
    function routePoint(a, c, b, k) {
      const u = 1 - k;
      return {
        x: u * u * a.x + 2 * u * k * c.x + k * k * b.x,
        y: u * u * a.y + 2 * u * k * c.y + k * k * b.y
      };
    }

    function groundRoute(gx, gy, cx, cy, ex, ey) {
      const a = P(gx, gy);
      const c = P(cx, cy);
      const b = P(ex, ey);

      ctx.lineCap = 'round';
      // мягкие плечи и утоптанная середина
      ctx.strokeStyle = 'rgba(72,30,16,.055)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(236,188,142,.06)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,222,184,.025)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();

      // две колеи и поперечные грунтозацепы
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.strokeStyle = 'rgba(70,30,18,.075)';
      ctx.lineWidth = 1.1;
      for (let s = -1; s <= 1; s += 2) {
        const ox = nx * 3.4 * s;
        const oy = ny * 3.4 * s;
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.quadraticCurveTo(c.x + ox, c.y + oy, b.x + ox, b.y + oy);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,220,180,.035)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 15; i++) {
        const k = i / 15;
        const p = routePoint(a, c, b, k);
        ctx.beginPath();
        ctx.moveTo(p.x - nx * 3.2, p.y - ny * 3.2);
        ctx.lineTo(p.x + nx * 3.2, p.y + ny * 3.2);
        ctx.stroke();
      }

      // втоптанные камешки по обочинам
      for (let i = 0; i < 7; i++) {
        const k = 0.12 + rnd() * 0.8;
        const p = routePoint(a, c, b, k);
        const side = rnd() < 0.5 ? -1 : 1;
        const off = (3.8 + rnd() * 3.6) * side;
        ctx.fillStyle = rnd() < 0.5
          ? 'rgba(116,84,68,.36)'
          : 'rgba(180,146,118,.28)';
        ctx.beginPath();
        ctx.ellipse(p.x + nx * off, p.y + ny * off,
          1.4 + rnd() * 2.2, (0.9 + rnd() * 1.2) * GK, rnd(), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    groundRoute(G / 2, G / 2, G * 0.64, G * 0.70, G * 1.02, G * 0.98);
    groundRoute(G / 2, G / 2, G * 0.34, G * 0.72, -G * 0.05, G * 0.94);
    groundRoute(G / 2, G / 2, G * 0.70, G * 0.30, G * 1.04, -G * 0.04);
    groundRoute(G / 2, G / 2, G * 0.28, G * 0.26, -G * 0.06, -G * 0.05);

    // пыльные пятна по всему полю и за кромкой
    const patches = simple ? 70 : 150;
    for (let i = 0; i < patches; i++) {
      const p = P(-2.5 + rnd() * (G + 5), -2.5 + rnd() * (G + 5));
      const r = 9 + rnd() * 34;
      const kind = rnd();
      ctx.fillStyle = kind < 0.38
        ? 'rgba(255,214,170,' + (0.03 + rnd() * 0.05).toFixed(2) + ')'
        : kind < 0.72
          ? 'rgba(78,32,16,' + (0.035 + rnd() * 0.06).toFixed(2) + ')'
          : 'rgba(201,107,63,' + (0.04 + rnd() * 0.06).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * (0.32 + rnd() * 0.26) * GK, rnd() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!simple) {
      // кратеры — и внутри поля, и за ним: тень, светлый вал, тёмная чаша
      for (let i = 0; i < 30; i++) {
        const p = P(-2 + rnd() * (G + 4), -2 + rnd() * (G + 4));
        const r = 4 + rnd() * 11;

        ctx.fillStyle = 'rgba(70,26,13,.4)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, r, r * 0.5 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(218,150,108,.22)';
        ctx.beginPath();
        ctx.ellipse(p.x - 0.6, p.y - 0.5, r * 0.9, r * 0.44 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(52,22,12,.34)';
        ctx.beginPath();
        ctx.ellipse(p.x + r * 0.14, p.y + r * 0.06, r * 0.58, r * 0.26 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,182,.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x - r * 0.1, p.y - r * 0.08, r * 0.84, r * 0.42 * GK, 0, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
      }

      // трещины: ломаная с тёмным дном и светлой кромкой
      for (let i = 0; i < 24; i++) {
        let x = -1 + rnd() * (G + 2);
        let y = -1 + rnd() * (G + 2);
        let a = rnd() * Math.PI * 2;
        const seg = 3 + (rnd() * 4 | 0);
        const pts = [];
        for (let k = 0; k < seg; k++) {
          const p = P(x, y);
          pts.push(p);
          a += (rnd() - 0.5) * 1.1;
          const len = 0.22 + rnd() * 0.52;
          x += Math.cos(a) * len;
          y += Math.sin(a) * len;
        }
        if (pts.length < 2) continue;
        ctx.strokeStyle = 'rgba(72,30,16,.22)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,176,.12)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y - 1);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y - 1);
        ctx.stroke();
      }

      // пыльные вихри
      for (let i = 0; i < 30; i++) {
        const p = P(rnd() * G, rnd() * G);
        const s = 3 + rnd() * 7;
        ctx.strokeStyle = 'rgba(232,185,138,' + (0.06 + rnd() * 0.09).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.quadraticCurveTo(p.x, p.y - s * 0.7, p.x + s, p.y - s * 0.15);
        ctx.stroke();
      }

      // камешки: одиночные и кучками — у кучки есть общая тень
      for (let i = 0; i < 46; i++) {
        const p = P(-2 + rnd() * (G + 4), -2 + rnd() * (G + 4));
        ctx.fillStyle = rnd() < 0.55
          ? 'rgba(94,68,55,.5)'
          : 'rgba(154,122,104,.42)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 1.4 + rnd() * 2.2, (1 + rnd() * 1.2) * GK, rnd(), 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 12; i++) {
        const c = P(-1 + rnd() * (G + 2), -1 + rnd() * (G + 2));
        ctx.fillStyle = 'rgba(70,34,22,.16)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 1, 8, 3 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k % 2 ? 'rgba(122,90,74,.5)' : 'rgba(160,128,108,.4)';
          ctx.beginPath();
          ctx.ellipse(c.x - 4 + rnd() * 8, c.y - rnd() * 2, 1.2 + rnd() * 2, (0.9 + rnd() * 1.2) * GK,
            rnd(), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // мелкие обломки техники: пластина, болт, обрывок кабеля
      for (let i = 0; i < 20; i++) {
        const p = P(-1.5 + rnd() * (G + 3), -1.5 + rnd() * (G + 3));
        const w = 2 + rnd() * 5;
        ctx.fillStyle = 'rgba(76,86,92,.46)';
        ctx.fillRect(p.x, p.y, w, 2);
        ctx.fillStyle = 'rgba(255,207,74,.18)';
        ctx.fillRect(p.x + w * 0.35, p.y, 1.2, 1);
      }
      for (let i = 0; i < 8; i++) {
        const p = P(rnd() * G, rnd() * G);
        ctx.strokeStyle = 'rgba(56,66,74,.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + 4, p.y - 3, p.x + 9, p.y + 1);
        ctx.stroke();
      }

      // оплавленные пятна: тёмное стекло с бирюзовым отблеском
      for (let i = 0; i < 5; i++) {
        const p = P(rnd() * G, rnd() * G);
        const r = 4 + rnd() * 8;
        ctx.fillStyle = 'rgba(42,44,46,.16)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.42 * GK, rnd(), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,233,255,.1)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // жизнь вокруг поля
    paintDecor(ctx, simple);
  }

  // камни, обломки, антенны, кристаллы и трубы за пределами игровых клеток
  function paintDecor(ctx, far) {
    reseed(77123);

    const items = [];
    const want = far ? 42 : 46;
    let guard = 0;
    const reserved = [
      { x: -2.6, y: 5.2 }, { x: G + 2.7, y: G * 0.58 },
      { x: G * 0.4, y: G + 3.6 }
    ];

    while (items.length < want && guard < 700) {
      guard++;
      const gx = -3.4 + rnd() * (G + 6.8);
      const gy = -3.4 + rnd() * (G + 6.8);

      // только вне поля, с запасом от кромки
      if (gx > -1.8 && gx < G + 1.8 && gy > -1.8 && gy < G + 1.8) continue;

      // не липнем друг к другу и к крупным «героям»
      let clash = false;
      for (let i = 0; i < items.length; i++) {
        if (Math.hypot(items[i].gx - gx, items[i].gy - gy) < 1.3) { clash = true; break; }
      }
      if (clash) continue;
      for (let i = 0; i < reserved.length; i++) {
        if (Math.hypot(reserved[i].x - gx, reserved[i].y - gy) < 3.2) { clash = true; break; }
      }
      if (clash) continue;

      const r = rnd();
      let kind;
      if (r < 0.15) kind = 'wreck';
      else if (r < 0.38) kind = 'rock';
      else if (r < 0.52) kind = 'antenna';
      else if (r < 0.64) kind = 'dust';
      else if (r < 0.78) kind = 'crystal';
      else if (r < 0.88) kind = 'crate';
      else kind = 'pipe';

      items.push({ gx: gx, gy: gy, kind: kind, seed: rnd() });
    }

    // 2-3 крупных «героя» окружения. Стоят строго вне поля, чтобы не
    // пересекаться с постройками, и запоминаются контактной тенью.
    items.push({ gx: -2.6, gy: 5.2, kind: 'lander', seed: 0.55 });
    items.push({ gx: G + 2.7, gy: G * 0.58, kind: 'boulderBig', seed: 0.3 });
    items.push({ gx: G * 0.4, gy: G + 3.6, kind: 'dishBig', seed: 0.7 });

    // ближние рисуем последними
    items.sort(function (a, b) { return (a.gx + a.gy) - (b.gx + b.gy); });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = P(it.gx, it.gy);
      const sc = 0.82 + it.seed * 0.42;

      if (it.kind === 'wreck') {
        // обломки техники: ржавая плита, стойка, осколок панели
        ctx.fillStyle = 'rgba(60,28,14,.18)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 1, 14 * sc, 5 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.moveTo(p.x - 13 * sc, p.y);
        ctx.lineTo(p.x + 5 * sc, p.y - 5 * sc);
        ctx.lineTo(p.x + 12 * sc, p.y + 1 * sc);
        ctx.lineTo(p.x - 8 * sc, p.y + 4 * sc);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = PAL.rust;
        ctx.beginPath();
        ctx.moveTo(p.x - 9 * sc, p.y - 1 * sc);
        ctx.lineTo(p.x + 2 * sc, p.y - 4 * sc);
        ctx.lineTo(p.x - 1 * sc, p.y + 2 * sc);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = PAL.metalLight;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - 2 * sc, p.y - 4 * sc);
        ctx.lineTo(p.x + 4 * sc, p.y - 13 * sc);
        ctx.lineTo(p.x + 10 * sc, p.y - 12 * sc);
        ctx.stroke();

        if (!far) {
          ctx.fillStyle = 'rgba(70,224,200,.35)';
          ctx.fillRect(p.x + 4 * sc, p.y - 11 * sc, 3, 2);
          ctx.strokeStyle = 'rgba(60,28,14,.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - 11 * sc, p.y + 2 * sc);
          ctx.lineTo(p.x + 9 * sc, p.y - 2 * sc);
          ctx.stroke();
        }
      } else if (it.kind === 'rock') {
        const rr = 7 * sc;
        ctx.fillStyle = 'rgba(60,28,14,.16)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, rr + 1, rr * 0.44 * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PAL.stoneDark;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 2, rr, rr * 0.66, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.stone;
        ctx.beginPath();
        ctx.ellipse(p.x - 1.5, p.y - 3.5, rr * 0.78, rr * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.stoneLight;
        ctx.beginPath();
        ctx.ellipse(p.x - 2.5, p.y - 4.5, rr * 0.38, rr * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!far) {
          // трещина и второй камешек у подножия
          ctx.strokeStyle = 'rgba(56,34,24,.4)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x - rr * 0.2, p.y - rr * 0.7);
          ctx.lineTo(p.x + rr * 0.1, p.y - rr * 0.3);
          ctx.lineTo(p.x - rr * 0.05, p.y - rr * 0.05);
          ctx.stroke();
          ctx.fillStyle = 'rgba(110,82,68,.55)';
          ctx.beginPath();
          ctx.ellipse(p.x + rr * 0.85, p.y + 1.5, rr * 0.28, rr * 0.18 * GK, 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (it.kind === 'antenna') {
        const h = (18 + it.seed * 14) * sc;

        ctx.fillStyle = 'rgba(60,28,14,.14)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, 7 * sc, 2.8 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        // тренога: антенна не падает от ветра
        ctx.strokeStyle = PAL.metalDark;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - h);
        ctx.moveTo(p.x, p.y - h * 0.34);
        ctx.lineTo(p.x - 4 * sc, p.y);
        ctx.moveTo(p.x, p.y - h * 0.34);
        ctx.lineTo(p.x + 4 * sc, p.y);
        ctx.stroke();

        ctx.fillStyle = PAL.metalLight;
        ctx.beginPath();
        ctx.ellipse(p.x + 3 * sc, p.y - h + 2, 7 * sc, 3 * sc, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.arc(p.x + 3 * sc, p.y - h + 2, 1.4 * sc, 0, Math.PI * 2);
        ctx.fill();

        if (!far) {
          // сигнальные дуги
          ctx.strokeStyle = 'rgba(70,224,200,.28)';
          ctx.lineWidth = 0.9;
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.arc(p.x + 3 * sc, p.y - h + 2, 5 + k * 4, -2.4, -0.7);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,207,74,.35)';
          ctx.fillRect(p.x - 1, p.y - h * 0.55, 2, 1.4);
        }
      } else if (it.kind === 'crystal') {
        // бирюзовые кристаллы: общий марсианский акцент окружения
        const h = (7 + it.seed * 9) * sc;
        ctx.fillStyle = 'rgba(60,28,14,.16)';
        ctx.beginPath();
        ctx.ellipse(p.x + 1, p.y + 1, 8 * sc, 3 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        poly(ctx, [
          { x: p.x - 5 * sc, y: p.y },
          { x: p.x - 1.5 * sc, y: p.y - h * 0.62 },
          { x: p.x + 1.5 * sc, y: p.y - 1 },
          { x: p.x + 4.5 * sc, y: p.y }
        ], 'rgba(44,116,118,.55)');
        poly(ctx, [
          { x: p.x - 0.5 * sc, y: p.y - 1 },
          { x: p.x + 2.5 * sc, y: p.y - h },
          { x: p.x + 5 * sc, y: p.y - h * 0.45 },
          { x: p.x + 4.5 * sc, y: p.y + 0.5 }
        ], 'rgba(70,224,200,.5)');
        poly(ctx, [
          { x: p.x + 2.5 * sc, y: p.y - h },
          { x: p.x + 4.2 * sc, y: p.y - h * 0.55 },
          { x: p.x + 4.5 * sc, y: p.y - 0.5 }
        ], 'rgba(127,233,255,.42)');
        if (!far) {
          spot(ctx, p.x + 2.5 * sc, p.y - h * 0.8, 1, 'rgba(220,255,250,.6)');
        }
      } else if (it.kind === 'crate') {
        // брошенный контейнер: металл, ржавчина, янтарная полоса
        const w = 11 * sc;
        const hh = 8 * sc;
        ctx.fillStyle = 'rgba(60,28,14,.18)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, w * 0.9, 3 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.moveTo(p.x - w / 2, p.y - hh * 0.7);
        ctx.lineTo(p.x + w / 2 - 2, p.y - hh * 0.95);
        ctx.lineTo(p.x + w / 2, p.y - hh * 0.1);
        ctx.lineTo(p.x - w / 2 + 1, p.y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PAL.metal;
        ctx.beginPath();
        ctx.moveTo(p.x - w / 2, p.y - hh * 0.7);
        ctx.lineTo(p.x + w / 2 - 2, p.y - hh * 0.95);
        ctx.lineTo(p.x + w / 2 - 2, p.y - hh * 1.2);
        ctx.lineTo(p.x - w / 2, p.y - hh * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PAL.rust;
        ctx.fillRect(p.x - w * 0.2, p.y - hh * 0.85, w * 0.34, hh * 0.25);
        if (!far) {
          ctx.fillStyle = PAL.amber;
          ctx.fillRect(p.x - w * 0.42, p.y - hh * 0.42, w * 0.16, hh * 0.16);
          ctx.fillStyle = 'rgba(255,255,255,.16)';
          ctx.fillRect(p.x - w * 0.4, p.y - hh * 0.92, w * 0.76, 0.8);
        }
      } else if (it.kind === 'pipe') {
        // труба, торчащая из грунта: колено и бирюзовая течь
        const h = (9 + it.seed * 9) * sc;
        ctx.fillStyle = 'rgba(60,28,14,.15)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 1, 8 * sc, 3 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PAL.metalDark;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - h);
        ctx.lineTo(p.x + 7 * sc, p.y - h - 1.5);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(154,167,173,.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 1, p.y);
        ctx.lineTo(p.x - 1, p.y - h - 0.5);
        ctx.stroke();

        if (!far) {
          ctx.fillStyle = 'rgba(70,224,200,.55)';
          ctx.beginPath();
          ctx.ellipse(p.x + 7 * sc, p.y - h - 2, 1.5, 1, 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(70,224,200,.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x + 7 * sc, p.y - h - 1);
          ctx.lineTo(p.x + 7 * sc, p.y + 0.5);
          ctx.stroke();
        }
      } else if (it.kind === 'lander') {
        // упавший грузовой модуль: полузанесённый корпус с бороздой
        const s = 2.0 * sc;
        ctx.fillStyle = 'rgba(54,24,14,.22)';
        ctx.beginPath();
        ctx.ellipse(p.x + 5 * sc, p.y + 2 * sc, 36 * sc, 10 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(86,40,22,.16)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3 * sc, p.y + 3 * sc, 44 * sc, 13 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();

        // стойка/опора, торчащая из грунта
        ctx.strokeStyle = PAL.metalDark;
        ctx.lineWidth = 2.4 * sc;
        ctx.beginPath();
        ctx.moveTo(p.x - 15 * sc, p.y - 4 * sc);
        ctx.lineTo(p.x - 21 * sc, p.y + 3 * sc);
        ctx.moveTo(p.x + 9 * sc, p.y - 3 * sc);
        ctx.lineTo(p.x + 14 * sc, p.y + 3 * sc);
        ctx.stroke();

        ctx.save();
        ctx.translate(p.x, p.y - 6 * sc);
        ctx.rotate(-0.24);
        uBox(ctx, -24 * s, -8 * s, 42 * s, 16 * s, 7 * s, PAL.metalDark);
        uBox(ctx, -21 * s, -6.4 * s, 34 * s, 11 * s, 5 * s, PAL.metal);
        // носовой обтекатель
        ctx.fillStyle = PAL.metalLight;
        ctx.beginPath();
        ctx.ellipse(17 * s, 0, 7 * s, 6 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // ржавая заплатка и бирюзовое окно
        ctx.fillStyle = PAL.rust;
        ctx.fillRect(-13 * s, -5.6 * s, 8 * s, 10 * s);
        ctx.fillStyle = PAL.glass;
        ctx.fillRect(3 * s, -4.4 * s, 7 * s, 2.6 * s);
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.fillRect(3.4 * s, -4.1 * s, 4.6 * s, 0.7 * s);
        // оторванный стабилизатор
        poly(ctx, [
          { x: -19 * s, y: -7 * s },
          { x: -27 * s, y: -13 * s },
          { x: -14 * s, y: -9 * s }
        ], PAL.rust);
        ctx.restore();

        if (!far) {
          // мелкие обломки вокруг
          spot(ctx, p.x - 28 * sc, p.y + 5 * sc, 1.6 * sc, PAL.metalDark);
          spot(ctx, p.x + 24 * sc, p.y + 4 * sc, 1.2 * sc, PAL.rust);
          ctx.strokeStyle = 'rgba(60,28,14,.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - 30 * sc, p.y + 6 * sc);
          ctx.lineTo(p.x + 26 * sc, p.y + 8 * sc);
          ctx.stroke();
        }
      } else if (it.kind === 'boulderBig') {
        // большой камень-валун: несколько граней и глубокая тень
        const rr = 28 * sc;
        ctx.fillStyle = 'rgba(54,24,14,.22)';
        ctx.beginPath();
        ctx.ellipse(p.x + 4 * sc, p.y + 2 * sc, rr * 1.05, rr * 0.42 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.stoneDark;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4 * sc, rr, rr * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        poly(ctx, [
          { x: p.x - rr * 0.82, y: p.y - 5 * sc },
          { x: p.x - rr * 0.3, y: p.y - rr * 0.8 },
          { x: p.x + rr * 0.55, y: p.y - rr * 0.6 },
          { x: p.x + rr * 0.82, y: p.y - 3 * sc }
        ], PAL.stone);
        poly(ctx, [
          { x: p.x - rr * 0.46, y: p.y - rr * 0.74 },
          { x: p.x - rr * 0.04, y: p.y - rr * 0.98 },
          { x: p.x + rr * 0.42, y: p.y - rr * 0.6 },
          { x: p.x - rr * 0.16, y: p.y - rr * 0.35 }
        ], PAL.stoneLight);
        ctx.strokeStyle = 'rgba(56,34,24,.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - rr * 0.18, p.y - rr * 0.8);
        ctx.lineTo(p.x + rr * 0.06, p.y - rr * 0.34);
        ctx.lineTo(p.x - rr * 0.16, p.y - rr * 0.05);
        ctx.stroke();
        if (!far) {
          spot(ctx, p.x - rr * 0.7, p.y + 1, 3 * sc, PAL.stoneDark);
          spot(ctx, p.x + rr * 0.72, p.y + 2, 2.2 * sc, PAL.stone);
        }
      } else if (it.kind === 'dishBig') {
        // большая антенна дальней связи с тарелкой
        const h = 44 * sc;
        ctx.fillStyle = 'rgba(54,24,14,.2)';
        ctx.beginPath();
        ctx.ellipse(p.x + 2 * sc, p.y + 2 * sc, 18 * sc, 6 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = PAL.metalDark;
        ctx.lineWidth = 2.2 * sc;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - h);
        ctx.moveTo(p.x, p.y - h * 0.4);
        ctx.lineTo(p.x - 8 * sc, p.y);
        ctx.moveTo(p.x, p.y - h * 0.4);
        ctx.lineTo(p.x + 8 * sc, p.y);
        ctx.stroke();
        ctx.save();
        ctx.translate(p.x + 2 * sc, p.y - h);
        ctx.rotate(-0.5);
        ctx.fillStyle = PAL.metalDark;
        ctx.beginPath();
        ctx.ellipse(0, 1.4 * sc, 16 * sc, 8.5 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAL.metalLight;
        ctx.beginPath();
        ctx.ellipse(-0.6 * sc, 0, 14.2 * sc, 7.3 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = LAB_BLUE_DARK;
        ctx.beginPath();
        ctx.ellipse(0, 0.2 * sc, 11 * sc, 5.4 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,233,255,.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0.2 * sc, 7.4 * sc, 3.4 * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = PAL.metalLight;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, 0.2 * sc);
        ctx.lineTo(10 * sc, -4 * sc);
        ctx.stroke();
        spot(ctx, 10 * sc, -4.2 * sc, 1.2 * sc, PAL.cold);
        ctx.restore();
        if (!far) {
          spot(ctx, p.x, p.y - h - 1, 1.6 * sc, PAL.cyan);
          ctx.strokeStyle = 'rgba(70,224,200,.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x + 2 * sc, p.y - h, 20 * sc, -2.4, -0.7);
          ctx.stroke();
        }
      } else {
        // пыльный вихрь
        ctx.fillStyle = 'rgba(54,24,14,.10)';
        ctx.beginPath();
        ctx.ellipse(p.x + 1, p.y + 0.8, 7 * sc, 2.2 * sc * GK, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,185,138,.2)';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          const rr = (3 + k * 3) * sc;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 2 - k, rr, rr * 0.4, 0, Math.PI * 0.15, Math.PI * 1.2);
          ctx.stroke();
        }
        if (!far) {
          ctx.fillStyle = 'rgba(232,185,138,.06)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 0.5, 7 * sc, 2 * sc * GK, 0, 0, Math.PI * 2);
          ctx.fill();
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

  /* ---------- пыль и плиты под ядром базы ----------
     Лёгкий тёплый ореол и несколько плоских плит у командного центра.
     Рисуется только в деревне, поверх грунта и под постройками. */
  function drawCoreApron(ctx, list) {
    if (!list || !list.length) return;
    let th = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.dead) continue;
      if (b.type === 'townhall') { th = b; break; }
    }
    if (!th) return;

    const p = P(th.x + th.w / 2, th.y + th.h / 2);
    const R = TW * 3.5;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, GQ);
    const g = ctx.createRadialGradient(0, 0, TW * 0.35, 0, 0, R);
    g.addColorStop(0, 'rgba(255,196,148,.075)');
    g.addColorStop(0.55, 'rgba(236,156,108,.035)');
    g.addColorStop(1, 'rgba(236,156,108,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // плоские плиты по периметру пятна: не бросаются в глаза, но база
    // перестаёт «плавать» на бесконечном грунте
    const slabs = [
      [th.x - 0.92, th.y + 0.12, 0.82, 0.72],
      [th.x + th.w - 0.02, th.y + 0.15, 0.78, 0.68],
      [th.x - 0.86, th.y + th.h - 0.12, 0.74, 0.64],
      [th.x + th.w + 0.04, th.y + th.h - 0.08, 0.7, 0.62],
      [th.x + 0.55, th.y + th.h + 0.04, 0.9, 0.66],
      [th.x + 0.7, th.y - 0.62, 0.78, 0.58]
    ];
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      const a = P(s[0], s[1]);
      const b = P(s[0] + s[2], s[1]);
      const c = P(s[0] + s[2], s[1] + s[3]);
      const d = P(s[0], s[1] + s[3]);
      ctx.fillStyle = 'rgba(120,88,70,.20)';
      diamond(ctx, a, b, c, d);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,190,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // пара тонких трещин у плит
    ctx.strokeStyle = 'rgba(66,28,14,.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const a = P(th.x - 1.1 + i * 3.5, th.y + th.h + 0.5 + i * 0.6);
      ctx.beginPath();
      ctx.moveTo(a.x - 16, a.y + 2);
      ctx.lineTo(a.x - 2, a.y - 3);
      ctx.lineTo(a.x + 12, a.y + 1);
      ctx.stroke();
    }
  }

  /* ---------- боевые силуэты по краям арены ----------
     Пять крупных объектов вне игрового поля: обломки техники, скалы и
     мёртвые антенны. Печём каждый силуэт один раз в маленький canvas и
     дальше только блитим — кадр почти не дорожает. */
  const battleEdgeCache = new Map();

  function paintBattleEdge(ctx, kind) {
    // Контактная тень под любым силуэтом.
    ctx.fillStyle = 'rgba(48,22,13,.24)';
    ctx.beginPath();
    ctx.ellipse(2, 2, kind === 'spire' || kind === 'arch' ? 30 : 36, 9 * GK, 0, 0, Math.PI * 2);
    ctx.fill();

    if (kind === 'crawler') {
      // брошенный гусеничный ровер
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-30, -13, 58, 12, 4) : ctx.rect(-30, -13, 58, 12);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? PAL.metal : PAL.dark;
        ctx.beginPath();
        ctx.arc(-23 + i * 14, -7, 4.6, 0, Math.PI * 2);
        ctx.fill();
      }
      poly(ctx, [
        { x: -25, y: -15 }, { x: -10, y: -30 }, { x: 17, y: -27 },
        { x: 25, y: -16 }, { x: 9, y: -11 }, { x: -18, y: -12 }
      ], PAL.metal);
      poly(ctx, [
        { x: -10, y: -29 }, { x: 4, y: -38 }, { x: 15, y: -35 },
        { x: 18, y: -27 }
      ], shade(PAL.metal, -0.12));
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(-6, -27, 9, 4);
      ctx.fillStyle = PAL.rust;
      ctx.fillRect(-21, -20, 8, 5);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(14, -30);
      ctx.lineTo(27, -44);
      ctx.lineTo(34, -42);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(70,224,200,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-27, -8, 9, 2.6, 4.6);
      ctx.stroke();
    } else if (kind === 'spire') {
      // скальный выступ
      poly(ctx, [
        { x: -26, y: 0 }, { x: -20, y: -26 }, { x: -8, y: -55 },
        { x: 4, y: -46 }, { x: 20, y: -62 }, { x: 27, y: -22 },
        { x: 31, y: 0 }
      ], PAL.stoneDark);
      poly(ctx, [
        { x: -20, y: -26 }, { x: -8, y: -55 }, { x: 4, y: -46 },
        { x: 2, y: -8 }, { x: -15, y: 0 }
      ], PAL.stone);
      poly(ctx, [
        { x: 4, y: -46 }, { x: 20, y: -62 }, { x: 27, y: -22 },
        { x: 15, y: -10 }
      ], PAL.stoneLight);
      ctx.strokeStyle = 'rgba(56,34,24,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, -42);
      ctx.lineTo(2, -25);
      ctx.lineTo(-6, -10);
      ctx.stroke();
    } else if (kind === 'tower') {
      // сухая антенна связи
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -68);
      ctx.moveTo(0, -35);
      ctx.lineTo(-16, 0);
      ctx.moveTo(0, -35);
      ctx.lineTo(16, 0);
      for (let i = 0; i < 3; i++) {
        const y = -18 - i * 15;
        ctx.moveTo(-9, y);
        ctx.lineTo(9, y - 7);
      }
      ctx.stroke();
      ctx.fillStyle = PAL.metal;
      ctx.beginPath();
      ctx.ellipse(-8, -61, 12, 5, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(-8, -61, 8, 3, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, -61);
      ctx.lineTo(-16, -70);
      ctx.stroke();
      spot(ctx, -16, -71, 1.5, 'rgba(210,80,60,.5)');
    } else if (kind === 'pod') {
      // полузарытый грузовой модуль
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(-0.18);
      ctx.fillStyle = 'rgba(86,40,22,.18)';
      ctx.beginPath();
      ctx.ellipse(2, 8, 34, 10 * GK, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(0, 0, 27, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metal;
      ctx.beginPath();
      ctx.ellipse(-2, -2, 25, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.rust;
      ctx.fillRect(-19, -8, 10, 13);
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(7, -6, 10, 4);
      // открытая крышка
      poly(ctx, [
        { x: -12, y: -13 }, { x: 12, y: -18 }, { x: 21, y: -32 },
        { x: 2, y: -27 }
      ], shade(PAL.metal, -0.16));
      ctx.restore();
      spot(ctx, -12, -13, 1.5, 'rgba(70,224,200,.35)');
    } else {
      // каменная арка
      poly(ctx, [
        { x: -30, y: 0 }, { x: -32, y: -30 }, { x: -20, y: -48 },
        { x: -8, y: -40 }, { x: -8, y: 0 }
      ], PAL.stoneDark);
      poly(ctx, [
        { x: 10, y: 0 }, { x: 9, y: -34 }, { x: 20, y: -47 },
        { x: 32, y: -30 }, { x: 30, y: 0 }
      ], PAL.stone);
      poly(ctx, [
        { x: -20, y: -48 }, { x: -5, y: -54 }, { x: 14, y: -49 },
        { x: 20, y: -47 }, { x: 7, y: -40 }, { x: -8, y: -40 }
      ], PAL.stoneLight);
      ctx.strokeStyle = 'rgba(56,34,24,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, -38);
      ctx.lineTo(12, -23);
      ctx.lineTo(18, -12);
      ctx.stroke();
    }
  }

  function battleEdgeSprite(kind) {
    if (battleEdgeCache.has(kind)) return battleEdgeCache.get(kind);
    const W = 120;
    const H = 100;
    const AX = 60;
    const AY = 88;
    let sp = null;
    try {
      const c = makeCanvas(W * 2, H * 2);
      const cx = c.getContext('2d');
      cx.setTransform(2, 0, 0, 2, AX * 2, AY * 2);
      paintBattleEdge(cx, kind);
      sp = { canvas: c, ax: AX, ay: AY, w: W, h: H };
    } catch (e) {
      sp = null;
    }
    battleEdgeCache.set(kind, sp);
    return sp;
  }

  const BATTLE_EDGES = [
    { kind: 'crawler', gx: -2.7, gy: 4.8, s: 1.05 },
    { kind: 'spire', gx: G * 0.48, gy: -2.7, s: 1.0 },
    { kind: 'tower', gx: G + 2.7, gy: G * 0.4, s: 1.0 },
    { kind: 'pod', gx: G * 0.7, gy: G + 2.6, s: 1.0 },
    { kind: 'arch', gx: -2.6, gy: G * 0.72, s: 1.0 }
  ];

  // У базы — свой спокойный реквизит у кромки: модуль, скала и антенна.
  const BASE_EDGES = [
    { kind: 'pod', gx: -2.8, gy: G * 0.44, s: 1.15 },
    { kind: 'arch', gx: G * 0.78, gy: -2.8, s: 0.95 },
    { kind: 'tower', gx: G + 2.8, gy: G * 0.33, s: 1.05 }
  ];

  function drawEdgeProps(ctx, battle) {
    // Пыльная дымка у дальних краёв арены: несколько мягких пятен.
    if (battle) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = 'rgba(236,196,152,1)';
      const haze = [P(G * 0.28, -2.3), P(G * 0.7, -2.6), P(-2.1, G * 0.34)];
      for (let i = 0; i < haze.length; i++) {
        ctx.beginPath();
        ctx.ellipse(haze[i].x, haze[i].y - 10, 46, 12 * GK, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const list = battle ? BATTLE_EDGES : BASE_EDGES;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const p = P(it.gx, it.gy);
      if (!pointVisible(p.x, p.y, 100)) continue;
      const sp = battleEdgeSprite(it.kind);
      if (!sp) continue;
      const w = sp.w * it.s;
      const h = sp.h * it.s;
      ctx.drawImage(sp.canvas, p.x - sp.ax * it.s, p.y - sp.ay * it.s, w, h);
    }
  }

  const lightCache = { key: '', canvas: null };

  // Тёплый ключевой свет сверху-слева и мягкий холодный уход вправо-вниз.
  // Один закэшированный прямоугольник на кадр: интерфейс не затрагивается,
  // потому что слой лежит на canvas под DOM-HUD.
  function drawLightPass(ctx, view) {
    const key = view.w + 'x' + view.h;

    if (lightCache.key !== key || !lightCache.canvas) {
      try {
        const c = makeCanvas(view.w, view.h);
        const cx = c.getContext('2d');
        const g = cx.createLinearGradient(0, 0, view.w * 0.92, view.h);
        g.addColorStop(0, 'rgba(255,214,160,.10)');
        g.addColorStop(0.36, 'rgba(255,214,160,.025)');
        g.addColorStop(0.62, 'rgba(28,44,52,.015)');
        g.addColorStop(1, 'rgba(20,34,42,.07)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, view.w, view.h);

        // тёплый контровой свет: мягкое пятно сверху-слева
        const warm = cx.createRadialGradient(
          view.w * 0.18, view.h * 0.08, 0,
          view.w * 0.18, view.h * 0.08, Math.max(view.w, view.h) * 0.55);
        warm.addColorStop(0, 'rgba(255,196,132,.055)');
        warm.addColorStop(0.45, 'rgba(255,186,122,.02)');
        warm.addColorStop(1, 'rgba(255,186,122,0)');
        cx.fillStyle = warm;
        cx.fillRect(0, 0, view.w, view.h);

        const b = cx.createLinearGradient(0, view.h * 0.68, 0, view.h);
        b.addColorStop(0, 'rgba(24,12,8,0)');
        b.addColorStop(1, 'rgba(24,12,8,.10)');
        cx.fillStyle = b;
        cx.fillRect(0, 0, view.w, view.h);

        lightCache.canvas = c;
        lightCache.key = key;
      } catch (e) {
        lightCache.canvas = null;
      }
    }

    if (lightCache.canvas) ctx.drawImage(lightCache.canvas, 0, 0, view.w, view.h);
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
        g.addColorStop(0.62, 'rgba(46,22,14,.045)');
        g.addColorStop(1, 'rgba(46,20,12,.18)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, view.w, view.h);
        // Края кадра чуть темнее и плотнее, центр остаётся спокойным.
        const edgeV = cx.createLinearGradient(0, 0, 0, view.h);
        edgeV.addColorStop(0, 'rgba(44,18,10,.07)');
        edgeV.addColorStop(0.14, 'rgba(44,18,10,0)');
        edgeV.addColorStop(0.86, 'rgba(44,18,10,0)');
        edgeV.addColorStop(1, 'rgba(44,18,10,.08)');
        cx.fillStyle = edgeV;
        cx.fillRect(0, 0, view.w, view.h);
        const edgeH = cx.createLinearGradient(0, 0, view.w, 0);
        edgeH.addColorStop(0, 'rgba(44,18,10,.06)');
        edgeH.addColorStop(0.16, 'rgba(44,18,10,0)');
        edgeH.addColorStop(0.84, 'rgba(44,18,10,0)');
        edgeH.addColorStop(1, 'rgba(44,18,10,.07)');
        cx.fillStyle = edgeH;
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
      g.addColorStop(0.62, 'rgba(46,22,14,.045)');
      g.addColorStop(1, 'rgba(46,20,12,.18)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
      const edgeV = ctx.createLinearGradient(0, 0, 0, view.h);
      edgeV.addColorStop(0, 'rgba(44,18,10,.07)');
      edgeV.addColorStop(0.14, 'rgba(44,18,10,0)');
      edgeV.addColorStop(0.86, 'rgba(44,18,10,0)');
      edgeV.addColorStop(1, 'rgba(44,18,10,.08)');
      ctx.fillStyle = edgeV;
      ctx.fillRect(0, 0, view.w, view.h);
      const edgeH = ctx.createLinearGradient(0, 0, view.w, 0);
      edgeH.addColorStop(0, 'rgba(44,18,10,.06)');
      edgeH.addColorStop(0.16, 'rgba(44,18,10,0)');
      edgeH.addColorStop(0.84, 'rgba(44,18,10,0)');
      edgeH.addColorStop(1, 'rgba(44,18,10,.07)');
      ctx.fillStyle = edgeH;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* ---------- стены ---------- */

  let wallRunCache = { src: null, alive: -1, lvl: -1, sig: 0, runs: [] };

  // Прогоны нужны только для газонов и полосок HP: форму стыков они больше
  // не задают — её считает wallCells() по соседям ±x/±y.
  function wallRuns(buildings) {
    const map = {};
    let count = 0;
    let top = 1;
    let sig = 0;

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.dead || b.type !== 'wall') continue;
      map[b.x + ',' + b.y] = b;
      count++;
      const l = levelOf(b);
      sig = (sig * 31 + b.x * 37 + b.y * 11 + l) | 0;
      if (l > top) top = l;
    }
    if (!count) return [];

    // Тот же массив (бой), то же число стен и та же раскладка — не пересчитываем.
    if (wallRunCache.src === buildings && wallRunCache.alive === count &&
      wallRunCache.lvl === top && wallRunCache.sig === sig) {
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
          x: x, y: y, w: len, h: 1, cells: cells, lvl: runLevel(cells)
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
          x: x, y: y, w: 1, h: len, cells: cells, lvl: runLevel(cells)
        });
        y += len - 1;
      }
    }

    wallRunCache = { src: buildings, alive: count, lvl: top, sig: sig, runs: runs };
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

  /* ---------- стены: соседние клетки ---------- */

  // Стена ниже пояса построек: центр, склады и турели читаются поверх.
  // Высота растёт ступенями 1.1 px (L1-10) и мягче дальше (L11-20):
  // L1 — тонкая загородка, L10 — высокая усиленная секция, L20 — пилон
  // с золотым навершием, но верх всё равно ниже крыши склада.
  function wallHeight(lvl) {
    const l = Math.max(1, Math.min(WALL_MAX, Math.round(lvl || 1)));
    return 10.5 + Math.min(l - 1, 9) * 1.1 + Math.max(0, l - 10) * 0.75;
  }

  // Самая верхняя точка стены над землёй: для спрайта, отсечения и HP.
  // Уровни добавляют козырьки и навершия, поэтому лестница читается и по
  // «шапке», а не только по высоте поля.
  function wallTopPx(lvl) {
    const l = Math.max(1, Math.min(WALL_MAX, Math.round(lvl || 1)));
    const H = wallHeight(l);
    let top = H + 1.9;                            // верхняя рейка и светлая кромка
    if (l >= 5) top = Math.max(top, H + 2.9);     // золотой козырёк
    if (l >= 7) top = Math.max(top, H + 3.9);     // вторая рейка на стойках
    if (l >= 9) top = Math.max(top, H + 3.3);     // золотая рейка
    if (l >= 10) top = Math.max(top, H + 5.0);    // золотое навершие
    if (l >= 12) top = Math.max(top, H + 5.8);    // парные эмиттеры
    if (l >= 14) top = Math.max(top, H + 6.4);    // гребень поля
    if (l >= 16) top = Math.max(top, H + 7.2);    // шипы-разрядники
    if (l >= 18) top = Math.max(top, H + 8.4);    // золотое навершие пилона
    if (l >= 19) top = Math.max(top, H + 9.0);    // ступень TH18: второй контур
    if (l >= 20) top = Math.max(top, H + 9.8);    // ступень TH19: корона и лучи
    return top;
  }

  // Соседи только по сетке: ±x и ±y. Бит входит в ключ спрайта.
  const WALL_DIRS = [
    { dx: 1, dy: 0, bit: 1 },    // +x
    { dx: -1, dy: 0, bit: 2 },   // -x
    { dx: 0, dy: 1, bit: 4 },    // +y
    { dx: 0, dy: -1, bit: 8 }    // -y
  ];

  let wallStats = {
    cells: 0, arms: 0, posts: 0, straight: 0, corners: 0,
    ends: 0, tees: 0, cross: 0, isolated: 0, maxTop: 0
  };

  /* Одна запись на клетку стены. Соседей берём из карты живых стен:
     клетка на стыке L/T/креста получает общий набор плеч и ровно один столб.
     Прогоны (wallRuns) остаются только для газонов и полосок HP. */
  function wallCells(buildings) {
    const map = Object.create(null);
    let n = 0;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.dead || b.type !== 'wall') continue;
      map[b.x + ',' + b.y] = b;
      n++;
    }

    const out = [];
    let arms = 0;
    let posts = 0;
    let straight = 0;
    let corners = 0;
    let ends = 0;
    let tees = 0;
    let cross = 0;
    let isolated = 0;
    let maxTop = 0;

    for (const k in map) {
      const b = map[k];
      const x = b.x;
      const y = b.y;
      let bits = 0;
      let deg = 0;

      for (let d = 0; d < WALL_DIRS.length; d++) {
        const dir = WALL_DIRS[d];
        if (map[(x + dir.dx) + ',' + (y + dir.dy)]) {
          bits |= dir.bit;
          deg++;
        }
      }

      // Столб: один на клетку. У прямой его нет, у конца — на свободной
      // стороне, у угла/T/креста — в центре.
      let post = 'center';
      if (deg === 0) {
        isolated++;
      } else if (deg === 1) {
        ends++;
        post = 'end';
      } else if (deg === 2) {
        if (bits === 3 || bits === 12) {
          straight++;
          post = 'none';
        } else {
          corners++;
        }
      } else if (deg === 3) {
        tees++;
      } else {
        cross++;
      }

      const lvl = levelOf(b);
      if (wallTopPx(lvl) > maxTop) maxTop = wallTopPx(lvl);
      arms += deg === 0 ? 4 : deg;
      if (post !== 'none') posts++;

      out.push({
        x: x, y: y, w: 1, h: 1, cells: [b], lvl: lvl,
        bits: bits, deg: deg, post: post
      });
    }

    wallStats = {
      cells: n, arms: arms, posts: posts, straight: straight,
      corners: corners, ends: ends, tees: tees, cross: cross,
      isolated: isolated, maxTop: maxTop
    };
    return out;
  }

  /* Клетка стены — статичный спрайт. Плечи идут от центра клетки до
     середины общей грани; у соседа точно такое же плечо навстречу, поэтому
     линия непрерывна, а столб на стыке один. */
  const wallSpriteCache = new Map();
  let wallSpriteLod = -1;

  function wallSprite(r) {
    // разные LOD не держим одновременно: иначе кэш растёт на сотни канв
    if (wallSpriteLod !== lod) {
      wallSpriteCache.clear();
      wallSpriteLod = lod;
    }

    const key = 'wc|' + r.lvl + '|' + (r.bits | 0) + '|' + lod;
    if (wallSpriteCache.has(key)) return wallSpriteCache.get(key);

    const left = 48;
    const top = 58;
    const cw = 96;
    const ch = 104;
    const ss = lod === 0 ? 1 : 1.5;

    let sp = null;
    try {
      const c = makeCanvas(cw * ss, ch * ss);
      const cx = c.getContext('2d');
      cx.setTransform(ss, 0, 0, ss, left * ss, top * ss);
      drawWallCellVector(cx, {
        x: 0, y: 0, w: 1, h: 1, lvl: r.lvl,
        bits: r.bits | 0, deg: r.deg | 0, post: r.post
      });
      sp = { canvas: c, left: left, top: top, w: cw, h: ch };
    } catch (e) {
      sp = null;
    }

    wallSpriteCache.set(key, sp);
    return sp;
  }

  // Концы плеча в экранных координатах: центр клетки → середина грани.
  function wallArmPoints(r, dirIndex) {
    const dir = WALL_DIRS[dirIndex];
    return {
      a: P(r.x + 0.5, r.y + 0.5),
      b: P(r.x + 0.5 + dir.dx * 0.5, r.y + 0.5 + dir.dy * 0.5)
    };
  }

  function drawWallArm(ctx, a, b, H, lvl) {
    const L = Math.max(1, Math.min(WALL_MAX, Math.round(lvl || 1)));
    // масса растёт до 10 уровня, дальше добавляются слои, а не ширина
    const t = (Math.min(L, 10) - 1) / 9;

    // масса растёт с уровнем: фундамент и верхняя рейка толстеют
    const baseH = 2.0 + t * 2.4;
    const railW = 1.05 + t * 2.1;

    // L1 — простое бирюзовое поле; L5 — плотнее и с золотом;
    // L9-10 — ярче и теплее, с золотыми рейками.
    const field = L >= 9
      ? 'rgba(106,246,226,.34)'
      : (L >= 5 ? 'rgba(70,224,200,.31)' : 'rgba(70,224,200,.19)');
    const lowerEdge = L >= 9
      ? PAL.gold
      : (L >= 5 ? 'rgba(255,207,74,.8)' : 'rgba(70,224,200,.62)');

    // тёмное основание: держит низ поля и закрывает щель у земли
    poly(ctx, [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: b.x, y: b.y - baseH },
      { x: a.x, y: a.y - baseH }
    ], L >= 7 ? 'rgba(32,38,42,.96)' : 'rgba(40,46,50,.92)');

    // светлая полка фундамента: с 3 уровня видно «постамент»
    if (L >= 3) {
      ctx.strokeStyle = L >= 9 ? 'rgba(255,207,74,.42)' : 'rgba(154,167,173,.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - baseH);
      ctx.lineTo(b.x, b.y - baseH);
      ctx.stroke();
    }

    // энергополе до самой грани клетки
    poly(ctx, [
      { x: a.x, y: a.y - baseH },
      { x: b.x, y: b.y - baseH },
      { x: b.x, y: b.y - H },
      { x: a.x, y: a.y - H }
    ], field);

    // яркая сердцевина поля: полоса в верхней трети, без градиента
    if (L >= 4) {
      const lo = baseH + (H - baseH) * 0.34;
      const hi = H - (H - baseH) * 0.1;
      poly(ctx, [
        { x: a.x, y: a.y - lo },
        { x: b.x, y: b.y - lo },
        { x: b.x, y: b.y - hi },
        { x: a.x, y: a.y - hi }
      ], L >= 9 ? 'rgba(232,255,250,.1)' : 'rgba(210,255,248,.06)');
    }

    // нижняя кромка поля
    ctx.strokeStyle = lowerEdge;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - baseH);
    ctx.lineTo(b.x, b.y - baseH);
    ctx.stroke();

    // сетка поля: число линий — ещё один признак уровня
    const lines = L >= 9 ? 3 : (L >= 6 ? 2 : (L >= 3 ? 1 : 0));
    if (lines) {
      ctx.strokeStyle = L >= 9
        ? 'rgba(255,207,74,.3)'
        : (L >= 5 ? 'rgba(255,207,74,.22)' : 'rgba(70,224,200,.22)');
      ctx.lineWidth = L >= 7 ? 0.9 : 0.8;
      ctx.beginPath();
      for (let k = 1; k <= lines; k++) {
        const v = baseH + (H - baseH) * k / (lines + 1);
        ctx.moveTo(a.x, a.y - v);
        ctx.lineTo(b.x, b.y - v);
      }
      ctx.stroke();
    }

    // верхняя рейка: тёмный металл и светлая кромка
    ctx.strokeStyle = L >= 9 ? shade(PAL.gold, -0.42) : PAL.metalDark;
    ctx.lineWidth = near() ? railW : Math.max(1.2, railW * 0.8);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - H);
    ctx.lineTo(b.x, b.y - H);
    ctx.stroke();

    ctx.strokeStyle = L >= 9 ? PAL.gold : PAL.metalLight;
    ctx.lineWidth = L >= 5 ? 1.1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - H - 0.8);
    ctx.lineTo(b.x, b.y - H - 0.8);
    ctx.stroke();

    // 5+: золотой козырёк под рейкой — стык читается как «усиленный»
    if (L >= 5) {
      ctx.strokeStyle = L >= 9 ? 'rgba(255,207,74,.9)' : 'rgba(255,207,74,.62)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H + 1.3);
      ctx.lineTo(b.x, b.y - H + 1.3);
      ctx.stroke();
    }

    // 6+: световая кромка у основания
    if (L >= 6) {
      ctx.strokeStyle = L >= 9 ? 'rgba(255,207,74,.6)' : 'rgba(127,233,255,.42)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - baseH - 1);
      ctx.lineTo(b.x, b.y - baseH - 1);
      ctx.stroke();
    }

    // 7+: вторая рейка над полем на коротких стойках
    if (L >= 7) {
      ctx.strokeStyle = L >= 9 ? 'rgba(255,207,74,.82)' : 'rgba(154,167,173,.65)';
      ctx.lineWidth = L >= 9 ? 1.3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 2.9);
      ctx.lineTo(b.x, b.y - H - 2.9);
      ctx.stroke();

      // стойки: позиции 1/3 и 2/3 совпадают у соседней клетки, поэтому
      // стык не даёт двойного частокола
      ctx.strokeStyle = 'rgba(154,167,173,.5)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 1; k <= 2; k++) {
        const u = k / 3;
        const px = a.x + (b.x - a.x) * u;
        const py = a.y + (b.y - a.y) * u;
        ctx.moveTo(px, py - H);
        ctx.lineTo(px, py - H - 2.9);
      }
      ctx.stroke();
    }

    // 8+: эмиттеры на рейке — по одному на грань, ровно в середине
    if (L >= 8) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      spot(ctx, mx, my - H - 1.2, 0.8, L >= 9 ? PAL.gold : PAL.cold);
    }

    // 10: тёплая золотая полоса между рейками
    if (L >= 10) {
      poly(ctx, [
        { x: a.x, y: a.y - H - 1.5 },
        { x: b.x, y: b.y - H - 1.5 },
        { x: b.x, y: b.y - H - 2.7 },
        { x: a.x, y: a.y - H - 2.7 }
      ], 'rgba(255,207,74,.2)');
    }

    /* --- 11-18: барьер переходит в «силовой пилон» ---
       Ширина и высота почти не растут: новые ступени читаются слоями —
       второй контур поля, рёбра, разрядники и золото. */
    if (L >= 12) {
      const v0 = baseH + (H - baseH) * 0.18;
      const v1 = H - (H - baseH) * 0.18;
      poly(ctx, [
        { x: a.x, y: a.y - v0 },
        { x: b.x, y: b.y - v0 },
        { x: b.x, y: b.y - v1 },
        { x: a.x, y: a.y - v1 }
      ], L >= 16 ? 'rgba(127,233,255,.10)' : 'rgba(70,224,200,.08)');
    }

    if (L >= 13) {
      // косые рёбра поля: поток энергии читается как движение
      ctx.strokeStyle = 'rgba(154,231,255,.32)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const u0 = 0.12 + k * 0.3;
        const u1 = Math.min(0.98, u0 + 0.2);
        const x0 = a.x + (b.x - a.x) * u0;
        const y0 = a.y + (b.y - a.y) * u0;
        const x1 = a.x + (b.x - a.x) * u1;
        const y1 = a.y + (b.y - a.y) * u1;
        ctx.moveTo(x0, y0 - H + 1.5);
        ctx.lineTo(x1, y1 - baseH - 1.5);
      }
      ctx.stroke();
    }

    if (L >= 14) {
      // гребень поля: тонкая яркая полоса чуть ниже верхней рейки
      ctx.strokeStyle = L >= 17 ? 'rgba(255,240,200,.8)' : 'rgba(196,255,250,.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H + 2.4);
      ctx.lineTo(b.x, b.y - H + 2.4);
      ctx.stroke();
    }

    if (L >= 16) {
      // разрядники: короткие шипы над рейкой в четвертях плеча
      ctx.strokeStyle = L >= 17 ? PAL.gold : PAL.metalLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k <= 3; k += 2) {
        const u = k / 4;
        const px = a.x + (b.x - a.x) * u;
        const py = a.y + (b.y - a.y) * u;
        ctx.moveTo(px, py - H - 2.6);
        ctx.lineTo(px, py - H - 5.1);
      }
      ctx.stroke();
    }

    if (L >= 18) {
      // верх лестницы: золотая полоса и белое ядро поля
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 4.2);
      ctx.lineTo(b.x, b.y - H - 4.2);
      ctx.stroke();
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      spot(ctx, mx, my - H + 0.4, 1.3, 'rgba(255,252,232,.95)');
    }

    // 19-20: ступени TH18-19. Поле не расширяем — добавляем второй
    // золотой контур и короткие лучи над рейкой, чтобы апгрейд читался.
    if (L >= 19) {
      poly(ctx, [
        { x: a.x, y: a.y - H - 4.9 },
        { x: b.x, y: b.y - H - 4.9 },
        { x: b.x, y: b.y - H - 5.7 },
        { x: a.x, y: a.y - H - 5.7 }
      ], 'rgba(255,207,74,.34)');
      ctx.strokeStyle = 'rgba(255,244,205,.8)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H - 5.9);
      ctx.lineTo(b.x, b.y - H - 5.9);
      ctx.stroke();
    }

    if (L >= 20) {
      // короткие золотые лучи в третях: только верхняя ступень
      ctx.strokeStyle = 'rgba(255,232,170,.85)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 1; k <= 2; k++) {
        const u = k / 3;
        const px = a.x + (b.x - a.x) * u;
        const py = a.y + (b.y - a.y) * u;
        ctx.moveTo(px - 1.6, py - H - 6.1);
        ctx.lineTo(px, py - H - 7.4);
        ctx.lineTo(px + 1.6, py - H - 6.1);
      }
      ctx.stroke();
    }
  }

  function drawWallCellVector(ctx, r) {
    const lvl = r.lvl || 1;
    const H = wallHeight(lvl);
    const bits = r.bits | 0;

    if (!bits) {
      // одиночная стена — все четыре стороны вокруг одного столба
      for (let d = 0; d < WALL_DIRS.length; d++) {
        const arm = wallArmPoints(r, d);
        drawWallArm(ctx, arm.a, arm.b, H, lvl);
      }
    } else {
      for (let d = 0; d < WALL_DIRS.length; d++) {
        if (!(bits & WALL_DIRS[d].bit)) continue;
        const arm = wallArmPoints(r, d);
        drawWallArm(ctx, arm.a, arm.b, H, lvl);
      }
    }

    // Один столб на клетку: конец, угол, T/крест или одиночная.
    if (r.post === 'end') {
      // конец пролёта: столб на свободной стороне, напротив единственного соседа
      let fx = r.x + 0.5;
      let fy = r.y + 0.5;
      for (let d = 0; d < WALL_DIRS.length; d++) {
        if (!(bits & WALL_DIRS[d].bit)) continue;
        fx = r.x + 0.5 - WALL_DIRS[d].dx * 0.5;
        fy = r.y + 0.5 - WALL_DIRS[d].dy * 0.5;
        break;
      }
      barrierPost(ctx, fx, fy, H, lvl);
    } else if (r.post !== 'none') {
      barrierPost(ctx, r.x + 0.5, r.y + 0.5, H, lvl);
    }

    // не оставляем round-кэп следующим постройкам
    ctx.lineCap = 'butt';
  }

  function wallPulse(ctx, r) {
    if (lod === 0) return;
    const lvl = Math.max(1, Math.min(WALL_MAX, Math.round(r.lvl || 1)));
    const H = wallHeight(lvl);
    const baseH = 2.0 + ((Math.min(lvl, 10) - 1) / 9) * 2.4;
    const bits = r.bits | 0;
    const pulse = lvl >= 15
      ? 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(t * 3.4 + (r.x + r.y) * 0.8))
      : (lvl >= 10
        ? 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(t * 3 + (r.x + r.y) * 0.8))
        : (lvl >= 5
          ? 0.07 + 0.04 * (0.5 + 0.5 * Math.sin(t * 2.6 + (r.x + r.y) * 0.8))
          : 0.035 + 0.025 * (0.5 + 0.5 * Math.sin(t * 2.2 + (r.x + r.y) * 0.8))));
    const col = lvl >= 17
      ? 'rgba(255,236,190,' + pulse.toFixed(3) + ')'
      : (lvl >= 9
        ? 'rgba(255,207,74,' + pulse.toFixed(3) + ')'
        : 'rgba(70,224,200,' + pulse.toFixed(3) + ')');

    for (let d = 0; d < WALL_DIRS.length; d++) {
      if (bits && !(bits & WALL_DIRS[d].bit)) continue;
      const arm = wallArmPoints(r, d);
      poly(ctx, [
        { x: arm.a.x, y: arm.a.y - baseH },
        { x: arm.b.x, y: arm.b.y - baseH },
        { x: arm.b.x, y: arm.b.y - H },
        { x: arm.a.x, y: arm.a.y - H }
      ], col);
    }
  }

  function drawWallSection(ctx, r) {
    if (!spritesOn || tilePx > 96) {
      drawWallCellVector(ctx, r);
      wallPulse(ctx, r);
      return;
    }

    const sp = wallSprite(r);
    if (!sp) {
      drawWallCellVector(ctx, r);
      wallPulse(ctx, r);
      return;
    }

    const p = P(r.x, r.y);
    ctx.drawImage(sp.canvas, p.x - sp.left, p.y - sp.top, sp.w, sp.h);
    wallPulse(ctx, r);
  }

  function barrierPost(ctx, px, py, H, lvl) {
    const L = Math.max(1, Math.min(WALL_MAX, Math.round(lvl || 1)));
    const t = (Math.min(L, 10) - 1) / 9;

    // столб растёт вместе с секцией: от тонкой тумбы до усиленного пилона
    const half = 0.07 + t * 0.06;
    const baseW = 0.11 + t * 0.06;
    const baseHt = 2.6 + t * 1.8;
    const capH = 1.4 + t * 1.8;

    // тумба
    prism(ctx, px - baseW, py - baseW, px + baseW, py + baseW, 0, baseHt,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // 5+: нижняя броневая юбка — столб «вкопан», а не стоит на грунте
    if (L >= 5) {
      prism(ctx, px - baseW * 1.3, py - baseW * 1.3,
        px + baseW * 1.3, py + baseW * 1.3, 0, baseHt * 0.52,
        L >= 9 ? PAL.gold : PAL.metalLight, PAL.metalDark, PAL.metalDark);
    }

    // невысокий столб
    prism(ctx, px - half, py - half, px + half, py + half, baseHt,
      Math.max(1, H - baseHt),
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // 7+: боковые рёбра жёсткости
    if (L >= 7) {
      prism(ctx, px - half * 1.7, py - 0.03, px - half * 0.8, py + 0.03,
        baseHt, (H - baseHt) * 0.72,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      prism(ctx, px + half * 0.8, py - 0.03, px + half * 1.7, py + 0.03,
        baseHt, (H - baseHt) * 0.72,
        PAL.metalDark, PAL.metal, PAL.metalDark);
    }

    // наконечник
    prism(ctx, px - half * 1.15, py - half * 1.15,
      px + half * 1.15, py + half * 1.15, H, capH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // 1: только тёмная крышка; свет появляется со 2 уровня
    if (L >= 2) {
      ctx.fillStyle = L >= 9 ? PAL.gold : PAL.metalDark;
      ctx.fillRect(px - half * 2.1, py - H - capH * 0.45, half * 4.2, 0.6);
    }

    if (L >= 5) {
      // золотое кольцо под наконечником
      prism(ctx, px - half * 1.35, py - half * 1.35,
        px + half * 1.35, py + half * 1.35, H - 1.2, L >= 10 ? 1.6 : 1.1,
        PAL.gold, PAL.gold, shade(PAL.gold, -0.3));
    }

    if (L >= 3 && L < 5 && mid()) {
      spot(ctx, px, py - H * 0.56, 0.9, PAL.cyan);
    }

    if (L >= 6) {
      // индикаторы по бокам столба
      spot(ctx, px - 0.05, py - H * 0.62, 0.9, PAL.glass);
      if (L >= 8) spot(ctx, px + 0.05, py - H * 0.46, 0.8, PAL.cold);
    }

    if (L >= 8) {
      // короткий эмиттерный шип вместо высокого «маяка»
      ctx.strokeStyle = L >= 9 ? PAL.gold : PAL.metalLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py - H - capH);
      ctx.lineTo(px, py - H - 3.7);
      ctx.stroke();
      spot(ctx, px, py - H - 3.8, 1.1, L >= 9 ? PAL.gold : PAL.cold);
    }

    if (L >= 9) {
      prism(ctx, px - half * 1.25, py - half * 1.25,
        px + half * 1.25, py + half * 1.25, H + capH, 0.7,
        PAL.gold, PAL.gold, shade(PAL.gold, -0.3));
      spot(ctx, px - half * 1.6, py - H - capH * 0.5, 0.75, PAL.cold);
      spot(ctx, px + half * 1.6, py - H - capH * 0.5, 0.75, PAL.cold);
    }

    if (L >= 10) {
      // низкое золотое навершие — верх лестницы, но не мачта
      prism(ctx, px - half * 0.72, py - half * 0.72,
        px + half * 0.72, py + half * 0.72, H + 2.4, 2.6,
        PAL.gold, PAL.gold, shade(PAL.gold, -0.34));
      spot(ctx, px, py - H - 5.0, 1.2, PAL.gold);
      spot(ctx, px, py - H - 5.0, 0.6, 'rgba(255,252,232,.9)');
    }

    /* --- 11-18: пилон обрастает эмиттерами --- */
    if (L >= 12) {
      // второй эмиттер на противоположной стороне столба
      spot(ctx, px - half * 1.7, py - H * 0.72, 0.75, PAL.glass);
      spot(ctx, px + half * 1.7, py - H * 0.72, 0.75, PAL.glass);
    }

    if (L >= 14) {
      // боковые рёбра-крылья: силуэт становится шире только наверху
      poly(ctx, [
        { x: px - half * 1.1, y: py - H + 1 },
        { x: px - half * 3.0, y: py - H - 0.6 },
        { x: px - half * 3.0, y: py - H + 1.4 },
        { x: px - half * 1.1, y: py - H + 3.2 }
      ], shade(PAL.metal, -0.1));
      poly(ctx, [
        { x: px + half * 1.1, y: py - H + 1 },
        { x: px + half * 3.0, y: py - H - 0.6 },
        { x: px + half * 3.0, y: py - H + 1.4 },
        { x: px + half * 1.1, y: py - H + 3.2 }
      ], PAL.metalDark);
    }

    if (L >= 16) {
      // шип-разрядник над навершием
      ctx.strokeStyle = L >= 17 ? PAL.gold : PAL.metalLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py - H - 5.6);
      ctx.lineTo(px, py - H - 7.4);
      ctx.stroke();
      spot(ctx, px, py - H - 7.6, 0.9, PAL.cold);
    }

    if (L >= 18) {
      // завершение: золотое кольцо и белое ядро
      prism(ctx, px - half * 1.5, py - half * 1.5,
        px + half * 1.5, py + half * 1.5, H + 3.2, 0.8,
        PAL.gold, PAL.gold, shade(PAL.gold, -0.3));
      spot(ctx, px, py - H - 5.2, 1.6, 'rgba(255,244,205,.9)');
      spot(ctx, px, py - H - 5.2, 0.8, 'rgba(255,255,255,1)');
    }

    // 19-20: ступени TH18-19 — выше только корона, масса прежняя
    if (L >= 19) {
      prism(ctx, px - half * 1.9, py - half * 1.9,
        px + half * 1.9, py + half * 1.9, H + 5.7, 0.7,
        PAL.gold, shade(PAL.gold, -0.12), shade(PAL.gold, -0.4));
      spot(ctx, px - half * 1.9, py - H - 4.4, 0.7, PAL.cold);
      spot(ctx, px + half * 1.9, py - H - 4.4, 0.7, PAL.cold);
    }
    if (L >= 20) {
      spot(ctx, px, py - H - 6.5, 1.1, 'rgba(255,252,232,.95)');
      ring(ctx, px, py - H - 6.5, 2.6, 1.1, 'rgba(255,232,170,.7)', 0.7);
    }
  }

  // Запасной путь для drawBuilding: одна клетка без карты соседей.
  function drawWallRun(ctx, run, opts) {
    const cells = run.cells && run.cells.length ? run.cells : [];
    const lvl = run.lvl || (cells[0] ? levelOf(cells[0]) : 1);
    const cell = {
      x: run.x, y: run.y, w: 1, h: 1, cells: cells, lvl: lvl,
      bits: run.bits | 0, deg: 0, post: 'center'
    };
    drawWallSection(ctx, cell);
    if (opts && opts.bar) wallHpBar(ctx, cell, wallTopPx(lvl) + 4);
  }

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
    return l > MAX_LVL ? MAX_LVL : l;
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
  // Рисуется в кадре, но это один stroke на постройку максимального уровня.
  // Потолок у каждого типа свой (пушки до 21, стены до 18), поэтому
  // сравниваем не с потолком центра, а с таблицей справочник.
  const maxLvCache = new Map();

  function maxLevelOf(type) {
    if (maxLvCache.has(type)) return maxLvCache.get(type);
    let m = 0;
    try {
      if (type === 'wall') m = WALL_MAX;
      else if (CC.buildingMaxLevel) m = CC.buildingMaxLevel(type) || 0;
    } catch (e) { m = 0; }
    if (!m || !isFinite(m)) m = MAX_LVL;
    maxLvCache.set(type, m);
    return m;
  }

  function maxBand(ctx, b, lvl) {
    if (!mid() || lvl < maxLevelOf(b.type)) return;
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
    const p = P(x0 + b.w / 2, y0 + b.h / 2);

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

    // второй модуль с 4 уровня — на крыше у правого борта, рядом с куполом
    if (lvl >= 4) {
      prism(ctx, x1 - 0.62, y0 + 0.12, x1 - 0.12, y0 + 0.62, baseH + H - 2, 16,
        PAL.metalLight, PAL.metal, PAL.metalDark);
      const mp = P(x1 - 0.37, y0 + 0.37);
      spot(ctx, mp.x, mp.y - baseH - H - 17, 2.2, PAL.cyan);
    }

    // купол: высота держится по радиусу (не по TH), иначе на новом угле
    // он вытягивается в яйцо; нижнее кольцо — круг на грунте.
    const topY = baseH + H;
    const drx = b.w * TW * 0.22;
    const dry = drx * 0.95;

    // Основание купола: узкая передняя кромка плинта на крыше. Задняя
    // половина скрыта силуэтом; так кольцо не «висит» поперёк купола.
    ctx.fillStyle = lvl >= 5 ? PAL.gold : PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx + 3, (drx + 3) * GQ, 0, 0, Math.PI);
    ctx.ellipse(p.x, p.y - topY, drx - 2, (drx - 2) * GQ, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = lvl >= 5 ? PAL.gold : PAL.cyan;
    ctx.lineWidth = lvl >= 5 ? 1.6 : 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx + 3, (drx + 3) * GQ, 0, 0, Math.PI);
    ctx.stroke();

    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - topY, drx, dry, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

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
      ctx.ellipse(p.x, deckY + 2, 13, 13 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalLight;
      ctx.beginPath();
      ctx.ellipse(p.x, deckY, 13, 13 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ring(ctx, p.x, deckY, 13, 13 * GQ, PAL.gold, 1.8);
      spot(ctx, p.x - 8, deckY - 0.5, 1.5, PAL.glass);
      spot(ctx, p.x + 8, deckY - 0.5, 1.5, PAL.glass);
      // стойки площадки к куполу
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, deckY + 3);
      ctx.lineTo(p.x - 5, p.y - topY - dry * 0.9);
      ctx.moveTo(p.x + 9, deckY + 3);
      ctx.lineTo(p.x + 5, p.y - topY - dry * 0.9);
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

    // бирюзовая полоса под крышей — армия/ангар читаются и на L10
    patchPx(ctx, D, C, H, 0.1, 0.9, H - 2.2, H - 0.9, 'rgba(70,224,200,.32)');
    patchPx(ctx, C, B, H, 0.1, 0.9, H - 2.2, H - 0.9, 'rgba(70,224,200,.24)');

    // до 5 уровня крышу обводит бирюза — армия/ангар читаются отдельно
    if (lvl < 5) {
      const RA = P(hx0 - 0.06, hy0 - 0.06);
      const RB = P(hx1 + 0.06, hy0 - 0.06);
      const RC = P(hx1 + 0.06, hy1 + 0.06);
      const RD = P(hx0 - 0.06, hy1 + 0.06);
      ctx.strokeStyle = 'rgba(70,224,200,.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(RA.x, RA.y - H - 4);
      ctx.lineTo(RB.x, RB.y - H - 4);
      ctx.lineTo(RC.x, RC.y - H - 4);
      ctx.lineTo(RD.x, RD.y - H - 4);
      ctx.closePath();
      ctx.stroke();
    }

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
    ctx.ellipse(ap.x, ap.y, 24, 24 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,224,200,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(ap.x, ap.y, 19, 19 * GQ, 0, 0, Math.PI * 2);
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
    ctx.ellipse(t.x, t.y + 2, 6, 6 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(t.x - 6, t.y - 10, 12, 12);
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 10, 6, 6 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,224,200,.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 3, 6, 6 * GQ, 0, 0, Math.PI * 2);
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
    let dy = (Math.cos(a) + Math.sin(a)) * GQ;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  // Турель: массивная броневая тумба, заметный поворотный погон, вертлюг,
  // коробчатая вращающаяся башня и длинный ствол с дульным тормозом.
  // Силуэт читается как «пушка» даже в 44 px: широкое основание, ось
  // наведения и развитый дульный срез важнее мелкой фактуры.
  // Турель: мощность читается по уровню. L1 — скромная тумба с одним
  // коротким стволом и без золота; к L5 появляются броневая юбка, козырёк
  // и предупреждающие полосы; L8-10 — тяжёлый лафет, второй ствол,
  // дальномер и антенна. Пятно постройки не трогаем: всё растёт внутри него.
  function drawCannon(ctx, b, lvl) {
    const L = Math.max(1, Math.min(MAX_LVL, Math.round(lvl || 1)));
    const t = (L - 1) / 9;
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + 0.5, y0 + 0.5);
    const f = aimVec(b);
    const rx = -f.y;
    const ry = f.x;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.55 + t * 0.5);

    /* --- лафет: от маленькой тумбы к тяжёлой платформе --- */
    const baseH = 3.6 + t * 6.4;         // L1 3.6, L10 10
    const plateRx = 9.0 + t * 11.5;      // L1 9, L10 20.5
    // погон — круг на грунте: при 55° он почти круглый, а не плоский овал
    const plateRy = plateRx * GQ;
    const inset = 0.24 - t * 0.2;        // L1 уже пятна, L10 почти вровень
    const turH = 2.6 + t * 5.4;

    prism(ctx, x0 + inset, y0 + inset, x1 - inset, y1 - inset, 0, baseH,
      mix(PAL.metalLight, ACC.copperLight, 0.28),
      mix(PAL.metal, ACC.copper, 0.32),
      mix(PAL.metalDark, ACC.copperDark, 0.32));

    const topY = p.y - baseH;

    // нижняя юбка: со 2 уровня, растёт с массой
    if (L >= 2) {
      ctx.fillStyle = mix(PAL.metalDark, ACC.copperDark, 0.42);
      ctx.beginPath();
      ctx.ellipse(p.x, topY + 1.6, plateRx * 0.94, plateRy * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // верхняя плита-погон
    ctx.fillStyle = mix(PAL.metal, ACC.copper, 0.18);
    ctx.beginPath();
    ctx.ellipse(p.x, topY, plateRx, plateRy, 0, 0, Math.PI * 2);
    ctx.fill();
    if (L >= 2) {
      ctx.strokeStyle = ACC.copper;
      ctx.lineWidth = L >= 5 ? 1.5 : 1.1;
      ctx.beginPath();
      ctx.ellipse(p.x, topY, plateRx * 0.9, plateRy * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // болты погона: только на средней и близкой детализации
    if (L >= 3 && mid()) {
      const n = 6 + L;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n + 0.25;
        spot(ctx, p.x + Math.cos(a) * plateRx * 0.78,
          topY + Math.sin(a) * plateRy * 0.78, 0.8,
          i % 3 ? PAL.metalDark : PAL.metalLight);
      }
    }

    // гусеничные башмаки — с 6 уровня: L1 не должен выглядеть танком
    if (L >= 6) {
      const bw = 6 + t * 3;
      const by = p.y - 4.5;
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(p.x - plateRx - 1, by, bw, 4.5, 2);
        ctx.roundRect(p.x + plateRx - bw + 1, by, bw, 4.5, 2);
      } else {
        ctx.rect(p.x - plateRx - 1, by, bw, 4.5);
        ctx.rect(p.x + plateRx - bw + 1, by, bw, 4.5);
      }
      ctx.fill();
      if (mid()) {
        ctx.fillStyle = PAL.metalLight;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(p.x - plateRx + i * (bw / 3), by + 1.6, 1.2, 1.8);
          ctx.fillRect(p.x + plateRx - bw + 1 + i * (bw / 3), by + 1.6, 1.2, 1.8);
        }
      }
    }

    // золотые предупреждающие полосы: с 4 уровня и только на передней грани
    if (L >= 4) {
      const D = P(x0 + 0.02, y1 - 0.02);
      const C = P(x1 - 0.02, y1 - 0.02);
      const nSeg = 3 + (L >= 7 ? 2 : 0) + (L >= 9 ? 1 : 0);
      for (let i = 0; i < nSeg; i++) {
        const u0 = 0.06 + i * 0.88 / nSeg;
        const u1 = 0.06 + (i + 0.52) * 0.88 / nSeg;
        wallPatch(ctx, D, C, baseH, u0, u1, 0.14, 0.66,
          i % 2 ? PAL.metalDark : PAL.gold);
      }
    }

    // рёбра жёсткости на лафете с 7 уровня
    if (L >= 7) {
      const F2 = P(x0 + 0.04, y1 - 0.04);
      const G2 = P(x1 - 0.04, y1 - 0.04);
      ribLines(ctx, F2, G2, baseH, 0.12, 0.88, 1, baseH - 1, 4,
        'rgba(30,38,42,.4)', 1.1);
    }

    /* --- поворотный погон и вертлюг --- */
    const ringRx = plateRx * 0.62;
    const ringRy = plateRy * 0.62;
    const ttTop = topY - turH;

    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, topY, ringRx, ringRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(p.x - ringRx, ttTop, ringRx * 2, turH);
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(p.x, ttTop, ringRx, ringRy, 0, 0, Math.PI * 2);
    ctx.fill();

    if (L >= 2) {
      ctx.strokeStyle = ACC.copper;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, ttTop, ringRx * 0.9, ringRy * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (L >= 3 && mid()) {
      ctx.strokeStyle = 'rgba(70,224,200,.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(p.x + c * ringRx * 0.78, ttTop + s * ringRy * 0.78);
        ctx.lineTo(p.x + c * ringRx * 0.98, ttTop + s * ringRy * 0.98);
      }
      ctx.stroke();
    }

    const hubX = p.x;
    const hubY = ttTop - 1.2 - t * 1.5;

    // ось наведения: короткий бирюзовый луч через центр погона
    if (L >= 3) {
      ctx.strokeStyle = 'rgba(70,224,200,.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hubX - f.x * 16, hubY + 2 - f.y * 9);
      ctx.lineTo(hubX + f.x * 16, hubY + 2 + f.y * 9);
      ctx.stroke();
    }

    /* --- вращающаяся башня --- */
    const fw = 5.6 + t * 7.4;      // вынос лобовой плиты
    const sh = 5.2 + t * 6.2;      // полуширина башни
    const shoulder = fw * 0.78;

    function lp(a, s) {
      return { x: hubX + f.x * a + rx * s, y: hubY + f.y * a + ry * s };
    }

    // нижняя тень корпуса
    poly(ctx, [
      lp(-fw * 0.82, sh * 0.94), lp(-fw * 0.32, sh), lp(shoulder, sh * 0.94),
      lp(fw, sh * 0.42), lp(fw, -sh * 0.42), lp(shoulder, -sh * 0.94),
      lp(-fw * 0.32, -sh), lp(-fw * 0.82, -sh * 0.94)
    ], PAL.metalDark);

    // сам корпус: скошенная лобовая плита
    poly(ctx, [
      lp(-fw * 0.78, sh * 0.82), lp(-fw * 0.3, sh * 0.9), lp(shoulder * 0.92, sh * 0.84),
      lp(fw * 0.96, sh * 0.34), lp(fw * 0.96, -sh * 0.34), lp(shoulder * 0.92, -sh * 0.84),
      lp(-fw * 0.3, -sh * 0.9), lp(-fw * 0.78, -sh * 0.82)
    ], PAL.metal);

    // световая кромка крыши: корпус читается коробкой, а не куполом
    if (L >= 2) {
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(lp(-fw * 0.7, sh * 0.72).x, lp(-fw * 0.7, sh * 0.72).y);
      ctx.lineTo(lp(fw * 0.9, sh * 0.3).x, lp(fw * 0.9, sh * 0.3).y);
      ctx.lineTo(lp(fw * 0.9, -sh * 0.3).x, lp(fw * 0.9, -sh * 0.3).y);
      ctx.stroke();
    }

    // лобовая броня и маска ствола: массивнее с уровнем
    if (L >= 3) {
      poly(ctx, [
        lp(shoulder * 0.9, sh * 0.66), lp(fw * 0.98, sh * 0.4),
        lp(fw * 1.02, -sh * 0.4), lp(shoulder * 0.9, -sh * 0.66)
      ], PAL.metalDark);
      poly(ctx, [
        lp(shoulder * 0.98, sh * 0.5), lp(fw * 1.02, sh * 0.3),
        lp(fw * 1.02, -sh * 0.3), lp(shoulder * 0.98, -sh * 0.5)
      ], PAL.metal);
    }

    // вертлюги по бокам — видно, что башня качается и вращается
    if (L >= 4) {
      spot(ctx, lp(0.5, sh * 0.86).x, lp(0.5, sh * 0.86).y, 1.8 + t, PAL.metalDark);
      spot(ctx, lp(0.5, sh * 0.86).x, lp(0.5, sh * 0.86).y, 0.9 + t * 0.5, PAL.metalLight);
      spot(ctx, lp(0.5, -sh * 0.86).x, lp(0.5, -sh * 0.86).y, 1.8 + t, PAL.metalDark);
      spot(ctx, lp(0.5, -sh * 0.86).x, lp(0.5, -sh * 0.86).y, 0.9 + t * 0.5, PAL.metalLight);
    }

    // командирская башенка: со средних уровней
    if (L >= 5) {
      const cup = lp(-fw * 0.4, sh * 0.32);
      const cr = 2.2 + t * 1.4;
      spot(ctx, cup.x, cup.y - cr * 0.8, cr, PAL.metalDark);
      spot(ctx, cup.x, cup.y - cr * 0.9, cr * 0.66, PAL.metalLight);
      ctx.fillStyle = L >= 7 ? PAL.cold : PAL.glass;
      ctx.fillRect(cup.x + rx * 1.4 - 1, cup.y - cr * 0.9 + ry * 1.4 - 0.8, 2, 1.4);
    }

    // сенсор на башне: крошечная точка уже со 2 уровня
    if (L >= 2) {
      spot(ctx, lp(-fw * 0.5, -sh * 0.36).x, lp(-fw * 0.5, -sh * 0.36).y - 2,
        1 + t * 0.6, L >= 5 ? PAL.gold : PAL.cold);
    }

    /* --- ствол: длина и толщина растут, второй появляется к 9 --- */
    const len = 12 + t * 15;       // L1 12, L10 27
    const bw = 3.8 + t * 4.4;      // L1 3.8, L10 8.2
    const mz = lp(fw * 0.94, 0);
    const bx = mz.x;
    const by = mz.y - 0.6;

    barrel(ctx, bx, by, f.x, f.y, len, bw, L >= 9, L >= 10);

    // медные хомуты на стволе: тёплый ролевой акцент обороны
    ctx.strokeStyle = ACC.copper;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const q = 0.28 + i * 0.34;
      const cx = bx + f.x * len * q;
      const cy = by + f.y * len * q;
      ctx.beginPath();
      ctx.moveTo(cx - rx * bw * 0.52, cy - ry * bw * 0.52);
      ctx.lineTo(cx + rx * bw * 0.52, cy + ry * bw * 0.52);
      ctx.stroke();
    }
    ctx.strokeStyle = ACC.copperLight;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const q = 0.28 + i * 0.34;
      const cx = bx + f.x * len * q;
      const cy = by + f.y * len * q;
      ctx.beginPath();
      ctx.moveTo(cx - rx * bw * 0.52, cy - ry * bw * 0.52 - 0.8);
      ctx.lineTo(cx + rx * bw * 0.52, cy + ry * bw * 0.52 - 0.8);
      ctx.stroke();
    }

    const ex = bx + f.x * len;
    const ey = by + f.y * len;

    // дульный тормоз/насадка: с 3 уровня, у L1 только тёмное дуло
    if (L >= 3) {
      const hw = bw * 0.74;
      const bl = 2.6 + t * 3.4;
      poly(ctx, [
        { x: ex - rx * hw - f.x * 1.5, y: ey - ry * hw - f.y * 1.5 },
        { x: ex + rx * hw - f.x * 1.5, y: ey + ry * hw - f.y * 1.5 },
        { x: ex + rx * hw * 1.15 + f.x * bl, y: ey + ry * hw * 1.15 + f.y * bl },
        { x: ex - rx * hw * 1.15 + f.x * bl, y: ey - ry * hw * 1.15 + f.y * bl }
      ], PAL.metalDark);
      if (mid() && L >= 5) {
        ctx.strokeStyle = PAL.dark;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          const k = 0.35 + i * 0.34;
          const sx = ex + rx * hw * 1.05 + f.x * bl * k;
          const sy = ey + ry * hw * 1.05 + f.y * bl * k;
          ctx.beginPath();
          ctx.moveTo(sx - rx * hw, sy - ry * hw);
          ctx.lineTo(sx + rx * hw * 0.15, sy + ry * hw * 0.15);
          ctx.stroke();
        }
      }
      spot(ctx, ex + f.x * (bl + 0.6), ey + f.y * (bl + 0.6), hw * 0.62, PAL.dark);
    } else {
      spot(ctx, ex, ey, bw * 0.52, PAL.dark);
      spot(ctx, ex - 0.5, ey - 0.5, bw * 0.2, 'rgba(200,214,220,.35)');
    }

    // кожух отката и амортизаторы на стволе
    if (L >= 7) {
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.6 + t;
      for (let i = 0; i < 2; i++) {
        const k = i ? 0.52 : 0.24;
        const cx = bx + f.x * len * k;
        const cy = by + f.y * len * k;
        ctx.beginPath();
        ctx.moveTo(cx - rx * (bw * 0.6), cy - ry * (bw * 0.6));
        ctx.lineTo(cx + rx * (bw * 0.6), cy + ry * (bw * 0.6));
        ctx.stroke();
      }
    }

    // золотой обруч у дульного тормоза
    if (L >= 9) {
      const gx = ex + f.x * 1.4;
      const gy = ey + f.y * 1.4;
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(gx - rx * bw * 0.82, gy - ry * bw * 0.82);
      ctx.lineTo(gx + rx * bw * 0.82, gy + ry * bw * 0.82);
      ctx.stroke();
    }

    // второй ствол под основным
    if (L >= 9) {
      const cx = bx - rx * (bw * 1.1);
      const cy = by - ry * (bw * 1.1) + 1.2;
      barrel(ctx, cx, cy, f.x, f.y, len * 0.62, bw * 0.55, false, false);
      spot(ctx, cx + f.x * len * 0.62, cy + f.y * len * 0.62, bw * 0.3, PAL.dark);
    }

    /* --- верхние детали, silhouette не ломают --- */
    if (L >= 6) {
      // компактный дальномер на крыше
      const rf = lp(-fw * 0.45, sh * 0.34);
      const rw = 3.6 + t * 2.2;
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(rf.x, rf.y - 4, rw, rw * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metalLight;
      ctx.fillRect(rf.x - rw * 0.7, rf.y - 5.6, rw * 1.4, 1.6);
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(rf.x - rw * 0.55, rf.y - 5.3, rw * 1.1, 0.9);
      spot(ctx, rf.x, rf.y - 6.4, 0.8, L >= 9 ? PAL.gold : PAL.cold);
    }

    if (L >= 8) {
      const a1 = P(x0 + 0.16, y0 + 0.22);
      exhaustStack(ctx, a1.x, a1.y - baseH - 1, 8 + t * 4, 2.8 + t * 1.2);
      antennaMast(ctx, p.x + plateRx * 0.5, ttTop - 5 - t * 4, 9 + t * 5,
        PAL.metalLight, L >= 9 ? PAL.gold : PAL.cold);
    }

    if (L >= 10) {
      const pe = lp(-fw * 0.72, -sh * 0.42);
      pennant(ctx, pe.x, pe.y - 4, 13, PAL.gold, 5);
      // яркая полоса по погону
      ctx.strokeStyle = 'rgba(255,207,74,.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(p.x, topY, plateRx * 0.96, plateRy * 0.92, 0, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
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
      mix(PAL.stoneLight, ACC.copperLight, 0.25),
      mix(PAL.stone, ACC.copper, 0.24),
      mix(PAL.stoneDark, ACC.copperDark, 0.25));

    // тонкая опора
    prism(ctx, x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3, baseH, H - baseH,
      PAL.metalLight, PAL.metal, PAL.metalDark);

    // медные/золотые обоймы на опоре — тёплый акцент обороны
    if (lvl >= 2) {
      const k = lvl >= 4 ? 3 : 2;
      for (let i = 1; i <= k; i++) {
        const yy = p.y - baseH - (H - baseH) * i / (k + 1);
        ctx.strokeStyle = 'rgba(196,106,58,.85)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(p.x, yy, 8, 8 * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ring(ctx, p.x, p.y - baseH + 1, 10, 10 * GQ, ACC.copperDark, 1.2);

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
      ring(ctx, p.x, p.y - H + 2, 13, 13 * GQ, ACC.copper, 1.3);
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
      ring(ctx, p.x, p.y - H + 2, 14, 14 * GQ, PAL.gold, 1.6);
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
    ], mix(PAL.metalDark, ACC.copperDark, 0.55));
    poly(ctx, [
      { x: rx0, y: ry0 + 1 }, { x: rx1 - 0.5, y: ry1 + 1 },
      { x: rx1 + 4.5, y: ry1 + 2.2 }, { x: rx0 + 4.5, y: ry0 + 2.2 }
    ], mix(PAL.metal, ACC.copper, 0.35));

    ctx.strokeStyle = ACC.copperDark;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(rx0, ry0);
    ctx.lineTo(rx1, ry1);
    ctx.moveTo(rx0 + 5, ry0 + 1);
    ctx.lineTo(rx1 + 5, ry1 + 1);
    ctx.stroke();

    // поперечины рамы: пусковая установка, а не просто палка
    ctx.strokeStyle = ACC.copperLight;
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
      ring(ctx, p.x, p.y - H + 1, 12, 12 * GQ, 'rgba(196,138,224,.55)', 1.3);
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

    // котёл — медь обороны
    const bY = p.y - baseH;
    const bowlH = 14;
    const rBot = 11;
    const rTop = 16;
    const bowlCol = mix(PAL.metal, ACC.copper, 0.40);

    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(p.x, bY, rBot, rBot * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    poly(ctx, [
      { x: p.x - rBot, y: bY }, { x: p.x + rBot, y: bY },
      { x: p.x + rTop, y: bY - bowlH }, { x: p.x - rTop, y: bY - bowlH }
    ], bowlCol);

    // объём котла
    poly(ctx, [
      { x: p.x - rBot, y: bY }, { x: p.x - rBot * 0.35, y: bY },
      { x: p.x - rTop * 0.35, y: bY - bowlH }, { x: p.x - rTop, y: bY - bowlH }
    ], shade(bowlCol, 0.16));

    poly(ctx, [
      { x: p.x + rBot * 0.4, y: bY }, { x: p.x + rBot, y: bY },
      { x: p.x + rTop, y: bY - bowlH }, { x: p.x + rTop * 0.4, y: bY - bowlH }
    ], shade(bowlCol, -0.2));

    // срез
    ctx.fillStyle = mix(PAL.metalLight, ACC.copperLight, 0.3);
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH, rTop, rTop * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    // светлый внутренний край среза
    ctx.fillStyle = shade(bowlCol, 0.3);
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH + 0.5, rTop * 0.72, rTop * 0.72 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    // тёмное жерло
    ctx.fillStyle = PAL.dark;
    ctx.beginPath();
    ctx.ellipse(p.x, bY - bowlH + 1, rTop * 0.42, rTop * 0.42 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2+: медные обручи
    const hoops = lvl >= 4 ? 2 : (lvl >= 2 ? 1 : 0);
    for (let i = 0; i < hoops; i++) {
      const hh = bowlH * (0.34 + i * 0.3);
      const rr = rBot + (rTop - rBot) * (hh / bowlH);
      ctx.strokeStyle = ACC.copperDark;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(p.x, bY - hh, rr + 0.5, (rr + 0.5) * GQ, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5: золотая окантовка среза
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, bY - bowlH, rTop + 0.5, (rTop + 0.5) * GQ, 0, 0, Math.PI * 2);
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
      ctx.ellipse(p.x, bY - bowlH + 1, rTop * 0.5, rTop * 0.5 * GQ, 0, 0, Math.PI * 2);
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
      ring(ctx, p.x, bY - bowlH, rTop + 1, (rTop + 1) * GQ, PAL.gold, 1.8);
      pennant(ctx, p.x + 12, bY - bowlH + 2, 18, PAL.cold, 6);
      spot(ctx, bx - 3, by - 2, 1.2, PAL.gold);
    }

    // 10: поворотный погон и броневой фартук под чашей
    if (lvl >= 10) {
      ring(ctx, p.x, bY + 2, rBot + 4, (rBot + 4) * GQ, PAL.metalLight, 1.6);
      ring(ctx, p.x, bY + 2, rBot + 2, (rBot + 2) * GQ, PAL.gold, 1.2);
      ctx.fillStyle = PAL.metalDark;
      ctx.beginPath();
      ctx.ellipse(p.x, bY + 5, rBot + 7, (rBot + 7) * GQ, 0, 0, Math.PI * 2);
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
    ctx.ellipse(dump.x, dump.y, 10, 10 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.stoneDark;
    ctx.beginPath();
    ctx.ellipse(dump.x - 1.5, dump.y - 3.4, 8, 8 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(PAL.stone, -0.06);
    ctx.beginPath();
    ctx.ellipse(dump.x - 3, dump.y - 5, 4.4, 4.4 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mid()) {
      spot(ctx, dump.x + 3, dump.y - 4, 1.3, shade(PAL.stoneLight, 0.1));
      spot(ctx, dump.x - 5, dump.y - 2, 1.1, shade(PAL.stoneLight, 0.05));
    }

    // куча руды на земле слева
    const ore = P(x0 + 0.18, y1 + 0.06);
    ctx.fillStyle = shade(PAL.gold, -0.2);
    ctx.beginPath();
    ctx.ellipse(ore.x, ore.y, 9, 9 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.ellipse(ore.x - 1, ore.y - 2.5, 7, 7 * GQ, 0, 0, Math.PI * 2);
    ctx.ellipse(ore.x + 5, ore.y - 1, 4, 4 * GQ, 0, 0, Math.PI * 2);
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
      ctx.ellipse(cv.x, cv.y - 13, 6.2, 6.2 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.ellipse(cv.x - 1, cv.y - 15, 4.6, 4.6 * GQ, 0, 0, Math.PI * 2);
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
    ctx.ellipse(x, baseY + 2, r, r * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    poly(ctx, [
      { x: x - r, y: baseY + 2 }, { x: x + r, y: baseY + 2 },
      { x: x + r, y: baseY - h }, { x: x - r, y: baseY - h }
    ], energy);

    ctx.fillStyle = shade(energy, 0.22);
    ctx.beginPath();
    ctx.ellipse(x, baseY - h, r, r * GQ, 0, 0, Math.PI * 2);
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
        ctx.ellipse(x, yy, r + 0.6, (r + 0.6) * GQ, 0, 0, Math.PI * 2);
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
      ctx.ellipse(p.x, p.y - H - 8, 15, 15 * GQ, 0, 0, Math.PI * 2);
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
    ctx.ellipse(p.x + 20, p.y + 1.5, 5, 5 * GQ, 0, 0, Math.PI * 2);
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
        ctx.ellipse(p.x, yy, 15, 15 * GQ, 0, 0, Math.PI * 2);
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
      ring(ctx, p.x, p.y - H - 19, 14.6, 14.6 * GQ, PAL.gold, 1.6);
      pennant(ctx, p.x + 20, p.y - H - 2, 16, PAL.cold, 6);
    }

    // 10: конденсатор над баком и второй контур
    if (lvl >= 10) {
      const cy = p.y - H - 30;
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(p.x - 10, cy, 20, 6);
      ctx.fillStyle = PAL.metalLight;
      ctx.beginPath();
      ctx.ellipse(p.x, cy, 10, 10 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.metal;
      ctx.beginPath();
      ctx.ellipse(p.x, cy + 6, 10, 10 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ring(ctx, p.x, cy + 6, 10.6, 10.6 * GQ, PAL.gold, 1.4);
      ctx.strokeStyle = 'rgba(70,224,200,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, cy + 2);
      ctx.lineTo(p.x + 7, cy + 2);
      ctx.stroke();
      spot(ctx, p.x, cy - 3, 1.6, PAL.cold);
    }
  }

  /* ---------- накопитель энергии (estorage) ----------
     Отдельный тип: не реактор (тот энергию производит) и не склад руды.
     Силуэт — узкая стойка из двух вертикальных конденсаторов под общей
     шиной, с кабелем и пультом заряда. Склад руды остаётся приземистым
     контейнером, реактор — широким баком, поэтому типы не путаются даже
     на мелком масштабе. */

  // Одна ячейка-конденсатор: цилиндр с крышкой, полосой заряда и обручами.
  function powerCell(ctx, x, baseY, w, h, lvl, energy, steel, hot) {
    const rx = w / 2;
    const ry = Math.max(2.2, rx * GQ);
    const topY = baseY - h;
    const glass = Math.max(1.8, w * 0.3);

    // тень и нижний торец
    ctx.fillStyle = 'rgba(20,14,26,.32)';
    ctx.beginPath();
    ctx.ellipse(x, baseY + 1.4, rx + 1.2, ry + 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(steel, -0.36);
    ctx.beginPath();
    ctx.ellipse(x, baseY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // корпус: узкий цилиндр с лёгким сужением к крышке
    poly(ctx, [
      { x: x - rx, y: baseY },
      { x: x + rx, y: baseY },
      { x: x + rx * 0.9, y: topY + ry },
      { x: x + rx * 0.9, y: topY },
      { x: x - rx * 0.9, y: topY },
      { x: x - rx * 0.9, y: topY + ry }
    ], steel);

    // объём: светлая левая грань и тёмная правая
    poly(ctx, [
      { x: x - rx, y: baseY },
      { x: x - rx * 0.18, y: baseY },
      { x: x - rx * 0.18, y: topY },
      { x: x - rx * 0.9, y: topY },
      { x: x - rx * 0.9, y: topY + ry }
    ], shade(steel, 0.18));
    poly(ctx, [
      { x: x + rx * 0.34, y: baseY },
      { x: x + rx, y: baseY },
      { x: x + rx * 0.9, y: topY + ry },
      { x: x + rx * 0.9, y: topY },
      { x: x + rx * 0.34, y: topY }
    ], shade(steel, -0.2));

    // тёмная шахта индикатора и полоса заряда
    ctx.fillStyle = 'rgba(20,14,30,.68)';
    ctx.fillRect(x - glass / 2, topY + 4, glass, h - 8);

    const bars = 3;
    const bh = Math.max(1.2, (h - 11) / (bars * 1.55));
    ctx.fillStyle = energy;
    for (let i = 0; i < bars; i++) {
      const y0 = topY + 5 + i * bh * 1.55;
      ctx.fillRect(x - glass / 2 + 0.7, y0, glass - 1.4, bh);
    }
    ctx.fillStyle = hot;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x - glass / 2 + 0.7, topY + 5, Math.max(0.8, glass * 0.34), h - 11);
    ctx.globalAlpha = 1;

    // обручи: 6+ по два, 8+ третий
    if (lvl >= 6) {
      const bands = lvl >= 8 ? 3 : 2;
      ctx.strokeStyle = shade(steel, -0.4);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < bands; i++) {
        const yy = baseY - h * (0.28 + i * 0.23);
        ctx.beginPath();
        ctx.ellipse(x, yy, rx + 0.4, ry * 0.94, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // крышка
    ctx.fillStyle = shade(steel, -0.14);
    ctx.beginPath();
    ctx.ellipse(x, topY + 1.2, rx * 0.98, ry * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(steel, 0.24);
    ctx.beginPath();
    ctx.ellipse(x, topY, rx * 0.9, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();

    // клемма: золото с 9 уровня
    if (lvl >= 9) {
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x - 1.1, topY - 2.6, 2.2, 2.8);
      spot(ctx, x, topY - 3.2, 0.9, 'rgba(255,255,255,.8)');
    }
  }

  function drawEstorage(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + b.w / 2, y0 + b.h / 2);
    const px = p.x;
    const py = p.y;
    const s = Math.min(1.45, Math.max(0.8, Math.min(b.w, b.h)));
    const baseH = 4 + (lvl >= 4 ? 1 : 0);
    const cellH = (23 + (lvl >= 4 ? 3 : 0) + (lvl >= 7 ? 2 : 0)) * s;
    const cw = 12 * s;
    const gap = 7.4 * s;
    const topY = py - baseH - cellH;

    const energy = mix(PAL.elixir, PAL.cold, 0.32);
    const hot = mix(energy, '#ffffff', 0.46);
    const steel = mix(PAL.metal, PAL.elixir, 0.2);
    const steelLight = shade(steel, 0.25);
    const steelDark = shade(steel, -0.26);

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.9);

    // мягкое фиолетовое свечение стойки: видно, что внутри энергия
    if (mid()) {
      const gy = py - baseH - cellH * 0.48;
      ctx.fillStyle = lvl >= 6 ? 'rgba(155,123,255,.15)' : 'rgba(155,123,255,.1)';
      ctx.beginPath();
      ctx.ellipse(px, gy, 18 * s, 24 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // силовая плита-поддон
    prism(ctx, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, 0, baseH,
      steelLight, steel, steelDark);

    // кабель уходит за стойку и возвращается к пульту
    ctx.strokeStyle = 'rgba(24,18,32,.85)';
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - gap - cw * 0.6, py - baseH * 0.5);
    ctx.quadraticCurveTo(px - gap - cw * 1.3, py + 3 * s, px + gap + cw * 1.2, py + 3.4 * s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,224,200,.42)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px - gap - cw * 0.6, py - baseH * 0.5);
    ctx.quadraticCurveTo(px - gap - cw * 1.3, py + 3 * s, px + gap + cw * 1.2, py + 3.4 * s);
    ctx.stroke();

    // задние стойки рамы
    ctx.strokeStyle = steelDark;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(px - gap - cw * 0.5, py - baseH + 1);
    ctx.lineTo(px - gap - cw * 0.5, topY - 3 * s);
    ctx.moveTo(px + gap + cw * 0.5, py - baseH + 1);
    ctx.lineTo(px + gap + cw * 0.5, topY - 3 * s);
    ctx.stroke();
    ctx.strokeStyle = steelLight;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px - gap - cw * 0.5 - 0.5, py - baseH + 1);
    ctx.lineTo(px - gap - cw * 0.5 - 0.5, topY - 3 * s);
    ctx.stroke();

    // нижняя секция: два конденсатора
    powerCell(ctx, px - gap, py - baseH, cw, cellH, lvl, energy, steel, hot);
    powerCell(ctx, px + gap, py - baseH, cw, cellH, lvl, energy, steel, hot);

    // общая шина над нижней секцией
    const busL = px - gap - cw * 0.44;
    const busR = px + gap + cw * 0.44;
    const busY = topY - 1.4 * s;
    ctx.strokeStyle = steelDark;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.moveTo(busL, busY);
    ctx.lineTo(busR, busY);
    ctx.stroke();
    ctx.strokeStyle = lvl >= 5 ? PAL.gold : steelLight;
    ctx.lineWidth = lvl >= 5 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(busL, busY - 0.8);
    ctx.lineTo(busR, busY - 0.8);
    ctx.stroke();
    if (lvl >= 5) {
      spot(ctx, busL, busY - 0.8, 1.2, PAL.gold);
      spot(ctx, busR, busY - 0.8, 1.2, PAL.gold);
    }

    /* --- вторая секция: верхняя полка с малыми ячейками --- */
    let deckTop = busY;
    if (lvl >= 6) {
      const deckY = busY - 3.2 * s;
      const upperH = cellH * 0.56;
      const uw = cw * 0.82;
      const uGap = gap * 0.72;

      // полка
      ctx.strokeStyle = steelDark;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(px - gap - cw * 0.62, deckY);
      ctx.lineTo(px + gap + cw * 0.62, deckY);
      ctx.stroke();
      ctx.strokeStyle = steelLight;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px - gap - cw * 0.62, deckY - 0.8);
      ctx.lineTo(px + gap + cw * 0.62, deckY - 0.8);
      ctx.stroke();

      powerCell(ctx, px - uGap, deckY, uw, upperH, lvl, energy, steel, hot);
      powerCell(ctx, px + uGap, deckY, uw, upperH, lvl, energy, steel, hot);
      deckTop = deckY - upperH;

      // верхняя шина
      ctx.strokeStyle = steelDark;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(px - uGap - uw * 0.42, deckTop - 1.2);
      ctx.lineTo(px + uGap + uw * 0.42, deckTop - 1.2);
      ctx.stroke();
      ctx.strokeStyle = lvl >= 9 ? PAL.gold : steelLight;
      ctx.lineWidth = lvl >= 9 ? 1.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(px - uGap - uw * 0.42, deckTop - 2);
      ctx.lineTo(px + uGap + uw * 0.42, deckTop - 2);
      ctx.stroke();
    }

    // пульт заряда на переднем крае
    const cxp = px + gap + cw * 0.8;
    const cyp = py + 2.4 * s;
    ctx.fillStyle = steelDark;
    ctx.fillRect(cxp - 5 * s, cyp - 7 * s, 10 * s, 7 * s);
    ctx.fillStyle = shade(steel, 0.04);
    ctx.fillRect(cxp - 4.2 * s, cyp - 6.2 * s, 8.4 * s, 3.4 * s);
    ctx.fillStyle = energy;
    ctx.fillRect(cxp - 3.6 * s, cyp - 5.6 * s, 5.4 * s, 1.5 * s);
    spot(ctx, cxp + 2.6 * s, cyp - 5.4 * s, 0.9 * s, lvl >= 5 ? PAL.gold : PAL.cold);

    /* --- 7-10: охлаждение, клеммы, свечение --- */

    // 7: боковые рёбра охлаждения (с 8 их сменяет радиатор)
    if (lvl >= 7 && lvl < 8) {
      ctx.strokeStyle = 'rgba(154,167,173,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const yy = py - baseH - cellH * (0.3 + i * 0.18);
        ctx.moveTo(px + gap + cw * 0.56, yy);
        ctx.lineTo(px + gap + cw * 1.05, yy);
      }
      ctx.stroke();
    }

    // 8: вентиляция — решётка на пульте и грибовидные вытяжки
    if (lvl >= 8) {
      ctx.strokeStyle = 'rgba(18,26,30,.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(cxp - 3.4 * s, cyp - 1.4 * s + i * 1.3 * s);
        ctx.lineTo(cxp + 3.4 * s, cyp - 1.4 * s + i * 1.3 * s);
      }
      ctx.stroke();

      // боковой радиатор стойки: тёмный короб с частыми ламелями
      const vx = px + gap + cw * 0.94;
      const vy = py - baseH - cellH * 0.46;
      ctx.fillStyle = shade(steel, -0.32);
      ctx.fillRect(vx - 2.4 * s, vy - 5.4 * s, 4.8 * s, 10.8 * s);
      ctx.strokeStyle = 'rgba(154,167,173,.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = vy - 3.6 * s + i * 2.2 * s;
        ctx.moveTo(vx - 1.7 * s, yy);
        ctx.lineTo(vx + 1.7 * s, yy);
      }
      ctx.stroke();

      // вытяжной колпак на верхней секции
      const ventY = lvl >= 6 ? deckTop - 4 * s : topY - 7 * s;
      ctx.fillStyle = steelDark;
      ctx.beginPath();
      ctx.ellipse(px, ventY, 3.2 * s, 3.2 * s * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(127,233,255,.5)';
      ctx.beginPath();
      ctx.ellipse(px, ventY - 0.6, 2.2 * s, 2.2 * s * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9: золотые клеммы и угловые накладки
    if (lvl >= 9) {
      spot(ctx, px - gap, topY - 4.4 * s, 1.5, PAL.gold);
      spot(ctx, px + gap, topY - 4.4 * s, 1.5, PAL.gold);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(px - 8 * s, py - baseH + 0.4, 3.2 * s, 1.8 * s);
      ctx.fillRect(px + 4.8 * s, py - baseH + 0.4, 3.2 * s, 1.8 * s);
    }

    // 10: надстройка-катушка: кольцо и ореол над стойкой
    if (lvl >= 10) {
      const coilY = deckTop - 9 * s;
      ring(ctx, px, coilY, 9 * s, 9 * s * GQ, PAL.gold, 1.5);
      ring(ctx, px, coilY, 6 * s, 6 * s * GQ, 'rgba(70,224,200,.6)', 1);
      ctx.strokeStyle = steelLight;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px - 8 * s, coilY + 1.5);
      ctx.lineTo(px - gap * 0.5, deckTop - 2);
      ctx.moveTo(px + 8 * s, coilY + 1.5);
      ctx.lineTo(px + gap * 0.5, deckTop - 2);
      ctx.stroke();
      spot(ctx, px, coilY - 1.4, 2 * s, hot);
      spot(ctx, px, coilY - 1.4, 0.9 * s, 'rgba(255,255,255,.9)');
    }
  }

  // Живое свечение накопителя: только с 6 уровня и только на среднем/близком
  // масштабе. Один эллипс на постройку, спрайт при этом не перепекается.
  function drawEstorageGlow(ctx, b, lvl) {
    if (lvl < 6 || !mid()) return;
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const H = 4 + 23 + (lvl >= 4 ? 3 : 0) + (lvl >= 7 ? 2 : 0);
    const a = (lvl >= 10 ? 0.16 : 0.1) +
      0.06 * (0.5 + 0.5 * Math.sin(t * 2.4 + (b.x + b.y) * 0.6));
    ctx.fillStyle = 'rgba(155,123,255,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - H * 0.72, 15, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- исследовательский центр ----------
     Приземистая научная станция: тёмно-синие панели, бирюзовое остекление,
     купол обсерватории, терминалы и кабели. Силуэт намеренно низкий и
     округлый, чтобы не путаться с реактором (высокие капсулы) и ангаром
     (плоская крыша с воротами). */

  const LAB_BLUE = '#2f465a';
  const LAB_BLUE_LIGHT = '#49667d';
  const LAB_BLUE_DARK = '#1d2c38';

  // Малая/большая тарелка связи: мачта, наклонная чаша и облучатель.
  function labDish(ctx, x, y, s, tilt, hot) {
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 * s, y - 10 * s);
    ctx.stroke();

    ctx.save();
    ctx.translate(x + 2 * s, y - 12 * s);
    ctx.rotate(tilt || 0);
    ctx.fillStyle = PAL.metalDark;
    ctx.beginPath();
    ctx.ellipse(0, 1.2 * s, 7.4 * s, 4.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metalLight;
    ctx.beginPath();
    ctx.ellipse(-0.4 * s, 0, 6.6 * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LAB_BLUE_DARK;
    ctx.beginPath();
    ctx.ellipse(0, 0.2 * s, 5.2 * s, 2.7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,233,255,.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0.2 * s, 3.2 * s, 1.6 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.2 * s);
    ctx.lineTo(4.6 * s, -2.2 * s);
    ctx.stroke();
    spot(ctx, 4.6 * s, -2.4 * s, 0.9 * s, hot || PAL.cold);
    ctx.restore();
  }

  // Голо-стол: эмиттер на тонкой стойке и парящая схема над ним.
  function labHolo(ctx, x, y, h, s, bright) {
    ctx.fillStyle = 'rgba(12,26,32,.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.6, 4.6 * s, 4.6 * s * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metalDark;
    ctx.fillRect(x - 2.6 * s, y - 1.6 * s, 5.2 * s, 1.8 * s);
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 1.6 * s);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    spot(ctx, x, y - h - 1, 1.2 * s, bright ? PAL.gold : PAL.cold);

    const prev = ctx.globalAlpha;
    const hy = y - h - 10 * s;
    ctx.globalAlpha = prev * (bright ? 0.8 : 0.55);
    ctx.strokeStyle = bright ? 'rgba(255,207,74,.8)' : 'rgba(127,233,255,.72)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(x, hy + i * 3.2 * s, (5.5 + i * 1.7) * s,
        (2 + i * 0.6) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    poly(ctx, [
      { x: x, y: hy - 4.6 * s },
      { x: x + 2.6 * s, y: hy - 0.4 * s },
      { x: x - 2.6 * s, y: hy - 0.4 * s }
    ], bright ? 'rgba(255,207,74,.4)' : 'rgba(127,233,255,.32)');
    spot(ctx, x, hy, 1.1 * s, bright ? PAL.gold : PAL.glass);
    spot(ctx, x, hy, (bright ? 10 : 7) * s,
      bright ? 'rgba(255,207,74,.12)' : 'rgba(70,224,200,.1)');
    ctx.globalAlpha = prev;
  }

  // Пульт с бирюзовым экраном на переднем крае станции.
  function labTerminal(ctx, x, y, s, hot) {
    ctx.fillStyle = 'rgba(10,22,28,.3)';
    ctx.beginPath();
    ctx.ellipse(x + 0.8, y + 0.6, 3.6 * s, 3.6 * s * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.metalDark;
    ctx.fillRect(x - 2.4 * s, y - 5.2 * s, 4.8 * s, 5.2 * s);
    ctx.fillStyle = PAL.metal;
    ctx.fillRect(x - 1.9 * s, y - 4.7 * s, 3.8 * s, 2.4 * s);
    ctx.fillStyle = hot || PAL.glass;
    ctx.fillRect(x - 1.5 * s, y - 4.3 * s, 3.0 * s, 1.6 * s);
    spot(ctx, x + 1.2 * s, y - 1.2 * s, 0.6, PAL.cold);
  }

  function drawLab(ctx, b, lvl) {
    const L = Math.max(1, Math.min(MAX_LVL, Math.round(lvl || 1)));
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const baseH = 3.4 + L * 0.26 + (L >= 5 ? 1 : 0);
    const H = 12.5 + L * 0.85;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 1.2);

    // бетонная плита и технический пояс
    prism(ctx, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 0, baseH,
      '#617d91', '#3b5062', '#273845');
    prism(ctx, x0 + 0.09, y0 + 0.09, x1 - 0.09, y1 - 0.09, baseH, 1.4,
      '#7d9aac', '#4b6274', '#2f4251');

    const mx0 = x0 + 0.18;
    const my0 = y0 + 0.18;
    const mx1 = x1 - 0.16;
    const my1 = y1 - 0.42;

    // основной модуль
    box(ctx, mx0, my0, mx1, my1, H, LAB_BLUE);
    prism(ctx, mx0 - 0.04, my0 - 0.04, mx1 + 0.04, my1 + 0.04, H, 1.8,
      LAB_BLUE_LIGHT, LAB_BLUE, LAB_BLUE_DARK);

    const D = P(mx0, my1);
    const C = P(mx1, my1);
    const B = P(mx1, my0);

    // лента остекления по фасаду
    patchPx(ctx, D, C, H, 0.09, 0.91, 3.2, 7.8, 'rgba(10,22,30,.82)');
    patchPx(ctx, D, C, H, 0.13, 0.87, 3.9, 7.0,
      L >= 8 ? '#a9f7ff' : PAL.glass);
    ribLines(ctx, D, C, H, 0.11, 0.89, 3.2, 7.8, 4,
      'rgba(16,32,42,.65)', 1.1);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(D.x + (C.x - D.x) * 0.18, D.y + (C.y - D.y) * 0.18 - 6.6, 7, 0.9);

    // боковое окно
    patchPx(ctx, C, B, H, 0.2, 0.52, 4.2, 7.0, 'rgba(127,233,255,.55)');

    // вход с бирюзовой рамкой
    patchPx(ctx, D, C, H, 0.42, 0.58, 0.2, 4.4, 'rgba(8,18,24,.9)');
    patchPx(ctx, D, C, H, 0.405, 0.425, 0.2, 4.6, PAL.cyan);
    patchPx(ctx, D, C, H, 0.575, 0.595, 0.2, 4.6, PAL.cyan);

    // кабели к терминалам
    ctx.strokeStyle = 'rgba(28,42,50,.7)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(D.x + 4, D.y - 1);
    ctx.quadraticCurveTo(D.x - 2, D.y + 2, D.x - 8, D.y + 1.5);
    ctx.moveTo(C.x - 4, C.y - 1);
    ctx.quadraticCurveTo(C.x + 2, C.y + 2, C.x + 8, C.y + 1.5);
    ctx.stroke();

    // вентиляция на крыше
    prism(ctx, x0 + 0.24, y0 + 0.24, x0 + 0.58, y0 + 0.48, baseH + H, 4.4,
      PAL.metalLight, PAL.metal, PAL.metalDark);
    ribLines(ctx, P(x0 + 0.24, y0 + 0.48), P(x0 + 0.58, y0 + 0.48),
      4.4, 0.15, 0.85, 0.6, 3.6, 3, 'rgba(30,42,50,.5)', 0.8);

    // солнечная панель с 4 уровня
    if (L >= 4) {
      const sp = P(x0 + 1.42, y0 + 0.36);
      solarPanel(ctx, sp.x, sp.y - baseH - H - 2, 20, 8, -0.22);
    }

    // купол обсерватории
    const dc = P(x0 + 0.78, y0 + 0.9);
    const roofY = dc.y - baseH - H;
    const drx = 10.5 + L * 0.8;
    const dry = drx * 0.5;

    ctx.fillStyle = LAB_BLUE_DARK;
    ctx.beginPath();
    ctx.ellipse(dc.x, roofY, drx + 1.5, (drx + 1.5) * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LAB_BLUE_LIGHT;
    ctx.beginPath();
    ctx.ellipse(dc.x, roofY - 0.4, drx + 0.8, (drx + 0.8) * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LAB_BLUE;
    ctx.beginPath();
    ctx.ellipse(dc.x, roofY, drx, dry * 1.08, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // остекление и рёбра купола
    ctx.fillStyle = 'rgba(127,233,255,.22)';
    ctx.beginPath();
    ctx.ellipse(dc.x, roofY - 1.2, drx * 0.62, dry * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,233,255,.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 1; k <= 2; k++) {
      const rr = k / 3;
      ctx.moveTo(dc.x - drx * rr, roofY);
      ctx.ellipse(dc.x, roofY, drx * rr, dry * rr, 0, Math.PI, Math.PI * 2);
    }
    ctx.stroke();
    ctx.strokeStyle = L >= 9 ? PAL.gold : PAL.metalLight;
    ctx.lineWidth = L >= 9 ? 1.6 : 1.1;
    ctx.beginPath();
    ctx.ellipse(dc.x, roofY, drx, dry * 1.08, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    // антенна на куполе — главный «маяк» L1
    const apex = roofY - dry * 1.08;
    antennaMast(ctx, dc.x + 1, apex, 8 + L * 0.7,
      L >= 9 ? PAL.gold : PAL.metalLight, L >= 10 ? PAL.gold : PAL.glass);

    // тарелка связи: малая с 3, большая с 8
    if (L >= 8) {
      const d = P(x0 + 1.46, y0 + 0.62);
      labDish(ctx, d.x, d.y - baseH - H - 1, 1.35, -0.52, PAL.gold);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - baseH - H);
      ctx.lineTo(d.x, d.y - baseH - H - 10);
      ctx.stroke();
    } else if (L >= 3) {
      const d = P(x0 + 1.45, y0 + 0.6);
      labDish(ctx, d.x, d.y - baseH - H, 0.75, -0.45, PAL.cold);
    }

    // второй модуль с 5 уровня
    const upperH = L >= 5 ? 6.5 + (L - 5) * 0.45 : 0;
    if (upperH > 0) {
      const ux0 = x0 + 1.08;
      const uy0 = y0 + 0.16;
      const ux1 = x1 - 0.18;
      const uy1 = y0 + 0.7;
      prism(ctx, ux0, uy0, ux1, uy1, baseH + H, upperH,
        LAB_BLUE_LIGHT, LAB_BLUE, LAB_BLUE_DARK);
      const UD = P(ux0, uy1);
      const UC = P(ux1, uy1);
      patchPx(ctx, UD, UC, upperH, 0.12, 0.88, 1.2, upperH - 1.8, PAL.glass);
      ribLines(ctx, UD, UC, upperH, 0.14, 0.86, 1.2, upperH - 1.8, 3,
        'rgba(10,22,30,.55)', 0.9);
      if (L >= 6) {
        const mc = P((ux0 + ux1) / 2, (uy0 + uy1) / 2);
        const my = mc.y - baseH - H - upperH;
        ctx.fillStyle = LAB_BLUE_LIGHT;
        ctx.beginPath();
        ctx.ellipse(mc.x, my, 7, 7 * GQ, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,233,255,.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(mc.x, my, 7, 7 * GQ, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }

    // терминалы и голо-стол
    if (L >= 2) {
      const t1 = P(x0 + 0.34, y1 - 0.16);
      labTerminal(ctx, t1.x, t1.y, 0.9, L >= 8 ? PAL.gold : PAL.glass);
      if (L >= 6) {
        const t2 = P(x1 - 0.3, y1 - 0.14);
        labTerminal(ctx, t2.x, t2.y, 0.8, PAL.cyan);
      }
    }
    if (L >= 5) {
      const hp = P(x0 + 0.55, y1 - 0.22);
      labHolo(ctx, hp.x, hp.y - baseH, 11 + (L - 5) * 0.7, 0.9, L >= 10);
    }

    // 7: кабельный лоток по борту
    if (L >= 7) {
      ctx.strokeStyle = 'rgba(24,38,48,.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(B.x, B.y - 3);
      ctx.lineTo(B.x, B.y - H + 2);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const yy = B.y - 4 - i * 4;
        ctx.beginPath();
        ctx.moveTo(B.x - 1.4, yy);
        ctx.lineTo(B.x + 2.4, yy - 0.4);
        ctx.stroke();
      }
    }

    // 9: золотая окантовка крыши
    if (L >= 9) {
      ctx.save();
      ctx.translate(0, -baseH - H - 1.8);
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.4;
      diamond(ctx, P(mx0 - 0.03, my0 - 0.03), P(mx1 + 0.03, my0 - 0.03),
        P(mx1 + 0.03, my1 + 0.03), P(mx0 - 0.03, my1 + 0.03));
      ctx.stroke();
      ctx.restore();
    }

    // 10: обсерватория над модулем — кольцо, телескоп и свечение
    if (L >= 10) {
      const oc = P(x0 + 1.38, y0 + 0.43);
      const oy = oc.y - baseH - H - upperH - 10;
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(oc.x - 8, oy + 3);
      ctx.lineTo(oc.x - 5, oy + 9);
      ctx.moveTo(oc.x + 8, oy + 3);
      ctx.lineTo(oc.x + 5, oy + 9);
      ctx.stroke();

      ctx.fillStyle = 'rgba(127,233,255,.16)';
      ctx.beginPath();
      ctx.ellipse(oc.x, oy + 1, 12, 8, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ring(ctx, oc.x, oy + 1, 12, 12 * GQ, PAL.gold, 2);
      ring(ctx, oc.x, oy + 1, 9, 9 * GQ, PAL.glass, 1);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(oc.x - 5, oy - 1);
      ctx.lineTo(oc.x + 4, oy - 7);
      ctx.stroke();
      spot(ctx, oc.x + 4, oy - 7.4, 1.2, PAL.gold);
      // луч обсерватории: главный акцент L10
      poly(ctx, [
        { x: oc.x - 4, y: oy - 5 },
        { x: oc.x + 4, y: oy - 5 },
        { x: oc.x + 9, y: oy - 26 },
        { x: oc.x - 9, y: oy - 26 }
      ], 'rgba(127,233,255,.06)');
      spot(ctx, oc.x, oy - 26, 2.2, 'rgba(236,255,251,.85)');
      spot(ctx, oc.x, oy, 16, 'rgba(127,233,255,.16)');
      spot(ctx, oc.x, oy - 1, 7, 'rgba(127,233,255,.22)');
      spot(ctx, oc.x, oy - 1, 2.2, 'rgba(236,255,251,.95)');
    }

    ctx.lineCap = 'butt';
  }

  /* ---------- академия героя ----------
     Штаб Сержанта: бетонно-металлический корпус с аркой, красными
     знамёнами, золотой отделкой, подиумом со статуей (L10 — голограммой)
     и оружейными стойками. Прямоугольный фасад и арка отличают его от
     командного центра с куполом. */

  const HH_STONE = '#868b8d';
  const HH_STONE_LIGHT = '#b2b6b5';
  const HH_STONE_DARK = '#565c5f';
  const HH_ROOF = '#6f7576';
  const HH_RED = '#a8402f';
  const HH_RED_DARK = '#712a21';
  // Знамя академии — бирюза армии, красный остаётся только у статуи героя.
  const HH_FLAG = '#2f8f8a';
  const HH_FLAG_DARK = '#1d5f5c';

  // Мини-статуя Сержанта: плащ, песочная броня, золото, бирюзовый визор.
  function heroStatue(ctx, x, baseY, s, holo) {
    const prev = ctx.globalAlpha;
    if (holo) ctx.globalAlpha = prev * 0.8;

    const armor = holo ? '#9fe9e2' : '#c9b487';
    const armorLight = holo ? '#d7fffb' : '#e3d2ab';
    const dark = holo ? 'rgba(70,224,200,.55)' : '#6d5f48';
    const cape = holo ? 'rgba(168,64,47,.7)' : HH_RED;
    const trim = holo ? '#eafffb' : PAL.gold;

    ctx.fillStyle = holo ? 'rgba(70,224,200,.18)' : 'rgba(40,26,16,.25)';
    ctx.beginPath();
    ctx.ellipse(x, baseY + 0.4, 6.8 * s, 6.8 * s * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    // плащ
    poly(ctx, [
      { x: x - 4.6 * s, y: baseY - 13 * s },
      { x: x + 4.6 * s, y: baseY - 13 * s },
      { x: x + 5.6 * s, y: baseY - 2.2 * s },
      { x: x + 1.2 * s, y: baseY - 1.0 * s },
      { x: x - 5.4 * s, y: baseY - 2.4 * s }
    ], cape);

    // ноги и ботинки
    ctx.fillStyle = dark;
    ctx.fillRect(x - 2.8 * s, baseY - 7.4 * s, 2.2 * s, 6.4 * s);
    ctx.fillRect(x + 0.6 * s, baseY - 7.4 * s, 2.2 * s, 6.4 * s);
    ctx.fillStyle = holo ? 'rgba(70,224,200,.65)' : '#3d454b';
    ctx.fillRect(x - 3.2 * s, baseY - 1.4 * s, 3.0 * s, 1.4 * s);
    ctx.fillRect(x + 0.2 * s, baseY - 1.4 * s, 3.0 * s, 1.4 * s);

    // корпус
    poly(ctx, [
      { x: x - 4.2 * s, y: baseY - 15 * s },
      { x: x + 4.2 * s, y: baseY - 15 * s },
      { x: x + 4.8 * s, y: baseY - 6.6 * s },
      { x: x - 4.8 * s, y: baseY - 6.6 * s }
    ], armor);
    ctx.fillStyle = holo ? trim : HH_RED;
    ctx.fillRect(x - 3.8 * s, baseY - 11 * s, 7.6 * s, 1.5 * s);
    spot(ctx, x, baseY - 13.4 * s, 1.2 * s, trim);
    spot(ctx, x - 4.8 * s, baseY - 14 * s, 2.6 * s, armorLight);
    spot(ctx, x + 4.8 * s, baseY - 14 * s, 2.6 * s, armorLight);

    // шлем и визор
    spot(ctx, x, baseY - 18.4 * s, 3.4 * s, holo ? armor : PAL.panel);
    spot(ctx, x, baseY - 18.6 * s, 2.8 * s, armorLight);
    ctx.fillStyle = holo ? trim : PAL.glass;
    ctx.fillRect(x - 2.6 * s, baseY - 18.8 * s, 5.2 * s, 1.5 * s);
    ctx.fillStyle = trim;
    ctx.fillRect(x - 0.5 * s, baseY - 21.4 * s, 1.0 * s, 2.0 * s);
    ctx.strokeStyle = holo ? trim : PAL.metalLight;
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(x + 2.2 * s, baseY - 20.6 * s);
    ctx.lineTo(x + 4.0 * s, baseY - 24.2 * s);
    ctx.stroke();
    spot(ctx, x + 4.0 * s, baseY - 24.4 * s, 0.8 * s, holo ? trim : PAL.cold);

    // тяжёлое оружие на груди
    if (!holo) {
      ctx.strokeStyle = '#3d454b';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(x - 3.4 * s, baseY - 8.4 * s);
      ctx.lineTo(x + 5.4 * s, baseY - 9.6 * s);
      ctx.stroke();
      spot(ctx, x + 5.4 * s, baseY - 9.6 * s, 0.8 * s, PAL.gold);
    }

    ctx.globalAlpha = prev;
  }

  // Стойка с тремя карабинами у стены академии.
  function weaponRack(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(34,24,16,.2)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 0.4, 6.5 * s, 6.5 * s * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y);
    ctx.lineTo(x - 5 * s, y - 10 * s);
    ctx.moveTo(x + 5 * s, y);
    ctx.lineTo(x + 5 * s, y - 10 * s);
    ctx.moveTo(x - 5 * s, y - 8.6 * s);
    ctx.lineTo(x + 5 * s, y - 8.6 * s);
    ctx.stroke();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const xx = x - 3 + i * 3 * s;
      ctx.beginPath();
      ctx.moveTo(xx, y - 7.6 * s);
      ctx.lineTo(xx + 1.2 * s, y - 2.2 * s);
      ctx.stroke();
    }
    spot(ctx, x, y - 8.6 * s, 0.7, PAL.amber);
  }

  function drawHeroHall(ctx, b, lvl) {
    const L = Math.max(1, Math.min(MAX_LVL, Math.round(lvl || 1)));
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const baseH = 3.6 + L * 0.22;
    const H = 14 + L * 1.0;

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 1.25);

    // каменный подиум и ступени к арке
    prism(ctx, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, 0, baseH,
      HH_STONE_LIGHT, HH_STONE, HH_STONE_DARK);
    prism(ctx, x0 + 0.02, y1 - 0.3, x1 - 0.02, y1 - 0.02, 0, baseH * 0.62,
      HH_STONE_LIGHT, HH_STONE, HH_STONE_DARK);

    const mx0 = x0 + 0.16;
    const my0 = y0 + 0.16;
    const mx1 = x1 - 0.16;
    const my1 = y1 - 0.46;

    box(ctx, mx0, my0, mx1, my1, H, HH_STONE);
    prism(ctx, mx0 - 0.04, my0 - 0.04, mx1 + 0.04, my1 + 0.04, H, 2.2,
      HH_ROOF, HH_STONE, HH_STONE_DARK);
    if (L >= 3) {
      ctx.save();
      ctx.translate(0, -(baseH + H + 2.2));
      ctx.strokeStyle = L >= 9 ? PAL.gold : 'rgba(255,207,74,.42)';
      ctx.lineWidth = L >= 9 ? 1.5 : 1;
      diamond(ctx, P(mx0 - 0.04, my0 - 0.04), P(mx1 + 0.04, my0 - 0.04),
        P(mx1 + 0.04, my1 + 0.04), P(mx0 - 0.04, my1 + 0.04));
      ctx.stroke();
      ctx.restore();
    }

    const D = P(mx0, my1);
    const C = P(mx1, my1);

    // фасадные пилястры
    patchPx(ctx, D, C, H, 0.05, 0.15, 0.4, H - 1.4, HH_STONE_DARK);
    patchPx(ctx, D, C, H, 0.85, 0.95, 0.4, H - 1.4, HH_STONE_DARK);
    patchPx(ctx, D, C, H, 0.13, 0.15, 0.4, H - 1.4, HH_STONE_LIGHT);
    patchPx(ctx, D, C, H, 0.85, 0.87, 0.4, H - 1.4, HH_STONE_LIGHT);

    // окна верхнего пояса
    windowRow(ctx, D, C, H, 0.19, 0.81, H * 0.7, H * 0.82,
      L >= 7 ? 4 : 2, L >= 9 ? PAL.gold : PAL.amber);

    // арка входа
    const archTop = H * (L >= 5 ? 0.62 : 0.55);
    const u0 = L >= 10 ? 0.28 : 0.36;
    const u1 = 1 - u0;
    const ax = D.x + (C.x - D.x) * u0;
    const ay = D.y + (C.y - D.y) * u0;
    const bx = D.x + (C.x - D.x) * u1;
    const by = D.y + (C.y - D.y) * u1;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    ctx.fillStyle = 'rgba(14,16,18,.86)';
    ctx.beginPath();
    ctx.moveTo(ax, ay - 0.5);
    ctx.lineTo(ax, ay - archTop);
    ctx.quadraticCurveTo(mx, my - archTop - 10, bx, by - archTop);
    ctx.lineTo(bx, by - 0.5);
    ctx.closePath();
    ctx.fill();

    // тёплый свет в проёме
    const inU0 = u0 + 0.05;
    const inU1 = u1 - 0.05;
    const iax = D.x + (C.x - D.x) * inU0;
    const iay = D.y + (C.y - D.y) * inU0;
    const ibx = D.x + (C.x - D.x) * inU1;
    const iby = D.y + (C.y - D.y) * inU1;
    ctx.fillStyle = 'rgba(255,196,120,.18)';
    ctx.beginPath();
    ctx.moveTo(iax, iay - 1);
    ctx.lineTo(iax, iay - archTop * 0.74);
    ctx.quadraticCurveTo((iax + ibx) / 2, (iay + iby) / 2 - archTop * 0.74 - 7,
      ibx, iby - archTop * 0.74);
    ctx.lineTo(ibx, iby - 1);
    ctx.closePath();
    ctx.fill();

    // золотая окантовка арки и створки
    ctx.strokeStyle = L >= 5 ? PAL.gold : PAL.amber;
    ctx.lineWidth = L >= 8 ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 0.5);
    ctx.lineTo(ax, ay - archTop);
    ctx.quadraticCurveTo(mx, my - archTop - 10, bx, by - archTop);
    ctx.lineTo(bx, by - 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(76,58,38,.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(mx, my - archTop + 1);
    ctx.lineTo(mx, my - 1);
    ctx.stroke();

    // красные знамёна на крыше
    const flagX = L >= 2 ? mx0 + 0.55 : mx0 + 0.5;
    const fy = P(flagX, my1).y - baseH - H - 2.8;
    banner(ctx, P(flagX, my1).x, fy, 13, 6, 9, HH_FLAG);
    if (L >= 2) banner(ctx, P(flagX, my1).x + 1, fy - 11, 8, 4, 5, HH_FLAG_DARK);
    if (L >= 4) {
      const f2x = mx1 - 0.55;
      banner(ctx, P(f2x, my1).x, fy, 12, 5.5, 8, HH_FLAG);
    }

    // полотнища на фасаде: красный цвет читается даже на мелком тайле
    if (L >= 2) {
      const bu = 0.18;
      const bxp = D.x + (C.x - D.x) * bu;
      const byp = D.y + (C.y - D.y) * bu;
      poly(ctx, [
        { x: bxp, y: byp - H * 0.84 },
        { x: bxp + 5.5, y: byp - H * 0.84 + 1.2 },
        { x: bxp + 5.5, y: byp - H * 0.54 },
        { x: bxp, y: byp - H * 0.57 }
      ], HH_RED);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(bxp + 0.4, byp - H * 0.84 - 0.5, 4.7, 0.8);
    }
    if (L >= 7) {
      const bu2 = 0.78;
      const bxp2 = D.x + (C.x - D.x) * bu2;
      const byp2 = D.y + (C.y - D.y) * bu2;
      poly(ctx, [
        { x: bxp2, y: byp2 - H * 0.84 },
        { x: bxp2 + 5.0, y: byp2 - H * 0.84 + 1.0 },
        { x: bxp2 + 5.0, y: byp2 - H * 0.52 },
        { x: bxp2, y: byp2 - H * 0.55 }
      ], HH_RED_DARK);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(bxp2 + 0.4, byp2 - H * 0.84 - 0.5, 4.2, 0.8);
    }

    // золотой карниз над аркой
    ctx.strokeStyle = L >= 8 ? PAL.gold : 'rgba(255,207,74,.7)';
    ctx.lineWidth = L >= 8 ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.moveTo(ax - 2, ay - archTop - 5);
    ctx.quadraticCurveTo(mx, my - archTop - (L >= 5 ? 17 : 14),
      bx + 2, by - archTop - 5);
    ctx.stroke();

    // 6+: факелы у арки — тёплый акцент между ярусом и парадным фасадом
    if (L >= 6) {
      const tL = 0.3;
      const tR = 0.7;
      const tx0 = D.x + (C.x - D.x) * tL;
      const ty0 = D.y + (C.y - D.y) * tL;
      const tx1 = D.x + (C.x - D.x) * tR;
      const ty1 = D.y + (C.y - D.y) * tR;
      spot(ctx, tx0, ty0 - archTop * 0.6, 3.2, 'rgba(255,196,120,.16)');
      spot(ctx, tx0, ty0 - archTop * 0.6, 1.0, PAL.amber);
      spot(ctx, tx1, ty1 - archTop * 0.6, 3.2, 'rgba(255,196,120,.16)');
      spot(ctx, tx1, ty1 - archTop * 0.6, 1.0, PAL.amber);
    }

    // подиум со статуей (с 3), на L10 — голограмма Сержанта
    if (L >= 3) {
      const pc = P(x0 + 0.58, y1 - 0.22);
      const podH = 2.8 + (L >= 10 ? 0.8 : 0);
      prism(ctx, x0 + 0.37, y1 - 0.45, x0 + 0.79, y1 - 0.03, 0, podH,
        HH_STONE_LIGHT, HH_STONE, HH_STONE_DARK);
      prism(ctx, x0 + 0.33, y1 - 0.49, x0 + 0.83, y1 + 0.01, podH, 1.0,
        PAL.gold, PAL.amber, PAL.gold);
      const sy = pc.y - podH - 0.3;
      if (L >= 10) {
        poly(ctx, [
          { x: pc.x - 3, y: sy - 2 },
          { x: pc.x + 3, y: sy - 2 },
          { x: pc.x + 9, y: sy - 34 },
          { x: pc.x - 9, y: sy - 34 }
        ], 'rgba(70,224,200,.08)');
        spot(ctx, pc.x, sy - 1, 9, 'rgba(70,224,200,.14)');
        spot(ctx, pc.x, sy - 1, 3.6, 'rgba(200,255,250,.35)');
        heroStatue(ctx, pc.x, sy, 1.3, true);
      } else {
        heroStatue(ctx, pc.x, sy, 1.0 + (L - 3) * 0.04, false);
      }
    }

    // оружейные стойки
    if (L >= 4) {
      const w1 = P(x0 + 0.26, y1 - 0.18);
      weaponRack(ctx, w1.x, w1.y - baseH * 0.4, 0.85);
    }
    if (L >= 7) {
      const w2 = P(x1 - 0.24, y1 - 0.16);
      weaponRack(ctx, w2.x, w2.y - baseH * 0.4, 0.8);
    }

    // второй ярус с 5 уровня
    const upperH = L >= 5 ? 8 + (L - 5) * 0.5 : 0;
    const ux0 = mx0 + 0.22;
    const uy0 = my0 + 0.1;
    const ux1 = mx1 - 0.22;
    const uy1 = my0 + 0.95;
    if (upperH > 0) {
      prism(ctx, ux0, uy0, ux1, uy1, baseH + H, upperH,
        HH_ROOF, HH_STONE, HH_STONE_DARK);
      // парапет: только золотая кромка и зубцы, а не сплошная плита
      ctx.save();
      ctx.translate(0, -(baseH + H + upperH));
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.2;
      diamond(ctx, P(ux0 - 0.03, uy0 - 0.03), P(ux1 + 0.03, uy0 - 0.03),
        P(ux1 + 0.03, uy1 + 0.03), P(ux0 - 0.03, uy1 + 0.03));
      ctx.stroke();
      ctx.restore();
      // зубцы по переднему краю крыши
      const UD = P(ux0, uy1);
      const UC = P(ux1, uy1);
      ctx.strokeStyle = HH_STONE_LIGHT;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let k = 1; k <= 4; k++) {
        const uu = k / 5;
        const cxx = UD.x + (UC.x - UD.x) * uu;
        const cyy = UD.y + (UC.y - UD.y) * uu - upperH;
        ctx.moveTo(cxx, cyy);
        ctx.lineTo(cxx, cyy - 2.0);
      }
      ctx.stroke();
      // люк и вентиляция на крыше яруса
      prism(ctx, ux0 + 0.25, uy0 + 0.2, ux0 + 0.5, uy0 + 0.36,
        baseH + H + upperH, 2.0, PAL.metalLight, PAL.metal, PAL.metalDark);
      windowRow(ctx, UD, UC, upperH, 0.12, 0.88, 2.4, upperH - 2.0,
        L >= 8 ? 4 : 3, L >= 9 ? PAL.gold : PAL.amber);
      patchPx(ctx, UD, UC, upperH, 0.04, 0.1, 1.2, upperH - 1.2, PAL.gold);
      patchPx(ctx, UD, UC, upperH, 0.9, 0.96, 1.2, upperH - 1.2, PAL.gold);
      banner(ctx, P(ux0 + 0.2, uy1).x,
        P(ux0 + 0.2, uy1).y - baseH - H - upperH - 1.8,
        10, 5, 7, L >= 9 ? PAL.gold : HH_FLAG);
    }

    // 8: купол и прожекторы
    if (L >= 8) {
      const uc = P((ux0 + ux1) / 2, (uy0 + uy1) / 2);
      const uy = uc.y - baseH - H - upperH;
      ctx.fillStyle = HH_STONE_DARK;
      ctx.beginPath();
      ctx.ellipse(uc.x, uy, 15, 7, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = HH_STONE_LIGHT;
      ctx.beginPath();
      ctx.ellipse(uc.x, uy - 0.8, 13.8, 6.2, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      // рёбра купола и золотая кромка
      ctx.strokeStyle = 'rgba(60,66,68,.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 1; k <= 2; k++) {
        const rr = k / 3;
        ctx.moveTo(uc.x - 13.8 * rr, uy - 0.8);
        ctx.ellipse(uc.x, uy - 0.8, 13.8 * rr, 6.2 * rr, 0, Math.PI, Math.PI * 2);
      }
      ctx.stroke();
      ctx.strokeStyle = L >= 9 ? PAL.gold : PAL.metalLight;
      ctx.lineWidth = L >= 9 ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.ellipse(uc.x, uy - 0.8, 13.8, 6.2, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      // фонарь на вершине купола
      spot(ctx, uc.x, uy - 5.6, 2.2, L >= 10 ? PAL.gold : PAL.metalDark);
      spot(ctx, uc.x, uy - 5.8, 1.0, L >= 10 ? 'rgba(255,252,232,.95)' : PAL.cold);
      if (L >= 10) {
        spot(ctx, uc.x, uy - 5.6, 9, 'rgba(255,207,74,.12)');
      }

      const lA = P(mx0 + 0.12, my1 - 0.1);
      const lB = P(mx1 - 0.12, my1 - 0.1);
      const lampY = lA.y - baseH - H - 2;
      poly(ctx, [
        { x: lA.x - 2, y: lampY },
        { x: lA.x + 2, y: lampY },
        { x: lA.x - 13, y: lampY - 30 },
        { x: lA.x - 17, y: lampY - 29 }
      ], L >= 10 ? 'rgba(255,240,190,.18)' : 'rgba(255,240,190,.11)');
      poly(ctx, [
        { x: lB.x - 2, y: lampY },
        { x: lB.x + 2, y: lampY },
        { x: lB.x + 13, y: lampY - 30 },
        { x: lB.x + 17, y: lampY - 29 }
      ], L >= 10 ? 'rgba(255,240,190,.18)' : 'rgba(255,240,190,.11)');
      spot(ctx, lA.x, lampY, 2.4, PAL.gold);
      spot(ctx, lB.x, lampY, 2.4, PAL.gold);
      spot(ctx, lA.x, lampY, 1.0, 'rgba(255,252,232,.95)');
      spot(ctx, lB.x, lampY, 1.0, 'rgba(255,252,232,.95)');
      if (L >= 10) {
        spot(ctx, lA.x, lampY, 7, 'rgba(255,240,190,.12)');
        spot(ctx, lB.x, lampY, 7, 'rgba(255,240,190,.12)');
      }
    }

    // 9: золотые навершия по углам
    if (L >= 9) {
      const corners = [
        P(mx0 + 0.02, my0 + 0.02), P(mx1 - 0.02, my0 + 0.02),
        P(mx0 + 0.02, my1 - 0.02), P(mx1 - 0.02, my1 - 0.02)
      ];
      for (let i = 0; i < corners.length; i++) {
        spire(ctx, corners[i].x, corners[i].y - baseH - H - 2,
          L >= 10 ? 11 : 8);
      }
    }

    // 10: парадный фасад — золотая полоса, герб и свечение голограммы
    if (L >= 10) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(D.x + (C.x - D.x) * 0.05, D.y + (C.y - D.y) * 0.05 - H + 2.2);
      ctx.lineTo(C.x, C.y - H + 2.2);
      ctx.stroke();

      // золотые пилястры парадной арки
      ctx.lineWidth = 2.4;
      const p0 = D.x + (C.x - D.x) * 0.25;
      const p0y = D.y + (C.y - D.y) * 0.25;
      const p1 = D.x + (C.x - D.x) * 0.75;
      const p1y = D.y + (C.y - D.y) * 0.75;
      ctx.beginPath();
      ctx.moveTo(p0, p0y - 1);
      ctx.lineTo(p0, p0y - archTop - 1);
      ctx.moveTo(p1, p1y - 1);
      ctx.lineTo(p1, p1y - archTop - 1);
      ctx.stroke();
      spot(ctx, p0, p0y - archTop - 2, 1.4, PAL.gold);
      spot(ctx, p1, p1y - archTop - 2, 1.4, PAL.gold);

      const ex = mx;
      const ey = my - archTop - 6;
      poly(ctx, [
        { x: ex, y: ey - 5 },
        { x: ex + 4.5, y: ey - 1.5 },
        { x: ex + 3, y: ey + 4 },
        { x: ex, y: ey + 6 },
        { x: ex - 3, y: ey + 4 },
        { x: ex - 4.5, y: ey - 1.5 }
      ], PAL.gold);
      spot(ctx, ex, ey, 1.6, HH_RED_DARK);

      const pc = P(x0 + 0.58, y1 - 0.22);
      spot(ctx, pc.x, pc.y - 9, 16, 'rgba(70,224,200,.08)');
      ring(ctx, pc.x, pc.y - 0.2, 9.5, 9.5 * GQ, PAL.gold, 1.3);
      ring(ctx, pc.x, pc.y - 0.2, 6.6, 6.6 * GQ, PAL.glass, 0.8);
    }

    ctx.lineCap = 'butt';
  }

  // Мешок руды: песочная ткань, тёмная завязка и золотой самородок сверху.
  function oreSack(ctx, x, y, s) {
    const cloth = '#c9a063';
    ctx.fillStyle = 'rgba(60,28,14,.2)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 1, 5.4 * s, 5.4 * s * GQ, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = shade(cloth, -0.22);
    ctx.beginPath();
    ctx.ellipse(x, y - 3.4 * s, 5 * s, 3.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.ellipse(x - 0.8 * s, y - 4.4 * s, 4.2 * s, 3.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(cloth, 0.28);
    ctx.beginPath();
    ctx.ellipse(x - 1.8 * s, y - 5.6 * s, 1.8 * s, 1 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // завязанное горло
    poly(ctx, [
      { x: x - 1.5 * s, y: y - 7.4 * s },
      { x: x + 1.5 * s, y: y - 7.4 * s },
      { x: x + 1 * s, y: y - 9.4 * s },
      { x: x - 1 * s, y: y - 9.4 * s }
    ], shade(cloth, -0.34));

    // золото в горловине
    spot(ctx, x, y - 9.5 * s, 1.5 * s, PAL.gold);
    spot(ctx, x - 0.6 * s, y - 10.2 * s, 0.6 * s, shade(PAL.gold, 0.4));
  }

  function drawStorage(ctx, b, lvl) {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const p = P(x0 + b.w / 2, y0 + b.h / 2);

    // Склад руды — тёплый песочный контейнер с золотыми прожилками и
    // мешками у входа. Ни одной энергетической бирюзы: рядом стоит
    // фиолетово-бирюзовый накопитель, и типы должны различаться с первого
    // взгляда.
    const sand = mix(PAL.stoneLight, PAL.gold, 0.42);
    const sandTop = shade(sand, 0.16);
    const sandDark = shade(sand, -0.24);
    const ink = 'rgba(58,40,22,.82)';

    grassPad(ctx, x0, y0, x1, y1);
    castShadow(ctx, x0, y0, x1, y1, 0.9);

    // каменная плита
    prism(ctx, x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, 0, 5,
      PAL.stoneLight, PAL.stone, PAL.stoneDark);

    // основной песочный контейнер
    const h1 = 17 + (lvl >= 4 ? 3 : 0);
    box(ctx, x0 + 0.08, y0 + 0.1, x1 - 0.26, y1 - 0.26, h1, sand);

    const D = P(x0 + 0.08, y1 - 0.26);
    const C = P(x1 - 0.26, y1 - 0.26);
    const B = P(x1 - 0.26, y0 + 0.1);

    // рёбра жёсткости и тёплые тени
    patchPx(ctx, D, C, h1, 0.1, 0.145, 2, h1 - 2, sandDark);
    patchPx(ctx, D, C, h1, 0.855, 0.9, 2, h1 - 2, sandDark);
    patchPx(ctx, C, B, h1, 0.14, 0.18, 2, h1 - 2, sandDark);

    // табличка «руда»: тёмная пластина и три золотых самородка
    patchPx(ctx, D, C, h1, 0.24, 0.56, h1 * 0.36, h1 * 0.62, ink);
    const q = {
      x: D.x + (C.x - D.x) * 0.4,
      y: D.y + (C.y - D.y) * 0.4 - h1 * 0.49
    };
    spot(ctx, q.x - 3.2, q.y + 0.8, 1.7, PAL.gold);
    spot(ctx, q.x + 0.6, q.y - 0.8, 2, PAL.gold);
    spot(ctx, q.x + 3.6, q.y + 0.9, 1.4, PAL.gold);
    if (mid()) {
      spot(ctx, q.x - 3.6, q.y + 0.2, 0.6, shade(PAL.gold, 0.45));
      spot(ctx, q.x + 0.2, q.y - 1.4, 0.6, shade(PAL.gold, 0.45));
    }

    // вентиляционная решётка на правой грани — склад, а не бак
    patchPx(ctx, C, B, h1, 0.24, 0.42, h1 * 0.3, h1 * 0.46, 'rgba(52,40,26,.62)');
    if (mid()) {
      ctx.strokeStyle = 'rgba(255,235,190,.22)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const yy = h1 * 0.34 + i * 1.8;
        ctx.moveTo(C.x + (B.x - C.x) * 0.26, C.y + (B.y - C.y) * 0.26 - yy);
        ctx.lineTo(C.x + (B.x - C.x) * 0.4, C.y + (B.y - C.y) * 0.4 - yy);
      }
      ctx.stroke();
    }

    // золотая жила по нижней кромке
    patchPx(ctx, D, C, h1, 0.08, 0.92, 1.2, 2.4, 'rgba(255,207,74,.5)');
    // тонкий золотой пояс под крышкой — экономика читается и на L1
    patchPx(ctx, D, C, h1, 0.08, 0.92, h1 - 2.6, h1 - 1.2, 'rgba(255,207,74,.42)');

    // открытый лоток на крыше: горка руды
    const t = P(x0 + 0.4, y0 + 0.32);
    const topY = t.y - h1;
    ctx.fillStyle = shade(PAL.gold, -0.22);
    ctx.beginPath();
    ctx.ellipse(t.x, topY - 0.6, 9.5, 9.5 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.ellipse(t.x - 0.8, topY - 2.2, 7.4, 7.4 * GQ, 0, 0, Math.PI * 2);
    ctx.ellipse(t.x + 5.4, topY - 1.2, 4.2, 4.2 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mid()) {
      spot(ctx, t.x - 3.4, topY - 3.6, 1.5, shade(PAL.gold, 0.35));
      spot(ctx, t.x + 2.4, topY - 3.1, 1.1, shade(PAL.gold, 0.3));
    }

    // второй контейнер со 2 уровня — светлее, чтобы читалась глубина
    if (lvl >= 2) {
      prism(ctx, x0 + 0.42, y0 + 0.52, x1 - 0.06, y1 - 0.06, 5, 11,
        sandTop, shade(sand, 0.02), sandDark);
      const sq = P(x1 - 0.24, y1 - 0.18);
      ctx.strokeStyle = 'rgba(255,207,74,.75)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sq.x - 4, sq.y - 8);
      ctx.lineTo(sq.x + 2, sq.y - 8);
      ctx.stroke();
    }

    // 3: бункер-накопитель руды с золотой горкой вместо уровня энергии
    if (lvl >= 3) {
      const h = P(x0 + 0.26, y0 + 0.34);
      const th = 16 + (lvl >= 5 ? 4 : 0);
      ctx.fillStyle = sandDark;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - 1, 7, 7 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(sand, -0.06);
      ctx.fillRect(h.x - 7, h.y - th, 14, th);
      ctx.fillStyle = sandTop;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - th, 7, 7 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      // золото в бункере
      ctx.fillStyle = shade(PAL.gold, -0.16);
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - th - 0.6, 6, 6 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.ellipse(h.x - 0.8, h.y - th - 1.8, 4.6, 4.6 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      // обручи бункера
      ctx.strokeStyle = sandDark;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(h.x - 7, h.y - th * 0.42);
      ctx.lineTo(h.x + 7, h.y - th * 0.42);
      ctx.stroke();
      spot(ctx, h.x - 5, h.y - th + 1.2, 1, PAL.gold);
    }

    // 4: второй малый контейнер
    if (lvl >= 4) {
      const t2 = P(x1 - 0.18, y0 + 0.24);
      ctx.fillStyle = sandDark;
      ctx.beginPath();
      ctx.ellipse(t2.x, t2.y - 1, 5, 5 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sandTop;
      ctx.fillRect(t2.x - 5, t2.y - 15, 10, 15);
      ctx.fillStyle = sand;
      ctx.beginPath();
      ctx.ellipse(t2.x, t2.y - 15, 5, 5 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // мешки руды у входа: сразу читается «руда», а не энергия
    const sackY = P(x0 + 0.14, y1 - 0.08);
    oreSack(ctx, sackY.x, sackY.y, 0.92);
    oreSack(ctx, sackY.x + 9, sackY.y + 2, 0.76);
    if (lvl >= 6) oreSack(ctx, sackY.x + 5, sackY.y + 8, 0.82);

    // 5: золотая окантовка и блеск руды
    if (lvl >= 5) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(D.x, D.y - h1 - 1);
      ctx.lineTo(C.x, C.y - h1 - 1);
      ctx.lineTo(B.x, B.y - h1 - 1);
      ctx.stroke();
      spot(ctx, t.x - 2, topY - 4.4, 1.6, PAL.gold);
      spark(ctx, q.x + 6, q.y + 1, 3);
    }

    /* --- 6-10: склад наращивает стеллажи и погрузку --- */

    // 6: янтарные лампы и окна-щели на корпусе
    if (lvl >= 6) {
      windowRow(ctx, D, C, h1, 0.62, 0.8, 7, 11, 2, 'rgba(255,207,74,.78)');
      spot(ctx, p.x - 14, p.y - 7, 1.4, PAL.amber);
      spot(ctx, C.x - 2, C.y - h1 + 3, 1.3, PAL.amber);
    }

    // 7: стойки-рёбра и светлая кромка крышки
    if (lvl >= 7) {
      ribLines(ctx, D, C, h1, 0.04, 0.94, 2, h1 - 2, 5, 'rgba(92,66,38,.38)', 1.2);
      ctx.strokeStyle = 'rgba(255,229,178,.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(D.x + 1, D.y - h1 - 2);
      ctx.lineTo(C.x - 1, C.y - h1 - 2);
      ctx.lineTo(B.x - 1, B.y - h1 - 2);
      ctx.stroke();
    }

    // 8: ленточный транспортёр и пыль от руды
    if (lvl >= 8) {
      const a = P(x0 + 0.52, y0 + 0.18);
      const e = P(x1 - 0.06, y0 + 0.3);
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h1 - 2);
      ctx.lineTo(e.x, e.y - h1 - 6);
      ctx.stroke();
      ctx.strokeStyle = '#a98a5c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h1 - 3.2);
      ctx.lineTo(e.x, e.y - h1 - 7.2);
      ctx.stroke();
      spot(ctx, a.x + (e.x - a.x) * 0.35, a.y - h1 - 4 + (e.y - a.y) * 0.35, 1.2, PAL.gold);
      spot(ctx, a.x + (e.x - a.x) * 0.7, a.y - h1 - 5 + (e.y - a.y) * 0.7, 1, PAL.gold);
      exhaustStack(ctx, P(x0 + 0.48, y0 + 0.16).x, P(x0 + 0.48, y0 + 0.16).y - h1 - 3,
        8, 2.8, 'rgba(201,160,99,.22)');
    }

    // 9: золотые накладки и вымпел
    if (lvl >= 9) {
      spot(ctx, D.x, D.y - 2, 2, PAL.gold);
      spot(ctx, C.x, C.y - 2, 2, PAL.gold);
      pennant(ctx, C.x - 2, C.y - h1 - 2, 15, PAL.gold, 6);
      spot(ctx, sackY.x - 3, sackY.y - 10, 1.3, PAL.gold);
    }

    // 10: верхний стеллаж — открытый бункер с рудой
    if (lvl >= 10) {
      const tH = 9;
      prism(ctx, x0 + 0.16, y0 + 0.14, x1 - 0.44, y1 - 0.44, h1 + 5, tH,
        sandTop, sand, sandDark);
      const uD = P(x0 + 0.16, y1 - 0.44);
      const uC = P(x1 - 0.44, y1 - 0.44);
      const uM = P(x0 + 0.42, y0 + 0.3);
      ctx.fillStyle = shade(PAL.gold, -0.12);
      ctx.beginPath();
      ctx.ellipse(uM.x, uM.y - h1 - 5 - tH + 1, 7, 7 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.ellipse(uM.x - 1, uM.y - h1 - 5 - tH - 0.6, 5, 5 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      windowRow(ctx, uD, uC, h1 + 5 + tH, 0.18, 0.82, h1 + 6, h1 + 10, 3,
        'rgba(255,207,74,.8)');
      ring(ctx, p.x - 4, p.y - h1 - 5, 9, 9 * GQ, PAL.gold, 1.3);
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

  const TRAP_TYPES = {
    mine: 1, spring: 1, airmine: 1, ambush: 1, beam: 1,
    giantbomb: 1, seekingair: 1, skeletontrap: 1, tornado: 1, gigabomb: 1
  };
  const LURK_TYPES = {
    mine: 1, spring: 1, airmine: 1, ambush: 1,
    giantbomb: 1, seekingair: 1, skeletontrap: 1, tornado: 1, gigabomb: 1
  };

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
      ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner * GQ);
      ctx.lineTo(p.x + Math.cos(a) * outer * (1 + k), p.y + Math.sin(a) * outer * GQ);
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
      trapScorch(ctx, b, 17, 17 * GQ);
      trapCracks(ctx, b, 6, 5, 17);
      groundEllipse(ctx, p.x - 1, p.y + 1, 12, 12 * GQ, 'rgba(58,38,24,.55)');
      groundEllipse(ctx, p.x - 1, p.y, 8.5, 8.5 * GQ, 'rgba(20,13,9,.7)');
      ring(ctx, p.x - 1, p.y + 1, 12.5, 12.5 * GQ, 'rgba(120,78,50,.55)', 1.1);

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

    // низкий корпус: вложенные эллипсы дают круглый диск в новой проекции
    groundEllipse(ctx, p.x, p.y + 2.5, 16, 16 * GQ, 'rgba(34,20,13,.3)');
    groundEllipse(ctx, p.x, p.y + 1, 15.5, 15.5 * GQ, shade(PAL.metalDark, -0.12));
    groundEllipse(ctx, p.x, p.y - 0.8, 15, 15 * GQ, PAL.metalDark);
    groundEllipse(ctx, p.x, p.y - 2.6, 14, 14 * GQ, PAL.metal);
    groundEllipse(ctx, p.x - 0.8, p.y - 3.8, 10.6, 10.6 * GQ, shade(PAL.metal, 0.1));

    // внутренний обод и болты
    ring(ctx, p.x - 0.8, p.y - 3.8, 9.4, 9.4 * GQ, 'rgba(38,44,48,.65)', 1.2);
    const bolts = lvl >= 7 ? 6 : (lvl >= 3 ? 5 : 4);
    for (let i = 0; i < bolts; i++) {
      const a = i * Math.PI * 2 / bolts + 0.4;
      spot(ctx, p.x + Math.cos(a) * 11.2, p.y - 3.4 + Math.sin(a) * 11.2 * GQ,
        lvl >= 9 ? 1.5 : 1.2, lvl >= 9 ? PAL.gold : PAL.metalLight);
    }

    // центральная ступица
    spot(ctx, p.x, p.y - 4.3, 3.4, shade(PAL.metalDark, -0.1));
    spot(ctx, p.x - 0.4, p.y - 4.7, 2.3, PAL.metalLight);
    spot(ctx, p.x - 0.8, p.y - 5.1, 0.9, 'rgba(255,250,235,.55)');

    // 2: кольцевая канавка и второй ряд заклёпок
    if (lvl >= 2) {
      ring(ctx, p.x - 0.8, p.y - 3.9, 12.2, 12.2 * GQ, 'rgba(30,36,40,.5)', 1.1);
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
        const y = p.y - 3.2 + Math.sin(a) * 13.4 * GQ;
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
      ring(ctx, p.x - 0.8, p.y - 3.9, 10.2, 10.2 * GQ, 'rgba(224,176,69,.8)', 1.5);
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
      ring(ctx, p.x - 0.8, p.y - 2.4, 14.4, 14.4 * GQ, 'rgba(30,36,40,.45)', 1.4);
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
      ring(ctx, p.x - 0.8, p.y - 3.9, 13.2, 13.2 * GQ, 'rgba(255,207,74,.55)', 1.3);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.78;
        spot(ctx, p.x + Math.cos(a) * 13.6, p.y - 3 + Math.sin(a) * 13.6 * GQ,
          1.5, PAL.gold);
      }
    }

    // 10: двойной обод и второй индикатор
    if (lvl >= 10) {
      ring(ctx, p.x - 0.8, p.y - 2.2, 15.4, 15.4 * GQ, 'rgba(255,207,74,.7)', 1.6);
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
      trapScorch(ctx, b, 16, 16 * GQ);
      const hole = { x: p.x, y: p.y - 1 };
      groundEllipse(ctx, hole.x, hole.y, 10, 10 * GQ, 'rgba(18,12,9,.7)');
      ring(ctx, hole.x, hole.y, 10.6, 10.6 * GQ, 'rgba(140,150,155,.45)', 1.2);

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
          spot(ctx, hole.x + Math.cos(a) * (12 + i * 2), hole.y + Math.sin(a) * 12 * GQ,
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
      wallPatch(ctx, D, C, plateH, u0, u1, 0.05, 0.82,
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
      ctx.ellipse(p.x, yy, r, r * GQ, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.strokeStyle = PAL.metalLight;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= coils; i++) {
      const yy = baseY - i * stepY - 0.7;
      const r = 7 - i * 0.2;
      ctx.moveTo(p.x + r, yy);
      ctx.ellipse(p.x, yy, r, r * GQ, 0, 0, Math.PI * 2);
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
        ctx.ellipse(sx, yy, 3.6, 3.6 * GQ, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      spot(ctx, sx, sy - 6.6, 1.3, PAL.metalLight);
    }

    // 5: золотая чашка пружины
    if (lvl >= 5) {
      ring(ctx, p.x, topY - 0.8, 7.8, 7.8 * GQ, 'rgba(224,176,69,.8)', 1.4);
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
      ring(ctx, p.x, p.y - plateH - 1, 13, 13 * GQ, 'rgba(255,207,74,.6)', 1.5);
      ctx.strokeStyle = PAL.metalLight;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = baseY - 2 - i * 2.2;
        ctx.moveTo(p.x + 3 + 6.4, yy);
        ctx.ellipse(p.x + 3, yy, 6.4, 6.4 * GQ, 0, 0, Math.PI * 2);
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
      trapScorch(ctx, b, 16, 16 * GQ);
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
    groundEllipse(ctx, c.x, c.groundY, 11, 11 * GQ, 'rgba(70,224,200,.10)');
    ring(ctx, c.x, c.groundY, 10.5, 10.5 * GQ, 'rgba(70,224,200,.22)', 1);
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
        wallPatch(ctx, D, C, lidH, u0, u1, 0.05, 0.78,
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
        ring(ctx, p.x, p.y - lidH - 1, 11, 11 * GQ, 'rgba(255,207,74,.55)', 1.3);
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
    groundEllipse(ctx, p.x, p.y - 1, 9.5, 9.5 * GQ, PAL.metalDark);
    groundEllipse(ctx, p.x, p.y - 2.4, 8.6, 8.6 * GQ, PAL.metal);
    ring(ctx, p.x, p.y - 2.4, 8.6, 8.6 * GQ, 'rgba(30,38,42,.55)', 1.1);
    spot(ctx, p.x, p.y - 4.4, 3.8, PAL.metalDark);
    spot(ctx, p.x - 0.6, p.y - 4.9, 2.6, PAL.metalLight);

    // 5+: золотой обод погона
    if (lvl >= 5) ring(ctx, p.x, p.y - 2.6, 10.6, 10.6 * GQ, 'rgba(255,207,74,.65)', 1.3);

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
      ring(ctx, p.x, p.y - 1.4, 12, 12 * GQ, 'rgba(255,207,74,.75)', 1.5);
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + 0.78;
        spot(ctx, p.x + Math.cos(ang) * 11.2, p.y - 1.6 + Math.sin(ang) * 11.2 * GQ,
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
    let dy = (Math.cos(a) + Math.sin(a)) * GQ;
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
    ring(ctx, p.x, p.y - baseH + 1, 12, 12 * GQ, ACC.copperDark, 1.5);

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
      ctx.strokeStyle = i === 1
        ? 'rgba(196,106,58,.8)'
        : 'rgba(70,224,200,.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, yy, rad, rad * GQ, 0, 0, Math.PI * 2);
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
    ring(ctx, p.x, ly, lr + 4.4, (lr + 4.4) * GQ, PAL.metalLight, 1.8);
    ring(ctx, p.x, ly, lr + 2.8, (lr + 2.8) * GQ, PAL.metalDark, 1.1);

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
      ring(ctx, p.x, ly, lr + 5.4, (lr + 5.4) * GQ, 'rgba(255,207,74,.8)', 1.5);
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
        spot(ctx, p.x + Math.cos(ang) * (lr + 4.8), ly + Math.sin(ang) * (lr + 4.8) * GQ,
          1.3, PAL.gold);
      }
      pennant(ctx, p.x + 8, p.y - H + 1, 14, PAL.gold, 5);
    }

    // 10: вторая линза и внешнее кольцо
    if (lvl >= 10) {
      spot(ctx, p.x, ly - lr - 6, 3.2, PAL.metalDark);
      spot(ctx, p.x, ly - lr - 6, 2.2, PAL.cold);
      spot(ctx, p.x - 0.6, ly - lr - 6.6, 0.9, 'rgba(255,255,255,.85)');
      ring(ctx, p.x, ly, lr + 8.6, (lr + 8.6) * GQ, 'rgba(255,207,74,.5)', 1.2);
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
      ctx.ellipse(p.x, ly, rr, rr * GQ, 0, -0.4, Math.PI + 0.4);
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
        ctx.moveTo(p.x + Math.cos(ang) * 7, ly + Math.sin(ang) * 7 * GQ);
        ctx.lineTo(p.x + Math.cos(ang) * (12 + charge * 2), ly + Math.sin(ang) * (12 + charge * 2) * GQ);
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
    goldmine: 22, elixir: 18, storage: 20, estorage: 56, wall: 18,
    lab: 32, herohall: 40,
    mine: 10, spring: 18, airmine: 34, ambush: 16, beam: 62,
    sweeper: 40, bombtower: 42, xbow: 38, eagle: 54, scattershot: 48,
    monolith: 64, spelltower: 52, multiarcher: 52, ricochet: 40,
    multigear: 46, firespitter: 42,
    revenge: 52, superwizard: 62, spiky: 44, firecracker: 50,
    darkdrill: 30, darkstorage: 42,
    train: 34, darktrain: 34, spellfactory: 42, darkspellfactory: 42,
    pethouse: 36, blacksmith: 40, workshop: 40, clancastle: 50,
    squadbarracks: 34,
    giantbomb: 18, seekingair: 16, skeletontrap: 14, tornado: 20, gigabomb: 22
  };

  function bodyHeight(b) {
    const h = BODY_H[b.type] || 26;
    if (b.type === 'townhall' && levelOf(b) >= 4) return h + 12;
    if (b.type === 'ambush') return ambushOpen(b) ? 28 : 14;
    if (b.type === 'beam') return beamH(levelOf(b)) + 12;
    return h * artScale(b);
  }

  /* ---------- спрайты статичных построек ----------
     Постройки не анимируются, поэтому рисуем их один раз в маленький canvas
     и дальше только блитим. На сильном зуме (тайл > 96 px) возвращаемся
     к вектору, чтобы линии оставались резкими. */
  const spriteCache = new Map();
  const spriteBakes = { count: 0, hits: 0 };
  // 46 типов × 21 уровень не должны копить канвы бесконечно: держим
  // последние использованные и вытесняем самые старые (LRU по Map).
  const SPRITE_CAP = 150;

  function spriteFor(b, lvl) {
    const detail = lod;
    const variant = trapVariant(b);
    const key = b.type + '|' + lvl + '|' + detail + '|' + b.w + 'x' + b.h +
      (variant ? '|' + variant : '');
    if (spriteCache.has(key)) {
      spriteBakes.hits++;
      const hit = spriteCache.get(key);
      spriteCache.delete(key);
      spriteCache.set(key, hit);
      return hit;
    }

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
    spriteBakes.count++;
    if (spriteCache.size > SPRITE_CAP) {
      const first = spriteCache.keys().next().value;
      if (first !== undefined) spriteCache.delete(first);
    }
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
    // у новых крупных зданий купол/ярус выше корпуса: леса не должны
    // обрываться на середине крыши
    if (b.type === 'lab') {
      return Math.max(bodyHeight(b) + 8, 34 + levelOf(b) * 1.5);
    }
    if (b.type === 'herohall') {
      return Math.max(bodyHeight(b) + 8, 40 + levelOf(b) * 1.6);
    }
    // новые высокие башни: леса должны доходить до короны, а не до корпуса
    if (b.type === 'revenge' || b.type === 'superwizard' ||
        b.type === 'spiky' || b.type === 'firecracker') {
      return Math.max(bodyHeight(b) + 8, crown(b, levelOf(b)) + 4);
    }
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
    groundEllipse(ctx, sand.x + 2, sand.y + 2, 10, 4 * GK, 'rgba(58,30,16,.26)');
    groundEllipse(ctx, sand.x, sand.y, 9.5, 4.2 * GK, PAL.regolithLight);
    groundEllipse(ctx, sand.x - 2, sand.y - 1.2, 4.6, 1.9 * GK, shade(PAL.regolithLight, 0.28));

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
    // Строек одновременно мало: держим короткую историю, чтобы канвы
    // не копились за долгую игру с десятками апгрейдов.
    if (siteCache.size > 24) {
      const first = siteCache.keys().next().value;
      if (first !== undefined) siteCache.delete(first);
    }
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

  /* ---------- верхние ступени 11-21 ----------
     У каждого нового типа свои ярусы, но старые турели и склады после
     10 уровня тоже должны меняться. Общий слой добавляет тёплый плинт,
     угловые эмиттеры и маяк: это 3-4 stroke/spot на постройку и только
     для видимых зданий выше 10 уровня. */
  function highTier(ctx, b, lvl) {
    if (lvl < 11 || !mid() || b.type === 'wall' || isTrapType(b.type)) return;
    // у новых типов свои ярусы в painter'е; общий слой им не нужен и
    // масштабировать его под 1×1/2×2 было бы дороже, чем пользы
    if (artNominal(b.type)) return;
    // 3D-кадр уже содержит все уровневые детали: векторные «этажи» поверх
    // него висят в воздухе и спорят с моделью.
    if (BUILDING3D_ART[b.type]) return;
    const t = (Math.min(lvl, MAX_LVL) - 11) / 10;
    const A = P(b.x + 0.12, b.y + 0.12);
    const B = P(b.x + b.w - 0.12, b.y + 0.12);
    const C = P(b.x + b.w - 0.12, b.y + b.h - 0.12);
    const D = P(b.x + 0.12, b.y + b.h - 0.12);
    const H = Math.min(60, bodyHeight(b) * 0.55);

    ctx.strokeStyle = 'rgba(255,207,74,' + (0.16 + t * 0.12).toFixed(3) + ')';
    ctx.lineWidth = 1.1;
    diamond(ctx, A, B, C, D);
    ctx.stroke();

    // два передних эмиттера: видно, что здание поднялось выше десятки
    const e0 = P(b.x + 0.2, b.y + b.h - 0.18);
    const e1 = P(b.x + b.w - 0.2, b.y + b.h - 0.18);
    spot(ctx, e0.x, e0.y - 2.4, 1.1, lvl >= 17 ? PAL.gold : PAL.cold);
    spot(ctx, e1.x, e1.y - 2.4, 1.1, lvl >= 17 ? PAL.gold : PAL.cold);

    if (lvl >= 14) {
      ctx.strokeStyle = 'rgba(196,255,250,.22)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y - H);
      ctx.lineTo(B.x, B.y - H);
      ctx.lineTo(C.x, C.y - H);
      ctx.lineTo(D.x, D.y - H);
      ctx.closePath();
      ctx.stroke();
    }

    if (lvl >= 17) {
      const m = P(b.x + 0.18, b.y + 0.18);
      antennaMast(ctx, m.x, m.y - H, 8 + t * 8,
        lvl >= 20 ? PAL.gold : PAL.metalLight,
        lvl >= 20 ? 'rgba(255,252,232,.95)' : PAL.cyan);
    }

    if (lvl >= 20) {
      const c = P(b.x + b.w / 2, b.y + b.h / 2);
      const a = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.6 + (b.x + b.y) * 0.5));
      ring(ctx, c.x, c.y - H - 2, 5.5, 5.5 * GQ, 'rgba(255,232,170,' + a.toFixed(3) + ')', 1.1);
      spot(ctx, c.x, c.y - H - 2, 1.5, 'rgba(255,244,205,.85)');
    }
  }

  /* ---------- 3D-модели зданий ----------
     Пилот: добыча и склады, все уровни. Мир рисуется в «мировых» пикселях
     (TW=54), поэтому кадр кладётся фиксированного размера: ширина =
     TW / доля футпринта в кадре. Берём render-256: в сцене это ~97 px,
     с запасом на зум. Пока PNG не пришёл — прежний векторный арт. */
  const BUILDING3D_ART = {
    goldmine: { max: 18, foot: 1 },
    storage: { max: 20, foot: 1 },
    elixir: { max: 18, foot: 1 },
    darkdrill: { max: 12, foot: 1 },
    estorage: { max: 20, foot: 1 },
    darkstorage: { max: 14, foot: 1 },
    townhall: { max: 19, foot: 2 },
    cannon: { max: 21, foot: 1 },
    archer: { max: 21, foot: 1 },
    barracks: { max: 14, foot: 2 },
    lab: { max: 17, foot: 2 },
    herohall: { max: 13, foot: 2 },
    mine: { max: 14, foot: 1 },
    mortar: { max: 18, foot: 1 },
    airdef: { max: 17, foot: 1 },
    mage: { max: 17, foot: 1 },
    spring: { max: 14, foot: 1 },
    sweeper: { max: 7, foot: 1 },
    ambush: { max: 18, foot: 1 },
    bombtower: { max: 13, foot: 1 },
    xbow: { max: 14, foot: 1 },
    beam: { max: 12, foot: 1 },
    firespitter: { max: 3, foot: 1 },
    spelltower: { max: 4, foot: 1 },
    multiarcher: { max: 5, foot: 1 },
    ricochet: { max: 5, foot: 1 },
    multigear: { max: 4, foot: 1 },
    eagle: { max: 7, foot: 2 },
    scattershot: { max: 7, foot: 2 },
    monolith: { max: 5, foot: 2 }
  };
  // Стена — связная конструкция из пролётов и столбов: её рисует
  // drawWallRun. Одиночный 3D-сегмент ломал бы стыки и повороты.
  const BUILDING3D_ORTHO = { 1: 2.55, 2: 4.0 };   // как в пайплайне
  const BUILDING3D_ROOT = 1.414;                   // диагональ клетки
  const BUILDING3D_AX = 0.5;              // якорь X: центр футпринта
  // Якорь земли: камера смотрит в (0,0,target_z), поэтому плоскость z=0
  // проецируется ниже центра кадра. У 1×1 и 2×2 отношение target_z/ortho
  // почти одинаковое, поэтому доля общая — 0.664.
  const BUILDING3D_AY = 0.664;

  const building3d = { images: {}, tops: {}, failed: {} };

  // Верх прозрачности в долях кадра: нужен, чтобы HP-бар и значки висели
  // над 3D-моделью, а не над старым вектором. При file:// canvas может быть
  // «испорчен», тогда просто остаётся векторная высота.
  function building3dMeasureTop(img) {
    try {
      const w = img.naturalWidth || 256;
      const h = img.naturalHeight || 256;
      const c = makeCanvas(w, h);
      const cx = c.getContext('2d');
      if (!cx || typeof cx.getImageData !== 'function') return -1;
      cx.drawImage(img, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
          if (data[row + x * 4 + 3] > 8) return y / h;
        }
      }
    } catch (e) { /* нет доступа к пикселям — не страшно */ }
    return -1;
  }

  function building3dLevel(type, lvl) {
    const cfg = BUILDING3D_ART[type];
    const max = cfg ? cfg.max : 0;
    if (!max) return 0;
    let n = Math.floor(Number(lvl) || 1);
    if (!isFinite(n)) n = 1;
    return Math.max(1, Math.min(max, n));
  }

  function building3dPad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // Картинка уровня; первый вызов запускает загрузку и возвращает null.
  function building3dImage(type, lvl) {
    const level = building3dLevel(type, lvl);
    if (!level) return null;
    const key = type + '|' + level;
    const known = building3d.images[key];
    if (known) {
      return (known.complete && known.naturalWidth > 0) ? known : null;
    }
    if (building3d.failed[key]) return null;
    if (typeof document === 'undefined' || typeof Image !== 'function') return null;
    let img;
    try {
      img = new Image();
    } catch (e) {
      building3d.failed[key] = true;
      return null;
    }
    img.onload = function () {
      if (img.naturalWidth > 0) {
        building3d.images[key] = img;
        building3d.tops[key] = building3dMeasureTop(img);
      } else {
        building3d.failed[key] = true;
      }
    };
    img.onerror = function () {
      building3d.failed[key] = true;
      try { delete building3d.images[key]; } catch (e) {}
    };
    building3d.images[key] = img;
    try {
      img.src = 'assets/buildings3d/' + type + '/L' +
        building3dPad(level) + '/render-256.png';
    } catch (e) {
      building3d.failed[key] = true;
      return null;
    }
    return null;
  }

  // Нарисовать 3D-кадр по центру футпринта. Для 2×2 пайплайн снимал
  // шире (ortho 4.0), поэтому кадр масштабируется под две клетки.
  function drawBuilding3d(ctx, b, lvl) {
    const cfg = BUILDING3D_ART[b.type];
    if (!cfg) return false;
    const w = b.w || 1;
    const h = b.h || 1;
    if (w !== cfg.foot || h !== cfg.foot) return false;
    const img = building3dImage(b.type, lvl);
    if (!img) return false;

    const dx = (b.x - b.y) * TW / 2;
    const dy = (b.x + b.y) * TH / 2;
    const cx = dx + (w - h) * TW / 4;
    const cy = dy + (w + h) * TH / 4;

    const S = TW * (BUILDING3D_ORTHO[cfg.foot] || BUILDING3D_ORTHO[1]) / BUILDING3D_ROOT;
    try {
      ctx.drawImage(img, cx - S * BUILDING3D_AX, cy - S * BUILDING3D_AY, S, S);
    } catch (e) {
      return false;
    }
    return true;
  }

  // Высота видимой верхушки 3D-модели над землёй в мировых px.
  // 0 — картинки ещё нет, пусть работает векторная crown().
  function building3dCrown(type, lvl) {
    const cfg = BUILDING3D_ART[type];
    const level = building3dLevel(type, lvl);
    if (!cfg || !level) return 0;
    const key = type + '|' + level;
    const img = building3d.images[key];
    if (!img || !img.complete || img.naturalWidth <= 0) return 0;
    const top = building3d.tops[key];
    if (!(top >= 0)) return 0;
    const S = TW * (BUILDING3D_ORTHO[cfg.foot] || BUILDING3D_ORTHO[1]) / BUILDING3D_ROOT;
    const h = (BUILDING3D_AY - top) * S;
    return h > 0 ? h : 0;
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
    // Подключённые типы рисуем 3D-кадром, пока PNG не пришёл — вектор.
    // Ловушки в сработавшем состоянии остаются на 2.5D-арте: 3D снят
    // только для взведённых.
    const cfg3d = BUILDING3D_ART[type];
    const variant = trapVariant(b);
    const trapOk = type === 'ambush'
      ? variant !== 'open'
      : ((type !== 'mine' && type !== 'spring') || variant !== 'spent');
    const use3d = !!cfg3d && !site && trapOk &&
      (b.w || 1) === cfg3d.foot && (b.h || 1) === cfg3d.foot;
    const sp = !use3d && spritesOn && type !== 'cannon' && tilePx <= 96
      ? spriteFor(b, lvl) : null;

    function body() {
      if (sp) drawSprite(ctx, sp, b);
      else if (use3d && drawBuilding3d(ctx, b, lvl)) { /* 3D-кадр */ }
      else drawBuildingBody(ctx, b);
    }

    // Динамика поверх запечённого корпуса: мигание, дым, ствол, свечение.
    function deco() {
      if (type === 'mage') { drawMageHalo(ctx, b, lvl); return; }
      if (type === 'estorage') { drawEstorageGlow(ctx, b, lvl); return; }
      if (type === 'mine') { drawMineFx(ctx, b, lvl); return; }
      if (type === 'spring') { drawSpringFx(ctx, b); return; }
      if (type === 'airmine') { drawAirMineFx(ctx, b, lvl); return; }
      if (type === 'ambush') { drawAmbushGun(ctx, b, lvl); return; }
      if (type === 'beam') {
        drawBeamGlow(ctx, b, lvl);
        drawBeamZap(ctx, b, lvl);
        return;
      }
      if (type === 'sweeper') {
        drawScaledArt(ctx, b, function (c, v) { drawSweeperGlow(c, v, lvl); });
        return;
      }
      if (type === 'spelltower') {
        drawScaledArt(ctx, b, function (c, v) { drawSpellGlow(c, v, lvl); });
        return;
      }
      if (type === 'monolith') {
        drawScaledArt(ctx, b, function (c, v) { drawMonolithGlow(c, v, lvl); });
        return;
      }
      if (type === 'spellfactory') {
        drawScaledArt(ctx, b, function (c, v) { drawFactoryGlow(c, v, lvl, false); });
        return;
      }
      if (type === 'darkspellfactory') {
        drawScaledArt(ctx, b, function (c, v) { drawFactoryGlow(c, v, lvl, true); });
        return;
      }
      if (type === 'firespitter') {
        drawScaledArt(ctx, b, function (c, v) { drawFireGlow(c, v, lvl); });
        return;
      }
      if (type === 'revenge') {
        drawScaledArt(ctx, b, function (c, v) { drawRevengeGlow(c, v, lvl); });
        return;
      }
      if (type === 'superwizard') {
        drawScaledArt(ctx, b, function (c, v) { drawSuperwizardGlow(c, v, lvl); });
        return;
      }
      if (type === 'spiky') {
        drawScaledArt(ctx, b, function (c, v) { drawSpikyFx(c, v, lvl); });
        return;
      }
      if (type === 'firecracker') {
        drawScaledArt(ctx, b, function (c, v) { drawFirecrackerGlow(c, v, lvl); });
        return;
      }
      if (type === 'townhall') { drawTHGlow(ctx, b, lvl); return; }
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
    highTier(ctx, b, lvl);
  }

  /* ======================================================================
     НОВЫЕ ПОСТРОЙКИ (P4)
     Рисуем векторно в том же ракурсе, что старые: газон, мягкая тень,
     призма-цоколь, корпус, тёплый контровой свет, бирюзовые/золотые
     акценты. Футпринт берём из b.w/b.h, поэтому 2×2, 3×3, 4×4 и 5×5
     читаются одинаково. Всё статичное уходит в spriteFor(), динамика —
     отдельными deco-функциями.
     ====================================================================== */

  function bLevel(lvl) {
    return Math.max(1, Math.min(MAX_LVL, Math.round(lvl || 1)));
  }

  // 0..1 по всей лестнице 1..21: удобно для роста деталей
  function bRamp(lvl) {
    return (bLevel(lvl) - 1) / (MAX_LVL - 1);
  }

  /* ---------- масштаб арта от футпринта ----------
     Новые постройки рисовались в расчёте на старые 3×3/4×4. После
     уменьшения пятен их нельзя просто оставить как есть: подставка,
     стволы и кольца вылезали за клетку. Каждый такой painter получает
     виртуальное пятно ART_NOMINAL (его «родной» размер), а обёртка
     масштабирует весь рисунок в b.w/b.h. Старые типы не в таблице —
     для них коэффициент 1. */
  const ART_NOMINAL = {
    sweeper: 2, bombtower: 2, xbow: 2, spelltower: 2, multiarcher: 2,
    ricochet: 2, multigear: 2, firespitter: 2,
    revenge: 1.5, superwizard: 1.5, spiky: 1.5, firecracker: 1.5,
    eagle: 4, scattershot: 4, monolith: 4,
    darkdrill: 2, darkstorage: 2,
    train: 3, darktrain: 3, spellfactory: 3, darkspellfactory: 3,
    pethouse: 3, blacksmith: 3, workshop: 3, squadbarracks: 3,
    clancastle: 4,
    giantbomb: 2, tornado: 2, gigabomb: 2,
    seekingair: 1, skeletontrap: 1
  };

  function artNominal(type) {
    return ART_NOMINAL[type] || 0;
  }

  // Во сколько раз арт надо сжать/растянуть под фактическое пятно.
  function artScale(b) {
    const n = artNominal(b && b.type);
    if (!n) return 1;
    const w = Math.max(1, b.w || 1);
    const h = Math.max(1, b.h || 1);
    const k = Math.min(w, h) / n;
    return isFinite(k) && k > 0 ? k : 1;
  }

  // Нарисовать painter в его родной системе координат и вписать в b.
  // Центр виртуального пятна совмещается с центром фактического.
  function drawScaledArt(ctx, b, fn) {
    const n = artNominal(b && b.type);
    const k = artScale(b);
    if (!n || Math.abs(k - 1) < 0.001) {
      fn(ctx, b);
      return;
    }
    const c = P(b.x + b.w / 2, b.y + b.h / 2);
    const cv = P(n / 2, n / 2);
    const vb = {};
    for (const key in b) vb[key] = b[key];
    vb.x = 0; vb.y = 0; vb.w = n; vb.h = n;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(k, k);
    ctx.translate(-cv.x, -cv.y);
    fn(ctx, vb);
    ctx.restore();
  }

  function bPrep(ctx, b, k) {
    grassPad(ctx, b.x, b.y, b.x + b.w, b.y + b.h);
    castShadow(ctx, b.x, b.y, b.x + b.w, b.y + b.h, k == null ? 1.1 : k);
  }

  function bPlinth(ctx, b, inset, h, base) {
    const c = base || PAL.stone;
    prism(ctx, b.x + inset, b.y + inset, b.x + b.w - inset, b.y + b.h - inset,
      0, h, mix(c, '#ffe1b4', 0.1), mix(c, '#ffd2a0', 0.04), shade(c, -0.26));
  }

  // тонкая световая кромка по передним граням цоколя
  function bKick(ctx, b, inset, y, color) {
    const D = P(b.x + inset, b.y + b.h - inset);
    const C = P(b.x + b.w - inset, b.y + b.h - inset);
    const B = P(b.x + b.w - inset, b.y + inset);
    ctx.strokeStyle = color || 'rgba(255,207,74,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(D.x, D.y - y);
    ctx.lineTo(C.x, C.y - y);
    ctx.lineTo(B.x, B.y - y);
    ctx.stroke();
  }

  // компактный корпус: цоколь + основной объём + светлая панель
  function bHull(ctx, b, inset, baseH, hullH, base, wall, top) {
    bPlinth(ctx, b, inset, baseH, base || PAL.stoneLight);
    box(ctx, b.x + inset + 0.06, b.y + inset + 0.06,
      b.x + b.w - inset - 0.06, b.y + b.h - inset - 0.06, hullH, wall);
    const D = P(b.x + inset + 0.1, b.y + b.h - inset - 0.1);
    const C = P(b.x + b.w - inset - 0.1, b.y + b.h - inset - 0.1);
    patchPx(ctx, D, C, hullH, 0.14, 0.86, baseH + hullH * 0.42,
      baseH + hullH * 0.62, top || 'rgba(127,233,255,.5)');
  }

  // вертикальные рёбра на обеих передних гранях: «промышленный» вид
  function bRibs(ctx, b, inset, baseH, hullH, n, color) {
    const D = P(b.x + inset, b.y + b.h - inset);
    const C = P(b.x + b.w - inset, b.y + b.h - inset);
    const B = P(b.x + b.w - inset, b.y + inset);
    ribLines(ctx, D, C, hullH, 0.08, 0.92, baseH + 2, baseH + hullH - 4, n,
      color || 'rgba(48,58,64,.35)', 1);
    ribLines(ctx, C, B, hullH, 0.12, 0.7, baseH + 2, baseH + hullH - 4,
      Math.max(1, n - 1), color || 'rgba(48,58,64,.28)', 1);
  }

  function bWindowBand(ctx, b, inset, baseH, hullH, n) {
    const D = P(b.x + inset, b.y + b.h - inset);
    const C = P(b.x + b.w - inset, b.y + b.h - inset);
    // H — полная высота стены от грунта (цоколь + корпус), поэтому окна
    // не уезжают выше крыши у низких корпусов.
    const H = baseH + hullH;
    windowRow(ctx, D, C, H, 0.16, 0.84,
      baseH + hullH * 0.28, baseH + hullH * 0.44, n, PAL.glass);
  }

  // =============================== ОБОРОНА ===============================

  /* --- вихревой генератор: турбина на короткой мачте --- */
  function drawSweeper(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const x0 = b.x + 0.18;
    const y0 = b.y + 0.18;
    const x1 = b.x + b.w - 0.18;
    const y1 = b.y + b.h - 0.18;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 5 + ramp * 3;
    const hubH = 20 + ramp * 14;
    const hy = p.y - baseH - hubH;

    bPrep(ctx, b);
    prism(ctx, x0, y0, x1, y1, 0, baseH,
      mix('#5c7f86', '#ffe1b4', 0.08), '#526f76', '#354e55');
    bKick(ctx, b, 0.18, 1.2, 'rgba(127,233,255,.3)');

    // три опоры к ступице: силуэт «ветряка», а не столба
    const legs = [
      P(x0 + 0.08, y1 - 0.08),
      P(x1 - 0.08, y1 - 0.08),
      P(cx, y0 + 0.06)
    ];
    ctx.strokeStyle = '#3d5a61';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < legs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(legs[i].x, legs[i].y - baseH);
      ctx.lineTo(p.x + (legs[i].x - p.x) * 0.22, hy + 4);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190,214,218,.45)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < legs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(legs[i].x, legs[i].y - baseH - 0.8);
      ctx.lineTo(p.x + (legs[i].x - p.x) * 0.22, hy + 3.2);
      ctx.stroke();
    }

    // гондола: короткий цилиндр под ступицей
    const gw = 10 + ramp * 4;
    ctx.fillStyle = '#3a555c';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(p.x - gw, hy + 2, gw * 2, 15, 3)
      : ctx.rect(p.x - gw, hy + 2, gw * 2, 15);
    ctx.fill();
    ctx.fillStyle = '#7fb6be';
    ctx.fillRect(p.x - gw * 0.7, hy + 5, gw * 1.4, 2.2);
    spot(ctx, p.x, hy + 14.2, 1.4, PAL.glass);

    // лопасти: 3 на L1, 4 с L7, 5 с L14; шаг кадра статичный
    const blades = L >= 14 ? 5 : (L >= 7 ? 4 : 3);
    const spin = L * 0.55 + 0.3;
    const br = 11 + ramp * 8;
    for (let i = 0; i < blades; i++) {
      const a = spin + i * Math.PI * 2 / blades;
      const ex = p.x + Math.cos(a) * br;
      const ey = hy + Math.sin(a) * br * 0.9;
      const wx = p.x + Math.cos(a + 0.5) * br * 0.42;
      const wy = hy + Math.sin(a + 0.5) * br * 0.42 * 0.9;
      poly(ctx, [
        { x: p.x + Math.cos(a) * 3, y: hy + Math.sin(a) * 3 * 0.9 },
        { x: ex, y: ey },
        { x: wx, y: wy }
      ], i % 2 ? 'rgba(174,222,226,.88)' : 'rgba(206,244,246,.94)');
      uBar(ctx, p.x + Math.cos(a) * 3, hy + Math.sin(a) * 3 * 0.9,
        ex, ey, 0.7, 'rgba(255,255,255,.35)');
    }

    // кожух и ступица
    ring(ctx, p.x, hy, br + 1.5, (br + 1.5) * 0.9,
      L >= 10 ? 'rgba(255,207,74,.5)' : 'rgba(127,233,255,.34)', 1);
    spot(ctx, p.x, hy, 3.2 + ramp * 0.8, '#2f464d');
    spot(ctx, p.x, hy, 2.1 + ramp * 0.6, L >= 10 ? PAL.gold : PAL.cyan);
    spot(ctx, p.x - 0.7, hy - 0.7, 0.8, 'rgba(255,255,255,.9)');

    // верхние ступени: второй кожух, выхлоп, золотая оправа
    if (L >= 10) {
      ring(ctx, p.x, hy, br * 0.62, br * 0.62 * 0.9, 'rgba(70,224,200,.32)', 0.9);
      bWindowBand(ctx, b, 0.32, baseH, 8, 2);
    }
    if (L >= 13) {
      exhaustStack(ctx, p.x + gw + 3, p.y - baseH + 1, 9 + ramp * 4, 3.4,
        'rgba(196,255,250,.22)');
    }
    if (L >= 16) {
      ring(ctx, p.x, hy - 2, br + 4, (br + 4) * 0.9,
        'rgba(255,207,74,.55)', 1.2);
      spire(ctx, p.x, hy - br * 0.72, 5, PAL.gold);
    }
    if (L >= 19) {
      spot(ctx, p.x, hy, 1.3, 'rgba(255,252,232,.95)');
      ring(ctx, p.x, p.y - baseH - 1, 8, 8 * GQ, 'rgba(255,207,74,.35)', 1);
    }
  }

  /* --- рельсотрон: длинные рельсы на поворотном погоне --- */
  function drawRailgun(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const podH = 18 + ramp * 9;
    const a = aimVec(b);
    const topY = p.y - baseH - podH;

    bPrep(ctx, b, 1.15);
    bPlinth(ctx, b, 0.12, baseH, '#6a747c');
    bKick(ctx, b, 0.12, 1.4, 'rgba(127,233,255,.34)');

    // силовой блок сзади: катушки и охлаждение
    const bx = p.x - a.x * 13;
    const by = p.y - a.y * 15 - baseH;
    ctx.fillStyle = '#3f474e';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx - 8, by - 14, 16, 15, 2)
      : ctx.rect(bx - 8, by - 14, 16, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,233,255,.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(bx - 6 + i * 5, by - 12);
      ctx.lineTo(bx - 6 + i * 5, by);
    }
    ctx.stroke();

    // поворотный погон и броневой корпус
    ring(ctx, p.x, p.y - baseH, 18 + ramp * 3, (18 + ramp * 3) * GQ,
      'rgba(38,48,54,.6)', 1.4);
    prism(ctx, cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5, baseH, podH,
      mix('#9aa7ad', '#ffe1b4', 0.08), '#8b979e', '#59656c');
    // верхняя надстройка и цапфы
    prism(ctx, cx - 0.34, cy - 0.34, cx + 0.34, cy + 0.34,
      baseH + podH - 1, 6, '#b8c2cc', '#9aa7ad', '#5f6b72');
    const rx = p.x + a.x * 8;
    const ry = topY - 4 + a.y * 8;

    // рельсы: два длинных луча с зазором и светящейся сердцевиной
    const len = 20 + ramp * 9;
    const nx = -a.y;
    const ny = a.x;
    const rw = 1.9 + ramp * 0.8;
    const gap = 2.4 + ramp * 0.6;
    uBar(ctx, rx - nx * gap, ry - ny * gap,
      rx + a.x * len - nx * gap, ry + a.y * len - ny * gap, rw, '#4c565c');
    uBar(ctx, rx + nx * gap, ry + ny * gap,
      rx + a.x * len + nx * gap, ry + a.y * len + ny * gap, rw, '#39424a');
    uBar(ctx, rx - nx * gap, ry - ny * gap,
      rx + a.x * len - nx * gap, ry + a.y * len - ny * gap, 0.7,
      'rgba(154,167,173,.6)');

    // кольца ускорителя вдоль рельсов
    const coils = L >= 13 ? 4 : (L >= 7 ? 3 : 2);
    ctx.strokeStyle = L >= 16 ? 'rgba(255,207,74,.72)' : 'rgba(127,233,255,.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= coils; i++) {
      const k = i / (coils + 1) * 0.86 + 0.06;
      const qx = rx + a.x * len * k;
      const qy = ry + a.y * len * k;
      ctx.beginPath();
      ctx.moveTo(qx - nx * (gap + 2.2), qy - ny * (gap + 2.2));
      ctx.lineTo(qx + nx * (gap + 2.2), qy + ny * (gap + 2.2));
      ctx.stroke();
    }

    // дульный срез и заряд
    const mx = rx + a.x * len;
    const my = ry + a.y * len;
    spot(ctx, mx, my, 2.2, '#2f383e');
    spot(ctx, mx, my, 1.2 + ramp * 0.5, L >= 16 ? PAL.gold : PAL.glass);
    if (L >= 10) {
      uBar(ctx, rx - nx * gap, ry - ny * gap,
        rx + a.x * len - nx * gap, ry + a.y * len - ny * gap, 1.4, '#6e7a82');
      bRibs(ctx, b, 0.26, baseH, 6, 4);
    }
    if (L >= 14) {
      // вторые рельсы-усилители сверху
      uBar(ctx, rx + a.x * 3, ry + a.y * 3 - 2.4,
        rx + a.x * len * 0.86, ry + a.y * len * 0.86 - 2.4, 1, PAL.copperLight);
    }
    if (L >= 18) {
      ring(ctx, mx, my, 3.6, 3.6 * GQ, 'rgba(255,207,74,.7)', 1);
      spot(ctx, p.x, p.y - baseH - podH - 3, 1.2, PAL.gold);
    }
  }

  /* --- детонатор: низкая башня с бомбовой мортирой --- */
  function drawBombTower(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 2;
    const bodyH = 20 + ramp * 10;
    const a = aimVec(b);

    bPrep(ctx, b);
    bPlinth(ctx, b, 0.14, baseH, '#6c6358');
    bKick(ctx, b, 0.14, 1.3, 'rgba(255,138,74,.38)');

    // цилиндрический корпус: призма + круглая крышка
    box(ctx, b.x + 0.34, b.y + 0.34, b.x + b.w - 0.34, b.y + b.h - 0.34,
      baseH + bodyH, '#6b5c4c');
    ctx.fillStyle = '#7d6b55';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH - bodyH, 14 + ramp * 3,
      (14 + ramp * 3) * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,.16)';
    ctx.beginPath();
    ctx.ellipse(p.x - 3, p.y - baseH - bodyH - 1.5, 6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // предупреждающие полосы
    ctx.fillStyle = 'rgba(255,138,74,.55)';
    ctx.fillRect(p.x - 12, p.y - baseH - bodyH * 0.52, 24, 2.2);
    ctx.fillStyle = 'rgba(40,32,26,.5)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(p.x - 11 + i * 6, p.y - baseH - bodyH * 0.52, 2.4, 2.2);
    }

    // бомбовая мортира: короткий толстый ствол вверх по направлению
    const mx = p.x + a.x * 5;
    const my = p.y - baseH - bodyH - 2 + a.y * 3;
    uBar(ctx, mx, my, mx + a.x * (10 + ramp * 5), my + a.y * (8 + ramp * 4),
      5.4 + ramp, '#4b423a');
    uBar(ctx, mx - 1, my - 1, mx + a.x * (9 + ramp * 4), my + a.y * (7 + ramp * 3),
      2, '#8a7660');
    spot(ctx, mx + a.x * (10 + ramp * 5), my + a.y * (8 + ramp * 4),
      3.2, '#2c2620');

    // бомбы на подставке у борта
    const bomb = function (bx, by, r) {
      spot(ctx, bx, by, r, '#3a332c');
      spot(ctx, bx - r * 0.3, by - r * 0.35, r * 0.45, 'rgba(255,230,190,.3)');
      uBar(ctx, bx + r * 0.4, by - r * 0.9, bx + r * 0.8, by - r * 1.5, 0.6, '#8a7660');
      spot(ctx, bx + r * 0.85, by - r * 1.6, 0.6, PAL.amber);
    };
    bomb(p.x - 13, p.y - baseH - 2, 3.2);
    bomb(p.x + 12, p.y - baseH - 1, 2.8);
    if (L >= 9) bomb(p.x - 9, p.y - baseH - 8, 2.4);

    if (L >= 6) {
      // кожух ствола и клёпки
      ctx.strokeStyle = 'rgba(255,207,74,.36)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - baseH - bodyH, 14 + ramp * 3,
        (14 + ramp * 3) * GQ, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (L >= 10) {
      // вторая мортира и вентиляция
      uBar(ctx, p.x - 8, p.y - baseH - bodyH - 4,
        p.x - 12, p.y - baseH - bodyH - 13, 3, '#4b423a');
      exhaustStack(ctx, p.x + 12, p.y - baseH - 3, 8, 3, 'rgba(255,160,90,.3)');
    }
    if (L >= 13) {
      bWindowBand(ctx, b, 0.4, baseH, bodyH, 2);
      spot(ctx, p.x, p.y - baseH - bodyH - 1, 1.3, PAL.amber);
    }
    if (L >= 16) {
      ring(ctx, p.x, p.y - baseH - bodyH + 1, 15, 15 * GQ,
        'rgba(255,207,74,.5)', 1.1);
      spot(ctx, p.x + 5, p.y - baseH - bodyH - 1.4, 1.1, PAL.gold);
    }
    if (L >= 19) {
      spire(ctx, p.x - 14, p.y - baseH - 3, 8, PAL.amber);
    }
  }

  /* --- артиллерия «Молот»: три тяжёлых ствола на платформе 4×4 --- */
  function drawEagle(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 7 + ramp * 3;
    const bodyH = 16 + ramp * 9;
    const a = aimVec(b);
    const barrels = L >= 10 ? 3 : (L >= 5 ? 2 : 1);

    bPrep(ctx, b, 1.2);
    bPlinth(ctx, b, 0.12, baseH, '#7b6a56');
    bKick(ctx, b, 0.12, 1.5, 'rgba(255,207,74,.4)');

    // широкий лафет
    box(ctx, b.x + 0.3, b.y + 0.42, b.x + b.w - 0.3, b.y + b.h - 0.32,
      baseH + bodyH, '#6d5a45');
    ctx.fillStyle = '#8a7358';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH - bodyH, 24 + ramp * 4,
      (14 + ramp * 2) * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,236,200,.12)';
    ctx.beginPath();
    ctx.ellipse(p.x - 6, p.y - baseH - bodyH - 1.5, 10, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // бронещит спереди
    const D = P(b.x + 0.3, b.y + b.h - 0.32);
    const C = P(b.x + b.w - 0.3, b.y + b.h - 0.32);
    poly(ctx, [
      { x: D.x, y: D.y - baseH },
      { x: C.x, y: C.y - baseH },
      { x: C.x, y: C.y - baseH - bodyH * 0.88 },
      { x: D.x, y: D.y - baseH - bodyH * 0.94 }
    ], '#5b4a39');
    ctx.strokeStyle = 'rgba(255,207,74,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(D.x, D.y - baseH - bodyH * 0.94);
    ctx.lineTo(C.x, C.y - baseH - bodyH * 0.88);
    ctx.stroke();

    // стволы: веером по направлению, с дульными тормозами
    for (let i = 0; i < barrels; i++) {
      const off = (i - (barrels - 1) / 2) * 7;
      const ox = p.x - a.y * off * 0.6 + a.x * 8;
      const oy = p.y - baseH - bodyH - 4 - a.y * off * 0.3;
      const len = 23 + ramp * 12 - Math.abs(off) * 0.5;
      uBar(ctx, ox, oy, ox + a.x * len, oy + a.y * len * 0.8,
        5.6 + ramp * 1.4, '#5c4d3d');
      uBar(ctx, ox - 1.2, oy - 1.2, ox + a.x * len * 0.9, oy + a.y * len * 0.72,
        2.2, '#c8a878');
      // кольца усиления
      ctx.strokeStyle = i === 1 ? PAL.gold : 'rgba(200,178,140,.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ox + a.x * len * 0.42 - a.y * 3.4, oy + a.y * len * 0.34 + a.x * 3.4);
      ctx.lineTo(ox + a.x * len * 0.42 + a.y * 3.4, oy + a.y * len * 0.34 - a.x * 3.4);
      ctx.stroke();
      spot(ctx, ox + a.x * len, oy + a.y * len * 0.8, 3, '#2f2a25');
      spot(ctx, ox + a.x * len, oy + a.y * len * 0.8, 1.3, 'rgba(255,207,74,.55)');
    }

    // станина, гидравлика и ящики со снарядами
    uBox(ctx, p.x - 16, p.y - baseH - 5, 8, 4, 1, '#4c4035');
    uBox(ctx, p.x + 8, p.y - baseH - 6, 7, 5, 1, '#4c4035');
    ctx.strokeStyle = '#3c332b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y - baseH - 2);
    ctx.lineTo(p.x - 4, p.y - baseH - bodyH - 2);
    ctx.moveTo(p.x + 10, p.y - baseH - 2);
    ctx.lineTo(p.x + 5, p.y - baseH - bodyH - 2);
    ctx.stroke();

    // знамя артиллерии
    const fx = b.x + b.w - 0.34;
    const fy = b.y + 0.3;
    const fp = P(fx, fy);
    if (L >= 4) banner(ctx, fp.x, fp.y - baseH - 2, 18 + ramp * 6, 8, 6, PAL.gold);
    if (L >= 8) {
      bWindowBand(ctx, b, 0.4, baseH, bodyH, 3);
      ring(ctx, p.x, p.y - baseH - bodyH, 23 + ramp * 4,
        (14 + ramp * 2) * GQ, 'rgba(255,207,74,.35)', 1);
    }
    if (L >= 12) {
      // третья пара катков и дальномер
      exhaustStack(ctx, p.x + 20, p.y - baseH - 2, 10, 3.6, 'rgba(230,214,180,.22)');
      antennaMast(ctx, p.x - 20, p.y - baseH - 4, 9 + ramp * 5, PAL.metalLight, PAL.cyan);
    }
    if (L >= 15) {
      bRibs(ctx, b, 0.22, baseH, bodyH, 5, 'rgba(255,207,74,.16)');
      spot(ctx, p.x, p.y - baseH - bodyH - 3, 1.4, PAL.amber);
    }
    if (L >= 18) {
      ring(ctx, p.x, p.y - baseH - bodyH - 2, 8, 8 * GQ, 'rgba(255,207,74,.6)', 1.1);
      spire(ctx, p.x, p.y - baseH - bodyH - 12, 6, PAL.gold);
    }
  }

  /* --- картечная башня: широкий веер коротких стволов --- */
  function drawScattershot(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const bodyH = 20 + ramp * 9;
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const n = L >= 12 ? 7 : (L >= 6 ? 5 : 3);

    bPrep(ctx, b, 1.15);
    bPlinth(ctx, b, 0.14, baseH, '#6a6259');
    bKick(ctx, b, 0.14, 1.4, 'rgba(199,162,114,.4)');

    box(ctx, b.x + 0.36, b.y + 0.36, b.x + b.w - 0.36, b.y + b.h - 0.36,
      baseH + bodyH, '#6f6558');
    // скошенная броня спереди
    const D = P(b.x + 0.36, b.y + b.h - 0.36);
    const C = P(b.x + b.w - 0.36, b.y + b.h - 0.36);
    poly(ctx, [
      { x: D.x, y: D.y - baseH },
      { x: C.x, y: C.y - baseH },
      { x: C.x + 5, y: C.y - baseH - bodyH * 0.55 },
      { x: C.x, y: C.y - baseH - bodyH },
      { x: D.x, y: D.y - baseH - bodyH }
    ], '#7d7163');
    ctx.strokeStyle = 'rgba(255,240,210,.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(D.x, D.y - baseH - bodyH);
    ctx.lineTo(C.x, C.y - baseH - bodyH);
    ctx.stroke();

    // казённая часть и веер стволов
    const ox = p.x + a.x * 4;
    const oy = p.y - baseH - bodyH - 4 + a.y * 3;
    for (let i = 0; i < n; i++) {
      const k = (i - (n - 1) / 2) / Math.max(1, n - 1);
      const spread = k * 0.95;
      const len = 12 + ramp * 8;
      const ex = ox + (a.x * Math.cos(spread) - nx * Math.sin(spread) * 0) * len +
        nx * k * 13;
      const ey = oy + (a.y * Math.cos(spread) - ny * Math.sin(spread) * 0) * len +
        ny * k * 13 * 0.7;
      uBar(ctx, ox + nx * k * 5, oy + ny * k * 5 * 0.7, ex, ey,
        3.5 + ramp * 0.8, '#4a4339');
      uBar(ctx, ox + nx * k * 5, oy + ny * k * 5 * 0.7 - 0.7,
        ex, ey - 0.7, 1.3, '#d8c09a');
      spot(ctx, ex, ey, 2.2, '#2c2721');
      spot(ctx, ex, ey, 0.9, 'rgba(255,207,74,.5)');
    }

    // барабан с боеприпасами
    ring(ctx, p.x - 13, p.y - baseH - 2, 6.5, 6.5 * GQ, '#3f3933', 3.2);
    ring(ctx, p.x - 13, p.y - baseH - 2, 6.5, 6.5 * GQ, 'rgba(255,207,74,.35)', 1);
    for (let i = 0; i < 5; i++) {
      const ang = i * Math.PI * 2 / 5;
      spot(ctx, p.x - 13 + Math.cos(ang) * 4, p.y - baseH - 2 + Math.sin(ang) * 4 * GQ,
        1, '#d0ad6a');
    }

    if (L >= 6) bRibs(ctx, b, 0.3, baseH, bodyH, 5, 'rgba(40,48,52,.3)');
    if (L >= 9) {
      // второй ярус картечи
      for (let i = 0; i < 3; i++) {
        uBar(ctx, p.x - 5 + i * 5, p.y - baseH - bodyH - 10,
          p.x - 8 + i * 6, p.y - baseH - bodyH - 18, 1.8, '#4f4740');
      }
      bKick(ctx, b, 0.2, bodyH + baseH - 2, 'rgba(255,207,74,.28)');
    }
    if (L >= 13) {
      exhaustStack(ctx, p.x + 17, p.y - baseH - 2, 8, 3.2, 'rgba(230,214,180,.2)');
      ring(ctx, p.x, p.y - baseH - bodyH - 3, 10, 3.4, 'rgba(255,207,74,.3)', 0.9);
    }
    if (L >= 17) {
      spire(ctx, p.x + 14, p.y - baseH - bodyH + 1, 6, PAL.amber);
      spot(ctx, p.x, p.y - baseH - bodyH - 5, 1.3, PAL.gold);
    }
    if (L >= 20) {
      ring(ctx, p.x, p.y - baseH - bodyH - 2, 12, 3.8, 'rgba(255,236,190,.55)', 1.1);
    }
  }

  /* --- обелиск: тёмный камень, светящийся шов, парящий осколок --- */
  function drawMonolith(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 8 + ramp * 3;
    const bodyH = 30 + ramp * 16;

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.1, baseH, '#4a505c');
    bKick(ctx, b, 0.1, 1.4, 'rgba(159,169,192,.4)');

    // четыре угловых пилона: площадка читается даже в 64 px
    const posts = [
      [0.24, 0.24], [b.w - 0.24, 0.24],
      [0.24, b.h - 0.24], [b.w - 0.24, b.h - 0.24]
    ];
    for (let i = 0; i < posts.length; i++) {
      const q = P(b.x + posts[i][0], b.y + posts[i][1]);
      prism(ctx, b.x + posts[i][0] - 0.07, b.y + posts[i][1] - 0.07,
        b.x + posts[i][0] + 0.07, b.y + posts[i][1] + 0.07,
        baseH, 8 + ramp * 5,
        '#8a93a4', '#6c7583', '#464d59');
      spot(ctx, q.x, q.y - baseH - 8 - ramp * 5 - 1, 0.9,
        L >= 15 ? PAL.gold : PAL.glass);
    }

    // сужающийся обелиск из трёх слоёв
    const w0 = 0.62;
    prism(ctx, cx - w0, cy - w0, cx + w0, cy + w0, baseH, bodyH * 0.5,
      mix('#6c7583', '#ffe1b4', 0.06), '#59616e', '#3b424d');
    prism(ctx, cx - w0 * 0.66, cy - w0 * 0.66, cx + w0 * 0.66, cy + w0 * 0.66,
      baseH + bodyH * 0.5, bodyH * 0.34,
      '#727c8c', '#5c6674', '#3d4550');
    prism(ctx, cx - w0 * 0.34, cy - w0 * 0.34, cx + w0 * 0.34, cy + w0 * 0.34,
      baseH + bodyH * 0.84, bodyH * 0.16,
      '#7d8798', '#646e7c', '#434b56');

    // светящийся шов по центру передней грани
    const topY = p.y - baseH - bodyH;
    const seam = L >= 16 ? 'rgba(255,220,150,.85)' : 'rgba(159,210,255,.65)';
    uBar(ctx, p.x, p.y - baseH - 4, p.x, topY + 2, 1.5, seam);
    uBar(ctx, p.x, p.y - baseH - 4, p.x, topY + 2, 0.6, 'rgba(255,255,255,.65)');

    // парящий осколок над вершиной и оправа
    const orbY = topY - 9 - ramp * 4;
    ring(ctx, p.x, topY - 1.5, 9 + ramp * 2, (9 + ramp * 2) * GQ,
      L >= 15 ? 'rgba(255,207,74,.55)' : 'rgba(159,169,192,.45)', 1);
    poly(ctx, [
      { x: p.x, y: orbY - 6 },
      { x: p.x + 4.2, y: orbY - 1.5 },
      { x: p.x, y: orbY + 5 },
      { x: p.x - 4.2, y: orbY - 1.5 }
    ], L >= 12 ? PAL.gold : '#aeb8cc');
    spot(ctx, p.x, orbY - 0.5, 1.5, 'rgba(255,255,255,.9)');
    ring(ctx, p.x, orbY, 7, 7 * GQ, 'rgba(196,222,255,.35)', 0.9);

    if (L >= 6) {
      // рунические насечки на гранях
      ctx.strokeStyle = 'rgba(180,220,255,.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 1; i <= 4; i++) {
        const yy = p.y - baseH - bodyH * (0.16 + i * 0.16);
        const ww = w0 * (1 - i * 0.12);
        ctx.moveTo(p.x - ww * TW * 0.42, yy);
        ctx.lineTo(p.x + ww * TW * 0.42, yy);
      }
      ctx.stroke();
    }
    if (L >= 10) {
      ring(ctx, p.x, p.y - baseH - 1.5, 15 + ramp * 3,
        (15 + ramp * 3) * GQ, 'rgba(255,207,74,.22)', 1);
    }
    if (L >= 14) {
      // второй осколок и золотая инкрустация
      spot(ctx, p.x - 11, orbY + 4, 2.2, PAL.gold);
      spot(ctx, p.x + 11, orbY + 3, 1.8, PAL.cold);
      bKick(ctx, b, 0.24, bodyH * 0.7 + baseH, 'rgba(255,207,74,.35)');
    }
    if (L >= 18) {
      ring(ctx, p.x, orbY, 11, 4, 'rgba(255,236,190,.5)', 1);
      spot(ctx, p.x, orbY, 1.2, 'rgba(255,255,255,.95)');
    }
  }

  /* --- генератор поля: шпиль с парящей сферой --- */
  function drawSpellTower(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const towerH = 22 + ramp * 12;
    const orbY = p.y - baseH - towerH - 10 - ramp * 3;

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.16, baseH, '#6f6a82');
    bKick(ctx, b, 0.16, 1.5, 'rgba(180,156,255,.4)');

    // три сужающихся яруса, повёрнутых друг к другу
    prism(ctx, cx - 0.48, cy - 0.48, cx + 0.48, cy + 0.48, baseH, towerH * 0.4,
      '#7a7294', '#655e7d', '#463f5a');
    prism(ctx, cx - 0.33, cy - 0.33, cx + 0.33, cy + 0.33,
      baseH + towerH * 0.4, towerH * 0.32,
      '#867da3', '#6f6789', '#4c4464');
    prism(ctx, cx - 0.18, cy - 0.18, cx + 0.18, cy + 0.18,
      baseH + towerH * 0.72, towerH * 0.28,
      '#948aad', '#7a7294', '#544b6c');

    // светящиеся руны по корпусу
    ctx.strokeStyle = 'rgba(196,160,255,.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = p.y - baseH - towerH * (0.14 + i * 0.2);
      const ww = 10 - i * 2;
      ctx.moveTo(p.x - ww, yy);
      ctx.lineTo(p.x + ww, yy);
    }
    ctx.stroke();

    // оправы сферы: две дуги и кольцо
    ring(ctx, p.x, orbY, 9 + ramp * 3, (9 + ramp * 3) * 0.82,
      'rgba(180,156,255,.4)', 1);
    ctx.strokeStyle = 'rgba(180,156,255,.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, orbY, 6 + ramp * 2, 10 + ramp * 3, 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, orbY, 11 + ramp * 3, 4.5, -0.35, 0, Math.PI * 2);
    ctx.stroke();

    // сфера
    spot(ctx, p.x, orbY, 5 + ramp * 1.6, L >= 14 ? PAL.gold : '#c8aaff');
    spot(ctx, p.x - 1, orbY - 1.2, 3.4, 'rgba(255,255,255,.45)');
    spot(ctx, p.x, orbY, 1.6, 'rgba(255,255,255,.85)');

    // пьедестал сферы
    prism(ctx, cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12,
      baseH + towerH - 1, 3, PAL.gold, PAL.metal, PAL.metalDark);

    if (L >= 6) {
      // кристаллы у основания
      for (let i = 0; i < 3; i++) {
        const q = P(b.x + 0.3 + i * 0.2, b.y + b.h - 0.28);
        poly(ctx, [
          { x: q.x, y: q.y - baseH - 7 },
          { x: q.x + 2.2, y: q.y - baseH - 2 },
          { x: q.x - 1.8, y: q.y - baseH - 2 }
        ], 'rgba(200,170,255,.7)');
      }
    }
    if (L >= 10) {
      ring(ctx, p.x, orbY, 13 + ramp * 4, (13 + ramp * 4) * 0.5,
        'rgba(255,207,74,.3)', 0.9);
      bWindowBand(ctx, b, 0.34, baseH, towerH * 0.4, 2);
    }
    if (L >= 14) {
      // вторая сфера на малом кольце
      spot(ctx, p.x - 12, orbY + 5, 2.2, '#c8aaff');
      spot(ctx, p.x + 12, orbY + 4, 1.8, PAL.gold);
      ring(ctx, p.x, orbY + 10, 6, 2.4, 'rgba(200,170,255,.35)', 0.8);
    }
    if (L >= 18) {
      spire(ctx, p.x, orbY - 8, 9, PAL.gold);
      spot(ctx, p.x, orbY, 1.4, 'rgba(255,252,232,.95)');
    }
  }

  /* --- спаренная лазерная вышка: две башни на одном цоколе --- */
  function drawMultiArcher(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const h1 = 26 + ramp * 11;
    const h2 = 21 + ramp * 9;
    // Башни разносим поперёк экранной оси: на диагонали изометрии они
    // вставали друг за другом и читались одной мачтой.
    const ax = cx - 0.66;
    const ay = cy;
    const bx = cx + 0.66;
    const by = cy;
    const pa = P(ax, ay);
    const pb = P(bx, by);

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.14, baseH, '#7a6a58');
    bKick(ctx, b, 0.14, 1.4, 'rgba(224,183,138,.38)');

    // общая платформа и мостик
    box(ctx, b.x + 0.3, b.y + 0.3, b.x + b.w - 0.3, b.y + b.h - 0.3,
      baseH + 6, '#7c6a56');
    uBar(ctx, pa.x, pa.y - baseH - 5, pb.x, pb.y - baseH - 5, 2.4, '#5d4f40');

    const tower = function (q, bx0, by0, hh, gold) {
      prism(ctx, bx0 - 0.26, by0 - 0.24, bx0 + 0.26, by0 + 0.24, baseH + 5, hh,
        gold ? '#e0b78a' : '#b0906a', '#9a7a5a', '#6b543f');
      // боевая головка
      ctx.fillStyle = gold ? '#e6c096' : '#c4a276';
      ctx.beginPath();
      ctx.ellipse(q.x, q.y - baseH - 5 - hh, 6.5 + ramp * 1.6,
        (6.5 + ramp * 1.6) * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      spot(ctx, q.x, q.y - baseH - 5 - hh - 2, 2.2, PAL.glass);
      uBar(ctx, q.x, q.y - baseH - 5 - hh - 1, q.x + 8 + ramp * 3,
        q.y - baseH - 5 - hh - 4, 1.8, '#3f4a50');
      spot(ctx, q.x + 8 + ramp * 3, q.y - baseH - 5 - hh - 4, 1.1, PAL.cyan);
      ring(ctx, q.x, q.y - baseH - 5 - hh, 7.4, 7.4 * GQ,
        'rgba(127,233,255,.3)', 0.8);
      // светлая полоса на стволе башни
      uBar(ctx, q.x - 4, q.y - baseH - 5 - hh * 0.55,
        q.x + 4, q.y - baseH - 5 - hh * 0.55, 0.9,
        gold ? PAL.gold : 'rgba(224,183,138,.55)');
    };
    tower(pa, ax, ay, h1, L >= 12);
    tower(pb, bx, by, h2, false);

    // антенна и кабели
    ctx.strokeStyle = 'rgba(60,72,78,.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y - baseH - 6 - h1);
    ctx.lineTo(pb.x, pb.y - baseH - 6 - h2);
    ctx.stroke();

    if (L >= 5) {
      bWindowBand(ctx, b, 0.34, baseH, 6, 2);
    }
    if (L >= 8) {
      // третья малая головка между башнями
      const q = P(cx, b.y + 0.5);
      prism(ctx, cx - 0.14, b.y + 0.36, cx + 0.14, b.y + 0.64, baseH + 5, 16,
        '#c8a880', '#a98a68', '#735c45');
      spot(ctx, q.x, q.y - baseH - 22, 1.8, PAL.cold);
    }
    if (L >= 12) {
      bRibs(ctx, b, 0.24, baseH, 6, 4);
      antennaMast(ctx, pa.x - 5, pa.y - baseH - 7 - h1, 8 + ramp * 4,
        PAL.metalLight, PAL.gold);
    }
    if (L >= 16) {
      ring(ctx, pa.x, pa.y - baseH - 6 - h1, 9, 4, 'rgba(255,207,74,.45)', 1);
      ring(ctx, pb.x, pb.y - baseH - 6 - h2, 8, 3.6, 'rgba(255,207,74,.35)', 0.9);
    }
    if (L >= 19) {
      spire(ctx, pa.x, pa.y - baseH - 9 - h1, 7, PAL.gold);
      spire(ctx, pb.x, pb.y - baseH - 9 - h2, 6, PAL.amber);
    }
  }

  /* --- рикошетная турель: наклонные дефлекторы и короткий ствол --- */
  function drawRicochet(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const podH = 18 + ramp * 9;
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.14, baseH, '#68787c');
    bKick(ctx, b, 0.14, 1.4, 'rgba(169,208,212,.4)');

    ring(ctx, p.x, p.y - baseH, 15 + ramp * 3, (15 + ramp * 3) * GQ,
      'rgba(40,54,58,.55)', 1.1);
    prism(ctx, cx - 0.44, cy - 0.4, cx + 0.44, cy + 0.4, baseH, podH,
      '#9fc4c8', '#7ea0a4', '#4c666a');

    // два наклонных дефлектора: снаряд «отскакивает»
    const oy = p.y - baseH - podH - 1;
    for (let s = -1; s <= 1; s += 2) {
      const x = p.x + nx * s * 12;
      const y = oy + ny * s * 12 * 0.7;
      poly(ctx, [
        { x: x - a.x * 6 - nx * s * 2, y: y - a.y * 6 },
        { x: x + a.x * 6 - nx * s * 2, y: y + a.y * 6 },
        { x: x + a.x * 6 + nx * s * 2, y: y + a.y * 6 + ny * s * 2 },
        { x: x - a.x * 6 + nx * s * 2, y: y - a.y * 6 + ny * s * 2 }
      ], s > 0 ? 'rgba(200,232,236,.85)' : 'rgba(150,186,190,.8)');
      ctx.strokeStyle = s > 0 ? PAL.gold : 'rgba(127,233,255,.4)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - a.x * 6 - nx * s * 2, y - a.y * 6);
      ctx.lineTo(x + a.x * 6 - nx * s * 2, y + a.y * 6);
      ctx.stroke();
    }

    // ствол с тремя дисками-отражателями
    const ox = p.x + a.x * 6;
    const oy2 = oy + a.y * 5;
    const len = 16 + ramp * 9;
    uBar(ctx, ox, oy2, ox + a.x * len, oy2 + a.y * len, 3.2 + ramp * 0.8, '#3f4a4e');
    const discs = L >= 13 ? 4 : (L >= 7 ? 3 : 2);
    for (let i = 0; i < discs; i++) {
      const k = (i + 1) / (discs + 1);
      const qx = ox + a.x * len * k;
      const qy = oy2 + a.y * len * k;
      ctx.strokeStyle = i === 1 ? PAL.cold : 'rgba(169,208,212,.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(qx - nx * 4.6, qy - ny * 4.6);
      ctx.lineTo(qx + nx * 4.6, qy + ny * 4.6);
      ctx.stroke();
    }
    spot(ctx, ox + a.x * len, oy2 + a.y * len, 2, '#243034');

    if (L >= 8) {
      bRibs(ctx, b, 0.3, baseH, podH, 4, 'rgba(30,44,48,.35)');
      spot(ctx, p.x, p.y - baseH - podH + 1, 1.2, PAL.cold);
    }
    if (L >= 12) {
      ring(ctx, p.x, p.y - baseH, 14 + ramp * 3, (14 + ramp * 3) * GQ,
        'rgba(255,207,74,.3)', 1);
    }
    if (L >= 16) {
      exhaustStack(ctx, p.x + 13, p.y - baseH - 1, 7, 3, 'rgba(196,240,244,.18)');
      spot(ctx, p.x, p.y - baseH - podH - 8, 1.2, PAL.gold);
    }
    if (L >= 19) {
      spire(ctx, p.x - 12, p.y - baseH - podH + 2, 7, PAL.gold);
    }
  }

  /* --- многоствольная башня: зубчатая станина и барабан стволов --- */
  function drawMultiGear(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const bodyH = 20 + ramp * 9;
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const barrels = L >= 14 ? 5 : (L >= 8 ? 4 : 2);

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.14, baseH, '#6b736c');
    bKick(ctx, b, 0.14, 1.4, 'rgba(191,201,184,.4)');

    // зубья шестерни по краю цоколя — силуэт «механизма»
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI * 2 / 8 + 0.25;
      const gx = b.x + b.w / 2 + Math.cos(ang) * 0.78;
      const gy = b.y + b.h / 2 + Math.sin(ang) * 0.78;
      prism(ctx, gx - 0.09, gy - 0.09, gx + 0.09, gy + 0.09, 0, baseH + 2,
        '#a7b09f', '#8b9485', '#5f685c');
    }

    box(ctx, b.x + 0.4, b.y + 0.4, b.x + b.w - 0.4, b.y + b.h - 0.4,
      baseH + bodyH, '#66706a');
    ring(ctx, p.x, p.y - baseH - bodyH, 12 + ramp * 2,
      (12 + ramp * 2) * GQ, 'rgba(191,201,184,.5)', 1.2);

    // барабан: несколько стволов под разными углами
    const oy = p.y - baseH - bodyH - 3;
    for (let i = 0; i < barrels; i++) {
      const k = (i - (barrels - 1) / 2) / Math.max(1, barrels - 1);
      const ex = p.x + a.x * (12 + ramp * 8) + nx * k * 14;
      const ey = oy + a.y * (10 + ramp * 6) + ny * k * 10;
      uBar(ctx, p.x + nx * k * 4, oy + ny * k * 4, ex, ey,
        3.2 + ramp * 0.7, '#4a534c');
      uBar(ctx, p.x + nx * k * 4, oy + ny * k * 4 - 0.8, ex, ey - 0.8,
        1.2, '#c8d0c0');
      spot(ctx, ex, ey, 2.2, '#28302b');
      spot(ctx, ex, ey, 0.9, 'rgba(255,207,74,.55)');
    }

    // боеприпасная лента сбоку
    ctx.strokeStyle = 'rgba(255,207,74,.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.moveTo(p.x - 13 + i * 2, p.y - baseH - 2);
      ctx.lineTo(p.x - 12 + i * 2, p.y - baseH - bodyH + 2);
    }
    ctx.stroke();

    if (L >= 6) bRibs(ctx, b, 0.3, baseH, bodyH, 3);
    if (L >= 10) {
      // вторая шестерня-маховик
      ring(ctx, p.x - 14, p.y - baseH - bodyH * 0.4, 5.5, 5.5 * GQ,
        '#8b9485', 2.4);
      ring(ctx, p.x - 14, p.y - baseH - bodyH * 0.4, 2.2, 2.2 * GQ,
        PAL.metalDark, 1.2);
    }
    if (L >= 13) {
      bWindowBand(ctx, b, 0.42, baseH, bodyH, 2);
      exhaustStack(ctx, p.x + 15, p.y - baseH - 1, 8, 3, 'rgba(220,210,190,.2)');
    }
    if (L >= 17) {
      ring(ctx, p.x, oy, 9, 3.2, 'rgba(255,207,74,.4)', 1);
      spot(ctx, p.x, oy - 5, 1.4, PAL.gold);
    }
    if (L >= 20) {
      spire(ctx, p.x + 13, p.y - baseH - bodyH + 2, 7, PAL.amber);
    }
  }

  /* --- плазмомёт: баки, толстый ствол, жарозащита --- */
  function drawFireSpitter(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const bodyH = 20 + ramp * 8;
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;

    bPrep(ctx, b, 1.15);
    bPlinth(ctx, b, 0.14, baseH, '#7a5a46');
    bKick(ctx, b, 0.14, 1.4, 'rgba(255,154,90,.42)');

    box(ctx, b.x + 0.36, b.y + 0.36, b.x + b.w - 0.36, b.y + b.h - 0.36,
      baseH + bodyH, '#6d4c3b');
    // жаровые пластины и светящаяся щель спереди
    const D = P(b.x + 0.36, b.y + b.h - 0.36);
    const C = P(b.x + b.w - 0.36, b.y + b.h - 0.36);
    patchPx(ctx, D, C, bodyH, 0.12, 0.88, baseH + 3, baseH + bodyH - 3,
      'rgba(255,138,74,.16)');
    patchPx(ctx, D, C, bodyH, 0.3, 0.7, baseH + bodyH * 0.42,
      baseH + bodyH * 0.58, 'rgba(255,154,90,.55)');
    patchPx(ctx, D, C, bodyH, 0.34, 0.66, baseH + bodyH * 0.45,
      baseH + bodyH * 0.55, 'rgba(255,236,180,.7)');
    // рёбра охлаждения по бортам
    ctx.strokeStyle = 'rgba(255,154,90,.3)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = D.y - baseH - 4 - i * 4;
      ctx.moveTo(D.x + 5, y);
      ctx.lineTo(C.x - 5, y + 0.8);
    }
    ctx.stroke();

    // два топливных бака на корме, светлее корпуса
    for (let s = -1; s <= 1; s += 2) {
      const tx = p.x + nx * s * 15;
      const ty = p.y - baseH - bodyH * 0.45;
      ctx.fillStyle = s < 0 ? '#a06a4c' : '#8a5a42';
      ctx.beginPath();
      ctx.ellipse(tx, ty, 5.6 + ramp * 1.2, (16 + ramp * 5) * 0.55,
        0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,140,.35)';
      ctx.beginPath();
      ctx.ellipse(tx - 1.5, ty - 3, 1.8, 5.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // обручи бака
      ctx.strokeStyle = 'rgba(60,40,28,.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(tx - 5.2, ty - 3);
      ctx.lineTo(tx + 5.2, ty - 3);
      ctx.moveTo(tx - 4.4, ty + 3.4);
      ctx.lineTo(tx + 4.4, ty + 3.4);
      ctx.stroke();
      // трубка к стволу
      ctx.strokeStyle = 'rgba(60,40,28,.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 6);
      ctx.lineTo(p.x + a.x * 4, p.y - baseH - bodyH - 1);
      ctx.stroke();
    }

    // ствол-сопло
    const ox = p.x + a.x * 5;
    const oy = p.y - baseH - bodyH - 2;
    const len = 16 + ramp * 8;
    uBar(ctx, ox, oy, ox + a.x * len, oy + a.y * len * 0.8,
      5.2 + ramp * 1.4, '#4a3a30');
    uBar(ctx, ox, oy - 1, ox + a.x * len * 0.86, oy + a.y * len * 0.7 - 1,
      1.8, '#a07056');
    // раструб
    poly(ctx, [
      { x: ox + a.x * len - nx * 4.6, y: oy + a.y * len * 0.8 - ny * 4.6 },
      { x: ox + a.x * len + nx * 4.6, y: oy + a.y * len * 0.8 + ny * 4.6 },
      { x: ox + a.x * (len + 5) + nx * 6.2, y: oy + a.y * (len + 5) * 0.8 + ny * 6.2 },
      { x: ox + a.x * (len + 5) - nx * 6.2, y: oy + a.y * (len + 5) * 0.8 - ny * 6.2 }
    ], '#3a2d25');
    spot(ctx, ox + a.x * len, oy + a.y * len * 0.8, 2.4, 'rgba(255,154,90,.75)');

    if (L >= 5) {
      // поджиг: маленький факел на срезе
      spot(ctx, ox + a.x * (len + 4), oy + a.y * (len + 4) * 0.8, 1.8,
        'rgba(255,220,140,.7)');
    }
    if (L >= 8) {
      bRibs(ctx, b, 0.3, baseH, bodyH, 4, 'rgba(50,32,24,.4)');
      exhaustStack(ctx, p.x - 16, p.y - baseH - 1, 8, 3.2, 'rgba(255,138,74,.25)');
    }
    if (L >= 12) {
      // второй ствол и жаровая сетка
      uBar(ctx, p.x - 7, p.y - baseH - bodyH + 1,
        p.x - 12, p.y - baseH - bodyH - 10, 2.6, '#4a3a30');
      ctx.strokeStyle = 'rgba(255,138,74,.35)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - baseH - bodyH + 2, 13, 5, 0, 0, Math.PI);
      ctx.stroke();
    }
    if (L >= 16) {
      ring(ctx, p.x, p.y - baseH - bodyH - 1, 10, 3.4,
        'rgba(255,154,90,.45)', 1);
      spot(ctx, p.x, p.y - baseH - bodyH - 4, 1.3, PAL.amber);
    }
    if (L >= 19) {
      spire(ctx, p.x + 14, p.y - baseH - bodyH + 2, 6, PAL.amber);
    }
  }

  /* --- Карающая башня: наклонный обелиск с подвешенным «карателем» ---
     Тёмная оборона поздних центров. Силуэт намеренно несимметричный:
     три контрфорса разной высоты, сужающийся ствол и вынесенная в сторону
     тяжёлая клетка-ядро. Никаких коробок: масса набирается наклонными
     рёбрами, а акцент — фиолетовое ядро и рваные знамёна. */
  function drawRevenge(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const baseH = 7 + ramp * 3;
    const towerH = 30 + ramp * 18;
    const spireH = 12 + ramp * 8;

    bPrep(ctx, b, 1.3);
    // круглый тёмный стилобат: газон остаётся виден по краям
    ring(ctx, p.x, p.y - 0.5, 25 + ramp * 7, (25 + ramp * 7) * GQ,
      'rgba(40,28,50,.55)', 5 + ramp * 2);
    ring(ctx, p.x, p.y - 0.5, 25 + ramp * 7, (25 + ramp * 7) * GQ,
      'rgba(201,143,224,.3)', 1);
    prism(ctx, b.x + 0.34, b.y + 0.34, b.x + b.w - 0.34, b.y + b.h - 0.34,
      0, baseH, mix('#4b3a5c', '#ffe1b4', 0.09), '#453552', '#2b2336');
    prism(ctx, cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7,
      baseH, 3.4, '#5a466e', '#4a3a58', '#32293e');
    bKick(ctx, b, 0.34, 1.5, 'rgba(201,143,224,.42)');

    // контрфорсы: три разных высоты и наклона
    const feet = [[-0.86, 0.48, 16], [-0.24, 0.96, 24], [0.82, 0.66, 19]];
    for (let i = 0; i < feet.length; i++) {
      const f = feet[i];
      const g = P(cx + f[0], cy + f[1]);
      const tx = g.x - a.x * (3 + ramp * 3);
      const ty = g.y - baseH - f[2] - ramp * 6;
      uBar(ctx, g.x, g.y - baseH + 1, tx, ty, 5 + ramp * 1.4, '#332a40');
      uBar(ctx, g.x, g.y - baseH + 1, tx, ty - 0.8, 1.5, '#6a547e');
      if (L >= 6) spot(ctx, tx, ty, 1.2, 'rgba(201,143,224,.55)');
    }

    // малая боковая башенка: ломает симметрию и добавляет второй ярус
    const axw = cx - 0.9;
    const ayw = cy + 0.92;
    prism(ctx, axw - 0.28, ayw - 0.28, axw + 0.28, ayw + 0.28,
      baseH, 18 + ramp * 10, '#5a466e', '#453552', '#2b2336');
    prism(ctx, axw - 0.19, ayw - 0.19, axw + 0.19, ayw + 0.19,
      baseH + 18 + ramp * 10, 4, '#6a547e', '#523f66', '#352b42');
    if (L >= 9) spot(ctx, P(axw, ayw).x, P(axw, ayw).y - baseH - 22 - ramp * 10,
      1.1, PAL.gold);

    // сужающийся ствол: три объёма, верх уходит в темноту
    prism(ctx, cx - 0.72, cy - 0.72, cx + 0.72, cy + 0.72,
      baseH + 3.4, towerH * 0.46,
      mix('#5a466e', '#ffe1b4', 0.06), '#453552', '#2b2336');
    prism(ctx, cx - 0.54, cy - 0.54, cx + 0.54, cy + 0.54,
      baseH + 3.4 + towerH * 0.46, towerH * 0.34,
      '#5a466e', '#4a3a58', '#302840');
    prism(ctx, cx - 0.36, cy - 0.36, cx + 0.36, cy + 0.36,
      baseH + 3.4 + towerH * 0.8, towerH * 0.2,
      '#6a547e', '#523f66', '#352b42');

    const topY = p.y - baseH - 3.4 - towerH;

    // центральный шип-клин: над ступенями появляется «маяк», силуэт
    // читается как башня, а не как ступенчатая пирамида
    uBar(ctx, p.x, topY + 1, p.x, topY - spireH, 2.6, '#332a40');
    uBar(ctx, p.x, topY + 1, p.x, topY - spireH, 0.9, '#8a6fa4');
    poly(ctx, [
      { x: p.x - 2.4, y: topY - 4 },
      { x: p.x, y: topY - spireH - 2 },
      { x: p.x + 2.4, y: topY - 4 }
    ], L >= 12 ? '#a878d8' : '#5a466e');
    spot(ctx, p.x, topY - spireH - 2.4, 1.2,
      L >= 17 ? PAL.gold : 'rgba(224,166,255,.9)');

    // руническая щель и насечки: читаются с 3 уровня
    if (L >= 3) {
      const fd = P(cx - 0.34, cy + 0.52);
      const fc = P(cx + 0.34, cy + 0.52);
      patchPx(ctx, fd, fc, baseH + 3.4 + towerH, 0.3, 0.7,
        baseH + 9, baseH + 9 + towerH * 0.4, 'rgba(201,143,224,.24)');
    }
    if (L >= 9) {
      ctx.strokeStyle = 'rgba(224,166,255,.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = p.y - baseH - 9 - i * 6;
        ctx.moveTo(p.x - 2.6, yy);
        ctx.lineTo(p.x + 2.6, yy - 1.6);
      }
      ctx.stroke();
    }

    // штанга-каратель и подвешенная клетка с ядром
    const armLen = 9 + ramp * 7;
    const ax = p.x + a.x * armLen;
    const ay = topY - 3 + a.y * armLen * 0.6;
    uBar(ctx, p.x, topY, ax, ay, 3.2, '#332a40');
    uBar(ctx, p.x, topY - 0.6, ax, ay - 0.6, 1.1, '#8a6fa4');
    uBar(ctx, ax, ay, ax + nx * 5, ay + ny * 3.4 + 2, 1.4, '#5a466e');
    uBar(ctx, ax, ay, ax - nx * 5, ay - ny * 3.4 + 2, 1.4, '#5a466e');
    const orbY = ay + 3.6;
    ring(ctx, ax, orbY, 4.2 + ramp * 1.2, (4.2 + ramp * 1.2) * GQ,
      'rgba(201,143,224,.55)', 1);
    spot(ctx, ax, orbY, 2.6, 'rgba(28,18,36,.94)');
    spot(ctx, ax, orbY - 0.4, 1.2, 'rgba(230,200,255,.92)');

    // знамёна на переднем ребре, с 12 — с золотой каймой
    const fn = P(b.x + 0.3, b.y + b.h - 0.3);
    banner(ctx, fn.x, fn.y - baseH - 3, 11 + ramp * 5, 4.4, 6,
      L >= 12 ? '#a8782e' : '#7a3452');
    if (L >= 7) {
      const bn = P(b.x + b.w - 0.3, b.y + 0.32);
      banner(ctx, bn.x, bn.y - baseH - 4, 8 + ramp * 3, 3.4, 4.6, '#4a3a58');
    }

    // 12+: цепи от вершины к передним углам
    if (L >= 12) {
      ctx.strokeStyle = 'rgba(120,104,134,.65)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let s = -1; s <= 1; s += 2) {
        ctx.moveTo(p.x + s * 2, topY + 2);
        ctx.quadraticCurveTo(p.x + s * 12, topY + 20,
          p.x + s * (16 + ramp * 4), p.y - baseH - 2);
      }
      ctx.stroke();
    }

    // 15+: тёмные крылья-жалюзи за стволом
    if (L >= 15) {
      for (let s = -1; s <= 1; s += 2) {
        poly(ctx, [
          { x: p.x + s * 5, y: topY + 8 },
          { x: p.x + s * (20 + ramp * 6), y: topY + 1 },
          { x: p.x + s * (17 + ramp * 5), y: topY + 10 },
          { x: p.x + s * 5, y: topY + 15 }
        ], s < 0 ? '#3d3049' : '#2e2537');
      }
    }

    // 18+: золотое кольцо над ядром и фиолетовые эмиттеры
    if (L >= 18) {
      ring(ctx, ax, orbY - 2, 7 + ramp * 2, (7 + ramp * 2) * GQ,
        'rgba(255,207,74,.5)', 1);
      spot(ctx, p.x + nx * 9, p.y - baseH - towerH * 0.5, 1.2, PAL.gold);
      spot(ctx, p.x - nx * 9, p.y - baseH - towerH * 0.5, 1.2, PAL.gold);
    }
  }

  /* --- Плазменный колосс: плечистая фигура на ступенчатой платформе ---
     Узнаваемый силуэт — широкие плечи с катушками, маленькая голова и
     парящее ядро над ней. Не башня и не коробка: корпус собран трапецией
     и дугами, руки читаются отдельно от туловища. */
  function drawSuperwizard(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const baseH = 6 + ramp * 3;
    const botY = p.y - baseH - 18;
    const torsoH = 30 + ramp * 12;
    const topY = botY - torsoH;
    const hw = 16 + ramp * 9;
    const a = aimVec(b);

    bPrep(ctx, b, 1.35);
    // круглая ступенчатая платформа: газон читается вокруг, силуэт не «плита»
    ring(ctx, p.x, p.y - 0.5, 31 + ramp * 8, (31 + ramp * 8) * GQ,
      'rgba(44,30,64,.5)', 5 + ramp * 2);
    prism(ctx, b.x + 0.58, b.y + 0.58, b.x + b.w - 0.58, b.y + b.h - 0.58,
      0, baseH, '#5a4678', '#4a3a62', '#2f2542');
    prism(ctx, b.x + 0.74, b.y + 0.74, b.x + b.w - 0.74, b.y + b.h - 0.74,
      baseH, 3.4, '#6a5488', '#574570', '#3a2f4e');
    bKick(ctx, b, 0.58, 1.5, 'rgba(224,166,255,.42)');

    // задние плавники-излучатели: рисуются до корпуса
    for (let i = -1; i <= 1; i++) {
      const fx = p.x + i * hw * 0.52;
      const fy = topY + 10 + Math.abs(i) * 3;
      poly(ctx, [
        { x: fx - 2.2, y: fy },
        { x: fx + i * 2.4, y: fy - 14 - ramp * 5 },
        { x: fx + 2.2, y: fy }
      ], i === 0 ? '#5e4780' : '#46345f');
      if (L >= 10) spot(ctx, fx + i * 2.2, fy - 14 - ramp * 5, 0.9,
        'rgba(224,166,255,.7)');
    }

    // опоры-ноги: колосс стоит на платформе, а не «парит» на плите
    for (let s = -1; s <= 1; s += 2) {
      const hx = p.x + s * hw * 0.38;
      const fx = p.x + s * hw * 0.5;
      uBar(ctx, hx, botY - 2, fx, p.y - baseH - 3, 6.4 + ramp * 2.4,
        s > 0 ? '#574570' : '#3d2e54');
      spot(ctx, fx, p.y - baseH - 3, 4.6 + ramp * 1.2,
        s > 0 ? '#6a5488' : '#46345f');
      uBar(ctx, hx, botY - 6, hx + s * 3, botY + 1, 5.2 + ramp * 1.6,
        '#5a4676');
    }

    // массивный трапециевидный корпус
    poly(ctx, [
      { x: p.x - hw * 0.64, y: botY },
      { x: p.x + hw * 0.64, y: botY },
      { x: p.x + hw, y: topY + 7 },
      { x: p.x + hw * 0.84, y: topY },
      { x: p.x - hw * 0.84, y: topY },
      { x: p.x - hw, y: topY + 7 }
    ], '#4f3a6a');
    // светлая нагрудная пластина и тёмные рёбра
    poly(ctx, [
      { x: p.x - hw * 0.34, y: topY + 7 },
      { x: p.x + hw * 0.34, y: topY + 7 },
      { x: p.x + hw * 0.5, y: botY - 4 },
      { x: p.x - hw * 0.5, y: botY - 4 }
    ], '#6a5488');
    ctx.strokeStyle = 'rgba(40,28,56,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const yy = topY + 7 + (botY - topY - 11) * i / 4;
      ctx.moveTo(p.x - hw * 0.34, yy);
      ctx.lineTo(p.x + hw * 0.34, yy);
    }
    ctx.stroke();

    // грудное ядро
    const cy0 = topY + torsoH * 0.56;
    ring(ctx, p.x, cy0, 4.6 + ramp, (4.6 + ramp) * 0.86, 'rgba(224,166,255,.65)', 1.2);
    spot(ctx, p.x, cy0, 2.8, 'rgba(32,20,44,.95)');
    spot(ctx, p.x, cy0 - 0.5, 1.4, 'rgba(240,214,255,.95)');

    // плечевые блоки с катушками
    for (let s = -1; s <= 1; s += 2) {
      const shx = p.x + s * hw * 0.98;
      const shy = topY + 8;
      ctx.fillStyle = s > 0 ? '#6a5488' : '#46345f';
      ctx.beginPath();
      ctx.ellipse(shx, shy, 5.6 + ramp * 1.6, 4.6 + ramp, 0.2 * s, 0, Math.PI * 2);
      ctx.fill();
      const coilY = shy - 4 - ramp * 1.5;
      ring(ctx, shx, coilY, 3.4 + ramp, (3.4 + ramp) * 0.7,
        s > 0 ? 'rgba(224,166,255,.75)' : 'rgba(159,210,255,.45)', 1.1);
      ring(ctx, shx, coilY - 2.2, 2.4 + ramp * 0.6, (2.4 + ramp * 0.6) * 0.7,
        'rgba(240,214,255,.55)', 0.8);
      if (L >= 13) {
        uBar(ctx, shx, shy - 2, shx + s * (5 + ramp * 2), shy - 9, 1.4, '#8a70b0');
        spot(ctx, shx + s * (5 + ramp * 2), shy - 9, 1, PAL.gold);
      }
    }

    // голова-шлем с узким визором
    poly(ctx, [
      { x: p.x - 4.2, y: topY - 1 },
      { x: p.x + 4.2, y: topY - 1 },
      { x: p.x + 3.2, y: topY - 8 },
      { x: p.x - 3.2, y: topY - 8 }
    ], '#5a4676');
    uBar(ctx, p.x - 2.6, topY - 5, p.x + 2.6, topY - 5, 1.4,
      L >= 15 ? PAL.gold : '#e0a6ff');

    // левая рука-кулак (ближняя к зрителю)
    uBar(ctx, p.x - hw * 0.92, topY + 12, p.x - hw - 3, botY - 8,
      4.2 + ramp, '#46345f');
    uBar(ctx, p.x - hw - 3, botY - 8, p.x - hw - 6, botY - 1,
      4.8 + ramp, '#574570');
    spot(ctx, p.x - hw - 6, botY - 1, 4.6 + ramp * 0.8, '#6a5488');
    for (let i = -1; i <= 1; i++) {
      spot(ctx, p.x - hw - 6 + i * 3, botY - 4.6, 1.2, '#8a70b0');
    }

    // правая рука-орудие смотрит в сторону цели
    const ax = p.x + hw * 0.92;
    const ay = topY + 13;
    uBar(ctx, ax, ay, ax + a.x * (9 + ramp * 4), ay + a.y * (7 + ramp * 3),
      4.6 + ramp, '#46345f');
    const mx = ax + a.x * (17 + ramp * 7);
    const my = ay + a.y * (13 + ramp * 5);
    uBar(ctx, ax + a.x * 5, ay + a.y * 4,
      mx, my, 3.4 + ramp * 0.8, '#2f2542');
    ring(ctx, mx, my, 3.4 + ramp, (3.4 + ramp) * 0.7, 'rgba(224,166,255,.6)', 1);
    spot(ctx, mx + a.x * 1.4, my + a.y * 1.2, 1.3, 'rgba(240,214,255,.9)');

    // 7+: кольца на предплечье, 16+: второе кольцо
    if (L >= 7) {
      ring(ctx, p.x - hw - 1, botY - 6, 5.4 + ramp, (5.4 + ramp) * 0.7,
        'rgba(224,166,255,.35)', 0.9);
    }
    if (L >= 16) {
      ring(ctx, ax + a.x * 10, ay + a.y * 8, 4.6, 3,
        'rgba(255,207,74,.5)', 0.9);
    }

    // парящее плазменное ядро над головой
    const oy = topY - 15 - ramp * 5;
    ring(ctx, p.x, oy, 7.6 + ramp * 2.4, (7.6 + ramp * 2.4) * 0.86,
      'rgba(224,166,255,.62)', 1.3);
    ring(ctx, p.x, oy, 5 + ramp * 1.4, (5 + ramp * 1.4) * 0.86,
      'rgba(159,210,255,.45)', 0.9);
    spot(ctx, p.x, oy, 3.6 + ramp, 'rgba(70,40,94,.95)');
    spot(ctx, p.x - 0.6, oy - 0.6, 1.9, 'rgba(240,214,255,.95)');

    // 16+: спутники-осколки вокруг ядра
    if (L >= 16) {
      for (let i = 0; i < 3; i++) {
        const ang = i * Math.PI * 2 / 3 - 0.6;
        const sx = p.x + Math.cos(ang) * (13 + ramp * 3);
        const sy = oy + Math.sin(ang) * (9 + ramp * 2) * 0.9;
        poly(ctx, [
          { x: sx, y: sy - 2.6 }, { x: sx + 1.8, y: sy },
          { x: sx, y: sy + 2.6 }, { x: sx - 1.8, y: sy }
        ], i === 0 ? PAL.gold : '#c8a6e8');
      }
    }

    // 19+: золотая корона-дуга над ядром
    if (L >= 19) {
      ring(ctx, p.x, oy, 11 + ramp * 2, (11 + ramp * 2) * 0.8,
        'rgba(255,232,170,.45)', 1);
    }
  }

  /* --- Шиповая башня: низкий ёж на круглой тумбе ---
     Пассивная контратака читается формой: ни ствола, ни палубы, только
     купол и два ряда шипов. Высота намеренно ниже соседних турелей,
     чтобы 2×2 не спорило с 3×3. */
  function drawSpiky(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const baseH = 6 + ramp * 4;
    const domeH = 16 + ramp * 9;
    const r0 = 11 + ramp * 2.6;        // радиус основания шипов
    const r1 = 23 + ramp * 7;          // вылет острия
    const prx = 25 + ramp * 6;         // круглая тумба
    const n = L >= 12 ? 12 : (L >= 6 ? 10 : 8);

    bPrep(ctx, b, 1.0);
    // круглая тумба: квадратный цоколь на 2×2 выглядел плитой
    ctx.fillStyle = '#3a2c2a';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, prx, prx * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57423d';
    ctx.fillRect(p.x - prx, p.y - baseH, prx * 2, baseH);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH, prx, prx * GQ, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#6a524a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,210,.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ring(ctx, p.x, p.y - 0.4, prx, prx * GQ, 'rgba(214,160,106,.25)', 1);

    // шипы делятся на задние и передние: купол рисуется между ними
    function spike(ang, front) {
      const bx = p.x + Math.cos(ang) * r0;
      const by = p.y - baseH - domeH * 0.44 + Math.sin(ang) * r0 * GQ;
      const tx = p.x + Math.cos(ang) * r1;
      const ty = by + Math.sin(ang) * (r1 - r0) * GQ - (5 + ramp * 2) -
        (front ? 0 : 1.5);
      uBar(ctx, bx, by, tx, ty, 2.4 + ramp * 0.9, '#3f3230');
      uBar(ctx, bx, by - 0.6, tx, ty - 0.6, 0.8, '#8a7060');
      spot(ctx, tx, ty, 1.1 + ramp * 0.4, L >= 6 ? '#e0b07a' : '#b89068');
    }
    for (let i = 0; i < n; i++) {
      const ang = i * Math.PI * 2 / n + 0.25;
      if (Math.sin(ang) <= 0) spike(ang, false);
    }

    // купол из четырёх слоёв, каждый уже предыдущего
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const ry = domeH * (0.62 - t * 0.2);
      const rx = (13 + ramp * 2.4) * (1 - t * 0.26);
      const yy = p.y - baseH - 2 - domeH * t * 0.62;
      ctx.fillStyle = i === 3 ? '#7a6054' : (i === 2 ? '#6e554c' : '#5e463f');
      ctx.beginPath();
      ctx.ellipse(p.x, yy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,210,.16)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const ang = i * Math.PI * 2 / n + 0.25;
      if (Math.sin(ang) > 0) spike(ang, true);
    }

    // центральный шип-коронка: 1 на L1, 3 с 9 уровня
    const topY = p.y - baseH - domeH * 0.7;
    uBar(ctx, p.x, topY, p.x, topY - (9 + ramp * 5), 2.2, '#3f3230');
    spot(ctx, p.x, topY - (9 + ramp * 5), 1.2, L >= 15 ? PAL.gold : '#d6a06a');
    if (L >= 9) {
      for (let s = -1; s <= 1; s += 2) {
        uBar(ctx, p.x + s * 3.4, topY + 1, p.x + s * 7, topY - 7 - ramp * 3,
          1.6, '#3f3230');
        spot(ctx, p.x + s * 7, topY - 7 - ramp * 3, 0.9, '#d6a06a');
      }
    }

    // 3+: заклёпки по ободу
    if (L >= 3) {
      const rb = prx - 2;
      for (let i = 0; i < 6; i++) {
        const ang = i * Math.PI / 3 + 0.3;
        spot(ctx, p.x + Math.cos(ang) * rb, p.y - baseH - 2.4 +
          Math.sin(ang) * rb * GQ, 0.8, '#c8a078');
      }
    }

    // 9+: клетка-рёбра над куполом, ядро внутри
    if (L >= 9) {
      ctx.strokeStyle = 'rgba(200,160,120,.45)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.ellipse(p.x, p.y - baseH - domeH * 0.34,
          8 + i * 2.2, domeH * 0.72, 0, Math.PI * 1.04, Math.PI * 1.96);
      }
      ctx.stroke();
      spot(ctx, p.x, p.y - baseH - domeH * 0.74, 1.5,
        L >= 15 ? PAL.gold : 'rgba(255,190,120,.75)');
    }

    // 12+: второй ряд коротких шипов у основания
    if (L >= 12) {
      for (let i = 0; i < 6; i++) {
        const ang = i * Math.PI / 3 + 0.55;
        const bx = p.x + Math.cos(ang) * (11 + ramp * 2);
        const by = p.y - baseH - 2 + Math.sin(ang) * 6 * GQ;
        uBar(ctx, bx, by, bx + Math.cos(ang) * 4.6, by + Math.sin(ang) * 2.4 * GQ - 2,
          1.5, '#4a3a36');
      }
    }

    // 15+: золотое ядро, 18+: тёплое кольцо у грунта
    if (L >= 15) {
      ring(ctx, p.x, p.y - baseH - domeH * 0.74, 3.4, 2.4, 'rgba(255,207,74,.6)', 0.9);
    }
    if (L >= 18) {
      ring(ctx, p.x, p.y - baseH + 0.8, 13 + ramp * 3,
        (13 + ramp * 3) * GQ, 'rgba(214,160,106,.35)', 1);
    }
  }

  /* --- Залповая башня: наклонная А-рама с тройным пакетом труб ---
     Силуэт строится вокруг наклона: раскосы, шарнир и три трубы разной
     длины смотрят в сторону цели. База низкая, вся масса — вверху. */
  function drawFirecracker(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const baseH = 6 + ramp * 3;
    const mastH = 28 + ramp * 18;
    const hingeY = p.y - baseH - mastH;
    let dx = a.x * 0.62;
    let dy = a.y * 0.42 - 1;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;

    bPrep(ctx, b, 1.2);
    // низкая скошенная база с аммо-отсеком
    prism(ctx, b.x + 0.24, b.y + 0.24, b.x + b.w - 0.24, b.y + b.h - 0.24,
      0, baseH, '#7a6248', '#66513c', '#40342a');
    bKick(ctx, b, 0.24, 1.5, 'rgba(255,176,90,.42)');
    // тёмный настил на плите: рама и трубы не сливаются с песком
    const dA = P(b.x + 0.58, b.y + 0.58);
    const dB = P(b.x + b.w - 0.58, b.y + 0.58);
    const dC = P(b.x + b.w - 0.58, b.y + b.h - 0.58);
    const dD = P(b.x + 0.58, b.y + b.h - 0.58);
    ctx.fillStyle = 'rgba(62,46,32,.62)';
    diamond(ctx, { x: dA.x, y: dA.y - baseH }, { x: dB.x, y: dB.y - baseH },
      { x: dC.x, y: dC.y - baseH }, { x: dD.x, y: dD.y - baseH });
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,176,90,.24)';
    ctx.lineWidth = 1;
    diamond(ctx, { x: dA.x, y: dA.y - baseH }, { x: dB.x, y: dB.y - baseH },
      { x: dC.x, y: dC.y - baseH }, { x: dD.x, y: dD.y - baseH });
    ctx.stroke();
    const bd = P(b.x + 0.4, b.y + b.h - 0.4);
    const bc = P(b.x + b.w - 0.4, b.y + b.h - 0.4);
    poly(ctx, [
      { x: bd.x, y: bd.y - baseH },
      { x: bc.x, y: bc.y - baseH },
      { x: bc.x + 7, y: bc.y - baseH - 11 - ramp * 5 },
      { x: bd.x, y: bd.y - baseH - 11 - ramp * 5 }
    ], '#7d6549');

    // поворотный круг под рамой
    ring(ctx, p.x, p.y - baseH - 2, 15 + ramp * 4, (15 + ramp * 4) * GQ,
      '#3f3428', 2.2);
    ring(ctx, p.x, p.y - baseH - 2, 15 + ramp * 4, (15 + ramp * 4) * GQ,
      'rgba(255,176,90,.3)', 0.9);

    // А-рама: две ноги к шарниру и стяжка
    const lx = p.x - 18 - ramp * 5;
    const rx = p.x + 18 + ramp * 5;
    // тёмная панель между ногами: рама читается массой, а не парой палок
    poly(ctx, [
      { x: p.x, y: hingeY + 3 },
      { x: lx + 3, y: p.y - baseH - 1 },
      { x: rx - 3, y: p.y - baseH - 1 }
    ], 'rgba(56,42,30,.6)');
    uBar(ctx, lx, p.y - baseH - 1, p.x - 3, hingeY + 2, 4.8, '#4a3c30');
    uBar(ctx, rx, p.y - baseH - 1, p.x + 3, hingeY + 2, 4.8, '#4a3c30');
    uBar(ctx, lx + 2, p.y - baseH - 11, rx - 2, p.y - baseH - 11, 1.8, '#8a7050');
    uBar(ctx, lx + 8, p.y - baseH - 20 - ramp * 5,
      rx - 8, p.y - baseH - 14 - ramp * 3, 1.2, 'rgba(138,112,80,.5)');
    ring(ctx, p.x, p.y - baseH - 6, 6 + ramp * 1.4, (6 + ramp * 1.4) * GQ,
      '#3f3428', 3.2);
    ring(ctx, p.x, p.y - baseH - 6, 6 + ramp * 1.4, (6 + ramp * 1.4) * GQ,
      'rgba(255,176,90,.35)', 0.8);
    spot(ctx, p.x, hingeY + 1, 3.4, '#8a7050');

    // три трубы пакета: разная длина, лёгкий веер по nx
    for (let i = -1; i <= 1; i++) {
      const off = i * (7 + ramp * 2);
      const sx = p.x + nx * off - a.x * 2;
      const sy = hingeY + ny * off * 0.7 - a.y * 1.6;
      const len = 24 + ramp * 12 + (1 - Math.abs(i)) * 3;
      const tx = sx + dx * len;
      const ty = sy + dy * len;
      uBar(ctx, sx, sy, tx, ty, 7 + (i === 0 ? 1 : 0), '#4a3a30');
      uBar(ctx, sx, sy - 1.2, sx + dx * len * 0.84,
        sy + dy * len * 0.84 - 1.2, 2.5, i === 0 ? '#d8a060' : '#b07a4a');
      // обручи
      for (let k = 1; k <= 2; k++) {
        const u = k / 3;
        uBar(ctx, sx + dx * len * u - nx * 3.8, sy + dy * len * u - ny * 3.8,
          sx + dx * len * u + nx * 3.8, sy + dy * len * u + ny * 3.8,
          1.5, '#8a6a44');
      }
      // раструб
      poly(ctx, [
        { x: tx - nx * 6, y: ty - ny * 6 },
        { x: tx + nx * 6, y: ty + ny * 6 },
        { x: tx + dx * 5 + nx * 7.4, y: ty + dy * 5 + ny * 7.4 },
        { x: tx + dx * 5 - nx * 7.4, y: ty + dy * 5 - ny * 7.4 }
      ], '#332a20');
      spot(ctx, tx + dx * 3, ty + dy * 3, 2.1, 'rgba(255,210,130,.8)');
    }

    // барабаны с зарядами по бокам базы
    for (let s = -1; s <= 1; s += 2) {
      const tx = p.x + nx * s * (22 + ramp * 4);
      const ty = p.y - baseH - 6;
      ring(ctx, tx, ty, 6.4 + ramp * 1.4, (6.4 + ramp * 1.4) * GQ, '#3f3428', 3.8);
      ring(ctx, tx, ty, 6.4 + ramp * 1.4, (6.4 + ramp * 1.4) * GQ,
        'rgba(255,176,90,.35)', 0.9);
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2 + 0.4;
        spot(ctx, tx + Math.cos(ang) * 4.2, ty + Math.sin(ang) * 4.2 * GQ,
          1.1, '#d0a060');
      }
    }

    // фитиль сбоку шарнира
    ctx.strokeStyle = 'rgba(60,44,32,.9)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p.x - 3, hingeY + 1);
    ctx.quadraticCurveTo(p.x - 9, hingeY - 5, p.x - 7, hingeY - 10);
    ctx.stroke();
    if (L >= 5) spot(ctx, p.x - 7, hingeY - 10, 1.1,
      L >= 12 ? PAL.gold : 'rgba(255,190,110,.85)');

    // 6+: вторая стойка ракет на борту
    if (L >= 6) {
      for (let i = 0; i < 2; i++) {
        const sx = p.x - 15 - i * 4;
        const sy = p.y - baseH - 8 - i * 2;
        uBar(ctx, sx, sy, sx + dx * 10, sy + dy * 10, 2.2, '#4a3a30');
        poly(ctx, [
          { x: sx + dx * 10, y: sy + dy * 10 },
          { x: sx + dx * 12 + nx * 2, y: sy + dy * 12 + ny * 2 },
          { x: sx + dx * 12 - nx * 2, y: sy + dy * 12 - ny * 2 }
        ], '#c8a060');
      }
    }

    // 9+: кожух шарнира и натяжные тросы
    if (L >= 9) {
      ring(ctx, p.x, hingeY + 1, 4.6 + ramp, (4.6 + ramp) * 0.8, '#2f2820', 2.6);
      ring(ctx, p.x, hingeY + 1, 4.6 + ramp, (4.6 + ramp) * 0.8,
        'rgba(255,176,90,.4)', 0.9);
      ctx.strokeStyle = 'rgba(60,48,36,.65)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(p.x - 2, hingeY + 4);
      ctx.lineTo(p.x - 12, p.y - baseH - 2);
      ctx.moveTo(p.x + 2, hingeY + 4);
      ctx.lineTo(p.x + 12, p.y - baseH - 2);
      ctx.stroke();
    }

    // 12+: третья труба-довесок и золотые кольца
    if (L >= 12) {
      const sx = p.x - a.x * 3 - nx * 8;
      const sy = hingeY - a.y * 2 - ny * 6;
      uBar(ctx, sx, sy, sx + dx * 16, sy + dy * 16, 3.4, '#3f3428');
      spot(ctx, sx + dx * 16, sy + dy * 16, 1.2, 'rgba(255,220,150,.8)');
      ring(ctx, p.x, hingeY + 1, 7 + ramp, (7 + ramp) * 0.8,
        'rgba(255,207,74,.45)', 0.9);
    }

    // 16+: высокий прицел на шарнире
    if (L >= 16) {
      uBar(ctx, p.x + nx * 5, hingeY + 1, p.x + nx * 7, hingeY - 10, 1.2, '#8a7050');
      spot(ctx, p.x + nx * 7, hingeY - 10, 1, PAL.gold);
    }

    // 19-20: корона пакета — золотая дуга и белое ядро
    if (L >= 19) {
      ring(ctx, p.x, hingeY - 2, 10 + ramp * 2, (10 + ramp * 2) * 0.7,
        'rgba(255,232,170,.45)', 1);
      spot(ctx, p.x, hingeY - 2, 1.3, 'rgba(255,252,232,.9)');
    }
  }

  /* --- ядро-артиллерия центра (thweapon) ---
     Не отдельная карточка: модуль на командном центре. До 5 уровня центра
     его нет; дальше — тесла-катушки, с 10 — сдвоенные орудия, с 15 —
     плазменное ядро с орбитальным кольцом. */
  function drawTHWeapon(ctx, b, lvl) {
    const L = bLevel(lvl);
    if (L < 5) return;
    const ramp = bRamp(lvl);
    // Угловая площадка на переднем правом углу пятна: не спорит с куполом
    // центра и читается как отдельный боевой модуль.
    const p = P(b.x + b.w - 0.34, b.y + b.h - 0.34);
    const baseH = 9 + ramp * 4;
    const topY = p.y - baseH - 20;

    // опорная тумба модуля
    groundEllipse(ctx, p.x, p.y + 1, 11, 11 * GQ, 'rgba(60,28,14,.16)');
    ctx.fillStyle = '#4a545a';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH, 9.5, 9.5 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5f6b72';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH - 1.5, 7.5, 7.5 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, p.x, p.y - baseH, 9.5, 9.5 * GQ, 'rgba(255,207,74,.4)', 1);

    if (L < 10) {
      // тесла-катушки на крыше: два изолятора и дуга
      for (let i = -1; i <= 1; i += 2) {
        const x = p.x + i * 5.5;
        ctx.fillStyle = '#4a545a';
        ctx.fillRect(x - 1.6, topY - 8, 3.2, 9);
        ring(ctx, x, topY - 9, 4, 2, i < 0 ? PAL.cold : PAL.gold, 1.1);
        ring(ctx, x, topY - 13, 2.8, 1.4, 'rgba(127,233,255,.5)', 0.9);
      }
      ctx.strokeStyle = 'rgba(127,233,255,.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, topY - 11);
      ctx.quadraticCurveTo(p.x, topY - 16, p.x + 4, topY - 11);
      ctx.stroke();
      spot(ctx, p.x, topY - 15, 1.3, PAL.glass);
      return;
    }

    // сдвоенные орудия: поворотная платформа с длинными стволами
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    ring(ctx, p.x, p.y - baseH - 1, 13, 13 * GQ, 'rgba(40,50,56,.6)', 1.2);
    ctx.fillStyle = '#7f8b92';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH - 9, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa7ad';
    ctx.beginPath();
    ctx.ellipse(p.x - 1, p.y - baseH - 11, 6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const oy = p.y - baseH - 13;
    const barrels = L >= 16 ? 3 : 2;
    for (let i = 0; i < barrels; i++) {
      const off = (i - (barrels - 1) / 2) * 6;
      const ox = p.x + nx * off;
      const yy = oy + ny * off * 0.7;
      const len = 20 + ramp * 8;
      uBar(ctx, ox, yy, ox + a.x * len, yy + a.y * len * 0.8,
        3.4 + ramp * 0.8, '#3f474c');
      uBar(ctx, ox, yy - 0.8, ox + a.x * len * 0.9, yy + a.y * len * 0.72 - 0.8,
        1.1, '#b8c2cc');
      spot(ctx, ox + a.x * len, yy + a.y * len * 0.8, 1.8, PAL.glass);
    }

    if (L >= 15) {
      // плазменное ядро и орбитальное кольцо
      const cy2 = oy - 12;
      ring(ctx, p.x, cy2, 11, 4.5, L >= 18 ? 'rgba(255,207,74,.65)' : 'rgba(127,233,255,.55)', 1.2);
      spot(ctx, p.x, cy2, 4.2, L >= 18 ? PAL.gold : '#9fe8ff');
      spot(ctx, p.x - 1, cy2 - 1, 2.4, 'rgba(255,255,255,.7)');
      ring(ctx, p.x, cy2, 15, 3.8, 'rgba(200,240,255,.3)', 0.9);
    }
  }
  /* ============================ ЭКОНОМИКА ============================ */

  /* --- плазменный бур: вышка с шнеком и сферой-накопителем --- */
  function drawDarkDrill(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 6 + ramp * 3;
    const towerH = 26 + ramp * 12;

    bPrep(ctx, b, 1.05);
    bPlinth(ctx, b, 0.14, baseH, '#5a4a62');
    bKick(ctx, b, 0.14, 1.3, 'rgba(199,125,255,.35)');

    // шнек: три сужающихся кольца вниз
    const drillX = b.x + 0.85;
    const drillY = b.y + b.h - 0.55;
    const dp = P(drillX, drillY);
    ctx.strokeStyle = '#3f3548';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.22;
      ctx.beginPath();
      ctx.ellipse(dp.x, dp.y - baseH - 2 + i * 2.4, 5 * k, 2.2 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    uBar(ctx, dp.x, dp.y - baseH - 4, dp.x, dp.y - baseH - 20 - ramp * 8,
      2.2, '#6a5a74');
    spot(ctx, dp.x, dp.y - baseH - 21 - ramp * 8, 2.4, PAL.violet);

    // вышка: четыре ноги и площадка
    const legX = 0.26;
    const legY = 0.26;
    const legs = [
      [cx - legX, cy - legY], [cx + legX, cy - legY],
      [cx - legX, cy + legY], [cx + legX, cy + legY]
    ];
    const top = { x: p.x, y: p.y - baseH - towerH };
    for (let i = 0; i < legs.length; i++) {
      const q = P(legs[i][0], legs[i][1]);
      uBar(ctx, q.x, q.y - baseH, top.x + (i % 2 ? 4 : -4),
        top.y + 3, 1.8, i < 2 ? '#5c4a66' : '#8a6a9a');
    }
    // поперечины
    ctx.strokeStyle = 'rgba(199,125,255,.3)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      const yy = p.y - baseH - towerH * (i / 3);
      const ww = 9 - i * 1.4;
      ctx.moveTo(p.x - ww, yy);
      ctx.lineTo(p.x + ww, yy + 2.4);
    }
    ctx.stroke();

    // накопитель: сфера в рамке
    spot(ctx, top.x, top.y - 2, 6.5 + ramp * 1.6, 'rgba(60,42,74,.9)');
    spot(ctx, top.x, top.y - 3, 5 + ramp * 1.2, L >= 14 ? '#e0b0ff' : '#b06adf');
    spot(ctx, top.x - 1.4, top.y - 4.4, 2, 'rgba(255,255,255,.45)');
    ring(ctx, top.x, top.y - 2, 8 + ramp * 2, (8 + ramp * 2) * 0.7,
      L >= 10 ? 'rgba(255,207,74,.45)' : 'rgba(199,125,255,.5)', 1);

    // труба к баку
    ctx.strokeStyle = '#4a3c54';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(p.x + 8, p.y - baseH - 6);
    ctx.lineTo(p.x + 18, p.y - baseH - 6);
    ctx.lineTo(p.x + 18, p.y - baseH - 1);
    ctx.stroke();
    // бак
    ctx.fillStyle = '#4f3f5c';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(p.x + 12, p.y - baseH - 14, 12, 13, 3);
    else ctx.rect(p.x + 12, p.y - baseH - 14, 12, 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(199,125,255,.55)';
    ctx.fillRect(p.x + 14, p.y - baseH - 8, 8, 4);
    spot(ctx, p.x + 21, p.y - baseH - 12, 1, PAL.violet);

    if (L >= 6) {
      // второй шнек и защитный кожух
      uBar(ctx, dp.x - 8, dp.y - baseH - 2, dp.x - 8, dp.y - baseH - 13, 1.4, '#5c4a66');
      ring(ctx, dp.x, dp.y - baseH - 2, 6.5, 2.6, 'rgba(199,125,255,.3)', 0.8);
    }
    if (L >= 10) {
      bWindowBand(ctx, b, 0.34, baseH, 8, 2);
      ring(ctx, top.x, top.y - 2, 11, 3.4, 'rgba(199,125,255,.35)', 0.9);
    }
    if (L >= 14) {
      exhaustStack(ctx, p.x - 15, p.y - baseH - 1, 9, 3.2, 'rgba(199,125,255,.24)');
      spot(ctx, top.x, top.y - 2, 1.4, 'rgba(255,255,255,.9)');
    }
    if (L >= 18) {
      spire(ctx, top.x, top.y - 10, 6, PAL.gold);
      ring(ctx, dp.x, dp.y - baseH - 1, 8, 3, 'rgba(255,207,74,.4)', 1);
    }
  }

  /* --- хранилище плазмы: два вертикальных сосуда под давлением --- */
  function drawDarkStorage(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 5 + ramp * 2;
    const tankH = 26 + ramp * 14;

    bPrep(ctx, b, 1.05);
    bPlinth(ctx, b, 0.1, baseH, '#4c4054');
    bKick(ctx, b, 0.1, 1.3, 'rgba(176,106,223,.4)');

    function vessel(vx, vy, w, h, bright) {
      const q = P(vx, vy);
      // корпус сосуда
      ctx.fillStyle = bright ? '#584568' : '#463a52';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(q.x - w, q.y - baseH - h, w * 2, h, w * 0.55);
      else ctx.rect(q.x - w, q.y - baseH - h, w * 2, h);
      ctx.fill();
      // плазма внутри
      const lvlK = 0.35 + ramp * 0.35;
      ctx.fillStyle = 'rgba(176,106,223,.62)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(q.x - w * 0.7, q.y - baseH - h + h * (1 - lvlK),
          w * 1.4, h * lvlK - 2, w * 0.4);
      } else {
        ctx.rect(q.x - w * 0.7, q.y - baseH - h + h * (1 - lvlK),
          w * 1.4, h * lvlK - 2);
      }
      ctx.fill();
      // светлая кромка и блик
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fillRect(q.x - w * 0.55, q.y - baseH - h + 3, w * 0.3, h * 0.5);
      // обручи
      ctx.strokeStyle = '#8a7a96';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 1; i <= 3; i++) {
        const yy = q.y - baseH - h + h * i / 4;
        ctx.moveTo(q.x - w, yy);
        ctx.lineTo(q.x + w, yy);
      }
      ctx.stroke();
      // горловина
      prism(ctx, vx - 0.08, vy - 0.08, vx + 0.08, vy + 0.08,
        baseH + h, 3, '#9a8aa8', '#6f5f7c', '#4a3c54');
      spot(ctx, q.x, q.y - baseH - h - 4, 1.2, PAL.violet);
    }
    vessel(cx - 0.34, cy + 0.06, 9 + ramp * 1.6, tankH, true);
    vessel(cx + 0.38, cy - 0.12, 7 + ramp * 1.2, tankH * 0.82, false);

    // связка труб и манометр
    ctx.strokeStyle = '#4a3c54';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 4, p.y - baseH - 3);
    ctx.lineTo(p.x + 4, p.y - baseH - 3);
    ctx.lineTo(p.x + 4, p.y - baseH - 14);
    ctx.stroke();
    ring(ctx, p.x - 11, p.y - baseH - 16, 3, 3 * GQ, 'rgba(199,125,255,.6)', 1);
    spot(ctx, p.x - 11, p.y - baseH - 16, 1, PAL.gold);

    if (L >= 5) {
      // лестница и вентиляция
      ctx.strokeStyle = 'rgba(154,138,168,.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = p.y - baseH - 5 - i * 4;
        ctx.moveTo(p.x - 18, yy);
        ctx.lineTo(p.x - 12, yy);
      }
      ctx.stroke();
    }
    if (L >= 9) {
      exhaustStack(ctx, p.x + 18, p.y - baseH - 1, 9, 3.4, 'rgba(199,125,255,.25)');
      bWindowBand(ctx, b, 0.24, baseH, 6, 3);
    }
    if (L >= 13) {
      ring(ctx, p.x, p.y - baseH - 1.5, 20 + ramp * 3,
        (20 + ramp * 3) * GQ, 'rgba(255,207,74,.24)', 1);
      // третий малый сосуд
      vessel(cx, cy + 0.5, 4.5, tankH * 0.5, false);
    }
    if (L >= 17) {
      antennaMast(ctx, p.x + 13, p.y - baseH - 6, 9, PAL.metalLight, PAL.violet);
      spot(ctx, p.x, p.y - baseH - tankH - 6, 1.4, PAL.gold);
    }
    if (L >= 20) {
      ring(ctx, p.x, p.y - baseH - tankH * 0.5, 22, 8,
        'rgba(224,176,255,.35)', 1.1);
    }
  }

  /* ============================== АРМИЯ ==============================
     Общий корпус казарм/цехов: цоколь, корпус, кровля, ворота, флаг.
     Пропсы поверх делают тип узнаваемым (мишени, горн, кран, доки). */

  function hallShell(ctx, b, lvl, c) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 5 + ramp * 2;
    const hullH = 17 + ramp * 6;
    const inset = 0.2;

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.12, baseH, c.base || PAL.stoneLight);
    bKick(ctx, b, 0.12, 1.3, c.kick || 'rgba(70,224,200,.3)');
    box(ctx, b.x + inset, b.y + inset, b.x + b.w - inset, b.y + b.h - inset,
      baseH + hullH, c.wall);

    // передняя грань: ворота и светлая панель
    const D = P(b.x + inset, b.y + b.h - inset);
    const C = P(b.x + b.w - inset, b.y + b.h - inset);
    const B = P(b.x + b.w - inset, b.y + inset);
    const dw = 0.24;
    patchPx(ctx, D, C, hullH, 0.5 - dw, 0.5 + dw, 1.2, 9 + ramp * 2.5,
      shade(c.wall, -0.42));
    patchPx(ctx, D, C, hullH, 0.5 - dw * 0.72, 0.5 + dw * 0.72,
      1.6, 8 + ramp * 2.2, c.door || '#3a2a1f');
    patchPx(ctx, D, C, hullH, 0.12, 0.26, 10, 13, c.glow || PAL.glass);
    patchPx(ctx, D, C, hullH, 0.74, 0.88, 10, 13, c.glow || PAL.glass);
    patchPx(ctx, C, B, hullH, 0.18, 0.44, 10, 13, c.glow || PAL.glass);

    // кровля: плоская плита с выносом и гребнем
    prism(ctx, b.x + 0.12, b.y + 0.12, b.x + b.w - 0.12, b.y + b.h - 0.12,
      baseH + hullH, 3.2 + ramp * 1.6,
      mix(c.roof, '#ffe1b4', 0.14), mix(c.roof, '#ffd2a0', 0.05), shade(c.roof, -0.3));
    const ry = p.y - baseH - hullH - 4;
    ctx.strokeStyle = 'rgba(255,236,200,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - b.w * 17, ry + 4);
    ctx.lineTo(p.x + b.w * 17, ry + 4);
    ctx.stroke();

    // флагшток
    if (c.flag !== null) {
      const fp = P(b.x + b.w - 0.3, b.y + 0.26);
      pennant(ctx, fp.x, fp.y - baseH - hullH, 18 + ramp * 6,
        c.flag || PAL.cold, 7);
    }

    if (L >= 4) bWindowBand(ctx, b, 0.26, baseH, hullH, 2);
    if (L >= 8) bRibs(ctx, b, 0.24, baseH, hullH, 4, 'rgba(40,48,52,.26)');
    if (L >= 12) {
      exhaustStack(ctx, p.x + 11, p.y - baseH - 1, 8, 3.4,
        c.smoke || 'rgba(226,213,180,.2)');
    }
    if (L >= 16) {
      antennaMast(ctx, p.x - 11, p.y - baseH - hullH - 2, 9 + ramp * 4,
        PAL.metalLight, c.glow || PAL.cyan);
    }
    if (L >= 19) {
      ring(ctx, p.x, p.y - baseH - hullH - 5, 7, 3, 'rgba(255,207,74,.45)', 1);
    }
    return { p: p, baseH: baseH, hullH: hullH, L: L, ramp: ramp };
  }

  function drawTrainHall(ctx, b, lvl, dark) {
    const c = dark
      ? { wall: '#4b3f58', roof: '#6a567c', door: '#241c2c', glow: '#c28fe8',
          base: '#5c4a66', flag: PAL.violet, kick: 'rgba(194,143,232,.34)' }
      : { wall: '#7a654a', roof: '#a0805a', door: '#3a2c1e', glow: PAL.glass,
          base: '#9a7a58', flag: PAL.elixir, kick: 'rgba(209,176,122,.34)' };
    const s = hallShell(ctx, b, lvl, c);
    const p = s.p;

    // мишени на стойках у ворот: сразу видно, что тут тренируют
    const tp = P(b.x + 0.36, b.y + b.h - 0.3);
    uBar(ctx, tp.x, tp.y - s.baseH, tp.x, tp.y - s.baseH - 11, 1, '#4c565c');
    ring(ctx, tp.x, tp.y - s.baseH - 12, 3.6, 3.6 * GQ,
      s.L >= 10 ? PAL.gold : PAL.amber, 1.2);
    spot(ctx, tp.x, tp.y - s.baseH - 12, 1.1, PAL.roof);

    // ящики и стойка оружия
    uBox(ctx, p.x + 10, p.y - s.baseH - 5, 7, 5, 1, '#5a4a3a');
    uBox(ctx, p.x + 11, p.y - s.baseH - 9, 5, 4, 1, '#6a5844');
    ctx.strokeStyle = '#3f4a50';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x - 17, p.y - s.baseH - 2);
    ctx.lineTo(p.x - 17, p.y - s.baseH - 12);
    ctx.moveTo(p.x - 14, p.y - s.baseH - 12);
    ctx.lineTo(p.x - 14, p.y - s.baseH - 2);
    ctx.stroke();

    if (s.L >= 6) {
      // второй этаж-балкон и прожектор
      prism(ctx, b.x + 0.28, b.y + 0.28, b.x + b.w - 0.28, b.y + 0.5,
        s.baseH + s.hullH + 3, 2, PAL.metalLight, PAL.metal, PAL.metalDark);
      spot(ctx, p.x - 12, p.y - s.baseH - s.hullH - 7, 1.3, c.glow);
    }
    if (s.L >= 10) {
      // вымпелы над воротами
      for (let i = -1; i <= 1; i += 2) {
        const fp = P(b.x + b.w / 2 + i * 0.28, b.y + b.h - 0.18);
        pennant(ctx, fp.x, fp.y - s.baseH - 4, 9, i < 0 ? PAL.gold : c.glow, 4);
      }
    }
    if (s.L >= 14) {
      // спаренные прожекторы и щит на кровле
      spot(ctx, p.x + 14, p.y - s.baseH - s.hullH - 7, 1.5, PAL.gold);
      uBox(ctx, p.x - 6, p.y - s.baseH - s.hullH - 6, 12, 2, 0.6, PAL.gold);
    }
    if (s.L >= 18) {
      ring(ctx, p.x, p.y - s.baseH - s.hullH - 6, 9, 3.4,
        'rgba(255,207,74,.5)', 1.1);
    }
  }

  /* --- питомник: низкий дом с большим куполом и следом лапы --- */
  function drawPetHouse(ctx, b, lvl) {
    const s = hallShell(ctx, b, lvl, {
      wall: '#6a4a58', roof: '#8a5468', door: '#2c1e24',
      glow: '#ffb0cc', base: '#8a6a78', flag: PAL.amber,
      kick: 'rgba(215,127,160,.34)', smoke: 'rgba(255,200,220,.2)'
    });
    const p = s.p;
    const cx = b.x + b.w / 2;

    // большой округлый купол над корпусом
    const drx = 13 + s.ramp * 4;
    const topY = p.y - s.baseH - s.hullH - 4;
    ctx.fillStyle = '#7d4e60';
    ctx.beginPath();
    ctx.ellipse(p.x, topY, drx, drx * 0.72, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,235,.18)';
    ctx.beginPath();
    ctx.ellipse(p.x - drx * 0.3, topY - drx * 0.3, drx * 0.3, drx * 0.2,
      0, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, p.x, topY, drx, drx * 0.26, 'rgba(255,176,204,.5)', 1.1);

    // след лапы на фасаде: 4 пальца + подушечка
    const D = P(cx, b.y + b.h - 0.2);
    const ly = D.y - s.baseH - 9;
    const paw = s.L >= 9 ? PAL.gold : 'rgba(255,230,240,.85)';
    spot(ctx, D.x, ly + 2.2, 2.1, paw);
    for (let i = -1; i <= 1; i++) {
      spot(ctx, D.x + i * 3.2, ly - 1.6, 1.05, paw);
    }
    spot(ctx, D.x - 4.6, ly + 0.6, 1.0, paw);
    spot(ctx, D.x + 4.6, ly + 0.6, 1.0, paw);

    // вольер: низкий заборчик из стоек
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const q = P(b.x + 0.18 + i * (b.w - 0.36) / 4, b.y + b.h - 0.12);
      ctx.moveTo(q.x, q.y - s.baseH);
      ctx.lineTo(q.x, q.y - s.baseH - 5);
    }
    ctx.stroke();

    // миски и мяч во дворе
    spot(ctx, p.x - 14, p.y - s.baseH + 1, 2.4, '#8a7a6a');
    spot(ctx, p.x - 14, p.y - s.baseH + 1, 1.5, '#4c565c');
    spot(ctx, p.x + 16, p.y - s.baseH + 1, 2.2, PAL.amber);
    spot(ctx, p.x + 16, p.y - s.baseH, 1.2, 'rgba(255,255,255,.5)');

    if (s.L >= 5) {
      // второй купол-будка и слуховое окно
      const q = P(b.x + 0.4, b.y + 0.38);
      ctx.fillStyle = '#6a4454';
      ctx.beginPath();
      ctx.ellipse(q.x, q.y - s.baseH - s.hullH - 4, 7, 4, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      spot(ctx, p.x - drx * 0.5, topY - 3, 1.2, PAL.amber);
    }
    if (s.L >= 9) {
      // труба с «сердечком» пара и скворечник-дрон
      exhaustStack(ctx, p.x + 15, topY + 2, 9, 3.2, 'rgba(255,200,220,.24)');
      uBar(ctx, p.x - 15, topY + 2, p.x - 15, topY - 8, 1.4, '#5c4a3a');
      uBox(ctx, p.x - 18, topY - 8, 6, 4, 0.6, '#7a5a48');
    }
    if (s.L >= 13) {
      ring(ctx, p.x, topY, drx + 2, (drx + 2) * 0.28,
        'rgba(255,207,74,.35)', 1);
      spot(ctx, p.x, topY - drx * 0.6, 1.4, PAL.gold);
    }
    if (s.L >= 17) {
      spire(ctx, p.x, topY - drx * 0.5, 8, PAL.gold);
      bKick(ctx, b, 0.24, s.hullH + s.baseH - 2, 'rgba(255,207,74,.26)');
    }
  }

  /* --- оружейная: горн, труба, наковальня и стойка --- */
  function drawBlacksmith(ctx, b, lvl) {
    const s = hallShell(ctx, b, lvl, {
      wall: '#5f5244', roof: '#7d6a56', door: '#2a2018',
      glow: '#ffb060', base: '#8a7a66', flag: PAL.amber,
      kick: 'rgba(200,161,92,.36)', smoke: 'rgba(226,190,150,.24)'
    });
    const p = s.p;
    const cx = b.x + b.w / 2;

    // высокий дымоход у задней стены
    const ch = P(cx + 0.5, b.y + 0.22);
    exhaustStack(ctx, ch.x, ch.y - s.baseH - s.hullH - 2, 14 + s.ramp * 6, 5,
      'rgba(255,176,96,.22)');

    // горн: светящееся устье на передней грани
    const D = P(cx, b.y + b.h - 0.2);
    ctx.fillStyle = '#2c221a';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(D.x - 6, D.y - s.baseH - 9, 12, 8, 2);
    else ctx.rect(D.x - 6, D.y - s.baseH - 9, 12, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,150,70,.7)';
    ctx.beginPath();
    ctx.ellipse(D.x, D.y - s.baseH - 5, 4.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    spot(ctx, D.x, D.y - s.baseH - 5, 1.6, 'rgba(255,236,180,.8)');

    // наковальня на пне
    const ap = P(b.x + b.w - 0.4, b.y + b.h - 0.36);
    uBox(ctx, ap.x - 3, ap.y - s.baseH - 4, 6, 4, 0.8, '#4a3a2c');
    poly(ctx, [
      { x: ap.x - 5, y: ap.y - s.baseH - 4 },
      { x: ap.x + 4, y: ap.y - s.baseH - 4 },
      { x: ap.x + 3, y: ap.y - s.baseH - 7 },
      { x: ap.x - 4, y: ap.y - s.baseH - 7 }
    ], '#5c6670');
    spot(ctx, ap.x - 0.5, ap.y - s.baseH - 7, 0.7, PAL.amber);

    // стойка с инструментом
    ctx.strokeStyle = '#4c565c';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(p.x + 14, p.y - s.baseH - 1);
    ctx.lineTo(p.x + 14, p.y - s.baseH - 13);
    ctx.moveTo(p.x + 10, p.y - s.baseH - 10);
    ctx.lineTo(p.x + 18, p.y - s.baseH - 10);
    ctx.stroke();
    spot(ctx, p.x + 11, p.y - s.baseH - 11, 1.2, PAL.gold);

    if (s.L >= 5) {
      // искры
      spot(ctx, D.x - 8, D.y - s.baseH - 2, 0.8, 'rgba(255,200,120,.7)');
      spot(ctx, D.x + 9, D.y - s.baseH - 3, 0.7, 'rgba(255,200,120,.55)');
    }
    if (s.L >= 9) {
      // вывеска-молот над воротами
      const sp = P(cx, b.y + b.h - 0.2);
      uBar(ctx, sp.x, sp.y - s.baseH - 13, sp.x, sp.y - s.baseH - 17, 1.2, PAL.gold);
      uBox(ctx, sp.x - 3, sp.y - s.baseH - 19, 6, 3, 0.6, PAL.gold);
    }
    if (s.L >= 13) {
      // закалочный бак и пар
      ctx.fillStyle = '#3f4a50';
      ctx.beginPath();
      ctx.ellipse(p.x - 16, p.y - s.baseH - 3, 4.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,220,230,.25)';
      ctx.beginPath();
      ctx.ellipse(p.x - 16, p.y - s.baseH - 7, 3.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s.L >= 17) {
      ring(ctx, D.x, D.y - s.baseH - 5, 6.5, 2.6,
        'rgba(255,207,74,.45)', 1);
      spot(ctx, p.x, p.y - s.baseH - s.hullH - 8, 1.3, PAL.gold);
    }
  }

  /* --- сборочный цех: кран-балка, гусеницы, искры --- */
  function drawWorkshop(ctx, b, lvl) {
    const s = hallShell(ctx, b, lvl, {
      wall: '#55604e', roof: '#6e7a62', door: '#22281e',
      glow: PAL.cold, base: '#7a8570', flag: PAL.cold,
      kick: 'rgba(185,201,154,.34)', smoke: 'rgba(200,220,190,.2)'
    });
    const p = s.p;

    // кран-балка над кровлей
    const topY = p.y - s.baseH - s.hullH - 6;
    ctx.strokeStyle = '#5c6670';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, topY);
    ctx.lineTo(p.x + 18, topY);
    ctx.moveTo(p.x - 14, topY);
    ctx.lineTo(p.x - 14, topY + 7);
    ctx.moveTo(p.x + 14, topY);
    ctx.lineTo(p.x + 14, topY + 7);
    ctx.stroke();
    ctx.strokeStyle = '#3f474c';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x + 6, topY);
    ctx.lineTo(p.x + 6, topY + 10 + s.ramp * 4);
    ctx.stroke();
    // крюк с блоком
    uBox(ctx, p.x + 3.4, topY + 9 + s.ramp * 4, 5, 3, 0.6, '#8a6a50');
    spot(ctx, p.x + 9, topY - 1, 1.1, PAL.cold);

    // недостроенная гусеничная машина у ворот
    const mp = P(b.x + 0.42, b.y + b.h - 0.42);
    uBox(ctx, mp.x - 7, mp.y - s.baseH - 6, 14, 6, 1.4, '#5a6650');
    uBox(ctx, mp.x - 5, mp.y - s.baseH - 11, 8, 5, 1, '#6e7a62');
    spot(ctx, mp.x - 4, mp.y - s.baseH - 2, 2.2, '#2c3328');
    spot(ctx, mp.x + 3, mp.y - s.baseH - 2, 2.2, '#2c3328');
    ctx.strokeStyle = 'rgba(70,224,200,.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(mp.x - 5, mp.y - s.baseH - 8);
    ctx.lineTo(mp.x + 2, mp.y - s.baseH - 8);
    ctx.stroke();

    // катушки кабеля
    ring(ctx, p.x + 16, p.y - s.baseH - 3, 4, 4 * GQ, '#8a7a5a', 2);
    ring(ctx, p.x + 16, p.y - s.baseH - 3, 1.6, 1.6 * GQ, '#3f474c', 1);

    if (s.L >= 5) {
      // сварочный огонёк
      spot(ctx, mp.x + 5, mp.y - s.baseH - 10, 1, 'rgba(127,233,255,.9)');
      spot(ctx, mp.x + 5, mp.y - s.baseH - 10, 0.5, 'rgba(255,255,255,.9)');
    }
    if (s.L >= 9) {
      // вторая балка и лебёдка
      ctx.strokeStyle = '#7a8570';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 12, topY + 5);
      ctx.lineTo(p.x + 12, topY + 5);
      ctx.stroke();
      uBox(ctx, p.x - 3, topY + 1, 6, 3, 0.6, '#5c6670');
    }
    if (s.L >= 13) {
      bWindowBand(ctx, b, 0.3, s.baseH, s.hullH, 3);
      exhaustStack(ctx, p.x + 17, p.y - s.baseH - 1, 8, 3.2, 'rgba(185,201,154,.24)');
    }
    if (s.L >= 17) {
      spire(ctx, p.x - 18, topY - 1, 6, PAL.gold);
      ring(ctx, p.x + 6, topY + 12 + s.ramp * 4, 3.2, 1.6,
        'rgba(255,207,74,.4)', 0.9);
    }
  }

  /* --- генератор аномалий / резонатор плазмы: купол и сфера --- */
  function drawSpellFactory(ctx, b, lvl, dark) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 5 + ramp * 2;
    const hullH = 14 + ramp * 5;
    const c = dark
      ? { wall: '#544064', dome: '#6c5480', glow: '#c28fe8', base: '#5c4a6a' }
      : { wall: '#456a86', dome: '#5f88a4', glow: '#8fd0ff', base: '#5f7d90' };

    bPrep(ctx, b, 1.1);
    bPlinth(ctx, b, 0.12, baseH, c.base);
    bKick(ctx, b, 0.12, 1.3, dark ? 'rgba(194,143,232,.36)' : 'rgba(143,208,255,.36)');
    box(ctx, b.x + 0.24, b.y + 0.24, b.x + b.w - 0.24, b.y + b.h - 0.24,
      baseH + hullH, c.wall);

    // купол из трёх дуг
    const drx = 17 + ramp * 4;
    const domeY = p.y - baseH - hullH;
    ctx.fillStyle = c.dome;
    ctx.beginPath();
    ctx.ellipse(p.x, domeY, drx, drx * 0.78, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath();
    ctx.ellipse(p.x - drx * 0.32, domeY - drx * 0.34, drx * 0.28,
      drx * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(194,143,232,.5)' : 'rgba(143,208,255,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, domeY, drx * 0.72, drx * 0.58, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ring(ctx, p.x, domeY, drx, drx * 0.16, dark ? PAL.violet : PAL.glass, 1.2);

    // сфера в проёме купола
    const orbY = domeY - drx * 0.34;
    spot(ctx, p.x, orbY, 6 + ramp * 1.6, 'rgba(30,38,46,.75)');
    spot(ctx, p.x, orbY - 0.5, 4.6 + ramp * 1.2,
      dark ? '#c28fe8' : (L >= 14 ? PAL.gold : '#9fe0ff'));
    spot(ctx, p.x - 1.2, orbY - 1.6, 2, 'rgba(255,255,255,.5)');
    ring(ctx, p.x, orbY, 9 + ramp * 2, (9 + ramp * 2) * 0.8,
      dark ? 'rgba(194,143,232,.4)' : 'rgba(143,208,255,.4)', 0.9);

    // трубы и колбы по бокам
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      const q = P(cx + s2 * 0.74, cy + 0.16);
      ctx.fillStyle = shade(c.wall, -0.18);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(q.x - 3.4, q.y - baseH - 12, 6.8, 12, 2);
      else ctx.rect(q.x - 3.4, q.y - baseH - 12, 6.8, 12);
      ctx.fill();
      ctx.fillStyle = dark ? 'rgba(194,143,232,.6)' : 'rgba(143,208,255,.6)';
      ctx.fillRect(q.x - 2, q.y - baseH - 9, 4, 5);
      ctx.strokeStyle = shade(c.wall, -0.3);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - baseH - 12);
      ctx.lineTo(q.x + s2 * 5, q.y - baseH - hullH + 1);
      ctx.stroke();
    }

    // вход
    const D = P(b.x + 0.24, b.y + b.h - 0.24);
    const C = P(b.x + b.w - 0.24, b.y + b.h - 0.24);
    patchPx(ctx, D, C, hullH, 0.46, 0.54, 1, 8, '#22282e');
    if (L >= 4) {
      patchPx(ctx, D, C, hullH, 0.14, 0.30, 8, 11, c.glow);
      patchPx(ctx, D, C, hullH, 0.70, 0.86, 8, 11, c.glow);
    }
    if (L >= 8) {
      ring(ctx, p.x, orbY, 12 + ramp * 2, (12 + ramp * 2) * 0.5,
        'rgba(255,207,74,.3)', 0.9);
      bRibs(ctx, b, 0.3, baseH, hullH, 4);
    }
    if (L >= 12) {
      // труба с паром и малый купол
      exhaustStack(ctx, p.x - 16, p.y - baseH - 1, 9, 3.4,
        dark ? 'rgba(194,143,232,.26)' : 'rgba(143,208,255,.24)');
      const q = P(b.x + 0.4, b.y + 0.4);
      ctx.fillStyle = shade(c.dome, -0.1);
      ctx.beginPath();
      ctx.ellipse(q.x, q.y - baseH - hullH - 2, 7, 4, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (L >= 16) {
      ring(ctx, p.x, orbY, 15 + ramp * 2, (15 + ramp * 2) * 0.4,
        'rgba(255,207,74,.35)', 1);
      spot(ctx, p.x, orbY - 8, 1.3, PAL.gold);
    }
    if (L >= 19) {
      spire(ctx, p.x, orbY - 11, 8, dark ? PAL.violet : PAL.gold);
    }
  }

  /* --- орбитальная станция: платформа, купол, кольцо и тарелка --- */
  function drawClanCastle(ctx, b, lvl) {
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const baseH = 7 + ramp * 3;
    const hullH = 20 + ramp * 9;

    bPrep(ctx, b, 1.2);
    bPlinth(ctx, b, 0.1, baseH, '#5f6b80');
    bKick(ctx, b, 0.1, 1.4, 'rgba(169,184,216,.4)');

    // круглая платформа
    ctx.fillStyle = '#6a788e';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - baseH, 27 + ramp * 4, (27 + ramp * 4) * GQ,
      0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,225,255,.12)';
    ctx.beginPath();
    ctx.ellipse(p.x - 6, p.y - baseH - 2, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // центральный купол на невысокой башне
    box(ctx, b.x + 0.6, b.y + 0.6, b.x + b.w - 0.6, b.y + b.h - 0.6,
      baseH + hullH, '#59667c');
    // барабан башни: станция читается как вертикаль, а не как блин
    const drumH = 9 + ramp * 4;
    prism(ctx, b.x + 0.9, b.y + 0.9, b.x + b.w - 0.9, b.y + b.h - 0.9,
      baseH + hullH, drumH, '#8a9ab4', '#73829a', '#4f5c70');
    const drx = 19 + ramp * 5;
    const domeY = p.y - baseH - hullH - drumH;
    ctx.fillStyle = '#9fb2cc';
    ctx.beginPath();
    ctx.ellipse(p.x, domeY, drx, drx * 0.86, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,240,255,.28)';
    ctx.beginPath();
    ctx.ellipse(p.x - drx * 0.3, domeY - drx * 0.36, drx * 0.3, drx * 0.15,
      0, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, p.x, domeY, drx, drx * 0.2, PAL.glass, 1.2);

    // орбитальное кольцо: наклонный эллипс вокруг купола
    const ringY = domeY - drx * 0.9;
    ctx.strokeStyle = L >= 12 ? 'rgba(255,207,74,.55)' : 'rgba(169,184,216,.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, ringY, drx + 6, (drx + 6) * 0.28, 0.1, 0, Math.PI * 2);
    ctx.stroke();
    spot(ctx, p.x - drx - 5, ringY - 1, 1.2, PAL.gold);
    spot(ctx, p.x + drx + 5, ringY + 1, 1.1, PAL.cold);

    // четыре стойки и посадочные огни
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2 + Math.PI / 4;
      const sx = p.x + Math.cos(ang) * (24 + ramp * 3);
      const sy = p.y - baseH + Math.sin(ang) * (24 + ramp * 3) * GQ;
      uBar(ctx, sx, sy, sx, sy - 6, 1.6, '#4f5c70');
      spot(ctx, sx, sy - 7, 1.1, i % 2 ? PAL.gold : PAL.glass);
    }

    // тарелка связи
    const dp = P(b.x + 0.42, b.y + 0.4);
    ctx.strokeStyle = '#4f5c70';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(dp.x, dp.y - baseH - 2);
    ctx.lineTo(dp.x, dp.y - baseH - hullH - 8);
    ctx.stroke();
    ctx.fillStyle = L >= 10 ? PAL.gold : '#b8c8e4';
    ctx.beginPath();
    ctx.ellipse(dp.x + 3, dp.y - baseH - hullH - 10, 6, 3.4, -0.5, 0, Math.PI * 2);
    ctx.fill();

    if (L >= 5) {
      bWindowBand(ctx, b, 0.4, baseH, hullH, 2);
    }
    if (L >= 9) {
      // ангар-пристройка и шлюз
      prism(ctx, b.x + b.w - 0.78, b.y + b.h - 0.78, b.x + b.w - 0.3,
        b.y + b.h - 0.3, baseH, 10 + ramp * 3,
        '#8a9ab4', '#73829a', '#4f5c70');
      spot(ctx, p.x + 18, p.y - baseH - 3, 1.2, PAL.cold);
    }
    if (L >= 13) {
      // второе кольцо и мачта
      ring(ctx, p.x, ringY - 3, drx + 2, (drx + 2) * 0.22,
        'rgba(127,233,255,.35)', 0.9);
      antennaMast(ctx, p.x + 10, domeY - drx * 0.7, 9 + ramp * 4,
        PAL.metalLight, PAL.cold);
    }
    if (L >= 17) {
      spire(ctx, p.x, ringY - 8, 9, PAL.gold);
      spot(ctx, p.x, domeY - drx * 0.5, 1.4, 'rgba(255,252,232,.9)');
    }
  }

  /* --- казарма эскадрильи: три дока с дронами --- */
  function drawSquadBarracks(ctx, b, lvl) {
    const s = hallShell(ctx, b, lvl, {
      wall: '#5f5340', roof: '#7d6f56', door: '#2a2218',
      glow: '#8ff0e2', base: '#8a7a5e', flag: PAL.cold,
      kick: 'rgba(200,176,122,.32)', smoke: 'rgba(210,220,200,.18)'
    });
    const p = s.p;

    // три дока: тёмные проёмы с бирюзовой кромкой
    for (let i = -1; i <= 1; i++) {
      const q = P(b.x + b.w / 2 + i * 0.44, b.y + b.h - 0.22);
      uBox(ctx, q.x - 4.4, q.y - s.baseH - 10, 8.8, 8, 1.2, '#2c2a20');
      ctx.strokeStyle = 'rgba(143,240,226,.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(q.x - 4.2, q.y - s.baseH - 2.4);
      ctx.lineTo(q.x + 4.2, q.y - s.baseH - 2.4);
      ctx.stroke();
      // мини-дрон в доке
      spot(ctx, q.x, q.y - s.baseH - 6, 1.6, '#4c565c');
      spot(ctx, q.x, q.y - s.baseH - 6, 0.9, PAL.cold);
      uBar(ctx, q.x - 3, q.y - s.baseH - 6, q.x - 1.6, q.y - s.baseH - 6, 0.6, PAL.metalLight);
      uBar(ctx, q.x + 1.6, q.y - s.baseH - 6, q.x + 3, q.y - s.baseH - 6, 0.6, PAL.metalLight);
    }

    // полосы взлётной палубы
    ctx.strokeStyle = 'rgba(255,207,74,.3)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y - s.baseH + 1);
    ctx.lineTo(p.x + 12, p.y - s.baseH + 1);
    ctx.stroke();

    if (s.L >= 5) {
      // вышка управления
      const q = P(b.x + b.w - 0.34, b.y + 0.34);
      prism(ctx, b.x + b.w - 0.46, b.y + 0.24, b.x + b.w - 0.28, b.y + 0.44,
        s.baseH + s.hullH, 8, PAL.glass, PAL.metal, PAL.metalDark);
      spot(ctx, q.x, q.y - s.baseH - s.hullH - 9, 1.2, PAL.cold);
    }
    if (s.L >= 9) {
      // второй ряд доков и антенна
      for (let i = -1; i <= 1; i += 2) {
        const q = P(b.x + b.w / 2 + i * 0.5, b.y + 0.34);
        uBox(ctx, q.x - 3, q.y - s.baseH - 12, 6, 5, 1, '#343024');
      }
      antennaMast(ctx, p.x - 15, p.y - s.baseH - 2, 8, PAL.metalLight, PAL.gold);
    }
    if (s.L >= 13) {
      bRibs(ctx, b, 0.26, s.baseH, s.hullH, 4, 'rgba(40,44,30,.3)');
      spot(ctx, p.x, p.y - s.baseH - s.hullH - 7, 1.3, PAL.gold);
    }
    if (s.L >= 17) {
      ring(ctx, p.x, p.y - s.baseH - s.hullH - 5, 8, 3,
        'rgba(255,207,74,.42)', 1);
    }
  }

  /* ============================== ЛОВУШКИ ============================== */

  function drawGiantBomb(ctx, b, lvl, armed) {
    const L = bLevel(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    trapPad(ctx, b);
    if (!armed) {
      trapScorch(ctx, b, 24, 24 * GQ);
      trapCracks(ctx, b, 7, 7, 24);
      groundEllipse(ctx, p.x - 1, p.y + 1, 13, 13 * GQ, 'rgba(20,13,9,.7)');
      poly(ctx, [
        { x: p.x - 18, y: p.y + 4 }, { x: p.x - 9, y: p.y - 3 },
        { x: p.x - 11, y: p.y + 7 }
      ], PAL.metalDark);
      poly(ctx, [
        { x: p.x + 11, y: p.y - 2 }, { x: p.x + 19, y: p.y + 4 },
        { x: p.x + 12, y: p.y + 7 }
      ], PAL.metal);
      return;
    }

    // тяжёлый диск с четырьмя прижимами
    groundEllipse(ctx, p.x, p.y + 1, 17, 17 * GQ, 'rgba(60,38,24,.35)');
    ctx.fillStyle = '#4e3a2c';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 3, 15, 15 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b5040';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 5, 12.6, 12.6 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,150,90,.55)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 5, 8, 8 * GQ, 0, 0, Math.PI * 2);
    ctx.fill();
    // скобы
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2 + 0.4;
      spot(ctx, p.x + Math.cos(ang) * 13, p.y - 4 + Math.sin(ang) * 13 * GQ,
        1.6, '#2f2620');
    }
    // лампа
    spot(ctx, p.x + 8, p.y - 8, 1.7, L >= 10 ? PAL.gold : PAL.amber);
    if (mid()) {
      ctx.strokeStyle = 'rgba(255,138,74,.35)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 5, 12.6, 12.6 * GQ, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (L >= 6) {
      // второй контур и предупреждающие полосы
      ring(ctx, p.x, p.y - 5, 15, 15 * GQ, 'rgba(255,207,74,.28)', 0.9);
      ctx.fillStyle = 'rgba(255,138,74,.5)';
      ctx.fillRect(p.x - 10, p.y - 4, 20, 1.3);
    }
    if (L >= 12) {
      ring(ctx, p.x, p.y - 5, 17, 17 * GQ, 'rgba(255,207,74,.4)', 1);
      spot(ctx, p.x - 8, p.y - 8, 1.1, PAL.gold);
    }
    if (L >= 16) {
      spire(ctx, p.x, p.y - 14, 5, PAL.gold);
    }
  }

  function drawSeekingAir(ctx, b, lvl, armed) {
    const L = bLevel(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    trapPad(ctx, b);
    if (!armed) {
      trapScorch(ctx, b, 12, 12 * GQ);
      groundEllipse(ctx, p.x, p.y, 7, 7 * GQ, 'rgba(18,12,9,.65)');
      // пустые направляющие
      uBar(ctx, p.x - 5, p.y - 2, p.x - 8, p.y - 11, 1.6, PAL.metalDark);
      uBar(ctx, p.x + 5, p.y - 2, p.x + 8, p.y - 11, 1.6, PAL.metalDark);
      spot(ctx, p.x, p.y - 2, 4, '#3a2c22');
      return;
    }

    // пусковая тренога с двумя ракетами
    groundEllipse(ctx, p.x, p.y + 1, 9, 9 * GQ, 'rgba(40,28,20,.35)');
    ctx.strokeStyle = '#3f4a5c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 2);
    ctx.lineTo(p.x - 6, p.y + 2);
    ctx.moveTo(p.x, p.y - 2);
    ctx.lineTo(p.x + 6, p.y + 2);
    ctx.moveTo(p.x, p.y - 2);
    ctx.lineTo(p.x, p.y + 3);
    ctx.stroke();
    uBox(ctx, p.x - 6, p.y - 8, 12, 6, 1.4, '#4a5668');
    uBox(ctx, p.x - 4.6, p.y - 10, 2.6, 5, 0.8, '#8fc4ff');
    uBox(ctx, p.x + 2, p.y - 10, 2.6, 5, 0.8, '#8fc4ff');
    spot(ctx, p.x - 3.3, p.y - 11, 1, PAL.glass);
    spot(ctx, p.x + 3.3, p.y - 11, 1, PAL.glass);
    // сенсор
    spot(ctx, p.x, p.y - 6.5, 1.2, L >= 9 ? PAL.gold : PAL.cold);
    if (L >= 6) {
      ring(ctx, p.x, p.y - 6, 8, 3.2, 'rgba(143,196,255,.3)', 0.8);
    }
    if (L >= 12) {
      uBox(ctx, p.x - 8, p.y - 5, 16, 2, 0.6, 'rgba(255,207,74,.4)');
    }
  }

  function drawSkeletonTrap(ctx, b, lvl, armed) {
    const L = bLevel(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    trapPad(ctx, b);
    if (!armed) {
      trapScorch(ctx, b, 10, 10 * GQ);
      groundEllipse(ctx, p.x, p.y, 6, 6 * GQ, 'rgba(20,14,10,.6)');
      // распахнутая крышка и сломанные прутья
      poly(ctx, [
        { x: p.x - 7, y: p.y - 2 }, { x: p.x + 7, y: p.y - 2 },
        { x: p.x + 4, y: p.y - 9 }, { x: p.x - 5, y: p.y - 10 }
      ], '#4b4a3a');
      uBar(ctx, p.x - 5, p.y - 3, p.x - 7, p.y - 10, 0.9, '#6b6850');
      uBar(ctx, p.x + 5, p.y - 3, p.x + 8, p.y - 9, 0.9, '#6b6850');
      return;
    }

    // клетка-капсула с дроном внутри
    groundEllipse(ctx, p.x, p.y + 1, 8, 8 * GQ, 'rgba(44,36,20,.3)');
    ctx.fillStyle = '#565442';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 4, 7, 9, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // прутья
    ctx.strokeStyle = '#8a8464';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(p.x + i * 2.6, p.y - 4);
      ctx.lineTo(p.x + i * 2.6, p.y - 11);
    }
    ctx.stroke();
    ring(ctx, p.x, p.y - 4, 7, 2.6, '#a8a078', 1);
    // глаз дрона
    spot(ctx, p.x, p.y - 7, 2, '#2c2a20');
    spot(ctx, p.x, p.y - 7, 1.1, L >= 8 ? PAL.gold : PAL.amber);
    if (L >= 5) {
      ctx.strokeStyle = 'rgba(227,214,162,.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, 9, 3.4, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (L >= 10) spot(ctx, p.x + 6, p.y - 10, 1.1, PAL.gold);
  }

  function drawTornado(ctx, b, lvl, armed) {
    const L = bLevel(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    trapPad(ctx, b);
    if (!armed) {
      trapScorch(ctx, b, 22, 22 * GQ);
      trapCracks(ctx, b, 6, 7, 22);
      groundEllipse(ctx, p.x, p.y, 10, 10 * GQ, 'rgba(20,16,14,.62)');
      ring(ctx, p.x, p.y, 13, 13 * GQ, 'rgba(120,150,160,.35)', 1);
      return;
    }

    // гравитационный эмиттер: три кольца и ядро
    groundEllipse(ctx, p.x, p.y + 1, 15, 15 * GQ, 'rgba(30,40,46,.35)');
    const rings = L >= 12 ? 4 : 3;
    for (let i = 0; i < rings; i++) {
      const k = i / rings;
      const rx = 13 - k * 5;
      const ry = rx * GQ * 1.2;
      ring(ctx, p.x, p.y - 3 - k * 5, rx, ry,
        'rgba(169,216,232,' + (0.5 - k * 0.08).toFixed(2) + ')', 1.1);
    }
    // ядро
    spot(ctx, p.x, p.y - 6, 3.6, '#2f4650');
    spot(ctx, p.x, p.y - 6, 2.2, L >= 10 ? PAL.gold : PAL.glass);
    // затянутые обломки
    for (let i = 0; i < 4; i++) {
      const ang = i * 1.6 + 0.4;
      const rr = 9 + (i % 2) * 3;
      spot(ctx, p.x + Math.cos(ang) * rr, p.y - 5 + Math.sin(ang) * rr * GQ,
        0.9, 'rgba(226,213,190,.7)');
    }
    if (L >= 8) {
      ring(ctx, p.x, p.y - 3, 16, 16 * GQ * 1.1,
        'rgba(255,207,74,.22)', 0.9);
    }
    if (L >= 14) {
      ring(ctx, p.x, p.y - 8, 6, 6 * GQ, 'rgba(255,207,74,.45)', 1);
    }
    if (L >= 18) {
      spot(ctx, p.x, p.y - 6, 1.1, 'rgba(255,252,232,.95)');
    }
  }

  function drawGigaBomb(ctx, b, lvl, armed) {
    const L = bLevel(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    trapPad(ctx, b);
    if (!armed) {
      trapScorch(ctx, b, 30, 30 * GQ);
      trapCracks(ctx, b, 9, 8, 30);
      groundEllipse(ctx, p.x - 1, p.y + 1, 16, 16 * GQ, 'rgba(14,10,8,.75)');
      // искореженный каркас
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.3;
        poly(ctx, [
          { x: p.x + Math.cos(ang) * 12, y: p.y + Math.sin(ang) * 12 * GQ },
          { x: p.x + Math.cos(ang + 0.4) * 19, y: p.y + Math.sin(ang + 0.4) * 19 * GQ },
          { x: p.x + Math.cos(ang + 0.9) * 12, y: p.y + Math.sin(ang + 0.9) * 12 * GQ }
        ], i % 2 ? PAL.metalDark : '#3a2c22');
      }
      return;
    }

    // огромная сфера с золотым поясом и шестью защёлками
    groundEllipse(ctx, p.x, p.y + 2, 20, 20 * GQ, 'rgba(60,24,16,.4)');
    spot(ctx, p.x, p.y - 5, 16, '#3d2a24');
    spot(ctx, p.x, p.y - 7, 13.5, '#6a4034');
    spot(ctx, p.x - 4, p.y - 12, 4, 'rgba(255,210,180,.18)');
    ctx.strokeStyle = L >= 12 ? PAL.gold : 'rgba(255,138,74,.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 7, 13.5, 13.5 * GQ, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const ang = i * Math.PI / 3 + 0.3;
      spot(ctx, p.x + Math.cos(ang) * 12.4, p.y - 6 + Math.sin(ang) * 12.4 * GQ,
        1.4, '#241a16');
    }
    // пучок проводов к детонатору
    ctx.strokeStyle = '#8a3a2a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p.x + 8, p.y - 13);
    ctx.quadraticCurveTo(p.x + 14, p.y - 18, p.x + 17, p.y - 14);
    ctx.stroke();
    spot(ctx, p.x + 17, p.y - 14, 1.6, L >= 9 ? PAL.gold : PAL.amber);
    if (L >= 6) {
      ring(ctx, p.x, p.y - 7, 17, 17 * GQ, 'rgba(255,207,74,.25)', 0.9);
    }
    if (L >= 14) {
      ring(ctx, p.x, p.y - 7, 19, 19 * GQ, 'rgba(255,207,74,.4)', 1.1);
      spot(ctx, p.x - 9, p.y - 10, 1.2, PAL.gold);
    }
  }

  /* ---------- динамика новых построек ----------
     Спрайт статичен, поэтому вращение/пульсацию рисуем вектором поверх.
     Ни одной канвы на кадр: только дуги и точки. */

  function drawSweeperGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const hy = p.y - (5 + ramp * 3) - (20 + ramp * 14);
    const br = 11 + ramp * 8;
    const sp = t * (1.6 + ramp * 1.8);
    ctx.strokeStyle = 'rgba(127,233,255,.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = sp + i * Math.PI * 2 / 3;
      ctx.moveTo(p.x + Math.cos(a) * 2.4, hy + Math.sin(a) * 2.4 * 0.9);
      ctx.lineTo(p.x + Math.cos(a) * br * 0.92, hy + Math.sin(a) * br * 0.92 * 0.9);
    }
    ctx.stroke();
    ring(ctx, p.x, hy, br + 2.4, (br + 2.4) * 0.9,
      'rgba(70,224,200,.2)', 0.9);
    spot(ctx, p.x, hy, 1 + ramp * 0.6, 'rgba(236,255,251,.8)');
  }

  function drawSpellGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const orbY = p.y - (6 + ramp * 3) - (22 + ramp * 12) - 10 - ramp * 3;
    const a = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.4 + b.x * 0.7));
    ring(ctx, p.x, orbY, 11 + ramp * 2, (11 + ramp * 2) * 0.55,
      'rgba(200,170,255,' + a.toFixed(3) + ')', 1);
    spot(ctx, p.x, orbY, 2 + ramp * 0.6,
      lvl >= 14 ? 'rgba(255,220,150,.75)' : 'rgba(226,210,255,.7)');
  }

  function drawMonolithGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const topY = p.y - (8 + ramp * 3) - (30 + ramp * 16);
    const a = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2 + b.x * 0.9));
    const orbY = topY - 9 - ramp * 4;
    ring(ctx, p.x, orbY, 8 + ramp * 2, (8 + ramp * 2) * GQ,
      'rgba(196,222,255,' + a.toFixed(3) + ')', 1);
    spot(ctx, p.x, topY + 1.6, 1.1, 'rgba(220,236,255,.7)');
  }

  function drawFactoryGlow(ctx, b, lvl, dark) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const drx = 17 + ramp * 4;
    const domeY = p.y - (5 + ramp * 2) - (14 + ramp * 5);
    const orbY = domeY - drx * 0.34;
    const a = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.2 + b.y * 0.6));
    ring(ctx, p.x, orbY, 8 + ramp * 2, (8 + ramp * 2) * 0.8,
      (dark ? 'rgba(194,143,232,' : 'rgba(143,208,255,') + a.toFixed(3) + ')', 0.9);
    spot(ctx, p.x, orbY - 0.5, 1.4 + ramp * 0.5,
      dark ? 'rgba(230,200,255,.8)' : 'rgba(210,245,255,.8)');
  }

  function drawFireGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = P(cx, cy);
    const a = aimVec(b);
    const baseH = 6 + ramp * 3;
    const bodyH = 14 + ramp * 5;
    const len = 16 + ramp * 8;
    const x = p.x + a.x * (5 + len + 4);
    const y = p.y - baseH - bodyH - 2 + a.y * (5 + len + 4) * 0.8;
    const f = 0.5 + 0.5 * Math.sin(t * 7 + b.x);
    spot(ctx, x, y, 1.8 + f * 1.2, 'rgba(255,154,90,.5)');
    spot(ctx, x, y, 0.9 + f * 0.5, 'rgba(255,236,180,.75)');
  }

  function drawRevengeGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const baseH = 7 + ramp * 3;
    const towerH = 30 + ramp * 18;
    const topY = p.y - baseH - 3.4 - towerH;
    const armLen = 9 + ramp * 7;
    const ox = p.x + a.x * armLen;
    const oy = topY - 3 + a.y * armLen * 0.6 + 3.6;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + b.x * 0.9);
    const r = 4.6 + ramp * 1.2 + pulse * 0.7;

    ring(ctx, ox, oy, r, r * GQ, 'rgba(224,166,255,' +
      (0.24 + pulse * 0.2).toFixed(3) + ')', 1);
    spot(ctx, ox, oy - 0.4, 1.3 + pulse * 0.5, 'rgba(242,222,255,.92)');
    // редкие искры-стражи поднимаются от ядра
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i * 0.37 + b.x * 0.11) % 1;
      const ex = ox + Math.sin(ph * 6.2 + i * 2.1) * (2 + ph * 4);
      const ey = oy - 2 - ph * (8 + ramp * 4);
      spot(ctx, ex, ey, 0.7 * (1 - ph), 'rgba(201,143,224,.7)');
    }
    // атака: короткая фиолетовая вспышка и два луча из клетки
    const atk = typeof b.cd === 'number' ? Math.max(0, 1 - b.cd * 3) : 0;
    if (atk > 0) {
      spot(ctx, ox + nx * 4, oy + ny * 2, 1.2 + atk * 1.4,
        'rgba(224,166,255,' + (atk * 0.55).toFixed(2) + ')');
      uBar(ctx, ox, oy, ox + a.x * (9 + atk * 7), oy + a.y * (7 + atk * 5),
        1.1, 'rgba(201,143,224,' + (atk * 0.5).toFixed(2) + ')');
    }
    if (lvl >= 18) {
      const rr = 7 + ramp * 2;
      ring(ctx, ox, oy - 2, rr, rr * GQ,
        'rgba(255,207,74,' + (0.25 + pulse * 0.2).toFixed(2) + ')', 0.9);
    }
  }

  function drawSuperwizardGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const a = aimVec(b);
    const baseH = 6 + ramp * 3;
    const botY = p.y - baseH - 18;
    const torsoH = 30 + ramp * 12;
    const topY = botY - torsoH;
    const hw = 16 + ramp * 9;
    const oy = topY - 15 - ramp * 5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + b.x * 0.7);

    // ядро: дышит и вращает внешнее кольцо
    const rr = 8 + ramp * 2.4;
    ring(ctx, p.x, oy, rr, rr * 0.86,
      'rgba(224,166,255,' + (0.16 + pulse * 0.18).toFixed(3) + ')', 0.9);
    spot(ctx, p.x, oy - 0.6, 1.8 + pulse * 0.7, 'rgba(244,224,255,.95)');
    const spin = t * 1.4 + b.x * 0.3;
    for (let i = 0; i < 3; i++) {
      const ang = spin + i * Math.PI * 2 / 3;
      spot(ctx, p.x + Math.cos(ang) * rr * 0.86,
        oy + Math.sin(ang) * rr * 0.7, 0.9, 'rgba(200,160,255,.8)');
    }

    // дуга между катушками плеч
    const cy = topY + 4 - ramp * 1.5;
    drawArcBolt(ctx, p.x - hw * 0.98, cy - 3, p.x + hw * 0.98, cy - 3,
      0.22 + pulse * 0.12, 'rgba(224,166,255,.9)', b.x + t * 2, 0.9);

    // атака: плазменный выброс из руки-орудия
    const atk = typeof b.cd === 'number' ? Math.max(0, 1 - b.cd * 3) : 0;
    const mx = p.x + hw * 0.92 + a.x * (17 + ramp * 7);
    const my = topY + 13 + a.y * (13 + ramp * 5);
    if (atk > 0) {
      spot(ctx, mx, my, 2 + atk * 2.6,
        'rgba(224,166,255,' + (atk * 0.55).toFixed(2) + ')');
      drawArcBolt(ctx, p.x, oy, mx, my, atk * 0.7,
        'rgba(240,214,255,.9)', b.y + t * 6, 1);
      spot(ctx, p.x, oy, 1.8 + atk * 1.2, 'rgba(255,250,255,.9)');
    }

    // 16+: спутники медленно обходят ядро
    if (lvl >= 16) {
      for (let i = 0; i < 3; i++) {
        const ang = spin * 0.7 + i * Math.PI * 2 / 3 + 0.4;
        const sx = p.x + Math.cos(ang) * (14 + ramp * 3);
        const sy = oy + Math.sin(ang) * (10 + ramp * 2) * 0.9;
        spot(ctx, sx, sy, 0.9, i === 0 ? PAL.gold : 'rgba(200,166,232,.85)');
      }
    }
  }

  function drawSpikyFx(ctx, b, lvl) {
    if (!mid()) return;
    const L = bLevel(lvl);
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const baseH = 6 + ramp * 4;
    const domeH = 16 + ramp * 9;
    const r1 = 23 + ramp * 7;
    const fl = flashOf(b.id);           // 0..1 сразу после удара по башне
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + b.y * 0.6);

    // пассивный контур: тёплое кольцо у грунта
    ring(ctx, p.x, p.y - baseH + 0.8, 18 + ramp * 4,
      (18 + ramp * 4) * GQ, 'rgba(214,160,106,' +
        (0.08 + pulse * 0.08 + fl * 0.25).toFixed(3) + ')', 0.9);

    // кончики шипов тлеют; при ударе вспыхивают
    const n = L >= 12 ? 12 : (L >= 6 ? 10 : 8);
    for (let i = 0; i < n; i++) {
      const ang = i * Math.PI * 2 / n + 0.25;
      if (Math.sin(ang) <= 0) continue;
      const tx = p.x + Math.cos(ang) * r1;
      const ty = p.y - baseH - domeH * 0.44 + Math.sin(ang) * r1 * GQ -
        5 - ramp * 2;
      spot(ctx, tx, ty, 0.8 + fl * 1.1,
        fl > 0.02 ? 'rgba(255,214,150,' + (0.45 + fl * 0.45).toFixed(2) + ')'
          : 'rgba(214,160,106,' + (0.25 + pulse * 0.2).toFixed(2) + ')');
    }

    if (fl > 0.02) {
      // ответный импульс: расходящееся кольцо и короткие искры
      const rr = 8 + (1 - fl) * 14;
      ring(ctx, p.x, p.y - baseH, rr, rr * GQ,
        'rgba(255,207,74,' + (fl * 0.5).toFixed(2) + ')', 1.2);
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + 0.7;
        spot(ctx, p.x + Math.cos(ang) * rr, p.y - baseH - 2 +
          Math.sin(ang) * rr * GQ, 0.9 * fl, 'rgba(255,236,190,.85)');
      }
    }
  }

  function drawFirecrackerGlow(ctx, b, lvl) {
    if (!mid()) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w / 2, b.y + b.h / 2);
    const a = aimVec(b);
    const nx = -a.y;
    const ny = a.x;
    const baseH = 6 + ramp * 3;
    const mastH = 28 + ramp * 18;
    const hingeY = p.y - baseH - mastH;
    let dx = a.x * 0.62;
    let dy = a.y * 0.42 - 1;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const atk = typeof b.cd === 'number' ? Math.max(0, 1 - b.cd * 3) : 0;
    const flick = 0.5 + 0.5 * Math.sin(t * 8 + b.x * 1.7);

    // фитиль у шарнира
    spot(ctx, p.x - 7, hingeY - 10, 0.8 + flick * 0.6,
      'rgba(255,200,120,' + (0.4 + flick * 0.3).toFixed(2) + ')');

    // сопла труб: тлеют, при выстреле дают короткий факел
    for (let i = -1; i <= 1; i++) {
      const off = i * (7 + ramp * 2);
      const sx = p.x + nx * off - a.x * 2;
      const sy = hingeY + ny * off * 0.7 - a.y * 1.6;
      const len = 24 + ramp * 12 + (1 - Math.abs(i)) * 3 + 5;
      const tx = sx + dx * len;
      const ty = sy + dy * len;
      spot(ctx, tx, ty, 0.9 + flick * 0.4,
        'rgba(255,190,110,' + (0.3 + flick * 0.2).toFixed(2) + ')');
      if (atk > 0) {
        spot(ctx, tx + dx * 2, ty + dy * 2, 1.2 + atk * 2.6,
          'rgba(255,210,120,' + (atk * 0.55).toFixed(2) + ')');
        spot(ctx, tx + dx * 4, ty + dy * 4, 0.7 + atk * 1.2,
          'rgba(255,245,210,' + (atk * 0.6).toFixed(2) + ')');
      }
    }

    if (atk > 0 && near()) {
      // дым залпа
      for (let i = 0; i < 2; i++) {
        spot(ctx, p.x + nx * (i ? 6 : -6), hingeY - 4 - atk * 6,
          1.4 + atk * 2, 'rgba(90,74,58,' + (atk * 0.22).toFixed(2) + ')');
      }
    }
  }


  function drawTHGlow(ctx, b, lvl) {
    if (!mid() || lvl < 10) return;
    const ramp = bRamp(lvl);
    const p = P(b.x + b.w - 0.34, b.y + b.h - 0.34);
    const baseH = 9 + ramp * 4;
    const a = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3 + b.x));
    spot(ctx, p.x, p.y - baseH - 13, 1.4, 'rgba(159,232,255,' + (0.5 + a).toFixed(2) + ')');
    if (lvl >= 15) {
      ring(ctx, p.x, p.y - baseH - 25, 11, 4.5,
        'rgba(255,207,74,' + a.toFixed(3) + ')', 1);
    }
  }

  function drawBuildingBody(ctx, b) {
    const type = b.type;
    const lvl = levelOf(b);

    if (type === 'townhall') {
      drawHouse(ctx, b, LOOK.townhall, lvl);
      drawTHWeapon(ctx, b, lvl);
      return;
    }
    if (type === 'barracks') {
      drawBarracks(ctx, b, lvl);
      return;
    }
    if (type === 'lab') { drawLab(ctx, b, lvl); return; }
    if (type === 'herohall') { drawHeroHall(ctx, b, lvl); return; }
    if (type === 'cannon') { drawCannon(ctx, b, lvl); return; }
    if (type === 'mortar') { drawMortar(ctx, b, lvl); return; }
    if (type === 'archer') { drawTower(ctx, b, lvl); return; }
    if (type === 'airdef') { drawAirdef(ctx, b, lvl); return; }
    if (type === 'mage') { drawMage(ctx, b, lvl); return; }
    if (type === 'goldmine') { drawGoldmine(ctx, b, lvl); return; }
    if (type === 'elixir') { drawElixir(ctx, b, lvl); return; }
    if (type === 'storage') { drawStorage(ctx, b, lvl); return; }
    if (type === 'estorage') { drawEstorage(ctx, b, lvl); return; }
    if (type === 'mine') { drawMine(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'spring') { drawSpring(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'airmine') { drawAirMine(ctx, b, lvl, trapVariant(b) !== 'spent'); return; }
    if (type === 'ambush') { drawAmbush(ctx, b, lvl, trapVariant(b) === 'open'); return; }
    if (type === 'beam') { drawBeamTower(ctx, b, lvl); return; }
    if (type === 'sweeper') { drawScaledArt(ctx, b, drawSweeper); return; }
    if (type === 'bombtower') { drawScaledArt(ctx, b, drawBombTower); return; }
    if (type === 'xbow') { drawScaledArt(ctx, b, drawRailgun); return; }
    if (type === 'eagle') { drawScaledArt(ctx, b, drawEagle); return; }
    if (type === 'scattershot') { drawScaledArt(ctx, b, drawScattershot); return; }
    if (type === 'monolith') { drawScaledArt(ctx, b, drawMonolith); return; }
    if (type === 'spelltower') { drawScaledArt(ctx, b, drawSpellTower); return; }
    if (type === 'multiarcher') { drawScaledArt(ctx, b, drawMultiArcher); return; }
    if (type === 'ricochet') { drawScaledArt(ctx, b, drawRicochet); return; }
    if (type === 'multigear') { drawScaledArt(ctx, b, drawMultiGear); return; }
    if (type === 'firespitter') { drawScaledArt(ctx, b, drawFireSpitter); return; }
    if (type === 'revenge') { drawScaledArt(ctx, b, drawRevenge); return; }
    if (type === 'superwizard') { drawScaledArt(ctx, b, drawSuperwizard); return; }
    if (type === 'spiky') { drawScaledArt(ctx, b, drawSpiky); return; }
    if (type === 'firecracker') { drawScaledArt(ctx, b, drawFirecracker); return; }

    if (type === 'darkdrill') { drawScaledArt(ctx, b, drawDarkDrill); return; }
    if (type === 'darkstorage') { drawScaledArt(ctx, b, drawDarkStorage); return; }

    if (type === 'train') { drawScaledArt(ctx, b, function (c, v) { drawTrainHall(c, v, lvl, false); }); return; }
    if (type === 'darktrain') { drawScaledArt(ctx, b, function (c, v) { drawTrainHall(c, v, lvl, true); }); return; }
    if (type === 'spellfactory') { drawScaledArt(ctx, b, function (c, v) { drawSpellFactory(c, v, lvl, false); }); return; }
    if (type === 'darkspellfactory') { drawScaledArt(ctx, b, function (c, v) { drawSpellFactory(c, v, lvl, true); }); return; }
    if (type === 'pethouse') { drawScaledArt(ctx, b, drawPetHouse); return; }
    if (type === 'blacksmith') { drawScaledArt(ctx, b, drawBlacksmith); return; }
    if (type === 'workshop') { drawScaledArt(ctx, b, drawWorkshop); return; }
    if (type === 'clancastle') { drawScaledArt(ctx, b, drawClanCastle); return; }
    if (type === 'squadbarracks') { drawScaledArt(ctx, b, drawSquadBarracks); return; }

    if (type === 'giantbomb') {
      const armed = trapVariant(b) !== 'spent';
      drawScaledArt(ctx, b, function (c, v) { drawGiantBomb(c, v, lvl, armed); });
      return;
    }
    if (type === 'seekingair') {
      const armed = trapVariant(b) !== 'spent';
      drawScaledArt(ctx, b, function (c, v) { drawSeekingAir(c, v, lvl, armed); });
      return;
    }
    if (type === 'skeletontrap') {
      const armed = trapVariant(b) !== 'spent';
      drawScaledArt(ctx, b, function (c, v) { drawSkeletonTrap(c, v, lvl, armed); });
      return;
    }
    if (type === 'tornado') {
      const armed = trapVariant(b) !== 'spent';
      drawScaledArt(ctx, b, function (c, v) { drawTornado(c, v, lvl, armed); });
      return;
    }
    if (type === 'gigabomb') {
      const armed = trapVariant(b) !== 'spent';
      drawScaledArt(ctx, b, function (c, v) { drawGigaBomb(c, v, lvl, armed); });
      return;
    }
    if (type === 'wall') {
      drawWallRun(ctx, { x: b.x, y: b.y, w: 1, h: 1, cells: [b], lvl: lvl }, { bar: true });
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

  // высота силуэта и ширина по типу. Полный набор справочник: тень, HP-бар и
  // купол щита считаются отсюда, поэтому ни один тип не должен падать
  // в дефолт «20 px» — иначе танк выглядит муравьём.
  const UNIT_SPEC = {
    barb: { h: 24, w: 1.0 },
    archer: { h: 22, w: 0.78 },
    giant: { h: 36, w: 1.62 },
    goblin: { h: 17, w: 0.72 },
    gnome: { h: 20, w: 1.02 },
    airship: { h: 30, w: 1.25 },
    wizard: { h: 24, w: 0.9 },
    healer: { h: 24, w: 0.92 },
    dragon: { h: 33, w: 1.72 },
    pekka: { h: 34, w: 1.22 },
    babydragon: { h: 24, w: 1.12 },
    miner: { h: 21, w: 0.95 },
    electrodragon: { h: 34, w: 1.74 },
    yeti: { h: 38, w: 1.68 },
    dragonrider: { h: 32, w: 1.5 },
    electrotitan: { h: 40, w: 1.62 },
    rootrider: { h: 34, w: 1.5 },
    thrower: { h: 24, w: 1.0 },
    meteorgolem: { h: 37, w: 1.72 },
    minion: { h: 15, w: 0.8 },
    hogrider: { h: 25, w: 1.2 },
    valkyrie: { h: 23, w: 1.0 },
    golem: { h: 37, w: 1.78 },
    witch: { h: 23, w: 0.9 },
    lavahound: { h: 30, w: 1.85 },
    bowler: { h: 25, w: 1.1 },
    icegolem: { h: 30, w: 1.5 },
    headhunter: { h: 22, w: 0.9 },
    apprentice: { h: 23, w: 0.9 },
    druid: { h: 23, w: 0.95 },
    furnace: { h: 18, w: 1.1 },
    ruinwitch: { h: 24, w: 0.95 },
    // стражи поздних центров: дальний стрелок, танк и тяжёлый стрелок
    longshot: { h: 28, w: 1.02 },
    smasher: { h: 42, w: 1.9 },
    logger: { h: 36, w: 1.62 },
    guardian: { h: 38, w: 1.62 },
    // сержант: фигура в 1.5 раза крупнее штурмовика (h = 40 × 1.5),
    // ширина полосы — по прежнему силуэту, чтобы тень не раздувалась
    hero: { h: 60, w: 1.56 }
  };

  /* Арт-классы новых войск: тип → художник, палитра и пара флагов.
     Один художник на роль (маг, стрелок, тяжёлый, зверь, летун) плюс
     параметры — так 25 новых типов не превращаются в 25 копий кода,
     но силуэты и цвета у каждого свои. */
  const MONS = {
    wizard: { art: 'caster', robe: '#7d5fc4', robeDark: '#4a3478', trim: '#c8aaff', orb: '#d8b4ff' },
    healer: { art: 'caster', robe: '#d8d2bd', robeDark: '#8f8a77', trim: '#7fe9ff', orb: '#b8fff4', halo: true },
    witch: { art: 'caster', robe: '#5a4a6a', robeDark: '#2f2638', trim: '#b04fe0', orb: '#d090ff', float: true, skull: true },
    ruinwitch: { art: 'caster', robe: '#6a5a48', robeDark: '#332c22', trim: '#c7a272', orb: '#ff9a5a', float: true, skull: true },
    apprentice: { art: 'caster', robe: '#4a7f8a', robeDark: '#2a4c54', trim: '#8ff0e2', orb: '#b8fff4', halo: true },
    druid: { art: 'caster', robe: '#4f7a48', robeDark: '#2a4226', trim: '#b9e08a', orb: '#c8f0a0' },
    thrower: { art: 'ranger', suit: '#9a7a4a', suitLight: '#c8a05a', acc: '#ffcf4a', weapon: 'disk', big: true },
    valkyrie: { art: 'ranger', suit: '#a8563a', suitLight: '#d08a4a', acc: '#ffcf4a', weapon: 'axe' },
    headhunter: { art: 'ranger', suit: '#7a3a5a', suitLight: '#b85a8a', acc: '#ff9ac8', weapon: 'blade' },
    miner: { art: 'ranger', suit: '#7a6a4a', suitLight: '#a89060', acc: '#ffcf4a', weapon: 'drill' },
    bowler: { art: 'ranger', suit: '#6a6258', suitLight: '#8a7a6a', acc: '#46e0c8', weapon: 'ball', big: true },
    pekka: { art: 'brute', armor: '#5a6078', armorLight: '#8a90b0', glow: '#b04fe0', weapon: 'blades', blades: 2 },
    electrotitan: { art: 'brute', armor: '#4a5a8a', armorLight: '#7a8ad6', glow: '#8fe8ff', weapon: 'coils' },
    hogrider: { art: 'beast', body: '#8a6a4a', bodyDark: '#5a4430', accent: '#c8a05a', horns: 'tusks', rider: true, fast: true },
    rootrider: { art: 'beast', body: '#6a7a42', bodyDark: '#3f4a24', accent: '#b9c99a', horns: 'branch', rider: true, spikes: true },
    yeti: { art: 'beast', body: '#c8dde6', bodyDark: '#8fa8b4', accent: '#7fe9ff', horns: 'ice', big: true },
    golem: { art: 'beast', body: '#7a7568', bodyDark: '#4c483f', accent: '#ffcf4a', horns: 'rock', big: true, rock: true },
    icegolem: { art: 'beast', body: '#9ad0e0', bodyDark: '#5a8a9a', accent: '#d8fbff', horns: 'ice', big: true, ice: true },
    meteorgolem: { art: 'beast', body: '#6a4a3a', bodyDark: '#3a2820', accent: '#ff8a4a', horns: 'rock', big: true, rock: true, lava: true },
    furnace: { art: 'furnace', body: '#7a4a32', accent: '#ff9a5a' },
    dragon: { art: 'wing', body: '#a84a38', bodyDark: '#6a2a20', wing: '#8e3a2c', belly: '#e0a070', horn: '#ffcf4a', eye: '#ffe08a', size: 1 },
    babydragon: { art: 'wing', body: '#c77a4a', bodyDark: '#8a4a2a', wing: '#e0a070', belly: '#ffd8a8', horn: '#ffe0b0', eye: '#fff0c0', size: 0.72 },
    electrodragon: { art: 'wing', body: '#4a6ab0', bodyDark: '#2a3a70', wing: '#5a8ad6', belly: '#8fd0ff', horn: '#b8fff4', eye: '#9ff0ff', size: 1.02, spark: true },
    dragonrider: { art: 'wing', body: '#8a5a4a', bodyDark: '#55322a', wing: '#a8705a', belly: '#d8b090', horn: '#e0c090', eye: '#ffe08a', size: 0.9, rider: true },
    lavahound: { art: 'wing', body: '#8a2e1e', bodyDark: '#4a160e', wing: '#c04a2a', belly: '#ff8a4a', horn: '#ffcf4a', eye: '#ffe08a', size: 1.08, round: true, lava: true },
    minion: { art: 'wing', body: '#5a4a7a', bodyDark: '#2e2444', wing: '#7a6aa8', belly: '#9a8ac8', horn: '#c8b0ff', eye: '#ffcf4a', size: 0.52, imp: true }
  };

  /* Питомцы: 12 штук. Не занимают место в армии, идут рядом с героем.
     Силуэт мельче линейных войск, поэтому формы простые и контрастные. */
  const PET_ART = {
    lassi: { h: 15, w: 0.72, art: 'quad', body: '#8a6a4a', dark: '#5a4430', acc: '#ffcf4a', tail: 'bushy' },
    yak: { h: 19, w: 0.95, art: 'quad', body: '#6a5a4a', dark: '#3f362c', acc: '#c8a05a', horns: 'bull' },
    owl: { h: 14, w: 0.8, art: 'bird', fly: true, body: '#b8a888', dark: '#7a6a52', acc: '#ffcf4a' },
    unicorn: { h: 17, w: 0.8, art: 'quad', body: '#e0d8e8', dark: '#a89ab8', acc: '#ff9ac8', horn: true },
    frosty: { h: 14, w: 0.78, art: 'blob', body: '#b8e0f0', dark: '#6a9ab0', acc: '#ffffff', icy: true },
    diggy: { h: 12, w: 0.8, art: 'quad', body: '#8a7a5a', dark: '#5a4a34', acc: '#ffcf4a', drill: true },
    lizard: { h: 13, w: 0.82, art: 'quad', body: '#6a8a4a', dark: '#3f542a', acc: '#b9e08a', tail: 'long' },
    phoenix: { h: 16, w: 0.95, art: 'bird', fly: true, body: '#d0783a', dark: '#8a3a1a', acc: '#ffcf4a', fire: true },
    fox: { h: 14, w: 0.82, art: 'quad', fly: true, body: '#c88a5a', dark: '#8a5a34', acc: '#ffd8a8', tail: 'bushy', ghost: true },
    jelly: { h: 15, w: 0.8, art: 'blob', fly: true, body: '#b08ad0', dark: '#6a4a8a', acc: '#e0c0ff', glow: true },
    sneezy: { h: 15, w: 0.9, art: 'blob', body: '#8ac88a', dark: '#4a7a4a', acc: '#d8ffd8' },
    raven: { h: 13, w: 0.7, art: 'bird', fly: true, body: '#3a3a48', dark: '#1e1e28', acc: '#8fc4ff' }
  };

  /* Осадные машины: едут с армией, один слот мастерской. */
  const SIEGE_ART = {
    wallwrecker: { h: 26, w: 1.55, art: 'cart', body: '#7a6a52', dark: '#4a3f30', acc: '#ffcf4a', top: 'ram' },
    battleblimp: { h: 30, w: 1.7, art: 'blimp', fly: true, body: '#8a6a3a', dark: '#4a3820', acc: '#ffcf4a' },
    stoneslammer: { h: 27, w: 1.6, art: 'cart', body: '#6a6a5a', dark: '#3f3f34', acc: '#b9c99a', top: 'boulder' },
    siegebarracks: { h: 28, w: 1.6, art: 'cart', body: '#6a5a42', dark: '#3f3526', acc: '#46e0c8', top: 'hatch' },
    loglauncher: { h: 26, w: 1.55, art: 'cart', body: '#7a5a3a', dark: '#4a3420', acc: '#ffcf4a', top: 'log' },
    flameflinger: { h: 28, w: 1.6, art: 'cart', body: '#7a4a32', dark: '#4a2a1a', acc: '#ff9a5a', top: 'flame' },
    battledrill: { h: 24, w: 1.5, art: 'cart', body: '#5a6a72', dark: '#33424a', acc: '#8fe8ff', top: 'drill' },
    trooplauncher: { h: 26, w: 1.55, art: 'cart', body: '#6a6250', dark: '#3f3a2c', acc: '#8ff0e2', top: 'rack' },
    skywagon: { h: 28, w: 1.65, art: 'blimp', fly: true, body: '#7a6a7a', dark: '#4a3f4a', acc: '#e0c0ff' }
  };

  /* Стражи: три роли на одной лестнице поздних центров. Силуэты разведены
     намеренно — тонкий стрелок с копьём-лучом, широкий танк с молотом и
     тяжёлый стрелок с наплечной мортирой. Ширина/высота идут и в тень,
     и в HP-бар, поэтому здесь те же числа, что в UNIT_SPEC. */
  const GUARDIAN_ART = {
    longshot: {
      h: 28, w: 1.02, art: 'ranger',
      suit: '#3f5a74', suitLight: '#7098b8', acc: '#8fe8ff',
      weapon: 'lance', scope: true
    },
    smasher: {
      h: 42, w: 1.9, art: 'brute',
      armor: '#5a4a62', armorLight: '#9986ac', glow: '#e0a6ff',
      weapon: 'hammer', big: true
    },
    logger: {
      h: 36, w: 1.62, art: 'brute',
      armor: '#4a5a44', armorLight: '#859a70', glow: '#ffcf4a',
      weapon: 'logcannon', big: true
    }
  };


  // На камере ~48° юниты чуть крупнее: иначе теряются на оранжевом поле.
  const UNIT_DRAW_SCALE = 1.18;

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

  // Сержант рисуется в 1.5 раза крупнее линейных войск, поэтому у него своя
  // канва: иначе навершие антенны и плащ обрезались бы рамкой U_ARTW/U_ARTH.
  const HERO_SCALE = 1.5;
  const HERO_ARTW = 120;
  const HERO_ARTH = 100;
  const HERO_AX = 60;
  const HERO_AY = 84;

  const unitSpriteCache = new Map();
  const unitBakes = { count: 0, hits: 0 };
  const unitMv = new WeakMap();

  /* ---------- 3D-биллборды v2: штурмовик, лазерщик, мех ----------
     Второе поколение: 13 кадров × 8 направлений на тип, 256×256 RGBA.
     idle 2, walk 4, attack 3, death 4. Направления те же, что UNIT_DIRS:
     0 — от камеры, 2 — вправо, 4 — на камеру, 6 — влево.
     Якорь земли в исходнике фиксирован — (128, 206); bbox не обрезаем,
     поэтому фигура не «дышит» и не прыгает между направлениями.

     PNG грузятся фоном по 12 штук и сразу уменьшаются в маленькую канву
     (w×h при U_BAKE). Канвы живут всё время игры, исходные Image после
     запекания отпускаются. Пока тип не загрузился целиком или если любая
     картинка сломалась, unitSprite рисует прежний векторный арт. */
  const UNIT3D_V2 = {
    // frame — сторона кадра в мировых пикселях. Видимая фигура занимает
    // ~0.66/0.695/0.754 кадра, то есть прежние 24/22/36 px.
    barb: { frame: 36, w: 40, h: 40, ax: 20, ay: 31 },
    archer: { frame: 32, w: 38, h: 36, ax: 19, ay: 27 },
    giant: { frame: 48, w: 54, h: 56, ax: 27, ay: 43 }
  };
  const UNIT3D_V2_ANIMS = { idle: 2, walk: 4, attack: 3, death: 4 };
  const UNIT3D_V2_SRC = 256;       // сторона исходного PNG
  const UNIT3D_V2_GX = 128;        // якорь земли в исходнике
  const UNIT3D_V2_GY = 206;
  const UNIT3D_V2_LOAD = 12;       // одновременных запросов

  const unit3dV2 = {
    started: false, ready: false, total: 0, loaded: 0, failed: 0,
    readyTypes: 0, frames: 0, types: {}
  };

  function unit3dV2Ready(type) {
    const rec = unit3dV2.types[type];
    return !!(rec && rec.ready);
  }

  // Готовая канва кадра или null (тип ещё грузится / ассет сломан).
  function unit3dV2Sprite(type, anim, dir, frame) {
    const rec = unit3dV2.types[type];
    if (!rec || !rec.ready) return null;
    const list = rec.sprites[anim];
    if (!list) return null;
    const byDir = list[dir < 0 ? 0 : (dir & 7)];
    if (!byDir) return null;
    return byDir[frame] || null;
  }

  function bakeUnit3dV2(type, anim, dir, frame, img) {
    const cfg = UNIT3D_V2[type];
    const rec = unit3dV2.types[type];
    if (!cfg || !rec || !img) return false;
    try {
      const c = makeCanvas(cfg.w * U_BAKE, cfg.h * U_BAKE);
      const cx = c.getContext('2d');
      if (!cx) return false;
      if ('imageSmoothingEnabled' in cx) cx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';

      // Кадр 256px садится якорем (128,206) в точку (ax,ay) канвы.
      // Масштаб одинаков для всех кадров типа — размер не «дышит».
      const k = (cfg.frame * U_BAKE) / UNIT3D_V2_SRC;
      cx.drawImage(img,
        cfg.ax * U_BAKE - UNIT3D_V2_GX * k,
        cfg.ay * U_BAKE - UNIT3D_V2_GY * k,
        UNIT3D_V2_SRC * k, UNIT3D_V2_SRC * k);

      rec.sprites[anim][dir][frame] = c;
      unit3dV2.frames++;
      return true;
    } catch (e) {
      return false;
    }
  }

  function unit3dV2Begin() {
    if (unit3dV2.started) return;
    unit3dV2.started = true;
    // Без DOM (тесты логики) картинки не грузим — остаётся векторный арт.
    if (typeof document === 'undefined' || typeof Image !== 'function') return;

    const types = Object.keys(UNIT3D_V2);
    const queue = [];

    types.forEach(function (type) {
      const rec = { sprites: {}, ready: false, broken: false, loaded: 0, total: 0 };
      Object.keys(UNIT3D_V2_ANIMS).forEach(function (anim) {
        const n = UNIT3D_V2_ANIMS[anim];
        const dirs = new Array(8);
        for (let d = 0; d < 8; d++) dirs[d] = new Array(n).fill(null);
        rec.sprites[anim] = dirs;
        rec.total += n * 8;
        for (let d = 0; d < 8; d++) {
          for (let f = 0; f < n; f++) queue.push({ type: type, anim: anim, dir: d, frame: f });
        }
      });
      unit3dV2.types[type] = rec;
      unit3dV2.total += rec.total;
    });

    let next = 0;
    let active = 0;

    function release(rec) {
      Object.keys(rec.sprites).forEach(function (anim) {
        const dirs = rec.sprites[anim];
        for (let d = 0; d < dirs.length; d++) dirs[d].length = 0;
      });
    }

    function finish(task, ok) {
      const rec = unit3dV2.types[task.type];
      active--;
      if (!ok) rec.broken = true;
      rec.loaded++;
      if (rec.loaded >= rec.total) {
        if (!rec.broken) {
          rec.ready = true;
          unit3dV2.readyTypes++;
          unit3dV2.ready = true;
        } else {
          release(rec);
        }
      }
      pump();
    }

    function start(task) {
      active++;
      let img;
      try {
        img = new Image();
      } catch (e) {
        unit3dV2.failed++;
        finish(task, false);
        return;
      }

      img.onload = function () {
        unit3dV2.loaded++;
        // пустой onload (0×0) считаем ошибкой: рисовать нечего
        const baked = img.width > 0 && img.height > 0 &&
          bakeUnit3dV2(task.type, task.anim, task.dir, task.frame, img);
        if (!baked) unit3dV2.failed++;
        finish(task, baked);
      };
      img.onerror = function () {
        unit3dV2.failed++;
        finish(task, false);
      };

      try {
        img.src = 'assets/units3d-v2/' + task.type + '/' + task.anim +
          '/dir' + task.dir + '_' + task.frame + '.png';
      } catch (e) {
        unit3dV2.failed++;
        finish(task, false);
      }
    }

    function pump() {
      while (active < UNIT3D_V2_LOAD && next < queue.length) {
        start(queue[next++]);
      }
    }

    pump();
  }

  unit3dV2Begin();

  // Кадр анимации для живого юнита. Удар — окно u.atk (0.18 с), шаг —
  // фаза unitMotion, покой — медленное дыхание 2 кадра. Мёртвый юнит
  // держит последний кадр падения (в бою смерть рисуется отдельно).
  const UNIT3D_V2_ATTACK = 0.18;
  function unit3dV2Anim(u, m) {
    // инструментам: принудительный кадр для контактных листов и сцены-чека
    if (typeof u.__v2anim === 'string' && UNIT3D_V2_ANIMS[u.__v2anim] != null) {
      const n = UNIT3D_V2_ANIMS[u.__v2anim];
      const f = Math.max(0, Math.min(n - 1, u.__v2frame | 0));
      return { anim: u.__v2anim, frame: f };
    }
    if (u.dead === true) {
      const dt = Number(u.deathT);
      return { anim: 'death', frame: isFinite(dt) && dt > 0
        ? Math.min(3, Math.floor(dt * 8)) : 3 };
    }
    if (u.atk > 0) {
      const q = Math.max(0, Math.min(1, 1 - u.atk / UNIT3D_V2_ATTACK));
      return { anim: 'attack', frame: Math.min(2, Math.floor(q * 3)) };
    }
    if (m && m.walking) {
      // 4 кадра на тот же шаг, что раньше занимали 2: полный цикл — две
      // единицы phase, поэтому двойка сохраняет прежнюю длину шага.
      const f = Math.floor(m.phase * 2) % 4;
      return { anim: 'walk', frame: f < 0 ? f + 4 : f };
    }
    const f = Math.floor(t * 2.4 + ((u.id || 0) % 7) * 0.37) % 2;
    return { anim: 'idle', frame: f < 0 ? f + 2 : f };
  }

  // Обёртка-кэш: drawUnit ждёт { canvas, ax, ay, w, h }. Сами кадры уже
  // уменьшены при загрузке; здесь один объект на сочетание кадр+направление.
  function unitSpriteV2(type, dir, anim, frame) {
    const canvas = unit3dV2Sprite(type, anim, dir, frame);
    const cfg = UNIT3D_V2[type];
    if (!canvas || !cfg) return null;

    const key = '3dv2|' + type + '|' + dir + '|' + anim + '|' + frame;
    const hit = unitSpriteCache.get(key);
    if (hit) {
      unitBakes.hits++;
      unitSpriteCache.delete(key);
      unitSpriteCache.set(key, hit);
      return hit;
    }

    const sp = { canvas: canvas, ax: cfg.ax, ay: cfg.ay, w: cfg.w, h: cfg.h };
    if (unitSpriteCache.size >= 448) {
      const first = unitSpriteCache.keys().next().value;
      if (first !== undefined) unitSpriteCache.delete(first);
    }
    unitSpriteCache.set(key, sp);
    return sp;
  }

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

    // Инструментам нужен принудительный ракурс (линейка героев, контактный
    // лист): сцена-чек и бой это поле не ставят.
    if (typeof u.__dir === 'number' && isFinite(u.__dir)) {
      m.dir = ((Math.round(u.__dir) % UNIT_DIRS) + UNIT_DIRS) % UNIT_DIRS;
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
  // уровень, а рисунок — ступени детализации, чтобы не плодить канвы
  function unitTier(lvl) {
    const l = Number(lvl) || 1;
    return l >= 20 ? 5 : (l >= 15 ? 4 : (l >= 8 ? 3 : (l >= 4 ? 2 : 1)));
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
      // точный уровень нужен герою: с 6-го добавляются золото и вымпел,
      // а полосы различия считаются не по трём ступеням, а по одному шагу
      lvl: Number(lvl) || 1,
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
    // кроме дульного среза отдаём крепление: герою нужен тяжёлый приклад
    return { x: x1, y: y1, ox: ox, oy: oy };
  }

  /* --- штурмовик: широкие плечи, карабин, ранец --- */
  function artBarb(ctx, q, color) {
    const armor = mix(PAL.metal, color, 0.42);
    const armorLight = mix(PAL.metalLight, color, 0.32);
    const armorDark = shade(armor, -0.3);

    unitLegs(ctx, q, {
      col: armorDark, boot: PAL.metalDark,
      spread: 2.7, w: 3.8, hip: -7.6, stride: 4.0
    });

    // наколенники и ремни бёдер: ноги читаются отдельно от корпуса
    const kx = q.p.x * 2.4;
    uBox(ctx, -kx - 1.7, -5.1 + q.p.y * 0.7, 3.4, 1.8, 0.6, armorLight);
    uBox(ctx, kx - 1.7, -5.1 - q.p.y * 0.7, 3.4, 1.8, 0.6, armor);
    uBox(ctx, -kx - 1.2, -7.2, 2.4, 1.0, 0.3, PAL.metalDark);
    uBox(ctx, kx - 1.2, -7.2, 2.4, 1.0, 0.3, PAL.metalDark);

    // ранец за спиной: два баллона, вентиляция и антенна
    if (q.fy < 0.58) {
      const px = -q.f.x * 2.4;
      uBox(ctx, px - 4.6, -17.8, 5.6, 8.6, 1.6, PAL.metalDark);
      uBox(ctx, px - 3.9, -17.2, 1.8, 7.0, 0.7, PAL.metal);
      uBox(ctx, px - 1.9, -17.2, 1.8, 7.0, 0.7, PAL.metal);
      uBox(ctx, px - 4.1, -16.4, 4.8, 2.0, 0.7, PAL.metalLight);
      uBar(ctx, px - 3.0, -18.0, px - 3.4, -20.4, 0.8, PAL.metalLight);
      spot(ctx, px - 3.4, -20.6, 0.8, PAL.cyan);
      spot(ctx, px - 1.3, -14.4, 0.8, PAL.glass);
    }

    unitTorso(ctx, q, {
      col: armor, top: -18.8, bot: -7, w: 10.6, shoulder: 11.2,
      panel: PAL.panel, belt: PAL.metalDark
    });

    // нагрудная пластина с фаской и янтарной полосой
    poly(ctx, [
      { x: -4.4 + q.f.x * 0.8, y: -16.4 },
      { x: 4.4 + q.f.x * 0.8, y: -16.4 },
      { x: 3.6 + q.f.x * 0.8, y: -10.4 },
      { x: -3.6 + q.f.x * 0.8, y: -10.4 }
    ], armorLight);
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(-3.6 + q.f.x * 0.8, -13.4, 7.2, 1.3);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(-3.2 + q.f.x * 0.8, -16.1, 6.4, 0.7);
    // подсумки на поясе
    uBox(ctx, -4.2, -8.6, 2.2, 1.8, 0.4, PAL.metalDark);
    uBox(ctx, 2.0, -8.6, 2.2, 1.8, 0.4, PAL.metalDark);

    // плечи: дальнее темнее, ближнее светлее; второй слой — пластина
    const shx = q.p.x * 5.9;
    const shy = -17.4 + q.p.y * 5.9 * 0.5;
    spot(ctx, -shx, shy - q.p.y * 2.4, 2.7, shade(armor, -0.18));
    spot(ctx, shx, shy, 3.0, armorLight);
    spot(ctx, -shx, shy - q.p.y * 2.4, 2.0, shade(armor, -0.05));
    spot(ctx, shx, shy - 0.4, 2.1, mix(armorLight, PAL.panel, 0.4));
    if (q.tier >= 2) {
      spot(ctx, shx, shy - 0.5, 1.1, q.tier >= 3 ? PAL.gold : PAL.cold);
      spot(ctx, -shx, shy - q.p.y * 2.4, 0.8, PAL.cold);
    }

    // оружие: перед корпусом при взгляде спереди, за ним — со спины
    const drawGun = function () {
      const g = unitGun(ctx, q, 2.2, 3.4, 14.5, 2.7, PAL.metalDark, PAL.glass,
        'rgba(255,207,74,.9)', -13);
      const gx = g.x - g.ox;
      const gy = g.y - g.oy;
      const len = Math.hypot(gx, gy) || 1;
      const ux = gx / len;
      const uy = gy / len;

      // приклад и оптика
      poly(ctx, [
        { x: g.ox - ux * 2.6 - 1.6, y: g.oy - uy * 2.6 - 0.6 },
        { x: g.ox - ux * 2.6 + 1.4, y: g.oy - uy * 2.6 - 1.4 },
        { x: g.ox + ux * 0.6 + 1.6, y: g.oy + uy * 0.6 + 1.2 },
        { x: g.ox + ux * 0.6 - 1.4, y: g.oy + uy * 0.6 + 1.8 }
      ], armorDark);
      uBox(ctx, g.ox + ux * 4.2 - 1.0, g.oy + uy * 4.2 - 2.4, 2.0, 1.5, 0.5, PAL.dark);
      spot(ctx, g.ox + ux * 4.2, g.oy + uy * 4.2 - 2.5, 0.6, PAL.glass);

      // хват: передняя рука на цевье, тёмная перчатка
      spot(ctx, g.ox + ux * 8.6, g.oy + uy * 8.6 + 0.4, 1.8, armorDark);
      spot(ctx, g.ox + ux * 0.8, g.oy + uy * 0.8 + 1.4, 1.9, armorDark);
      uBar(ctx, g.ox + ux * 6.0, g.oy + uy * 6.0 + 1.4,
        g.ox + ux * 7.4, g.oy + uy * 7.4 + 1.4, 1.0, PAL.metalDark);
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 3.9, y: -22.7, col: PAL.panel, visor: PAL.glass, antenna: PAL.metalLight
    });

    // гребень шлема и наушники: силуэт головы не «шарик»
    uBox(ctx, -0.45 + q.f.x * 0.3, -27.1, 0.9, 2.1, 0.3, q.tier >= 3 ? PAL.gold : PAL.cold);
    spot(ctx, -q.p.x * 3.3, -22.6 + q.p.y * 1.1, 1.4, PAL.metalDark);
    spot(ctx, q.p.x * 3.3, -22.6 - q.p.y * 1.1, 1.4, PAL.metalDark);
    if (q.fy > -0.25) {
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(-2.0 + q.f.x * 0.4, -20.9, 4.0, 1.0);
    }

    if (q.fy >= -0.2) drawGun();
    // ствол поверх плеча легче читается
    if (q.tier >= 3) spot(ctx, 2.5 + q.f.x * 4, -20.2, 0.8, PAL.gold);
  }

  /* --- сержант: тяжёлый штурмовик, песочная броня с красным и золотом ---
     Рисуется в 1.6 раза крупнее штурмовика: массивный шлем с бирюзовым
     визором и антенной, наплечники, плащ и ручной бластер-дробовик.
     С 6 уровня появляются золотые полосы, второй наплечник, вымпел,
     сенсоры, свечение визора и длинный плащ — силуэт читается сразу. */
  const HERO_RED = '#a8402f';
  const HERO_RED_DARK = '#712a21';

  /* --- пять героев ---
     Каждый рисуется как своё базовое войско, но на 12–16% крупнее и с
     золото-бирюзовой аурой. h/w — итоговый силуэт для тени и HP-бара,
     scale — масштаб базового арта, headY/headR и sh/shY — точки, куда
     ложатся геройские акценты (визор, наплечник, кокпит). */
  const HERO_KINDS = {
    barb: {
      base: 'barb', h: 27.4, w: 1.12, scale: 1.14,
      cape: '#8f3a2a', capeDark: '#5b2317',
      capeW: 0.34, capeHem: 0.07,
      headY: -22.7, headR: 3.9, headForward: 0.4,
      sh: 5.9, shY: -17.4
    },
    archer: {
      base: 'archer', h: 25.1, w: 0.89, scale: 1.14,
      cape: '#1d5f5c', capeDark: '#123c3a',
      capeW: 0.29, capeHem: 0.30,
      headY: -21.6, headR: 3.3, headForward: 0.4,
      sh: 4.0, shY: -17.2
    },
    giant: {
      base: 'giant', h: 41.0, w: 1.84, scale: 1.14,
      cape: null, capeDark: null,
      headY: -33.4, headR: 4.4, headForward: 0.2,
      sh: 8.6, shY: -26.4
    },
    goblin: {
      base: 'goblin', h: 19.4, w: 0.82, scale: 1.14,
      cape: '#7a3a26', capeDark: '#4b2117',
      capeW: 0.32, capeHem: 0.24,
      headY: -15.4, headR: 3.4, headForward: 1.6,
      sh: 4.2, shY: -10.9
    },
    airship: {
      base: 'airship', h: 34.2, w: 1.42, scale: 1.14,
      cape: null, capeDark: null,
      headY: -30, headR: 3, headForward: 0,
      sh: 0, shY: 0
    },
    dragon: {
      base: 'dragon', h: 37.4, w: 1.92, scale: 1.1,
      cape: null, capeDark: null,
      headY: -27, headR: 3.4, headForward: 0.2,
      sh: 0, shY: 0
    }
  };

  function heroKindOf(u) {
    if (!u || u.type !== 'hero') return '';
    const k = u.heroKind;
    return (typeof k === 'string' && HERO_KINDS[k]) ? k : '';
  }

  // Визуальный вид юнита: геройский kind, вид питомца или осады.
  // Нужен и кэшу спрайтов, и силуэту тени/HP-бара.
  function unitVariantOf(u) {
    if (!u) return '';
    if (u.type === 'hero') return heroKindOf(u);
    if (u.type === 'pet') {
      if (typeof u.petKind === 'string' && PET_ART[u.petKind]) return u.petKind;
      if (typeof u.kind === 'string' && PET_ART[u.kind]) return u.kind;
      return '';
    }
    if (u.type === 'siege') {
      if (typeof u.siegeKind === 'string' && SIEGE_ART[u.siegeKind]) return u.siegeKind;
      if (typeof u.kind === 'string' && SIEGE_ART[u.kind]) return u.kind;
      return '';
    }
    if (u.type === 'guardian') {
      const g = u.guardianKind || u.kind || u.guardianId || u.gid;
      if (typeof g === 'string' && GUARDIAN_ART[g]) return g;
      return 'longshot';
    }
    if (PET_ART[u.type]) return u.type;
    if (SIEGE_ART[u.type]) return u.type;
    if (GUARDIAN_ART[u.type]) return u.type;
    return '';
  }

  // Силуэт для тени, купола и HP-бара: у нового героя — по базовому войску,
  // у старого героя без heroKind — прежний крупный сержант.
  function unitSpecOf(u) {
    if (u && u.type === 'hero') {
      const k = heroKindOf(u);
      if (k) return HERO_KINDS[k];
    }
    if (u) {
      const v = unitVariantOf(u);
      if (u.type === 'pet' || PET_ART[u.type]) {
        return PET_ART[v] || PET_ART[u.type] || { h: 14, w: 0.7 };
      }
      if (u.type === 'siege' || SIEGE_ART[u.type]) {
        return SIEGE_ART[v] || SIEGE_ART[u.type] || { h: 26, w: 1.5 };
      }
      if (u.type === 'guardian' || GUARDIAN_ART[u.type]) {
        return GUARDIAN_ART[v] || GUARDIAN_ART[u.type] ||
          UNIT_SPEC[u.type] || { h: 38, w: 1.6 };
      }
    }
    return (u && UNIT_SPEC[u.type]) || { h: 20, w: 1 };
  }

  // Общая аура: мягкое золото-бирюзовое свечение и кольцо на грунте.
  // Рисуется до фигуры, поэтому не съедает контур и не мешает щиту.
  function heroAura(ctx, q, cfg) {
    const bh = cfg.h / cfg.scale;
    const flying = cfg.base === 'airship' || cfg.base === 'dragon';
    const cy = -bh * (flying ? 0.84 : 0.54);
    const glow = ctx.createRadialGradient(0, cy, 1, 0, cy, bh * 0.84);
    glow.addColorStop(0, 'rgba(255,207,74,.16)');
    glow.addColorStop(0.44, 'rgba(70,224,200,.10)');
    glow.addColorStop(1, 'rgba(70,224,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, cy, bh * 0.50, bh * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    if (flying) {
      // У дрона кольцо вокруг корпуса, а не на земле: иначе герой
      // выглядит стоящим на посадочной площадке.
      const rx = bh * 0.58;
      const ry = bh * 0.24;
      ctx.strokeStyle = 'rgba(255,207,74,.62)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, -30, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(70,224,200,.60)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, -30, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
      spot(ctx, -rx * 0.88, -30, 0.8, PAL.gold);
      spot(ctx, rx * 0.88, -30, 0.7, PAL.cold);
      return;
    }

    const rx = Math.min(18, bh * 0.50);
    // Ниже якоря в спрайте всего 12 px: у меха кольцо чуть приплюснуто,
    // чтобы нижняя дуга не обрезалась канвой.
    const ry = Math.max(3.2, Math.min(11.5, rx * GQ));
    ctx.strokeStyle = 'rgba(255,207,74,.62)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,224,200,.58)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, rx * 0.76, ry * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
    spot(ctx, -rx * 0.86, 0.2, 0.8, PAL.gold);
    spot(ctx, rx * 0.86, 0.2, 0.7, PAL.cold);
  }

  // Плащ героя: короткая накидка позади фигуры. У меха и дрона её нет.
  function heroCape(ctx, q, cfg) {
    if (!cfg.cape) return;
    const bh = cfg.h / cfg.scale;
    const half = bh * (cfg.capeW || 0.34);
    // Плащ начинается у плеч, а не у шлема: иначе на фронтальном ракурсе
    // он превращает голову в широкий прямоугольник. У снайпера и главаря
    // он короче, чтобы читались ноги и оружие.
    const top = cfg.shY - 1.2;
    const hem = -bh * (cfg.capeHem == null ? 0.07 : cfg.capeHem);
    const bx = -q.f.x * bh * 0.08;
    const by = -q.f.y * bh * 0.05;
    const sway = q.step * 0.9;

    poly(ctx, [
      { x: -q.p.x * half * 0.80 + bx, y: top + by },
      { x: q.p.x * half * 0.80 + bx, y: top + by },
      { x: q.p.x * half + bx + sway, y: hem + 1.2 },
      { x: bx - q.p.x * 1.2 + q.f.x * 1.2, y: hem + 2.6 },
      { x: -q.p.x * half + bx - sway * 0.7, y: hem + 0.5 }
    ], cfg.cape);
    poly(ctx, [
      { x: -q.p.x * half * 0.38 + bx, y: top + by + 1.0 },
      { x: q.p.x * half * 0.42 + bx, y: top + by + 1.0 },
      { x: q.p.x * half * 0.56 + bx + sway * 0.6, y: hem + 0.2 },
      { x: bx + q.p.x * 0.4 + q.f.x * 0.9, y: hem + 2.2 }
    ], cfg.capeDark);
    uBar(ctx, -q.p.x * half * 0.75 + bx, top + by + 0.6,
      q.p.x * half * 0.75 + bx, top + by + 0.6, 0.8,
      'rgba(255,207,74,.55)');
  }

  // Угловатый медный наплечник с золотой кромкой и бирюзовой заклёпкой.
  // Пехоте хватает одного, ближнего: два круга читались бы как «уши».
  function heroShoulder(ctx, q, cfg) {
    if (!cfg.sh) return;
    const r = Math.max(1.9, Math.min(3.8, cfg.sh * 0.42));
    const two = cfg.base === 'giant' || cfg.base === 'barb';
    const count = two ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const s = two ? (n === 0 ? -1 : 1) : 1;
      const near = s > 0;
      const x = q.p.x * cfg.sh * s;
      const y = cfg.shY + q.p.y * cfg.sh * s * 0.5;

      ctx.fillStyle = 'rgba(6,9,12,.46)';
      ctx.beginPath();
      ctx.ellipse(x + 0.4, y + 0.8, r * 1.16, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      poly(ctx, [
        { x: x - r * 1.10, y: y + r * 0.35 },
        { x: x - r * 0.70, y: y - r * 0.75 },
        { x: x + r * 0.55, y: y - r * 0.95 },
        { x: x + r * 1.10, y: y + r * 0.15 },
        { x: x + r * 0.65, y: y + r * 0.90 },
        { x: x - r * 0.55, y: y + r * 0.90 }
      ], near ? '#96421f' : '#5e2b1a');

      poly(ctx, [
        { x: x - r * 0.70, y: y - r * 0.70 },
        { x: x + r * 0.50, y: y - r * 0.90 },
        { x: x + r * 0.98, y: y - r * 0.05 },
        { x: x - r * 0.15, y: y - r * 0.10 }
      ], near ? '#c46a3a' : '#7a3a26');

      ctx.strokeStyle = near ? PAL.gold : 'rgba(196,106,58,.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.70, y - r * 0.70);
      ctx.lineTo(x + r * 0.50, y - r * 0.90);
      ctx.lineTo(x + r * 1.00, y - r * 0.05);
      ctx.stroke();
      spot(ctx, x + q.p.x * 0.3, y - r * 0.15, 0.55,
        near ? PAL.cold : 'rgba(70,224,200,.4)');
    }
  }

  // Визор/гребень у пехотных героев: золотая бровь и бирюзовая полоса.
  function heroHeadAccent(ctx, q, cfg, kind) {
    if (kind === 'giant' || kind === 'airship' || kind === 'dragon') return;
    const hx = q.f.x * (cfg.headForward || 0.4) + q.p.x * q.step * 0.25;
    const hy = cfg.headY;
    const r = cfg.headR;
    if (q.fy > -0.22) {
      ctx.fillStyle = 'rgba(70,224,200,.26)';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 0.1, r * 1.26, r * 0.74, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(hx - r * 0.9, hy - 0.35, r * 1.8, 0.7);
      ctx.fillStyle = '#bafff5';
      ctx.fillRect(hx - r * 0.64, hy - 0.12, r * 1.28, 0.65);
      uBar(ctx, hx - 0.5, hy - r - 2.5, hx + 0.5, hy - r - 1.3, 0.9, PAL.gold);
      spot(ctx, hx, hy - r - 2.7, 0.7, PAL.cold);
    } else {
      uBar(ctx, hx - r * 0.6, hy - 1.0, hx + r * 0.6, hy - 1.0, 0.8, PAL.gold);
      spot(ctx, hx, hy - 1.8, 0.6, PAL.cold);
    }
  }

  // Мех-командир: золотая рама кокпита и бирюзовое сердце.
  function heroGiantAccent(ctx, q, cfg) {
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-5.8, -27.4, 11.6, 6.4, 1.5);
    else ctx.rect(-5.8, -27.4, 11.6, 6.4);
    ctx.stroke();
    poly(ctx, [
      { x: 0, y: -22.6 }, { x: 2.4, y: -20.2 },
      { x: 0, y: -17.8 }, { x: -2.4, y: -20.2 }
    ], PAL.cold);
    spot(ctx, 0, -20.2, 0.9, PAL.gold);
    uBar(ctx, -4.2, -30.4, 4.2, -30.4, 1.0, PAL.gold);
    spot(ctx, -cfg.sh, cfg.shY, 0.8, PAL.cold);
    spot(ctx, cfg.sh, cfg.shY, 0.8, PAL.cold);
  }

  // Пилот-дрон: золотая окантовка кокпита и полосы на крыльях.
  function heroDroneAccent(ctx, q, cfg) {
    const cy = -30;
    const cx = q.f.x * 8;
    const cyy = cy + q.f.y * 8 - 1;
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(cx, cyy, 4.1, 2.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    spot(ctx, cx, cyy, 2.6, 'rgba(70,224,200,.30)');
    spot(ctx, cx, cyy, 1.5, PAL.cold);
    spot(ctx, cx - 0.6, cyy - 0.6, 0.5, 'rgba(255,255,255,.85)');
    for (let s = -1; s <= 1; s += 2) {
      const ax = q.f.x * 2 + q.p.x * 11 * s;
      const ay = cy + q.f.y * 2 + q.p.y * 11 * s;
      const bx = q.f.x * 8 + q.p.x * 10 * s;
      const by = cy + q.f.y * 8 + q.p.y * 10 * s;
      uBar(ctx, ax, ay, bx, by, 0.9, 'rgba(255,207,74,.78)');
    }
    spot(ctx, q.f.x * 16, cy + q.f.y * 16, 1.2, PAL.gold);
  }

  // Герой-«базовое войско»: аура → плащ → фигура → золото/бирюза.
  function artHeroKind(ctx, q, kind) {
    const cfg = HERO_KINDS[kind];
    if (!cfg) return;
    const baseType = cfg.base;
    const def = CC.TROOPS[baseType] || {};
    const color = def.color || PAL.wood;

    ctx.save();
    ctx.scale(cfg.scale, cfg.scale);
    heroAura(ctx, q, cfg);
    heroCape(ctx, q, cfg);

    if (baseType === 'giant') artGiant(ctx, q, color);
    else if (baseType === 'archer') artArcher(ctx, q, color);
    else if (baseType === 'goblin') artGoblin(ctx, q, color);
    else if (baseType === 'airship') artDrone(ctx, q, color);
    else if (baseType === 'dragon') artWing(ctx, q, MONS.dragon);
    else artBarb(ctx, q, color);

    heroShoulder(ctx, q, cfg);
    if (kind === 'giant') heroGiantAccent(ctx, q, cfg);
    else if (kind === 'airship') heroDroneAccent(ctx, q, cfg);
    else heroHeadAccent(ctx, q, cfg, kind);
    ctx.restore();
  }

  function artHero(ctx, q, color) {
    const lvl = Math.max(1, Math.min(10, Math.round(q.lvl || 1)));
    const vet = lvl >= 6;       // ветеран: золото, вымпел, длинный плащ
    const elite = lvl >= 8;
    const ace = lvl >= 10;

    // Масштаб ровно ×1.5 относительно прежней фигуры. Рисуем в локальных
    // координатах со ступнями в (0,0): якорь, тень и полоска HP не меняются.
    ctx.save();
    ctx.scale(HERO_SCALE, HERO_SCALE);

    // песочный металл: тёплый, а не серо-зелёный — цвет войска только
    // подмешивается, чтобы сержант оставался узнаваемым в любой палитре
    const sand = mix(PAL.metalLight, color, 0.72);
    const sandLight = mix(PAL.panel, color, 0.52);
    const sandDark = shade(sand, -0.36);
    const cloth = mix(HERO_RED, PAL.metalDark, 0.12);
    const gunMetal = '#3d454b';
    const trim = vet ? PAL.gold : PAL.amber;
    const glow = vet ? PAL.glass : PAL.cold;

    const step = q.step;
    const sway = step * (q.frame === 1 || q.frame === 2 ? 1 : 0);

    // пыль из-под тяжёлых ботинок — статичная, чтобы не тратить частицы
    if (step !== 0) {
      ctx.fillStyle = 'rgba(226,205,172,.20)';
      ctx.beginPath();
      ctx.ellipse(-q.p.x * 4.4 - q.f.x * 2.4, -0.7, 4.2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 1. плащ: шире корпуса, иначе его не видно спереди; с 6 уровня
    // длиннее, с 10 — с золотой кромкой по низу
    const capeHalf = (vet ? 13.2 : 11.8) * (1 - 0.12 * Math.abs(q.fx));
    const hem = vet ? (elite ? -2.6 : -4.6) : -7.0;
    const bx = -q.f.x * 2.2;
    const by = -q.f.y * 1.6;
    const hemSway = q.p.x * sway * 2.0;

    poly(ctx, [
      { x: -q.p.x * capeHalf * 0.84 + bx, y: -27.4 + by },
      { x: q.p.x * capeHalf * 0.84 + bx, y: -27.4 + by },
      { x: q.p.x * capeHalf + bx + hemSway, y: hem + 1.4 },
      { x: bx - q.p.x * 1.6 + q.f.x * 1.8, y: hem + 3.8 },
      { x: -q.p.x * capeHalf + bx - hemSway * 0.7, y: hem - 0.8 }
    ], cloth);

    // тёмная изнанка и глубокая складка
    poly(ctx, [
      { x: -q.p.x * capeHalf * 0.42 + bx, y: -26 + by },
      { x: q.p.x * capeHalf * 0.46 + bx, y: -26 + by },
      { x: q.p.x * capeHalf * 0.62 + bx + hemSway * 0.6, y: hem + 0.6 },
      { x: bx + q.p.x * 0.5 + q.f.x * 1.4, y: hem + 2.6 }
    ], mix(cloth, PAL.dark, 0.5));

    // блик по верхней кромке плаща: силуэт отделяется от грунта
    ctx.strokeStyle = vet ? 'rgba(255,207,74,.5)' : 'rgba(240,222,196,.32)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-q.p.x * capeHalf * 0.84 + bx, -27.4 + by);
    ctx.lineTo(q.p.x * capeHalf * 0.84 + bx, -27.4 + by);
    ctx.stroke();

    if (vet) {
      uBar(ctx, -q.p.x * capeHalf * 0.9 + bx, hem - 0.2,
        q.p.x * capeHalf * 0.92 + bx, hem + 1.6, ace ? 1.3 : 0.9, trim);
    }

    // 2. ноги: широкая стойка, тяжёлый шаг
    unitLegs(ctx, q, {
      col: sandDark, boot: PAL.metalDark,
      spread: 4.6, w: 5.2, hip: -13.0, stride: 4.9, foot: 3.4
    });

    // наколенники: две пластины, читаются на шаге
    const kneeX = q.p.x * 3.0;
    uBox(ctx, -kneeX - 1.7 + q.f.x * 0.6, -8.4 + q.p.y * 1.2, 3.4, 2.0, 0.7, sandDark);
    uBox(ctx, kneeX - 1.7 + q.f.x * 0.6, -8.4 - q.p.y * 1.2, 3.4, 2.0, 0.7, shade(sand, -0.16));

    // 3. оружие за корпусом, если сержант стоит спиной
    const drawGun = function () {
      const g = unitGun(ctx, q, 3.0, 4.2, 21, 5.0, gunMetal, trim,
        'rgba(255,207,74,.95)', -22);
      const gx = g.x - g.ox;
      const gy = g.y - g.oy;
      const len = Math.hypot(gx, gy) || 1;
      const ux = gx / len;
      const uy = gy / len;

      // казённик, приклад и золотая накладка
      uBox(ctx, g.ox + ux * 3.4 - 2.9, g.oy + uy * 3.4 - 2.9, 5.8, 6.2, 1.4, PAL.metal);
      uBox(ctx, g.ox + ux * 3.4 - 1.6, g.oy + uy * 3.4 - 1.4, 3.2, 2.8, 0.6, trim);
      poly(ctx, [
        { x: g.ox - ux * 3.4 - 2.6, y: g.oy - uy * 3.4 - 1.0 },
        { x: g.ox + ux * 0.4 - 2.6, y: g.oy + uy * 0.4 - 2.2 },
        { x: g.ox + ux * 0.4 + 2.2, y: g.oy + uy * 0.4 + 1.6 },
        { x: g.ox - ux * 3.4 + 2.4, y: g.oy - uy * 3.4 + 2.0 }
      ], gunMetal);

      // цевьё и коробчатый магазин
      uBox(ctx, g.ox + ux * 11 - 2.5, g.oy + uy * 11 - 2.0, 5.0, 4.2, 1.0, gunMetal);
      uBox(ctx, g.ox + ux * 10.4 - 1.2, g.oy + uy * 10.4 + 1.1, 2.4, 3.0, 0.6, PAL.metalLight);

      // руки в перчатках: у казённика и на цевье
      spot(ctx, g.ox + ux * 3.0, g.oy + uy * 3.0 + 1.4, 2.3, sandDark);
      spot(ctx, g.ox + ux * 12.4, g.oy + uy * 12.4 - 0.4, 2.0, sandDark);

      // дульный тормоз крупнее ствола
      uBar(ctx, g.x - ux * 3.0, g.y - uy * 3.0, g.x + ux * 0.9, g.y + uy * 0.9, 6.0, gunMetal);
      uBar(ctx, g.x - ux * 2.6, g.y - uy * 2.6, g.x + ux * 0.6, g.y + uy * 0.6, 1.6, PAL.metalLight);
      uBar(ctx, g.x - ux * 2.0, g.y - uy * 2.0, g.x + ux * 0.2, g.y + uy * 0.2, 0.8, trim);
      // красная метка на цевье — тяжёлое оружие сержанта
      uBar(ctx, g.ox + ux * 7.4, g.oy + uy * 7.4,
        g.ox + ux * 9.2, g.oy + uy * 9.2, 1.2, HERO_RED);

      if (q.atk) {
        uFlash(ctx, g.x + ux * 3.6, g.y + uy * 3.6, 4.4, 'rgba(127,233,255,.92)');
        spot(ctx, g.x + ux * 3.6, g.y + uy * 3.6, 1.5, 'rgba(255,255,255,.96)');
      }
    };
    if (q.fy < -0.15) drawGun();

    // 4. ранец: тяжёлый, с вентиляцией и красной полосой
    if (q.fy < 0.62) {
      const px = -q.f.x * 3.8;
      const py = -24.5;
      uBox(ctx, px - 4.2, py - 5.4, 8.4, 11.4, 1.8, PAL.metalDark);
      uBox(ctx, px - 3.3, py - 4.4, 6.6, 4.2, 0.9, PAL.metal);
      uBox(ctx, px - 3.3, py + 1.2, 6.6, 2.2, 0.7, HERO_RED_DARK);
      spot(ctx, px - 1.9, py - 2.4, 0.9, glow);
      spot(ctx, px + 1.9, py - 2.4, 0.9, glow);
      uBar(ctx, px - 2.6, py - 5.4, px - 2.1, py - 7.4, 1, PAL.metalLight);
      uBar(ctx, px + 2.6, py - 5.4, px + 2.1, py - 7.4, 1, PAL.metalLight);
    }

    // 5. корпус: широкий, с нагрудной пластиной
    unitTorso(ctx, q, {
      col: sand, top: -29.2, bot: -10, w: 16.2, shoulder: 17.2,
      panel: sandLight, belt: PAL.metalDark
    });
    uBox(ctx, -5.2 + q.f.x * 0.9, -22.6, 10.4, 2.0, 0.6, HERO_RED);
    spot(ctx, q.f.x * 0.9, -21.6, 1.1, trim);
    uBox(ctx, -5.8, -30.2, 11.6, 2.2, 0.8, sandDark);

    // воротник-накидка поверх плеч: красный виден с любого направления,
    // даже когда сам плащ скрыт корпусом
    poly(ctx, [
      { x: -10.2, y: -29.8 },
      { x: 10.2, y: -29.8 },
      { x: 9.0, y: -25.8 },
      { x: -9.0, y: -25.8 }
    ], cloth);
    uBar(ctx, -9.7, -27.4, 9.7, -27.4, vet ? 1.1 : 0.8, trim);
    spot(ctx, 0, -28.3, 1.5, trim);
    spot(ctx, 0, -28.3, 0.7, HERO_RED_DARK);

    // полосы различия: 1 — с 6 уровня, 2 — с 8, 3 — с 10
    const stripes = vet ? (ace ? 3 : (elite ? 2 : 1)) : 0;
    for (let i = 0; i < stripes; i++) {
      uBar(ctx, -8.2 + q.f.x * 0.9, -26.4 + i * 1.7,
        -3.6 + q.f.x * 0.9, -26.4 + i * 1.7, 1.25, trim);
    }
    // у рядового на груди — красная нашивка, чтобы силуэт не был пустым
    if (!vet) {
      uBox(ctx, -7.6 + q.f.x * 0.9, -26.2, 2.6, 1.5, 0.4, HERO_RED_DARK);
    }

    // 6. наплечники: пластины, а не шары — дальний тёмный, ближний светлый
    // на шаге наплечники чуть уходят в сторону опорной ноги — тяжёлая
    // походка читается даже в покое кадра
    const shSway = step * 0.45;
    const shx = q.p.x * 8.4 + q.p.x * shSway;
    const shy = -27.8 + q.p.y * 8.4 * 0.5 + q.p.y * shSway * 0.6;
    const fsx = -q.p.x * 8.4 + q.p.x * shSway * 0.5;
    const fsy = -27.8 - q.p.y * 8.4 * 0.5 + q.p.y * shSway * 0.3;

    const plate = function (px, py, r, base, edge, near) {
      // нижняя тень
      ctx.fillStyle = shade(base, near ? -0.3 : -0.44);
      ctx.beginPath();
      ctx.ellipse(px, py + 1.0, r, r * 0.74, 0, 0, Math.PI * 2);
      ctx.fill();
      // сама пластина
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(px, py - 0.7, r * 0.96, r * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      // красный кант по нижней дуге
      ctx.strokeStyle = HERO_RED;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(px, py + 0.2, r * 0.86, r * 0.56, 0, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      // золотая кромка и заклёпка
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.ellipse(px, py - r * 0.44, r * 0.62, r * 0.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      spot(ctx, px + r * 0.28, py - r * 0.12, r * 0.17, edge);
    };

    plate(fsx, fsy, 5.0, shade(sand, -0.08), vet ? trim : PAL.metalLight, false);
    if (vet) {
      // второй наплечник: нижняя пластина на дальней руке
      plate(fsx - q.p.x * 1.2, fsy + 3.0, 3.6, shade(sand, -0.2),
        trim, false);
    }

    // 7. шлем: тяжёлый купол, визор, дыхательная маска, антенна
    const hx = q.f.x * 0.8 + q.p.x * step * 0.35;
    const hy = -36.6;

    if (vet) {
      // свечение визора: узкое пятно по линии глаз, а не шар за головой
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * (0.2 + (ace ? 0.12 : 0) + (q.atk ? 0.16 : 0));
      ctx.fillStyle = PAL.cold;
      ctx.beginPath();
      ctx.ellipse(hx, hy + 0.1, 7.6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = prev * (0.1 + (ace ? 0.08 : 0));
      ctx.beginPath();
      ctx.ellipse(hx, hy + 0.1, 10.2, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = prev;
    }

    // шея
    uBar(ctx, hx - 2.5, -31.2, hx - 2.1, -33.6, 3.2, sandDark);
    uBar(ctx, hx + 2.5, -31.2, hx + 2.1, -33.6, 3.2, sandDark);

    spot(ctx, hx, hy, 6.0, sandDark);
    spot(ctx, hx, hy - 0.3, 5.3, sand);
    // гребень шлема: тяжёлый, с золотым кантом у ветерана
    poly(ctx, [
      { x: hx - 1.3, y: hy - 6.2 },
      { x: hx + 1.3, y: hy - 6.2 },
      { x: hx + 2.3, y: hy - 3.1 },
      { x: hx - 2.3, y: hy - 3.1 }
    ], vet ? shade(sand, 0.16) : sandLight);
    uBar(ctx, hx - 4.8, hy - 3.2, hx + 4.8, hy - 3.2, 1.8, sandLight);
    uBar(ctx, hx - 4.6, hy - 4.4, hx + 4.6, hy - 4.4, 0.9, vet ? trim : sandDark);
    // надбровная плита нависает над визором
    ctx.fillStyle = sandDark;
    ctx.fillRect(hx - 4.8, hy - 2.4, 9.6, 1.4);

    // красный ромб на гребне — знак сержанта, виден спереди и в профиль
    if (q.fy > -0.35) {
      poly(ctx, [
        { x: hx, y: hy - 6.0 },
        { x: hx + 1.3, y: hy - 4.8 },
        { x: hx, y: hy - 3.7 },
        { x: hx - 1.3, y: hy - 4.8 }
      ], HERO_RED);
      spot(ctx, hx, hy - 4.8, 0.45, trim);
    }

    if (q.fy > -0.2) {
      // визор
      const vy = hy + 0.3;
      uBox(ctx, hx - 4.3, vy - 1.8, 8.6, 3.3, 1.3, PAL.dark);
      uBox(ctx, hx - 3.8, vy - 1.3, 7.6, 2.5, 1.0, glow);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(hx - 2.7, vy - 0.9, 3.2, 0.8);
      if (vet) {
        ctx.fillStyle = trim;
        ctx.fillRect(hx - 3.8, vy + 1.4, 7.6, 0.55);
      }

      // дыхательная маска
      poly(ctx, [
        { x: hx - 3.2, y: hy + 2.2 },
        { x: hx + 3.2, y: hy + 2.2 },
        { x: hx + 2.2, y: hy + 5.4 },
        { x: hx - 2.2, y: hy + 5.4 }
      ], shade(sandDark, 0.06));
      uBar(ctx, hx - 1.8, hy + 3.4, hx + 1.8, hy + 3.4, 0.8, PAL.dark);
      uBar(ctx, hx - 1.4, hy + 4.5, hx + 1.4, hy + 4.5, 0.8, PAL.dark);

      if (vet) {
        // сенсоры на визоре
        spot(ctx, hx - 4.6, hy + 0.6, 1.0, trim);
        spot(ctx, hx + 4.6, hy + 0.6, 1.0, glow);
      }
    } else {
      // со спины: вентиляционная пластина и затылочные щели
      uBox(ctx, hx - 3.1, hy - 2.2, 6.2, 4.4, 1.0, sandDark);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = PAL.dark;
        ctx.fillRect(hx - 2.2, hy - 1.4 + i * 1.3, 4.4, 0.7);
      }
      if (vet) spot(ctx, hx, hy + 1.4, 0.9, trim);
    }

    // антенна с бирюзовым огоньком и вымпелом
    const ax = hx - 3.2;
    const ay = hy - 4.4;
    const tipx = ax - 2.7 - q.p.x * 1.1;
    const tipy = ay - 9.0;
    uBar(ctx, ax, ay, tipx, tipy, 1.0, PAL.metalLight);
    spot(ctx, tipx, tipy - 0.4, 1.0, glow);

    if (vet) {
      // вымпел на антенне: красное полотнище с золотой кромкой
      poly(ctx, [
        { x: tipx, y: tipy + 0.8 },
        { x: tipx - q.f.x * 6.8 - q.p.x * 2.6 - 2.0, y: tipy - 2.0 },
        { x: tipx - q.f.x * 6.0 - q.p.x * 2.6 - 2.2, y: tipy + 3.4 }
      ], HERO_RED);
      uBar(ctx, tipx, tipy + 0.6,
        tipx - q.f.x * 6.4 - q.p.x * 2.6 - 2.0, tipy - 1.6, 0.7, trim);
      spot(ctx, tipx - q.f.x * 3.0 - 1.0, tipy + 0.4, 0.5, trim);
    }

    // сенсорные бляхи на шлеме (с 6 уровня)
    if (vet) {
      spot(ctx, hx + q.p.x * 4.4, hy - 1.2 + q.p.y * 1.2, 1.0, trim);
      spot(ctx, hx - q.p.x * 4.4, hy - 1.2 - q.p.y * 1.2, 0.9, glow);
    }

    // 8. ближний наплечник — поверх корпуса, под шлемом
    plate(shx, shy, 5.4, mix(sand, sandLight, 0.35), vet ? trim : PAL.metalLight, true);
    if (vet) {
      uBar(ctx, shx - 3.8, shy + 2.0, shx + 3.8, shy + 2.0, 1.0, trim);
      spot(ctx, shx + q.p.x * 2.4, shy - 1.0, 0.9, trim);
    }

    // 9. оружие перед корпусом
    if (q.fy >= -0.15) drawGun();

    ctx.restore();
  }

  /* --- лазерщик: тонкий силуэт, длинная винтовка, батарея --- */
  function artArcher(ctx, q, color) {
    const suit = mix(PAL.metalDark, color, 0.34);
    const suitLight = mix(PAL.metal, color, 0.28);
    const dark = shade(suit, -0.26);

    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark,
      spread: 2.1, w: 2.9, hip: -7.2, stride: 4.0
    });

    // полы плаща: узкая тёмная накидка за ногами
    if (q.fy < 0.55) {
      poly(ctx, [
        { x: -3.3 - q.f.x * 1.8, y: -9.6 },
        { x: 3.3 - q.f.x * 1.8, y: -9.6 },
        { x: 3.9 - q.f.x * 2.4, y: -2.4 },
        { x: -3.9 - q.f.x * 2.4, y: -2.4 }
      ], shade(color, -0.42));
    }

    // батарея с двумя ячейками, кабелем и антенной
    if (q.fy < 0.6) {
      const bx = -4.6 - q.f.x * 2.4;
      uBox(ctx, bx, -16.6, 3.4, 8.2, 1.1, PAL.metalDark);
      uBox(ctx, bx + 0.35, -16.0, 2.7, 3.2, 0.6, PAL.metal);
      uBox(ctx, bx + 0.35, -12.2, 2.7, 3.0, 0.6, PAL.metal);
      ctx.fillStyle = PAL.cyan;
      ctx.fillRect(bx + 0.7, -15.4, 1.0, 2.0);
      ctx.fillRect(bx + 0.7, -11.6, 1.0, 1.8);
      // кабель к винтовке
      ctx.strokeStyle = 'rgba(38,52,58,.8)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(bx + 1.4, -16.4);
      ctx.quadraticCurveTo(bx + 3.2, -18.8, -1.6 + q.f.x * 1.2, -15.6);
      ctx.stroke();
      uBar(ctx, bx + 1.2, -16.6, bx + 0.2, -21.4, 0.7, PAL.metalLight);
      spot(ctx, bx + 0.2, -21.6, 0.8, PAL.glass);
    }

    unitTorso(ctx, q, {
      col: suit, top: -18.4, bot: -6.8, w: 8.2, shoulder: 8.8,
      panel: shade(suit, 0.18), belt: PAL.metalDark
    });

    // светлая накидка на плечах и тонкий пояс
    poly(ctx, [
      { x: -3.6 + q.f.x * 0.6, y: -17.8 },
      { x: 3.6 + q.f.x * 0.6, y: -17.8 },
      { x: 2.9 + q.f.x * 0.6, y: -13.4 },
      { x: -2.9 + q.f.x * 0.6, y: -13.4 }
    ], suitLight);
    uBar(ctx, -3.4, -9.0, 3.4, -9.0, 0.8, PAL.metalDark);

    // длинная лазерная винтовка
    const drawGun = function () {
      const g = unitGun(ctx, q, 1.8, 2.6, 19, 2.1, PAL.metalDark, PAL.cyan,
        'rgba(127,233,255,.95)', -12.5);
      const gx = g.x - g.ox;
      const gy = g.y - g.oy;
      const len = Math.hypot(gx, gy) || 1;
      const ux = gx / len;
      const uy = gy / len;
      const px = -uy;
      const py = ux;

      // катушка ускорителя: три кольца вдоль ствола
      ctx.strokeStyle = 'rgba(70,224,200,.82)';
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const k = 0.34 + i * 0.19;
        const cx = g.ox + ux * len * k;
        const cy = g.oy + uy * len * k;
        ctx.beginPath();
        ctx.moveTo(cx - px * 1.9, cy - py * 1.9);
        ctx.lineTo(cx + px * 1.9, cy + py * 1.9);
        ctx.stroke();
      }
      // тонкий светящийся сердечник
      uBar(ctx, g.ox + ux * 3, g.oy + uy * 3,
        g.x - ux * 1.2, g.y - uy * 1.2, 0.45, 'rgba(196,255,250,.8)');

      // приклад, оптика и руки
      uBox(ctx, g.ox - ux * 2.0 - 1.2, g.oy - uy * 2.0 - 0.8, 2.4, 2.4, 0.5, PAL.metal);
      uBox(ctx, g.ox + ux * 4.2 - 0.9, g.oy + uy * 4.2 - 2.2, 1.8, 1.4, 0.4, PAL.dark);
      spot(ctx, g.ox + ux * 4.2, g.oy + uy * 4.2 - 2.4, 0.55, PAL.glass);
      spot(ctx, g.ox + ux * 8.4, g.oy + uy * 8.4 + 0.3, 1.5, dark);

      // светящийся наконечник
      spot(ctx, g.x + q.f.x * 0.8, g.y + q.f.y * 0.4, 1.4, PAL.glass);
      if (q.atk) {
        spot(ctx, g.x + ux * 3.4, g.y + uy * 3.4, 2.6, 'rgba(196,255,250,.55)');
        spot(ctx, g.x + ux * 3.4, g.y + uy * 3.4, 1.2, 'rgba(255,255,255,.9)');
      }
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 3.3, y: -21.6, col: mix(PAL.panel, color, 0.15),
      visor: PAL.glass, antenna: PAL.cyan
    });

    // капюшон/гребень и наушник
    poly(ctx, [
      { x: -2.6 + q.f.x * 0.3, y: -24.6 },
      { x: 2.6 + q.f.x * 0.3, y: -24.6 },
      { x: 1.7 + q.f.x * 0.3, y: -22.4 },
      { x: -1.7 + q.f.x * 0.3, y: -22.4 }
    ], shade(suit, -0.12));
    spot(ctx, q.p.x * 2.8, -21.7 + q.p.y * 0.9, 1.0, PAL.metalDark);

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
    const shellLight = mix(PAL.metalLight, color, 0.22);
    const dark = shade(shell, -0.32);

    // ноги: толстые, с поршнями по бокам
    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark, spread: 4.6, w: 5.8, hip: -10, stride: 4.4, foot: 3
    });
    uBar(ctx, -6.2 + q.p.x * 1.8, -10.4, -7.4 + q.p.x * 2.6, -4.8, 1.3, PAL.metalDark);
    uBar(ctx, 6.2 + q.p.x * 1.8, -10.4, 7.4 + q.p.x * 2.6, -4.8, 1.3, PAL.metalLight);

    // дальняя рука-манипулятор с клешнёй
    const farX = -7.4 - q.p.x * 1.2;
    const farY = -23 + q.p.y * 1.4;
    uBar(ctx, farX, farY, -11 + q.f.x * 2, -14, 3.0, shade(shell, -0.22));
    spot(ctx, -11 + q.f.x * 2, -14, 2.3, PAL.metalDark);
    ctx.strokeStyle = PAL.rust;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11 + q.f.x * 2, -14);
    ctx.lineTo(-13.6 + q.f.x * 3, -12.4);
    ctx.moveTo(-11 + q.f.x * 2, -14);
    ctx.lineTo(-13.2 + q.f.x * 3, -15.6);
    ctx.stroke();

    // корпус с боковыми рёбрами
    unitTorso(ctx, q, {
      col: shell, top: -28.6, bot: -9.8, w: 18, shoulder: 19,
      panel: PAL.metalDark, belt: PAL.metalDark
    });
    uBar(ctx, -8.6, -24.6, -6.6, -12.4, 1.0, shade(shell, -0.2));
    uBar(ctx, 8.6, -24.6, 6.6, -12.4, 1.0, shade(shell, -0.2));
    uBar(ctx, 8.6, -24.6, 6.6, -12.4, 0.4, 'rgba(232,244,248,.35)');

    // кабина: рама, стекло и болты
    uBox(ctx, -5.8, -27.4, 11.6, 6.4, 1.5, PAL.metalLight);
    ctx.fillStyle = PAL.glass;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-4.0, -25.8, 8.0, 2.9, 1.1);
    else ctx.rect(-4.0, -25.8, 8.0, 2.9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.fillRect(-3.2, -25.4, 3.2, 0.8);
    spot(ctx, -5.2, -27.0, 0.7, PAL.metalDark);
    spot(ctx, 5.2, -27.0, 0.7, PAL.metalDark);
    if (q.fy < -0.2) {
      // со спины виден реактор
      spot(ctx, 0, -27.2, 3.2, PAL.metalDark);
      spot(ctx, 0, -27.2, 2.0, q.tier >= 3 ? PAL.gold : PAL.amber);
      ctx.strokeStyle = 'rgba(255,207,74,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -27.2, 3.4, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (q.fy > 0.4) {
      // спереди — решётка охлаждения под кабиной
      for (let i = 0; i < 3; i++) {
        uBar(ctx, -3.4, -19.6 + i * 1.3, 3.4, -19.6 + i * 1.3, 0.7, PAL.metalDark);
      }
    }

    // плечевые блоки: тёмная подложка, светлая пластина, заклёпки
    const gx = q.p.x * 8.6;
    const gy = -26.4 + q.p.y * 8.6 * 0.5;
    spot(ctx, gx, gy, 4.5, PAL.metalDark);
    spot(ctx, gx, gy, 3.4, shellLight);
    spot(ctx, -gx, -26.4 - q.p.y * 8.6 * 0.5, 4.2, shade(shell, -0.2));
    spot(ctx, -gx, -26.4 - q.p.y * 8.6 * 0.5, 2.9, shell);
    spot(ctx, gx + q.p.x * 2.2, gy - 0.6, 0.9, PAL.metalDark);
    spot(ctx, -gx - q.p.x * 2.2, -26.4 - q.p.y * 8.6 * 0.5 - 0.6, 0.8, PAL.metalDark);

    // ракетная установка на дальнем плече — со 2 ступени
    if (q.tier >= 2) {
      const rx0 = -gx - q.p.x * 1.6;
      const ry0 = -29.4 - q.p.y * 4.3;
      uBox(ctx, rx0 - 2.8, ry0 - 1.6, 5.6, 4.0, 1.0, PAL.metalDark);
      for (let i = 0; i < 2; i++) {
        spot(ctx, rx0 - 1.2 + i * 2.4, ry0 - 0.2, 0.9, PAL.dark);
        spot(ctx, rx0 - 1.2 + i * 2.4, ry0 - 0.5, 0.45, PAL.amber);
      }
    }

    // ближняя рука + орудие на плече
    const drawGun = function () {
      const g = unitGun(ctx, q, 8.6, 3.4, 16, 3.9, PAL.metalDark, PAL.gold,
        'rgba(255,207,74,.95)', -20);
      // короб с лентой и кожух
      uBox(ctx, g.ox - 2.6, g.oy + 1.4, 4.2, 3.4, 1.0, PAL.metalDark);
      spot(ctx, g.ox + 0.6, g.oy + 2.2, 1.5, PAL.rust);
      uBar(ctx, g.ox + 3.2, g.oy + 3.2, g.ox + 7.0, g.oy + 3.6, 1.0, PAL.amber);
      // дульный тормоз
      uBar(ctx, g.x - 2.2, g.y - 1.4, g.x + 0.8, g.y + 0.2, 5.2, PAL.metalDark);
      uBar(ctx, g.x - 2.0, g.y - 1.6, g.x + 0.5, g.y - 0.4, 1.2, PAL.metalLight);
    };
    if (q.fy < -0.2) drawGun();

    unitHead(ctx, q, {
      r: 4.4, y: -33.4, col: PAL.metalLight, visor: PAL.amber, forward: 0.2,
      antenna: PAL.metalDark
    });
    // сенсорный блок и антенна
    spot(ctx, 0.8 + q.f.x * 0.4, -34.4, 1.2, PAL.metalDark);
    spot(ctx, 1.2 + q.f.x * 0.4, -34.6, 0.6, PAL.cold);
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
      spot(ctx, -6.4, -13.4, 0.9, PAL.gold);
      spot(ctx, 6.4, -13.4, 0.9, PAL.gold);
    }
  }

  /* --- мародёр: низкий, горбатый, клешня и мешок с добычей --- */
  function artGoblin(ctx, q, color) {
    const body = mix(PAL.metalDark, color, 0.45);
    const bodyLight = mix(PAL.metal, color, 0.3);
    const dark = shade(body, -0.28);

    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark,
      spread: 2.2, w: 3.0, hip: -5.2, stride: 3.2
    });
    // обмотки на голенях
    uBar(ctx, -q.p.x * 1.4 - 1.0, -3.4, -q.p.x * 1.4 + 1.0, -2.6, 1.0, PAL.rust);
    uBar(ctx, q.p.x * 1.4 - 1.0, -3.4, q.p.x * 1.4 + 1.0, -2.6, 1.0, PAL.rust);

    // мешок с добычей на спине: стянутая горловина и золото
    if (q.fy < 0.62) {
      const sx = -3.8 - q.f.x * 2.2;
      spot(ctx, sx, -9.2, 4.3, PAL.metalDark);
      spot(ctx, sx - 0.3, -9.7, 3.4, mix(PAL.amber, body, 0.5));
      spot(ctx, sx - 1.1, -10.6, 1.0, PAL.gold);
      spot(ctx, sx + 1.3, -8.3, 0.8, PAL.gold);
      uBar(ctx, sx - 2.2, -11.4, sx + 2.0, -12.0, 1.1, PAL.rust);
      // ремень через грудь
      uBar(ctx, sx + 1.0, -11.2, 3.0 + q.f.x * 0.4, -5.8, 1.0, PAL.rust);
    }

    unitTorso(ctx, q, {
      col: body, top: -12.8, bot: -5, w: 8.2, shoulder: 8.8,
      panel: bodyLight, belt: PAL.metalDark
    });
    // нагрудные ремни и подсумки
    uBar(ctx, -3.4, -11.6, 2.0, -6.4, 0.9, PAL.rust);
    uBar(ctx, 3.4, -11.6, -1.8, -6.6, 0.9, shade(PAL.rust, -0.2));
    uBox(ctx, -3.8, -7.2, 2.2, 1.8, 0.4, PAL.metalDark);
    uBox(ctx, 1.8, -7.2, 2.2, 1.8, 0.4, PAL.metalDark);

    // голова выдвинута вперёд: капюшон, моно-визор и дыхательная маска
    unitHead(ctx, q, {
      r: 3.4, y: -15.4, col: mix(PAL.metal, color, 0.28), visor: PAL.amber,
      forward: 1.6, antenna: PAL.metalDark
    });
    poly(ctx, [
      { x: -2.9 + q.f.x * 1.8, y: -18.0 },
      { x: 2.9 + q.f.x * 1.8, y: -18.0 },
      { x: 2.3 + q.f.x * 1.8, y: -15.6 },
      { x: -2.3 + q.f.x * 1.8, y: -15.6 }
    ], shade(body, 0.12));
    if (q.fy > -0.25) {
      spot(ctx, 0 + q.f.x * 1.9, -14.6, 1.2, PAL.amber);
      ctx.fillStyle = PAL.metalDark;
      ctx.fillRect(-1.3 + q.f.x * 1.9, -13.6, 2.6, 0.9);
    }

    // клешня-манипулятор: запястье и два зуба
    const reach = q.atk ? 3.2 : 0;
    const gx = 4.6 + q.f.x * (4 + reach);
    const gy = -8.4 + q.f.y * (4 + reach);
    uBar(ctx, 3, -9.4, gx, gy, 1.7, PAL.metalLight);
    spot(ctx, gx, gy, 1.8, PAL.metalDark);
    ctx.strokeStyle = PAL.amber;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + q.f.x * 2 - q.p.x * 1.4, gy + q.f.y * 2 - q.p.y * 1.4,
      gx + q.f.x * 3.2 - q.p.x * 1.6, gy + q.f.y * 3.2 - q.p.y * 1.6);
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + q.f.x * 2 + q.p.x * 1.4, gy + q.f.y * 2 + q.p.y * 1.4,
      gx + q.f.x * 3.2 + q.p.x * 1.6, gy + q.f.y * 3.2 + q.p.y * 1.6);
    ctx.stroke();
    if (q.atk) {
      spot(ctx, gx + q.f.x * 3.4, gy + q.f.y * 3.4, 1.1, PAL.gold);
    }

    // вторая рука прижимает добычу к поясу
    spot(ctx, -3.4 + q.f.x * 1.0, -6.6, 1.6, dark);
    spot(ctx, -3.5 + q.f.x * 1.0, -6.9, 0.7, PAL.gold);

    if (q.tier >= 2) {
      spot(ctx, -2.8, -9.6, 0.9, q.tier >= 3 ? PAL.gold : PAL.cyan);
      spot(ctx, 2.8, -9.6, 0.9, q.tier >= 3 ? PAL.gold : PAL.cyan);
    }
    if (q.tier >= 3) {
      uBar(ctx, -3.0, -12.6, 3.0, -12.6, 0.8, PAL.gold);
      spot(ctx, 0, -12.9, 0.8, PAL.gold);
    }
  }

  /* --- подрывник: коренастый, бур над головой, заряд на поясе --- */
  function artGnome(ctx, q, color) {
    const suit = mix(PAL.metal, color, 0.4);
    const suitLight = mix(PAL.metalLight, color, 0.24);
    const dark = shade(suit, -0.3);

    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark,
      spread: 3, w: 3.9, hip: -6.2, stride: 3.2
    });
    // стальные наколенники
    const kx = q.p.x * 3.0;
    uBox(ctx, -kx - 1.8, -4.4 + q.p.y * 0.6, 3.6, 1.8, 0.5, suitLight);
    uBox(ctx, kx - 1.8, -4.4 - q.p.y * 0.6, 3.6, 1.8, 0.5, suit);

    unitTorso(ctx, q, {
      col: suit, top: -14.4, bot: -6, w: 11.4, shoulder: 11.8,
      panel: PAL.metalDark, belt: PAL.metalDark
    });
    // нагрудная пластина и предупреждающие полосы
    poly(ctx, [
      { x: -4.6 + q.f.x * 0.8, y: -13.2 },
      { x: 4.6 + q.f.x * 0.8, y: -13.2 },
      { x: 3.8 + q.f.x * 0.8, y: -8.4 },
      { x: -3.8 + q.f.x * 0.8, y: -8.4 }
    ], suitLight);
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(-3.0 + q.f.x * 0.8, -12.2, 2.2, 1.0);
    ctx.fillStyle = PAL.metalDark;
    ctx.fillRect(0.8 + q.f.x * 0.8, -12.2, 2.2, 1.0);
    // пояс с шашками заряда
    uBox(ctx, -5.2, -7.0, 2.0, 2.4, 0.4, PAL.rust);
    uBox(ctx, 3.2, -7.0, 2.0, 2.4, 0.4, PAL.rust);
    spot(ctx, -4.2, -6.4, 0.5, PAL.amber);
    spot(ctx, 4.2, -6.4, 0.5, PAL.amber);

    // заряд за спиной: ранец, баллон и кабель к буру
    const bx = -7.4 - q.f.x * 1.4;
    uBox(ctx, bx, -15.8, 3.4, 6.8, 1.0, PAL.dark);
    uBox(ctx, bx + 0.4, -15.2, 2.6, 2.4, 0.6, PAL.rust);
    if (q.fy < 0.55) {
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(bx + 0.7, -14.6, 1.8, 1.2);
      spot(ctx, bx + 2.4, -16.6, 1.1, PAL.cyan);
    }
    ctx.strokeStyle = 'rgba(40,36,30,.75)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(bx + 2.2, -16.4);
    ctx.quadraticCurveTo(-2.4, -18.4, q.f.x * 1.2 - 1.0, -16.2);
    ctx.stroke();

    // бур: широкий конус над головой, в атаке наклоняется вперёд
    const swing = q.atk ? 0.55 : 0;
    ctx.save();
    ctx.translate(q.f.x * 1.2, -15);
    ctx.rotate(0.35 + swing);

    // станина и гидравлические тяги
    uBox(ctx, -2.2, -6.4, 4.4, 6.6, 1.0, PAL.metalDark);
    uBar(ctx, -3.4, -0.4, -2.6, -5.4, 1.2, PAL.metalDark);
    uBar(ctx, 3.4, -0.4, 2.6, -5.4, 1.2, PAL.metalDark);

    // конус с винтовой нарезкой
    ctx.fillStyle = PAL.metalLight;
    ctx.fillRect(-1.9, -6.2, 3.8, 6.2);
    poly(ctx, [
      { x: -4.8, y: -6 }, { x: 4.8, y: -6 }, { x: 0, y: -19 }
    ], PAL.metalLight);
    poly(ctx, [
      { x: 4.8, y: -6 }, { x: 0, y: -19 }, { x: 0, y: -6 }
    ], shade(PAL.metalLight, -0.2));
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const yy = -6 - i * 2.9;
      const w = 3.7 - i * 0.82;
      ctx.moveTo(-w, yy);
      ctx.lineTo(w, yy - 1.4);
    }
    ctx.stroke();
    // вращающееся кольцо и искра
    ctx.strokeStyle = 'rgba(255,207,74,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -6.2, 4.6, 1.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    spot(ctx, 0, -19.4, 1.2, q.atk ? PAL.gold : PAL.cyan);
    if (q.atk) {
      uFlash(ctx, 0, -20.6, 2.6, 'rgba(255,207,74,.85)');
    }
    ctx.restore();

    // шлем с лампой и наушниками
    unitHead(ctx, q, {
      r: 3.8, y: -18.9, col: PAL.panel, visor: PAL.glass, antenna: PAL.metalDark
    });
    spot(ctx, -q.p.x * 3.1, -18.8 + q.p.y * 0.8, 1.3, PAL.metalDark);
    spot(ctx, q.p.x * 3.1, -18.8 - q.p.y * 0.8, 1.3, PAL.metalDark);
    if (q.fy > -0.3) {
      // лампа на лбу и очки
      spot(ctx, 0 + q.f.x * 0.6, -21.2, 1.0, PAL.glass);
      spot(ctx, 0.3 + q.f.x * 0.6, -21.3, 0.45, 'rgba(255,255,255,.9)');
    }
    if (q.tier >= 2) {
      ctx.fillStyle = q.tier >= 3 ? PAL.gold : PAL.amber;
      ctx.fillRect(-1.2, -22.0, 2.4, 1.3);
    }
  }

  /* --- дрон: корпус с носом по курсу, винты и крен на повороте --- */
  function artDrone(ctx, q, color) {
    const hull = mix(PAL.metal, color, 0.32);
    const hullLight = mix(PAL.metalLight, color, 0.2);
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

    // хвостовое оперение: два пера и стабилизатор
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
    uBar(ctx, tx - q.p.x * 6.5, ty - q.p.y * 6.5 - 1.4,
      tx + q.f.x * 3.2 - q.p.x * 1.3, ty + q.f.y * 3.2 - q.p.y * 1.3, 0.8,
      'rgba(232,244,248,.35)');

    // несущие балки винтов
    const arms = [
      { a: 7, b: 11 }, { a: 7, b: -11 },
      { a: -6, b: 10 }, { a: -6, b: -10 }
    ];
    ctx.strokeStyle = PAL.metalDark;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < arms.length; i++) {
      const ax = q.f.x * arms[i].a + q.p.x * arms[i].b;
      const ay = q.f.y * arms[i].a + q.p.y * arms[i].b;
      ctx.beginPath();
      ctx.moveTo(q.f.x * 2, q.f.y * 2);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }
    // светлая кромка балок
    ctx.strokeStyle = 'rgba(190,206,214,.42)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < arms.length; i++) {
      const ax = q.f.x * arms[i].a + q.p.x * arms[i].b;
      const ay = q.f.y * arms[i].a + q.p.y * arms[i].b;
      ctx.beginPath();
      ctx.moveTo(q.f.x * 2, q.f.y * 2 - 0.8);
      ctx.lineTo(ax, ay - 0.8);
      ctx.stroke();
    }

    // корпус: тень, бронеплита и светлая панель сверху
    ctx.fillStyle = shade(hull, -0.22);
    ctx.beginPath();
    ctx.ellipse(0, 2.2, 14, 7, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.6, 6.4, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hullLight;
    ctx.beginPath();
    ctx.ellipse(q.f.x * 1.2, -1.4, 8, 3.2, ang, 0, Math.PI * 2);
    ctx.fill();

    // панельные линии и заклёпки
    ctx.strokeStyle = 'rgba(28,38,44,.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0.4, 10.6, 4.6, ang, 0.3, Math.PI * 2 - 0.3);
    ctx.stroke();
    if (q.tier >= 2) {
      spot(ctx, q.f.x * 4 - q.p.x * 5, q.f.y * 4 - q.p.y * 5 + 2, 0.6, PAL.metalDark);
      spot(ctx, q.f.x * 4 + q.p.x * 5, q.f.y * 4 + q.p.y * 5 + 2, 0.6, PAL.metalDark);
    }

    // носовой обтекатель, кабина и сенсорный «глаз»
    ctx.fillStyle = shade(color, 0.08);
    ctx.beginPath();
    ctx.ellipse(nx, ny, 4.2, 5.2, ang, 0, Math.PI * 2);
    ctx.fill();
    const cxx = q.f.x * 8;
    const cyy = q.f.y * 8 - 1;
    spot(ctx, cxx, cyy, 3.1, PAL.metalDark);
    spot(ctx, cxx, cyy, 2.2, PAL.glass);
    spot(ctx, cxx - 0.8, cyy - 0.8, 0.9, 'rgba(255,255,255,.7)');
    // камера-гимбал под носом
    spot(ctx, nx * 0.8, ny + 2.6, 1.7, PAL.metalDark);
    spot(ctx, nx * 0.8, ny + 2.9, 0.9, PAL.cold);

    // винты: кадры шага и атаки дают разное положение лопастей
    const spin = q.frame === 2 ? Math.PI / 2 : (q.frame === 1 ? 0.4 : (q.atk ? Math.PI / 4 : 0));
    const bladeA = q.atk ? 0.55 : 0.85;
    for (let i = 0; i < arms.length; i++) {
      const ax = q.f.x * arms[i].a + q.p.x * arms[i].b;
      const ay = q.f.y * arms[i].a + q.p.y * arms[i].b;
      // кольцо кожуха винта
      ctx.strokeStyle = 'rgba(76,86,92,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ax, ay, 6.4, 3.2, ang, 0, Math.PI * 2);
      ctx.stroke();
      spot(ctx, ax, ay, 3.4, PAL.metalDark);
      spot(ctx, ax, ay, 2.2, PAL.metalLight);
      const rr = 6.8;
      ctx.strokeStyle = 'rgba(154,167,173,' + bladeA + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(spin + i) * rr, ay - Math.sin(spin + i) * rr * 0.5);
      ctx.lineTo(ax + Math.cos(spin + i) * rr, ay + Math.sin(spin + i) * rr * 0.5);
      ctx.stroke();
      // второй лопастной луч — винт читается диском
      ctx.strokeStyle = 'rgba(154,167,173,' + (bladeA * 0.45) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(spin + i + Math.PI / 2) * rr * 0.8,
        ay - Math.sin(spin + i + Math.PI / 2) * rr * 0.4);
      ctx.lineTo(ax + Math.cos(spin + i + Math.PI / 2) * rr * 0.8,
        ay + Math.sin(spin + i + Math.PI / 2) * rr * 0.4);
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
    spot(ctx, -q.f.x * 14, cy - q.f.y * 14 - 2, 0.9, PAL.roof);
    if (q.tier >= 2) {
      ctx.strokeStyle = q.tier >= 3 ? PAL.gold : PAL.cold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, cy, 15, 6, ang, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (q.tier >= 3) {
      uBar(ctx, -q.f.x * 4 + q.p.x * 8, cy - q.f.y * 4 + q.p.y * 8,
        q.f.x * 8 + q.p.x * 8, cy + q.f.y * 8 + q.p.y * 8, 0.8, PAL.gold);
    }
  }

  /* ======================================================================
     НОВЫЕ ВОЙСКА (P4)
     Каждый класс отвечает за роль: caster — поддержка/призыв, ranger —
     дальний, brute — тяжёлый ближний, beast — танк на четырёх лапах,
     wing — воздух. Уровень меняет отделку (tier 2 — холодный кант,
     tier 3 — золото), поэтому L1 и L20 читаются по-разному.
     ====================================================================== */

  /* --- маги, лекари, призыватели: балахон, посох, сфера --- */
  function artCaster(ctx, q, c) {
    const L = q.tier;
    const robe = c.robe;
    const dark = c.robeDark;
    const trim = c.trim || PAL.cold;
    const hover = !!c.float;
    const hem = hover ? -4.5 : -1.6;
    const top = -18.2;
    const sway = q.p.x * q.step * 1.2;

    if (hover) {
      // тёмное облачко под парящим: ног нет
      ctx.fillStyle = 'rgba(30,22,38,.28)';
      ctx.beginPath();
      ctx.ellipse(0, -1.4, 6.4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,170,255,.30)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, -2.2, 4.6, 1.6, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else {
      unitLegs(ctx, q, {
        col: dark, boot: PAL.metalDark,
        spread: 2.2, w: 2.8, hip: -6.6, stride: 3.2
      });
    }

    // балахон: трапеция с подолом, тёмная изнанка и светлая пола
    poly(ctx, [
      { x: -4.1, y: top },
      { x: 4.1, y: top },
      { x: 5.8 + sway, y: hem + 0.6 },
      { x: 0 + sway, y: hem + 1.8 },
      { x: -5.8 + sway, y: hem + 0.4 }
    ], robe);
    poly(ctx, [
      { x: -2.6, y: top + 1.4 },
      { x: 2.6, y: top + 1.4 },
      { x: 3.1 + sway, y: hem - 0.2 },
      { x: -3.1 + sway, y: hem - 0.2 }
    ], dark);
    // подол с кантом
    uBar(ctx, -5.4 + sway, hem + 0.8, 5.4 + sway, hem + 0.8,
      L >= 2 ? 1.1 : 0.7, L >= 3 ? PAL.gold : trim);
    // пояс
    uBar(ctx, -3.8, -9.4, 3.8, -9.4, 1.3, L >= 3 ? PAL.gold : trim);

    // накидка на плечах
    poly(ctx, [
      { x: -4.8, y: top + 0.8 },
      { x: 4.8, y: top + 0.8 },
      { x: 3.4, y: -12.8 },
      { x: -3.4, y: -12.8 }
    ], shade(robe, 0.14));

    // посох: древко, кольцо и сфера
    const sx = -6.6 + q.p.x * 0.8;
    uBar(ctx, sx, hem + 0.6, sx + q.f.x * 1.2, -25.5, 1.4, '#5c4a3a');
    ring(ctx, sx + q.f.x * 1.2, -27, 2.8, 2.8 * 0.9,
      L >= 3 ? PAL.gold : trim, 0.9);
    spot(ctx, sx + q.f.x * 1.2, -27, 1.7, c.orb || trim);
    spot(ctx, sx + q.f.x * 1.2 - 0.4, -27.5, 0.7, 'rgba(255,255,255,.85)');

    // голова: капюшон и светящиеся глаза
    const hx = q.f.x * 0.5 + q.p.x * q.step * 0.2;
    spot(ctx, hx, -20.8, 3.4, shade(robe, 0.2));
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(hx, -21.2, 2.9, 0, Math.PI * 2);
    ctx.fill();
    spot(ctx, hx + q.fx * 0.7, -21.4, 0.75, c.orb || PAL.glass);
    spot(ctx, hx - q.p.x * 0.9, -21.4, 0.6, c.orb || PAL.glass);

    if (c.skull) {
      // костяная маска на груди
      spot(ctx, q.f.x * 0.4, -14.4, 1.9, 'rgba(232,226,210,.85)');
      spot(ctx, q.f.x * 0.4 - 0.7, -14.8, 0.45, '#2a2222');
      spot(ctx, q.f.x * 0.4 + 0.7, -14.8, 0.45, '#2a2222');
    }
    if (c.halo) {
      ring(ctx, hx, -25.2, 3.2, 1.2,
        L >= 3 ? 'rgba(255,207,74,.75)' : 'rgba(127,233,255,.6)', 0.9);
    }

    // атака: сфера вспыхивает, из руки идёт луч
    if (q.atk) {
      uFlash(ctx, sx + q.f.x * 1.2, -27, 4.4, c.orb || 'rgba(200,170,255,.8)');
      spot(ctx, sx + q.f.x * 1.2, -27, 1.6, 'rgba(255,255,255,.95)');
      uBar(ctx, sx + q.f.x * 1.2, -27,
        sx + q.f.x * 1.2 + q.f.x * 9, -27 + q.f.y * 9, 1, trim);
    }
    if (L >= 2) spot(ctx, q.p.x * 4.4, top + 1.4, 1.1, L >= 3 ? PAL.gold : trim);
  }

  /* --- дальний бой: диск, топор, клинки, бур, шар --- */
  function artRanger(ctx, q, c) {
    const L = q.tier;
    const S = c.big ? 1.12 : 1;
    const suit = c.suit;
    const light = c.suitLight;
    const acc = c.acc || PAL.cold;
    const dark = shade(suit, -0.28);

    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark,
      spread: 2.4 * S, w: 3.4 * S, hip: -7.4, stride: 3.8 * S
    });

    // короткая накидка/юбка бойца
    poly(ctx, [
      { x: -3.5 * S, y: -11.2 },
      { x: 3.5 * S, y: -11.2 },
      { x: 4.2 * S + q.p.x * q.step, y: -4.2 },
      { x: -4.2 * S + q.p.x * q.step, y: -4.2 }
    ], shade(suit, -0.18));

    unitTorso(ctx, q, {
      col: suit, top: -19 * S, bot: -7, w: 8.6 * S, shoulder: 9.4 * S,
      panel: light, belt: '#3f474c'
    });

    // плечи
    const sh = q.p.x * 4.8 * S;
    spot(ctx, -sh, -17.4 + q.p.y * 2.2, 2.3 * S, shade(suit, -0.1));
    spot(ctx, sh, -17.4 - q.p.y * 2.2, 2.5 * S, light);

    // оружие по варианту
    const w = c.weapon;
    if (w === 'disk') {
      const cx = q.f.x * 5.2 + q.p.x * 4.2;
      const cy = -14.4;
      const rr = 5.2 * S;
      const spin = q.frame * 0.6 + q.step * 0.3;
      ctx.strokeStyle = '#3f474c';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 0.62, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#8a949c';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr * 0.8, rr * 0.5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // зубья и разметка вращения
      for (let i = 0; i < 6; i++) {
        const a = spin + i * Math.PI / 3;
        spot(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.62,
          0.8, acc);
      }
      spot(ctx, cx, cy, 1.5, dark);
      if (q.atk) uFlash(ctx, cx + 7, cy - 3, 3.2, 'rgba(255,207,74,.85)');
    } else if (w === 'axe') {
      const hx = q.f.x * 3 + q.p.x * 4;
      const hy = -20;
      uBar(ctx, hx, hy, hx + q.f.x * 3, hy - 10, 1.7, '#6a4a30');
      poly(ctx, [
        { x: hx + q.f.x * 3 - q.p.x * 4.4, y: hy - 10 - q.p.y * 4.4 },
        { x: hx + q.f.x * 3 + q.f.x * 3 - q.p.x * 5.8, y: hy - 9 - q.p.y * 5.8 },
        { x: hx + q.f.x * 3 - q.p.x * 5.4, y: hy - 5 - q.p.y * 5.4 },
        { x: hx + q.f.x * 3 + q.f.x * 1, y: hy - 6.4 }
      ], '#b8c2cc');
      spot(ctx, hx + q.f.x * 3, hy - 9, 0.9, acc);
      if (q.atk) {
        ctx.strokeStyle = 'rgba(255,207,74,.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, -16, 16, -0.9, 0.5);
        ctx.stroke();
      }
    } else if (w === 'blade') {
      for (let s = -1; s <= 1; s += 2) {
        const bx = q.p.x * 3.6 * s + q.f.x * 3;
        uBar(ctx, bx, -13, bx + q.f.x * 8, -15 + q.f.y * 4, 1.5, '#c8d0d8');
        spot(ctx, bx, -13, 1.1, dark);
      }
      if (q.atk) uFlash(ctx, q.f.x * 10, -15, 3.4, 'rgba(255,154,200,.85)');
    } else if (w === 'drill') {
      const bx = q.f.x * 5 + q.p.x * 2;
      const by = -13.5;
      uBox(ctx, bx - 2, by - 1.6, 4.2, 3.2, 0.8, dark);
      poly(ctx, [
        { x: bx + 2, y: by - 1.2 },
        { x: bx + 9 + q.f.x * 2, y: by + q.f.y * 3 },
        { x: bx + 2, y: by + 1.2 }
      ], '#b8c2cc');
      ctx.strokeStyle = 'rgba(70,224,200,.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(bx + 2 + i * 2, by - 1);
        ctx.lineTo(bx + 3 + i * 2, by + 1);
      }
      ctx.stroke();
      // лампа на шлеме
      spot(ctx, q.f.x * 2, -23.4, 1.1, acc);
    } else if (w === 'ball') {
      const bx = q.f.x * 3 + q.p.x * 3.4;
      const by = -21.5;
      spot(ctx, bx, by, 5.6 * S, '#5c5650');
      spot(ctx, bx - 1, by - 1, 4.2 * S, '#8a7a6a');
      ctx.strokeStyle = 'rgba(40,36,32,.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(bx - 1, by - 1, 2.4, 0.4, 3.2);
      ctx.stroke();
      uBar(ctx, bx - q.f.x * 4, by + q.f.y * 2, bx + q.p.x * 2, by + 6, 1.6, dark);
      if (q.atk) uFlash(ctx, bx + q.f.x * 4, by - 4, 3, 'rgba(70,224,200,.7)');
    } else if (w === 'lance') {
      // копьё-луч: высокий наклонный стержень с плазменным остриём
      const bx = q.p.x * 3.2 + q.f.x * 1.6;
      const by = -13.8;
      const tx = bx + q.f.x * (13 + (c.lance || 0)) + q.p.x * 5;
      const ty = by - 20 + q.f.y * 5;
      uBar(ctx, bx, by, tx, ty, 2.6, '#2f3d4c');
      uBar(ctx, bx, by - 0.7, tx, ty - 0.7, 1.1, acc);
      uBar(ctx, bx - q.p.x * 2.6, by - 1.4, bx + q.p.x * 2.6, by - 1.4,
        1.3, '#8a98a8');
      poly(ctx, [
        { x: tx + q.f.x * 3 + q.p.x * 1.6, y: ty - 4.6 },
        { x: tx - q.p.x * 2.6, y: ty + 2.8 },
        { x: tx + q.p.x * 2.6, y: ty + 2.8 }
      ], 'rgba(143,232,255,.9)');
      spot(ctx, tx, ty, 1.4, 'rgba(240,255,255,.95)');
      if (q.atk) {
        uFlash(ctx, tx + q.f.x * 4, ty, 3.8, 'rgba(143,232,255,.85)');
        uBar(ctx, tx, ty, tx + q.f.x * 14, ty + q.f.y * 9, 1.2,
          'rgba(200,250,255,.7)');
      }
    }

    // голова
    unitHead(ctx, q, {
      r: 3.3, y: -21.8, col: light, visor: acc,
      antenna: L >= 2 ? PAL.metalLight : null
    });
    // гребень/капюшон
    poly(ctx, [
      { x: -2.2 + q.f.x * 0.3, y: -24.6 },
      { x: 2.2 + q.f.x * 0.3, y: -24.6 },
      { x: 1.4 + q.f.x * 0.3, y: -22.6 },
      { x: -1.4 + q.f.x * 0.3, y: -22.6 }
    ], dark);
    if (c.scope) {
      ring(ctx, q.f.x * 2.4, -21.8, 2.6, 1.8, acc, 0.9);
      spot(ctx, q.f.x * 2.4, -21.8, 1.1, 'rgba(240,255,255,.9)');
    }
    if (L >= 2) uBar(ctx, -3.2, -9.6, 3.2, -9.6, 0.9, L >= 3 ? PAL.gold : acc);
  }

  /* --- тяжёлый ближний: П.Е.К.К.А. и титан --- */
  function artBrute(ctx, q, c) {
    const L = q.tier;
    const armor = c.armor;
    const light = c.armorLight;
    const glow = c.glow || PAL.cold;
    const dark = shade(armor, -0.34);

    unitLegs(ctx, q, {
      col: dark, boot: PAL.metalDark,
      spread: 3.2, w: 4.8, hip: -9.4, stride: 4.4, foot: 3.2
    });

    // широкий торс и пояс
    unitTorso(ctx, q, {
      col: armor, top: -24, bot: -8, w: 13, shoulder: 14,
      panel: light, belt: '#2f353a'
    });
    poly(ctx, [
      { x: -5.2, y: -20.4 }, { x: 5.2, y: -20.4 },
      { x: 3.8, y: -11.2 }, { x: -3.8, y: -11.2 }
    ], light);
    // энергетическое ядро в груди
    spot(ctx, q.f.x * 0.6, -15.6, 2.4, '#2f2a36');
    spot(ctx, q.f.x * 0.6, -15.6, 1.4, glow);
    if (L >= 2) ring(ctx, q.f.x * 0.6, -15.6, 3.4, 2.2, glow, 0.7);

    // плечевые блоки
    for (let s = -1; s <= 1; s += 2) {
      const x = q.p.x * 6.6 * s;
      const y = -21.4 + q.p.y * 6.6 * s * 0.5;
      poly(ctx, [
        { x: x - 3.6, y: y + 1.2 }, { x: x - 2.6, y: y - 3.4 },
        { x: x + 2.8, y: y - 3.8 }, { x: x + 3.8, y: y + 0.8 },
        { x: x + 2.2, y: y + 2.8 }, { x: x - 2.4, y: y + 2.8 }
      ], s > 0 ? light : dark);
      spot(ctx, x, y - 0.6, 0.9, s > 0 ? glow : 'rgba(70,224,200,.4)');
    }

    // голова с узким визором
    unitHead(ctx, q, {
      r: 3.6, y: -28, col: armor, visor: glow, antenna: L >= 2 ? PAL.metalLight : null
    });
    poly(ctx, [
      { x: -2.4 + q.f.x * 0.3, y: -31.4 },
      { x: 2.4 + q.f.x * 0.3, y: -31.4 },
      { x: 1.4 + q.f.x * 0.3, y: -28.8 },
      { x: -1.4 + q.f.x * 0.3, y: -28.8 }
    ], dark);

    if (c.weapon === 'blades') {
      // два длинных энергетических клинка
      for (let s = -1; s <= 1; s += 2) {
        const bx = q.p.x * 6.2 * s + q.f.x * 3;
        const by = -14.4;
        uBar(ctx, bx, by, bx + q.f.x * 10, by - 11 + q.f.y * 4, 2.2, '#2f353a');
        uBar(ctx, bx + q.f.x * 2, by - 1, bx + q.f.x * 12, by - 13 + q.f.y * 4,
          1.2, glow);
        spot(ctx, bx, by, 1.4, light);
      }
      if (q.atk) {
        ctx.strokeStyle = 'rgba(176,79,224,.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -15, 17, -1.1, 0.55);
        ctx.stroke();
      }
    } else if (c.weapon === 'coils') {
      // тесла-катушки на плечах и дуга
      for (let s = -1; s <= 1; s += 2) {
        const x = q.p.x * 6.6 * s;
        const y = -24.6 + q.p.y * 6.6 * s * 0.5;
        ctx.fillStyle = '#3f4754';
        ctx.fillRect(x - 1.8, y - 5, 3.6, 5);
        ring(ctx, x, y - 5.4, 3, 1.4, glow, 0.9);
        ring(ctx, x, y - 7.6, 2.2, 1, glow, 0.7);
      }
      ctx.strokeStyle = 'rgba(143,232,255,.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-3, -28);
      ctx.quadraticCurveTo(0, -32, 3, -28);
      ctx.stroke();
      if (q.atk) {
        for (let i = -1; i <= 1; i++) {
          const a = i * 0.5 + q.step * 0.2;
          uBar(ctx, q.f.x * 8, -16, q.f.x * 8 + Math.cos(a) * 12,
            -16 + Math.sin(a) * 8, 0.9, 'rgba(143,232,255,.8)');
        }
        spot(ctx, q.f.x * 9, -16, 2.4, 'rgba(200,248,255,.8)');
      }
    } else if (c.weapon === 'hammer') {
      // двуручный молот: широкая боевая часть на длинной рукояти
      const hx = q.p.x * 8 + q.f.x * 3;
      const hy = -30 + q.p.y * 3;
      uBar(ctx, q.p.x * 2, -13, hx, hy + 2, 2.6, '#3a3230');
      uBar(ctx, q.p.x * 2, -13.6, hx, hy + 1.4, 0.9, '#8a7a6a');
      ctx.fillStyle = '#6a5a70';
      ctx.beginPath();
      ctx.ellipse(hx, hy, 7.6, 4.8, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a3230';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(hx, hy, 5.4, 3.2, 0.18, 0, Math.PI * 2);
      ctx.stroke();
      uBar(ctx, hx - 6.4, hy + 0.4, hx + 6.4, hy + 0.4, 1, glow);
      poly(ctx, [
        { x: hx - 2.2, y: hy - 3.6 },
        { x: hx + q.f.x * 1.4, y: hy - 9.2 },
        { x: hx + 2.2, y: hy - 3.6 }
      ], c.armorLight);
      if (q.atk) {
        ctx.strokeStyle = 'rgba(224,166,255,.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(hx - q.p.x * 5, hy + 4, 12, -1.2, 0.5);
        ctx.stroke();
        uFlash(ctx, hx + q.f.x * 5, hy, 3.4, 'rgba(255,232,170,.85)');
      }
    } else if (c.weapon === 'logcannon') {
      // наплечная мортира: толстый ствол, барабан и светящийся срез
      const bx = q.p.x * 5.2;
      const by = -23.6;
      const tx = bx + q.f.x * (13 + (c.big ? 2 : 0));
      const ty = by + q.f.y * (10 + (c.big ? 2 : 0));
      uBar(ctx, bx, by, tx, ty, 6, '#3f3630');
      uBar(ctx, bx, by - 1.6, tx, ty - 1.6, 1.8, '#8a7050');
      uBar(ctx, bx + q.f.x * 4, by + q.f.y * 3,
        bx + q.f.x * 4 - q.p.x * 3.6, by + q.f.y * 3 + q.p.y * 3.6,
        1.2, '#2a2420');
      ring(ctx, tx, ty, 3.6, 2.6, '#2a2420', 1.4);
      spot(ctx, tx + q.f.x * 1.6, ty + q.f.y * 1.2, 1.3,
        'rgba(255,210,140,.85)');
      // барабан с боеприпасами за спиной
      ring(ctx, -q.p.x * 7.6, -18.4, 5.4, 3.6, '#4a4038', 2.2);
      ring(ctx, -q.p.x * 7.6, -18.4, 5.4, 3.6, 'rgba(255,207,74,.3)', 0.8);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        spot(ctx, -q.p.x * 7.6 + Math.cos(a) * 3.6,
          -18.4 + Math.sin(a) * 2.4, 0.8, '#c8a060');
      }
      if (q.atk) {
        spot(ctx, tx + q.f.x * 4, ty + q.f.y * 3, 3.2,
          'rgba(255,176,90,.55)');
        spot(ctx, tx + q.f.x * 5, ty + q.f.y * 4, 1.5,
          'rgba(255,244,210,.85)');
      }
    }
    if (L >= 3) spot(ctx, 0, -20.2, 1.2, PAL.gold);
  }

  /* --- наземные звери: йети, големы, кабан, корневой таран --- */
  function artBeast(ctx, q, c) {
    const L = q.tier;
    const S = c.big ? 1.12 : 1;
    const body = c.body;
    const dark = c.bodyDark;
    const acc = c.accent || PAL.cold;
    const cy = -14.5 * S;
    const rx = 11.2 * S;
    const ry = 6.6 * S;

    // дальние лапы
    uBar(ctx, q.p.x * 5 - q.f.x * 4, cy + 3, q.p.x * 7 - q.f.x * 4 + q.step * 2,
      -0.6, 3.2 * S, shade(dark, -0.15));
    uBar(ctx, q.p.x * 2 - q.f.x * 7, cy + 3, q.p.x * 3 - q.f.x * 8,
      -0.6, 3 * S, shade(dark, -0.2));

    // хвост/задняя часть
    if (!c.rider) {
      uBar(ctx, -q.f.x * rx * 0.8, cy, -q.f.x * (rx + 5), cy - 4,
        1.6 * S, dark);
    }

    // корпус
    spot(ctx, 0, cy, rx, dark);
    spot(ctx, -q.f.x * 1.2, cy - 1, rx * 0.88, body);
    // светлая грудь
    ctx.fillStyle = shade(body, 0.16);
    ctx.beginPath();
    ctx.ellipse(q.f.x * rx * 0.42, cy + 2, rx * 0.34, ry * 0.66,
      0, 0, Math.PI * 2);
    ctx.fill();

    // спинные пластины
    if (c.spikes) {
      for (let i = -1; i <= 1; i++) {
        poly(ctx, [
          { x: q.p.x * i * 5, y: cy - ry + 3 },
          { x: q.p.x * i * 5 - q.f.x * 2, y: cy - ry - 4 },
          { x: q.p.x * i * 5 + q.f.x * 2, y: cy - ry + 2 }
        ], shade(body, -0.1));
      }
    }
    if (c.rock) {
      // каменные плиты
      spot(ctx, -rx * 0.3, cy - 1.6, 3.2 * S, shade(body, 0.1));
      spot(ctx, rx * 0.32, cy + 1.4, 2.6 * S, dark);
    }
    if (c.lava) {
      ctx.strokeStyle = 'rgba(255,138,74,.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.5, cy);
      ctx.lineTo(-rx * 0.1, cy - 2);
      ctx.lineTo(rx * 0.28, cy + 1);
      ctx.stroke();
      spot(ctx, rx * 0.2, cy - 2, 1, 'rgba(255,220,150,.8)');
    }
    if (c.ice) {
      ctx.strokeStyle = 'rgba(216,251,255,.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.4, cy - 2);
      ctx.lineTo(rx * 0.2, cy + 1);
      ctx.stroke();
    }

    // руки-лапы: широкий силуэт танка, а не «камень с ножками»
    uBar(ctx, -q.p.x * 6, cy - 1, -q.p.x * 9.4, -1.4, 4 * S, shade(dark, -0.1));
    uBar(ctx, q.p.x * 6, cy - 1, q.p.x * 9.6, -1.2, 4.4 * S, body);
    spot(ctx, q.p.x * 9.6, -1.2, 2.2 * S, shade(body, -0.08));

    // голова впереди: на фронтальном ракурсе выносим её из корпуса,
    // иначе крылатый зверь читается бесформенным пятном
    const hx = q.f.x * (rx * 0.95) + q.p.x * 1.6;
    const hy = cy + q.f.y * (ry * 1.15) - 2.4 + q.p.y * 1.2;
    // короткая шея связывает голову с корпусом
    uBar(ctx, 0, cy - 1, hx * 0.62, hy + 1.4, 4.4 * S, dark);
    spot(ctx, hx, hy, 5.6 * S, dark);
    spot(ctx, hx, hy - 0.6, 4.5 * S, body);
    // светлая морда и два глаза: лицо читается на мелком тайле
    spot(ctx, hx + q.f.x * 1.6, hy + 1.2, 2.5 * S, shade(body, 0.18));
    spot(ctx, hx + q.f.x * 1.2 - q.p.x * 0.9, hy - 1.4, 0.7,
      c.lava ? PAL.amber : dark);
    spot(ctx, hx + q.f.x * 1.2 + q.p.x * 0.9, hy - 1.4, 0.7,
      c.lava ? PAL.amber : dark);
    // клык/пасть
    ctx.strokeStyle = shade(body, -0.32);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hx + q.f.x * 1.4 - q.p.x * 0.7, hy + 2.2);
    ctx.lineTo(hx + q.f.x * 1.4 + q.p.x * 0.7, hy + 2.2);
    ctx.stroke();
    // рога/клыки/ветви
    if (c.horns === 'tusks') {
      poly(ctx, [
        { x: hx + q.f.x * 3, y: hy + 2 },
        { x: hx + q.f.x * 6.4, y: hy + 1 },
        { x: hx + q.f.x * 3.6, y: hy + 3.4 }
      ], '#e0d8c0');
    } else if (c.horns === 'branch') {
      for (let s = -1; s <= 1; s += 2) {
        uBar(ctx, hx, hy - 3, hx + q.p.x * 3.4 * s, hy - 9, 1.2, '#5a4a30');
        uBar(ctx, hx + q.p.x * 2.2 * s, hy - 7, hx + q.p.x * 4.2 * s, hy - 6, 0.9, '#6a5a3a');
      }
    } else if (c.horns === 'ice') {
      for (let s = -1; s <= 1; s += 2) {
        poly(ctx, [
          { x: hx + q.p.x * 2 * s, y: hy - 3 },
          { x: hx + q.p.x * 3.4 * s + q.f.x * 2, y: hy - 10 },
          { x: hx + q.p.x * 3.8 * s, y: hy - 3 }
        ], 'rgba(216,251,255,.85)');
      }
    } else if (c.horns === 'rock') {
      poly(ctx, [
        { x: hx - q.p.x * 3, y: hy - 3 },
        { x: hx - q.p.x * 1, y: hy - 9 },
        { x: hx + q.p.x * 2, y: hy - 3.4 }
      ], shade(body, -0.14));
    }

    // ближние лапы
    uBar(ctx, -q.p.x * 5 + q.f.x * 2, cy + 3,
      -q.p.x * 7 + q.f.x * 3 - q.step * 2, -0.4, 3.5 * S, body);
    uBar(ctx, -q.p.x * 2 + q.f.x * 5, cy + 3,
      -q.p.x * 3 + q.f.x * 7 + q.step * 2, -0.4, 3.2 * S, shade(body, -0.06));

    // наездник
    if (c.rider) {
      const rx0 = -q.f.x * 2.4;
      const ry0 = cy - ry - 5;
      unitTorso(ctx, q, {
        col: shade(body, 0.24), top: ry0 - 8, bot: ry0 + 3,
        w: 6.2, shoulder: 6.8, panel: acc, belt: '#3f3a2e'
      });
      spot(ctx, rx0 + q.f.x * 0.4, ry0 - 9.4, 2.5, shade(body, 0.34));
      spot(ctx, rx0 + q.f.x * 0.9, ry0 - 9.6, 0.7, acc);
      // поводья/копьё
      uBar(ctx, rx0 + q.f.x * 2, ry0 - 6, hx + q.f.x * 2, hy - 3, 0.8, '#8a6a50');
      uBar(ctx, rx0 - q.p.x * 3, ry0 - 6, rx0 - q.p.x * 3, ry0 - 17, 1.2, '#6a5a4a');
    }

    // атака: выпад головой и вспышка
    if (q.atk) {
      spot(ctx, hx + q.f.x * 5, hy + 1, 1.6, 'rgba(255,220,150,.8)');
      uFlash(ctx, hx + q.f.x * 6.5, hy + 1, 2.8, 'rgba(255,207,74,.75)');
    }
    if (L >= 2) spot(ctx, q.p.x * 6, cy - ry * 0.4, 0.9, L >= 3 ? PAL.gold : acc);
  }

  /* --- летуны: драконы, лавовый пёс, скат --- */
  function artWing(ctx, q, c) {
    const L = q.tier;
    const S = c.size || 1;
    const cy = -25 * S;
    const body = c.body;
    const dark = c.bodyDark;
    const wing = c.wing || body;
    const acc = c.horn || PAL.gold;
    const flap = q.frame === 1 ? 1 : (q.frame === 2 ? -1 : (q.atk ? 0.4 : 0));
    const span = (c.round ? 13 : 14.5) * S;

    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(q.fx * 0.08);

    // крылья: дальнее темнее, ближнее светлее; взмах по кадру
    for (let s = -1; s <= 1; s += 2) {
      const near = (q.p.y * s) > -0.2;
      const tipX = q.p.x * span * s + q.f.x * 3;
      const tipY = -7 - flap * 3 * s + q.p.y * span * s * 0.2;
      poly(ctx, [
        { x: q.f.x * 2, y: -2 },
        { x: tipX - q.f.x * 4, y: tipY + 3 },
        { x: tipX + q.f.x * 2, y: tipY - 1 },
        { x: tipX - q.f.x * 1, y: tipY + 9 },
        { x: q.f.x * 4, y: 5 }
      ], near ? wing : shade(wing, -0.28));
      // перепонки
      ctx.strokeStyle = near ? 'rgba(255,220,180,.28)' : 'rgba(255,220,180,.15)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(q.f.x * 3, 0);
      ctx.lineTo(tipX - q.f.x * 1, tipY + 5);
      ctx.moveTo(q.f.x * 3, 2);
      ctx.lineTo(tipX - q.f.x * 2, tipY + 2);
      ctx.stroke();
    }

    // хвост
    poly(ctx, [
      { x: -q.f.x * 8, y: 3 },
      { x: -q.f.x * (span + 3), y: -2 - flap * 2 },
      { x: -q.f.x * (span + 1), y: 4 },
      { x: -q.f.x * 7, y: 6 }
    ], dark);
    if (c.imp) {
      poly(ctx, [
        { x: -q.f.x * (span + 1), y: -1 },
        { x: -q.f.x * (span + 4), y: -5 },
        { x: -q.f.x * (span + 2), y: 1 }
      ], wing);
    }

    // корпус
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 2, (c.round ? 9 : 8.4) * S, (c.round ? 7 : 6.2) * S,
      0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-1, 0.4, (c.round ? 8.2 : 7.4) * S, (c.round ? 6.2 : 5.2) * S,
      0, 0, Math.PI * 2);
    ctx.fill();
    // брюхо
    ctx.fillStyle = c.belly || shade(body, 0.2);
    ctx.beginPath();
    ctx.ellipse(0, 3.8, 4.8 * S, 2.6 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    // шея и голова: выносим голову по направлению взгляда и чуть вбок,
    // чтобы на фронтальном ракурсе дракон не превращался в «летучую мышь»
    const nx = q.f.x * 9.4 * S + q.p.x * 3.6;
    const ny = q.f.y * 11 - 3.2 + q.p.y * 1.8;
    uBar(ctx, q.f.x * 2.6, -1, nx, ny - 1.6, 4.2 * S, body);
    spot(ctx, nx, ny - 2.4, 4.7 * S, dark);
    spot(ctx, nx, ny - 2.8, 3.8 * S, body);
    // морда
    poly(ctx, [
      { x: nx + q.f.x * 3, y: ny - 3.8 },
      { x: nx + q.f.x * 7.6, y: ny - 1.6 + q.f.y * 0.6 },
      { x: nx + q.f.x * 3, y: ny + 0.8 }
    ], shade(body, 0.06));
    // два глаза: лицо читается на 44 px
    spot(ctx, nx + q.f.x * 1.3 - q.p.x * 1.2, ny - 4.2, 0.8, c.eye || PAL.amber);
    spot(ctx, nx + q.f.x * 1.3 + q.p.x * 1.2, ny - 4.2, 0.8, c.eye || PAL.amber);
    // рога
    for (let s = -1; s <= 1; s += 2) {
      uBar(ctx, nx - q.p.x * 1.6 * s, ny - 4,
        nx - q.p.x * 3 * s - q.f.x * 2, ny - 8.4, 1.1, acc);
    }
    // лапы
    for (let s = -1; s <= 1; s += 2) {
      uBar(ctx, q.p.x * 3 * s, 4, q.p.x * 4.4 * s, 9, 1.6 * S, dark);
      spot(ctx, q.p.x * 4.4 * s, 9.2, 1.2 * S, acc);
    }

    // наездник (дракон-всадник / герой)
    if (c.rider) {
      unitTorso(ctx, q, {
        col: '#7a5a44', top: -8.4, bot: 0.6, w: 5.2, shoulder: 5.8,
        panel: PAL.gold, belt: '#3f3024'
      });
      spot(ctx, -q.f.x * 1.2, -10.6, 2.3, '#8a6a50');
      spot(ctx, -q.f.x * 1.6, -10.8, 0.6, PAL.glass);
      uBar(ctx, -q.f.x * 2, -6, nx + q.f.x * 2, ny - 2, 0.9, '#5a4a3a');
    }

    // лавовые трещины и искры
    if (c.lava) {
      ctx.strokeStyle = 'rgba(255,180,90,.65)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-4, -1);
      ctx.lineTo(-1, 2);
      ctx.lineTo(3, 0);
      ctx.stroke();
      spot(ctx, -2, -3, 1, 'rgba(255,220,150,.8)');
    }
    if (c.spark) {
      ctx.strokeStyle = 'rgba(143,232,255,.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(-1, 1);
      ctx.lineTo(2, -2);
      ctx.stroke();
    }

    // атака: дыхание/разряд
    if (q.atk) {
      spot(ctx, nx + q.f.x * 7, ny - 1, 2.2, c.lava ? 'rgba(255,154,90,.8)' : 'rgba(255,220,150,.75)');
      uFlash(ctx, nx + q.f.x * 8.5, ny - 1, 3.4, c.spark ? 'rgba(143,232,255,.8)' : 'rgba(255,180,90,.8)');
    }
    ctx.restore();

    if (L >= 2) spot(ctx, 0, cy - 7, 0.9, L >= 3 ? PAL.gold : acc);
  }

  /* --- печь: переносной горн на ножках --- */
  function artFurnace(ctx, q, c) {
    const L = q.tier;
    for (let i = -1; i <= 1; i += 2) {
      uBar(ctx, q.p.x * 3 * i, -6, q.p.x * 4.2 * i, 0, 1.8, '#4c4034');
    }
    uBox(ctx, -6.4, -17, 12.8, 11, 1.8, '#5a4432');
    uBox(ctx, -5.2, -15.8, 10.4, 8.4, 1.4, c.body || '#7a4a32');
    // решётка и пламя
    ctx.fillStyle = '#2a1c14';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-3.8, -13.4, 7.6, 5, 1.4);
    else ctx.rect(-3.8, -13.4, 7.6, 5);
    ctx.fill();
    spot(ctx, 0, -11, 2.4, 'rgba(255,154,90,.75)');
    spot(ctx, -0.5, -12, 1.2, 'rgba(255,236,180,.9)');
    // труба
    uBox(ctx, 2.6, -24, 3.2, 7, 0.8, '#4c4034');
    spot(ctx, 4.2, -25, 1.1, 'rgba(255,180,110,.6)');
    // заклёпки и ручки
    for (let i = -1; i <= 1; i++) spot(ctx, i * 3.6, -6.4, 0.7, PAL.gold);
    uBar(ctx, -6.8, -14, -8, -16, 1.1, '#8a7a60');
    uBar(ctx, 6.8, -14, 8, -16, 1.1, '#8a7a60');
    if (q.atk) {
      uFlash(ctx, 0, -11, 5, 'rgba(255,154,90,.7)');
      spot(ctx, 0, -28, 1.6, 'rgba(255,220,150,.7)');
    }
    if (L >= 2) spot(ctx, 0, -17.6, 1, L >= 3 ? PAL.gold : c.accent);
  }

  /* --- питомцы: четвероногие, птицы, студни --- */
  function artPet(ctx, q, kind) {
    const c = PET_ART[kind] || PET_ART.lassi;
    const art = c.art;
    const body = c.body;
    const dark = c.dark;
    const acc = c.acc || PAL.cold;
    const bob = q.frame === 1 ? 0.8 : (q.frame === 2 ? -0.6 : 0);

    if (art === 'bird') {
      const cy = -11 + bob;
      // крылья
      for (let s = -1; s <= 1; s += 2) {
        const flap = q.frame === 1 ? 3 : (q.frame === 2 ? -2 : 0);
        poly(ctx, [
          { x: 0, y: cy },
          { x: q.p.x * 8 * s, y: cy - 5 + flap * s },
          { x: q.p.x * 4.4 * s, y: cy + 2 }
        ], s > 0 ? c.body : dark);
      }
      spot(ctx, 0, cy, 4.2, dark);
      spot(ctx, 0, cy - 0.6, 3.4, body);
      spot(ctx, q.f.x * 3, cy - 2.4, 2, body);
      // клюв и глаз
      poly(ctx, [
        { x: q.f.x * 4.4, y: cy - 2.6 },
        { x: q.f.x * 6.6, y: cy - 1.6 },
        { x: q.f.x * 4.4, y: cy - 0.6 }
      ], acc);
      spot(ctx, q.f.x * 3.2 - q.p.x * 1, cy - 3.4, 0.6, PAL.dark);
      // хвост
      poly(ctx, [
        { x: -q.f.x * 3, y: cy + 1 },
        { x: -q.f.x * 8, y: cy - 2 },
        { x: -q.f.x * 7, y: cy + 3 }
      ], dark);
      if (c.fire) {
        spot(ctx, -q.f.x * 5, cy - 6, 1.6, 'rgba(255,180,90,.6)');
        spot(ctx, 0, cy - 4, 1.1, c.acc);
      }
      if (c.fly) spot(ctx, 0, cy, 0.8, 'rgba(255,255,255,.6)');
      return;
    }

    if (art === 'blob') {
      const cy = -8 + bob + (c.fly ? -3 : 0);
      if (c.fly) {
        ctx.strokeStyle = 'rgba(200,170,255,.25)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(0, cy + 7, 5, 1.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      spot(ctx, 0, cy, 6.4, dark);
      spot(ctx, 0, cy - 0.8, 5.4, body);
      // глаза и рот
      spot(ctx, q.f.x * 1.8 - q.p.x * 1.4, cy - 1.6, 0.9, '#2a2430');
      spot(ctx, q.f.x * 1.8 + q.p.x * 1.4, cy - 1.6, 0.9, '#2a2430');
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, cy + 1.4, 1.8, 0.2, Math.PI - 0.2);
      ctx.stroke();
      // отростки/кристаллы
      for (let i = -1; i <= 1; i++) {
        uBar(ctx, i * 3, cy - 4.6, i * 4, cy - 7 - Math.abs(i) * 1.6, 0.9, acc);
      }
      if (c.icy) {
        poly(ctx, [
          { x: -q.p.x * 4, y: cy - 3 },
          { x: -q.p.x * 6, y: cy - 8 },
          { x: -q.p.x * 2, y: cy - 4 }
        ], 'rgba(216,251,255,.8)');
      }
      if (c.glow) spot(ctx, 0, cy - 0.4, 1.4, 'rgba(255,255,255,.7)');
      return;
    }

    // четвероногие
    const cy = -7.4 + bob;
    const rx = 7.2;
    // лапы
    for (let s = -1; s <= 1; s += 2) {
      uBar(ctx, q.p.x * 2.6 * s - q.f.x * 3, cy + 2,
        q.p.x * 3.4 * s - q.f.x * 3 + q.step * 1.4, -0.4, 1.6, dark);
      uBar(ctx, q.p.x * 2.6 * s + q.f.x * 2.4, cy + 2,
        q.p.x * 3.4 * s + q.f.x * 2.6 - q.step * 1.4, -0.4, 1.6, shade(dark, 0.1));
    }
    // хвост
    if (c.tail === 'bushy') {
      spot(ctx, -q.f.x * 7.4, cy - 2, 2.4, dark);
      spot(ctx, -q.f.x * 7.8, cy - 2.6, 1.8, acc);
    } else {
      uBar(ctx, -q.f.x * 5.8, cy, c.tail === 'long' ? -q.f.x * 10 : -q.f.x * 7.6,
        cy + 1, 1.3, dark);
    }
    // корпус
    spot(ctx, 0, cy, rx, dark);
    spot(ctx, -q.f.x * 0.6, cy - 0.8, rx * 0.82, body);
    // голова
    const hx = q.f.x * 5.4;
    const hy = cy - 2.8;
    spot(ctx, hx, hy, 3.4, dark);
    spot(ctx, hx, hy - 0.5, 2.7, body);
    spot(ctx, hx + q.f.x * 1.6, hy + 0.9, 1.3, shade(body, 0.14));
    spot(ctx, hx + q.f.x * 0.8, hy - 1.2, 0.6, '#2a2430');
    // уши
    for (let s = -1; s <= 1; s += 2) {
      poly(ctx, [
        { x: hx - q.p.x * 1.6 * s, y: hy - 2 },
        { x: hx - q.p.x * 2.6 * s, y: hy - 5.4 },
        { x: hx - q.p.x * 0.4 * s, y: hy - 2.6 }
      ], dark);
    }
    if (c.horns === 'bull') {
      for (let s = -1; s <= 1; s += 2) {
        uBar(ctx, hx - q.p.x * 1.8 * s, hy - 3, hx - q.p.x * 4.4 * s, hy - 5, 1.1, '#e0d8c0');
      }
    }
    if (c.horn) {
      poly(ctx, [
        { x: hx, y: hy - 3 },
        { x: hx + q.f.x * 1.2, y: hy - 7.4 },
        { x: hx + q.f.x * 1.6, y: hy - 3 }
      ], acc);
    }
    if (c.drill) {
      poly(ctx, [
        { x: hx + q.f.x * 2.4, y: hy + 0.6 },
        { x: hx + q.f.x * 6.6, y: hy + 1.4 },
        { x: hx + q.f.x * 2.4, y: hy + 2.6 }
      ], '#b8c2cc');
    }
    if (c.ghost) {
      ctx.strokeStyle = 'rgba(200,240,255,.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx + 1.4, 4, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  /* --- осадные машины: гусеничная платформа или дирижабль --- */
  function artSiege(ctx, q, kind) {
    const c = SIEGE_ART[kind] || SIEGE_ART.wallwrecker;
    const body = c.body;
    const dark = c.dark;
    const acc = c.acc || PAL.cold;
    const L = q.tier;

    if (c.art === 'blimp') {
      const cy = -27;
      spot(ctx, 0, cy, 13.6, dark);
      spot(ctx, 0, cy - 0.6, 12.4, body);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath();
      ctx.ellipse(-4, cy - 3.4, 5.6, 2.6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      // гондола
      uBox(ctx, -5.4, cy + 6.4, 10.8, 6, 1.8, dark);
      uBox(ctx, -4.4, cy + 7.2, 8.8, 4.2, 1.2, shade(body, 0.14));
      spot(ctx, q.f.x * 4, cy + 9, 1.3, acc);
      // винты
      for (let s = -1; s <= 1; s += 2) {
        const px = q.p.x * 11 * s;
        uBar(ctx, q.p.x * 5 * s, cy + 3, px, cy + 4, 1.2, dark);
        const spin = q.frame * 0.5;
        ctx.strokeStyle = 'rgba(200,214,220,.6)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(spin) * 4, cy + 4 - Math.sin(spin) * 2);
        ctx.lineTo(px + Math.cos(spin) * 4, cy + 4 + Math.sin(spin) * 2);
        ctx.stroke();
        spot(ctx, px, cy + 4, 1.2, PAL.metalDark);
      }
      // хвост
      poly(ctx, [
        { x: -q.f.x * 10, y: cy },
        { x: -q.f.x * 16, y: cy - 6 },
        { x: -q.f.x * 14, y: cy + 2 }
      ], dark);
      if (L >= 2) spot(ctx, 0, cy - 1, 1.1, L >= 3 ? PAL.gold : acc);
      return;
    }

    // гусеницы
    for (let s = -1; s <= 1; s += 2) {
      const tx = q.p.x * 5.6 * s;
      uBox(ctx, tx - 4.4, -7.6, 8.8, 6.4, 2.4, dark);
      uBox(ctx, tx - 3.4, -6.8, 6.8, 4.8, 1.8, shade(body, -0.14));
      for (let i = -1; i <= 1; i++) {
        spot(ctx, tx + i * 2.4, -4.4, 1, '#2a2a26');
      }
    }
    // корпус
    uBox(ctx, -7.4, -17.4, 14.8, 10.4, 2.4, body);
    uBox(ctx, -6.2, -16.2, 12.4, 4.4, 1.4, shade(body, 0.14));
    spot(ctx, q.f.x * 4, -13.4, 1.2, acc);

    const top = c.top;
    if (top === 'ram') {
      uBox(ctx, -3.4, -22.4, 6.8, 5.4, 1.2, dark);
      poly(ctx, [
        { x: q.f.x * 4, y: -21 },
        { x: q.f.x * 13, y: -19.4 },
        { x: q.f.x * 4, y: -17.8 }
      ], '#b8c2cc');
      uBar(ctx, q.f.x * 5, -22, q.f.x * 12, -19.8, 1, acc);
    } else if (top === 'boulder') {
      spot(ctx, 0, -22, 5.6, '#5c5650');
      spot(ctx, -1, -22.6, 4.6, '#8a7a6a');
      uBar(ctx, -4, -18, -1, -20, 1.2, dark);
    } else if (top === 'hatch') {
      uBox(ctx, -5, -22.6, 10, 5.2, 1.2, shade(body, -0.18));
      uBox(ctx, -3.6, -21.6, 7.2, 2.6, 0.8, '#1e2420');
      spot(ctx, 0, -20.4, 1.2, acc);
      for (let i = -1; i <= 1; i++) spot(ctx, i * 3.4, -23.4, 0.7, PAL.gold);
    } else if (top === 'log') {
      uBar(ctx, -4, -21, q.f.x * 13, -19, 3.4, '#6a4a30');
      spot(ctx, q.f.x * 13, -19, 1.8, '#3f2c1c');
      uBox(ctx, -5.6, -24, 4, 6, 1, dark);
    } else if (top === 'flame') {
      uBar(ctx, -3, -21, q.f.x * 12, -17, 2.4, dark);
      poly(ctx, [
        { x: q.f.x * 12, y: -17.4 },
        { x: q.f.x * 16, y: -18.6 },
        { x: q.f.x * 16, y: -15.4 }
      ], '#3f2c22');
      spot(ctx, q.f.x * 15, -17, 2, 'rgba(255,154,90,.75)');
      uBox(ctx, -6, -22, 4.4, 5, 1, shade(body, -0.1));
    } else if (top === 'drill') {
      poly(ctx, [
        { x: q.f.x * 4, y: -15 },
        { x: q.f.x * 15, y: -12.4 },
        { x: q.f.x * 4, y: -9.8 }
      ], '#9aa7ad');
      ctx.strokeStyle = 'rgba(143,232,255,.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(q.f.x * 6, -14);
      ctx.lineTo(q.f.x * 12, -12.4);
      ctx.stroke();
    } else if (top === 'rack') {
      for (let i = -1; i <= 1; i++) {
        const px = q.p.x * i * 4.2;
        uBar(ctx, px, -20, px + q.f.x * 4, -27, 1.6, dark);
        spot(ctx, px + q.f.x * 4, -27.4, 1.3, acc);
      }
    }
    // флажок мастерской
    uBar(ctx, -6, -17, -6, -26, 1, '#5c6670');
    poly(ctx, [
      { x: -6, y: -26 }, { x: -1.4, y: -24.8 }, { x: -6, y: -23.4 }
    ], acc);
    if (L >= 2) uBar(ctx, -7, -18, 7, -18, 0.8, L >= 3 ? PAL.gold : acc);
  }

  // Кисть художника: рисует юнита в локальных координатах (ступни в 0,0).
  function paintUnitArt(ctx, type, dir, frame, lvl, u, variant) {
    const q = unitPose(type, dir, frame, lvl, u);
    const heroK = type === 'hero'
      ? (typeof variant === 'string' && HERO_KINDS[variant] ? variant : heroKindOf(u))
      : '';
    // Прямой id питомца/осады (type='lassi') и общий type='pet' с kind.
    const petKind = type === 'pet'
      ? (typeof variant === 'string' && PET_ART[variant] ? variant
        : ((u && u.petKind) || 'lassi'))
      : (PET_ART[type] ? type : '');
    const siegeKind = type === 'siege'
      ? (typeof variant === 'string' && SIEGE_ART[variant] ? variant
        : ((u && u.siegeKind) || 'wallwrecker'))
      : (SIEGE_ART[type] ? type : '');
    const guardKind = type === 'guardian'
      ? (typeof variant === 'string' && GUARDIAN_ART[variant] ? variant
        : (unitVariantOf(u) || 'longshot'))
      : (GUARDIAN_ART[type] ? type : '');
    const def = (u && u.def) ||
      (heroK && CC.TROOPS[heroK]) || CC.TROOPS[type] || {};
    const color = def.color || PAL.wood;

    if (type === 'hero') {
      if (heroK && HERO_KINDS[heroK]) artHeroKind(ctx, q, heroK);
      else artHero(ctx, q, color);
    } else if (guardKind && GUARDIAN_ART[guardKind]) {
      const g = GUARDIAN_ART[guardKind];
      if (g.art === 'ranger') artRanger(ctx, q, g);
      else artBrute(ctx, q, g);
    } else if (petKind) {
      artPet(ctx, q, petKind);
    } else if (siegeKind) {
      artSiege(ctx, q, siegeKind);
    } else if (MONS[type]) {
      const c = MONS[type];
      if (c.art === 'caster') artCaster(ctx, q, c);
      else if (c.art === 'ranger') artRanger(ctx, q, c);
      else if (c.art === 'brute') artBrute(ctx, q, c);
      else if (c.art === 'beast') artBeast(ctx, q, c);
      else if (c.art === 'wing') artWing(ctx, q, c);
      else if (c.art === 'furnace') artFurnace(ctx, q, c);
      else artBarb(ctx, q, color);
    } else if (type === 'giant') artGiant(ctx, q, color);
    else if (type === 'archer') artArcher(ctx, q, color);
    else if (type === 'goblin') artGoblin(ctx, q, color);
    else if (type === 'gnome') artGnome(ctx, q, color);
    else if (type === 'airship') artDrone(ctx, q, color);
    else artBarb(ctx, q, color);
  }

  // Спрайт: один раз печём выбранный кадр/направление и кладём в кэш.
  // Ключ включает вид: hero|barb, pet|lassi, siege|wallwrecker или
  // обычный type. Ловим попадания по LRU: Map переставляет ключ в конец,
  // поэтому в бою с 15 типами не вылетают самые нужные кадры.
  function unitSprite(type, variant, dir, frame, lvl) {
    let vk = '';
    if (type === 'hero' && typeof variant === 'string' && HERO_KINDS[variant]) vk = variant;
    else if (type === 'pet') vk = (typeof variant === 'string' && PET_ART[variant])
      ? variant : 'lassi';
    else if (type === 'siege') vk = (typeof variant === 'string' && SIEGE_ART[variant])
      ? variant : 'wallwrecker';
    else if (type === 'guardian') vk = (typeof variant === 'string' && GUARDIAN_ART[variant])
      ? variant : 'longshot';
    else if (PET_ART[type]) vk = type;
    else if (SIEGE_ART[type]) vk = type;
    else if (GUARDIAN_ART[type]) vk = type;

    const key = type + (vk ? '|' + vk : '') + '|' + lvl + '|' + dir + '|' + frame;
    const hit = unitSpriteCache.get(key);
    if (hit) {
      unitBakes.hits++;
      unitSpriteCache.delete(key);
      unitSpriteCache.set(key, hit);
      return hit;
    }

    // Старый герой без heroKind остаётся на своей крупной канве; новые
    // герои рисуются в габаритах базового войска (с запасом под ауру).
    const legacyHero = type === 'hero' && !vk;
    const aw = legacyHero ? HERO_ARTW : U_ARTW;
    const ah = legacyHero ? HERO_ARTH : U_ARTH;
    const ax = legacyHero ? HERO_AX : U_AX;
    const ay = legacyHero ? HERO_AY : U_AY;

    const w = aw * U_BAKE;
    const h = ah * U_BAKE;
    let sp = null;
    try {
      const c = makeCanvas(w, h);
      const cx = c.getContext('2d');
      cx.setTransform(U_BAKE, 0, 0, U_BAKE, ax * U_BAKE, ay * U_BAKE);
      paintUnitArt(cx, type, dir, frame, lvl, null, vk);
      sp = { canvas: c, ax: ax, ay: ay, w: aw, h: ah };
    } catch (e) {
      sp = null;
    }

    // ограничиваем кэш: старые кадры не нужны после смены боя.
    // 448 ячеек держат 14 типов × 8 направлений × 4 кадра и героев,
    // не раздувая память как безлимитный кэш.
    if (unitSpriteCache.size >= 448) {
      const first = unitSpriteCache.keys().next().value;
      if (first !== undefined) unitSpriteCache.delete(first);
    }
    unitSpriteCache.set(key, sp);
    unitBakes.count++;
    return sp;
  }

  /* ---------- энергетический щит: герой и союзники ----------
     Купол живёт только в векторе: спрайты кэшируются, а щит каждый кадр
     собирается из нескольких дуг и маленькой гексагональной сетки. Ни канвы,
     ни клипа на обычных юнитах — цена кадра остаётся в пределах долей мс.

     Купол рисуется любому своему живому юниту с активным shieldUntil
     (и герою тоже). Размер берётся из силуэта: у героя — прежний большой,
     у линейных войск — по высоте фигурки. При большом числе щитов сетка
     упрощается (LOD), чтобы пачка из ~10 куполов не раздувала кадр. */

  const shieldStats = { drawn: 0, wave: 0, cells: 0, minRx: 0, maxRx: 0 };
  const shieldFrame = { count: 0, src: null };
  const shieldSeen = new Map();
  let shieldNow = 0;

  // Волна активации: короткое кольцо от героя на радиус способности.
  const shieldWave = { on: false, x: 0, y: 0, t0: 0, r: 2.5 };

  function shieldDuration() {
    const d = Number(CC.HERO && CC.HERO.ability && CC.HERO.ability.duration);
    return d > 0 ? d : 3;
  }

  function shieldRadius() {
    const r = Number(CC.HERO && CC.HERO.ability && CC.HERO.ability.radius);
    return r > 0 ? r : 2.5;
  }

  // 0 — щита нет, 0..1 — остаток/яркость. Понимает и таймер, и готовую
  // долю: кодер может выставить любое из полей, рендер не падает.
  function unitShieldPower(u) {
    if (!u) return 0;
    let p = 0;

    const hs = u.heroShield;
    if (typeof hs === 'number' && isFinite(hs)) {
      p = Math.max(0, Math.min(1, hs));
    } else if (hs === true || u.shield === true) {
      p = 1;
    }

    if (typeof u.shieldUntil === 'number' && isFinite(u.shieldUntil)) {
      const left = u.shieldUntil - shieldNow;
      if (left > 0) {
        const q = Math.max(0, Math.min(1, left / shieldDuration()));
        if (q > p) p = q;
      }
    }

    return p;
  }

  // Вражеские юниты могли бы прийти из будущих режимов: не рисуем им щит.
  // Все юниты S.units сейчас свои, поэтому по умолчанию считаем союзником.
  function unitShieldable(u) {
    if (!u || u.dead === true) return false;
    if (typeof u.hp === 'number' && u.hp <= 0) return false;
    if (u.enemy === true || u.foe === true || u.hostile === true ||
        u.isEnemy === true || u.isAlly === false) {
      return false;
    }

    const side = u.side != null ? u.side
      : (u.team != null ? u.team : (u.faction != null ? u.faction : u.owner));
    if (typeof side === 'string') {
      const s = side.toLowerCase();
      if (s === 'enemy' || s === 'foe' || s === 'hostile' || s === 'red') return false;
    }
    return true;
  }

  function isHeroUnit(u) {
    return !!(u && (u.isHero === true || u.type === 'hero'));
  }

  // Сетка купола не зависит от юнита: центры ячеек и углы шестиугольника
  // считаем один раз, в кадре остаются только умножение и lineTo.
  // ring 0..3 — запас по гексагональной дистанции; LOD берёт всё меньше ячеек.
  const SHIELD_HEX = (function () {
    const out = [];
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.26;
      pts.push({ x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.84 });
    }
    for (let qy = -3; qy <= 3; qy++) {
      for (let qx = -3; qx <= 3; qx++) {
        if (Math.abs(qx + qy) > 3) continue;
        const lx = (qx + qy / 2) * 1.74;
        const ly = qy * 1.5;
        const nx = lx / 3.2;
        const ny = ly / 3.9;
        if (nx * nx + ny * ny > 0.92) continue;
        const ring = Math.max(Math.abs(qx), Math.abs(qy), Math.abs(qx + qy));
        out.push({ x: lx, y: ly, pts: pts, ring: ring });
      }
    }
    out.sort(function (a, b) { return a.ring - b.ring; });
    return out;
  })();

  const SHIELD_HEX_MID = SHIELD_HEX.filter(function (c) { return c.ring <= 1; });

  // LOD сетки: 2 — полная, 1 — семь ячеек, 0 — только кромка и тело.
  function shieldGridLod(hero) {
    let base;
    if (lod === 0) base = hero ? 1 : 0;
    else base = hero ? 2 : 1;

    const n = shieldFrame.count;
    const pressure = n >= 12 ? 2 : (n >= 8 ? 1 : 0);
    const out = base - pressure;
    return hero ? Math.max(1, out) : Math.max(0, out);
  }

  // Размер купола по силуэту: герой остаётся крупным, линейные войска
  // получают сферу по росту, иначе штурмовик утонул бы в куполе героя.
  function shieldSize(spec, hero) {
    // любой герой — и старый сержант, и пять новых видов — получает прежний
    // крупный купол: он накрывает и фигуру, и ауру, и не зависит от heroKind
    if (hero) return { rx: 54, ry: 72 };
    const h = (spec && spec.h) || 20;
    const w = (spec && spec.w) || 1;
    const ry = Math.round(h * 0.78 + 6);
    const rx = Math.round(ry * (0.72 + 0.1 * Math.min(1.7, w)));
    return { rx: rx, ry: ry };
  }

  // Детектор активации: щит уже был на прошлом кадре и вдруг вырос.
  // Сценарные тулзы ставят поле один раз — ложной волны не будет.
  function trackShieldFrame(S) {
    const units = (S && S.units) || [];

    if (shieldFrame.src !== S) {
      shieldFrame.src = S;
      shieldSeen.clear();
      shieldWave.on = false;
    }
    if (S && typeof S.time === 'number' && isFinite(S.time)) shieldNow = S.time;
    else shieldNow = 0;

    let count = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u) continue;

      const power = unitShieldable(u) ? unitShieldPower(u) : 0;
      if (power > 0.01) count++;

      const until = (typeof u.shieldUntil === 'number' && isFinite(u.shieldUntil))
        ? u.shieldUntil : 0;
      const prev = shieldSeen.get(u.id);
      if (prev && isHeroUnit(u) && unitShieldable(u)) {
        const rose = until > prev.until + 0.02 ||
          (power > prev.power + 0.35 && power > 0.85);
        if (rose) {
          shieldWave.on = true;
          shieldWave.x = u.x;
          shieldWave.y = u.y;
          shieldWave.t0 = t;
          shieldWave.r = shieldRadius();
        }
      }
      shieldSeen.set(u.id, { until: until, power: power });
    }

    // юниты ушли из боя — их отметки больше не нужны
    if (shieldSeen.size > units.length + 8) {
      const alive = new Set();
      for (let i = 0; i < units.length; i++) if (units[i]) alive.add(units[i].id);
      shieldSeen.forEach(function (v, k) { if (!alive.has(k)) shieldSeen.delete(k); });
    }

    shieldFrame.count = count;
  }

  function drawUnitShield(ctx, u, power, groundY, spec, hero, flying) {
    if (!(power > 0.01)) return;

    const g = P(u.x, u.y);
    const size = shieldSize(spec, hero);
    const RX = size.rx;
    const RY = size.ry;
    const baseY = groundY;
    const cy = baseY - RY * 0.52;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.4 + ((u.id || 0) * 0.7));
    const a = Math.max(0, Math.min(1, power));
    const prev = ctx.globalAlpha;
    const grid = hero ? SHIELD_HEX : SHIELD_HEX_MID;
    const gl = shieldGridLod(hero);

    shieldStats.drawn++;
    shieldStats.cells += gl === 2 ? grid.length : (gl === 1 ? SHIELD_HEX_MID.length : 0);
    if (!(shieldStats.minRx > 0) || RX < shieldStats.minRx) shieldStats.minRx = RX;
    if (RX > shieldStats.maxRx) shieldStats.maxRx = RX;

    // пятно энергии на земле (у летающих — под куполом, а не на грунте)
    if (!flying) {
      ctx.globalAlpha = prev * a * 0.22;
      ctx.fillStyle = PAL.cold;
      ctx.beginPath();
      ctx.ellipse(g.x, baseY, RX * 0.98, RX * 0.98 * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // тело купола: верхняя полусфера. Заливка плоская: сетка и кромка
    // дают объём, а градиент каждый кадр стоил бы лишнего времени.
    ctx.globalAlpha = prev * a * 0.78;
    ctx.fillStyle = 'rgba(70,224,200,.16)';
    ctx.beginPath();
    ctx.ellipse(g.x, baseY, RX, RY, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // гексагональная сетка: поворачивается и пульсирует
    if (gl > 0) {
      const cells = gl === 2 ? SHIELD_HEX : SHIELD_HEX_MID;
      const hs = RX * 0.275;
      const rot = Math.sin(t * 0.35 + (u.id || 0) * 0.2) * 0.14;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);

      // полную сетку обрезаем по куполу: ячейки у кромки не торчат наружу
      if (gl === 2) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(g.x, baseY, RX, RY, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      ctx.strokeStyle = '#e2fffb';
      ctx.lineWidth = 1.05;
      ctx.globalAlpha = prev * a * (0.36 + 0.22 * pulse);
      ctx.beginPath();
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const lx = cell.x * hs;
        const ly = cell.y * hs;
        const hx = g.x + lx * cr - ly * sr;
        const hy = cy + lx * sr + ly * cr;
        const pts = cell.pts;
        for (let k = 0; k < 6; k++) {
          const px = hx + pts[k].x * hs;
          const py = hy + pts[k].y * hs;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.stroke();

      if (gl === 2) ctx.restore();
    }

    // внутренние меридианы — купол читается объёмным (у героя и на близком LOD)
    if (gl === 2) {
      ctx.globalAlpha = prev * a * (0.1 + 0.08 * pulse);
      ctx.strokeStyle = PAL.glass;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(g.x, baseY, RX * 0.58, RY * 0.86, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(g.x, baseY, RX * 0.24, RY * 0.94, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    // яркая кромка: тонкая бирюза плюс мягкое свечение
    ctx.globalAlpha = prev * a * (0.22 + 0.18 * pulse);
    ctx.strokeStyle = PAL.glass;
    ctx.lineWidth = gl > 0 ? 4 : 3;
    ctx.beginPath();
    ctx.ellipse(g.x, baseY, RX, RY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = prev * a * (0.62 + 0.32 * pulse);
    ctx.strokeStyle = '#e6fffb';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(g.x, baseY, RX, RY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    // нижнее кольцо на грунте
    ctx.globalAlpha = prev * a * 0.62;
    ctx.strokeStyle = PAL.cold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(g.x, baseY, RX, RX * GQ, 0, 0, Math.PI * 2);
    ctx.stroke();

    // расходящаяся волна по куполу — только у героя, чтобы не плодить дуги
    if (hero) {
      const wave = (t * 0.55 + ((u.id || 0) * 0.13)) % 1;
      ctx.globalAlpha = prev * a * (1 - wave) * 0.34;
      ctx.strokeStyle = PAL.glass;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(g.x, baseY, RX * (0.55 + 0.6 * wave), RX * GQ * (0.55 + 0.6 * wave),
        0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // три искры на поверхности — деталь крупного купола
    if (hero && gl === 2) {
      ctx.globalAlpha = prev * a * 0.9;
      for (let i = 0; i < 3; i++) {
        const ang = t * 1.15 + i * (Math.PI * 2 / 3);
        ctx.fillStyle = i === 1 ? PAL.gold : '#eafffb';
        ctx.beginPath();
        ctx.arc(g.x + Math.cos(ang) * RX * 0.88,
          cy + Math.sin(ang) * RY * 0.5, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = prev;
  }

  // Волна от героя в момент активации: показывает, кого накрыл щит.
  // Один кадр — два эллипса, без частиц и без градиентов.
  function drawShieldWave(ctx) {
    if (!shieldWave.on) return;

    const age = (t - shieldWave.t0) / 0.42;
    if (age >= 1) { shieldWave.on = false; return; }
    if (age < 0) return;

    const g = P(shieldWave.x, shieldWave.y);
    if (!pointVisible(g.x, g.y, 180)) return;

    const e = 1 - Math.pow(1 - age, 3);
    const r = 0.35 + (shieldWave.r - 0.35) * e;
    const rx = r * TW;
    const ry = r * TH;
    const fade = Math.pow(1 - age, 1.4);
    const prev = ctx.globalAlpha;

    shieldStats.wave = 1;

    // мягкое пятно внутри кольца
    ctx.globalAlpha = prev * fade * 0.09;
    ctx.fillStyle = PAL.cold;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // широкое свечение и чёткая кромка
    ctx.globalAlpha = prev * fade * 0.20;
    ctx.strokeStyle = PAL.glass;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = prev * fade * 0.7;
    ctx.strokeStyle = '#eafffb';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = prev;
  }

  function drawUnit(ctx, u) {
    const p = P(u.x, u.y);
    const spec = unitSpecOf(u);
    const kind = heroKindOf(u);
    const artKind = unitVariantOf(u);
    // У героя-«базового войска» полёт, цвет и габариты берём у его вида:
    // дрон-пилот должен летать, а мех — оставаться тяжёлым. Питомцы и
    // осада живут отдельными таблицами и тоже умеют летать.
    const artCfg = (u.type === 'pet' ? PET_ART[artKind]
      : (u.type === 'siege' ? SIEGE_ART[artKind]
        : (PET_ART[u.type] || SIEGE_ART[u.type] || null)));
    const def = kind
      ? (CC.TROOPS[kind] || u.def || CC.TROOPS[u.type] || {})
      : (u.def || CC.TROOPS[u.type] || artCfg || {});
    const flying = def.fly === true || !!(artCfg && artCfg.fly);
    const lift = flying ? 22 : 0;

    const m = unitMotion(u);
    const dir = m.dir;
    const frame = m.frame;
    const lvl = unitLevel(u);
    const hero = u.type === 'hero';

    // Анимированный 3D-кадр доступен, когда тип загружен целиком.
    // До этого (или при ошибке ассетов) работает прежний векторный арт.
    const v2Ready = spritesOn && tilePx <= 120 &&
      !!UNIT3D_V2[u.type] && unit3dV2Ready(u.type);

    // лёгкий кивок корпуса на шаге: не «прыжок», а перенос веса.
    // Сержант тяжелее: качается меньше, но заметнее оседает на шаге.
    // У 3D-кадров шаг/дыхание уже в анимации — процедурный кивок не нужен.
    const bob = v2Ready ? 0 : ((!flying && m.walking)
      ? Math.sin(m.phase * Math.PI) * (hero ? 0.62 : 0.45)
      : Math.sin(t * 1.7 + ((u.id || 0) % 7)) * 0.18);

    // удар: короткий замах и выпад, без телепорта позиции
    const dirv = faceDir(u);
    let lunge = 0;
    if (u.atk > 0) {
      const q = 1 - Math.min(1, u.atk / 0.18);
      const push = hero ? 1.7 : 2.1;      // тяжёлый шаг — короче выпад
      lunge = q < 0.4 ? -1.3 * (q / 0.4) : push * Math.sin((q - 0.4) / 0.6 * Math.PI);
    }

    // тень: у летающих — отдельный мягкий эллипс на земле
    if (flying) {
      const sway = Math.sin(t * 1.25 + ((u.id || 0) * 1.7) % 6.283) * 1.4;
      ctx.fillStyle = 'rgba(34,52,24,.15)';
      ctx.beginPath();
      ctx.ellipse(p.x + sway, p.y + 1, 13 * spec.w * UNIT_DRAW_SCALE,
        13 * spec.w * UNIT_DRAW_SCALE * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(34,52,24,.12)';
      ctx.beginPath();
      ctx.ellipse(p.x + sway, p.y + 1, 8 * spec.w * UNIT_DRAW_SCALE,
        8 * spec.w * UNIT_DRAW_SCALE * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const shR = 7.5 * spec.w * (spec.h / 24) * UNIT_DRAW_SCALE;
      ctx.fillStyle = 'rgba(34,52,24,.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + dirv.x * lunge * 0.4, p.y,
        shR, shR * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const sx = p.x + dirv.x * lunge;
    const sy = p.y - bob - lift + dirv.y * lunge;

    const sp = (!v2Ready && spritesOn && tilePx <= 120)
      ? unitSprite(u.type, artKind, dir, frame, lvl)
      : null;
    let v2sp = null;
    if (v2Ready) {
      const a = unit3dV2Anim(u, m);
      v2sp = unitSpriteV2(u.type, dir, a.anim, a.frame);
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(UNIT_DRAW_SCALE, UNIT_DRAW_SCALE);
    if (v2sp) {
      ctx.drawImage(v2sp.canvas, -v2sp.ax, -v2sp.ay, v2sp.w, v2sp.h);
    } else if (sp) {
      ctx.drawImage(sp.canvas, -sp.ax, -sp.ay, sp.w, sp.h);
    } else {
      // векторный запасной путь: те же формы, без канвы (крупный зум и tools)
      paintUnitArt(ctx, u.type, dir, frame, lvl, u, artKind);
    }
    ctx.restore();

    // щит — только вектор, поверх спрайта и под полоской здоровья.
    // Купол получает любой свой живой юнит с активным shieldUntil.
    if (!u.dead) {
      const shield = unitShieldable(u) ? unitShieldPower(u) : 0;
      if (shield > 0.01) {
        drawUnitShield(ctx, u, shield, p.y - lift - 3,
          { h: spec.h * UNIT_DRAW_SCALE, w: spec.w * UNIT_DRAW_SCALE },
          hero, flying);
      }
    }

    // полоска здоровья — тонкая, только у раненых живых
    if (!u.dead && typeof u.maxHp === 'number' && u.hp < u.maxHp && u.maxHp > 0) {
      const ratio = Math.max(0, u.hp / u.maxHp);
      // У новых героев полоска пропорциональна силуэту: у главаря она
      // не шире самого героя и не висит на пол-экрана выше головы.
      const barW = hero ? Math.max(16, Math.min(30, spec.h * 0.72)) : 0;
      const tiny = u.type === 'pet' || !!PET_ART[u.type];
      const wide = u.type === 'siege' || !!SIEGE_ART[u.type] ||
        u.type === 'giant' || flying || spec.h >= 34;
      const w = (hero ? barW : (tiny ? 10 : (wide ? 18 : 13))) * 1.12;
      const y = p.y - bob - lift - spec.h * UNIT_DRAW_SCALE -
        (hero ? Math.max(7, spec.h * 0.30) : 4);

      ctx.fillStyle = 'rgba(30,26,20,.45)';
      ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 3);
      ctx.fillStyle = hpColor(ratio);
      ctx.fillRect(p.x - w / 2, y, w * ratio, 1.6);
    }
  }

  /* ---------- прогулка по деревне ---------- */

  // Небольшие отряды бродят вокруг казарм. Состояние живёт здесь, в рендере:
  // позиция, цель, пауза, фаза. Обновляется по кадру, пересобирается по сигнатуре.
  const walkers = { list: [], sig: '', layoutSig: '', bounds: null, timer: 0, ready: false };

  /* Выход новобранцев из ангара.
     Рендер только читает CC.Game.state.army: при росте состава фигурка
     появляется в дверях ангара, за 2-3 с отходит на 1.5-3 тайла и потом
     вливается в обычную прогулку. Первый кадр после загрузки/сброса —
     это «базовая линия»: пачку не спавним. */
  const troopExit = { prev: null, list: [], pending: [], puffs: [], seq: 0, door: 0 };

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

  // состав армии в виде чисел: по нему видно прирост и убыль
  function walkerCounts() {
    const out = {};
    const order = CC.ARMY_ORDER || ['barb', 'archer', 'giant', 'goblin'];
    try {
      const st = CC.Game && CC.Game.state;
      const army = st && st.army;
      if (!army) return out;
      for (let i = 0; i < order.length; i++) {
        out[order[i]] = Math.max(0, Math.floor(Number(army[order[i]]) || 0));
      }
    } catch (e) {
      /* нет данных — считаем армию пустой */
    }
    return out;
  }

  // Дверь ангара: центр передней грани (ворота нарисованы там же).
  function exitDoor(base) {
    return { x: base.left + base.w / 2, y: base.top + base.h - 0.6 };
  }

  // Новобранец выходит из двери и за 2-3 с отходит на 1.5-3 тайла.
  function spawnExit(type, base) {
    const def = CC.TROOPS[type] || {};
    const door = exitDoor(base);
    const b = walkers.bounds || { x0: 0.5, y0: 0.5, x1: G - 0.5, y1: G - 0.5 };
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = Math.PI / 2 + side * (0.25 + Math.random() * 0.55);
    const dist = 1.5 + Math.random() * 1.5;

    let ex = door.x + Math.cos(ang) * dist;
    let ey = door.y + Math.sin(ang) * dist;
    ex = Math.min(b.x1, Math.max(b.x0, ex));
    ey = Math.min(b.y1, Math.max(b.y0, ey));
    if (!walkerFree(ex, ey)) {
      const spot = walkerFreeSpot(ex, ey, walkers.list);
      if (spot) { ex = spot.x; ey = spot.y; }
    }

    const dx = ex - door.x;
    const dy = ey - door.y;
    const len = Math.hypot(dx, dy) || 1;
    const delay = 0.12 + (troopExit.list.length % 3) * 0.18;

    troopExit.list.push({
      id: 60000 + (troopExit.seq++),
      type: type,
      def: def,
      hp: 1,
      maxHp: 1,
      atk: 0,
      bx: base.x,
      by: base.y,
      sx: door.x,
      sy: door.y,
      x: door.x,
      y: door.y,
      ex: ex,
      ey: ey,
      nx: -dy / len,
      ny: dx / len,
      arc: (0.1 + Math.random() * 0.16) * side,
      t: -delay,
      dur: 2 + Math.random() * 0.9,
      tx: ex,
      ty: ey,
      path: [],
      target: null,
      pause: 0,
      speed: 0.3,
      dust: 0
    });
  }

  // Очередь: не больше трёх фигурок одновременно, остальные — на следующих
  // синках. Ангары чередуются, поэтому при нескольких дверях толпы нет.
  function pumpExits(barracks) {
    while (troopExit.list.length < 3 && troopExit.pending.length && barracks.length) {
      const type = troopExit.pending.shift();
      const base = barracks[troopExit.door % barracks.length];
      troopExit.door++;
      spawnExit(type, base);
    }
  }

  function queueExits(added, barracks) {
    for (let i = 0; i < added.length; i++) troopExit.pending.push(added[i]);
    pumpExits(barracks);
  }

  function finishExit(w) {
    // вливается в обычную прогулку с конечной точки выхода
    w.pause = 0.3 + Math.random() * 0.8;
    w.tx = w.ex;
    w.ty = w.ey;
    w.path.length = 0;
    w.target = null;

    if (walkers.list.length >= 9) {
      let drop = -1;
      for (let i = 0; i < walkers.list.length; i++) {
        if (walkers.list[i].type !== w.type) { drop = i; break; }
      }
      if (drop < 0) drop = 0;
      walkers.list.splice(drop, 1);
    }
    walkers.list.push(w);
  }

  function updateExits(dt) {
    const list = troopExit.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];

      // задержка у двери: фигурка уже видна в проёме
      if (w.t < 0) {
        w.t += dt;
        w.x = w.sx;
        w.y = w.sy;
        continue;
      }

      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      const e = k * k * (3 - 2 * k);
      const bow = Math.sin(k * Math.PI) * w.arc;
      w.x = w.sx + (w.ex - w.sx) * e + w.nx * bow;
      w.y = w.sy + (w.ey - w.sy) * e + w.ny * bow;
      w.tx = w.ex;
      w.ty = w.ey;

      // лёгкая пыль из-под шага
      w.dust -= dt;
      if (w.dust <= 0 && k < 0.94) {
        w.dust = 0.16 + Math.random() * 0.12;
        troopExit.puffs.push({
          x: w.x,
          y: w.y,
          life: 0.5,
          max: 0.5,
          r: 3 + Math.random() * 3
        });
      }

      if (k >= 1) {
        list.splice(i, 1);
        finishExit(w);
      }
    }

    const puffs = troopExit.puffs;
    for (let i = puffs.length - 1; i >= 0; i--) {
      puffs[i].life -= dt;
      if (puffs[i].life <= 0) puffs.splice(i, 1);
    }
    if (puffs.length > 60) puffs.splice(0, puffs.length - 60);
  }

  // Пыль выхода рисуется под фигурками: несколько мягких эллипсов.
  function drawExitDust(ctx) {
    const puffs = troopExit.puffs;
    if (!puffs.length) return;
    const prev = ctx.globalAlpha;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      const k = p.life / p.max;
      const g = P(p.x, p.y);
      ctx.globalAlpha = prev * k * 0.3;
      ctx.fillStyle = 'rgba(232,205,170,1)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y - 0.5, p.r * (1.5 - k * 0.5),
        p.r * (1.5 - k * 0.5) * GQ, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = prev;
  }

  function walkerSync() {
    const barracks = walkerBarracks();
    const army = walkerArmy();
    const counts = walkerCounts();
    const order = CC.ARMY_ORDER || ['barb', 'archer', 'giant', 'goblin'];

    // Прирост и убыль относительно прошлого синка. Первый синк после
    // загрузки/сброса — базовая линия, пачку новобранцев не показываем.
    const added = [];
    let removed = false;
    if (troopExit.prev) {
      for (let i = 0; i < order.length; i++) {
        const type = order[i];
        const now = counts[type] || 0;
        const was = troopExit.prev[type] || 0;
        if (now > was) {
          const n = Math.min(5, now - was);
          for (let k = 0; k < n; k++) added.push(type);
        } else if (now < was) {
          removed = true;
        }
      }
    }
    troopExit.prev = counts;

    // Раскладка отдельно от состава: армия выросла — гуляющих не пересобираем,
    // только выпускаем новичков из дверей.
    let layoutSig = '';
    try {
      const all = CC.Base.list();
      for (let i = 0; i < all.length; i++) {
        layoutSig += all[i].type.charAt(0) + all[i].x + '.' + all[i].y + ';';
      }
    } catch (e) {
      /* нет данных — хватит и ангаров */
    }
    for (let i = 0; i < barracks.length; i++) {
      layoutSig += barracks[i].left + '.' + barracks[i].top + ';';
    }
    const sig = army.join(',') + '|' + layoutSig;

    if (!barracks.length || !army.length) {
      walkers.list.length = 0;
      walkers.sig = '';
      walkers.layoutSig = layoutSig;
      walkers.ready = true;
      troopExit.pending.length = 0;
      return;
    }

    if (walkers.ready && !removed && layoutSig === walkers.layoutSig) {
      walkers.sig = sig;
      if (added.length) queueExits(added, barracks);
      else if (troopExit.pending.length) pumpExits(barracks);
      return;
    }

    walkers.sig = sig;
    walkers.layoutSig = layoutSig;
    walkers.bounds = walkerBounds();
    troopExit.list.length = 0;
    troopExit.pending.length = 0;
    troopExit.puffs.length = 0;
    troopExit.door = 0;

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

      updateExits(dt);

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
    dots: null, cells: null, inner: null, innerPoly: null, border: null
  };

  // prefers-reduced-motion: пульс зоны высадки отключаем, геометрию не трогаем.
  const deployMotionQuery = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let deployReduceMotion = !!(deployMotionQuery && deployMotionQuery.matches);
  if (deployMotionQuery && deployMotionQuery.addEventListener) {
    deployMotionQuery.addEventListener('change', function (ev) {
      deployReduceMotion = !!(ev && ev.matches);
    });
  }

  // Полуразмер ромбика в клетках: ~1.4 px на экране на дальнем зуме и
  // ~2.4 px на ближнем. Пересчёт только при смене шага тайла (кэш).
  function deployDotR(tile) {
    const t = tile > 0 ? tile : TW;
    return Math.min(0.11, Math.max(0.028, (1.6 + t * 0.02) / t));
  }

  function deployDead(S) {
    let dead = 0;
    const list = S.buildings || [];
    for (let i = 0; i < list.length; i++) if (list[i].dead) dead++;
    return dead;
  }

  // Выпуклая оболочка (монотонная цепь). Точки — в координатах сетки.
  function deployHull(points) {
    if (points.length <= 3) return points.slice();
    const pts = points.slice().sort(function (a, b) {
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    function cross(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      while (lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function deployPointInPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (((a.y > y) !== (b.y > y)) &&
          (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) {
        inside = !inside;
      }
    }
    return inside;
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
    const inner = hasPath ? new Path2D() : null;
    const cells = [];
    const innerPoly = [];
    const border = hasPath ? new Path2D() : null;
    // Полуразмер ромбика в клетках — от текущего шага тайла.
    const r = deployDotR(tilePx);

    // Контур сердцевины базы: выпуклая оболочка занятых клеток с запасом
    // в один тайл. Это даёт один полигон вместо сотен ромбов в кадре.
    const pts = [];
    if (occ) {
      const m = 0.9;
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          if (occ[y * G + x] < 0) continue;
          const x0 = Math.max(0, x - m);
          const y0 = Math.max(0, y - m);
          const x1 = Math.min(G, x + 1 + m);
          const y1 = Math.min(G, y + 1 + m);
          pts.push(
            { x: x0, y: y0 }, { x: x1, y: y0 },
            { x: x1, y: y1 }, { x: x0, y: y1 }
          );
        }
      }
    }
    const hull = pts.length ? deployHull(pts) : [];
    if (inner && hull.length >= 3) {
      const h0 = P(hull[0].x, hull[0].y);
      inner.moveTo(h0.x, h0.y);
      for (let i = 1; i < hull.length; i++) {
        const hp = P(hull[i].x, hull[i].y);
        inner.lineTo(hp.x, hp.y);
      }
      inner.closePath();
    }
    for (let i = 0; i < hull.length; i++) {
      const hp = P(hull[i].x, hull[i].y);
      innerPoly.push(hp.x, hp.y);
    }

    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        // Постройка или стена сейчас — клетка занята, не подсвечиваем.
        if (occ && occ[i] >= 0) continue;
        // deployable — маска свободной высадки; клетку, освободившуюся
        // после сноса, добираем по живой сетке occ.
        if (!dep[i] && !(occ && occ[i] < 0)) continue;
        // Внутри контура базы точки не нужны: там тёмная сердцевина.
        if (hull.length >= 3 && deployPointInPoly(hull, x + 0.5, y + 0.5)) continue;

        const cx = x + 0.5;
        const cy = y + 0.5;
        if (dots) {
          const cp = P(cx, cy);
          const rx = r * TW;
          const ry = r * TH;
          dots.moveTo(cp.x, cp.y - ry);
          dots.lineTo(cp.x + rx, cp.y);
          dots.lineTo(cp.x, cp.y + ry);
          dots.lineTo(cp.x - rx, cp.y);
          dots.closePath();
        } else {
          cells.push(cx, cy);
        }
      }
    }

    // Внешняя граница — реальный ромб поля, а не квадрат в пикселях.
    if (border) {
      const A = P(0, 0);
      const B = P(G, 0);
      const C = P(G, G);
      const D = P(0, G);
      border.moveTo(A.x, A.y);
      border.lineTo(B.x, B.y);
      border.lineTo(C.x, C.y);
      border.lineTo(D.x, D.y);
      border.closePath();
    }

    deployCache.dep = dep;
    deployCache.occ = occ;
    deployCache.ver = ver;
    deployCache.dead = dead;
    deployCache.tile = tileKey;
    deployCache.count = S.buildings ? S.buildings.length : 0;
    deployCache.dots = dots;
    deployCache.cells = cells;
    deployCache.inner = inner;
    deployCache.innerPoly = innerPoly;
    deployCache.border = border;
    return deployCache;
  }

  function drawDeployZone(ctx, S) {
    if (!S || S.over) return;
    if (CC.App && CC.App.mode !== 'battle') return;
    // В повторе зона высадки не нужна: там уже идёт записанная атака.
    if (S.viewReplay && !S.autoDeploy) return;

    const dep = S.deployable;
    if (!dep) return;

    // Версия массива — если код высадки её выставит; иначе хватает ссылки
    // и числа погибших построек.
    const ver = typeof S.deployVersion === 'number' ? S.deployVersion : -1;
    const dead = deployDead(S);
    const geo = deployGeometry(S, dep, S.occ, ver, dead);
    const scale = tilePx > 0 ? tilePx / TW : 1;
    const r = deployDotR(tilePx);
    const selected = !!(S.selected && S.army && S.army[S.selected]);
    const pulse = (selected && !deployReduceMotion)
      ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0;

    // Свободная полоса: весь ромб поля чуть светлее грунта. Один полигон,
    // поэтому подсветка не стоит обхода клеток в каждом кадре.
    ctx.globalAlpha = selected ? 0.055 : 0.045;
    ctx.fillStyle = '#f6cfa4';
    if (geo.border) {
      ctx.fill(geo.border);
    } else {
      const A = P(0, 0);
      const B = P(G, 0);
      const C = P(G, G);
      const D = P(0, G);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.fill();
    }

    // Сердцевина базы: один выпуклый контур по занятым клеткам. Край мягкий:
    // лёгкий blur + несколько вложенных проходов, чтобы тёмное пятно не
    // выглядело наклейкой на грунте.
    let cx0 = 0;
    let cy0 = 0;
    let cw = 0;
    let ch = 0;
    let hasBox = false;
    if (geo.innerPoly && geo.innerPoly.length >= 6) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < geo.innerPoly.length; i += 2) {
        const px = geo.innerPoly[i];
        const py = geo.innerPoly[i + 1];
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
      if (x1 > x0 && y1 > y0) {
        cx0 = (x0 + x1) / 2;
        cy0 = (y0 + y1) / 2;
        cw = x1 - x0;
        ch = y1 - y0;
        hasBox = true;
      }
    }

    function fillInnerShape() {
      if (geo.inner) {
        ctx.fill(geo.inner);
      } else if (geo.innerPoly && geo.innerPoly.length >= 6) {
        ctx.beginPath();
        ctx.moveTo(geo.innerPoly[0], geo.innerPoly[1]);
        for (let i = 2; i < geo.innerPoly.length; i += 2) {
          ctx.lineTo(geo.innerPoly[i], geo.innerPoly[i + 1]);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.save();
    ctx.fillStyle = '#35130e';
    if (hasBox && typeof ctx.filter === 'string') {
      ctx.globalAlpha = 0.20;
      ctx.filter = 'blur(' + Math.max(3, 9 / scale).toFixed(1) + 'px)';
      fillInnerShape();
      ctx.filter = 'none';
    } else if (hasBox) {
      // запасной путь без filter: расширенный и сжатый контуры
      const passes = [
        { k: 1.08, a: 0.045 },
        { k: 1.0, a: 0.10 },
        { k: 0.92, a: 0.06 }
      ];
      for (let i = 0; i < passes.length; i++) {
        ctx.save();
        ctx.globalAlpha = passes[i].a;
        ctx.translate(cx0, cy0);
        ctx.scale(passes[i].k, passes[i].k);
        ctx.translate(-cx0, -cy0);
        fillInnerShape();
        ctx.restore();
      }
    } else {
      ctx.globalAlpha = 0.18;
      fillInnerShape();
    }
    ctx.restore();

    // Свободные клетки: без выбора — тихий статичный рисунок, с выбранным
    // войском — ярче и с пульсом (кроме prefers-reduced-motion).
    ctx.globalAlpha = selected ? (0.20 + 0.05 * pulse) : 0.075;
    ctx.fillStyle = selected ? '#fff1da' : '#ffe4c2';
    if (geo.dots) {
      ctx.fill(geo.dots);
    } else if (geo.cells.length) {
      const rx = r * TW;
      const ry = r * TH;
      ctx.beginPath();
      for (let i = 0; i < geo.cells.length; i += 2) {
        const cp = P(geo.cells[i], geo.cells[i + 1]);
        ctx.moveTo(cp.x, cp.y - ry);
        ctx.lineTo(cp.x + rx, cp.y);
        ctx.lineTo(cp.x, cp.y + ry);
        ctx.lineTo(cp.x - rx, cp.y);
        ctx.closePath();
      }
      ctx.fill();
    }

    // Внешняя граница зоны: широкая тёплая полоса 6.5 screen px, тёмная
    // подложка и мягкое свечение. На оранжевом грунте читается сразу.
    const edgeW = 6.5 / scale;
    function strokeFieldBorder() {
      if (geo.border) {
        ctx.stroke(geo.border);
      } else {
        const A = P(0, 0);
        const B = P(G, 0);
        const C = P(G, G);
        const D = P(0, G);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.lineTo(C.x, C.y);
        ctx.lineTo(D.x, D.y);
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = '#54180c';
    ctx.lineWidth = 9.5 / scale;
    strokeFieldBorder();

    ctx.globalAlpha = 0.17 + (selected ? 0.05 * pulse : 0);
    ctx.strokeStyle = '#ff5a32';
    ctx.lineWidth = 17 / scale;
    strokeFieldBorder();

    ctx.globalAlpha = 0.96;
    ctx.strokeStyle = '#ff6a36';
    ctx.lineWidth = edgeW;
    strokeFieldBorder();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffc08a';
    ctx.lineWidth = 1.8 / scale;
    strokeFieldBorder();

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
      ctx.ellipse(p.x, p.y, (7 + k * 4) * c.w, (7 + k * 4) * c.w * GQ, 0, 0, Math.PI * 2);
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

  /* ---------- 3D-смерть первых трёх войск ----------
     Бой удаляет погибшего из S.units сразу, поэтому падение нельзя
     рисовать в drawUnit. Ловим пропажу в trackBattle и кладём запись
     в unitDeaths: 4 кадра death с 8 fps, затем короткая задержка на
     последнем кадре и плавное растворение. Такие тела попадают в общий
     список глубины drawEntities, поэтому сортируются с постройками. */

  const UNIT_DEATH_MAX = 12;
  const UNIT_DEATH_DUR = 0.9;
  const UNIT_DEATH_FPS = 8;
  const unitDeaths = [];
  for (let i = 0; i < UNIT_DEATH_MAX; i++) {
    unitDeaths.push({
      on: false, type: '', dir: 4, x: 0, y: 0, t: 0, w: 1, h: 24
    });
  }
  let unitDeathNext = 0;

  function clearUnitDeaths() {
    for (let i = 0; i < unitDeaths.length; i++) unitDeaths[i].on = false;
  }

  // true — падение нарисовано 3D-кадрами; false — нужен старый труп.
  function startUnitDeath(e) {
    if (!e || !UNIT3D_V2[e.type] || !unit3dV2Ready(e.type)) return false;

    const dir = e.dir == null ? 4 : (e.dir & 7);
    if (!unit3dV2Sprite(e.type, 'death', dir, 0)) return false;

    const spec = unitSpecOf(e);
    const d = unitDeaths[unitDeathNext];
    unitDeathNext = (unitDeathNext + 1) % UNIT_DEATH_MAX;

    d.on = true;
    d.type = e.type;
    d.dir = dir;
    d.x = e.x;
    d.y = e.y;
    d.t = 0;
    d.w = spec.w || 1;
    d.h = spec.h || 24;

    const p = P(e.x, e.y);
    burst(p.x, p.y - 4, e.type === 'giant' ? 5 : 4, 1, e.type === 'giant' ? 34 : 26);
    return true;
  }

  function updateUnitDeaths(dt) {
    for (let i = 0; i < unitDeaths.length; i++) {
      const d = unitDeaths[i];
      if (!d.on) continue;
      d.t += dt;
      if (d.t >= UNIT_DEATH_DUR) d.on = false;
    }
  }

  function drawUnitDeath(ctx, d) {
    const cfg = UNIT3D_V2[d.type];
    const frame = Math.min(3, Math.floor(d.t * UNIT_DEATH_FPS));
    const canvas = unit3dV2Sprite(d.type, 'death', d.dir, frame);
    if (!cfg || !canvas) return;

    const p = P(d.x, d.y);
    const q = Math.min(1, d.t / UNIT_DEATH_DUR);
    const fade = d.t > UNIT_DEATH_DUR - 0.18
      ? Math.max(0, (UNIT_DEATH_DUR - d.t) / 0.18) : 1;
    const prev = ctx.globalAlpha;

    // оседающая тень: тело ложится, пятно чуть растёт и гаснет
    const shR = 7.5 * d.w * (d.h / 24) * UNIT_DRAW_SCALE;
    ctx.globalAlpha = prev * 0.22 * (1 - q * 0.45) * fade;
    ctx.fillStyle = 'rgba(34,52,24,1)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, shR * (1 + q * 0.25), shR * GQ * (1 + q * 0.25),
      0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = prev * fade;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(UNIT_DRAW_SCALE, UNIT_DRAW_SCALE);
    ctx.drawImage(canvas, -cfg.ax, -cfg.ay, cfg.w, cfg.h);
    ctx.restore();
    ctx.globalAlpha = prev;
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
    if (type === 'elixir' || type === 'estorage') return 7;
    if (type === 'lab') return 7;
    if (type === 'herohall') return 5;
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
      ctx.ellipse(cx, cy, 12 * c.w * sc, 12 * c.w * sc * GQ, 0, 0, Math.PI * 2);
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
    clearUnitDeaths();
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
      // трём первым — полноценное падение, остальным хватает пыли/старого трупа
      if (lost <= 3 && !startUnitDeath(e)) addCorpse(e);
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
      // последнее направление нужно для кадров смерти: юнит исчезает из
      // S.units до следующего кадра, и unitMotion для него уже не вызовут.
      const mm = unitMv.get(u);
      e.dir = (mm && mm.dir >= 0) ? mm.dir : 4;
    }
    track.list.length = units.length;

    void dt;
  }

  /* ---------- снаряды ---------- */

  // ядра мортиры, которые уже дали пыль при падении
  const landedShots = new WeakSet();

  // Молния/цепь: детерминированная ломаная между двумя точками.
  // Одна path на разряд: в кадре это 6-8 сегментов, без канв и градиентов.
  function drawArcBolt(ctx, ax, ay, bx, by, alpha, color, seed, width) {
    const a = alpha == null ? 1 : alpha;
    if (a <= 0.01) return;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = 7;
    const sd = seed || 1;
    ctx.strokeStyle = color || 'rgba(159,232,255,1)';
    ctx.lineCap = 'round';
    ctx.lineWidth = width || 1.4;
    // мягкое свечение под основной линией
    ctx.globalAlpha = a * 0.35;
    ctx.lineWidth = (width || 1.4) * 3.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const off = Math.sin(i * 12.9898 + sd * 3.7) * 3.4 * Math.sin(k * Math.PI);
      ctx.lineTo(ax + dx * k + nx * off, ay + dy * k + ny * off);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
    // ядро
    ctx.globalAlpha = a;
    ctx.lineWidth = width || 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const off = Math.sin(i * 12.9898 + sd * 3.7) * 2.6 * Math.sin(k * Math.PI);
      ctx.lineTo(ax + dx * k + nx * off, ay + dy * k + ny * off);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawShots(ctx, S) {
    const shots = S.shots || [];

    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const dur = s.dur || 0.14;
      const k = Math.max(0, Math.min(1, (s.t || 0) / dur));

      const sKind = (s.kind || s.type || '');
      // орбитальный луч — отдельная векторная полоса, а не снаряд
      if (sKind === 'beam' || sKind === 'lance' || sKind === 'orbital') {
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

      if (sKind === 'archer') {
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
      } else if (sKind === 'mortar') {
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
      } else if (sKind === 'xbow' || sKind === 'rail' || sKind === 'railgun') {
        // рельса: короткий яркий стержень вдоль траектории
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        ctx.strokeStyle = 'rgba(127,233,255,.25)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x - ux * 16, y - uy * 16);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(210,250,255,.95)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - ux * 14, y - uy * 14);
        ctx.lineTo(x + ux * 2, y + uy * 2);
        ctx.stroke();
        spot(ctx, x, y, 2, 'rgba(255,255,255,.9)');
      } else if (sKind === 'ricochet' || sKind === 'bounce') {
        // прыгающий диск: дуга и два следа отскока
        const arc = Math.sin(k * Math.PI) * 7;
        const cx = x;
        const cy = y - arc;
        ctx.strokeStyle = 'rgba(169,208,212,.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - (bx - ax) * 0.14, cy + 2);
        ctx.lineTo(cx, cy + 1);
        ctx.stroke();
        ctx.fillStyle = '#b8ccd0';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3.4, 2.4, Math.atan2(by - ay, bx - ax), 0, Math.PI * 2);
        ctx.fill();
        spot(ctx, cx + 1, cy - 1, 1.1, PAL.cold);
      } else if (sKind === 'scattershot' || sKind === 'pellet') {
        // картечь: мелкий шарик с коротким теплым следом
        ctx.strokeStyle = 'rgba(255,207,74,.28)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - (bx - ax) * 0.16, y - (by - ay) * 0.16 + 1);
        ctx.lineTo(x, y + 1);
        ctx.stroke();
        spot(ctx, x, y, 1.9, '#d8a05a');
        spot(ctx, x - 0.5, y - 0.5, 0.8, 'rgba(255,240,210,.9)');
      } else if (sKind === 'eagle' || sKind === 'hammer') {
        // тяжёлый снаряд «Молота»: высокий навес и дым
        const arc = Math.sin(k * Math.PI) * 26;
        const cx = x;
        const cy = y - arc;
        ctx.strokeStyle = 'rgba(90,74,58,.22)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - (bx - ax) * 0.18, cy + 3);
        ctx.lineTo(cx, cy + 1);
        ctx.stroke();
        spot(ctx, cx, cy, 4.4, '#4a4038');
        spot(ctx, cx - 1, cy - 1, 2.6, '#8a7358');
        spot(ctx, cx, cy, 1.2, 'rgba(255,207,74,.85)');
      } else if (sKind === 'firespitter' || sKind === 'flame') {
        // конус пламени: три язычка, сходящихся к цели
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px2 = -uy;
        const py2 = ux;
        for (let i = -1; i <= 1; i++) {
          const w = (1 - Math.abs(i) * 0.4) * (6 + k * 6);
          const jx = x + px2 * i * w;
          const jy = y + py2 * i * w * 0.7;
          poly(ctx, [
            { x: jx - ux * 12, y: jy - uy * 12 },
            { x: jx + px2 * 3 + ux * 3, y: jy + py2 * 3 + uy * 3 },
            { x: jx - px2 * 3 + ux * 3, y: jy - py2 * 3 + uy * 3 }
          ], i === 0 ? 'rgba(255,236,180,.75)' : 'rgba(255,138,74,.55)');
        }
      } else if (sKind === 'firecracker' || sKind === 'firework') {
        // залповая ракета: тёплый шлейф, искры веером и хвост
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px2 = -uy;
        const py2 = ux;
        ctx.strokeStyle = 'rgba(255,176,90,.26)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - ux * 13, y - uy * 13);
        ctx.lineTo(x, y);
        ctx.stroke();
        poly(ctx, [
          { x: x + ux * 3.4, y: y + uy * 3.4 },
          { x: x + px2 * 2.2, y: y + py2 * 2.2 },
          { x: x - ux * 3.4, y: y - uy * 3.4 },
          { x: x - px2 * 2.2, y: y - py2 * 2.2 }
        ], '#8a5a34');
        spot(ctx, x - ux * 0.6, y - uy * 0.6, 1.5, 'rgba(255,220,150,.95)');
        for (let i = -1; i <= 1; i++) {
          const jx = x - ux * (7 + Math.abs(i) * 2) + px2 * i * 3.4;
          const jy = y - uy * (7 + Math.abs(i) * 2) + py2 * i * 3.4;
          spot(ctx, jx, jy, 0.9, i === 0 ? 'rgba(255,236,180,.8)'
            : 'rgba(255,176,90,.65)');
        }
        if (k > 0.84 && !s.__burst) {
          s.__burst = true;
          burst(bx, by - 4, 4, 2, 28);
        }
      } else if (sKind === 'revenge' || sKind === 'punish') {
        // тёмный залп: чёрное ядро в фиолетовом ореоле
        const arc = Math.sin(k * Math.PI) * 7;
        const cx = x;
        const cy = y - arc;
        ctx.strokeStyle = 'rgba(44,28,58,.34)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - (bx - ax) * 0.16, cy - (by - ay) * 0.16 + 2);
        ctx.lineTo(cx, cy + 1);
        ctx.stroke();
        spot(ctx, cx, cy, 4.8, 'rgba(92,52,124,.24)');
        spot(ctx, cx, cy, 2.9, '#2a1a34');
        spot(ctx, cx - 0.6, cy - 0.6, 1.3, 'rgba(230,200,255,.9)');
        spot(ctx, cx + 2, cy + 2, 0.8, 'rgba(201,143,224,.55)');
      } else if (sKind === 'superwizard' || sKind === 'plasma' ||
        sKind === 'chainplasma') {
        // плазменная сфера: ядро, кольцо и фиолетовые нити
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px2 = -uy;
        const py2 = ux;
        const arc = Math.sin(k * Math.PI) * 8;
        const cx = x;
        const cy = y - arc;
        for (let i = -1; i <= 1; i++) {
          uBar(ctx, cx, cy,
            cx - ux * (9 + Math.abs(i) * 2) + px2 * i * 3.6,
            cy - uy * (9 + Math.abs(i) * 2) + py2 * i * 3.6,
            0.8, 'rgba(224,166,255,.55)');
        }
        spot(ctx, cx, cy, 6.4, 'rgba(160,110,220,.25)');
        spot(ctx, cx, cy, 3.9, '#a878d8');
        spot(ctx, cx - 0.7, cy - 0.7, 2, 'rgba(240,214,255,.95)');
        spot(ctx, cx - 1.2, cy - 1.2, 0.9, 'rgba(255,255,255,.95)');
        ring(ctx, cx, cy, 7, 3, 'rgba(224,166,255,.5)', 0.9);
      } else if (sKind === 'spiky' || sKind === 'thorns') {
        // ответный шип: короткая тёплая спица от башни к цели
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        uBar(ctx, x - ux * 7, y - uy * 7, x, y, 1.5, '#c8a078');
        poly(ctx, [
          { x: x + ux * 3, y: y + uy * 3 },
          { x: x - uy * 1.8 - ux * 1.6, y: y + ux * 1.8 - uy * 1.6 },
          { x: x + uy * 1.8 - ux * 1.6, y: y - ux * 1.8 - uy * 1.6 }
        ], '#e0b07a');
        spot(ctx, x, y, 1.1, 'rgba(255,236,190,.8)');
      } else if (sKind === 'spelltower' || sKind === 'spell' || sKind === 'orb') {
        // сфера поля: ядро и кольцо рун
        spot(ctx, x, y, 4.2, 'rgba(200,170,255,.35)');
        spot(ctx, x, y, 2.6, '#c8aaff');
        spot(ctx, x - 0.8, y - 0.8, 1.2, 'rgba(255,255,255,.9)');
        ctx.strokeStyle = 'rgba(200,170,255,.6)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(x, y, 5.4, 2.6, 0.4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (sKind === 'monolith' || sKind === 'shard') {
        // осколок обелиска: тёмный ромб с холодной кромкой
        poly(ctx, [
          { x: x, y: y - 5 },
          { x: x + 3.4, y: y },
          { x: x, y: y + 5 },
          { x: x - 3.4, y: y }
        ], '#5c6674');
        spot(ctx, x, y, 1.2, 'rgba(196,222,255,.9)');
      } else if (sKind === 'multigear' || sKind === 'gear') {
        // два трассера: стволы стреляют очередью
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;
        for (let i = -1; i <= 1; i += 2) {
          ctx.strokeStyle = 'rgba(255,207,74,.7)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x + nx * i * 3 - ux * 8, y + ny * i * 3 - uy * 8);
          ctx.lineTo(x + nx * i * 3, y + ny * i * 3);
          ctx.stroke();
        }
      } else if (sKind === 'thweapon' || sKind === 'core') {
        // орудие центра: крупный плазменный снаряд
        const arc = Math.sin(k * Math.PI) * 8;
        const cx = x;
        const cy = y - arc;
        spot(ctx, cx, cy, 5.4, 'rgba(255,207,74,.3)');
        spot(ctx, cx, cy, 3.2, '#9fe8ff');
        spot(ctx, cx - 1, cy - 1, 1.6, 'rgba(255,255,255,.9)');
        ring(ctx, cx, cy, 6, 2.6, 'rgba(255,207,74,.5)', 0.9);
      } else if (sKind === 'chain' || sKind === 'bolt' || sKind === 'lightning') {
        drawArcBolt(ctx, ax, ay, bx, by, 0.85, 'rgba(159,232,255,.95)',
          (s.x1 || 1) + (s.t || 0) * 10, 1.2);
        spot(ctx, bx, by, 2.2, 'rgba(220,250,255,.9)');
      } else if (sKind === 'freeze' || sKind === 'ice') {
        // ледяной шип
        poly(ctx, [
          { x: x + 4, y: y - 1 },
          { x: x - 3, y: y - 2.4 },
          { x: x - 1, y: y + 2.4 }
        ], 'rgba(184,240,255,.9)');
        spot(ctx, x, y, 1.4, 'rgba(255,255,255,.85)');
      } else if (sKind === 'poison' || sKind === 'toxin') {
        spot(ctx, x, y, 3.2, 'rgba(150,210,80,.45)');
        spot(ctx, x, y - 0.4, 2, '#b9e08a');
      } else if (sKind === 'tornado' || sKind === 'vortex') {
        ctx.strokeStyle = 'rgba(169,216,232,.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const rr = 5 + i * 3;
          ctx.moveTo(x - rr, y - 2 + i * 1.6);
          ctx.ellipse(x, y - 2 + i * 1.6, rr, rr * 0.36, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
        spot(ctx, x, y - 2, 1.6, PAL.cold);
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
      const fk = (f.kind || f.type || '');

      if (fk === 'boom') {
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
      } else if (fk === 'trapBoom') {
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
      } else if (fk === 'spring') {
        // пружина: два разлетающихся металлических кольца
        const size = (f.size || 1) * 10;
        ctx.strokeStyle = 'rgba(201,211,220,' + (0.6 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4, 6 + k * size, (6 + k * size) * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,207,74,' + (0.4 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 10 - k * 6, 3 + k * 7, (3 + k * 7) * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fk === 'reveal') {
        // раскрытие засады: пыль из-под крышки и расширяющийся контур
        ctx.strokeStyle = 'rgba(224,176,69,' + (0.45 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 2, 6 + k * 16, (6 + k * 16) * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(226,213,190,' + (0.3 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 5 - k * 5, 3 + k * 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (fk === 'chain' || fk === 'bolt' || fk === 'lightning') {
        // цепь: дуга до второй точки, гаснет к концу
        if (typeof f.x2 === 'number' && typeof f.y2 === 'number') {
          const p2 = P(f.x2, f.y2);
          drawArcBolt(ctx, p.x, p.y - 14, p2.x, p2.y - 10,
            (1 - k) * 0.95, 'rgba(159,232,255,.95)',
            (f.x || 1) + k * 9, 1.5);
          spot(ctx, p2.x, p2.y - 10, 2.6 * (1 - k), 'rgba(220,250,255,.85)');
        }
      } else if (fk === 'freeze' || fk === 'ice') {
        // криополе: расширяющееся кольцо и кристаллы
        const r = 5 + k * 20;
        ctx.strokeStyle = 'rgba(184,240,255,' + (0.65 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + (f.x || 0);
          const x0 = p.x + Math.cos(a) * r * 0.45;
          const y0 = p.y + Math.sin(a) * r * 0.45 * GQ;
          const x1 = p.x + Math.cos(a) * r;
          const y1 = p.y + Math.sin(a) * r * GQ;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - Math.cos(a + 0.5) * 3, y1 - Math.sin(a + 0.5) * 3);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(220,250,255,' + (0.3 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 4, 5 + k * 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (fk === 'poison' || fk === 'toxin') {
        // токсин: зелёное кольцо и пузыри
        const r = 5 + k * 16;
        ctx.strokeStyle = 'rgba(150,210,80,' + (0.55 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 2, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,170,70,' + (0.28 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6 - k * 4, 6 + k * 12, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + 0.5;
          spot(ctx, p.x + Math.cos(a) * r * 0.7,
            p.y - 4 + Math.sin(a) * r * 0.5 * GQ - k * 5,
            1.4 * (1 - k), 'rgba(200,240,140,.7)');
        }
      } else if (fk === 'tornado' || fk === 'vortex') {
        // гравитационная воронка: кольца сжимаются и поднимаются
        for (let i = 0; i < 4; i++) {
          const q = (k + i * 0.18) % 1;
          const rr = (12 - q * 8) * (f.size || 1);
          ctx.strokeStyle = 'rgba(169,216,232,' + (0.45 * (1 - q)).toFixed(2) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - q * 16, rr, rr * GQ * 1.2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        spot(ctx, p.x, p.y - 8, 2, 'rgba(220,250,255,.6)');
      } else if (fk === 'ricochet' || fk === 'bounce') {
        // отскок: расходящиеся искры
        const r = 3 + k * 10;
        ctx.strokeStyle = 'rgba(169,208,212,' + (0.6 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, r, 0.2, Math.PI - 0.2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = -0.9 + i * 0.9;
          spot(ctx, p.x + Math.cos(a) * r * 1.4, p.y - 8 + Math.sin(a) * r,
            1, 'rgba(255,240,210,.8)');
        }
      } else if (fk === 'spelltower' || fk === 'spell' || fk === 'nullfield') {
        // поле генератора: рунический круг на земле
        const r = 8 + k * 18;
        ctx.strokeStyle = 'rgba(200,170,255,' + (0.5 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,207,74,' + (0.3 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.7, r * 0.7 * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + k;
          spot(ctx, p.x + Math.cos(a) * r * 0.85,
            p.y + Math.sin(a) * r * 0.85 * GQ, 0.9, 'rgba(226,210,255,.8)');
        }
      } else if (fk === 'sweeper' || fk === 'wind') {
        // импульс воздуха: три дуги, уходящие от башни
        const r = 6 + k * 22;
        ctx.strokeStyle = 'rgba(169,216,232,' + (0.4 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.arc(p.x, p.y - 8, r + i * 4, -0.7 + i * 0.15, 0.7 + i * 0.1);
        }
        ctx.stroke();
      } else if (fk === 'spiky' || fk === 'thorns') {
        // шиповой ответ: короткие спицы из земли и тёплое кольцо
        const r = 5 + k * 15;
        ctx.strokeStyle = 'rgba(214,160,106,' + (0.55 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + (f.x || 0);
          const x0 = p.x + Math.cos(a) * r * 0.4;
          const y0 = p.y + Math.sin(a) * r * 0.4 * GQ;
          const x1 = p.x + Math.cos(a) * r;
          const y1 = p.y + Math.sin(a) * r * GQ - 4;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        spot(ctx, p.x, p.y - 6, 1.4 * (1 - k), 'rgba(255,236,190,.75)');
      } else if (fk === 'revenge' || fk === 'punish') {
        // тёмный залп: фиолетовое кольцо и угольные искры
        const r = 6 + k * 18;
        ctx.strokeStyle = 'rgba(160,96,200,' + (0.45 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(34,20,44,' + (0.28 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 7 - k * 6, 5 + k * 10, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6 + 0.4;
          spot(ctx, p.x + Math.cos(a) * r * 0.7,
            p.y - 5 + Math.sin(a) * r * 0.5 * GQ, 0.9 * (1 - k),
            'rgba(224,166,255,.7)');
        }
      } else if (fk === 'superwizard' || fk === 'plasma') {
        // цепная плазма: ядро, кольцо и дуга ко второй цели
        const r = 7 + k * 16;
        ctx.strokeStyle = 'rgba(224,166,255,' + (0.55 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 5, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        spot(ctx, p.x, p.y - 7, 4 + k * 6, 'rgba(160,110,220,.2)');
        spot(ctx, p.x, p.y - 7, 1.6 * (1 - k), 'rgba(244,224,255,.9)');
        if (typeof f.x2 === 'number' && typeof f.y2 === 'number') {
          const p2 = P(f.x2, f.y2);
          drawArcBolt(ctx, p.x, p.y - 8, p2.x, p2.y - 8,
            (1 - k) * 0.9, 'rgba(224,166,255,.95)',
            (f.x || 1) + k * 11, 1.3);
          spot(ctx, p2.x, p2.y - 8, 2 * (1 - k), 'rgba(244,224,255,.8)');
        }
      } else if (fk === 'firecracker' || fk === 'firework') {
        // взрыв залпа: оранжевый веер искр и тёплое кольцо
        const r = 5 + k * 17;
        ctx.strokeStyle = 'rgba(255,176,90,' + (0.5 * (1 - k)).toFixed(2) + ')';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4, r, r * GQ, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const a = -0.9 + i * 0.3;
          const rr = r * (0.7 + (i % 2) * 0.3);
          spot(ctx, p.x + Math.cos(a) * rr, p.y - 6 + Math.sin(a) * rr * GQ,
            1.2 * (1 - k), i % 2 ? 'rgba(255,236,180,.85)'
              : 'rgba(255,154,90,.8)');
        }
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

  // Красный штандарт над вражеским центром: цель видно с первого кадра.
  // Чистая декорация боя, состояние не меняет.
  function drawEnemyStandard(ctx, S) {
    if (!S || !S.buildings || !S.buildings.length) return;
    let th = null;
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (!b || b.dead || b.type !== 'townhall') continue;
      th = b;
      break;
    }
    if (!th) return;

    const lvl = levelOf(th);
    const p = P(th.x + th.w / 2, th.y + th.h / 2);
    const baseY = p.y - Math.min(crown(th, lvl), 96) + 20;
    const topY = baseY - 46;
    if (!pointVisible(p.x, p.y, 180)) return;

    // мягкое красное свечение, чтобы флаг не терялся на закатном грунте
    const glow = ctx.createRadialGradient(p.x + 10, topY + 10, 2,
      p.x + 10, topY + 10, 34);
    glow.addColorStop(0, 'rgba(255,88,64,.22)');
    glow.addColorStop(1, 'rgba(255,88,64,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x + 10, topY + 10, 34, 0, Math.PI * 2);
    ctx.fill();

    // древко
    ctx.strokeStyle = '#241a16';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, baseY);
    ctx.lineTo(p.x, topY - 2);
    ctx.stroke();
    ctx.strokeStyle = '#b8c2c6';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p.x - 0.8, baseY);
    ctx.lineTo(p.x - 0.8, topY - 1);
    ctx.stroke();
    spot(ctx, p.x, topY - 4, 2.2, PAL.gold);
    spot(ctx, p.x - 0.5, topY - 4.4, 0.8, 'rgba(255,250,235,.85)');

    // полотнище: красный стяг с золотой окантовкой и шевронами
    const wave = Math.sin(t * 2.3) * 2.2;
    const wave2 = Math.sin(t * 2.3 + 0.8) * 1.6;
    const fL = p.x + 1;
    const fR = p.x + 27 + wave;
    const fTop = topY - 1;
    const fBot = topY + 24;
    ctx.fillStyle = '#c9342b';
    ctx.strokeStyle = '#6d1712';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(fL, fTop);
    ctx.lineTo(fR, fTop + 3 + wave2);
    ctx.lineTo(fR - 3, fBot + wave2);
    ctx.lineTo(fL, fBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,207,74,.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(fL + 1, fTop + 3);
    ctx.lineTo(fR - 3, fTop + 5.5 + wave2);
    ctx.moveTo(fL + 1, fBot - 3);
    ctx.lineTo(fR - 5, fBot - 1 + wave2);
    ctx.stroke();

    // пара золотых шевронов — «штандарт сектора» без текста
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      const yy = topY + 8 + k * 6;
      ctx.beginPath();
      ctx.moveTo(p.x + 7, yy + 4);
      ctx.lineTo(p.x + 12, yy);
      ctx.lineTo(p.x + 18, yy + 4);
      ctx.stroke();
    }
  }

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

  /* ---------- состояния окон покупки ---------- */
  // Разметкой и обработчиками владеет ui.js. Здесь только визуальное
  // состояние: набор нельзя купить, если платины не хватает или склад полон.
  // В песочницах без карточек (scene-check/tests) функция молча выключается.
  let buyHudAt = 0;

  function syncBuyHud() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const now = Date.now();
    if (now - buyHudAt < 120) return;
    buyHudAt = now;

    let cards;
    try {
      cards = document.querySelectorAll('#buyres .buy-offer[data-buy-res][data-buy-gems]');
    } catch (e) {
      return;
    }
    if (!cards || !cards.length) return;
    if (!CC.Game || typeof CC.Game.gems !== 'function') return;

    const first = cards[0];
    const res = first.getAttribute('data-buy-res') === 'elixir' ? 'elixir' : 'gold';
    const th = CC.Game.townhallLevel ? CC.Game.townhallLevel() : 1;
    const gems = Number(CC.Game.gems()) || 0;
    const cap = CC.Game.cap ? Number(CC.Game.cap(res)) || 0 : 0;
    const held = res === 'elixir'
      ? (CC.Game.elixir ? Number(CC.Game.elixir()) || 0 : 0)
      : (CC.Game.gold ? Number(CC.Game.gold()) || 0 : 0);
    const free = Math.max(0, Math.floor(cap - held));

    let anyShort = false;
    let anyPartial = false;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const n = Number(card.getAttribute('data-buy-gems')) || 0;
      const amount = CC.resBuyAmount ? Number(CC.resBuyAmount(res, n, th)) || 0 : 0;
      const full = free <= 0;
      const short = !full && n > gems;
      const partial = !full && amount > free;
      if (short) anyShort = true;
      if (partial) anyPartial = true;

      if (card.classList) {
        card.classList.toggle('is-short', short);
        card.classList.toggle('is-full', full);
        card.classList.toggle('is-partial', partial);
      }
      if (full) card.setAttribute('disabled', 'disabled');
      else card.removeAttribute('disabled');

      const label = card.querySelector ? card.querySelector('.shop-card__count') : null;
      if (!label) continue;
      if (!label.getAttribute('data-buy-label')) {
        label.setAttribute('data-buy-label', label.textContent || 'Купить');
      }
      const base = label.getAttribute('data-buy-label') || 'Купить';
      const want = short
        ? 'Не хватает ' + (n - gems)
        : (full ? 'Склад полон' : base);
      if (label.textContent !== want) label.textContent = want;
    }

    const win = document.getElementById ? document.getElementById('buyres') : null;
    const box = win && win.querySelector ? win.querySelector('.buy-card') : null;
    if (box && box.classList) {
      box.classList.toggle('has-short', anyShort);
      box.classList.toggle('has-partial', anyPartial);
      box.classList.toggle('has-full', free <= 0);
    }
  }


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

    // каждая клетка стены — отдельный элемент сортировки; соседей берём
    // по сетке, поэтому прогоны больше не влияют на форму стыков
    const cells = wallCells(buildings);
    for (let i = 0; i < cells.length; i++) {
      const s = cells[i];
      if (!footprintVisible(s.x, s.y, s.x + 1, s.y + 1, wallTopPx(s.lvl) + 8)) continue;
      list.push({ d: (s.x + 0.5) + (s.y + 0.5), kind: 'w', ref: s });
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

    // падающие тела 3D-войск — в общем списке глубины, а не поверх сцены
    for (let i = 0; i < unitDeaths.length; i++) {
      const d = unitDeaths[i];
      if (!d.on) continue;
      const wp = P(d.x, d.y);
      if (!pointVisible(wp.x, wp.y, 90)) continue;
      list.push({ d: d.x + d.y, kind: 'd', ref: d });
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
      } else if (list[i].kind === 'd') {
        drawUnitDeath(ctx, list[i].ref);
      } else {
        drawUnit(ctx, list[i].ref);
      }
    }

    // полоски здоровья стен — поверх всего, по одной на пролёт
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (!footprintVisible(r.x, r.y, r.x + r.w, r.y + r.h, 80)) continue;
      const top = wallTopPx(r.lvl || 1) + 4;
      wallHpBar(ctx, r, top);
    }
  }

  /* ---------- Сержант-инструктор у командного центра ----------
     Пока обучение активно, рядом с центром стоит маленькая фигурка
     с маркером «!». Это декор: рендер только читает CC.Game.tutorial()
     и CC.Base.list(), кликов и хит-тестов не добавляет. */

  function tutorialRunning() {
    try {
      const g = CC.Game;
      if (!g || typeof g.tutorial !== 'function') return false;
      const tut = g.tutorial();
      return !!(tut && tut.active);
    } catch (e) {
      return false;
    }
  }

  function cellBusy(x, y) {
    let list;
    try {
      list = CC.Base.list();
    } catch (e) {
      return true;
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.dead) continue;
      const s = CC.Base.size(b.type) || { w: 1, h: 1 };
      if (x > b.x - 0.25 && x < b.x + (s.w || 1) + 0.25 &&
          y > b.y - 0.25 && y < b.y + (s.h || 1) + 0.25) return true;
    }
    return false;
  }

  // Свободная клетка у центра: сначала справа-спереди (фигура не спорит
  // с самим зданием), затем другие стороны. Без pathfinding и записи в базу.
  function sergeantPost() {
    let list;
    try {
      list = CC.Base.list();
    } catch (e) {
      return null;
    }
    let hall = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && !list[i].dead && list[i].type === 'townhall') {
        hall = list[i];
        break;
      }
    }
    if (!hall) return null;

    const s = CC.Base.size('townhall') || { w: 3, h: 3 };
    const w = s.w || 3;
    const h = s.h || 3;
    const spots = [
      { x: hall.x + w + 0.32, y: hall.y + h + 0.32 },
      { x: hall.x - 0.32, y: hall.y + h + 0.32 },
      { x: hall.x + w + 0.32, y: hall.y + h - 0.4 },
      { x: hall.x + w - 0.5, y: hall.y - 0.32 }
    ];
    for (let i = 0; i < spots.length; i++) {
      if (!cellBusy(spots[i].x, spots[i].y)) return spots[i];
    }
    return null;
  }

  function drawTutorialSergeant(ctx) {
    if (!tutorialRunning()) return;
    const spot = sergeantPost();
    if (!spot) return;

    const p = P(spot.x, spot.y);
    if (!pointVisible(p.x, p.y, 110)) return;

    const bob = Math.sin(t * 2.1) * 1.1;
    const sway = Math.sin(t * 1.55) * 0.35;

    ctx.save();
    ctx.translate(p.x, p.y);

    // мягкое пятно на грунте: место Сержанта не путается с юнитом
    ctx.fillStyle = 'rgba(34,52,24,.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(70,224,200,.5)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 12, 4.8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // фигура инструктора в 1.5 раза крупнее: масштаб от ступней (0,0)
    ctx.save();
    ctx.scale(1.5, 1.5);

    // красный плащ и ноги
    poly(ctx, [
      { x: -5.2, y: -13 + bob },
      { x: 5.2, y: -13 + bob },
      { x: 6.4, y: -1.5 },
      { x: 1.2, y: -0.6 },
      { x: -6.2, y: -1.8 }
    ], '#8e2f23');
    poly(ctx, [
      { x: -3.4, y: -12 + bob },
      { x: 3.4, y: -12 + bob },
      { x: 4.6, y: -3.2 },
      { x: -4.6, y: -3.2 }
    ], '#d4573c');

    ctx.fillStyle = '#4c565c';
    ctx.fillRect(-3.4, -6.2, 2.5, 6.4);
    ctx.fillRect(1.0, -6.2, 2.5, 6.4);
    ctx.fillStyle = '#2f271b';
    ctx.fillRect(-3.9, -1.2, 3.3, 1.5);
    ctx.fillRect(0.6, -1.2, 3.3, 1.5);

    // корпус
    poly(ctx, [
      { x: -4.6, y: -15.5 + bob },
      { x: 4.6, y: -15.5 + bob },
      { x: 5.3, y: -6.0 },
      { x: -5.3, y: -6.0 }
    ], '#c9b487');
    ctx.fillStyle = '#b23a2c';
    ctx.fillRect(-4.3, -10.3 + bob, 8.6, 1.4);
    ctx.fillStyle = '#ffcf4a';
    ctx.fillRect(-0.8, -13.8 + bob, 1.6, 1.6);

    // наплечники: две пластины, золотая кромка
    ctx.fillStyle = '#8a7753';
    ctx.beginPath();
    ctx.ellipse(-5.5 + sway, -14.2 + bob, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5.5 + sway, -14.2 + bob, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffcf4a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(-5.5 + sway, -14.2 + bob, 2.7, 1.9, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(5.5 + sway, -14.2 + bob, 2.7, 1.9, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // шлем и бирюзовый визор
    ctx.fillStyle = '#cdb887';
    ctx.beginPath();
    ctx.ellipse(0, -19.6 + bob, 5.3, 5.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a7753';
    ctx.beginPath();
    ctx.ellipse(0, -19.2 + bob, 4.4, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b23a2c';
    ctx.fillRect(-0.8, -24.7 + bob, 1.6, 5.4);
    ctx.fillStyle = '#0a2f33';
    ctx.fillRect(-3.8, -20.6 + bob, 7.6, 3.1);
    ctx.fillStyle = '#46e0c8';
    ctx.fillRect(-3.3, -20.2 + bob, 6.6, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillRect(-2.4, -19.9 + bob, 2.4, 0.6);

    // антенна
    ctx.strokeStyle = '#d9c697';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(4.0, -23.2 + bob);
    ctx.lineTo(7.2, -28.4 + bob);
    ctx.stroke();
    ctx.fillStyle = '#46e0c8';
    ctx.beginPath();
    ctx.arc(7.4, -28.8 + bob, 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // маркер «!»: приподнят над головой и мягко покачивается
    const my = -51 + bob * 1.8;
    ctx.fillStyle = 'rgba(9,20,24,.92)';
    ctx.beginPath();
    ctx.arc(0, my, 8.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,224,200,.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, my, 8.6, 0, Math.PI * 2);
    ctx.stroke();
    poly(ctx, [
      { x: -4.0, y: my + 6.6 },
      { x: 4.0, y: my + 6.6 },
      { x: 0, y: my + 11.6 }
    ], 'rgba(9,20,24,.92)');

    ctx.fillStyle = '#ffcf4a';
    ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, my + 0.6);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    ctx.restore();
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
    townhall: [92, 94, 96, 104, 108, 112, 116, 124, 128, 132],
    barracks: [64, 66, 70, 76, 82, 86, 90, 100, 106, 118],
    archer: [64, 74, 74, 86, 88, 94, 100, 112, 118, 126],
    airdef: [58, 62, 66, 72, 78, 84, 90, 102, 108, 120],
    mage: [66, 68, 72, 78, 84, 90, 96, 104, 110, 122],
    cannon: [48, 50, 56, 58, 60, 64, 68, 76, 82, 90],
    mortar: [56, 56, 58, 60, 62, 66, 70, 78, 84, 92],
    goldmine: [64, 66, 68, 72, 78, 84, 88, 100, 106, 116],
    elixir: [56, 58, 60, 64, 66, 70, 74, 84, 90, 98],
    storage: [46, 48, 50, 56, 64, 68, 72, 82, 88, 98],
    estorage: [40, 42, 44, 50, 53, 64, 66, 69, 72, 78],
    mine: [26, 27, 28, 29, 30, 33, 34, 36, 37, 39],
    spring: [32, 33, 34, 36, 38, 41, 42, 44, 46, 49],
    airmine: [42, 43, 44, 46, 47, 50, 51, 52, 54, 56],
    ambush: [26, 27, 28, 31, 32, 35, 37, 40, 42, 46],
    beam: [64, 67, 70, 73, 76, 79, 82, 85, 88, 93],
    lab: [36, 38, 42, 46, 52, 56, 60, 70, 78, 84],
    herohall: [30, 32, 36, 40, 46, 50, 56, 66, 72, 78],
    // новые типы: база для L1-10, дальше crown() продлевает лестницу
    sweeper: [58, 60, 62, 66, 70, 74, 78, 84, 90, 96],
    bombtower: [54, 56, 58, 62, 66, 70, 74, 80, 86, 92],
    xbow: [52, 54, 58, 62, 66, 70, 76, 82, 88, 94],
    eagle: [64, 68, 72, 76, 80, 86, 92, 100, 106, 114],
    scattershot: [60, 62, 66, 70, 74, 80, 86, 92, 98, 106],
    monolith: [80, 82, 86, 90, 96, 102, 108, 116, 122, 130],
    spelltower: [64, 68, 72, 78, 82, 88, 94, 102, 110, 118],
    multiarcher: [64, 66, 72, 78, 84, 90, 96, 104, 112, 120],
    ricochet: [54, 56, 60, 64, 68, 72, 78, 84, 90, 96],
    multigear: [60, 62, 66, 72, 76, 82, 88, 94, 100, 108],
    firespitter: [56, 58, 62, 66, 70, 76, 82, 88, 94, 100],
    // поздние оборонительные башни TH18-19: 21 ступень, чтобы HP-бар
    // висел над реальной верхушкой, а не над «средним» силуэтом
    revenge: [59, 61, 62, 64, 65, 67, 68, 70, 71, 73, 74, 75, 77, 78, 80, 81, 83, 84, 86, 87, 89],
    superwizard: [80, 81, 82, 83, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101],
    spiky: [38, 39, 39, 40, 41, 41, 42, 43, 44, 44, 45, 45, 46, 47, 47, 48, 49, 49, 50, 51, 51],
    firecracker: [58, 60, 61, 63, 64, 66, 68, 69, 71, 72, 74, 76, 77, 79, 80, 82, 84, 85, 87, 88, 90],
    darkdrill: [54, 56, 58, 62, 66, 70, 74, 80, 86, 92],
    darkstorage: [46, 48, 52, 58, 64, 68, 74, 82, 90, 98],
    train: [54, 56, 60, 64, 68, 72, 78, 84, 90, 96],
    darktrain: [54, 56, 60, 64, 68, 72, 78, 84, 90, 96],
    spellfactory: [60, 62, 66, 70, 76, 82, 88, 94, 100, 108],
    darkspellfactory: [60, 62, 66, 70, 76, 82, 88, 94, 100, 108],
    pethouse: [52, 54, 58, 62, 66, 70, 76, 82, 88, 94],
    blacksmith: [54, 56, 60, 64, 68, 72, 78, 84, 90, 96],
    workshop: [54, 56, 60, 64, 68, 74, 80, 86, 92, 98],
    clancastle: [62, 66, 70, 74, 78, 84, 90, 98, 104, 112],
    squadbarracks: [52, 54, 58, 62, 66, 70, 76, 82, 88, 94],
    giantbomb: [30, 31, 32, 34, 36, 38, 40, 43, 46, 49],
    seekingair: [30, 31, 32, 34, 36, 38, 40, 42, 44, 46],
    skeletontrap: [28, 29, 30, 32, 34, 36, 38, 40, 42, 44],
    tornado: [34, 35, 36, 38, 40, 42, 44, 46, 48, 50],
    gigabomb: [34, 35, 36, 38, 40, 42, 44, 46, 48, 50]
  };

  function crown(b, lvl) {
    // 3D-модель выше/ниже старого вектора: полоска здоровья и значки
    // должны висеть над её фактической верхушкой.
    if (b && BUILDING3D_ART[b.type]) {
      const h3d = building3dCrown(b.type, lvl);
      if (h3d > 0) return h3d;
    }
    const arr = CROWN[b.type];
    const l = Math.max(1, Math.min(MAX_LVL, Math.round(lvl || 1)));
    // у новых типов арт вписан в уменьшенное пятно: индикатор и HP-бар
    // должны висеть над фактической верхушкой, а не над старой 3×3/4×4
    const k = artScale(b);
    if (!arr) return (40 + Math.max(0, l - 10) * 2.4) * k;
    const base = arr[Math.min(arr.length - 1, l - 1)];
    // L11-21: детали верхних ступеней добавляют ~2.2 px на уровень
    return (base + Math.max(0, l - arr.length) * 2.2) * k;
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
    shieldStats.drawn = 0;
    shieldStats.wave = 0;
    shieldStats.cells = 0;
    shieldStats.minRx = 0;
    shieldStats.maxRx = 0;
    shieldFrame.count = 0;
    shieldNow = 0;
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

    drawGroundTexture(ctx);
    drawGround(ctx);
    drawBg3dProps(ctx);
    drawEdgeProps(ctx, battle);
    drawBuildGrid(ctx);

    if (battle) {
      pBudget = lod === 0 ? 12 : 22;
      trackBattle(S, 1 / 60);
      updateParticles(1 / 60);
      updateCorpses(1 / 60);
      updateUnitDeaths(1 / 60);

      drawDeployZone(ctx, S);
      drawCollapses(ctx);
      drawCorpses(ctx);
      trackShieldFrame(S);
      drawEntities(ctx, S.buildings || [], S.units || [], S.traps || []);
      drawShieldWave(ctx);
      drawIndicators(ctx, S.buildings || [], true);
      drawShots(ctx, S);
      drawFx(ctx, S);
      drawParticles(ctx);
      drawEnemyStandard(ctx, S);
    } else {
      const list = CC.Base.renderList();
      clearUnitDeaths();
      updateWalkers(1 / 60);
      drawCoreApron(ctx, list);
      drawPlacement(ctx);
      drawExitDust(ctx);
      drawEntities(ctx, list, walkers.list.concat(troopExit.list));
      drawTutorialSergeant(ctx);
      drawSelection(ctx);
      drawBuildDrag(ctx);
      drawIndicators(ctx, list);
    }

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawLightPass(ctx, view);
    drawVignette(ctx, view);
    drawFinal(ctx, view);
    syncBuyHud();
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

  /* ---------- арт для карточек: терминал сборки и ангар ----------
     Публичные функции отдают data:image/png;base64 с прозрачным фоном.
     Рисуем тем же игровым артом, что и сцену: постройки — drawBuildingBody,
     войска — готовый спрайт unitSprite (направление «на зрителя», покой).
     Кэш по виду|типу|размеру|уровню. Если canvas/getImageData/toDataURL
     недоступны (node, тесты, старый браузер) — аккуратно возвращаем null. */

  const cardArtCache = new Map();
  const CARD_ART_MAX = 120;
  const CARD_ART_DEFAULT = 112;

  function cardSize(size) {
    let s = Math.floor(Number(size) || CARD_ART_DEFAULT);
    if (!isFinite(s)) s = CARD_ART_DEFAULT;
    return Math.max(32, Math.min(512, s));
  }

  function cardLevel(level) {
    let l = Math.floor(Number(level) || 1);
    if (!isFinite(l)) l = 1;
    return Math.max(1, Math.min(MAX_LVL, l));
  }

  // Границы непрозрачных пикселей: карточка обрезает пустые поля спрайта,
  // поэтому фигура всегда по центру и не «плавает» в углу.
  function cardBounds(cv) {
    try {
      const cx = cv.getContext('2d');
      if (!cx || typeof cx.getImageData !== 'function') return null;
      const w = cv.width;
      const h = cv.height;
      const data = cx.getImageData(0, 0, w, h).data;
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
          if (data[row + x * 4 + 3] > 6) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < x0 || y1 < y0) return null;
      const pad = 2;
      return {
        x: Math.max(0, x0 - pad),
        y: Math.max(0, y0 - pad),
        w: Math.min(w, x1 + pad + 1) - Math.max(0, x0 - pad),
        h: Math.min(h, y1 + pad + 1) - Math.max(0, y0 - pad)
      };
    } catch (e) {
      return null;
    }
  }

  function cardDataUrl(cv) {
    try {
      if (!cv || typeof cv.toDataURL !== 'function') return null;
      const url = cv.toDataURL('image/png');
      return (typeof url === 'string' && url.indexOf('data:image') === 0) ? url : null;
    } catch (e) {
      return null;
    }
  }

  // Вписываем содержимое src в квадрат size с полями 4% и центрируем.
  function cardFit(src, size) {
    const b = cardBounds(src);
    const sw = b ? b.w : src.width;
    const sh = b ? b.h : src.height;
    const sx = b ? b.x : 0;
    const sy = b ? b.y : 0;
    if (!(sw > 0 && sh > 0)) return null;

    const dst = makeCanvas(size, size);
    const cx = dst.getContext('2d');
    if (!cx) return null;
    const k = Math.min((size * 0.92) / sw, (size * 0.92) / sh);
    const dw = Math.max(1, sw * k);
    const dh = Math.max(1, sh * k);
    if ('imageSmoothingEnabled' in cx) cx.imageSmoothingEnabled = true;
    cx.drawImage(src, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return cardDataUrl(dst);
  }

  // 3D-кадр в квадрат карточки: 256 px → обрезка по альфе → вписывание.
  function building3dCard(img, size) {
    try {
      const tmp = makeCanvas(256, 256);
      const cx = tmp.getContext('2d');
      if (!cx) return null;
      cx.drawImage(img, 0, 0, 256, 256);
      return cardFit(tmp, size);
    } catch (e) {
      return null;
    }
  }

  function buildingArt(type, size, level) {
    try {
      if (!type || !CC.BUILDINGS || !CC.BUILDINGS[type]) return null;
      const s = cardSize(size);
      const lvl = cardLevel(level);

      // Если 3D-кадр уровня уже в памяти — карточка тоже из него. Иначе
      // отдаём вектор и параллельно запускаем загрузку на следующий вызов.
      const img3d = BUILDING3D_ART[type] ? building3dImage(type, lvl) : null;
      if (img3d) {
        const key3 = 'b3|' + type + '|' + s + '|' + lvl;
        if (cardArtCache.has(key3)) return cardArtCache.get(key3);
        const url3d = building3dCard(img3d, s);
        if (url3d) {
          if (cardArtCache.size >= CARD_ART_MAX) {
            const first3 = cardArtCache.keys().next().value;
            if (first3 !== undefined) cardArtCache.delete(first3);
          }
          cardArtCache.set(key3, url3d);
          return url3d;
        }
      }

      const key = 'b|' + type + '|' + s + '|' + lvl;
      if (cardArtCache.has(key)) return cardArtCache.get(key);

      const def = CC.BUILDINGS[type];
      const w = Math.max(1, Math.floor(Number(def.w) || 1));
      const h = Math.max(1, Math.floor(Number(def.h) || 1));
      const b = {
        id: -1, type: type, def: def, x: 0, y: 0, w: w, h: h,
        hp: 1, maxHp: 1, aim: -0.6, dead: false,
        __level: lvl, __trapVariant: ''
      };

      const top = Math.max(bodyHeight(b), crown(b, lvl)) + 16;
      const spanX = (w + h) * TW / 2;
      const spanY = (w + h) * TH / 2;
      const bw = spanX + 30;
      const bh = top + spanY + 24;
      const res = Math.max(128, Math.min(768, s * 2));
      const tmp = makeCanvas(res, res);
      const cx = tmp.getContext('2d');
      if (!cx) return null;

      const k = Math.min((res * 0.86) / bw, (res * 0.86) / bh);
      const centerX = (w - h) * TW / 4;
      const centerY = (spanY - top) / 2;
      cx.setTransform(k, 0, 0, k, res / 2 - centerX * k, res / 2 - centerY * k);
      // Стена на карточке — короткий прямой пролёт из трёх клеток с двумя
      // концевыми столбами. Одиночная клетка рисовала четыре плеча «крестом»
      // и читалась как непонятный знак, а один сегмент — как столб с рёбрами.
      if (type === 'wall') {
        [
          { x: -1, y: 0, bits: 1, deg: 1, post: 'end' },
          { x: 0, y: 0, bits: 3, deg: 2, post: 'none' },
          { x: 1, y: 0, bits: 2, deg: 1, post: 'end' }
        ].forEach(function (c) {
          drawWallCellVector(cx, {
            x: c.x, y: c.y, w: 1, h: 1, lvl: lvl,
            bits: c.bits, deg: c.deg, post: c.post
          });
        });
      } else {
        drawBuildingBody(cx, b);
      }

      const url = cardFit(tmp, s);
      if (!url) return null;
      if (cardArtCache.size >= CARD_ART_MAX) {
        const first = cardArtCache.keys().next().value;
        if (first !== undefined) cardArtCache.delete(first);
      }
      cardArtCache.set(key, url);
      return url;
    } catch (e) {
      return null;
    }
  }

  function troopArt(type, size, level) {
    try {
      const known = type && ((CC.TROOPS && CC.TROOPS[type]) ||
        (CC.PETS && CC.PETS[type]) || (CC.SIEGE && CC.SIEGE[type]) ||
        (CC.GUARDIANS && CC.GUARDIANS[type]) || GUARDIAN_ART[type]);
      if (!known) return null;
      const s = cardSize(size);
      const lvl = cardLevel(level);
      const key = 't|' + type + '|' + s + '|' + lvl;
      if (cardArtCache.has(key)) return cardArtCache.get(key);

      // кадр покоя, взгляд на зрителя (юг): лучший ракурс для карточки
      const sp = unitSprite(type, '', 4, 0, lvl);
      if (!sp || !sp.canvas) return null;
      const url = cardFit(sp.canvas, s);
      if (!url) return null;
      if (cardArtCache.size >= CARD_ART_MAX) {
        const first = cardArtCache.keys().next().value;
        if (first !== undefined) cardArtCache.delete(first);
      }
      cardArtCache.set(key, url);
      return url;
    } catch (e) {
      return null;
    }
  }

  return {
    draw: draw,
    // готовый PNG-арт для карточек интерфейса (data:image/png;base64 | null)
    buildingArt: buildingArt,
    troopArt: troopArt,
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
    // отладочный доступ к выходящим из ангара новобранцам (tools)
    __exits: function () { return troopExit.list; },
    // сброс прогулки при смене сцены (сцена-чек и тесты)
    __resetWalkers: function () {
      walkers.list.length = 0;
      walkers.sig = '';
      walkers.layoutSig = '';
      walkers.ready = false;
      walkers.timer = 0;
      troopExit.prev = null;
      troopExit.list.length = 0;
      troopExit.pending.length = 0;
      troopExit.puffs.length = 0;
      troopExit.door = 0;
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
    // статистика последней раскладки стен: клетки, плечи, столбы и типы
    // стыков. Нужна tools/scene-check.js и tools/wall-shots.js.
    __walls: function () { return wallStats; },
    // счётчики ловушек за последний кадр: сколько скрыто и сколько нарисовано.
    // Нужны сцене-чеку, чтобы проверить невидимость до срабатывания.
    __traps: function () {
      return { hidden: trapStats.hidden, drawn: trapStats.drawn };
    },
    // купола: сколько нарисовано в последнем кадре, сколько активно,
    // была ли волна активации и сколько ячеек сетки ушло в кадр (tools)
    __shield: function () {
      return {
        drawn: shieldStats.drawn,
        total: shieldFrame.count,
        wave: shieldStats.wave,
        cells: shieldStats.cells,
        minRx: shieldStats.minRx,
        maxRx: shieldStats.maxRx
      };
    },
    // счётчики псевдо-3D спрайтов войск: сколько канв запечено и сколько
    // обращений попало в готовый кэш. У героев ключ — тип|heroKind|уровень|
    // направление|кадр, у остальных — тип|уровень|направление|кадр.
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
    // загрузка 3D-биллбордов v2 barb/archer/giant: сколько PNG пришло/не
    // нашлось и у скольких типов готовы все 104 кадра. Может быть ready
    // по одному типу — остальные пока живут на векторном арте.
    __unit3d: function () {
      const types = {};
      Object.keys(unit3dV2.types).forEach(function (k) {
        const r = unit3dV2.types[k];
        types[k] = { ready: !!r.ready, loaded: r.loaded, total: r.total };
      });
      return {
        ready: unit3dV2.ready, source: 'units3d-v2',
        total: unit3dV2.total, loaded: unit3dV2.loaded,
        failed: unit3dV2.failed, readyTypes: unit3dV2.readyTypes,
        frames: unit3dV2.frames, types: types
      };
    },
    // состояние 3D-фона карты: плитка и спрайты (для инструментов)
    __bg3d: function () {
      return {
        tile: bg3d.tileState,
        images: Object.keys(bg3d.images).length,
        failed: Object.keys(bg3d.failed),
        props: BG3D_PROPS.length
      };
    },
    // состояние 3D-зданий: какие уровни в памяти/сломаны (для инструментов)
    __buildings3d: function () {
      const images = {};
      Object.keys(building3d.images).forEach(function (k) {
        const img = building3d.images[k];
        images[k] = {
          ready: !!(img && img.complete && img.naturalWidth > 0),
          top: building3d.tops[k] || 0
        };
      });
      return { images: images, failed: Object.keys(building3d.failed),
        cards: Array.from(cardArtCache.keys()) };
    },
    // сколько 3D-тел сейчас падает (для сцены-чека и отладки)
    __deaths: function () {
      let n = 0;
      for (let i = 0; i < unitDeaths.length; i++) if (unitDeaths[i].on) n++;
      return n;
    },
    // сброс кэша войск при смене сцены: canvas'ы не должны копиться между боями
    __resetUnitSprites: function () {
      unitSpriteCache.clear();
      unitBakes.count = 0;
      unitBakes.hits = 0;
    },
    // инструментам: нарисовать одного юнита и векторный арт без сцены.
    // art-check/scene-check используют это для контактных листов новых типов.
    __drawUnit: function (ctx, u) { drawUnit(ctx, u); },
    __paintUnit: function (ctx, type, dir, frame, lvl, variant) {
      paintUnitArt(ctx, type, dir, frame, lvl, null, variant);
    },
    // инструментам: слой выстрелов/эффектов без сцены боя
    __drawShots: function (ctx, S) { drawShots(ctx, S || {}); },
    __drawFx: function (ctx, S) { drawFx(ctx, S || {}); },
    __drawBuilding: function (ctx, b) { drawBuilding(ctx, b); },
    // инструментам: погасить живые частицы перед чистой сценой
    __clearParticles: function () {
      for (let i = 0; i < pLife.length; i++) pLife[i] = 0;
    },
    // счётчики спрайтов построек: сколько запечено и сколько взято из кэша.
    // Лестница уровней живёт в одном Map: ключ — тип|уровень|lod|пятно.
    __buildSprites: function () {
      return {
        bakes: spriteBakes.count,
        hits: spriteBakes.hits,
        cached: spriteCache.size,
        keys: Array.from(spriteCache.keys())
      };
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
