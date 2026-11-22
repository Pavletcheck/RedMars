/* Локальный асинхронный PvP: пул «призраков», подбор соперника и награды.
   Всё без DOM и без сети: пул строится детерминированно из seed, бой идёт
   через CC.Battle.start(), а состояние живёт в прогрессе clash-village-v1. */
window.CC = window.CC || {};

CC.Pvp = (function () {
  'use strict';

  const G = CC.GRID;
  const DEFS = CC.BUILDINGS;
  const CFG = CC.PVP || {};
  const MAX_TH = CC.MAX_TH || 10;
  const POOL_SIZE = CFG.poolSize || 20;
  const SEED_BASE = CFG.seedBase || 20261118;
  const RECENT_LIMIT = CFG.recentLimit || 6;
  const FIND_ATTEMPTS = CFG.findAttempts || 20;

  // Оборона всех эпох: генератор ставит только то, что разрешено лимитом
  // конкретного TH. Порядок — от базовых турелей к поздним модулям.
  const DEF_TYPES = [
    'cannon', 'archer', 'mortar', 'airdef', 'mage', 'sweeper', 'ambush',
    'bombtower', 'xbow', 'beam', 'eagle', 'scattershot', 'monolith',
    'spelltower', 'multiarcher', 'ricochet', 'multigear', 'firespitter'
  ];
  // Склад руды и склад энергии обязательны: на них держится добыча Арены.
  const RES_TYPES = [
    'storage', 'estorage', 'goldmine', 'elixir', 'darkdrill', 'darkstorage'
  ];
  const TRAP_TYPES = [
    'mine', 'spring', 'airmine', 'giantbomb', 'seekingair',
    'skeletontrap', 'tornado', 'gigabomb'
  ];

  const NAME_A = [
    'Красный', 'Ржавый', 'Пыльный', 'Стальной', 'Ледяной',
    'Кобальтовый', 'Медный', 'Песчаный', 'Дымный', 'Гравийный'
  ];
  const NAME_B = [
    'клин', 'патруль', 'рейнджер', 'гарнизон', 'караван',
    'форпост', 'сектор', 'отряд', 'дозор', 'купол'
  ];

  let poolCache = null;

  /* ---------- мелкие помощники ---------- */

  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  function num(v, def) {
    const n = Number(v);
    return isFinite(n) ? n : def;
  }

  function int(v, def, min, max) {
    let n = Math.floor(num(v, def));
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // mulberry32: короткий детерминированный ГПСЧ, одинаковый в node и браузере.
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function limit(type, th) {
    if (CC.limitAt) return CC.limitAt(type, th);
    const row = CC.LIMITS_BY_TH && CC.LIMITS_BY_TH[type];
    if (!row) return 0;
    const i = clamp(Math.round(th) - 1, 0, MAX_TH - 1);
    return row[i] || 0;
  }

  // Потолок уровня: таблица maxlv по TH. Для старых вызовов оставлен
  // запасной вариант «центр минус один» для отстающих башен.
  function maxLevel(type, th) {
    const t = clamp(Math.round(th) || 1, 1, MAX_TH);
    if (type === 'townhall') return t;
    if (CC.maxLevelAt) {
      const m = CC.maxLevelAt(type, t);
      if (m > 0) return m;
    }
    if (type === 'archer' || type === 'barracks') return clamp(t - 1, 1, MAX_TH);
    return t;
  }

  function defaultPvp() {
    return {
      rating: int(CFG.startRating, 1000, 0, 999999),
      wins: 0,
      losses: 0,
      poolSeed: 0,
      attacked: [],
      search: 0,
      // Память разграбления по призракам: ghostId → { buildingKey: true }.
      // Первый бой отдаёт полный пул, повтор — 75% от оставшегося.
      looted: {}
    };
  }

  // Только призраки с разумными id и только true: битый сейв не должен
  // открывать повторный полный пул и не раздувает состояние.
  function cleanLooted(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    let ghosts = 0;
    for (const gid in src) {
      if (typeof gid !== 'string' || !gid || gid.length > 40) continue;
      if (gid === '__proto__' || gid === 'constructor' || gid === 'prototype') continue;
      const row = src[gid];
      if (!row || typeof row !== 'object') continue;
      const clean = {};
      let n = 0;
      for (const key in row) {
        if (row[key] !== true) continue;
        if (typeof key !== 'string' || !key || key.length > 64) continue;
        clean[key] = true;
        n++;
        if (n >= 500) break;
      }
      out[gid] = clean;
      ghosts++;
      if (ghosts >= 100) break;
    }
    return out;
  }

  // Состояние PvP из прогресса деревни. Для тестов можно передать свой
  // объект {pvp, th}; он тоже получит недостающие поля.
  function pvpOf(state) {
    let s = state;
    if (!s || typeof s !== 'object') {
      s = (CC.Game && CC.Game.state) || null;
    }
    if (!s || typeof s !== 'object') return defaultPvp();

    if (!s.pvp || typeof s.pvp !== 'object') s.pvp = defaultPvp();
    const p = s.pvp;

    p.rating = Math.max(0, Math.floor(num(p.rating, CFG.startRating || 1000)));
    p.wins = Math.max(0, Math.floor(num(p.wins, 0)));
    p.losses = Math.max(0, Math.floor(num(p.losses, 0)));
    p.poolSeed = Math.max(0, Math.floor(num(p.poolSeed, 0))) >>> 0;
    p.search = Math.max(0, Math.floor(num(p.search, 0)));
    if (!Array.isArray(p.attacked)) p.attacked = [];
    p.looted = cleanLooted(p.looted);
    return p;
  }

  function thOf(state) {
    if (state && typeof state.th === 'number') {
      return clamp(Math.round(state.th), 1, MAX_TH);
    }
    if (CC.Game && CC.Game.townhallLevel) {
      return clamp(CC.Game.townhallLevel(), 1, MAX_TH);
    }
    return 1;
  }

  // Подтягиваем состояние из сейва: старый сейв получает дефолты, а пул —
  // фиксированный seed. Он стабилен между сессиями, пока живёт сейв.
  function ensure() {
    if (!CC.Game || !CC.Game.state) return null;
    const st = CC.Game.state;
    const before = st.pvp ? JSON.stringify(st.pvp) : '';
    const p = pvpOf(st);

    if (!p.poolSeed) p.poolSeed = SEED_BASE >>> 0;

    if (before !== JSON.stringify(p)) {
      if (CC.Game.save) CC.Game.save();
    }
    return p;
  }

  /* ---------- генерация пула ---------- */

  function ghostName(rnd, index) {
    const a = NAME_A[Math.floor(rnd() * NAME_A.length) % NAME_A.length];
    const b = NAME_B[Math.floor(rnd() * NAME_B.length) % NAME_B.length];
    // Номер отряда делает имена различимыми, даже если слова совпали.
    return a + ' ' + b + ' ' + (index + 1);
  }

  // Правдоподобная раскладка своего TH: центр в центре, кольца барьеров
  // по лимиту, внутри оборона и ресурсы. Все типы и уровни — из таблиц
  // CC.limitAt/CC.maxLevelAt, поэтому TH1–17 собираются одним кодом.
  function makeLayout(rnd, th) {
    const occ = new Uint8Array(G * G);
    const layout = [];

    function mark(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) occ[yy * G + xx] = 1;
      }
    }

    function fits(type, x, y) {
      const d = DEFS[type];
      if (!d) return false;
      const w = d.w || 1;
      const h = d.h || 1;
      if (x < 0 || y < 0 || x + w > G || y + h > G) return false;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (occ[yy * G + xx]) return false;
        }
      }
      return true;
    }

    function put(type, x, y, level) {
      if (!fits(type, x, y)) return false;
      const d = DEFS[type];
      mark(x, y, d.w || 1, d.h || 1);
      layout.push({ type: type, x: x, y: y, level: level });
      return true;
    }

    function levelFor(type) {
      const cap = maxLevel(type, th);
      if (cap <= 0) return 0;
      let lvl = cap;
      if (cap > 1 && rnd() < 0.35) lvl = cap - 1;
      return clamp(lvl, 1, cap);
    }

    // Центр в центре поля: 4×4, как в таблице.
    const hallDef = DEFS.townhall || { w: 4, h: 4 };
    const hallW = hallDef.w || 4;
    const hallH = hallDef.h || 4;
    let hx = Math.floor((G - hallW) / 2);
    let hy = Math.floor((G - hallH) / 2);
    if (!put('townhall', hx, hy, th)) put('townhall', 0, 0, th);

    // Кольца энергобарьеров. Одно кольцо на TH2–10, второе/третье —
    // на поздних TH, чтобы использовать лимит до 325 сегментов.
    const wallLimit = limit('wall', th);
    let inner = { x0: 3, y0: 3, x1: G - 4, y1: G - 4 };
    let slotArea = null;
    let walls = 0;
    const wallLevel = levelFor('wall');

    function addRing(pad) {
      if (walls >= wallLimit) return;
      let side = clamp(Math.ceil((wallLimit - walls) / 4) + 4, 7, G - pad * 2 - 2);
      if (side < 7) return;
      const x0 = pad + Math.floor((G - pad * 2 - side) / 2);
      const y0 = pad + Math.floor((G - pad * 2 - side) / 2);
      const x1 = x0 + side - 1;
      const y1 = y0 + side - 1;
      const gapW = 2;
      const gapX = x0 + 1 + Math.floor(rnd() * Math.max(1, side - gapW - 2));

      function addWall(x, y) {
        if (walls >= wallLimit) return;
        if (put('wall', x, y, wallLevel || 1)) walls++;
      }

      for (let x = x0; x <= x1; x++) {
        if (x >= gapX && x < gapX + gapW) continue;
        addWall(x, y0);
        addWall(x, y1);
      }
      for (let y = y0 + 1; y < y1; y++) {
        addWall(x0, y);
        addWall(x1, y);
      }
      inner = { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1 };
      if (!slotArea) slotArea = { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1 };
    }

    if (wallLimit > 0) {
      addRing(2);
      let pad = 5;
      while (walls + 40 < wallLimit && pad < 10) {
        addRing(pad);
        pad += 3;
      }
    }

    // Свободные клетки внутри внешнего кольца: внутренние кольца поздних TH
    // занимают часть площади, но промежутки между ними тоже застраиваем.
    const area = slotArea || inner;
    const slots = [];
    for (let y = Math.max(0, area.y0); y <= Math.min(G - 1, area.y1); y++) {
      for (let x = Math.max(0, area.x0); x <= Math.min(G - 1, area.x1); x++) {
        if (!occ[y * G + x]) slots.push({ x: x, y: y });
      }
    }
    slots.sort(function (a, b) {
      const da = Math.hypot(a.x + 0.5 - G / 2, a.y + 0.5 - G / 2);
      const db = Math.hypot(b.x + 0.5 - G / 2, b.y + 0.5 - G / 2);
      if (Math.abs(da - db) > 1) return da - db;
      return a.y - b.y || a.x - b.x;
    });

    let si = 0;
    function putInside(type) {
      const lvl = levelFor(type);
      if (!lvl) return false;
      while (si < slots.length) {
        const s = slots[si++];
        if (fits(type, s.x, s.y) && put(type, s.x, s.y, lvl)) return true;
      }
      // Курсор исчерпан: второй проход с начала для крупных построек.
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (fits(type, s.x, s.y) && put(type, s.x, s.y, lvl)) return true;
      }
      return false;
    }

    function countFor(type, max) {
      const lim = limit(type, th);
      if (!lim || maxLevel(type, th) <= 0) return 0;
      const n = Math.round(lim * (0.55 + rnd() * 0.45));
      return clamp(n, 1, Math.min(lim, max || lim));
    }

    // Сначала обязательные склады: без них карточка Арены и добыча ломаются.
    putInside('storage');
    putInside('estorage');

    // Оборона: состав не выходит за лимиты текущего TH. На поздних TH
    // крупные башни (4×4) ставятся первыми, иначе двор занят мелочью.
    const defenseCounts = {};
    let defenses = 0;
    const defOrder = DEF_TYPES.slice().sort(function (a, b) {
      const da = DEFS[a] || {};
      const db = DEFS[b] || {};
      return (db.w * db.h || 1) - (da.w * da.h || 1);
    });
    defOrder.forEach(function (type) {
      const n = countFor(type, 8);
      let placed = 0;
      for (let i = 0; i < n; i++) {
        if (putInside(type)) placed++;
      }
      if (placed) defenseCounts[type] = placed;
      else if (defenseCounts[type] === undefined) defenseCounts[type] = 0;
      defenses += placed;
    });

    // Ресурсы и ангар — внутри кольца, как в настоящей базе.
    RES_TYPES.forEach(function (type) {
      if (type === 'storage' || type === 'estorage') return;
      const n = countFor(type, 6);
      for (let i = 0; i < n; i++) putInside(type);
    });
    const barracksN = countFor('barracks', 3);
    for (let i = 0; i < barracksN; i++) putInside('barracks');

    // Ловушки — в тех же дворах, что ресурсы и оборона. Они не входят в
    // процент, но заставляют атакующего смотреть под ноги.
    TRAP_TYPES.forEach(function (type) {
      const lim = limit(type, th);
      if (!lim) return;
      const n = clamp(Math.round(lim * (0.5 + rnd() * 0.5)), 1, Math.min(lim, 3));
      for (let i = 0; i < n; i++) putInside(type);
    });

    return { layout: layout, defenses: defenses, defenseCounts: defenseCounts };
  }

  function makeGhost(seed, index) {
    const ghostSeed = (seed + index * 7919) >>> 0;
    const rnd = rng(ghostSeed);
    const th = 1 + (index % MAX_TH);
    const built = makeLayout(rnd, th);
    const rating = Math.round(700 + th * 55 + rnd() * 350);

    // Герои, питомцы и осадные машины, открытые на этом TH. Раскладка
    // обороны их не содержит (они принадлежат атакующему), но карточка
    // Арены и будущий P3-P4 показывают состав по центру.
    const heroes = (CC.heroesAt ? CC.heroesAt(th) : []).map(function (h) {
      return h.id;
    });
    const pets = Object.keys(CC.PETS || {}).filter(function (id) {
      return CC.petMaxLevel ? CC.petMaxLevel(id, th) > 0 : false;
    });
    const siege = Object.keys(CC.SIEGE || {}).filter(function (id) {
      const s = CC.SIEGE[id];
      return !!s && (s.minTh || 0) > 0 && (s.minTh || 0) <= th;
    });

    return {
      id: 'g' + ghostSeed.toString(36),
      name: ghostName(rnd, index),
      th: th,
      rating: rating,
      layout: built.layout,
      // Арена помогает, но не отменяет урок экономики: на TH1 полный пул
      // около 450 руды за первое убийство, а не 870+. Разброс ±10% держит
      // соперников разными, но не выводит лут за пределы формулы.
      loot: {
        gold: Math.round((150 + th * 300) * (0.9 + rnd() * 0.2)),
        elixir: Math.round((120 + th * 240) * (0.9 + rnd() * 0.2)),
        dark: th >= 7
          ? Math.round((60 + th * 80) * (0.9 + rnd() * 0.2))
          : 0
      },
      defenses: built.defenses,
      defenseCounts: built.defenseCounts,
      heroes: heroes,
      pets: pets,
      siege: siege,
      seed: ghostSeed
    };
  }

  // Одинаковый seed → одинаковый пул, независимо от времени и порядка вызовов.
  function generate(seed, count) {
    const base = (Math.floor(num(seed, SEED_BASE)) >>> 0) || SEED_BASE;
    const n = int(count, POOL_SIZE, 1, 60);
    const out = [];
    for (let i = 0; i < n; i++) out.push(makeGhost(base, i));
    return out;
  }

  function seedOf(state) {
    if (state && state.pvp && state.pvp.poolSeed) return state.pvp.poolSeed >>> 0;
    if (CC.Game && CC.Game.state && CC.Game.state.pvp &&
        CC.Game.state.pvp.poolSeed) {
      return CC.Game.state.pvp.poolSeed >>> 0;
    }
    return SEED_BASE >>> 0;
  }

  // Пул кешируется по seed: подбор не пересобирает 20 баз на каждый кадр.
  function pool(state) {
    const seed = seedOf(state);
    if (poolCache && poolCache.seed === seed && poolCache.list.length === POOL_SIZE) {
      return poolCache.list;
    }
    const list = generate(seed, POOL_SIZE);
    poolCache = { seed: seed, list: list };
    return list;
  }

  /* ---------- подбор ---------- */

  function score(ghost, th, rating) {
    return Math.abs(ghost.th - th) * 100 + Math.abs(ghost.rating - rating) / 10;
  }

  // 2–3 соперника рядом по центру и рейтингу. Чем больше попыток поиска,
  // тем шире окно: долгий поиск не оставляет игрока без соперника.
  // attempts можно передать явно — так проверяется расширение в тестах.
  function candidates(state, n, opts) {
    ensure();
    const s = state || (CC.Game && CC.Game.state) || {};
    const p = pvpOf(s);
    const th = thOf(s);
    const rating = p.rating;
    const want = clamp(Math.floor(num(n, 3)), 1, 5);
    const attempts = clamp(
      Math.floor(num(opts && opts.attempts, p.search || 0)),
      0, FIND_ATTEMPTS
    );

    const all = pool(s);
    const attacked = p.attacked || [];
    let free = all.filter(function (g) { return attacked.indexOf(g.id) === -1; });
    // Если перебиты все призраки — показываем пул по кругу, но без падения.
    if (free.length < want) free = all.slice();

    const spread = Math.min(MAX_TH, 1 + Math.floor(attempts / 3));
    const ratingGap = 300 + attempts * 120;

    let near = free.filter(function (g) {
      return Math.abs(g.th - th) <= spread &&
        Math.abs(g.rating - rating) <= ratingGap;
    });

    // Совсем рядом не набралось — расширяем по центру, рейтинг не трогаем.
    if (near.length < want) {
      const wider = Math.min(MAX_TH, spread + 1);
      near = free.filter(function (g) {
        return Math.abs(g.th - th) <= wider;
      });
    }
    if (!near.length) near = free.slice();

    near.sort(function (a, b) {
      return score(a, th, rating) - score(b, th, rating) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    // Сдвиг на каждой попытке показывает следующую тройку, а не те же лица.
    const offset = (attempts * want) % near.length;
    const out = [];
    for (let i = 0; i < near.length && out.length < want; i++) {
      out.push(near[(offset + i) % near.length]);
    }
    return out;
  }

  function recent() {
    const p = ensure();
    return p ? p.attacked.slice() : [];
  }

  function wasAttacked(id) {
    if (!id) return false;
    return recent().indexOf(id) !== -1;
  }

  function markAttacked(id) {
    if (!id) return [];
    const p = ensure();
    if (!p) return [];

    p.attacked = p.attacked.filter(function (v) { return v !== id; });
    p.attacked.unshift(id);
    while (p.attacked.length > RECENT_LIMIT) p.attacked.pop();

    if (CC.Game && CC.Game.save) CC.Game.save();
    return p.attacked.slice();
  }

  // Новая попытка поиска: расширяет окно подбора и сдвигает карточки.
  function reroll() {
    const p = ensure();
    if (!p) return 0;
    p.search = Math.min(FIND_ATTEMPTS, (p.search || 0) + 1);
    if (CC.Game && CC.Game.save) CC.Game.save();
    return p.search;
  }

  function resetSearch() {
    const p = ensure();
    if (!p) return 0;
    if (p.search) {
      p.search = 0;
      if (CC.Game && CC.Game.save) CC.Game.save();
    }
    return 0;
  }

  /* ---------- бой и награды ---------- */

  // Карта уже разграбленных построек конкретного призрака.
  function ghostLooted(id) {
    if (!id) return {};
    const p = pvpOf(null);
    const row = p.looted && p.looted[id];
    return row && typeof row === 'object' ? row : {};
  }

  // Первый бой — полный пул. Повтор — уже не первый, даже если запись
  // в коротком списке attacked успела вытесниться: память looted важнее.
  function firstIn(p, id) {
    if (!id) return true;
    if (p && Array.isArray(p.attacked) && p.attacked.indexOf(id) !== -1) return false;
    const row = p && p.looted && p.looted[id];
    if (row && typeof row === 'object') {
      for (const key in row) {
        if (row[key] === true) return false;
      }
    }
    return true;
  }

  function isFirstGhost(id) {
    if (!id) return true;
    return firstIn(pvpOf(null), id);
  }

  // Раскладка пула призрака по его постройкам с учётом прошлых
  // разграблений. Один источник правды для боя и для карточек Арены.
  function ghostRows(ghost) {
    const g = ghost || {};
    const rows = (g.layout || []).map(function (r) {
      return {
        type: r.type,
        x: Math.floor(num(r.x, 0)),
        y: Math.floor(num(r.y, 0)),
        level: Math.max(1, Math.floor(num(r.level, 1)))
      };
    }).filter(function (r) { return !!DEFS[r.type]; });

    const pool = {
      gold: Math.max(0, Math.floor(num(g.loot && g.loot.gold, 0))),
      elixir: Math.max(0, Math.floor(num(g.loot && g.loot.elixir, 0))),
      dark: Math.max(0, Math.floor(num(g.loot && g.loot.dark, 0)))
    };
    const plan = CC.Loot && CC.Loot.distribute ? CC.Loot.distribute(pool, rows) : {};
    const looted = ghostLooted(g.id);

    for (let i = 0; i < rows.length; i++) {
      const key = CC.lootKey
        ? CC.lootKey(rows[i].type, rows[i].x, rows[i].y)
        : rows[i].type + ':' + rows[i].x + ':' + rows[i].y;
      const part = plan[key] || { gold: 0, elixir: 0, dark: 0 };
      const empty = looted[key] === true;
      rows[i].key = key;
      rows[i].lootGold = empty ? 0 : part.gold;
      rows[i].lootElixir = empty ? 0 : part.elixir;
      rows[i].lootDark = empty ? 0 : (part.dark || 0);
      rows[i].emptyLoot = empty;
    }
    return { rows: rows, pool: pool };
  }

  // Фактическая добыча, которую игрок увидит на карточке: полный остаток
  // в первом бою и 75% остатка в повторе.
  function lootInfo(ghost) {
    const info = ghostRows(ghost);
    const id = ghost && ghost.id;
    let remainGold = 0;
    let remainElixir = 0;
    let remainDark = 0;
    let left = 0;
    let lootedCount = 0;

    for (let i = 0; i < info.rows.length; i++) {
      const r = info.rows[i];
      if (r.emptyLoot) lootedCount++;
      else left++;
      remainGold += r.lootGold;
      remainElixir += r.lootElixir;
      remainDark += r.lootDark || 0;
    }

    const first = isFirstGhost(id);
    const share = first ? 1 : 0.75;
    return {
      first: first,
      share: share,
      empty: remainGold + remainElixir + remainDark <= 0,
      left: left,
      looted: lootedCount,
      remaining: { gold: remainGold, elixir: remainElixir, dark: remainDark },
      gold: Math.floor(remainGold * share),
      elixir: Math.floor(remainElixir * share),
      dark: Math.floor(remainDark * share)
    };
  }

  function copyArmy(map) {
    const out = {};
    const order = CC.ARMY_ORDER || [];
    for (let i = 0; i < order.length; i++) {
      const t = order[i];
      out[t] = Math.max(0, Math.floor(num(map && map[t], 0)));
    }
    return out;
  }

  // Описание боя для существующего движка: та же форма, что у набегов.
  function attack(ghost, armySnapshot) {
    const g = ghost || {};
    // Даже если снаружи пришёл полный снимок старого сейва, на арену идут
    // только войска, открытые на текущем уровне командного центра.
    const army = copyArmy(armySnapshot);
    // Заклинания/питомцы/осада не входят в ARMY_ORDER, но если снимок их
    // содержит, Арена передаёт их в бой как есть.
    if (armySnapshot && typeof armySnapshot === 'object') {
      ['spells', 'pets', 'siege'].forEach(function (k) {
        if (armySnapshot[k]) army[k] = armySnapshot[k];
      });
    }
    if (CC.Game && CC.Game.townhallLevel && CC.troopUnlock) {
      const th = CC.Game.townhallLevel();
      (CC.ARMY_ORDER || []).forEach(function (type) {
        if (CC.troopUnlock(type) > th) army[type] = 0;
      });
    }

    // Герой доступен и на Арене: один юнит, не входит в места армии.
    // У призрака своего героя нет — его раскладка строится только из
    // построек, а армию на бой собирает игрок.
    if (CC.TROOPS && CC.TROOPS.hero && CC.HERO &&
        CC.Game && CC.Game.heroLevel && CC.Game.townhallLevel) {
      const th = CC.Game.townhallLevel();
      if (th >= (CC.HERO.minTh || 5) && CC.Game.heroLevel() >= 1) {
        army.hero = 1;
      }
    }

    const built = ghostRows(g);
    const rows = built.rows;
    const pool = built.pool;

    return {
      id: g.id || 'pvp',
      name: g.name || 'Арена',
      th: clamp(Math.round(num(g.th, 1)), 1, MAX_TH),
      rating: Math.max(0, Math.floor(num(g.rating, 1000))),
      buildings: rows,
      army: army,
      loot: {
        gold: Math.max(0, Math.floor(num(g.loot && g.loot.gold, 0))),
        elixir: Math.max(0, Math.floor(num(g.loot && g.loot.elixir, 0))),
        dark: Math.max(0, Math.floor(num(g.loot && g.loot.dark, 0)))
      },
      limit: CFG.battleLimit || CC.TIME_LIMIT || 180,
      kind: 'pvp'
    };
  }

  // Чистый расчёт награды. Ничего не пишет в сейв: только считает рейтинг,
  // добычу и опыт по результату боя и пулу призрака.
  function finish(result, ghost, opts) {
    const o = opts || {};
    const r = result || {};
    const g = ghost || {};
    // Без явного рейтинга берём текущий из деревни; с rating функция
    // остаётся полностью чистой и не трогает сейв.
    const p = o.rating !== undefined
      ? defaultPvp()
      : (o.state ? pvpOf(o.state) : pvpOf(null));

    const rating = Math.max(0, Math.floor(num(o.rating, p.rating)));
    const ghostRating = Math.max(0, Math.floor(num(g.rating, rating)));
    const win = !!r.win;
    const percent = clamp(Math.floor(num(r.percent, 0)), 0, 100);
    const diff = ghostRating - rating;

    // Победа 12…20: сильный соперник даёт больше. Поражение 8…12:
    // проигрыш сильному — меньшее наказание.
    let delta;
    if (win) {
      delta = clamp(Math.round(16 + diff / 100), 12, 20);
    } else {
      delta = clamp(Math.round(-10 + diff / 150), -12, -8);
    }
    const nextRating = Math.max(0, rating + delta);
    delta = nextRating - rating;

    const first = o.first !== undefined ? !!o.first : firstIn(p, g.id);
    const poolLoot = g.loot || { gold: 0, elixir: 0, dark: 0 };

    // Новый движок боя отдаёт фактически снесённые здания. Причём в повторе
    // уже разграбленные в прошлый раз склады пришли с нулём: lootTaken —
    // это ровно остаток. Первый бой отдаёт 100% остатка, повтор — 75%.
    // Старый расчёт остаётся для чистых вызовов finish() без боя.
    const taken = r.lootTaken && typeof r.lootTaken === 'object' ? r.lootTaken : null;

    let share;
    let offered;
    if (taken) {
      share = first ? 1 : 0.75;
      offered = {
        gold: Math.max(0, Math.floor(num(taken.gold, 0) * share)),
        elixir: Math.max(0, Math.floor(num(taken.elixir, 0) * share)),
        dark: Math.max(0, Math.floor(num(taken.dark, 0) * share))
      };
    } else {
      // Первое убийство призрака — весь пул. Повтор — доля по разрушениям:
      // так выгодно искать новых соперников, а не фармить одного.
      if (win && first) share = 1;
      else if (win) share = Math.min(1, percent / 100 * 0.75);
      else share = percent / 100 * 0.35;

      offered = {
        gold: Math.max(0, Math.floor(num(poolLoot.gold, 0) * share)),
        elixir: Math.max(0, Math.floor(num(poolLoot.elixir, 0) * share)),
        dark: Math.max(0, Math.floor(num(poolLoot.dark, 0) * share))
      };
    }

    // Необязательный лимит склада: интерфейс передаёт свободное место,
    // чтобы добыча сразу считалась честно, а не «потерялась» в addLoot.
    let loot = { gold: offered.gold, elixir: offered.elixir, dark: offered.dark };
    if (o.cap && typeof o.cap === 'object') {
      loot = {
        gold: Math.min(offered.gold, Math.max(0, Math.floor(num(o.cap.gold, 0)))),
        elixir: Math.min(offered.elixir, Math.max(0, Math.floor(num(o.cap.elixir, 0)))),
        dark: (o.cap.dark === undefined
          ? offered.dark
          : Math.min(offered.dark, Math.max(0, Math.floor(num(o.cap.dark, 0)))))
      };
    }

    const xp = win
      ? Math.round((CFG.xpWin || 20) + percent * (CFG.xpPerPercent || 0.3))
      : (CFG.xpLoss || 5);

    return {
      win: win,
      percent: percent,
      rating: nextRating,
      delta: delta,
      loot: loot,
      offered: offered,
      lost: {
        gold: Math.max(0, offered.gold - loot.gold),
        elixir: Math.max(0, offered.elixir - loot.elixir),
        dark: Math.max(0, offered.dark - loot.dark)
      },
      xp: xp,
      first: first
    };
  }

  // Запоминаем только реально опустевшие постройки: повторный бой с этим
  // призраком увидит именно их с нулём, даже после перезапуска игры.
  function rememberLoot(p, ghostId, buildings) {
    if (!p || !ghostId || !Array.isArray(buildings)) return 0;
    if (!p.looted || typeof p.looted !== 'object') p.looted = {};
    if (!p.looted[ghostId] || typeof p.looted[ghostId] !== 'object') {
      p.looted[ghostId] = {};
    }
    const row = p.looted[ghostId];
    let n = 0;
    for (let i = 0; i < buildings.length; i++) {
      const e = buildings[i];
      if (!e || !e.key || e.empty) continue;
      if ((e.gold || 0) + (e.elixir || 0) + (e.dark || 0) <= 0) continue;
      if (row[e.key] === true) continue;
      row[e.key] = true;
      n++;
    }
    return n;
  }

  // Начисление результата в деревню: рейтинг, счётчики, добыча, опыт.
  // Возвращает reward с фактически принятой добычей.
  function commit(result, ghost) {
    const p = ensure();
    if (!p) {
      return finish(result, ghost, { state: null });
    }

    const free = (CC.Game && CC.Game.cap)
      ? {
        gold: Math.max(0, CC.Game.cap('gold') - CC.Game.gold()),
        elixir: Math.max(0, CC.Game.cap('elixir') - CC.Game.elixir()),
        dark: Math.max(0, CC.Game.cap('dark') - CC.Game.dark())
      }
      : null;

    const first = isFirstGhost(ghost && ghost.id);
    const reward = finish(result, ghost, {
      rating: p.rating,
      first: first,
      cap: free,
      state: CC.Game.state
    });

    // Сначала фиксируем, что именно опустело в этом бою, потом отмечаем
    // призрака как атакованного. Повтор уже не получит полный пул.
    rememberLoot(p, ghost && ghost.id,
      result && result.lootedBuildings);

    p.rating = reward.rating;
    if (reward.win) p.wins++;
    else p.losses++;
    p.search = 0;

    let added = {
      gold: reward.loot.gold,
      elixir: reward.loot.elixir,
      dark: reward.loot.dark || 0
    };
    if (CC.Game && CC.Game.addLoot) {
      const got = CC.Game.addLoot(reward.loot);
      added = { gold: got.gold, elixir: got.elixir, dark: got.dark || 0 };
      reward.storageLost = {
        gold: (got.lost && got.lost.gold) || 0,
        elixir: (got.lost && got.lost.elixir) || 0,
        dark: (got.lost && got.lost.dark) || 0
      };
    }
    reward.loot = added;

    if (CC.Game) {
      if (CC.Game.addXp) CC.Game.addXp(reward.xp);
      if (CC.Game.addStat) {
        if (reward.win) CC.Game.addStat('battleWins', 1);
        CC.Game.addStat('lootGold', added.gold);
        CC.Game.addStat('lootDark', added.dark);
      }
    }

    if (ghost && ghost.id) {
      p.attacked = p.attacked.filter(function (v) { return v !== ghost.id; });
      p.attacked.unshift(ghost.id);
      while (p.attacked.length > RECENT_LIMIT) p.attacked.pop();
    }

    if (CC.Game && CC.Game.save) CC.Game.save();
    return reward;
  }

  /* ---------- сохранение ---------- */

  function state() {
    return ensure() || defaultPvp();
  }

  function reset() {
    const p = ensure();
    if (!p) return defaultPvp();
    p.rating = CFG.startRating || 1000;
    p.wins = 0;
    p.losses = 0;
    p.attacked = [];
    p.search = 0;
    p.looted = {};
    if (CC.Game && CC.Game.save) CC.Game.save();
    return p;
  }

  return {
    generate: generate,
    candidates: candidates,
    attack: attack,
    finish: finish,
    commit: commit,
    lootInfo: lootInfo,
    recent: recent,
    wasAttacked: wasAttacked,
    markAttacked: markAttacked,
    reroll: reroll,
    resetSearch: resetSearch,
    reset: reset,
    state: state,
    ensure: ensure,
    pool: pool,
    maxLevel: maxLevel,
    // для тестов и отладки
    _rng: rng
  };
})();
