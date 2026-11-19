/* Настройки и баланс. */
window.CC = window.CC || {};

CC.GRID = 36;          // поле 36x36
CC.TW = 54;            // ширина тайла (ромб)
CC.TH = 27;            // высота тайла
CC.TIME_LIMIT = 180;   // секунд на бой

/* Стартовая заставка «Колония»: посадочный модуль падает, врезается
   в грунт, раскрывается в командный центр, вспыхивают огни, поднимается
   турель, камера отъезжает — база ожила. Сцену рисует canvas
   (CC.Render.drawIntro), а длительности фаз читают ui.js и художник.
   Все значения в мс, total = сумма пяти фаз = 6500 мс. */
CC.INTRO = {
  flag: 'clash-intro-v1', // старый флаг «уже видел»: только для миграции
  offFlag: 'clash-intro-off-v1', // постоянный отказ от заставки
  fallMs: 2500,           // is-fall: падение модуля к грунту
  impactMs: 500,          // is-impact: удар, пыль, трещины
  unfoldMs: 1500,         // is-unfold: раскрытие в командный центр
  revealMs: 1200,         // is-reveal: огни, турель, отъезд камеры, титул
  titleMs: 800,           // is-title: титул держится и гаснет
  reducedMs: 400,         // prefers-reduced-motion: статичный кадр и фейд
  reducedFrameMs: 200,    // статичный кадр берётся за 200 мс до конца
  safetyMs: 8000          // страховка: снять блокировку, даже если сцена упала
};

/* Постройки. w/h — размер в тайлах, height — высота коробки в пикселях. */
CC.BUILDINGS = {
  townhall: {
    name: 'Командный центр', desc: 'сердце базы, открывает всё',
    w: 2, h: 2, hp: 1800, height: 54,
    color: '#b8793c', top: '#e0a869'
  },
  cannon: {
    name: 'Турель', desc: 'стреляет по земле',
    w: 1, h: 1, hp: 1200, height: 30,
    color: '#6d7278', top: '#9aa1a8',
    range: 5.8, dmg: 42, rate: 1.3, onlyGround: true
  },
  archer: {
    name: 'Лазерная вышка', desc: 'бьёт по земле и воздуху',
    w: 1, h: 1, hp: 1000, height: 56,
    color: '#8a6b48', top: '#c2a077',
    range: 6.6, dmg: 25, rate: 1.7, targetsAir: true
  },
  mortar: {
    name: 'Гаубица', desc: 'навесной огонь по площади',
    w: 1, h: 1, hp: 450, height: 30,
    color: '#5b4a3a', top: '#9d7c55',
    range: 9, minRange: 2.5, dmg: 45, rate: 0.5, splash: 1.2,
    onlyGround: true
  },
  airdef: {
    name: 'Зенитный комплекс', desc: 'только по воздуху',
    w: 1, h: 1, hp: 900, height: 42,
    color: '#586b74', top: '#9fb8c4',
    range: 7.5, dmg: 55, rate: 0.8, targetsAir: true
  },
  mage: {
    name: 'Плазменная башня', desc: 'плазма по площади',
    w: 1, h: 1, hp: 780, height: 52,
    color: '#684a72', top: '#c08ad0',
    range: 6, dmg: 32, rate: 0.7, splash: 1.1, targetsAir: true
  },
  // Поздние обороны: 1x1, обычные постройки (входят в процент и блокируют
  // высадку). ambush скрыта до подхода, beam — непрерывный луч с разгоном.
  ambush: {
    name: 'Засадная турель', desc: 'скрыта до подхода врага',
    w: 1, h: 1, hp: 900, height: 40,
    color: '#4f6252', top: '#9fb8a2',
    range: 6, dmg: 55, rate: 1.2, onlyGround: true,
    hidden: true, revealRange: 2.5
  },
  beam: {
    name: 'Орбитальный луч', desc: 'луч усиливается со временем',
    w: 1, h: 1, hp: 700, height: 54,
    color: '#3f5a78', top: '#8fd4ff',
    range: 7, dmg: 30, rate: 1, targetsAir: true,
    beam: true, ramp: 0.25, rampMax: 3
  },
  // Ловушки: 1x1, в процент не входят, высадку и путь не блокируют,
  // добычи не дают, срабатывают один раз. hp не используется — ловушка
  // не цель, поэтому 1.
  mine: {
    name: 'Мина', desc: 'взрыв под ногами',
    w: 1, h: 1, hp: 1, height: 10,
    color: '#5f4a32', top: '#d76a3c',
    trap: true, trapKind: 'ground', radius: 0.9,
    splash: 1.2, dmg: 120
  },
  spring: {
    name: 'Пружина', desc: 'подбрасывает лёгких бойцов',
    w: 1, h: 1, hp: 1, height: 10,
    color: '#5b6066', top: '#c9d3dc',
    trap: true, trapKind: 'spring', radius: 1.0,
    capacity: 4, maxUnitSpace: 2
  },
  airmine: {
    name: 'Воздушная мина', desc: 'взрыв против дронов',
    w: 1, h: 1, hp: 1, height: 10,
    color: '#3f4a60', top: '#7fc4ff',
    trap: true, trapKind: 'air', radius: 0.9,
    splash: 1.5, dmg: 200
  },
  wall: {
    name: 'Энергобарьер', desc: 'держит врага, не пропускает',
    w: 1, h: 1, hp: 190, height: 18,
    color: '#8d877d', top: '#b3ada2'
  },
  goldmine: {
    name: 'Бур', desc: 'копит ресурс — руду',
    w: 1, h: 1, hp: 500, height: 26, resource: true,
    color: '#7d6a4f', top: '#d9b24a'
  },
  elixir: {
    name: 'Реактор', desc: 'копит ресурс — энергию',
    w: 1, h: 1, hp: 500, height: 26, resource: true,
    color: '#5d4b6b', top: '#b06fd0'
  },
  // Два разных склада: старый storage теперь хранит только руду,
  // estorage — только энергию. Командный центр ёмкости не даёт.
  storage: {
    name: 'Хранилище руды', desc: 'хранит только руду',
    w: 1, h: 1, hp: 600, height: 28, resource: true, store: 'gold',
    color: '#77644a', top: '#d0ad6a'
  },
  estorage: {
    name: 'Хранилище энергии', desc: 'хранит только энергию',
    w: 1, h: 1, hp: 600, height: 28, resource: true, store: 'elixir',
    color: '#4a5a74', top: '#7fc4ff'
  },
  barracks: {
    name: 'Ангар', desc: 'даёт места и тренирует',
    w: 2, h: 2, hp: 700, height: 34,
    color: '#7b5a3a', top: '#c9a06a'
  }
};

/* Ловушка ли это. Один предикат для базы, боя, генератора и интерфейса:
   типы не должны расходиться между файлами. */
CC.TRAP_TYPES = ['mine', 'spring', 'airmine'];
CC.isTrap = function (type) {
  const d = CC.BUILDINGS[type];
  return !!(d && d.trap);
};

/* Войска. target: any | defense | resource.
   space — сколько места занимает в армии, cost — энергия, time — секунды тренировки.
   desc — короткая роль для карточки в ангаре (3–7 слов). */
CC.TROOPS = {
  barb: {
    name: 'Штурмовик', desc: 'танк, идёт первым',
    icon: '🪖', hp: 110, dmg: 22, speed: 2.4,
    range: 0.9, color: '#e0663c', target: 'any',
    space: 1, cost: 20, time: 5
  },
  archer: {
    name: 'Лазерщик', desc: 'бьёт издалека по всем',
    icon: '🔫', hp: 60, dmg: 14, speed: 2.8,
    range: 3.6, color: '#63b352', target: 'any',
    space: 1, cost: 35, time: 7
  },
  giant: {
    name: 'Мех', desc: 'танк, ломает турели',
    icon: '🤖', hp: 600, dmg: 55, speed: 1.5,
    range: 1.0, color: '#a8703f', target: 'defense',
    space: 4, cost: 120, time: 25
  },
  goblin: {
    name: 'Мародёр', desc: 'грабит буры и реакторы',
    icon: '🦾', hp: 70, dmg: 22, speed: 3.2,
    range: 0.9, color: '#8fce3f', target: 'resource',
    space: 1, cost: 25, time: 6
  },
  airship: {
    name: 'Дрон-бомбардировщик', desc: 'летит и бомбит по площади',
    icon: '🛸', hp: 900, dmg: 120, speed: 0.85,
    range: 1.2, color: '#c46a3f', target: 'any', fly: true,
    splash: 1.2, space: 6, cost: 220, time: 45
  },
  gnome: {
    name: 'Подрывник', desc: 'рвёт энергобарьеры в клочья',
    icon: '🧨', hp: 70, dmg: 16, speed: 3.4,
    range: 0.8, color: '#d9a05b', target: 'wall',
    wallBonus: 4, space: 1, cost: 60, time: 8
  },
  // Герой не тренируется и не занимает места в армии: он всегда доступен
  // после открытия и восстанавливается между боями. Характеристики по
  // уровню считает CC.Game.heroStats(), а здесь — базовые значения.
  hero: {
    name: 'Сержант', desc: 'щит на 3 с для союзников, один раз за бой',
    icon: '🎖️', hp: 1000, dmg: 80, speed: 2.0,
    range: 1.2, color: '#c9a227', target: 'any',
    space: 0, cost: 0, time: 0, hero: true
  }
};

