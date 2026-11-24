/* Настройки и баланс. */
window.CC = window.CC || {};

CC.GRID = 44;          // поле 44x44: футпринты справочник не влезают в 36x36
CC.TW = 54;            // ширина тайла (ромб)
CC.TH = 40;            // высота тайла (54:40 ≈ 48°, −7° от 55°)
CC.TIME_LIMIT = 180;   // секунд на бой
// Потолок берём из таблиц: сейчас 19.
CC.MAX_TH = (CC.DATA && CC.DATA.meta && CC.DATA.meta.maxTh) || 19;

/* Стартовая заставка «Колония»: посадочный модуль падает, врезается
   в грунт, раскрывается в командный центр, вспыхивают огни, поднимается
   турель, камера отъезжает — база ожила. Сцену рисует canvas
   (CC.Render.drawIntro), а длительности фаз читают ui.js и художник.
   Все значения в мс, total = сумма пяти фаз = 6500 мс. */
CC.INTRO = {
  flag: 'clash-intro-v1', // старый флаг «уже видел»: только для миграции
  offFlag: 'clash-intro-off-v1', // постоянный отказ от заставки
  // Экран-гейт: браузер не даёт звук без жеста. Пока игрок не нажал,
  // сцена стоит на тёмном титуле; по тапу — Sound.unlock() и анимация.
  gateTitle: 'КРАСНЫЙ РУБЕЖ',
  gateKicker: 'СЕКТОР 7 · МАРС',
  gateHint: 'Нажмите, чтобы начать',
  gateAria: 'Начать заставку «Красный рубеж»',
  fallMs: 2500,           // is-fall: падение модуля к грунту
  impactMs: 500,          // is-impact: удар, пыль, трещины
  unfoldMs: 1500,         // is-unfold: раскрытие в командный центр
  revealMs: 1200,         // is-reveal: огни, турель, отъезд камеры, титул
  titleMs: 800,           // is-title: титул держится и гаснет
  reducedMs: 400,         // prefers-reduced-motion: статичный кадр и фейд
  reducedFrameMs: 200,    // статичный кадр берётся за 200 мс до конца
  safetyMs: 8000          // страховка: снять блокировку, даже если сцена упала
};

/* Сержант: приветствие и лор перед первым шагом обучения. Показываем
   только на новом сейве (флаг tutorial.loreSeen); старые сейвы и пропуск
   обучения лор не получают. Тексты шагов живут в base.js рядом с QUESTS. */
CC.SERGEANT = {
  name: 'Сержант',
  nextLabel: 'Далее',
  startLabel: 'Начать',
  skipLabel: 'Пропустить',
  lore: [
    'Командир, на связи Сержант. Добро пожаловать на Красный рубеж — Сектор 7, Марс. Колония потеряла связь после пылевых бурь.',
    'Старые станции мертвы, орбита сбрасывает модули по одному. Наша задача — поднять базу и удержать сектор: каждый модуль даст оборону, энергию и армию.',
    'Начнём с обороны. Турель — первый рубеж; она бьёт по земле. Поставь её у подхода к центру.'
  ],
  loreArt: [
    'assets/lore-1.svg',
    'assets/lore-2.svg',
    'assets/lore-3.svg'
  ]
};

/* ---------- данные справочник ----------
   Единственное место, где справочник-id превращаются в наши id, имена, роли,
   размеры и боевое поведение. Числа HP/DPS/цены/времени берутся из
   CC.DATA (js/tables.js), здесь — только мета и маппинг. */
const CC_DATA = CC.DATA || { details: {}, counts: {}, maxlv: {}, walls: [], th: [] };

// справочник-id зданий. Ключи CC.DATA.details смешаны с войсками/героями, поэтому
// список зданий собираем явно из CC.DATA.counts (минус стены и оружие центра).
CC.BUILDING_TABLE = {
  townhall: 'townhall',
  wall: 'wall',
  cannon: 'cannon',
  archer: 'archer_tower',
  mortar: 'mortar',
  airdef: 'air_defense',
  mage: 'wizard_tower',
  sweeper: 'air_sweeper',
  ambush: 'hidden_tesla',
  bombtower: 'bomb_tower',
  xbow: 'xbow',
  beam: 'inferno',
  eagle: 'eagle',
  scattershot: 'scattershot',
  monolith: 'monolith',
  spelltower: 'spell_tower',
  multiarcher: 'multi_archer',
  ricochet: 'ricochet',
  multigear: 'multi_gear',
  firespitter: 'firespitter',
  revenge: 'revenge_tower',
  superwizard: 'super_wizard',
  spiky: 'spiky_tower',
  firecracker: 'firecracker',
  goldmine: 'gold_mine',
  elixir: 'elixir_collector',
  darkdrill: 'dark_drill',
  storage: 'gold_storage',
  estorage: 'elixir_storage',
  darkstorage: 'dark_storage',
  barracks: 'army_camp',
  train: 'barracks',
  darktrain: 'dark_barracks',
  spellfactory: 'spell_factory',
  darkspellfactory: 'dark_spell_factory',
  lab: 'laboratory',
  herohall: 'hero_hall',
  pethouse: 'pet_house',
  blacksmith: 'blacksmith',
  workshop: 'workshop',
  clancastle: 'clan_castle',
  squadbarracks: 'squad_barracks',
  mine: 'bomb',
  spring: 'spring_trap',
  airmine: 'air_bomb',
  giantbomb: 'giant_bomb',
  seekingair: 'seeking_air_mine',
  skeletontrap: 'skeleton_trap',
  tornado: 'tornado_trap',
  gigabomb: 'giga_bomb'
};

/* Мета построек: имя, роль, футпринт, цвета и боевые поля.
   w/h — размер в тайлах; height — высота коробки в пикселях.
   range/rate/splash — наши тайловые значения; HP/DPS — строго из таблицы. */
CC.BUILDING_META = {
  townhall: {
    name: 'Командный центр', desc: 'сердце базы, открывает всё',
    role: 'центр', w: 2, h: 2, height: 70,
    color: '#b8793c', top: '#e0a869', thweapon: true
  },
  cannon: {
    name: 'Турель', desc: 'стреляет по земле',
    role: 'наземная', w: 1, h: 1, height: 34,
    color: '#6d7278', top: '#9aa1a8',
    range: 9, rate: 1, onlyGround: true
  },
  archer: {
    name: 'Лазерная вышка', desc: 'бьёт по земле и воздуху',
    role: 'универсальная', w: 1, h: 1, height: 58,
    color: '#8a6b48', top: '#c2a077',
    range: 10, rate: 1, targetsAir: true
  },
  mortar: {
    name: 'Гаубица', desc: 'навесной огонь по площади',
    role: 'площадная', w: 1, h: 1, height: 32,
    color: '#5b4a3a', top: '#9d7c55',
    range: 11, minRange: 4, rate: 1, splash: 1.5, onlyGround: true
  },
  airdef: {
    name: 'Зенитный комплекс', desc: 'только по воздуху',
    role: 'воздушная', w: 1, h: 1, height: 44,
    color: '#586b74', top: '#9fb8c4',
    range: 10, rate: 1, targetsAir: true, airOnly: true
  },
  mage: {
    name: 'Плазменная башня', desc: 'плазма по площади',
    role: 'площадная', w: 1, h: 1, height: 54,
    color: '#684a72', top: '#c08ad0',
    range: 7, rate: 1, splash: 1.2, targetsAir: true
  },
  sweeper: {
    name: 'Вихревой генератор', desc: 'отталкивает воздух',
    role: 'поддержка', w: 1, h: 1, height: 44,
    color: '#4c6b72', top: '#a7dbe0',
    range: 7, rate: 1, targetsAir: true, airOnly: true, special: 'sweeper'
  },
  ambush: {
    name: 'Засадная турель', desc: 'скрыта до подхода врага',
    role: 'засадная', w: 1, h: 1, height: 40,
    color: '#4f6252', top: '#9fb8a2',
    range: 7, rate: 1, targetsAir: true,
    hidden: true, revealRange: 2.5
  },
  bombtower: {
    name: 'Детонатор', desc: 'площадной наземный огонь',
    role: 'площадная', w: 1, h: 1, height: 42,
    color: '#62564a', top: '#d18a4a',
    range: 7, rate: 1, splash: 1.4, onlyGround: true, special: 'bombtower'
  },
  xbow: {
    name: 'Рельсотрон', desc: 'дальний огонь по земле и воздуху',
    role: 'дальняя', w: 1, h: 1, height: 38,
    color: '#555d66', top: '#b8c2cc',
    range: 11, rate: 1, targetsAir: true, special: 'xbow'
  },
  beam: {
    name: 'Орбитальный луч', desc: 'луч усиливается со временем',
    role: 'непрерывная', w: 1, h: 1, height: 58,
    color: '#3f5a78', top: '#8fd4ff',
    range: 10, rate: 1, targetsAir: true,
    beam: true, ramp: 0.25, rampMax: 3, special: 'beam'
  },
  eagle: {
    name: 'Артиллерия «Молот»', desc: 'дальний площадной залп',
    role: 'дальняя', w: 2, h: 1, height: 58,
    color: '#5d4b3a', top: '#d7a85a',
    range: 11, minRange: 4, rate: 1, splash: 1.8,
    targetsAir: true, special: 'eagle'
  },
  scattershot: {
    name: 'Картечная башня', desc: 'площадной огонь по земле и воздуху',
    role: 'площадная', w: 2, h: 1, height: 52,
    color: '#5a5148', top: '#c7a272',
    range: 11, rate: 1, splash: 1.8, targetsAir: true, special: 'scattershot'
  },
  monolith: {
    name: 'Обелиск', desc: 'мощный одиночный удар',
    role: 'тяжёлая', w: 2, h: 1, height: 64,
    color: '#3f4550', top: '#9fa9c0',
    range: 11, rate: 1, targetsAir: true, special: 'monolith'
  },
  spelltower: {
    name: 'Генератор поля', desc: 'накладывает эффект на площадь',
    role: 'поле', w: 1, h: 1, height: 48,
    color: '#4a3f6b', top: '#b49cff',
    range: 7, rate: 1, splash: 1.5, targetsAir: true, special: 'spelltower'
  },
  multiarcher: {
    name: 'Спаренная лазерная вышка', desc: 'две цели одновременно',
    role: 'двойная', w: 1, h: 1, height: 58,
    color: '#7a5a44', top: '#e0b78a',
    range: 10, rate: 1, targetsAir: true, special: 'multiarcher'
  },
  ricochet: {
    name: 'Рикошетная турель', desc: 'прыгающий снаряд',
    role: 'рикошет', w: 1, h: 1, height: 40,
    color: '#4e6266', top: '#a9d0d4',
    range: 9, rate: 1, targetsAir: true, special: 'ricochet'
  },
  multigear: {
    name: 'Многоствольная башня', desc: 'несколько стволов',
    role: 'многоствол', w: 1, h: 1, height: 50,
    color: '#58605a', top: '#bfc9b8',
    range: 10, rate: 1, targetsAir: true, special: 'multigear'
  },
  firespitter: {
    name: 'Плазмомёт', desc: 'площадной наземный огонь',
    role: 'площадная', w: 1, h: 1, height: 46,
    color: '#6b4432', top: '#ff9a5a',
    range: 9, rate: 1, splash: 1.6, onlyGround: true, special: 'firespitter'
  },
  revenge: {
    name: 'Карающая башня', desc: 'поздняя универсальная оборона',
    role: 'универсальная поздняя', w: 1, h: 1, height: 52,
    color: '#4b3a5c', top: '#c98fe0',
    range: 9, rate: 1, targetsAir: true, special: 'revenge'
  },
  superwizard: {
    name: 'Плазменный колосс', desc: 'цепная плазма по площади',
    role: 'площадная универсальная', w: 1, h: 1, height: 62,
    color: '#5a3f7a', top: '#e0a6ff',
    range: 8, rate: 1, splash: 1.8, targetsAir: true,
    chain: 15, special: 'superwizard'
  },
  spiky: {
    name: 'Шиповая башня', desc: 'пассивный ответ на атаки',
    role: 'контратакующая', w: 1, h: 1, height: 44,
    color: '#4a3a3a', top: '#d6a06a',
    passive: true, passivePercent: [0, 6, 9], special: 'spiky'
  },
  firecracker: {
    name: 'Залповая башня', desc: 'взрывной залп по конусу',
    role: 'площадная универсальная', w: 1, h: 1, height: 50,
    color: '#6b4a32', top: '#ffb05a',
    range: 10, rate: 1, splash: 1.6, targetsAir: true,
    cone: true, special: 'firecracker'
  },
  goldmine: {
    name: 'Бур', desc: 'копит руду',
    role: 'добыча', w: 1, h: 1, height: 28, resource: true, produce: 'gold',
    color: '#7d6a4f', top: '#d9b24a'
  },
  elixir: {
    name: 'Реактор', desc: 'копит энергию',
    role: 'добыча', w: 1, h: 1, height: 28, resource: true, produce: 'elixir',
    color: '#5d4b6b', top: '#b06fd0'
  },
  darkdrill: {
    name: 'Плазменный бур', desc: 'копит плазму',
    role: 'добыча', w: 1, h: 1, height: 30, resource: true, produce: 'dark',
    color: '#3f3548', top: '#c77dff'
  },
  storage: {
    name: 'Хранилище руды', desc: 'хранит только руду',
    role: 'склад', w: 1, h: 1, height: 30, resource: true, store: 'gold',
    color: '#77644a', top: '#d0ad6a'
  },
  estorage: {
    name: 'Хранилище энергии', desc: 'хранит только энергию',
    role: 'склад', w: 1, h: 1, height: 30, resource: true, store: 'elixir',
    color: '#4a5a74', top: '#7fc4ff'
  },
  darkstorage: {
    name: 'Хранилище плазмы', desc: 'хранит только плазму',
    role: 'склад', w: 1, h: 1, height: 30, resource: true, store: 'dark',
    color: '#3a3142', top: '#b06adf'
  },
  barracks: {
    name: 'Ангар', desc: 'даёт места в армии',
    role: 'армия', w: 2, h: 1, height: 38,
    color: '#7b5a3a', top: '#c9a06a', housing: true
  },
  train: {
    name: 'Казарма', desc: 'тренирует войска',
    role: 'армия', w: 2, h: 1, height: 34,
    color: '#6f5a42', top: '#d1b07a', training: true
  },
  darktrain: {
    name: 'Казарма плазмы', desc: 'тренирует тёмные войска',
    role: 'армия', w: 2, h: 1, height: 34,
    color: '#45394f', top: '#b984d8', training: true, darkTraining: true
  },
  spellfactory: {
    name: 'Генератор аномалий', desc: 'готовит заклинания',
    role: 'армия', w: 2, h: 1, height: 40,
    color: '#3d5a7a', top: '#8fd0ff', spells: true
  },
  darkspellfactory: {
    name: 'Резонатор плазмы', desc: 'готовит тёмные заклинания',
    role: 'армия', w: 2, h: 1, height: 40,
    color: '#443553', top: '#c28fe8', spells: true, darkSpells: true
  },
  lab: {
    name: 'Исследовательский центр', desc: 'изучает войска и заклинания',
    role: 'развитие', w: 2, h: 1, height: 36,
    color: '#2f6b6b', top: '#63c9c1', research: true
  },
  herohall: {
    name: 'Академия героя', desc: 'готовит и качает героев',
    role: 'развитие', w: 2, h: 1, height: 48,
    color: '#8a3a32', top: '#d9a441', heroHall: true
  },
  pethouse: {
    name: 'Питомник', desc: 'дом питомцев героев',
    role: 'развитие', w: 2, h: 1, height: 38,
    color: '#5a3a4a', top: '#d77fa0', petHouse: true
  },
  blacksmith: {
    name: 'Оружейная', desc: 'снаряжение героев',
    role: 'развитие', w: 2, h: 1, height: 36,
    color: '#554a3e', top: '#c8a15c', equipment: true
  },
  workshop: {
    name: 'Сборочный цех', desc: 'собирает осадные машины',
    role: 'развитие', w: 2, h: 1, height: 38,
    color: '#4d5a4a', top: '#b9c99a', siege: true
  },
  clancastle: {
    name: 'Орбитальная станция', desc: 'резерв и подкрепление',
    role: 'армия', w: 2, h: 1, height: 46,
    color: '#4a5468', top: '#a9b8d8'
  },
  squadbarracks: {
    name: 'Казарма эскадрильи', desc: 'режим отрядов',
    role: 'армия', w: 2, h: 1, height: 34,
    color: '#5a4e3a', top: '#c8b07a', squad: true
  },
  mine: {
    name: 'Мина', desc: 'взрыв под ногами',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 10,
    color: '#5f4a32', top: '#d76a3c',
    trap: true, trapKind: 'ground', radius: 1.2, splash: 1.4
  },
  spring: {
    name: 'Пружина', desc: 'подбрасывает лёгких бойцов',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 10,
    color: '#5b6066', top: '#c9d3dc',
    trap: true, trapKind: 'spring', radius: 1.4, capacity: 4, maxUnitSpace: 2
  },
  airmine: {
    name: 'Воздушная мина', desc: 'взрыв против дронов',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 10,
    color: '#3f4a60', top: '#7fc4ff',
    trap: true, trapKind: 'air', radius: 1.2, splash: 1.6
  },
  giantbomb: {
    name: 'Тяжёлая мина', desc: 'площадной взрыв по земле',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 22,
    color: '#5a3e2e', top: '#ff8a4a',
    trap: true, trapKind: 'ground', radius: 2, splash: 2
  },
  seekingair: {
    name: 'Ракетная мина', desc: 'сильный удар по воздуху',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 12,
    color: '#38465c', top: '#8fc4ff',
    trap: true, trapKind: 'air', radius: 1.2, splash: 1.4
  },
  skeletontrap: {
    name: 'Ловушка-дрон', desc: 'выпускает дронов',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 14,
    color: '#4b4a3a', top: '#e3d6a2',
    trap: true, trapKind: 'skeleton', radius: 1.2, capacity: 2
  },
  tornado: {
    name: 'Гравитационная ловушка', desc: 'затягивает отряд',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 22,
    color: '#3d5060', top: '#a9d8e8',
    trap: true, trapKind: 'tornado', radius: 2, capacity: 1
  },
  gigabomb: {
    name: 'Гига-мина', desc: 'огромный урон по земле',
    role: 'ловушка', w: 1, h: 1, hp: 1, height: 24,
    color: '#4a2e2e', top: '#ff6a4a',
    trap: true, trapKind: 'ground', radius: 2.2, splash: 2.4
  },
  wall: {
    name: 'Энергобарьер', desc: 'держит врага, не пропускает',
    role: 'стена', w: 1, h: 1, height: 18,
    color: '#8d877d', top: '#b3ada2'
  }
};

