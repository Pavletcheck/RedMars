/* База игрока: расстановка построек, проверка пересечений, сохранение. */
window.CC = window.CC || {};
CC.App = CC.App || { mode: 'base' };

/* Характеристики постройки с учётом уровня. Единая математика для деревни,
   боя кампании и набегов. Модель «каждый уровень удваивает»:
     HP       = база × 2^(уровень − 1)
     урон     = база × 2^(уровень − 1)
     дальность = база + 0.04 × (уровень − 1)   (не удваивается)
     скорость стрельбы = база × (1 + rate × (уровень − 1)) — малый прирост.
   Базы HP в config.js уже округлены до сотен, поэтому HP остаётся круглым. */
CC.BuildingStats = {
  at: function (type, level) {
    const d = CC.BUILDINGS[type] || {};
    const u = CC.UPGRADES[type] || {};
    const max = (CC.ECONOMY && CC.ECONOMY.maxLevel) || 5;

    let lvl = Math.floor(Number(level) || 1);
    if (lvl < 1) lvl = 1;
    if (lvl > max) lvl = max;

    const k = lvl - 1;
    const mult = Math.pow(2, k);
    const out = {
      level: lvl,
      hp: Math.round((d.hp || 0) * mult)
    };

    if (d.dmg) out.dmg = Math.round(d.dmg * mult);
    if (d.range) out.range = +(d.range + (u.range || 0) * k).toFixed(2);
    if (d.minRange) out.minRange = d.minRange;
    if (d.rate) out.rate = +(d.rate * (1 + (u.rate || 0) * k)).toFixed(3);
    if (d.splash) out.splash = d.splash;
    if (d.resource) out.resource = true;

    // Специальные поля обороны и ловушек: бой и панель читают их из
    // статистики, а не из сырого CC.BUILDINGS, чтобы уровень учитывался.
    if (d.trap) {
      out.trap = true;
      out.trapKind = d.trapKind;
      out.radius = d.radius;
      out.capacity = d.capacity;
      out.maxUnitSpace = d.maxUnitSpace;
    }
    if (d.hidden) {
      out.hidden = true;
      out.revealRange = d.revealRange;
    }
    if (d.beam) {
      out.beam = true;
      out.ramp = d.ramp;
      out.rampMax = d.rampMax;
    }
    if (d.onlyGround) out.onlyGround = true;
    if (d.targetsAir) out.targetsAir = true;

    return out;
  }
};

CC.Base = (function () {
  'use strict';

  const G = CC.GRID;
  const DEFS = CC.BUILDINGS;
  const KEY = 'clash-base-v1';

  let items = [];
  let nextId = 1;
  let occ = new Int16Array(G * G).fill(-1);
  let preview = null; // {id,x,y} — только для рендера, данные базы не меняет
  // true — раскладка собрана из CC.LAYOUT (новый старт/сброс), false —
  // прочитана из сейва. По этому флагу Game отличает новичка от старого сейва.
  let fromSave = false;

  /* ---------- размеры и сетка ---------- */

  function size(type) {
    const d = DEFS[type];
    return { w: (d && d.w) || 1, h: (d && d.h) || 1 };
  }

  // Время апгрейда/постановки до уровня. Единая точка для игры и UI.
  function upgradeTime(type, toLevel) {
    if (!DEFS[type]) return 0;
    return CC.buildTime ? CC.buildTime(type, toLevel) : 0;
  }

  function rebuild() {
    occ.fill(-1);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const s = size(it.type);
      for (let y = it.y; y < it.y + s.h; y++) {
        for (let x = it.x; x < it.x + s.w; x++) {
          if (x >= 0 && y >= 0 && x < G && y < G) occ[y * G + x] = i;
        }
      }
    }
  }

  // ignoreId — постройка, которую двигаем (её клетки не считаем занятыми)
  function fits(type, x, y, ignoreId) {
    if (!DEFS[type]) return false;
    const s = size(type);
    if (x < 0 || y < 0 || x + s.w > G || y + s.h > G) return false;

    for (let yy = y; yy < y + s.h; yy++) {
      for (let xx = x; xx < x + s.w; xx++) {
        const oi = occ[yy * G + xx];
        if (oi >= 0 && items[oi].id !== ignoreId) return false;
      }
    }
    return true;
  }

  function itemAt(x, y) {
    if (x < 0 || y < 0 || x >= G || y >= G) return null;
    const oi = occ[y * G + x];
    return oi >= 0 ? items[oi] : null;
  }

  function count(type) {
    let n = 0;
    for (let i = 0; i < items.length; i++) if (items[i].type === type) n++;
    return n;
  }

  // Лимит считается по текущему уровню центра. Старый сейв мог сохранить
  // построек больше нового лимита: тогда left() отдаёт 0, но сносить ничего
  // не нужно — постройки игрока остаются на месте.
  function currentLimit(type) {
    const th = (CC.Game && CC.Game.townhallLevel) ? CC.Game.townhallLevel() : 1;
    if (CC.limitAt) return CC.limitAt(type, th);
    return CC.LIMITS[type] || 0;
  }

  function left(type) {
    const n = currentLimit(type) - count(type);
    return n > 0 ? n : 0;
  }

  /* ---------- изменения ---------- */

  // M:SS для ошибки «все строители заняты».
  function clockText(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function place(type, x, y) {
    if (CC.Game && CC.Game.canBuild) {
      const open = CC.Game.canBuild(type);
      if (!open.ok) return { error: open.reason, needTh: open.needTh };
    }

    if (left(type) <= 0) return { error: 'Больше не поместится' };
    if (!fits(type, x, y)) return { error: 'Здесь занято' };

    const now = Date.now();
    // Обучение Сержанта: текущий шаг ставит только своё здание бесплатно
    // и за 5 секунд. Любое другое здание — по обычной цене и времени.
    const lesson = CC.Game && CC.Game.tutorialPlace
      ? CC.Game.tutorialPlace(type) : null;
    const cost = lesson
      ? { gold: 0, elixir: 0 }
      : (CC.placeCost ? CC.placeCost(type) : { gold: 0, elixir: 0 });
    const time = lesson
      ? lesson.seconds
      : (CC.placeTime ? CC.placeTime(type) : 0);
    const st = CC.Game && CC.Game.state ? CC.Game.state : null;

    // Постановка платная: проверяем ресурсы до всех изменений.
    if (st) {
      if (st.gold < cost.gold) {
        const need = Math.ceil(cost.gold - st.gold);
        return { error: 'Не хватает ' + need + ' руды', missing: { gold: need }, cost: cost };
      }
      if (st.elixir < cost.elixir) {
        const need = Math.ceil(cost.elixir - st.elixir);
        return { error: 'Не хватает ' + need + ' энергии', missing: { elixir: need }, cost: cost };
      }
    }

    // Долгая стройка занимает строителя. Проверяем до списания: при отказе
    // ресурсы остаются на складе, а постройка не появляется.
    if (time > 0 && CC.Game && CC.Game.builders) {
      const b = CC.Game.builders(now);
      if (b.free <= 0) {
        const wait = b.next;
        return {
          error: 'Все строители заняты' +
            (wait !== null && wait !== undefined ? ' · свободен через ' + clockText(wait) : ''),
          reason: 'Все строители заняты',
          wait: wait,
          builders: b
        };
      }
    }

    const it = { id: nextId++, type: type, x: x, y: y };
    items.push(it);

    // Списываем сразу; снос ресурсы не возвращает (как в CoC).
    if (st) {
      st.gold -= cost.gold;
      st.elixir -= cost.elixir;
    }

    // Таймер стройки живёт в прогрессе деревни (clash-village-v1).
    let build = null;
    if (time > 0 && CC.Game && CC.Game.startBuild) {
      build = CC.Game.startBuild(it.id, time, now);
    }

    rebuild();
    if (CC.Game) {
      CC.Game.invalidateCaps();
      if (CC.Game.addXp) CC.Game.addXp(5);
      if (CC.Game.addStat) {
        CC.Game.addStat('placed', 1);
        if (type === 'wall') CC.Game.addStat('wallsPlaced', 1);
      }
      // Шаг обучения закрывается сразу после постановки, чтобы следующее
      // такое же здание уже считалось обычной ценой.
      if (CC.Game.checkQuests) CC.Game.checkQuests();
    }
    save();
    return {
      ok: true,
      id: it.id,
      spent: { gold: cost.gold, elixir: cost.elixir },
      lesson: !!lesson,
      build: build
    };
  }

  function remove(id) {
    const i = items.findIndex(function (it) { return it.id === id; });
    if (i < 0) return { error: 'Постройка не найдена' };

    items.splice(i, 1);
    if (preview && preview.id === id) preview = null;
    rebuild();
    if (CC.Game) CC.Game.forget(id);
    save();
    return { ok: true };
  }

  // Поставить готовую постройку без цены и таймера. Нужно миграции старых
  // сейвов (например, когда общий склад стал только рудным): ресурсы игрока
  // при этом не списываются. Обычная постановка по-прежнему идёт через place().
  function insert(type, x, y) {
    if (!DEFS[type] || !fits(type, x, y)) return null;
    const it = { id: nextId++, type: type, x: x, y: y };
    items.push(it);
    rebuild();
    if (CC.Game) CC.Game.invalidateCaps();
    save();
    return it;
  }

  function move(id, x, y) {
    const it = items.find(function (o) { return o.id === id; });
    if (!it) return { error: 'Постройка не найдена' };
    if (!fits(it.type, x, y, id)) return { error: 'Здесь занято' };

    it.x = x;
    it.y = y;
    rebuild();
    if (CC.Game) CC.Game.invalidateCaps();
    save();
    return { ok: true };
  }

  /* ---------- сохранение ---------- */

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, nextId: nextId, items: items }));
    } catch (e) {
      /* приватный режим — играем без сохранения */
    }
  }

  function defaultBase() {
    items = CC.LAYOUT.map(function (r, i) {
      return { id: i + 1, type: r[0], x: r[1], y: r[2] };
    });
    nextId = items.length + 1;
    preview = null;
    fromSave = false;
    rebuild();
  }

  function load() {
    let data = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      data = null;
    }

    if (!data || !Array.isArray(data.items)) {
      defaultBase();
      return;
    }

    // проверяем каждый элемент: тип существует, влезает в поле, не пересекается
    const seen = new Int8Array(G * G);
    const kept = [];
    let maxId = 0;

    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      if (!it || !DEFS[it.type]) continue;
      const s = size(it.type);
      const x = it.x | 0;
      const y = it.y | 0;
      if (x < 0 || y < 0 || x + s.w > G || y + s.h > G) continue;

      let clash = false;
      for (let yy = y; yy < y + s.h && !clash; yy++) {
        for (let xx = x; xx < x + s.w; xx++) {
          if (seen[yy * G + xx]) { clash = true; break; }
        }
      }
      if (clash) continue;

      for (let yy = y; yy < y + s.h; yy++) {
        for (let xx = x; xx < x + s.w; xx++) seen[yy * G + xx] = 1;
      }

      const id = (it.id | 0) || (kept.length + 1);
      if (id > maxId) maxId = id;
      kept.push({ id: id, type: it.type, x: x, y: y });
    }

    if (!kept.length) {
      defaultBase();
      return;
    }

    items = kept;
    preview = null;
    fromSave = true;
    nextId = Math.max(maxId + 1, data.nextId | 0, kept.length + 1);
    rebuild();
  }

  function reset() {
    defaultBase();
    if (CC.Game) CC.Game.reset();
    save();
  }

  /* ---------- для рендера ---------- */

  // Постройки в том же виде, что и в бою, — рендер не различает базу и поле боя.
  function renderList() {
    return items.map(function (it) {
      const d = DEFS[it.type];
      const p = preview && preview.id === it.id ? preview : it;
      const bi = buildInfo(it.id);
      return {
        id: it.id,
        type: it.type,
        def: d,
        x: p.x,
        y: p.y,
        w: d.w || 1,
        h: d.h || 1,
        hp: 1,
        maxHp: 1,
        aim: -0.6,
        dead: false,
        // Стройплощадка: художник по этим полям рисует леса и прогресс.
        building: !!bi,
        build: bi ? { leftMs: bi.leftMs, progress: bi.progress } : null
      };
    });
  }

  // Идёт ли стройка постройки (данные для рендера и панели).
  function isBuilding(id) {
    return !!(CC.Game && CC.Game.isBuilding && CC.Game.isBuilding(id));
  }

  function buildInfo(id) {
    return CC.Game && CC.Game.buildInfo ? CC.Game.buildInfo(id) : null;
  }

  // Позиция-призрак для рендера во время переноса. На данные базы не влияет.
  function setPreview(id, x, y) {
    if (id === null || id === undefined) {
      preview = null;
      return;
    }
    preview = { id: id, x: x, y: y };
  }

  function clearPreview() {
    preview = null;
  }

  function previewOf(id) {
    return preview && preview.id === id ? { x: preview.x, y: preview.y } : null;
  }

  return {
    load: load,
    save: save,
    reset: reset,
    list: function () { return items; },
    renderList: renderList,
    size: size,
    upgradeTime: upgradeTime,
    fits: fits,
    itemAt: itemAt,
    count: count,
    left: left,
    fromSave: function () { return fromSave; },
    isDefaultStart: function () {
      return !fromSave && items.length === 1 && items[0].type === 'townhall';
    },
    place: place,
    insert: insert,
    remove: remove,
    move: move,
    isBuilding: isBuilding,
    buildInfo: buildInfo,
    setPreview: setPreview,
    clearPreview: clearPreview,
    previewOf: previewOf
  };
})();

/* Прогресс деревни: ресурсы, апгрейды по реальному времени, армия и тренировка.
   Живёт отдельно от раскладки (clash-base-v1), поэтому старый сейв читается как есть. */