CC.ARMY_ORDER = ['barb', 'archer', 'giant', 'goblin', 'gnome', 'airship'];

/* Постепенное открытие войск по уровню командного центра:
   раз в два уровня — новый вид. На TH1 доступен только штурмовик. */
CC.TROOP_UNLOCK = {
  barb: 1,
  archer: 2,
  giant: 4,
  goblin: 6,
  gnome: 8,
  airship: 10,
  // Герой открывается отдельно от линейки войск — на TH5.
  hero: 5
};

// Уровень центра, с которого открыт тип войск (0 — неизвестный тип).
CC.troopUnlock = function (type) {
  return CC.TROOP_UNLOCK[type] || 0;
};

/* ---------- прокачка войск ----------
   У каждого войска свой уровень 1..10, потолок — уровень командного центра
   (TH1 — 1, TH10 — 10). Качается в ангаре, без отдельной постройки.
   Цена и время считаются для ЦЕЛЕВОГО уровня to (2..10):
     цена  = cost × 12   × 1.55^(to − 2)  энергии
     время = time × 6    × 1.5^(to − 2)   секунд
   Цена округляется до десятков, время — до 5 секунд (как у построек).
   Эффект мультипликативный: HP и урон × 1.12^(уровень − 1).
   Один слот исследования на всю деревню; строителей не занимает. */
CC.TROOP_LEVEL = {
  max: 10,
  costFactor: 12,
  costGrowth: 1.55,
  timeFactor: 6,
  timeGrowth: 1.5,
  bonus: 0.12
};

/* ---------- герой «Сержант» ----------
   Открывается с командного центра 5 уровня. Уровень героя 1..10, потолок
   равен уровню центра (TH5 — 1..5, TH10 — 10). Прокачка идёт в отдельном
   слоте ангара, строителей не занимает и не пересекается с исследованием
   войск. Цена считается до целевого уровня to (2..10):
     руда = 1500 × 1.5^(to − 1)
   Время задано таблицей: 2 — 30 мин, 3 — 1 ч, 4 — 2 ч, 5 — 4 ч,
   6 — 6 ч, 7 — 8 ч, 8 — 12 ч, 9 — 16 ч, 10 — 24 ч.
   HP и урон растут линейно: 1000 + 200×(уровень − 1), 80 + 15×(уровень − 1).
   Способность «Щит» — 3 секунды неуязвимости всем союзным юнитам в радиусе
   2.5 тайла (включая героя), один раз за бой. */
CC.HERO = {
  id: 'hero',
  minTh: 5,
  maxLevel: 10,
  costBase: 1500,
  costGrowth: 1.5,
  hpBase: 1000,
  hpPerLevel: 200,
  dmgBase: 80,
  dmgPerLevel: 15,
  speed: 2.0,
  range: 1.2,
  ability: {
    name: 'Щит',
    duration: 3,
    radius: 2.5,
    uses: 1,
    key: 'Q',
    hint: 'Щит 3 с на союзников · 1 раз за бой'
  },
  costs: {},
  times: {
    2: 30 * 60,
    3: 60 * 60,
    4: 2 * 60 * 60,
    5: 4 * 60 * 60,
    6: 6 * 60 * 60,
    7: 8 * 60 * 60,
    8: 12 * 60 * 60,
    9: 16 * 60 * 60,
    10: 24 * 60 * 60
  }
};

(function () {
  for (let l = 2; l <= CC.HERO.maxLevel; l++) {
    CC.HERO.costs[l] = Math.round(
      CC.HERO.costBase * Math.pow(CC.HERO.costGrowth, l - 1)
    );
  }
})();

/* Стартовая армия: новый игрок начинает без войск, ангар выдаётся
   обучением Сержанта. Ноль во всех полях — база совместимости для
   старых сейвов и тестов. */
CC.START_ARMY = { barb: 0, archer: 0, giant: 0, goblin: 0, gnome: 0, airship: 0 };

/* ---------- экономика ---------- */

CC.ECONOMY = {
  // Новый игрок начинает с нулём ресурсов и без складов: лимиты 0.
  // Стартовый запас выдаёт Сержант после постановки двух складов.
  startGold: 0,
  startElixir: 0,
  // Первый груз обучения после двух складов (и запас при пропуске).
  tutorialGold: 800,
  tutorialElixir: 800,
  // Старый сейв только с раскладкой (без деревни) получает прежний запас.
  startLegacyGold: 800,
  startLegacyElixir: 800,
  offlineCap: 8 * 3600,     // максимум секунд оффлайна, которые начисляются
  // Ёмкость даёт только склад: командный центр не хранит ресурсы.
  // baseCap оставлен нулём для старых сейвов и внешних читателей.
  baseCap: 0,
  // За уровень склада: руда — по складам руды, энергия — по складам энергии.
  // TH1 с одним складом каждого типа даёт 1700/1500.
  storageCap: { gold: 1700, elixir: 1500 },
  // 1.5 цены и 1.45 времени за уровень: к 10 уровню защита стоит 10-15 тыс.
  // руды и качается 15-20 минут, а не 150 тыс. и полдня.
  growth: { cost: 1.5, time: 1.45 },
  maxLevel: 10
};

/* Устаревшая доля повтора. Раньше она множила пул уровня; теперь добыча
   привязана к постройкам, а повтор просто оставляет разграбленные здания
   пустыми. Поле оставлено для совместимости со старыми сейвами и тестами. */
CC.REPLAY_LOOT = 0.28;

/* ---------- локальный PvP (Арена) ----------
   Пул «призраков» строится детерминированно из seed: одинаковый seed даёт
   одинаковые базы. На серверном этапе seed заменит id игрока. */
CC.PVP = {
  poolSize: 20,
  seedBase: 20261118,
  startRating: 1000,
  battleLimit: 180,
  findCooldown: 10000,   // мс между «Найти других»
  recentLimit: 6,        // сколько последних соперников не повторять
  findAttempts: 20,      // максимум попыток поиска (расширение окна)
  winBase: 16,
  winMin: 12,
  winMax: 20,
  lossBase: -10,
  lossMin: -12,
  lossMax: -8,
  xpWin: 20,
  xpPerPercent: 0.3,
  xpLoss: 5
};

/* ---------- платина (премиум-валюта) ----------
   Внутренний ключ остался gems ради старых сейвов и API, но в интерфейсе
   валюта называется только платиной. */

CC.GEMS = {
  start: 50,
  perQuest: 1,
  perLevel: 1,
  // Потолок ускорения: не больше 80 платин за одну кнопку.
  // Цена = min(80, max(1, ceil(остаток / 300))).
  speed: { secondsPerGem: 300, min: 1, max: 80 },
  /* Обмен: 1 платина даёт всё больше ресурсов с ростом центра.
     руда    = 250 + 100 × (TH − 1)
     энергия = 200 +  80 × (TH − 1)
     Курс округляется до 10. */
  exchange: {
    gold: 250,
    elixir: 200,
    perTh: { gold: 100, elixir: 80 }
  }
};

/* Наборы покупки ресурсов за платину. Бонус — множитель к базовому курсу:
   1 платина — без бонуса, 10 — +10%, 100 — +25%. Итог округляется до 10.
   Покупка платины за рубли пока заглушка: площадка ещё не подключена. */
CC.RES_BUY = {
  packs: [1, 10, 100],
  bonus: { 1: 1, 10: 1.1, 100: 1.25 },
  rub: [
    { gems: 50, rub: 99 },
    { gems: 300, rub: 499 },
    { gems: 1000, rub: 1490 }
  ]
};

