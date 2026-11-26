/* Визуальные ступени уровня войск 1..10.
   Файл грузится ПОСЛЕ js/render.js. render.js вызывает
     CC.Render3DUnits.after(ctx, info)
   в локальных координатах юнита (уже с UNIT_DRAW_SCALE), info =
   { type, heroKind, level, dir, frame, hero, flying }.
   Слой рисуется только поверх 3D-кадра и не должен влиять на бой.
   Три ступени:
     1–3   — один узкий погон на каждом плече + одна метка у земли;
     4–6   — два погона, светящаяся жилка и поперечная полоска на груди;
     7–10  — три погона с мягким свечением, ромб на груди и три метки.
   Цвета берутся из палитры типа; слой не рисует новых юнитов и не
   меняет геометрию — только тонкие акценты в локальных px кадра. */
(function () {
  'use strict';

  CC.Render3DUnits = CC.Render3DUnits || {};

  // Типы, у которых есть 3D-кадры (barb/archer/giant + партии v3/v4).
  var K3D = {
    barb: 1, archer: 1, giant: 1,
    goblin: 1, gnome: 1, wizard: 1, airship: 1, healer: 1,
    dragon: 1, pekka: 1, miner: 1, thrower: 1,
    valkyrie: 1, headhunter: 1, bowler: 1, witch: 1
  };

  // frame — сторона кадра в мировых px (как в UNIT3D_V2);
  // sx — половина линии плеч в локальных px; sy — высота плеч от якоря.
  var BASE = {
    barb:    { f: 36, sx: 5.4, sy: 0.470 },
    archer:  { f: 32, sx: 4.8, sy: 0.470 },
    giant:   { f: 48, sx: 8.0, sy: 0.470 },
    goblin:  { f: 26, sx: 3.6, sy: 0.470 },
    gnome:   { f: 30, sx: 4.4, sy: 0.470 },
    wizard:  { f: 36, sx: 4.8, sy: 0.465 },
    airship: { f: 44, sx: 8.0, sy: 0.380 },
    healer:  { f: 36, sx: 4.6, sy: 0.470 },
    // v4: плечи дракона ниже относительно рогов, у пекки — массивные наплечники.
    dragon:  { f: 50, sx: 6.6, sy: 0.410 },
    pekka:   { f: 51, sx: 8.0, sy: 0.450 },
    miner:   { f: 36, sx: 4.2, sy: 0.470 },
    thrower: { f: 37, sx: 5.2, sy: 0.465 },
    // v5: у валькирии и дуэлянта узкие плечи, у дроболита — латные наплечники.
    valkyrie:  { f: 32, sx: 4.2, sy: 0.436 },
    headhunter: { f: 35, sx: 4.2, sy: 0.436 },
    bowler:    { f: 37, sx: 6.6, sy: 0.454 },
    witch:     { f: 35, sx: 4.2, sy: 0.410 }
  };

  // Палитра типа: [кант, свечение]. Совпадает с материалами моделей.
  var PAL = {
    barb:    ['#2f7f89', '#8ff5ff'],
    archer:  ['#687a4e', '#8dff4a'],
    giant:   ['#b6551f', '#9fe9ff'],
    goblin:  ['#2b5c43', '#7dff8a'],
    gnome:   ['#3f8a86', '#ffb14d'],
    wizard:  ['#2f7f89', '#4fe8e0'],
    airship: ['#ff8a3a', '#ffd08a'],
    healer:  ['#ffa53a', '#7fe9ff'],
    // v4: портреты dragon/pekka/miner/thrower.
    dragon:  ['#b07a42', '#8dffa8'],   // бронза / изумруд
    pekka:   ['#8b9399', '#3af0d0'],   // сталь / бирюза
    miner:   ['#3f8a80', '#ffc94a'],   // бирюза / янтарь
    thrower: ['#3a8078', '#e0b06a'],   // бирюза / бронза
    // v5: портреты valkyrie/headhunter/bowler/witch.
    valkyrie:   ['#2f7f89', '#ff7a56'],   // бирюза / рыжий
    headhunter: ['#b98a4a', '#ff4a3a'],   // золото / красный визор
    bowler:     ['#d4ac64', '#3ae0c8'],   // латунь / бирюза
    witch:      ['#2f8f86', '#e0c080'],   // бирюза / золото
    hero:    ['#ffcf4a', '#fff0a0']
  };

  function tierOf(level) {
    var l = Math.round(level || 1);
    if (l < 1) l = 1;
    if (l > 10) l = 10;
    return l <= 3 ? 1 : (l <= 6 ? 2 : 3);
  }

  function metrics(info) {
    if (info.hero === true || info.type === 'hero') {
      var b = BASE[info.heroKind] || BASE.barb;
      // герой нарисован ростом ~60 мировых px: масштабируем акценты базы
      var s = 60 / (b.f * 0.70);
      return { F: b.f * s, sx: b.sx * s, sy: b.sy };
    }
    var t = BASE[info.type];
    if (!t) return null;
    return { F: t.f, sx: t.sx, sy: t.sy };
  }

  function palOf(info) {
    var key = info.type === 'hero' ? 'hero' : info.type;
    return PAL[key] || PAL.hero;
  }

  function drawShoulder(ctx, x, y, bw, bh, n, edge, glow, tier, baseA) {
    var gap = bh * 1.72;
    var y0 = y - (n - 1) * gap * 0.5;
    for (var i = 0; i < n; i++) {
      var by = y0 + i * gap;
      if (tier === 3) {
        ctx.globalAlpha = baseA * 0.20;
        ctx.fillStyle = glow;
        ctx.fillRect(x - bw * 0.5 - 0.7, by - bh * 0.5 - 0.55,
          bw + 1.4, bh + 1.1);
      }
      ctx.globalAlpha = baseA * (tier === 1 ? 0.72 : (tier === 2 ? 0.88 : 0.96));
      ctx.fillStyle = tier >= 3 ? glow : edge;
      ctx.fillRect(x - bw * 0.5, by - bh * 0.5, bw, bh);
      if (tier === 2) {
        ctx.globalAlpha = baseA * 0.9;
        ctx.fillStyle = glow;
        ctx.fillRect(x - bw * 0.5, by - bh * 0.18, bw, bh * 0.36);
      }
    }
  }

  CC.Render3DUnits.after = function (ctx, info) {
    if (!ctx || !info) return;
    var isHero = info.hero === true || info.type === 'hero';
    if (!isHero && !K3D[info.type]) return;
    var m = metrics(info);
    if (!m) return;
    if (typeof ctx.fillRect !== 'function' || typeof ctx.save !== 'function') return;

    var tier = tierOf(info.level);
    var pal = palOf(info);
    var edge = pal[0], glow = pal[1];
    var F = m.F;
    var baseA = (ctx.globalAlpha == null ? 1 : ctx.globalAlpha);

    var bw = Math.max(2.0, F * 0.100);
    var bh = Math.max(0.85, F * 0.030);
    var shY = -m.sy * F;
    var shX = m.sx;

    ctx.save();

    // ---- погоны на плечах (1 / 2 / 3 полоски) ----
    drawShoulder(ctx, -shX, shY, bw, bh, tier, edge, glow, tier, baseA);
    drawShoulder(ctx, shX, shY, bw, bh, tier, edge, glow, tier, baseA);

    // ---- грудь: полоска (4–6) или ромб (7–10) ----
    if (tier >= 2) {
      var cy = -F * 0.335;
      var cw = F * 0.155;
      var chh = Math.max(0.5, F * 0.012);
      ctx.globalAlpha = baseA * (tier === 2 ? 0.42 : 0.60);
      ctx.fillStyle = tier === 3 ? glow : edge;
      ctx.fillRect(-cw * 0.5, cy - chh * 0.5, cw, chh);
    }
    if (tier === 3) {
      var dr = Math.max(1.0, F * 0.022);
      var dy = -F * 0.305;
      ctx.globalAlpha = baseA * 0.85;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(0, dy - dr);
      ctx.lineTo(dr, dy);
      ctx.lineTo(0, dy + dr);
      ctx.lineTo(-dr, dy);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = baseA * 0.55;
      ctx.fillStyle = edge;
      ctx.fillRect(-dr * 0.32, dy - dr * 0.32, dr * 0.64, dr * 0.64);
    }

    // ---- метки у земли: 1 / 2 / 3 насечки на дуге ----
    // у летающих дуга опускается на землю (lift = 22 мировых px).
    var gy = info.flying ? 22 : F * 0.02;
    var rx = F * 0.215;
    var ry = F * 0.052;
    var lw = Math.max(0.65, F * 0.022);
    var a0 = Math.PI * (tier === 1 ? 0.30 : (tier === 2 ? 0.16 : 0.10));
    var a1 = Math.PI - a0;

    ctx.globalAlpha = baseA * (tier === 1 ? 0.22 : (tier === 2 ? 0.32 : 0.45));
    ctx.strokeStyle = glow;
    ctx.lineWidth = lw;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, gy, rx, ry, 0, a0, a1);
    } else {
      ctx.arc(0, gy, rx, a0, a1);
    }
    ctx.stroke();

    ctx.globalAlpha = baseA * (tier === 1 ? 0.5 : (tier === 2 ? 0.68 : 0.85));
    ctx.fillStyle = glow;
    var tickH = Math.max(0.8, F * 0.026);
    var tickW = Math.max(0.7, F * 0.018);
    for (var i = 0; i < tier; i++) {
      var a = Math.PI * 0.5;
      if (tier === 2) a = Math.PI * (i === 0 ? 0.33 : 0.67);
      else if (tier === 3) a = Math.PI * (0.28 + i * 0.22);
      var tx = Math.cos(a) * rx;
      var ty = gy + Math.sin(a) * ry;
      ctx.fillRect(tx - tickW * 0.5, ty - tickH * 0.55, tickW, tickH);
    }

    ctx.restore();
  };
})();
