/* Камера, размер canvas и игровой цикл.
   Математика камеры вынесена в CC.CamMath и не зависит от DOM — её гоняют тесты. */
window.CC = window.CC || {};

/* ---------- громкость: чистая математика микшера ----------
   Мастер по умолчанию 0.5: заказчик просил стартовать на половине,
   а не на максимуме. Музыка тише эффектов, в бою фон ещё тише. */
CC.AudioMix = (function () {
  'use strict';

  const DEFAULT_MASTER = 0.5;
  const MUSIC_RATIO = 0.35;        // музыка от мастера в деревне
  const MUSIC_RATIO_BATTLE = 0.26; // в бою фон тише, чтобы не мешать ударам
  const SFX_RATIO = 0.9;
  const SFX_RATIO_BATTLE = 1;
  const COMPRESSOR = {
    threshold: -14, knee: 10, ratio: 8, attack: 0.004, release: 0.22
  };

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function levels(mode, opts) {
    const o = opts || {};
    const master = clamp(
      typeof o.master === 'number' ? o.master : DEFAULT_MASTER, 0, 1
    );
    const battle = mode === 'battle';
    const musicRatio = battle ? MUSIC_RATIO_BATTLE : MUSIC_RATIO;
    const sfxRatio = battle ? SFX_RATIO_BATTLE : SFX_RATIO;

    return {
      master: master,
      music: o.music === false ? 0 : master * musicRatio,
      sfx: o.sfx === false ? 0 : master * sfxRatio,
      musicRatio: musicRatio,
      sfxRatio: sfxRatio,
      battle: battle
    };
  }

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  function gainToDb(gain) {
    return 20 * Math.log(Math.max(1e-9, gain)) / Math.LN10;
  }

  // Сумма пиков одновременных источников — до лимитера.
  function sumPeak(gains) {
    let sum = 0;
    for (let i = 0; i < gains.length; i++) {
      const g = Number(gains[i]);
      if (isFinite(g) && g > 0) sum += g;
    }
    return sum;
  }

  // Статическая кривая компрессора с мягким коленом: редкий тихий звук
  // проходит как есть, плотный залп поджимается к порогу.
  function compressPeak(peak, settings) {
    const c = settings || COMPRESSOR;
    const g = Math.max(0, Number(peak) || 0);
    if (g <= 0) return 0;

    const db = gainToDb(g);
    const half = c.knee / 2;

    if (db <= c.threshold - half) return g;

    if (db >= c.threshold + half) {
      return dbToGain(c.threshold + (db - c.threshold) / c.ratio);
    }

    const over = db - (c.threshold - half);
    const outDb = db + ((1 / c.ratio - 1) * over * over) / (2 * c.knee);
    return dbToGain(outDb);
  }

  function mixPeak(gains, settings) {
    return compressPeak(sumPeak(gains), settings);
  }

  return {
    DEFAULT_MASTER: DEFAULT_MASTER,
    MUSIC_RATIO: MUSIC_RATIO,
    MUSIC_RATIO_BATTLE: MUSIC_RATIO_BATTLE,
    SFX_RATIO: SFX_RATIO,
    SFX_RATIO_BATTLE: SFX_RATIO_BATTLE,
    COMPRESSOR: COMPRESSOR,
    clamp: clamp,
    levels: levels,
    dbToGain: dbToGain,
    gainToDb: gainToDb,
    sumPeak: sumPeak,
    compressPeak: compressPeak,
    mixPeak: mixPeak
  };
})();

/* ---------- музыка: паттерн и очередь нот без DOM ----------
   Восемь тактов, аккорды + арпеджио. Планировщик забирает ноты
   окнами по абсолютному времени, поэтому луп не зависит от кадров. */
CC.MusicCore = (function () {
  'use strict';

  const MODES = {
    base: {
      bpm: 58, bars: 8, beatsPerBar: 4,
      progression: [
        { root: 45, notes: [57, 60, 64] }, // Am
        { root: 41, notes: [53, 57, 60] }, // F
        { root: 48, notes: [55, 60, 64] }, // C
        { root: 43, notes: [55, 59, 62] }  // G
      ],
      arp: [0, 1, 2, 1, 0, 2, 1, 2],
      pulse: false
    },
    battle: {
      bpm: 80, bars: 8, beatsPerBar: 4,
      progression: [
        { root: 38, notes: [50, 53, 57] }, // Dm
        { root: 34, notes: [46, 50, 53] }, // Bb
        { root: 41, notes: [53, 57, 60] }, // F
        { root: 36, notes: [48, 52, 55] }  // C
      ],
      arp: [0, 1, 2, 1, 2, 1, 0, 2],
      pulse: false
    }
  };

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function build(mode) {
    const key = mode === 'battle' ? 'battle' : 'base';
    const cfg = MODES[key];
    const beatSec = 60 / cfg.bpm;
    const loopBeats = cfg.bars * cfg.beatsPerBar;
    const loopSec = loopBeats * beatSec;
    const events = [];

    function add(beat, midi, dur, voice, gain) {
      events.push({
        beat: beat,
        midi: midi,
        freq: midiToFreq(midi),
        dur: dur,
        voice: voice,
        gain: gain
      });
    }

    for (let bar = 0; bar < cfg.bars; bar++) {
      const chord = cfg.progression[bar % cfg.progression.length];
      const start = bar * cfg.beatsPerBar;

      // тёплая подложка: аккорд держится почти весь такт
      for (let n = 0; n < chord.notes.length; n++) {
        add(start, chord.notes[n], cfg.beatsPerBar * 0.92, 'pad', 0.22);
      }

      // бас на сильную и относительно сильную доли
      add(start, chord.root, 1.7, 'bass', 0.28);
      add(start + 2, chord.root, 1.7, 'bass', 0.22);

      // арпеджио восьмыми — основной мотив
      for (let k = 0; k < 8; k++) {
        const idx = cfg.arp[k] % chord.notes.length;
        const oct = (k === 3 || k === 6) ? 12 : 0;
        add(start + k * 0.5, chord.notes[idx] + oct, 0.42, 'arp',
          k % 2 ? 0.16 : 0.19);
      }

      // редкая высокая нота — «воздух» марсианской темы
      if (bar % 2 === 0) {
        add(start + 2.5, 84 + (bar % 4 === 0 ? 7 : 0), 2.4, 'spark',
          bar % 4 === 0 ? 0.1 : 0.075);
      }

      // в бою добавляем сухой пульс — темп ощущается жёстче
      if (cfg.pulse) {
        for (let b = 0; b < cfg.beatsPerBar; b++) {
          add(start + b, chord.root, 0.16, 'pulse', 0.22);
        }
      }
    }

    events.sort(function (a, b) {
      return a.beat - b.beat || a.midi - b.midi;
    });

    return {
      mode: key,
      bpm: cfg.bpm,
      bars: cfg.bars,
      beatsPerBar: cfg.beatsPerBar,
      beatSec: beatSec,
      loopBeats: loopBeats,
      loopSec: loopSec,
      roots: cfg.progression.map(function (c) { return c.root; }),
      events: events
    };
  }

  function cursor(plan, startTime) {
    return {
      loopStart: typeof startTime === 'number' ? startTime : 0,
      index: 0
    };
  }

  // Забирает ноты, попадающие в окно [сейчас, сейчас + запас). enabled=false
  // не двигает очередь: выключенная музыка не планирует ничего.
  function pull(plan, cur, until, enabled) {
    const out = [];
    if (!plan || !cur || !plan.events.length || enabled === false) return out;

    let guard = 0;
    while (guard++ < 4096) {
      const ev = plan.events[cur.index];
      const at = cur.loopStart + ev.beat * plan.beatSec;
      if (at >= until) break;

      out.push({
        at: at,
        beat: ev.beat,
        midi: ev.midi,
        freq: ev.freq,
        dur: ev.dur,
        voice: ev.voice,
        gain: ev.gain
      });

      cur.index++;
      if (cur.index >= plan.events.length) {
        cur.index = 0;
        cur.loopStart += plan.loopSec;
      }
    }

    return out;
  }

  return {
    MODES: MODES,
    build: build,
    cursor: cursor,
    pull: pull,
    midiToFreq: midiToFreq
  };
})();