// Бонус набора: неизвестное количество считаем базовым курсом.
CC.resBuyBonus = function (count) {
  const n = Math.floor(Number(count) || 0);
  const b = Number((CC.RES_BUY.bonus || {})[n]);
  return isFinite(b) && b > 0 ? b : 1;
};

// Сколько ресурса даёт набор из count платин на указанном центре.
// Курс × платины × бонус, округление до 10 вниз/вверх по правилам Math.round.
CC.resBuyAmount = function (res, count, thLevel) {
  const rate = CC.gemExchange ? CC.gemExchange(res, thLevel) : 0;
  const n = Math.floor(Number(count) || 0);
  if (!rate || n < 1) return 0;
  const raw = rate * n * CC.resBuyBonus(n);
  return Math.round(raw / 10) * 10;
};

// Курс обмена для ресурса на указанном уровне центра. TH1: 250/200,
// TH5: 650/520, TH10: 1150/920. Округление до 10 — запас на будущие
// дробные шаги роста.
CC.gemExchange = function (res, thLevel) {
  const conf = CC.GEMS.exchange || {};
  const base = Number(conf[res]);
  if (!isFinite(base) || base <= 0) return 0;

  let th = Math.floor(Number(thLevel));
  if (!(th >= 1)) th = 1;
  if (th > CC.MAX_TH) th = CC.MAX_TH;

  const step = Number((conf.perTh || {})[res]) || 0;
  const raw = base + step * (th - 1);
  return Math.round(raw / 10) * 10;
};

/* Склонение платины: 1 платина, 2 платины, 5 платин.
   n — количество; возвращается слово в именительном падеже. */
CC.platinumWord = function (n) {
  const v = Math.abs(Math.floor(Number(n) || 0)) % 100;
  const d = v % 10;
  if (v > 10 && v < 20) return 'платин';
  if (d === 1) return 'платина';
  if (d >= 2 && d <= 4) return 'платины';
  return 'платин';
};

// «1 платина», «2 платины», «5 платин» — одна строка для подписей и тостов.
CC.platinum = function (n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v + ' ' + CC.platinumWord(v);
};

// Винительный падеж для «Ускорить за …»: 1 платину, 2 платины, 5 платин.
CC.platinumAcc = function (n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  const word = v % 10 === 1 && v % 100 !== 11 ? 'платину' : CC.platinumWord(v);
  return v + ' ' + word;
};

/* ---------- ежедневный контракт «5 звёзд» ----------
   Звёзды за любые бои копятся в один контракт. Пять звёзд закрывают его:
   награда ждёт в «банке» (до maxStack штук) и забирается вручную.
   Раз в resetMs открывается новый контракт, прогресс при этом обнуляется,
   а уже закрытые награды остаются в банке. Повтор уровня даёт в зачёт
   не больше replayMax звёзд, чтобы контракт нельзя было закрыть одним
   трёхзвёздочным повтором. */
CC.DAILY = {
  stars: 5,
  resetMs: 24 * 60 * 60 * 1000,
  maxStack: 2,
  reward: { gold: 200, elixir: 200, gems: 1 },
  perTh: { gold: 50, elixir: 50 },
  replayMax: 1
};

/* Набеги на деревню игрока: раз в N мс, состав зависит от командного центра.
   Украденное — доля запаса по выбитой ёмкости складов: снесён один склад
   руды из двух — теряется половина руды, оба — весь запас. Нет складов —
   грабить нечего.
   На TH1-3 набег слабый (игрок только учится), к TH10 — как раньше на TH5.
   В составе только войска, открытые на этом уровне центра: на TH1-3 нет
   мехов, мародёров, подрывников и дронов. */
CC.RAIDS = {
  interval: 3 * 60 * 60 * 1000,
  limit: 120,
  // Старые доли оставлены для совместимости API; набег считает по складам.
  theft: { low: 0.1, mid: 0.2, hall: 0.3 },
  /* Передышка после набега. Пока таймер идёт, новый набег не начинается:
     minor — кража меньше 20% текущих ресурсов, major — 20% и больше,
     th — если снесли командный центр. */
  truce: {
    major: 0.20,
    minorMs: 2 * 60 * 60 * 1000,
    majorMs: 6 * 60 * 60 * 1000,
    thMs: 8 * 60 * 60 * 1000
  },
  armies: {
    1: { barb: 3, archer: 0, giant: 0, goblin: 0 },
    2: { barb: 5, archer: 2, giant: 0, goblin: 0 },
    3: { barb: 7, archer: 3, giant: 0, goblin: 0 },
    4: { barb: 9, archer: 4, giant: 1, goblin: 0 },
    5: { barb: 11, archer: 5, giant: 2, goblin: 0 },
    6: { barb: 13, archer: 6, giant: 2, goblin: 3 },
    7: { barb: 15, archer: 7, giant: 3, goblin: 3 },
    8: { barb: 17, archer: 9, giant: 3, goblin: 4 },
    9: { barb: 20, archer: 10, giant: 4, goblin: 5 },
    10: { barb: 23, archer: 12, giant: 5, goblin: 6 }
  }
};

/* Что производят постройки: resource — куда капает, rate — в секунду на 1 уровне.
   Рост за уровень берётся из CC.UPGRADES[type].rate. */
CC.PRODUCTION = {
  goldmine: { res: 'gold', rate: 0.75 },
  elixir: { res: 'elixir', rate: 0.65 }
};

/* Собственный накопитель бура/реактора. Ёмкость = round(400 × 2^(уровень−1)):
   400, 800, 1600 … 204 800 на 10 уровне. Пока накопитель не забрали,
   производство копится в нём, а не уходит на склад. Первый уровень
   заполняется за ~8.9 минуты при 0.75/с. */
CC.EXTRACT = { base: 400, perLevel: 2 };

// Ёмкость накопителя для типа постройки и уровня. Не производящая — 0.
CC.extractCap = function (type, level) {
  if (!CC.PRODUCTION[type]) return 0;
  let lvl = Math.floor(Number(level) || 1);
  if (lvl < 1) lvl = 1;
  if (lvl > CC.ECONOMY.maxLevel) lvl = CC.ECONOMY.maxLevel;
  return Math.round(CC.EXTRACT.base * Math.pow(CC.EXTRACT.perLevel, lvl - 1));
};

/* Разовая цена постановки новой постройки (не апгрейда). Списывается один
   раз при установке; снос её не возвращает. townhall не ставится — только
   улучшается, поэтому цена пустая. */
CC.PLACE_COST = {
  cannon: { gold: 400 },
  archer: { gold: 600 },
  mortar: { gold: 900 },
  airdef: { gold: 1200 },
  mage: { gold: 1600 },
  ambush: { gold: 1500 },
  beam: { gold: 2500 },
  mine: { gold: 300 },
  spring: { gold: 250 },
  airmine: { gold: 400 },
  wall: { gold: 120 },
  goldmine: { elixir: 300 },
  elixir: { gold: 300 },
  storage: { gold: 400 },
  estorage: { gold: 400 },
  barracks: { elixir: 500 },
  townhall: {}
};

// Цена постановки в виде {gold, elixir}; неизвестный тип бесплатный.
CC.placeCost = function (type) {
  const c = CC.PLACE_COST[type] || {};
  return { gold: Math.max(0, Math.round(Number(c.gold) || 0)),
    elixir: Math.max(0, Math.round(Number(c.elixir) || 0)) };
};

/* Время стройки по уровню (секунды), одинаковое для всех построек, кроме
   центра и стен. Индекс = уровень−1: 1 мин, 5 мин, 30 мин … 32 часа.
   Это время и для постановки (уровень 1), и для апгрейда ДО этого уровня. */
CC.BUILD_TIME = [
  60, 300, 1800, 2700, 3600,
  7200, 14400, 28800, 57600, 115200
];

/* Центр качается по своей, более длинной кривой (апгрейд ДО уровня).
   Первого уровня как стройки нет: он существует сразу. */
CC.TOWNHALL_TIME = {
  2: 1800,
  3: 3600,
  4: 7200,
  5: 14400,
  6: 28800,
  7: 43200,
  8: 57600,
  9: 86400,
  10: 115200
};

