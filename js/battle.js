/* Симуляция боя: юниты, постройки, стрельба, победа/поражение. */
window.CC = window.CC || {};

CC.Battle = (function () {
  'use strict';

  const G = CC.GRID;
  const DEFS = CC.BUILDINGS;
  const TROOPS = CC.TROOPS;
  const HERO = CC.HERO || {
    id: 'hero', minTh: 2, maxLevel: 10,
    ability: { name: 'Щит', duration: 3, radius: 2.5, uses: 1 }
  };
  const LEVELS = CC.LEVELS || [];
  const PETS = CC.PETS || {};
  const SPELLS = CC.SPELLS || {};
  const SIEGE = CC.SIEGE || {};

  // Все 19 заклинаний имеют боевой эффект. Флаг оставлен для UI: если
  // появится новый id из будущего среза, он честно попадёт в «нет данных».
  const SPELL_READY = {};
  Object.keys(SPELLS).forEach(function (id) { SPELL_READY[id] = true; });
  Object.keys(CC.SPELL_META || {}).forEach(function (id) {
    if (SPELLS[id]) SPELL_READY[id] = true;
  });

  // Девять осадных машин: у каждой своя роль. HP/DPS в справочнике CoC
  // для осад не заполнены, поэтому числа наши (док. COC-BATTLE-SPEC §7).
  const SIEGE_READY = {
    wallwrecker: { hp: 3200, dmg: 140, speed: 1.4, range: 1,
      target: 'wall', wallBonus: 8, space: 0, role: 'стены' },
    battleblimp: { hp: 2200, dmg: 90, speed: 1.5, range: 1.5,
      target: 'any', splash: 1.8, fly: true, space: 0, role: 'воздух' },
    stoneslammer: { hp: 3400, dmg: 120, speed: 1.3, range: 1,
      target: 'defense', splash: 2, space: 0, role: 'площадной' },
    siegebarracks: { hp: 2800, dmg: 45, speed: 1.2, range: 1,
      target: 'any', spawnRole: 'siegebarracks', space: 0, role: 'десант' },
    loglauncher: { hp: 2600, dmg: 180, speed: 1.2, range: 6,
      target: 'wall', wallBonus: 6, space: 0, role: 'стены' },
    flameflinger: { hp: 2400, dmg: 200, speed: 1.1, range: 7,
      target: 'defense', splash: 2, space: 0, role: 'дальний' },
    battledrill: { hp: 2800, dmg: 150, speed: 1.6, range: 1,
      target: 'defense', miner: true, space: 0, role: 'подземный' },
    trooplauncher: { hp: 2600, dmg: 20, speed: 1.2, range: 1,
      target: 'any', spawnRole: 'trooplauncher', space: 0, role: 'десант' },
    skywagon: { hp: 2000, dmg: 50, speed: 1.6, range: 2,
      target: 'any', fly: true, spawnRole: 'skywagon', space: 0, role: 'воздух' }
  };

  let S = null;

  const cell = function (x, y) { return y * G + x; };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---------- создание ---------- */

  function copyArmy(map) {
    const out = {};
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      out[t] = Math.max(0, Math.floor(Number(map && map[t]) || 0));
    }
    return out;
  }

  // Герои приходят либо явной картой army.heroes = {kind: level}, либо
  // старым флагом army.hero. Уровень героя теперь индивидуальный: значение
  // карты — это уровень, а не просто «есть». Старый флаг = Сержант 1 ур.
  function copyHeroes(map) {
    const out = {};
    const list = CC.HEROES || [];
    const src = map && map.heroes;
    if (src && typeof src === 'object') {
      for (let i = 0; i < list.length; i++) {
        const id = list[i].id;
        const v = Math.floor(Number(src[id]) || 0);
        if (v > 0) out[id] = v;
      }
      // Неизвестный герой старого сейва не должен теряться: это barb.
      if (!Object.keys(out).length && Number(src.hero) > 0) out.barb = 1;
    } else if (map && Number(map.hero) > 0) {
      out.barb = 1;
    }
    return out;
  }

  // Заклинания: army.spells / opts.spells — карта {id: количество}.
  // Неизвестные и отрицательные значения отбрасываем.
  function copySpells(map, extra) {
    const out = {};
    const src = (map && (map.spells || map.spell)) || extra || {};
    function add(id, n) {
      if (!SPELLS[id]) return;
      const c = Math.max(0, Math.floor(Number(n) || 0));
      if (c > 0) out[id] = (out[id] || 0) + c;
    }
    if (typeof src === 'string') add(src, 1);
    else if (Array.isArray(src)) {
      for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (typeof v === 'string') add(v, 1);
        else if (v && typeof v === 'object') add(v.id, v.count || v.n || 1);
      }
    } else if (src && typeof src === 'object') {
      for (const id in src) add(id, src[id]);
    }
    return out;
  }

  // Питомцы: army.pets = {heroKind: petId} либо {petId: 1}.
  // Внутри боя храним привязку «герой → питомец», чтобы один питомец
  // действительно шёл рядом со своим героем.
  function copyPets(map, extra) {
    const src = (map && (map.pets || map.pet)) || extra || null;
    const out = {};
    const heroList = CC.HEROES || [];
    const free = [];

    function assign(heroKind, petId) {
      if (!PETS[petId]) return;
      if (heroKind && CC.heroDef) {
        const h = CC.heroDef(heroKind);
        if (h && h.id) { out[h.id] = petId; return; }
      }
      free.push(petId);
    }

    if (typeof src === 'string') {
      assign(null, src);
    } else if (Array.isArray(src)) {
      for (let i = 0; i < src.length; i++) assign(null, src[i]);
    } else if (src && typeof src === 'object') {
      for (const key in src) {
        if (PETS[key]) {
          if (Number(src[key]) > 0) assign(null, key);
        } else if (PETS[src[key]]) {
          assign(key, src[key]);
        }
      }
    }

    // Свободных питомцев раздаём героям по порядку: в бою герой один или
    // несколько, но каждому нужен свой спутник.
    for (let i = 0; i < free.length && i < heroList.length; i++) {
      const kind = heroList[i] && heroList[i].id;
      if (kind && !out[kind]) out[kind] = free[i];
    }
    return out;
  }

  // Осадная машина: строка, массив или карта {id: 1}.
  function copySiege(map, extra) {
    const src = (map && (map.siege || map.sieges)) || extra || null;
    const out = [];
    function add(id) {
      if (SIEGE[id] && out.indexOf(id) === -1) out.push(id);
    }
    if (typeof src === 'string') add(src);
    else if (Array.isArray(src)) src.forEach(add);
    else if (src && typeof src === 'object') {
      for (const id in src) if (Number(src[id]) > 0) add(id);
    }
    return out;
  }

  // Полное описание войска: таблица HP/DPS + ручная мета (стены, цепь,
  // призыв, лечение). CC.troopStats отдаёт только табличные поля.
  function troopDef(type, level) {
    const meta = (CC.TROOP_META && CC.TROOP_META[type]) || {};
    const base = TROOPS[type] || {};
    const stats = CC.troopStats ? CC.troopStats(type, level) : null;
    const def = Object.assign({}, base, meta, stats || {});
    // Поля меты, которых нет в CC.TROOPS/CC.troopStats, переносим явно.
    const keys = ['wallBonus', 'chain', 'spawn', 'heal', 'support',
      'jumpsWalls', 'freeze', 'target', 'splash', 'fly', 'space'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (meta[k] !== undefined) def[k] = meta[k];
    }
    if (!def.hp) def.hp = Math.max(1, Number(base.hp) || 1);
    if (!def.dmg && def.dmg !== 0) def.dmg = Number(base.dmg) || 0;
    if (!def.speed) def.speed = Number(base.speed) || 2;
    if (!def.range && def.range !== 0) def.range = Number(base.range) || 1;
    if (!def.target) def.target = base.target || 'any';
    def.fly = !!(def.fly || base.fly);
    return def;
  }

  // Уровни из сейва применяются только в боях игрока: кампания, Арена,
  // повтор и баланс-инструмент. Набег ИИ/симуляция — всегда 1 уровень.
  function playerLevelsActive() {
    if (!S || S.headless) return false;
    return !!(S.useTroopLevels || S.kind === 'campaign' ||
      S.kind === 'pvp' || S.kind === 'replay' || S.viewReplay);
  }

  // Уровень войска в бою.
  function troopLevelFor(type) {
    if (!CC.Game || !CC.Game.troopLevel) return 1;
    if (!playerLevelsActive()) return 1;
    const lv = Math.floor(Number(CC.Game.troopLevel(type)));
    return lv >= 1 ? lv : 1;
  }

  // Уровень питомца: те же правила, что у войск.
  function petLevelFor(id, outside) {
    if (!CC.Game || !CC.Game.petLevel) return 1;
    if (!outside && !playerLevelsActive()) return 1;
    const lv = Math.floor(Number(CC.Game.petLevel(id)));
    return lv >= 1 ? lv : 1;
  }

  function heroKindsLeft() {
    const out = [];
    if (!S || !S.heroes) return out;
    for (const k in S.heroes) if (S.heroes[k] > 0) out.push(k);
    return out;
  }

  function firstHeroKind() {
    const left = heroKindsLeft();
    return left.length ? left[0] : null;
  }

  // army.hero — старый флаг «есть невысаженный герой», а не количество.
  function syncHeroFlag() {
    if (!S) return;
    S.army.hero = heroKindsLeft().length ? 1 : 0;
  }

  // Оставляем только войска, открытые на указанном уровне центра.
  function onlyUnlocked(map, th) {
    const out = copyArmy(map);
    if (!CC.troopUnlock) return out;
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      if (CC.troopUnlock(t) > th) out[t] = 0;
    }
    return out;
  }

  // Герой доступен только после открытия (TH2+) и если он есть в деревне.
  // В headless-прогонах и на чужой базе героя нет.
  function heroAvailable(th) {
    if (!TROOPS.hero) return false;
    const level = typeof th === 'number' ? Math.round(th) : 1;
    if (level < (HERO.minTh || 2)) return false;
    if (!CC.Game || !CC.Game.heroLevel) return false;
    return CC.Game.heroLevel() >= 1;
  }

  // Общая сборка состояния: кампания, набег или произвольная база.
  // buildings: [{type, x, y, level}], level по умолчанию 1.
  function buildState(opts) {
    const o = opts || {};
    const rows = o.buildings || [];

    S = {
      buildings: [],
      traps: [],
      units: [],
      shots: [],
      fx: [],
      occ: new Int16Array(G * G).fill(-1),
      costs: new Float32Array(G * G),
      deployable: new Uint8Array(G * G),
      army: copyArmy(o.army),
      // Заклинания, питомцы и осадная машина: не занимают места армии.
      spells: copySpells(o.army, o.spells),
      activeSpells: [],
      selectedSpell: null,
      spellLog: [],
      pets: copyPets(o.army, o.pets),
      petDeployed: {},
      selectedPet: null,
      siege: copySiege(o.army, o.siege),
      siegeDeployed: false,
      siegeUnit: null,
      selectedSiege: null,
      // Павшие герои: нужны заклинанию revive.
      fallenHeroes: [],
      // Прыжковое поле: на время стены становятся проходимыми для всех.
      jumpUntil: 0,
      // Герои не входят в ARMY_ORDER: они не тратят места и не тренируются.
      // heroes — сколько экземпляров каждого вида ещё можно высадить (0/1).
      // army.hero остаётся флагом совместимости для старых снимков.
      heroes: copyHeroes(o.army),
      hero: null,
      heroDeployed: false,
      heroShield: 0,
      abilityUsed: false,
      abilityReady: false,
      selected: 'barb',
      selectedHero: null,
      level: o.level || 0,
      levelId: o.levelId || 0,
      levelName: o.levelName || 'Бой',
      levelLoot: o.loot || { gold: 0, elixir: 0, dark: 0 },
      lootPool: o.loot || { gold: 0, elixir: 0, dark: 0 },
      // Фактически унесённое из разрушенных зданий. Заполняется сразу при
      // сносе, а не процентом в конце боя.
      lootTaken: { gold: 0, elixir: 0, dark: 0 },
      lootedBuildings: [],
      kind: o.kind || 'custom',
      campaign: o.kind === 'campaign',
      // Просмотр повтора набега: бой идёт сам, управление выключено.
      viewReplay: !!o.viewReplay,
      // Баланс-инструмент: применить уровни войск без «настоящей» кампании,
      // чтобы не трогать прогресс игрока. Обычный бой поле не использует.
      useTroopLevels: !!o.useTroopLevels,
      deployPlan: Array.isArray(o.deployPlan) ? o.deployPlan.slice() : [],
      deployLog: [],
      deployedCount: 0,
      autoDeploy: false,
      // 0 — свободная высадка по всему полю. Поле оставлено для рендера:
      // художник может подсветить свободные клетки, не зная деталей боя.
      deployBand: 0,
      silent: !!o.silent,
      time: 0,
      limit: o.limit || CC.TIME_LIMIT,
      over: false,
      result: null,
      replay: false,
      percent: 0,
      total: 0,
      uid: 1
    };

    // Снимок армии на входе: по нему считаем, сколько войск израсходовано.
    S.armyStart = copyArmy(S.army);

    // В бою герои приходят отдельным полем снимка. Каждый вид — максимум
    // одна штука за бой; army.hero остаётся старым флагом совместимости.
    // Арена передаёт только флаг (pvp.js), поэтому открытые виды добираем
    // из деревни, не меняя формат снимка армии.
    if (o.kind === 'pvp' && o.army && Number(o.army.hero) > 0 &&
        CC.Game && CC.Game.heroBattleArmy) {
      S.heroes = CC.Game.heroBattleArmy();
    }
    if (TROOPS.hero) {
      S.army.hero = S.heroes && Object.keys(S.heroes).length ? 1 : 0;
    } else {
      S.heroes = {};
    }
    if (!S.selectedHero) S.selectedHero = firstHeroKind();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !DEFS[r.type]) continue;
      if (CC.isTrap && CC.isTrap(r.type)) {
        addTrap(r.type, Math.floor(r.x), Math.floor(r.y), r.level);
      } else {
        addBuilding(r.type, Math.floor(r.x), Math.floor(r.y), r.level, r);
      }
    }

    S.total = S.buildings.filter(function (b) { return b.type !== 'wall'; }).length;
    S.bounds = computeBounds();
    rebuild();
    computeDeployable();
    return S;
  }

  // index — номер уровня кампании; без аргумента берём выбранный для боя
  // уровень (а не прогресс: реплей старого уровня не должен сбрасываться).
  function newState(index) {
    let idx;
    if (typeof index === 'number' && isFinite(index)) {
      idx = Math.floor(index);
    } else if (CC.Game && CC.Game.selectedLevel) {
      idx = CC.Game.selectedLevel();
    } else if (CC.Game && CC.Game.currentLevel) {
      idx = CC.Game.currentLevel();
    } else {
      idx = 0;
    }

    if (!LEVELS.length) idx = 0;
    else idx = clamp(idx, 0, LEVELS.length - 1);

    const lvl = LEVELS.length ? LEVELS[idx] : null;
    const layout = (lvl && lvl.layout) || CC.LAYOUT;

    // В бой идёт натренированная армия, а не фиксированный набор.
    // Закрытые на текущем центре типы отбрасываем: старый сейв TH1 не должен
    // высаживать лазерщиков и дронов. Баланс-симулятор уровней зовёт reset(i)
    // с чужим индексом — там берём уровень центра самой эпохи.
    let army;
    let armyTh = null;
    if (typeof CC.Game !== 'undefined' && CC.Game) {
      const current = CC.Game.currentLevel ? CC.Game.currentLevel() : idx;
      // Без загруженной деревни (headless-баланс) фильтровать нечего:
      // армию эпохи задаёт сам инструмент.
      const hasVillage = !!(CC.Base && CC.Base.count &&
        CC.Base.count('townhall') > 0);
      // Выбранный для боя уровень (реплей) — не предпросмотр чужой эпохи:
      // армия и герой остаются армейскими, как в обычном бою.
      const selected = CC.Game.selectedLevel
        ? CC.Game.selectedLevel() : current;
      const preview = !hasVillage ||
        (typeof index === 'number' && idx !== current && idx !== selected);
      // Баланс-симулятор зовёт reset(i) с чужим индексом и своей армией эпохи.
      // Эпоха занимает два уровня центра: 1-2, 3-4 … 9-10, поэтому для
      // предпросмотра берём верхнюю границу эпохи, а не lvl.th (он 1..5).
      armyTh = preview
        ? Math.min(CC.MAX_TH || 10, (Math.floor(idx / 10) + 1) * 2)
        : CC.Game.townhallLevel();
      army = onlyUnlocked(CC.Game.armySnapshot(true), armyTh);
      // Герои идут только в настоящий бой игрока: баланс-симулятор и
      // предпросмотр чужой эпохи их не получают. Открытые виды считаем
      // по общему уровню героев и уровню центра.
      if (!preview && hasVillage && heroAvailable(armyTh)) {
        army.hero = 1;
        army.heroes = CC.Game.heroBattleArmy
          ? CC.Game.heroBattleArmy(armyTh)
          : { barb: 1 };
      }
    } else {
      army = Object.assign({}, CC.START_ARMY);
    }

    const pool = lvl
      ? {
        gold: (lvl.loot && lvl.loot.gold) || 0,
        elixir: (lvl.loot && lvl.loot.elixir) || 0,
        dark: (lvl.loot && lvl.loot.dark) || 0
      }
      : { gold: 0, elixir: 0, dark: 0 };

    // Раскладываем пул уровня по конкретным зданиям: 85% руды — в склады
    // руды, 15% — в буры; так же энергия и плазма (darkstorage/ darkdrill).
    // Командный центр лут не получает. План считается по той же
    // детерминированной раскладке, поэтому ключи стабильны между заходами.
    const plan = CC.Loot && CC.Loot.distribute
      ? CC.Loot.distribute(pool, layout)
      : {};
    const rows = layout.map(function (r) {
      const key = CC.lootKey
        ? CC.lootKey(r[0], r[1], r[2])
        : r[0] + ':' + r[1] + ':' + r[2];
      const part = plan[key] || { gold: 0, elixir: 0, dark: 0 };
      const empty = !!(CC.Game && CC.Game.isLooted &&
        CC.Loot && CC.Loot.roleOf(r[0]) && CC.Game.isLooted(idx, key));
      return {
        type: r[0],
        x: r[1],
        y: r[2],
        level: r[3] || 1,
        key: key,
        lootGold: empty ? 0 : part.gold,
        lootElixir: empty ? 0 : part.elixir,
        lootDark: empty ? 0 : (part.dark || 0),
        emptyLoot: empty
      };
    });

    const state = buildState({
      buildings: rows,
      army: army,
      kind: 'campaign',
      level: idx,
      levelId: lvl ? lvl.id : 0,
      levelName: lvl ? lvl.name : 'Тренировка',
      loot: pool,
      limit: CC.TIME_LIMIT,
      // P3 может добавить армейские снимки заклинаний/питомцев/осады;
      // бой принимает их, не меняя старый формат армии.
      spells: (CC.Game && CC.Game.spellBattleArmy)
        ? CC.Game.spellBattleArmy() : null,
      pets: (CC.Game && CC.Game.petBattleArmy)
        ? CC.Game.petBattleArmy() : null,
      siege: (CC.Game && CC.Game.siegeBattleArmy)
        ? CC.Game.siegeBattleArmy() : null
    });
    // Десант проверяет не сегодняшний TH игрока, а уровень, под который
    // действительно собрана эта армия (важно для баланс-симулятора).
    if (armyTh !== null) state.armyTh = armyTh;
    return state;
  }

  // Публичный вход для произвольной базы (набег, будущий PvP).
  function start(desc) {
    const d = desc || {};
    return buildState({
      buildings: d.buildings || [],
      army: d.army || {},
      kind: d.kind || 'custom',
      level: d.level || 0,
      levelId: d.id || 0,
      levelName: d.name || 'База',
      loot: d.loot || { gold: 0, elixir: 0, dark: 0 },
      limit: d.limit || CC.TIME_LIMIT,
      silent: !!d.silent,
      viewReplay: !!d.viewReplay,
      useTroopLevels: !!d.useTroopLevels,
      deployPlan: d.deployPlan || [],
      spells: d.spells || null,
      pets: d.pets || null,
      siege: d.siege || null
    });
  }

  // Рамка базы фиксируется на старте боя и не ездит за разрушениями.
  function computeBounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      if (b.x < x0) x0 = b.x;
      if (b.y < y0) y0 = b.y;
      if (b.x + b.w > x1) x1 = b.x + b.w;
      if (b.y + b.h > y1) y1 = b.y + b.h;
    }

    if (!isFinite(x0)) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function addBuilding(type, x, y, level, meta) {
    const d = DEFS[type];
    if (!d) return null;

    const stats = CC.BuildingStats
      ? CC.BuildingStats.at(type, level)
      : { level: 1, hp: d.hp, dmg: d.dmg, range: d.range,
        minRange: d.minRange, rate: d.rate, splash: d.splash };

    const def = Object.assign({}, d, { level: stats.level, hp: stats.hp });
    if (stats.dmg !== undefined) def.dmg = stats.dmg;
    if (stats.range !== undefined) def.range = stats.range;
    if (stats.minRange !== undefined) def.minRange = stats.minRange;
    if (stats.rate !== undefined) def.rate = stats.rate;
    if (stats.splash !== undefined) def.splash = stats.splash;
    // Табличный DPS не подменяем: у spell_tower его нет намеренно (поле).
    if (!isFinite(Number(def.dmg))) def.dmg = 0;

    // Оружие центра: модуль включается, когда по центру прошёл урон.
    // Отдельной карточки у него нет, поэтому дальность/темп задаём здесь.
    if (type === 'townhall' || def.thweapon) {
      def.thweapon = true;
      if (!def.range) def.range = 9;
      if (!def.rate) def.rate = 0.8;
      if (!def.dmg) def.dmg = Math.max(20, 14 + (stats.level || 1) * 6);
      def.targetsAir = true;
    }

    const b = {
      id: S.uid++,
      type: type,
      def: def,
      level: stats.level,
      x: x,
      y: y,
      w: d.w || 1,
      h: d.h || 1,
      hp: def.hp,
      maxHp: def.hp,
      cd: 0,
      aim: 0.6,
      dead: false,
      // Скрытая оборона (ambush): до раскрытия не цель и не стреляет.
      hidden: !!def.hidden,
      revealed: !def.hidden,
      // Непрерывный луч: множитель 1..3, сбрасывается при смене цели.
      charge: 1,
      chargeTime: 0,
      beamTarget: null,
      beamTargetId: 0,
      // Оружие центра включается первым уроном по ратуше.
      thActive: false,
      // Взрыв детонатора выполняется ровно один раз.
      exploded: false,
      // Заморозка обороны заклинанием/криополем.
      freezeUntil: 0,
      // Поле генератора аномалий: криополе или токсин, раз в 6 секунд.
      fieldMode: 0,
      fieldUntil: 0,
      // Добыча конкретного здания и стабильный ключ для прогресса.
      key: (meta && meta.key) || (CC.lootKey ? CC.lootKey(type, x, y) : type + ':' + x + ':' + y),
      lootGold: Math.max(0, Math.floor(Number(meta && meta.lootGold) || 0)),
      lootElixir: Math.max(0, Math.floor(Number(meta && meta.lootElixir) || 0)),
      lootDark: Math.max(0, Math.floor(Number(meta && meta.lootDark) || 0)),
      // Уже разграбленная постройка: данные для художника и для строки
      // «в этом складе уже пусто» в результате.
      emptyLoot: !!(meta && meta.emptyLoot),
      lootCollected: false
    };
    S.buildings.push(b);
    return b;
  }

  // Ловушка живёт отдельным списком: не цель, не в проценте, не мешает
  // высадке и пути. armed=false после срабатывания — данные для художника
  // (вскрытая мина/пружина).
  function addTrap(type, x, y, level) {
    const d = DEFS[type];
    if (!d || !d.trap) return null;

    const stats = CC.BuildingStats
      ? CC.BuildingStats.at(type, level)
      : { level: 1, hp: 1, dmg: d.dmg, radius: d.radius, splash: d.splash };

    const trap = {
      id: S.uid++,
      type: type,
      def: Object.assign({}, d, stats),
      level: stats.level,
      x: x,
      y: y,
      w: 1,
      h: 1,
      armed: true,
      triggered: false,
      revealed: false,
      radius: stats.radius || d.radius || 0.9,
      splash: stats.splash || d.splash || 0,
      dmg: stats.dmg || d.dmg || 0,
      // Ловушки-ловушки (скелеты) выпускают своих юнитов, торнадо живёт
      // несколько секунд и тянет отряд к центру.
      spawn: stats.spawn || d.spawn || 0,
      capacity: d.capacity || 4,
      maxUnitSpace: d.maxUnitSpace || 2,
      activeUntil: 0,
      fieldTick: 0
    };
    S.traps.push(trap);
    return trap;
  }

  /* ---------- сетка ---------- */

  function rebuild() {
    S.occ.fill(-1);

    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      for (let yy = b.y; yy < b.y + b.h; yy++) {
        for (let xx = b.x; xx < b.x + b.w; xx++) {
          S.occ[cell(xx, yy)] = i;
        }
      }
    }

    for (let i = 0; i < G * G; i++) {
      const oi = S.occ[i];
      if (oi < 0) {
        S.costs[i] = 1;
      } else {
        const wall = S.buildings[oi].type === 'wall';
        // Прыжковое поле/подкоп на время делают стены дешёвыми: A* пойдёт
        // сквозь них, а updateUnit не станет перенацеливаться на барьер.
        S.costs[i] = wall
          ? ((S.jumpUntil && S.jumpUntil > S.time) ? 1 : 8)
          : Infinity;
      }
    }
  }

  // Свободная высадка: подходит любая клетка поля, где нет постройки.
  // Массив считается на старте для подсветки (художник рисует его кромку),
  // а саму занятость deploy() проверяет по живой сетке S.occ.
  function computeDeployable() {
    S.deployable.fill(0);

    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = cell(x, y);
        if (S.occ[i] >= 0) continue;
        S.deployable[i] = 1;
      }
    }
  }

  /* ---------- геометрия ---------- */

  function distToBuilding(x, y, b) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    return Math.hypot(nx - x, ny - y);
  }

  function canPassWalls(u) {
    if (!u || !u.def) return false;
    if (u.def.jumpsWalls || u.def.miner) return true;
    if ((u.jumpUntil || 0) > S.time) return true;
    return !!(S.jumpUntil && S.jumpUntil > S.time);
  }

  function pathTo(u, b) {
    const candidates = [];

    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      for (let y = b.y - 1; y <= b.y + b.h; y++) {
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) continue;
        if (S.occ[cell(x, y)] >= 0) continue;
        candidates.push({ x: x, y: y, d: Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y) });
      }
    }

    if (!candidates.length) return null;
    candidates.sort(function (a, c) { return a.d - c.d; });

    const sx = clamp(Math.floor(u.x), 0, G - 1);
    const sy = clamp(Math.floor(u.y), 0, G - 1);
    const opts = canPassWalls(u) ? { wallCost: 1 } : null;

    const limit = Math.min(candidates.length, 6);
    for (let i = 0; i < limit; i++) {
      const p = CC.Path.find(S.costs, G, G, sx, sy,
        candidates[i].x, candidates[i].y, opts);
      if (p !== null) return p;
    }
    return null;
  }

  function nearestWall(u) {
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead || b.type !== 'wall') continue;
      const d = distToBuilding(u.x, u.y, b);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /* ---------- цели и урон ---------- */

  function pickTarget(u) {
    const pref = u.def.target || 'any';
    let best = null;
    let bd = Infinity;
    let wall = null;
    let wd = Infinity;
    let heroBest = null;
    let heroDist = Infinity;
    let defBest = null;
    let defDist = Infinity;

    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      // Скрытая засада не выбирается целью, пока не раскрылась.
      if (b.hidden && !b.revealed) continue;

      // Летающие не видят энергобарьеры: они не цель и не препятствие.
      if (b.type === 'wall' && u.def.fly) continue;

      const d = distToBuilding(u.x, u.y, b);
      const isWall = b.type === 'wall';
      const isHero = !!(b.def && (b.def.hero || b.type === 'hero')) || b.type === 'hero';
      const isDef = !!(b.def && b.def.range);
      const isRes = !!(b.def && b.def.resource);

      if (isHero && d < heroDist) { heroDist = d; heroBest = b; }
      if (isDef && d < defDist) { defDist = d; defBest = b; }

      if (pref === 'wall') {
        if (isWall && d < bd) { bd = d; best = b; }
        continue;
      }
      if (pref === 'defense') {
        if (isDef && d < bd) { bd = d; best = b; }
        continue;
      }
      if (pref === 'resource') {
        if (isRes && d < bd) { bd = d; best = b; }
        continue;
      }
      if (pref === 'hero') {
        if (isHero && d < bd) { bd = d; best = b; }
        continue;
      }

      // Стены — не цель, а препятствие: ломаем их, только если больше
      // нечего бить. Иначе отряд застревает, грызя кольцо по кирпичу.
      if (isWall) {
        if (d < wd) { wd = d; wall = b; }
        continue;
      }

      if (d < bd) { bd = d; best = b; }
    }

    // Корневой таран бьёт стены осознанно, а не «когда больше нечего».
    if (!best && (u.def.target === 'wall' ||
        (u.def.wallBonus && wall && wd <= 3.5))) {
      best = wall;
    }
    // Root Rider: стены — приоритетная цель, если они рядом.
    if (wall && wd <= 3.5 && (u.type === 'rootrider' || u.type === 'gnome')) {
      best = wall;
    }
    // Охотник за головами: героев на обороне может не быть, поэтому
    // ближайшая оборона — запасная цель, а не простой.
    if (!best && pref === 'hero') best = defBest;
    if (pref === 'any' && !best) best = wall;

    // если любимых целей не осталось — бьём что попало
    if (!best && pref !== 'any') {
      for (let i = 0; i < S.buildings.length; i++) {
        const b = S.buildings[i];
        if (b.dead) continue;
        if (b.hidden && !b.revealed) continue;
        if (b.type === 'wall' && u.def.fly) continue;
        const d = distToBuilding(u.x, u.y, b);
        if (d < bd) { bd = d; best = b; }
      }
    }

    u.target = best || null;
    u.path = null;
  }

  // Забрать добычу здания ровно один раз. Вызывается сразу при сносе, а
  // в финале добирает всё, что тесты/инструменты погасили напрямую.
  function collectBuildingLoot(b) {
    if (!b || b.lootCollected) return;
    b.lootCollected = true;

    const gold = Math.max(0, Math.floor(Number(b.lootGold) || 0));
    const elixir = Math.max(0, Math.floor(Number(b.lootElixir) || 0));
    const dark = Math.max(0, Math.floor(Number(b.lootDark) || 0));
    if (!gold && !elixir && !dark && !b.emptyLoot) return;

    S.lootTaken.gold += gold;
    S.lootTaken.elixir += elixir;
    S.lootTaken.dark += dark;
    S.lootedBuildings.push({
      key: b.key,
      type: b.type,
      name: (DEFS[b.type] && DEFS[b.type].name) || b.type,
      gold: gold,
      elixir: elixir,
      dark: dark,
      empty: !!b.emptyLoot
    });

    // С этого момента здание пустое — даже если бой ещё не закончился.
    b.lootGold = 0;
    b.lootElixir = 0;
    b.lootDark = 0;
  }

  // Площадной урон по постройкам (взрыв детонатора, смерть метеорита или
  // дирижабля). Цель не нужна: накрываем всё в радиусе.
  function bombArea(x, y, amount, radius, skip) {
    if (!(amount > 0)) return;
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b === skip || b.dead) continue;
      if (b.hidden && !b.revealed) continue;
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      if (Math.hypot(nx - x, ny - y) > (radius || 1.5)) continue;
      damageBuilding(b, amount);
    }
  }

  function damageBuilding(b, amount) {
    if (b.dead) return;
    b.hp -= amount;

    // Модуль центра просыпается от первого попадания по ратуше.
    if (b.type === 'townhall' && b.def.thweapon) b.thActive = true;

    const kind = b.type === 'wall' ? 'wall' : 'building';
    if (!S.silent && CC.Sound) CC.Sound.play('hit', undefined, kind);

    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      collectBuildingLoot(b);
      S.fx.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0, dur: 0.55, kind: 'boom', size: b.w * b.h });
      if (!S.silent && CC.Sound) CC.Sound.play('destroy', undefined, kind);

      // Детонатор взрывается при сносе: половина DPS по площади 1.5.
      if (b.def.special === 'bombtower' && !b.exploded) {
        b.exploded = true;
        splashDamage(b.x + b.w / 2, b.y + b.h / 2,
          (b.def.dmg || 0) * 0.5, 1.5, true);
      }

      if (S.campaign && CC.Game && CC.Game.addStat) {
        if (b.type === 'wall') CC.Game.addStat('wallsDestroyed', 1);
      }
      rebuild();
    }
  }

  // Бомбовый сброс дрона-бомбардировщика: цель получает полностью, соседи — часть.
  function bombBuildings(target, amount, radius) {
    damageBuilding(target, amount);
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;

    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b === target || b.dead) continue;
      if (b.hidden && !b.revealed) continue;
      const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
      const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
      if (Math.hypot(nx - cx, ny - cy) > radius) continue;
      damageBuilding(b, amount * 0.6);
    }
  }

  /* ---------- обновление ---------- */

  function unitSpeed(u) {
    let sp = Number(u.def.speed);
    if (!isFinite(sp)) sp = 2;
    if ((u.rageUntil || 0) > S.time) sp *= 1.5;
    if ((u.hasteUntil || 0) > S.time) sp *= 2;
    if ((u.slowUntil || 0) > S.time) sp *= 0.8;
    if ((u.poisonUntil || 0) > S.time) sp *= 0.7;
    return sp;
  }

  function effectiveDmg(u) {
    let dmg = isFinite(u.dmg) ? u.dmg : (u.def.dmg || 0);
    if ((u.rageUntil || 0) > S.time) dmg *= 1.8;
    if ((u.buffUntil || 0) > S.time) dmg *= 1.15;
    if ((u.totemUntil || 0) > S.time) dmg *= 1.3;
    if (u.isHero && (u.heroicUntil || 0) > S.time) dmg *= 1.5;
    if ((u.angryUntil || 0) > S.time) dmg *= 2;
    return dmg;
  }

  function unitById(id) {
    if (!S || !id) return null;
    for (let i = 0; i < S.units.length; i++) {
      if (S.units[i].id === id && S.units[i].hp > 0) return S.units[i];
    }
    return null;
  }

  function moveToward(u, tx, ty, dt) {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const mv = unitSpeed(u) * dt;
    if (len <= mv) { u.x = tx; u.y = ty; return; }
    u.x = clamp(u.x + dx / len * mv, 0, G - 0.001);
    u.y = clamp(u.y + dy / len * mv, 0, G - 0.001);
  }

  // Лекарь/друид: лечим союзников в радиусе, а не бьём постройки.
  // Сила лечения — 4% максимального HP в секунду: табличного лечения в CoC
  // нет, это наше решение под текущий движок.
  function healAllies(u, dt) {
    const radius = Math.max(2.5, Number(u.def.range) || 0);
    let healed = false;
    for (let i = 0; i < S.units.length; i++) {
      const a = S.units[i];
      if (a === u || a.hp <= 0 || a.hp >= a.maxHp) continue;
      if (Math.hypot(a.x - u.x, a.y - u.y) > radius) continue;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.04 * dt);
      healed = true;
    }
    if (!healed) {
      // Никого не лечим — держимся рядом с ближайшим союзником, чтобы
      // поддержка не отставала от отряда.
      let near = null;
      let nd = Infinity;
      for (let i = 0; i < S.units.length; i++) {
        const a = S.units[i];
        if (a === u || a.hp <= 0) continue;
        const d = Math.hypot(a.x - u.x, a.y - u.y);
        if (d < nd) { nd = d; near = a; }
      }
      if (near && nd > 2.5) moveToward(u, near.x, near.y, dt);
    }
    return healed;
  }

  // Ученик/друид: аура усиления и лечение. Ученик даёт +15% урона союзникам,
  // друид лечит и при низком HP превращается в медведя (упрощённо: +HP/DMG).
  function supportTick(u, dt) {
    if (u.type === 'druid' || u.def.heal) {
      healAllies(u, dt);
      if (u.type === 'druid' && !u.bearForm && u.hp < u.maxHp * 0.3) {
        u.bearForm = true;
        u.maxHp = Math.round(u.maxHp * 1.3);
        u.hp = u.maxHp;
        u.dmg = Math.round((u.dmg || 0) * 2) || u.dmg;
        u.def = Object.assign({}, u.def, { range: 1, speed: 2.4 });
        S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.5, kind: 'poof' });
      }
      return;
    }
    if (u.type === 'apprentice') {
      for (let i = 0; i < S.units.length; i++) {
        const a = S.units[i];
        if (a === u || a.hp <= 0) continue;
        if (Math.hypot(a.x - u.x, a.y - u.y) > 3.2) continue;
        a.buffUntil = Math.max(a.buffUntil || 0, S.time + 0.25);
      }
      return;
    }
    // Неизвестная поддержка не зависает: идёт за отрядом.
    healAllies(u, dt);
  }

  function summonDef(baseType, scale, fly) {
    const def = troopDef(baseType, 1);
    const s = scale || 1;
    def.hp = Math.max(1, Math.round((def.hp || 10) * s));
    def.dmg = Math.max(1, Math.round((def.dmg || 1) * s));
    def.spawn = 0;
    def.chain = 0;
    def.splash = 0;
    def.heal = false;
    def.support = false;
    def.jumpsWalls = false;
    def.wallBonus = 0;
    if (fly !== undefined) def.fly = !!fly;
    return def;
  }

  // Призыв юнита без тренировки: скелеты/детёныши/огни/руины. Не занимает
  // места в армии и не попадает в счётчик высаженных войск.
  function spawnSummon(owner, baseType, count, scale, fly) {
    const n = clamp(Math.floor(Number(count) || 0), 0, 10);
    for (let i = 0; i < n; i++) {
      const def = summonDef(baseType, scale, fly);
      const a = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.7;
      const u = {
        id: S.uid++,
        type: baseType,
        def: def,
        x: clamp((owner && owner.x || 1) + Math.cos(a) * r, 0, G - 0.001),
        y: clamp((owner && owner.y || 1) + Math.sin(a) * r, 0, G - 0.001),
        hp: def.hp,
        maxHp: def.hp,
        dmg: def.dmg,
        cd: 0,
        atk: 0,
        target: null,
        path: null,
        summoned: true,
        ownerKind: owner && owner.type,
        expireAt: 0,
        spawnCd: 0,
        buffUntil: 0,
        rageUntil: 0,
        hasteUntil: 0,
        totemUntil: 0,
        heroicUntil: 0,
        angryUntil: 0,
        invisibleUntil: 0,
        slowUntil: 0,
        freezeUntil: 0,
        poisonUntil: 0,
        jumpUntil: 0
      };
      S.units.push(u);
    }
    return n;
  }

  // Ведьма/печь/руинная ведьма: периодический призыв, пока живы.
  function updateSpawner(u, dt) {
    if (!u.def.spawn) return;
    if (u.type !== 'witch' && u.type !== 'furnace' && u.type !== 'ruinwitch') return;
    if (!(u.spawnCd > 0)) u.spawnCd = 4;
    u.spawnCd -= dt;
    if (u.spawnCd > 0) return;
    u.spawnCd = 6;
    if (u.type === 'witch') spawnSummon(u, 'barb', 2, 0.45);
    else if (u.type === 'furnace') spawnSummon(u, 'minion', 2, 0.35, true);
    else spawnSummon(u, 'barb', 2, 0.8);
    S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.4, kind: 'poof' });
  }

  // Осадные машины с ролью «десант/транспорт»: периодически выпускают
  // своих юнитов. Остальные девять id воюют как обычные войска.
  function siegeTick(u, dt) {
    if (!u.isSiege) return;
    const role = u.def.spawnRole;
    if (!role) return;
    if (!(u.spawnCd > 0)) u.spawnCd = role === 'trooplauncher' ? 6 : 8;
    u.spawnCd -= dt;
    if (u.spawnCd > 0) return;
    u.spawnCd = role === 'trooplauncher' ? 6 : 8;

    if (role === 'siegebarracks') {
      spawnSummon(u, 'barb', 1, 0.7);
    } else if (role === 'skywagon') {
      spawnSummon(u, 'minion', 1, 0.45, true);
    } else if (role === 'trooplauncher') {
      // Пусковая установка забрасывает бойцов вглубь: к ближайшей к центру
      // поля постройке, а не рядом с собственной позицией.
      let target = null;
      let best = Infinity;
      for (let i = 0; i < S.buildings.length; i++) {
        const b = S.buildings[i];
        if (b.dead || b.type === 'wall') continue;
        const d = Math.hypot(b.x + b.w / 2 - G / 2, b.y + b.h / 2 - G / 2);
        if (d < best) { best = d; target = b; }
      }
      const px = target ? target.x + target.w / 2 : u.x;
      const py = target ? target.y + target.h / 2 : u.y;
      spawnSummon({ x: px, y: py, type: 'barb' }, 'barb', 1, 0.8);
    }
    S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.4, kind: 'poof' });
  }

  // Питомец держится рядом с хозяином. Единорог лечит героя, дух-лис
  // телепортирует его к цели; остальные эффекты — в applyPetHit.
  function petTick(u, dt) {
    if (!u.isPet) return false;
    const owner = unitById(u.ownerId);
    if (owner) {
      // Дух-лис: один раз за бой переносит героя к его цели.
      if (u.type === 'fox' && !u.teleported) {
        if (!owner.target && !owner.path) pickTarget(owner);
        if (owner.target && !owner.target.dead) {
          const t = owner.target;
          const spot = freeSpotNear(t.x + t.w / 2, t.y + t.h / 2, 3);
          if (spot) {
            owner.x = spot.x + 0.5;
            owner.y = spot.y + 0.5;
            owner.path = null;
            owner.target = t;
            u.x = owner.x;
            u.y = owner.y;
            u.teleported = true;
            u.path = null;
            S.fx.push({ x: owner.x, y: owner.y, t: 0, dur: 0.6,
              kind: 'spell', size: 1.2 });
            return true;
          }
        }
      }
      const d = Math.hypot(owner.x - u.x, owner.y - u.y);
      if (d > 3.2) {
        moveToward(u, owner.x, owner.y, dt);
        return true;
      }
      if (u.def.heal && d <= 5 && owner.hp < owner.maxHp) {
        owner.hp = Math.min(owner.maxHp, owner.hp + owner.maxHp * 0.06 * dt);
        return true;
      }
    }
    return false;
  }

  function ravenSteal(target, amount) {
    if (!target || !(amount > 0)) return;
    const takeGold = Math.min(Math.max(0, Math.floor(Number(target.lootGold) || 0)),
      Math.max(1, Math.round(amount)));
    const takeElixir = Math.min(Math.max(0, Math.floor(Number(target.lootElixir) || 0)),
      Math.max(1, Math.round(amount * 0.7)));
    const takeDark = Math.min(Math.max(0, Math.floor(Number(target.lootDark) || 0)),
      Math.max(1, Math.round(amount * 0.5)));
    if (takeGold) { target.lootGold -= takeGold; S.lootTaken.gold += takeGold; }
    if (takeElixir) { target.lootElixir -= takeElixir; S.lootTaken.elixir += takeElixir; }
    if (takeDark) { target.lootDark -= takeDark; S.lootTaken.dark += takeDark; }
  }

  // Уникальные эффекты питомцев при ударе по постройке.
  function applyPetHit(u, target, dmg) {
    if (!u || !u.isPet || !target) return;
    if (u.type === 'frosty') {
      target.freezeUntil = Math.max(target.freezeUntil || 0, S.time + 1);
    } else if (u.type === 'lizard') {
      target.poisonUntil = Math.max(target.poisonUntil || 0, S.time + 4);
      target.poisonDps = Math.max(1, (u.dmg || 10) * 0.4);
      target.poisonTick = 0;
    } else if (u.type === 'jelly') {
      target.slowUntil = Math.max(target.slowUntil || 0, S.time + 3);
    } else if (u.type === 'raven') {
      ravenSteal(target, dmg);
    }
  }

  function chainBuildings(target, amount, count) {
    if (!target || target.dead || !(amount > 0)) return 0;
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    const hit = [];
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b === target || b.dead || b.type === 'wall') continue;
      if (b.hidden && !b.revealed) continue;
      const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
      const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
      const d = Math.hypot(nx - cx, ny - cy);
      if (d <= 2.8) hit.push({ b: b, d: d });
    }
    hit.sort(function (a, b) { return a.d - b.d; });
    const n = Math.min(hit.length, Math.max(0, count || 0));
    let cur = amount;
    for (let i = 0; i < n; i++) {
      damageBuilding(hit[i].b, cur);
      cur *= 0.6;
    }
    return n;
  }

  function attackBuilding(u, target, amount) {
    if (!target || target.dead) return;
    const d = u.def;
    let dmg = amount;
    if (target.type === 'wall') dmg *= (d.wallBonus || 1);
    if (target.def && target.def.resource &&
        (u.type === 'goblin' || d.target === 'resource')) {
      dmg *= 2;
    }
    if (target.def && target.def.hero && u.type === 'headhunter') dmg *= 3;

    if (d.splash) bombBuildings(target, dmg, d.splash);
    else damageBuilding(target, dmg);

    if (d.chain > 1) chainBuildings(target, dmg * 0.6, d.chain - 1);
    if (d.freeze && u.type === 'icegolem') {
      target.freezeUntil = Math.max(target.freezeUntil || 0, S.time + 1.5);
    }
    if (u.isPet) applyPetHit(u, target, dmg);
  }

  function updateUnit(u, dt) {
    const d = u.def;
    if (!u.hp || u.hp <= 0) return;
    // Клон/временный юнит истёк.
    if (u.expireAt && u.expireAt <= S.time) { u.hp = 0; return; }

    // Заморозка: юнит не двигается и не атакует (криополе/морозко).
    if ((u.freezeUntil || 0) > S.time) return;
    // Токсин: 5% HP в секунду, но не убивает мгновенно.
    if ((u.poisonUntil || 0) > S.time) {
      u.hp -= u.maxHp * 0.05 * dt;
      if (u.hp < 0) u.hp = 0;
    }

    if (u.cd > 0) u.cd -= dt;
    if (u.atk > 0) u.atk -= dt;

    updateSpawner(u, dt);
    if (u.isSiege) siegeTick(u, dt);

    // Поддержка не выбирает постройки: лечит/баффает и держится с отрядом.
    if (d.heal || d.support) {
      supportTick(u, dt);
      return;
    }

    // Питомец вне радиуса хозяина сначала догоняет его.
    if (petTick(u, dt)) return;

    const dmg = effectiveDmg(u);

    if (u.target && u.target.dead) {
      u.target = null;
      u.path = null;
    }

    const range = Math.max(0.9, Number(d.range) || 0.9);

    // в радиусе — бьём
    if (u.target && distToBuilding(u.x, u.y, u.target) <= range) {
      u.path = null;
      if (u.cd <= 0) {
        u.cd = 1;
        u.atk = 0.18;
        attackBuilding(u, u.target, dmg);
      }
      return;
    }

    if (!u.target) {
      pickTarget(u);
      if (!u.target) return;
    }

    // Летающие идут напрямую к цели: A* и энергобарьеры им не нужны.
    if (d.fly) {
      moveToward(u, u.target.x + u.target.w / 2,
        u.target.y + u.target.h / 2, dt);
      return;
    }

    if (!u.path || u.path.length === 0) {
      u.path = pathTo(u, u.target);
      if (u.path === null) {
        const wall = nearestWall(u);
        if (wall) { u.target = wall; u.path = null; }
        return;
      }
      if (u.path.length === 0) {
        // уже на месте, но не в радиусе — подойдём поближе напрямую
        moveToward(u, u.target.x + u.target.w / 2,
          u.target.y + u.target.h / 2, dt);
        return;
      }
    }

    const step = u.path[0];
    const oi = S.occ[cell(step.x, step.y)];

    if (oi >= 0) {
      const blocker = S.buildings[oi];
      if (blocker && !blocker.dead && !canPassWalls(u)) {
        u.target = blocker;
        u.path = null;
        return;
      }
    }

    const tx = step.x + 0.5;
    const ty = step.y + 0.5;
    const dx = tx - u.x;
    const dy = ty - u.y;
    const len = Math.hypot(dx, dy);
    const mv = unitSpeed(u) * dt;

    if (len <= mv || len < 0.001) {
      u.x = tx;
      u.y = ty;
      u.path.shift();
      if (!u.path.length) u.path = null;
    } else {
      u.x += dx / len * mv;
      u.y += dy / len * mv;
    }
  }

  // Непрерывный луч: цель держится, заряд растёт на 25% в секунду до x3.
  // При смене цели (или потере цели) заряд сбрасывается к x1.
  function updateBeam(b, dt) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let best = null;
    let bd = Infinity;

    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if ((u.invisibleUntil || 0) > S.time) continue;
      if (b.def.onlyGround && u.def.fly) continue;
      if (b.def.airOnly && !u.def.fly) continue;
      const d = Math.hypot(u.x - cx, u.y - cy);
      if (d > b.def.range) continue;
      if (d < bd) { bd = d; best = u; }
    }

    if (!best) {
      b.beamTarget = null;
      b.beamTargetId = 0;
      b.charge = 1;
      b.chargeTime = 0;
      return;
    }

    if (best.id !== b.beamTargetId) {
      b.beamTargetId = best.id;
      b.charge = 1;
      b.chargeTime = 0;
    } else {
      b.chargeTime += dt;
      const max = b.def.rampMax || 3;
      b.charge = Math.min(max, 1 + (b.def.ramp || 0.25) * b.chargeTime);
    }

    b.aim = Math.atan2(best.y - cy, best.x - cx);
    b.beamTarget = { x: best.x, y: best.y, id: best.id, charge: b.charge };

    // Щит героя: урон не проходит, но луч продолжает светить.
    if (!heroShielded(best)) best.hp -= (b.def.dmg || 0) * b.charge * dt;
    if (best.hp <= 0) {
      S.fx.push({ x: best.x, y: best.y, t: 0, dur: 0.4, kind: 'poof' });
    }
  }

  function tornadoPull(trap, cx, cy, step) {
    const r = (trap.radius || 2) * 1.6;
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      const dx = cx - u.x;
      const dy = cy - u.y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 0.001) continue;
      const pull = Math.min(d, 2.2 * step);
      u.x += dx / d * pull;
      u.y += dy / d * pull;
      u.path = null;
      if (d <= (trap.radius || 2) && !heroShielded(u)) {
        u.hp -= (trap.dmg || 0) * step;
      }
    }
    trap.fieldTick = (trap.fieldTick || 0) + step;
    if (trap.fieldTick >= 0.5) {
      trap.fieldTick = 0;
      S.fx.push({ x: cx, y: cy, t: 0, dur: 0.45,
        kind: 'trapBoom', size: trap.radius || 2 });
    }
  }

  // Ловушки. Срабатывают один раз, когда вражеский юнит входит в радиус.
  // В процент и цели не входят; после срабатывания armed=false.
  // Торнадо — исключение: после взведения ещё 5 секунд тянет отряд.
  function updateTraps(dt) {
    const step = dt || 0;

    for (let t = 0; t < S.traps.length; t++) {
      const trap = S.traps[t];
      const cx = trap.x + 0.5;
      const cy = trap.y + 0.5;
      const kind = trap.def.trapKind || 'ground';

      // Активное торнадо: затягивает и наносит урон по таблице.
      if (trap.type === 'tornado' && trap.triggered &&
          trap.activeUntil > S.time) {
        tornadoPull(trap, cx, cy, step);
        continue;
      }

      if (!trap.armed) continue;

      if (kind === 'spring') {
        // Пружина поднимает только лёгких наземных: суммарный вес до 4,
        // один юнит не тяжелее 2 (мехи и техника остаются на месте).
        const cand = [];
        for (let i = 0; i < S.units.length; i++) {
          const u = S.units[i];
          if (u.hp <= 0 || u.def.fly) continue;
          if (heroShielded(u)) continue;
          if ((u.def.space || 1) > trap.maxUnitSpace) continue;
          const d = Math.hypot(u.x - cx, u.y - cy);
          if (d <= trap.radius) cand.push({ u: u, d: d, space: u.def.space || 1 });
        }
        cand.sort(function (a, b) { return a.d - b.d; });

        let weight = 0;
        let ejected = 0;
        for (let i = 0; i < cand.length; i++) {
          if (weight + cand[i].space > trap.capacity) continue;
          weight += cand[i].space;
          cand[i].u.hp = 0;
          cand[i].u.ejected = true;
          S.fx.push({ x: cand[i].u.x, y: cand[i].u.y, t: 0, dur: 0.45, kind: 'poof' });
          ejected++;
        }

        if (!ejected) continue;
        trap.armed = false;
        trap.triggered = true;
        trap.revealed = true;
        S.fx.push({ x: cx, y: cy, t: 0, dur: 0.5, kind: 'spring', size: trap.radius });
        if (!S.silent && CC.Sound) CC.Sound.play('mortarHit');
        continue;
      }

      if (kind === 'skeleton') {
        // Ловушка-дрон: выпускает скелетов, которые сразу вступают в бой.
        let hit = false;
        for (let i = 0; i < S.units.length; i++) {
          const u = S.units[i];
          if (u.hp <= 0) continue;
          if (Math.hypot(u.x - cx, u.y - cy) > trap.radius) continue;
          hit = true;
          break;
        }
        if (!hit) continue;
        trap.armed = false;
        trap.triggered = true;
        trap.revealed = true;
        spawnSummon({ x: cx, y: cy, type: 'skeleton' }, 'barb',
          trap.spawn || trap.capacity || 2, 0.5);
        S.fx.push({ x: cx, y: cy, t: 0, dur: 0.5, kind: 'poof', size: 1 });
        continue;
      }

      if (kind === 'tornado') {
        let hit = false;
        for (let i = 0; i < S.units.length; i++) {
          const u = S.units[i];
          if (u.hp <= 0) continue;
          if (Math.hypot(u.x - cx, u.y - cy) > trap.radius) continue;
          hit = true;
          break;
        }
        if (!hit) continue;
        trap.armed = false;
        trap.triggered = true;
        trap.revealed = true;
        trap.activeUntil = S.time + 5;
        trap.fieldTick = 0;
        tornadoPull(trap, cx, cy, step);
        S.fx.push({ x: cx, y: cy, t: 0, dur: 0.6, kind: 'trapBoom', size: trap.radius });
        continue;
      }

      // Мины: сначала ищем подходящую цель в радиусе взведения.
      let hit = false;
      let nearest = null;
      let nd = Infinity;
      for (let i = 0; i < S.units.length; i++) {
        const u = S.units[i];
        if (u.hp <= 0) continue;
        if (kind === 'ground' && u.def.fly) continue;
        if (kind === 'air' && !u.def.fly) continue;
        const d = Math.hypot(u.x - cx, u.y - cy);
        if (d > trap.radius) continue;
        hit = true;
        if (d < nd) { nd = d; nearest = u; }
      }
      if (!hit) continue;

      trap.armed = false;
      trap.triggered = true;
      trap.revealed = true;

      const dmg = trap.dmg || trap.def.dmg || 0;

      // Ракетная мина бьёт одну воздушную цель без площади.
      if (trap.type === 'seekingair' && nearest) {
        if (!heroShielded(nearest)) nearest.hp -= dmg;
        S.fx.push({ x: nearest.x, y: nearest.y, t: 0, dur: 0.45,
          kind: 'trapBoom', size: 0.8 });
        continue;
      }

      // Урон по площади: mine бьёт только землю, airmine — только воздух.
      // Базовый splashDamage умеет фильтр «только земля», для воздуха
      // передаём отдельный флаг.
      splashDamage(cx, cy, dmg, trap.splash || 0, kind === 'ground', kind === 'air');
      S.fx.push({ x: cx, y: cy, t: 0, dur: 0.5, kind: 'trapBoom', size: trap.splash || 1 });
    }
  }

  // Выбор целей обороны. airOnly (зенитка) — строго только воздух:
  // наземные юниты для неё не существуют, даже если воздуха в радиусе нет.
  function defenseTargets(b, cx, cy, maxN) {
    const out = [];
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if ((u.invisibleUntil || 0) > S.time) continue;
      // Турели и гаубицы по воздуху не стреляют.
      if (b.def.onlyGround && u.def.fly) continue;
      if (b.def.airOnly && !u.def.fly) continue;
      const d = Math.hypot(u.x - cx, u.y - cy);
      if (d > b.def.range) continue;
      if (b.def.minRange && d < b.def.minRange) continue;
      out.push({ u: u, d: d });
    }
    out.sort(function (a, c) { return a.d - c.d; });
    return out.slice(0, Math.max(1, maxN || 1));
  }

  function pushShot(b, cx, cy, target, dmg, splash, dur) {
    S.shots.push({
      x1: cx, y1: cy, x2: target.x, y2: target.y,
      t: 0, dur: dur || (splash ? 0.6 : 0.14), kind: b.type,
      dmg: dmg, splash: splash || 0,
      onlyGround: !!b.def.onlyGround
    });
  }

  function hitUnit(u, dmg) {
    if (!u || u.hp <= 0) return;
    if (!isFinite(dmg) || dmg <= 0) return;
    if (heroShielded(u)) return;
    u.hp -= dmg;
    if (u.hp <= 0) {
      S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.4, kind: 'poof' });
    }
  }

  // Вихревой генератор: без урона отталкивает воздух на 1.5 тайла.
  function updateSweeper(b, dt) {
    if (b.cd > 0) b.cd -= dt * (((b.slowUntil || 0) > S.time) ? 0.5 : 1);
    if (b.cd > 0) return;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const targets = defenseTargets(b, cx, cy, 99);
    let pushed = 0;
    for (let i = 0; i < targets.length; i++) {
      const u = targets[i].u;
      if (!u.def.fly) continue;
      const dx = u.x - cx;
      const dy = u.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      u.x = clamp(u.x + dx / len * 1.5, 0, G - 0.001);
      u.y = clamp(u.y + dy / len * 1.5, 0, G - 0.001);
      u.path = null;
      pushed++;
    }
    if (!pushed) return;
    b.cd = 5;
    b.aim = Math.atan2(targets[0].u.y - cy, targets[0].u.x - cx);
    S.fx.push({ x: cx, y: cy, t: 0, dur: 0.5, kind: 'shot', size: 2 });
    if (!S.silent && CC.Sound) CC.Sound.play('mortarShot');
  }

  // Генератор поля: раз в 6 секунд криополе (заморозка 1.5 с) или токсин
  // (1% HP/с на 4 секунды). Режим чередуется.
  function updateSpellTower(b, dt) {
    if (b.cd > 0) b.cd -= dt * (((b.slowUntil || 0) > S.time) ? 0.5 : 1);
    if (b.cd > 0) return;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const targets = defenseTargets(b, cx, cy, 1);
    if (!targets.length) return;
    b.cd = 6;
    const t = targets[0].u;
    const r = 2.5;
    const mode = b.fieldMode % 2;
    b.fieldMode++;
    b.fieldUntil = S.time + (mode === 0 ? 1.5 : 4);
    b.aim = Math.atan2(t.y - cy, t.x - cx);

    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if (Math.hypot(u.x - t.x, u.y - t.y) > r) continue;
      if (mode === 0) u.freezeUntil = Math.max(u.freezeUntil || 0, S.time + 1.5);
      else u.poisonUntil = Math.max(u.poisonUntil || 0, S.time + 4);
    }
    S.fx.push({ x: t.x, y: t.y, t: 0, dur: 0.6, kind: 'reveal', size: r });
  }

  function updateDefense(b, dt) {
    if (b.dead || !b.def.range) return;

    // Заморозка заклинанием/криополем: оборона не стреляет.
    if ((b.freezeUntil || 0) > S.time) return;
    // Обрастание: оборона в поле не стреляет 6 секунд.
    if ((b.overgrowthUntil || 0) > S.time) return;

    // Оружие центра спит, пока ратуша не получила урон.
    if (b.def.thweapon && b.type === 'townhall' && !b.thActive) return;

    // ambush: пока не раскрылась — не стреляет и не выбирает цель.
    if (b.hidden && !b.revealed) {
      const r = b.def.revealRange || 2.5;
      const cx0 = b.x + b.w / 2;
      const cy0 = b.y + b.h / 2;
      let spotted = false;
      for (let i = 0; i < S.units.length; i++) {
        const u = S.units[i];
        if (u.hp <= 0) continue;
        if (Math.hypot(u.x - cx0, u.y - cy0) <= r) { spotted = true; break; }
      }
      if (!spotted) return;
      b.revealed = true;
      S.fx.push({ x: cx0, y: cy0, t: 0, dur: 0.45, kind: 'reveal', size: 1 });
    }

    // beam — непрерывный луч, без кулдауна: урон идёт каждый кадр.
    if (b.def.beam) {
      updateBeam(b, dt);
      return;
    }

    if (b.def.special === 'sweeper') {
      updateSweeper(b, dt);
      return;
    }
    if (b.def.special === 'spelltower') {
      updateSpellTower(b, dt);
      return;
    }

    if (b.cd > 0) b.cd -= dt * (((b.slowUntil || 0) > S.time) ? 0.5 : 1);
    if (b.cd > 0) return;

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const special = b.def.special || '';
    const maxTargets = special === 'multiarcher' ? 2 : 1;
    const targets = defenseTargets(b, cx, cy, maxTargets);
    if (!targets.length) return;
    const best = targets[0].u;

    b.cd = 1 / (b.def.rate || 1);
    b.aim = Math.atan2(best.y - cy, best.x - cx);

    if (!S.silent && CC.Sound) {
      if (b.def.splash) CC.Sound.play('mortarShot');
      else if (b.type === 'cannon') CC.Sound.play('cannonShot');
      else CC.Sound.play('archerShot');
    }

    // Залпы «Молота»: три снаряда по площади с интервалом 0.3 с.
    if (special === 'eagle') {
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 0.55;
        S.shots.push({
          x1: cx, y1: cy,
          x2: clamp(best.x + off, 0, G), y2: clamp(best.y - off, 0, G),
          t: -i * 0.3, dur: 0.6, kind: 'eagle',
          dmg: b.def.dmg, splash: b.def.splash || 1.5,
          onlyGround: !!b.def.onlyGround
        });
      }
      return;
    }

    // Картечь: три снаряда веером.
    if (special === 'scattershot') {
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 0.7;
        S.shots.push({
          x1: cx, y1: cy, x2: best.x + off, y2: best.y - off,
          t: 0, dur: 0.55, kind: 'scattershot',
          dmg: b.def.dmg, splash: b.def.splash || 1.2,
          onlyGround: !!b.def.onlyGround
        });
      }
      return;
    }

    // Спаренная вышка: две цели одновременно.
    if (special === 'multiarcher') {
      for (let i = 0; i < targets.length; i++) {
        hitUnit(targets[i].u, b.def.dmg);
        S.shots.push({
          x1: cx, y1: cy, x2: targets[i].u.x, y2: targets[i].u.y,
          t: 0, dur: 0.14, kind: b.type
        });
      }
      return;
    }

    // Рикошет: основной удар и два прыжка по -30%.
    if (special === 'ricochet') {
      hitUnit(best, b.def.dmg);
      const jumps = [];
      for (let i = 0; i < S.units.length; i++) {
        const u = S.units[i];
        if (u === best || u.hp <= 0) continue;
        if (b.def.onlyGround && u.def.fly) continue;
        const d = Math.hypot(u.x - best.x, u.y - best.y);
        if (d <= 3) jumps.push({ u: u, d: d });
      }
      jumps.sort(function (a, c) { return a.d - c.d; });
      let dmg = b.def.dmg * 0.7;
      for (let i = 0; i < Math.min(2, jumps.length); i++) {
        hitUnit(jumps[i].u, dmg);
        dmg *= 0.7;
      }
      S.shots.push({
        x1: cx, y1: cy, x2: best.x, y2: best.y,
        t: 0, dur: 0.14, kind: b.type
      });
      return;
    }

    // Обелиск: мощный одиночный удар и замедление на 3 секунды.
    if (special === 'monolith') {
      hitUnit(best, b.def.dmg);
      best.slowUntil = Math.max(best.slowUntil || 0, S.time + 3);
      pushShot(b, cx, cy, best, 0, 0, 0.18);
      return;
    }

    // Многоствольная башня: по земле два ствола, по воздуху один.
    let power = b.def.dmg || 0;
    if (special === 'multigear' && !best.def.fly) power *= 2;
    // Рельсотрон в воздушном режиме слабее на 40%.
    if (special === 'xbow' && best.def.fly) power *= 0.6;

    // Гаубица/плазмомёт/картечь не бьют сразу: снаряд летит в точку.
    if (b.def.splash) {
      pushShot(b, cx, cy, best, power, b.def.splash, 0.6);
      return;
    }

    hitUnit(best, power);
    pushShot(b, cx, cy, best, 0, 0, 0.14);
  }

  // Урон по площади от снаряда гаубицы/мага/мины.
  function splashDamage(x, y, dmg, radius, onlyGround, onlyAir) {
    const r = radius || 1.2;

    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if (onlyGround && u.def.fly) continue;
      if (onlyAir && !u.def.fly) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      // Неуязвимый герой под щитом пропускает урон по площади.
      if (heroShielded(u)) continue;

      u.hp -= dmg;
      if (u.hp <= 0) {
        S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.4, kind: 'poof' });
      }
    }

    S.fx.push({ x: x, y: y, t: 0, dur: 0.35, kind: 'boom', size: 1.2 });
    if (!S.silent && CC.Sound) CC.Sound.play('mortarHit');
  }

  // Добыча уровня: рукотворный пул, а не общий процент от всех построек.
  function levelLoot() {
    if (!LEVELS.length) return { gold: 0, elixir: 0, dark: 0 };
    const lvl = LEVELS[clamp(S.level, 0, LEVELS.length - 1)];
    return (lvl && lvl.loot) || { gold: 0, elixir: 0, dark: 0 };
  }

  // Остаток невысаженных войск возвращается в деревню, высаженные — потеряны.
  // Закрытые на текущем центре типы не трогаем: они могли остаться в старом
  // сейве и не должны исчезнуть из-за одного выхода в бой.
  function syncArmy() {
    if (!S || !CC.Game) return;
    // Просмотр повтора не трогает армию игрока: это чужая запись.
    if (S.viewReplay || S.kind === 'replay') return;
    if (CC.Game.setBattleArmy) CC.Game.setBattleArmy(S.army);
    else CC.Game.setArmy(S.army);
  }

  // Звёзды по правилам CoC: 50% построек, снос центра и 100% — по звезде.
  // Для прохода достаточно одной: победа больше не требует «центр + 50%».
  function starsFor(percent, thDead) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const reasons = [];
    if (pct >= 50) reasons.push('50% разрушено');
    if (thDead) reasons.push('центр уничтожен');
    if (pct >= 100) reasons.push('100%');
    return { stars: reasons.length, reasons: reasons };
  }

  function endBattle(win) {
    if (S.over) return;
    S.over = true;
    syncHeroState();

    const hall = S.buildings.find(function (b) { return b.type === 'townhall'; });
    const thDead = !!(hall && hall.dead);
    const starInfo = starsFor(S.percent, thDead);
    const stars = starInfo.stars;

    // Добыча — только из фактически снесённых зданий. Процент разрушений
    // больше не умножает пул: можно получить ноль звёзд, но унести склад.
    // Добираем здания, погашенные напрямую (тесты, инструменты, отладка).
    for (let i = 0; i < S.buildings.length; i++) {
      if (S.buildings[i].dead) collectBuildingLoot(S.buildings[i]);
    }

    const pool = S.lootPool || levelLoot();
    const lootPool = {
      gold: pool.gold || 0,
      elixir: pool.elixir || 0,
      dark: pool.dark || 0
    };
    const lootTaken = {
      gold: Math.max(0, Math.floor(S.lootTaken.gold || 0)),
      elixir: Math.max(0, Math.floor(S.lootTaken.elixir || 0)),
      dark: Math.max(0, Math.floor(S.lootTaken.dark || 0))
    };

    const replay = !!(S.campaign && CC.Game && CC.Game.clearedLevels &&
      CC.Game.clearedLevels().indexOf(S.level) !== -1);
    const firstClear = !!S.campaign && !replay;
    S.replay = replay;

    const lootOffered = {
      gold: lootTaken.gold,
      elixir: lootTaken.elixir,
      dark: lootTaken.dark
    };
    let loot = { gold: lootTaken.gold, elixir: lootTaken.elixir, dark: lootTaken.dark };
    let lootLost = { gold: 0, elixir: 0, dark: 0 };
    let gemsWon = 0;
    let allCleared = false;

    if (S.viewReplay || S.kind === 'replay') {
      // Повтор — только просмотр: ни добычи, ни прогресса, ни армии.
      loot = { gold: 0, elixir: 0, dark: 0 };
    } else if (S.campaign && CC.Game) {
      // Разграбленные здания запоминаем навсегда: в следующий заход
      // именно они будут пустыми. Пустые с прошлого раза не дублируем.
      for (let i = 0; i < S.lootedBuildings.length; i++) {
        const e = S.lootedBuildings[i];
        if (e.empty) continue;
        if ((e.gold || 0) + (e.elixir || 0) + (e.dark || 0) <= 0) continue;
        if (CC.Game.markLooted) CC.Game.markLooted(S.level, e.key);
      }

      if (win) {
        const prog = CC.Game.completeLevel(S.level);
        allCleared = !!(prog && prog.all);
        gemsWon = (prog && prog.gems) || 0;
      }

      // Добыча зачисляется даже при поражении: склад уже снесён.
      const added = CC.Game.addLoot(lootOffered);
      loot = {
        gold: added.gold,
        elixir: added.elixir,
        dark: added.dark || 0
      };
      lootLost = {
        gold: (added.lost && added.lost.gold) || 0,
        elixir: (added.lost && added.lost.elixir) || 0,
        dark: (added.lost && added.lost.dark) || 0
      };
      CC.Game.addStat('lootGold', loot.gold);
      CC.Game.addStat('lootDark', loot.dark);
      if (win) {
        CC.Game.addStat('battleWins', 1);
        CC.Game.addXp(20 + Math.min(30, Math.floor(S.percent * 0.3)));
      }
    }

    if (S.campaign && !S.viewReplay && S.kind !== 'replay' &&
        CC.Game && CC.Game.recordStars) {
      CC.Game.recordStars(S.level, stars);
    }

    const emptyLoot = S.lootedBuildings
      .filter(function (e) { return e.empty; })
      .map(function (e) { return { key: e.key, type: e.type, name: e.name }; });

    S.result = {
      win: win,
      stars: stars,
      starReasons: starInfo.reasons.slice(),
      percent: S.percent,
      thDead: thDead,
      time: S.time,
      loot: loot,
      lootOffered: lootOffered,
      lootLost: lootLost,
      lootPool: lootPool,
      lootTaken: lootTaken,
      lootedBuildings: S.lootedBuildings.slice(),
      emptyLoot: emptyLoot,
      // Совместимость со старыми окнами: бонусов и «недобора» больше нет.
      lootCut: { gold: 0, elixir: 0, dark: 0 },
      lootBonus: { gold: 0, elixir: 0, dark: 0 },
      lootShare: (lootTaken.gold + lootTaken.elixir + lootTaken.dark) > 0 ? 1 : 0,
      gems: gemsWon,
      level: S.level,
      replay: !!S.replay,
      firstClear: firstClear,
      spent: Math.max(0, armyCount(S.armyStart) - armyLeft()),
      allCleared: allCleared
    };

    // Звёзды идут в ежедневный контракт в любом бою игрока (кампания и арена).
    // Повтор уровня засчитывается не больше чем одной звездой (CC.DAILY.replayMax).
    // Headless-набеги и произвольные симуляции сюда не попадают.
    if (!S.headless && (S.kind === 'campaign' || S.kind === 'pvp') &&
        CC.Game && CC.Game.addDailyStars) {
      const cfg = CC.DAILY || {};
      const cap = S.replay ? Math.max(0, Number(cfg.replayMax) || 0) : stars;
      const add = Math.max(0, Math.min(stars, cap || 0));
      const d = CC.Game.addDailyStars(add);
      if (d) {
        S.result.daily = {
          added: add,
          progress: d.stars,
          target: d.target,
          bank: d.bank,
          ready: d.ready
        };
      }
    }

    if (S.campaign) {
      syncArmy();
      if (CC.Game) CC.Game.save();
    }
  }

  // Досрочный финал по кнопке «Завершить». Идём тем же путём, что и таймер:
  // текущий процент, звёзды, добыча, контракт, списание армии. Возвращает
  // результат или null, если бой уже окончен (повторный тап ничего не делает).
  function finishNow() {
    if (!S || S.over) return null;

    const hall = S.buildings.find(function (b) { return b.type === 'townhall'; });
    const thDead = !!(hall && hall.dead);
    const won = starsFor(S.percent, thDead).stars >= 1;
    endBattle(won);
    return S.result;
  }

  function armyLeft() {
    let n = 0;
    // Невысаженный герой не держит бой: армия кончилась — бой кончился.
    for (const k in S.army) if (k !== 'hero') n += S.army[k];
    return n;
  }

  function armyCount(map) {
    let n = 0;
    for (const k in map) n += map[k] | 0;
    return n;
  }

  // Живые герои в бою. S.hero остаётся ссылкой на первого из них для
  // старых тестов и рендера; способность работает, пока жив хоть один.
  function aliveHeroes() {
    const out = [];
    if (!S) return out;
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.isHero && u.hp > 0) out.push(u);
    }
    return out;
  }

  // Поля для рендера и панели: живой герой, остаток щита 0..1 и готовность
  // способности. Щит общий: тратится один раз за бой, после смерти всех
  // героев способность больше не доступна.
  function syncHeroState() {
    if (!S) return;

    const heroes = aliveHeroes();
    S.hero = heroes.length ? heroes[0] : null;
    S.heroDeployed = heroes.length > 0 || S.heroDeployed;

    const dur = Math.max(0.01, Number(HERO.ability && HERO.ability.duration) || 3);
    let left = 0;
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (h.shieldUntil > S.time) {
        left = Math.max(left, h.shieldUntil - S.time);
      }
    }
    S.heroShield = Math.min(1, left / dur);
    S.abilityReady = heroes.length > 0 && !S.abilityUsed && !S.over;
  }

  function heroShielded(u) {
    return !!(u && u.shieldUntil > S.time);
  }

  // Способность «Щит»: 3 секунды неуязвимости всем союзным юнитам в радиусе
  // 2.5 тайла от активировавшего героя; все живые герои получают щит всегда.
  // Один раз за бой, активируется любым живым героем.
  function heroAbility() {
    if (!S) return { error: 'Бой не начат' };
    if (S.over) return { error: 'Бой окончен' };

    const heroes = aliveHeroes();
    if (!heroes.length) return { error: 'Герой не высажен' };
    if (S.abilityUsed) return { error: 'Щит уже использован' };

    let h = null;
    if (S.selectedHero) {
      for (let i = 0; i < heroes.length; i++) {
        if (heroes[i].heroKind === S.selectedHero) { h = heroes[i]; break; }
      }
    }
    if (!h) h = heroes[0];

    const dur = Math.max(0.01, Number(HERO.ability && HERO.ability.duration) || 3);
    const radius = Math.max(0, Number(HERO.ability && HERO.ability.radius) || 2.5);
    const until = S.time + dur;

    // Щит получает каждый живой союзник в радиусе и каждый герой.
    // Дальние линейные юниты остаются без защиты: позиция в момент активации.
    const covered = [];
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      const d = u === h ? 0 : Math.hypot(u.x - h.x, u.y - h.y);
      if (!u.isHero && d > radius) continue;
      u.shieldUntil = until;
      covered.push(u.id);
    }

    h.abilityUsed = true;
    S.abilityUsed = true;

    syncHeroState();
    return {
      ok: true,
      duration: dur,
      until: until,
      radius: radius,
      heroId: h.id,
      covered: covered
    };
  }

  /* ---------- заклинания ---------- */

  function spellLevelFor(id, outside) {
    if (!CC.Game || !CC.Game.spellLevel) return 1;
    if (!outside && !playerLevelsActive()) return 1;
    const lv = Math.floor(Number(CC.Game.spellLevel(id)));
    return lv >= 1 ? lv : 1;
  }

  function spellDamageBuildings(x, y, dmg, radius) {
    const r = radius || 3;
    let hit = 0;
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      if (b.hidden && !b.revealed) continue;
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      if (Math.hypot(nx - x, ny - y) > r) continue;
      damageBuilding(b, dmg);
      hit++;
    }
    return hit;
  }

  function unitsInRadius(x, y, r) {
    const out = [];
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      out.push(u);
    }
    return out;
  }

  function buildingsInRadius(x, y, r) {
    const out = [];
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      if (b.hidden && !b.revealed) continue;
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      if (Math.hypot(nx - x, ny - y) > r) continue;
      out.push(b);
    }
    return out;
  }

  // Один общий конструктор героя для revive и будущих подкреплений.
  function makeHeroUnit(kind, level, x, y, hpRatio) {
    const heroDef = CC.heroDef ? CC.heroDef(kind) : { id: kind || 'barb', base: 'barb' };
    const baseDef = troopDef(heroDef.base || 'barb', 1);
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    const stats = (CC.Game && CC.Game.heroStatsFor)
      ? CC.Game.heroStatsFor(heroDef.id, lv)
      : (CC.heroStatsFor ? CC.heroStatsFor(heroDef.id, lv) : null);
    const hp = (stats && stats.hp) || baseDef.hp;
    const dmg = (stats && stats.dmg) || baseDef.dmg;
    const def = Object.assign({}, baseDef, {
      name: heroDef.name || baseDef.name,
      hero: true,
      heroKind: heroDef.id,
      hp: hp,
      dmg: dmg,
      speed: (stats && stats.speed) || baseDef.speed,
      range: (stats && stats.range) || baseDef.range,
      target: (stats && stats.target) || baseDef.target,
      fly: !!(stats && stats.fly),
      color: heroDef.color || baseDef.color
    });
    const u = {
      id: S.uid++,
      type: 'hero',
      def: def,
      x: clamp(x, 0, G - 0.001),
      y: clamp(y, 0, G - 0.001),
      hp: Math.max(1, Math.round(hp * (hpRatio === undefined ? 0.5 : hpRatio))),
      maxHp: hp,
      dmg: dmg,
      level: lv,
      cd: 0,
      atk: 0,
      target: null,
      path: null,
      isHero: true,
      heroKind: heroDef.id,
      base: heroDef.base,
      shieldUntil: 0,
      abilityUsed: false,
      reviveReady: false,
      spawnCd: 0,
      buffUntil: 0,
      rageUntil: 0,
      hasteUntil: 0,
      totemUntil: 0,
      heroicUntil: 0,
      angryUntil: 0,
      invisibleUntil: 0,
      slowUntil: 0,
      freezeUntil: 0,
      poisonUntil: 0,
      jumpUntil: 0
    };
    S.units.push(u);
    S.hero = u;
    S.heroDeployed = true;
    return u;
  }

  // Клонирование: до 10 места войск на 20 секунд. Герои/питомцы/осада не
  // копируются, копии не дают добычу и не призывают детей при смерти.
  function cloneUnitsAt(x, y, radius, maxSpace, seconds) {
    const max = maxSpace || 10;
    let used = 0;
    let made = 0;
    const srcs = unitsInRadius(x, y, radius).filter(function (u) {
      return !u.isHero && !u.isPet && !u.isSiege && !u.summoned && !u.isClone;
    });
    for (let i = 0; i < srcs.length && used < max; i++) {
      const src = srcs[i];
      const sp = Math.max(1, Number(src.def.space) || 1);
      if (used + sp > max) continue;
      used += sp;
      const clone = {
        id: S.uid++,
        type: src.type,
        def: Object.assign({}, src.def),
        x: clamp(src.x + (Math.random() - 0.5) * 0.8, 0, G - 0.001),
        y: clamp(src.y + (Math.random() - 0.5) * 0.8, 0, G - 0.001),
        hp: src.maxHp,
        maxHp: src.maxHp,
        dmg: src.dmg,
        level: src.level,
        cd: 0,
        atk: 0,
        target: null,
        path: null,
        summoned: true,
        isClone: true,
        expireAt: S.time + (seconds || 20),
        spawnCd: 0,
        buffUntil: 0,
        rageUntil: 0,
        hasteUntil: 0,
        totemUntil: 0,
        heroicUntil: 0,
        angryUntil: 0,
        invisibleUntil: 0,
        slowUntil: 0,
        freezeUntil: 0,
        poisonUntil: 0,
        jumpUntil: 0
      };
      S.units.push(clone);
      made++;
    }
    return made;
  }

  // Эвакуация: возвращает живые обычные войска в руку. Герой, питомцы,
  // осада, клоны и призванные юниты остаются в бою.
  function recallUnitsAt(x, y, radius) {
    let n = 0;
    for (let i = S.units.length - 1; i >= 0; i--) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      if (u.isHero || u.isPet || u.isSiege || u.summoned || u.isClone) continue;
      if (Math.hypot(u.x - x, u.y - y) > radius) continue;
      if (!S.army[u.type]) S.army[u.type] = 0;
      S.army[u.type]++;
      S.units.splice(i, 1);
      n++;
    }
    return n;
  }

  // Реанимация: последний павший герой встаёт с 50% HP. Если cleanup ещё
  // не успел убрать героя (hp<=0 прямо в массиве), забираем его оттуда.
  function reviveFallenAt(x, y) {
    let f = null;
    if (S.fallenHeroes && S.fallenHeroes.length) {
      f = S.fallenHeroes.pop();
    } else {
      for (let i = 0; i < S.units.length; i++) {
        const u = S.units[i];
        if (u.isHero && u.hp <= 0) {
          f = { kind: u.heroKind || 'barb', level: u.level || 1, x: u.x, y: u.y };
          S.units.splice(i, 1);
          break;
        }
      }
    }
    if (!f) return null;
    const u = makeHeroUnit(f.kind, f.level, x, y, 0.5);
    S.fx.push({ x: x, y: y, t: 0, dur: 0.8, kind: 'spell', size: 1.5 });
    return u;
  }

  function hasFallenHero() {
    if (S.fallenHeroes && S.fallenHeroes.length) return true;
    for (let i = 0; i < S.units.length; i++) {
      if (S.units[i].isHero && S.units[i].hp <= 0) return true;
    }
    return false;
  }

  function poisonBuildings(list, seconds) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.poisonUntil = Math.max(b.poisonUntil || 0, S.time + (seconds || 8));
      b.slowUntil = Math.max(b.slowUntil || 0, S.time + (seconds || 8));
      b.poisonDps = Math.max(1, b.maxHp * 0.05);
      b.poisonTick = 0;
    }
  }

  function freezeBuildings(list, seconds) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.freezeUntil = Math.max(b.freezeUntil || 0, S.time + (seconds || 4));
    }
  }


  // Высадка заклинания в точку. Реализованы все 19 эффектов из
  // COC-BATTLE-SPEC §6. Экзотика (clone/revive/invisibility) упрощена,
  // но работает в текущем движке.
  function deploySpell(id, gx, gy) {
    if (!S) return { error: 'Бой не начат' };
    if (S.over) return { error: 'Бой окончен' };
    if (S.viewReplay && !S.autoDeploy) return { error: 'Повтор без управления' };
    if (!S.spells) S.spells = {};
    if (!S.activeSpells) S.activeSpells = [];
    if (!S.spellLog) S.spellLog = [];
    if (!S.fallenHeroes) S.fallenHeroes = [];
    const type = String(id || '');
    if (!SPELLS[type]) return { error: 'Неизвестное заклинание' };
    if (!SPELL_READY[type]) return { error: 'Нет данных заклинания', id: type };
    const left = Math.floor(Number(S.spells[type]) || 0);
    if (left <= 0) return { error: 'Заклинание закончилось', id: type };

    const x = Number(gx);
    const y = Number(gy);
    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x >= G || y >= G) {
      return { error: 'За пределами поля' };
    }

    const lv = spellLevelFor(type);
    const st = CC.spellStats ? CC.spellStats(type, lv) : null;
    const radius = (st && st.radius) || 3;
    const dmg = (st && st.dmg) || 0;
    const dur = (st && st.dur) || 8;
    // Лечение в таблице CoC не оцифровано: базовая скорость 40%/с растёт
    // на 2% за уровень заклинания, чтобы прокачка ощущалась в бою.
    const healRate = Math.min(0.65, 0.4 + (lv - 1) * 0.02);
    const healBurst = Math.min(0.2, 0.1 + (lv - 1) * 0.01);

    // Проверки «нечего делать» до списания: не тратим заряд впустую.
    if (type === 'revive' && !hasFallenHero()) {
      return { error: 'Нет павшего героя', id: type };
    }
    if (type === 'clone') {
      const has = unitsInRadius(x, y, radius).some(function (u) {
        return !u.isHero && !u.isPet && !u.isSiege && !u.summoned;
      });
      if (!has) return { error: 'Нет войск для клонирования', id: type };
    }
    if (type === 'recall') {
      const has = unitsInRadius(x, y, radius).some(function (u) {
        return !u.isHero && !u.isPet && !u.isSiege && !u.summoned;
      });
      if (!has) return { error: 'Нет войск для эвакуации', id: type };
    }

    S.spells[type] = left - 1;
    const entry = {
      id: type,
      type: type,
      x: x,
      y: y,
      radius: radius,
      level: lv,
      until: S.time + dur
    };
    let result = { ok: true, id: type, x: x, y: y, radius: radius };

    if (type === 'lightning') {
      spellDamageBuildings(x, y, dmg || 150, radius);
      splashDamage(x, y, (dmg || 150) * 0.5, radius, false, false);
      entry.until = S.time + 0.4;
    } else if (type === 'healing') {
      entry.kind = 'healing';
      entry.rate = healRate;
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].hp = Math.min(list[i].maxHp, list[i].hp + list[i].maxHp * healBurst);
      }
    } else if (type === 'rage') {
      entry.kind = 'rage';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].rageUntil = Math.max(list[i].rageUntil || 0, entry.until);
        list[i].hasteUntil = Math.max(list[i].hasteUntil || 0, entry.until);
      }
    } else if (type === 'jump') {
      entry.kind = 'jump';
      entry.until = S.time + Math.max(10, dur);
      S.jumpUntil = Math.max(S.jumpUntil || 0, entry.until);
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].jumpUntil = Math.max(list[i].jumpUntil || 0, entry.until);
        list[i].path = null;
      }
      rebuild();
    } else if (type === 'freeze') {
      const freezeDur = (st && st.dur) || 4;
      entry.kind = 'freeze';
      entry.until = S.time + freezeDur;
      freezeBuildings(buildingsInRadius(x, y, radius), freezeDur);
    } else if (type === 'clone') {
      const cloneDur = Math.max(20, dur);
      const n = cloneUnitsAt(x, y, radius, 10, cloneDur);
      entry.kind = 'clone';
      entry.until = S.time + cloneDur;
      entry.count = n;
      result.count = n;
    } else if (type === 'invisibility') {
      entry.kind = 'invisibility';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].invisibleUntil = Math.max(list[i].invisibleUntil || 0, entry.until);
      }
      result.count = list.length;
    } else if (type === 'recall') {
      const n = recallUnitsAt(x, y, radius);
      entry.kind = 'recall';
      entry.until = S.time + 0.4;
      result.count = n;
    } else if (type === 'revive') {
      const hero = reviveFallenAt(x, y);
      entry.kind = 'revive';
      entry.until = S.time + 0.5;
      result.hero = hero ? hero.heroKind : null;
    } else if (type === 'totem') {
      entry.kind = 'totem';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].totemUntil = Math.max(list[i].totemUntil || 0, entry.until);
      }
    } else if (type === 'heroic') {
      entry.kind = 'heroic';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        if (!list[i].isHero) continue;
        list[i].heroicUntil = Math.max(list[i].heroicUntil || 0, entry.until);
      }
    } else if (type === 'angry') {
      entry.kind = 'angry';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].angryUntil = Math.max(list[i].angryUntil || 0, entry.until);
        list[i].hp = Math.max(1, list[i].hp * 0.7);
      }
    } else if (type === 'poison') {
      entry.kind = 'poison';
      entry.until = S.time + dur;
      poisonBuildings(buildingsInRadius(x, y, radius), dur);
    } else if (type === 'earthquake') {
      entry.kind = 'earthquake';
      entry.until = S.time + 0.5;
      const list = buildingsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const part = b.type === 'wall' ? 1 : 0.25;
        damageBuilding(b, b.maxHp * part);
      }
    } else if (type === 'haste') {
      entry.kind = 'haste';
      entry.until = S.time + dur;
      const list = unitsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].hasteUntil = Math.max(list[i].hasteUntil || 0, entry.until);
      }
    } else if (type === 'skeleton') {
      entry.kind = 'skeleton';
      entry.until = S.time + 0.5;
      result.count = spawnSummon({ x: x, y: y, type: 'skeleton' }, 'barb', 8, 0.5);
    } else if (type === 'bat') {
      entry.kind = 'bat';
      entry.until = S.time + 0.5;
      result.count = spawnSummon({ x: x, y: y, type: 'bat' }, 'minion', 8, 0.35, true);
    } else if (type === 'overgrowth') {
      const growDur = (st && st.dur) || 6;
      entry.kind = 'overgrowth';
      entry.until = S.time + growDur;
      const list = buildingsInRadius(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        list[i].overgrowthUntil = Math.max(list[i].overgrowthUntil || 0, entry.until);
      }
    } else if (type === 'iceblock') {
      let list = buildingsInRadius(x, y, radius);
      if (!list.length) list = buildingsInRadius(x, y, radius * 2.5);
      if (list.length) {
        list.sort(function (a, b) {
          const da = Math.hypot(a.x + a.w / 2 - x, a.y + a.h / 2 - y);
          const db = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
          return da - db;
        });
        freezeBuildings([list[0]], dur);
        result.target = list[0].type;
      }
      entry.kind = 'iceblock';
      entry.until = S.time + dur;
    }

    S.activeSpells.push(entry);
    S.spellLog.push({
      t: Math.round(S.time * 100) / 100,
      type: type,
      level: lv,
      x: x,
      y: y
    });
    S.fx.push({ x: x, y: y, t: 0, dur: 0.6, kind: 'spell', size: radius });
    if (!S.silent && CC.Sound) CC.Sound.play('upgradeDone');
    result.until = entry.until;
    result.level = lv;
    return result;
  }

  // Поля лечения/ярости/прыжка/тотема/героики живут во времени и
  // обновляются каждый кадр; мгновенные эффекты уже применены при высадке.
  function updateActiveSpells(dt) {
    if (!S.activeSpells || !S.activeSpells.length) return;
    for (let i = S.activeSpells.length - 1; i >= 0; i--) {
      const s = S.activeSpells[i];
      if (s.until <= S.time) { S.activeSpells.splice(i, 1); continue; }
      if (s.kind === 'healing') {
        for (let k = 0; k < S.units.length; k++) {
          const u = S.units[k];
          if (u.hp <= 0 || u.hp >= u.maxHp) continue;
          if (Math.hypot(u.x - s.x, u.y - s.y) > s.radius) continue;
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * (s.rate || 0.4) * dt);
        }
      } else if (s.kind === 'rage') {
        for (let k = 0; k < S.units.length; k++) {
          const u = S.units[k];
          if (u.hp <= 0) continue;
          if (Math.hypot(u.x - s.x, u.y - s.y) > s.radius) continue;
          u.rageUntil = Math.max(u.rageUntil || 0, s.until);
          u.hasteUntil = Math.max(u.hasteUntil || 0, s.until);
        }
      } else if (s.kind === 'jump') {
        for (let k = 0; k < S.units.length; k++) {
          const u = S.units[k];
          if (u.hp <= 0) continue;
          if (Math.hypot(u.x - s.x, u.y - s.y) > s.radius) continue;
          u.jumpUntil = Math.max(u.jumpUntil || 0, s.until);
        }
      } else if (s.kind === 'totem') {
        for (let k = 0; k < S.units.length; k++) {
          const u = S.units[k];
          if (u.hp <= 0) continue;
          if (Math.hypot(u.x - s.x, u.y - s.y) > s.radius) continue;
          u.totemUntil = Math.max(u.totemUntil || 0, s.until);
        }
      } else if (s.kind === 'heroic') {
        for (let k = 0; k < S.units.length; k++) {
          const u = S.units[k];
          if (!u.isHero || u.hp <= 0) continue;
          if (Math.hypot(u.x - s.x, u.y - s.y) > s.radius) continue;
          u.heroicUntil = Math.max(u.heroicUntil || 0, s.until);
        }
      }
    }
  }

  function selectSpell(id) {
    if (!S) return { error: 'Бой не начат' };
    if (!S.spells) S.spells = {};
    const type = String(id || '');
    if (!SPELLS[type]) return { error: 'Неизвестное заклинание' };
    if (!(Number(S.spells[type]) > 0)) {
      return { error: 'Заклинание закончилось', id: type };
    }
    S.selectedSpell = type;
    return { ok: true, id: type };
  }

  // Списки для панели P3: имена, роли, остатки, выбранное.
  function spellList() {
    const out = [];
    const th = (CC.Game && CC.Game.townhallLevel)
      ? CC.Game.townhallLevel() : CC.MAX_TH;
    Object.keys(SPELLS).forEach(function (id) {
      const s = SPELLS[id];
      out.push({
        id: id,
        name: s.name || id,
        role: s.role || '',
        level: spellLevelFor(id, !S),
        left: S ? Math.floor(Number(S.spells && S.spells[id]) || 0) : 0,
        selected: !!(S && S.selectedSpell === id),
        ready: !!SPELL_READY[id],
        unlocked: CC.spellMaxLevel ? CC.spellMaxLevel(id, th) > 0 : true
      });
    });
    return out;
  }

  function petList() {
    const out = [];
    const petDeployed = (S && S.petDeployed) || {};
    const assigned = (S && S.pets) || {};
    const th = (CC.Game && CC.Game.townhallLevel)
      ? CC.Game.townhallLevel() : CC.MAX_TH;
    Object.keys(PETS).forEach(function (id) {
      let heroKind = null;
      for (const k in assigned) if (assigned[k] === id) heroKind = k;
      const p = PETS[id];
      out.push({
        id: id,
        name: p.name || id,
        role: p.role || '',
        fly: !!p.fly,
        heal: !!p.heal,
        level: petLevelFor(id, !S),
        heroKind: heroKind,
        deployed: !!petDeployed[id],
        selected: !!(S && S.selectedPet === id),
        unlocked: CC.petMaxLevel ? CC.petMaxLevel(id, th) > 0 : true
      });
    });
    return out;
  }

  function siegeList() {
    const out = [];
    const current = S && (S.selectedSiege || (S.siege && S.siege[0]));
    Object.keys(SIEGE).forEach(function (id) {
      const s = SIEGE[id];
      out.push({
        id: id,
        name: s.name || id,
        role: s.role || '',
        minTh: s.minTh || 0,
        ready: !!SIEGE_READY[id],
        selected: !!(current && current === id),
        deployed: !!(current === id && S && S.siegeDeployed)
      });
    });
    return out;
  }

  // Выбор питомца: selectPet(petId) или selectPet(heroKind, petId).
  // Один питомец — один герой; повторное назначение переносит его.
  function selectPet(a, b) {
    if (!S) return { error: 'Бой не начат' };
    let heroKind = null;
    let petId = null;
    if (b !== undefined && b !== null) {
      heroKind = String(a || '');
      petId = String(b || '');
    } else {
      petId = String(a || '');
    }
    if (!PETS[petId]) return { error: 'Неизвестный питомец' };
    if (S.petDeployed && S.petDeployed[petId]) {
      return { error: 'Питомец уже в бою', id: petId };
    }
    if (!S.pets) S.pets = {};
    if (heroKind) {
      const h = CC.heroDef ? CC.heroDef(heroKind) : null;
      if (!h || h.id !== heroKind) return { error: 'Неизвестный герой' };
    } else {
      const list = CC.HEROES || [];
      for (let i = 0; i < list.length; i++) {
        if (!S.pets[list[i].id]) { heroKind = list[i].id; break; }
      }
      if (!heroKind) heroKind = (list[0] && list[0].id) || 'barb';
    }
    for (const k in S.pets) {
      if (k !== heroKind && S.pets[k] === petId) delete S.pets[k];
    }
    S.pets[heroKind] = petId;
    S.selectedPet = petId;
    return { ok: true, heroKind: heroKind, id: petId };
  }

  // Выбор осадной машины: одна на бой. Пустой id очищает слот.
  function selectSiege(id) {
    if (!S) return { error: 'Бой не начат' };
    const type = String(id || '');
    if (!type) {
      S.siege = [];
      S.selectedSiege = null;
      return { ok: true, id: null };
    }
    if (!SIEGE[type]) return { error: 'Неизвестная осадная машина' };
    if (!SIEGE_READY[type]) return { error: 'Нет данных осадной машины', id: type };
    if (S.siegeDeployed) return { error: 'Осада уже выехала', id: type };
    S.siege = [type];
    S.selectedSiege = type;
    return { ok: true, id: type };
  }

  // Эффекты смерти: детёныши/осколки/щенки, криополе, метеорит.
  function onUnitDeath(u) {
    if (!u || u.summoned) return;
    const d = u.def || {};
    const x = u.x;
    const y = u.y;

    if (d.spawn) {
      if (u.type === 'yeti') spawnSummon(u, 'barb', 2, 1.2);
      else if (u.type === 'golem') spawnSummon(u, 'barb', 2, 2);
      else if (u.type === 'lavahound') spawnSummon(u, 'minion', 6, 0.5, true);
      else if (u.type === 'witch') spawnSummon(u, 'barb', 3, 0.45);
      else if (u.type === 'furnace') spawnSummon(u, 'minion', 2, 0.35, true);
      else if (u.type === 'ruinwitch') spawnSummon(u, 'barb', 3, 0.8);
      else spawnSummon(u, 'barb', Math.min(6, d.spawn), 0.6);
    }

    // Взрыв при смерти: дрон-бомбардировщик и метеорит.
    if (d.splash && (u.type === 'airship' || u.type === 'meteorgolem')) {
      bombArea(x, y, (u.dmg || d.dmg || 0) * 0.5, d.splash);
      S.fx.push({ x: x, y: y, t: 0, dur: 0.6, kind: 'boom', size: d.splash });
    }

    // Криоголем оставляет криополе: оборона рядом замирает на 2 с.
    if (d.freeze) {
      for (let i = 0; i < S.buildings.length; i++) {
        const b = S.buildings[i];
        if (b.dead) continue;
        if (Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y) > 2.5) continue;
        b.freezeUntil = Math.max(b.freezeUntil || 0, S.time + 2);
      }
    }

    // Боевой дирижабль при смерти высаживает десант на 10 места.
    if (u.isSiege && u.siegeType === 'battleblimp') {
      spawnSummon(u, 'barb', 10, 0.6);
    }
  }

  function freeSpotNear(x, y, maxR) {
    const r = maxR || 4;
    const cx = clamp(Math.floor(x), 0, G - 1);
    const cy = clamp(Math.floor(y), 0, G - 1);
    for (let rad = 0; rad <= r; rad++) {
      for (let yy = cy - rad; yy <= cy + rad; yy++) {
        for (let xx = cx - rad; xx <= cx + rad; xx++) {
          if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
          if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== rad) continue;
          if (S.occ[cell(xx, yy)] >= 0) continue;
          return { x: xx, y: yy };
        }
      }
    }
    return null;
  }

  // Питомец героя: один вид на героя, не занимает места в армии.
  function spawnHeroPet(hero) {
    if (!hero || !hero.heroKind || !S.pets) return null;
    if (!S.petDeployed) S.petDeployed = {};
    const petId = S.pets[hero.heroKind];
    if (!petId || !PETS[petId] || S.petDeployed[petId]) return null;
    const petLv = petLevelFor(petId);
    const stats = CC.petStats ? CC.petStats(petId, petLv) : null;
    if (!stats) return null;
    const spot = freeSpotNear(hero.x, hero.y, 3);
    if (!spot) return null;
    const def = Object.assign({}, CC.PET_META && CC.PET_META[petId] || {},
      stats, { name: stats.name || petId, space: 0, target: 'any' });
    def.speed = stats.speed || 2.5;
    def.range = Math.max(1, stats.range || 1);
    def.petId = petId;
    // Уникальные роли питомцев.
    if (petId === 'yak') def.target = 'defense';
    if (petId === 'diggy') { def.miner = true; def.target = 'defense'; }
    if (petId === 'sneezy') def.splash = 1.5;
    if (petId === 'unicorn') def.heal = true;
    if (petId === 'phoenix') def.revive = true;
    if (petId === 'fox') def.teleport = true;
    if (petId === 'raven') def.steal = true;
    const u = {
      id: S.uid++,
      type: petId,
      def: def,
      x: spot.x + 0.5,
      y: spot.y + 0.5,
      hp: def.hp || 100,
      maxHp: def.hp || 100,
      dmg: def.dmg || 0,
      level: petLv,
      petLevel: petLv,
      cd: 0,
      atk: 0,
      target: null,
      path: null,
      isPet: true,
      ownerId: hero.id,
      ownerKind: hero.heroKind,
      teleported: false,
      expireAt: 0,
      spawnCd: 0,
      buffUntil: 0,
      rageUntil: 0,
      hasteUntil: 0,
      totemUntil: 0,
      heroicUntil: 0,
      angryUntil: 0,
      invisibleUntil: 0,
      slowUntil: 0,
      freezeUntil: 0,
      poisonUntil: 0,
      jumpUntil: 0
    };
    S.units.push(u);
    S.petDeployed[petId] = true;
    // Феникс даёт герою один шанс вернуться с 50% HP.
    if (petId === 'phoenix') hero.reviveReady = true;
    return u;
  }

  // Осадная машина выезжает вместе с первым десантом (один слот).
  // Все девять ролей из SIEGE_READY работают; неизвестный id просто
  // не занимает слот боя.
  function maybeDeploySiege(x, y) {
    if (!S.siege || !S.siege.length || S.siegeDeployed) return null;
    S.siegeDeployed = true;
    const id = S.siege[0];
    const extra = SIEGE_READY[id];
    if (!extra) return null;
    const spot = freeSpotNear(x, y, 4);
    if (!spot) return null;
    const def = Object.assign({
      name: (SIEGE[id] && SIEGE[id].name) || id,
      role: (SIEGE[id] && SIEGE[id].role) || '',
      color: '#9a8a6a', icon: '🚚', space: 0,
      splash: 0, target: 'any', fly: false, chain: 0, spawn: 0
    }, extra);
    const u = {
      id: S.uid++,
      type: id,
      def: def,
      x: spot.x + 0.5,
      y: spot.y + 0.5,
      hp: def.hp,
      maxHp: def.hp,
      dmg: def.dmg,
      cd: 0,
      atk: 0,
      target: null,
      path: null,
      isSiege: true,
      siegeType: id,
      expireAt: 0,
      spawnCd: 0,
      buffUntil: 0,
      rageUntil: 0,
      hasteUntil: 0,
      totemUntil: 0,
      heroicUntil: 0,
      angryUntil: 0,
      invisibleUntil: 0,
      slowUntil: 0,
      freezeUntil: 0,
      poisonUntil: 0,
      jumpUntil: 0
    };
    S.units.push(u);
    S.siegeUnit = u;
    S.selectedSiege = id;
    return u;
  }

  function update(dt) {
    if (!S) return;

    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      s.t += dt;
      // Площадные снаряды снимаем после детонации ниже; остальные — по
      // времени полёта. Отрицательный t у залпов «Молота» — задержка.
      if (!s.splash && s.t >= s.dur) S.shots.splice(i, 1);
    }
    for (let i = S.fx.length - 1; i >= 0; i--) {
      S.fx[i].t += dt;
      if (S.fx[i].t >= S.fx[i].dur) S.fx.splice(i, 1);
    }

    if (S.over) return;

    S.time += dt;
    // Бой не длится дольше лимита: без зажима накопленная дробная ошибка
    // даёт 180.000… и ломает проверки «время ≤ 180».
    if (S.time > S.limit) S.time = S.limit;

    // Прыжковое поле кончилось — стены снова дорогие.
    if (S.jumpUntil && S.jumpUntil <= S.time) {
      S.jumpUntil = 0;
      rebuild();
    }

    // Отложенная высадка набега и записанный повтор идут по своим временам.
    if (S.deployPlan && S.deployPlan.length) {
      S.autoDeploy = true;
      runDeployPlan();
      S.autoDeploy = false;
    }

    updateActiveSpells(dt);
    for (let i = 0; i < S.units.length; i++) updateUnit(S.units[i], dt);
    updateTraps(dt);
    for (let i = 0; i < S.buildings.length; i++) updateDefense(S.buildings[i], dt);

    // Детонатор, снесённый напрямую (тест/инструмент), тоже взрывается.
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (!b.dead || b.exploded || !b.def || b.def.special !== 'bombtower') continue;
      b.exploded = true;
      splashDamage(b.x + b.w / 2, b.y + b.h / 2,
        (b.def.dmg || 0) * 0.5, 1.5, true);
    }

    // Токсин на зданиях: 5% HP раз в секунду. Отдельный тик, чтобы не
    // звенеть звуком попадания каждый кадр.
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead || !((b.poisonUntil || 0) > S.time)) continue;
      b.poisonTick = (b.poisonTick || 0) + dt;
      while (b.poisonTick >= 1 && !b.dead) {
        b.poisonTick -= 1;
        damageBuilding(b, b.poisonDps || 1);
      }
    }

    // Площадные снаряды (гаубица, картечь, «Молот», плазмомёт) долетают
    // и накрывают площадь.
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      if (!s.splash || s.t < s.dur) continue;
      splashDamage(s.x2, s.y2, s.dmg, s.splash, s.onlyGround);
      S.shots.splice(i, 1);
    }

    for (let i = S.units.length - 1; i >= 0; i--) {
      const u = S.units[i];
      if (u.hp > 0) continue;
      // Феникс: герой один раз возвращается с половиной HP.
      if (u.isHero && u.reviveReady) {
        u.reviveReady = false;
        u.hp = Math.max(1, Math.round(u.maxHp * 0.5));
        u.cd = 0;
        S.fx.push({ x: u.x, y: u.y, t: 0, dur: 0.7, kind: 'poof' });
        continue;
      }
      onUnitDeath(u);
      if (u.isHero) {
        S.hero = null;
        if (!S.fallenHeroes) S.fallenHeroes = [];
        S.fallenHeroes.push({
          kind: u.heroKind || 'barb',
          level: u.level || 1,
          x: u.x,
          y: u.y
        });
      }
      S.units.splice(i, 1);
    }

    // Герой после смерти не возвращается: S.hero обнуляется, вторая
    // высадка невозможна до конца боя.
    syncHeroState();

    let aliveBuildings = 0;
    let hall = null;
    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.type === 'townhall') hall = b;
      if (!b.dead && b.type !== 'wall') aliveBuildings++;
    }

    // процент — только по постройкам, энергобарьеры в знаменатель не входят
    S.percent = S.total > 0
      ? Math.round((S.total - aliveBuildings) / S.total * 100)
      : 0;

    // Победа по звёздам: 50% построек, снос центра или 100% — любая звезда.
    // Звезда не останавливает бой: как в CoC, отряд добивает процент и может
    // дойти до 2★/3★ и полной добычи. Бой заканчивается только на 100%,
    // по таймеру или когда армия кончилась.
    const thDead = !!(hall && hall.dead);
    const won = starsFor(S.percent, thDead).stars >= 1;

    if (S.percent >= 100) endBattle(true);
    else if (S.time >= S.limit) endBattle(won);
    else if (!S.units.length && armyLeft() === 0) {
      // Пока есть заряд revive и павший герой, игрок ещё может вернуть
      // отряд — бой не обрываем. Без этого revive был бы недоступен.
      const canRevive = !!(S.fallenHeroes && S.fallenHeroes.length &&
        S.spells && S.spells.revive > 0);
      if (!canRevive) endBattle(won);
    }
  }

  /* ---------- действия игрока ---------- */

  function deploy(gx, gy) {
    if (!S) return { error: 'Бой не начат' };
    if (S.over) return { error: 'Бой окончен' };
    // В просмотре повтора управление выключено: высадкой занимается план.
    if (S.viewReplay && !S.autoDeploy) return { error: 'Повтор без управления' };

    // Сначала проверяем клетку: свободная высадка разрешена в любом месте
    // поля, кроме клеток, занятых постройкой (у зданий — все w×h клетки).
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (!isFinite(x) || !isFinite(y) ||
        x < 0 || y < 0 || x >= G || y >= G) {
      return { error: 'За пределами поля' };
    }

    const i = cell(x, y);
    if (S.occ[i] >= 0) return { error: 'Здесь стоит постройка' };

    const type = S.selected;
    // Ограничение касается только войск игрока в кампании и на арене.
    // Во headless-симуляции набега армия принадлежит нападающему.
    // Предпросмотр чужого уровня кампании (reset(i) из баланс-симулятора)
    // уже отфильтровал армию по верхней границе эпохи — не блокируем.
    const previewCampaign = S.kind === 'campaign' && CC.Game &&
      CC.Game.currentLevel && S.level !== CC.Game.currentLevel() &&
      (!CC.Game.selectedLevel || S.level !== CC.Game.selectedLevel());
    const hasVillage = !!(CC.Base && CC.Base.count &&
      CC.Base.count('townhall') > 0);
    if (!S.headless && !previewCampaign && hasVillage &&
        (S.kind === 'campaign' || S.kind === 'pvp') &&
        CC.Game && CC.troopUnlock) {
      const need = CC.troopUnlock(type);
      const th = typeof S.armyTh === 'number' ? S.armyTh : CC.Game.townhallLevel();
      if (need > th) {
        return { error: 'Откроется на ' + need + ' уровне центра' };
      }
    }
    if (type === 'hero') {
      const kind = S.selectedHero || firstHeroKind();
      if (!kind || !S.heroes || !(S.heroes[kind] > 0)) {
        return { error: 'Герой уже высажен' };
      }
    } else if (!S.army[type]) {
      return { error: 'Эти войска закончились' };
    }

    const isHero = type === 'hero';
    let heroKind = null;
    let heroDef = null;
    let baseDef = null;
    let troopLevel = 1;
    let heroLevel = 0;
    if (isHero) {
      heroKind = S.selectedHero || firstHeroKind();
      heroDef = CC.heroDef ? CC.heroDef(heroKind) : { id: heroKind, base: 'barb' };
      baseDef = troopDef(heroDef.base || 'barb', 1);
      // Новый API P1: у каждого героя свой уровень. Считываем до обнуления
      // карты высадки, иначе уровень потеряется.
      heroLevel = Math.floor(Number(S.heroes[heroKind])) || 1;
      if (heroLevel < 1) heroLevel = 1;
    } else {
      troopLevel = troopLevelFor(type);
      baseDef = troopDef(type, troopLevel);
      S.army[type]--;
    }
    if (isHero) {
      // Значение карты — индивидуальный уровень героя. После высадки
      // обнуляем: каждый вид героя доступен один раз за бой.
      S.heroes[heroKind] = 0;
      syncHeroFlag();
    }
    // Повтор и headless-прогон ставят бойцов ровно в записанную клетку.
    const jitter = (S.headless || S.viewReplay) ? 0 : 0.3;

    let hp = baseDef.hp;
    let dmg = baseDef.dmg;
    if (isHero) {
      const stats = CC.Game && CC.Game.heroStatsFor
        ? CC.Game.heroStatsFor(heroKind, heroLevel)
        : (CC.heroStatsFor ? CC.heroStatsFor(heroKind, heroLevel) : null);
      if (stats && stats.hp) {
        hp = stats.hp;
        dmg = stats.dmg;
      }
    }

    // Герой рисуется как type 'hero' (художник получит heroKind), но
    // скорость/дальность/цель/полёт берёт у базового войска.
    const unitDef = isHero
      ? Object.assign({}, baseDef, {
        name: heroDef.name,
        hero: true,
        heroKind: heroKind,
        hp: hp,
        dmg: dmg,
        speed: (CC.heroStatsFor
          ? (CC.heroStatsFor(heroKind, heroLevel) || {}).speed
          : baseDef.speed) || baseDef.speed,
        range: (CC.heroStatsFor
          ? (CC.heroStatsFor(heroKind, heroLevel) || {}).range
          : baseDef.range) || baseDef.range,
        target: (CC.heroStatsFor
          ? (CC.heroStatsFor(heroKind, heroLevel) || {}).target
          : baseDef.target) || baseDef.target,
        fly: !!(CC.heroStatsFor &&
          (CC.heroStatsFor(heroKind, heroLevel) || {}).fly),
        color: heroDef.color || baseDef.color
      })
      : baseDef;

    const unit = {
      id: S.uid++,
      type: type,
      def: unitDef,
      x: x + 0.5 + (Math.random() - 0.5) * jitter,
      y: y + 0.5 + (Math.random() - 0.5) * jitter,
      hp: hp,
      maxHp: hp,
      dmg: dmg,
      level: isHero ? heroLevel : troopLevel,
      cd: 0,
      atk: 0,
      target: null,
      path: null,
      spawnCd: 0,
      expireAt: 0,
      buffUntil: 0,
      rageUntil: 0,
      hasteUntil: 0,
      totemUntil: 0,
      heroicUntil: 0,
      angryUntil: 0,
      invisibleUntil: 0,
      slowUntil: 0,
      freezeUntil: 0,
      poisonUntil: 0,
      jumpUntil: 0
    };

    if (isHero) {
      unit.isHero = true;
      unit.heroKind = heroKind;
      unit.base = heroDef.base;
      unit.shieldUntil = 0;
      unit.abilityUsed = false;
      S.hero = unit;
      S.heroDeployed = true;
    }

    S.units.push(unit);
    if (isHero) {
      syncHeroState();
      spawnHeroPet(unit);
    }

    // Осадная машина выезжает вместе с первым десантом (один слот).
    if (S.siege && S.siege.length && !S.siegeDeployed) {
      maybeDeploySiege(unit.x, unit.y);
    }

    // Запись высадки для истории набега и повтора. Время — игровое.
    S.deployLog.push({
      t: Math.round(S.time * 100) / 100,
      type: type,
      heroKind: heroKind,
      level: isHero ? heroLevel : troopLevel,
      x: x,
      y: y
    });
    S.deployedCount++;

    return { ok: true, hp: hp, dmg: dmg, level: isHero ? heroLevel : troopLevel };
  }

  // Высадка из записанного плана: если клетка уже занята (база изменилась),
  // ищем ближайшую свободную — повтор не должен зависать.
  function deployPlanned(entry) {
    if (!entry || !TROOPS[entry.type]) return false;
    let x = Math.floor(Number(entry.x));
    let y = Math.floor(Number(entry.y));
    if (!isFinite(x) || !isFinite(y)) return false;

    if (x < 0 || y < 0 || x >= G || y >= G || S.occ[cell(x, y)] >= 0) {
      let best = null;
      let bd = Infinity;
      for (let yy = 0; yy < G; yy++) {
        for (let xx = 0; xx < G; xx++) {
          if (S.occ[cell(xx, yy)] >= 0) continue;
          const d = Math.hypot(xx - x, yy - y);
          if (d < bd) { bd = d; best = { x: xx, y: yy }; }
        }
      }
      if (!best) return false;
      x = best.x;
      y = best.y;
    }

    select(entry.type, entry.heroKind);
    const res = deploy(x + 0.5, y + 0.5);
    return !!(res && res.ok);
  }

  // Очередь записанных высадок (повтор) и отложенный деплой headless-набега.
  function runDeployPlan() {
    if (!S || !S.deployPlan || !S.deployPlan.length) return;
    while (S.deployPlan.length && S.time + 1e-9 >= Number(S.deployPlan[0].t || 0)) {
      const entry = S.deployPlan.shift();
      deployPlanned(entry);
    }
  }

  function select(type, heroKind) {
    if (type === 'hero') {
      const kind = heroKind && CC.heroDef ? CC.heroDef(heroKind).id : null;
      if (kind && (!S.heroes || !(kind in S.heroes))) return;
      S.selected = 'hero';
      S.selectedHero = kind || firstHeroKind() || 'barb';
      return;
    }
    if (TROOPS[type]) {
      S.selected = type;
      S.selectedHero = firstHeroKind();
    }
  }

  // Шаг «кисти» при зажатой ЛКМ/пальце. Решает, пора ли высаживать юнита:
  // только новая клетка, не чаще ~85 мс. Чистая функция без DOM — тесты
  // проверяют её напрямую, а ui.js лишь передаёт координаты курсора.
  const PAINT_MS = 85;
  function paintPlan(info) {
    const x = Math.floor(Number(info && info.x));
    const y = Math.floor(Number(info && info.y));
    const now = Number(info && info.now);

    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x >= G || y >= G) {
      return { deploy: false, x: x, y: y, reason: 'outside' };
    }

    if (info.lastX === x && info.lastY === y) {
      return { deploy: false, x: x, y: y, reason: 'same-cell' };
    }

    const gap = Number(info.gapMs) > 0 ? Number(info.gapMs) : PAINT_MS;
    const lastAt = Number(info.lastAt);
    if (isFinite(lastAt) && lastAt > 0 && isFinite(now) && now - lastAt < gap) {
      return { deploy: false, x: x, y: y, reason: 'throttle' };
    }

    return { deploy: true, x: x, y: y, reason: null };
  }

  // Автовысадка всех войск на краю, ближайшем к командном центре (headless-набег).
  // schedule=true раскладывает высадку по времени: так в историю попадает
  // настоящий лог, а повтор показывает подходящие отряды, а не всех сразу.
  function autoDeploy(schedule, stepSec) {
    if (!S) return 0;

    const hall = S.buildings.find(function (b) { return b.type === 'townhall'; });
    const cx = hall ? hall.x + hall.w / 2 : G / 2;
    const cy = hall ? hall.y + hall.h / 2 : G / 2;

    const edges = [
      { x0: 0, y0: 0, x1: G - 1, y1: 0 },
      { x0: 0, y0: G - 1, x1: G - 1, y1: G - 1 },
      { x0: 0, y0: 0, x1: 0, y1: G - 1 },
      { x0: G - 1, y0: 0, x1: G - 1, y1: G - 1 }
    ];

    let best = null;

    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      const cells = [];

      for (let i = 0; i < S.deployable.length; i++) {
        if (!S.deployable[i]) continue;

        const x = i % G;
        const y = (i / G) | 0;
        const onEdge = (ed.y0 === ed.y1 && y === ed.y0 &&
          x >= Math.min(ed.x0, ed.x1) && x <= Math.max(ed.x0, ed.x1)) ||
          (ed.x0 === ed.x1 && x === ed.x0 &&
            y >= Math.min(ed.y0, ed.y1) && y <= Math.max(ed.y0, ed.y1));
        if (!onEdge) continue;

        cells.push({ x: x, y: y, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
      }

      if (!cells.length) continue;
      cells.sort(function (a, b) { return a.d - b.d; });

      if (!best || cells[0].d < best[0].d) best = cells;
    }

    let lane = best ? best.slice(0, Math.min(best.length, 8)) : [];

    if (!lane.length) {
      for (let i = 0; i < S.deployable.length && lane.length < 8; i++) {
        if (S.deployable[i]) lane.push({ x: i % G, y: (i / G) | 0 });
      }
    }

    if (!lane.length) return 0;

    let placed = 0;
    let k = 0;
    // Сначала тяжёлые и старые типы, затем все остальные из ARMY_ORDER:
    // новые 32 войска тоже должны высаживаться в headless-набеге.
    const order = ['giant', 'gnome', 'barb', 'archer', 'airship', 'goblin'];
    const all = (CC.ARMY_ORDER || []).slice();
    for (let i = 0; i < all.length; i++) {
      if (order.indexOf(all[i]) === -1) order.push(all[i]);
    }
    const step = Math.max(0.05, Number(stepSec) || 0.45);
    const plan = [];

    for (let t = 0; t < order.length; t++) {
      const type = order[t];
      const count = S.army[type] | 0;

      for (let i = 0; i < count; i++) {
        const spot = lane[k % lane.length];
        if (schedule) {
          plan.push({
            t: Math.round(placed * step * 100) / 100,
            type: type,
            x: spot.x,
            y: spot.y
          });
        } else {
          select(type);
          const res = deploy(spot.x + 0.5, spot.y + 0.5);
          if (res.error) break;
        }
        placed++;
        k++;
      }
    }

    if (schedule) {
      S.deployPlan = plan;
      // Армия пока не тронута: её спишет каждая высадка из плана.
      return placed;
    }
    return placed;
  }

  // Просмотр повтора: обычный бой на текущей базе игрока, но десант идёт
  // по записанным временам, а управления нет. kind='replay' отключает
  // добычу, прогресс и списание армии.
  function startReplay(desc) {
    const d = desc || {};
    const rows = (d.buildings || []).filter(function (b) {
      return b && DEFS[b.type];
    }).map(function (b) {
      return {
        type: b.type, x: b.x, y: b.y, level: b.level,
        // Добыча в повторе не начисляется, даже если снимок её содержал.
        lootGold: 0, lootElixir: 0, lootDark: 0
      };
    });

    const log = (Array.isArray(d.log) ? d.log : []).map(function (e) {
      return {
        t: Math.max(0, Number(e.t) || 0),
        type: e.type,
        heroKind: e.heroKind || null,
        x: Math.floor(Number(e.x) || 0),
        y: Math.floor(Number(e.y) || 0)
      };
    }).filter(function (e) { return !!TROOPS[e.type]; });
    log.sort(function (a, b) { return a.t - b.t; });

    // Повтор должен высадить того же героя: собираем карту по логу.
    const heroes = {};
    log.forEach(function (e) {
      if (e.type === 'hero') heroes[e.heroKind || 'barb'] = 1;
    });
    const army = Object.assign({}, d.army || {});
    if (Object.keys(heroes).length) army.heroes = heroes;

    return start({
      buildings: rows,
      army: army,
      kind: 'replay',
      levelName: d.name || 'Повтор нападения',
      loot: { gold: 0, elixir: 0, dark: 0 },
      limit: d.limit || CC.TIME_LIMIT,
      viewReplay: true,
      deployPlan: log
    });
  }

  // Headless-симуляция произвольной базы. Возвращает итог и восстанавливает
  // текущее состояние (если игрок в это время был в бою).
  function simulate(desc, options) {
    const o = options || {};
    const prev = S;
    const buildings = (desc && desc.buildings ? desc.buildings : []).filter(function (b) {
      return b && DEFS[b.type];
    });

    if (!buildings.length) {
      return {
        percent: 0, thDead: false, win: false, time: 0,
        result: null, placed: 0, destroyed: []
      };
    }

    try {
      // ИИ набега героя не использует: даже если снимок пришёл с hero,
      // в симуляцию он не попадает.
      const raidArmy = Object.assign({}, desc.army || {});
      delete raidArmy.hero;
      delete raidArmy.heroes;

      const state = start({
        buildings: buildings,
        army: raidArmy,
        kind: 'raid',
        levelName: desc.name || 'Набег',
        loot: desc.loot || { gold: 0, elixir: 0, dark: 0 },
        limit: desc.limit || o.limit || CC.TIME_LIMIT,
        silent: true
      });

      state.headless = true;
      // Высадка идёт по времени: лог набега затем проигрывается повтором.
      autoDeploy(true, o.deployStep || 0.45);

      const step = o.step || 1 / 15;
      const maxSteps = Math.ceil(state.limit / step) + 10;
      let guard = 0;

      while (!state.over && guard++ < maxSteps) update(step);
      if (!state.over) endBattle(false);

      const result = state.result;
      // Снесённые здания отдаём наружу: набег считает по ним выбитую
      // ёмкость складов, а не долю от процента разрушений.
      const destroyed = state.buildings.filter(function (b) {
        return b && b.dead;
      }).map(function (b) {
        return {
          type: b.type,
          x: b.x,
          y: b.y,
          level: b.level,
          key: b.key
        };
      });

      return {
        percent: state.percent,
        thDead: !!(result && result.thDead),
        win: !!(result && result.win),
        time: state.time,
        result: result,
        placed: state.deployedCount,
        destroyed: destroyed,
        log: state.deployLog.slice(),
        traps: {
          total: state.traps.length,
          triggered: state.traps.filter(function (t) { return t.triggered; }).length,
          list: state.traps.map(function (t) {
            return {
              type: t.type,
              x: t.x,
              y: t.y,
              level: t.level,
              armed: t.armed,
              triggered: t.triggered
            };
          })
        }
      };
    } finally {
      S = prev;
    }
  }

  return {
    get state() { return S; },
    reset: newState,
    start: start,
    startReplay: startReplay,
    simulate: simulate,
    update: update,
    deploy: deploy,
    select: select,
    deploySpell: deploySpell,
    selectSpell: selectSpell,
    spellList: spellList,
    petList: petList,
    siegeList: siegeList,
    selectPet: selectPet,
    selectSiege: selectSiege,
    deploySiege: function (gx, gy) {
      if (!S) return { error: 'Бой не начат' };
      if (S.over) return { error: 'Бой окончен' };
      if (S.siegeDeployed) return { error: 'Осада уже выехала' };
      const x = isFinite(Number(gx)) ? Number(gx) : G / 2;
      const y = isFinite(Number(gy)) ? Number(gy) : G / 2;
      const u = maybeDeploySiege(x, y);
      if (!u) return { error: 'Осадная машина недоступна', id: S.siege[0] || null };
      return { ok: true, id: u.type, unit: u };
    },
    deployPaintMs: PAINT_MS,
    paintPlan: paintPlan,
    heroAbility: heroAbility,
    syncArmy: syncArmy,
    finishNow: finishNow,
    starsFor: starsFor,
    cellCount: G * G
  };
})();