/* ---------- две вкладки: лизинг и защита сейва ----------
   Кто последним заявил вкладку, тот и пишет прогресс. Остальные
   замирают до кнопки «Продолжить здесь» (перезагрузка заново
   заявит вкладку). Логика без DOM — её проверяют тесты. */
CC.TabGuard = (function () {
  'use strict';

  const KEY = 'clash-tab-v2';
  let paused = false;
  let id = '';

  function makeId() {
    return 'tab-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.id !== 'string') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  // Заявить вкладку лидером. Вызывается на старте и после перезагрузки.
  function claim() {
    if (!id) id = makeId();
    try {
      localStorage.setItem(KEY, JSON.stringify({ id: id, at: Date.now() }));
    } catch (e) {
      /* приватный режим — лизинг недоступен, играем без него */
    }
    return id;
  }

  function owns() {
    const owner = read();
    return !!owner && owner.id === id;
  }

  // Чужой лидер заявил вкладку — эта вкладка уходит на паузу.
  function onExternal(key) {
    if (key !== KEY) return false;

    const owner = read();
    if (!owner || owner.id === id) return false;

    pause();
    return true;
  }

  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
  }

  function isPaused() {
    return paused;
  }

  // Единая точка записи: пока вкладка на паузе, колбэк не вызывается.
  function run(save) {
    if (paused) return false;
    if (typeof save === 'function') save();
    return true;
  }

  return {
    KEY: KEY,
    claim: claim,
    read: read,
    owns: owns,
    onExternal: onExternal,
    pause: pause,
    resume: resume,
    isPaused: isPaused,
    run: run,
    id: function () { return id; }
  };
})();

/* Синтезированные звуки и музыка на WebAudio. Вся логика без DOM;
   контекст создаётся только после первого жеста игрока. */