// Время стройки/апгрейда до уровня. Стены — всегда 0 (мгновенно).
CC.buildTime = function (type, toLevel) {
  if (type === 'wall') return 0;

  const max = CC.BUILD_TIME.length;
  let lvl = Math.floor(Number(toLevel) || 1);
  if (lvl < 1) lvl = 1;
  if (lvl > max) lvl = max;

  if (type === 'townhall') return lvl < 2 ? 0 : (CC.TOWNHALL_TIME[lvl] || 0);
  return CC.BUILD_TIME[lvl - 1];
};

// Время постановки: новая постройка всегда 1 уровня. Без множителей по TH.
CC.placeTime = function (type) {
  return CC.buildTime(type, 1);
};

/* Апгрейды. cost — цена 1 уровня, дальше растёт по ECONOMY.growth.
   time оставлен для совместимости старого сейва/таблиц, но фактическое
   время теперь берётся из CC.BUILD_TIME/CC.TOWNHALL_TIME через
   Base.upgradeTime(type, toLevel).
   hp/dmg/range/rate/cap — прибавка к характеристике за каждый уровень.
   Все постройки качаются до 10 уровня; цена округляется в base.js. */
CC.UPGRADES = {
  townhall: { max: 10, cost: { gold: 1200 }, time: 90, hp: 0.3 },
  cannon: { max: 10, cost: { gold: 420 }, time: 45, hp: 0.25, dmg: 0.25, range: 0.04, rate: 0.12 },
  archer: { max: 10, cost: { gold: 460 }, time: 50, hp: 0.25, dmg: 0.25, range: 0.04, rate: 0.12 },
  mortar: { max: 10, cost: { gold: 480 }, time: 60, hp: 0.2, dmg: 0.25, range: 0.04, rate: 0.1 },
  airdef: { max: 10, cost: { gold: 520 }, time: 60, hp: 0.22, dmg: 0.25, range: 0.04, rate: 0.12 },
  mage: { max: 10, cost: { gold: 560 }, time: 60, hp: 0.2, dmg: 0.28, range: 0.04, rate: 0.1 },
  ambush: { max: 10, cost: { gold: 650 }, time: 60, hp: 0.2, dmg: 0.25, range: 0.04, rate: 0.1 },
  beam: { max: 10, cost: { gold: 900 }, time: 60, hp: 0.2, dmg: 0.2, range: 0.04 },
  mine: { max: 10, cost: { gold: 320 }, time: 40, dmg: 0.2 },
  spring: { max: 10, cost: { gold: 280 }, time: 40, hp: 0 },
  airmine: { max: 10, cost: { gold: 420 }, time: 40, dmg: 0.2 },
  wall: { max: 10, cost: { gold: 80 }, time: 30, hp: 0.6 },
  goldmine: { max: 10, cost: { elixir: 200 }, time: 40, hp: 0.2, rate: 0.5 },
  elixir: { max: 10, cost: { gold: 200 }, time: 40, hp: 0.2, rate: 0.5 },
  storage: { max: 10, cost: { gold: 320 }, time: 45, hp: 0.2, cap: 0.5 },
  estorage: { max: 10, cost: { gold: 320 }, time: 45, hp: 0.2, cap: 0.5 },
  barracks: { max: 10, cost: { elixir: 400 }, time: 60, hp: 0.25 }
};

/* Армия: каждое место даёт ангар — 20 за каждый свой уровень
   (L1 — 20, L2 — 40 … L10 — 200). Общая вместимость — сумма по всем
   готовым ангарам, поэтому два L2 дают 80. Ангары тренируют параллельно:
   один ангар — один одновременный юнит, очередь общая на всю армию. */
CC.ARMY = {
  capacityPerBarracks: 20,
  // Оставлено для balance.js и старых сейвов: прежняя кривая «20 за TH»
  // совпадает с одним ангаром, прокачанным до уровня центра.
  capacityPerTh: 20,
  queuePerBarracks: 4,
  queueMax: 16
};

/* Бригады строителей: лимит одновременных строек и апгрейдов.
   Первая бригада есть с самого старта и бесплатна; следующие покупаются
   только за платину и только после нужного уровня центра. */
CC.BUILDERS = {
  start: 1,
  max: 4,
  teams: [
    { th: 3, cost: 50 },   // вторая бригада
    { th: 6, cost: 70 },   // третья
    { th: 9, cost: 100 }   // четвёртая
  ]
};

/* Открытие построек по уровню командного центра. */
CC.REQUIREMENTS = {
  // Лазерная вышка открыта с самого начала: на TH1 её лимит — 1.
  archer: { minTh: 1 },
  mortar: { minTh: 3 },
  airdef: { minTh: 4 },
  mage: { minTh: 5 },
  mine: { minTh: 2 },
  spring: { minTh: 4 },
  airmine: { minTh: 5 },
  ambush: { minTh: 7 },
  beam: { minTh: 9 }
};

CC.MAX_TH = 10;

/* Достижения: постоянные цели, платина выдаётся вручную за ступень.
   Платина — донат, поэтому за каждую ступень ровно 1 штука: всего 13×3 = 39. */
CC.ACHIEVEMENTS = [
  { id: 'walls', name: 'Крушитель барьеров', desc: 'Снести энергобарьеры в бою',
    stat: 'wallsDestroyed', tiers: [10, 100, 500], gems: [1, 1, 1] },
  { id: 'wins', name: 'Командир', desc: 'Выиграть бои',
    stat: 'battleWins', tiers: [1, 10, 50], gems: [1, 1, 1] },
  { id: 'upgrades', name: 'Техник', desc: 'Завершить модернизации',
    stat: 'upgrades', tiers: [5, 25, 100], gems: [1, 1, 1] },
  { id: 'gold', name: 'Рудокоп', desc: 'Собрать руды суммарно',
    stat: 'goldEarned', tiers: [1000, 10000, 100000], gems: [1, 1, 1] },
  { id: 'levels', name: 'Покоритель', desc: 'Пройти секторы Марса',
    stat: 'levelsCleared', tiers: [1, 10, 50], gems: [1, 1, 1] },
  { id: 'defend', name: 'Щит базы', desc: 'Отбить набеги без потери командного центра',
    stat: 'defended', tiers: [1, 10, 50], gems: [1, 1, 1] },
  { id: 'placed', name: 'Строитель базы', desc: 'Поставить модули',
    stat: 'placed', tiers: [10, 50, 150], gems: [1, 1, 1] },
  { id: 'maxed', name: 'Максимальная мощность', desc: 'Довести модули до максимального уровня',
    stat: 'maxed', tiers: [1, 3, 5], gems: [1, 1, 1] },
  { id: 'gems', name: 'Инвестор', desc: 'Потратить платину',
    stat: 'gemsSpent', tiers: [10, 50, 200], gems: [1, 1, 1] },
  { id: 'train', name: 'Рекрутёр', desc: 'Подготовить бойцов',
    stat: 'trained', tiers: [10, 100, 500], gems: [1, 1, 1] },
  { id: 'elixir', name: 'Энергетик', desc: 'Собрать энергии суммарно',
    stat: 'elixirEarned', tiers: [1000, 10000, 100000], gems: [1, 1, 1] },
  { id: 'loot', name: 'Добытчик', desc: 'Унести руды из боёв',
    stat: 'lootGold', tiers: [500, 5000, 50000], gems: [1, 1, 1] },
  { id: 'mason', name: 'Барьерист', desc: 'Поставить энергобарьеры',
    stat: 'wallsPlaced', tiers: [10, 100, 300], gems: [1, 1, 1] }
];

/* Задания-туториал живут в js/base.js: константа QUESTS рядом с текстами
   шагов и проверкой прогресса. Здесь списка нет намеренно — второй список
   неизбежно расходился бы с рабочим порядком. */

/* Кольцо энергобарьеров по периметру прямоугольника (включительно, без угловых
   дублей). gaps — клетки, которые остаются проходами. */