// Роль и описание берём из путеводителя таблиц, имя остаётся нашим.
Object.keys(CC.BUILDING_META).forEach(function (id) {
  const tableId = CC.BUILDING_TABLE[id];
  const guide = tableId && (CC_DATA.buildingGuide || {})[tableId];
  if (!guide) return;
  const clean = function (text) {
    return String(text)
      .replace(/\bTH(\d+)\b/g, 'центр $1')
      .replace(/\bTH\b/g, 'центра');
  };
  if (guide.role) CC.BUILDING_META[id].role = clean(guide.role);
  if (guide.what) CC.BUILDING_META[id].desc = clean(guide.what);
});

// Список зданий: только ключи CC.DATA.counts (кроме стены и оружия центра)
// плюс сам центр и стена. Никаких войск/героев/питомцев из details.
CC.BUILDING_ORDER = Object.keys(CC.BUILDING_META);

// Уровни справочника не выше потолка 19. Строки TH18–19 входят в игру,
// более высокие отсекаются фильтром.
CC._tableLevels = function (coc) {
  let rows = [];
  if (coc === 'townhall') {
    rows = (CC_DATA.th || []).filter(function (r) {
      return !r.th || r.th <= CC.MAX_TH;
    }).map(function (r) {
      // У строк центра уровень называется th, а не lv.
      const row = {};
      for (const k in r) row[k] = r[k];
      row.lv = r.th;
      return row;
    });
  } else if (coc === 'wall') {
    rows = (CC_DATA.walls || []).filter(function (r) { return !r.th || r.th <= CC.MAX_TH; });
  } else {
    const e = (CC_DATA.details || {})[coc];
    rows = (e && e.levels) || [];
    rows = rows.filter(function (r) { return !r.th || r.th <= CC.MAX_TH; });
  }
  return rows.slice().sort(function (a, b) { return (a.lv || 0) - (b.lv || 0); });
};

CC._tableEntity = function (coc) {
  if (coc === 'townhall') return { coc: 'townhall', name: 'Ратуша', currency: 'gold' };
  if (coc === 'wall') return { coc: 'wall', name: 'Стена', currency: 'gold' };
  return (CC_DATA.details || {})[coc] || null;
};

// Строка таблицы построек по нашему id и уровню. У стен и центра — свои
// таблицы, поэтому хелпер один для всех.
CC.buildingLevel = function (id, lv) {
  const coc = CC.BUILDING_TABLE[id] || id;
  const rows = CC._tableLevels(coc);
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

CC.buildingMaxLevel = function (id) {
  const rows = CC._tableLevels(CC.BUILDING_TABLE[id] || id);
  return rows.length ? (rows[rows.length - 1].lv || 1) : 0;
};

/* Наши точечные исключения из counts. Лазерная вышка нужна обучению
   Сержанта на TH1, поэтому у неё лимит 1 и maxlv 1 уже на первом центре. */
CC.LIMIT_OVERRIDES = { archer: { 1: 1 } };
CC.MAXLV_OVERRIDES = { archer: { 1: 1 } };

// Лимит количества по уровню центра. Значения уже массивы 1..19.
CC.limitAt = function (type, th) {
  if (type === 'townhall') return 1;
  const n = Math.round(Number(th) || 1);
  const ov = (CC.LIMIT_OVERRIDES[type] || {})[n];
  if (ov !== undefined) return ov;
  const coc = CC.BUILDING_TABLE[type] || type;
  const row = (CC_DATA.counts || {})[coc];
  if (!row) return 0;
  const i = n < 1 ? 0 : (n > CC.MAX_TH ? CC.MAX_TH - 1 : n - 1);
  const v = Array.isArray(row) ? row[i] : Number(row[String(i + 1)]);
  return Math.max(0, Math.floor(Number(v) || 0));
};

// Потолок уровня постройки на уровне центра. Значение maxlv может быть
// массивом или объектом с ключами TH; "6 + 2" генератор уже свёл к 6.
CC.maxLevelAt = function (id, th) {
  if (id === 'townhall') return CC.MAX_TH;
  const coc = CC.BUILDING_TABLE[id] || id;
  const max = CC.buildingMaxLevel(id);
  if (!max) return 0;
  const n = Math.round(Number(th) || 1);
  const ov = (CC.MAXLV_OVERRIDES[id] || {})[n];
  if (ov !== undefined) return Math.min(max, ov);
  const row = (CC_DATA.maxlv || {})[coc];
  if (!row) return max;
  const i = n < 1 ? 0 : (n > CC.MAX_TH ? CC.MAX_TH - 1 : n - 1);
  const v = Array.isArray(row) ? row[i] : Number(row[String(i + 1)]);
  const lvl = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(max, lvl));
};

CC.buildingRow = function (id, lv) { return CC.buildingLevel(id, lv); };

// Цена перехода НА уровень to. Валюта — из сущности справочник.
CC.upgradeCost = function (id, to) {
  const coc = CC.BUILDING_TABLE[id] || id;
  const row = CC.buildingLevel(id, to);
  const ent = CC._tableEntity(coc) || {};
  const currency = ent.currency || 'gold';
  const out = {
    gold: 0, elixir: 0, dark: 0,
    time: Math.max(0, Number(row.time) || 0),
    level: Math.max(0, (Math.floor(Number(to) || 1)) - 1),
    to: Math.floor(Number(to) || 1),
    coc: coc,
    currency: currency
  };
  if (coc === 'wall') {
    // У стены цена лежит в отдельных колонках руды/энергии.
    const g = Number(row.gold) || 0;
    const e = Number(row.elixir) || 0;
    if (g > 0) out.gold = g;
    else if (e > 0) out.elixir = e;
    out.time = 0;
    return out;
  }
  const cost = Math.max(0, Number(row.cost) || 0);
  if (currency === 'elixir') out.elixir = cost;
  else if (currency === 'dark') out.dark = cost;
  else out.gold = cost;
  return out;
};

// Цена и время сегмента стены до уровня lv (для UI и смоука).
CC.wallUpgrade = function (lv) {
  return CC.upgradeCost('wall', Math.max(2, Math.floor(Number(lv) || 2)));
};

// Цена постановки: строка 1 уровня из таблицы. Центр не ставится.
CC.placeCost = function (type) {
  if (type === 'townhall') return { gold: 0, elixir: 0, dark: 0 };
  const c = CC.upgradeCost(type, 1);
  return { gold: c.gold || 0, elixir: c.elixir || 0, dark: c.dark || 0 };
};

// Время постановки (1 уровень) и апгрейда до уровня.
CC.buildTime = function (type, toLevel) {
  if (type === 'wall') return 0;
  return CC.upgradeCost(type, toLevel).time;
};
CC.placeTime = function (type) { return CC.buildTime(type, 1); };