CC.Sound = (function () {
  'use strict';

  const KEY = 'clash-sound-v1';
  const MUSIC_KEY = 'clash-music-v1';
  const VOL_KEY = 'clash-volume-v1';
  const LOOKAHEAD = 0.4;  // сколько секунд вперёд ставим ноты
  const TICK = 0.12;      // как часто просыпается планировщик, секунды

  const LIMITS = {
    place: 4, move: 6, upgrade: 3, upgradeDone: 3, train: 6,
    deploy: 10, deployBarb: 8, deployArcher: 10, deployGiant: 6,
    deployGoblin: 10,
    hit: 8, hitWall: 8, destroy: 4, destroyWall: 6,
    cannonShot: 10, archerShot: 10, mortarShot: 5, mortarHit: 5,
    raidAlarm: 1, lootLost: 1, questDone: 1, levelUp: 1, tick: 2,
    win: 1, lose: 1, ui: 8,
    introEngine: 1, introImpact: 1, introServo: 1, introClank: 1, introTitle: 1
  };

  let enabled = true;
  let musicOn = true;
  let masterVol = CC.AudioMix.DEFAULT_MASTER;
  let ctx = null;
  let master = null;
  let comp = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuf = null;
  let history = {};

  let mode = 'base';
  let pendingMode = null;
  let pendingAt = 0;
  let plan = null;
  let cursor = null;
  let musicTimer = null;
  let hidden = false;
  let touched = false;
  let introDuck = false; // заставка: музыка уходит, после — возвращается

  try {
    if (localStorage.getItem(KEY) === '0') enabled = false;
    if (localStorage.getItem(MUSIC_KEY) === '0') musicOn = false;

    const rawVol = localStorage.getItem(VOL_KEY);
    if (rawVol !== null && rawVol !== '') {
      const n = parseFloat(rawVol);
      // старые записи могли быть долей 0..1, новые — процентами 0..100
      if (isFinite(n)) masterVol = CC.AudioMix.clamp(n > 1 ? n / 100 : n, 0, 1);
    }
  } catch (e) {
    /* приватный режим */
  }

  function isEnabled() {
    return enabled;
  }

  function isMusicEnabled() {
    return musicOn;
  }

  function masterLevel() {
    return masterVol;
  }

  function mix() {
    return CC.AudioMix.levels(pendingMode || mode, {
      master: masterVol,
      music: musicOn && !hidden && !introDuck,
      sfx: enabled
    });
  }

  function setEnabled(on) {
    enabled = !!on;
    try {
      localStorage.setItem(KEY, enabled ? '1' : '0');
    } catch (e) {
      /* приватный режим */
    }
    if (enabled) unlock();
    applyVolumes();
  }

  function setMusicEnabled(on) {
    musicOn = !!on;
    try {
      localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0');
    } catch (e) {
      /* приватный режим */
    }

    if (musicOn) {
      unlock();
      startMusic();
    } else {
      stopMusic();
    }
    applyVolumes();
  }

  function setMaster(v) {
    let n = Number(v);
    if (!isFinite(n)) n = CC.AudioMix.DEFAULT_MASTER;
    masterVol = CC.AudioMix.clamp(n, 0, 1);
    try {
      localStorage.setItem(VOL_KEY, String(Math.round(masterVol * 100)));
    } catch (e) {
      /* приватный режим */
    }
    applyVolumes();
  }

  // Заставка не спорит с музыкой: на время сцены фон уводим в тишину,
  // после — возвращаем на ту же громкость. Работает и без контекста.
  function duckMusic(on) {
    const next = !!on;
    if (next === introDuck) return;
    introDuck = next;
    if (next) {
      stopMusic();
      if (ctx && musicBus) setParam(musicBus.gain, 0, 0.25);
    } else {
      applyVolumes();
      if (musicOn && !hidden && touched && ctx) startMusic();
    }
  }

  function cleanup(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      try { nodes[i].disconnect(); } catch (e) { /* уже отключён */ }
    }
  }

  // Плавно, без щелчков: rare-события не дёргают шину.
  function setParam(param, value, seconds) {
    if (!ctx || !param) return;
    const t = ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      if (seconds > 0) param.linearRampToValueAtTime(value, t + seconds);
      else param.value = value;
    } catch (e) {
      try { param.value = value; } catch (e2) { /* не критично */ }
    }
  }

  function applyVolumes(immediate) {
    if (!ctx || !musicBus || !sfxBus) return;
    const m = mix();
    setParam(musicBus.gain, m.music, immediate ? 0 : 0.35);
    setParam(sfxBus.gain, m.sfx, immediate ? 0 : 0.2);
  }

  // Первый жест: создаём/будим аудиоконтекст и шины.
  function createContext() {
    const AC = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AC) return false;

    try {
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 1; // громкость уже посчитана в шинах

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = CC.AudioMix.COMPRESSOR.threshold;
      comp.knee.value = CC.AudioMix.COMPRESSOR.knee;
      comp.ratio.value = CC.AudioMix.COMPRESSOR.ratio;
      comp.attack.value = CC.AudioMix.COMPRESSOR.attack;
      comp.release.value = CC.AudioMix.COMPRESSOR.release;

      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(comp);
      comp.connect(ctx.destination);

      applyVolumes(true);
      return true;
    } catch (e) {
      ctx = null;
      master = null;
      comp = null;
      musicBus = null;
      sfxBus = null;
      return false;
    }
  }

  function unlock() {
    touched = true;

    const fresh = !ctx;
    if (fresh && !createContext()) return;

    let resumed = false;
    if (ctx.state !== 'running' && ctx.resume) {
      try {
        ctx.resume();
        resumed = true;
      } catch (e) { /* не критично */ }
    }

    if (fresh || resumed) applyVolumes();
    if (musicOn && !hidden) startMusic();
  }

  // Вкладка скрыта: музыка плавно уходит, планировщик замирает.
  function pause() {
    hidden = true;
    stopMusic();
    if (ctx && musicBus) setParam(musicBus.gain, 0, 0.3);
  }

  function resume() {
    hidden = false;
    if (!touched) return; // до первого жеста музыку не запускаем
    if (!ctx) return;     // контекст сам не создаём

    if (ctx.state !== 'running' && ctx.resume) {
      try { ctx.resume(); } catch (e) { /* не критично */ }
    }

    applyVolumes();
    if (musicOn) startMusic();
  }

  function setMode(next) {
    const m = next === 'battle' ? 'battle' : 'base';
    if (m === mode) {
      if (pendingMode) {
        // отменили переход до границы такта — возвращаем громкость режима
        pendingMode = null;
        applyVolumes();
      }
      return;
    }
    if (pendingMode === m) return; // уже ждём границу такта

    if (!ctx || !plan || !cursor) {
      mode = m;
      pendingMode = null;
      applyVolumes();
      return;
    }

    // Тему меняем на ближайшей границе такта, громкость — плавно уже сейчас.
    pendingMode = m;
    const barSec = plan.beatSec * plan.beatsPerBar;
    const elapsed = ctx.currentTime - cursor.loopStart + 0.06;
    let bars = Math.ceil(elapsed / barSec);
    if (bars < 0) bars = 0;
    pendingAt = cursor.loopStart + bars * barSec;
    applyVolumes();
  }

  function resetLimiter() {
    history = {};
  }

  // Не больше LIMITS[name] вызовов одного типа за скользящую секунду.
  function allow(name, at) {
    const max = LIMITS[name] || 10;
    const now = typeof at === 'number' ? at : Date.now();
    let arr = history[name];

    if (!arr) arr = history[name] = [];
    while (arr.length && now - arr[0] >= 1000) arr.shift();

    if (arr.length >= max) return false;
    arr.push(now);
    return true;
  }

  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;

    const len = Math.max(1, Math.floor(ctx.sampleRate * 1));
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function tone(freq, dur, type, gain, slide, delay, dest) {
    if (!ctx) return;

    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    }

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    g.connect(dest || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
    o.onended = function () { cleanup([o, g]); };
  }

  function noise(dur, gain, freq, filterType, delay, dest) {
    if (!ctx) return;

    const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    src.buffer = noiseBuffer();
    flt.type = filterType || 'lowpass';
    flt.frequency.value = freq || 900;
    flt.Q.value = 0.7;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(dest || sfxBus);
    src.start(t, Math.random() * 0.4, dur);
    src.stop(t + dur + 0.02);
    src.onended = function () { cleanup([src, flt, g]); };
  }

  /* ---------- голоса музыки ---------- */

  const MUSIC_VOICES = {
    pad: { type: 'triangle', cutoff: 1000, attack: 0.28 },
    bass: { type: 'sine', cutoff: 450, attack: 0.02 },
    arp: { type: 'triangle', cutoff: 2400, attack: 0.012 },
    spark: { type: 'sine', cutoff: 5200, attack: 0.35 },
    pulse: { type: 'sine', cutoff: 300, attack: 0.006 }
  };

  function playMusicNote(ev) {
    if (!ctx || !musicBus) return;

    const v = MUSIC_VOICES[ev.voice] || MUSIC_VOICES.arp;
    const at = Math.max(ctx.currentTime + 0.005, ev.at);
    const dur = Math.max(0.06, ev.dur);
    const peak = Math.max(0.0002, ev.gain);

    const o = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    o.type = v.type;
    o.frequency.setValueAtTime(ev.freq, at);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(v.cutoff, at);
    flt.Q.value = 0.4;

    const attack = Math.min(v.attack, dur * 0.35);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    o.connect(flt);
    flt.connect(g);
    g.connect(musicBus);
    o.start(at);
    o.stop(at + dur + 0.05);
    o.onended = function () { cleanup([o, flt, g]); };
  }

  function stopMusic() {
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  }

  function pumpMusic() {
    musicTimer = null;
    if (!ctx || !musicOn || hidden) return;

    const now = ctx.currentTime;

    if (!plan || !cursor) {
      if (pendingMode) {
        mode = pendingMode;
        pendingMode = null;
      }
      plan = CC.MusicCore.build(mode);
      cursor = CC.MusicCore.cursor(plan, now + 0.08);
    } else if (pendingMode && now >= pendingAt - LOOKAHEAD) {
      // граница такта: меняем тему без паузы и провала громкости
      const startAt = Math.max(pendingAt, now + 0.05);
      plan = CC.MusicCore.build(pendingMode);
      mode = pendingMode;
      pendingMode = null;
      cursor = CC.MusicCore.cursor(plan, startAt);
    }

    const events = CC.MusicCore.pull(plan, cursor, now + LOOKAHEAD, true);
    for (let i = 0; i < events.length; i++) {
      try {
        playMusicNote(events[i]);
      } catch (e) {
        /* одна нота не должна останавливать планировщик */
      }
    }

    musicTimer = setTimeout(pumpMusic, TICK * 1000);
  }

  function startMusic() {
    if (!ctx || !musicOn || hidden || musicTimer) return;

    // После паузы очередь могла отстать — начинаем луп заново.
    if (plan && cursor) {
      const ev = plan.events[cursor.index];
      const at = cursor.loopStart + ev.beat * plan.beatSec;
      if (at < ctx.currentTime - 0.2) {
        plan = null;
        cursor = null;
      }
    }

    pumpMusic();
  }

  /* ---------- эффекты ---------- */

  const SOUNDS = {
    // глухой стук постановки
    place: function () {
      tone(115, 0.1, 'sine', 0.09, 60);
      noise(0.07, 0.03, 500);
    },
    // тихий шорох переноса
    move: function () {
      noise(0.09, 0.018, 1500, 'bandpass');
    },
    // негромкий молоток
    upgrade: function () {
      tone(170, 0.06, 'square', 0.04, 120);
      noise(0.05, 0.045, 900);
    },
    // приятный аккорд завершения
    upgradeDone: function () {
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        tone(f, 0.35, 'triangle', 0.05, 0, i * 0.07);
      });
    },
    // щелчок очереди тренировки
    train: function () {
      tone(900, 0.035, 'square', 0.025, 650);
    },
    // плюх высадки (общий)
    deploy: function () {
      tone(420, 0.12, 'sine', 0.05, 110);
      noise(0.05, 0.015, 700);
    },
    // штурмовик: низкий и грубый
    deployBarb: function () {
      tone(190, 0.16, 'triangle', 0.085, 95);
      noise(0.08, 0.03, 600);
    },
    // лазерщик: лёгкий высокий щипок
    deployArcher: function () {
      tone(660, 0.1, 'triangle', 0.05, 520);
      noise(0.06, 0.014, 2400, 'bandpass');
    },
    // мех: тяжёлый и медленный
    deployGiant: function () {
      tone(95, 0.3, 'sine', 0.11, 42);
      noise(0.2, 0.05, 260);
    },
    // мародёр: быстрый ехидный вскрик
    deployGoblin: function () {
      tone(780, 0.07, 'square', 0.032, 1150);
      tone(980, 0.05, 'triangle', 0.028, 760, 0.055);
    },
    // тихий удар по постройке
    hit: function () {
      tone(85, 0.05, 'triangle', 0.022, 55);
      noise(0.035, 0.018, 650);
    },
    // удар по энергобарьерове — глуше и суше
    hitWall: function () {
      tone(150, 0.035, 'triangle', 0.014, 90);
      noise(0.04, 0.022, 1400, 'bandpass');
    },
    // глухой взрыв постройки с пылью
    destroy: function () {
      noise(0.35, 0.12, 450);
      tone(70, 0.32, 'sine', 0.07, 35);
    },
    // энергобарьер: дерево трещит, без низкого взрыва
    destroyWall: function () {
      noise(0.08, 0.065, 1700, 'bandpass');
      noise(0.06, 0.045, 1200, 'bandpass', 0.05);
      noise(0.05, 0.035, 2200, 'bandpass', 0.1);
      tone(95, 0.12, 'triangle', 0.035, 70);
    },
    // выстрел турели: резкий хлопок
    cannonShot: function () {
      noise(0.12, 0.07, 1400, 'highpass');
      tone(170, 0.09, 'triangle', 0.05, 55);
    },
    // выстрел башни: короткая струна
    archerShot: function () {
      tone(980, 0.06, 'triangle', 0.025, 620);
      noise(0.025, 0.008, 2600, 'highpass');
    },
    // гаубица: низкий «туп» и тихий полёт снаряда
    mortarShot: function () {
      tone(120, 0.22, 'sine', 0.1, 38);
      noise(0.18, 0.05, 300);
      tone(520, 0.5, 'sine', 0.014, 180, 0.03);
    },
    // приземление снаряда гаубицы
    mortarHit: function () {
      tone(55, 0.42, 'sine', 0.1, 28);
      noise(0.4, 0.1, 260);
    },
    // тревога при набеге на базу
    raidAlarm: function () {
      [660, 495, 660, 495].forEach(function (f, i) {
        tone(f, 0.13, 'triangle', 0.05, 0, i * 0.16);
      });
      tone(110, 0.7, 'sine', 0.035, 80);
    },
    // потеря ресурсов: нисходящий мотив и глухой удар
    lootLost: function () {
      [392, 329.63, 261.63].forEach(function (f, i) {
        tone(f, 0.22, 'triangle', 0.045, 0, i * 0.12);
      });
      tone(70, 0.25, 'sine', 0.05, 45, 0.26);
    },
    // награда за задание: восходящее арпеджио
    questDone: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, 0.24, 'triangle', 0.055, 0, i * 0.08);
      });
      tone(1568, 0.12, 'sine', 0.025, 0, 0.34);
    },
    // новый уровень игрока
    levelUp: function () {
      [392, 523.25, 659.25, 783.99].forEach(function (f, i) {
        tone(f, 0.3, 'triangle', 0.06, 0, i * 0.07);
      });
    },
    // последние секунды боя
    tick: function () {
      tone(1500, 0.02, 'square', 0.012, 1100);
    },
    // короткая фанфара
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, 0.4, 'triangle', 0.055, 0, i * 0.1);
      });
    },
    // нисходящий тон
    lose: function () {
      [392, 311.13, 233.08].forEach(function (f, i) {
        tone(f, 0.35, 'sine', 0.06, 0, i * 0.13);
      });
    },
    // еле слышный клик интерфейса
    ui: function () {
      tone(1200, 0.018, 'square', 0.012, 800);
    },
    // Заставка: гул двигателей 2.5 с, к посадке затухает.
    introEngine: function () {
      if (!ctx || !sfxBus) return;
      const t = ctx.currentTime;
      const dur = 2.5;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(0.075, t + 0.14);
      bus.gain.setValueAtTime(0.075, t + dur - 0.55);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      bus.connect(sfxBus);

      // Две низкие пилы дают неровный гул, фильтр срезает вой.
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(420, t);
      flt.frequency.linearRampToValueAtTime(190, t + dur);
      flt.Q.value = 1.1;
      flt.connect(bus);

      [46, 69].forEach(function (f, i) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i ? 'triangle' : 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.82, t + dur);
        g.gain.value = i ? 0.34 : 0.55;
        o.connect(g);
        g.connect(flt);
        o.start(t);
        o.stop(t + dur + 0.05);
        o.onended = function () { cleanup([o, g]); };
      });

      // Пыль и турбулентность под гулом.
      const src = ctx.createBufferSource();
      const nf = ctx.createBiquadFilter();
      const ng = ctx.createGain();
      src.buffer = noiseBuffer();
      nf.type = 'lowpass';
      nf.frequency.value = 320;
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(nf);
      nf.connect(ng);
      ng.connect(bus);
      src.start(t, 0, dur);
      src.stop(t + dur + 0.02);
      src.onended = function () {
        cleanup([src, nf, ng, flt, bus]);
      };
    },
    // Удар о грунт: низкий взрыв и сухая пыль.
    introImpact: function () {
      tone(62, 0.55, 'sine', 0.17, 26);
      tone(150, 0.2, 'triangle', 0.055, 55, 0.015);
      noise(0.5, 0.16, 380);
      noise(0.12, 0.06, 1900, 'highpass', 0.02);
    },
    // Раскрытие модуля: сервоприводы, щелчки замков и шипение.
    introServo: function () {
      tone(230, 0.52, 'sawtooth', 0.026, 105);
      tone(330, 0.34, 'square', 0.014, 180, 0.06);
      [0.16, 0.42, 0.72].forEach(function (d, i) {
        noise(0.028, 0.05 - i * 0.008, 1900 + i * 260, 'bandpass', d);
      });
      noise(0.55, 0.035, 1100, 'bandpass');
      tone(140, 0.08, 'triangle', 0.04, 90, 0.86);
    },
    // Подъём турели: металлический лязг и короткий скрип привода.
    introClank: function () {
      tone(430, 0.18, 'square', 0.038, 190);
      tone(760, 0.12, 'triangle', 0.028, 320, 0.03);
      noise(0.2, 0.1, 2500, 'bandpass');
      noise(0.09, 0.06, 1200, 'bandpass', 0.11);
      tone(105, 0.3, 'sine', 0.05, 60, 0.02);
    },
    // Титул: короткий аккорд, не спорит с музыкой.
    introTitle: function () {
      [392, 523.25, 659.25].forEach(function (f, i) {
        tone(f, 0.5, 'triangle', 0.05, 0, i * 0.045);
      });
      tone(98, 0.55, 'sine', 0.035, 70);
    }
  };

  function resolve(name, detail) {
    if (name === 'deploy' && detail) {
      const key = 'deploy' + String(detail).charAt(0).toUpperCase() +
        String(detail).slice(1);
      if (SOUNDS[key]) return key;
    }
    if (name === 'destroy' && detail === 'wall') return 'destroyWall';
    if (name === 'hit' && detail === 'wall') return 'hitWall';
    return name;
  }

  function play(name, at, detail) {
    if (!enabled) return false;

    const key = resolve(name, detail);
    if (!allow(key, at)) return false;

    const fn = SOUNDS[key];
    if (ctx && fn) {
      try {
        fn();
      } catch (e) {
        /* звук не должен ронять игру */
      }
    }

    return true;
  }

  return {
    LIMITS: LIMITS,
    play: play,
    allow: allow,
    unlock: unlock,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    setMusicEnabled: setMusicEnabled,
    isMusicEnabled: isMusicEnabled,
    setMaster: setMaster,
    master: masterLevel,
    mix: mix,
    setMode: setMode,
    pause: pause,
    resume: resume,
    duckMusic: duckMusic,
    resetLimiter: resetLimiter
  };
})();

