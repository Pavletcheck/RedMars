/* 3D-энергобарьер (продолжение перевода 2.5D → 3D).
   Файл грузится ПОСЛЕ js/render.js. Регистрирует обработчик:
     CC.Render.setWall3d(function (ctx, run, opts) { ... return topPx; });
   Контракт:
     - ctx — уже в мировых координатах, как drawWallRun;
     - run — { cells, x, y, w, h, bits, deg, lvl }; cells — клетки стены;
     - opts.bar — нужно ли рисовать HP-бар (его рисует render.js по topPx);
     - вернуть высоту верхушки сегмента в px (>0) — render.js нарисует HP-бар;
     - вернуть 0/false — сработает прежний 2.5D drawWallSection.
   Ассеты — assets/wall3d/**. Уровни 1..20, стыки: прямая, угол, T, крест,
   столб/торец. Пока ассетов нет — обработчик не рисует и стена 2.5D.

   Как считается стык
   -------------------
   Биты соседей те же, что у render.js: +x=1, -x=2, +y=4, -y=8. Для клетки
   из wallCells() берём run.bits напрямую; для прогона без bits собираем
   маску по фактическим клеткам run.cells (внутри прогона). Маска 0..15
   однозначно задаёт файл: 16 вариантов на уровень (5 базовых имён +
   ориентации). Спрайт уже нарисован в нужной ориентации, поворачивать
   канву не нужно: изометрия не является поворотом картинки.

   Пока не загрузились ВСЕ картинки, нужные прогону, обработчик возвращает 0
   и render.js рисует прежний 2.5D — без «полу-3D» кадра. Каждый уровень
   прогревается целиком (16 файлов) при первом обращении.
*/
(function () {
  if (!window.CC || !CC.Render || !CC.Render.setWall3d) return;

  var MAX_LVL = 20;
  var ORTHO = 2.55;                 // как у 3D-зданий
  var ROOT2 = Math.SQRT2;
  var ANCHOR_X = 0.5;               // центр клетки в кадре
  var ANCHOR_Y = 0.664;             // якорь земли (общий с buildings3d)
  var CACHE_MAX = 96;               // ~25 МБ декодированных PNG
  var WARM_LEVELS = 6;              // столько уровней греем целиком
  var ROOT = 'assets/wall3d/';

  /* маска соседей → файл. 5 базовых имён по контракту, остальные —
     ориентации того же стыка (см. tools/blender_wall3d.py). */
  var STATE = [
    'isolated',        // 0
    'post',            // 1  +x, торец на -x
    'post_nx',         // 2
    'straight',        // 3  +x,-x
    'post_py',         // 4
    'corner',          // 5  +x,+y
    'corner_xn_yp',    // 6  -x,+y
    'tee',             // 7  +x,-x,+y
    'post_ny',         // 8
    'corner_xp_yn',    // 9  +x,-y
    'corner_xn_yn',    // 10 -x,-y
    'tee_no_py',       // 11 +x,-x,-y
    'straight_y',      // 12 +y,-y
    'tee_no_nx',       // 13 +x,+y,-y
    'tee_no_px',       // 14 -x,+y,-y
    'cross'            // 15
  ];

  /* Запасная высота верхушки, если canvas «испорчен» (file://) и альфа
     недоступна. Значения сняты с рендеров (manifest.json, topPx). */
  var TOP_FALLBACK = [
    27.4, 28.1, 28.9, 30.0, 30.8, 31.9, 32.7, 33.8, 34.6, 36.1,
    36.9, 37.7, 38.4, 39.9, 40.3, 41.1, 41.8, 42.6, 44.9, 45.6
  ];

  var images = new Map();           // lvl*16+mask → { img, ready, top, used }
  var order = [];                   // FIFO для вытеснения
  var failed = Object.create(null);
  var warmed = Object.create(null);
  var warmCount = 0;
  var tick = 0;
  var spritePx = 0;
  var measureCtx = null;
  var measureBroken = false;

  /* Буферы для прогона из нескольких клеток: без аллокаций на кадр. */
  var GRID = 64;
  var marks = new Uint8Array(GRID * GRID);
  var markGen = 0;
  var qx = new Int16Array(GRID * GRID);
  var qy = new Int16Array(GRID * GRID);
  var qm = new Uint8Array(GRID * GRID);
  var qorder = new Int16Array(GRID * GRID);

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function clampLvl(v) {
    var n = Math.floor(Number(v) || 1);
    if (!isFinite(n)) n = 1;
    return n < 1 ? 1 : (n > MAX_LVL ? MAX_LVL : n);
  }

  function nowTick() {
    try {
      var p = window.performance;
      if (p && typeof p.now === 'function') return (p.now() / 16) | 0;
    } catch (e) { /* ignore */ }
    return (Date.now() / 16) | 0;
  }

  function spriteSize() {
    if (!(spritePx > 0)) {
      var tw = (window.CC && CC.TW) || 54;
      spritePx = tw * ORTHO / ROOT2;
    }
    return spritePx;
  }

  function fallbackTop(lvl) {
    var v = TOP_FALLBACK[lvl - 1];
    return v > 0 ? v : 14 + lvl * 1.1;
  }

  function fail(key, rec) {
    failed[key] = true;
    if (rec) rec.ready = false;
    if (images.get(key) === rec) images.delete(key);
  }

  // Верх альфа-канала → высота над землёй в мировых px. Один раз на файл;
  // при file:// canvas tainted — тогда работает TOP_FALLBACK.
  function measureTop(img, lvl) {
    if (measureBroken) return fallbackTop(lvl);
    try {
      if (!measureCtx) {
        if (typeof document === 'undefined' || !document.createElement) {
          measureBroken = true;
          return fallbackTop(lvl);
        }
        var c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        measureCtx = c.getContext('2d');
      }
      if (!measureCtx || typeof measureCtx.getImageData !== 'function') {
        measureBroken = true;
        return fallbackTop(lvl);
      }
      measureCtx.clearRect(0, 0, 256, 256);
      measureCtx.drawImage(img, 0, 0, 256, 256);
      var d = measureCtx.getImageData(0, 0, 256, 256).data;
      for (var y = 0; y < 256; y++) {
        var row = y * 1024;
        for (var x = 0; x < 256; x++) {
          if (d[row + x * 4 + 3] > 10) {
            return (ANCHOR_Y - y / 256) * spriteSize();
          }
        }
      }
    } catch (e) { /* нет доступа к пикселям — не страшно */ }
    measureBroken = true;
    try { measureCtx = null; } catch (e2) { /* ignore */ }
    return fallbackTop(lvl);
  }

  function evict() {
    while (images.size > CACHE_MAX && order.length) {
      var k = order.shift();
      var rec = images.get(k);
      if (!rec) continue;
      if (tick - rec.used <= 1) {   // используется в текущем кадре
        order.push(k);
        break;
      }
      images.delete(k);
    }
  }

  function request(lvl, mask) {
    var key = lvl * 16 + mask;
    var rec = images.get(key);
    if (rec) {
      rec.used = tick;
      return rec;
    }
    if (failed[key]) return null;
    if (typeof Image !== 'function') return null;
    var img;
    try {
      img = new Image();
    } catch (e) {
      failed[key] = true;
      return null;
    }
    rec = { img: img, ready: false, top: 0, used: tick };
    images.set(key, rec);
    order.push(key);

    img.onload = function () {
      if (!img.naturalWidth || !img.naturalHeight) {
        fail(key, rec);
        return;
      }
      rec.ready = true;
      rec.top = measureTop(img, lvl);
      rec.used = nowTick();
    };
    img.onerror = function () {
      fail(key, rec);
    };
    try {
      img.src = ROOT + 'L' + pad2(lvl) + '/' + STATE[mask] + '.png';
    } catch (e) {
      fail(key, rec);
      return null;
    }
    evict();
    return rec;
  }

  // Первый запрос уровня тянет все 16 масок: так прогон переключается
  // на 3D целиком, а не по одной клетке. Ограничено WARM_LEVELS, чтобы
  // база с десятком разных уровней не тянула 160 файлов.
  function warm(lvl) {
    if (warmed[lvl]) return;
    warmed[lvl] = true;
    if (warmCount >= WARM_LEVELS) return;
    warmCount++;
    for (var m = 0; m < 16; m++) request(lvl, m);
  }

  function drawSprite(ctx, gx, gy, rec) {
    var S = spriteSize();
    // CC.Iso.project без создания объекта: (x-y)*TW/2, (x+y)*TH/2
    var cx = (gx - gy) * ((window.CC && CC.TW) || 54) * 0.5;
    var cy = (gx + gy) * ((window.CC && CC.TH) || 40) * 0.5;
    try {
      ctx.drawImage(rec.img, cx - S * ANCHOR_X, cy - S * ANCHOR_Y, S, S);
    } catch (e) {
      return false;
    }
    return true;
  }

  function cellIndex(x, y) {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return -1;
    return x * GRID + y;
  }

  function bitsAt(x, y) {
    var bits = 0;
    var i;
    i = cellIndex(x + 1, y); if (i >= 0 && marks[i] === markGen) bits |= 1;
    i = cellIndex(x - 1, y); if (i >= 0 && marks[i] === markGen) bits |= 2;
    i = cellIndex(x, y + 1); if (i >= 0 && marks[i] === markGen) bits |= 4;
    i = cellIndex(x, y - 1); if (i >= 0 && marks[i] === markGen) bits |= 8;
    return bits;
  }

  // Общий путь: одна клетка с готовыми bits/deg/post от wallCells().
  function drawCell(ctx, run, lvl) {
    var mask = (run.bits | 0) & 15;
    var rec = request(lvl, mask);
    if (!rec || !rec.ready) return 0;
    if (!drawSprite(ctx, run.x, run.y, rec)) return 0;
    return rec.top > 0 ? rec.top : fallbackTop(lvl);
  }

  // Прогон из нескольких клеток (drawWallRun из drawBuilding или внешний
  // вызов): строим карту соседей внутри прогона и рисуем все клетки.
  function drawRun(ctx, run, lvl) {
    var cells = run.cells;
    var n = cells.length;
    if (n > GRID * GRID) n = GRID * GRID;

    markGen = (markGen + 1) & 255;
    if (!markGen) {                     // переполнение счётчика — чистим
      marks.fill(0);
      markGen = 1;
    }
    var i;
    for (i = 0; i < n; i++) {
      var c = cells[i];
      var x = c.x | 0;
      var y = c.y | 0;
      qx[i] = x;
      qy[i] = y;
      var ix = cellIndex(x, y);
      if (ix >= 0) marks[ix] = markGen;
    }
    // маски и порядок глубины (x+y), сортировка вставками по буферу
    for (i = 0; i < n; i++) {
      var cx = qx[i];
      var cyy = qy[i];
      qm[i] = (typeof cells[i].bits === 'number')
        ? (cells[i].bits & 15) : bitsAt(cx, cyy);
      qorder[i] = i;
    }
    for (i = 1; i < n; i++) {
      var v = qorder[i];
      var d = qx[v] + qy[v];
      var j = i - 1;
      while (j >= 0 && (qx[qorder[j]] + qy[qorder[j]]) > d) {
        qorder[j + 1] = qorder[j];
        j--;
      }
      qorder[j + 1] = v;
    }

    // первый проход: все файлы должны быть готовы, иначе 2.5D целиком
    var top = 0;
    for (i = 0; i < n; i++) {
      var rec = request(lvl, qm[i]);
      if (!rec || !rec.ready) return 0;
      if (rec.top > top) top = rec.top;
    }
    for (i = 0; i < n; i++) {
      var k = qorder[i];
      var r2 = request(lvl, qm[k]);
      if (!r2 || !r2.ready) return 0;
      if (!drawSprite(ctx, qx[k], qy[k], r2)) return 0;
    }
    return top > 0 ? top : fallbackTop(lvl);
  }

  function draw(ctx, run, opts) {
    if (!ctx || !run) return 0;
    var cells = run.cells;
    if (!cells || !cells.length) return 0;
    tick = nowTick();

    var lvl = clampLvl(run.lvl || cells[0].__level || cells[0].lvl || 1);
    warm(lvl);

    if (cells.length === 1 && typeof run.bits === 'number') {
      return drawCell(ctx, run, lvl);
    }
    return drawRun(ctx, run, lvl);
  }

  CC.Render.setWall3d(draw);

  // Отладка для координатора и tools: готовность/кэш/ошибки.
  CC.Render.__wall3d = function () {
    var ready = 0;
    var levels = Object.create(null);
    images.forEach(function (rec, key) {
      if (!rec.ready) return;
      ready++;
      levels[(key / 16) | 0] = true;
    });
    return {
      images: images.size,
      ready: ready,
      levels: Object.keys(levels).map(Number).sort(function (a, b) { return a - b; }),
      failed: Object.keys(failed),
      cacheMax: CACHE_MAX,
      spritePx: spriteSize(),
      anchor: { x: ANCHOR_X, y: ANCHOR_Y }
    };
  };
  CC.Render.__wall3dReset = function () {
    images.clear();
    order.length = 0;
    failed = Object.create(null);
    warmed = Object.create(null);
    warmCount = 0;
  };

  // Готовность для render.js: под 3D-забором не нужен широкий 2.5D-газон.
  // __wall3dHasCell — конкретная клетка (маска стыка + уровень) уже в 3D;
  // __wall3dHas — у уровня есть хотя бы один готовый сегмент;
  // __wall3dReady — хотя бы один уровень загружен целиком (16 стыков).
  CC.Render.__wall3dHasCell = function (bits, lvl) {
    var rec = images.get(clampLvl(lvl) * 16 + ((bits | 0) & 15));
    return !!(rec && rec.ready);
  };

  CC.Render.__wall3dHas = function (lvl) {
    var base = clampLvl(lvl) * 16;
    for (var m = 0; m < 16; m++) {
      var rec = images.get(base + m);
      if (rec && rec.ready) return true;
    }
    return false;
  };

  CC.Render.__wall3dReady = function () {
    var count = Object.create(null);
    images.forEach(function (rec, key) {
      if (!rec.ready) return;
      var lvl = (key / 16) | 0;
      count[lvl] = (count[lvl] || 0) + 1;
    });
    for (var k in count) if (count[k] >= 16) return true;
    return false;
  };

  // Высота 3D-верхушки для HP-бара прогона. 0 — ни один сегмент ещё не
  // загружен, render.js остаётся на 2.5D-высоте.
  CC.Render.__wall3dTop = function (run) {
    if (!run) return 0;
    var lvl = clampLvl(run.lvl || 1);
    var cells = run.cells && run.cells.length ? run.cells : [run];
    var top = 0;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i] || {};
      var mask = typeof c.bits === 'number' ? ((c.bits | 0) & 15) : bitsAt(c.x, c.y);
      var rec = images.get(lvl * 16 + mask);
      if (rec && rec.ready && rec.top > top) top = rec.top;
    }
    return top;
  };

  /* Интеграция (зона координатора, js/render.js):
     сейчас wall3dDraw вызывается только из drawWallRun, а боевой путь
     drawEntities рисует клетки через drawWallSection. Чтобы 3D-стена
     появилась в игре, drawWallSection должен в начале спросить обработчик:

       if (wall3dDraw) {
         const top = wall3dDraw(ctx, r, { bar: false });
         if (top > 0) return;
       }

     Тогда HP-полоски остаются прежними (по пролётам), а возвращённый topPx
     можно использовать, если полоску переведут на фактическую верхушку.
     Пока этого вызова нет, стена остаётся 2.5D — ассеты и обработчик готовы. */
})();