// Сборка CC.BUILDINGS из меты и таблиц. hp/dmg на 1 уровне остаются в
// объекте для старых читателей; боевые расчёты идут через BuildingStats.
CC.BUILDINGS = {};
CC.BUILDING_ORDER.forEach(function (id) {
  const meta = CC.BUILDING_META[id];
  const coc = CC.BUILDING_TABLE[id];
  if (!coc) return;
  if (id !== 'townhall' && id !== 'wall' && !(CC_DATA.counts || {})[coc]) return;
  const rows = CC._tableLevels(coc);
  if (!rows.length) return;
  const row = rows[0];
  // Строим объект из меты без мутации исходника.
  const def = {};
  for (const k in meta) def[k] = meta[k];
  def.coc = coc;
  def.hp = Number(row.hp) || Number(meta.hp) || 1;
  const dps = row.dps != null ? row.dps : row.dmg;
  if (dps != null) def.dmg = dps;
  if (row.cap != null) def.cap = row.cap;
  if (row.prod != null) def.prod = row.prod;
  if (row.radius != null) def.radius = row.radius;
  CC.BUILDINGS[id] = def;
});

// Список ловушек — из данных, а не отдельного ручного массива.
// Ресурсы в порядке интерфейса. gold — руда, elixir — энергия,
// dark — плазма; платина (gems) — отдельная премиум-валюта.
CC.RESOURCES = ['gold', 'elixir', 'dark'];
CC.RESOURCE_NAMES = {
  gold: 'руда',
  elixir: 'энергия',
  dark: 'плазма',
  gems: 'платина'
};

CC.TRAP_TYPES = CC.BUILDING_ORDER.filter(function (t) {
  return CC.BUILDINGS[t] && CC.BUILDINGS[t].trap;
});
CC.isTrap = function (type) {
  const d = CC.BUILDINGS[type];
  return !!(d && d.trap);
};

// Цена постановки для старого интерфейса/тестов: объект по всем типам.
CC.PLACE_COST = {};
CC.UPGRADES = {};
CC.BUILDING_ORDER.forEach(function (type) {
  const c = CC.placeCost(type);
  CC.PLACE_COST[type] = { gold: c.gold, elixir: c.elixir, dark: c.dark };
  const to2 = CC.upgradeCost(type, 2);
  CC.UPGRADES[type] = {
    max: CC.buildingMaxLevel(type),
    cost: { gold: to2.gold, elixir: to2.elixir, dark: to2.dark },
    time: to2.time,
    fromTable: true
  };
});
// Совместимые старые массивы: реальные значения берутся из CC.upgradeCost.
CC.BUILD_TIME = [];
CC.TOWNHALL_TIME = {};

// Валюта сущности: building/troop/hero/pet/spell.
CC.entityCurrency = function (kind, id) {
  if (kind === 'building') return (CC._tableEntity(CC.BUILDING_TABLE[id] || id) || {}).currency || 'gold';
  let coc = id;
  if (kind === 'troop') coc = CC.TROOP_TABLE[id] || id;
  else if (kind === 'hero') coc = CC.HERO_TABLE[id] || id;
  const group = kind === 'troop' ? CC_DATA.troops :
    (kind === 'hero' ? CC_DATA.heroes : (kind === 'pet' ? CC_DATA.pets : CC_DATA.spells));
  const ent = (group || {})[coc];
  return (ent && ent.currency) || 'gold';
};

// Данные героев, питомцев и заклинаний для хелперов ниже.
CC._heroRows = function (coc) {
  const ent = (CC_DATA.heroes || {})[coc];
  if (!ent) return [];
  return (ent.levels || []).filter(function (r) {
    return (r._th == null || r._th <= CC.MAX_TH) && (r.th == null || r.th <= CC.MAX_TH);
  });
};

/* ---------- войска ----------
   32 типа из CC.DATA.troops. space/speed/range/target/fly/role — ручная
   мета; HP/DPS — строго таблица. Цена и время тренировки остаются нашими:
   в справочник 2026 время тренировки убрано, а research cost — это лаборатория. */
CC.TROOP_TABLE = {
  barb: 'barbarian',
  archer: 'archer',
  giant: 'giant',
  goblin: 'goblin',
  gnome: 'wall_breaker',
  airship: 'balloon',
  wizard: 'wizard',
  healer: 'healer',
  dragon: 'dragon',
  pekka: 'pekka',
  babydragon: 'baby_dragon',
  miner: 'miner',
  electrodragon: 'electro_dragon',
  yeti: 'yeti',
  dragonrider: 'dragon_rider',
  electrotitan: 'electro_titan',
  rootrider: 'root_rider',
  thrower: 'thrower',
  meteorgolem: 'meteor_golem',
  minion: 'minion',
  hogrider: 'hog_rider',
  valkyrie: 'valkyrie',
  golem: 'golem',
  witch: 'witch',
  lavahound: 'lava_hound',
  bowler: 'bowler',
  icegolem: 'ice_golem',
  headhunter: 'headhunter',
  apprentice: 'apprentice_warden',
  druid: 'druid',
  furnace: 'furnace',
  ruinwitch: 'ruin_witch'
};

CC.TROOP_META = {
  barb: { name: 'Штурмовик', desc: 'танк, идёт первым', icon: '🪖',
    color: '#e0663c', space: 1, speed: 2.4, range: 0.9, target: 'any',
    cost: 20, time: 5, role: 'ближний' },
  archer: { name: 'Лазерщик', desc: 'бьёт издалека по всем', icon: '🔫',
    color: '#63b352', space: 1, speed: 2.8, range: 3.6, target: 'any',
    cost: 35, time: 7, role: 'дальний' },
  giant: { name: 'Мех', desc: 'танк, ломает турели', icon: '🤖',
    color: '#a8703f', space: 5, speed: 1.5, range: 1, target: 'defense',
    cost: 120, time: 25, role: 'танк' },
  goblin: { name: 'Мародёр', desc: 'грабит буры и реакторы', icon: '🦾',
    color: '#8fce3f', space: 1, speed: 3.2, range: 0.9, target: 'resource',
    cost: 25, time: 6, role: 'добытчик' },
  gnome: { name: 'Подрывник', desc: 'рвёт энергобарьеры в клочья', icon: '🧨',
    color: '#d9a05b', space: 2, speed: 3.4, range: 0.8, target: 'wall',
    wallBonus: 4, cost: 60, time: 8, role: 'стенобой' },
  airship: { name: 'Дрон-бомбардировщик', desc: 'летит и бомбит по площади',
    icon: '🛸', color: '#c46a3f', space: 5, speed: 0.85, range: 1.2,
    target: 'any', fly: true, splash: 1.5, cost: 220, time: 45, role: 'воздух' },
  wizard: { name: 'Плазмщик', desc: 'дальний площадной огонь', icon: '⚛️',
    color: '#8f6ad6', space: 4, speed: 2.2, range: 3.2, target: 'any',
    splash: 1.3, cost: 120, time: 20, role: 'площадной' },
  healer: { name: 'Ремонтник', desc: 'лечит союзников', icon: '🩹',
    color: '#e8e3d0', space: 14, speed: 2, range: 0, target: 'heal',
    heal: true, cost: 300, time: 40, role: 'поддержка' },
  dragon: { name: 'Краер', desc: 'воздух, мощный', icon: '🐉',
    color: '#b04a3a', space: 20, speed: 1.8, range: 1.6, target: 'any',
    fly: true, splash: 1.2, cost: 420, time: 55, role: 'воздух' },
  pekka: { name: 'Экзоскелет', desc: 'тяжёлый ближний', icon: '🗡️',
    color: '#6a6f8a', space: 25, speed: 1.5, range: 1, target: 'defense',
    cost: 520, time: 60, role: 'танк' },
  babydragon: { name: 'Дракончик', desc: 'воздух, площадной', icon: '🐲',
    color: '#c77a4a', space: 10, speed: 2.4, range: 2, target: 'any',
    fly: true, splash: 1.2, cost: 280, time: 40, role: 'воздух' },
  miner: { name: 'Крот', desc: 'подземный', icon: '⛏️',
    color: '#9a7a4a', space: 5, speed: 2.2, range: 1, target: 'defense',
    cost: 180, time: 24, role: 'подземный' },
  electrodragon: { name: 'Дуговой дракон', desc: 'воздух, цепь', icon: '⚡',
    color: '#5a8ad6', space: 30, speed: 1.6, range: 2.5, target: 'any',
    fly: true, chain: 3, cost: 620, time: 65, role: 'воздух' },
  yeti: { name: 'Ледяной гигант', desc: 'танк, детёныши', icon: '❄️',
    color: '#a8c8d8', space: 18, speed: 1.6, range: 1, target: 'defense',
    spawn: 4, cost: 380, time: 50, role: 'танк' },
  dragonrider: { name: 'Наездник', desc: 'воздух, быстрый', icon: '🪽',
    color: '#8a5a4a', space: 25, speed: 2.4, range: 1, target: 'any',
    fly: true, cost: 520, time: 60, role: 'воздух' },
  electrotitan: { name: 'Титан', desc: 'тяжёлый, цепь', icon: '🔱',
    color: '#6a7ad6', space: 32, speed: 1.5, range: 1, target: 'defense',
    chain: 4, cost: 680, time: 70, role: 'танк' },
  rootrider: { name: 'Корневой таран', desc: 'стены, танк', icon: '🌿',
    color: '#7a8a4a', space: 20, speed: 1.8, range: 1, target: 'any',
    wallBonus: 3, cost: 460, time: 55, role: 'танк' },
  thrower: { name: 'Метатель дисков', desc: 'дальний', icon: '💿',
    color: '#c8a05a', space: 16, speed: 2, range: 6, target: 'defense',
    cost: 400, time: 50, role: 'дальний' },
  meteorgolem: { name: 'Метеорит', desc: 'тяжёлый, площадной', icon: '☄️',
    color: '#8a5a3a', space: 30, speed: 1.2, range: 1, target: 'any',
    splash: 2, cost: 660, time: 70, role: 'танк' },
  minion: { name: 'Скат', desc: 'воздух', icon: '🦇',
    color: '#7a6aa8', space: 2, speed: 3.2, range: 2.5, target: 'any',
    fly: true, cost: 40, time: 8, role: 'воздух' },
  hogrider: { name: 'Рейдер', desc: 'прыгает через стены', icon: '🐗',
    color: '#a8744a', space: 5, speed: 3.4, range: 1, target: 'defense',
    jumpsWalls: true, cost: 160, time: 22, role: 'быстрый' },
  valkyrie: { name: 'Валькирия', desc: 'площадной ближний', icon: '🪓',
    color: '#d08a4a', space: 8, speed: 2.8, range: 1, target: 'any',
    splash: 1.5, cost: 220, time: 30, role: 'площадной' },
  golem: { name: 'Голем', desc: 'танк, распадается', icon: '🗿',
    color: '#8a8a7a', space: 30, speed: 1.2, range: 1, target: 'defense',
    spawn: 2, cost: 560, time: 65, role: 'танк' },
  witch: { name: 'Некрос', desc: 'призывает скелетов', icon: '💀',
    color: '#6a5a7a', space: 12, speed: 1.8, range: 4, target: 'any',
    spawn: 4, cost: 320, time: 45, role: 'призыв' },
  lavahound: { name: 'Лавовый пёс', desc: 'воздушный танк', icon: '🌋',
    color: '#d05a3a', space: 30, speed: 1, range: 1, target: 'defense',
    fly: true, spawn: 8, cost: 580, time: 65, role: 'воздух' },
  bowler: { name: 'Крушитель', desc: 'дальний, рикошет', icon: '🎳',
    color: '#8a7a6a', space: 6, speed: 2.2, range: 3, target: 'any',
    splash: 1.5, cost: 200, time: 28, role: 'площадной' },
  icegolem: { name: 'Криоголем', desc: 'танк, заморозка', icon: '🧊',
    color: '#8ac8e0', space: 15, speed: 2, range: 1, target: 'defense',
    freeze: true, cost: 320, time: 45, role: 'танк' },
  headhunter: { name: 'Охотник', desc: 'ищет героев', icon: '🎯',
    color: '#b85a8a', space: 6, speed: 3, range: 1, target: 'hero',
    cost: 200, time: 28, role: 'антигерой' },
  apprentice: { name: 'Ученик', desc: 'поддержка', icon: '📘',
    color: '#6ab8c8', space: 20, speed: 2, range: 3, target: 'support',
    support: true, cost: 420, time: 55, role: 'поддержка' },
  druid: { name: 'Друид', desc: 'поддержка', icon: '🌱',
    color: '#7ab86a', space: 16, speed: 2, range: 3, target: 'support',
    support: true, cost: 380, time: 50, role: 'поддержка' },
  furnace: { name: 'Печь', desc: 'призывает огонь', icon: '🔥',
    color: '#d0783a', space: 15, speed: 1.8, range: 3, target: 'any',
    spawn: 6, cost: 360, time: 48, role: 'призыв' },
  ruinwitch: { name: 'Руинная ведьма', desc: 'призывает руины', icon: '🕯️',
    color: '#7a5a8a', space: 20, speed: 1.8, range: 4, target: 'any',
    spawn: 6, cost: 440, time: 58, role: 'призыв' }
};