CC.Game = (function () {
  'use strict';

  const KEY = 'clash-village-v1';
  const DEFS = CC.BUILDINGS;
  const TROOPS = CC.TROOPS;
  const ECON = CC.ECONOMY;
  const UP = CC.UPGRADES;
  const LEVELS = CC.LEVELS || [];
  const BUILD = CC.BUILDERS || {
    start: 1, max: 4,
    teams: [{ th: 3, cost: 50 }, { th: 6, cost: 70 }, { th: 9, cost: 100 }]
  };
  const MAX_TH = CC.MAX_TH || 10;

  /* Цепочка обучения Сержанта. Каждый шаг — квест с наградой 1 платина
     (GEMS.perQuest). Первые семь шагов ставят по одному зданию и получают
     бесплатную постановку за 5 секунд, дальше — тренировка, бой, сектор и
     два улучшения. Порядок менять нельзя: checkQuests ведёт строго сверху вниз.
     Поле place — тип здания для бесплатной постановки, goal — проверка шага. */
  const QUESTS = [
    {
      id: 'placeCannon', text: 'Поставь турель',
      hint: 'Первый рубеж. Бьёт по земле.', place: 'cannon',
      lore: 'Турель — первый рубеж обороны. Пока она стоит, штурмовики ' +
        'не пройдут к центру безнаказанно.'
    },
    {
      id: 'placeArcher', text: 'Поставь лазерную башню',
      hint: 'Дальше и сильнее турели.', place: 'archer',
      lore: 'Лазерная вышка видит дальше турели и достаёт воздух. Орбита ' +
        'сбрасывает не только модули — скоро прилетят и гости.'
    },
    {
      id: 'placeGoldmine', text: 'Поставь бур',
      hint: 'Копит руду в свой буфер; собирай тапом.', place: 'goldmine',
      lore: 'Без руды не будет ни стен, ни пушек. Бур качает её сам, ' +
        'тебе останется собрать добычу.'
    },
    {
      id: 'placeElixir', text: 'Поставь реактор',
      hint: 'Даёт энергию.', place: 'elixir',
      lore: 'Энергия — кровь базы: тренировка, постройки, исследования. ' +
        'Реактор держит её поток.'
    },
    {
      id: 'placeStorage', text: 'Поставь склад руды',
      hint: 'Без него руда не хранится.', place: 'storage',
      lore: 'Добыча без склада утекает в песок. Поставь хранилище — и руда ' +
        'останется на чёрный день.'
    },
    {
      id: 'placeEstorage', text: 'Поставь склад энергии',
      hint: 'Без него энергия не хранится.', place: 'estorage',
      lore: 'Энергия тоже должна где-то жить. Склад не даст ей сгореть ' +
        'в пылевых бурях.'
    },
    {
      id: 'placeBarracks', text: 'Поставь ангар',
      hint: 'Тренирует войска и даёт места в армии.', place: 'barracks',
      lore: 'Ангар — это твоя армия. Без него некому держать рубеж; ' +
        'с него начнётся тренировка гарнизона.'
    },
    {
      id: 'train5', text: 'Натренируй 5 штурмовиков',
      hint: 'Открой ангар, выбери штурмовика и жми «Нанять» или «×5». ' +
        'Очередь тренировки идёт сама; на L1 ангара — 20 мест, энергия ' +
        'списывается за каждого бойца.', goal: 'train', target: 5,
      lore: 'Пять штурмовиков — минимальный гарнизон. Они пойдут первыми, ' +
        'когда сектор понадобится вернуть.'
    },
    {
      id: 'battle', text: 'В бой',
      hint: 'Выбери войско внизу и тапни по любой свободной клетке рядом ' +
        'с базой. Цель — 50% построек, снос центра или 100% разрушения. ' +
        'За победу дают звёзды и добычу.', goal: 'battle', target: 1,
      lore: 'Пора проверить рубеж в деле. Разбей лагерь противника — ' +
        'и сектор твой.'
    },
    {
      id: 'level1', text: 'Пройди первый сектор',
      hint: 'Выбери войско внизу и тапни по свободной клетке рядом с базой. ' +
        'Цель — 50% построек, снос центра или 100% разрушения. ' +
        'Доведи бой до победы: за неё дают звёзды и добычу.',
      goal: 'level1', target: 1,
      lore: 'Победа в первом секторе откроет путь дальше. Бей по земляным ' +
        'целям и не распыляй армию.'
    },
    {
      id: 'th2', text: 'Улучши командный центр до 2 уровня',
      hint: 'Тапни по командному центру и нажми «Улучшить до ур. 2».',
      goal: 'th2', target: 2,
      lore: 'Центр второго уровня расширит базу: новые модули, склады ' +
        'и защита.'
    },
    {
      id: 'cannon2', text: 'Улучши турель до 2 уровня',
      hint: 'Тапни по турели и нажми «Улучшить до ур. 2».',
      goal: 'cannon2', target: 2,
      lore: 'Улучшенная турель бьёт сильнее и держит дольше. Это вложение ' +
        'в каждый следующий бой.'
    }
  ];
  // Поля, с которых начинается миграция старых сейвов: старые id цепочки
  // превращаются в выполненные шаги новой, прогресс не сбрасывается.
  const QUEST_MIGRATION = {
    shop: 'placeCannon',
    place2: 'placeCannon',
    fill: 'train5',
    train: 'train5',
    level1: 'level1',
    th2: 'th2',
    cannon2: 'cannon2'
  };
  const ACHS = CC.ACHIEVEMENTS || [];
  const GEMS = CC.GEMS || {
    start: 50, perQuest: 1, perLevel: 1,
    speed: { secondsPerGem: 300, min: 1 },
    exchange: { gold: 150, elixir: 120 }
  };
  const RAIDS = CC.RAIDS || {
    interval: 3 * 60 * 60 * 1000,
    limit: 120,
    theft: { low: 0.1, mid: 0.2, hall: 0.3 },
    armies: {}
  };
  // Передышка после набега: 2 ч / 6 ч / 8 ч. Константы живут в config.js,
  // здесь только резерв на случай старого конфига без поля truce.
  const TRUCE = RAIDS.truce || {
    major: 0.20,
    minorMs: 2 * 60 * 60 * 1000,
    majorMs: 6 * 60 * 60 * 1000,
    thMs: 8 * 60 * 60 * 1000
  };
  const DAILY = CC.DAILY || {
    stars: 5,
    resetMs: 24 * 60 * 60 * 1000,
    maxStack: 2,
    reward: { gold: 200, elixir: 200, gems: 1 },
    perTh: { gold: 50, elixir: 50 },
    replayMax: 1
  };
  // Прокачка войск: цены, рост и бонус за уровень. Константы в config.js,
  // здесь — резерв на случай старого конфига без поля.
  const TROOP_LVL = CC.TROOP_LEVEL || {
    max: 10, costFactor: 12,
    timeFactor: 6, timeGrowth: 1.5,
    hpPerLevel: 2, dmgPerLevel: 2
  };
  // Герой: открытие с TH5, HP/урон ×2 за уровень и отдельный слот прокачки.
  const HERO = CC.HERO || {
    id: 'hero', minTh: 5, maxLevel: 10,
    costBase: 1600, costGrowth: 2,
    hpBase: 1000, dmgBase: 80, hpPerLevel: 2, dmgPerLevel: 2,
    speed: 2, range: 1.2,
    ability: { name: 'Щит', duration: 3, radius: 2.5, uses: 1 },
    costs: {}, times: {}
  };

  let st = fresh();
  let move = null; // активный перенос: меняем только превью, не Base
  let questRewardEvent = null;
  let tutorialEvent = null;
  let levelUpEvent = 0;
  let pendingOffline = null;
  let noEstorageEvent = false;
  let upgradeDoneEvent = 0;
  let buildDoneEvent = [];
  let dailyDoneEvent = 0;
  let troopDoneEvent = null;
  let heroDoneEvent = null;

  function copyArmy(src) {
    const out = {};
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      out[t] = Math.max(0, Math.floor(Number(src && src[t]) || 0));
    }
    return out;
  }

  // Состояние ежедневного контракта. Старый сейв получает дефолты:
  // прогресс 0, банк 0, отсчёт суток начинается с момента загрузки.
  function freshDaily(now) {
    const t = typeof now === 'number' ? now : Date.now();
    return {
      progress: 0,
      bank: 0,
      dayStart: t,
      claimed: 0,
      starsTotal: 0
    };
  }

  // Уровни войск: новый сейв и старый без поля — все по 1.
  function freshTroopLevels() {
    const out = {};
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      out[CC.ARMY_ORDER[i]] = 1;
    }
    return out;
  }

  // Состояние обучения Сержанта. Новый сейв начинается с активным обучением,
  // старый — с done=true (см. load()). cargo — первый груз 800/800 уже выдан,
  // loreSeen — вступительный лор уже показан (на старых сейвах сразу true).
  function freshTutorial() {
    return { done: false, skipped: false, cargo: false, loreSeen: false };
  }

  function fresh() {
    return {
      gold: ECON.startGold,
      elixir: ECON.startElixir,
      gems: GEMS.start,
      xp: 0,
      stats: {
        wallsDestroyed: 0, battleWins: 0, upgrades: 0,
        goldEarned: 0, levelsCleared: 0, defended: 0,
        placed: 0, maxed: 0, gemsSpent: 0, trained: 0,
        elixirEarned: 0, lootGold: 0, wallsPlaced: 0
      },
      achClaimed: {},
      army: copyArmy(CC.START_ARMY),
      extract: {},
      queue: [],
      trained: 0,
      shopOpened: false,
      questsDone: [],
      // Обучение Сержанта: пока не пройдено и не пропущено, первые шаги
      // ставятся бесплатно за 5 секунд. battleStarted — шаг «В бой» уже
      // засчитан, чтобы возврат в деревню не откатывал прогресс.
      tutorial: freshTutorial(),
      battleStarted: false,
      levels: {},
      upgrades: {},
      // Идущие стройки: id → { startedAt, endAt, time }. Старый сейв без поля
      // читается как «всё давно построено».
      builds: {},
      // Уровни войск и текущее исследование. Один слот на деревню,
      // строителей не занимает; старый сейв получает все уровни по 1.
      troopLevels: freshTroopLevels(),
      troopUp: null,
      // Герой: 0 — ещё не открыт (TH ниже 5), 1..10 — уровень.
      // heroUp — отдельный слот прокачки, не связанный с troopUp.
      heroLevel: 0,
      heroUp: null,
      builders: BUILD.start,
      level: 0,
      // Выбранный для ближайшего боя уровень. Прогресс живёт в level и
      // двигается только completeLevel — реплей старого уровня его не трогает.
      selected: 0,
      cleared: [],
      stars: {},
      // Уже разграбленные постройки уровней: st.looted[levelIndex][buildingKey].
      // Первое прохождение полное, повтор оставляет в этих зданиях ноль.
      looted: {},
      // История последних набегов на базу (не больше 5): время, нападавший,
      // процент, звёзды, украденное, лог высадки и состав армии.
      raids: [],
      lastRaid: Date.now(),
      pendingRaid: null,
      // Перемирие после набега: мс-отметка, до которой новых набегов нет.
      raidTruceUntil: 0,
      daily: freshDaily(Date.now()),
      lastSeen: Date.now(),
      // Миграция общего склада: после первого переноса в estorage больше
      // не добавляем склад автоматически (иначе снос возвращал бы его даром).
      estorageMigrated: false,
      // Локальный PvP: рейтинг, счётчики и стабильный seed пула.
      // Старый сейв без этого поля получает значения по умолчанию.
      pvp: {
        rating: (CC.PVP && CC.PVP.startRating) || 1000,
        wins: 0,
        losses: 0,
        poolSeed: 0,
        attacked: [],
        search: 0,
        // Разграбленные постройки призраков: pvp.looted[ghostId][key] = true.
        looted: {}
      }
    };
  }

  /* ---------- постройки и уровни ---------- */

  function item(id) {
    const list = CC.Base.list();
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function level(id) {
    const l = st.levels[id] | 0;
    if (l < 1) return 1;
    return l > ECON.maxLevel ? ECON.maxLevel : l;
  }

  function count(type) {
    return CC.Base.count(type);
  }

  // Постройки, которые уже готовы и работают. Стройплощадки не дают
  // ни производства, ни вместимости, ни очереди.
  function countActive(type) {
    const list = CC.Base.list();
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== type) continue;
      if (isBuilding(list[i].id)) continue;
      n++;
    }
    return n;
  }

  /* ---------- командный центр и лимиты уровней ---------- */

  function townhallLevel() {
    const list = CC.Base.list();
    let th = 0;

    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== 'townhall') continue;
      if (isBuilding(list[i].id)) continue;
      const l = level(list[i].id);
      if (l > th) th = l;
    }

    return th || 1;
  }

  // townhall — до MAX_TH, башня отстаёт на 1. Ангар теперь даёт места в
  // армии, поэтому качается вместе с центром: на TH2 доступен L2 (40 мест),
  // на TH10 — L10 (200 мест), как и прежняя кривая «20 за уровень центра».
  // thLevel можно передать явно (для тестов/индикаторов).
  function maxLevel(type, thLevel) {
    let th = typeof thLevel === 'number' ? Math.round(thLevel) : townhallLevel();
    th = th < 1 ? 1 : (th > MAX_TH ? MAX_TH : th);

    if (type === 'townhall') return MAX_TH;
    if (type === 'archer') {
      const v = th - 1;
      return v < 1 ? 1 : (v > MAX_TH ? MAX_TH : v);
    }
    return th;
  }

  // Какой уровень командного центра нужен, чтобы поднять постройку до targetLevel.
  function needThFor(type, targetLevel) {
    if (type === 'townhall') return 1;
    if (type === 'archer') return targetLevel + 1;
    return targetLevel;
  }

  function minTownhall(type) {
    const r = CC.REQUIREMENTS && CC.REQUIREMENTS[type];
    return (r && r.minTh) || 1;
  }

  // Можно ли поставить постройку (условие открытия, не лимит количества).
  function canBuild(type) {
    if (!DEFS[type]) {
      return { ok: false, error: 'Неизвестная постройка', reason: 'Неизвестная постройка', needTh: null };
    }

    const need = minTownhall(type);
    if (townhallLevel() < need) {
      const reason = 'Откроется с командного центра ' + need + ' уровня';
      return { ok: false, error: reason, reason: reason, needTh: need };
    }

    return { ok: true, error: null, reason: null, needTh: null };
  }

  // Время постановки (уровень 1). От TH не зависит — только от уровня.
  function placeTimeOf(type) {
    return CC.placeTime ? CC.placeTime(type) : 0;
  }

  /* ---------- производство и хранилища ---------- */

  // Скорость добычи ресурса: все буры/реакторы со своим уровнем.
  // Каждый уровень удваивает производство: 0.75 → 1.5 → 3 …
  // Стройплощадка ещё не даёт производства.
  function rate(res) {
    const list = CC.Base.list();
    let sum = 0;

    for (let i = 0; i < list.length; i++) {
      if (isBuilding(list[i].id)) continue;
      const p = CC.PRODUCTION[list[i].type];
      if (!p || p.res !== res) continue;
      sum += p.rate * Math.pow(2, level(list[i].id) - 1);
    }
    return sum;
  }

  /* ---------- накопители буров и реакторов ---------- */

  // Ёмкость накопителя конкретной постройки (зависит от её уровня).
  function extractCapOf(it) {
    if (!it) return 0;
    return CC.extractCap ? CC.extractCap(it.type, level(it.id)) : 0;
  }

  // Сколько уже накоплено в постройке. Буфер живёт в прогрессе: st.extract[id].
  function stored(id) {
    const n = st.extract ? Number(st.extract[id]) : 0;
    return isFinite(n) && n > 0 ? n : 0;
  }

  // Суммарно в накопителях — для окна оффлайна и подсказок.
  function bufferTotals() {
    const list = CC.Base.list();
    let gold = 0;
    let elixir = 0;
    let capGold = 0;
    let capElixir = 0;

    for (let i = 0; i < list.length; i++) {
      const p = CC.PRODUCTION[list[i].type];
      if (!p) continue;
      const n = stored(list[i].id);
      const c = extractCapOf(list[i]);
      if (p.res === 'gold') {
        gold += n;
        capGold += c;
      } else {
        elixir += n;
        capElixir += c;
      }
    }

    return {
      gold: gold, elixir: elixir,
      capGold: capGold, capElixir: capElixir
    };
  }

  // Описание накопителя для панели и иконки сбора.
  function extractInfo(id) {
    const it = item(id);
    if (!it) return null;
    const p = CC.PRODUCTION[it.type];
    if (!p) return null;

    const amount = stored(id);
    const cap = extractCapOf(it);
    return {
      id: it.id,
      type: it.type,
      res: p.res,
      amount: amount,
      cap: cap,
      free: Math.max(0, cap - amount),
      full: cap > 0 && amount >= cap - 1e-6,
      x: it.x,
      y: it.y,
      w: CC.Base.size(it.type).w,
      h: CC.Base.size(it.type).h
    };
  }

  // Все непустые накопители: интерфейс рисует над ними иконки сбора.
  function extractors() {
    const list = CC.Base.list();
    const out = [];

    for (let i = 0; i < list.length; i++) {
      const info = extractInfo(list[i].id);
      // Меньше единицы показывать нечего: на иконке было бы «0».
      if (info && info.amount >= 1) out.push(info);
    }

    return out;
  }

  // Забрать накопленное из бура/реактора. Частичный сбор разрешён:
  // в бур попадает ровно столько, сколько влезает на склад, остаток
  // остаётся лежать. Полный склад — отказ, буфер не трогаем.
  function collect(id) {
    const it = item(id);
    if (!it) return { error: 'Постройка не найдена' };

    const p = CC.PRODUCTION[it.type];
    if (!p) return { error: 'Здесь нечего собирать' };

    const amount = stored(id);
    if (amount <= 0) {
      return { ok: true, res: p.res, gold: 0, elixir: 0, got: 0, left: 0, empty: true };
    }

    const res = p.res;
    const held = res === 'gold' ? st.gold : st.elixir;
    const free = Math.max(0, cap(res) - held);

    if (free <= 0) {
      return {
        error: 'Склад полон — некуда девать',
        res: res,
        amount: amount,
        left: amount,
        free: 0
      };
    }

    const take = Math.min(amount, free);
    const got = res === 'gold' ? credit(take, 0) : credit(0, take);

    // Из-за дробной арифметики credit может принять чуть меньше —
    // остаток возвращаем в накопитель, чтобы ничего не пропало.
    const gotAmount = res === 'gold' ? got.gold : got.elixir;
    const left = Math.max(0, amount - gotAmount);

    if (left > 1e-6) st.extract[id] = left;
    else if (st.extract) delete st.extract[id];

    save();
    return {
      ok: true,
      res: res,
      gold: got.gold,
      elixir: got.elixir,
      got: gotAmount,
      left: left > 1e-6 ? left : 0,
      full: extractCapOf(it) > 0 && stored(id) >= extractCapOf(it) - 1e-6
    };
  }

  // Забрать всё разом: идём по непустым бурам/реакторам и зовём collect().
  // Лимит склада соблюдает collect: что не влезло — остаётся в буфере.
  function collectAll() {
    const list = extractors();
    const out = {
      ok: false,
      gold: 0,
      elixir: 0,
      got: 0,
      left: 0,
      count: 0,
      full: 0,
      total: list.length
    };

    if (!list.length) {
      out.error = 'Собирать нечего';
      return out;
    }

    for (let i = 0; i < list.length; i++) {
      const info = list[i];
      const res = collect(info.id);
      if (res.error) {
        out.left += info.amount;
        out.full++;
        continue;
      }
      out.gold += res.gold || 0;
      out.elixir += res.elixir || 0;
      out.left += res.left || 0;
      out.count++;
    }

    out.got = out.gold + out.elixir;
    out.ok = out.count > 0;
    if (!out.ok) out.error = 'Склад полон — некуда девать';
    return out;
  }

  /* ---------- лимиты хранилищ ---------- */

  // Кеш лимитов, чтобы isFull на каждую постройку не пересчитывал всё заново.
  let capCache = null;

  function invalidateCaps() {
    capCache = null;
  }

  // Ёмкость одного склада по его типу и уровню. Ровно та же формула, что
  // в caps(): база 1600 × 2^(уровень − 1). Ранец набега списывает ресурсы
  // по фактическим складам.
  function storageCapOf(type, lvl) {
    const l = Math.max(1, Math.floor(num(lvl, 1)));
    let base = 0;
    if (type === 'storage') base = (ECON.storageCap || {}).gold || 0;
    else if (type === 'estorage') base = (ECON.storageCap || {}).elixir || 0;
    else return 0;
    return base * Math.pow(2, l - 1);
  }

  // Все готовые склады: суммарная ёмкость и количество по ресурсам.
  // Стройплощадки не считаем — они ещё не хранят.
  function storageTotals() {
    const list = CC.Base.list();
    const out = {
      gold: { cap: 0, count: 0 },
      elixir: { cap: 0, count: 0 }
    };

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (isBuilding(it.id)) continue;
      if (it.type !== 'storage' && it.type !== 'estorage') continue;
      const res = it.type === 'storage' ? 'gold' : 'elixir';
      out[res].cap += storageCapOf(it.type, level(it.id));
      out[res].count++;
    }

    return out;
  }

  function caps() {
    if (capCache) return capCache;

    const totals = storageTotals();

    capCache = {
      gold: Math.round(totals.gold.cap),
      elixir: Math.round(totals.elixir.cap)
    };
    return capCache;
  }

  function cap(res) {
    return caps()[res] || 0;
  }

  // Плашка «Full!»: бур/реактор полны, когда полон их собственный накопитель;
  // склад — когда заполнен ресурс именно этого склада.
  function isFull(id) {
    const it = item(id);
    if (!it) return false;

    const eps = 1e-6;

    if (it.type === 'storage') {
      const c = cap('gold');
      return c > 0 && st.gold >= c - eps;
    }

    if (it.type === 'estorage') {
      const c = cap('elixir');
      return c > 0 && st.elixir >= c - eps;
    }

    const p = CC.PRODUCTION[it.type];
    if (!p) return false;

    const capBuf = extractCapOf(it);
    return capBuf > 0 && stored(id) >= capBuf - eps;
  }

  // Единая точка начисления: и производство, и добыча, и награды.
  // Возвращает, сколько реально влезло и сколько потеряно из-за лимита.
  function credit(gold, elixir) {
    const g = Math.max(0, Number(gold) || 0);
    const e = Math.max(0, Number(elixir) || 0);

    const gc = cap('gold');
    const ec = cap('elixir');
    const addG = st.gold >= gc ? 0 : Math.min(g, gc - st.gold);
    const addE = st.elixir >= ec ? 0 : Math.min(e, ec - st.elixir);

    st.gold += addG;
    st.elixir += addE;
    addStat('goldEarned', addG);
    addStat('elixirEarned', addE);

    return {
      gold: addG,
      elixir: addE,
      offered: { gold: g, elixir: e },
      lost: {
        gold: Math.max(0, g - addG),
        elixir: Math.max(0, e - addE)
      }
    };
  }

  // Производство копится в накопителях построек, а не уходит прямо на склад.
  // Возвращаем, сколько реально накопилось и сколько не влезло из-за ёмкости.
  function accrue(dt) {
    const zero = {
      gold: 0, elixir: 0, lostGold: 0, lostElixir: 0, capped: false
    };
    if (!(dt > 0)) return zero;

    const list = CC.Base.list();
    let gold = 0;
    let elixir = 0;
    let lostGold = 0;
    let lostElixir = 0;
    let capped = false;

    if (!st.extract) st.extract = {};

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (isBuilding(it.id)) continue;
      const p = CC.PRODUCTION[it.type];
      if (!p) continue;

      const perSec = p.rate * Math.pow(2, level(it.id) - 1);
      const capBuf = extractCapOf(it);
      const before = stored(it.id);
      const want = perSec * dt;

      const after = Math.min(capBuf, before + want);
      const add = Math.max(0, after - before);

      if (add > 1e-9) {
        st.extract[it.id] = after;
        if (p.res === 'gold') gold += add;
        else elixir += add;
      }

      // Сколько не влезло: пригодится окну оффлайна, чтобы не обещать лишнего.
      const overflow = Math.max(0, before + want - capBuf);
      if (overflow > 1e-9) {
        capped = true;
        if (p.res === 'gold') lostGold += overflow;
        else lostElixir += overflow;
      }
    }

    // Не сохраняем на каждом кадре: автосейв в main.js раз в 5 секунд.
    return {
      gold: gold,
      elixir: elixir,
      lostGold: lostGold,
      lostElixir: lostElixir,
      capped: capped
    };
  }

  /* ---------- платина ---------- */

  function gemsNow() {
    return Math.floor(st.gems);
  }

  // Внешнее начисление платины (позже сюда придёт покупка/реклама).
  function addGems(n) {
    const add = Math.max(0, Math.floor(Number(n) || 0));
    st.gems += add;
    save();
    return { ok: true, added: add, gems: gemsNow() };
  }

  // 1 платина за каждые N секунд остатка, но не меньше min и не больше
  // потолка max. Потолок спасает долгие стройки от цены в сотни платин.
  function gemCostFor(seconds) {
    const per = GEMS.speed.secondsPerGem || 300;
    const min = GEMS.speed.min || 1;
    const max = GEMS.speed.max || 80;
    const left = Math.max(0, Number(seconds) || 0);
    return Math.min(max, Math.max(min, Math.ceil(left / per)));
  }

  function noGems(cost) {
    const missing = Math.ceil(cost - st.gems);
    return {
      // Формулировка заказчика: «Не хватает N платины».
      error: 'Не хватает ' + missing + ' платины',
      missing: missing,
      gems: gemsNow()
    };
  }

  function upgradeSpeedCost(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    const info = upgradeInfo(id, now);
    if (!info) return null;
    return { gems: gemCostFor(info.left), left: info.left };
  }

  // Мгновенно завершить апгрейд, строитель освобождается.
  function speedUpUpgrade(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleUpgrades(now);

    const u = st.upgrades[id];
    if (!u) return { error: 'Улучшение не идёт' };

    const left = Math.max(0, (u.endAt - now) / 1000);
    const cost = gemCostFor(left);
    if (st.gems < cost) return noGems(cost);

    st.gems -= cost;
    addStat('gemsSpent', cost);
    u.endAt = now;
    settleUpgrades(now);
    save();
    return { ok: true, spent: cost, gems: gemsNow(), level: level(id) };
  }

  // Ускорение завершает самый ранний юнит среди всех параллельных ангаров.
  function firstQueueIndex(now) {
    let best = -1;
    for (let i = 0; i < st.queue.length; i++) {
      if (best < 0 || st.queue[i].endAt < st.queue[best].endAt) best = i;
    }
    return best;
  }

  function queueSpeedCost(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleQueue(now);
    if (!st.queue.length) return null;

    const i = firstQueueIndex(now);
    const left = Math.max(0, (st.queue[i].endAt - now) / 1000);
    return { gems: gemCostFor(left), left: left, type: st.queue[i].type };
  }

  // Мгновенно доучить ближайшего к готовности юнита в очереди.
  function speedUpQueue(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleQueue(now);
    if (!st.queue.length) return { error: 'Очередь пуста' };

    const i = firstQueueIndex(now);
    const left = Math.max(0, (st.queue[i].endAt - now) / 1000);
    const cost = gemCostFor(left);
    if (st.gems < cost) return noGems(cost);

    st.gems -= cost;
    addStat('gemsSpent', cost);
    st.queue[i].endAt = now;
    settleQueue(now);
    save();
    return { ok: true, spent: cost, gems: gemsNow() };
  }

  // Обмен платины на руду/энергию через общий credit() с лимитами хранилищ.
  // Курс зависит от уровня центра: CC.gemExchange(res, TH).
  function exchangeGems(res, count) {
    const rate = CC.gemExchange
      ? CC.gemExchange(res, townhallLevel())
      : GEMS.exchange[res];
    if (!rate) return { error: 'Неизвестный ресурс' };

    const n = Math.floor(Number(count) || 0);
    if (n < 1) return { error: 'Неверное количество' };
    if (st.gems < n) return noGems(n);

    const offered = n * rate;

    // Сначала проверяем свободное место, иначе credit() молча обрежет
    // начисление, а платина уже будет списана. Обмен неполным не бывает.
    const capNow = res === 'gold' ? cap('gold') : cap('elixir');
    const held = res === 'gold' ? st.gold : st.elixir;
    const free = Math.max(0, Math.floor(capNow - held));
    if (offered > free) {
      return {
        error: 'Хранилища полны: влезет ' + free,
        res: res,
        offered: offered,
        free: free,
        gems: gemsNow()
      };
    }

    st.gems -= n;
    addStat('gemsSpent', n);

    const got = res === 'gold' ? credit(offered, 0) : credit(0, offered);
    save();

    return {
      ok: true,
      spent: n,
      gems: gemsNow(),
      res: res,
      offered: offered,
      got: { gold: got.gold, elixir: got.elixir },
      lost: got.lost
    };
  }

  /* Покупка ресурса за платину: наборы 1/10/100 с бонусом к курсу.
     Платина списывается всегда, ресурс начисляется по свободному месту:
     что не влезло — возвращаем в lost, чтобы интерфейс сказал «Не влезло N».
     Полный склад не продаём вовсе. */
  function buyResource(res, count) {
    if (res !== 'gold' && res !== 'elixir') {
      return { error: 'Неизвестный ресурс' };
    }

    const n = Math.floor(Number(count) || 0);
    if (n < 1) return { error: 'Неверное количество' };

    const amount = CC.resBuyAmount
      ? CC.resBuyAmount(res, n, townhallLevel())
      : 0;
    if (!amount) return { error: 'Курс не задан' };

    if (st.gems < n) {
      const no = noGems(n);
      no.code = 'no-gems';
      no.amount = amount;
      return no;
    }

    const capNow = cap(res);
    const held = res === 'gold' ? st.gold : st.elixir;
    const free = Math.max(0, Math.floor(capNow - held));
    if (free <= 0) {
      return {
        error: 'Склад полон',
        code: 'full',
        full: true,
        res: res,
        amount: amount,
        free: 0,
        gems: gemsNow()
      };
    }

    st.gems -= n;
    addStat('gemsSpent', n);

    const add = Math.min(amount, free);
    const got = res === 'gold' ? credit(add, 0) : credit(0, add);
    const added = res === 'gold' ? got.gold : got.elixir;
    save();

    return {
      ok: true,
      spent: n,
      gems: gemsNow(),
      res: res,
      amount: amount,
      got: added,
      // Не влезло: остаток сверх свободного места.
      lost: Math.max(0, amount - added),
      free: free
    };
  }

  /* ---------- набеги на деревню ---------- */

  // Снимок базы для боя: тип, координаты и реальный уровень постройки.
  function defenseDescriptor() {
    return CC.Base.list().filter(function (it) {
      // Стройплощадка не стреляет и не участвует в обороне, пока не готова.
      return !isBuilding(it.id);
    }).map(function (it) {
      return {
        type: it.type,
        x: it.x,
        y: it.y,
        level: level(it.id)
      };
    });
  }

  function raidArmy() {
    const th = Math.max(1, Math.min(MAX_TH, townhallLevel()));
    const table = RAIDS.armies || {};
    return copyArmy(table[th] || table[MAX_TH] || table[1] || {});
  }

  function truceLeftMs(now) {
    now = typeof now === 'number' ? now : Date.now();
    const until = Number(st.raidTruceUntil) || 0;
    return until > now ? until - now : 0;
  }

  // Состояние перемирия для интерфейса и тестов.
  function raidTruce(now) {
    now = typeof now === 'number' ? now : Date.now();
    const leftMs = truceLeftMs(now);
    return {
      active: leftMs > 0,
      until: Number(st.raidTruceUntil) || 0,
      leftMs: leftMs,
      left: leftMs / 1000
    };
  }

  function raidDue(now) {
    now = typeof now === 'number' ? now : Date.now();
    if (truceLeftMs(now) > 0) return false;
    return now - (st.lastRaid || 0) >= RAIDS.interval;
  }

  // Имя нападавшего для истории: стабильное для одного и того же набега,
  // но разное от раза к разу. Отдельного сервера имён у нас нет.
  const RAID_NAME_A = ['Ржавый', 'Пыльный', 'Стальной', 'Ледяной', 'Кобальтовый',
    'Медный', 'Песчаный', 'Дымный', 'Гравийный', 'Красный'];
  const RAID_NAME_B = ['патруль', 'рейнджер', 'гарнизон', 'караван', 'форпост',
    'сектор', 'отряд', 'дозор', 'клин', 'купол'];

  function raidAttackerName(now, th) {
    const seed = (Math.floor(num(now, 0) / 60000) + th * 37) >>> 0;
    const a = RAID_NAME_A[seed % RAID_NAME_A.length];
    const b = RAID_NAME_B[(seed >>> 4) % RAID_NAME_B.length];
    return a + ' ' + b + ' · TH' + th;
  }

  // Одна запись истории: время, кто напал, итог, украденное, лог высадки
  // и состав армии. Именно log проигрывает повтор.
  function pushRaidHistory(record) {
    if (!Array.isArray(st.raids)) st.raids = [];
    st.raids.unshift(record);
    while (st.raids.length > 5) st.raids.pop();
  }

  // Headless-набег. Ресурсы списываются здесь, бой только считает процент.
  function runRaid(now) {
    now = typeof now === 'number' ? now : Date.now();
    st.lastRaid = now;

    const buildings = defenseDescriptor();
    const hasHall = buildings.some(function (b) { return b.type === 'townhall'; });

    let sim = { percent: 0, thDead: false, win: false, time: 0 };

    if (buildings.length && CC.Battle && CC.Battle.simulate) {
      try {
        sim = CC.Battle.simulate({
          buildings: buildings,
          army: raidArmy(),
          limit: RAIDS.limit,
          name: 'Набег'
        }, { step: 1 / 12 });
      } catch (e) {
        sim = { percent: 0, thDead: false, win: false, time: 0 };
      }
    }

    const percent = Math.max(0, Math.min(100, Math.floor(sim.percent || 0)));
    if (!sim.thDead) addStat('defended', 1);

    // Кража привязана к складам: считаем, какую ёмкость руды и энергии
    // нападавшие выбили. Доля потери = выбитая ёмкость / вся ёмкость этого
    // ресурса. Оба склада ресурса снесены — уносится весь запас (100%),
    // один из двух — примерно половина. Складов нет — грабить нечего.
    const totals = storageTotals();
    const destroyed = Array.isArray(sim.destroyed) ? sim.destroyed : [];
    const seen = {};
    let deadGoldCap = 0;
    let deadElixirCap = 0;
    let deadGold = 0;
    let deadElixir = 0;

    for (let i = 0; i < destroyed.length; i++) {
      const b = destroyed[i];
      if (!b || !b.type) continue;
      if (b.type !== 'storage' && b.type !== 'estorage') continue;
      const key = b.key || (b.type + ':' + b.x + ':' + b.y);
      if (seen[key]) continue;
      seen[key] = 1;

      const capOf = storageCapOf(b.type, b.level);
      if (b.type === 'storage') {
        deadGoldCap += capOf;
        deadGold++;
      } else {
        deadElixirCap += capOf;
        deadElixir++;
      }
    }

    // Снимок мог прийти из старого сейва или заглушки — ёмкость не может
    // превышать то, что реально стоит на базе.
    if (deadGoldCap > totals.gold.cap) deadGoldCap = totals.gold.cap;
    if (deadElixirCap > totals.elixir.cap) deadElixirCap = totals.elixir.cap;
    if (deadGold > totals.gold.count) deadGold = totals.gold.count;
    if (deadElixir > totals.elixir.count) deadElixir = totals.elixir.count;

    const goldShare = totals.gold.cap > 0
      ? Math.max(0, Math.min(1, deadGoldCap / totals.gold.cap))
      : 0;
    const elixirShare = totals.elixir.cap > 0
      ? Math.max(0, Math.min(1, deadElixirCap / totals.elixir.cap))
      : 0;

    // 100% — забираем весь запас без остатка от округления. Иначе floor:
    // в сейве ресурсы могут быть дробными из-за производства.
    const stolenGold = goldShare >= 1
      ? st.gold
      : Math.min(st.gold, Math.floor(st.gold * goldShare));
    const stolenElixir = elixirShare >= 1
      ? st.elixir
      : Math.min(st.elixir, Math.floor(st.elixir * elixirShare));

    st.gold -= stolenGold;
    st.elixir -= stolenElixir;

    // Передышка: снос центра — 8 ч, крупная кража (≥20%) — 6 ч, иначе 2 ч.
    // Долю берём фактическую: максимум по руде и энергии.
    const share = Math.max(goldShare, elixirShare);
    let truceMs = TRUCE.minorMs;
    if (sim.thDead) truceMs = TRUCE.thMs;
    else if (share >= TRUCE.major - 1e-9) truceMs = TRUCE.majorMs;
    st.raidTruceUntil = now + truceMs;

    const thLevel = Math.max(1, Math.min(MAX_TH, townhallLevel()));

    st.pendingRaid = {
      at: now,
      percent: percent,
      thDead: !!sim.thDead,
      thLevel: thLevel,
      // Ловушки набега: сколько стояло и сколько сработало. Нужно для
      // отчёта «почему нападавший потерял отряд» и для художника.
      traps: sim.traps
        ? { total: sim.traps.total || 0, triggered: sim.traps.triggered || 0 }
        : { total: 0, triggered: 0 },
      stolen: {
        gold: Math.max(0, Math.floor(stolenGold)),
        elixir: Math.max(0, Math.floor(stolenElixir))
      },
      // Сколько складов было и сколько снесено: окно набега и история
      // объясняют, почему украли именно столько.
      storages: {
        gold: { total: totals.gold.count, destroyed: deadGold },
        elixir: { total: totals.elixir.count, destroyed: deadElixir }
      },
      truce: {
        until: st.raidTruceUntil,
        ms: truceMs
      }
    };

    // История для кнопки «Повторы». Лог приходит из CC.Battle.simulate:
    // время, тип и клетка каждой высадки. Армия — снимок состава набега.
    const starInfo = CC.Battle && CC.Battle.starsFor
      ? CC.Battle.starsFor(percent, !!sim.thDead)
      : { stars: 0 };
    pushRaidHistory({
      at: now,
      attacker: raidAttackerName(now, thLevel),
      percent: percent,
      stars: Math.max(0, Math.min(3, starInfo.stars | 0)),
      loot: {
        gold: Math.max(0, Math.floor(stolenGold)),
        elixir: Math.max(0, Math.floor(stolenElixir))
      },
      log: Array.isArray(sim.log) ? sim.log.slice(0, 240) : [],
      army: raidArmy()
    });

    save();
    return st.pendingRaid;
  }

  function maybeRaid(now) {
    now = typeof now === 'number' ? now : Date.now();
    if (!raidDue(now)) return null;
    return runRaid(now);
  }

  function pendingRaidInfo() {
    const p = st.pendingRaid;
    if (!p) return null;
    const storages = p.storages || {};
    function pack(v) {
      const o = v && typeof v === 'object' ? v : {};
      return {
        total: Math.max(0, Math.floor(num(o.total, 0))),
        destroyed: Math.max(0, Math.floor(num(o.destroyed, 0)))
      };
    }
    return {
      at: p.at,
      percent: p.percent,
      thDead: p.thDead,
      thLevel: p.thLevel,
      traps: p.traps || { total: 0, triggered: 0 },
      stolen: { gold: p.stolen.gold, elixir: p.stolen.elixir },
      storages: { gold: pack(storages.gold), elixir: pack(storages.elixir) },
      hasHall: CC.Base.count('townhall') > 0
    };
  }

  function claimRaid() {
    const p = pendingRaidInfo();
    st.pendingRaid = null;
    save();
    return p;
  }

  function lastRaidAt() {
    return Number(st.lastRaid) || 0;
  }

  // Последние 5 набегов, новые первыми. Отдаём копию, чтобы интерфейс
  // не мог случайно поправить сейв.
  function raidHistory() {
    if (!Array.isArray(st.raids)) return [];
    return st.raids.map(function (r) {
      return {
        at: r.at,
        attacker: r.attacker,
        percent: r.percent,
        stars: r.stars,
        loot: {
          gold: Math.max(0, Math.floor(num(r.loot && r.loot.gold, 0))),
          elixir: Math.max(0, Math.floor(num(r.loot && r.loot.elixir, 0)))
        },
        log: (r.log || []).map(function (e) {
          return { t: e.t, type: e.type, x: e.x, y: e.y };
        }),
        army: copyArmy(r.army)
      };
    });
  }

  /* ---------- ежедневный контракт «5 звёзд» ---------- */

  // Нормализуем настройки: даже если в конфиге поле пропало или испорчено,
  // контракт остаётся рабочим.
  function dailyCfg() {
    const d = DAILY || {};
    const reward = d.reward || {};
    const perTh = d.perTh || {};
    return {
      stars: Math.max(1, Math.floor(Number(d.stars) || 5)),
      resetMs: Math.max(60 * 60 * 1000, Number(d.resetMs) || 24 * 3600 * 1000),
      maxStack: Math.max(1, Math.floor(Number(d.maxStack) || 2)),
      reward: {
        gold: Math.max(0, Number(reward.gold) || 0),
        elixir: Math.max(0, Number(reward.elixir) || 0),
        gems: Math.max(0, Math.floor(Number(reward.gems) || 0))
      },
      perTh: {
        gold: Math.max(0, Number(perTh.gold) || 0),
        elixir: Math.max(0, Number(perTh.elixir) || 0)
      },
      replayMax: Math.max(0, Math.floor(Number(d.replayMax) || 0))
    };
  }

  // Раз в сутки открывается новый контракт: прогресс обнуляется, а закрытые
  // и незабранные награды остаются в банке (не больше maxStack). Долгое
  // отсутствие не сжигает банк и не копит прогресс за пропущенные дни.
  function settleDaily(now) {
    now = typeof now === 'number' ? now : Date.now();
    const cfg = dailyCfg();

    if (!st.daily || typeof st.daily !== 'object') st.daily = freshDaily(now);
    const d = st.daily;

    let start = Number(d.dayStart);
    if (!isFinite(start) || start <= 0) start = now;
    if (start > now) start = now; // часы ушли назад — не ждём сутки

    if (now - start >= cfg.resetMs) {
      const periods = Math.floor((now - start) / cfg.resetMs);
      start += periods * cfg.resetMs;
      d.progress = 0;
      d.dayStart = start;
      return true;
    }

    d.dayStart = start;
    return false;
  }

  function dailyReward() {
    const cfg = dailyCfg();
    const th = Math.max(1, townhallLevel());
    return {
      gold: Math.round(cfg.reward.gold + cfg.perTh.gold * th),
      elixir: Math.round(cfg.reward.elixir + cfg.perTh.elixir * th),
      gems: cfg.reward.gems
    };
  }

  // Снимок контракта для HUD и окна. Поле stars — прогресс текущего
  // контракта (0..target), bank — сколько готовых наград ждёт в запасе.
  function daily(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleDaily(now);
    const cfg = dailyCfg();
    const d = st.daily;
    const target = cfg.stars;
    const complete = d.progress >= target;
    const leftMs = Math.max(0, d.dayStart + cfg.resetMs - now);

    return {
      stars: Math.min(target, Math.max(0, Math.floor(d.progress))),
      target: target,
      bank: Math.max(0, Math.min(cfg.maxStack, Math.floor(d.bank))),
      maxStack: cfg.maxStack,
      complete: complete,
      ready: d.bank > 0 || complete,
      claimed: Math.max(0, Math.floor(d.claimed)),
      total: Math.max(0, Math.floor(d.starsTotal)),
      reward: dailyReward(),
      nextMs: leftMs,
      next: leftMs / 1000
    };
  }

  // Звёзды за бой. Пять звёзд закрывают контракт и уходят в банк;
  // при полном банке прогресс замирает на 5/5, пока награду не забрали.
  function addDailyStars(count, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleDaily(now);

    const cfg = dailyCfg();
    let add = Math.floor(Number(count) || 0);
    if (add < 0) add = 0;

    const d = st.daily;
    let completed = 0;

    if (add > 0) {
      d.starsTotal = Math.max(0, Number(d.starsTotal) || 0) + add;
      let left = Math.max(0, Number(d.progress) || 0) + add;

      while (left >= cfg.stars && d.bank < cfg.maxStack) {
        left -= cfg.stars;
        d.bank++;
        completed++;
      }
      if (left >= cfg.stars) left = cfg.stars;

      d.progress = left;
      dailyDoneEvent += completed;
      save();
    }

    const info = daily(now);
    info.added = add;
    info.completed = completed;
    return info;
  }

  // Забрать награду: сначала закрытый контракт из банка, потом текущий.
  // После забора прогресс текущего контракта обнуляется.
  function claimDaily(now) {
    now = typeof now === 'number' ? now : Date.now();
    const info = daily(now);

    if (!info.ready) {
      return { error: 'Контракт ещё не выполнен', info: info };
    }

    const d = st.daily;
    if (d.bank > 0) d.bank--;
    else d.progress = 0;
    d.claimed = Math.max(0, Number(d.claimed) || 0) + 1;

    const got = credit(info.reward.gold, info.reward.elixir);
    st.gems += info.reward.gems;
    addXp(30);
    save();

    return {
      ok: true,
      reward: {
        gold: got.gold,
        elixir: got.elixir,
        gems: info.reward.gems
      },
      offered: { gold: info.reward.gold, elixir: info.reward.elixir },
      lost: got.lost || { gold: 0, elixir: 0 },
      info: daily(now)
    };
  }

  function takeDailyDone() {
    const n = dailyDoneEvent;
    dailyDoneEvent = 0;
    return n;
  }

  /* ---------- апгрейды ---------- */

  // 20500 → «20 500»: пробелы между разрядами читаются в панели лучше.
  function numText(v) {
    return String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Все деньги и объёмы — кратны 100: 400 → 400, 460 → 500.
  function round100(v) {
    return Math.round((Number(v) || 0) / 100) * 100;
  }

  // Цена перехода на целевой уровень to (2..10): база × 2^(to−2).
  // База — цена до 2 уровня из CC.UPGRADES[type].cost.
  function levelCost(type, to) {
    const d = UP[type] || {};
    const c = d.cost || {};
    const k = Math.pow(2, Math.max(0, Math.floor(to) - 2));
    return {
      gold: round100((c.gold || 0) * k),
      elixir: round100((c.elixir || 0) * k)
    };
  }

  function upgradeCost(id) {
    const it = item(id);
    if (!it) return null;
    const d = UP[it.type];
    if (!d) return null;

    const lvl = level(id);
    if (lvl >= maxLevel(it.type)) return null;

    const to = lvl + 1;
    const c = levelCost(it.type, to);

    // Цены — кратны 100, чтобы в панели не мельтешили хвосты. Время
    // берём из кривой уровня (CC.BUILD_TIME / CC.TOWNHALL_TIME).
    return {
      level: lvl,
      to: to,
      gold: c.gold,
      elixir: c.elixir,
      time: CC.Base.upgradeTime(it.type, to)
    };
  }

  function busy(id) {
    return !!st.upgrades[id];
  }

  // Сколько ресурсов уже вложено в идущий апгрейд (для подтверждения сноса).
  function upgradeSpent(id) {
    if (!st.upgrades[id]) return null;

    const it = item(id);
    if (!it) return null;

    if (!UP[it.type]) return null;

    const lvl = level(id);
    return levelCost(it.type, lvl + 1);
  }

  function canUpgrade(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleUpgrades(now);

    const it = item(id);
    if (!it) {
      return { ok: false, error: 'Постройка не найдена', reason: 'Постройка не найдена', needTh: null };
    }

    if (busy(id)) {
      return { ok: false, error: 'Уже улучшается', reason: 'Уже улучшается', needTh: null };
    }

    // Пока идёт стройка, модуль не улучшить: сначала строитель её закончит.
    if (isBuilding(id)) {
      const bi = buildInfo(id, now);
      return {
        ok: false,
        error: 'Сначала дострой постройку' +
          (bi ? ' · осталось ' + clockText(bi.leftMs / 1000) : ''),
        reason: 'Сначала дострой постройку',
        needTh: null,
        build: bi
      };
    }

    const lvl = level(id);
    const maxLvl = maxLevel(it.type);

    // упёрлись в уровень командного центра: говорим, до какого TH качать
    if (lvl >= maxLvl) {
      const target = lvl + 1;
      const need = needThFor(it.type, target);

      if (it.type === 'townhall' || need > MAX_TH || target > MAX_TH) {
        return {
          ok: false,
          error: 'Максимальный уровень',
          reason: 'Максимальный уровень',
          needTh: null
        };
      }

      const reason = 'Сначала улучши командный центр до ' + need + ' уровня';
      return { ok: false, error: reason, reason: reason, needTh: need };
    }

    const c = upgradeCost(id);
    if (!c) {
      return {
        ok: false,
        error: 'Максимальный уровень',
        reason: 'Максимальный уровень',
        needTh: null
      };
    }

    // Склад меньше цены — качать бесполезно, сначала расширяем лимит.
    // У руды и энергии теперь разные здания, поэтому и подсказка своя.
    const capGold = cap('gold');
    const capElixir = cap('elixir');

    if (c.gold > capGold) {
      const reason = 'Хранилище руды мало: ' + numText(capGold) + ' из ' + numText(c.gold) +
        '. Поставь ещё хранилище руды';
      return {
        ok: false, error: reason, reason: reason, needTh: null,
        needStorage: true, resource: 'gold', cap: Math.round(capGold),
        cost: c
      };
    }

    if (c.elixir > capElixir) {
      const reason = 'Хранилище энергии мало: ' + numText(capElixir) + ' из ' + numText(c.elixir) +
        '. Поставь ещё хранилище энергии';
      return {
        ok: false, error: reason, reason: reason, needTh: null,
        needStorage: true, resource: 'elixir', cap: Math.round(capElixir),
        cost: c
      };
    }

    // один рабочий — один апгрейд; мгновенные стены строителя не занимают
    let builderState = null;
    if (c.time > 0) {
      builderState = builders(now);
      const b = builderState;
      if (b.free <= 0) {
        return {
          ok: false,
          error: 'Все строители заняты',
          reason: 'Все строители заняты',
          needTh: null,
          wait: b.next,
          builders: b,
          cost: c
        };
      }
    }

    if (st.gold < c.gold) {
      const need = Math.ceil(c.gold - st.gold);
      const reason = 'Не хватает ' + need + ' руды';
      return {
        ok: false,
        error: reason,
        reason: reason,
        needTh: null,
        cost: c,
        missing: { gold: need }
      };
    }

    if (st.elixir < c.elixir) {
      const need = Math.ceil(c.elixir - st.elixir);
      const reason = 'Не хватает ' + need + ' энергии';
      return {
        ok: false,
        error: reason,
        reason: reason,
        needTh: null,
        cost: c,
        missing: { elixir: need }
      };
    }

    return {
      ok: true,
      error: null,
      reason: null,
      needTh: null,
      cost: c,
      builders: builderState
    };
  }

  function startUpgrade(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    const check = canUpgrade(id, now);
    if (check.error) return check;

    const c = check.cost;
    const it = item(id);

    // Перед стройкой бура/реактора накопленное уходит на склад: что влезло —
    // забираем, что нет — остаётся в буфере. Снос постройки ресурсы не спасает.
    let auto = null;
    if (it && CC.PRODUCTION[it.type] && stored(id) > 1e-6) {
      const got = collect(id);
      if (!got.error) {
        auto = {
          res: got.res,
          gold: got.gold || 0,
          elixir: got.elixir || 0,
          got: got.got || 0,
          left: got.left || 0
        };
      }
    }

    st.gold -= c.gold;
    st.elixir -= c.elixir;

    // Стены (и вообще всё с нулевым временем) завершаются сразу и не
    // занимают строителя.
    if (!(c.time > 0)) {
      completeUpgrade(id, c.to);
      save();
      return { ok: true, cost: c, auto: auto, instant: true };
    }

    st.upgrades[id] = {
      to: c.to,
      startedAt: now,
      endAt: now + c.time * 1000,
      time: c.time
    };
    save();
    return { ok: true, cost: c, auto: auto };
  }

  // null — апгрейд не идёт. Иначе: уровень, остаток в секундах и мс,
  // время старта/конца и признак активности — для иконок над постройками.
  function upgradeInfo(id, now) {
    const u = st.upgrades[id];
    if (!u) return null;
    now = typeof now === 'number' ? now : Date.now();
    const leftMs = Math.max(0, u.endAt - now);
    return {
      active: true,
      to: u.to,
      next: u.to,
      total: u.time,
      left: leftMs / 1000,
      leftMs: leftMs,
      startedAt: u.startedAt,
      endAt: u.endAt
    };
  }

  function completeUpgrade(id, to) {
    st.levels[id] = to;
    upgradeDoneEvent++;
    addStat('upgrades', 1);
    // «Максимальная мощность»: модуль докачан до максимума, который
    // разрешён текущим центром (башня-лазер и ангар отстают на 1).
    const it = item(id);
    if (it && to >= maxLevel(it.type)) addStat('maxed', 1);
    addXp(10 * (to | 0));
    invalidateCaps();
  }

  function settleUpgrades(now) {
    let changed = false;
    for (const id in st.upgrades) {
      const u = st.upgrades[id];
      if (!u) continue;
      if (u.endAt <= now) {
        completeUpgrade(id, u.to);
        delete st.upgrades[id];
        changed = true;
      }
    }
    if (changed) save();
  }

  /* ---------- прокачка войск ---------- */

  // Только собственные типы CC.TROOPS: «constructor» и «__proto__» не войска.
  // Герой качается отдельным слотом, поэтому в линейку исследований не входит.
  function isTroopType(type) {
    return type !== 'hero' && typeof type === 'string' &&
      Object.prototype.hasOwnProperty.call(TROOPS, type);
  }

  // Потолок уровня войск = уровень командного центра (TH1 → 1, TH10 → 10).
  function troopMaxLevel(thLevel) {
    let th = typeof thLevel === 'number' ? Math.round(thLevel) : townhallLevel();
    th = th < 1 ? 1 : (th > MAX_TH ? MAX_TH : th);
    return Math.min(TROOP_LVL.max || 10, th);
  }

  // Текущий уровень войска; мусор в сейве читается как 1.
  function troopLevel(type) {
    if (!isTroopType(type)) return 1;
    const l = Math.floor(Number(st.troopLevels && st.troopLevels[type]));
    if (!(l >= 1)) return 1;
    const max = TROOP_LVL.max || 10;
    return l > max ? max : l;
  }

  // Множитель HP и урона: 2^(уровень − 1). Уровень 1 — ровно 1.0.
  function troopMultiplier(type) {
    return Math.pow(2, troopLevel(type) - 1);
  }

  // Цена и время улучшения до СЛЕДУЮЩЕГО уровня.
  // Целевой уровень to: цена = cost × 12 × 2^(to−2) до сотен,
  // время = time × 6 × 1.5^(to−2) до 5 секунд.
  function troopUpgradeCost(type) {
    const d = isTroopType(type) ? TROOPS[type] : null;
    if (!d) return null;

    // Закрытое по уровню центра войско не качается: цены для него нет.
    if (CC.troopUnlock && CC.troopUnlock(type) > townhallLevel()) return null;

    const lvl = troopLevel(type);
    const max = troopMaxLevel();
    if (lvl >= max) return null;

    const to = lvl + 1;
    const k = to - 2;
    const cf = isFinite(TROOP_LVL.costFactor) ? TROOP_LVL.costFactor : 12;
    const tf = isFinite(TROOP_LVL.timeFactor) ? TROOP_LVL.timeFactor : 6;
    const tg = isFinite(TROOP_LVL.timeGrowth) ? TROOP_LVL.timeGrowth : 1.5;

    const rawCost = (d.cost || 0) * cf * Math.pow(2, k);
    const rawTime = (d.time || 0) * tf * Math.pow(tg, k);

    return {
      type: type,
      level: lvl,
      to: to,
      elixir: round100(rawCost),
      time: Math.max(5, Math.round(rawTime / 5) * 5)
    };
  }

  function troopBusy() {
    return !!st.troopUp;
  }

  // Проверка перед стартом. Порядок важен: закрытое войско ругается уровнем
  // центра, потом занятый слот, потом максимум и энергия.
  function canUpgradeTroop(type, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleTroops(now);

    if (!isTroopType(type)) {
      return {
        ok: false, error: 'Неизвестное войско', reason: 'Неизвестное войско',
        needTh: null, cost: null
      };
    }

    const th = townhallLevel();
    const unlockAt = CC.troopUnlock ? CC.troopUnlock(type) : 1;
    if (unlockAt > th) {
      const reason = 'Откроется на ' + unlockAt + ' уровне центра';
      return {
        ok: false, error: reason, reason: reason,
        needTh: unlockAt, locked: true, cost: null
      };
    }

    if (troopBusy()) {
      const busyType = st.troopUp.type;
      const reason = busyType === type
        ? 'Уже улучшается'
        : 'Сначала заверши исследование';
      return {
        ok: false, error: reason, reason: reason,
        needTh: null, busy: true, busyType: busyType,
        cost: troopUpgradeCost(type)
      };
    }

    const lvl = troopLevel(type);
    const max = troopMaxLevel(th);
    if (lvl >= max) {
      if (max >= (TROOP_LVL.max || 10)) {
        return {
          ok: false, error: 'Максимальный уровень', reason: 'Максимальный уровень',
          needTh: null, cost: null
        };
      }
      const need = lvl + 1;
      const reason = 'Сначала улучши командный центр до ' + need + ' уровня';
      return {
        ok: false, error: reason, reason: reason,
        needTh: need, cost: null
      };
    }

    const c = troopUpgradeCost(type);
    if (!c) {
      return {
        ok: false, error: 'Максимальный уровень', reason: 'Максимальный уровень',
        needTh: null, cost: null
      };
    }

    // Цена выше лимита склада — качать нечем, пока не расширено хранилище.
    if (c.elixir > cap('elixir')) {
      const reason = 'Хранилище энергии мало: ' + numText(cap('elixir')) + ' из ' +
        numText(c.elixir) + '. Поставь ещё хранилище энергии';
      return {
        ok: false, error: reason, reason: reason, needTh: null,
        needStorage: true, resource: 'elixir', cap: Math.round(cap('elixir')),
        cost: c
      };
    }

    if (st.elixir < c.elixir) {
      const need = Math.ceil(c.elixir - st.elixir);
      const reason = 'Не хватает ' + numText(need) + ' энергии';
      return {
        ok: false, error: reason, reason: reason, needTh: null,
        cost: c, missing: { elixir: need }
      };
    }

    return { ok: true, error: null, reason: null, needTh: null, cost: c };
  }

  // Старт исследования: отдельный слот, строители не заняты.
  function startTroopUpgrade(type, now) {
    now = typeof now === 'number' ? now : Date.now();
    const check = canUpgradeTroop(type, now);
    if (check.error) return check;

    const c = check.cost;
    st.elixir -= c.elixir;
    st.troopUp = {
      type: type,
      to: c.to,
      startedAt: now,
      endAt: now + c.time * 1000,
      time: c.time
    };
    save();
    return { ok: true, type: type, to: c.to, cost: c };
  }

  // Идущее исследование: тип, цель, остаток и прогресс 0..1 — для панели.
  function troopUpInfo(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleTroops(now);

    const u = st.troopUp;
    if (!u) return null;

    const leftMs = Math.max(0, u.endAt - now);
    const total = Math.max(1, Number(u.time) || 0);
    const left = leftMs / 1000;
    return {
      active: true,
      type: u.type,
      name: isTroopType(u.type) ? TROOPS[u.type].name : u.type,
      to: u.to,
      level: troopLevel(u.type),
      total: total,
      left: left,
      leftMs: leftMs,
      progress: Math.max(0, Math.min(1, 1 - left / total)),
      startedAt: u.startedAt,
      endAt: u.endAt
    };
  }

  // Завершение по абсолютному endAt. Уровень поднимается один раз,
  // событие забирает интерфейс для тоста.
  function settleTroops(now) {
    const u = st.troopUp;
    if (!u || !(u.endAt <= now)) return false;

    const type = u.type;
    if (isTroopType(type)) {
      const cur = troopLevel(type);
      const max = TROOP_LVL.max || 10;
      const to = Math.min(max, Math.max(cur, Math.floor(Number(u.to) || cur)));
      st.troopLevels[type] = to;
      troopDoneEvent = { type: type, level: to, name: TROOPS[type].name };
      addXp(10 * to);
    }

    st.troopUp = null;
    save();
    return true;
  }

  // Ускорение исследования платиной: та же цена, что у апгрейдов построек.
  function troopSpeedCost(now) {
    now = typeof now === 'number' ? now : Date.now();
    const info = troopUpInfo(now);
    if (!info) return null;
    return { gems: gemCostFor(info.left), left: info.left, type: info.type };
  }

  function speedUpTroop(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleTroops(now);

    if (!st.troopUp) return { error: 'Улучшение не идёт' };

    const left = Math.max(0, (st.troopUp.endAt - now) / 1000);
    const cost = gemCostFor(left);
    if (st.gems < cost) return noGems(cost);

    const type = st.troopUp.type;
    st.gems -= cost;
    addStat('gemsSpent', cost);
    st.troopUp.endAt = now;
    settleTroops(now);
    save();
    return {
      ok: true, spent: cost, gems: gemsNow(),
      type: type, level: troopLevel(type)
    };
  }

  // Характеристики войска с учётом уровня — для панели.
  function troopStats(type) {
    const d = isTroopType(type) ? TROOPS[type] : null;
    if (!d) return null;
    const lvl = troopLevel(type);
    const mult = troopMultiplier(type);
    return {
      type: type,
      level: lvl,
      max: troopMaxLevel(),
      maxAll: TROOP_LVL.max || 10,
      mult: mult,
      hp: Math.round((d.hp || 0) * mult),
      dmg: Math.round((d.dmg || 0) * mult),
      baseHp: d.hp || 0,
      baseDmg: d.dmg || 0
    };
  }

  function takeTroopDone() {
    const e = troopDoneEvent;
    troopDoneEvent = null;
    return e;
  }

  /* ---------- герой ---------- */

  // Потолок героя = уровень центра. До TH5 герой закрыт и max = 0.
  function heroMaxLevel(thLevel) {
    let th = typeof thLevel === 'number' ? Math.round(thLevel) : townhallLevel();
    th = th < 1 ? 1 : (th > MAX_TH ? MAX_TH : th);
    if (th < (HERO.minTh || 5)) return 0;
    return Math.min(HERO.maxLevel || 10, th);
  }

  // Текущий уровень героя. Старый сейв с TH5+ открывает его на 1 уровне.
  function heroLevel() {
    const th = townhallLevel();
    const max = heroMaxLevel(th);
    if (max <= 0) return 0;

    let l = Math.floor(Number(st.heroLevel));
    if (!(l >= 1)) {
      l = 1;
      st.heroLevel = l;
      save();
    }
    if (l > max) l = max;
    return l;
  }

  // Цена и время улучшения до СЛЕДУЮЩЕГО уровня. Целевой уровень to (2..10):
  // руда = 1600 × 2^(to−2) до сотен, время — из таблицы CC.HERO.times.
  function heroUpgradeCost() {
    const th = townhallLevel();
    const lvl = heroLevel();
    const max = heroMaxLevel(th);
    if (!lvl || lvl >= max) return null;

    const to = lvl + 1;
    const table = HERO.costs || {};
    let gold = Math.floor(Number(table[to]));
    if (!isFinite(gold) || gold <= 0) {
      const base = Number(HERO.costBase) || 1600;
      gold = round100(base * Math.pow(2, to - 2));
    }

    const times = HERO.times || {};
    let time = Math.floor(Number(times[to]));
    if (!isFinite(time) || time <= 0) {
      time = Math.min(24 * 3600, 30 * 60 * Math.pow(2, to - 2));
    }

    return {
      type: HERO.id || 'hero',
      level: lvl,
      to: to,
      gold: gold,
      time: time
    };
  }

  function heroBusy() {
    return !!st.heroUp;
  }

  // Проверка перед стартом: закрыт → занят слот → максимум → руда.
  function canUpgradeHero(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleHero(now);

    const th = townhallLevel();
    const minTh = HERO.minTh || 5;
    if (th < minTh) {
      const reason = 'Откроется с командного центра ' + minTh + ' уровня';
      return {
        ok: false, error: reason, reason: reason,
        needTh: minTh, locked: true, cost: null
      };
    }

    if (heroBusy()) {
      return {
        ok: false, error: 'Уже улучшается', reason: 'Уже улучшается',
        needTh: null, busy: true, cost: heroUpgradeCost()
      };
    }

    const lvl = heroLevel();
    const max = heroMaxLevel(th);
    if (lvl >= max) {
      if (max >= (HERO.maxLevel || 10)) {
        return {
          ok: false, error: 'Максимальный уровень',
          reason: 'Максимальный уровень', needTh: null, cost: null
        };
      }
      const need = lvl + 1;
      const reason = 'Сначала улучши командный центр до ' + need + ' уровня';
      return {
        ok: false, error: reason, reason: reason,
        needTh: need, cost: null
      };
    }

    const c = heroUpgradeCost();
    if (!c) {
      return {
        ok: false, error: 'Максимальный уровень',
        reason: 'Максимальный уровень', needTh: null, cost: null
      };
    }

    if (st.gold < c.gold) {
      const need = Math.ceil(c.gold - st.gold);
      return {
        ok: false, error: 'Не хватает ' + numText(need) + ' руды',
        reason: 'Не хватает руды', needTh: null,
        cost: c, missing: { gold: need }
      };
    }

    return { ok: true, error: null, reason: null, needTh: null, cost: c };
  }

  // Старт прокачки героя: отдельный слот, строители и troopUp не заняты.
  function startHeroUpgrade(now) {
    now = typeof now === 'number' ? now : Date.now();
    const check = canUpgradeHero(now);
    if (check.error) return check;

    const c = check.cost;
    st.gold -= c.gold;
    st.heroUp = {
      to: c.to,
      startedAt: now,
      endAt: now + c.time * 1000,
      time: c.time
    };
    save();
    return { ok: true, to: c.to, gold: c.gold, time: c.time, cost: c };
  }

  // Идущая прокачка героя: цель, остаток и прогресс 0..1 — для карточки.
  function heroUpInfo(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleHero(now);

    const u = st.heroUp;
    if (!u) return null;

    const leftMs = Math.max(0, u.endAt - now);
    const total = Math.max(1, Number(u.time) || 0);
    const left = leftMs / 1000;
    return {
      active: true,
      type: HERO.id || 'hero',
      name: (TROOPS.hero && TROOPS.hero.name) || 'Сержант',
      to: u.to,
      level: heroLevel(),
      total: total,
      left: left,
      leftMs: leftMs,
      progress: Math.max(0, Math.min(1, 1 - left / total)),
      startedAt: u.startedAt,
      endAt: u.endAt
    };
  }

  // Ускорение прокачки героя: та же формула и потолок, что у построек
  // и исследований войск. Отдельная кнопка в карточке героя.
  function heroSpeedCost(now) {
    now = typeof now === 'number' ? now : Date.now();
    const info = heroUpInfo(now);
    if (!info) return null;
    return { gems: gemCostFor(info.left), left: info.left, to: info.to };
  }

  function speedUpHero(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleHero(now);

    if (!st.heroUp) return { error: 'Улучшение не идёт' };

    const left = Math.max(0, (st.heroUp.endAt - now) / 1000);
    const cost = gemCostFor(left);
    if (st.gems < cost) return noGems(cost);

    st.gems -= cost;
    addStat('gemsSpent', cost);
    st.heroUp.endAt = now;
    settleHero(now);
    save();
    return { ok: true, spent: cost, gems: gemsNow(), level: heroLevel() };
  }

  // Завершение по абсолютному endAt: уровень поднимается один раз.
  function settleHero(now) {
    const u = st.heroUp;
    if (!u || !(u.endAt <= now)) return false;

    const max = heroMaxLevel();
    const cur = heroLevel();
    const to = Math.min(max || (HERO.maxLevel || 10),
      Math.max(cur || 1, Math.floor(Number(u.to) || cur || 1)));

    if (max > 0 && to >= 1) {
      st.heroLevel = to;
      heroDoneEvent = {
        level: to,
        name: (TROOPS.hero && TROOPS.hero.name) || 'Сержант'
      };
      addXp(10 * to);
    }

    st.heroUp = null;
    save();
    return true;
  }

  // Характеристики героя по уровню: HP и урон удваиваются за уровень.
  // L1 — 1000/80, L10 — 512 000/40 960. Щит считается отдельно и от
  // множителей не зависит.
  function heroStats(level) {
    const max = HERO.maxLevel || 10;
    let l = Math.floor(Number(level));
    if (!(l >= 1)) l = heroLevel() || 1;
    if (l > max) l = max;

    const mult = Math.pow(2, l - 1);
    const hp = Math.round((HERO.hpBase || 1000) * mult);
    const dmg = Math.round((HERO.dmgBase || 80) * mult);

    return {
      type: HERO.id || 'hero',
      level: l,
      hp: hp,
      dmg: dmg,
      speed: HERO.speed || 2,
      range: HERO.range || 1.2,
      max: heroMaxLevel(),
      maxAll: max,
      ability: HERO.ability || { name: 'Щит', duration: 3, uses: 1 }
    };
  }

  function takeHeroDone() {
    const e = heroDoneEvent;
    heroDoneEvent = null;
    return e;
  }

  /* ---------- стройка новых построек ---------- */

  // M:SS для таймеров и ошибок занятости.
  function clockText(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // Идёт ли стройка постройки. Пока идёт — бур не капает, турель не
  // стреляет, хранилище/ангар не дают вместимости.
  function isBuilding(id) {
    return !!(st.builds && st.builds[id]);
  }

  function buildInfo(id, now) {
    const b = st.builds && st.builds[id];
    if (!b) return null;

    now = typeof now === 'number' ? now : Date.now();
    const leftMs = Math.max(0, Number(b.endAt) - now);
    const totalMs = b.time > 0
      ? b.time * 1000
      : Math.max(1, Number(b.endAt) - (Number(b.startedAt) || Number(b.endAt)));
    const progress = Math.max(0, Math.min(1, (totalMs - leftMs) / totalMs));

    return {
      id: id,
      leftMs: leftMs,
      left: leftMs / 1000,
      progress: progress,
      total: totalMs / 1000,
      startedAt: Number(b.startedAt) || 0,
      endAt: Number(b.endAt) || 0
    };
  }

  // Начать стройку. Строителя занимает сама запись builds, как апгрейд —
  // запись в upgrades. Возвращает данные для тоста.
  function startBuild(id, seconds, now) {
    const time = Math.max(0, Number(seconds) || 0);
    if (!(time > 0)) return null;

    now = typeof now === 'number' ? now : Date.now();
    if (!st.builds) st.builds = {};
    st.builds[id] = {
      startedAt: now,
      endAt: now + time * 1000,
      time: time
    };
    save();
    return { time: time, startedAt: now, endAt: now + time * 1000 };
  }

  // Завершение по абсолютному endAt: работает и после оффлайна.
  function settleBuilds(now) {
    if (!st.builds || typeof st.builds !== 'object') {
      st.builds = {};
      return;
    }

    now = typeof now === 'number' ? now : Date.now();
    let changed = false;

    for (const key in st.builds) {
      const b = st.builds[key];
      if (!b) {
        delete st.builds[key];
        changed = true;
        continue;
      }
      if (!isFinite(Number(b.endAt))) {
        delete st.builds[key];
        changed = true;
        continue;
      }
      if (Number(b.endAt) <= now) {
        const it = item(Number(key));
        delete st.builds[key];
        changed = true;
        if (it) buildDoneEvent.push(it.type);
      }
    }

    if (changed) {
      invalidateCaps();
      save();
    }
  }

  function buildSpeedCost(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleBuilds(now);
    const info = buildInfo(id, now);
    if (!info) return null;
    return { gems: gemCostFor(info.left), left: info.left };
  }

  // Мгновенно достроить за платину, строитель освобождается.
  function speedUpBuild(id, now) {
    now = typeof now === 'number' ? now : Date.now();
    settleBuilds(now);

    const b = st.builds && st.builds[id];
    if (!b) return { error: 'Стройка не идёт' };

    const left = Math.max(0, (Number(b.endAt) - now) / 1000);
    const cost = gemCostFor(left);
    if (st.gems < cost) return noGems(cost);

    st.gems -= cost;
    addStat('gemsSpent', cost);
    b.endAt = now;
    settleBuilds(now);
    save();
    return { ok: true, spent: cost, gems: gemsNow() };
  }

  // Разовые события «постройка готова» для тостов.
  function takeBuildDone() {
    const list = buildDoneEvent;
    buildDoneEvent = [];
    return list;
  }

  /* ---------- бригады строителей ---------- */

  // Название очередной бригады по её номеру (2, 3, 4).
  function builderOrdinal(n) {
    const words = { 2: 'Вторая', 3: 'Третья', 4: 'Четвёртая' };
    return words[n] || (n + '-я');
  }

  // Следующая бригада по текущему лимиту: { th, cost, number } или null.
  // Номер считается от единицы: 1-я уже есть, поэтому index = builders - start.
  function nextBuilderTeam() {
    if (st.builders >= BUILD.max) return null;
    const teams = BUILD.teams || [];
    const index = Math.max(0, st.builders - (BUILD.start || 1));
    const team = teams[index];
    if (!team) return null;
    return { th: team.th, cost: team.cost, number: st.builders + 1 };
  }

  // Бригада занимает один апгрейд ИЛИ одну стройку. Занятость выводится
  // из активных записей, поэтому после рестарта всё считается само.
  function builders(now) {
    now = typeof now === 'number' ? now : Date.now();
    settleUpgrades(now);
    settleBuilds(now);

    let busyCount = 0;
    let next = null;

    for (const id in st.upgrades) {
      busyCount++;
      const left = Math.max(0, (st.upgrades[id].endAt - now) / 1000);
      if (next === null || left < next) next = left;
    }

    for (const id in st.builds) {
      busyCount++;
      const left = Math.max(0, (st.builds[id].endAt - now) / 1000);
      if (next === null || left < next) next = left;
    }

    const team = nextBuilderTeam();
    const th = townhallLevel();
    let hireError = null;

    if (!team) hireError = 'Больше бригад нет';
    else if (th < team.th) {
      hireError = builderOrdinal(team.number) + ' бригада — с ' + team.th + ' уровня центра';
    } else if (st.gems < team.cost) {
      hireError = 'Не хватает ' + Math.ceil(team.cost - st.gems) + ' платины';
    }

    return {
      total: st.builders,
      busy: busyCount,
      free: Math.max(0, st.builders - busyCount),
      next: next,
      team: team,
      th: th,
      canHire: !!team && !hireError,
      hireError: hireError
    };
  }

  // Покупка следующей бригады: только платина и только с нужного TH.
  function hireBuilder() {
    const team = nextBuilderTeam();
    if (!team) return { error: 'Больше бригад нет' };

    const th = townhallLevel();
    if (th < team.th) {
      return {
        error: builderOrdinal(team.number) + ' бригада — с ' + team.th + ' уровня центра',
        needTh: team.th,
        team: team
      };
    }

    if (st.gems < team.cost) {
      const missing = Math.ceil(team.cost - st.gems);
      return { error: 'Не хватает ' + missing + ' платины', missing: missing, team: team };
    }

    st.gems -= team.cost;
    addStat('gemsSpent', team.cost);
    st.builders++;
    save();
    return { ok: true, total: st.builders, spent: team.cost, team: team };
  }

  /* ---------- характеристики для панели ---------- */

  function stats(id) {
    const it = item(id);
    if (!it) return null;
    const d = DEFS[it.type] || {};
    const u = UP[it.type] || {};
    const lvl = level(id);
    const k = lvl - 1;
    const calc = CC.BuildingStats.at(it.type, lvl);

    const out = {
      level: lvl,
      max: u.max || ECON.maxLevel,
      hp: calc.hp
    };

    if (calc.dmg !== undefined) out.dmg = calc.dmg;
    if (calc.range !== undefined) out.range = calc.range;
    if (calc.minRange !== undefined) out.minRange = calc.minRange;
    if (calc.rate !== undefined) out.rate = calc.rate;
    if (calc.splash !== undefined) out.splash = calc.splash;
    if (calc.trap) {
      out.trap = true;
      out.trapKind = calc.trapKind;
      out.radius = calc.radius;
      out.capacity = calc.capacity;
      out.maxUnitSpace = calc.maxUnitSpace;
    }
    if (calc.hidden) {
      out.hidden = true;
      out.revealRange = calc.revealRange;
    }
    if (calc.beam) {
      out.beam = true;
      out.ramp = calc.ramp;
      out.rampMax = calc.rampMax;
    }
    if (calc.onlyGround) out.onlyGround = true;
    if (calc.targetsAir) out.targetsAir = true;

    const p = CC.PRODUCTION[it.type];
    if (p) {
      out.production = produceAt(it.type, lvl);
      out.res = p.res;
      out.stored = stored(id);
      out.extractCap = extractCapOf(it);
    }

    if (it.type === 'storage') {
      out.capGold = Math.round(storageCapOf('storage', lvl));
      out.store = 'gold';
    }

    if (it.type === 'estorage') {
      out.capElixir = Math.round(storageCapOf('estorage', lvl));
      out.store = 'elixir';
    }

    if (it.type === 'barracks') {
      // Ангар даёт 20 мест за свой уровень и один параллельный слот
      // тренировки. Подпись панели показывает именно эти числа.
      out.capacity = (CC.ARMY.capacityPerBarracks || 20) * lvl;
      out.trainSlots = 1;
    }

    return out;
  }

  // Производство в секунду на уровне: база × 2^(уровень − 1).
  function produceAt(type, lvl) {
    const p = CC.PRODUCTION[type];
    if (!p) return 0;
    let l = Math.floor(Number(lvl) || 1);
    if (l < 1) l = 1;
    if (l > ECON.maxLevel) l = ECON.maxLevel;
    return +(p.rate * Math.pow(2, l - 1)).toFixed(2);
  }

  // ---------- армия ----------
  //
  // Места в армии дают только готовые ангары: 20 за каждый уровень ангара.
  // Один L1 + один L2 = 60, два L10 = 400. Стройплощадка и снесённый ангар
  // мест не дают. Ангары тренируют параллельно: каждый ангар — один
  // одновременный юнит, а очередь общая и ограничена вместимостью армии.

  function barracksList() {
    const list = CC.Base.list();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== 'barracks') continue;
      if (isBuilding(list[i].id)) continue;
      out.push(list[i]);
    }
    return out;
  }

  function capacity() {
    const per = CC.ARMY.capacityPerBarracks || 20;
    const bars = barracksList();
    let n = 0;
    for (let i = 0; i < bars.length; i++) n += per * level(bars[i].id);
    return n;
  }

  // Сколько юнитов тренируется одновременно: по одному на каждый ангар.
  function trainSlots() {
    return barracksList().length;
  }

  function spaceOf(map) {
    let n = 0;
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      n += (map[t] || 0) * (TROOPS[t].space || 1);
    }
    return n;
  }

  function armyUsed() {
    return spaceOf(st.army);
  }

  function queuedSpace() {
    let n = 0;
    for (let i = 0; i < st.queue.length; i++) {
      n += TROOPS[st.queue[i].type].space || 1;
    }
    return n;
  }

  // Лимит очереди — вся вместимость армии (в местах). Число одновременных
  // тренировок смотрите в trainSlots()/queueStats(), это разные вещи.
  function queueSlots() {
    return capacity();
  }

  // Старые сейвы и изменение числа ангаров могли оставить слот вне
  // диапазона. Такой юнит безопасно считаем первым слотом.
  function slotOf(e, slots) {
    const n = slots || trainSlots();
    if (n <= 0) return 0;
    const s = Math.floor(Number(e && e.slot));
    if (!isFinite(s) || s < 0) return 0;
    return s >= n ? s % n : s;
  }

  // Когда освободится конкретный ангар: конец его последнего юнита.
  function slotFreeAt(slot, now) {
    let end = now;
    for (let i = 0; i < st.queue.length; i++) {
      if (slotOf(st.queue[i]) !== slot) continue;
      if (st.queue[i].endAt > end) end = st.queue[i].endAt;
    }
    return end;
  }

  function canTrain(type) {
    if (!TROOPS[type]) return { error: 'Неизвестное войско' };
    // Герой не тренируется и не встаёт в очередь: он всегда готов.
    if (type === 'hero') {
      return { error: 'Герой не тренируется', reason: 'Герой не тренируется' };
    }

    // Постепенное открытие: на TH1 только штурмовик, дальше раз в два уровня.
    const unlockAt = CC.troopUnlock ? CC.troopUnlock(type) : 1;
    if (unlockAt > townhallLevel()) {
      const reason = 'Откроется на ' + unlockAt + ' уровне центра';
      return { error: reason, reason: reason, needTh: unlockAt };
    }

    if (!trainSlots()) return { error: 'Нужен ангар' };

    const d = TROOPS[type];
    if (st.elixir < d.cost) return { error: 'Не хватает энергии' };
    if (armyUsed() + queuedSpace() + (d.space || 1) > capacity()) {
      return { error: 'Армия заполнена' };
    }
    return { ok: true };
  }

  // Найм ставит юнита в самый ранний свободный ангар. Поэтому два ангара
  // реально тренируют двух бойцов одновременно, а не ждут друг друга.
  function train(type, now) {
    const check = canTrain(type);
    if (check.error) return check;

    now = typeof now === 'number' ? now : Date.now();
    const d = TROOPS[type];
    const slots = trainSlots();

    let slot = 0;
    let start = slotFreeAt(0, now);
    for (let s = 1; s < slots; s++) {
      const free = slotFreeAt(s, now);
      if (free < start) {
        start = free;
        slot = s;
      }
    }

    st.elixir -= d.cost;
    st.queue.push({
      type: type,
      endAt: start + d.time * 1000,
      slot: slot
    });
    save();
    return { ok: true, slot: slot };
  }

  // Сколько юнитов реально влезет в пачку прямо сейчас: место в армии
  // и энергия. Очередь общая, поэтому отдельных «слотов» больше нет.
  function batchFit(type) {
    const d = TROOPS[type];
    if (!d) return 0;
    const unlockAt = CC.troopUnlock ? CC.troopUnlock(type) : 1;
    if (unlockAt > townhallLevel()) return 0;
    if (!trainSlots()) return 0;

    const spaceLeft = Math.max(0, capacity() - armyUsed() - queuedSpace());
    const bySpace = Math.floor(spaceLeft / (d.space || 1));
    const byElixir = d.cost > 0 ? Math.floor(st.elixir / d.cost) : 5;

    return Math.max(0, Math.min(5, bySpace, byElixir));
  }

  // Пачка до 5 юнитов: ставим столько, сколько влезает по месту
  // и энергии. Если не влез ни один — отдаём ту же ошибку, что и найм.
  function trainBatch(type, want, now) {
    const n = Math.max(1, Math.min(5, Math.floor(Number(want) || 5)));
    let added = 0;
    let lastError = null;

    for (let i = 0; i < n; i++) {
      const res = train(type, now);
      if (res.error) {
        lastError = res.error;
        break;
      }
      added++;
    }

    if (!added) return { error: lastError || 'Не хватает энергии' };
    return { ok: true, added: added, requested: n };
  }

  function cancelTrain(index, now) {
    const e = st.queue[index];
    if (!e) return { error: 'Нет такой очереди' };

    const d = TROOPS[e.type];
    const refund = credit(0, d.cost);
    now = typeof now === 'number' ? now : Date.now();

    const slot = slotOf(e);
    st.queue.splice(index, 1);

    // Пересобираем таймеры только своего ангара: остальные продолжают
    // тренировку без потери прогресса. Внутри слота отсчёт идёт от now,
    // иначе отмена частично обученного юнита дарила бы ускорение.
    let end = now;
    for (let i = 0; i < index; i++) {
      const prev = st.queue[i];
      if (!prev || slotOf(prev) !== slot) continue;
      if (prev.endAt > end) end = prev.endAt;
    }
    for (let i = index; i < st.queue.length; i++) {
      if (slotOf(st.queue[i]) !== slot) continue;
      end += TROOPS[st.queue[i].type].time * 1000;
      st.queue[i].endAt = end;
    }

    save();
    return { ok: true, refund: refund };
  }

  // Готовые юниты снимаем в любом порядке: параллельные ангары завершают
  // работу независимо, поэтому ждать queue[0] нельзя.
  function settleQueue(now) {
    if (!st.queue.length) return;

    const done = [];
    for (let i = st.queue.length - 1; i >= 0; i--) {
      if (st.queue[i].endAt <= now) done.push(st.queue.splice(i, 1)[0]);
    }
    if (!done.length) return;

    done.sort(function (a, b) { return a.endAt - b.endAt; });
    for (let i = 0; i < done.length; i++) {
      const e = done[i];
      st.army[e.type] = (st.army[e.type] || 0) + 1;
      st.trained = (st.trained | 0) + 1;
      addStat('trained', 1);
    }
  }

  // Информация для панели: active — юнит, который тренируется прямо сейчас
  // в своём ангаре; остальные ждут своей очереди в том же слоте.
  function queueInfo(now) {
    now = typeof now === 'number' ? now : Date.now();
    const slots = trainSlots();
    const first = {};

    for (let i = 0; i < st.queue.length; i++) {
      const s = slotOf(st.queue[i], slots);
      if (first[s] === undefined || st.queue[i].endAt < st.queue[first[s]].endAt) {
        first[s] = i;
      }
    }

    return st.queue.map(function (e, i) {
      const s = slotOf(e, slots);
      return {
        index: i,
        type: e.type,
        total: TROOPS[e.type].time,
        left: Math.max(0, (e.endAt - now) / 1000),
        slot: s,
        active: first[s] === i
      };
    });
  }

  // Сводка очереди для заголовка ангара: сколько тренируется одновременно
  // и сколько всего стоит в очереди.
  function queueStats(now) {
    now = typeof now === 'number' ? now : Date.now();
    const slots = trainSlots();
    const used = {};

    for (let i = 0; i < st.queue.length; i++) {
      if (st.queue[i].endAt <= now) continue;
      used[slotOf(st.queue[i], slots)] = 1;
    }

    return {
      slots: slots,
      training: Object.keys(used).length,
      queued: st.queue.length,
      space: queuedSpace(),
      capacity: capacity()
    };
  }

  function setArmy(map) {
    st.army = copyArmy(map);
  }

  // Снимок для боя: закрытые на текущем центре войска не высаживаем.
  // Старый сейв мог сохранить лазерщиков и дрона на TH1 — в бой они не идут.
  // all=true отдаёт полную армию: нужно баланс-симулятору уровней.
  function armySnapshot(all) {
    const th = townhallLevel();
    const out = copyArmy(st.army);
    if (all) return out;
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      const unlockAt = CC.troopUnlock ? CC.troopUnlock(t) : 1;
      if (unlockAt > th) out[t] = 0;
    }
    return out;
  }

  // После боя возвращаем только открытые типы: закрытые войска старого
  // сейва остаются в армии и не пропадают из-за одного выхода на карту.
  function setBattleArmy(map) {
    const th = townhallLevel();
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      const unlockAt = CC.troopUnlock ? CC.troopUnlock(t) : 1;
      if (unlockAt <= th) st.army[t] = Math.max(0, Math.floor(Number(map && map[t]) || 0));
    }
  }

  /* ---------- перенос постройки ---------- */

  // Перенос как в CoC: двигаем только превью, координаты в Base меняются
  // после moveConfirm(). Ошибки не трогают текущее превью.
  function moveInfo() {
    if (!move) return null;
    return {
      id: move.id,
      type: move.type,
      w: move.w,
      h: move.h,
      x0: move.x0,
      y0: move.y0,
      x: move.x,
      y: move.y,
      changed: move.x !== move.x0 || move.y !== move.y0
    };
  }

  function startMove(id) {
    const it = item(id);
    if (!it) return { error: 'Постройка не найдена' };

    if (move) moveCancel();

    const s = CC.Base.size(it.type);
    move = {
      id: id,
      type: it.type,
      w: s.w,
      h: s.h,
      x0: it.x,
      y0: it.y,
      x: it.x,
      y: it.y
    };
    CC.Base.setPreview(id, it.x, it.y);
    return { ok: true, move: moveInfo() };
  }

  function moveTo(x, y) {
    if (!move) return { error: 'Перенос не начат' };

    const nx = Math.round(Number(x));
    const ny = Math.round(Number(y));
    if (!isFinite(nx) || !isFinite(ny)) return { error: 'Мимо поля' };

    if (!CC.Base.fits(move.type, nx, ny, move.id)) {
      return { error: 'Здесь нельзя' };
    }

    move.x = nx;
    move.y = ny;
    CC.Base.setPreview(move.id, nx, ny);
    return { ok: true, move: moveInfo() };
  }

  function moveNudge(dx, dy) {
    if (!move) return { error: 'Перенос не начат' };
    return moveTo(move.x + (dx || 0), move.y + (dy || 0));
  }

  function moveConfirm() {
    if (!move) return { error: 'Перенос не начат' };

    const res = CC.Base.move(move.id, move.x, move.y);
    if (res.error) return res;

    CC.Base.clearPreview();
    move = null;
    return { ok: true };
  }

  function moveCancel() {
    const had = !!move;
    move = null;
    CC.Base.clearPreview();
    return { ok: true, had: had };
  }

  function isMoving() {
    return !!move;
  }

  function moveState() {
    return moveInfo();
  }

  /* ---------- задания ---------- */

  // Индекс активного шага цепочки: первый незакрытый квест. -1 — всё готово.
  function activeQuestIndex() {
    for (let i = 0; i < QUESTS.length; i++) {
      if (st.questsDone.indexOf(QUESTS[i].id) === -1) return i;
    }
    return -1;
  }

  function activeQuestDef() {
    const i = activeQuestIndex();
    return i < 0 ? null : QUESTS[i];
  }

  // Обучение активно, пока не пройдено и не пропущено. После последнего
  // шага Сержант уходит, но квесты остаются доступными в панели.
  function tutorialOn() {
    const t = st.tutorial;
    return !!t && !t.done && !t.skipped;
  }

  function questProgress(id) {
    const def = QUESTS.find(function (q) { return q.id === id; });
    if (!def) return { current: 0, target: 1 };

    if (def.place) {
      return { current: Math.min(1, count(def.place)), target: 1 };
    }

    const target = def.target || 1;
    if (id === 'train5') {
      // Засчитываем и завершённую тренировку, и уже стоящую в армии пятёрку:
      // так прогресс не теряется при загрузке старого сейва.
      const n = Math.max(st.trained | 0, st.army.barb | 0);
      return { current: Math.min(target, n), target: target };
    }
    if (id === 'battle') {
      return { current: st.battleStarted ? 1 : 0, target: 1 };
    }
    if (id === 'level1') {
      return { current: st.cleared.indexOf(0) === -1 ? 0 : 1, target: 1 };
    }
    if (id === 'th2') return { current: Math.min(2, townhallLevel()), target: 2 };
    if (id === 'cannon2') {
      const list = CC.Base.list();
      let lvl = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].type === 'cannon') lvl = Math.max(lvl, level(list[i].id));
      }
      return { current: Math.min(2, lvl), target: 2 };
    }
    return { current: 0, target: target };
  }

  // Бесплатная постановка только для здания текущего шага. Вызывается из
  // CC.Base.place(): {free, seconds} или null для обычной цены и времени.
  function tutorialPlace(type) {
    if (!tutorialOn()) return null;
    const def = activeQuestDef();
    if (!def || def.place !== type) return null;
    if (count(type) >= (def.target || 1)) return null;
    return { free: true, seconds: 5, type: type, id: def.id };
  }

  // Данные для панели Сержанта и подсказок. active=false — панель не нужна.
  function tutorialInfo() {
    const def = activeQuestDef();
    const t = st.tutorial || freshTutorial();
    const on = tutorialOn();
    if (!on || !def) {
      return {
        active: false, done: !!t.done, skipped: !!t.skipped,
        step: def ? QUESTS.length : QUESTS.length,
        total: QUESTS.length, id: null, text: '', action: '', lore: '', hint: '',
        place: null, goal: null, primary: ''
      };
    }
    const idx = QUESTS.indexOf(def);
    let primary = 'Поставить';
    if (def.place) primary = 'Поставить';
    else if (def.goal === 'train') primary = 'В ангар';
    else if (def.goal === 'battle' || def.goal === 'level1') primary = 'В бой';
    else if (def.goal === 'th2') primary = 'К центру';
    else if (def.goal === 'cannon2') primary = 'К турели';

    return {
      active: true,
      done: !!t.done,
      skipped: !!t.skipped,
      step: idx + 1,
      total: QUESTS.length,
      id: def.id,
      // Основной текст — живая реплика Сержанта, ниже — инструкция действия.
      text: def.lore || def.text,
      action: def.text,
      lore: def.lore || '',
      hint: def.hint || '',
      place: def.place || null,
      goal: def.goal || (def.place ? 'place' : null),
      primary: primary
    };
  }

  // Вступительный лор: 4 страницы только на новом сейве. Старый сейв
  // получает loreSeen=true при загрузке (см. load), поэтому active=false.
  function tutorialLore() {
    const t = st.tutorial || freshTutorial();
    const def = CC.SERGEANT || {};
    const pages = Array.isArray(def.lore) ? def.lore.slice() : [];
    return {
      active: tutorialOn() && !t.loreSeen && pages.length > 0,
      seen: !!t.loreSeen,
      name: def.name || 'Сержант',
      pages: pages
    };
  }

  // Закрыть вступительный лор (кнопка «Далее» на последней странице или
  // «Пропустить»). Обучение при этом остаётся активным.
  function readTutorialLore() {
    if (!st.tutorial) st.tutorial = freshTutorial();
    if (st.tutorial.loreSeen) return { ok: false, already: true };
    st.tutorial.loreSeen = true;
    save();
    return { ok: true };
  }

  // Пропуск обучения: снимаем бесплатные постановки, но квесты остаются
  // обычными. Даём 800/800 напрямую (лимитов ещё нет), чтобы игрок не
  // оказался без ресурсов и без складов. Повторный вызов безопасен.
  function skipTutorial() {
    if (!st.tutorial || st.tutorial.done || st.tutorial.skipped) {
      return { ok: false, already: true };
    }
    st.tutorial.skipped = true;
    st.tutorial.done = true;
    st.tutorial.loreSeen = true; // пропуск обучения лор не показывает
    st.gold = Math.max(st.gold, ECON.tutorialGold || 800);
    st.elixir = Math.max(st.elixir, ECON.tutorialElixir || 800);
    tutorialEvent = {
      type: 'skip',
      gold: ECON.tutorialGold || 800,
      elixir: ECON.tutorialElixir || 800
    };
    save();
    return { ok: true, gold: ECON.tutorialGold || 800,
      elixir: ECON.tutorialElixir || 800 };
  }

  // Первый груз после двух складов. Ждём, пока склады достроятся: иначе
  // credit() при нулевых лимитах сжёг бы ресурсы. Событие читает UI.
  function maybeTutorialCargo() {
    const t = st.tutorial;
    if (!t || t.cargo || t.done || t.skipped) return false;
    if (st.questsDone.indexOf('placeEstorage') === -1) return false;

    const gcap = cap('gold');
    const ecap = cap('elixir');
    if (gcap <= 0 || ecap <= 0) return false;

    const got = credit(ECON.tutorialGold || 800, ECON.tutorialElixir || 800);
    t.cargo = true;
    tutorialEvent = {
      type: 'cargo',
      gold: got.gold,
      elixir: got.elixir,
      lost: got.lost
    };
    save();
    return true;
  }

  // Разовый расход события обучения для тоста/диалога.
  function takeTutorialEvent() {
    const e = tutorialEvent;
    tutorialEvent = null;
    return e;
  }

  // Шаг «В бой»: запоминаем первый вход в бой, чтобы квест не откатился.
  function markBattleStarted() {
    if (st.battleStarted) return false;
    st.battleStarted = true;
    checkQuests();
    save();
    return true;
  }

  // Терминал открывают по-настоящему: отметка нужна для первого задания.
  function markShopOpened() {
    if (st.shopOpened) return false;
    st.shopOpened = true;
    checkQuests();
    save();
    return true;
  }

  function quests() {
    let activeFound = false;

    return QUESTS.map(function (def) {
      const done = st.questsDone.indexOf(def.id) !== -1;
      const active = !done && !activeFound;
      if (active) activeFound = true;

      const p = questProgress(def.id);
      const shown = Math.min(p.current, p.target);
      // Тренировка меняется каждым наймом — текст считаем на лету.
      const text = def.id === 'train5'
        ? 'Натренируй 5 штурмовиков: ' + shown + ' / ' + p.target
        : def.text;

      return {
        id: def.id,
        text: text,
        reward: def.reward || 0,
        gems: def.gems !== undefined ? def.gems : (GEMS.perQuest || 0),
        hint: def.hint || '',
        lore: def.lore || '',
        place: def.place || null,
        goal: def.goal || (def.place ? 'place' : null),
        done: done,
        active: active,
        progress: shown,
        target: p.target
      };
    });
  }

  // Награды выдаются один раз: факт выполнения хранится в st.questsDone.
  // Обучение даёт по 1 плате за шаг (GEMS.perQuest), руду не начисляет.
  function checkQuests() {
    let changed = false;

    for (let i = 0; i < QUESTS.length; i++) {
      const def = QUESTS[i];
      if (st.questsDone.indexOf(def.id) !== -1) continue;

      const p = questProgress(def.id);
      if (p.current < p.target) break; // задания идут строго по порядку

      st.questsDone.push(def.id);
      addXp(25);

      const gemReward = def.gems !== undefined ? def.gems : (GEMS.perQuest || 0);

      if (def.reward || gemReward) {
        const got = credit(def.reward || 0, 0);
        if (!questRewardEvent) questRewardEvent = { gold: 0, lost: 0, count: 0, gems: 0 };
        questRewardEvent.gold += got.gold;
        questRewardEvent.lost += got.lost.gold;
        questRewardEvent.gems += gemReward;
        questRewardEvent.count++;
        st.gems += gemReward;
      }

      changed = true;
    }

    // Обучение закончено, когда закрыт последний шаг. Первый груз ждёт
    // готовности обоих складов, поэтому проверяется на каждом тике.
    if (st.tutorial && !st.tutorial.done && activeQuestIndex() < 0) {
      st.tutorial.done = true;
      changed = true;
    }
    if (maybeTutorialCargo()) changed = true;

    if (changed) save();
  }

  // Разовый расход наградного события для интерфейса (тост).
  function takeQuestReward() {
    const e = questRewardEvent;
    questRewardEvent = null;
    return e;
  }

  function takeUpgradeDone() {
    const n = upgradeDoneEvent;
    upgradeDoneEvent = 0;
    return n;
  }

  /* ---------- оффлайн-итог ---------- */

  function offlineInfo() {
    if (!pendingOffline) return null;
    return {
      seconds: pendingOffline.seconds,
      awaySeconds: pendingOffline.awaySeconds || pendingOffline.seconds,
      gold: pendingOffline.gold,
      elixir: pendingOffline.elixir,
      storedGold: pendingOffline.storedGold || 0,
      storedElixir: pendingOffline.storedElixir || 0,
      capGold: pendingOffline.capGold || 0,
      capElixir: pendingOffline.capElixir || 0,
      lostGold: pendingOffline.lostGold || 0,
      lostElixir: pendingOffline.lostElixir || 0,
      capped: !!pendingOffline.capped
    };
  }

  function claimOffline() {
    const info = offlineInfo();
    pendingOffline = null;
    return info;
  }

  /* ---------- прогресс кампании ---------- */

  // Уровни проходятся по порядку: st.level — первый непройденный (прогресс),
  // st.cleared — список пройденных индексов. Выбранный для боя уровень
  // живёт отдельно в st.selected и прогресс не двигает.
  function currentLevel() {
    if (!LEVELS.length) return 0;
    const i = st.level | 0;
    if (i < 0) return 0;
    return i >= LEVELS.length ? LEVELS.length - 1 : i;
  }

  // Уровень, который откроется по «В БОЙ» и перезапуску. Старый сейв без
  // поля selected читает текущий прогресс.
  function selectedLevel() {
    if (!LEVELS.length) return 0;
    const i = Math.floor(num(st.selected, currentLevel()));
    if (!isFinite(i) || i < 0) return 0;
    return i >= LEVELS.length ? LEVELS.length - 1 : i;
  }

  // Вернуть выбор к прогрессу: следующий выход из боя начнёт новый уровень,
  // а не повтор предыдущего.
  function resetSelected() {
    const i = currentLevel();
    if (st.selected !== i) {
      st.selected = i;
      save();
    }
    return i;
  }

  function clearedLevels() {
    return st.cleared.slice();
  }

  // Лучшие звёзды по уровню (0..3). Сохраняются в сейве.
  function recordStars(index, stars) {
    const i = Math.floor(Number(index));
    const n = Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)));
    if (!(i >= 0 && i < LEVELS.length) || n <= 0) return { ok: false };

    const before = st.stars[i] | 0;
    if (n > before) {
      st.stars[i] = n;
      save();
      return { ok: true, stars: n, best: n, changed: true };
    }
    return { ok: true, stars: before, best: before, changed: false };
  }

  function levelStars(index) {
    return st.stars[index | 0] | 0;
  }

  /* ---------- разграбленные постройки уровней ---------- */

  // Карта «уже пусто» для уровня: key постройки → true. Пустая карта —
  // уровень ещё не трогали, все здания полные.
  function lootedMap(index) {
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < LEVELS.length)) return {};
    const src = st.looted && st.looted[i];
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const key in src) {
      if (src[key] === true) out[key] = true;
    }
    return out;
  }

  function isLooted(index, key) {
    if (!key) return false;
    return lootedMap(index)[key] === true;
  }

  // Запомнить, что конкретное здание уровня уже разграблено. Повторный
  // вызов безопасен; запись сразу уходит в сейв.
  function markLooted(index, key) {
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < LEVELS.length) || !key) return false;
    if (!st.looted || typeof st.looted !== 'object') st.looted = {};
    if (!st.looted[i] || typeof st.looted[i] !== 'object') st.looted[i] = {};
    if (st.looted[i][key] === true) return false;
    st.looted[i][key] = true;
    save();
    return true;
  }

  function clearLooted(index) {
    const i = Math.floor(Number(index));
    if (st.looted && st.looted[i]) {
      delete st.looted[i];
      save();
    }
  }

  function isLevelUnlocked(index) {
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < LEVELS.length)) return false;

    let maxCleared = -1;
    for (let k = 0; k < st.cleared.length; k++) {
      if (st.cleared[k] > maxCleared) maxCleared = st.cleared[k];
    }

    return i <= maxCleared + 1 || st.cleared.indexOf(i) !== -1;
  }

  // Выбор уровня для боя. Открытый уровень можно переиграть: меняется только
  // selected, прогресс st.level остаётся на первом непройденном.
  function selectLevel(index) {
    const i = Math.floor(Number(index));
    if (!isLevelUnlocked(i)) return { error: 'Уровень закрыт', locked: true };
    st.selected = i;
    save();
    return { ok: true, level: i, name: LEVELS[i] ? LEVELS[i].name : '' };
  }

  function isAllCleared() {
    return LEVELS.length > 0 && st.cleared.length >= LEVELS.length;
  }

  function completeLevel(index) {
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < LEVELS.length)) return { error: 'Неизвестный уровень' };

    let gemReward = 0;
    const firstClear = st.cleared.indexOf(i) === -1;

    if (firstClear) {
      st.cleared.push(i);
      gemReward = GEMS.perLevel || 0;
      st.gems += gemReward;
      addStat('levelsCleared', 1);
    }
    st.cleared.sort(function (a, b) { return a - b; });

    // Прогресс — это первый непройденный уровень, а не последний выбранный.
    // Реплей старого уровня и прохождение вразнобой не откатывают карту.
    let next = 0;
    while (next < LEVELS.length && st.cleared.indexOf(next) !== -1) next++;
    st.level = next >= LEVELS.length ? LEVELS.length - 1 : next;

    // Прошли выбранный уровень впервые — выбор идёт за прогрессом. Реплей
    // уже пройденного уровня (firstClear === false) выбор не трогает.
    if (firstClear && st.selected === i) st.selected = st.level;

    save();
    return {
      ok: true,
      level: currentLevel(),
      cleared: st.cleared.slice(),
      all: isAllCleared(),
      gems: gemReward
    };
  }

  /* ---------- опыт игрока и достижения ---------- */

  function xpForLevel(level) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    if (n <= 1) return 0;
    return Math.round(100 * Math.pow(n - 1, 1.4));
  }

  function levelAt(xp) {
    const v = Math.max(0, Number(xp) || 0);
    let n = 1;
    while (n < 10000 && v >= xpForLevel(n + 1)) n++;
    return n;
  }

  function playerLevel() {
    return levelAt(st.xp);
  }

  function xpToNext() {
    return xpForLevel(playerLevel() + 1);
  }

  function addXp(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (!add) return { ok: true, added: 0, level: playerLevel() };

    const before = playerLevel();
    st.xp += add;
    const after = playerLevel();
    if (after > before) levelUpEvent = after;

    return { ok: true, added: add, level: after, levelUp: after > before };
  }

  function takeLevelUp() {
    const n = levelUpEvent;
    levelUpEvent = 0;
    return n;
  }

  function addStat(key, amount) {
    if (!key) return;
    const add = Math.max(0, Number(amount) || 0);
    st.stats[key] = (st.stats[key] | 0) + add;
  }

  function achievementDef(id) {
    for (let i = 0; i < ACHS.length; i++) {
      if (ACHS[i].id === id) return ACHS[i];
    }
    return null;
  }

  function achievements() {
    let total = 0;
    let claimed = 0;

    const list = ACHS.map(function (def) {
      const tiers = def.tiers || [];
      const done = st.achClaimed[def.id] || [];
      total += tiers.length;
      claimed += done.length;

      const stat = st.stats[def.stat] | 0;
      let idx = 0;
      while (idx < tiers.length && done.indexOf(idx) !== -1) idx++;
      const complete = idx >= tiers.length;
      const target = complete ? tiers[tiers.length - 1] : tiers[idx];
      const gems = complete
        ? (def.gems[def.gems.length - 1] || 0)
        : (def.gems[idx] || 0);
      const progress = complete ? target : Math.min(stat, target);

      return {
        id: def.id,
        name: def.name,
        desc: def.desc,
        progress: progress,
        target: target,
        tier: Math.min(idx + 1, tiers.length),
        tiers: tiers.length,
        gems: gems,
        claimed: complete,
        complete: complete,
        ready: !complete && stat >= target,
        claimedCount: done.length
      };
    });

    return { list: list, claimed: claimed, total: total };
  }

  function claimAchievement(id) {
    const def = achievementDef(id);
    if (!def) return { error: 'Неизвестное достижение' };

    const tiers = def.tiers || [];
    const done = st.achClaimed[id] || [];
    let idx = 0;
    while (idx < tiers.length && done.indexOf(idx) !== -1) idx++;
    if (idx >= tiers.length) return { error: 'Все ступени уже забраны' };

    const stat = st.stats[def.stat] | 0;
    if (stat < tiers[idx]) return { error: 'Ступень ещё не открыта' };

    const gems = def.gems[idx] || 0;
    done.push(idx);
    st.achClaimed[id] = done;
    st.gems += gems;
    addXp(50);
    save();

    return { ok: true, id: id, gems: gems, gemsTotal: gemsNow(), level: playerLevel() };
  }

  /* ---------- сохранение ---------- */

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1,
        gold: st.gold,
        elixir: st.elixir,
        gems: st.gems,
        xp: st.xp,
        stats: st.stats,
        achClaimed: st.achClaimed,
        army: st.army,
        extract: st.extract,
        queue: st.queue,
        trained: st.trained,
        shopOpened: st.shopOpened,
        questsDone: st.questsDone,
        tutorial: st.tutorial,
        battleStarted: !!st.battleStarted,
        levels: st.levels,
        upgrades: st.upgrades,
        builds: st.builds,
        troopLevels: st.troopLevels,
        troopUp: st.troopUp,
        heroLevel: st.heroLevel,
        heroUp: st.heroUp,
        builders: st.builders,
        level: st.level,
        selected: st.selected,
        cleared: st.cleared,
        stars: st.stars,
        looted: st.looted,
        raids: st.raids,
        lastRaid: st.lastRaid,
        pendingRaid: st.pendingRaid,
        raidTruceUntil: st.raidTruceUntil,
        daily: st.daily,
        lastSeen: st.lastSeen,
        estorageMigrated: !!st.estorageMigrated,
        pvp: st.pvp
      }));
    } catch (e) {
      /* приватный режим — играем без сохранения */
    }
  }

  function num(v, def) {
    const n = Number(v);
    return isFinite(n) ? n : def;
  }

  // Прогресс разграбления: только существующие уровни, только true,
  // только разумные по длине ключи. Старый сейв без поля — пустая карта.
  function sanitizeLooted(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const levelKey in src) {
      const i = Math.floor(num(levelKey, -1));
      if (i < 0 || i >= LEVELS.length) continue;
      const row = src[levelKey];
      if (!row || typeof row !== 'object') continue;
      const clean = {};
      let n = 0;
      for (const key in row) {
        if (row[key] !== true) continue;
        if (typeof key !== 'string' || key.length > 64) continue;
        clean[key] = true;
        n++;
        if (n >= 500) break;
      }
      out[i] = clean;
    }
    return out;
  }

  // Разграбление призраков: ghostId → набор ключей построек. Старый сейв
  // без поля получает пустую карту, битые записи отбрасываются.
  function sanitizePvpLooted(src) {
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

  // Лог высадки в записи повтора: время, тип и клетка. Битые строки
  // отбрасываем, чтобы старый/испорченный сейв не ломал просмотр.
  function sanitizeRaidLog(src) {
    const out = [];
    if (!Array.isArray(src)) return out;
    for (let i = 0; i < src.length && out.length < 240; i++) {
      const e = src[i];
      if (!e || typeof e !== 'object') continue;
      const type = e.type;
      if (!TROOPS[type]) continue;
      const x = Math.floor(num(e.x, -1));
      const y = Math.floor(num(e.y, -1));
      if (x < 0 || y < 0 || x >= CC.GRID || y >= CC.GRID) continue;
      const t = Math.max(0, num(e.t, 0));
      out.push({ t: t, type: type, x: x, y: y });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  // История набегов: последние 5, новые первыми. Поля нормализуем, чтобы
  // старый сейв без истории читался как «на базу пока не нападали».
  function sanitizeRaids(src) {
    const out = [];
    if (!Array.isArray(src)) return out;
    for (let i = 0; i < src.length && out.length < 5; i++) {
      const r = src[i];
      if (!r || typeof r !== 'object') continue;
      const loot = r.loot && typeof r.loot === 'object' ? r.loot : {};
      out.push({
        at: Math.max(0, num(r.at, 0)),
        attacker: typeof r.attacker === 'string'
          ? r.attacker.slice(0, 60) : 'Неизвестный отряд',
        percent: Math.max(0, Math.min(100, Math.floor(num(r.percent, 0)))),
        stars: Math.max(0, Math.min(3, Math.floor(num(r.stars, 0)))),
        loot: {
          gold: Math.max(0, Math.floor(num(loot.gold, 0))),
          elixir: Math.max(0, Math.floor(num(loot.elixir, 0)))
        },
        log: sanitizeRaidLog(r.log),
        army: copyArmy(r.army)
      });
    }
    return out;
  }

  // Уровень центра по данным сейва. normalize() выполняется до подмены st,
  // поэтому townhallLevel() здесь читал бы старое состояние.
  function townhallFromSave(d) {
    const list = CC.Base && CC.Base.list ? CC.Base.list() : [];
    const levels = d && d.levels && typeof d.levels === 'object' ? d.levels : {};
    let th = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== 'townhall') continue;
      const l = Math.floor(num(levels[list[i].id], 1));
      if (l > th) th = l;
    }
    return th || 1;
  }

  function normalize(d) {
    const s = fresh();

    s.gold = Math.max(0, num(d.gold, ECON.startGold));
    s.elixir = Math.max(0, num(d.elixir, ECON.startElixir));
    // старый сейв без платины получает стартовый запас
    s.gems = Math.max(0, Math.floor(num(d.gems, GEMS.start)));
    s.xp = Math.max(0, Math.floor(num(d.xp, 0)));

    if (d.stats && typeof d.stats === 'object') {
      for (const key in s.stats) {
        s.stats[key] = Math.max(0, Math.floor(num(d.stats[key], 0)));
      }
    }

    if (d.achClaimed && typeof d.achClaimed === 'object') {
      for (const id in d.achClaimed) {
        const def = achievementDef(id);
        if (!def || !Array.isArray(d.achClaimed[id])) continue;
        const tiers = def.tiers || [];
        const list = [];
        for (let i = 0; i < d.achClaimed[id].length; i++) {
          const idx = Math.floor(num(d.achClaimed[id][i], -1));
          if (idx >= 0 && idx < tiers.length && list.indexOf(idx) === -1) {
            list.push(idx);
          }
        }
        s.achClaimed[id] = list;
      }
    }
    s.lastSeen = num(d.lastSeen, Date.now());
    s.estorageMigrated = d.estorageMigrated === true || d.estorageMigrated === 1;
    s.builders = Math.min(BUILD.max, Math.max(1, Math.floor(num(d.builders, BUILD.start))));

    if (d.army && typeof d.army === 'object') {
      const src = Object.assign({}, d.army);
      // Миграция старого воздушного шара в дрон-бомбардировщик без потери количества.
      if (src.balloon) {
        src.airship = (src.airship | 0) + (src.balloon | 0);
        delete src.balloon;
      }
      s.army = copyArmy(src);
    }

    // Накопители буров/реакторов. Старый сейв без ключа читается как пустой;
    // лишние id и переполнение подрежем после загрузки базы (sanitizeExtract).
    if (d.extract && typeof d.extract === 'object') {
      for (const id in d.extract) {
        const n = num(d.extract[id], 0);
        if (n > 0) s.extract[id] = n;
      }
    }

    if (d.levels && typeof d.levels === 'object') {
      for (const id in d.levels) {
        const l = Math.floor(num(d.levels[id], 0));
        if (l >= 1) s.levels[id] = Math.min(l, ECON.maxLevel);
      }
    }

    if (d.upgrades && typeof d.upgrades === 'object') {
      for (const id in d.upgrades) {
        const u = d.upgrades[id];
        if (!u || !isFinite(Number(u.endAt))) continue;
        s.upgrades[id] = {
          to: Math.max(1, Math.floor(num(u.to, 1))),
          startedAt: num(u.startedAt, 0),
          endAt: Number(u.endAt),
          time: Math.max(0, num(u.time, 0))
        };
      }
    }

    // Стройки новых построек. Старый сейв без builds — всё уже построено.
    if (d.builds && typeof d.builds === 'object') {
      for (const id in d.builds) {
        const b = d.builds[id];
        if (!b || !isFinite(Number(b.endAt))) continue;
        s.builds[id] = {
          startedAt: num(b.startedAt, 0),
          endAt: Number(b.endAt),
          time: Math.max(0, num(b.time, 0))
        };
      }
    }

    // Уровни войск: старый сейв без поля остаётся на 1. Битые значения
    // подрезаем по общему максимуму, потолок по TH проверит load().
    s.troopLevels = freshTroopLevels();
    if (d.troopLevels && typeof d.troopLevels === 'object') {
      const maxAll = TROOP_LVL.max || 10;
      for (const type in d.troopLevels) {
        if (!Object.prototype.hasOwnProperty.call(TROOPS, type)) continue;
        const l = Math.floor(num(d.troopLevels[type], 1));
        s.troopLevels[type] = l < 1 ? 1 : (l > maxAll ? maxAll : l);
      }
    }

    // Текущее исследование: тип и абсолютный endAt, как у апгрейдов построек.
    if (d.troopUp && typeof d.troopUp === 'object' &&
        Object.prototype.hasOwnProperty.call(TROOPS, d.troopUp.type) &&
        isFinite(Number(d.troopUp.endAt))) {
      s.troopUp = {
        type: d.troopUp.type,
        to: Math.max(2, Math.min(TROOP_LVL.max || 10,
          Math.floor(num(d.troopUp.to, 2)))),
        startedAt: num(d.troopUp.startedAt, 0),
        endAt: Number(d.troopUp.endAt),
        time: Math.max(0, num(d.troopUp.time, 0))
      };
    }

    // Герой: старый сейв TH5+ открывает его на 1 уровне, TH ниже 5 — 0.
    // Потолок всегда по уровню центра; битые значения подрезаем.
    const heroTh = townhallFromSave(d);
    const heroMax = heroTh >= (HERO.minTh || 5)
      ? Math.min(HERO.maxLevel || 10, heroTh)
      : 0;
    let heroLvl = Math.floor(num(d.heroLevel, 0));
    if (heroMax <= 0) heroLvl = 0;
    else if (!(heroLvl >= 1)) heroLvl = 1;
    else if (heroLvl > heroMax) heroLvl = heroMax;
    s.heroLevel = heroLvl;

    // Идущая прокачка героя: отдельный слот, абсолютный endAt.
    if (heroLvl >= 1 && d.heroUp && typeof d.heroUp === 'object' &&
        isFinite(Number(d.heroUp.endAt))) {
      s.heroUp = {
        to: Math.max(2, Math.min(HERO.maxLevel || 10,
          Math.floor(num(d.heroUp.to, 2)))),
        startedAt: num(d.heroUp.startedAt, 0),
        endAt: Number(d.heroUp.endAt),
        time: Math.max(0, num(d.heroUp.time, 0))
      };
    }

    if (Array.isArray(d.queue)) {
      for (let i = 0; i < d.queue.length; i++) {
        const e = d.queue[i];
        if (!e || !isFinite(Number(e.endAt))) continue;
        const type = e.type === 'balloon' ? 'airship' : e.type;
        if (!TROOPS[type]) continue;
        const rec = { type: type, endAt: Number(e.endAt) };
        // Новые сейвы помнят ангар. У старых поле отсутствует — такой
        // юнит безопасно встаёт в первый слот (slotOf вернёт 0).
        const slot = Math.floor(Number(e.slot));
        if (isFinite(slot) && slot >= 0) rec.slot = slot;
        s.queue.push(rec);
      }
    }

    s.trained = Math.max(0, Math.floor(num(d.trained, 0)));
    s.shopOpened = !!d.shopOpened;
    s.battleStarted = d.battleStarted === true || d.battleStarted === 1;

    // Обучение: новый сейв без поля — старый игрок, обучение не показываем.
    // Явное поле читаем как есть, чтобы пропуск и завершение сохранялись.
    if (d.tutorial && typeof d.tutorial === 'object') {
      s.tutorial = {
        done: d.tutorial.done === true || d.tutorial.done === 1,
        skipped: d.tutorial.skipped === true || d.tutorial.skipped === 1,
        cargo: d.tutorial.cargo === true || d.tutorial.cargo === 1,
        // Старые сейвы поля не знают: лор им уже не показываем.
        loreSeen: d.tutorial.loreSeen === undefined
          ? true
          : d.tutorial.loreSeen === true || d.tutorial.loreSeen === 1
      };
    } else {
      s.tutorial.done = true;
      s.tutorial.loreSeen = true;
    }

    if (Array.isArray(d.questsDone)) {
      for (let i = 0; i < d.questsDone.length; i++) {
        const id = d.questsDone[i];
        if (typeof id !== 'string' || id.length > 32) continue;
        if (s.questsDone.indexOf(id) !== -1) continue;
        // Старые id (train, place) больше не шаги цепочки, но факт их
        // выполнения сохраняем: сейв не должен «сбрасывать» прогресс.
        s.questsDone.push(id);
      }
    }
    // Миграция старых квестов в выполненные шаги новой цепочки.
    for (const oldId in QUEST_MIGRATION) {
      if (s.questsDone.indexOf(oldId) === -1) continue;
      const next = QUEST_MIGRATION[oldId];
      if (s.questsDone.indexOf(next) === -1) s.questsDone.push(next);
    }

    if (LEVELS.length) {
      const lvl = Math.floor(num(d.level, 0));
      s.level = lvl < 0 ? 0 : (lvl >= LEVELS.length ? LEVELS.length - 1 : lvl);
      // Старый сейв без selected: выбран текущий прогресс, а не нулевой
      // уровень — иначе «В БОЙ» откатил бы игрока в начало.
      const sel = Math.floor(num(d.selected, s.level));
      s.selected = sel < 0 ? 0 : (sel >= LEVELS.length ? LEVELS.length - 1 : sel);
    }

    if (Array.isArray(d.cleared)) {
      const seen = {};
      for (let i = 0; i < d.cleared.length; i++) {
        const n = Math.floor(num(d.cleared[i], -1));
        if (n < 0 || n >= LEVELS.length || seen[n]) continue;
        seen[n] = 1;
        s.cleared.push(n);
      }
      s.cleared.sort(function (a, b) { return a - b; });
    }

    if (d.stars && typeof d.stars === 'object') {
      for (const key in d.stars) {
        const i = Math.floor(num(key, -1));
        const n = Math.floor(num(d.stars[key], 0));
        if (i < 0 || i >= LEVELS.length || n <= 0) continue;
        s.stars[i] = Math.min(3, n);
      }
    }

    // Добыча по постройкам и история набегов. Старый сейв без полей
    // получает пустые значения: все здания полные, повторов ещё нет.
    s.looted = sanitizeLooted(d.looted);
    s.raids = sanitizeRaids(d.raids);

    s.lastRaid = num(d.lastRaid, Date.now());

    if (d.pendingRaid && typeof d.pendingRaid === 'object') {
      const p = d.pendingRaid;
      const stolen = p.stolen && typeof p.stolen === 'object' ? p.stolen : {};
      const storages = p.storages && typeof p.storages === 'object' ? p.storages : {};
      function packStorage(v) {
        const o = v && typeof v === 'object' ? v : {};
        return {
          total: Math.max(0, Math.floor(num(o.total, 0))),
          destroyed: Math.max(0, Math.floor(num(o.destroyed, 0)))
        };
      }
      s.pendingRaid = {
        at: num(p.at, Date.now()),
        percent: Math.max(0, Math.min(100, Math.floor(num(p.percent, 0)))),
        thDead: !!p.thDead,
        thLevel: Math.max(1, Math.floor(num(p.thLevel, 1))),
        stolen: {
          gold: Math.max(0, Math.floor(num(stolen.gold, 0))),
          elixir: Math.max(0, Math.floor(num(stolen.elixir, 0)))
        },
        // Старый сейв без разбивки складов читается как «данных нет»:
        // ресурсы в stolen уже фактические, окно не падает.
        storages: {
          gold: packStorage(storages.gold),
          elixir: packStorage(storages.elixir)
        }
      };
    }

    // PvP из старого сейва: поля нет — остаются дефолты из fresh().
    if (d.pvp && typeof d.pvp === 'object') {
      const p = d.pvp;
      s.pvp.rating = Math.max(0, Math.floor(num(p.rating, s.pvp.rating)));
      s.pvp.wins = Math.max(0, Math.floor(num(p.wins, 0)));
      s.pvp.losses = Math.max(0, Math.floor(num(p.losses, 0)));
      s.pvp.poolSeed = Math.max(0, Math.floor(num(p.poolSeed, 0))) >>> 0;
      s.pvp.search = Math.max(0, Math.floor(num(p.search, 0)));
      s.pvp.looted = sanitizePvpLooted(p.looted);

      if (Array.isArray(p.attacked)) {
        const seen = {};
        for (let i = 0; i < p.attacked.length && s.pvp.attacked.length < 12; i++) {
          const id = p.attacked[i];
          if (typeof id !== 'string' || id.length > 40 || seen[id]) continue;
          seen[id] = 1;
          s.pvp.attacked.push(id);
        }
      }
    }

    // Перемирие: старый сейв без поля живёт без передышки. Значение из
    // будущего дальше максимального срока (8 ч) считаем испорченным.
    const truceMax = Date.now() + (TRUCE.thMs || 8 * 3600 * 1000);
    s.raidTruceUntil = Math.min(truceMax,
      Math.max(0, num(d.raidTruceUntil, 0)));

    // Ежедневный контракт: старый сейв получает дефолты fresh().
    if (d.daily && typeof d.daily === 'object') {
      const src = d.daily;
      const cfg = dailyCfg();
      s.daily = {
        progress: Math.max(0, Math.min(cfg.stars,
          Math.floor(num(src.progress, 0)))),
        bank: Math.max(0, Math.min(cfg.maxStack,
          Math.floor(num(src.bank, 0)))),
        dayStart: Math.max(0, num(src.dayStart, Date.now())),
        claimed: Math.max(0, Math.floor(num(src.claimed, 0))),
        starsTotal: Math.max(0, Math.floor(num(src.starsTotal, 0)))
      };
    }

    return s;
  }

  // Миграция старого сейва: если ангары нет, ставим одну на свободную
  // клетку. Иначе выданная стартовая армия не влезает в лимит (0 мест).
  // Ангар из миграции сразу готов: иначе у игрока 0 мест и Нужен ангар.
  function ensureBarracks() {
    if (CC.Base.count('barracks') > 0) return true;

    for (let y = 0; y < CC.GRID; y++) {
      for (let x = 0; x < CC.GRID; x++) {
        if (!CC.Base.fits('barracks', x, y)) continue;
        // Готовая постройка без цены и таймера: миграция не должна
        // упираться в нулевые лимиты и списывать ресурсы ветерана.
        const it = CC.Base.insert('barracks', x, y);
        if (!it) continue;
        if (st.builds && st.builds[it.id]) delete st.builds[it.id];
        return true;
      }
    }
    return false;
  }

  // Свободные клетки по периметру склада, начиная с ближайших.
  function spotsNear(anchor) {
    const s = CC.Base.size(anchor.type);
    const out = [];

    for (let y = anchor.y - 1; y <= anchor.y + s.h; y++) {
      for (let x = anchor.x - 1; x <= anchor.x + s.w; x++) {
        const inside = x >= anchor.x && x < anchor.x + s.w &&
          y >= anchor.y && y < anchor.y + s.h;
        if (inside) continue;
        if (!CC.Base.fits('estorage', x, y)) continue;
        out.push({
          x: x, y: y,
          d: Math.hypot(x + 0.5 - (anchor.x + s.w / 2),
            y + 0.5 - (anchor.y + s.h / 2))
        });
      }
    }

    out.sort(function (a, b) {
      if (a.d !== b.d) return a.d - b.d;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    return out;
  }

  /* Старый сейв хранил один общий склад. Теперь storage — только руда,
     поэтому при загрузке добавляем склад энергии рядом с самым прокачанным
     старым складом (или в любое свободное место). Уровень нового склада
     равен максимальному уровню старых. Ресурсы не трогаем. Если места нет,
     ничего не ломаем: лимит энергии останется 0, игрок поставит склад сам. */
  function ensureEnergyStorage() {
    if (CC.Base.count('estorage') > 0) {
      if (!st.estorageMigrated) {
        st.estorageMigrated = true;
        save();
      }
      return false;
    }
    // Уже мигрировали: игрок сам снёс склад энергии — заново не выдаём.
    if (st.estorageMigrated) return false;

    const stores = CC.Base.list().filter(function (b) {
      return b.type === 'storage';
    });
    if (!stores.length) return false;

    let anchor = stores[0];
    let lvl = 1;
    for (let i = 0; i < stores.length; i++) {
      const l = level(stores[i].id);
      if (l > lvl) lvl = l;
      if (l > level(anchor.id)) anchor = stores[i];
    }
    lvl = lvl > ECON.maxLevel ? ECON.maxLevel : lvl;

    let spot = spotsNear(anchor)[0] || null;
    if (!spot) {
      // Рядом тесно — ищем любую свободную клетку на поле.
      for (let y = 0; y < CC.GRID && !spot; y++) {
        for (let x = 0; x < CC.GRID; x++) {
          if (CC.Base.fits('estorage', x, y)) { spot = { x: x, y: y }; break; }
        }
      }
    }

    if (!spot) {
      noEstorageEvent = true;
      return false;
    }

    const it = CC.Base.insert('estorage', spot.x, spot.y);
    if (!it) {
      noEstorageEvent = true;
      return false;
    }

    st.levels[it.id] = lvl;
    if (st.builds && st.builds[it.id]) delete st.builds[it.id];
    st.estorageMigrated = true;
    invalidateCaps();
    save();
    return true;
  }

  // UI спрашивает один раз: показать тост «нет места под склад энергии».
  function takeEstorageHint() {
    const v = noEstorageEvent;
    noEstorageEvent = false;
    return v;
  }

  // Чистим накопители после загрузки базы: буфер остаётся только у живых
  // буров/реакторов, значение обрезается по текущей ёмкости уровня.
  function sanitizeExtract() {
    const out = {};
    if (!st.extract || typeof st.extract !== 'object') {
      st.extract = out;
      return;
    }

    const list = CC.Base.list();
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!CC.PRODUCTION[it.type]) continue;
      const n = Number(st.extract[it.id]);
      if (!isFinite(n) || n <= 0) continue;
      const capBuf = extractCapOf(it);
      out[it.id] = Math.min(n, capBuf);
    }

    st.extract = out;
  }

  // Стройки только для реально существующих построек. Старый сейв без
  // builds уже прочитан как пустой объект и считается «всё построено».
  function sanitizeBuilds() {
    const out = {};
    if (!st.builds || typeof st.builds !== 'object') {
      st.builds = out;
      return;
    }

    const list = CC.Base.list();
    for (let i = 0; i < list.length; i++) {
      const b = st.builds[list[i].id];
      if (!b || !isFinite(Number(b.endAt))) continue;
      out[list[i].id] = {
        startedAt: num(b.startedAt, 0),
        endAt: Number(b.endAt),
        time: Math.max(0, num(b.time, 0))
      };
    }

    st.builds = out;
  }

  function load(now) {
    now = typeof now === 'number' ? now : Date.now();

    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      raw = null;
    }

    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
    }

    // Нет сейва деревни — это либо первый запуск, либо старый сейв только
    // с раскладкой. База уже загружена CC.Base.load(), её не трогаем,
    // а армию и стартовые ресурсы выдаём как новичку.
    const migrating = !(data && typeof data === 'object');
    st = migrating ? fresh() : normalize(data);

    // Новичок (в том числе сейв только с раскладкой-центром) проходит
    // обучение. Старая раскладка с постройками — ветеран: обучение не
    // показываем, квесты не сбрасываем.
    const onlyCenter = CC.Base.list().length === 1 &&
      CC.Base.list()[0] && CC.Base.list()[0].type === 'townhall';
    if (migrating) st.tutorial.done = !onlyCenter;
    // Старая раскладка без сейва деревни: сохраняем прежний стартовый запас
    // и отряд, иначе ветеран остался бы без ресурсов и армии.
    if (migrating && !onlyCenter) {
      st.gold = Math.max(st.gold, ECON.startLegacyGold || 800);
      st.elixir = Math.max(st.elixir, ECON.startLegacyElixir || 800);
      if (!st.army.barb) st.army.barb = 12;
      // У такой раскладки нет сейва квестов: не запускаем обучение заново
      // и не выдаём награды за уже стоящие здания.
      st.questsDone = QUESTS.map(function (q) { return q.id; });
    }

    // Герой всегда согласован с текущим центром: на TH5+ он есть,
    // ниже — закрыт. Это же правило чинит сейв, где TH снесли/подняли.
    const heroMaxLoad = heroMaxLevel();
    if (heroMaxLoad <= 0) st.heroLevel = 0;
    else if (!(st.heroLevel >= 1)) st.heroLevel = 1;
    else if (st.heroLevel > heroMaxLoad) st.heroLevel = heroMaxLoad;

    // Старому сейву без ангара добавляем её, чтобы армии было где жить.
    // Новый старт (только центр) не трогаем: ангар выдаёт обучение.
    if (migrating && !onlyCenter && !ensureBarracks()) st.army = copyArmy({});

    // Общий склад старого сейва стал складом руды: энергию хранить негде,
    // поэтому без estorage лимит энергии был бы 0. Ставим второй склад
    // бесплатно, с уровнем самого прокачанного старого склада.
    const addedEstorage = ensureEnergyStorage();

    moveCancel();
    invalidateCaps();
    // Накопители: только живые буры/реакторы и не больше текущей ёмкости.
    sanitizeExtract();
    sanitizeBuilds();
    // старый сейв деревни мог сохранить ресурсы выше лимита — подрезаем.
    // При миграции старой раскладки стартовые ресурсы не трогаем.
    // Нулевой лимит не обнуляет ресурсы: их нельзя терять, игрок сам
    // поставит недостающий склад. В загрузке с миграцией склада ресурсы
    // тоже не режем: игрок не должен терять энергию из-за смены модели.
    if (!migrating && !addedEstorage) {
      const gcap = cap('gold');
      const ecap = cap('elixir');
      if (gcap > 0) st.gold = Math.min(st.gold, gcap);
      if (ecap > 0) st.elixir = Math.min(st.elixir, ecap);
    }

    pendingOffline = null;
    const off = tick(now);
    const buffered = bufferTotals();
    if (off.seconds >= 60 &&
        (off.gold > 0 || off.elixir > 0 || off.capped ||
         buffered.gold > 0 || buffered.elixir > 0)) {
      pendingOffline = {
        seconds: Math.floor(off.seconds),
        awaySeconds: Math.floor(off.awaySeconds || off.seconds),
        gold: Math.floor(off.gold),
        elixir: Math.floor(off.elixir),
        storedGold: Math.floor(buffered.gold),
        storedElixir: Math.floor(buffered.elixir),
        capGold: Math.floor(buffered.capGold || 0),
        capElixir: Math.floor(buffered.capElixir || 0),
        lostGold: Math.floor(off.lostGold),
        lostElixir: Math.floor(off.lostElixir),
        capped: !!off.capped
      };
    }

    return st;
  }

  function reset() {
    moveCancel();
    st = fresh();
    st.lastSeen = Date.now();
    pendingOffline = null;
    questRewardEvent = null;
    tutorialEvent = null;
    levelUpEvent = 0;
    upgradeDoneEvent = 0;
    buildDoneEvent = [];
    dailyDoneEvent = 0;
    troopDoneEvent = null;
    heroDoneEvent = null;
    invalidateCaps();
    save();
  }

  // Постройку убрали — забываем её уровень, незаконченный апгрейд и накопитель.
  function forget(id) {
    if (move && move.id === id) moveCancel();
    if (st.levels[id] !== undefined) delete st.levels[id];
    if (st.upgrades[id]) delete st.upgrades[id];
    if (st.builds && st.builds[id] !== undefined) delete st.builds[id];
    if (st.extract && st.extract[id] !== undefined) delete st.extract[id];
    invalidateCaps();
    save();
  }

  /* ---------- тик ---------- */

  function tick(now) {
    now = typeof now === 'number' ? now : Date.now();

    let dt = (now - st.lastSeen) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0;
    const away = dt;
    if (dt > ECON.offlineCap) dt = ECON.offlineCap;

    st.lastSeen = now;
    const gained = accrue(dt);
    settleUpgrades(now);
    settleBuilds(now);
    settleTroops(now);
    settleHero(now);
    settleQueue(now);
    settleDaily(now);
    checkQuests();

    return {
      seconds: dt,
      awaySeconds: away,
      gold: gained.gold,
      elixir: gained.elixir,
      lostGold: gained.lostGold,
      lostElixir: gained.lostElixir,
      capped: gained.capped
    };
  }

  function addLoot(loot) {
    if (!loot) {
      return {
        gold: 0, elixir: 0,
        offered: { gold: 0, elixir: 0 },
        lost: { gold: 0, elixir: 0 }
      };
    }

    const g = Math.max(0, Math.floor(num(loot.gold, 0)));
    const e = Math.max(0, Math.floor(num(loot.elixir, 0)));
    const got = credit(g, e);

    return {
      gold: got.gold,
      elixir: got.elixir,
      offered: { gold: g, elixir: e },
      lost: got.lost
    };
  }

  return {
    get state() { return st; },
    load: load,
    save: save,
    reset: reset,
    forget: forget,
    tick: tick,
    level: level,
    maxLevel: maxLevel,
    townhallLevel: townhallLevel,
    needThFor: needThFor,
    canBuild: canBuild,
    placeTime: placeTimeOf,
    stats: stats,
    produceAt: produceAt,
    rate: rate,
    cap: cap,
    collect: collect,
    collectAll: collectAll,
    extract: extractInfo,
    extractors: extractors,
    bufferTotals: bufferTotals,
    upgradeCost: upgradeCost,
    canUpgrade: canUpgrade,
    startUpgrade: startUpgrade,
    upgradeInfo: upgradeInfo,
    isUpgrading: busy,
    isBuilding: isBuilding,
    buildInfo: buildInfo,
    startBuild: startBuild,
    buildSpeedCost: buildSpeedCost,
    speedUpBuild: speedUpBuild,
    takeBuildDone: takeBuildDone,
    // прокачка войск
    troopLevel: troopLevel,
    troopMaxLevel: troopMaxLevel,
    troopUpgradeCost: troopUpgradeCost,
    canUpgradeTroop: canUpgradeTroop,
    startTroopUpgrade: startTroopUpgrade,
    troopUpInfo: troopUpInfo,
    troopSpeedCost: troopSpeedCost,
    speedUpTroop: speedUpTroop,
    troopMultiplier: troopMultiplier,
    troopStats: troopStats,
    takeTroopDone: takeTroopDone,
    // герой
    heroLevel: heroLevel,
    heroMaxLevel: heroMaxLevel,
    heroUpgradeCost: heroUpgradeCost,
    canUpgradeHero: canUpgradeHero,
    startHeroUpgrade: startHeroUpgrade,
    heroUpInfo: heroUpInfo,
    heroSpeedCost: heroSpeedCost,
    speedUpHero: speedUpHero,
    heroStats: heroStats,
    takeHeroDone: takeHeroDone,
    builders: builders,
    hireBuilder: hireBuilder,
    capacity: capacity,
    armyUsed: armyUsed,
    queuedSpace: queuedSpace,
    queueSlots: queueSlots,
    trainSlots: trainSlots,
    queueStats: queueStats,
    canTrain: canTrain,
    train: train,
    batchFit: batchFit,
    trainBatch: trainBatch,
    cancelTrain: cancelTrain,
    queueInfo: queueInfo,
    setArmy: setArmy,
    setBattleArmy: setBattleArmy,
    armySnapshot: armySnapshot,
    startMove: startMove,
    moveTo: moveTo,
    moveNudge: moveNudge,
    moveConfirm: moveConfirm,
    moveCancel: moveCancel,
    isMoving: isMoving,
    moveState: moveState,
    addLoot: addLoot,
    isFull: isFull,
    invalidateCaps: invalidateCaps,
    quests: quests,
    tutorial: tutorialInfo,
    tutorialLore: tutorialLore,
    readTutorialLore: readTutorialLore,
    tutorialPlace: tutorialPlace,
    skipTutorial: skipTutorial,
    takeTutorialEvent: takeTutorialEvent,
    markBattleStarted: markBattleStarted,
    xpForLevel: xpForLevel,
    levelAt: levelAt,
    playerLevel: playerLevel,
    xpToNext: xpToNext,
    addXp: addXp,
    takeLevelUp: takeLevelUp,
    addStat: addStat,
    achievements: achievements,
    claimAchievement: claimAchievement,
    checkQuests: checkQuests,
    markShopOpened: markShopOpened,
    takeQuestReward: takeQuestReward,
    takeUpgradeDone: takeUpgradeDone,
    offlineInfo: offlineInfo,
    claimOffline: claimOffline,
    takeEstorageHint: takeEstorageHint,
    currentLevel: currentLevel,
    selectedLevel: selectedLevel,
    resetSelected: resetSelected,
    clearedLevels: clearedLevels,
    isAllCleared: isAllCleared,
    completeLevel: completeLevel,
    recordStars: recordStars,
    levelStars: levelStars,
    lootedMap: lootedMap,
    isLooted: isLooted,
    markLooted: markLooted,
    clearLooted: clearLooted,
    isLevelUnlocked: isLevelUnlocked,
    selectLevel: selectLevel,
    upgradeSpent: upgradeSpent,
    gold: function () { return Math.floor(st.gold); },
    elixir: function () { return Math.floor(st.elixir); },
    gems: gemsNow,
    pvp: function () { return st.pvp; },
    addGems: addGems,
    upgradeSpeedCost: upgradeSpeedCost,
    speedUpUpgrade: speedUpUpgrade,
    queueSpeedCost: queueSpeedCost,
    speedUpQueue: speedUpQueue,
    exchangeGems: exchangeGems,
    buyResource: buyResource,
    defenseDescriptor: defenseDescriptor,
    raidDue: raidDue,
    runRaid: runRaid,
    maybeRaid: maybeRaid,
    pendingRaidInfo: pendingRaidInfo,
    claimRaid: claimRaid,
    lastRaidAt: lastRaidAt,
    raidHistory: raidHistory,
    raidTruce: raidTruce,
    daily: daily,
    addDailyStars: addDailyStars,
    claimDaily: claimDaily,
    takeDailyDone: takeDailyDone
  };
})();