function ccWallRing(x0, y0, x1, y1, gaps) {
  const out = [];
  const skip = {};

  (gaps || []).forEach(function (g) {
    skip[g[0] + ',' + g[1]] = 1;
  });

  function add(x, y) {
    if (skip[x + ',' + y]) return;
    out.push(['wall', x, y]);
  }

  for (let x = x0; x <= x1; x++) {
    add(x, y0);
    add(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    add(x0, y);
    add(x1, y);
  }

  return out;
}

/* ---------- генератор 50 уровней ----------
   Уровень задаётся номером и seed; раскладка строится детерминированно,
   поэтому в сейве достаточно индекса, а не 50 готовых массивов.

   База каждого уровня — не одно кольцо, а 2–3 компартмента: внешний
   энергобарьерный контур с широкими проходами на каждой стороне и
   внутренние стены, которые делят двор на отсеки. Командный центр стоит
   в одном из отсеков (не всегда в геометрическом центре), оборона
   разнесена по отсекам, ПВО — по разным секторам, а буры/реакторы/
   хранилища убраны в глубину, ближе к центру. Ангар выносится наружу
   как приманка. */
CC.LEVEL_SEED_BASE = 20261118;
CC.LEVEL_ERAS = 5;

function ccLevelRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CC_ERA_TITLES = [
  'Красные пески', 'Кратеры', 'Ледяные жилы',
  'Разлом', 'Купол'
];

const CC_ERA_HINTS = [
  'Центр почти без прикрытия: высади отряд на любую свободную клетку рядом с базой',
  'Держи мехов впереди, а лазерщиков — за ними',
  'Гаубица бьёт по площади: не собирай отряд в кучу',
  'Появился зенитный комплекс: дрон летит через барьеры, но боится его',
  'Плотная крепость: вскрой энергобарьер, потом добивай центр'
];

/* Планы обороны по эпохам: [турель, лазерная вышка, гаубица, ПВО, плазма].
   Это верхняя граница; ниже counts дополнительно зажимаются CC.limitAt()
   по уровню центра эпохи. */
const CC_DEF_TYPES = ['cannon', 'archer', 'mortar', 'airdef', 'mage'];
const CC_DEF_PLANS = [
  [2, 1, 0, 0, 0],
  [3, 2, 1, 1, 0],
  [4, 3, 2, 1, 1],
  [4, 3, 2, 2, 1],
  [6, 4, 3, 2, 1]
];

function ccClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Потолок уровня для построек кампании. Башня и ангар, как и в деревне,
// отстают от командного центра на один уровень.
function ccLevelMax(type, th) {
  const t = ccClamp(Math.round(Number(th) || 1), 1, CC.MAX_TH || 10);
  if (type === 'archer' || type === 'barracks') return Math.max(1, t - 1);
  return t;
}

function ccShuffle(list, rnd) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

CC.LevelGen = {
  level: function (index) {
    const i = Math.max(0, Math.floor(Number(index) || 0));
    const era = Math.min(4, Math.floor(i / 10));
    const within = i % 10;
    const th = era + 1;
    // Уровень центра, на который рассчитана эпоха: 2, 4, 6, 8, 10.
    const capTh = Math.min(CC.MAX_TH || 10, (era + 1) * 2);
    const seed = (CC.LEVEL_SEED_BASE + i * 7919) >>> 0;
    const rnd = ccLevelRng(seed);
    const occ = new Uint8Array(CC.GRID * CC.GRID);
    // Занятость только не-стенами: между зданиями держим зазор в клетку,
    // чтобы A* всегда находил подход к цели, а не упирался в сплошной блок.
    const solid = new Uint8Array(CC.GRID * CC.GRID);
    const layout = [];
    const zones = [];

    function mark(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) occ[yy * CC.GRID + xx] = 1;
      }
    }

    function hasSolidNeighbor(x, y, w, h) {
      for (let yy = y - 1; yy <= y + h; yy++) {
        for (let xx = x - 1; xx <= x + w; xx++) {
          if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
          if (xx < 0 || yy < 0 || xx >= CC.GRID || yy >= CC.GRID) continue;
          if (solid[yy * CC.GRID + xx]) return true;
        }
      }
      return false;
    }

    function canPlace(type, x, y) {
      const d = CC.BUILDINGS[type];
      if (!d) return false;
      const w = d.w || 1;
      const h = d.h || 1;
      if (x < 0 || y < 0 || x + w > CC.GRID || y + h > CC.GRID) return false;
      // Ловушка не является препятствием: к ней можно ставить вплотную,
      // а в бою она вообще не занимает клетку.
      if (type !== 'wall' && !d.trap && hasSolidNeighbor(x, y, w, h)) return false;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (occ[yy * CC.GRID + xx]) return false;
        }
      }
      return true;
    }

    function place(type, x, y, level) {
      if (!canPlace(type, x, y)) return false;
      const d = CC.BUILDINGS[type];
      const lvl = ccClamp(Math.round(Number(level) || 1), 1,
        ccLevelMax(type, capTh));
      mark(x, y, d.w || 1, d.h || 1);
      if (type !== 'wall' && !d.trap) {
        for (let yy = y; yy < y + (d.h || 1); yy++) {
          for (let xx = x; xx < x + (d.w || 1); xx++) {
            solid[yy * CC.GRID + xx] = 1;
          }
        }
      }
      layout.push([type, x, y, lvl]);
      return true;
    }

    /* ---------- внешнее кольцо и проходы ---------- */

    // Сторона растёт от эпохи к эпохе; на 36x36 с запасом для приманки.
    const SIDE_RANGES = [[16, 17], [18, 19], [20, 21], [23, 24], [25, 26]];
    const range = SIDE_RANGES[era];
    let side = range[0] + Math.floor(rnd() * (range[1] - range[0] + 1));
    if (side > CC.GRID - 4) side = CC.GRID - 4;

    let x0 = Math.round((CC.GRID - side) / 2) + (rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1));
    let y0 = Math.round((CC.GRID - side) / 2) + (rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1));
    x0 = ccClamp(x0, 1, CC.GRID - 1 - side);
    y0 = ccClamp(y0, 1, CC.GRID - 1 - side);
    const x1 = x0 + side - 1;
    const y1 = y0 + side - 1;

    // На каждой стороне кольца — широкий проход (2–4 клетки), чтобы отряд
    // не искал единственную щель. Углы не трогаем: они держат каркас.
    const gaps = [];
    function gapH(y) {
      const gw = 2 + Math.floor(rnd() * 3);
      const start = x0 + 2 + Math.floor(rnd() * (side - 4 - gw));
      for (let k = 0; k < gw; k++) gaps.push([start + k, y]);
    }
    function gapV(x) {
      const gw = 2 + Math.floor(rnd() * 3);
      const start = y0 + 2 + Math.floor(rnd() * (side - 4 - gw));
      for (let k = 0; k < gw; k++) gaps.push([x, start + k]);
    }
    gapH(y0);
    gapH(y1);
    gapV(x0);
    gapV(x1);

    const wallLvl = Math.min(5, th);
    let defLvl = Math.max(1, th - (within < 4 ? 1 : 0));
    const towerLvl = Math.max(1, th - 1);

    // Точечное ослабление финальных секторов: после свободной высадки
    // отряд чаще упирается в последние уровни эпохи. Снижаем только
    // уровень обороны, не ломая раскладку и лимиты состава.
    const soft = (era === 2 && within >= 8) ||
      (era === 3 && within >= 8) ||
      (era === 4 && within >= 4);
    if (soft) defLvl = Math.max(1, defLvl - 1);
    // Вторая половина «Купола» упирается в потолок обороны: одна ступень
    // снимается дополнительно, иначе отдельные секторы не добирают 50%.
    if (era === 4 && within >= 6) defLvl = Math.max(1, defLvl - 1);

    // Энергобарьеры кампании — отдельный бюджет: обороняемая база должна
    // иметь замкнутый контур, даже если игроку на низком TH доступно меньше.
    // Всего стен держим в пределах CC.LIMITS.wall (150).
    ccWallRing(x0, y0, x1, y1, gaps).forEach(function (c) {
      place('wall', c[1], c[2], wallLvl);
    });

    /* ---------- внутренние стены и отсеки ---------- */

    // Два-три отсека. Внутренняя стена идёт от кольца до кольца, но всегда
    // с проходом в 2–3 клетки: отряд может перейти из отсека в отсек,
    // не ломая всю стену.
    let zoneN = 2;
    if (era >= 2 && (within + era) % 3 !== 0) zoneN = 3;
    if (era >= 3 && within >= 7) zoneN = 3;
    if (side - 2 < 14) zoneN = 2;

    const vertical = rnd() < 0.5;

    function addDivider(cut) {
      const gw = 2 + Math.floor(rnd() * 2);
      const a = vertical ? y0 + 1 : x0 + 1;
      const b = vertical ? y1 - 1 : x1 - 1;
      const len = b - a + 1;
      const gs = a + 1 + Math.floor(rnd() * Math.max(1, len - gw - 1));
      for (let p = a; p <= b; p++) {
        if (p >= gs && p < gs + gw) continue;
        if (vertical) place('wall', cut, p, wallLvl);
        else place('wall', p, cut, wallLvl);
      }
      return { from: a, to: b, gapFrom: gs, gapTo: gs + gw - 1 };
    }

    function pushZone(ax, ay, bx, by) {
      // Резерв: отсек должен вмещать центр 2x2 и хотя бы пару построек.
      if (bx - ax + 1 < 4 || by - ay + 1 < 4) return false;
      zones.push({ x0: ax, y0: ay, x1: bx, y1: by });
      return true;
    }

    if (vertical) {
      const start = x0 + 1;
      const end = x1 - 1;
      const n = end - start + 1;

      if (zoneN >= 3 && n >= 14) {
        const free = n - 2;
        const w1 = 4 + Math.floor(rnd() * Math.max(1, free - 11));
        const w2 = 4 + Math.floor(rnd() * Math.max(1, free - w1 - 7));
        const cut1 = start + w1;
        const cut2 = cut1 + 1 + w2;
        addDivider(cut1);
        addDivider(cut2);
        pushZone(start, y0 + 1, cut1 - 1, y1 - 1);
        pushZone(cut1 + 1, y0 + 1, cut2 - 1, y1 - 1);
        pushZone(cut2 + 1, y0 + 1, end, y1 - 1);
      } else {
        const cut = start + 4 + Math.floor(rnd() * Math.max(1, n - 9));
        addDivider(cut);
        pushZone(start, y0 + 1, cut - 1, y1 - 1);
        pushZone(cut + 1, y0 + 1, end, y1 - 1);
      }
    } else {
      const start = y0 + 1;
      const end = y1 - 1;
      const n = end - start + 1;

      if (zoneN >= 3 && n >= 14) {
        const free = n - 2;
        const w1 = 4 + Math.floor(rnd() * Math.max(1, free - 11));
        const w2 = 4 + Math.floor(rnd() * Math.max(1, free - w1 - 7));
        const cut1 = start + w1;
        const cut2 = cut1 + 1 + w2;
        addDivider(cut1);
        addDivider(cut2);
        pushZone(x0 + 1, start, x1 - 1, cut1 - 1);
        pushZone(x0 + 1, cut1 + 1, x1 - 1, cut2 - 1);
        pushZone(x0 + 1, cut2 + 1, x1 - 1, end);
      } else {
        const cut = start + 4 + Math.floor(rnd() * Math.max(1, n - 9));
        addDivider(cut);
        pushZone(x0 + 1, start, x1 - 1, cut - 1);
        pushZone(x0 + 1, cut + 1, x1 - 1, end);
      }
    }

    // Страховка: если геометрия почему-то не дала отсеков, оставляем двор
    // одним прямоугольником — уровень не должен остаться без застройки.
    if (!zones.length) {
      pushZone(x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    }

    /* ---------- постановка построек ---------- */

    function cellsOf(zone) {
      const out = [];
      for (let yy = zone.y0; yy <= zone.y1; yy++) {
        for (let xx = zone.x0; xx <= zone.x1; xx++) {
          if (!occ[yy * CC.GRID + xx]) out.push([xx, yy]);
        }
      }
      return out;
    }

    function hallCenter() {
      const hall = layout.find(function (r) { return r[0] === 'townhall'; });
      if (!hall) return { x: CC.GRID / 2, y: CC.GRID / 2 };
      return { x: hall[1] + 1, y: hall[2] + 1 };
    }

    function distToHall(x, y) {
      const h = hallCenter();
      return Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
    }

    function distToField(x, y) {
      return Math.hypot(x + 0.5 - CC.GRID / 2, y + 0.5 - CC.GRID / 2);
    }

    function putInZone(type, level, zi, prefer) {
      const order = [zi];
      for (let k = 0; k < zones.length; k++) {
        if (k !== zi) order.push(k);
      }

      for (let oi = 0; oi < order.length; oi++) {
        const cells = cellsOf(zones[order[oi]]);
        if (!cells.length) continue;

        cells.sort(function (a, b) {
          const da = prefer === 'far' ? -distToHall(a[0], a[1]) : distToHall(a[0], a[1]);
          const db = prefer === 'far' ? -distToHall(b[0], b[1]) : distToHall(b[0], b[1]);
          if (da !== db) return da - db;
          if (a[1] !== b[1]) return a[1] - b[1];
          return a[0] - b[0];
        });

        for (let c = 0; c < cells.length; c++) {
          if (place(type, cells[c][0], cells[c][1], level)) return true;
        }
      }
      return false;
    }

    // «В глубине»: ближайшие к геометрическому центру поля свободные клетки.
    // Так луч не выносится к внешнему кольцу, даже если стоит в боковом отсеке.
    function putInDepth(type, level) {
      const all = [];
      for (let k = 0; k < zones.length; k++) {
        cellsOf(zones[k]).forEach(function (c) { all.push(c); });
      }
      all.sort(function (a, b) {
        const da = distToField(a[0], a[1]);
        const db = distToField(b[0], b[1]);
        if (da !== db) return da - db;
        if (a[1] !== b[1]) return a[1] - b[1];
        return a[0] - b[0];
      });
      for (let c = 0; c < all.length; c++) {
        if (place(type, all[c][0], all[c][1], level)) return true;
      }
      return false;
    }

    // Командный центр — в случайном отсеке и не обязательно по центру.
    const thZone = Math.floor(rnd() * zones.length) % zones.length;
    const tz = zones[thZone];
    const tw = tz.x1 - tz.x0 + 1;
    const thh = tz.y1 - tz.y0 + 1;
    let tx = tz.x0 + Math.max(0, Math.floor((tw - 2) / 2)) + Math.floor(rnd() * 3) - 1;
    let ty = tz.y0 + Math.max(0, Math.floor((thh - 2) / 2)) + Math.floor(rnd() * 3) - 1;
    tx = ccClamp(tx, tz.x0, tz.x1 - 1);
    ty = ccClamp(ty, tz.y0, tz.y1 - 1);

    let hallPlaced = place('townhall', tx, ty, th);
    for (let k = 0; !hallPlaced && k < zones.length; k++) {
      hallPlaced = putInZone('townhall', th, k, 'near');
    }

    // Оборона. Сначала ПВО — по разным отсекам, затем остальные башни
    // по кругу, чтобы ни один отсек не остался без прикрытия.
    const plan = (CC_DEF_PLANS[era] || []).slice();
    const defCounts = {};
    for (let k = 0; k < CC_DEF_TYPES.length; k++) {
      const type = CC_DEF_TYPES[k];
      defCounts[type] = Math.min(plan[k] || 0, CC.limitAt(type, capTh));
    }
    // Ранние секторы эпохи мягче: не весь гарнизон выставляется сразу.
    // У «Ледяных жил» (эпоха 3) держим полный состав: свободная высадка
    // иначе слишком легко снимает первые отсеки.
    if (within < 3 && era !== 2) {
      defCounts.cannon = Math.max(1, defCounts.cannon - 1);
      defCounts.archer = Math.max(1, defCounts.archer - 1);
      defCounts.mortar = Math.max(0, defCounts.mortar - 1);
      defCounts.airdef = Math.max(0, defCounts.airdef - 1);
      defCounts.mage = Math.max(0, defCounts.mage - 1);
    }

    // Оборона живёт в соседних отсеках, а не в одном дворе с центром:
    // высадка «в центр» попадает под перекрёстный огонь из-за внутренней
    // стены, а не убивает башни в упор. Один отсек с центром остаётся
    // жилым (ресурсы), но не превращается в казарму обороны.
    const defZones = [];
    for (let k = 0; k < zones.length; k++) {
      if (k !== thZone) defZones.push(k);
    }
    if (!defZones.length) defZones.push(thZone);

    const zoneOrder = ccShuffle(defZones, rnd);
    let zc = 0;
    function nextZone() { return zoneOrder[(zc++) % zoneOrder.length]; }

    // ПВО разносим по отсекам. Если отсеков с обороной два и больше,
    // комплексы стоят в них; на двухсекционных базах один уходит во двор
    // центра, чтобы секторы всё равно различались.
    const airPool = defZones.length >= 2 ? defZones : zones.map(function (_, k) { return k; });
    const airOrder = ccShuffle(airPool, rnd);
    let ac = 0;
    function nextAirZone() { return airOrder[(ac++) % airOrder.length]; }

    // ПВО — в разные секторы, первым делом.
    for (let k = 0; k < defCounts.airdef; k++) {
      putInZone('airdef', defLvl, nextAirZone(), 'near');
    }
    for (let k = 0; k < defCounts.mage; k++) {
      putInZone('mage', defLvl, nextZone(), 'near');
    }
    for (let k = 0; k < defCounts.mortar; k++) {
      putInZone('mortar', defLvl, nextZone(), 'near');
    }
    for (let k = 0; k < defCounts.archer; k++) {
      putInZone('archer', towerLvl, nextZone(), 'near');
    }
    // Часть турелей держим у внешней стены (смотрит наружу), часть — ближе
    // к центру (смотрит внутрь отсека).
    for (let k = 0; k < defCounts.cannon; k++) {
      putInZone('cannon', defLvl, nextZone(), k % 2 ? 'far' : 'near');
    }

    // Поздние типы обороны появляются вместе с TH эпохи, а не с первого
    // сектора: ambush — с TH7 (эпоха 4), beam — с TH9 (эпоха 5).
    // Уровень держим ниже общего потолка, чтобы новые башни не ломали
    // кривую сложности, пока игрок только знакомится с типом.
    if (capTh >= 7) {
      const ambushN = Math.min(CC.limitAt('ambush', capTh), capTh >= 10 ? 2 : 1);
      const ambushLvl = Math.max(1, Math.min(ccLevelMax('ambush', capTh), th - 2 || 1));
      for (let k = 0; k < ambushN; k++) {
        // Засада — ближе к центру: её вскрывают уже внутри компартментов.
        if (!putInZone('ambush', ambushLvl, nextZone(), 'near')) {
          putInDepth('ambush', ambushLvl);
        }
      }
    }
    if (capTh >= 9) {
      const beamN = Math.min(CC.limitAt('beam', capTh), 1);
      const beamLvl = Math.max(1, Math.min(ccLevelMax('beam', capTh), th - 3 || 1));
      for (let k = 0; k < beamN; k++) {
        if (!putInDepth('beam', beamLvl)) {
          putInZone('beam', beamLvl, nextZone(), 'far');
        }
      }
    }

    // Ресурсы — в глубину, ближе к центру поля.
    const resCounts = {
      goldmine: CC.limitAt('goldmine', capTh),
      elixir: CC.limitAt('elixir', capTh),
      storage: CC.limitAt('storage', capTh),
      estorage: CC.limitAt('estorage', capTh)
    };
    if (within < 4) {
      resCounts.goldmine = Math.max(2, resCounts.goldmine - 1);
      resCounts.elixir = Math.max(2, resCounts.elixir - 1);
    }

    const resCells = [];
    for (let k = 0; k < zones.length; k++) {
      cellsOf(zones[k]).forEach(function (c) { resCells.push(c); });
    }
    resCells.sort(function (a, b) {
      const da = distToField(a[0], a[1]);
      const db = distToField(b[0], b[1]);
      if (da !== db) return da - db;
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0] - b[0];
    });

    const resList = [];
    // Порядок как раньше: буры, реакторы, склад руды, затем новый склад
    // энергии. Так старые раскладки не съезжают, а estorage встаёт в
    // оставшееся место (или уходит в резервный проход ниже).
    for (let k = 0; k < resCounts.goldmine; k++) resList.push('goldmine');
    for (let k = 0; k < resCounts.elixir; k++) resList.push('elixir');
    for (let k = 0; k < resCounts.storage; k++) resList.push('storage');
    for (let k = 0; k < resCounts.estorage; k++) resList.push('estorage');

    let ri = 0;
    const resPlaced = [];
    for (let c = 0; c < resCells.length && ri < resList.length; c++) {
      if (place(resList[ri], resCells[c][0], resCells[c][1], 1)) {
        resPlaced.push([resCells[c][0], resCells[c][1]]);
        ri++;
      }
    }
    // Если в отсеках не хватило места, остаток кладём в любой свободный двор.
    for (; ri < resList.length; ri++) {
      const z = zones[ri % zones.length];
      putInZone(resList[ri], 1, zones.indexOf(z), 'near');
    }

    // Ангар: одна постройка снаружи как приманка, остальные — в отсеках.
    const barCount = Math.max(1, Math.min(
      CC.limitAt('barracks', capTh),
      1 + Math.floor(within / 3)
    ));
    const barLvl = Math.max(1, Math.min(ccLevelMax('barracks', capTh), th - 1 || 1));

    function putOutside(type, level) {
      const cands = [];
      for (let yy = 1; yy < CC.GRID - 1; yy++) {
        for (let xx = 1; xx < CC.GRID - 1; xx++) {
          if (xx >= x0 - 1 && xx <= x1 + 1 && yy >= y0 - 1 && yy <= y1 + 1) continue;
          const dx = xx < x0 ? x0 - xx : (xx > x1 ? xx - x1 : 0);
          const dy = yy < y0 ? y0 - yy : (yy > y1 ? yy - y1 : 0);
          const d = Math.max(dx, dy);
          if (d > 6) continue;
          if (!canPlace(type, xx, yy)) continue;
          cands.push([xx, yy, d]);
        }
      }
      cands.sort(function (a, b) {
        if (a[2] !== b[2]) return a[2] - b[2];
        if (a[1] !== b[1]) return a[1] - b[1];
        return a[0] - b[0];
      });
      for (let c = 0; c < cands.length; c++) {
        if (place(type, cands[c][0], cands[c][1], level)) return true;
      }
      return false;
    }

    if (!putOutside('barracks', barLvl)) {
      putInZone('barracks', barLvl, nextZone(), 'far');
    }
    for (let k = 1; k < barCount; k++) {
      putInZone('barracks', barLvl, nextZone(), 'near');
    }

    /* ---------- ловушки ---------- */

    // Ловушки ставим последними: они не препятствие, поэтому могут лечь
    // в проход внешнего кольца или вплотную к буру/реактору, не мешая
    // остальной застройке. Количество растёт по TH эпохи и не выходит
    // за CC.limitAt(); уровень ниже потолка, чтобы не ломать баланс.
    const trapPlan = {
      mine: capTh >= 2
        ? Math.min(CC.limitAt('mine', capTh),
          capTh >= 8 ? 4 : (capTh >= 6 ? 2 : (capTh >= 4 ? 2 : (within >= 8 ? 1 : 0))))
        : 0,
      spring: capTh >= 4
        ? Math.min(CC.limitAt('spring', capTh), capTh >= 8 ? 2 : 1)
        : 0,
      airmine: capTh >= 5
        ? Math.min(CC.limitAt('airmine', capTh), capTh >= 9 ? 2 : 1)
        : 0
    };
    const trapLvl = Math.max(1, Math.min(ccLevelMax('mine', capTh), th));

    // Проходы внешнего кольца — первые кандидаты: атакующий лезет именно туда.
    // В начале первой эпохи мины нет вовсе (знакомство), на последних двух
    // секторах она встаёт уже в проход; если проход занят — у добычи.
    const gapPool = (era > 0 || (within >= 8 && trapPlan.mine > 0))
      ? ccShuffle(gaps.map(function (g) { return [g[0], g[1]]; }), rnd)
      : [];

    function placeTrap(type) {
      while (gapPool.length) {
        const g = gapPool.shift();
        if (place(type, g[0], g[1], trapLvl)) return true;
      }
      // Затем — клетки рядом с ресурсами, как «сюрприз» у добычи.
      const resOrder = ccShuffle(resPlaced, rnd);
      for (let r = 0; r < resOrder.length; r++) {
        const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let n = 0; n < nbs.length; n++) {
          const x = resOrder[r][0] + nbs[n][0];
          const y = resOrder[r][1] + nbs[n][1];
          if (place(type, x, y, trapLvl)) return true;
        }
      }
      // Резерв: любая свободная клетка внутри отсека.
      return putInZone(type, trapLvl, Math.floor(rnd() * zones.length) % zones.length, 'far');
    }

    ['mine', 'spring', 'airmine'].forEach(function (type) {
      for (let k = 0; k < trapPlan[type]; k++) placeTrap(type);
    });

    // Добыча растёт по эпохам и секторам.
    const loot = {
      gold: 300 + era * 900 + within * 80,
      elixir: 200 + era * 650 + within * 60
    };

    return {
      id: i + 1,
      seed: seed,
      era: era,
      th: th,
      // Лимиты, по которым собрана база: верхняя граница эпохи (2/4/6/8/10).
      limitTh: capTh,
      name: CC_ERA_TITLES[era] + ' ' + (within + 1),
      hint: CC_ERA_HINTS[era] +
        (era >= 3 && within >= 4 ? ' На этом уровне пригодятся дроны-бомбардировщики.' : ''),
      air: era >= 3 && within >= 4,
      loot: loot,
      layout: layout,
      // Отсеки (включительные координаты) — для отладки и проверок раскладки.
      zones: zones.map(function (z) {
        return { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 };
      })
    };
  },

  all: function () {
    const out = [];
    for (let i = 0; i < 50; i++) out.push(CC.LevelGen.level(i));
    return out;
  }
};