// Характеристики из табличных traits: место, дальность, скорость, роль,
// описание и темп атаки. Приоритет цели и полёт остаются нашими.
Object.keys(CC.TROOP_TABLE).forEach(function (id) {
  const m = CC.TROOP_META[id];
  const trait = (CC_DATA.troopTraits || {})[CC.TROOP_TABLE[id]];
  if (!m || !trait) return;
  if (trait.space != null) m.space = Number(trait.space) || m.space;
  if (trait.range != null) m.range = Number(trait.range) || m.range;
  if (trait.role) m.role = trait.role;
  if (trait.what) m.desc = trait.what;
  if (trait.speed != null) m.speed = (Number(trait.speed) || 0) / 10;
  if (trait.attackSpeed != null) m.attackSpeed = Number(trait.attackSpeed);
  m.targets = trait.targets || '';
  if (trait.targets) {
    m.onlyGround = /земля/.test(trait.targets) && !/воздух/.test(trait.targets);
    m.targetsAir = /воздух/.test(trait.targets);
  }
});

// Порядок карточек — по открытию, затем по таблице.
CC.ARMY_ORDER = [
  'barb', 'archer', 'giant', 'goblin', 'gnome', 'airship', 'wizard', 'healer',
  'dragon', 'pekka', 'babydragon', 'miner', 'electrodragon', 'yeti',
  'dragonrider', 'electrotitan', 'rootrider', 'thrower', 'meteorgolem',
  'minion', 'hogrider', 'valkyrie', 'golem', 'witch', 'lavahound', 'bowler',
  'icegolem', 'headhunter', 'apprentice', 'druid', 'furnace', 'ruinwitch'
];

