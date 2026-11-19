/* Симуляция боя: юниты, постройки, стрельба, победа/поражение. */
window.CC = window.CC || {};

CC.Battle = (function () {
  'use strict';

  const G = CC.GRID;
  const DEFS = CC.BUILDINGS;
  const TROOPS = CC.TROOPS;
  const HERO = CC.HERO || {
    id: 'hero', minTh: 5, maxLevel: 10,
    ability: { name: 'Щит', duration: 3, uses: 1 }
  };
  const LEVELS = CC.LEVELS || [];

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

  // Герой доступен только после открытия (TH5+) и если он есть в деревне.
  // В headless-прогонах и на чужой базе героя нет.
  function heroAvailable(th) {
    if (!TROOPS.hero) return false;
    const level = typeof th === 'number' ? Math.round(th) : 1;
    if (level < (HERO.minTh || 5)) return false;
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
      // Герой не входит в ARMY_ORDER: он не тратит места и не тренируется.
      // В бою это отдельный слот «1», который сгорает после высадки.
      hero: null,
      heroDeployed: false,
      heroShield: 0,
      abilityUsed: false,
      abilityReady: false,
      selected: 'barb',
      level: o.level || 0,
      levelId: o.levelId || 0,
      levelName: o.levelName || 'Бой',
      levelLoot: o.loot || { gold: 0, elixir: 0 },
      lootPool: o.loot || { gold: 0, elixir: 0 },
      // Фактически унесённое из разрушенных зданий. Заполняется сразу при
      // сносе, а не процентом в конце боя.
      lootTaken: { gold: 0, elixir: 0 },
      lootedBuildings: [],
      kind: o.kind || 'custom',
      campaign: o.kind === 'campaign',
      // Просмотр повтора набега: бой идёт сам, управление выключено.
      viewReplay: !!o.viewReplay,
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

    // Герой приходит отдельным полем снимка. Максимум один за бой:
    // даже испорченный снимок с hero: 99 даёт ровно одного Сержанта.
    if (o.army && Number(o.army.hero) > 0 && TROOPS.hero) {
      S.army.hero = 1;
    }

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
      // Герой идёт только в настоящий бой игрока: баланс-симулятор и
      // предпросмотр чужой эпохи его не получают.
      if (!preview && hasVillage && heroAvailable(armyTh)) {
        army.hero = 1;
      }
    } else {
      army = Object.assign({}, CC.START_ARMY);
    }

    const pool = lvl
      ? { gold: (lvl.loot && lvl.loot.gold) || 0, elixir: (lvl.loot && lvl.loot.elixir) || 0 }
      : { gold: 0, elixir: 0 };

    // Раскладываем пул уровня по конкретным зданиям: 60% в хранилища,
    // 25% в центр, 15% в буры/реакторы. План считается по той же
    // детерминированной раскладке, поэтому ключи стабильны между заходами.
    const plan = CC.Loot && CC.Loot.distribute
      ? CC.Loot.distribute(pool, layout)
      : {};
    const rows = layout.map(function (r) {
      const key = CC.lootKey
        ? CC.lootKey(r[0], r[1], r[2])
        : r[0] + ':' + r[1] + ':' + r[2];
      const part = plan[key] || { gold: 0, elixir: 0 };
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
      limit: CC.TIME_LIMIT
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
      loot: d.loot || { gold: 0, elixir: 0 },
      limit: d.limit || CC.TIME_LIMIT,
      silent: !!d.silent,
      viewReplay: !!d.viewReplay,
      deployPlan: d.deployPlan || []
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
      // Добыча конкретного здания и стабильный ключ для прогресса.
      key: (meta && meta.key) || (CC.lootKey ? CC.lootKey(type, x, y) : type + ':' + x + ':' + y),
      lootGold: Math.max(0, Math.floor(Number(meta && meta.lootGold) || 0)),
      lootElixir: Math.max(0, Math.floor(Number(meta && meta.lootElixir) || 0)),
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
      capacity: d.capacity || 4,
      maxUnitSpace: d.maxUnitSpace || 2
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
        S.costs[i] = S.buildings[oi].type === 'wall' ? 8 : Infinity;
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

    const limit = Math.min(candidates.length, 6);
    for (let i = 0; i < limit; i++) {
      const p = CC.Path.find(S.costs, G, G, sx, sy, candidates[i].x, candidates[i].y);
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

    for (let i = 0; i < S.buildings.length; i++) {
      const b = S.buildings[i];
      if (b.dead) continue;
      // Скрытая засада не выбирается целью, пока не раскрылась.
      if (b.hidden && !b.revealed) continue;
      if (pref === 'defense' && !b.def.range) continue;
      if (pref === 'resource' && !b.def.resource) continue;

      // Летающие не видят энергобарьеры: они не цель и не препятствие.
      if (b.type === 'wall' && u.def.fly) continue;

      const d = distToBuilding(u.x, u.y, b);

      // Стены — не цель, а препятствие: ломаем их, только если больше
      // нечего бить. Иначе отряд застревает, грызя кольцо по кирпичу.
      if (pref === 'any' && b.type === 'wall') {
        if (d < wd) { wd = d; wall = b; }
        continue;
      }

      if (d < bd) { bd = d; best = b; }
    }

    if (pref === 'any' && !best) best = wall;

    // если любимых целей не осталось — бьём что попало
    if (!best && pref !== 'any') {
      for (let i = 0; i < S.buildings.length; i++) {
        const b = S.buildings[i];
        if (b.dead) continue;
        if (b.hidden && !b.revealed) continue;
        const d = distToBuilding(u.x, u.y, b);
        if (d < bd) { bd = d; best = b; }
      }
    }

    u.target = best;
    u.path = null;
  }

  // Забрать добычу здания ровно один раз. Вызывается сразу при сносе, а
  // в финале добирает всё, что тесты/инструменты погасили напрямую.
  function collectBuildingLoot(b) {
    if (!b || b.lootCollected) return;
    b.lootCollected = true;

    const gold = Math.max(0, Math.floor(Number(b.lootGold) || 0));
    const elixir = Math.max(0, Math.floor(Number(b.lootElixir) || 0));
    if (!gold && !elixir && !b.emptyLoot) return;

    S.lootTaken.gold += gold;
    S.lootTaken.elixir += elixir;
    S.lootedBuildings.push({
      key: b.key,
      type: b.type,
      name: (DEFS[b.type] && DEFS[b.type].name) || b.type,
      gold: gold,
      elixir: elixir,
      empty: !!b.emptyLoot
    });

    // С этого момента здание пустое — даже если бой ещё не закончился.
    b.lootGold = 0;
    b.lootElixir = 0;
  }

  function damageBuilding(b, amount) {
    if (b.dead) return;
    b.hp -= amount;

    const kind = b.type === 'wall' ? 'wall' : 'building';
    if (!S.silent && CC.Sound) CC.Sound.play('hit', undefined, kind);

    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      collectBuildingLoot(b);
      S.fx.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0, dur: 0.55, kind: 'boom', size: b.w * b.h });
      if (!S.silent && CC.Sound) CC.Sound.play('destroy', undefined, kind);
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

  function updateUnit(u, dt) {
    const d = u.def;
    // Урон берём с юнита: уровень войск уже умножен при высадке.
    const dmg = isFinite(u.dmg) ? u.dmg : d.dmg;
    if (u.cd > 0) u.cd -= dt;
    if (u.atk > 0) u.atk -= dt;

    if (u.target && u.target.dead) {
      u.target = null;
      u.path = null;
    }

    // в радиусе — бьём
    if (u.target && distToBuilding(u.x, u.y, u.target) <= d.range) {
      u.path = null;
      if (u.cd <= 0) {
        u.cd = 1;
        u.atk = 0.18;
        if (d.splash) bombBuildings(u.target, dmg, d.splash);
        else {
          const bonus = u.target.type === 'wall' ? (d.wallBonus || 1) : 1;
          damageBuilding(u.target, dmg * bonus);
        }
      }
      return;
    }

    if (!u.target) {
      pickTarget(u);
      if (!u.target) return;
    }

    // Летающие идут напрямую к цели: A* и энергобарьеры им не нужны.
    if (d.fly) {
      const tx = u.target.x + u.target.w / 2;
      const ty = u.target.y + u.target.h / 2;
      const dx = tx - u.x;
      const dy = ty - u.y;
      const len = Math.hypot(dx, dy);
      const mv = d.speed * dt;

      if (len <= mv || len < 0.001) {
        u.x = tx;
        u.y = ty;
      } else {
        u.x += dx / len * mv;
        u.y += dy / len * mv;
      }
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
        const tx = u.target.x + u.target.w / 2;
        const ty = u.target.y + u.target.h / 2;
        const dx = tx - u.x;
        const dy = ty - u.y;
        const len = Math.hypot(dx, dy) || 1;
        const mv = d.speed * dt;
        u.x += dx / len * mv;
        u.y += dy / len * mv;
        return;
      }
    }

    const step = u.path[0];
    const oi = S.occ[cell(step.x, step.y)];

    if (oi >= 0) {
      const blocker = S.buildings[oi];
      if (blocker && !blocker.dead) {
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
    const mv = d.speed * dt;

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
      if (b.def.onlyGround && u.def.fly) continue;
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

  // Ловушки. Срабатывают один раз, когда вражеский юнит входит в радиус.
  // В процент и цели не входят; после срабатывания armed=false.
  function updateTraps() {
    for (let t = 0; t < S.traps.length; t++) {
      const trap = S.traps[t];
      if (!trap.armed) continue;

      const cx = trap.x + 0.5;
      const cy = trap.y + 0.5;
      const kind = trap.def.trapKind || 'ground';

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

      // Мины: сначала ищем подходящую цель в радиусе взведения.
      let hit = false;
      for (let i = 0; i < S.units.length; i++) {
        const u = S.units[i];
        if (u.hp <= 0) continue;
        if (kind === 'ground' && u.def.fly) continue;
        if (kind === 'air' && !u.def.fly) continue;
        if (Math.hypot(u.x - cx, u.y - cy) > trap.radius) continue;
        hit = true;
        break;
      }
      if (!hit) continue;

      trap.armed = false;
      trap.triggered = true;
      trap.revealed = true;

      // Урон по площади: mine бьёт только землю, airmine — только воздух.
      // Базовый splashDamage умеет фильтр «только земля», для воздуха
      // передаём отдельный флаг.
      const dmg = trap.dmg || trap.def.dmg || 0;
      splashDamage(cx, cy, dmg, trap.splash || 0, kind === 'ground', kind === 'air');
      S.fx.push({ x: cx, y: cy, t: 0, dur: 0.5, kind: 'trapBoom', size: trap.splash || 1 });
    }
  }

  function updateDefense(b, dt) {
    if (b.dead || !b.def.range) return;

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

    if (b.cd > 0) b.cd -= dt;
    if (b.cd > 0) return;

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    let best = null;
    let bd = Infinity;

    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      if (u.hp <= 0) continue;
      // Турели и гаубицы по воздуху не стреляют.
      if (b.def.onlyGround && u.def.fly) continue;
      const d = Math.hypot(u.x - cx, u.y - cy);
      if (d > b.def.range) continue;
      if (b.def.minRange && d < b.def.minRange) continue;
      if (d < bd) { bd = d; best = u; }
    }

    if (!best) return;

    b.cd = 1 / (b.def.rate || 1);
    b.aim = Math.atan2(best.y - cy, best.x - cx);

    if (!S.silent && CC.Sound) {
      if (b.def.splash) CC.Sound.play('mortarShot');
      else if (b.type === 'cannon') CC.Sound.play('cannonShot');
      else CC.Sound.play('archerShot');
    }

    // Гаубица не бьёт сразу: снаряд летит в точку и накрывает площадь.
    if (b.def.splash) {
      S.shots.push({
        x1: cx, y1: cy, x2: best.x, y2: best.y,
        t: 0, dur: 0.6, kind: b.type,
        dmg: b.def.dmg, splash: b.def.splash,
        onlyGround: !!b.def.onlyGround
      });
      return;
    }

    if (!heroShielded(best)) best.hp -= b.def.dmg;

    S.shots.push({
      x1: cx, y1: cy, x2: best.x, y2: best.y,
      t: 0, dur: 0.14, kind: b.type
    });

    if (best.hp <= 0) {
      S.fx.push({ x: best.x, y: best.y, t: 0, dur: 0.4, kind: 'poof' });
    }
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
    if (!LEVELS.length) return { gold: 0, elixir: 0 };
    const lvl = LEVELS[clamp(S.level, 0, LEVELS.length - 1)];
    return (lvl && lvl.loot) || { gold: 0, elixir: 0 };
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
    const lootPool = { gold: pool.gold || 0, elixir: pool.elixir || 0 };
    const lootTaken = {
      gold: Math.max(0, Math.floor(S.lootTaken.gold || 0)),
      elixir: Math.max(0, Math.floor(S.lootTaken.elixir || 0))
    };

    const replay = !!(S.campaign && CC.Game && CC.Game.clearedLevels &&
      CC.Game.clearedLevels().indexOf(S.level) !== -1);
    const firstClear = !!S.campaign && !replay;
    S.replay = replay;

    const lootOffered = { gold: lootTaken.gold, elixir: lootTaken.elixir };
    let loot = { gold: lootTaken.gold, elixir: lootTaken.elixir };
    let lootLost = { gold: 0, elixir: 0 };
    let gemsWon = 0;
    let allCleared = false;

    if (S.viewReplay || S.kind === 'replay') {
      // Повтор — только просмотр: ни добычи, ни прогресса, ни армии.
      loot = { gold: 0, elixir: 0 };
    } else if (S.campaign && CC.Game) {
      // Разграбленные здания запоминаем навсегда: в следующий заход
      // именно они будут пустыми. Пустые с прошлого раза не дублируем.
      for (let i = 0; i < S.lootedBuildings.length; i++) {
        const e = S.lootedBuildings[i];
        if (e.empty) continue;
        if ((e.gold || 0) + (e.elixir || 0) <= 0) continue;
        if (CC.Game.markLooted) CC.Game.markLooted(S.level, e.key);
      }

      if (win) {
        const prog = CC.Game.completeLevel(S.level);
        allCleared = !!(prog && prog.all);
        gemsWon = (prog && prog.gems) || 0;
      }

      // Добыча зачисляется даже при поражении: склад уже снесён.
      const added = CC.Game.addLoot(lootOffered);
      loot = { gold: added.gold, elixir: added.elixir };
      lootLost = added.lost || { gold: 0, elixir: 0 };
      CC.Game.addStat('lootGold', loot.gold);
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
      lootCut: { gold: 0, elixir: 0 },
      lootBonus: { gold: 0, elixir: 0 },
      lootShare: (lootTaken.gold + lootTaken.elixir) > 0 ? 1 : 0,
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

  // Поля для рендера и панели: живой герой, остаток щита 0..1 и готовность
  // способности. Щит тратится один раз за бой, после смерти героя — нет.
  function syncHeroState() {
    if (!S) return;

    const h = S.hero;
    const alive = !!(h && h.hp > 0 && S.units.indexOf(h) !== -1);
    if (!alive && h) S.hero = null;

    const dur = Math.max(0.01, Number(HERO.ability && HERO.ability.duration) || 3);
    const left = alive ? Math.max(0, h.shieldUntil - S.time) : 0;
    S.heroShield = Math.min(1, left / dur);
    S.abilityReady = alive && !S.abilityUsed && !S.over;
  }

  function heroShielded(u) {
    return !!(u && u.shieldUntil > S.time);
  }

  // Способность «Щит»: 3 секунды неуязвимости, один раз за бой.
  function heroAbility() {
    if (!S) return { error: 'Бой не начат' };
    if (S.over) return { error: 'Бой окончен' };

    const h = S.hero;
    if (!h || h.hp <= 0) return { error: 'Герой не высажен' };
    if (S.abilityUsed || h.abilityUsed) return { error: 'Щит уже использован' };

    const dur = Math.max(0.01, Number(HERO.ability && HERO.ability.duration) || 3);
    h.shieldUntil = S.time + dur;
    h.abilityUsed = true;
    S.abilityUsed = true;

    syncHeroState();
    return { ok: true, duration: dur, until: h.shieldUntil };
  }

  function update(dt) {
    if (!S) return;

    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      s.t += dt;
      if (s.kind !== 'mortar' && s.t >= s.dur) S.shots.splice(i, 1);
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

    // Отложенная высадка набега и записанный повтор идут по своим временам.
    if (S.deployPlan && S.deployPlan.length) {
      S.autoDeploy = true;
      runDeployPlan();
      S.autoDeploy = false;
    }

    for (let i = 0; i < S.units.length; i++) updateUnit(S.units[i], dt);
    updateTraps();
    for (let i = 0; i < S.buildings.length; i++) updateDefense(S.buildings[i], dt);

    // Снаряды гаубицы долетают и накрывают площадь.
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      if (s.kind !== 'mortar' || s.t < s.dur) continue;
      splashDamage(s.x2, s.y2, s.dmg, s.splash, s.onlyGround);
      S.shots.splice(i, 1);
    }

    for (let i = S.units.length - 1; i >= 0; i--) {
      if (S.units[i].hp <= 0) {
        if (S.units[i].isHero) S.hero = null;
        S.units.splice(i, 1);
      }
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
    else if (!S.units.length && armyLeft() === 0) endBattle(won);
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
    if (type === 'hero' && S.heroDeployed) {
      return { error: 'Герой уже высажен' };
    }
    if (!S.army[type]) return { error: 'Эти войска закончились' };

    const d = TROOPS[type];
    const isHero = type === 'hero';
    S.army[type]--;
    // Повтор и headless-прогон ставят бойцов ровно в записанную клетку.
    const jitter = (S.headless || S.viewReplay) ? 0 : 0.3;

    // Уровень войск игрока действует только в его атаках (кампания и Арена).
    // Набег ИИ и headless-симуляции остаются на 1 уровне: пороги баланса
    // и сложность набегов не должны зависеть от прокачки игрока.
    // Герой сильнее линейных войск и считается по своей линейной формуле.
    let mult = 1;
    if (!S.headless && (S.kind === 'campaign' || S.kind === 'pvp') &&
        CC.Game && CC.Game.troopMultiplier) {
      mult = CC.Game.troopMultiplier(type);
    }
    if (!isFinite(mult) || mult < 1) mult = 1;

    let hp = d.hp * mult;
    let dmg = d.dmg * mult;
    let heroLevel = 0;
    if (isHero) {
      heroLevel = CC.Game && CC.Game.heroLevel ? CC.Game.heroLevel() : 1;
      if (!(heroLevel >= 1)) heroLevel = 1;
      const stats = CC.Game && CC.Game.heroStats
        ? CC.Game.heroStats(heroLevel)
        : { hp: d.hp, dmg: d.dmg };
      hp = stats.hp;
      dmg = stats.dmg;
    }

    const unit = {
      id: S.uid++,
      type: type,
      def: d,
      x: x + 0.5 + (Math.random() - 0.5) * jitter,
      y: y + 0.5 + (Math.random() - 0.5) * jitter,
      hp: hp,
      maxHp: hp,
      dmg: dmg,
      cd: 0,
      atk: 0,
      target: null,
      path: null
    };

    if (isHero) {
      unit.isHero = true;
      unit.level = heroLevel;
      unit.shieldUntil = 0;
      unit.abilityUsed = false;
      S.hero = unit;
      S.heroDeployed = true;
      S.abilityUsed = false;
    }

    S.units.push(unit);
    if (isHero) syncHeroState();

    // Запись высадки для истории набега и повтора. Время — игровое.
    S.deployLog.push({
      t: Math.round(S.time * 100) / 100,
      type: type,
      x: x,
      y: y
    });
    S.deployedCount++;

    return { ok: true };
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

    select(entry.type);
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

  function select(type) {
    if (TROOPS[type]) S.selected = type;
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
    const order = ['giant', 'barb', 'archer', 'goblin', 'airship', 'gnome'];
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
        lootGold: 0, lootElixir: 0
      };
    });

    const log = (Array.isArray(d.log) ? d.log : []).map(function (e) {
      return {
        t: Math.max(0, Number(e.t) || 0),
        type: e.type,
        x: Math.floor(Number(e.x) || 0),
        y: Math.floor(Number(e.y) || 0)
      };
    }).filter(function (e) { return !!TROOPS[e.type]; });
    log.sort(function (a, b) { return a.t - b.t; });

    return start({
      buildings: rows,
      army: d.army || {},
      kind: 'replay',
      levelName: d.name || 'Повтор нападения',
      loot: { gold: 0, elixir: 0 },
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
      return { percent: 0, thDead: false, win: false, time: 0, result: null, placed: 0 };
    }

    try {
      // ИИ набега героя не использует: даже если снимок пришёл с hero,
      // в симуляцию он не попадает.
      const raidArmy = Object.assign({}, desc.army || {});
      delete raidArmy.hero;

      const state = start({
        buildings: buildings,
        army: raidArmy,
        kind: 'raid',
        levelName: desc.name || 'Набег',
        loot: desc.loot || { gold: 0, elixir: 0 },
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
      return {
        percent: state.percent,
        thDead: !!(result && result.thDead),
        win: !!(result && result.win),
        time: state.time,
        result: result,
        placed: state.deployedCount,
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
    heroAbility: heroAbility,
    syncArmy: syncArmy,
    finishNow: finishNow,
    starsFor: starsFor,
    cellCount: G * G
  };
})();