CC.CamMath = (function () {
  'use strict';

  const MIN_ZOOM = 1;   // 1 = рамка целиком (в бою — база врага)
  const MAX_ZOOM = 8;
  const MARGIN = 8;     // сколько пикселей поля можно выглянуть за экран
  const MAX_FIT_SCALE = 1.2; // не раздуваем маленькую базу через весь экран
  const FOCUS_PAD = 0.5;     // отступ вокруг базы в тайлах (бой)

  /* Базовый вид «в деревне» теперь вписывает рамку построек, а не
     фиксированное число тайлов. Нормы ниже — только для запасного
     варианта без рамки (пустая база/тесты). */
  const DEFAULT_TILES = 13;
  const MIN_TILE_PX = 46;    // дефолт деревни: крупно и читаемо, обзор — зум-аут
  const BATTLE_MIN_TILE_PX = 34; // дефолт боя: читаемо, края — панорамой
  const MAX_TILE_PX = 104;   // на мониторе не приближаем тайл сильнее
  const MIN_VISIBLE_Y = 4.5; // по высоте полосы — хотя бы 4.5 тайла
  const BASE_PAD = 1.5;      // отступ вокруг ядра построек в тайлах
  const BASE_CORE_MAX = 9;   // кадр по ядру: внешние склады/стены — панорамой
  // Мир в деревне и в бою опускается относительно фона. Небольшой сдвиг
  // поднимает базу из-под нижней панели, не уводя её под верхний HUD.
  const BASE_DROP = 0.04;
  const BASE_DROP_LIMIT = 0.25;

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  // Держим поле в экране: если оно меньше вьюпорта — не даём увести его
  // целиком, если больше — не даём оторваться от краёв. extra — разрешённый
  // сдвиг вниз (опускание мира), чтобы не срезать его жёстким MARGIN.
  function fitAxis(start, size, view, extra) {
    const add = Math.max(0, Number(extra) || 0);
    if (size <= view - MARGIN * 2) {
      return clamp(start, MARGIN, view - MARGIN - size + add);
    }
    return clamp(start, view - MARGIN - size, MARGIN + add);
  }

  // Bounding box построек в клетках. Пустая база → null.
  function boundsOf(list) {
    if (!list || !list.length) return null;

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.dead) continue;
      const w = b.w || 1;
      const h = b.h || 1;
      if (b.x < x0) x0 = b.x;
      if (b.y < y0) y0 = b.y;
      if (b.x + w > x1) x1 = b.x + w;
      if (b.y + h > y1) y1 = b.y + h;
    }

    if (!isFinite(x0)) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Рамка базы + отступ, обрезанная по полю. null → всё поле.
  function focusRect(bounds, pad, gridW, gridH) {
    if (!bounds) {
      return { x0: 0, y0: 0, x1: gridW, y1: gridH };
    }

    const p = typeof pad === 'number' ? pad : FOCUS_PAD;
    return {
      x0: Math.max(0, bounds.x0 - p),
      y0: Math.max(0, bounds.y0 - p),
      x1: Math.min(gridW, bounds.x1 + p),
      y1: Math.min(gridH, bounds.y1 + p)
    };
  }

  // Ограничиваем домашний кадр ядром: если дальние ресурсы/стены растянули
  // bounds, оставляем окно BASE_CORE_MAX вокруг центра. Всё поле доступно
  // отдельной кнопкой ◎, а базовый вид не должен отъезжать на 36 тайлов.
  function capRect(rect, maxSpan, gridW, gridH) {
    const max = Math.max(4, Number(maxSpan) || BASE_CORE_MAX);
    let w = rect.x1 - rect.x0;
    let h = rect.y1 - rect.y0;
    if (w <= max && h <= max) return rect;

    const cx = (rect.x0 + rect.x1) / 2;
    const cy = (rect.y0 + rect.y1) / 2;
    w = Math.min(max, w);
    h = Math.min(max, h);

    let x0 = cx - w / 2;
    let y0 = cy - h / 2;
    let x1 = x0 + w;
    let y1 = y0 + h;

    if (x0 < 0) { x1 -= x0; x0 = 0; }
    if (y0 < 0) { y1 -= y0; y0 = 0; }
    if (x1 > gridW) { x0 -= x1 - gridW; x1 = gridW; }
    if (y1 > gridH) { y0 -= y1 - gridH; y1 = gridH; }

    return {
      x0: Math.max(0, x0),
      y0: Math.max(0, y0),
      x1: Math.min(gridW, x1),
      y1: Math.min(gridH, y1)
    };
  }

  // Границы прямоугольника в мировых пикселях (ромб изометрии).
  function worldBox(rect, tw, th) {
    const corners = [
      [rect.x0, rect.y0], [rect.x1, rect.y0],
      [rect.x1, rect.y1], [rect.x0, rect.y1]
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < corners.length; i++) {
      const wx = (corners[i][0] - corners[i][1]) * tw / 2;
      const wy = (corners[i][0] + corners[i][1]) * th / 2;

      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }

    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY,
      w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  // Масштаб, при котором прямоугольник клеток влезает в полосу.
  function fitScaleFor(rect, w, bandH, topPad, tw, th) {
    const box = worldBox(rect, tw, th);
    return Math.min((w * 0.96) / box.w, bandH / (box.h + topPad));
  }

  // Заметно ли выросла рамка: на каждый тап камеру не дёргаем.
  function rectGrew(before, after, step) {
    if (!before || !after) return true;
    const d = typeof step === 'number' ? step : 0.75;
    return after.x0 < before.x0 - d || after.y0 < before.y0 - d ||
      after.x1 > before.x1 + d || after.y1 > before.y1 + d;
  }

  // Базовый зум: в деревне вписываем рамку построек, в бою — базу врага.
  // Запасной вариант без рамки — 12-14 тайлов по ширине.
  function defaultZoomFor(w, h, bandH, tw, th, fit, focus, homeRect, topPad) {
    if (focus) {
      // В бою важнее читаемость: минимум 30 px на тайл, даже если база
      // выше полосы и её края доступны панорамой.
      const minBattle = BATTLE_MIN_TILE_PX / tw;
      return clamp(minBattle / fit, MIN_ZOOM, MAX_ZOOM);
    }
    if (h > w) return MIN_ZOOM;          // портрет: вписываем сцену с полями

    if (homeRect) {
      // На очень маленьких экранах (683×320) держим прежний минимум 30,
      // чтобы база не превращалась в один обрезанный кусок.
      const minTile = (w < 700 && h <= 360) ? 30 : MIN_TILE_PX;
      // Резерв сверху нужен маленькой базе (TH1), но большое ядро 8–9
      // тайлов уже само упирается в полосу HUD. Поэтому для крупной
      // рамки оставляем только четверть запаса: иначе TH4+ получает
      // 50–55% ширины вместо целевых 60–65%.
      const span = Math.min(homeRect.x1 - homeRect.x0, homeRect.y1 - homeRect.y0);
      const padK = span <= 5 ? 1
        : (span >= 9 ? 0.35 : 1 - (span - 5) * 0.1625);
      let s = fitScaleFor(homeRect, w, bandH, (topPad || 0) * padK, tw, th);
      // Даже если база не влезает целиком, тайл на телефоне должен
      // оставаться читаемым и тапабельным. «Всё поле» — кнопка ◎.
      s = Math.max(s, minTile / tw);
      s = Math.min(s, MAX_TILE_PX / tw);
      // Не приближаем базу сильнее, чем позволяет полоса HUD, но не
      // опускаемся ниже минимального читаемого тайла: лучше лёгкая
      // обрезка и панорама, чем мелкая база.
      const safe = fitScaleFor(homeRect, w, bandH, 0, tw, th);
      if (s > safe) s = Math.max(safe, minTile / tw);
      return clamp(s / fit, MIN_ZOOM, MAX_ZOOM);
    }

    if (h > w) return MIN_ZOOM;          // портрет без рамки: вся сцена

    let s = w / (tw * DEFAULT_TILES);
    s = Math.min(s, MAX_TILE_PX / tw);
    s = Math.max(s, MIN_TILE_PX / tw);
    s = Math.min(s, bandH / (th * MIN_VISIBLE_Y));

    return clamp(s / fit, MIN_ZOOM, MAX_ZOOM);
  }

  // fitScale и центр под текущий размер экрана. focus — прямоугольник
  // в клетках; без него вписывается всё поле. homeRect — рамка деревни:
  // по ней считается базовый зум, но MIN_ZOOM остаётся «всё поле».
  function layout(cam, w, h, gridW, gridH, tw, th, topPad, bandTop, bandH, focus, homeRect) {
    const rect = focus || { x0: 0, y0: 0, x1: gridW, y1: gridH };
    const box = worldBox(rect, tw, th);
    const battle = !!focus;

    // Деревня вписывает ядро почти на всю ширину, бой — 55–70% ширины,
    // чтобы база читалась как объект, а не как обои. Небольшой запас
    // сверху/снизу не даёт прижаться к HUD при новой высоте тайла.
    const widthShare = battle ? 0.68 : 0.96;
    const padForFit = battle ? 8 : 12;
    const rawFit = Math.min((w * widthShare) / box.w, bandH / (box.h + padForFit));
    const fit = Math.min(rawFit, MAX_FIT_SCALE);

    cam.w = w;
    cam.h = h;
    cam.gridW = gridW;
    cam.gridH = gridH;
    cam.tileW = tw;
    cam.tileH = th;
    cam.focus = rect;
    cam.focusMode = battle;
    cam.fitScale = fit;
    cam.centerWorldX = (box.minX + box.maxX) / 2;
    cam.centerWorldY = (box.minY + box.maxY) / 2;

    // «Дом» камеры в деревне — центр рамки построек; в бою — центр focus.
    const home = homeRect || rect;
    const homeBox = homeRect ? worldBox(home, tw, th) : box;
    cam.homeWorldX = (homeBox.minX + homeBox.maxX) / 2;
    cam.homeWorldY = (homeBox.minY + homeBox.maxY) / 2;
    cam.homeRect = homeRect || null;

    cam.bandCenterY = bandTop + bandH / 2;
    cam.topPad = topPad;

    cam.defaultZoom = defaultZoomFor(w, h, bandH, tw, th, fit, focus, homeRect, topPad);
    // «Авто»-сдвиг вниз ограничен не только процентом, но и остатком
    // полосы: иначе крупная база TH4+ уезжает под нижнее меню.
    const autoZoom = clamp(cam.defaultZoom, MIN_ZOOM, MAX_ZOOM);
    const autoHomeH = homeBox.h * fit * autoZoom;
    // Без рамки (пустая база/тесты) остаётся прежний лимит полосы.
    const dropRoom = homeRect
      ? Math.max(0, (bandH - autoHomeH) / 2)
      : bandH * BASE_DROP_LIMIT;
    cam.dropY = battle ? 0
      : Math.max(0, Math.min(h * BASE_DROP, bandH * BASE_DROP_LIMIT, dropRoom));
    cam.centerX = w / 2 - cam.centerWorldX * fit;
    cam.centerY = cam.bandCenterY - cam.centerWorldY * fit + cam.dropY;

    // zoom = 0 - «авто»: ставим базовый вид под текущий экран
    if (!cam.zoom || !isFinite(cam.zoom)) cam.zoom = cam.defaultZoom;
    cam.zoom = clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM);
    cam.scale = fit * cam.zoom;
    refreshHome(cam);
    cam.ox = cam.homeX + (cam.panX || 0);
    cam.oy = cam.homeY + (cam.panY || 0);

    clampCam(cam);
    return cam;
  }

  // Положение камеры без панорамы при текущем масштабе. Центр рамки всегда
  // остаётся в середине полосы — иначе при зуме уезжал бы верхний угол поля.
  function refreshHome(cam) {
    cam.homeX = cam.w / 2 - cam.homeWorldX * cam.scale;
    cam.homeY = cam.bandCenterY - cam.homeWorldY * cam.scale +
      (cam.dropY || 0);
  }

  function clampCam(cam) {
    const halfW = cam.gridW * cam.tileW / 2 * cam.scale;
    const fieldH = cam.gridH * cam.tileH * cam.scale;

    cam.ox = fitAxis(cam.ox - halfW, halfW * 2, cam.w) + halfW;
    if (cam.focusMode) {
      // В бою кадр базы может быть меньше поля: не прижимаем его к самому
      // верху, иначе база уезжает вниз под карточки. При ручном зуме поле
      // снова клампим по краям, как обычно.
      const floats = fieldH <= cam.h - 1;
      const lo = cam.h - fieldH - (floats ? 24 : MARGIN);
      const hi = floats ? 24 : MARGIN;
      cam.oy = clamp(cam.oy, lo, hi);
    } else {
      cam.oy = fitAxis(cam.oy, fieldH, cam.h, cam.dropY || 0);
    }

    cam.panX = cam.ox - cam.homeX;
    cam.panY = cam.oy - cam.homeY;
    return cam;
  }

  // Зум вокруг экранной точки: мир под ней остаётся на месте.
  function zoomAt(cam, sx, sy, zoom) {
    const wx = (sx - cam.ox) / cam.scale;
    const wy = (sy - cam.oy) / cam.scale;

    cam.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    cam.scale = cam.fitScale * cam.zoom;
    refreshHome(cam);
    cam.ox = sx - wx * cam.scale;
    cam.oy = sy - wy * cam.scale;

    clampCam(cam);
    return cam;
  }

  function panBy(cam, dx, dy) {
    cam.ox += dx;
    cam.oy += dy;
    clampCam(cam);
    return cam;
  }

  function reset(cam) {
    cam.zoom = 1;
    cam.panX = 0;
    cam.panY = 0;
    cam.scale = cam.fitScale;
    refreshHome(cam);
    cam.ox = cam.homeX;
    cam.oy = cam.homeY;
    clampCam(cam);
    return cam;
  }

  function screenToWorld(cam, sx, sy) {
    return {
      x: (sx - cam.ox) / cam.scale,
      y: (sy - cam.oy) / cam.scale
    };
  }

  function worldToScreen(cam, wx, wy) {
    return {
      x: cam.ox + wx * cam.scale,
      y: cam.oy + wy * cam.scale
    };
  }

  function screenToGrid(cam, sx, sy) {
    const w = screenToWorld(cam, sx, sy);
    return CC.Iso.unproject(w.x, w.y);
  }

  function gridToScreen(cam, gx, gy) {
    const p = CC.Iso.project(gx, gy);
    return worldToScreen(cam, p.x, p.y);
  }

  // Сколько тайлов реально видно на экране при текущем масштабе.
  function visibleTiles(cam) {
    return {
      x: cam.w / (cam.tileW * cam.scale),
      y: cam.h / (cam.tileH * cam.scale)
    };
  }

  return {
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
    MAX_FIT_SCALE: MAX_FIT_SCALE,
    FOCUS_PAD: FOCUS_PAD,
    BASE_PAD: BASE_PAD,
    BASE_CORE_MAX: BASE_CORE_MAX,
    DEFAULT_TILES: DEFAULT_TILES,
    MIN_TILE_PX: MIN_TILE_PX,
    BATTLE_MIN_TILE_PX: BATTLE_MIN_TILE_PX,
    MAX_TILE_PX: MAX_TILE_PX,
    BASE_DROP: BASE_DROP,
    BASE_DROP_LIMIT: BASE_DROP_LIMIT,
    boundsOf: boundsOf,
    focusRect: focusRect,
    capRect: capRect,
    fitScaleFor: fitScaleFor,
    rectGrew: rectGrew,
    layout: layout,
    clamp: clampCam,
    zoomAt: zoomAt,
    panBy: panBy,
    reset: reset,
    visibleTiles: visibleTiles,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    screenToGrid: screenToGrid,
    gridToScreen: gridToScreen
  };
})();