// Строка уровня войска: hp/dps/цена research/время research/требование лабы.
CC.troopLevelRow = function (id, lv) {
  const coc = CC.TROOP_TABLE[id] || id;
  const ent = (CC_DATA.troops || {})[coc];
  const rows = (ent && ent.levels) || [];
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

// Потолок войск на TH: максимум лаборатории, доступный на этом центре.
CC.troopMaxLevel = function (id, th) {
  const coc = CC.TROOP_TABLE[id] || id;
  const ent = (CC_DATA.troops || {})[coc];
  if (!ent) return 0;
  const thN = Math.max(1, Math.min(CC.MAX_TH, Math.round(Number(th) || 1)));
  const labRow = (CC_DATA.maxlv || {}).laboratory;
  let lab = 0;
  if (labRow) {
    const v = Array.isArray(labRow) ? labRow[thN - 1] : Number(labRow[String(thN)]);
    lab = Math.max(0, Math.floor(Number(v) || 0));
  }
  let best = 0;
  (ent.levels || []).forEach(function (r) {
    if (r.th != null && r.th > CC.MAX_TH) return;
    if ((Number(r.lab) || 0) <= lab) best = Math.max(best, r.lv || 0);
  });
  return best;
};

CC.troopStats = function (id, lv) {
  const meta = CC.TROOP_META[id] || {};
  const row = CC.troopLevelRow(id, lv);
  if (!meta.name && !row.lv) return null;
  const hp = Number(row.hp) || 0;
  const dmg = Number(row.dps != null ? row.dps : row.dmg) || 0;
  return {
    id: id, type: id, level: row.lv || Math.max(1, Math.floor(Number(lv) || 1)),
    name: meta.name || id, role: meta.role || '',
    hp: hp, dmg: dmg, dps: Number(row.dps) || dmg,
    cost: meta.cost || 0, time: meta.time || 0,
    space: meta.space || 1, speed: meta.speed || 2,
    range: meta.range || 1, target: meta.target || 'any',
    fly: !!meta.fly, splash: meta.splash || 0,
    onlyGround: !!meta.onlyGround, targetsAir: !!meta.targetsAir,
    targets: meta.targets || '',
    attackSpeed: meta.attackSpeed || 1,
    color: meta.color || '#c0c0c0', icon: meta.icon || '👾',
    desc: meta.desc || '', row: row
  };
};

// CC.TROOPS: мета + статы 1 уровня (для старых читателей).
CC.TROOPS = {};
CC.ARMY_ORDER.forEach(function (id) {
  const s = CC.troopStats(id, 1);
  if (!s) return;
  const meta = CC.TROOP_META[id] || {};
  CC.TROOPS[id] = {
    name: s.name, desc: s.desc, icon: s.icon, color: s.color,
    hp: s.hp, dmg: s.dmg, speed: s.speed, range: s.range,
    target: s.target, fly: !!s.fly, splash: s.splash,
    space: s.space, cost: s.cost, time: s.time, role: s.role,
    onlyGround: !!s.onlyGround, targetsAir: !!s.targetsAir,
    targets: s.targets, attackSpeed: s.attackSpeed,
    coc: CC.TROOP_TABLE[id], wallBonus: meta.wallBonus || 0
  };
});

/* Открытие войск — из unlocks.troop. Английские имена справочник переводим в наши
   id; всё, что не нашли, не теряем, а просто не показываем. */
CC.TROOP_UNLOCK = {};
(function () {
  const byName = {};
  Object.keys(CC.TROOP_TABLE).forEach(function (id) {
    const ent = (CC_DATA.troops || {})[CC.TROOP_TABLE[id]];
    if (ent) byName[ent.name] = id;
  });
  // Резерв для точных английских имён из unlocks.
  const aliases = {
    'Barbarian': 'barb', 'Archer': 'archer', 'Giant': 'giant',
    'Goblin': 'goblin', 'Wall Breaker': 'gnome', 'Balloon': 'airship',
    'Wizard': 'wizard', 'Healer': 'healer', 'Dragon': 'dragon',
    'P.E.K.K.A': 'pekka', 'Baby Dragon': 'babydragon', 'Miner': 'miner',
    'Electro Dragon': 'electrodragon', 'Yeti': 'yeti',
    'Dragon Rider': 'dragonrider', 'Electro Titan': 'electrotitan',
    'Root Rider': 'rootrider', 'Thrower': 'thrower',
    'Meteor Golem': 'meteorgolem', 'Minion': 'minion',
    'Hog Rider': 'hogrider', 'Valkyrie': 'valkyrie', 'Golem': 'golem',
    'Witch': 'witch', 'Lava Hound': 'lavahound', 'Bowler': 'bowler',
    'Ice Golem': 'icegolem', 'Headhunter': 'headhunter',
    'Apprentice Warden': 'apprentice', 'Druid': 'druid',
    'Furnace': 'furnace', 'Ruin Witch': 'ruinwitch'
  };
  const src = (CC_DATA.unlocks || {}).troop || {};
  for (let t = 1; t <= CC.MAX_TH; t++) {
    const list = src[String(t)] || [];
    list.forEach(function (name) {
      const id = aliases[name] || byName[name];
      if (id && CC.TROOP_UNLOCK[id] === undefined) CC.TROOP_UNLOCK[id] = t;
    });
  }
  CC.ARMY_ORDER.forEach(function (id) {
    if (CC.TROOP_UNLOCK[id] === undefined) CC.TROOP_UNLOCK[id] = 1;
  });
})();

// Уровень центра, с которого открыт тип войск (0 — неизвестный тип).
CC.troopUnlock = function (type) {
  return CC.TROOP_UNLOCK[type] || 0;
};

/* Устаревшая константа: формулы ×2 больше нет. Оставлена только как
   совместимый маркер для внешних читателей. */
CC.TROOP_LEVEL = { max: CC.MAX_TH, deprecated: true };

/* ---------- шесть героев ----------
   Уровни, HP/DPS, цена и время — из CC.DATA.heroes по уровням. Потолок
   героя — Hero Hall + TH (см. heroMaxLevel). Общий в сейве уровень
   heroLevel остаётся нашим: старый API heroStatsFor(kind, level) жив.
   Способность «Щит» — 3 секунды неуязвимости, один раз за бой. */
CC.HERO_TABLE = {
  barb: 'bk',
  archer: 'aq',
  giant: 'gw',
  goblin: 'rc',
  airship: 'mp',
  dragon: 'dd'
};

CC.HERO_META = {
  barb: { name: 'Сержант', base: 'barb', role: 'Штурмовик',
    portrait: 'assets/portraits/barb.png', speed: 2.0, range: 1.2, target: 'any' },
  archer: { name: 'Снайпер', base: 'archer', role: 'Лазерщик',
    portrait: 'assets/portraits/archer.png', speed: 2.6, range: 5, target: 'any' },
  giant: { name: 'Мех-командир', base: 'giant', role: 'Мех',
    portrait: 'assets/portraits/giant.png', speed: 1.8, range: 4, target: 'any' },
  goblin: { name: 'Главарь', base: 'goblin', role: 'Мародёр',
    portrait: 'assets/portraits/goblin.png', speed: 2.8, range: 1.2, target: 'any' },
  airship: { name: 'Пилот', base: 'airship', role: 'Дрон',
    portrait: 'assets/portraits/airship.png', speed: 3, range: 3, target: 'any', fly: true },
  dragon: { name: 'Герцог', base: 'dragon', role: 'Краер',
    portrait: 'assets/portraits/dragon.png', speed: 2.2, range: 4, target: 'any', fly: true }
};

CC._heroEnt = function (id) {
  return (CC_DATA.heroes || {})[CC.HERO_TABLE[id] || id] || null;
};

CC.heroLevelRow = function (id, lv) {
  const ent = CC._heroEnt(id);
  if (!ent) return {};
  const rows = (ent.levels || []).filter(function (r) {
    return (r.th == null || r.th <= CC.MAX_TH);
  });
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

// Потолок героя: максимум с учётом TH и уровня Hero Hall, доступного на TH.
CC.heroMaxLevel = function (id, th) {
  const ent = CC._heroEnt(id);
  if (!ent) return 0;
  const thN = Math.max(1, Math.min(CC.MAX_TH, Math.round(Number(th) || 1)));
  const hallRow = (CC_DATA.maxlv || {}).hero_hall;
  let hall = 0;
  if (hallRow) {
    const v = Array.isArray(hallRow) ? hallRow[thN - 1] : Number(hallRow[String(thN)]);
    hall = Math.max(0, Math.floor(Number(v) || 0));
  }
  let best = 0;
  (ent.levels || []).forEach(function (r) {
    if (r.th != null && r.th > CC.MAX_TH) return;
    if (r.th != null && r.th > thN) return;
    if ((Number(r.hall) || 0) > hall) return;
    best = Math.max(best, r.lv || 0);
  });
  return best;
};

CC.heroStatsFor = function (id, lv) {
  const meta = CC.HERO_META[id] || CC.HERO_META.barb;
  const row = CC.heroLevelRow(id, lv);
  const level = row.lv || Math.max(1, Math.floor(Number(lv) || 1));
  return {
    id: id,
    coc: CC.HERO_TABLE[id] || id,
    level: level,
    name: meta.name,
    role: meta.role,
    portrait: meta.portrait,
    hp: Number(row.hp) || 0,
    dmg: Number(row.dps != null ? row.dps : row.row_dmg) || 0,
    dps: Number(row.dps) || 0,
    cost: Number(row.cost) || 0,
    time: Math.max(0, Number(row.time) || 0),
    currency: (CC._heroEnt(id) || {}).currency || 'dark',
    speed: meta.speed,
    range: meta.range,
    target: meta.target || 'any',
    fly: !!meta.fly,
    space: 0,
    row: row
  };
};

// CC.HERO — совместимый алиас на Сержанта (barb).
CC.HERO = {
  id: 'barb',
  base: 'barb',
  minTh: 4,
  maxLevel: CC.heroMaxLevel('barb', CC.MAX_TH) || 1,
  speed: CC.HERO_META.barb.speed,
  range: CC.HERO_META.barb.range,
  ability: {
    name: 'Щит',
    duration: 3,
    radius: 2.5,
    uses: 1,
    key: 'Q',
    hint: 'Щит 3 с на союзников · 1 раз за бой'
  },
  costs: {},
  times: {}
};

CC.HEROES = Object.keys(CC.HERO_TABLE).map(function (id) {
  const meta = CC.HERO_META[id];
  const ent = CC._heroEnt(id) || {};
  return {
    id: id,
    coc: CC.HERO_TABLE[id],
    base: meta.base,
    name: meta.name,
    role: meta.role,
    portrait: meta.portrait,
    minTh: CC.heroUnlockAt ? CC.heroUnlockAt(id) : 1,
    ability: CC.HERO.ability
  };
});

// Открытие героев — из unlocks.hero. Английские имена справочник → наши id.
CC.HERO_UNLOCK = {};
(function () {
  const aliases = {
    'Barbarian King': 'barb', 'Archer Queen': 'archer',
    'Grand Warden': 'giant', 'Royal Champion': 'goblin',
    'Minion Prince': 'airship', 'Dragon Duke': 'dragon'
  };
  const src = (CC_DATA.unlocks || {}).hero || {};
  for (let t = 1; t <= CC.MAX_TH; t++) {
    (src[String(t)] || []).forEach(function (name) {
      const id = aliases[name];
      if (id && CC.HERO_UNLOCK[id] === undefined) CC.HERO_UNLOCK[id] = t;
    });
  }
  CC.HEROES.forEach(function (h) {
    if (CC.HERO_UNLOCK[h.id] === undefined) CC.HERO_UNLOCK[h.id] = h.minTh || 1;
    h.minTh = CC.HERO_UNLOCK[h.id];
  });
})();

CC.heroUnlockAt = function (id) {
  return CC.HERO_UNLOCK[id] || 0;
};

// Герой по идентификатору. Неизвестный id (старый сейв) — это «Сержант».
CC.heroDef = function (kind) {
  const id = String(kind || 'barb');
  for (let i = 0; i < CC.HEROES.length; i++) {
    if (CC.HEROES[i].id === id) return CC.HEROES[i];
  }
  return CC.HEROES[0];
};

CC.heroesAt = function (th) {
  const t = Math.max(0, Math.floor(Number(th) || 0));
  return CC.HEROES.filter(function (h) { return t >= h.minTh; });
};

// Совместимость боя P2: старый код читает CC.TROOPS.hero. Держим его
// не enumerable, чтобы в CC.TROOPS осталось ровно 32 типа справочник.
Object.defineProperty(CC.TROOPS, 'hero', {
  enumerable: false,
  configurable: true,
  writable: true,
  value: {
    name: 'Сержант', desc: 'герой, щит на союзников',
    icon: '🎖️', color: '#c9a227', hero: true,
    hp: Number(CC.heroLevelRow('barb', 1).hp) || 0,
    dmg: Number(CC.heroLevelRow('barb', 1).dps) || 0,
    speed: CC.HERO_META.barb.speed, range: CC.HERO_META.barb.range,
    target: 'any', space: 0, cost: 0, time: 0
  }
});

/* Стартовая армия: новый игрок начинает без войск, ангар выдаётся
   обучением Сержанта. Ноль во всех полях — база совместимости для
   старых сейвов и тестов. */
CC.START_ARMY = {};
CC.ARMY_ORDER.forEach(function (t) { CC.START_ARMY[t] = 0; });

/* ---------- питомцы ----------
   12 питомцев справочник. Уровни/HP/DPS — из CC.DATA.pets, дом — Pet House. */
CC.PET_META = {
  lassi: { name: 'Гончая', role: 'наземный', speed: 3, range: 1 },
  yak: { name: 'Буйвол', role: 'танк', speed: 1.6, range: 1 },
  owl: { name: 'Филин', role: 'воздух', speed: 3.2, range: 3, fly: true },
  unicorn: { name: 'Единорог', role: 'лекарь', speed: 2.5, range: 2, heal: true },
  frosty: { name: 'Морозко', role: 'заморозка', speed: 2.2, range: 1 },
  diggy: { name: 'Крот', role: 'подземный', speed: 2.4, range: 1 },
  lizard: { name: 'Ящер', role: 'токсин', speed: 2.6, range: 2 },
  phoenix: { name: 'Феникс', role: 'воздух', speed: 3, range: 1, fly: true },
  fox: { name: 'Дух-лис', role: 'воздух', speed: 3.2, range: 2, fly: true },
  jelly: { name: 'Медуза', role: 'замедление', speed: 2, range: 2 },
  sneezy: { name: 'Чихун', role: 'площадной', speed: 2, range: 2 },
  raven: { name: 'Ворон', role: 'воздух', speed: 3.4, range: 2, fly: true }
};

CC.PETS = {};
Object.keys(CC.PET_META).forEach(function (id) {
  const ent = (CC_DATA.pets || {})[id];
  if (!ent) return;
  const meta = CC.PET_META[id];
  CC.PETS[id] = {
    id: id, coc: id, name: meta.name, role: meta.role,
    speed: meta.speed, range: meta.range, fly: !!meta.fly,
    heal: !!meta.heal, currency: ent.currency || 'dark',
    levels: (ent.levels || []).slice()
  };
});

CC.petLevelRow = function (id, lv) {
  const p = CC.PETS[id];
  const rows = (p && p.levels) || [];
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

// Потолок питомца — уровень Pet House, доступный на этом TH.
CC.petMaxLevel = function (id, th) {
  const p = CC.PETS[id];
  if (!p) return 0;
  const thN = Math.max(1, Math.min(CC.MAX_TH, Math.round(Number(th) || 1)));
  const houseRow = (CC_DATA.maxlv || {}).pet_house;
  let house = 0;
  if (houseRow) {
    const v = Array.isArray(houseRow) ? houseRow[thN - 1] : Number(houseRow[String(thN)]);
    house = Math.max(0, Math.floor(Number(v) || 0));
  }
  let best = 0;
  (p.levels || []).forEach(function (r) {
    if ((Number(r.shop) || 0) <= house) best = Math.max(best, r.lv || 0);
  });
  return best;
};

CC.petStats = function (id, lv) {
  const p = CC.PETS[id];
  if (!p) return null;
  const row = CC.petLevelRow(id, lv);
  return {
    id: id, name: p.name, role: p.role, level: row.lv || 1,
    hp: Number(row.hp) || 0, dmg: Number(row.dps) || 0,
    dps: Number(row.dps) || 0, cost: Number(row.cost) || 0,
    time: Math.max(0, Number(row.time) || 0),
    currency: p.currency, speed: p.speed, range: p.range,
    fly: p.fly, heal: p.heal, row: row
  };
};

/* ---------- заклинания ----------
   19 типов справочник. Эффекты — мета, уровни/урон/радиус — таблица. */
CC.SPELL_META = {
  lightning: { name: 'Разряд', role: 'урон по площади' },
  healing: { name: 'Ремонтное поле', role: 'лечит' },
  rage: { name: 'Стимулятор', role: 'урон и скорость' },
  jump: { name: 'Прыжковое поле', role: 'через барьеры' },
  freeze: { name: 'Криополе', role: 'заморозка' },
  clone: { name: 'Дубликатор', role: 'копии войск' },
  invisibility: { name: 'Маскировка', role: 'невидимость' },
  recall: { name: 'Эвакуация', role: 'возврат войск' },
  revive: { name: 'Реанимация', role: 'поднимает героя' },
  totem: { name: 'Тотем', role: 'аура' },
  heroic: { name: 'Героический импульс', role: 'усиление героев' },
  angry: { name: 'Берсерк', role: 'ярость' },
  poison: { name: 'Токсин', role: 'урон и замедление' },
  earthquake: { name: 'Резонанс', role: 'урон стенам' },
  haste: { name: 'Оверклок', role: 'скорость' },
  skeleton: { name: 'Дроны', role: 'призыв' },
  bat: { name: 'Нетопыри', role: 'призыв воздуха' },
  overgrowth: { name: 'Обрастание', role: 'ловушки/стены' },
  iceblock: { name: 'Ледяная глыба', role: 'блок' }
};

CC.SPELLS = {};
Object.keys(CC.SPELL_META).forEach(function (id) {
  const ent = (CC_DATA.spells || {})[id];
  if (!ent) return;
  const meta = CC.SPELL_META[id];
  CC.SPELLS[id] = {
    id: id, coc: id, name: meta.name, role: meta.role,
    currency: ent.currency || 'elixir',
    levels: (ent.levels || []).slice()
  };
});

CC.spellLevelRow = function (id, lv) {
  const s = CC.SPELLS[id];
  const rows = (s && s.levels) || [];
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

// Потолок заклинания — уровень лаборатории, доступный на этом TH.
CC.spellMaxLevel = function (id, th) {
  const s = CC.SPELLS[id];
  if (!s) return 0;
  const thN = Math.max(1, Math.min(CC.MAX_TH, Math.round(Number(th) || 1)));
  const labRow = (CC_DATA.maxlv || {}).laboratory;
  let lab = 0;
  if (labRow) {
    const v = Array.isArray(labRow) ? labRow[thN - 1] : Number(labRow[String(thN)]);
    lab = Math.max(0, Math.floor(Number(v) || 0));
  }
  let best = 0;
  (s.levels || []).forEach(function (r) {
    if ((Number(r.lab) || 0) <= lab) best = Math.max(best, r.lv || 0);
  });
  return best;
};

CC.spellStats = function (id, lv) {
  const s = CC.SPELLS[id];
  if (!s) return null;
  const row = CC.spellLevelRow(id, lv);
  return {
    id: id, name: s.name, role: s.role, level: row.lv || 1,
    dmg: Number(row.dmg) || 0, radius: Number(row.radius) || 0,
    dur: Number(row.dur) || 0, cost: Number(row.cost) || 0,
    time: Math.max(0, Number(row.time) || 0),
    currency: s.currency, row: row
  };
};

/* ---------- осадные машины ----------
   Уровней осады в срезе справочника нет: есть только открытие по TH.
   Поэтому мета и пустые таблицы уровней; числа появятся со следующим
   срезом data.json. */
CC.SIEGE = {
  wallwrecker: { name: 'Стенолом', role: 'стены', coc: 'wall_wrecker', levels: [] },
  battleblimp: { name: 'Боевой дирижабль', role: 'воздух', coc: 'battle_blimp', levels: [] },
  stoneslammer: { name: 'Каменный таран', role: 'площадной', coc: 'stone_slammer', levels: [] },
  siegebarracks: { name: 'Осадная казарма', role: 'десант', coc: 'siege_barracks', levels: [] },
  loglauncher: { name: 'Бревномёт', role: 'стены', coc: 'log_launcher', levels: [] },
  flameflinger: { name: 'Плазмомёт (осадный)', role: 'дальний', coc: 'flame_flinger', levels: [] },
  battledrill: { name: 'Боевой бур', role: 'подземный', coc: 'battle_drill', levels: [] },
  trooplauncher: { name: 'Пусковая установка', role: 'десант', coc: 'troop_launcher', levels: [] },
  skywagon: { name: 'Небесный фургон', role: 'воздух', coc: 'sky_wagon', levels: [] }
};

CC.SIEGE_UNLOCK = {};
(function () {
  const byCoc = {};
  Object.keys(CC.SIEGE).forEach(function (id) { byCoc[CC.SIEGE[id].coc] = id; });
  const aliases = {
    'Wall Wrecker': 'wallwrecker', 'Battle Blimp': 'battleblimp',
    'Stone Slammer': 'stoneslammer', 'Siege Barracks': 'siegebarracks',
    'Log Launcher': 'loglauncher', 'Flame Flinger': 'flameflinger',
    'Battle Drill': 'battledrill', 'Troop Launcher': 'trooplauncher',
    'Sky Wagon': 'skywagon'
  };
  const src = (CC_DATA.unlocks || {}).siege || {};
  for (let t = 1; t <= CC.MAX_TH; t++) {
    (src[String(t)] || []).forEach(function (name) {
      const id = aliases[name] || byCoc[name];
      if (id && CC.SIEGE_UNLOCK[id] === undefined) CC.SIEGE_UNLOCK[id] = t;
    });
  }
  Object.keys(CC.SIEGE).forEach(function (id) {
    CC.SIEGE[id].minTh = CC.SIEGE_UNLOCK[id] || 0;
  });
})();

CC.siegeStats = function (id, lv) {
  const s = CC.SIEGE[id];
  if (!s) return null;
  const row = s.levels && s.levels.length
    ? s.levels[Math.max(0, Math.min(s.levels.length - 1, (Math.floor(Number(lv) || 1)) - 1))]
    : null;
  return {
    id: id, name: s.name, role: s.role, level: row ? (row.lv || lv) : 1,
    hp: row ? (Number(row.hp) || 0) : 0,
    dmg: row ? (Number(row.dps != null ? row.dps : row.dmg) || 0) : 0,
    cost: row ? (Number(row.cost) || 0) : 0,
    time: row ? Math.max(0, Number(row.time) || 0) : 0,
    currency: row ? (row.currency || 'elixir') : 'elixir',
    row: row
  };
};

/* ---------- стражи ----------
   Три стража поздних центров. Уровни/цена/время — из таблиц, имена наши.
   Они не занимают место в армии: space = 0. */
CC.GUARDIAN_META = {
  longshot: { name: 'Дальнобой', role: 'дальний, земля и воздух' },
  smasher: { name: 'Сокрушитель', role: 'танк, площадь' },
  logger: { name: 'Древолом', role: 'дальний, тяжёлый' }
};

CC.GUARDIANS = {};
Object.keys(CC.GUARDIAN_META).forEach(function (id) {
  const ent = (CC_DATA.guardians || {})[id];
  if (!ent) return;
  const meta = CC.GUARDIAN_META[id];
  CC.GUARDIANS[id] = {
    id: id, table: id, name: meta.name, role: meta.role,
    currency: ent.currency || 'gold',
    minTh: 18, space: 0,
    levels: (ent.levels || []).filter(function (r) {
      return r.th == null || r.th <= CC.MAX_TH;
    })
  };
});

CC.GUARDIAN_ORDER = ['longshot', 'smasher', 'logger'];
CC.GUARDIAN_UNLOCK = { longshot: 18, smasher: 18, logger: 18 };

CC.guardianLevelRow = function (id, lv) {
  const g = CC.GUARDIANS[id];
  const rows = (g && g.levels) || [];
  if (!rows.length) return {};
  let n = Math.floor(Number(lv) || 1);
  if (n < 1) n = 1;
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].lv === n) { row = rows[i]; break; }
    if (rows[i].lv <= n) row = rows[i];
  }
  return row || rows[0];
};

CC.guardianMaxLevel = function (id, th) {
  const g = CC.GUARDIANS[id];
  if (!g) return 0;
  const t = Math.max(1, Math.min(CC.MAX_TH, Math.round(Number(th) || 1)));
  if (t < (g.minTh || 18)) return 0;
  let best = 0;
  (g.levels || []).forEach(function (r) {
    if (r.th != null && r.th > t) return;
    best = Math.max(best, r.lv || 0);
  });
  return best;
};

CC.guardianStats = function (id, lv) {
  const g = CC.GUARDIANS[id];
  if (!g) return null;
  const row = CC.guardianLevelRow(id, lv);
  return {
    id: id, name: g.name, role: g.role,
    level: row.lv || 1,
    hp: Number(row.hp) || 0,
    dmg: Number(row.dps != null ? row.dps : row.dmg) || 0,
    dps: Number(row.dps) || 0,
    cost: Number(row.cost) || 0,
    time: Math.max(0, Number(row.time) || 0),
    currency: g.currency, minTh: g.minTh, space: 0,
    row: row
  };
};

/* ---------- экономика ---------- */

CC.ECONOMY = {
  // Стартовый запас — наше решение (не справочник): 1000 руды и 1000 энергии,
  // чтобы пройти обучение без ожидания. Платина — 50, как раньше.
  startGold: 1000,
  startElixir: 1000,
  startDark: 0,
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
  // Только для старых читателей интерфейса: ёмкость склада 1 уровня.
  // Реальные лимиты считаются по таблице в storageCapOf() (base.js).
  storageCap: {
    gold: Number(CC.buildingLevel('storage', 1).cap) || 0,
    elixir: Number(CC.buildingLevel('estorage', 1).cap) || 0,
    dark: Number(CC.buildingLevel('darkstorage', 1).cap) || 0
  },
  // Формул ×2 больше нет: цена и время — строка таблицы.
  growth: { cost: 1, time: 1 },
  maxLevel: CC.MAX_TH
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
     плазма  =  20 +   5 × (TH − 1)
     Курс округляется до 10. */
  exchange: {
    gold: 250,
    elixir: 200,
    dark: 20,
    perTh: { gold: 100, elixir: 80, dark: 5 }
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
  reward: { gold: 200, elixir: 200, dark: 5, gems: 1 },
  perTh: { gold: 50, elixir: 50, dark: 2 },
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

// TH11–17: состав набега не сложнее TH10, но волны чаще и злее.
// С TH18–19 добавляются стражи и новые башни справочника.
for (let raTh = 11; raTh <= CC.MAX_TH; raTh++) {
  const base = CC.RAIDS.armies[10];
  CC.RAIDS.armies[raTh] = {
    barb: base.barb, archer: base.archer, giant: base.giant, goblin: base.goblin
  };
}

/* Что производят постройки. prod в справочнике — в час, здесь rate —
   в секунду на 1 уровне; дальше доход берётся из строки уровня. */
CC.PRODUCTION = {
  goldmine: { res: 'gold', coc: 'gold_mine' },
  elixir: { res: 'elixir', coc: 'elixir_collector' },
  darkdrill: { res: 'dark', coc: 'dark_drill' }
};
Object.keys(CC.PRODUCTION).forEach(function (type) {
  const p = CC.PRODUCTION[type];
  const row = CC.buildingLevel(type, 1);
  p.rate = +((Number(row.prod) || 0) / 3600).toFixed(6);
});

// Доход в секунду на уровне — строка prod / 3600.
CC.productionAt = function (type, level) {
  const p = CC.PRODUCTION[type];
  if (!p) return 0;
  const row = CC.buildingLevel(type, level);
  return +((Number(row.prod) || 0) / 3600).toFixed(6);
};

/* Накопитель бура/реактора: ёмкость — cap строки уровня. */
CC.EXTRACT = { fromTable: true };

// Ёмкость накопителя для типа постройки и уровня. Не производящая — 0.
CC.extractCap = function (type, level) {
  if (!CC.PRODUCTION[type]) return 0;
  const row = CC.buildingLevel(type, level);
  return Math.max(0, Math.round(Number(row.cap) || 0));
};

/* Армия: вместимость даёт Ангар (army_camp) — cap строки уровня.
   Легаси-поля оставлены для balance.js и старых читателей. */
CC.ARMY = {
  capacityPerBarracks: 20,
  capacityPerTh: 20,
  queuePerBarracks: 4,
  queueMax: 16,
  capacityFromTable: true
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

/* Открытие построек по уровню центра — первый TH, где counts > 0.
   Лазерная вышка оставлена с TH1: она нужна обучению Сержанта. */
CC.REQUIREMENTS = {};
CC.BUILDING_ORDER.forEach(function (type) {
  let min = 0;
  for (let t = 1; t <= CC.MAX_TH; t++) {
    if (CC.limitAt(type, t) > 0) { min = t; break; }
  }
  if (type === 'townhall') min = 1;
  if (type === 'archer') min = 1;
  CC.REQUIREMENTS[type] = { minTh: min || 1 };
});

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

/* ---------- кампания: 10 эпох × 10 секторов, справочник TH1–19 ----------
   TH по эпохам: 1, 2, 3, 4, 5, 7, 9, 12, 15, 19. Внутри эпохи база
   постепенно набирает плотность и уровни, финальный сектор 100 — TH19:
   46 типов на максимальных уровнях, 4 слитых (cannon/archer/eagle/
   scattershot) по 1 на 1 уровне как витрина арсенала, 280 стен.

   Раскладка строится детерминированно по seed: в сейве достаточно индекса.
   Формат layout — [type, x, y, level]. Застройка идёт от центра наружу:
   командный центр 2×2, вокруг все доступные обороны, затем ресурсы, армия,
   ловушки. Стены — внешний контур с проходами и внутренние перегородки
   с разрывами; лимит берётся из CC.limitAt('wall', th), на TH19 — 350. */

CC.LEVEL_SEED_BASE = 20261118;
/* Солёный сид отдельных секторов. После перехода армейских зданий на 1×2
   раскладка сектора 40 (Разлом 10, TH4) стала тупиком для максимальной
   армии; +9 даёт плотный, но проходимый сектор. Остальные 99 не меняются. */
const LEVEL_SEED_SALT = { 39: 9 };
CC.LEVEL_ERAS = 10;

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
  'Разлом', 'Купол',
  'Пепельные равнины', 'Глубины', 'Орбитальный пояс',
  'Стеклянная пустошь', 'Ядро'
];

const CC_ERA_HINTS = [
  'Центр почти без прикрытия: высади отряд на свободную клетку рядом с базой',
  'Держи мехов впереди, а лазерщиков — за ними',
  'Гаубица бьёт по площади: не собирай отряд в кучу',
  'Появился зенитный комплекс: воздух летит через барьеры, но боится его',
  'Плотная крепость: вскрой энергобарьер, потом добивай центр',
  'Пепел скрывает вторую линию обороны: сначала снеси ПВО и плазму',
  'Глубины давят уровнями: прокачай войска и открой героев',
  'Орбитальный пояс простреливает подходы: раздели отряд и не лезь в центр',
  'Стеклянная пустошь плавит броню: береги героев и вскрывай стены по очереди',
  'Ядро — финал кампании: все башни на максимуме, все ловушки и лучшая армия'
];

// Цвета новых глав для карты: старые эпохи 1–5 заданы в style.css,
// новые получают те же CSS-переменные inline, без правок стилей художника.
CC.LEVEL_ERA_COLORS = [
  null, null, null, null, null,
  { rgb: '168, 150, 132', ink: '#ead9c6', glyph: '☲' },
  { rgb: '58, 170, 190', ink: '#c9f5ff', glyph: '≈' },
  { rgb: '142, 128, 255', ink: '#e0dbff', glyph: '✦' },
  { rgb: '180, 235, 245', ink: '#f0ffff', glyph: '◇' },
  { rgb: '255, 120, 72', ink: '#ffd7c2', glyph: '☢' }
];

CC.LEVEL_ERA_TITLES = CC_ERA_TITLES;

// TH эпох: первые пять — 1..5, дальше 7, 9, 12, 15 и финал 19.
CC.ERA_TH = [1, 2, 3, 4, 5, 7, 9, 12, 15, 19];

// Все доступные обороны из CC.BUILDING_ORDER. Порядок — от простых к поздним;
// четыре последних открываются только на TH18–19.
const CC_DEF_TYPES = [
  'cannon', 'archer', 'mortar', 'airdef', 'mage', 'sweeper', 'ambush',
  'bombtower', 'xbow', 'beam', 'eagle', 'scattershot', 'monolith',
  'spelltower', 'multiarcher', 'ricochet', 'multigear', 'firespitter',
  'revenge', 'superwizard', 'spiky', 'firecracker'
];
const CC_RES_TYPES = ['goldmine', 'elixir', 'darkdrill', 'storage', 'estorage', 'darkstorage'];
const CC_ARMY_TYPES = [
  'barracks', 'train', 'darktrain', 'spellfactory', 'darkspellfactory',
  'lab', 'herohall', 'pethouse', 'blacksmith', 'workshop', 'clancastle',
  'squadbarracks'
];
const CC_TRAP_TYPES = [
  'mine', 'spring', 'airmine', 'giantbomb', 'seekingair', 'skeletontrap',
  'tornado', 'gigabomb'
];

function ccClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Потолок уровня для построек кампании — ровно таблица maxlv.
function ccLevelMax(type, th) {
  const t = ccClamp(Math.round(Number(th) || 1), 1, CC.MAX_TH);
  const lvl = CC.maxLevelAt(type, t);
  return lvl > 0 ? lvl : 1;
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

// Ёмкость складов игрока на TH: количество по counts × cap максимального
// уровня. Лут сектора не должен превышать эту величину, иначе «не влезет».
function ccStorageCapAt(type, th) {
  const n = CC.limitAt(type, th);
  if (!n) return 0;
  const lv = Math.max(1, CC.maxLevelAt(type, th));
  const row = CC.buildingLevel(type, lv);
  return n * Math.max(0, Number(row.cap) || 0);
}

CC.LevelGen = {
  level: function (index) {
    const i = Math.max(0, Math.floor(Number(index) || 0));
    const era = Math.min(CC.LEVEL_ERAS - 1, Math.floor(i / 10));
    const within = i % 10;
    const finalLevel = i === CC.LEVEL_ERAS * 10 - 1;
    const th = CC.ERA_TH[era] || CC.MAX_TH;
    const capTh = th;
    // Плотность и уровни растут от первого сектора эпохи к десятому.
    const progress = finalLevel ? 1 : (0.45 + 0.55 * within / 9);
    const seed = (CC.LEVEL_SEED_BASE + i * 7919 +
      (LEVEL_SEED_SALT[i] || 0)) >>> 0;
    const rnd = ccLevelRng(seed);
    const layout = [];
    const zones = [];

    function countAt(type) {
      const lim = CC.limitAt(type, capTh);
      if (!lim) return 0;
      if (finalLevel) return lim;
      return Math.max(1, Math.min(lim, Math.round(lim * progress)));
    }

    // Оборона финала: все типы, но не полный предел counts — на TH19
    // максимальные уровни сами по себе дают огромный DPS. 70% количества
    // оставляет финал тяжёлым, но проходимым с максимальной армией.
    function defCountAt(type) {
      const lim = CC.limitAt(type, capTh);
      if (!lim) return finalLevel ? 1 : 0;
      let n;
      if (finalLevel) n = Math.max(1, Math.round(lim * 0.55));
      else n = Math.max(1, Math.min(lim,
        Math.round(lim * (era >= 5 ? (0.26 + 0.28 * within / 9)
          : (era >= 4 ? (0.30 + 0.34 * within / 9) : (0.35 + 0.45 * within / 9))))));
      // TH2 — знакомство: вторая пушка и башня на крошечной базе превращают
      // сектор 19 в тупик для стартовой армии; оставляем одну пушку без башни.
      if (era <= 1 && type === 'cannon') n = Math.min(n, 1);
      if (era === 1 && type === 'archer' && within >= 5 && within < 8) n = 0;
      return n;
    }

    // Ловушки финала — 70% количества: они не входят в процент, но
    // выкашивают десант.
    function trapCountAt(type) {
      const lim = CC.limitAt(type, capTh);
      if (!lim) return 0;
      if (finalLevel) return Math.max(1, Math.round(lim * 0.50));
      return Math.max(1, Math.min(lim,
        Math.round(lim * (era >= 5 ? (0.26 + 0.28 * within / 9)
          : (era >= 4 ? (0.30 + 0.34 * within / 9) : (0.35 + 0.45 * within / 9))))));
    }

    function levelAt(type) {
      const max = Math.max(1, ccLevelMax(type, capTh));
      if (finalLevel) return max;
      const f = era <= 1 ? (0.25 + 0.6 * within / 9)
        : (era >= 5 ? (0.18 + 0.48 * within / 9)
          : (era >= 4 ? (0.22 + 0.52 * within / 9) : (0.3 + 0.7 * within / 9)));
      return Math.max(1, Math.min(max, 1 + Math.round((max - 1) * f)));
    }

    function wallLevelAt() {
      const max = Math.max(1, ccLevelMax('wall', capTh));
      if (finalLevel) return max;
      const f = 0.25 + 0.75 * within / 9;
      return Math.max(1, Math.min(max, 1 + Math.round((max - 1) * f)));
    }

    // Оценка площади застройки: от неё зависит сторона внешнего контура.
    let solidArea = 0;
    for (let k = 0; k < CC_DEF_TYPES.length; k++) {
      const t = CC_DEF_TYPES[k];
      const d = CC.BUILDINGS[t] || { w: 1, h: 1 };
      solidArea += defCountAt(t) * (d.w || 1) * (d.h || 1);
    }
    for (let k = 0; k < CC_RES_TYPES.length; k++) {
      const t = CC_RES_TYPES[k];
      const d = CC.BUILDINGS[t] || { w: 1, h: 1 };
      solidArea += countAt(t) * (d.w || 1) * (d.h || 1);
    }
    for (let k = 0; k < CC_ARMY_TYPES.length; k++) {
      const t = CC_ARMY_TYPES[k];
      const d = CC.BUILDINGS[t] || { w: 1, h: 1 };
      solidArea += countAt(t) * (d.w || 1) * (d.h || 1);
    }
    solidArea += 4; // командный центр 2×2

    let side = Math.ceil(Math.sqrt(solidArea * 1.8 + 32)) + 2;
    // Новые (старые) футпринты меньше, поэтому площадь застройки падает;
    // без минимальной стороны башни сбиваются в кучу и перекрывают огонь.
    // Нижняя граница держит прежний простор базы по эпохам.
    const MIN_SIDE = [17, 19, 23, 25, 28, 33, 38, 40, 40, 40];
    side = Math.max(side, MIN_SIDE[era] || 12);
    side = ccClamp(side, 12, CC.GRID - 4);
    let x0 = Math.floor((CC.GRID - side) / 2);
    let y0 = Math.floor((CC.GRID - side) / 2);
    x0 = ccClamp(x0, 1, CC.GRID - 1 - side);
    y0 = ccClamp(y0, 1, CC.GRID - 1 - side);
    const x1 = x0 + side - 1;
    const y1 = y0 + side - 1;
    const ix0 = x0 + 1;
    const iy0 = y0 + 1;
    const ix1 = x1 - 1;
    const iy1 = y1 - 1;

    // Отсеки-квадранты нужны уже на этапе застройки: оборону раскладываем
    // по ним, иначе мелкие 1×1 башни сбиваются в один «смертельный шар».
    const zoneMx = Math.floor((ix0 + ix1) / 2);
    const zoneMy = Math.floor((iy0 + iy1) / 2);
    [
      [ix0, iy0, zoneMx, zoneMy], [zoneMx + 1, iy0, ix1, zoneMy],
      [ix0, zoneMy + 1, zoneMx, iy1], [zoneMx + 1, zoneMy + 1, ix1, iy1]
    ].forEach(function (r) {
      if (r[2] - r[0] >= 3 && r[3] - r[1] >= 3) {
        zones.push({ x0: r[0], y0: r[1], x1: r[2], y1: r[3] });
      }
    });

    const occ = new Uint8Array(CC.GRID * CC.GRID);
    function inField(x, y) {
      return x >= 0 && y >= 0 && x < CC.GRID && y < CC.GRID;
    }
    function isFree(x, y) {
      return inField(x, y) && !occ[y * CC.GRID + x];
    }
    function mark(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) occ[yy * CC.GRID + xx] = 1;
      }
    }
    function hasFreeNeighbor(x, y, w, h) {
      for (let yy = y - 1; yy <= y + h; yy++) {
        for (let xx = x - 1; xx <= x + w; xx++) {
          if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
          if (isFree(xx, yy)) return true;
        }
      }
      return false;
    }
    function place(type, x, y, level, opts) {
      const d = CC.BUILDINGS[type];
      if (!d) return false;
      const w = d.w || 1;
      const h = d.h || 1;
      if (!inField(x, y) || x + w > CC.GRID || y + h > CC.GRID) return false;
      const interior = !opts || opts.interior !== false;
      if (interior) {
        if (type !== 'wall' && (x < ix0 || y < iy0 || x + w - 1 > ix1 || y + h - 1 > iy1)) return false;
      }
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) if (occ[yy * CC.GRID + xx]) return false;
      }
      const lvl = ccClamp(Math.round(Number(level) || 1), 1,
        Math.max(1, ccLevelMax(type, capTh)));
      // Твёрдой постройке нужен хотя бы один свободный сосед — иначе к ней
      // не подойти и она навсегда останется недосягаемой для боя.
      if (!d.trap && type !== 'wall' && !(opts && opts.relax) &&
          !hasFreeNeighbor(x, y, w, h)) return false;
      mark(x, y, w, h);
      layout.push([type, x, y, lvl]);
      return true;
    }

    /* ---------- внешний контур и проходы ---------- */
    const gaps = [];
    function addGapH(y) {
      const gw = 2 + Math.floor(rnd() * 2);
      const span = Math.max(1, side - 4 - gw);
      const start = x0 + 2 + Math.floor(rnd() * span);
      for (let k = 0; k < gw; k++) gaps.push([start + k, y]);
    }
    function addGapV(x) {
      const gw = 2 + Math.floor(rnd() * 2);
      const span = Math.max(1, side - 4 - gw);
      const start = y0 + 2 + Math.floor(rnd() * span);
      for (let k = 0; k < gw; k++) gaps.push([x, start + k]);
    }
    addGapH(y0);
    addGapH(y1);
    addGapV(x0);
    addGapV(x1);

    const gapKey = {};
    gaps.forEach(function (g) { gapKey[g[0] + ',' + g[1]] = 1; });

    const ring = [];
    for (let x = x0; x <= x1; x++) {
      if (!gapKey[x + ',' + y0]) ring.push([x, y0]);
      if (!gapKey[x + ',' + y1]) ring.push([x, y1]);
    }
    for (let y = y0 + 1; y < y1; y++) {
      if (!gapKey[x0 + ',' + y]) ring.push([x0, y]);
      if (!gapKey[x1 + ',' + y]) ring.push([x1, y]);
    }

    // Финал TH19 выкладывает полный лимит — 350 сегментов: внешний контур
    // плюс внутренние перегородки. Остальные секторы растут к лимиту плавно.
    const wallLimit = CC.limitAt('wall', capTh);
    const wallTarget = finalLevel ? Math.min(wallLimit, 280)
      : Math.max(0, Math.min(wallLimit, Math.round(wallLimit *
        (era >= 5 ? Math.min(0.78, progress)
          : (era >= 4 ? progress * 0.9 : Math.min(0.64, progress))))));
    const wallLvl = wallLevelAt();
    let wallLeft = wallTarget;

    if (wallLeft >= ring.length) {
      for (let k = 0; k < ring.length; k++) {
        place('wall', ring[k][0], ring[k][1], wallLvl, { interior: false });
      }
      wallLeft -= ring.length;
    } else {
      const pick = ccShuffle(ring, rnd);
      for (let k = 0; k < pick.length && wallLeft > 0; k++) {
        if (place('wall', pick[k][0], pick[k][1], wallLvl, { interior: false })) wallLeft--;
      }
    }

    /* ---------- застройка от центра наружу ---------- */
    const cx = (ix0 + ix1) / 2;
    const cy = (iy0 + iy1) / 2;
    const radius = Math.max(1, Math.min(ix1 - ix0, iy1 - iy0) / 2);

    function cellsFor(mode) {
      const out = [];
      for (let y = iy0; y <= iy1; y++) {
        for (let x = ix0; x <= ix1; x++) {
          if (occ[y * CC.GRID + x]) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          let score = d;
          if (mode === 'outer') score = -d;
          else if (mode === 'mid') score = Math.abs(d - radius * 0.48);
          out.push({ x: x, y: y, d: score });
        }
      }
      out.sort(function (a, b) {
        if (a.d !== b.d) return a.d - b.d;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
      return out;
    }

    function putSolid(type, level, mode) {
      const d = CC.BUILDINGS[type];
      if (!d) return false;
      const w = d.w || 1;
      const h = d.h || 1;
      const cells = cellsFor(mode || 'center');
      for (let c = 0; c < cells.length; c++) {
        if (place(type, cells[c].x, cells[c].y, level)) return true;
      }
      // Резерв: без требования свободного соседа — лучше поставить, чем нет.
      for (let c = 0; c < cells.length; c++) {
        if (place(type, cells[c].x, cells[c].y, level, { interior: true, relax: true })) return true;
      }
      return false;
    }

    // Постановка в конкретный отсек: так башни распределяются по квадрантам,
    // а не липнут к центру. near — ближе к центру базы, far — к внешней стене.
    function putInZone(type, level, zi, near) {
      const zone = zones[zi];
      if (!zone) return false;
      const d = CC.BUILDINGS[type] || { w: 1, h: 1 };
      const w = d.w || 1;
      const h = d.h || 1;
      const cells = [];
      for (let y = zone.y0; y <= zone.y1; y++) {
        for (let x = zone.x0; x <= zone.x1; x++) {
          if (occ[y * CC.GRID + x]) continue;
          if (x + w - 1 > zone.x1 || y + h - 1 > zone.y1) continue;
          const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          cells.push({ x: x, y: y, d: near ? dist : -dist });
        }
      }
      cells.sort(function (a, b) {
        if (a.d !== b.d) return a.d - b.d;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
      for (let c = 0; c < cells.length; c++) {
        if (place(type, cells[c].x, cells[c].y, level)) return true;
      }
      return false;
    }

    // Центр — 2×2, ближе к середине поля.
    putSolid('townhall', th, 'center');

    // Оборона: крупные пятна первыми, чтобы им хватило места; все типы,
    // доступные на этом TH, получают хотя бы одну постройку.
    const defList = [];
    for (let k = 0; k < CC_DEF_TYPES.length; k++) {
      const type = CC_DEF_TYPES[k];
      // Финал: все типы обороны, включая слитые на TH19 в более поздние
      // башни (cannon, eagle). Кампания — не база игрока, ей можно
      // показать весь арсенал.
      const n = defCountAt(type);
      for (let j = 0; j < n; j++) defList.push(type);
    }
    defList.sort(function (a, b) {
      const da = CC.BUILDINGS[a] || { w: 1, h: 1 };
      const db = CC.BUILDINGS[b] || { w: 1, h: 1 };
      return (db.w * db.h) - (da.w * da.h);
    });
    for (let k = 0; k < defList.length; k++) {
      const type = defList[k];
      const level = levelAt(type);
      const zi = zones.length ? (k % zones.length) : -1;
      if (zi >= 0 && putInZone(type, level, zi, k % 2 === 0)) continue;
      if (zi >= 0 && putInZone(type, level, (zi + 1) % zones.length, true)) continue;
      putSolid(type, level, k % 2 === 0 ? 'mid' : 'outer');
    }

    // Ресурсы: добыча и склады, включая тёмные с TH7+.
    for (let k = 0; k < CC_RES_TYPES.length; k++) {
      const type = CC_RES_TYPES[k];
      const n = countAt(type);
      for (let j = 0; j < n; j++) putSolid(type, levelAt(type), j % 2 ? 'outer' : 'mid');
    }

    // Армия и развитие: казармы, фабрики, лаборатория, академия, питомник,
    // мастерская. Держим их по периметру, чтобы центр не был перегружен.
    for (let k = 0; k < CC_ARMY_TYPES.length; k++) {
      const type = CC_ARMY_TYPES[k];
      const n = countAt(type);
      for (let j = 0; j < n; j++) putSolid(type, levelAt(type), 'outer');
    }

    /* ---------- внутренние стены с разрывами ---------- */
    const wallCands = [];
    for (let gy = iy0 + 5; gy <= iy1 - 2; gy += 6) {
      const gapA = ix0 + 2 + Math.floor(rnd() * Math.max(1, ix1 - ix0 - 4));
      for (let x = ix0; x <= ix1; x++) {
        if (Math.abs(x - gapA) <= 1) continue;
        wallCands.push([x, gy]);
      }
    }
    for (let gx = ix0 + 5; gx <= ix1 - 2; gx += 7) {
      const gapA = iy0 + 2 + Math.floor(rnd() * Math.max(1, iy1 - iy0 - 4));
      for (let y = iy0; y <= iy1; y++) {
        if (Math.abs(y - gapA) <= 1) continue;
        wallCands.push([gx, y]);
      }
    }
    for (let k = 0; k < wallCands.length && wallLeft > 0; k++) {
      if (place('wall', wallCands[k][0], wallCands[k][1], wallLvl)) wallLeft--;
    }
    // Остаток бюджета стен — в свободные клетки рядом с уже стоящими
    // стенами: так контур становится плотнее, но проходы сохраняются.
    if (wallLeft > 0) {
      const near = [];
      for (let k = 0; k < layout.length; k++) {
        if (layout[k][0] !== 'wall') continue;
        const wx = layout[k][1];
        const wy = layout[k][2];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let q = 0; q < nb.length; q++) {
          const nx = wx + nb[q][0];
          const ny = wy + nb[q][1];
          if (nx < ix0 || ny < iy0 || nx > ix1 || ny > iy1) continue;
          if (isFree(nx, ny)) near.push([nx, ny]);
        }
      }
      const shuffled = ccShuffle(near, rnd);
      for (let k = 0; k < shuffled.length && wallLeft > 0; k++) {
        if (place('wall', shuffled[k][0], shuffled[k][1], wallLvl)) wallLeft--;
      }
    }

    /* ---------- ловушки: все 8 типов, доступные на TH ---------- */
    const trapLvl = levelAt('mine');
    const gapPool = ccShuffle(gaps.map(function (g) { return [g[0], g[1]]; }), rnd);
    function putTrap(type) {
      const d = CC.BUILDINGS[type] || { w: 1, h: 1 };
      const w = d.w || 1;
      const h = d.h || 1;
      const tryAt = function (x, y) {
        return place(type, x, y, trapLvl, { interior: false });
      };
      while (gapPool.length) {
        const g = gapPool.shift();
        if (tryAt(g[0], g[1])) return true;
      }
      const cells = [];
      for (let y = 1; y < CC.GRID - 1; y++) {
        for (let x = 1; x < CC.GRID - 1; x++) {
          if (occ[y * CC.GRID + x]) continue;
          cells.push({ x: x, y: y, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
        }
      }
      cells.sort(function (a, b) { return a.d - b.d; });
      for (let c = 0; c < cells.length; c++) {
        if (place(type, cells[c].x, cells[c].y, trapLvl, { interior: false })) return true;
      }
      return false;
    }
    for (let k = 0; k < CC_TRAP_TYPES.length; k++) {
      const type = CC_TRAP_TYPES[k];
      const n = trapCountAt(type);
      for (let j = 0; j < n; j++) putTrap(type);
    }

    /* ---------- лут: три ресурса, растут с TH ---------- */
    const goldCap = ccStorageCapAt('storage', th);
    const elixirCap = ccStorageCapAt('estorage', th);
    const darkCap = ccStorageCapAt('darkstorage', th);
    const sectorShare = finalLevel ? 1 : (0.6 + 0.4 * within / 9);
    const capShare = 0.4 / Math.sqrt(th);
    const round10 = function (v) {
      return Math.max(0, Math.round(v / 10) * 10);
    };
    const loot = {
      gold: round10(Math.min(goldCap * 0.6,
        Math.max(300, goldCap * capShare * sectorShare))),
      elixir: round10(Math.min(elixirCap * 0.6,
        Math.max(300, elixirCap * capShare * sectorShare))),
      dark: th >= 7
        ? round10(Math.min(darkCap * 0.6, Math.max(50, darkCap * 0.16 * sectorShare)))
        : 0
    };

    let levelName = CC_ERA_TITLES[era] + ' ' + (within + 1);
    let levelHint = CC_ERA_HINTS[era];
    if (finalLevel) {
      levelName += ' · Финал';
      levelHint += ' Финал: TH19, все башни на максимуме; нужна армия, стражи и все герои.';
    }

    return {
      id: i + 1,
      seed: seed,
      era: era,
      th: th,
      limitTh: capTh,
      final: finalLevel,
      boss: finalLevel,
      name: levelName,
      hint: levelHint,
      air: era >= 3 && within >= 4,
      loot: loot,
      layout: layout,
      zones: zones
    };
  },

  all: function () {
    const out = [];
    const n = (CC.LEVEL_ERAS || 10) * 10;
    for (let i = 0; i < n; i++) out.push(CC.LevelGen.level(i));
    return out;
  }
};


/* Расстановка своей базы: [тип, x, y].
   Новый игрок начинает только с командным центром 2×2 в центре поля 44×44.
   Всё остальное — турель, вышка, буры, склады и ангар — ставится по
   обучению Сержанта (см. QUESTS в js/base.js). */
CC.LAYOUT = [
  ['townhall', 20, 20]
];

/* Сколько построек можно поставить на своей базе: counts по TH1–19.
   Base.left() и генератор читают одну и ту же таблицу. */
CC.LIMITS_BY_TH = {};
CC.BUILDING_ORDER.forEach(function (type) {
  const row = [];
  for (let t = 1; t <= CC.MAX_TH; t++) row.push(CC.limitAt(type, t));
  CC.LIMITS_BY_TH[type] = row;
});

/* Максимумы TH19: их читает интерфейс как «полный» лимит. */
CC.LIMITS = {};
CC.BUILDING_ORDER.forEach(function (type) {
  CC.LIMITS[type] = CC.limitAt(type, CC.MAX_TH);
});

/* Состав кампании: вражеские базы могут быть богаче игрока, но не выходят
   за counts. Отдельная функция оставлена для старых вызовов. */
CC.CAMPAIGN_RES_LIMITS = {};
['goldmine', 'elixir', 'darkdrill', 'storage', 'estorage', 'darkstorage'].forEach(function (type) {
  const row = [];
  for (let t = 1; t <= CC.MAX_TH; t++) row.push(CC.limitAt(type, t));
  CC.CAMPAIGN_RES_LIMITS[type] = row;
});

CC.campaignResLimitAt = function (type, th) {
  const row = CC.CAMPAIGN_RES_LIMITS[type];
  if (!row) return CC.limitAt(type, th);
  const n = Math.round(Number(th) || 1);
  const i = n < 1 ? 0 : (n > CC.MAX_TH ? CC.MAX_TH - 1 : n - 1);
  return row[i] || 0;
};

/* 100 уровней строятся после таблицы лимитов: генератор сверяется с
   CC.limitAt(), а для ресурсов кампании — с CC.campaignResLimitAt(). */
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
    if (type === 'storage' || type === 'estorage' || type === 'darkstorage') {
      return 'storage';
    }
    if (type === 'goldmine' || type === 'elixir' || type === 'darkdrill') {
      return 'extract';
    }
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
      if (!out[r.key]) {
        out[r.key] = { key: r.key, type: r.type, gold: 0, elixir: 0, dark: 0 };
      }
      out[r.key][res] += base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
  }

  function add(out, list, amount, res) {
    spread(list, Math.max(0, Math.floor(amount)), res, out);
  }

  /* Раскладка пула по постройкам. Возвращает объект key → {gold, elixir, dark}.
     Центр в раскладке не участвует. Если склада нужного ресурса нет,
     его доля уходит добытчикам (бурам/реакторам); если нет и их — ресурс
     просто негде хранить и в пул построек он не попадает. */
  function distribute(loot, rows) {
    const out = {};
    const list = normRows(rows);
    if (!list.length) return out;

    const g = Math.max(0, Math.floor(Number(loot && loot.gold) || 0));
    const e = Math.max(0, Math.floor(Number(loot && loot.elixir) || 0));
    const d = Math.max(0, Math.floor(Number(loot && loot.dark) || 0));
    if (!g && !e && !d) return out;

    const oreStores = bucket(list, 'storage');
    const elixirStores = bucket(list, 'estorage');
    const darkStores = bucket(list, 'darkstorage');
    const goldmine = bucket(list, 'goldmine');
    const reactor = bucket(list, 'elixir');
    const darkDrill = bucket(list, 'darkdrill');

    const S = CC.LOOT_SPLIT || { storage: 0.85, extract: 0.15 };

    // Округляем вниз только долю склада: остаток (включая округление)
    // уходит добытчикам, поэтому сумма всегда равна пулу.
    let gStore = Math.floor(g * S.storage);
    let gExt = g - gStore;
    let eStore = Math.floor(e * S.storage);
    let eExt = e - eStore;
    let dStore = Math.floor(d * S.storage);
    let dExt = d - dStore;

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

    if (!darkStores.length) {
      dExt += dStore;
      dStore = 0;
    }
    if (!darkDrill.length) {
      dStore += dExt;
      dExt = 0;
    }

    add(out, oreStores, gStore, 'gold');
    add(out, goldmine, gExt, 'gold');
    add(out, elixirStores, eStore, 'elixir');
    add(out, reactor, eExt, 'elixir');
    add(out, darkStores, dStore, 'dark');
    add(out, darkDrill, dExt, 'dark');

    return out;
  }

  return {
    distribute: distribute,
    roleOf: roleOf,
    key: function (type, x, y) { return CC.lootKey(type, x, y); }
  };
})();

/* Порядок в палитре строительства: оборона, стены, ловушки, экономика,
   армия. Новые типы идут после привычных, чтобы старые кнопки не съезжали. */
CC.PALETTE = [
  'townhall',
  'cannon', 'archer', 'mortar', 'airdef', 'mage', 'sweeper', 'ambush',
  'bombtower', 'xbow', 'beam', 'eagle', 'scattershot', 'monolith',
  'spelltower', 'multiarcher', 'ricochet', 'multigear', 'firespitter',
  'revenge', 'superwizard', 'spiky', 'firecracker',
  'wall', 'mine', 'spring', 'airmine', 'giantbomb', 'seekingair',
  'skeletontrap', 'tornado', 'gigabomb',
  'goldmine', 'elixir', 'darkdrill', 'storage', 'estorage', 'darkstorage',
  'barracks', 'train', 'darktrain', 'spellfactory', 'darkspellfactory',
  'lab', 'herohall', 'pethouse', 'blacksmith', 'workshop', 'clancastle',
  'squadbarracks'
];

/* Иконки для палитры. */
CC.ICONS = {
  townhall: '🛰️', cannon: '💣', archer: '📡', mortar: '💥', airdef: '🎯',
  mage: '⚛️', sweeper: '🌪️', ambush: '🕳️', bombtower: '🧨', xbow: '🏹',
  beam: '🔆', eagle: '🦅', scattershot: '🎇', monolith: '🗿',
  spelltower: '🔮', multiarcher: '📶', ricochet: '↩️', multigear: '⚙️',
  firespitter: '🔥', revenge: '🕯️', superwizard: '⚡', spiky: '🦔',
  firecracker: '🎆',
  mine: '💥', spring: '🌀', airmine: '🎈', giantbomb: '💣',
  seekingair: '🚀', skeletontrap: '💀', tornado: '🌪️', gigabomb: '☢️',
  wall: '🛡️', goldmine: '⛏️', elixir: '⚡', darkdrill: '🛢️',
  storage: '🗄️', estorage: '🔋', darkstorage: '🧪',
  barracks: '🏗️', train: '🪖', darktrain: '🖤', spellfactory: '🧿',
  darkspellfactory: '🔮', lab: '🔬', herohall: '🏛️', pethouse: '🐾',
  blacksmith: '⚒️', workshop: '🛠️', clancastle: '🛸', squadbarracks: '✈️'
};