/* Расстановка своей базы: [тип, x, y].
   Новый игрок начинает только с командным центром. Всё остальное — турель,
   лазерная вышка, буры, склады и ангар — ставится по обучению Сержанта
   (см. QUESTS в js/base.js). Раскладка не превышает лимиты TH1. */
CC.LAYOUT = [
  ['townhall', 16, 16]
];

/* Сколько построек можно поставить на своей базе, по уровням командного центра.
   Индекс массива — TH-1 (1..10 уровни). Base.left() считает по текущему TH;
   CC.LIMITS ниже — те же значения для TH10, их читает интерфейс. */
CC.LIMITS_BY_TH = {
  townhall: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  cannon: [1, 2, 3, 3, 4, 4, 5, 5, 6, 8],
  archer: [1, 1, 1, 2, 2, 3, 3, 4, 5, 6],
  mortar: [0, 0, 1, 1, 2, 2, 2, 3, 3, 5],
  airdef: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3],
  mage: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2],
  ambush: [0, 0, 0, 0, 0, 0, 1, 1, 2, 2],
  beam: [0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
  mine: [0, 2, 3, 4, 4, 5, 5, 6, 6, 6],
  spring: [0, 0, 0, 1, 2, 2, 3, 3, 4, 4],
  airmine: [0, 0, 0, 0, 1, 2, 2, 3, 3, 4],
  wall: [0, 20, 40, 60, 80, 100, 120, 130, 140, 150],
  goldmine: [2, 3, 4, 4, 5, 5, 6, 6, 6, 6],
  elixir: [2, 3, 4, 4, 5, 5, 6, 6, 6, 6],
  storage: [1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
  estorage: [1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
  barracks: [1, 1, 2, 2, 3, 3, 4, 4, 4, 4]
};

// Лимит типа на конкретном уровне центра (кривое th не ломает счёт).
CC.limitAt = function (type, th) {
  const row = CC.LIMITS_BY_TH[type];
  if (!row) return 0;
  const n = Math.round(Number(th) || 1);
  const i = n < 1 ? 0 : (n > CC.MAX_TH ? CC.MAX_TH - 1 : n - 1);
  return row[i] || 0;
};

/* Сколько каких построек можно поставить на своей базе: максимумы TH10. */
CC.LIMITS = {
  townhall: 1,
  cannon: 8,
  archer: 6,
  mortar: 5,
  airdef: 3,
  mage: 2,
  ambush: 2,
  beam: 2,
  mine: 6,
  spring: 4,
  airmine: 4,
  wall: 150,
  goldmine: 6,
  elixir: 6,
  storage: 5,
  estorage: 5,
  barracks: 4
};

/* 50 уровней строятся после таблицы лимитов: генератор сверяется с
   CC.limitAt(), чтобы состав базы не превышал лимиты эпохи. */
CC.LEVELS = CC.LevelGen.all();

/* ---------- добыча привязана к постройкам ----------
   Пул уровня заранее разложен по конкретным зданиям. Руда: 85% в склады
   руды, 15% в буры. Энергия: 85% в склады энергии, 15% в реакторы.
   Командный центр не получает лут вовсе.
   Ключ постройки стабилен между заходами: тип + координаты. Именно он
   попадает в st.looted, поэтому разграбленное хранилище в повторе пустое. */
CC.LOOT_SPLIT = { storage: 0.85, extract: 0.15 };

CC.lootKey = function (type, x, y) {
  return String(type) + ':' + Math.floor(Number(x) || 0) + ':' +
    Math.floor(Number(y) || 0);
};

CC.Loot = (function () {
  'use strict';

  function roleOf(type) {
    if (type === 'storage' || type === 'estorage') return 'storage';
    if (type === 'goldmine' || type === 'elixir') return 'extract';
    return '';
  }

  function normRows(rows) {
    const out = [];
    const list = rows || [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      let type;
      let x;
      let y;
      if (Array.isArray(r)) {
        type = r[0]; x = r[1]; y = r[2];
      } else if (r && typeof r === 'object') {
        type = r.type; x = r.x; y = r.y;
      } else {
        continue;
      }
      if (!roleOf(type)) continue;
      out.push({
        type: type,
        x: Math.floor(Number(x) || 0),
        y: Math.floor(Number(y) || 0),
        key: (r && r.key) || CC.lootKey(type, x, y)
      });
    }
    return out;
  }

  function bucket(list, type) {
    return list.filter(function (r) { return r.type === type; });
  }

  // Делим сумму на N построек без потерь: остаток уходит первым.
  function spread(list, amount, res, out) {
    const n = list.length;
    if (!n || amount <= 0) return;
    const base = Math.floor(amount / n);
    let rem = amount - base * n;
    for (let i = 0; i < n; i++) {
      const r = list[i];
      if (!out[r.key]) out[r.key] = { key: r.key, type: r.type, gold: 0, elixir: 0 };
      out[r.key][res] += base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
  }

  function add(out, list, amount, res) {
    spread(list, Math.max(0, Math.floor(amount)), res, out);
  }

  /* Раскладка пула по постройкам. Возвращает объект key → {gold, elixir}.
     Центр в раскладке не участвует. Если склада нужного ресурса нет,
     его доля уходит добытчикам (бурам/реакторам); если нет и их — ресурс
     просто негде хранить и в пул построек он не попадает. */
  function distribute(loot, rows) {
    const out = {};
    const list = normRows(rows);
    if (!list.length) return out;

    const g = Math.max(0, Math.floor(Number(loot && loot.gold) || 0));
    const e = Math.max(0, Math.floor(Number(loot && loot.elixir) || 0));
    if (!g && !e) return out;

    const oreStores = bucket(list, 'storage');
    const elixirStores = bucket(list, 'estorage');
    const goldmine = bucket(list, 'goldmine');
    const reactor = bucket(list, 'elixir');

    const S = CC.LOOT_SPLIT || { storage: 0.85, extract: 0.15 };

    // Округляем вниз только долю склада: остаток (включая округление)
    // уходит добытчикам, поэтому сумма всегда равна пулу.
    let gStore = Math.floor(g * S.storage);
    let gExt = g - gStore;
    let eStore = Math.floor(e * S.storage);
    let eExt = e - eStore;

    // Нет складов — весь ресурс лежит в добытчиках.
    if (!oreStores.length) {
      gExt += gStore;
      gStore = 0;
    }
    // Нет добытчиков — их доля остаётся на складах.
    if (!goldmine.length) {
      gStore += gExt;
      gExt = 0;
    }

    if (!elixirStores.length) {
      eExt += eStore;
      eStore = 0;
    }
    if (!reactor.length) {
      eStore += eExt;
      eExt = 0;
    }

    add(out, oreStores, gStore, 'gold');
    add(out, goldmine, gExt, 'gold');
    add(out, elixirStores, eStore, 'elixir');
    add(out, reactor, eExt, 'elixir');

    return out;
  }

  return {
    distribute: distribute,
    roleOf: roleOf,
    key: function (type, x, y) { return CC.lootKey(type, x, y); }
  };
})();

/* Порядок в палитре строительства. */
CC.PALETTE = [
  'townhall', 'cannon', 'archer', 'mortar', 'airdef', 'mage',
  'ambush', 'beam', 'wall', 'mine', 'spring', 'airmine',
  'goldmine', 'elixir', 'storage', 'estorage', 'barracks'
];

/* Иконки для палитры. */
CC.ICONS = {
  townhall: '🛰️',
  cannon: '💣',
  archer: '📡',
  mortar: '💥',
  airdef: '🎯',
  mage: '⚛️',
  ambush: '🕳️',
  beam: '🔆',
  mine: '💥',
  spring: '🌀',
  airmine: '🎈',
  wall: '🛡️',
  goldmine: '⛏️',
  elixir: '⚡',
  storage: '🗄️',
  estorage: '🔋',
  barracks: '🏗️'
};