(function () {
  'use strict';

  // В node (тесты камеры) DOM нет — дальше не идём.
  if (typeof document === 'undefined' || !document.getElementById) return;

  const canvas = document.getElementById('stage');
  const app = document.getElementById('app');
  const rotateEl = document.getElementById('rotate');
  const ctx = canvas.getContext('2d');

  CC.Cam = {
    scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0,
    zoom: 0, panX: 0, panY: 0,
    fitScale: 1, centerX: 0, centerY: 0, defaultZoom: 1,
    homeX: 0, homeY: 0, homeRect: null,
    gridW: CC.GRID, gridH: CC.GRID, tileW: CC.TW, tileH: CC.TH
  };

  /* Определяем тач не по размеру окна: узкое окно на десктопе — не телефон. */
  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) { /* старый браузер */ }
    if ('ontouchstart' in window) return true;
    return (navigator.maxTouchPoints | 0) > 0;
  }

  CC.App.touch = isTouchDevice();
  CC.App.paused = false;
  CC.App.storagePaused = false;
  CC.App.introOpen = false; // стартовая заставка держит цикл на паузе

  let lastLandscape = null;

  function battleFocus() {
    if (CC.App.mode !== 'battle') return null;

    const S = CC.Battle.state;
    if (!S || !S.bounds) return null;

    return CC.CamMath.focusRect(S.bounds, CC.CamMath.FOCUS_PAD, CC.GRID, CC.GRID);
  }

  // Рамка деревни: ядро построек без стен и скрытых ловушек. Стены могут
  // уходить далеко за пределы базы — если считать по ним, камера отъезжает
  // почти на всё поле. По этой рамке считается базовый масштаб.
  function baseHomeRect() {
    if (CC.App.mode === 'battle') return null;

    const list = CC.Base.list().filter(function (it) {
      if (!it) return false;
      if (it.type === 'wall') return false;
      if (CC.isTrap && CC.isTrap(it.type)) return false;
      return true;
    }).map(function (it) {
      const s = CC.Base.size(it.type);
      return { x: it.x, y: it.y, w: s.w, h: s.h };
    });

    return CC.CamMath.capRect(
      CC.CamMath.focusRect(
        CC.CamMath.boundsOf(list), CC.CamMath.BASE_PAD, CC.GRID, CC.GRID
      ),
      CC.CamMath.BASE_CORE_MAX, CC.GRID, CC.GRID
    );
  }

  // Портрет на телефоне — заглушка «поверните» и пауза. На десктопе просто
  // вписываем сцену в узкое окно, играть можно.
  function updateOrientation(w, h) {
    const portrait = h > w;
    const block = portrait && CC.App.touch;

    CC.App.portrait = portrait;
    CC.App.paused = block;

    if (rotateEl) rotateEl.classList.toggle('hidden', !block);
    app.classList.toggle('is-portrait', portrait);
    app.classList.toggle('is-landscape', !portrait);
  }

  // Базовый вид «сам собой»: пока игрок не трогал камеру, рамка деревни
  // обновляется при росте базы. Ручной зум/панорама эту связь выключают.
  let baseAuto = true;
  let camTween = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, app.clientWidth || window.innerWidth);
    const h = Math.max(1, app.clientHeight || window.innerHeight);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const portrait = h > w;
    const short = h < 520;

    // В ландшафте HUD занимает углы, а не полосы сверху/снизу — оставляем полю
    // больше места. В портрете (десктоп) вписываем всё поле в остаток.
    const topPad = short ? 54 : 78;
    const baseMode = CC.App.mode !== 'battle';
    const bandTop = portrait ? 146 : (baseMode ? (short ? 74 : 96) : 64);
    // в деревне снизу только терминал и «В бой», в бою — панель войск
    const bandBottom = portrait ? 116
      : (baseMode ? (short ? 84 : 92) : 132);
    const bandH = Math.max(120, h - bandTop - bandBottom);

    CC.Cam.dpr = dpr;
    app.classList.toggle('is-narrow', w <= 360);
    app.classList.toggle('is-wide', w >= 640);
    app.classList.toggle('is-short', short);

    updateOrientation(w, h);

    // Смена ориентации — возвращаем базовый вид.
    const landscape = !portrait;
    if (lastLandscape !== null && landscape !== lastLandscape) {
      CC.Cam.zoom = 0;
      CC.Cam.panX = 0;
      CC.Cam.panY = 0;
      baseAuto = true;
    }
    lastLandscape = landscape;

    // Пока камерой не управляли вручную, базовый вид пересчитывается под
    // новый размер: иначе зум от прошлого экрана делал тайл 30 или 165 px.
    if (baseAuto) {
      CC.Cam.zoom = 0;
      CC.Cam.panX = 0;
      CC.Cam.panY = 0;
    }

    camTween = null;
    CC.CamMath.layout(
      CC.Cam, w, h, CC.GRID, CC.GRID, CC.TW, CC.TH,
      topPad, bandTop, bandH, battleFocus(), baseHomeRect()
    );

    // Сцена заставки живёт на отдельном канвасе и повторяет размер #stage.
    if (CC.Intro && CC.Intro.resize) CC.Intro.resize();
  }

  // Снимок камеры для плавного перехода к новой рамке.
  function camSnapshot() {
    return {
      zoom: CC.Cam.zoom, scale: CC.Cam.scale,
      ox: CC.Cam.ox, oy: CC.Cam.oy,
      homeX: CC.Cam.homeX, homeY: CC.Cam.homeY
    };
  }

  function camRestore(s) {
    CC.Cam.zoom = s.zoom;
    CC.Cam.scale = s.scale;
    CC.Cam.ox = s.ox;
    CC.Cam.oy = s.oy;
    CC.Cam.homeX = s.homeX;
    CC.Cam.homeY = s.homeY;
    CC.Cam.panX = s.ox - s.homeX;
    CC.Cam.panY = s.oy - s.homeY;
  }

  // Пересчитать рамку деревни и плавно подвести камеру к новому базовому виду.
  function relayoutBase() {
    const from = camSnapshot();
    CC.Cam.zoom = 0;
    resize();
    const to = camSnapshot();

    if (Math.abs(to.scale - from.scale) < 0.0005 &&
        Math.abs(to.ox - from.ox) < 0.5 && Math.abs(to.oy - from.oy) < 0.5) {
      return;
    }

    camTween = { t: 0, dur: 0.3, from: from, to: to };
    camRestore(from);
  }

  function stepCamTween(dt) {
    if (!camTween) return;

    const t = camTween;
    t.t += dt;
    const k = Math.min(1, t.t / t.dur);
    const e = k * k * (3 - 2 * k);

    function lerp(a, b) { return a + (b - a) * e; }

    CC.Cam.zoom = lerp(t.from.zoom, t.to.zoom);
    CC.Cam.scale = lerp(t.from.scale, t.to.scale);
    CC.Cam.ox = lerp(t.from.ox, t.to.ox);
    CC.Cam.oy = lerp(t.from.oy, t.to.oy);
    CC.Cam.homeX = lerp(t.from.homeX, t.to.homeX);
    CC.Cam.homeY = lerp(t.from.homeY, t.to.homeY);
    CC.Cam.panX = CC.Cam.ox - CC.Cam.homeX;
    CC.Cam.panY = CC.Cam.oy - CC.Cam.homeY;

    if (k >= 1) camTween = null;
  }

  // Игрок сам двигал камеру — больше не подгоняем её под рамку базы.
  CC.CamTouched = function () {
    baseAuto = false;
    camTween = null;
  };

  // База изменилась (постановка/снос/перенос). Дёргаем камеру только если
  // рамка заметно выросла и игрок не трогал зум.
  CC.CamBaseChanged = function () {
    if (CC.App.mode !== 'base') return;

    const rect = baseHomeRect();
    if (!CC.CamMath.rectGrew(CC.Cam.homeRect, rect, 1.5)) return;
    if (!baseAuto) return;

    relayoutBase();
  };

  // Пересобрать камеру под режим/уровень. reset — вернуть базовый вид.
  CC.CamFocus = function (reset) {
    if (reset) {
      CC.Cam.zoom = 0;
      CC.Cam.panX = 0;
      CC.Cam.panY = 0;
      baseAuto = true;
      camTween = null;
    }
    resize();
  };

  // Подвести камеру к точке сетки (постройке) и запомнить ручной вид.
  CC.CamLookAt = function (gx, gy) {
    if (!CC.Cam || !CC.Cam.w || !CC.Cam.scale) return false;

    const p = CC.Iso.project(gx, gy);
    CC.Cam.ox = CC.Cam.w / 2 - p.x * CC.Cam.scale;
    CC.Cam.oy = CC.Cam.h / 2 - p.y * CC.Cam.scale;

    baseAuto = false;
    camTween = null;
    CC.CamMath.clamp(CC.Cam);
    return true;
  };

  /* Полный экран и горизонтальная ориентация — только на тач-устройствах
     и только после первого действия. Любой отказ молча игнорируем. */
  let immersiveTried = false;

  function lockLandscape() {
    try {
      const so = typeof screen !== 'undefined' ? screen.orientation : null;
      if (so && so.lock) {
        const p = so.lock('landscape');
        if (p && p.catch) p.catch(function () { /* не разрешили */ });
      }
    } catch (e) { /* не поддерживается */ }
  }

  function tryImmersive() {
    if (immersiveTried) return;
    immersiveTried = true;
    if (!CC.App.touch) return;

    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) {
        lockLandscape();
        return;
      }
      const p = req.call(el);
      if (p && p.then) p.then(lockLandscape, function () {});
      else lockLandscape();
    } catch (e) { /* отказ — играем как есть */ }
  }

  let lastT = 0;
  let lastSave = 0;

  // Сохраняем прогресс. В бою сначала возвращаем в деревню невысаженных,
  // чтобы закрытая вкладка не спасала высаженные войска. Вкладка, у которой
  // лизинг забрала другая, не пишет вообще: иначе затрёт свежий сейв.
  function persist() {
    if (CC.App.storagePaused || CC.TabGuard.isPaused()) return false;

    return CC.TabGuard.run(function () {
      if (CC.App.mode === 'battle' && CC.Battle.state) CC.Battle.syncArmy();
      CC.Game.save();
    });
  }

  function frame(now) {
    if (!lastT) lastT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // Портрет на телефоне, открытый модал или игра в другой вкладке:
    // сцена стоит, таймеры боя и экономики не тикают.
    if (CC.App.paused || CC.App.storagePaused || CC.App.modalOpen) {
      requestAnimationFrame(frame);
      return;
    }

    // Заставка «Колония»: сцену рисует отдельный rAF в CC.Intro,
    // а игровое время стоит — CC.Game.tick и таймеры боя не вызываются.
    if (CC.App.introOpen) {
      requestAnimationFrame(frame);
      return;
    }

    CC.Game.tick(Date.now());

    // автосейв раз в 5 секунд: прогресс не теряется при закрытии вкладки
    if (!lastSave || now - lastSave > 5000) {
      lastSave = now;
      persist();
    }

    if (CC.App.mode === 'battle') {
      // В первые 3 секунды база только показывается: бой и таймер стоят.
      if (!CC.App.prepActive) {
        const pb = CC.Battle.state;
        const speed = (pb && pb.kind === 'replay') ? (CC.App.replaySpeed || 1) : 1;
        CC.Battle.update(dt * speed);
      }
    }
    if (CC.Sound && CC.Sound.setMode) CC.Sound.setMode(CC.App.mode);
    stepCamTween(dt);
    CC.Render.draw(ctx, CC.Cam);
    CC.UI.sync();

    requestAnimationFrame(frame);
  }

  function boot() {
    CC.TabGuard.claim();
    CC.Base.load();
    CC.Game.load();
    // Набег проверяется только здесь, по реальному времени отсутствия из
    // сейва. Пока игра открыта, нападений на базу нет.
    if (CC.Game.maybeRaid) CC.Game.maybeRaid(Date.now());
    CC.Battle.reset();
    resize();
    CC.UI.init();
    CC.UI.sync();

    // Заставка поверх уже готовой игры. Любая ошибка снимает паузу,
    // чтобы экран не остался заблокированным.
    try {
      if (CC.Intro && CC.Intro.start) CC.Intro.start();
    } catch (e) {
      CC.App.introOpen = false;
      if (CC.Intro && CC.Intro.finish) CC.Intro.finish('boot-error');
    }

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () {
      setTimeout(resize, 120);
    });

    document.addEventListener('pointerdown', tryImmersive, true);
    document.addEventListener('touchstart', tryImmersive, true);

    window.addEventListener('pagehide', function () {
      persist();
      if (CC.Sound) CC.Sound.pause();
    });
    window.addEventListener('pageshow', function (e) {
      if (e && e.persisted && !CC.App.storagePaused && CC.Sound) {
        CC.Sound.resume();
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        // Запоминаем момент ухода. Скрытая, но не закрытая вкладка набега
        // не запускает: он проверится только при следующем boot.
        persist();
        if (CC.Sound) CC.Sound.pause();
      } else {
        if (!CC.App.storagePaused && CC.Sound) CC.Sound.resume();
      }
    });

    // Две вкладки: лидер заявляет себя в localStorage, остальные замирают.
    // Данные (base/village) тоже слушаем как страховку, но лидер чужие
    // устаревшие записи игнорирует.
    window.addEventListener('storage', function (e) {
      if (!e) return;

      const isTab = e.key === CC.TabGuard.KEY;
      const isData = e.key === 'clash-base-v2' || e.key === 'clash-village-v2';
      if (!isTab && !isData) return;
      if (CC.App.storagePaused) return;

      if (isTab) {
        if (!CC.TabGuard.onExternal(e.key)) return;
      } else if (CC.TabGuard.owns()) {
        return;
      }

      CC.App.storagePaused = true;
      CC.TabGuard.pause();
      if (CC.Sound) CC.Sound.pause();
      if (CC.UI && CC.UI.showTabLock) {
        if (!CC.UI.showTabLock() && CC.UI.toast) {
          CC.UI.toast('Игра открыта в другой вкладке — прогресс на паузе');
        }
      } else if (CC.UI && CC.UI.toast) {
        CC.UI.toast('Игра открыта в другой вкладке — прогресс на паузе');
      }
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
