/* Интерфейс: режимы, ресурсы, палитра, панель постройки, тренировка, финал боя. */
window.CC = window.CC || {};

CC.UI = (function () {
  'use strict';

  const canvas = document.getElementById('stage');
  const app = document.getElementById('app');
  const armyEl = document.getElementById('army');
  const shopBtn = document.getElementById('shop-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const shopEl = document.getElementById('shop');
  const shopGrid = document.getElementById('shop-grid');
  const shopNote = document.getElementById('shop-note');
  const shopX = document.getElementById('shop-x');
  const shopCats = document.getElementById('shop-cats');
  const shopResGold = document.getElementById('shop-res-gold');
  const shopResGoldCap = document.getElementById('shop-res-gold-cap');
  const shopResElixir = document.getElementById('shop-res-elixir');
  const shopResElixirCap = document.getElementById('shop-res-elixir-cap');
  const shopResGems = document.getElementById('shop-res-gems');
  const ghostEl = document.getElementById('place-ghost');
  const ghostShape = document.getElementById('place-ghost-shape');
  const ghostIcon = document.getElementById('place-ghost-icon');
  const pctEl = document.getElementById('pct');
  const timerEl = document.getElementById('timer');
  const tipEl = document.getElementById('tip');
  const tipText = document.getElementById('tip-text');
  const tipX = document.getElementById('tip-x');
  const battleIntro = document.getElementById('battle-intro');
  const selbar = document.getElementById('selbar');
  const selIcon = document.getElementById('sel-icon');
  const selName = document.getElementById('sel-name');
  const selLevel = document.getElementById('sel-level');
  const selStats = document.getElementById('sel-stats');
  const selUp = document.getElementById('sel-up');
  const selTimer = document.getElementById('sel-timer');
  const selProgress = document.getElementById('sel-progress');
  const selProgressFill = selProgress ? selProgress.querySelector('i') : null;
  const selUpgrade = document.getElementById('sel-upgrade');
  const selUpgradeSpeed = document.getElementById('sel-upgrade-speed');
  const selPrice = document.getElementById('sel-upgrade-cost');
  const selInfo = document.getElementById('sel-info');
  const selArmy = document.getElementById('sel-army');
  const labUp = document.getElementById('lab-up');
  const selHero = document.getElementById('sel-hero');
  const heroList = document.getElementById('hero-list');
  const trainQueue = document.getElementById('train-queue');
  const recruitEl = document.getElementById('recruit');
  const recruitGrid = document.getElementById('recruit-grid');
  const recruitSide = document.getElementById('recruit-side');
  const recruitX = document.getElementById('recruit-x');
  const recruitSub = document.getElementById('recruit-sub');
  const hangarRecruitBtn = document.getElementById('hangar-recruit');
  const shopPrev = document.getElementById('shop-prev');
  const shopNext = document.getElementById('shop-next');
  const speedTrainBtn = document.getElementById('speed-train');
  const troopUpList = document.getElementById('troop-up-list');
  const troopUpHint = document.getElementById('troop-up-hint');
  const armyCapEl = document.getElementById('army-cap');
  const armyQueueEl = document.getElementById('army-queue');
  const resGold = document.getElementById('res-gold');
  const resGoldCap = document.getElementById('res-gold-cap');
  const resGoldBar = document.getElementById('res-gold-bar');
  const resElixir = document.getElementById('res-elixir');
  const resElixirCap = document.getElementById('res-elixir-cap');
  const resElixirBar = document.getElementById('res-elixir-bar');
  const resGems = document.getElementById('res-gems');
  const resbar = document.getElementById('resbar');
  // Кликабельные панели ресурсов в правом верхнем углу.
  const resGoldPanel = document.getElementById('res-gold-panel');
  const resElixirPanel = document.getElementById('res-elixir-panel');
  const resGemsPanel = document.getElementById('res-gems-panel');
  const hudArmyUsed = document.getElementById('hud-army-used');
  const hudArmyCap = document.getElementById('hud-army-cap');
  const hudArmyBar = document.getElementById('hud-army-bar');
  const overlayEl = document.getElementById('overlay');
  const overlayLoot = document.getElementById('overlay-loot');
  const overlayLost = document.getElementById('overlay-lost');
  const overlayHint = document.getElementById('overlay-hint');
  const overlayArmy = document.getElementById('overlay-army');
  const offlineEl = document.getElementById('offline');
  const offlineText = document.getElementById('offline-text');
  const offlineLoot = document.getElementById('offline-loot');
  const offlineHint = document.getElementById('offline-hint');
  const btnOffline = document.getElementById('btn-offline');
  const raidEl = document.getElementById('raid');
  const raidText = document.getElementById('raid-text');
  const raidLoot = document.getElementById('raid-loot');
  const raidVerdict = document.getElementById('raid-verdict');
  const btnRaidOk = document.getElementById('btn-raid-ok');
  const tabLock = document.getElementById('tab-lock');
  const btnTabTake = document.getElementById('btn-tab-take');
  const starsEl = document.getElementById('stars');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnAgain = document.getElementById('btn-again');
  const resultCard = document.getElementById('result-card');
  const resultBanner = document.getElementById('overlay-banner');
  const resultBannerFallback = document.getElementById('overlay-banner-fallback');
  const battleLootEl = document.getElementById('battle-loot');
  const battleStatsEl = document.getElementById('battle-stats');
  const battleStarsEl = document.getElementById('battle-stars');
  const btnBattleBase = document.getElementById('btn-battle-base');
  const battlePrepEl = document.getElementById('battle-prep');
  const battlePrepText = document.getElementById('battle-prep-text');
  const battlePrepSkip = document.getElementById('battle-prep-skip');
  const hudSector = document.getElementById('hud-sector');
  const lvlChip = document.getElementById('lvl-chip');
  const levelPill = document.getElementById('level-pill');
  const levelBadge = document.getElementById('level-badge');
  const levelsEl = document.getElementById('levels');
  const levelsGrid = document.getElementById('levels-grid');
  const levelsX = document.getElementById('levels-x');
  const chapterEl = document.getElementById('chapter');
  const chapterX = document.getElementById('chapter-x');
  const chapterPrev = document.getElementById('chapter-prev');
  const chapterNext = document.getElementById('chapter-next');
  const chapterTitle = document.getElementById('chapter-title');
  const chapterSub = document.getElementById('chapter-sub');
  const chapterGoals = document.getElementById('chapter-goals');
  const chapterReward = document.getElementById('chapter-reward');
  const chapterDone = document.getElementById('chapter-done');
  const chapterClaim = document.getElementById('chapter-claim');
  const chapterClaimBtn = document.getElementById('chapter-claim-btn');
  const chapterBtn = document.getElementById('chapter-btn');
  const xpLevel = document.getElementById('xp-level');
  const xpLabel = document.getElementById('xp-label');
  const xpBar = document.getElementById('xp-bar');
  const achBtn = document.getElementById('ach-btn');
  const achEl = document.getElementById('achievements');
  const achX = document.getElementById('ach-x');
  const achList = document.getElementById('ach-list');
  const achFooter = document.getElementById('ach-footer');
  const buildersChip = document.getElementById('builders-chip');
  const buildersChipCount = document.getElementById('builders-chip-count');
  const bpanel = document.getElementById('builders-panel');
  const bpanelCount = document.getElementById('bpanel-count');
  const bpanelList = document.getElementById('bpanel-list');
  const hireBtn = document.getElementById('hire-builder');
  const selNote = document.getElementById('sel-note');
  const selGoto = document.getElementById('sel-goto-th');
  const selGotoStorage = document.getElementById('sel-goto-storage');
  const questBar = document.getElementById('quest-bar');
  const questPanel = document.getElementById('quest-panel');
  const questText = document.getElementById('quest-text');
  const questProgressEl = document.getElementById('quest-progress');
  const questCount = document.getElementById('quest-count');
  const questList = document.getElementById('quest-list');
  // Панель Сержанта: портрет, текст шага и три кнопки.
  const sergeantEl = document.getElementById('sergeant');
  const sergeantStep = document.getElementById('sergeant-step');
  const sergeantText = document.getElementById('sergeant-text');
  const sergeantHint = document.getElementById('sergeant-hint');
  const sergeantGo = document.getElementById('sergeant-go');
  const sergeantNext = document.getElementById('sergeant-next');
  const sergeantSkip = document.getElementById('sergeant-skip');
  const tutPointer = document.getElementById('tut-pointer');
  // Вступительный лор: карточка с портретом, страницы и две кнопки.
  const loreEl = document.getElementById('sergeant-lore');
  const loreName = document.getElementById('lore-name');
  const loreStepEl = document.getElementById('lore-step');
  const loreText = document.getElementById('lore-text');
  const loreArtEl = document.getElementById('lore-art');
  const loreDots = document.getElementById('lore-dots');
  const loreNextBtn = document.getElementById('lore-next');
  const loreSkipBtn = document.getElementById('lore-skip');
  const soundBtn = document.getElementById('sound-btn');
  const musicBtn = document.getElementById('music-btn');
  const soundPopover = document.getElementById('sound-popover');
  const soundToggle = document.getElementById('sound-toggle');
  const volValue = document.getElementById('vol-value');
  const volMinus = document.getElementById('vol-minus');
  const volPlus = document.getElementById('vol-plus');
  const askEl = document.getElementById('ask');
  const askTextEl = document.getElementById('ask-text');
  const askOk = document.getElementById('ask-ok');
  const askCancel = document.getElementById('ask-cancel');

  const buildBtn = document.getElementById('build-btn');
  const buildHint = document.getElementById('build-hint');
  const battleBtn = document.getElementById('battle-btn');
  const btnRestart = document.getElementById('btn-restart');
  const btnFinish = document.getElementById('btn-finish');
  // Кнопка способности героя в бою: 40+ px, горячая клавиша Q.
  const heroShieldBtn = document.getElementById('hero-shield');

  // Арена (локальный PvP)
  const arenaBtn = document.getElementById('arena-btn');
  const arenaEl = document.getElementById('arena');
  const arenaX = document.getElementById('arena-x');
  const arenaList = document.getElementById('arena-list');
  const arenaRating = document.getElementById('arena-rating');
  const arenaWins = document.getElementById('arena-wins');
  const arenaLosses = document.getElementById('arena-losses');
  const arenaNote = document.getElementById('arena-note');
  const arenaFind = document.getElementById('arena-find');
  const arenaResult = document.getElementById('arena-result');
  const arenaResultTitle = document.getElementById('arena-result-title');
  const arenaResultText = document.getElementById('arena-result-text');
  const arenaResultLoot = document.getElementById('arena-result-loot');
  const arenaResultArmy = document.getElementById('arena-result-army');
  const arenaResultLost = document.getElementById('arena-result-lost');
  const arenaResultHint = document.getElementById('arena-result-hint');
  const btnArenaAgain = document.getElementById('btn-arena-again');
  const btnArenaBase = document.getElementById('btn-arena-base');

  const toastEl = document.getElementById('toast');
  const collectLayer = document.getElementById('collect-layer');
  const collectFxLayer = document.getElementById('collect-fx');
  const collectAllBtn = document.getElementById('collect-all');
  const dailyChip = document.getElementById('daily-chip');
  const dailyEl = document.getElementById('daily');
  const dailyX = document.getElementById('daily-x');
  const dailyStars = document.getElementById('daily-stars');
  const dailyText = document.getElementById('daily-text');
  const dailyReward = document.getElementById('daily-reward');
  const dailyHint = document.getElementById('daily-hint');
  const btnDailyClaim = document.getElementById('btn-daily-claim');
  const btnDailyClose = document.getElementById('btn-daily-close');
  const truceChip = document.getElementById('truce-chip');
  const truceText = document.getElementById('truce-text');
  const overlayReason = document.getElementById('overlay-reason');
  const overlayDaily = document.getElementById('overlay-daily');
  const arenaStars = document.getElementById('arena-stars');
  const arenaResultDaily = document.getElementById('arena-result-daily');
  const raidTruce = document.getElementById('raid-truce');

  // Карта кампании: узлы, карточка уровня и итог на эпоху.
  const mapScroll = document.getElementById('map-scroll');
  const mapCard = document.getElementById('map-card');
  const mapCardName = document.getElementById('map-card-name');
  const mapCardTh = document.getElementById('map-card-th');
  const mapCardChapter = document.getElementById('map-card-chapter');
  const mapCardLoot = document.getElementById('map-card-loot');
  const mapCardFree = document.getElementById('map-card-free');
  const mapCardBest = document.getElementById('map-card-best');
  const mapCardGo = document.getElementById('map-card-go');

  // Повторы набегов: чип в деревне, список и просмотр боя.
  const replayChip = document.getElementById('replay-chip');
  const replaysEl = document.getElementById('replays');
  const replaysX = document.getElementById('replays-x');
  const replayList = document.getElementById('replay-list');
  const replaysEmpty = document.getElementById('replays-empty');
  const btnRaidReplays = document.getElementById('btn-raid-replays');
  const replayBanner = document.getElementById('replay-banner');
  const replaySpeed1 = document.getElementById('replay-speed-1');
  const replaySpeed2 = document.getElementById('replay-speed-2');
  const replayClose = document.getElementById('replay-close');
  const replayEnd = document.getElementById('replay-end');
  const replayEndTitle = document.getElementById('replay-end-title');
  const replayEndText = document.getElementById('replay-end-text');
  const replayStars = document.getElementById('replay-stars');
  const replayExit = document.getElementById('replay-exit');

  // Покупка ресурсов и платины из панелей HUD.
  const buyResEl = document.getElementById('buyres');
  const buyResTitle = document.getElementById('buyres-title');
  const buyResRate = document.getElementById('buyres-rate');
  const buyResGrid = document.getElementById('buyres-grid');
  const buyResNote = document.getElementById('buyres-note');
  const buyResX = document.getElementById('buyres-x');
  const buyResPrev = document.getElementById('buyres-prev');
  const buyResNext = document.getElementById('buyres-next');
  const buyResTopup = document.getElementById('buyres-topup');
  const buyPlatEl = document.getElementById('buyplat');
  const buyPlatGrid = document.getElementById('buyplat-grid');
  const buyPlatNote = document.getElementById('buyplat-note');
  const buyPlatX = document.getElementById('buyplat-x');

  const cards = {};
  const cache = {};
  // Иконки сбора: пул элементов по id постройки, чтобы не пересоздавать DOM.
  const collectNodes = {};

  let lastMode = null;
  let overlayShown = false;
  let offlineShown = false;
  let buildersOpen = false;
  let questOpen = false;
  let shopOpen = false;
  let shopCat = 'all';
  let buyResOpen = false;
  let buyPlatOpen = false;
  let buyResKind = 'gold';   // какой ресурс открыт в окне покупки
  let buyResNoteText = '';   // сообщение после покупки (без баланса)
  let buyResNoteKind = '';   // short / full / partial / error — для data-note
  let levelsOpen = false;
  let achOpen = false;
  let drag = null;
  let toastTimer = null;
  let hoverAt = null;
  // Подсказка-задание: закрытая крестиком не возвращается до смены шага.
  let tipStep = null;
  let tipClosedStep = null;
  let sergeantMore = false;       // «Далее» раскрывает подробную подсказку
  let sergeantHintStep = null;    // для какого шага уже настроена панель
  let loreOpen = false;           // вступительный лор сейчас на экране
  let lorePage = 0;               // текущая страница лора (0..3)
  let hangarHintStep = null;      // шаг, для которого показан совет об очереди
  let introDone = false;      // инструкция первого боя показана
  let introNeedsPos = false;  // позицию считаем после смены data-mode
  let trainAfterBattle = false; // в окне результата армия пуста
  let retryReadyAt = 0;
  let raidShown = false;
  let raidShownAt = 0;
  let askState = null;
  let arenaOpen = false;
  let arenaTargets = [];
  let arenaFindReadyAt = 0;
  let pvpTarget = null;
  let questGoal = null; // следующий центр после всех заданий
  let dailyOpen = false;
  let mapSelected = null;      // индекс уровня, открытого в карточке карты
  let chapterOpen = false;
  let chapterIndex = 0;
  let recruitOpen = false;
  let replaysOpen = false;
  let replayRecord = null;     // запись, которую сейчас смотрим
  let replayEndShown = false;

  const DRAG_PX = 9; // порог «это тап, а не перетаскивание»

  /* состояние строительства — его читает рендер.
     buildMode — включён режим «Постройки» (сетка и перестановка),
     dragId — id постройки, которую сейчас тащат. */
  const state = {
    armed: null, selected: null, buildMode: false, dragId: null,
    // Выбранная карточка в карусели ангара: подсвечиваем, но найм не блокируем.
    trainSel: null
  };

  /* ---------- запуск ---------- */

  let hudPanelsBound = false;

  // Клики по панелям ресурсов и окнам покупки. Вынесено из init(), чтобы
  // тесты могли подключить только эти обработчики без сборки HUD боя.
  function bindHudPanels() {
    if (hudPanelsBound) return;
    hudPanelsBound = true;

    if (resGoldPanel) {
      resGoldPanel.addEventListener('click', function () { openBuyResource('gold'); });
    }
    if (resElixirPanel) {
      resElixirPanel.addEventListener('click', function () { openBuyResource('elixir'); });
    }
    if (resGemsPanel) {
      resGemsPanel.addEventListener('click', function () { openBuyPlatinum(); });
    }

    if (buyResX) {
      buyResX.addEventListener('click', function () { closeBuyResource(); sync(); });
    }
    if (buyResEl) {
      buyResEl.addEventListener('click', function (e) {
        if (e.target === buyResEl) { closeBuyResource(); sync(); }
      });
    }
    if (buyResGrid) buyResGrid.addEventListener('click', onBuyResClick);
    if (buyResPrev) buyResPrev.addEventListener('click', function () { scrollCarousel(buyResGrid, -1); });
    if (buyResNext) buyResNext.addEventListener('click', function () { scrollCarousel(buyResGrid, 1); });
    if (buyResTopup) {
      buyResTopup.addEventListener('click', function () { openBuyPlatinum(); });
    }
    if (buyPlatX) {
      buyPlatX.addEventListener('click', function () { closeBuyPlatinum(); sync(); });
    }
    if (buyPlatEl) {
      buyPlatEl.addEventListener('click', function (e) {
        if (e.target === buyPlatEl) { closeBuyPlatinum(); sync(); }
      });
    }
    if (buyPlatGrid) buyPlatGrid.addEventListener('click', onBuyPlatClick);
  }

  function init() {
    buildArmy();
    bindHudPanels();

    if (CC.Sound) {
      document.addEventListener('pointerdown', function () { CC.Sound.unlock(); }, true);
      document.addEventListener('keydown', function () { CC.Sound.unlock(); }, true);

      app.addEventListener('click', function (e) {
        if (e.target.closest('button')) CC.Sound.play('ui');
      });

      if (soundBtn) {
        soundBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          CC.Sound.unlock();
          const open = soundPopover ? soundPopover.classList.contains('hidden') : false;
          if (soundPopover) soundPopover.classList.toggle('hidden', !open);
          if (open) positionSoundPopover();
          if (soundBtn.setAttribute) soundBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          syncSound();
        });
      }

      if (soundToggle) {
        soundToggle.addEventListener('click', function (e) {
          e.stopPropagation();
          CC.Sound.unlock();
          CC.Sound.setEnabled(!CC.Sound.isEnabled());
          if (CC.Sound.isEnabled()) CC.Sound.play('ui');
          syncSound();
        });
      }

      if (musicBtn) {
        musicBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          CC.Sound.unlock();
          CC.Sound.setMusicEnabled(!CC.Sound.isMusicEnabled());
          if (CC.Sound.isEnabled()) CC.Sound.play('ui');
          syncSound();
        });
      }

      document.addEventListener('click', function (e) {
        if (!soundPopover || soundPopover.classList.contains('hidden')) return;
        if (e.target.closest && e.target.closest('#audio-panel')) return;
        soundPopover.classList.add('hidden');
        if (soundBtn.setAttribute) soundBtn.setAttribute('aria-expanded', 'false');
      });

      if (volMinus) {
        volMinus.addEventListener('click', function (e) {
          e.stopPropagation();
          changeVolume(-0.1);
        });
      }

      if (volPlus) {
        volPlus.addEventListener('click', function (e) {
          e.stopPropagation();
          changeVolume(0.1);
        });
      }

      syncSound();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('blur', function () {
      pointers.clear();
      tapInfo = null;
      pinchInfo = null;
      suppressTap = false;
      if (drag) dragCancel();
      updateCursor();
    });

    window.addEventListener('resize', function () {
      if (CC.App.mode === 'battle' && battleIntro &&
        !battleIntro.classList.contains('hidden')) {
        positionBattleIntro();
      }
      if (soundPopover && !soundPopover.classList.contains('hidden')) {
        positionSoundPopover();
      }
    });

    const zoomBar = document.getElementById('zoom-bar');
    if (zoomBar) zoomBar.addEventListener('click', onZoomClick);

    document.querySelectorAll('.mode').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // «В БОЙ» больше не запускает бой сразу: открываем карту прохождения.
        if (btn.id === 'battle-btn') onBattleButton();
        else setMode(btn.dataset.mode);
      });
    });

    if (buildBtn) {
      buildBtn.addEventListener('click', function () {
        setBuildMode(!state.buildMode);
      });
    }

    if (shopBtn) {
      shopBtn.addEventListener('click', function () {
        openShop();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        cancelArm();
        sync();
      });
    }
    if (shopX) {
      shopX.addEventListener('click', function () {
        closeShop();
        sync();
      });
    }
    if (shopEl) {
      shopEl.addEventListener('click', function (e) {
        if (e.target === shopEl) {
          closeShop();
          sync();
        }
      });
    }
    if (shopGrid) shopGrid.addEventListener('click', onShopClick);
    if (shopCats) {
      shopCats.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-shop-cat]');
        if (!btn) return;
        shopCat = btn.dataset.shopCat;
        cache.shopSig = null;
        resetShopScroll();
        syncShop();
      });
    }

    if (levelBadge) levelBadge.addEventListener('click', openLevels);
    if (lvlChip) lvlChip.addEventListener('click', openLevels);
    if (levelsX) levelsX.addEventListener('click', closeLevels);
    if (levelsGrid) levelsGrid.addEventListener('click', onLevelsClick);

    // Глава кампании: стрелки ‹ ›, цели и возврат на карту.
    if (chapterBtn) {
      chapterBtn.addEventListener('click', function () {
        const era = mapSelected === null ? Math.floor(CC.Game.currentLevel() / 10)
          : Math.floor(mapSelected / 10);
        openChapter(era);
      });
    }
    if (chapterX) chapterX.addEventListener('click', closeChapter);
    if (chapterPrev) {
      chapterPrev.addEventListener('click', function () {
        if (chapterIndex <= 0) return;
        chapterIndex--;
        syncChapter();
      });
    }
    if (chapterNext) {
      chapterNext.addEventListener('click', function () {
        if (chapterIndex >= 4) return;
        chapterIndex++;
        syncChapter();
      });
    }
    if (chapterGoals) {
      chapterGoals.addEventListener('click', function (e) {
        const go = e.target.closest('[data-chapter-go]');
        if (!go || go.disabled) return;
        const target = go.getAttribute('data-chapter-go');
        if (target === '') return;
        chapterGo(Number(target));
      });
    }
    if (chapterClaimBtn) {
      chapterClaimBtn.addEventListener('click', function () {
        claimChapter();
      });
    }
    if (chapterEl) {
      chapterEl.addEventListener('click', function (e) {
        if (e.target === chapterEl) closeChapter();
      });
    }

    // Окно найма: выбор войска, найм, ×N, отмена из мини-очереди.
    if (recruitX) recruitX.addEventListener('click', function () { closeRecruit(); sync(); });
    if (recruitEl) {
      recruitEl.addEventListener('click', function (e) {
        if (e.target === recruitEl) { closeRecruit(); sync(); return; }
        onRecruitClick(e);
      });
    }
    if (hangarRecruitBtn) {
      hangarRecruitBtn.addEventListener('click', function () { openRecruit(); });
    }
    if (mapCard) {
      mapCard.addEventListener('click', function (e) {
        const go = e.target.closest('[data-map-go]');
        if (!go) return;
        e.preventDefault();
        attackMapLevel(mapSelected);
      });
    }
    if (replayChip) replayChip.addEventListener('click', openReplays);
    if (replaysX) replaysX.addEventListener('click', closeReplays);
    if (replaysEl) {
      replaysEl.addEventListener('click', function (e) {
        if (e.target === replaysEl) closeReplays();
      });
    }
    if (replayList) replayList.addEventListener('click', onReplayListClick);
    if (btnRaidReplays) {
      btnRaidReplays.addEventListener('click', function () {
        if (CC.Game.claimRaid) CC.Game.claimRaid();
        raidShown = false;
        raidShownAt = 0;
        if (raidEl) raidEl.classList.add('hidden');
        openReplays();
      });
    }
    if (replayClose) replayClose.addEventListener('click', closeReplayScreen);
    if (replayExit) replayExit.addEventListener('click', closeReplayScreen);
    if (replaySpeed1) {
      replaySpeed1.addEventListener('click', function () { setReplaySpeed(1); });
    }
    if (replaySpeed2) {
      replaySpeed2.addEventListener('click', function () { setReplaySpeed(2); });
    }
    if (achBtn) achBtn.addEventListener('click', openAchievements);
    if (achX) achX.addEventListener('click', closeAchievements);
    if (achList) achList.addEventListener('click', onAchievementsClick);
    if (achEl) {
      achEl.addEventListener('click', function (e) {
        if (e.target === achEl) closeAchievements();
      });
    }
    if (levelsEl) {
      levelsEl.addEventListener('click', function (e) {
        if (e.target === levelsEl) closeLevels();
      });
    }

    // Арена: карточки соперников, поиск других, финал боя.
    if (arenaBtn) arenaBtn.addEventListener('click', openArena);
    if (arenaX) arenaX.addEventListener('click', closeArena);
    if (arenaEl) {
      arenaEl.addEventListener('click', function (e) {
        if (e.target === arenaEl) closeArena();
      });
    }
    if (arenaList) arenaList.addEventListener('click', onArenaClick);
    if (arenaFind) {
      arenaFind.addEventListener('click', function () {
        findOtherArena();
      });
    }
    if (btnArenaAgain) {
      btnArenaAgain.addEventListener('click', function () {
        arenaAgain();
      });
    }
    if (btnArenaBase) {
      btnArenaBase.addEventListener('click', function () {
        arenaResult.classList.add('hidden');
        overlayShown = false;
        setMode('base');
      });
    }

    // свой модал подтверждения: кнопки и клик по подложке
    if (askOk) {
      askOk.addEventListener('click', function () {
        askClose(true);
      });
    }
    if (askCancel) {
      askCancel.addEventListener('click', function () {
        askClose(false);
      });
    }
    if (askEl) {
      askEl.addEventListener('click', function (e) {
        if (e.target === askEl) askClose(false);
      });
    }

    // Ежедневный контракт: чип в верхней зоне и окно с наградой.
    if (dailyChip) {
      dailyChip.addEventListener('click', function () {
        openDaily();
      });
    }
    if (dailyX) {
      dailyX.addEventListener('click', function () {
        closeDaily();
        sync();
      });
    }
    if (btnDailyClose) {
      btnDailyClose.addEventListener('click', function () {
        closeDaily();
        sync();
      });
    }
    if (btnDailyClaim) {
      btnDailyClaim.addEventListener('click', function () {
        claimDaily();
      });
    }
    if (dailyEl) {
      dailyEl.addEventListener('click', function (e) {
        if (e.target === dailyEl) {
          closeDaily();
          sync();
        }
      });
    }
    if (collectAllBtn) {
      collectAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        collectAllNow();
      });
    }

    document.addEventListener('keydown', onKeyDown);

    selbar.addEventListener('click', onSelbarClick);
    if (shopPrev) shopPrev.addEventListener('click', function () { scrollCarousel(shopGrid, -1); });
    if (shopNext) shopNext.addEventListener('click', function () { scrollCarousel(shopGrid, 1); });
    if (shopGrid) shopGrid.addEventListener('keydown', onCarouselKey);
    buildersChip.addEventListener('click', function () {
      if (buildersOpen) closeBuilders();
      else openBuilders();
    });
    bpanel.addEventListener('click', onBuildersClick);
    questBar.addEventListener('click', function () {
      if (questOpen) closeQuests();
      else if (questGoal) questAction('nextTh');
      else openQuests();
    });
    questPanel.addEventListener('click', function (e) {
      const go = e.target.closest('[data-quest-go]');
      if (go) {
        const id = go.dataset.questGo;
        closeQuests();
        questAction(id);
        return;
      }

      const btn = e.target.closest('[data-quest]');
      if (!btn) return;
      closeQuests();
      sync();
    });

    if (sergeantGo) {
      sergeantGo.addEventListener('click', function (e) {
        e.preventDefault();
        sergeantPrimary();
      });
    }
    if (sergeantNext) {
      sergeantNext.addEventListener('click', function (e) {
        e.preventDefault();
        sergeantMore = !sergeantMore;
        syncSergeant();
      });
    }
    if (sergeantSkip) {
      sergeantSkip.addEventListener('click', function (e) {
        e.preventDefault();
        const res = CC.Game.skipTutorial ? CC.Game.skipTutorial() : { ok: false };
        if (res.ok) {
          toast('Обучение пропущено · +' + fmtNum(res.gold) + ' руды и +' +
            fmtNum(res.elixir) + ' энергии');
          if (CC.Sound) CC.Sound.play('questDone');
        }
        sync();
      });
    }

    if (loreNextBtn) {
      loreNextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        loreNext();
      });
    }
    if (loreSkipBtn) {
      loreSkipBtn.addEventListener('click', function (e) {
        e.preventDefault();
        finishLore();
      });
    }

    if (tipX) {
      tipX.addEventListener('click', function (e) {
        e.stopPropagation();
        closeQuestHint();
      });
    }

    if (btnRestart) btnRestart.addEventListener('click', restartBattle);
    if (btnFinish) btnFinish.addEventListener('click', finishBattleNow);
    if (btnBattleBase) btnBattleBase.addEventListener('click', function () { setMode('base'); });
    if (battlePrepSkip) {
      battlePrepSkip.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        skipBattlePrep();
      });
    }
    if (heroShieldBtn) {
      heroShieldBtn.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        heroAbility();
      });
    }
    btnAgain.addEventListener('click', battleAgain);
    document.getElementById('btn-tobase').addEventListener('click', function () {
      setMode('base');
    });
    btnOffline.addEventListener('click', function () {
      CC.Game.claimOffline();
      offlineShown = false;
      offlineEl.classList.add('hidden');
    });
    if (btnRaidOk) {
      btnRaidOk.addEventListener('click', function () {
        CC.Game.claimRaid();
        raidShown = false;
        raidShownAt = 0;
        raidEl.classList.add('hidden');
      });
    }

    if (btnTabTake) {
      btnTabTake.addEventListener('click', function () {
        if (CC.TabGuard) {
          CC.TabGuard.resume();
          CC.TabGuard.claim();
        }
        CC.App.storagePaused = false;
        // Перезагрузка заново заявит вкладку лидером и снимет паузу.
        try {
          window.location.reload();
        } catch (e) {
          // Если перезагрузка недоступна, хотя бы возвращаем управление.
          hideTabLock();
          sync();
        }
      });
    }

    if (collectLayer) {
      // Клик по иконке не доходит до canvas: панель не открывается,
      // перетаскивание не начинается.
      collectLayer.addEventListener('pointerdown', function (e) {
        if (e.target.closest('[data-collect]')) e.stopPropagation();
      });
      collectLayer.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-collect]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        collectBuilding(Number(btn.dataset.collect));
      });
    }

    setMode('base');
  }

  function armyTotal() {
    const a = CC.Game.armySnapshot();
    let n = 0;
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) n += a[CC.ARMY_ORDER[i]];
    return n;
  }

  // Уровень, выбранный для боя. Он отделён от прогресса: реплей старого
  // уровня не откатывает currentLevel().
  function chosenLevel() {
    if (CC.Game.selectedLevel) return CC.Game.selectedLevel();
    return CC.Game.currentLevel();
  }

  function setMode(mode) {
    if (mode === CC.App.mode && lastMode === mode) return;

    if (mode === 'battle') {
      if (armyTotal() <= 0) {
        toast('Сначала найми войска в ангаре');
        openHangar();
        return;
      }
    }

    // уходим с поля боя — невысаженные войска возвращаются в деревню
    if (mode === 'base' && CC.App.mode === 'battle' && CC.Battle.state) {
      CC.Battle.syncArmy();
      // Следующий выход из деревни начинает прогресс, а не реплей.
      if (CC.Game.resetSelected) CC.Game.resetSelected();
      CC.Game.save();
    }

    CC.App.mode = mode;
    if (CC.Sound && CC.Sound.setMode) CC.Sound.setMode(mode);
    if (drag) dragCancel();
    state.armed = null;
    state.selected = null;
    // в бой уходим без режима построек: там сетка и перетаскивание не нужны
    state.buildMode = false;
    state.dragId = null;
    closeBuilders();
    closeShop();
    closeLevels();
    closeArena();
    closeDaily();
    closeReplays();
    if (replayBanner) replayBanner.classList.add('hidden');
    if (replayEnd) replayEnd.classList.add('hidden');
    if (app) app.classList.remove('is-replay');
    replayRecord = null;
    replayEndShown = false;
    CC.App.replaySpeed = 1;
    if (arenaResult) arenaResult.classList.add('hidden');
    questOpen = false;
    questPanel.classList.add('hidden');
    hoverAt = null;

    if (mode === 'battle') {
      overlayShown = false;
      overlayEl.classList.add('hidden');
      // Первый вход в бой закрывает шаг «В бой» и не откатывается назад.
      if (CC.Game.markBattleStarted) CC.Game.markBattleStarted();
      CC.Battle.reset(chosenLevel());
      retryReadyAt = Date.now() + 2000;
      cache.pct = cache.time = cache.level = null;
      Object.keys(cache).forEach(function (k) {
        if (k !== 'pct' && k !== 'time' && k !== 'level') delete cache[k];
      });
      const lvl = CC.LEVELS[chosenLevel()];
      // Во время обучения вместо подсказки сектора объясняем высадку и цель.
      const tut = CC.Game.tutorial ? CC.Game.tutorial() : null;
      const lesson = tut && tut.active &&
        (tut.goal === 'battle' || tut.goal === 'level1') ? tut.hint : '';
      showTip(lesson || (lvl && lvl.hint) ||
        'Выбери войско внизу и тапни по любой свободной клетке');
    } else {
      // вернулись в деревню — окно результата боя больше не нужно
      overlayShown = false;
      overlayEl.classList.add('hidden');
      hideBattleIntro();
      CC.Base.save();
      CC.Game.tick(Date.now());
      CC.Game.save();
      // подсказка деревни теперь живёт по активному заданию (syncBaseTip)
    }

    if (CC.CamFocus) CC.CamFocus(true);
    sync();
  }

  /* ---------- ресурсы ---------- */

  function syncRes() {
    const gold = CC.Game.gold();
    const elixir = CC.Game.elixir();
    const gcap = Math.round(CC.Game.cap('gold'));
    const ecap = Math.round(CC.Game.cap('elixir'));

    if (cache.gold !== gold) {
      resGold.textContent = gold;
      cache.gold = gold;
    }
    if (cache.gcap !== gcap) {
      resGoldCap.textContent = gcap > 0 ? 'из ' + gcap : 'нет склада';
      cache.gcap = gcap;
    }
    if (cache.elixir !== elixir) {
      resElixir.textContent = elixir;
      cache.elixir = elixir;
    }
    if (cache.ecap !== ecap) {
      resElixirCap.textContent = ecap > 0 ? 'из ' + ecap : 'нет склада';
      cache.ecap = ecap;
    }

    const gp = gcap > 0 ? Math.min(100, gold / gcap * 100) : 0;
    const ep = ecap > 0 ? Math.min(100, elixir / ecap * 100) : 0;

    const gs = gp.toFixed(0) + '%';
    if (cache.gfill !== gs) {
      resGoldBar.style.width = gs;
      cache.gfill = gs;
    }
    const es = ep.toFixed(0) + '%';
    if (cache.efill !== es) {
      resElixirBar.style.width = es;
      cache.efill = es;
    }

    if (resGems) {
      const gems = CC.Game.gems();
      if (cache.gems !== gems) {
        resGems.textContent = String(gems);
        cache.gems = gems;
      }
    }
  }

  /* ---------- иконки сбора над бурами и реакторами ---------- */

  const COLLECT_SIZE = 40; // хитбокс не меньше 40 px, как все кнопки
  const COLLECT_MIN_VISUAL = 28; // на максимальном отдалении иконка меньше
  const COLLECT_MAX_VISUAL = 40; // но не крупнее хитбокса
  // Иконка висит над зданием: половина тайла по высоте. Экранная точка
  // здания — единственный источник позиции, поэтому при панораме и зуме
  // иконка не «отклеивается».
  const COLLECT_ANCHOR_LIFT = 0.5;
  // Максимальный сдвиг при пересечении с соседней иконкой — половина
  // иконки (20 px). Дальше не разносим по экрану, а скрываем лишнюю.
  const COLLECT_SHIFT_MAX = COLLECT_SIZE / 2;

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  // Прозрачность по заполнению: пустой бур почти прозрачный, полный — нет.
  function collectOpacity(amount, cap) {
    const a = Math.max(0, Number(amount) || 0);
    const c = Math.max(1e-6, Number(cap) || 0);
    return 0.35 + 0.65 * clamp01(a / c);
  }

  // Визуальный размер иконки следует за зумом камеры: при отдалении меньше,
  // чтобы не закрывать постройки. Хитбокс при этом всегда остаётся 40 px.
  function collectIconSize(scale) {
    const s = Number(scale) > 0 ? Number(scale) : 1;
    const tile = (CC.TW || 54) * s;
    return Math.round(Math.min(COLLECT_MAX_VISUAL,
      Math.max(COLLECT_MIN_VISUAL, tile * 0.55)));
  }

  // Иконки прячутся в режиме построек и под окнами, чтобы не мешать
  // перетаскиванию и не перекрывать панели.
  function collectHidden() {
    if (CC.App.mode !== 'base') return true;
    if (state.buildMode || state.armed || drag) return true;
    if (shopOpen || levelsOpen || achOpen || buildersOpen || questOpen || askState) return true;
    if (dailyOpen) return true;
    if (offlineEl && !offlineEl.classList.contains('hidden')) return true;
    if (raidEl && !raidEl.classList.contains('hidden')) return true;
    return false;
  }

  // Раскладка иконок: позиция — экранная точка постройки. Никаких полос
  // HUD и спиралей: если якорь ушёл под панель или за край, иконка
  // скрывается. Сдвиг разрешён только на 20 px (половина иконки), чтобы
  // развести соседей; если и это не помогло — лишняя иконка скрывается.
  function collectLayout(spots, view, obstacles) {
    const v = view || {};
    const W = Math.max(1, v.w || 1);
    const H = Math.max(1, v.h || 1);
    const half = COLLECT_SIZE / 2;
    const obs = obstacles || [];

    function pointBlocked(x, y) {
      for (let i = 0; i < obs.length; i++) {
        const r = obs[i];
        if (x >= r.x - 2 && x <= r.x + r.w + 2 &&
            y >= r.y - 2 && y <= r.y + r.h + 2) return true;
      }
      return false;
    }

    function boxBlocked(x, y) {
      if (x - half < 0 || y - half < 0 || x + half > W || y + half > H) return true;
      for (let i = 0; i < obs.length; i++) {
        const r = obs[i];
        if (x + half > r.x - 2 && x - half < r.x + r.w + 2 &&
            y + half > r.y - 2 && y - half < r.y + r.h + 2) return true;
      }
      return false;
    }

    function intersectsOut(x, y) {
      for (let i = 0; i < out.length; i++) {
        if (Math.abs(out[i].x - x) < COLLECT_MIN_VISUAL &&
            Math.abs(out[i].y - y) < COLLECT_MIN_VISUAL) return true;
      }
      return false;
    }

    // Кандидаты на минимальный сдвиг: сначала вверх, затем по кругу.
    const offsets = [{ dx: 0, dy: 0 }];
    for (let r = 4; r <= COLLECT_SHIFT_MAX; r += 4) {
      for (let a = 0; a < 8; a++) {
        const ang = -Math.PI / 2 + a * Math.PI / 4;
        offsets.push({ dx: Math.cos(ang) * r, dy: Math.sin(ang) * r });
      }
    }

    const out = [];
    const sorted = (spots || []).slice().sort(function (a, b) {
      return (a.y - b.y) || (a.x - b.x) || (a.id - b.id);
    });

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];

      // Якорь под HUD/за краем — иконку не переносим, а прячем.
      if (pointBlocked(s.x, s.y) || boxBlocked(s.x, s.y)) continue;

      let spot = null;
      for (let k = 0; k < offsets.length && !spot; k++) {
        const x = s.x + offsets[k].dx;
        const y = s.y + offsets[k].dy;
        if (boxBlocked(x, y)) continue;
        if (!intersectsOut(x, y)) spot = { x: x, y: y };
      }

      if (spot) out.push({ id: s.id, x: spot.x, y: spot.y });
    }

    return out;
  }

  // Реальные прямоугольники HUD: так иконки не залезают под панели
  // ресурсов, задания, зум и нижнюю строку. Без DOM — пустой список.
  // Кешируем на 15 кадров: getBoundingClientRect каждый кадр — лишний reflow.
  let obstacleCache = null;
  let obstacleFrame = 0;

  function collectObstacles() {
    obstacleFrame++;
    if (obstacleCache && obstacleFrame % 15 !== 1) return obstacleCache;

    const out = [];
    if (!document.querySelector) {
      obstacleCache = out;
      return out;
    }

    const sels = ['.hud-tl', '.hud-tc', '.resbar', '.collect-all', '.quest-bar',
      '.bottom-bar', '.zoom', '.selbar', '.tip'];

    sels.forEach(function (sel) {
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch (e) {
        el = null;
      }
      if (!el || !el.getBoundingClientRect) return;

      const r = el.getBoundingClientRect();
      if (!r || !(r.width > 1) || !(r.height > 1)) return;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    });

    obstacleCache = out;
    return out;
  }

  function collectNode(id) {
    let el = collectNodes[id];
    if (el) return el;
    if (!collectLayer || !document.createElement) return null;

    el = document.createElement('button');
    el.type = 'button';
    el.className = 'collect';
    el.dataset.collect = String(id);

    const icon = document.createElement('span');
    icon.className = 'collect__icon';
    const count = document.createElement('span');
    count.className = 'collect__count';

    el.appendChild(icon);
    el.appendChild(count);
    el.__icon = icon;
    el.__count = count;

    collectLayer.appendChild(el);
    collectNodes[id] = el;
    return el;
  }

  function collectAnchor(it) {
    if (!CC.Cam) return { id: it.id, x: 0, y: 0 };
    const c = screenOf(it.x + it.w / 2, it.y + it.h / 2);
    const scale = CC.Cam.scale || 1;
    return { id: it.id, x: c.x, y: c.y - (CC.TH || 27) * COLLECT_ANCHOR_LIFT * scale };
  }

  // Каждый кадр: иконки следуют за камерой и показывают живое накопление.
  function syncCollect() {
    if (!collectLayer) return;

    if (collectHidden()) {
      collectLayer.classList.add('hidden');
      return;
    }

    collectLayer.classList.remove('hidden');

    const list = (CC.Game.extractors ? CC.Game.extractors() : []).filter(function (info) {
      // Пустой накопитель не рисуем: собирать нечего, а иконка мешает.
      return (Number(info.amount) || 0) >= 0.5;
    });
    const anchors = list.map(collectAnchor);
    const view = {
      w: (CC.Cam && CC.Cam.w) || 1024,
      h: (CC.Cam && CC.Cam.h) || 768
    };
    const spots = collectLayout(anchors, view, collectObstacles());

    const seen = {};

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const info = list.find(function (o) { return o.id === spot.id; });
      if (!info) continue;

      const el = collectNode(spot.id);
      if (!el) continue;

      seen[spot.id] = 1;
      el.classList.remove('hidden');
      el.style.left = spot.x + 'px';
      el.style.top = spot.y + 'px';
      el.classList.toggle('is-full', !!info.full);
      el.dataset.type = info.type;
      el.dataset.res = info.res;

      if (el.__icon) el.__icon.textContent = info.res === 'gold' ? '🔩' : '⚡';
      if (el.__count) el.__count.textContent = String(Math.floor(info.amount));

      // Прозрачность и размер считаются каждый кадр: сбор мог измениться,
      // камера могла уехать. Хитбокс 40 px не меняется — меняется только
      // внутренняя иконка.
      const fill = collectOpacity(info.amount, info.cap);
      el.style.opacity = fill.toFixed(3);

      const size = collectIconSize(CC.Cam && CC.Cam.scale);
      if (el.__icon) {
        el.__icon.style.width = size + 'px';
        el.__icon.style.height = size + 'px';
        el.__icon.style.fontSize = Math.round(size * 0.55) + 'px';
      }
      if (el.__count) {
        el.__count.style.fontSize = Math.max(8, Math.round(size * 0.25)) + 'px';
      }
      el.dataset.size = String(size);

      const label = (info.res === 'gold' ? 'Руда' : 'Энергия') +
        ': ' + Math.floor(info.amount) + ' из ' + Math.round(info.cap);
      el.title = info.full
        ? label + ' · полон, забери'
        : label + ' · тапни, чтобы забрать';
      if (el.setAttribute) el.setAttribute('aria-label', el.title);
    }

    Object.keys(collectNodes).forEach(function (id) {
      if (!seen[id]) collectNodes[id].classList.add('hidden');
    });
  }

  // Тап по иконке: забираем из буфера, буфер при этом не теряется.
  function collectBuilding(id) {
    const res = CC.Game.collect(id);

    if (res.error) {
      toast(res.error);
      if (CC.Sound) CC.Sound.play('lootLost');
    } else if (res.got > 0) {
      if (CC.Sound) CC.Sound.play('questDone');
      toast('+' + Math.floor(res.got) +
        (res.res === 'gold' ? ' руды' : ' энергии') +
        (res.left > 0.5 ? ' · осталось ' + Math.floor(res.left) : ''));
      // Иконка ещё на месте: снимаем стартовую точку до sync().
      playCollectFx([{ id: id, res: res.res, amount: res.got }]);
    }

    cache.selStats = null;
    sync();
    return res;
  }

  // «Собрать всё»: кнопка появляется, когда есть хотя бы один непустой бур.
  function collectAllNow() {
    // Снимок источников до сбора: из них летят частицы к панелям.
    const sources = CC.Game.extractors ? CC.Game.extractors() : [];
    const res = CC.Game.collectAll ? CC.Game.collectAll() : { error: 'Собирать нечего' };

    if (res.error) {
      toast(res.error);
      if (CC.Sound) CC.Sound.play('lootLost');
      sync();
      return res;
    }

    const parts = [];
    if (res.gold > 0) parts.push('+' + fmtNum(res.gold) + ' руды');
    if (res.elixir > 0) parts.push('+' + fmtNum(res.elixir) + ' энергии');

    let text = parts.length ? parts.join(' · ') : 'Склад полон — некуда девать';
    if (res.left > 1) {
      text += (parts.length ? ' · ' : '') + 'осталось ' + fmtNum(res.left);
    }

    toast(text);
    if (CC.Sound) CC.Sound.play(parts.length ? 'questDone' : 'lootLost');

    if (res.got > 0) {
      // Иконки ещё не пересобраны: sync() ниже скроет опустевшие.
      playCollectFx(sources.map(function (it) {
        return { id: it.id, res: it.res, amount: it.amount };
      }));
    }

    cache.selStats = null;
    sync();
    return res;
  }

  function syncCollectAll() {
    if (!collectAllBtn) return;

    const list = CC.Game.extractors ? CC.Game.extractors() : [];
    const show = list.length > 0 && !collectHidden();
    collectAllBtn.classList.toggle('hidden', !show);
    if (!show) return;

    let gold = 0;
    let elixir = 0;
    let full = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].res === 'gold') gold += list[i].amount;
      else elixir += list[i].amount;
      if (list[i].full) full = true;
    }

    const text = 'Собрать всё';
    if (collectAllBtn.textContent !== text) collectAllBtn.textContent = text;
    collectAllBtn.classList.toggle('is-full', full);

    const parts = [];
    if (gold >= 1) parts.push(fmtNum(gold) + ' руды');
    if (elixir >= 1) parts.push(fmtNum(elixir) + ' энергии');
    const title = 'Собрать всё: ' + (parts.length ? parts.join(', ') : 'пусто') +
      (full ? ' · часть буферов полна' : '');
    if (collectAllBtn.title !== title) collectAllBtn.title = title;
  }

  /* ---------- анимация сбора: полёт ресурса и пульс значения ---------- */

  const FX_MAX = 12;       // больше 12 элементов за раз не создаём
  const FX_DUR_MIN = 340;  // полёт 340–460 мс, пульс — сразу после прилёта
  const FX_DUR_MAX = 460;

  // prefers-reduced-motion: полёт выключаем, но обратную связь оставляем.
  function reducedMotion() {
    try {
      return !!(typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function fxVar(el, name, value) {
    if (!el || !el.style) return;
    if (el.style.setProperty) el.style.setProperty(name, value);
    else el.style[name] = value;
  }

  function removeFxNode(el) {
    if (!el) return;
    if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
    else if (el.remove) el.remove();
  }

  // Старт — центр иконки бура: те же координаты, что двигает syncCollect.
  function fxFrom(id) {
    const el = collectNodes[id];
    if (!el) return null;

    const x = parseFloat(el.style && el.style.left);
    const y = parseFloat(el.style && el.style.top);
    if (isFinite(x) && isFinite(y)) return { x: x, y: y };

    if (el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }

  // Финиш — центр панели ресурсов в координатах слоя частиц.
  function fxTo(res) {
    let x = (typeof window !== 'undefined' && window.innerWidth)
      ? window.innerWidth - 75 : 320;
    let y = 64;

    const valueEl = res === 'gold' ? resGold : resElixir;
    if (!valueEl) return { x: x, y: y };

    let panel = null;
    if (valueEl.closest) {
      try { panel = valueEl.closest('.res-panel'); } catch (e) { panel = null; }
    }
    const host = panel || valueEl;
    if (host.getBoundingClientRect) {
      const r = host.getBoundingClientRect();
      if (r && (r.width > 1 || r.height > 1)) {
        let ox = 0;
        let oy = 0;
        if (collectFxLayer && collectFxLayer.getBoundingClientRect) {
          const lr = collectFxLayer.getBoundingClientRect();
          ox = lr.left || 0;
          oy = lr.top || 0;
        }
        x = r.left - ox + r.width / 2;
        y = r.top - oy + r.height / 2;
      }
    }
    return { x: x, y: y };
  }

  // 2–4 частицы на источник: крупный сбор заметнее, но лимит жёсткий.
  function fxParticles(amount) {
    if (!(amount > 0)) return 0;
    return Math.min(4, 2 + (amount >= 50 ? 1 : 0) + (amount >= 500 ? 1 : 0));
  }

  function fxSpawn(from, to, res, i, n, baseDelay, duration) {
    if (!collectFxLayer || !document.createElement) return 0;

    const el = document.createElement('span');
    el.className = 'collect-fx__p collect-fx__p_' + res;
    if (el.setAttribute) el.setAttribute('aria-hidden', 'true');

    // Дуга: середина пути выше прямой на 28–44 px, соседние частицы
    // расходятся на 9 px, чтобы не слипались в одну точку.
    const spread = (i - (n - 1) / 2) * 9;
    const tx = to.x + spread;
    const ty = to.y + (i % 2 ? 4 : 0);
    const mx = (from.x + tx) / 2 + (i % 2 ? 12 : -12);
    const my = (from.y + ty) / 2 - (28 + (i % 3) * 8);
    const delay = baseDelay + i * 40;

    fxVar(el, '--sx', from.x.toFixed(1) + 'px');
    fxVar(el, '--sy', from.y.toFixed(1) + 'px');
    fxVar(el, '--mx', mx.toFixed(1) + 'px');
    fxVar(el, '--my', my.toFixed(1) + 'px');
    fxVar(el, '--ex', tx.toFixed(1) + 'px');
    fxVar(el, '--ey', ty.toFixed(1) + 'px');
    fxVar(el, '--dur', duration + 'ms');
    fxVar(el, '--delay', delay + 'ms');

    collectFxLayer.appendChild(el);

    // Удаляем по animationend, а таймер — страховка, если кадр пропущен.
    let gone = false;
    const kill = function () {
      if (gone) return;
      gone = true;
      removeFxNode(el);
    };
    if (el.addEventListener) el.addEventListener('animationend', kill);
    setTimeout(kill, delay + duration + 80);

    return delay + duration;
  }

  // Пульс значения и всплывающее «+N» после прилёта частиц.
  function fxPulse(res, amount, delayMs) {
    const valueEl = res === 'gold' ? resGold : resElixir;
    if (!valueEl || !(amount > 0)) return;

    const run = function () {
      valueEl.classList.remove('is-gain');
      // Одно чтение ширины перезапускает CSS-анимацию; в кадровом цикле
      // этого нет, поэтому layout thrash не возникает.
      void valueEl.offsetWidth;
      valueEl.classList.add('is-gain');

      let panel = null;
      if (valueEl.closest) {
        try { panel = valueEl.closest('.res-panel'); } catch (e) { panel = null; }
      }
      let badge = null;
      if (panel && panel.appendChild && document.createElement) {
        badge = document.createElement('span');
        badge.className = 'res-gain res-gain_' + res;
        badge.textContent = '+' + fmtNum(amount);
        panel.appendChild(badge);
      }

      setTimeout(function () { valueEl.classList.remove('is-gain'); }, 620);
      if (badge) setTimeout(function () { removeFxNode(badge); }, 820);
    };

    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }

  // sources: [{ id, res, amount }] из одного бура или из «Собрать всё».
  function playCollectFx(sources) {
    if (!sources || !sources.length) return;

    const totals = { gold: 0, elixir: 0 };
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (s && s.amount > 0 && (s.res === 'gold' || s.res === 'elixir')) {
        totals[s.res] += s.amount;
      }
    }
    if (totals.gold <= 0 && totals.elixir <= 0) return;

    if (reducedMotion()) {
      fxPulse('gold', totals.gold, 0);
      fxPulse('elixir', totals.elixir, 0);
      return;
    }

    let created = (collectFxLayer && collectFxLayer.children)
      ? collectFxLayer.children.length : 0;
    let lastFlight = 0;
    const duration = FX_DUR_MIN +
      Math.round(Math.random() * (FX_DUR_MAX - FX_DUR_MIN));

    for (let i = 0; i < sources.length && created < FX_MAX; i++) {
      const src = sources[i];
      if (!src || !(src.amount > 0)) continue;
      if (src.res !== 'gold' && src.res !== 'elixir') continue;

      const from = fxFrom(src.id);
      if (!from) continue;
      const to = fxTo(src.res);
      const n = Math.min(fxParticles(src.amount), FX_MAX - created);

      for (let j = 0; j < n; j++) {
        const flight = fxSpawn(from, to, src.res, j, n, j * 35, duration);
        if (flight > lastFlight) lastFlight = flight;
        created++;
      }
    }

    // Без геометрии (headless-тест, скрытая панель) частиц нет, но пульс
    // всё равно показываем: игрок видит, сколько пришло.
    const pulseDelay = lastFlight > 0 ? lastFlight : duration;
    fxPulse('gold', totals.gold, pulseDelay);
    fxPulse('elixir', totals.elixir, pulseDelay);
  }

  /* ---------- ежедневный контракт ---------- */

  // Короткие часы для чипа: 7:59, а не 7 ч 59 мин — HUD не раздувается.
  function clockShort(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function syncDailyChip() {
    if (!dailyChip) return;

    const d = CC.Game.daily ? CC.Game.daily() : null;
    if (!d) {
      dailyChip.classList.add('hidden');
      return;
    }

    dailyChip.classList.remove('hidden');
    const ready = d.bank > 0 || d.stars >= d.target;
    // На узком телефоне лёжа полная подпись задевает центральный HUD,
    // поэтому там остаётся короткий вариант. На 844×390 — полный.
    const compact = !!(app && app.classList.contains('is-compact'));
    const winW = (typeof window !== 'undefined' && window.innerWidth) || 0;
    const narrow = compact && winW > 0 && winW < 760;
    const text = ready
      ? (narrow ? '★ Забрать' : 'Контракт: забрать')
      : (narrow
        ? d.stars + '/' + d.target + ' ★'
        : 'Контракт ' + d.stars + '/' + d.target + ' ★');

    if (cache.dailyChip !== text) {
      dailyChip.textContent = text;
      cache.dailyChip = text;
    }
    dailyChip.classList.toggle('is-ready', !!d.ready);

    const title = ready
      ? 'Контракт выполнен — забери награду (' + d.bank + ' из ' + d.maxStack + ')'
      : 'Ежедневный контракт: ' + d.stars + ' из ' + d.target +
        ' звёзд. Новый через ' + formatDuration(d.next);
    if (dailyChip.title !== title) dailyChip.title = title;
  }

  function syncDaily() {
    if (!dailyOpen) return;

    const d = CC.Game.daily ? CC.Game.daily() : null;
    if (!d) return;

    const sig = d.stars + '/' + d.bank + '/' + (d.ready ? 1 : 0) + '/' +
      d.claimed + '/' + Math.ceil(d.nextMs / 60000);
    if (cache.dailySig === sig) return;
    cache.dailySig = sig;

    if (dailyStars) {
      dailyStars.textContent = '★'.repeat(d.stars) +
        '☆'.repeat(Math.max(0, d.target - d.stars));
    }

    if (dailyText) {
      let text = 'Звёзды: ' + d.stars + ' / ' + d.target;
      if (d.bank > 0) text += ' · В банке: ' + d.bank + ' из ' + d.maxStack;
      text += ' · Новый через ' + formatDuration(d.next);
      dailyText.textContent = text;
    }

    if (dailyReward) {
      dailyReward.textContent = 'Награда: ' + fmtNum(d.reward.gold) + ' руды, ' +
        fmtNum(d.reward.elixir) + ' энергии, ' + platText(d.reward.gems);
    }

    if (dailyHint) {
      dailyHint.textContent = d.ready
        ? 'Награда ждёт — забери.'
        : 'Любые бои дают звёзды. Повтор — не больше 1 ★.';
    }

    if (btnDailyClaim) {
      btnDailyClaim.disabled = !d.ready;
      const label = d.bank > 1 ? 'Забрать · ' + d.bank : 'Забрать';
      if (btnDailyClaim.textContent !== label) btnDailyClaim.textContent = label;
    }
  }

  function openDaily() {
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeLevels();
    closeAchievements();
    closeArena();
    closeBuyResource();
    closeBuyPlatinum();

    dailyOpen = true;
    cache.dailySig = null;
    if (dailyEl) dailyEl.classList.remove('hidden');
    sync();
    return { ok: true };
  }

  function closeDaily() {
    dailyOpen = false;
    if (dailyEl) dailyEl.classList.add('hidden');
  }

  function claimDaily() {
    const res = CC.Game.claimDaily ? CC.Game.claimDaily() : { error: 'Нет контракта' };
    if (res.error) {
      toast(res.error);
      return res;
    }

    const parts = [];
    if (res.reward.gold > 0) parts.push('+' + fmtNum(res.reward.gold) + ' руды');
    if (res.reward.elixir > 0) parts.push('+' + fmtNum(res.reward.elixir) + ' энергии');
    if (res.reward.gems > 0) parts.push('+' + platText(res.reward.gems));

    const lost = (res.lost.gold || 0) + (res.lost.elixir || 0);
    toast('Контракт: ' + parts.join(', ') +
      (lost > 0 ? ' · часть не влезла в склады' : ''));

    if (CC.Sound) CC.Sound.play('questDone');
    cache.dailySig = null;
    cache.dailyChip = null;
    // Закрываем окно: тост с наградой не должен висеть поверх кнопок.
    closeDaily();
    sync();
    return res;
  }

  // Открыт ли поверх сцены хоть один экран. Нужен, чтобы служебные тосты
  // не всплывали поверх кнопок модальных окон.
  function anyOverlayOpen() {
    if (shopOpen || levelsOpen || chapterOpen || recruitOpen || achOpen || dailyOpen || arenaOpen ||
        replaysOpen || buyResOpen || buyPlatOpen || askState) return true;
    if (overlayShown) return true;
    if (replayEnd && !replayEnd.classList.contains('hidden')) return true;
    if (offlineEl && !offlineEl.classList.contains('hidden')) return true;
    if (raidEl && !raidEl.classList.contains('hidden')) return true;
    return false;
  }

  function syncTruce() {
    if (!truceChip) return;

    const t = CC.Game.raidTruce ? CC.Game.raidTruce() : null;
    const show = !!(t && t.active && CC.App.mode === 'base');
    truceChip.classList.toggle('hidden', !show);
    if (!show) return;

    const text = clockShort(t.left);
    if (truceText) {
      if (truceText.textContent !== text) truceText.textContent = text;
    } else if (truceChip.textContent !== text) {
      truceChip.textContent = text;
    }

    const title = 'Перемирие ' + formatDuration(t.left) + ' — новых набегов не будет';
    if (truceChip.title !== title) truceChip.title = title;
  }

  /* ---------- уровень кампании и режим построек ---------- */

  function syncModeButton() {
    if (!battleBtn) return;

    const base = CC.App.mode === 'base';
    const mode = base ? 'battle' : 'base';
    const text = base ? 'В БОЙ' : 'НА БАЗУ';

    if (battleBtn.dataset.mode !== mode) battleBtn.dataset.mode = mode;
    if (battleBtn.textContent !== text) battleBtn.textContent = text;
  }

  // Вход/выход в режим «Постройки». В нём видна сетка, постройки можно
  // переставлять мышью и пальцем, а выбранный в терминале модуль ставится
  // подряд. В обычном режиме тап только выбирает постройку.
  function setBuildMode(on) {
    on = !!on;
    if (CC.App.mode !== 'base') on = false;

    if (state.buildMode === on) {
      syncBuildMode();
      return { ok: true, buildMode: on };
    }

    state.buildMode = on;
    state.dragId = null;
    if (drag) dragCancel();
    // выход снимает выделение и призрак установки; база остаётся как есть
    cancelArm();
    state.selected = null;
    hoverAt = null;
    cache.uTimer = null;
    updateGhost();
    sync();
    return { ok: true, buildMode: on };
  }

  function toggleBuildMode() {
    return setBuildMode(!state.buildMode);
  }

  function syncBuildMode() {
    if (buildBtn) {
      const on = state.buildMode;
      const text = on ? 'Готово' : 'Постройки';
      if (buildBtn.textContent !== text) buildBtn.textContent = text;
      buildBtn.classList.toggle('is-active', on);
      buildBtn.title = on
        ? 'Выйти из режима построек (Esc)'
        : 'Режим построек: сетка и перестановка';
      if (buildBtn.setAttribute) buildBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (buildHint) {
      const show = state.buildMode && CC.App.mode === 'base' && !shopOpen && !askState;
      buildHint.classList.toggle('hidden', !show);
    }
  }

  function syncLevelChip() {
    if (!lvlChip) return;

    const all = CC.Game.isAllCleared();
    const idx = CC.Game.currentLevel();
    const lvl = CC.LEVELS[idx];
    const stars = CC.Game.levelStars(idx);
    const starStr = ' ' + starText(stars);
    const full = lvl ? 'Уровень ' + (idx + 1) + ' · ' + lvl.name : '';
    const compact = !!(app && app.classList.contains('is-compact'));
    const text = compact
      ? (all ? 'Все' : 'Ур. ' + (idx + 1))
      : (all ? 'Все пройдены' + starStr : 'Ур. ' + (idx + 1) + starStr);

    if (cache.lvlChip !== text) {
      lvlChip.textContent = text;
      lvlChip.classList.toggle('is-done', all);
      lvlChip.title = all
        ? 'Все уровни пройдены'
        : full + ' · звёзды ' + stars + '/3' + (lvl && lvl.hint ? ' — ' + lvl.hint : '');
      cache.lvlChip = text;
    }
  }

  /* ---------- строители ---------- */

  function syncBuildersChip() {
    if (!buildersChip) return;

    const b = CC.Game.builders();
    const text = b.busy + '/' + b.total;
    if (buildersChipCount) {
      if (buildersChipCount.textContent !== text) buildersChipCount.textContent = text;
    } else if (buildersChip.textContent !== text) {
      buildersChip.textContent = text;
    }

    buildersChip.classList.toggle('is-busy', b.free === 0);
    buildersChip.title = b.free === 0 && b.next !== null
      ? 'Все бригады заняты · свободна через ' + formatTime(b.next)
      : 'Свободно бригад: ' + b.free + ' из ' + b.total;
  }

  function syncBuildersPanel() {
    if (!bpanel || !buildersOpen) return;

    const b = CC.Game.builders();
    const team = b.team;
    const list = CC.Base.list();
    const gems = CC.Game.gems();

    let sig = b.busy + '/' + b.total + '|' + gems + '|' + b.th + '|' +
      (team ? team.number + ':' + team.th + ':' + team.cost : 'max') + '|';
    const rows = [];

    for (let i = 0; i < list.length; i++) {
      const info = CC.Game.upgradeInfo(list[i].id);
      if (!info) continue;
      sig += list[i].id + ':' + Math.ceil(info.left) + ';';
      rows.push('<div class="brow"><span>' + CC.BUILDINGS[list[i].type].name +
        ' → ур. ' + info.to + '</span><b>' + formatTime(info.left) + '</b></div>');
    }

    for (let i = 0; i < list.length; i++) {
      const bi = CC.Game.buildInfo(list[i].id);
      if (!bi) continue;
      sig += 'b' + list[i].id + ':' + Math.ceil(bi.left) + ';';
      rows.push('<div class="brow"><span>🏗 ' + CC.BUILDINGS[list[i].type].name +
        ' · стройка</span><b>' + formatTime(bi.left) + '</b></div>');
    }

    if (b.free > 0) {
      rows.push('<div class="brow brow_free">Свободно бригад: ' + b.free + '</div>');
    }

    // Следующая бригада: цена и требование по центру видны всегда,
    // пока лимит не выбран. Кнопка покупки появляется только когда доступно.
    if (team) {
      const title = builderOrdinal(team.number) + ' бригада';
      let req;
      if (b.th < team.th) {
        req = 'Нужен центр ' + team.th + ' уровня (сейчас ' + b.th + ')';
      } else if (gems < team.cost) {
        const missing = Math.ceil(team.cost - gems);
        req = 'Не хватает ' + missing + ' ' + CC.platinumWord(missing);
      } else {
        req = 'Центр ' + b.th + ' уровня — можно нанимать';
      }
      rows.push('<div class="brow brow_next"><span>' + title +
        '<i class="brow__hint">' + req + '</i></span><b>' +
        '<span class="ico ico-platinum" aria-hidden="true"></span>' +
        team.cost + '</b></div>');
    } else {
      rows.push('<div class="brow brow_req">Все бригады наняты</div>');
    }

    if (cache.bpanelSig === sig) return;
    cache.bpanelSig = sig;

    bpanelCount.textContent = b.busy + '/' + b.total;
    bpanelList.innerHTML = rows.join('');
    bpanel.classList.toggle('is-hireable', b.canHire);

    if (hireBtn) {
      hireBtn.classList.toggle('hidden', !b.canHire);
      hireBtn.disabled = !b.canHire;
      hireBtn.textContent = team ? 'Нанять бригаду · ' + team.cost : 'Нанять бригаду';
      hireBtn.title = team
        ? builderOrdinal(team.number) + ' бригада: ' + CC.platinum(team.cost) +
          ' · с ' + team.th + ' уровня центра'
        : 'Больше бригад нет';
    }
  }

  function onBuildersClick(e) {
    const btn = e.target.closest('[data-builder]');
    if (!btn) return;

    const what = btn.dataset.builder;

    if (what === 'close') {
      buildersOpen = false;
      bpanel.classList.add('hidden');
      return;
    }

    if (what === 'hire') {
      const res = CC.Game.hireBuilder();
      if (res.error) toast(res.error);
      else {
        toast('Бригада нанята · всего ' + res.total);
        if (CC.Sound) CC.Sound.play('questDone');
      }
      cache.bpanelSig = null;
      sync();
    }
  }

  function openBuilders() {
    buildersOpen = true;
    if (bpanel) bpanel.classList.remove('hidden');
    closeQuest();
    cache.bpanelSig = null;
    sync();
    return { ok: true };
  }

  function closeBuilders() {
    buildersOpen = false;
    if (bpanel) bpanel.classList.add('hidden');
  }

  /* ---------- задания ---------- */

  function syncQuests() {
    // События обучения: первый груз и пропуск. Показываем тостом, чтобы
    // не блокировать сцену отдельным модальным окном на 844×390.
    const tutEvent = CC.Game.takeTutorialEvent ? CC.Game.takeTutorialEvent() : null;
    if (tutEvent) {
      if (tutEvent.type === 'cargo') {
        const lost = tutEvent.lost &&
          ((tutEvent.lost.gold || 0) + (tutEvent.lost.elixir || 0) > 0);
        toast('Первый груз: +' + fmtNum(tutEvent.gold) + ' руды и +' +
          fmtNum(tutEvent.elixir) + ' энергии' +
          (lost ? ' · склад почти полон' : ''));
      } else if (tutEvent.type === 'skip') {
        toast('Обучение пропущено · +' + fmtNum(tutEvent.gold) + ' руды и +' +
          fmtNum(tutEvent.elixir) + ' энергии');
      }
      if (CC.Sound) CC.Sound.play('questDone');
    }

    const reward = CC.Game.takeQuestReward();
    if (reward) {
      if (CC.Sound) {
        CC.Sound.play(reward.gold > 0 || reward.gems > 0 ? 'questDone' : 'lootLost');
      }

      const gemText = reward.gems ? ' · +' + platText(reward.gems) : '';

      if (reward.lost > 0) {
        if (reward.gold > 0) {
          toast('Задания: +' + reward.gold + ' руды · ' + reward.lost + ' потеряно' + gemText);
        } else {
          toast('Склады полны: ' + reward.lost + ' руды потеряно' + gemText);
        }
      } else if (reward.gold > 0) {
        toast((reward.count > 1 ? 'Задания' : 'Задание') + ': +' + reward.gold + ' руды' + gemText);
      } else if (reward.gems) {
        toast('Задания: +' + platText(reward.gems));
      }
    }

    const list = CC.Game.quests();
    const done = list.filter(function (q) { return q.done; }).length;
    const active = list.find(function (q) { return q.active; }) || null;
    const all = done === list.length;

    // После последнего задания не тупик: ведём к следующему центру
    // и показываем, сколько руды уже есть из его цены.
    let goal = null;
    if (all && CC.Game.townhallLevel() < CC.MAX_TH) {
      const hall = CC.Base.list().find(function (b) { return b.type === 'townhall'; });
      const cost = hall ? CC.Game.upgradeCost(hall.id) : null;
      if (hall && cost && cost.gold > 0) {
        goal = {
          id: hall.id,
          th: CC.Game.townhallLevel() + 1,
          gold: CC.Game.gold(),
          cost: cost.gold
        };
      }
    }
    questGoal = goal;

    const text = goal
      ? 'Цель: центр ' + goal.th
      : (all ? 'Все задания выполнены' : 'Задание: ' + (active ? active.text : ''));
    const prog = goal
      ? fmtNum(Math.min(goal.gold, goal.cost)) + ' / ' + fmtNum(goal.cost) + ' руды'
      : (all
        ? done + '/' + list.length
        : (active ? active.progress + '/' + active.target : done + '/' + list.length));

    if (questText.textContent !== text) questText.textContent = text;
    if (questProgressEl.textContent !== prog) questProgressEl.textContent = prog;
    questBar.classList.toggle('is-done', all && !goal);
    questBar.classList.toggle('is-goal', !!goal);

    if (!questOpen) return;

    const sig = list.map(function (q) {
      return q.id + ':' + (q.done ? 1 : 0) + ':' + q.progress;
    }).join('|') + '|' + done;

    if (cache.questSig === sig) return;
    cache.questSig = sig;

    questCount.textContent = done + '/' + list.length;
    questList.innerHTML = list.map(function (q) {
      const cls = 'quest-row' + (q.done ? ' is-done' : '') +
        (q.active ? ' is-active is-link' : '');
      // К цели ведёт только активный шаг: закрытые строки не кнопки.
      const go = q.active ? ' data-quest-go="' + q.id + '" role="button" tabindex="0"' : '';
      return '<div class="' + cls + '"' + go + '>' +
        '<span class="quest-row__mark">' + (q.done ? '✓' : '○') + '</span>' +
        '<span class="quest-row__text">' + q.text + '</span>' +
        '<span class="quest-row__prog">' + q.progress + '/' + q.target + '</span>' +
        '<span class="quest-row__reward" title="Платина">+' + (q.gems || 0) + ' ◆</span>' +
        '</div>';
    }).join('');
  }

  function syncOffline() {
    if (offlineShown) return;

    const info = CC.Game.offlineInfo();
    if (!info) return;

    offlineShown = true;
    // Одна строка вместо двух одинаковых чисел. Если реального отсутствия
    // больше лимита, честно пишем «начислено за 8 ч», а не «тебя не было 72 ч».
    const cappedAway = info.awaySeconds > info.seconds + 60;
    const span = formatDuration(info.seconds);
    const capGold = info.capGold || 0;
    const capElixir = info.capElixir || 0;

    const parts = [];
    let fullGold = true;
    let fullElixir = true;
    if (capGold > 0) {
      fullGold = info.storedGold >= capGold - 0.5;
      parts.push(fmtNum(info.storedGold) + ' из ' + fmtNum(capGold) + ' руды');
    }
    if (capElixir > 0) {
      fullElixir = info.storedElixir >= capElixir - 0.5;
      parts.push(fmtNum(info.storedElixir) + ' из ' + fmtNum(capElixir) + ' энергии');
    }

    const full = parts.length > 0 && fullGold && fullElixir;
    // Если пока игрока не было базу ограбили, «Пока тебя не было» говорит
    // об этом теми же фактическими цифрами, что и окно набега.
    let raidText = '';
    const raid = CC.Game.pendingRaidInfo ? CC.Game.pendingRaidInfo() : null;
    if (raid) {
      const taken = [];
      if (raid.stolen.gold > 0) taken.push(fmtNum(raid.stolen.gold) + ' руды');
      if (raid.stolen.elixir > 0) taken.push(fmtNum(raid.stolen.elixir) + ' энергии');
      if (taken.length) raidText = 'На базу напали — увели ' + taken.join(', ') + '.';
    }
    offlineText.textContent = raidText;
    offlineLoot.textContent = parts.length
      ? (cappedAway ? 'Начислено за ' : 'За ') + span +
        ' буры накопили ' + parts.join(', ') + (full ? ' (полны)' : '')
      : 'Нового дохода нет — буры уже полны';

    if (offlineHint) {
      offlineHint.textContent = full || info.capped
        ? 'Буры полны. Забери собранное иконками над бурами.'
        : 'Забери добычу иконками над бурами — на склад попадёт только собранное.';
    }

    offlineEl.classList.remove('hidden');
  }

  function showTabLock() {
    if (!tabLock) return false;
    tabLock.classList.remove('hidden');
    return true;
  }

  function hideTabLock() {
    if (tabLock) tabLock.classList.add('hidden');
  }

  function syncRaid() {
    if (!raidEl) return;

    // окно показываем только в деревне, не поверх боя
    if (CC.App.mode !== 'base') return;

    const info = CC.Game.pendingRaidInfo();
    if (!info) {
      if (raidShown) {
        raidShown = false;
        raidShownAt = 0;
        raidEl.classList.add('hidden');
      }
      return;
    }

    if (raidShown) {
      if (raidShownAt === info.at) return;
      // старый набег заменился новым — перерисовываем окно
      raidShown = false;
    }
    raidShown = true;
    raidShownAt = info.at;

    if (CC.Sound) {
      CC.Sound.play('raidAlarm');
      if (info.stolen.gold > 0 || info.stolen.elixir > 0) {
        setTimeout(function () {
          if (CC.Sound) CC.Sound.play('lootLost');
        }, 700);
      }
    }

    const hall = info.hasHall
      ? (info.thDead ? ' · командный центр пал' : ' · командный центр устоял')
      : ' · командного центра нет';

    raidText.textContent = 'Разрушено ' + info.percent + '% построек' + hall;

    const parts = [];
    if (info.stolen.gold > 0) parts.push(info.stolen.gold + ' руды');
    if (info.stolen.elixir > 0) parts.push(info.stolen.elixir + ' энергии');
    raidLoot.textContent = parts.length ? 'Увели: ' + parts.join(', ') : 'Ничего не унесли';

    const stolenTotal = info.stolen.gold + info.stolen.elixir;

    let verdict;
    if (!info.hasHall) {
      verdict = 'Командного центра нет — восстанови базу.';
    } else if (stolenTotal <= 0) {
      verdict = info.percent === 0
        ? 'Оборона справилась: ни один модуль не пострадал, ресурсы целы.'
        : 'Модули задеты, но ресурсы уцелели.';
    } else if (info.thDead) {
      verdict = 'Командный центр пал — усиль оборону.';
    } else if (info.percent < 50) {
      verdict = 'Турели справились: урон небольшой.';
    } else {
      verdict = 'Держались, но слабовато — усиль оборону.';
    }
    raidVerdict.textContent = verdict;

    // Передышка после этого набега: игрок видит, когда снова можно ждать гостей.
    if (raidTruce) {
      const t = CC.Game.raidTruce ? CC.Game.raidTruce() : null;
      if (t && t.active) {
        raidTruce.textContent = 'Перемирие ' + formatDuration(t.left) +
          ' — новых набегов не будет';
        raidTruce.classList.remove('hidden');
      } else {
        raidTruce.textContent = '';
        raidTruce.classList.add('hidden');
      }
    }

    raidEl.classList.remove('hidden');
  }

  // Поповер держим в экране: на узком HUD он прижимается к левому краю,
  // но не уходит за правую границу и не перекрывает нижнее меню.
  function positionSoundPopover() {
    if (!soundPopover || !soundPopover.parentElement) return;

    const host = soundPopover.parentElement;
    const hr = host.getBoundingClientRect();
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
    if (!vw) return;

    const width = Math.max(160, Math.min(216, vw - 20));
    soundPopover.style.width = Math.round(width) + 'px';

    let left = 0;
    const minLeft = 10 - hr.left;
    const maxLeft = vw - 10 - width - hr.left;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    soundPopover.style.left = Math.round(left) + 'px';
  }

  function syncSound() {
    if (!CC.Sound) return;

    const on = CC.Sound.isEnabled();
    if (soundBtn) {
      // Иконка нарисована CSS; сам чип только открывает поповер.
      soundBtn.title = on ? 'Звук: включён' : 'Звук: выключен';
      soundBtn.classList.toggle('is-muted', !on);
      if (soundBtn.setAttribute) soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (soundToggle) {
      soundToggle.textContent = on ? 'Звуки вкл' : 'Звуки выкл';
      soundToggle.title = on ? 'Выключить звуки' : 'Включить звуки';
      soundToggle.classList.toggle('is-muted', !on);
      if (soundToggle.setAttribute) soundToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (musicBtn) {
      const music = CC.Sound.isMusicEnabled();
      musicBtn.title = music ? 'Музыка включена' : 'Музыка выключена';
      musicBtn.classList.toggle('is-muted', !music);
      if (musicBtn.setAttribute) musicBtn.setAttribute('aria-pressed', music ? 'true' : 'false');
    }

    const vol = Math.round(CC.Sound.master() * 100);
    if (volValue) {
      const text = vol + '%';
      if (volValue.textContent !== text) volValue.textContent = text;
    }
    if (volMinus) volMinus.disabled = vol <= 0;
    if (volPlus) volPlus.disabled = vol >= 100;
  }

  function changeVolume(delta) {
    if (!CC.Sound) return;

    const v = Math.round((CC.Sound.master() + delta) * 10) / 10;
    CC.Sound.setMaster(v);
    if (CC.Sound.isEnabled()) CC.Sound.play('ui');
    syncSound();
  }

  /* ---------- терминал построек ---------- */

  function closeShop() {
    shopOpen = false;
    if (shopEl) shopEl.classList.add('hidden');
  }

  // Первая карточка должна быть видна целиком: старый скролл категории
  // не должен срезать её край или первую строку.
  function resetShopScroll() {
    if (!shopGrid) return;
    shopGrid.scrollLeft = 0;
    shopGrid.scrollTop = 0;
  }

  function openShop() {
    if (drag) dragCancel();

    cancelArm();
    closeQuest();
    closeBuilders();
    closeLevels();
    closeDaily();
    closeBuyResource();
    closeBuyPlatinum();
    shopOpen = true;
    // Указатель обучения должен найти карточку: открываем её категорию.
    shopCat = 'all';
    const tutor = CC.Game.tutorial ? CC.Game.tutorial() : null;
    if (tutor && tutor.active && tutor.place) {
      shopCat = shopTypeCategory(tutor.place);
    }
    if (CC.Game.markShopOpened) CC.Game.markShopOpened();
    if (shopEl) shopEl.classList.remove('hidden');
    cache.shopSig = null;
    resetShopScroll();
    sync();
  }

  /* ---------- карта кампании ---------- */

  const MAP_ERAS = [
    'Красные пески', 'Кратеры', 'Ледяные жилы', 'Разлом', 'Купол'
  ];

  /* ---------- глава кампании ---------- */

  function chapterRange(era) {
    return { start: era * 10, end: Math.min(CC.LEVELS.length, era * 10 + 10) };
  }

  function chapterStats(era) {
    const r = chapterRange(era);
    const cleared = CC.Game.clearedLevels();
    let done = 0;
    let stars = 0;
    for (let i = r.start; i < r.end; i++) {
      if (cleared.indexOf(i) !== -1) done++;
      stars += CC.Game.levelStars(i);
    }
    const finalDone = cleared.indexOf(r.start + 9) !== -1;
    const complete = done >= 10 && stars >= 30 && finalDone;
    return { done: done, stars: stars, final: finalDone, complete: complete,
      start: r.start, end: r.end };
  }

  function firstChapterTarget(era, needStars) {
    const r = chapterRange(era);
    const cleared = CC.Game.clearedLevels();
    for (let i = r.start; i < r.end; i++) {
      if (needStars) {
        if (CC.Game.levelStars(i) < 3) return i;
      } else if (cleared.indexOf(i) === -1) {
        return i;
      }
    }
    // Всё пройдено — хотя бы последний сектор главы, как ориентир.
    return r.start + 9;
  }

  function chapterTargetInfo(index) {
    const target = Number(index);
    if (!(target >= 0 && target < CC.LEVELS.length)) {
      return { ok: false, target: null, label: 'Недоступно' };
    }
    const unlocked = CC.Game.isLevelUnlocked(target);
    return {
      ok: unlocked, target: target,
      label: unlocked ? 'Перейти' : 'Недоступно'
    };
  }

  function syncChapter() {
    if (!chapterOpen || !chapterEl) return;

    const era = Math.max(0, Math.min(4, chapterIndex));
    const st = chapterStats(era);
    if (chapterTitle) chapterTitle.textContent = 'Глава ' + (era + 1) + ': ' + MAP_ERAS[era];
    if (chapterSub) {
      chapterSub.textContent = 'Эпоха ' + (era + 1) + ' из 5 · сектора ' +
        (st.start + 1) + '–' + (st.end) + ' · ★ ' + st.stars + '/30';
    }
    if (chapterPrev) chapterPrev.disabled = era <= 0;
    if (chapterNext) chapterNext.disabled = era >= 4;
    if (chapterReward) {
      chapterReward.textContent = 'За каждый сектор: +1 платина · всего 10';
    }
    if (chapterDone) chapterDone.classList.toggle('hidden', !st.final);

    // Награда главы: только когда закрыты все три цели. Одна платина,
    // после получения кнопка гаснет и остаётся «Получено».
    const claimed = CC.Game.chapterClaimed ? CC.Game.chapterClaimed(era) : false;
    if (chapterClaim) chapterClaim.classList.toggle('hidden', !st.complete);
    if (chapterClaimBtn) {
      chapterClaimBtn.disabled = !st.complete || claimed;
      const label = claimed ? 'Получено' : 'Получить';
      if (chapterClaimBtn.textContent !== label) chapterClaimBtn.textContent = label;
      chapterClaimBtn.classList.toggle('is-claimed', claimed);
    }

    if (chapterGoals) {
      const goals = [
        { id: 'sectors', name: 'Пройдено секторов', cur: st.done, max: 10,
          done: st.done >= 10, target: firstChapterTarget(era, false) },
        { id: 'stars', name: 'Собрано звёзд', cur: st.stars, max: 30,
          done: st.stars >= 30, target: firstChapterTarget(era, true) },
        { id: 'final', name: 'Финал главы', cur: st.final ? 1 : 0, max: 1,
          done: st.final, target: st.start + 9 }
      ];

      let html = '';
      goals.forEach(function (g) {
        const info = chapterTargetInfo(g.target);
        const pct = Math.round(Math.min(1, g.cur / g.max) * 100);
        html += '<div class="chapter-goal' + (g.done ? ' is-done' : '') +
          '" data-goal="' + g.id + '">' +
          '<div class="chapter-goal__text">' +
            '<b>' + g.name + '</b>' +
            '<span>' + g.cur + '/' + g.max + '</span>' +
            '<i class="chapter-goal__bar"><b style="width:' + pct + '%"></b></i>' +
          '</div>' +
          '<button class="chapter-goal__go" type="button" data-chapter-go="' +
            (g.done || !info.target ? '' : info.target) + '"' +
            (g.done || !info.ok ? ' disabled' : '') +
            '>' + (g.done ? 'Готово' : info.label) + '</button>' +
          '</div>';
      });
      if (chapterGoals.innerHTML !== html) chapterGoals.innerHTML = html;
    }
  }

  function openChapter(era) {
    let n = Number(era);
    if (!isFinite(n)) {
      const base = mapSelected === null ? CC.Game.currentLevel() : mapSelected;
      n = Math.floor(base / 10);
    }
    chapterIndex = Math.max(0, Math.min(4, Math.floor(n)));
    chapterOpen = true;
    if (chapterEl) chapterEl.classList.remove('hidden');
    syncChapter();
    return { ok: true, chapter: chapterIndex };
  }

  function closeChapter() {
    chapterOpen = false;
    if (chapterEl) chapterEl.classList.add('hidden');
  }

  function chapterGo(index) {
    const info = chapterTargetInfo(index);
    if (!info.ok) {
      toast('Сначала пройди предыдущий сектор');
      return { error: 'Недоступно', target: info.target };
    }
    mapSelected = info.target;
    cache.levelSig = null;
    closeChapter();
    syncLevels();
    return { ok: true, level: info.target };
  }

  // Забрать платину за завершённую главу. Глава считается завершённой,
  // когда закрыты все три цели: сектора, звёзды и финал. Повторная выдача
  // исключена в CC.Game.claimChapterReward и заблокированной кнопкой.
  function claimChapter() {
    if (!chapterOpen) return { error: 'Глава закрыта' };
    const era = chapterIndex;
    if (!CC.Game || !CC.Game.claimChapterReward) {
      return { error: 'Награда недоступна' };
    }

    const res = CC.Game.claimChapterReward(era);
    if (res.ok) {
      toast('Глава ' + (era + 1) + ': +1 платина');
      syncChapter();
      sync();
    } else if (res.error === 'Награда уже получена') {
      syncChapter();
    }
    return res;
  }

  function openLevels() {
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeDaily();
    closeArena();
    closeReplays();
    closeBuyResource();
    closeBuyPlatinum();

    // На карте подсвечен выбранный для боя уровень; после выхода с поля боя
    // он уже равен прогрессу (setMode('base') вызывает resetSelected).
    mapSelected = chosenLevel();
    levelsOpen = true;
    if (levelsEl) levelsEl.classList.remove('hidden');
    if (mapScroll) mapScroll.scrollTop = 0;
    cache.levelSig = null;
    syncLevels();
    return { ok: true, level: mapSelected };
  }

  function closeLevels() {
    levelsOpen = false;
    closeChapter();
    if (levelsEl) levelsEl.classList.add('hidden');
  }

  // «В БОЙ» открывает карту; в бою эта же кнопка возвращает на базу.
  function onBattleButton() {
    if (CC.App.mode === 'battle') {
      setMode('base');
      return { ok: true, action: 'base' };
    }
    return openLevels();
  }

  function starRow(n) {
    const k = Math.max(0, Math.min(3, n | 0));
    return '★'.repeat(k) + '☆'.repeat(3 - k);
  }

  // Состояние узла: пройден / текущий / закрыт. Открытые, но не текущие
  // узлы возможны после реплея старого уровня — показываем их доступными.
  function mapNodeState(i) {
    const cleared = CC.Game.clearedLevels();
    if (cleared.indexOf(i) !== -1) return 'cleared';
    if (!CC.Game.isLevelUnlocked(i)) return 'locked';
    if (i === CC.Game.currentLevel()) return 'current';
    return 'open';
  }

  function mapEraStars(era) {
    let n = 0;
    for (let i = era * 10; i < era * 10 + 10 && i < CC.LEVELS.length; i++) {
      n += CC.Game.levelStars(i);
    }
    return n;
  }

  function syncLevels() {
    if (!levelsOpen || !levelsGrid) return;

    const cleared = CC.Game.clearedLevels();
    const current = CC.Game.currentLevel();
    const sig = current + '|' + cleared.join(',') + '|' + (mapSelected === null ? '' : mapSelected) + '|' +
      CC.LEVELS.map(function (lvl, i) { return CC.Game.levelStars(i); }).join('');

    if (cache.levelSig !== sig) {
      cache.levelSig = sig;

      const eras = [];
      for (let era = 0; era < 5; era++) {
        const nodes = [];
        const eraStars = mapEraStars(era);
        const chests = [3, 6, 10];
        for (let i = era * 10; i < era * 10 + 10 && i < CC.LEVELS.length; i++) {
          const lvl = CC.LEVELS[i];
          const state = mapNodeState(i);
          const stars = CC.Game.levelStars(i);
          const cls = 'map-node map-node--' + state +
            ' is-' + state +
            (i === current ? ' is-active' : '') +
            (mapSelected === i ? ' is-selected' : '');

          nodes.push(
            '<button class="' + cls + '" type="button" data-level="' + i + '"' +
            ' data-state="' + state + '"' +
            ' title="' + escHtml(lvl.name) + ' · командный центр ' + lvl.th + '">' +
            '<span class="map-node__num">' + (i + 1) + '</span>' +
            '<span class="map-node__stars">' + starRow(stars) + '</span>' +
            (state === 'locked'
              ? '<span class="map-node__lock" aria-hidden="true">🔒</span>'
              : '') +
            '</button>'
          );
          const step = i - era * 10 + 1; // номер сектора внутри главы: 1..10
          if (i < era * 10 + 9 && i + 1 < CC.LEVELS.length) {
            // Линия пути: пройденный отрезок залит, открытый — пунктиром.
            const next = i + 1;
            const prevCleared = cleared.indexOf(i) !== -1;
            const nextOpen = CC.Game.isLevelUnlocked(next);
            nodes.push('<span class="map-link' +
              (prevCleared ? ' is-done' : '') +
              (nextOpen && !prevCleared ? ' is-open' : '') +
              '" aria-hidden="true"></span>');
          }
          if (chests.indexOf(step) !== -1) {
            const need = step;
            const open = eraStars >= need;
            nodes.push(
              '<button class="map-chest' + (open ? ' is-open' : '') +
                '" type="button" data-chest="' + need + '" data-open="' +
                (open ? '1' : '0') + '"' +
                ' title="Сундук главы: ' + (open ? 'открыт' : 'нужно ' + need + '★') + '">' +
                '<span class="map-chest__icon" aria-hidden="true">' +
                  (open ? '🎁' : '🧰') + '</span>' +
                '<span class="map-chest__label">' +
                  (open ? 'Открыт' : need + '★') + '</span>' +
              '</button>'
            );
          }
        }

        const locked = CC.LEVELS.slice(era * 10, era * 10 + 10)
          .filter(function (lvl, k) { return mapNodeState(era * 10 + k) === 'locked'; }).length;
        const complete = locked === 0 && mapEraStars(era) > 0;
        // Текущая эпоха — та, где находится незакрытый сектор: подсвечиваем
        // её рамкой, чтобы карта читалась как маршрут, а не список.
        const eraCurrent = current >= era * 10 && current < era * 10 + 10;

        eras.push(
          '<section class="map-era' + (complete ? ' is-complete' : '') +
            (eraCurrent ? ' is-current' : '') +
            '" data-era="' + era + '">' +
            '<header class="map-era__head">' +
              '<span class="map-era__name">' + escHtml(MAP_ERAS[era]) + '</span>' +
              '<span class="map-era__stars">★ ' + mapEraStars(era) + ' / 30</span>' +
            '</header>' +
            '<div class="map-era__track">' + nodes.join('') + '</div>' +
          '</section>'
        );
      }

      levelsGrid.innerHTML = eras.join('');
    }

    syncMapCard();
  }

  // Свободное место на складах: нужно и карточке сектора, и предупреждению
  // перед стартом боя, чтобы «Не влезло» не было сюрпризом.
  function storageFree() {
    return {
      gold: Math.max(0, Math.floor(CC.Game.cap('gold') - CC.Game.gold())),
      elixir: Math.max(0, Math.floor(CC.Game.cap('elixir') - CC.Game.elixir()))
    };
  }

  function lootOverflow(pool) {
    const loot = pool || { gold: 0, elixir: 0 };
    const free = storageFree();
    return {
      free: free,
      over: (Number(loot.gold) || 0) > free.gold ||
        (Number(loot.elixir) || 0) > free.elixir
    };
  }

  function warnLootOverflow(pool) {
    if (!lootOverflow(pool).over) return false;
    toast('Склад: часть добычи не влезет — собери ресурсы до боя');
    return true;
  }

  function syncMapCard() {
    if (!mapCard) return;
    if (mapSelected === null || !CC.LEVELS[mapSelected]) {
      mapCard.classList.add('hidden');
      return;
    }

    const i = mapSelected;
    const lvl = CC.LEVELS[i];
    const state = mapNodeState(i);
    const stars = CC.Game.levelStars(i);
    const locked = state === 'locked';
    const pool = lvl.loot || { gold: 0, elixir: 0 };

    if (mapCardName) mapCardName.textContent = lvl.name;
    if (mapCardTh) mapCardTh.textContent = 'TH' + lvl.th;
    if (mapCardChapter) {
      const era = Math.floor(i / 10);
      const st = chapterStats(era);
      mapCardChapter.textContent = 'Глава ' + (era + 1) + ': ' + MAP_ERAS[era] +
        ' · ★ ' + st.stars + '/30 · +1 платина за сектор';
    }
    if (mapCardLoot) {
      mapCardLoot.textContent = 'Добыча: ' + fmtNum(pool.gold) + ' руды, ' +
        fmtNum(pool.elixir) + ' энергии';
    }
    if (mapCardFree) {
      const fit = lootOverflow(pool);
      mapCardFree.textContent = 'Свободно: ' + fmtNum(fit.free.gold) +
        ' руды / ' + fmtNum(fit.free.elixir) + ' энергии' +
        (fit.over ? ' · часть добычи не влезет' : '');
      mapCardFree.classList.toggle('is-warn', fit.over);
    }
    if (mapCardBest) {
      mapCardBest.textContent = stars > 0
        ? 'Лучший результат: ' + starRow(stars)
        : 'Лучший результат: ещё не пройден';
    }
    if (mapCardGo) {
      mapCardGo.disabled = locked;
      mapCardGo.textContent = locked ? 'Сначала пройди предыдущий' : 'Атаковать';
      mapCardGo.title = locked ? 'Сначала пройди предыдущий' : ('В бой: ' + lvl.name);
    }

    mapCard.classList.remove('hidden');
    mapCard.classList.toggle('is-locked', locked);
  }

  function chooseLevel(index) {
    const res = CC.Game.selectLevel(index);
    if (!res.ok) {
      toast(res.error || 'Уровень закрыт');
      return res;
    }

    mapSelected = index;
    // Один тост на старт: если пул сектора больше свободного места.
    warnLootOverflow((CC.LEVELS[index] && CC.LEVELS[index].loot) || {});
    closeLevels();
    overlayShown = false;
    overlayEl.classList.add('hidden');
    cache.level = null;
    cache.pct = null;
    cache.time = null;

    if (CC.App.mode === 'battle') {
      CC.Battle.reset(index);
      retryReadyAt = Date.now() + 2000;
      const lvl = CC.LEVELS[index];
      showTip((lvl && lvl.hint) || 'Выбери войско внизу и тапни по любой свободной клетке');
    }

    sync();
    return res;
  }

  // Кнопка «Атаковать» в карточке. Закрытый узел не запускает бой.
  function attackMapLevel(index) {
    const i = Number(index);
    if (!(i >= 0 && i < CC.LEVELS.length)) {
      toast('Выбери узел на карте');
      return { error: 'Нет уровня' };
    }
    if (!CC.Game.isLevelUnlocked(i)) {
      toast('Сначала пройди предыдущий');
      return { error: 'Сначала пройди предыдущий', locked: true };
    }
    if (armyTotal() <= 0) {
      closeLevels();
      toast('Сначала найми войска в ангаре');
      openHangar();
      return { error: 'Армия пуста', needArmy: true };
    }

    const res = CC.Game.selectLevel(i);
    if (!res.ok) {
      toast(res.error || 'Уровень закрыт');
      return res;
    }

    mapSelected = i;
    warnLootOverflow((CC.LEVELS[i] && CC.LEVELS[i].loot) || {});
    closeLevels();
    setMode('battle');
    return { ok: true, level: i };
  }

  function onLevelsClick(e) {
    const chest = e.target.closest('[data-chest]');
    if (chest) {
      const need = Number(chest.dataset.chest);
      const open = chest.dataset.open === '1';
      toast(open ? 'Сундук открыт' : 'Сундук главы: нужно ' + need + ' звёзд');
      return { ok: true, chest: need, open: open };
    }
    const node = e.target.closest('[data-level]');
    if (!node) return;
    // Клик по узлу открывает карточку, а не запускает бой сразу.
    mapSelected = Number(node.dataset.level);
    cache.levelSig = null;
    syncLevels();
    return { ok: true, level: mapSelected };
  }

  /* ---------- опыт и достижения ---------- */

  function syncPlayerLevel() {
    if (!CC.Game.playerLevel) return;

    const lvl = CC.Game.playerLevel();
    const xp = Math.floor(CC.Game.state.xp || 0);
    const next = CC.Game.xpToNext();
    const prev = CC.Game.xpForLevel(lvl);
    const span = Math.max(1, next - prev);
    const pct = Math.max(0, Math.min(100, (xp - prev) / span * 100));

    if (xpLevel && xpLevel.textContent !== String(lvl)) xpLevel.textContent = String(lvl);
    const label = xp + ' / ' + next + ' XP';
    if (xpLabel && xpLabel.textContent !== label) xpLabel.textContent = label;
    if (xpBar) {
      const w = pct.toFixed(0) + '%';
      if (xpBar.style.width !== w) xpBar.style.width = w;
    }
  }

  function openAchievements() {
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeLevels();
    closeDaily();
    achOpen = true;
    if (achEl) achEl.classList.remove('hidden');
    cache.achSig = null;
    syncAchievements();
  }

  function closeAchievements() {
    achOpen = false;
    if (achEl) achEl.classList.add('hidden');
  }

  function syncAchievements() {
    if (!achOpen || !achList || !CC.Game.achievements) return;

    const data = CC.Game.achievements();
    const sig = data.list.map(function (a) {
      return a.id + ':' + a.progress + ':' + a.claimedCount;
    }).join('|');
    if (cache.achSig === sig) return;
    cache.achSig = sig;

    achList.innerHTML = data.list.map(function (a) {
      const cls = 'ach-row' + (a.complete ? ' is-done' : '');
      const pct = a.target > 0 ? Math.min(100, a.progress / a.target * 100) : 0;
      const btn = a.complete
        ? '<button class="ach-row__claim" disabled>Забрано</button>'
        : '<button class="ach-row__claim" data-ach="' + a.id + '"' +
          (a.ready ? '' : ' disabled') + '>+<span class="ico ico-platinum" aria-hidden="true"></span>' +
          a.gems + '</button>';

      return '<div class="' + cls + '">' +
        '<span class="ach-row__name">' + a.name + ' · ' + a.tier + '/' + a.tiers + '</span>' +
        '<span class="ach-row__desc">' + a.desc + '</span>' +
        '<span class="ach-row__track"><i style="width:' + pct.toFixed(0) + '%"></i></span>' +
        '<span class="ach-row__prog">' + a.progress + ' / ' + a.target + '</span>' +
        btn +
        '</div>';
    }).join('');

    if (achFooter) {
      achFooter.textContent = 'Забрано ' + data.claimed + ' из ' + data.total;
    }
  }

  function onAchievementsClick(e) {
    const btn = e.target.closest('[data-ach]');
    if (!btn || btn.disabled) return;

    const res = CC.Game.claimAchievement(btn.dataset.ach);
    if (res.error) {
      toast(res.error);
      return;
    }

    if (CC.Sound) CC.Sound.play('questDone');
    toast('За достижение: +' + platText(res.gems));
    cache.achSig = null;
    sync();
  }

  // Первый уровень центра, на котором тип вообще можно ставить.
  // Нужен для карточек с лимитом 0 на текущем TH (энергобарьер на TH1).
  function firstThFor(type) {
    for (let th = 1; th <= CC.MAX_TH; th++) {
      if (CC.limitAt(type, th) > 0) return th;
    }
    return 1;
  }

  // Картинка от художника для карточки карусели. Если CC.Render.buildingArt
  // или troopArt ещё нет (или функция вернула пусто) — тихо оставляем emoji:
  // игра не должна падать до того, как художник добавит арт.
  function cardArt(kind, type, size, level, cls) {
    const R = CC.Render;
    if (!R) return null;
    const fn = kind === 'building' ? R.buildingArt : R.troopArt;
    if (typeof fn !== 'function') return null;

    let src = null;
    try {
      src = fn(type, size, level);
    } catch (e) {
      src = null;
    }
    if (!src || typeof src !== 'string') return null;

    return '<img class="' + cls + '" src="' + escHtml(src) + '" alt="" width="' +
      size + '" height="' + size + '" draggable="false" decoding="async">';
  }

  const SHOP_CATS = [
    { id: 'all', name: 'Все', icon: '▦', asset: 'cat-all' },
    { id: 'defense', name: 'Оборона', icon: '🛡', asset: 'cat-defense',
      types: ['cannon', 'archer', 'mortar', 'airdef', 'mage', 'ambush', 'beam', 'wall'] },
    { id: 'resources', name: 'Ресурсы', icon: '⛏', asset: 'cat-resources',
      types: ['goldmine', 'elixir', 'storage', 'estorage'] },
    { id: 'army', name: 'Армия', icon: '🪖', asset: 'cat-army',
      types: ['barracks', 'lab', 'herohall'] },
    { id: 'traps', name: 'Ловушки', icon: '💥', asset: 'cat-traps',
      types: ['mine', 'spring', 'airmine'] }
  ];

  function shopCatTypes(id) {
    if (id === 'all') return CC.PALETTE.slice();
    const cat = SHOP_CATS.find(function (c) { return c.id === id; });
    return cat && cat.types ? cat.types.slice() : CC.PALETTE.slice();
  }

  function shopTypeCategory(type) {
    for (let i = 1; i < SHOP_CATS.length; i++) {
      if ((SHOP_CATS[i].types || []).indexOf(type) !== -1) return SHOP_CATS[i].id;
    }
    return 'all';
  }

  function shopCardHtml(type) {
    const d = CC.BUILDINGS[type];
    const have = CC.Base.count(type);
    const th = CC.Game.townhallLevel();
    const limit = CC.limitAt(type, th);
    const open = CC.Game.canBuild(type);
    let locked = !open.ok;
    let needTh = open.needTh;
    let lockReason = open.reason;

    // на этом уровне центра лимит нулевой: карточка закрыта, даже если
    // сама постройка формально открыта (энергобарьер до TH2)
    if (!locked && limit <= 0) {
      locked = true;
      needTh = firstThFor(type);
      lockReason = 'Откроется с командного центра ' + needTh + ' уровня';
    }

    const full = !locked && have >= limit;
    // Здание текущего шага Сержанта ставится бесплатно за 5 секунд —
    // карточка честно показывает «Бесплатно · 0:05».
    const lesson = !locked && !full && CC.Game.tutorialPlace
      ? CC.Game.tutorialPlace(type) : null;
    // Тупик без склада: первый склад ресурса ставится бесплатно.
    const rescue = !locked && !full && !lesson && CC.Game.storageRescue
      ? CC.Game.storageRescue(type) : null;
    const free = !!(lesson || rescue);
    const price = free
      ? { gold: 0, elixir: 0 }
      : (CC.placeCost ? CC.placeCost(type) : { gold: 0, elixir: 0 });
    const poorGold = CC.Game.gold() < price.gold;
    const poorElixir = CC.Game.elixir() < price.elixir;
    const poor = !locked && !full && !free && (poorGold || poorElixir);
    const icon = locked ? '🔒' : CC.ICONS[type];
    // Уровень для арта: обычная карточка показывает текущий TH (не выше 10),
    // закрытая — 1, чтобы художнику не пришлось рисовать «нулевой» вид.
    const artLevel = locked ? 1 : Math.min(CC.MAX_TH, th);
    const art = cardArt('building', type, 180, artLevel, 'shop-card__art term-card__art');
    const cls = 'shop-card term-card' + (art ? ' has-art' : '') +
      (locked ? ' is-locked' : '') + (full ? ' is-empty' : '') +
      (poor ? ' is-poor' : '') + (lesson ? ' is-lesson' : '') +
      (rescue ? ' is-rescue' : '');
    const iconCls = 'shop-card__icon cc-icon term-card__art-fallback' +
      (art ? ' has-art' : '');
    const lockBadge = locked
      ? '<span class="shop-card__lock term-card__lock" aria-hidden="true">🔒</span>'
      : '';
    // уровень открытия/текущий и состояние — зацепки для стилей художника
    const cardState = locked ? 'locked' : (lesson ? 'lesson' :
      (rescue ? 'rescue' : (full || poor ? 'insufficient' : 'available')));
    const cardLevel = locked ? needTh : th;
    const count = '<span class="shop-card__count term-card__limit">' +
      have + ' / ' + limit + '</span>';
    const ptime = lesson ? lesson.seconds
      : (CC.Game.placeTime ? CC.Game.placeTime(type) : 0);
    const priceIcon = price.gold > 0 ? '🔩' : (price.elixir > 0 ? '⚡' : '');
    const costLabel = free
      ? 'Бесплатно'
      : (priceIcon ? '<i class="term-card__res">' + priceIcon + '</i> ' +
        placePriceText(price) : placePriceText(price));
    const costText = costLabel + (ptime > 0 ? ' · ' + formatTime(ptime) : '');
    const cost = '<span class="shop-card__cost term-card__cost">' + costText + '</span>';
    let status = '';
    if (locked) status = 'С командного центра ' + needTh;
    else if (full) status = 'Лимит исчерпан';
    else if (rescue) status = 'Первый склад: бесплатно';
    else if (lesson) status = 'Сержант: бесплатно';
    const statusEl = status
      ? '<span class="shop-card__req term-card__status">' + status + '</span>'
      : '<span class="term-card__status term-card__status_empty"></span>';
    let title;
    if (locked) title = lockReason;
    else if (full) title = 'Лимит исчерпан';
    else if (lesson) title = 'Сержант: бесплатно за ' + lesson.seconds + ' с';
    else if (rescue) title = 'Первый склад: бесплатно, чтобы не потерять ресурсы';
    else if (poor) {
      const lack = [];
      if (poorGold) lack.push('ещё ' + fmtNum(price.gold - CC.Game.gold()) + ' руды');
      if (poorElixir) lack.push('ещё ' + fmtNum(price.elixir - CC.Game.elixir()) + ' энергии');
      title = 'Не хватает ' + lack.join(' и ');
    } else title = d.name + (d.trap ? ' · ловушка' : '') + ' · ' + placePriceText(price);

    return '<button class="' + cls + '" data-type="' + type + '"' +
      (d.trap ? ' data-trap="1"' : '') +
      (locked ? ' data-locked="1" aria-disabled="true"' : '') +
      ' data-level="' + cardLevel + '" data-state="' + cardState + '"' +
      (full ? ' disabled' : '') + ' title="' + title + '">' +
      '<span class="term-card__banner">' +
        '<b class="shop-card__name term-card__name">' + d.name + '</b>' +
        count +
      '</span>' +
      '<span class="term-card__art-wrap">' +
        lockBadge +
        '<span class="' + iconCls + '" data-type="' + type + '">' +
          (art || icon) + '</span>' +
      '</span>' +
      '<span class="shop-card__desc term-card__desc">' + (d.desc || '') + '</span>' +
      statusEl + cost +
      '</button>';
  }

  // «400 руды», «300 энергии» или «Бесплатно» для пустой цены.
  function placePriceText(price) {
    const parts = [];
    if (price && price.gold) parts.push(fmtNum(price.gold) + ' руды');
    if (price && price.elixir) parts.push(fmtNum(price.elixir) + ' энергии');
    return parts.length ? parts.join(' · ') : '—';
  }

  // Совместимость со старыми инструментами: вкладок в терминале больше нет,
  // всегда показываем постройки. UI обмен не использует.
  function setShopTab() {
    cache.shopSig = null;
    return 'build';
  }

  /* ---------- покупка ресурсов за платину ---------- */

  // Карточка набора: 1/10/100 платины с бонусом к курсу.
  function buyResCardHtml(res, count) {
    const amount = CC.resBuyAmount
      ? CC.resBuyAmount(res, count, CC.Game.townhallLevel())
      : 0;
    const bonus = CC.resBuyBonus ? CC.resBuyBonus(count) : 1;
    const name = res === 'gold' ? 'руды' : 'энергии';
    const icon = res === 'gold' ? '🔩' : '⚡';
    const bonusText = bonus > 1
      ? ' · +' + Math.round((bonus - 1) * 100) + '%'
      : '';

    return '<button class="shop-card buy-offer" type="button"' +
      ' data-buy-res="' + res + '" data-buy-gems="' + count + '"' +
      ' data-bonus="' + bonus + '"' +
      ' title="' + fmtNum(amount) + ' ' + name + ' за ' + platText(count) + '">' +
      '<span class="shop-card__icon">' + icon + '</span>' +
      '<span class="shop-card__name">+' + fmtNum(amount) + ' ' + name + '</span>' +
      '<span class="shop-card__desc">' + platText(count) + bonusText + '</span>' +
      '<span class="shop-card__count">Купить</span>' +
      '</button>';
  }

  function buyResHtml(res) {
    const packs = (CC.RES_BUY && CC.RES_BUY.packs) || [1, 10, 100];
    return packs.map(function (n) { return buyResCardHtml(res, n); }).join('');
  }

  function buyRateText(res) {
    const th = CC.Game.townhallLevel();
    const rate = CC.gemExchange ? CC.gemExchange(res, th) : 0;
    return 'Курс TH' + th + ': 1 платина = ' + fmtNum(rate) +
      (res === 'gold' ? ' руды' : ' энергии');
  }

  // Перерисовать окно покупки ресурса и подпись про платину.
  function syncBuyResource() {
    if (!buyResOpen) return;

    const res = buyResKind === 'elixir' ? 'elixir' : 'gold';
    const th = CC.Game.townhallLevel();
    const sig = res + '|th' + th + '|g' + CC.Game.gems() +
      '|gc' + Math.round(CC.Game.cap('gold')) +
      '|ec' + Math.round(CC.Game.cap('elixir')) +
      '|gold' + Math.round(CC.Game.gold()) +
      '|elixir' + Math.round(CC.Game.elixir());

    if (buyResTitle) {
      buyResTitle.textContent = res === 'gold' ? 'Купить руду' : 'Купить энергию';
    }

    if (buyResGrid && cache.buyResSig !== sig) {
      cache.buyResSig = sig;
      const scroll = buyResGrid.scrollLeft || 0;
      buyResGrid.innerHTML = buyResHtml(res);
      if (scroll) buyResGrid.scrollLeft = scroll;
    }

    const gems = CC.Game.gems();
    const balance = 'Платина: ' + platText(gems);
    const held = res === 'elixir' ? CC.Game.elixir() : CC.Game.gold();
    const noCap = CC.Game.cap(res) <= 0;
    const full = Math.floor(CC.Game.cap(res) - held) <= 0;
    const capMsg = 'Сначала построй склад ' + (res === 'gold' ? 'руды' : 'энергии');
    const text = buyResNoteText || (noCap ? capMsg : (full ? 'Склад полон' : balance));
    const kind = buyResNoteText
      ? (buyResNoteKind || 'error')
      : (noCap ? 'no-cap' : (full ? 'full' : 'balance'));
    const hasMsg = !!buyResNoteText || full || noCap;

    if (buyResNote) {
      if (buyResNote.textContent !== text) buyResNote.textContent = text;
      // CSS-префиксы «Часть не влезет · » / «Склад полон · » вешаются на
      // классы карточки. Текст самодостаточен, поэтому не даём им
      // приклеиться к подписи: общаемся с CSS через data-note.
      buyResNote.setAttribute('data-note', kind);
      if (buyResNote.dataset) buyResNote.dataset.note = kind;
      buyResNote.classList.remove('hidden');
    }

    // Когда note занят сообщением, баланс не теряется — показываем его
    // отдельной строкой рядом с курсом (шапка окна).
    if (buyResRate) {
      const rate = buyRateText(res);
      buyResRate.textContent = hasMsg ? rate + ' · ' + balance : rate;
    }

    if (buyResEl && buyResEl.querySelector) {
      const box = buyResEl.querySelector('.buy-card');
      if (box && box.classList) {
        box.classList.remove('has-partial');
        box.classList.remove('has-full');
      }
    }
  }

  function openBuyResource(res) {
    if (CC.App.mode !== 'base') return false;
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeLevels();
    closeDaily();
    closeArena();
    closeReplays();
    closeBuyPlatinum();

    buyResKind = res === 'elixir' ? 'elixir' : 'gold';
    buyResNoteText = '';
    buyResNoteKind = '';
    cache.buyResSig = null;
    buyResOpen = true;
    if (buyResEl) buyResEl.classList.remove('hidden');
    syncBuyResource();
    return true;
  }

  function closeBuyResource() {
    buyResOpen = false;
    buyResNoteText = '';
    buyResNoteKind = '';
    cache.buyResSig = null;
    if (buyResEl) buyResEl.classList.add('hidden');
  }

  function isBuyResourceOpen() {
    return buyResOpen;
  }

  // Покупка набора из окна. Возвращает результат CC.Game.buyResource,
  // чтобы тесты и другие экраны видели цифры, а не только тост.
  function buyResource(res, count) {
    const out = CC.Game.buyResource(res, count);

    if (out.error) {
      toast(out.error);
      if (out.code === 'no-cap') {
        buyResNoteText = out.error;
        buyResNoteKind = 'no-cap';
      } else if (out.code === 'no-gems') {
        buyResNoteText = 'Не хватает ' + out.missing + ' платины';
        buyResNoteKind = 'short';
      } else if (out.code === 'full') {
        // Новый текст объясняет, сколько влезет, и не списывает платину.
        buyResNoteText = out.error;
        buyResNoteKind = 'full';
      } else {
        buyResNoteText = out.error;
        buyResNoteKind = 'error';
      }
      sync();
      return out;
    }

    buyResNoteText = '';
    buyResNoteKind = '';
    // Штатный путь: набор влёз целиком и оплачен.
    toast('Куплено: +' + fmtNum(out.got) +
      (out.res === 'gold' ? ' руды' : ' энергии'));

    sync();
    return out;
  }

  function onBuyResClick(e) {
    const card = e.target.closest('[data-buy-res]');
    if (!card || card.disabled) return;
    buyResource(card.dataset.buyRes, Number(card.dataset.buyGems));
  }

  /* ---------- платина за рубли ---------- */

  function buyPlatCardHtml(pack) {
    return '<button class="shop-card buy-offer buy-offer_rub" type="button"' +
      ' data-plat-pack="' + pack.gems + '"' +
      ' title="' + platText(pack.gems) + ' за ' + pack.rub + ' ₽">' +
      '<span class="shop-card__icon ico ico-platinum" aria-hidden="true"></span>' +
      '<span class="shop-card__name">' + platText(pack.gems) + '</span>' +
      '<span class="shop-card__desc">' + pack.rub + ' ₽</span>' +
      '<span class="shop-card__count">Купить</span>' +
      '</button>';
  }

  function syncBuyPlatinum() {
    if (!buyPlatOpen) return;
    if (buyPlatGrid && !buyPlatGrid.innerHTML) {
      const packs = (CC.RES_BUY && CC.RES_BUY.rub) || [];
      buyPlatGrid.innerHTML = packs.map(buyPlatCardHtml).join('');
    }
    if (buyPlatNote) {
      buyPlatNote.textContent = 'Оплата появится после подключения площадки';
      buyPlatNote.classList.remove('hidden');
    }
  }

  function openBuyPlatinum() {
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeLevels();
    closeDaily();
    closeArena();
    closeReplays();
    closeBuyResource();

    buyPlatOpen = true;
    if (buyPlatEl) buyPlatEl.classList.remove('hidden');
    syncBuyPlatinum();
    return true;
  }

  function closeBuyPlatinum() {
    buyPlatOpen = false;
    if (buyPlatEl) buyPlatEl.classList.add('hidden');
  }

  function isBuyPlatinumOpen() {
    return buyPlatOpen;
  }

  // Покупка платины за рубли не проводится: площадка ещё не подключена.
  function onBuyPlatClick(e) {
    const card = e.target.closest('[data-plat-pack]');
    if (!card) return;
    toast('Оплата появится после подключения площадки');
    return { ok: false, stub: true, note: 'Оплата появится после подключения площадки' };
  }

  function syncShop() {
    if (!shopOpen || !shopGrid) return;

    // Подсказка терминала: сначала — про нулевой лимит ресурса (нет склада),
    // затем — обычный онбординг TH1.
    if (shopNote) {
      let hint = '';
      const missing = [];
      if (CC.Game.cap('gold') <= 0) missing.push('Поставь склад руды');
      if (CC.Game.cap('elixir') <= 0) missing.push('Поставь склад энергии');
      if (missing.length) hint = missing.join(' · ');
      else if (CC.Game.townhallLevel() === 1) {
        hint = 'На 1 уровне доступны центр, турель и лазерная вышка.' +
          ' Улучши центр до 2, чтобы открыть 3-й бур и мину';
      }
      if (hint) {
        if (shopNote.textContent !== hint) shopNote.textContent = hint;
        shopNote.classList.remove('hidden');
      } else {
        shopNote.classList.add('hidden');
      }
    }

    // Шапка с ресурсами.
    if (shopResGold) shopResGold.textContent = fmtNum(CC.Game.gold());
    if (shopResGoldCap) {
      const gc = CC.Game.cap('gold');
      shopResGoldCap.textContent = gc > 0 ? '/' + fmtNum(gc) : ' · нет склада';
    }
    if (shopResElixir) shopResElixir.textContent = fmtNum(CC.Game.elixir());
    if (shopResElixirCap) {
      const ec = CC.Game.cap('elixir');
      shopResElixirCap.textContent = ec > 0 ? '/' + fmtNum(ec) : ' · нет склада';
    }
    if (shopResGems) shopResGems.textContent = fmtNum(CC.Game.gems());

    const tutor = CC.Game.tutorial ? CC.Game.tutorial() : null;
    if (SHOP_CATS.findIndex(function (c) { return c.id === shopCat; }) === -1) {
      shopCat = 'all';
    }

    const sig =
      CC.PALETTE.map(function (t) { return CC.Base.count(t); }).join(',') +
      '|th' + CC.Game.townhallLevel() + '|gold' + Math.round(CC.Game.gold()) +
      '|elixir' + Math.round(CC.Game.elixir()) +
      '|gems' + CC.Game.gems() +
      '|gc' + Math.round(CC.Game.cap('gold')) + '|ec' + Math.round(CC.Game.cap('elixir')) +
      '|cat' + shopCat +
      '|lesson' + (tutor && tutor.active ? tutor.id : '-');
    if (cache.shopSig === sig) return;
    cache.shopSig = sig;

    // Рейл категорий: счётчик доступных/всего.
    if (shopCats) {
      shopCats.innerHTML = SHOP_CATS.map(function (cat) {
        const types = shopCatTypes(cat.id);
        let can = 0;
        for (let i = 0; i < types.length; i++) {
          if (CC.Game.canBuild(types[i]).ok && CC.Base.left(types[i]) > 0) can++;
        }
        const active = cat.id === shopCat ? ' is-active' : '';
        return '<button class="term-cat' + active + '" type="button"' +
          ' data-shop-cat="' + cat.id + '" role="tab" aria-selected="' +
          (cat.id === shopCat ? 'true' : 'false') + '"' +
          ' onclick="CC.UI.setShopCategory(\'' + cat.id + '\')">' +
          '<span class="term-cat__icon">' +
            '<i class="term-cat__emoji" data-fallback="1">' + cat.icon + '</i>' +
            '<img class="term-cat__img" src="assets/' + cat.asset + '.svg" alt=""' +
            ' onload="var f=this.parentNode?this.parentNode.querySelector(\'[data-fallback]\'):null;' +
              'if(f)f.style.display=\'none\'"' +
            ' onerror="this.style.display=\'none\'">' +
          '</span>' +
          '<span class="term-cat__name">' + cat.name + '</span>' +
          '<span class="term-cat__count">' + can + '/' + types.length + '</span>' +
        '</button>';
      }).join('');
    }

    const shopScroll = shopGrid.scrollTop || 0;
    shopGrid.innerHTML = shopCatTypes(shopCat).map(shopCardHtml).join('');
    shopGrid.scrollLeft = 0;
    if (shopScroll) shopGrid.scrollTop = shopScroll;
  }

  function onShopClick(e) {
    const card = e.target.closest('[data-type]');
    if (!card) return;

    // Закрытая карточка не ставится, но объясняет причину.
    if (card.dataset.locked === '1' ||
        card.getAttribute('data-locked') === '1' ||
        card.dataset.state === 'locked') {
      toast(card.title || 'Сначала открой постройку');
      return;
    }
    if (card.disabled) {
      toast(card.title || 'Лимит исчерпан');
      return;
    }

    const armRes = arm(card.dataset.type);
    if (armRes.error) toast(armRes.error);
    sync();
  }

  function syncShopButton() {
    if (!shopBtn) return;
    const armed = !!state.armed;
    shopBtn.classList.toggle('hidden', armed);
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !armed);
  }

  /* ---------- установка: липкий режим ---------- */

  // Включить режим установки. Держится до отмены или исчерпания лимита.
  function arm(type) {
    if (drag) dragCancel();

    const open = CC.Game.canBuild(type);
    if (!open.ok) return { error: open.reason };
    if (CC.Base.left(type) <= 0) return { error: 'Больше не поместится' };

    state.armed = type;
    state.selected = null;
    closeShop();
    hideTip();
    updateGhost();
    return { ok: true };
  }

  function cancelArm() {
    const had = !!state.armed;
    state.armed = null;
    hoverAt = null;
    updateGhost();
    return { ok: true, had: had };
  }

  // Поставить выбранную постройку в клетку. Состояние armed сохраняется,
  // пока не кончится лимит: так забор можно ставить подряд.
  function tryPlace(gx, gy) {
    const type = state.armed;
    if (!type) return { error: 'Сначала выбери постройку' };

    if (CC.Base.left(type) <= 0) {
      cancelArm();
      toast('Больше не поместится');
      return { error: 'Больше не поместится', toasted: true };
    }

    const res = placeAt(type, gx, gy);
    if (res.error) return res;

    if (CC.Base.left(type) <= 0) {
      state.armed = null;
      hoverAt = null;
      updateGhost();
      toast('Больше не поместится');
      return {
        ok: true,
        id: res.id,
        spent: res.spent || null,
        build: res.build || null,
        limitReached: true
      };
    }

    return res;
  }

  /* ---------- перетаскивание постройки ---------- */

  function inField(d, x, y) {
    return x >= 0 && y >= 0 && x + d.w <= CC.GRID && y + d.h <= CC.GRID;
  }

  // Клетка под точкой сетки. Обратная изометрия на точной границе даёт
  // 8.999999…, поэтому добавляем крошечный допуск: иначе у 2x2 якорь
  // съезжал на клетку влево.
  function cellOf(gx, gy) {
    return {
      x: Math.floor(gx + 1e-6),
      y: Math.floor(gy + 1e-6)
    };
  }

  // Начать возможный драг: пока только запоминаем постройку и якорь.
  // Таскать можно только в режиме «Постройки»: в обычном режиме тап
  // выбирает постройку, а не переносит её случайно.
  function dragBegin(id, gx, gy) {
    if (CC.App.mode !== 'base') return { error: 'Сейчас не деревня' };
    if (askState) return { error: 'Сначала закрой окно' };
    if (!state.buildMode) return { error: 'Сначала включи режим построек' };
    if (state.armed) return { error: 'Сначала закончи установку' };

    const it = findItem(id);
    if (!it) return { error: 'Постройка не найдена' };

    const s = CC.Base.size(it.type);
    let offX = 0;
    let offY = 0;

    if (typeof gx === 'number' && typeof gy === 'number') {
      const cell = cellOf(gx, gy);
      offX = cell.x - it.x;
      offY = cell.y - it.y;
      if (offX < 0) offX = 0;
      if (offY < 0) offY = 0;
      if (offX > s.w - 1) offX = s.w - 1;
      if (offY > s.h - 1) offY = s.h - 1;
    }

    drag = {
      id: id,
      type: it.type,
      w: s.w,
      h: s.h,
      offX: offX,
      offY: offY,
      x: it.x,
      y: it.y,
      ox: it.x,
      oy: it.y,
      active: false,
      sx: 0,
      sy: 0
    };
    state.dragId = null;
    return { ok: true };
  }

  // Порог пройден — поднимаем постройку, дальше она едет за курсором.
  function dragActivate() {
    if (!drag) return { error: 'Перетаскивание не начато' };
    if (drag.active) return { ok: true };

    drag.active = true;
    drag.x = drag.ox;
    drag.y = drag.oy;
    state.dragId = drag.id;
    CC.Base.setPreview(drag.id, drag.ox, drag.oy);
    state.selected = null;
    cache.uTimer = null;
    closeQuest();
    hideTip();
    updateGhost();
    return { ok: true };
  }

  function dragAnchor(gx, gy) {
    const cell = cellOf(gx, gy);
    return {
      x: cell.x - drag.offX,
      y: cell.y - drag.offY
    };
  }

  // Ведём превью за курсором; возвращаем валидность и координаты якоря.
  function dragTarget(gx, gy) {
    if (!drag || !drag.active) return { error: 'Перетаскивание не начато' };

    const p = dragAnchor(gx, gy);
    drag.x = p.x;
    drag.y = p.y;

    const okField = inField(drag, p.x, p.y);
    const cx = Math.min(Math.max(0, p.x), CC.GRID - drag.w);
    const cy = Math.min(Math.max(0, p.y), CC.GRID - drag.h);
    CC.Base.setPreview(drag.id, cx, cy);

    return {
      ok: okField && CC.Base.fits(drag.type, p.x, p.y, drag.id),
      x: p.x,
      y: p.y,
      cx: cx,
      cy: cy,
      inField: okField
    };
  }

  // Отпускание: на валидной клетке — сразу переносим, иначе возвращаем.
  function dragDrop(gx, gy) {
    if (!drag) return { error: 'Перетаскивание не начато' };

    const d = drag;

    // короткий тап без движения — не перенос, отдаём наверх как выбор
    if (!d.active) {
      drag = null;
      state.dragId = null;
      return { tap: true, id: d.id };
    }

    const p = dragAnchor(gx, gy);
    drag = null;
    state.dragId = null;

    if (!inField(d, p.x, p.y)) {
      CC.Base.clearPreview();
      return { error: 'Мимо поля' };
    }

    const res = CC.Base.move(d.id, p.x, p.y);
    if (res.error) {
      CC.Base.clearPreview();
      return { error: 'Здесь занято' };
    }

    CC.Base.clearPreview();
    return { ok: true, id: d.id, x: p.x, y: p.y };
  }

  function dragCancel() {
    const had = !!(drag && drag.active);
    drag = null;
    state.dragId = null;
    CC.Base.clearPreview();
    updateGhost();
    return { ok: true, had: had };
  }

  function isDragging() {
    return !!(drag && drag.active);
  }

  /* ---------- призрак постройки под курсором ---------- */

  // Якорь для 2x2: пробуем сдвиги, как при обычной постановке.
  function ghostSpot(type, gx, gy) {
    const offs = offsetsFor(type);
    for (let i = 0; i < offs.length; i++) {
      const x = gx + offs[i][0];
      const y = gy + offs[i][1];
      if (CC.Base.fits(type, x, y)) return { x: x, y: y, ok: true };
    }
    return { x: gx, y: gy, ok: false };
  }

  function updateGhost() {
    if (!ghostEl) return;

    if (CC.App.mode !== 'base' || !CC.Cam || !CC.Cam.scale) {
      ghostEl.classList.add('hidden');
      return;
    }

    let type;
    let spot;

    if (drag && drag.active) {
      // при перетаскивании подсвечиваем футпринт под курсором
      type = drag.type;
      const cx = Math.min(Math.max(0, drag.x), CC.GRID - drag.w);
      const cy = Math.min(Math.max(0, drag.y), CC.GRID - drag.h);
      const okField = drag.x === cx && drag.y === cy;
      spot = {
        x: cx,
        y: cy,
        ok: okField && CC.Base.fits(type, cx, cy, drag.id)
      };
    } else {
      type = state.armed;
      if (!type || !hoverAt) {
        ghostEl.classList.add('hidden');
        return;
      }

      const g = CC.CamMath.screenToGrid(CC.Cam, hoverAt.x, hoverAt.y);
      const gx = Math.floor(g.x);
      const gy = Math.floor(g.y);

      if (gx < 0 || gy < 0 || gx >= CC.GRID || gy >= CC.GRID) {
        ghostEl.classList.add('hidden');
        return;
      }

      spot = ghostSpot(type, gx, gy);
    }

    const s = CC.Base.size(type);
    const a = screenOf(spot.x, spot.y);
    const b = screenOf(spot.x + s.w, spot.y);
    const c = screenOf(spot.x + s.w, spot.y + s.h);
    const d = screenOf(spot.x, spot.y + s.h);

    const left = Math.min(a.x, b.x, c.x, d.x);
    const top = Math.min(a.y, b.y, c.y, d.y);
    const W = Math.max(1, Math.max(a.x, b.x, c.x, d.x) - left);
    const H = Math.max(1, Math.max(a.y, b.y, c.y, d.y) - top);

    ghostEl.style.left = left + 'px';
    ghostEl.style.top = top + 'px';
    ghostEl.style.width = W + 'px';
    ghostEl.style.height = H + 'px';
    ghostEl.classList.toggle('is-bad', !spot.ok);
    ghostEl.classList.remove('hidden');

    if (ghostShape) {
      ghostShape.style.clipPath = 'polygon(' + [a, b, c, d].map(function (p) {
        return ((p.x - left) / W * 100).toFixed(2) + '% ' +
          ((p.y - top) / H * 100).toFixed(2) + '%';
      }).join(', ') + ')';
    }

    if (ghostIcon) {
      ghostIcon.textContent = CC.ICONS[type] || '';
      ghostIcon.dataset.type = type;
    }
    ghostEl.dataset.type = type;
  }

  // Enter в модале уважает фокус: на «Отмене» это отмена, а не подтверждение.
  function askEnterIsCancel(active) {
    return active === askCancel;
  }

  // Трап фокуса на две кнопки: Tab и Shift+Tab ходят по кругу.
  // Если фокус оказался вне модала, Shift+Tab ведёт на «Отмену».
  function askTabTarget(active, shift) {
    if (active === askOk) return askCancel;
    if (active === askCancel) return askOk;
    return shift ? askCancel : askOk;
  }

  function onKeyDown(e) {
    // Пока идёт заставка, сцена не слушает клавиши: Esc обрабатывает CC.Intro.
    if (CC.App.introOpen) return;

    // открытый модал забирает Enter/Esc/Tab, остальные окна не трогаем
    if (askState) {
      if (e.key === 'Escape') {
        e.preventDefault();
        askClose(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        askClose(!askEnterIsCancel(document.activeElement));
      } else if (e.key === 'Tab') {
        // фокус не уходит на сцену и в HUD — только между кнопками модала
        e.preventDefault();
        const next = askTabTarget(document.activeElement, e.shiftKey);
        try {
          if (next && next.focus) next.focus();
        } catch (err) { /* фокус не критичен */ }
      }
      return;
    }

    // Q (и й на русской раскладке) — щит героя. Работает только в бою.
    if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') {
      if (CC.App.mode !== 'battle') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.preventDefault) e.preventDefault();
      heroAbility();
      return;
    }

    if (e.key !== 'Escape') return;

    if (recruitOpen) {
      closeRecruit();
      sync();
      return;
    }

    if (buyResOpen) {
      closeBuyResource();
      sync();
      return;
    }

    if (buyPlatOpen) {
      closeBuyPlatinum();
      sync();
      return;
    }

    if (dailyOpen) {
      closeDaily();
      sync();
      return;
    }

    if (shopOpen) {
      closeShop();
      sync();
      return;
    }

    if (state.buildMode) {
      setBuildMode(false);
      return;
    }

    if (state.armed) {
      cancelArm();
      sync();
    }
  }

  /* ---------- панель выбранной постройки ---------- */

  function findItem(id) {
    return CC.Base.list().find(function (o) { return o.id === id; }) || null;
  }

  // Снос вынесен отдельно: подтверждение асинхронное, а действие одно.
  function removeBuilding(id) {
    const res = CC.Base.remove(id);
    if (res && res.error) {
      toast(res.error);
      return res;
    }
    state.selected = null;
    invalidate();
    if (CC.CamBaseChanged) CC.CamBaseChanged();
    toast('Постройка убрана');
    sync();
    return res;
  }

  // Состав базы изменился (постановка, снос, перенос) — сбрасываем
  // кеши панели, чтобы лимит армии и характеристики пересчитались.
  function invalidate() {
    cache.shopSig = null;
    cache.armyHead = null;
    cache.qhead = null;
    cache.trainSig = null;
    cache.troopSig = null;
    cache.heroSig = null;
    cache.queueSig = null;
    cache.selLevel = null;
    cache.selStats = null;
    cache.upSig = null;
    cache.uTimer = null;
    cache.bpanelSig = null;
    cache.qSpeed = null;
    cache.gems = null;
  }

  function describe(type, s) {
    const parts = [];

    if (type === 'townhall') {
      parts.push('Центр ' + s.level + ' из ' + s.max +
        (s.level < s.max ? ' · до ур. ' + (s.level + 1) : ''));
    } else if (type === 'goldmine') {
      parts.push('Добыча ' + s.production + ' руды/с');
      if (s.extractCap) parts.push('в буре ' + Math.floor(s.stored) + ' из ' + s.extractCap);
    } else if (type === 'elixir') {
      parts.push('Добыча ' + s.production + ' энергии/с');
      if (s.extractCap) parts.push('в реакторе ' + Math.floor(s.stored) + ' из ' + s.extractCap);
    } else if (type === 'storage') {
      parts.push('Хранит руду');
      parts.push('лимит ' + fmtNum(s.capGold));
      parts.push('вклад в общий ' + fmtNum(CC.Game.cap('gold')));
    } else if (type === 'estorage') {
      parts.push('Хранит энергию');
      parts.push('лимит ' + fmtNum(s.capElixir));
      parts.push('вклад в общий ' + fmtNum(CC.Game.cap('elixir')));
    } else if (type === 'barracks') {
      parts.push('Мест в армии +' + s.capacity);
      parts.push('тренирует параллельно');
    } else if (type === 'lab') {
      parts.push('Исследования −5%/ур.');
    } else if (type === 'herohall') {
      parts.push('Прокачка героя −5%/ур.');
    }

    // Ловушки: понятная подпись вместо «прочности 1». Уровень уже стоит
    // отдельной плашкой, здесь — эффект, радиус и цель.
    if (s.trap) {
      if (type === 'spring') {
        parts.push('Сработает при подходе');
        parts.push('Подбрасывает до ' + s.capacity + ' веса');
        parts.push('Радиус ' + s.radius);
      } else {
        parts.push('Сработает при подходе');
        parts.push('Урон ' + s.dmg);
        parts.push('Радиус ' + s.radius);
        parts.push(type === 'mine' ? 'только земля' : 'только воздух');
      }
    } else {
      if (s.dmg) parts.push('Урон ' + s.dmg);
      if (s.range) parts.push('Дальность ' + s.range);
      if (s.minRange) parts.push('Мин. дальность ' + s.minRange);
      parts.push('Прочность ' + s.hp);
    }

    if (type === 'ambush') {
      parts.push('Скрыта до ' + (s.revealRange || 2.5) + ' тайла');
    }
    if (s.beam) {
      parts.push('Непрерывный луч · заряд до ×' + (s.rampMax || 3));
    }

    return parts.join(' · ');
  }

  function spaceWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'место';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'места';
    return 'мест';
  }

  function priceText(cost) {
    if (!cost) return '';
    const parts = [];
    if (cost.gold) parts.push('🔩 ' + cost.gold);
    if (cost.elixir) parts.push('⚡ ' + cost.elixir);
    if (cost.time > 0) parts.push('· ' + formatTime(cost.time));
    else parts.push('· мгновенно');
    return parts.join(' ');
  }

  function upgradeLine(id) {
    const build = CC.Game.buildInfo(id);

    // Стройплощадка: улучшать нельзя, зато есть таймер и «Ускорить».
    if (build) {
      const speed = CC.Game.buildSpeedCost(id);
      const gems = CC.Game.gems();
      const sig = 'building:' + id + ':' + Math.ceil(build.left) +
        ':' + (speed ? speed.gems : 0) + ':' + gems;
      if (cache.upSig === sig) return;
      cache.upSig = sig;

      selTimer.classList.remove('hidden');
      selTimer.textContent = 'Строится · осталось ' + formatTime(build.left);
      selUpgrade.disabled = true;
      selUpgrade.textContent = 'Строится';
      selPrice.textContent = '';
      selNote.textContent = 'Модуль начнёт работать после завершения стройки';
      selNote.title = selNote.textContent;
      selNote.classList.remove('hidden');
      selNote.classList.add('is-warn');
      if (selGoto) selGoto.classList.add('hidden');
      if (selGotoStorage) selGotoStorage.classList.add('hidden');

      if (selUpgradeSpeed) {
        if (speed) {
          selUpgradeSpeed.classList.remove('hidden');
          selUpgradeSpeed.disabled = gems < speed.gems;
          selUpgradeSpeed.textContent = 'Ускорить за ' + platAcc(speed.gems);
          selUpgradeSpeed.title = gems < speed.gems
            ? 'Нужно ещё ' + platText(speed.gems - gems)
            : 'Достроить мгновенно';
        } else {
          selUpgradeSpeed.classList.add('hidden');
        }
      }
      return;
    }

    const busy = CC.Game.upgradeInfo(id);
    const speed = busy ? CC.Game.upgradeSpeedCost(id) : null;
    const gems = CC.Game.gems();

    let sig;
    let disabled;
    let label;
    let price = '';
    let note = '';
    let gotoTh = false;
    let gotoStorage = false;
    let storageRes = '';

    if (busy) {
      sig = 'busy:' + busy.to + ':' + (speed ? speed.gems : 0) + ':' + gems;
      disabled = true;
      label = 'Улучшается до ур. ' + busy.to;
    } else {
      const check = CC.Game.canUpgrade(id);
      const cost = check.cost || null;
      const isHall = (findItem(id) || {}).type === 'townhall';

      if (check.ok) {
        sig = 'ok:' + cost.gold + ':' + cost.elixir + ':' + cost.time;
        disabled = false;
        label = isHall
          ? 'Улучшить до ур. ' + (CC.Game.level(id) + 1)
          : 'Улучшить';
        price = priceText(cost);
      } else if (check.needTh) {
        sig = 'need:' + check.needTh;
        disabled = true;
        label = 'Улучшить';
        note = 'Нужен командный центр ур. ' + check.needTh;
        price = '';
        gotoTh = true;
      } else if (check.reason === 'Все строители заняты') {
        sig = 'builders:' + Math.ceil(check.wait || 0);
        disabled = true;
        label = 'Улучшить';
        note = 'Все строители заняты' +
          (check.wait !== null && check.wait !== undefined
            ? ' · свободен через ' + formatTime(check.wait)
            : '');
        price = priceText(cost);
      } else if (check.needStorage) {
        sig = 'storage:' + check.resource + ':' + check.cap + ':' +
          (cost ? cost.gold + ':' + cost.elixir : '');
        disabled = true;
        label = 'Улучшить';
        note = check.reason;
        price = priceText(cost);
        gotoStorage = true;
        storageRes = check.resource || '';
      } else if (check.reason === 'Максимальный уровень') {
        sig = 'max';
        disabled = true;
        label = 'Максимальный уровень';
        price = '';
      } else {
        sig = 'block:' + (check.reason || '');
        disabled = true;
        label = 'Улучшить';
        note = check.reason || '';
        price = priceText(cost);
      }
    }

    if (cache.upSig === sig) return;
    cache.upSig = sig;

    selTimer.classList.toggle('hidden', !busy);
    selUpgrade.disabled = disabled;
    selUpgrade.textContent = label;
    selPrice.textContent = price;

    if (selUpgradeSpeed) {
      if (busy && speed) {
        selUpgradeSpeed.classList.remove('hidden');
        selUpgradeSpeed.disabled = gems < speed.gems;
        selUpgradeSpeed.textContent = 'Ускорить за ' + platAcc(speed.gems);
        selUpgradeSpeed.title = gems < speed.gems
          ? 'Нужно ещё ' + platText(speed.gems - gems)
          : 'Завершить улучшение мгновенно';
      } else {
        selUpgradeSpeed.classList.add('hidden');
      }
    }

    if (selNote) {
      selNote.textContent = note;
      selNote.title = note;
      selNote.classList.toggle('hidden', !note);
      selNote.classList.toggle('is-warn', gotoTh || note.indexOf('строители') !== -1);
    }

    if (selGoto) {
      selGoto.classList.toggle('hidden', !gotoTh);
      if (gotoTh) selGoto.textContent = 'К командному центру';
    }

    if (selGotoStorage) {
      selGotoStorage.classList.toggle('hidden', !gotoStorage);
      if (gotoStorage) {
        selGotoStorage.textContent = storageRes === 'elixir'
          ? 'К складу энергии'
          : 'К складу руды';
        selGotoStorage.dataset.res = storageRes;
      }
    }
  }

  function syncPanelTimer(id) {
    const build = CC.Game.buildInfo(id);
    if (build) {
      const text = 'Строится · осталось ' + formatTime(build.left);
      if (cache.uTimer !== text) {
        selTimer.textContent = text;
        cache.uTimer = text;
      }
      if (selProgress) {
        selProgress.classList.remove('hidden');
        if (selProgressFill) {
          selProgressFill.style.width = (build.progress * 100).toFixed(1) + '%';
        }
      }
      return;
    }

    if (selProgress) selProgress.classList.add('hidden');

    const info = CC.Game.upgradeInfo(id);
    if (!info) return;

    const text = 'Улучшение ' + formatTime(info.left) + ' осталось';
    if (cache.uTimer !== text) {
      selTimer.textContent = text;
      cache.uTimer = text;
    }
  }

  function syncSelbar() {
    const id = state.selected;
    if (!id) {
      selbar.classList.add('hidden');
      return;
    }

    const it = findItem(id);
    if (!it) {
      selbar.classList.add('hidden');
      return;
    }

    selbar.classList.remove('hidden');
    const prevType = selbar.dataset.type;
    selbar.dataset.type = it.type;
    // Новая постройка открывается с верха панели, а не с чужой прокрутки.
    if (prevType !== it.type) {
      selbar.scrollTop = 0;
      selbar.classList.remove('is-info-open');
    }
    const wide = it.type === 'barracks' || it.type === 'lab' || it.type === 'herohall';
    selbar.classList.toggle('is-strip', !wide);
    if (selInfo) {
      const open = selbar.classList.contains('is-info-open');
      const label = open ? 'Скрыть' : 'Инфо';
      if (selInfo.textContent !== label) selInfo.textContent = label;
      selInfo.classList.toggle('is-active', open);
    }

    if (selIcon) {
      if (selIcon.dataset.type !== it.type) {
        selIcon.dataset.type = it.type;
        selIcon.textContent = CC.ICONS[it.type] || '';
      }
    }

    selName.textContent = CC.BUILDINGS[it.type].name;
    selLevel.classList.remove('hidden');
    selStats.classList.remove('hidden');
    selUp.classList.remove('hidden');
    selArmy.classList.add('hidden');
    if (labUp) labUp.classList.add('hidden');
    if (selHero) selHero.classList.add('hidden');

    const s = CC.Game.stats(id);
    if (s) {
      const lvl = 'Ур. ' + s.level;
      if (cache.selLevel !== lvl) {
        selLevel.textContent = lvl;
        cache.selLevel = lvl;
      }

      const bi = CC.Game.buildInfo(id);
      const desc = bi
        ? 'Строится · осталось ' + formatTime(bi.left)
        : describe(it.type, s);
      if (cache.selStats !== desc) {
        selStats.textContent = desc;
        cache.selStats = desc;
      }
    }

    upgradeLine(id);
    syncPanelTimer(id);

    if (it.type === 'barracks') {
      selArmy.classList.remove('hidden');
      syncTraining();
    } else if (it.type === 'lab') {
      if (labUp) labUp.classList.remove('hidden');
      syncTroopUpgrade();
    } else if (it.type === 'herohall') {
      if (selHero) selHero.classList.remove('hidden');
      syncHeroCard();
    } else {
      cache.trainSig = null;
      cache.queueSig = null;
      cache.troopSig = null;
      cache.heroSig = null;
    }
  }

  /* ---------- карусели карточек ---------- */

  // Шаг прокрутки — ровно одна карточка плюс зазор, чтобы снап не «прыгал».
  function carouselStep(el) {
    if (!el) return 160;

    let card = null;
    try {
      card = el.querySelector ? el.querySelector('.tcard, .shop-card') : null;
    } catch (e) {
      card = null;
    }

    let w = 0;
    if (card && card.getBoundingClientRect) {
      w = card.getBoundingClientRect().width || 0;
    }
    if (w <= 0 && el.clientWidth) w = el.clientWidth * 0.82;
    return Math.max(120, Math.round(w + 8));
  }

  function scrollCarousel(el, dir) {
    if (!el) return { error: 'Лента не найдена' };
    const step = carouselStep(el) * (dir < 0 ? -1 : 1);

    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left: step, behavior: 'smooth' });
    } else {
      el.scrollLeft = (el.scrollLeft || 0) + step;
    }
    return { ok: true, step: step };
  }

  // ←/→ при фокусе на ленте. PageUp/PageDown не перехватываем.
  function onCarouselKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.preventDefault) e.preventDefault();
    scrollCarousel(e.currentTarget || e.target, e.key === 'ArrowRight' ? 1 : -1);
  }

  /* ---------- тренировка ---------- */

  // Счётчик армии живёт в общем sync, а не только в панели ангары:
  // после загрузки/переноса/апгрейда он должен быть верным сразу.
  function battleArmySpace() {
    const S = CC.Battle && CC.Battle.state;
    if (!S || !S.army) return 0;

    let n = 0;
    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const t = CC.ARMY_ORDER[i];
      n += (S.army[t] | 0) * (CC.TROOPS[t].space || 1);
    }
    return n;
  }

  function syncArmyCounter() {
    const battle = CC.App.mode === 'battle' && CC.Battle && CC.Battle.state;
    const cap = CC.Game.capacity();
    const used = battle ? battleArmySpace() : CC.Game.armyUsed();
    const queued = battle ? 0 : CC.Game.queuedSpace();
    const qs = CC.Game.queueStats ? CC.Game.queueStats() : null;

    const line = used + '/' + cap;
    if (armyCapEl.textContent !== line) armyCapEl.textContent = line;

    // Очередь без «дробей»: «6 в очереди · 1 слот».
    const slots = qs ? Math.max(0, qs.slots | 0) : 0;
    const qline = battle || !qs
      ? '0 в очереди · 0 слотов'
      : qs.queued + ' в очереди · ' + slots + ' ' + slotWord(slots);
    if (armyQueueEl.textContent !== qline) armyQueueEl.textContent = qline;

    if (hudArmyUsed) {
      const u = String(used);
      if (hudArmyUsed.textContent !== u) hudArmyUsed.textContent = u;
    }
    if (hudArmyCap) {
      const c = ' / ' + cap;
      if (hudArmyCap.textContent !== c) hudArmyCap.textContent = c;
    }
    if (hudArmyBar) {
      const fill = cap > 0 ? Math.min(100, (used + queued) / cap * 100) : 0;
      const w = fill.toFixed(0) + '%';
      if (hudArmyBar.style.width !== w) hudArmyBar.style.width = w;
    }
  }

  // Карточка героя в ангаре. Живёт первой в карусели войск: уровень,
  // HP/урон, цена в руде, время и кнопка «Улучшить». Отдельный слот, поэтому
  // не блокируется исследованием войск и не занимает строителей.
  function heroCardHtml(th) {
    const H = CC.HERO || { minTh: 5, ability: {} };
    const d = CC.TROOPS.hero || {
      name: 'Сержант', icon: '🎖️', color: '#c9a227'
    };
    const minTh = H.minTh || 5;
    const lvl = CC.Game.heroLevel();
    const heroArtLvl = (th < minTh || lvl < 1) ? 1 : lvl;
    const heroArt = cardArt('troop', 'hero', 72, heroArtLvl, 'tcard__art');
    const icon = '<span class="tcard__icon cc-icon' + (heroArt ? ' has-art' : '') + '"' +
      ' data-type="hero"' +
      ' style="background:' + d.color + '">' + (heroArt || d.icon) + '</span>';

    if (th < minTh || lvl < 1) {
      return '<div class="tcard tcard_hero is-locked" data-hero="1"' +
        ' data-hero-locked="1" aria-disabled="true"' +
        ' title="' + d.name + ' · откроется на ' + minTh + ' уровне центра">' +
        '<span class="tcard__lock" aria-hidden="true">🔒</span>' +
        icon +
        '<span class="tcard__name">' + d.name + '</span>' +
        '<span class="tcard__desc">Щит 3 с на союзников · 1 раз за бой</span>' +
        '<span class="tcard__cost">с центра ' + minTh + '</span>' +
        '</div>';
    }

    const st = CC.Game.heroStats(lvl);
    const up = CC.Game.heroUpInfo();
    const cost = CC.Game.heroUpgradeCost();
    const check = CC.Game.canUpgradeHero();
    const ability = (H.ability && H.ability.hint) || 'Щит 3 с на союзников · 1 раз за бой';

    let extra;
    if (up) {
      // Кнопка ускорения показывает цену с учётом потолка (не больше 80).
      const speed = CC.Game.heroSpeedCost ? CC.Game.heroSpeedCost() : null;
      const gems = CC.Game.gems();
      const gemsOk = !speed || gems >= speed.gems;
      const speedBtn = speed
        ? '<button class="tcard__hire tcard__speed" data-hero-speed="1"' +
          (gemsOk ? '' : ' disabled') +
          ' title="' + (gemsOk
            ? 'Завершить прокачку мгновенно'
            : 'Нужно ещё ' + platText(speed.gems - gems)) + '">' +
          '<span class="ico ico-platinum" aria-hidden="true"></span>' +
          ' Ускорить за ' + speed.gems + '</button>'
        : '';
      extra = '<span class="tcard__meta">Ур. ' + lvl + ' → ' + up.to +
        ' · ' + formatTime(up.left) + '</span>' +
        '<i class="hero-card__bar"><b style="width:' +
        Math.round(up.progress * 100) + '%"></b></i>' +
        '<span class="tcard__actions">' +
        '<button class="tcard__hire" disabled title="Идёт прокачка">Идёт</button>' +
        speedBtn +
        '</span>';
    } else {
      const price = cost
        ? '🪙 ' + fmtNum(cost.gold) + ' руды · ' + formatTime(cost.time)
        : 'Максимальный уровень';
      let btn;
      if (check.ok) {
        btn = '<button class="tcard__hire" data-hero-up="1">Улучшить</button>';
      } else {
        let label = 'Улучшить';
        if (check.busy) label = 'Занято';
        else if (check.needTh) label = 'Центр ' + check.needTh;
        else if (check.needHeroHall) label = 'Нет академии';
        else if (check.reason === 'Максимальный уровень') label = 'Макс.';
        else if (check.missing) label = 'Нет руды';
        btn = '<button class="tcard__hire" disabled title="' +
          (check.reason || '') + '">' + label + '</button>';
      }
      extra = '<span class="tcard__meta">' + price + '</span>' +
        '<span class="tcard__actions">' + btn + '</span>';
    }

    return '<div class="tcard tcard_hero" data-hero="1"' +
      ' title="' + d.name + ' · ур. ' + lvl + ' · ' + ability + '">' +
      icon +
      '<span class="tcard__name">' + d.name + ' · ур. ' + lvl + '</span>' +
      '<span class="tcard__desc">' + ability + '</span>' +
      '<span class="tcard__meta">HP ' + fmtNum(st.hp) +
      ' · урон ' + fmtNum(st.dmg) + '</span>' +
      extra +
      '</div>';
  }

  function syncTraining() {
    syncArmyCounter();

    const cap = CC.Game.capacity();
    const queue = CC.Game.queueInfo();
    const parallel = CC.Game.trainSlots();
    const stats = CC.Game.queueStats ? CC.Game.queueStats() : null;
    const elixir = CC.Game.elixir();
    const th = CC.Game.townhallLevel();
    const maxLvl = (CC.TROOP_LEVEL && CC.TROOP_LEVEL.max) || 10;
    const armySig = CC.ARMY_ORDER.map(function (t) {
      const need = CC.troopUnlock ? CC.troopUnlock(t) : 1;
      return CC.Game.state.army[t] + ':' + (CC.Game.canTrain(t).error ? 1 : 0) +
        ':' + need + ':' + CC.Game.batchFit(t) + ':' + CC.Game.troopLevel(t);
    }).join(',') + '|' + cap + '|' + parallel + '|' + queue.length + '|' +
      CC.Game.queuedSpace() + '|' +
      Math.floor(elixir / 10) + '|th' + th + '|sel' + (state.trainSel || '');

    if (cache.trainSig !== armySig) {
      cache.trainSig = armySig;

      // Сетка найма живёт в отдельном окне и обновляется своим syncRecruit.
      if (recruitOpen) syncRecruit();
    }

    const queueSig = queue.map(function (q) {
      return q.type + Math.ceil(q.left) + ':' + q.slot + ':' + (q.active ? 1 : 0);
    }).join(',');

    if (cache.queueSig !== queueSig) {
      cache.queueSig = queueSig;

      trainQueue.innerHTML = queue.length
        ? queue.map(function (q) {
          const d = CC.TROOPS[q.type];
          return '<div class="qrow' + (q.active ? ' is-active' : '') +
            '" data-type="' + q.type + '" data-slot="' + (q.slot + 1) + '">' +
            '<span class="qrow__icon cc-icon" data-type="' + q.type + '">' + d.icon + '</span>' +
            '<span class="qrow__name">' + d.name + '</span>' +
            '<span class="qrow__slot">' + (q.active ? 'тренируется' : 'ждёт') + '</span>' +
            '<span class="qrow__time">' + formatTime(q.left) + '</span>' +
            '<button class="qrow__x" data-qcancel="' + q.index + '">✕</button>' +
            '</div>';
        }).join('')
        : '<div class="qrow qrow_empty">Очередь пуста' +
          (stats && stats.slots ? ' · ' + stats.slots + ' ' + slotWord(stats.slots) : '') + '</div>';
    }

    if (speedTrainBtn) {
      const sp = CC.Game.queueSpeedCost();
      const gems = CC.Game.gems();
      const speedSig = sp ? 'q' + sp.gems + ':' + Math.ceil(sp.left) + ':' + gems : 'none';

      if (cache.qSpeed !== speedSig) {
        cache.qSpeed = speedSig;

        if (sp) {
          speedTrainBtn.classList.remove('hidden');
          speedTrainBtn.disabled = gems < sp.gems;
          speedTrainBtn.textContent = 'Ускорить за ' + platAcc(sp.gems);
          speedTrainBtn.title = gems < sp.gems
            ? 'Нужно ещё ' + platText(sp.gems - gems)
            : 'Доучить ближайшего юнита мгновенно';
        } else {
          speedTrainBtn.classList.add('hidden');
        }
      }
    }
  }

  /* ---------- окно найма ---------- */

  function troopPortrait(type, size, level, cls) {
    const d = CC.TROOPS[type] || {};
    const art = cardArt('troop', type, size, level, cls + '__art');
    // cls приходит как recruit-card__portrait / recruit-hero__portrait.
    // Канонический класс картинки — recruit-card__img / recruit-hero__img;
    // дублируем фактический __portrait__img, чтобы старые вызовы не ломались.
    const base = cls.indexOf('recruit-hero') === 0 ? 'recruit-hero' : 'recruit-card';
    const imgCls = base + '__img ' + cls + '__img';
    const icon = '<span class="' + cls + '__icon cc-icon" data-type="' + type +
      '" data-fallback="1" style="background:' + (d.color || '#6b5a45') + '">' +
      (art || d.icon || '?') + '</span>';
    return '<span class="' + cls + '">' + icon +
      '<img class="' + imgCls + '" src="assets/portraits/' + type + '.png"' +
      ' alt="" width="' + size + '" height="' + size + '" draggable="false"' +
      ' decoding="async"' +
      ' onload="if(this.parentNode&&this.parentNode.firstElementChild)this.parentNode.firstElementChild.style.display=\'none\'"' +
      ' onerror="this.style.display=\'none\'">' +
      '</span>';
  }

  function recruitCardHtml(type) {
    const d = CC.TROOPS[type];
    const th = CC.Game.townhallLevel();
    const need = CC.troopUnlock ? CC.troopUnlock(type) : 1;
    const locked = th < need;
    const lvl = locked ? 1 : CC.Game.troopLevel(type);
    const bad = locked ? null : CC.Game.canTrain(type).error;
    const space = d.space || 1;
    const selected = state.trainSel === type ? ' is-selected' : '';
    const cls = 'recruit-card' + (locked ? ' is-locked' : '') +
      (bad ? ' is-off' : '') + selected;

    return '<button class="' + cls + '" type="button" data-recruit="' + type + '"' +
      (locked ? ' data-locked="1" aria-disabled="true"' : '') +
      ' title="' + escHtml(d.name + ' · ' + (d.desc || '')) + '">' +
      troopPortrait(type, 84, lvl, 'recruit-card__portrait') +
      '<span class="recruit-card__body">' +
        '<b class="recruit-card__name">' + escHtml(d.name) + '</b>' +
        '<span class="recruit-card__lvl">Ур. ' + lvl + '</span>' +
        '<span class="recruit-card__meta">⚡' + fmtNum(d.cost) + ' · ' +
          space + ' ' + spaceWord(space) + ' · ' + d.time + 'с</span>' +
      '</span>' +
      (locked
        ? '<span class="recruit-card__lock">🔒 С центра ' + need + '</span>'
        : (bad ? '<span class="recruit-card__off">' + escHtml(bad) + '</span>' : '')) +
      '</button>';
  }

  function bindRecruitPortraits(root) {
    if (!root || !root.querySelectorAll) return;
    const imgs = root.querySelectorAll(
      '.recruit-card__img, .recruit-hero__img, ' +
      '.recruit-card__portrait__img, .recruit-hero__portrait__img');
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const hideFallback = function () {
        const p = img.parentNode;
        if (p && p.firstElementChild) p.firstElementChild.style.display = 'none';
      };
      img.onload = hideFallback;
      img.onerror = function () { img.style.display = 'none'; };
      // Картинка могла быть в кэше и загрузиться до назначения onload.
      if (img.complete && img.naturalWidth > 0) hideFallback();
    }
  }

  function syncRecruit() {
    if (!recruitOpen || !recruitGrid || !recruitSide) return;

    const th = CC.Game.townhallLevel();
    const queue = CC.Game.queueInfo();
    const stats = CC.Game.queueStats();
    const sel = state.trainSel && CC.TROOPS[state.trainSel] ? state.trainSel
      : (CC.ARMY_ORDER[0] || 'barb');
    const d = CC.TROOPS[sel];
    const need = CC.troopUnlock ? CC.troopUnlock(sel) : 1;
    const locked = th < need;
    const lvl = locked ? 1 : CC.Game.troopLevel(sel);
    const st = CC.Game.troopStats(sel) || { hp: d.hp, dmg: d.dmg, level: lvl };
    const check = CC.Game.canTrain(sel);
    const fit = CC.Game.batchFit(sel);
    const used = CC.Game.armyUsed();
    const cap = CC.Game.capacity();
    const qSlots = Math.max(1, stats.slots || CC.Game.trainSlots() || 1);
    const queued = stats.queued || 0;
    const training = stats.training || 0;

    const sig = [sel, th, lvl, used, cap, queued, training,
      queue.map(function (q) { return q.type + Math.ceil(q.left) + ':' + q.slot; }).join(','),
      CC.Game.elixir(), check.ok ? 1 : 0, fit, CC.Game.gems()].join('|');
    if (cache.recruitSig === sig) return;
    cache.recruitSig = sig;

    if (recruitSub) {
      recruitSub.textContent = 'Армия ' + used + '/' + cap + ' · ' + queued +
        ' в очереди · ' + qSlots + ' ' + slotWord(qSlots);
    }

    recruitGrid.innerHTML = CC.ARMY_ORDER.map(recruitCardHtml).join('');
    bindRecruitPortraits(recruitGrid);

    const armyPct = cap > 0 ? Math.round(used / cap * 100) : 0;
    const queuePct = Math.round(Math.min(1, queued / qSlots) * 100);
    const price = '⚡ ' + fmtNum(d.cost) + ' · ' + d.time + 'с';

    const mini = queue.length
      ? queue.slice(0, 4).map(function (q) {
        const qd = CC.TROOPS[q.type];
        return '<div class="recruit-q' + (q.active ? ' is-active' : '') + '">' +
          '<span class="recruit-q__icon cc-icon" data-type="' + q.type +
            '" style="background:' + qd.color + '">' + qd.icon + '</span>' +
          '<span class="recruit-q__name">' + escHtml(qd.name) + '</span>' +
          '<span class="recruit-q__time">' + formatTime(q.left) + '</span>' +
          '<button class="recruit-q__x" type="button" data-qcancel="' + q.index +
            '" title="Отменить">✕</button>' +
        '</div>';
      }).join('')
      : '<p class="recruit-q recruit-q_empty">Очередь пуста' +
        (stats.slots ? ' · ' + stats.slots + ' ' + slotWord(stats.slots) : '') + '</p>';

    let action;
    if (locked) {
      action = '<button class="recruit-hire" type="button" disabled>' +
        'С центра ' + need + '</button>';
    } else if (check.error) {
      action = '<button class="recruit-hire" type="button" disabled title="' +
        escHtml(check.error) + '">' + escHtml(check.error) + '</button>';
    } else {
      action = '<button class="recruit-hire" type="button" data-recruit-hire="' + sel +
        '">Нанять</button>';
    }
    const batchLabel = fit > 0 ? '×' + fit : '×5';
    const batch = '<button class="recruit-batch" type="button" data-recruit-batch="' + sel + '"' +
      (locked || fit < 1 ? ' disabled' : '') +
      ' title="' + (fit > 0 ? 'Нанять до ' + fit : 'Нет места или энергии') + '">' +
      batchLabel + '</button>';

    recruitSide.innerHTML =
      '<div class="recruit-hero' + (locked ? ' is-locked' : '') + '">' +
        troopPortrait(sel, 156, lvl, 'recruit-hero__portrait') +
        '<div class="recruit-hero__who">' +
          '<b class="recruit-hero__name">' + escHtml(d.name) + '</b>' +
          '<span class="recruit-hero__role">' + escHtml(d.desc || '') + '</span>' +
          '<span class="recruit-hero__lvl">Ур. ' + lvl + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="recruit-stats">' +
        '<span class="recruit-stat"><b>' + fmtNum(st.hp) + '</b><i>HP</i></span>' +
        '<span class="recruit-stat"><b>' + fmtNum(st.dmg) + '</b><i>Урон</i></span>' +
        '<span class="recruit-stat"><b>' + (d.space || 1) + '</b><i>Место</i></span>' +
      '</div>' +
      '<div class="recruit-limits">' +
        '<div class="recruit-limit">' +
          '<span>Армия <b id="recruit-army">' + used + '/' + cap + '</b></span>' +
          '<i class="recruit-limit__bar"><b style="width:' + armyPct + '%"></b></i>' +
        '</div>' +
        '<div class="recruit-limit">' +
          '<span>Очередь <b id="recruit-queue">' + queued + ' в очереди · ' +
            qSlots + ' ' + slotWord(qSlots) + '</b></span>' +
          '<i class="recruit-limit__bar"><b style="width:' + queuePct + '%"></b></i>' +
        '</div>' +
        '<div class="recruit-train-line">Тренируется <b id="recruit-training">' +
          training + '</b> · свободно <b id="recruit-free">' +
          Math.max(0, cap - used - (stats.space || 0)) + '</b></div>' +
      '</div>' +
      '<p class="recruit-price">' + price + '</p>' +
      '<div class="recruit-actions">' + action + batch + '</div>' +
      '<div class="recruit-minihead">Очередь <span>' + queued + ' · ' +
        qSlots + ' ' + slotWord(qSlots) + '</span></div>' +
      '<div class="recruit-queue">' + mini + '</div>' +
      '<p class="recruit-hint">Улучшение войск — в Исследовательском центре</p>';
    bindRecruitPortraits(recruitSide);
  }

  function openRecruit(type) {
    if (CC.App.mode === 'battle') setMode('base');
    if (!CC.Game.trainSlots()) {
      toast('Нужен ангар');
      return { error: 'Нужен ангар' };
    }

    const th = CC.Game.townhallLevel();
    const pick = type && CC.TROOPS[type] ? type
      : (state.trainSel && CC.TROOPS[state.trainSel] ? state.trainSel
        : (CC.ARMY_ORDER.find(function (t) {
          return (CC.troopUnlock ? CC.troopUnlock(t) : 1) <= th;
        }) || CC.ARMY_ORDER[0]));
    state.trainSel = pick;
    recruitOpen = true;
    cache.recruitSig = null;
    if (recruitEl) recruitEl.classList.remove('hidden');
    // Окно найма перекрывает низ экрана: Сержант не должен выглядывать.
    if (sergeantEl) sergeantEl.classList.add('hidden');
    if (recruitSub) {
      const qs = CC.Game.queueStats();
      recruitSub.textContent = 'Армия ' + CC.Game.armyUsed() + '/' + CC.Game.capacity() +
        ' · ' + qs.queued + ' в очереди · ' + qs.slots + ' ' + slotWord(qs.slots);
    }
    syncRecruit();
    return { ok: true, selected: pick };
  }

  function closeRecruit() {
    recruitOpen = false;
    cache.recruitSig = null;
    if (recruitEl) recruitEl.classList.add('hidden');
  }

  function onRecruitClick(e) {
    const card = e.target.closest('[data-recruit]');
    if (card) {
      state.trainSel = card.dataset.recruit;
      cache.recruitSig = null;
      syncRecruit();
      return;
    }

    const hire = e.target.closest('[data-recruit-hire]');
    if (hire) {
      const type = hire.dataset.recruitHire;
      const res = CC.Game.train(type);
      if (res.error) toast(res.error);
      else if (CC.Sound) CC.Sound.play('train');
      cache.recruitSig = null;
      syncRecruit();
      sync();
      return;
    }

    const batch = e.target.closest('[data-recruit-batch]');
    if (batch) {
      const type = batch.dataset.recruitBatch;
      const fit = CC.Game.batchFit(type);
      if (!fit) {
        toast(CC.Game.canTrain(type).error || 'Нет места в армии');
        return;
      }
      const res = CC.Game.trainBatch(type, fit);
      if (res.error) toast(res.error);
      else if (CC.Sound) CC.Sound.play('train');
      cache.recruitSig = null;
      syncRecruit();
      sync();
      return;
    }

    const cancel = e.target.closest('[data-qcancel]');
    if (cancel) {
      const res = CC.Game.cancelTrain(Number(cancel.dataset.qcancel));
      if (res.error) toast(res.error);
      cache.recruitSig = null;
      syncRecruit();
      sync();
    }
  }

  // Карточка героя для отдельной академии. Свой кэш, чтобы таймер
  // обновлялся только при открытой панели herohall.
  function syncHeroCard() {
    if (!heroList) return;

    const th = CC.Game.townhallLevel();
    const lvl = CC.Game.heroLevel();
    const up = CC.Game.heroUpInfo ? CC.Game.heroUpInfo() : null;
    const cost = CC.Game.heroUpgradeCost ? CC.Game.heroUpgradeCost() : null;
    const check = CC.Game.canUpgradeHero ? CC.Game.canUpgradeHero() : null;
    const speed = up && CC.Game.heroSpeedCost ? CC.Game.heroSpeedCost() : null;
    const sig = 'hero:' + th + ':' + lvl + ':' +
      (up ? up.to + ':' + Math.ceil(up.left) : 'idle') + ':' +
      (speed ? speed.gems : 0) + ':' + CC.Game.gems() + ':' +
      (cost ? JSON.stringify(cost) : 'max') + ':' +
      (check ? JSON.stringify({ ok: check.ok, reason: check.reason,
        needTh: check.needTh, busy: check.busy, missing: check.missing,
        needHeroHall: check.needHeroHall }) : '');

    if (cache.heroSig === sig) return;
    cache.heroSig = sig;
    heroList.innerHTML = heroCardHtml(th);
  }

  // Раздел «Улучшение войск» в панели ангара: только открытые войска.
  // Один слот на деревню: пока идёт исследование, остальные кнопки выключены,
  // а у выбранного войска видны остаток и полоска прогресса.
  function syncTroopUpgrade() {
    if (!troopUpList) return;

    const th = CC.Game.townhallLevel();
    const info = CC.Game.troopUpInfo();
    const speed = info ? CC.Game.troopSpeedCost() : null;
    const gems = CC.Game.gems();
    const elixir = CC.Game.elixir();

    const open = CC.ARMY_ORDER.filter(function (t) {
      return (CC.troopUnlock ? CC.troopUnlock(t) : 1) <= th;
    });
    // Идущее исследование показываем даже если центр успели снести:
    // иначе оно шло бы «в никуда».
    if (info && open.indexOf(info.type) === -1) open.unshift(info.type);

    const sig = open.map(function (t) {
      const st = CC.Game.troopStats(t);
      const c = CC.Game.troopUpgradeCost(t);
      return t + ':' + st.level + ':' + (c ? c.elixir + ':' + c.time : 'max') +
        ':' + (CC.Game.canUpgradeTroop(t).ok ? 1 : 0);
    }).join(',') + '|' + elixir + '|' +
      (info ? info.type + ':' + info.to + ':' + Math.ceil(info.left) + ':' +
        (speed ? speed.gems : 0) : 'idle') + '|g' + gems + '|th' + th;

    if (cache.troopSig === sig) return;
    cache.troopSig = sig;

    if (troopUpHint) troopUpHint.textContent = info ? 'идёт' : 'свободен';

    let html = '';

    for (let i = 0; i < open.length; i++) {
      const type = open[i];
      const d = CC.TROOPS[type];
      const st = CC.Game.troopStats(type);
      const icon = '<span class="tup__icon cc-icon" data-type="' + type + '"' +
        ' style="background:' + d.color + '">' + d.icon + '</span>';

      if (info && info.type === type) {
        const pct = Math.round(info.progress * 100);
        const gemsOk = !speed || gems >= speed.gems;
        html += '<div class="tup is-run" data-troop="' + type + '">' +
          icon +
          '<span class="tup__text">' +
            '<b class="tup__name">' + d.name + '</b>' +
            '<span class="tup__lvl">Ур. ' + st.level + ' → ' + info.to + '</span>' +
          '</span>' +
          '<span class="tup__time">' + formatTime(info.left) + '</span>' +
          (speed
            ? '<button class="tup__btn tup__btn_speed" data-act="speed-troop"' +
              (gemsOk ? '' : ' disabled') +
              ' title="' + (gemsOk
                ? 'Завершить исследование мгновенно'
                : 'Нужно ещё ' + platText(speed.gems - gems)) + '">' +
              '<span class="ico ico-platinum" aria-hidden="true"></span>' +
              speed.gems + '</button>'
            : '') +
          '<i class="tup__bar"><b style="width:' + pct + '%"></b></i>' +
          '</div>';
        continue;
      }

      const check = CC.Game.canUpgradeTroop(type);
      const cost = CC.Game.troopUpgradeCost(type);
      let btn;

      if (check.ok) {
        btn = '<button class="tup__btn" data-troop-up="' + type + '">Улучшить</button>';
      } else {
        let label = 'Улучшить';
        if (check.busy) label = 'Занято';
        else if (check.needTh) label = 'Центр ' + check.needTh;
        else if (check.needLab) label = 'Нет лаборатории';
        else if (check.reason === 'Максимальный уровень') label = 'Макс.';
        else if (check.missing) label = 'Нет энергии';
        else if (check.needStorage) label = 'Склад мал';
        btn = '<button class="tup__btn" disabled title="' +
          (check.reason || '') + '">' + label + '</button>';
      }

      const price = cost
        ? '⚡ ' + fmtNum(cost.elixir) + ' · ' + formatTime(cost.time)
        : '—';

      html += '<div class="tup" data-troop="' + type + '">' +
        icon +
        '<span class="tup__text">' +
          '<b class="tup__name">' + d.name + '</b>' +
          '<span class="tup__lvl">Ур. ' + st.level + '</span>' +
        '</span>' +
        '<span class="tup__cost">' + price + '</span>' +
        btn +
        '</div>';
    }

    troopUpList.innerHTML = html;
  }

  function onSelbarClick(e) {
    const infoBtn = e.target.closest('[data-act="info"]');
    if (infoBtn) {
      selbar.classList.toggle('is-info-open');
      if (selInfo) {
        const open = selbar.classList.contains('is-info-open');
        selInfo.textContent = open ? 'Скрыть' : 'Инфо';
        selInfo.classList.toggle('is-active', open);
      }
      return;
    }

    // Ускорение прокачки героя платиной: отдельная кнопка в его карточке.
    const heroSpeedBtn = e.target.closest('[data-hero-speed]');
    if (heroSpeedBtn) {
      const res = CC.Game.speedUpHero();
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgradeDone');
        toast('Сержант — ур. ' + res.level);
      }
      invalidate();
      sync();
      return;
    }

    // Прокачка героя: отдельная кнопка в его карточке ангара.
    const heroUpBtn = e.target.closest('[data-hero-up]');
    if (heroUpBtn) {
      const res = CC.Game.startHeroUpgrade();
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgrade');
        toast('Сержант: улучшение до ур. ' + res.to);
      }
      invalidate();
      sync();
      return;
    }

    // Улучшение войск: кнопка в строке исследования и ускорение за платину.
    const troopUpBtn = e.target.closest('[data-troop-up]');
    if (troopUpBtn) {
      const type = troopUpBtn.dataset.troopUp;
      const res = CC.Game.startTroopUpgrade(type);
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgrade');
        const name = (CC.TROOPS[type] || {}).name || 'Войско';
        toast(name + ': улучшение до ур. ' + res.to);
      }
      invalidate();
      sync();
      return;
    }

    const troopSpeed = e.target.closest('[data-act="speed-troop"]');
    if (troopSpeed) {
      const res = CC.Game.speedUpTroop();
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgradeDone');
        const name = (CC.TROOPS[res.type] || {}).name || 'Войско';
        toast(name + ' — ур. ' + res.level);
      }
      invalidate();
      sync();
      return;
    }

    const batchBtn = e.target.closest('[data-train-many]');
    if (batchBtn) {
      const type = batchBtn.dataset.trainMany;
      const fit = CC.Game.batchFit(type);
      if (!fit) {
        const check = CC.Game.canTrain(type);
        toast(check.error || 'Нет места в армии');
        return;
      }

      state.trainSel = type;
      const res = CC.Game.trainBatch(type, fit);
      if (res.error) toast(res.error);
      else if (CC.Sound) CC.Sound.play('train');
      sync();
      return;
    }

    const trainBtn = e.target.closest('[data-train]');
    if (trainBtn) {
      const type = trainBtn.dataset.train;
      state.trainSel = type;
      const res = CC.Game.train(type);
      if (res.error) toast(res.error);
      else if (CC.Sound) CC.Sound.play('train');
      sync();
      return;
    }

    const cancelQ = e.target.closest('[data-qcancel]');
    if (cancelQ) {
      const res = CC.Game.cancelTrain(Number(cancelQ.dataset.qcancel));
      if (res.error) toast(res.error);
      else if (res.refund && res.refund.lost.elixir > 0) {
        toast('Склады полны: ' + res.refund.lost.elixir + ' энергии потеряно');
      }
      sync();
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const act = btn.dataset.act;

    if (act === 'speed-train') {
      const res = CC.Game.speedUpQueue();
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgradeDone');
        toast('Юнит готов');
      }
      invalidate();
      sync();
      return;
    }

    if (act === 'speed-up') {
      const speedId = state.selected;
      if (!speedId) return;

      const building = CC.Game.isBuilding(speedId);
      const res = building
        ? CC.Game.speedUpBuild(speedId)
        : CC.Game.speedUpUpgrade(speedId);
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgradeDone');
        toast(building ? 'Стройка завершена' : 'Улучшение завершено');
      }
      invalidate();
      sync();
      return;
    }

    if (act === 'cancel') {
      state.selected = null;
      cache.uTimer = null;
      sync();
      return;
    }

    if (act === 'goto-th') {
      const th = CC.Base.list().find(function (b) { return b.type === 'townhall'; });
      if (th) {
        state.selected = th.id;
        cache.uTimer = null;
      }
      sync();
      return;
    }

    if (act === 'goto-storage') {
      const want = selGotoStorage && selGotoStorage.dataset
        ? selGotoStorage.dataset.res : '';
      const type = want === 'elixir' ? 'estorage' : 'storage';
      const st = CC.Base.list().find(function (b) { return b.type === type; }) ||
        CC.Base.list().find(function (b) {
          return b.type === 'storage' || b.type === 'estorage';
        });
      if (st) {
        state.selected = st.id;
        cache.uTimer = null;
      }
      sync();
      return;
    }

    const id = state.selected;
    if (!id) return;

    if (act === 'remove') {
      const it = findItem(id);
      const name = it ? CC.BUILDINGS[it.type].name : 'постройка';
      const lvl = CC.Game.level(id);
      const spent = CC.Game.upgradeSpent(id);

      let msg = 'Убрать «' + name + '»?';
      if (lvl > 1) msg += ' Уровень ' + lvl;

      if (spent) {
        const parts = [];
        if (spent.gold) parts.push(spent.gold + ' руды');
        if (spent.elixir) parts.push(spent.elixir + ' энергии');
        msg += (lvl > 1 ? ' и улучшение за ' : ' Улучшение за ') +
          parts.join(' и ') + ' сгорят.';
      } else {
        msg += lvl > 1 ? ' сгорит.' : ' Постройка сгорит.';
      }

      msg += ' Ресурсы за постановку не возвращаются.';

      ask(msg).then(function (ok) {
        if (!ok) return;

        // командный центр сносим только после второго подтверждения
        if (it && it.type === 'townhall') {
          ask('Точно убрать командный центр? Без неё база останется без штаба.')
            .then(function (okTh) {
              if (okTh) removeBuilding(id);
            });
          return;
        }

        removeBuilding(id);
      });
      return;
    }

    if (act === 'upgrade') {
      const res = CC.Game.startUpgrade(id);
      if (res.error) toast(res.error);
      else {
        if (CC.Sound) CC.Sound.play('upgrade');
        // Автосбор перед стройкой: показываем, сколько ушло на склад.
        const auto = res.auto;
        if (auto && (auto.gold > 0 || auto.elixir > 0 || auto.left > 1)) {
          const parts = [];
          if (auto.gold > 0) parts.push('+' + fmtNum(auto.gold) + ' руды');
          if (auto.elixir > 0) parts.push('+' + fmtNum(auto.elixir) + ' энергии');
          let text = 'Автосбор: ' + (parts.length ? parts.join(', ') : '0');
          if (auto.left > 1) text += ' · осталось ' + fmtNum(auto.left);
          text += ' · улучшение началось';
          toast(text);
        } else {
          toast('Улучшение началось');
        }
      }
      invalidate();
      sync();
    }
  }

  /* ---------- жесты камеры ---------- */

  const pointers = new Map();
  let tapInfo = null;
  let pinchInfo = null;
  let suppressTap = false;
  let lastTap = null;
  // Кисть высадки: пока палец/ЛКМ зажаты, войска ставятся по новым клеткам.
  // Это не камера: пока battlePaint жив, панораму не двигаем.
  let battlePaint = null;
  let lastPaintSoundAt = 0;
  const PAINT_SOUND_MS = 120;

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function camTouched() {
    if (CC.CamTouched) CC.CamTouched();
  }

  function pointerPair() {
    const vals = [];
    pointers.forEach(function (p) { vals.push(p); });
    const a = vals[0];
    const b = vals[1];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2
    };
  }

  function updateCursor() {
    if (!canvas || !canvas.style) return;

    if (drag && drag.active) {
      canvas.style.cursor = 'grabbing';
      return;
    }

    let cursor = '';
    if (CC.App.mode === 'base' && state.buildMode && !state.armed &&
        hoverAt && CC.Cam && CC.Cam.scale) {
      const g = CC.CamMath.screenToGrid(CC.Cam, hoverAt.x, hoverAt.y);
      if (CC.Base.itemAt(Math.floor(g.x), Math.floor(g.y))) cursor = 'grab';
    }
    canvas.style.cursor = cursor;
  }

  function onPointerDown(e) {
    if (CC.App.introOpen) return; // заставка не пускает ввод в сцену
    if (CC.App.prepActive) { skipBattlePrep(); return; }

    // ЛКМ и палец — игра; правая кнопка мыши — только панорама.
    const rightPan = e.pointerType === 'mouse' && e.button === 2;
    if (e.pointerType === 'mouse' && e.button !== 0 && !rightPan) return;
    if (askState) return; // открытый модал блокирует поле и перетаскивание

    const p = localPoint(e);
    hoverAt = p;
    pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }

    if (pointers.size === 1) {
      tapInfo = {
        id: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        moved: rightPan
      };
      pinchInfo = null;
      suppressTap = rightPan;

      if (rightPan) {
        battlePaint = null;
      } else if (startBattlePaint(e, p)) {
        // жест-кисть уже высадил первого юнита; панораму не начинаем
      } else {
        // под постройкой начинаем кандидата на перетаскивание — только в режиме построек
        if (drag) dragCancel();
        if (CC.App.mode === 'base' && state.buildMode && !state.armed) {
          const g = gridAtPoint(p);
          const gx = Math.floor(g.x);
          const gy = Math.floor(g.y);
          const it = (gx >= 0 && gy >= 0 && gx < CC.GRID && gy < CC.GRID)
            ? CC.Base.itemAt(gx, gy)
            : null;

          if (it) {
            dragBegin(it.id, g.x, g.y);
            if (drag) {
              drag.sx = e.clientX;
              drag.sy = e.clientY;
            }
          }
        }
      }
    } else if (pointers.size === 2) {
      if (drag) dragCancel();
      battlePaint = null;
      tapInfo = null;
      suppressTap = true;
      pinchInfo = pointerPair();
    }

    updateCursor();
  }

  function onPointerMove(e) {
    const p = localPoint(e);
    hoverAt = p;

    if (!pointers.has(e.pointerId)) {
      updateCursor();
      updateGhost();
      return;
    }

    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2) {
      const info = pointerPair();
      if (pinchInfo) {
        camTouched();
        CC.CamMath.panBy(CC.Cam, info.midX - pinchInfo.midX, info.midY - pinchInfo.midY);
        CC.CamMath.zoomAt(CC.Cam, info.midX, info.midY, CC.Cam.zoom * (info.dist / pinchInfo.dist));
      }
      pinchInfo = info;
      suppressTap = true;
      return;
    }

    // кисть высадки: курсор ведёт войска, камера стоит на месте
    if (battlePaint && battlePaint.pointerId === e.pointerId) {
      if (tapInfo) tapInfo.moved = true;
      paintDeployAt(p);
      updateCursor();
      return;
    }

    // постройка: после порога начинаем тащить, панораму не двигаем
    if (drag) {
      if (!drag.active) {
        const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
        if (dist > DRAG_PX) {
          const res = dragActivate();
          if (res.error) drag = null;
        }
      }

      if (drag && drag.active) {
        const g = gridAtPoint(p);
        dragTarget(g.x, g.y);
        if (tapInfo) tapInfo.moved = true;
        updateGhost();
        updateCursor();
        return;
      }

      return; // ещё не порог — не панорамируем
    }

    if (!tapInfo) return;

    const dx = e.clientX - tapInfo.clientX;
    const dy = e.clientY - tapInfo.clientY;
    if (!tapInfo.moved && Math.hypot(dx, dy) > 10) tapInfo.moved = true;

    if (tapInfo.moved) {
      camTouched();
      CC.CamMath.panBy(CC.Cam, p.x - prev.x, p.y - prev.y);
    }

    updateCursor();
  }

  function onPointerUp(e) {
    const p = localPoint(e);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущен */ }

    // Отпустили кисть: юнит уже высажен на pointerdown/move, тап не повторяем.
    if (battlePaint && battlePaint.pointerId === e.pointerId) {
      battlePaint = null;
      tapInfo = null;
      pinchInfo = null;
      suppressTap = false;
      if (e.pointerType !== 'mouse') hoverAt = null;
      updateGhost();
      updateCursor();
      return;
    }

    if (drag) {
      const g = gridAtPoint(p);
      const res = dragDrop(g.x, g.y);

      // короткий тап без движения — не перенос, ниже обычный выбор
      if (!res.tap) {
        if (res.ok) {
          if (CC.Sound) CC.Sound.play('place');
          state.selected = null;
          invalidate();
          if (CC.CamBaseChanged) CC.CamBaseChanged();
          hideTip();
        } else {
          toast(res.error);
        }

        tapInfo = null;
        pinchInfo = null;
        suppressTap = false;
        if (e.pointerType !== 'mouse') hoverAt = null;

        updateGhost();
        updateCursor();
        sync();
        return;
      }
    }

    if (pointers.size === 0) {
      if (tapInfo && !tapInfo.moved && !suppressTap) handleTap(e);
      tapInfo = null;
      pinchInfo = null;
      suppressTap = false;

      // на тач-экране призрак живёт только под пальцем
      if (e.pointerType !== 'mouse') {
        hoverAt = null;
      }

      updateGhost();
      updateCursor();
      return;
    }

    // после пинча оставшийся палец не превращается в тап
    tapInfo = null;
    suppressTap = true;
    pinchInfo = pointers.size >= 2 ? pointerPair() : null;
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    if (drag) dragCancel();
    battlePaint = null;
    tapInfo = null;
    pinchInfo = null;
    suppressTap = false;
    updateCursor();
  }

  function onPointerLeave() {
    if (drag && drag.active) return;

    // указатель ушёл за canvas — не оставляем «зажатых» пальцев
    if (pointers.size > 0) {
      pointers.clear();
      battlePaint = null;
      tapInfo = null;
      pinchInfo = null;
      suppressTap = false;
    }

    hoverAt = null;
    updateGhost();
    updateCursor();
  }

  function onWheel(e) {
    e.preventDefault();
    const p = localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    camTouched();
    CC.CamMath.zoomAt(CC.Cam, p.x, p.y, CC.Cam.zoom * factor);
  }

  function onZoomClick(e) {
    const btn = e.target.closest('[data-zoom]');
    if (!btn) return;

    const cam = CC.Cam;
    const cx = cam.w / 2;
    const cy = cam.h / 2;

    camTouched();

    if (btn.dataset.zoom === 'in') CC.CamMath.zoomAt(cam, cx, cy, cam.zoom * 1.5);
    else if (btn.dataset.zoom === 'out') CC.CamMath.zoomAt(cam, cx, cy, cam.zoom / 1.5);
    else CC.CamMath.reset(cam);
  }

  // двойной тап по пустому месту возвращает «всё поле целиком»
  function isTapEmpty(e) {
    const rect = canvas.getBoundingClientRect();
    const g = CC.CamMath.screenToGrid(CC.Cam, e.clientX - rect.left, e.clientY - rect.top);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    if (x < 0 || y < 0 || x >= CC.GRID || y >= CC.GRID) return true;
    if (CC.App.mode === 'base') return !CC.Base.itemAt(x, y);

    const S = CC.Battle.state;
    return !S || !S.deployable[y * CC.GRID + x];
  }

  function handleTap(e) {
    const p = localPoint(e);
    const now = Date.now();
    const empty = isTapEmpty(e);

    // в режиме установки быстрые тапы подряд — это постройка, а не
    // двойной тап «вернуть всё поле»
    if (!state.armed && lastTap && empty && now - lastTap.t < 320 &&
        Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {
      camTouched();
      CC.CamMath.reset(CC.Cam);
      lastTap = null;
      toast('Всё поле');
      return;
    }

    lastTap = empty ? { t: now, x: p.x, y: p.y } : null;
    onCanvasDown(e);
  }

  /* ---------- перенос постройки ---------- */

  function screenOf(gx, gy) {
    const p = CC.Iso.project(gx, gy);
    return {
      x: CC.Cam.ox + p.x * CC.Cam.scale,
      y: CC.Cam.oy + p.y * CC.Cam.scale
    };
  }

  /* ---------- тапы по полю ---------- */

  function gridAtPoint(p) {
    return CC.CamMath.screenToGrid(CC.Cam, p.x, p.y);
  }

  function gridAt(e) {
    return gridAtPoint(localPoint(e));
  }

  function onCanvasDown(e) {
    if (CC.App.mode === 'base') onBaseTap(e);
    else onBattleTap(e);
  }

  function onBaseTap(e) {
    const g = gridAt(e);
    return baseTap(Math.floor(g.x), Math.floor(g.y));
  }

  function baseTap(x, y) {
    closeQuest();

    if (x < 0 || y < 0 || x >= CC.GRID || y >= CC.GRID) {
      state.selected = null;
      cache.uTimer = null;
      sync();
      return { ok: true };
    }

    if (state.armed) {
      // пока режим установки активен, тап только ставит (или ругается),
      // но не выбирает существующую постройку
      const res = tryPlace(x, y);
      if (res.error) {
        if (!res.toasted) toast(res.error);
        return res;
      }

      if (CC.Sound) CC.Sound.play('place');

      // Стройка с таймером: сразу показываем, сколько ждать.
      const built = CC.Base.list().find(function (o) { return o.id === res.id; });
      const bi = res.id && CC.Game.buildInfo ? CC.Game.buildInfo(res.id) : null;
      if (built && bi) {
        toast('Строится: ' + CC.BUILDINGS[built.type].name + ' · ' + formatTime(bi.total));
      }

      invalidate();
      if (CC.CamBaseChanged) CC.CamBaseChanged();
      sync();
      return res;
    }

    const it = CC.Base.itemAt(x, y);
    state.selected = it ? it.id : null;
    cache.uTimer = null;
    sync();
    return { ok: true, selected: state.selected };
  }

  // для построек больше 1x1 пробуем сдвинуть якорь, чтобы тап по краю сработал
  function offsetsFor(type) {
    const s = CC.Base.size(type);
    const list = [[0, 0]];
    if (s.w > 1 || s.h > 1) {
      list.push([-(s.w - 1), 0], [0, -(s.h - 1)], [-(s.w - 1), -(s.h - 1)]);
    }
    return list;
  }

  function placeAt(type, x, y) {
    if (CC.Base.left(type) <= 0) return { error: 'Больше не поместится' };

    const offs = offsetsFor(type);
    for (let i = 0; i < offs.length; i++) {
      const nx = x + offs[i][0];
      const ny = y + offs[i][1];
      if (CC.Base.fits(type, nx, ny)) return CC.Base.place(type, nx, ny);
    }
    return { error: 'Здесь занято' };
  }

  function onBattleTap(e) {
    // Просмотр повтора идёт сам: касания поля ничего не высаживают.
    if (CC.Battle.state && CC.Battle.state.kind === 'replay') return;
    const g = gridAt(e);
    const res = CC.Battle.deploy(g.x, g.y);

    if (res.error) {
      toast(res.error);
      return;
    }
    if (CC.Sound) CC.Sound.play('deploy', undefined, CC.Battle.state.selected);
    dismissBattleIntro();
    hideTip();
  }

  /* ---------- высадка «кистью» ---------- */

  // Можно ли начать жест-кисть: бой идёт, войско выбрано и ещё не кончилось,
  // палец опущен на свободную клетку (постройки не трогаем — там панорама).
  function startBattlePaint(e, p) {
    if (CC.App.mode !== 'battle' || !CC.Battle || !CC.Battle.state) return false;
    const S = CC.Battle.state;
    if (S.over || S.kind === 'replay' || S.viewReplay) return false;

    const type = S.selected;
    if (!type || !CC.TROOPS[type] || (S.army[type] | 0) <= 0) return false;

    const g = gridAtPoint(p);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    if (x < 0 || y < 0 || x >= CC.GRID || y >= CC.GRID) return false;
    if (S.occ && S.occ[y * CC.GRID + x] >= 0) return false;

    battlePaint = {
      pointerId: e.pointerId,
      lastX: null,
      lastY: null,
      lastAt: 0,
      toasted: false
    };
    suppressTap = true;
    paintDeployAt(p);
    return true;
  }

  // Одна попытка высадки в текущей клетке. Повтор в той же клетке и частые
  // пиксели отсекает чистая CC.Battle.paintPlan. Ошибки — один тост на жест,
  // дальше молча: иначе «армия кончилась» звенит на каждый пиксель.
  function paintDeployAt(p) {
    if (!battlePaint || !CC.Battle || !CC.Battle.state) return;
    const S = CC.Battle.state;
    const g = gridAtPoint(p);
    const now = Date.now();
    const plan = CC.Battle.paintPlan({
      x: g.x,
      y: g.y,
      now: now,
      lastX: battlePaint.lastX,
      lastY: battlePaint.lastY,
      lastAt: battlePaint.lastAt,
      gapMs: CC.Battle.deployPaintMs
    });
    if (!plan.deploy) return;

    battlePaint.lastX = plan.x;
    battlePaint.lastY = plan.y;
    battlePaint.lastAt = now;

    const res = CC.Battle.deploy(plan.x, plan.y);
    if (res && res.error) {
      if (!battlePaint.toasted) {
        toast(res.error);
        battlePaint.toasted = true;
      }
      return;
    }

    // Звук высадки не чаще ~120 мс, даже если клетки проскакивают быстрее.
    if (CC.Sound && now - lastPaintSoundAt >= PAINT_SOUND_MS) {
      CC.Sound.play('deploy', undefined, S.selected);
      lastPaintSoundAt = now;
    }
    dismissBattleIntro();
    hideTip();
  }

  /* ---------- войска ---------- */

  // Способность героя: кнопка и клавиша Q идут через один вход.
  // Ошибки показываем тостом, но панель не ломаем.
  function heroAbility() {
    if (CC.App.mode !== 'battle' || !CC.Battle || !CC.Battle.state) return null;
    const res = CC.Battle.heroAbility();
    if (res && res.error) {
      toast(res.error);
      sync();
      return res;
    }
    if (res && res.ok) {
      if (CC.Sound) CC.Sound.play('upgradeDone');
      sync();
    }
    return res;
  }

  function buildArmy() {
    armyEl.innerHTML = '';

    CC.ARMY_ORDER.forEach(function (type) {
      const d = CC.TROOPS[type];
      const el = document.createElement('div');
      el.className = 'troop';
      el.dataset.type = type;
      const need = CC.troopUnlock ? CC.troopUnlock(type) : 1;
      const lvl = CC.Game && need > CC.Game.townhallLevel() ? 1 : CC.Game.troopLevel(type);
      const art = cardArt('troop', type, 64, lvl, 'troop__art');
      el.innerHTML =
        '<span class="troop__lvl">Ур. ' + lvl + '</span>' +
        '<span class="troop__icon cc-icon" data-type="' + type + '"' +
        (art ? ' data-art="1"' : '') +
        ' style="background:' + d.color + '">' + (art || d.icon) + '</span>' +
        '<span class="troop__name">' + d.name + '</span>' +
        '<span class="troop__req hidden"></span>' +
        '<span class="troop__count">×0</span>';

      el.addEventListener('click', function () {
        if (el.classList.contains('is-locked')) {
          const need = CC.troopUnlock ? CC.troopUnlock(type) : 1;
          toast('Откроется на ' + need + ' уровне центра');
          return;
        }
        CC.Battle.select(type);
        sync();
      });

      armyEl.appendChild(el);
      cards[type] = el;
    });

    // Герой — отдельная карточка в боевой панели. Она всегда показывает
    // «1» (один юнит на бой), а после высадки — 0.
    const hd = CC.TROOPS.hero;
    if (hd) {
      const el = document.createElement('div');
      el.className = 'troop troop_hero';
      el.dataset.type = 'hero';
      const heroLvl = CC.Game && CC.Game.heroLevel ? CC.Game.heroLevel() : 0;
      const heroArt = cardArt('troop', 'hero', 64, Math.max(1, heroLvl), 'troop__art');
      el.innerHTML =
        '<span class="troop__lvl">Ур. ' + Math.max(1, heroLvl) + '</span>' +
        '<span class="troop__icon cc-icon" data-type="hero"' +
        (heroArt ? ' data-art="1"' : '') +
        ' style="background:' + hd.color + '">' + (heroArt || hd.icon) + '</span>' +
        '<span class="troop__name">' + hd.name + '</span>' +
        '<span class="troop__req hidden"></span>' +
        '<span class="troop__count">×1</span>';

      el.addEventListener('click', function () {
        if (el.classList.contains('is-locked')) {
          const need = CC.HERO ? CC.HERO.minTh : 5;
          toast('Откроется на ' + need + ' уровне центра');
          return;
        }
        if (!CC.Battle.state || !CC.Battle.state.army.hero) {
          toast('Герой уже высажен');
          return;
        }
        CC.Battle.select('hero');
        sync();
      });

      armyEl.appendChild(el);
      cards.hero = el;
    }
  }

  // В бою игрок должен сразу понимать, где он: сектор кампании, арена
  // или набег на базу. Бейдж живёт у верхнего края слева от таймера.
  function syncSectorBadge() {
    if (!hudSector) return;
    if (CC.App.mode !== 'battle' || !CC.Battle.state) {
      hudSector.classList.add('hidden');
      return;
    }
    const S = CC.Battle.state;
    let text;
    if (S.kind === 'pvp') text = 'Арена';
    else if (S.kind === 'raid') text = 'Набег';
    else text = 'Сектор ' + ((S.level | 0) + 1);
    if (hudSector.textContent !== text) hudSector.textContent = text;
    hudSector.classList.remove('hidden');
  }

  function syncBattle() {
    const S = CC.Battle.state;
    if (!S) return;
    const pvp = S.kind === 'pvp';
    const replay = S.kind === 'replay';
    const th = CC.Game.townhallLevel();
    const stars = (pvp || replay) ? 0 : CC.Game.levelStars(S.level);
    const lv = replay
      ? 'Повтор'
      : (pvp
        ? 'Арена'
        : String((S.level | 0) + 1) + ' ' + starText(stars));
    if (cache.level !== lv) {
      cache.level = lv;
      if (levelPill) {
        levelPill.textContent = lv;
        levelPill.title = replay
          ? 'Повтор нападения'
          : (pvp
            ? (S.levelName || 'Арена')
            : (S.levelName || '') + ' · звёзды ' + stars + '/3');
      }
    }

    if (btnRestart) {
      if (replay) {
        btnRestart.disabled = true;
        btnRestart.classList.add('hidden');
      } else if (pvp) {
        // На арене перезапуск не нужен: высадка и потеря войск уже в счёте.
        if (!btnRestart.disabled) btnRestart.disabled = true;
        if (btnRestart.title !== 'На арене бой не перезапускается') {
          btnRestart.title = 'На арене бой не перезапускается';
        }
      } else {
        btnRestart.classList.remove('hidden');
        const wait = retryReadyAt - Date.now();
        const blocked = wait > 0;
        if (btnRestart.disabled !== blocked) btnRestart.disabled = blocked;
        const title = blocked
          ? 'Перезапуск через ' + Math.ceil(wait / 1000) + ' с'
          : 'Начать заново';
        if (btnRestart.title !== title) btnRestart.title = title;
      }
    }

    if (btnFinish) {
      // Показываем кнопку, только пока идёт бой: после финала её место
      // занимает окно результата. В повторе управления нет вовсе.
      btnFinish.classList.toggle('hidden', !!S.over || replay);
      btnFinish.disabled = !!S.over || replay;
    }

    if (btnBattleBase) {
      btnBattleBase.classList.toggle('hidden', !!S.over);
      btnBattleBase.disabled = !!S.over;
    }

    if (battleLootEl) battleLootEl.classList.remove('hidden');
    if (battleStatsEl) battleStatsEl.classList.remove('hidden');

    // Верх справа: трофеи Арены или пул сектора. Без данных — «Сектор N».
    if (battleLootEl) {
      let line;
      if (replay) {
        line = 'Повтор · сектор ' + ((S.level | 0) + 1);
      } else if (pvp) {
        const g = pvpTarget || {};
        line = 'Арена';
        if (g.rating) line += ' · рейтинг ' + g.rating;
        if (g.loot && ((g.loot.gold || 0) + (g.loot.elixir || 0) > 0)) {
          line += ' · пул: ' + lootText(g.loot);
        }
      } else {
        const pool = S.levelLoot || S.lootPool || {};
        line = ((pool.gold || 0) + (pool.elixir || 0) > 0)
          ? 'Добыча сектора: ' + lootText(pool)
          : 'Сектор ' + ((S.level | 0) + 1);
      }
      if (battleLootEl.textContent !== line) battleLootEl.textContent = line;
    }

    if (battleStatsEl) {
      const hall = S.buildings.find(function (b) { return b.type === 'townhall'; });
      const starNow = CC.Battle.starsFor
        ? CC.Battle.starsFor(S.percent, !!(hall && hall.dead)).stars
        : 0;
      if (battleStarsEl) {
        battleStarsEl.textContent = '★'.repeat(starNow) + '☆'.repeat(3 - starNow);
      }
    }

    const pct = S.percent + '%';
    if (cache.pct !== pct) {
      pctEl.textContent = pct;
      cache.pct = pct;
    }

    const left = Math.max(0, S.limit - S.time);
    const time = formatTime(left);
    if (cache.time !== time) {
      timerEl.textContent = time;
      cache.time = time;
    }

    // тихий тик на последних пяти секундах — раз в секунду, не чаще
    const secLeft = Math.ceil(left);
    if (!S.over && secLeft > 0 && secLeft <= 5) {
      if (cache.tickSec !== secLeft) {
        cache.tickSec = secLeft;
        if (CC.Sound) CC.Sound.play('tick');
      }
    } else {
      cache.tickSec = null;
    }

    for (let i = 0; i < CC.ARMY_ORDER.length; i++) {
      const type = CC.ARMY_ORDER[i];
      const el = cards[type];
      if (!el || !el.querySelector) continue;
      const n = S.army[type];
      const need = CC.troopUnlock ? CC.troopUnlock(type) : 1;
      const locked = need > th;
      const key = n + '|' + (S.selected === type) + '|' + locked;
      if (cache[type] === key) continue;
      cache[type] = key;

      el.querySelector('.troop__count').textContent = '×' + n;
      el.classList.toggle('is-empty', n === 0 && !locked);
      el.classList.toggle('is-locked', locked);
      el.classList.toggle('is-selected', S.selected === type && !locked);

      const req = el.querySelector('.troop__req');
      if (req) {
        req.textContent = locked ? 'с центра ' + need : '';
        req.classList.toggle('hidden', !locked);
      }
      el.title = locked
        ? CC.TROOPS[type].name + ' · с центра ' + need
        : CC.TROOPS[type].name;
    }

    // Карточка героя: одна штука на бой, отдельно от линейных войск.
    const heroEl = cards.hero;
    if (heroEl && heroEl.querySelector) {
      const need = CC.HERO ? (CC.HERO.minTh || 5) : 5;
      const level = CC.Game && CC.Game.heroLevel ? CC.Game.heroLevel() : 0;
      const locked = level < 1 || th < need;
      const n = S.army.hero | 0;
      const key = n + '|' + (S.selected === 'hero') + '|' + locked + '|' + level;
      if (cache.heroCard !== key) {
        cache.heroCard = key;
        const cnt = heroEl.querySelector('.troop__count');
        if (cnt) cnt.textContent = '×' + n;
        const req = heroEl.querySelector('.troop__req');
        if (req) {
          req.textContent = locked ? 'с центра ' + need : '';
          req.classList.toggle('hidden', !locked);
        }
        heroEl.classList.toggle('is-empty', n === 0 && !locked);
        heroEl.classList.toggle('is-locked', locked);
        heroEl.classList.toggle('is-selected', S.selected === 'hero' && !locked);
        heroEl.title = (CC.TROOPS.hero ? CC.TROOPS.hero.name : 'Сержант') +
          ' · ур. ' + (level || 0) + ' · ' +
          ((CC.HERO && CC.HERO.ability && CC.HERO.ability.hint) ||
            'Щит 3 с на союзников · 1 раз за бой');
      }
    }

    // Кнопка щита: активна, только пока герой жив и способность не потрачена.
    if (heroShieldBtn) {
      const show = !replay && !S.over;
      heroShieldBtn.classList.toggle('hidden', !show);
      heroShieldBtn.disabled = !S.abilityReady;
      const label = '🛡 Щит 3 с';
      if (heroShieldBtn.textContent !== label) heroShieldBtn.textContent = label;
      const title = S.abilityUsed
        ? 'Щит уже использован · один раз за бой'
        : (!S.hero
          ? 'Сначала высади Сержанта'
          : 'Щит 3 с на союзников в радиусе 2.5 · 1 раз за бой (Q)');
      if (heroShieldBtn.title !== title) heroShieldBtn.title = title;
    }

    if (S.over && !overlayShown) {
      if (replay) showReplayEnd(S);
      else if (S.kind === 'pvp') showPvpResult(S);
      else showOverlay(S.result);
    }
  }

  /* ---------- подготовка к бою ---------- */

  let prepState = null;

  function startBattlePrep(S) {
    const ms = reducedMotion() ? 900 : 3000;
    prepState = { state: S, until: Date.now() + ms, active: true };
    CC.App.prepActive = true;
  }

  function skipBattlePrep() {
    if (!prepState) return;
    prepState.active = false;
    CC.App.prepActive = false;
    if (battlePrepEl) battlePrepEl.classList.add('hidden');
  }

  function syncBattlePrep() {
    if (CC.App.mode !== 'battle' || !CC.Battle.state) {
      prepState = null;
      CC.App.prepActive = false;
      if (battlePrepEl) battlePrepEl.classList.add('hidden');
      return;
    }

    const S = CC.Battle.state;
    if (!prepState || prepState.state !== S) startBattlePrep(S);

    if (!prepState.active) {
      CC.App.prepActive = false;
      if (battlePrepEl) battlePrepEl.classList.add('hidden');
      return;
    }

    const left = Math.max(0, prepState.until - Date.now());
    if (left <= 0) {
      prepState.active = false;
      CC.App.prepActive = false;
      if (battlePrepEl) battlePrepEl.classList.add('hidden');
      return;
    }

    CC.App.prepActive = true;
    if (battlePrepText) {
      const text = 'Начало боя ' + Math.ceil(left / 1000) + '…';
      if (battlePrepText.textContent !== text) battlePrepText.textContent = text;
    }
    if (battlePrepEl) battlePrepEl.classList.remove('hidden');
  }

  function syncQuestBar() {
    if (!questBar) return;
    const busy = !!(state.selected || state.buildMode || buildersOpen || shopOpen ||
      arenaOpen || drag || dailyOpen);
    questBar.classList.toggle('hidden', busy && !questOpen);
  }

  function openQuests() {
    if (questOpen) return;
    questOpen = true;
    questPanel.classList.remove('hidden');
    cache.questSig = null;
    sync();
  }

  function closeQuests() {
    if (!questOpen) return;
    questOpen = false;
    questPanel.classList.add('hidden');
  }

  function closeQuest() {
    closeQuests();
  }

  /* ---------- Сержант: вступительный лор ---------- */

  // Лор открывается после заставки на новом сейве и только в деревне.
  // Пока он на экране, обычная панель обучения спрятана.
  function syncLore() {
    if (!loreEl) return;

    const l = CC.Game.tutorialLore ? CC.Game.tutorialLore() : null;
    const show = !!(l && l.active && CC.App.mode === 'base' &&
      !CC.App.introOpen && !anyOverlayOpen());

    if (!show) {
      loreEl.classList.add('hidden');
      loreOpen = false;
      return;
    }

    if (!loreOpen) {
      loreOpen = true;
      lorePage = 0;
    }

    const pages = l.pages || [];
    if (lorePage >= pages.length) lorePage = pages.length - 1;
    if (lorePage < 0) lorePage = 0;

    if (loreName && loreName.textContent !== (l.name || 'Сержант')) {
      loreName.textContent = l.name || 'Сержант';
    }
    if (loreStepEl) {
      loreStepEl.textContent = (lorePage + 1) + '/' + pages.length;
    }
    if (loreArtEl) {
      const art = (CC.SERGEANT && CC.SERGEANT.loreArt) ? CC.SERGEANT.loreArt[lorePage] : null;
      if (art) {
        if (loreArtEl.dataset.art !== art) {
          loreArtEl.dataset.art = art;
          loreArtEl.onerror = function () { loreArtEl.classList.add('hidden'); };
          loreArtEl.classList.remove('hidden');
          loreArtEl.src = art;
        }
      } else {
        loreArtEl.classList.add('hidden');
      }
    }
    if (loreText) {
      const text = pages[lorePage] || '';
      if (loreText.textContent !== text) loreText.textContent = text;
    }
    if (loreDots) {
      let html = '';
      for (let i = 0; i < pages.length; i++) {
        html += '<i class="' + (i === lorePage ? 'is-on' : '') + '"></i>';
      }
      if (loreDots.innerHTML !== html) loreDots.innerHTML = html;
    }
    if (loreNextBtn) {
      const last = lorePage >= pages.length - 1;
      const label = last
        ? ((CC.SERGEANT && CC.SERGEANT.startLabel) || 'Начать')
        : ((CC.SERGEANT && CC.SERGEANT.nextLabel) || 'Далее');
      if (loreNextBtn.textContent !== label) loreNextBtn.textContent = label;
    }

    loreEl.classList.remove('hidden');
  }

  // «Далее»: следующая страница, а на последней — открыть обучение.
  function loreNext() {
    const l = CC.Game.tutorialLore ? CC.Game.tutorialLore() : null;
    const pages = (l && l.pages) || [];
    if (lorePage < pages.length - 1) {
      lorePage++;
      syncLore();
      if (CC.Sound) CC.Sound.play('ui');
      return { ok: true, page: lorePage };
    }
    finishLore();
    return { ok: true, done: true };
  }

  // Закрыть лор: обычное обучение продолжится с шага «Поставь турель».
  function finishLore() {
    loreOpen = false;
    lorePage = 0;
    if (loreEl) loreEl.classList.add('hidden');
    if (CC.Game.readTutorialLore) CC.Game.readTutorialLore();
    sync();
  }

  /* ---------- Сержант: панель обучения ---------- */

  // Панель видна только в деревне и только пока обучение не пройдено.
  // Модальные окна её прячут, чтобы не перекрывать HUD на 844×390.
  /* ---------- указатель обучения ---------- */

  // Чистая функция: шаг обучения → селектор DOM или тип постройки в мире.
  // Не трогает DOM и камеру, поэтому её удобно проверять в node.
  function tutorialTarget(step, opts) {
    opts = opts || {};
    if (!step || !step.active || step.done || step.skipped) {
      return { kind: 'none', step: step && step.id ? step.id : null };
    }

    if (opts.mode === 'battle') {
      if (step.goal !== 'battle' && step.goal !== 'level1') {
        return { kind: 'none', step: step.id };
      }
      const type = opts.selectedTroop;
      if (type) {
        return {
          kind: 'selector',
          selector: '#army .troop[data-type="' + type + '"]',
          step: step.id
        };
      }
      return {
        kind: 'selector',
        selector: '#battle-intro',
        fallback: '#army',
        step: step.id
      };
    }

    if (step.place) {
      return opts.shopOpen
        ? {
          kind: 'selector',
          selector: '#shop-grid .shop-card[data-type="' + step.place + '"]',
          fallback: '#shop-grid',
          step: step.id
        }
        : { kind: 'selector', selector: '#shop-btn', step: step.id };
    }

    if (step.goal === 'train') {
      return {
        kind: 'world', type: 'barracks',
        selector: '#sergeant-go', step: step.id
      };
    }
    if (step.goal === 'battle' || step.goal === 'level1') {
      return { kind: 'selector', selector: '#battle-btn', step: step.id };
    }
    if (step.goal === 'th2') {
      return {
        kind: 'world', type: 'townhall',
        selector: '#sergeant-go', step: step.id
      };
    }
    if (step.goal === 'cannon2') {
      return {
        kind: 'world', type: 'cannon',
        selector: '#sergeant-go', step: step.id
      };
    }

    return { kind: 'none', step: step.id };
  }

  let tutTargetNode = null;

  function clearTutTarget() {
    if (tutTargetNode && tutTargetNode.classList) {
      tutTargetNode.classList.remove('is-tut-target');
    }
    tutTargetNode = null;
  }

  function hideTutPointer() {
    if (tutPointer) tutPointer.classList.add('hidden');
    clearTutTarget();
  }

  function tutorialBlocked() {
    if (CC.App.introOpen || CC.App.modalOpen || CC.App.prepActive) return true;
    if (loreOpen || askState || state.buildMode) return true;
    if (levelsOpen || achOpen || dailyOpen || arenaOpen || replaysOpen ||
        buyResOpen || buyPlatOpen || overlayShown) return true;
    if (replayEnd && !replayEnd.classList.contains('hidden')) return true;
    if (offlineEl && !offlineEl.classList.contains('hidden')) return true;
    if (raidEl && !raidEl.classList.contains('hidden')) return true;
    if (tabLock && !tabLock.classList.contains('hidden')) return true;
    return false;
  }

  function visibleRect(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return r;
  }

  function pickVisible(selector, fallback) {
    const el = document.querySelector(selector);
    if (visibleRect(el)) return el;
    return fallback ? document.querySelector(fallback) : null;
  }

  // Сопоставление шага с экраном. Здесь уже есть DOM: ищем элемент,
  // ставим кольцо .is-tut-target и двигаем перчатку над целью.
  function syncTutorialPointer() {
    if (!tutPointer) return;

    const t = CC.Game.tutorial ? CC.Game.tutorial() : null;
    const S = CC.Battle && CC.Battle.state;
    const selectedTroop = S && !S.over && S.kind !== 'replay' ? S.selected : null;

    if (tutorialBlocked() || !t || !t.active) {
      hideTutPointer();
      return;
    }

    const target = tutorialTarget(t, {
      mode: CC.App.mode,
      shopOpen: shopOpen,
      selectedTroop: selectedTroop
    });
    if (!target || target.kind === 'none') {
      hideTutPointer();
      return;
    }

    let el = null;
    let x = 0;
    let y = 0;
    let worldPoint = null;

    if (target.kind === 'world') {
      const list = CC.Base.list();
      let it = null;
      for (let i = 0; i < list.length; i++) {
        if (list[i].type === target.type) { it = list[i]; break; }
      }
      if (it) {
        const s = CC.Base.size(it.type);
        const p = CC.Iso.project(it.x + s.w / 2, it.y + s.h / 2);
        const cam = CC.Cam;
        const wx = cam.ox + p.x * cam.scale;
        const hgt = (CC.BUILDINGS[it.type].height || 30) * cam.scale * 0.55;
        const wy = cam.oy + p.y * cam.scale - hgt;
        const top = Math.max(58, (cam.topPad || 54) + 16);
        const bottom = cam.h - 70;
        if (wx >= 28 && wx <= cam.w - 28 && wy >= top && wy <= bottom) {
          worldPoint = { x: wx, y: wy };
          x = wx;
          y = wy;
        }
      }
      if (!worldPoint) {
        el = pickVisible(target.selector, null);
      }
    } else {
      el = pickVisible(target.selector, target.fallback);
    }

    if (el) {
      const r = visibleRect(el);
      if (!r) { hideTutPointer(); return; }
      // Карточка терминала может быть за краем ленты: подводим её к центру,
      // чтобы кольцо и перчатка действительно вели к цели.
      if (target.selector.indexOf('#shop-grid') === 0 && el.scrollIntoView) {
        const vw = CC.Cam.w || window.innerWidth;
        if (r.right < 0 || r.left > vw) {
          try {
            el.scrollIntoView({ block: 'nearest', inline: 'center' });
          } catch (e) { /* старый браузер — оставляем как есть */ }
        }
      }
      x = r.left + r.width / 2;
      y = r.top - 5;
      if (tutTargetNode !== el) {
        clearTutTarget();
        tutTargetNode = el;
        el.classList.add('is-tut-target');
      }
    } else {
      clearTutTarget();
    }

    if (!el && target.kind !== 'world') { hideTutPointer(); return; }
    if (!el && !worldPoint) { hideTutPointer(); return; }

    const w = CC.Cam.w || window.innerWidth;
    const h = CC.Cam.h || window.innerHeight;
    x = Math.max(28, Math.min(w - 28, x));
    y = Math.max(58, Math.min(h - 70, y));
    tutPointer.style.left = Math.round(x) + 'px';
    tutPointer.style.top = Math.round(y) + 'px';
    tutPointer.classList.toggle('is-world', target.kind === 'world' && !el);
    tutPointer.classList.remove('hidden');
  }

  function syncSergeant() {
    if (!sergeantEl) return;
    const t = CC.Game.tutorial ? CC.Game.tutorial() : null;
    // Панель выбранной постройки/ангар/лаборатория занимает низ экрана:
    // Сержант уступает ей место, иначе перекрывает кнопки и текст.
    // Устаревший id (после сброса базы) панелью не считается.
    const hasSelection = !!(state.selected && CC.Base.list().some(function (b) {
      return b.id === state.selected;
    }));
    const show = !!(t && t.active && CC.App.mode === 'base' &&
      !loreOpen && !anyOverlayOpen() && !buildersOpen && !questOpen &&
      !hasSelection && !state.buildMode);

    if (!show) {
      sergeantEl.classList.add('hidden');
      return;
    }

    if (sergeantHintStep !== t.id) {
      sergeantHintStep = t.id;
      // Реплика Сержанта — сверху, инструкция действия — снизу и сразу
      // видна: игрок должен понимать, что нажимать, без лишнего тапа.
      sergeantMore = true;
    }

    sergeantEl.classList.remove('hidden');
    if (sergeantStep) sergeantStep.textContent = t.step + '/' + t.total;
    if (sergeantText && sergeantText.textContent !== t.text) {
      sergeantText.textContent = t.text;
    }
    if (sergeantHint) {
      sergeantHint.textContent = t.hint || '';
      sergeantHint.classList.toggle('hidden', !sergeantMore || !t.hint);
    }
    if (sergeantGo) {
      // Для тренировки зовём в найм, а не в «ангар»: игрок должен видеть
      // тот же текст, что и на кнопке окна найма. «К центру» остаётся
      // только у шагов, где центр действительно следующая цель.
      let label = 'Поставить';
      if (t.goal === 'train') label = 'Нанять войска';
      else if (t.goal === 'battle' || t.goal === 'level1') label = 'В бой';
      else if (t.goal === 'th2') label = 'К центру';
      else if (t.goal === 'cannon2') label = 'К турели';
      else label = t.primary || 'Поставить';
      if (sergeantGo.textContent !== label) sergeantGo.textContent = label;
    }
    if (sergeantNext) {
      sergeantNext.textContent = sergeantMore ? 'Скрыть' : 'Далее';
    }
  }

  // Кнопка «Поставить»: для здания сразу включает установку, для тренировки
  // открывает ангар, для боя запускает первый сектор. Дальше ведёт квест.
  function sergeantPrimary() {
    const t = CC.Game.tutorial ? CC.Game.tutorial() : null;
    if (!t || !t.active) return { error: 'Обучение завершено' };

    if (t.place) {
      closeQuests();
      closeShop();
      closeLevels();
      closeArena();
      const res = arm(t.place);
      if (res.error) toast(res.error);
      sync();
      return res;
    }
    if (t.goal === 'train') return openHangar();
    if (t.goal === 'battle' || t.goal === 'level1') {
      setMode('battle');
      return { ok: CC.App.mode === 'battle', action: 'battle' };
    }
    return questAction(t.id);
  }

  // Игрок открыл ангар на шаге тренировки — коротко объясняем очередь.
  function maybeHangarTutorialHint() {
    const t = CC.Game.tutorial ? CC.Game.tutorial() : null;
    if (!t || !t.active || t.goal !== 'train') return false;
    if (hangarHintStep === t.id) return false;
    hangarHintStep = t.id;
    toast('Штурмовик → «Нанять» или «×5». Очередь идёт сама: 20 мест на L1 ангара.');
    return true;
  }

  /* Подсказка в деревне — это активное задание. Она живёт, пока шаг не
     выполнен: тап по полю её не выключает. Крестик скрывает до смены шага. */
  const QUEST_HINTS = {
    placeCannon: 'Терминал → «Турель» → тапни по свободной клетке рядом с центром',
    placeArcher: 'Терминал → «Лазерная вышка» → поставь рядом с центром',
    placeGoldmine: 'Терминал → «Бур» → поставь на свободную клетку',
    placeElixir: 'Терминал → «Реактор» → поставь рядом с буром',
    placeStorage: 'Терминал → «Склад руды» → поставь рядом с центром',
    placeEstorage: 'Терминал → «Склад энергии» → поставь рядом с центром',
    placeBarracks: 'Терминал → «Ангар» → поставь на свободную клетку',
    train5: 'Открой ангар, выбери штурмовика и жми «Нанять» или «×5»',
    battle: 'Жми «В БОЙ» внизу, выбери войско и тапни по свободной клетке',
    level1: 'Победи в первом секторе: 50% построек или снос центра',
    th2: 'Тапни по командному центру и нажми «Улучшить до ур. 2»',
    cannon2: 'Тапни по турели и нажми «Улучшить до ур. 2»'
  };

  function syncBaseTip() {
    if (!tipEl) return;

    const list = CC.Game.quests ? CC.Game.quests() : [];
    const active = list.find(function (q) { return q.active; }) || null;

    if (!active) {
      hideTip();
      tipStep = null;
      tipClosedStep = null;
      return;
    }

    // Шаг сменился — крестик больше не действует, подсказка возвращается.
    if (tipStep !== active.id) {
      tipStep = active.id;
      tipClosedStep = null;
    }

    const text = QUEST_HINTS[active.id] || active.text;
    if (tipText && tipText.textContent !== text) tipText.textContent = text;

    // Выбранная постройка могла исчезнуть (снос/сброс базы) — не считаем
    // такую панель открытой, иначе подсказка залипнет скрытой.
    const hasSelection = !!(state.selected && CC.Base.list().some(function (b) {
      return b.id === state.selected;
    }));

    const busy = tipClosedStep === active.id || state.buildMode || loreOpen ||
      !!(state.armed || hasSelection || drag || buildersOpen || questOpen ||
        shopOpen || levelsOpen || achOpen || arenaOpen || askState || dailyOpen);
    tipEl.classList.toggle('hidden', busy);
  }

  function closeQuestHint() {
    if (tipStep) tipClosedStep = tipStep;
    if (tipEl) tipEl.classList.add('hidden');
    return { ok: true };
  }

  /* Клик по строке задания ведёт к цели. Действия не зависят от того,
     открыта панель или нет: тесты и клавиатура ходят сюда же. */
  function questAction(id) {
    const list = CC.Game.quests ? CC.Game.quests() : [];
    const q = list.find(function (row) { return row.id === id; }) || null;
    const placeTypes = {
      placeCannon: 'cannon', placeArcher: 'archer', placeGoldmine: 'goldmine',
      placeElixir: 'elixir', placeStorage: 'storage',
      placeEstorage: 'estorage', placeBarracks: 'barracks'
    };

    if (placeTypes[id] || id === 'shop' || id === 'place2') {
      if (placeTypes[id]) {
        // Ведём прямо к установке нужного здания; терминал закроется сам.
        closeQuests();
        const res = arm(placeTypes[id]);
        if (res.error) {
          toast(res.error);
          openShop();
        }
        sync();
        return { ok: !res.error, action: 'place', type: placeTypes[id] };
      }
      openShop();
      return { ok: true, action: 'shop' };
    }

    if (id === 'train5' || id === 'fill') {
      return openHangar();
    }

    if (id === 'battle' || id === 'level1') {
      setMode('battle');
      return { ok: CC.App.mode === 'battle', action: 'battle' };
    }

    if (id === 'th2' || id === 'cannon2' || id === 'nextTh') {
      const type = (id === 'th2' || id === 'nextTh') ? 'townhall' : 'cannon';
      const target = CC.Base.list().find(function (b) { return b.type === type; });
      if (!target) return { error: 'Постройка не найдена' };

      const size = CC.Base.size(type);
      state.selected = target.id;
      cache.uTimer = null;
      if (CC.CamLookAt) CC.CamLookAt(target.x + size.w / 2, target.y + size.h / 2);
      sync();
      return { ok: true, action: 'select', selected: target.id };
    }

    return { error: 'Неизвестное задание' };
  }

  // Ангар: выделяем казарму и подводим список войск к глазам.
  function openHangar() {
    if (CC.App.mode === 'battle') setMode('base');

    const bar = CC.Base.list().find(function (b) { return b.type === 'barracks'; });
    if (!bar) {
      toast('Сначала поставь ангар');
      return { error: 'Нужен ангар' };
    }

    closeQuests();
    closeShop();
    closeBuilders();
    closeLevels();
    closeChapter();
    state.selected = bar.id;
    cache.uTimer = null;
    maybeHangarTutorialHint();
    const res = openRecruit();
    return res.ok ? { ok: true, selected: bar.id, recruit: true } : res;
  }

  /* ---------- арена (локальный PvP) ---------- */

  function escHtml(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Мини-превью базы соперника: изометрические клетки и домики по
  // ghost.layout. Полноценный рендер здесь не нужен — важны силуэт,
  // плотность обороны и читаемость на 120×80.
  function arenaColour(type) {
    if (type === 'townhall') return '#f2d27a';
    if (type === 'wall') return '#8e9498';
    if (type === 'goldmine') return '#e0b54a';
    if (type === 'elixir') return '#a86ad6';
    if (type === 'storage' || type === 'estorage') return '#6fb3c7';
    if (type === 'barracks' || type === 'lab' || type === 'herohall') return '#8fb56a';
    if (type === 'mine' || type === 'spring' || type === 'airmine') return '#b05a4a';
    if (CC.isTrap && CC.isTrap(type)) return '#b05a4a';
    return '#d9813f';
  }

  function drawArenaPreview(canvas, ghost) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 100;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1811');
    sky.addColorStop(0.55, '#25130d');
    sky.addColorStop(1, '#170c08');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const rows = (ghost && Array.isArray(ghost.layout) ? ghost.layout : [])
      .map(function (r) {
        const d = CC.BUILDINGS[r.type] || {};
        return {
          type: r.type || 'cannon',
          x: Number(r.x) || 0, y: Number(r.y) || 0,
          w: d.w || 1, h: d.h || 1
        };
      });

    // Сетка поля: лёгкие ромбы, чтобы превью читалось как база.
    const unit = 1;
    const projRaw = function (x, y) {
      return { x: (x - y) * 0.72 * unit, y: (x + y) * 0.42 * unit };
    };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    if (rows.length) {
      rows.forEach(function (r) {
        [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
          .forEach(function (p) {
            const q = projRaw(p[0], p[1]);
            if (q.x < minX) minX = q.x;
            if (q.x > maxX) maxX = q.x;
            if (q.y < minY) minY = q.y;
            if (q.y > maxY) maxY = q.y;
          });
      });
    } else {
      minX = -8; maxX = 8; minY = -4; maxY = 8;
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((W - 20) / spanX, (H - 24) / spanY);
    const ox = W / 2 - (minX + maxX) / 2 * scale;
    const oy = H / 2 - (minY + maxY) / 2 * scale + 2;

    function proj(x, y) {
      const q = projRaw(x, y);
      return { x: ox + q.x * scale, y: oy + q.y * scale };
    }

    if (!rows.length) {
      for (let gx = 0; gx < 6; gx++) {
        for (let gy = 0; gy < 6; gy++) {
          const a = proj(gx, gy);
          const b = proj(gx + 1, gy);
          const c = proj(gx + 1, gy + 1);
          const d = proj(gx, gy + 1);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
          ctx.fillStyle = (gx + gy) % 2 ? 'rgba(160,95,50,.08)' : 'rgba(160,95,50,.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(224,162,74,.12)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,231,190,.62)';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('нет данных', W / 2, H / 2 + 4);
      return;
    }

    // Земля под постройками: границы по фактическим клеткам, не по пикселям.
    const pad = 0.7;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    rows.forEach(function (r) {
      gx0 = Math.min(gx0, r.x); gy0 = Math.min(gy0, r.y);
      gx1 = Math.max(gx1, r.x + r.w); gy1 = Math.max(gy1, r.y + r.h);
    });
    gx0 -= pad; gy0 -= pad; gx1 += pad; gy1 += pad;
    const p0 = proj(gx0, gy0);
    const p1 = proj(gx1, gy0);
    const p2 = proj(gx1, gy1);
    const p3 = proj(gx0, gy1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(126,85,52,.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,162,74,.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Сетка внутри базы.
    for (let gx = Math.floor(gx0); gx <= Math.ceil(gx1); gx++) {
      for (let gy = Math.floor(gy0); gy <= Math.ceil(gy1); gy++) {
        if (gx < gx0 || gy < gy0) continue;
        const a = proj(gx, gy);
        const b = proj(gx + 1, gy);
        const c = proj(gx + 1, gy + 1);
        const d = proj(gx, gy + 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(224,162,74,.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    rows.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
    rows.forEach(function (r) {
      const col = arenaColour(r.type);
      const a = proj(r.x, r.y);
      const b = proj(r.x + r.w, r.y);
      const c = proj(r.x + r.w, r.y + r.h);
      const d = proj(r.x, r.y + r.h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20,12,8,.35)';
      ctx.fill();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,226,170,.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Небольшой объём: крыша/блок над клеткой.
      const mid = proj(r.x + r.w / 2, r.y + r.h / 2);
      const bw = Math.max(2.2, scale * 0.55);
      const bh = Math.max(2.4, scale * 0.7);
      ctx.fillStyle = col;
      ctx.fillRect(mid.x - bw / 2, mid.y - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,244,214,.42)';
      ctx.fillRect(mid.x - bw / 2, mid.y - bh, bw, Math.max(1, bh * 0.24));
    });

    // Рамка и виньетка — как у карты.
    const vig = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 92);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(224,162,74,.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  function renderArena() {
    if (!arenaList) return;

    const empty = armyTotal() <= 0;
    arenaList.innerHTML = arenaTargets.map(function (g) {
      // В повторе показываем реальный остаток с учётом уже разграбленного:
      // полный пул на карточке больше не обещаем.
      const info = CC.Pvp && CC.Pvp.lootInfo
        ? CC.Pvp.lootInfo(g)
        : {
          gold: g.loot.gold, elixir: g.loot.elixir,
          first: true, empty: false
        };
      const note = info.first
        ? ''
        : (info.empty ? ' · пул исчерпан' : ' · повтор: 75%');
      return '<div class="arena-card" data-arena-card="' + escHtml(g.id) + '">' +
        '<canvas class="arena-card__map" width="320" height="200"' +
          ' data-arena-map="' + escHtml(g.id) + '"' +
          ' aria-label="Превью базы соперника"></canvas>' +
        '<div class="arena-card__head">' +
          '<b class="arena-card__name">' + escHtml(g.name) + '</b>' +
          '<span class="arena-card__rating">🏆 ' + g.rating + '</span>' +
        '</div>' +
        '<div class="arena-card__meta">Центр ' + g.th + ' · оборона ' + g.defenses +
          note + '</div>' +
        '<div class="arena-card__loot">' +
          '<span>🔩 ' + info.gold + '</span>' +
          '<span>⚡ ' + info.elixir + '</span>' +
        '</div>' +
        '<button class="arena-card__btn" type="button" data-arena-attack="' +
          escHtml(g.id) + '"' + (empty ? ' disabled' : '') + '>Атаковать</button>' +
        '</div>';
    }).join('');

    // Рисуем превью после вставки разметки: canvas уже в DOM.
    if (arenaList.querySelectorAll) {
      const maps = arenaList.querySelectorAll('[data-arena-map]');
      for (let i = 0; i < maps.length; i++) {
        const id = maps[i].dataset ? maps[i].dataset.arenaMap : null;
        const ghost = arenaTargets.find(function (g) { return g.id === id; });
        drawArenaPreview(maps[i], ghost);
      }
    }

    syncArena();
  }

  function syncArena() {
    if (!arenaOpen) return;

    const p = CC.Pvp && CC.Pvp.state ? CC.Pvp.state() : null;
    if (p) {
      if (arenaRating) arenaRating.textContent = String(p.rating);
      if (arenaWins) arenaWins.textContent = String(p.wins);
      if (arenaLosses) arenaLosses.textContent = String(p.losses);
    }

    const wait = Math.max(0, arenaFindReadyAt - Date.now());
    if (arenaFind) {
      const label = wait > 0
        ? 'Поиск через ' + Math.ceil(wait / 1000) + ' с'
        : 'Найти других';
      if (arenaFind.textContent !== label) arenaFind.textContent = label;
      arenaFind.disabled = wait > 0;
    }

    const empty = armyTotal() <= 0;
    if (arenaNote) {
      arenaNote.textContent = empty
        ? 'Армия пуста — найми войск в ангаре, потом возвращайся'
        : '';
      arenaNote.classList.toggle('hidden', !empty);
    }
    if (arenaList) {
      arenaList.querySelectorAll('[data-arena-attack]').forEach(function (btn) {
        btn.disabled = empty;
      });
    }
  }

  function openArena() {
    if (CC.App.mode === 'battle') {
      setMode('base');
    }

    closeShop();
    closeLevels();
    closeBuilders();
    closeQuests();
    closeDaily();
    closeBuyResource();
    closeBuyPlatinum();
    state.armed = null;
    state.selected = null;

    if (CC.Pvp) {
      CC.Pvp.ensure();
      CC.Pvp.resetSearch();
      arenaTargets = CC.Pvp.candidates(CC.Game.state, 3);
    } else {
      arenaTargets = [];
    }

    arenaOpen = true;
    arenaFindReadyAt = 0;
    if (arenaEl) arenaEl.classList.remove('hidden');
    renderArena();
    sync();
    return { ok: true, count: arenaTargets.length };
  }

  function closeArena() {
    arenaOpen = false;
    if (arenaEl) arenaEl.classList.add('hidden');
  }

  function onArenaClick(e) {
    const btn = e.target.closest('[data-arena-attack]');
    if (!btn) return;
    e.preventDefault();
    startPvpBattle(btn.dataset.arenaAttack);
  }

  // «Найти других»: не бесконечный реролл — пауза findCooldown, а окно
  // подбора расширяется с каждой попыткой внутри сессии.
  function findOtherArena() {
    if (!arenaOpen || !CC.Pvp) return { error: 'Арена закрыта' };

    const wait = arenaFindReadyAt - Date.now();
    if (wait > 0) {
      toast('Подожди ' + Math.ceil(wait / 1000) + ' с');
      return { error: 'cooldown', wait: wait };
    }

    CC.Pvp.reroll();
    arenaTargets = CC.Pvp.candidates(CC.Game.state, 3);
    arenaFindReadyAt = Date.now() + ((CC.PVP && CC.PVP.findCooldown) || 10000);
    renderArena();
    return { ok: true, count: arenaTargets.length };
  }

  function startPvpBattle(id) {
    const ghost = arenaTargets.find(function (g) { return g.id === id; }) || null;
    if (!ghost) {
      toast('Соперник не найден');
      return { error: 'Соперник не найден' };
    }

    if (armyTotal() <= 0) {
      closeArena();
      toast('Армия пуста — найми войска в ангаре');
      openHangar();
      return { error: 'Армия пуста', needArmy: true };
    }

    closeArena();
    closeShop();
    closeLevels();
    closeBuilders();
    closeQuests();

    state.armed = null;
    state.selected = null;
    state.buildMode = false;
    state.dragId = null;
    if (drag) dragCancel();

    pvpTarget = ghost;
    warnLootOverflow(ghost.loot || {});
    CC.App.mode = 'battle';
    if (CC.Sound && CC.Sound.setMode) CC.Sound.setMode('battle');

    overlayShown = false;
    overlayEl.classList.add('hidden');
    if (arenaResult) arenaResult.classList.add('hidden');

    CC.Battle.start(CC.Pvp.attack(ghost, CC.Game.armySnapshot()));
    retryReadyAt = Date.now() + 2000;
    cache.pct = cache.time = cache.level = null;
    Object.keys(cache).forEach(function (k) {
      if (k !== 'pct' && k !== 'time' && k !== 'level') delete cache[k];
    });

    if (CC.CamFocus) CC.CamFocus(true);
    showTip('Арена · ' + ghost.name + ' — одна звезда: 50% построек или снос центра');
    sync();
    return { ok: true, ghost: ghost.id };
  }

  function showPvpResult(S) {
    overlayShown = true;
    hideBattleIntro();
    hideTip();

    const res = S.result || { percent: 0, win: false, spent: 0, loot: { gold: 0, elixir: 0 } };
    const ghost = pvpTarget || {
      id: 'pvp', name: 'Арена', rating: 1000,
      loot: S.lootPool || { gold: 0, elixir: 0 }
    };

    const reward = CC.Pvp.commit(res, ghost);
    // Высаженные войска потеряны, невысаженные возвращаются — как в кампании.
    if (CC.Battle.syncArmy) CC.Battle.syncArmy();
    CC.Game.save();
    pvpTarget = null;

    const actual = reward.loot || { gold: 0, elixir: 0 };
    const offered = reward.offered || actual;
    // Сколько не влезло: и расчётный лимит, и фактический остаток склада.
    const lost = {
      gold: Math.max(0, (offered.gold || 0) - (actual.gold || 0)),
      elixir: Math.max(0, (offered.elixir || 0) - (actual.elixir || 0))
    };

    if (CC.Sound) CC.Sound.play(res.win ? 'win' : 'lose');

    const starN = Math.max(0, Math.min(3, res.stars | 0));
    if (arenaStars) {
      // Та же анимация, что в кампании: по одной звезде, без поражения.
      arenaStars.innerHTML = res.win ? resultStarsHtml(starN) : '';
    }

    if (arenaResultTitle) {
      arenaResultTitle.textContent = res.win ? 'Победа на арене' : 'Поражение';
    }
    if (arenaResultText) {
      const reasons = Array.isArray(res.starReasons)
        ? res.starReasons
        : (res.win ? ['50% разрушено'] : []);
      arenaResultText.textContent = 'Разрушено ' + res.percent + '% · ' +
        (res.win ? reasons.join(' · ') : 'нужно 50% или снос центра') +
        ' · рейтинг ' + (reward.delta >= 0 ? '+' : '') + reward.delta +
        ' → ' + reward.rating + ' · +' + reward.xp + ' XP';
    }
    if (arenaResultDaily) {
      const dl = res.daily;
      if (dl && dl.target) {
        arenaResultDaily.textContent = 'Контракт дня: ' + dl.progress + '/' +
          dl.target + ' ★' + (dl.added > 0 ? ' (+' + dl.added + ')' : '') +
          (dl.bank > 0 ? ' · готов забрать' : '');
        arenaResultDaily.classList.remove('hidden');
      } else {
        arenaResultDaily.classList.add('hidden');
      }
    }
    if (arenaResultLoot) {
      const got = (actual.gold || 0) + (actual.elixir || 0) > 0;
      const had = (offered.gold || 0) + (offered.elixir || 0) > 0;
      const emptyLoot = Array.isArray(res.emptyLoot) && res.emptyLoot.length > 0;
      const repeat = reward.first === false;
      arenaResultLoot.textContent = got
        ? 'Добыча: ' + lootText(actual)
        : (had ? 'Добыча: ' + lootText(offered) + ' · всё не влезло'
          : (repeat ? 'Добычи нет · пул призрака исчерпан' : 'Добычи нет'));
      if (got && repeat) arenaResultLoot.textContent += ' · повтор: 75% от остатка';
      if (emptyLoot) arenaResultLoot.textContent += ' · в этом складе уже пусто';
    }
    if (arenaResultArmy) {
      arenaResultArmy.textContent = res.spent
        ? 'Войска: ' + res.spent + ' израсходовано'
        : '';
    }

    if (arenaResultLost) {
      const parts = [];
      if (lost.gold > 0) parts.push(lost.gold + ' руды');
      if (lost.elixir > 0) parts.push(lost.elixir + ' энергии');
      if (parts.length) {
        arenaResultLost.textContent = 'В склады не влезло: ' + parts.join(', ');
        arenaResultLost.classList.remove('hidden');
      } else {
        arenaResultLost.classList.add('hidden');
      }
    }
    if (arenaResultHint) {
      if (offered.gold > actual.gold || offered.elixir > actual.elixir) {
        arenaResultHint.textContent = 'Улучши склады или потрать ресурсы';
        arenaResultHint.classList.remove('hidden');
      } else {
        arenaResultHint.classList.add('hidden');
      }
    }

    if (arenaResult) arenaResult.classList.remove('hidden');
    return reward;
  }

  function arenaAgain() {
    if (arenaResult) arenaResult.classList.add('hidden');
    overlayShown = false;

    if (CC.App.mode === 'battle') setMode('base');

    if (armyTotal() <= 0) {
      toast('Армия пуста — найми войска в ангаре');
      openHangar();
      return { error: 'Армия пуста', needArmy: true };
    }

    const next = CC.Pvp && CC.Pvp.candidates
      ? CC.Pvp.candidates(CC.Game.state, 3)
      : [];
    if (next.length) {
      arenaTargets = next;
      return startPvpBattle(next[0].id);
    }

    openArena();
    return { ok: true, action: 'arena' };
  }

  /* ---------- повторы набегов ---------- */

  function replayDate(at) {
    const d = new Date(Number(at) || 0);
    if (!isFinite(d.getTime())) return '—';
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openReplays() {
    if (drag) dragCancel();
    cancelArm();
    closeQuest();
    closeBuilders();
    closeShop();
    closeLevels();
    closeDaily();
    closeArena();
    closeBuyResource();
    closeBuyPlatinum();

    // «Повторы» вместо отчёта о набеге: отчёт закрываем, иначе он перекроет
    // список и просмотр. Данные набега уже лежат в истории.
    if (CC.Game.pendingRaidInfo && CC.Game.pendingRaidInfo()) {
      CC.Game.claimRaid();
      raidShown = false;
      raidShownAt = 0;
      if (raidEl) raidEl.classList.add('hidden');
    }

    replaysOpen = true;
    cache.replaySig = null;
    if (replaysEl) replaysEl.classList.remove('hidden');
    renderReplayList();
    sync();
    return { ok: true, count: (CC.Game.raidHistory ? CC.Game.raidHistory() : []).length };
  }

  function closeReplays() {
    replaysOpen = false;
    if (replaysEl) replaysEl.classList.add('hidden');
  }

  function renderReplayList() {
    if (!replaysOpen || !replayList) return;

    const list = CC.Game.raidHistory ? CC.Game.raidHistory() : [];
    const sig = list.map(function (r) {
      return r.at + '|' + r.percent + '|' + r.stars + '|' + r.loot.gold + '|' + r.loot.elixir;
    }).join(';');
    if (cache.replaySig === sig) {
      if (replaysEmpty) replaysEmpty.classList.toggle('hidden', list.length > 0);
      return;
    }
    cache.replaySig = sig;

    if (!list.length) {
      replayList.innerHTML = '';
      if (replaysEmpty) {
        replaysEmpty.textContent = 'На базу пока не нападали';
        replaysEmpty.classList.remove('hidden');
      }
      return;
    }

    if (replaysEmpty) replaysEmpty.classList.add('hidden');
    replayList.innerHTML = list.map(function (r, i) {
      const loot = [];
      if (r.loot.gold > 0) loot.push(fmtNum(r.loot.gold) + ' руды');
      if (r.loot.elixir > 0) loot.push(fmtNum(r.loot.elixir) + ' энергии');
      return '<div class="replay-row" data-replay-row="' + i + '">' +
        '<div class="replay-row__main">' +
          '<b class="replay-row__attacker">' + escHtml(r.attacker) + '</b>' +
          '<span class="replay-row__date">' + replayDate(r.at) + '</span>' +
        '</div>' +
        '<div class="replay-row__meta">' +
          '<span class="replay-row__pct">' + r.percent + '%</span>' +
          '<span class="replay-row__stars">' + starRow(r.stars) + '</span>' +
          '<span class="replay-row__loot">' + (loot.length ? loot.join(', ') : 'без добычи') + '</span>' +
        '</div>' +
        '<button class="replay-row__btn" type="button" data-replay="' + i + '">Смотреть</button>' +
      '</div>';
    }).join('');
  }

  function onReplayListClick(e) {
    const btn = e.target.closest('[data-replay]');
    if (!btn) return;
    startReplay(Number(btn.dataset.replay));
  }

  function setReplaySpeed(n) {
    CC.App.replaySpeed = n === 2 ? 2 : 1;
    if (replaySpeed1) {
      replaySpeed1.classList.toggle('is-active', CC.App.replaySpeed === 1);
      replaySpeed1.setAttribute('aria-pressed', CC.App.replaySpeed === 1 ? 'true' : 'false');
    }
    if (replaySpeed2) {
      replaySpeed2.classList.toggle('is-active', CC.App.replaySpeed === 2);
      replaySpeed2.setAttribute('aria-pressed', CC.App.replaySpeed === 2 ? 'true' : 'false');
    }
    return CC.App.replaySpeed;
  }

  function startReplay(index) {
    const list = CC.Game.raidHistory ? CC.Game.raidHistory() : [];
    const r = list[Number(index)];
    if (!r) {
      toast('Повтор не найден');
      return { error: 'Повтор не найден' };
    }

    closeReplays();
    closeLevels();
    closeShop();
    closeBuilders();
    closeQuests();
    closeDaily();
    closeArena();
    if (drag) dragCancel();

    // Набег мог ждать подтверждения: не показываем его отчёт поверх повтора.
    if (CC.Game.pendingRaidInfo && CC.Game.pendingRaidInfo()) {
      CC.Game.claimRaid();
      raidShown = false;
      raidShownAt = 0;
      if (raidEl) raidEl.classList.add('hidden');
    }

    state.armed = null;
    state.selected = null;
    state.buildMode = false;
    state.dragId = null;

    replayRecord = r;
    replayEndShown = false;
    pvpTarget = null;
    overlayShown = false;
    if (overlayEl) overlayEl.classList.add('hidden');
    if (arenaResult) arenaResult.classList.add('hidden');
    if (replayEnd) replayEnd.classList.add('hidden');

    CC.App.mode = 'battle';
    if (CC.Sound && CC.Sound.setMode) CC.Sound.setMode('battle');
    setReplaySpeed(1);

    // База берётся текущая: в записи нет снимка построек, а повтор идёт
    // по знакомой игроку базе. Лог десанта — из истории набега.
    CC.Battle.startReplay({
      buildings: CC.Game.defenseDescriptor(),
      army: r.army,
      log: r.log,
      name: 'Повтор нападения',
      limit: CC.TIME_LIMIT
    });

    cache.pct = cache.time = cache.level = null;
    Object.keys(cache).forEach(function (k) {
      if (k !== 'pct' && k !== 'time' && k !== 'level') delete cache[k];
    });
    if (CC.CamFocus) CC.CamFocus(true);
    if (CC.Sound && CC.Sound.play) CC.Sound.play('raidAlarm');

    sync();
    return { ok: true, replay: replayRecord };
  }

  function closeReplayScreen() {
    if (replayBanner) replayBanner.classList.add('hidden');
    if (replayEnd) replayEnd.classList.add('hidden');
    if (app) app.classList.remove('is-replay');
    replayRecord = null;
    replayEndShown = false;
    CC.App.replaySpeed = 1;
    overlayShown = false;
    if (overlayEl) overlayEl.classList.add('hidden');
    setMode('base');
    return { ok: true };
  }

  function showReplayEnd(S) {
    replayEndShown = true;
    const res = (S && S.result) || { stars: 0, percent: 0, win: false };
    if (replayStars) {
      replayStars.innerHTML = resultStarsHtml(res.stars || 0);
    }
    if (replayEndTitle) {
      replayEndTitle.textContent = res.stars > 0 ? 'Набег отбит' : 'Повтор завершён';
    }
    if (replayEndText) {
      const reasons = Array.isArray(res.starReasons) && res.starReasons.length
        ? ' · ' + res.starReasons.join(' · ')
        : '';
      replayEndText.textContent = 'Разрушено ' + (res.percent || 0) + '%' + reasons +
        ' · запись нападения, добыча не начисляется';
    }
    if (replayEnd) replayEnd.classList.remove('hidden');
  }

  // Служебное состояние просмотра: плашка, скорость и финал.
  function syncReplay() {
    const S = CC.Battle.state;
    const on = CC.App.mode === 'battle' && !!S && S.kind === 'replay';

    if (app) app.classList.toggle('is-replay', on);
    if (replayBanner) replayBanner.classList.toggle('hidden', !on);

    if (!on) {
      if (replayEnd) replayEnd.classList.add('hidden');
      replayEndShown = false;
      return;
    }

    if (replaySpeed1) replaySpeed1.classList.toggle('is-active', (CC.App.replaySpeed || 1) === 1);
    if (replaySpeed2) replaySpeed2.classList.toggle('is-active', CC.App.replaySpeed === 2);

    if (S.over && !replayEndShown) showReplayEnd(S);
  }

  /* ---------- общий sync ---------- */

  // Компактный HUD для телефона лёжа: одна строка сверху, короткие ресурсы,
  // подсказка не висит над базой, зум-кнопки скрыты (жесты остаются).
  function compactForHeight(h) {
    const n = Number(h);
    return isFinite(n) && n > 0 && n <= 430;
  }

  function applyCompact(h) {
    const on = compactForHeight(h);
    if (app) app.classList.toggle('is-compact', on);
    return on;
  }

  function syncCompact() {
    const winH = typeof window !== 'undefined' && window.innerHeight;
    const h = winH || (app && app.clientHeight) || 0;
    if (h > 0) applyCompact(h);
  }

  function sync() {
    syncCompact();
    syncRaid();
    syncOffline();
    syncSound();

    // Миграция старого сейва не нашла места под склад энергии: сообщаем
    // один раз, игра при этом не ломается — лимит энергии просто 0.
    if (CC.Game.takeEstorageHint && CC.Game.takeEstorageHint()) {
      toast('Нет места под склад энергии — освободи клетку');
    }

    const upgradesDone = CC.Game.takeUpgradeDone();
    if (upgradesDone && CC.Sound) CC.Sound.play('upgradeDone');

    // Стройка закончилась (в том числе пока игрока не было).
    const buildsDone = CC.Game.takeBuildDone ? CC.Game.takeBuildDone() : [];
    for (let i = 0; i < buildsDone.length; i++) {
      toast(buildDoneText(buildsDone[i]));
      if (CC.Sound) CC.Sound.play('upgradeDone');
    }

    // Исследование войск завершилось: тост с новым уровнем.
    const troopDone = CC.Game.takeTroopDone ? CC.Game.takeTroopDone() : null;
    if (troopDone) {
      toast((troopDone.name || 'Войско') + ' — ур. ' + troopDone.level);
      if (CC.Sound) CC.Sound.play('upgradeDone');
    }

    if (lastMode !== CC.App.mode) {
      lastMode = CC.App.mode;
      app.dataset.mode = CC.App.mode;
      document.querySelectorAll('.mode').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.mode === CC.App.mode);
      });
    }

    syncModeButton();
    syncBuildMode();
    syncCollect();
    syncCollectAll();
    syncDailyChip();
    syncTruce();
    syncLevels();
    syncPlayerLevel();
    syncAchievements();
    syncArena();
    syncReplay();
    syncSectorBadge();
    if (replaysOpen) renderReplayList();
    syncDaily();
    syncLore();
    if (recruitOpen) syncRecruit();

    const dailyDone = CC.Game.takeDailyDone ? CC.Game.takeDailyDone() : 0;
    if (dailyDone && !anyOverlayOpen()) {
      toast('Контракт выполнен — забери награду');
      if (CC.Sound) CC.Sound.play('questDone');
    }

    const newLevel = CC.Game.takeLevelUp();
    if (newLevel) {
      toast('Уровень ' + newLevel + '!');
      if (CC.Sound) CC.Sound.play('levelUp');
    }

    if (CC.App.mode === 'base') {
      syncRes();
      syncLevelChip();
      syncQuests();
      syncQuestBar();
      syncArmyCounter();
      syncBuildersChip();
      if (buildersOpen) syncBuildersPanel();
      syncShop();
      syncBuyResource();
      syncBuyPlatinum();
      syncShopButton();
      syncSelbar();
      syncBaseTip();
      syncSergeant();
      updateGhost();
    } else {
      syncRes();
      syncQuests();
      syncArmyCounter();
      syncBattle();
      if (sergeantEl) sergeantEl.classList.add('hidden');
      if (introNeedsPos && battleIntro && !battleIntro.classList.contains('hidden')) {
        positionBattleIntro();
      }
    }

    syncTutorialPointer();
    syncBattlePrep();
  }

  /* ---------- финал боя ---------- */

  function lootText(map) {
    const parts = [];
    if (map.gold) parts.push(map.gold + ' руды');
    if (map.elixir) parts.push(map.elixir + ' энергии');
    return parts.length ? parts.join(', ') : '0';
  }

  // Звёзды окна результата: заработанные появляются по одной (задержку
  // задаёт CSS через --star-i), незаработанные остаются бледными. Появление
  // идёт только transform/opacity, поэтому карточка не «прыгает».
  function resultStarsHtml(n) {
    const got = Math.max(0, Math.min(3, Math.floor(Number(n) || 0)));
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += i < got
        ? '<span class="star" style="--star-i:' + i + '">★</span>'
        : '<span class="dim">★</span>';
    }
    return html;
  }

  function showOverlay(res) {
    overlayShown = true;
    hideBattleIntro();

    const win = !!res.win;
    if (resultCard) {
      resultCard.classList.toggle('is-win', win);
      resultCard.classList.toggle('is-loss', !win);
    }
    if (resultBanner) {
      const src = win ? 'assets/victory-banner.svg' : 'assets/defeat-banner.svg';
      if (resultBannerFallback) {
        resultBannerFallback.textContent = win ? '🏆' : '💥';
        resultBannerFallback.classList.remove('hidden');
      }
      resultBanner.classList.add('hidden');
      resultBanner.onload = function () {
        resultBanner.classList.remove('hidden');
        if (resultBannerFallback) resultBannerFallback.classList.add('hidden');
      };
      resultBanner.onerror = function () {
        resultBanner.classList.add('hidden');
        if (resultBannerFallback) resultBannerFallback.classList.remove('hidden');
      };
      resultBanner.src = src;
    }

    // При поражении звёзд нет и анимировать нечего.
    starsEl.innerHTML = res.win ? resultStarsHtml(res.stars) : '';

    overlayTitle.textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';

    // Причина звёзд: 50%, снос центра, 100% — игрок видит, за что получил ★.
    if (overlayReason) {
      const reasons = Array.isArray(res.starReasons) ? res.starReasons : [];
      overlayReason.textContent = res.win
        ? (reasons.length ? '★ ' + reasons.join(' · ') : '★ победа')
        : 'Нужно 50% построек или снос центра';
      overlayReason.classList.toggle('is-win', !!res.win);
    }

    overlayText.textContent = 'Разрушено ' + res.percent + '% · ' + formatTime(res.time) +
      (res.allCleared ? ' · все уровни пройдены' : '');

    if (overlayDaily) {
      const dl = res.daily;
      if (dl && dl.target) {
        overlayDaily.textContent = 'Контракт дня: ' + dl.progress + '/' + dl.target + ' ★' +
          (dl.added > 0 ? ' (+' + dl.added + ')' : '') +
          (dl.bank > 0 ? ' · готов забрать' : '');
        overlayDaily.classList.remove('hidden');
      } else {
        overlayDaily.classList.add('hidden');
      }
    }
    if (CC.Sound) CC.Sound.play(res.win ? 'win' : 'lose');

    // Добыча — отдельными чипами: руда / энергия / платина. Значения
    // берём из фактически снесённых зданий, без «нарисованных» чисел.
    const actual = res.loot || { gold: 0, elixir: 0 };
    const offered = res.lootOffered || actual;
    const lost = res.lootLost || { gold: 0, elixir: 0 };
    const hasOffered = (offered.gold || 0) + (offered.elixir || 0) > 0;
    const emptyLoot = Array.isArray(res.emptyLoot) && res.emptyLoot.length > 0;

    if (overlayLoot) {
      const chips = ['<span class="loot-chips__label">Добыча:</span>'];
      if (offered.gold > 0) {
        chips.push('<span class="loot-chip loot-chip_gold">🔩 <b>' +
          fmtNum(offered.gold) + '</b> руды</span>');
      }
      if (offered.elixir > 0) {
        chips.push('<span class="loot-chip loot-chip_elixir">⚡ <b>' +
          fmtNum(offered.elixir) + '</b> энергии</span>');
      }
      if (res.gems) {
        chips.push('<span class="loot-chip loot-chip_gems">' +
          '<span class="ico ico-platinum" aria-hidden="true"></span> <b>+' +
          res.gems + '</b> ' + platText(res.gems) + '</span>');
      }
      if (!hasOffered && !res.gems) {
        chips.push('<span class="loot-chip loot-chip_empty">нет</span>');
      }
      if (emptyLoot) {
        chips.push('<span class="loot-chip loot-chip_empty">в этом складе уже пусто</span>');
      }
      overlayLoot.innerHTML = chips.join('');
    }

    const lostParts = [];
    if (lost.gold > 0) lostParts.push(lost.gold + ' руды');
    if (lost.elixir > 0) lostParts.push(lost.elixir + ' энергии');

    // Высаженные войска списываются всегда, даже если выжили.
    if (overlayArmy) {
      if (typeof res.spent === 'number' && isFinite(res.spent)) {
        overlayArmy.textContent = 'Войска: ' + res.spent + ' израсходовано';
        overlayArmy.classList.remove('hidden');
      } else {
        overlayArmy.classList.add('hidden');
      }
    }

    if (lostParts.length) {
      const allLost = !actual.gold && !actual.elixir;

      if (allLost) {
        overlayLost.textContent = 'Не влезло: ' + lostParts.join(', ') +
          ' (склады полны)';
        overlayHint.textContent = 'Улучши склады или потрать ресурсы';
        overlayHint.classList.remove('hidden');
      } else {
        overlayLost.textContent = 'Не влезло: ' + lostParts.join(', ');
        overlayHint.textContent = 'Получено: ' + lootText(actual);
        overlayHint.classList.remove('hidden');
      }

      overlayLost.classList.remove('hidden');
    } else {
      overlayLost.classList.add('hidden');
      overlayHint.classList.add('hidden');
    }

    // на пятом уровне следующего уже нет — предлагаем переиграть.
    // Пустая армия — тупик: вместо «ещё раз» ведём в ангар.
    const emptyArmy = !!(CC.Game && CC.Game.armyUsed && CC.Game.armyUsed() <= 0);
    trainAfterBattle = emptyArmy;

    if (emptyArmy) {
      btnAgain.textContent = 'Натренировать отряд';
    } else {
      btnAgain.textContent = (res.win && !res.allCleared && !res.replay)
        ? 'Следующий уровень'
        : 'Ещё раз';
    }

    overlayEl.classList.remove('hidden');
  }

  /* ---------- подтверждение ---------- */

  // Свой модал вместо нативных диалогов: в iframe площадки они
  // бывают заблокированы. Возвращает Promise с ответом игрока.
  // Без DOM (headless/node) молча считаем согласием, как раньше.
  function ask(text) {
    if (!askEl || !askOk) return Promise.resolve(true);

    // повторный вызов при открытом модале не плодит второй оверлей
    if (askState) return askState.promise;

    const prevFocus = document.activeElement || null;
    const promise = new Promise(function (resolve) {
      askState = { resolve: resolve, prevFocus: prevFocus, promise: null };
    });
    askState.promise = promise;

    if (askTextEl) askTextEl.textContent = text;
    askEl.classList.remove('hidden');
    CC.App.modalOpen = true;
    syncBuildMode();

    // фокус сразу на подтверждении: Enter работает без мыши
    try {
      askOk.focus();
    } catch (e) { /* фокус не критичен */ }

    return promise;
  }

  function askClose(ok) {
    if (!askState) return;

    const st = askState;
    askState = null;

    if (askEl) askEl.classList.add('hidden');
    CC.App.modalOpen = false;
    syncBuildMode();

    st.resolve(!!ok);

    // возвращаем фокус туда, где он был до открытия модала
    try {
      if (st.prevFocus && st.prevFocus.focus) st.prevFocus.focus();
    } catch (e) { /* элемент мог исчезнуть */ }
  }

  function battleAgain() {
    if (trainAfterBattle) {
      trainAfterBattle = false;
      overlayShown = false;
      overlayEl.classList.add('hidden');
      openHangar();
      return { ok: true, action: 'train' };
    }
    restartBattle();
    return { ok: true, action: 'retry' };
  }

  // Досрочный финал: спрашиваем подтверждение и завершаем тем же путём,
  // что и таймер. Отмена, Esc и клик по подложке бой не трогают.
  function finishBattleNow() {
    const S = CC.Battle.state;
    if (!S || S.over) return false;

    ask('Завершить бой? Звёзды и добыча сохранятся').then(function (ok) {
      if (!ok) return;
      const now = CC.Battle.state;
      if (!now || now.over) return;
      CC.Battle.finishNow();
      sync();
    });
    return true;
  }

  function restartBattle() {
    if (CC.Battle.state && CC.Battle.state.kind === 'pvp') {
      toast('На арене бой не перезапускается');
      return;
    }

    const wasBattle = CC.App.mode === 'battle';
    const prev = CC.Battle.state;

    // Ретрай честно списывает уже высаженных: сначала фиксируем остаток
    // армии боя в деревне, потом снимаем новый снимок.
    if (wasBattle && prev && !prev.over) {
      if (Date.now() < retryReadyAt) return;

      ask('Начать заново? Войска будут потеряны').then(function (ok) {
        if (ok) applyRestart(wasBattle);
      });
      return;
    }

    applyRestart(wasBattle);
  }

  function applyRestart(wasBattle) {
    const prev = CC.Battle.state;

    if (wasBattle && prev) {
      CC.Battle.syncArmy();
      CC.Game.save();
    }

    if (armyTotal() <= 0) {
      toast('Армия пуста — найми войска');
      setMode('base');
      return;
    }

    overlayShown = false;
    overlayEl.classList.add('hidden');

    // Перезапускаем выбранный уровень. После победы над новым уровнем
    // выбор равен ему же, поэтому «Ещё раз» не уводит с карты.
    CC.Battle.reset(chosenLevel());
    retryReadyAt = Date.now() + 2000;
    cache.pct = cache.time = cache.level = null;
    Object.keys(cache).forEach(function (k) {
      if (k !== 'pct' && k !== 'time' && k !== 'level') delete cache[k];
    });

    if (CC.CamFocus) CC.CamFocus(true);

    if (!wasBattle) {
      CC.App.mode = 'battle';
      lastMode = null;
      if (CC.Sound && CC.Sound.setMode) CC.Sound.setMode('battle');
    }

    const lvl = CC.LEVELS[chosenLevel()];
    showTip((lvl && lvl.hint) || 'Выбери войско внизу и тапни по любой свободной клетке');
    sync();
  }

  /* ---------- мелочи ---------- */

  /* ---------- подсказки ---------- */

  // В бою подсказка показывает художественный хинт уровня; в деревне
  // её текст задаёт активное задание, поэтому showTip туда не пускаем.
  function showTip(text) {
    if (CC.App.mode !== 'battle') return;
    if (!tipEl) return;
    if (text && tipText) tipText.textContent = text;
    tipEl.classList.remove('hidden');
    showBattleIntro();
  }

  function hideTip() {
    if (tipEl) tipEl.classList.add('hidden');
  }

  // Первый сектор: отдельная инструкция, а не только художественный хинт.
  function showBattleIntro() {
    if (!battleIntro || CC.App.mode !== 'battle') return;
    const S = CC.Battle.state;
    // PvP-бой идёт на чужой базе: инструкция первого сектора тут не нужна.
    if (S && S.kind === 'pvp') {
      battleIntro.classList.add('hidden');
      return;
    }
    const level = S ? (S.level | 0) : CC.Game.currentLevel();
    const cleared = CC.Game.clearedLevels ? CC.Game.clearedLevels() : [];
    const show = level === 0 && cleared.indexOf(0) === -1 && !introDone && !(S && S.over);
    battleIntro.classList.toggle('hidden', !show);
    if (show) {
      // data-mode переключится в sync чуть позже; там и посчитаем позицию
      introNeedsPos = true;
      battleIntro.style.top = '';
    }
  }

  // Инструкция всегда ниже подсказки, какой бы длинной та ни была.
  function positionBattleIntro() {
    if (!battleIntro || !tipEl) return;
    introNeedsPos = false;
    if (tipEl.classList.contains('hidden')) {
      battleIntro.style.top = '';
      return;
    }
    const r = tipEl.getBoundingClientRect();
    if (r && r.height > 0) battleIntro.style.top = Math.round(r.bottom + 8) + 'px';
  }

  function hideBattleIntro() {
    if (battleIntro) battleIntro.classList.add('hidden');
  }

  function dismissBattleIntro() {
    introDone = true;
    hideBattleIntro();
  }

  // Единый формат таймеров: до 10 минут — M:SS, дальше минуты/часы/дни.
  // Примеры: 60 → «1:00», 2700 → «45 мин», 7200 → «2 ч», 115200 → «1 д 8 ч».
  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    if (s < 600) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    }
    if (s < 3600) return Math.ceil(s / 60) + ' мин';
    if (s < 86400) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h + ' ч' + (m ? ' ' + m + ' мин' : '');
    }
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return d + ' д' + (h ? ' ' + h + ' ч' : '');
  }

  // «Турель построена», «Бур построен», «Хранилище построено».
  function buildDoneText(type) {
    const name = (CC.BUILDINGS[type] || {}).name || 'Модуль';
    const fem = { cannon: 1, archer: 1, mortar: 1, mage: 1, wall: 1 };
    const neut = { storage: 1, estorage: 1, townhall: 1 };
    if (fem[type]) return name + ' построена';
    if (neut[type]) return name + ' построено';
    return name + ' построен';
  }

  function starText(n) {
    const s = Math.max(0, Math.min(3, Math.floor(Number(n) || 0)));
    return '★'.repeat(s) + '☆'.repeat(3 - s);
  }

  // 20500 → «20 500»: те же разряды, что и в причинах отказа.
  function fmtNum(v) {
    return String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // «1 слот / 2 слота / 5 слотов» — для очереди и панели найма.
  function slotWord(n) {
    const k = Math.abs(Math.floor(Number(n) || 0)) % 100;
    if (k >= 11 && k <= 14) return 'слотов';
    const d = k % 10;
    if (d === 1) return 'слот';
    if (d >= 2 && d <= 4) return 'слота';
    return 'слотов';
  }

  // «1 платина», «2 платины», «5 платин» для подписей, кнопок и тостов.
  function platText(n) {
    return CC.platinum ? CC.platinum(n) : (Math.max(0, Math.floor(Number(n) || 0)) + ' платин');
  }

  // «Ускорить за 1 платину, 2 платины, 5 платин» — винительный падеж.
  function platAcc(n) {
    if (CC.platinumAcc) return CC.platinumAcc(n);
    return platText(n);
  }

  // Название очередной бригады: 2 → «Вторая», 3 → «Третья», 4 → «Четвёртая».
  function builderOrdinal(n) {
    const words = { 2: 'Вторая', 3: 'Третья', 4: 'Четвёртая' };
    return words[n] || (n + '-я');
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);

    if (h > 0) return h + ' ч' + (m ? ' ' + m + ' мин' : '');
    if (m > 0) return m + ' мин';
    return s + ' с';
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1500);
  }

  return {
    init: init,
    bindHudPanels: bindHudPanels,
    sync: sync,
    compactForHeight: compactForHeight,
    applyCompact: applyCompact,
    syncCompact: syncCompact,
    setMode: setMode,
    state: state,
    toast: toast,
    formatTime: formatTime,
    showTabLock: showTabLock,
    hideTabLock: hideTabLock,
    arm: arm,
    cancelArm: cancelArm,
    setBuildMode: setBuildMode,
    toggleBuildMode: toggleBuildMode,
    isBuildMode: function () { return state.buildMode; },
    tryPlace: tryPlace,
    removeBuilding: removeBuilding,
    storageFree: storageFree,
    warnLootOverflow: warnLootOverflow,
    collect: collectBuilding,
    collectAll: collectAllNow,
    collectLayout: collectLayout,
    collectObstacles: collectObstacles,
    collectOpacity: collectOpacity,
    collectIconSize: collectIconSize,
    collectAnchor: collectAnchor,
    COLLECT_HITBOX: COLLECT_SIZE,
    COLLECT_SHIFT_MAX: COLLECT_SHIFT_MAX,
    COLLECT_ANCHOR_LIFT: COLLECT_ANCHOR_LIFT,
    COLLECT_ICON_MIN: COLLECT_MIN_VISUAL,
    FX_MAX_PARTICLES: FX_MAX,
    prefersReducedMotion: reducedMotion,
    syncCollect: syncCollect,
    openDaily: openDaily,
    closeDaily: closeDaily,
    claimDaily: claimDaily,
    isDailyOpen: function () { return dailyOpen; },
    clockShort: clockShort,
    openShop: openShop,
    closeShop: closeShop,
    openQuests: openQuests,
    closeQuests: closeQuests,
    questAction: questAction,
    syncSergeant: syncSergeant,
    syncLore: syncLore,
    loreNext: loreNext,
    loreSkip: finishLore,
    lorePage: function () { return lorePage; },
    sergeantPrimary: sergeantPrimary,
    tutorialTarget: tutorialTarget,
    skipBattlePrep: skipBattlePrep,
    inBattlePrep: function () { return !!CC.App.prepActive; },
    openHangar: openHangar,
    openRecruit: openRecruit,
    closeRecruit: closeRecruit,
    syncRecruit: syncRecruit,
    syncSectorBadge: syncSectorBadge,
    isRecruitOpen: function () { return recruitOpen; },
    heroAbility: heroAbility,
    closeQuestHint: closeQuestHint,
    baseTap: baseTap,
    battleAgain: battleAgain,
    openLevels: openLevels,
    closeLevels: closeLevels,
    openChapter: openChapter,
    closeChapter: closeChapter,
    syncChapter: syncChapter,
    chapterStats: function (era) { return chapterStats(era); },
    chapterTargetInfo: function (index) { return chapterTargetInfo(index); },
    chapterGo: function (index) { return chapterGo(index); },
    claimChapter: function () { return claimChapter(); },
    isChapterOpen: function () { return chapterOpen; },
    chapterIndex: function () { return chapterIndex; },
    onBattleButton: onBattleButton,
    chooseLevel: chooseLevel,
    attackMapLevel: attackMapLevel,
    selectMapLevel: function (index) { mapSelected = Number(index); cache.levelSig = null; syncLevels(); return mapSelected; },
    openReplays: openReplays,
    closeReplays: closeReplays,
    startReplay: startReplay,
    closeReplayScreen: closeReplayScreen,
    setReplaySpeed: setReplaySpeed,
    isReplaysOpen: function () { return replaysOpen; },
    openBuilders: openBuilders,
    closeBuilders: closeBuilders,
    openArena: openArena,
    closeArena: closeArena,
    findOtherArena: findOtherArena,
    startPvpBattle: startPvpBattle,
    arenaAgain: arenaAgain,
    isArenaOpen: function () { return arenaOpen; },
    openAchievements: openAchievements,
    closeAchievements: closeAchievements,
    isShopOpen: function () { return shopOpen; },
    setShopCategory: function (id) {
      const found = SHOP_CATS.find(function (c) { return c.id === id; });
      shopCat = found ? found.id : 'all';
      cache.shopSig = null;
      resetShopScroll();
      if (shopOpen) syncShop();
      return shopCat;
    },
    shopCategory: function () { return shopCat; },
    shopCategoryTypes: function (id) { return shopCatTypes(id || shopCat); },
    setShopTab: setShopTab,
    openBuyResource: openBuyResource,
    closeBuyResource: closeBuyResource,
    isBuyResourceOpen: isBuyResourceOpen,
    buyResource: buyResource,
    openBuyPlatinum: openBuyPlatinum,
    closeBuyPlatinum: closeBuyPlatinum,
    isBuyPlatinumOpen: isBuyPlatinumOpen,
    platinumStubText: 'Оплата появится после подключения площадки',
    dragBegin: dragBegin,
    dragActivate: dragActivate,
    dragTarget: dragTarget,
    dragDrop: dragDrop,
    dragCancel: dragCancel,
    isDragging: isDragging,
    restartBattle: restartBattle,
    finishBattleNow: finishBattleNow
  };
})();

/* Стартовая заставка «Колония»: посадочный модуль падает и врезается
   в грунт, раскрывается в командный центр, загораются огни, поднимается
   турель, камера отъезжает — база ожила. Сцену целиком рисует canvas
   через CC.Render.drawIntro; ui.js держит тайминги, паузу и пропуск.
   Пока оверлей открыт, CC.App.introOpen держит игровой цикл на паузе:
   экономика и таймеры не тикают, ввод по сцене не проходит. */
CC.Intro = (function () {
  'use strict';

  const PHASES = ['is-gate', 'is-fall', 'is-impact', 'is-unfold', 'is-reveal',
    'is-title', 'is-reduced', 'is-done'];
  const T = CC.INTRO || {};
  const FLAG = T.flag || 'clash-intro-v1'; // старый флаг «уже видел»
  const OFF_FLAG = T.offFlag || 'clash-intro-off-v1'; // постоянный отказ
  const OPT_ID = 'intro-skip-next';

  let el = null;
  let gateEl = null;
  let canvasEl = null;
  let ctx = null;
  let skipBtn = null;
  let optInput = null;
  let bound = false;
  let open = false;
  let gate = false; // ждём жест: анимация ещё не началась
  let reduced = false;
  let current = 'idle';
  let lastReason = '';
  let timers = [];
  let safetyTimer = null;
  let rafId = 0;
  let startedAt = 0;
  let viewW = 0;
  let viewH = 0;
  let viewDpr = 1;

  function num(name, fallback) {
    const v = Number(T[name]);
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  function fallMs() { return num('fallMs', 2500); }
  function impactMs() { return num('impactMs', 500); }
  function unfoldMs() { return num('unfoldMs', 1500); }
  function revealMs() { return num('revealMs', 1200); }
  function titleMs() { return num('titleMs', 800); }
  function reducedMs() { return num('reducedMs', 400); }
  function reducedFrameMs() { return num('reducedFrameMs', 200); }
  function safetyMs() { return num('safetyMs', 8000); }

  // Сумма всех фаз: столько живёт сцена и столько получает художник в t.
  function totalMs() {
    return fallMs() + impactMs() + unfoldMs() + revealMs() + titleMs();
  }

  // ?intro=1 — показать принудительно, ?intro=0 — не показывать никогда.
  function queryMode() {
    let search = '';
    try {
      search = (typeof window !== 'undefined' && window.location &&
        window.location.search) || '';
    } catch (e) { /* location недоступен */ }

    const m = /[?&]intro=([^&]*)/.exec(search);
    if (!m) return '';
    try {
      return decodeURIComponent(m[1] || '');
    } catch (e) {
      return m[1] || '';
    }
  }

  function storedOff() {
    try {
      return !!(window.localStorage && window.localStorage.getItem(OFF_FLAG));
    } catch (e) {
      return false;
    }
  }

  function storedLegacy() {
    try {
      return !!(window.localStorage && window.localStorage.getItem(FLAG));
    } catch (e) {
      return false;
    }
  }

  function writeOff(on) {
    try {
      if (!window.localStorage) return;
      if (on) window.localStorage.setItem(OFF_FLAG, '1');
      else window.localStorage.removeItem(OFF_FLAG);
    } catch (e) { /* приватный режим — играем без флага */ }
  }

  // Старый флаг «заставка уже показана» превращаем в постоянный отказ:
  // те, кто видел сцену раньше, повторно её не получают.
  function migrateLegacy() {
    if (!storedLegacy()) return false;
    if (!storedOff()) writeOff(true);
    return true;
  }

  // Заставка идёт при каждом запуске, пока игрок не отключил её галочкой.
  function shouldShow() {
    const mode = queryMode();
    if (mode === '0') return false;
    if (mode === '1') return true;
    return !storedOff();
  }

  function getOptInput() {
    if (!optInput && typeof document !== 'undefined' && document.getElementById) {
      optInput = document.getElementById(OPT_ID);
    }
    return optInput;
  }

  function optChecked() {
    const input = getOptInput();
    return !!(input && input.checked);
  }

  // Галочка снята — заставка вернётся в следующий запуск; стоит —
  // пишем постоянный флаг. Так же работает и после досмотра, и после skip.
  function applyOptOut() {
    writeOff(optChecked());
  }

  function reducedMotion() {
    try {
      return !!(typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function getEl() {
    if (!el && typeof document !== 'undefined' && document.getElementById) {
      el = document.getElementById('intro');
    }
    return el;
  }

  function getGate() {
    if (!gateEl && typeof document !== 'undefined' && document.getElementById) {
      gateEl = document.getElementById('intro-gate');
    }
    return gateEl;
  }

  function showGate(on) {
    const g = getGate();
    if (!g || !g.classList) return;
    g.classList.toggle('hidden', !on);
    if (g.setAttribute) g.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function getCanvas() {
    if (!canvasEl && typeof document !== 'undefined' && document.getElementById) {
      canvasEl = document.getElementById('intro-canvas');
    }
    return canvasEl;
  }

  function getCtx() {
    if (ctx) return ctx;
    const c = getCanvas();
    if (!c || typeof c.getContext !== 'function') return null;
    try {
      ctx = c.getContext('2d');
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function getSkip() {
    const root = getEl();
    if (!skipBtn && root && root.querySelector) {
      skipBtn = root.querySelector('.intro__skip');
    }
    return skipBtn;
  }

  // Канвас повторяет #stage: размер в CSS-пикселях на dpr, не больше 2.
  function resize() {
    const root = getEl();
    const c = getCanvas();

    viewDpr = Math.min(
      (typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2
    );
    viewW = Math.max(1,
      (root && root.clientWidth) ||
      (typeof window !== 'undefined' && window.innerWidth) || 1);
    viewH = Math.max(1,
      (root && root.clientHeight) ||
      (typeof window !== 'undefined' && window.innerHeight) || 1);

    if (c) {
      c.width = Math.round(viewW * viewDpr);
      c.height = Math.round(viewH * viewDpr);
      if (c.style) {
        c.style.width = viewW + 'px';
        c.style.height = viewH + 'px';
      }
    }
    return { w: viewW, h: viewH, dpr: viewDpr };
  }

  function nowMs() {
    try {
      if (typeof performance !== 'undefined' && performance.now) {
        return performance.now();
      }
    } catch (e) { /* старый браузер */ }
    return Date.now();
  }

  // Звук фазы заставки. Выключенный звук (кнопка mute) — просто молчим:
  // unlock всё равно зовём, чтобы контекст был готов к следующему жесту.
  function cue(name) {
    if (!CC.Sound || typeof CC.Sound.play !== 'function') return false;
    if (typeof CC.Sound.isEnabled === 'function' && !CC.Sound.isEnabled()) {
      return false;
    }
    try {
      return CC.Sound.play(name) !== false;
    } catch (e) {
      return false;
    }
  }

  function duck(on) {
    if (!CC.Sound || typeof CC.Sound.duckMusic !== 'function') return;
    try { CC.Sound.duckMusic(on); } catch (e) { /* заставка не должна падать */ }
  }

  // Запасной кадр: тёмный фон и нарастающее затемнение. Нужен, пока
  // художник не добавил CC.Render.drawIntro, и если его сцена упала.
  function fallbackFrame(c, view, t) {
    if (!c || !view) return;
    if (c.setTransform) c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (c.fillRect) {
      c.fillStyle = '#05070d';
      c.fillRect(0, 0, view.w, view.h);

      // тонкая полоса холодного света у горизонта — кадр не плоский
      if (c.createLinearGradient) {
        const g = c.createLinearGradient(0, view.h * 0.62, 0, view.h);
        g.addColorStop(0, 'rgba(74, 40, 54, 0)');
        g.addColorStop(0.42, 'rgba(122, 62, 58, 0.34)');
        g.addColorStop(1, 'rgba(24, 12, 14, 0)');
        c.fillStyle = g;
        c.fillRect(0, view.h * 0.62, view.w, view.h * 0.38);
      }

      const p = totalMs() ? Math.max(0, Math.min(1, t / totalMs())) : 1;
      c.fillStyle = 'rgba(0, 0, 0, ' + (0.18 + 0.82 * p).toFixed(3) + ')';
      c.fillRect(0, 0, view.w, view.h);
    }
  }

  // Один кадр. Возвращает true, если кадр нарисован (сцена или фолбэк).
  function drawAt(ms) {
    const c = getCtx();
    if (!c) return false;
    if (!viewW || !viewH) resize();

    const view = { w: viewW, h: viewH, dpr: viewDpr };
    const tMs = Math.max(0, Math.min(totalMs(), Number(ms) || 0));

    try {
      if (c.setTransform) c.setTransform(1, 0, 0, 1, 0, 0);
      if (c.clearRect) {
        c.clearRect(0, 0, view.w * view.dpr, view.h * view.dpr);
      }
      if (CC.Render && typeof CC.Render.drawIntro === 'function') {
        // Художник живёт в секундах (0…6.5), а rAF и таймеры — в мс.
        // Без деления второй кадр (~16.7) клампился в 6.5 и сцена стояла.
        CC.Render.drawIntro(c, view, tMs / 1000);
      } else {
        fallbackFrame(c, view, tMs);
      }
      return true;
    } catch (e) {
      try { fallbackFrame(c, view, tMs); } catch (e2) { /* без кадра, но без падения */ }
      return false;
    }
  }

  function stopFrame() {
    if (!rafId) return;
    try {
      if (typeof window !== 'undefined' &&
          typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId);
      }
    } catch (e) { /* кадр уже не запланирован */ }
    rafId = 0;
  }

  function requestFrame() {
    if (!open || reduced) return;
    if (typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function') {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  // Кадры заставки идут отдельным rAF и останавливаются в finish,
  // чтобы после сцены не тратить кадры на скрытый canvas.
  function tick(now) {
    rafId = 0;
    if (!open) return;

    const elapsed = Math.max(0, Number(now) - startedAt);
    if (elapsed >= totalMs()) {
      drawAt(totalMs());
      return;
    }
    drawAt(elapsed);
    requestFrame();
  }

  function setPhase(name) {
    current = name;
    const root = getEl();
    if (!root || !root.classList) return;

    PHASES.forEach(function (c) { root.classList.remove(c); });
    if (name) root.classList.add(name);
  }

  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  }

  // Длительности живут в CC.INTRO, CSS забирает их переменными.
  function setCssTimings() {
    const root = getEl();
    if (!root || !root.style || !root.style.setProperty) return;
    root.style.setProperty('--intro-fall', fallMs() + 'ms');
    root.style.setProperty('--intro-impact', impactMs() + 'ms');
    root.style.setProperty('--intro-unfold', unfoldMs() + 'ms');
    root.style.setProperty('--intro-reveal', revealMs() + 'ms');
    root.style.setProperty('--intro-title', titleMs() + 'ms');
    root.style.setProperty('--intro-reduced', reducedMs() + 'ms');
  }

  // Снять заставку и вернуть игру в обычный цикл. Идемпотентно.
  function finish(reason) {
    if (!open) return false;

    lastReason = reason || 'done';
    // Закрыл заставку (пропуском или досмотром) — фиксируем выбор галочки.
    if (lastReason !== 'error') applyOptOut();

    open = false;
    gate = false;
    stopFrame();
    clearTimers();
    CC.App.introOpen = false;
    showGate(false);
    duck(false);

    const root = getEl();
    if (root) {
      setPhase('is-done');
      if (root.classList) root.classList.add('hidden');
      if (root.setAttribute) root.setAttribute('aria-hidden', 'true');
    }
    return true;
  }

  function skip(reason) {
    return finish(reason || 'skip');
  }

  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function start() {
    const root = getEl();
    if (!root) {
      CC.App.introOpen = false;
      return false;
    }

    bind();

    if (open) return true;

    // ?intro=0 ничего не пишет в localStorage — только отключает на запуск.
    if (queryMode() !== '0') migrateLegacy();

    if (!shouldShow()) {
      CC.App.introOpen = false;
      current = 'seen';
      if (root.classList) root.classList.add('hidden');
      if (root.setAttribute) root.setAttribute('aria-hidden', 'true');
      return false;
    }

    try {
      open = true;
      gate = true;
      reduced = reducedMotion();
      lastReason = '';
      CC.App.introOpen = true;

      // Каждый показ начинается со снятой галочки.
      const opt = getOptInput();
      if (opt) opt.checked = false;

      setCssTimings();
      if (root.classList) root.classList.remove('hidden');
      if (root.setAttribute) root.setAttribute('aria-hidden', 'false');
      // Лор мог успеть открыться до старта сцены — прячем его под гейт,
      // после заставки syncLore покажет карточку снова.
      const loreRoot = typeof document !== 'undefined' && document.getElementById
        ? document.getElementById('sergeant-lore') : null;
      if (loreRoot && loreRoot.classList) loreRoot.classList.add('hidden');
      resize();

      // Сначала — тёмный титул-гейт. Без жеста браузер не даст WebAudio,
      // поэтому сцена и её таймеры ждут тапа (см. beginIntro).
      setPhase('is-gate');
      showGate(true);
      return true;
    } catch (e) {
      CC.App.introOpen = false;
      finish('error');
      return false;
    }
  }

  // Жест получен: снимаем гейт, будим звук и только теперь запускаем сцену.
  // Возвращает true, если анимация действительно началась.
  function beginIntro(reason) {
    if (!open || !gate) return false;

    const root = getEl();
    gate = false;
    showGate(false);

    // unlock создаёт/будит AudioContext. Даже при mute зовём его: звук
    // останется выключенным, но следующий жест уже будет готов.
    if (CC.Sound && typeof CC.Sound.unlock === 'function') {
      try { CC.Sound.unlock(); } catch (e) { /* без звука, но со сценой */ }
    }
    duck(true);

    try {
      if (reduced) {
        // Без полёта: один финальный кадр и короткий звуковой акцент.
        cue('introTitle');
        setPhase('is-reduced');
        if (root && root.classList) root.classList.add('is-reveal');
        drawAt(Math.max(0, totalMs() - reducedFrameMs()));
        schedule(function () { finish('reduced'); }, reducedMs());
      } else {
        cue('introEngine');
        setPhase('is-fall');
        startedAt = nowMs();
        drawAt(0);
        requestFrame();

        const impactAt = fallMs();
        const unfoldAt = impactAt + impactMs();
        const revealAt = unfoldAt + unfoldMs();
        const titleAt = revealAt + revealMs();
        const doneAt = titleAt + titleMs();

        schedule(function () {
          setPhase('is-impact');
          cue('introImpact');
        }, impactAt);
        schedule(function () {
          setPhase('is-unfold');
          cue('introServo');
        }, unfoldAt);
        schedule(function () {
          setPhase('is-reveal');
          cue('introClank');
        }, revealAt);
        schedule(function () {
          setPhase('is-title');
          cue('introTitle');
        }, titleAt);
        schedule(function () { finish('done'); }, doneAt);
      }

      // Страховка: что бы ни случилось со сценой, экран не останется
      // заблокированным дольше 8 секунд после жеста.
      safetyTimer = setTimeout(function () { finish('safety'); }, safetyMs());
      lastReason = reason || '';
      return true;
    } catch (e) {
      CC.App.introOpen = false;
      finish('error');
      return false;
    }
  }

  function onSkipClick(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    skip('button');
  }

  function onRootClick(e) {
    if (!open) return;

    // Клик по галочке или кнопке не считается тапом «пропустить».
    const t = e && e.target;
    if (t && t.closest && t.closest('.intro__actions')) return;

    if (gate) {
      if (e && e.stopPropagation) e.stopPropagation();
      beginIntro('tap');
      return;
    }
    skip('tap');
  }

  function onKeyCapture(e) {
    if (!open) return;

    if (e.key === 'Escape') {
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      else if (e.stopPropagation) e.stopPropagation();
      skip('escape');
      return;
    }

    // На гейте Enter/Пробел — тот же старт, что и тап.
    if (gate && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      else if (e.stopPropagation) e.stopPropagation();
      beginIntro('key');
      return;
    }

    // Остальные клавиши не должны управлять сценой под заставкой.
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    else if (e.stopPropagation) e.stopPropagation();
  }

  // Ресайз во время сцены: канвас пересчитывается, статичный кадр
  // перерисовывается, а анимация подхватит новый размер со следующим rAF.
  function onResize() {
    if (!open) return;
    resize();
    if (reduced) drawAt(Math.max(0, totalMs() - reducedFrameMs()));
  }

  function bind() {
    if (bound) return;

    const root = getEl();
    if (!root) return;
    bound = true;

    const btn = getSkip();
    if (btn && btn.addEventListener) btn.addEventListener('click', onSkipClick);
    if (root.addEventListener) root.addEventListener('click', onRootClick);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', onKeyCapture, true);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', onResize);
    }
  }

  return {
    FLAG: FLAG,
    OFF_FLAG: OFF_FLAG,
    start: start,
    begin: beginIntro,
    skip: skip,
    finish: finish,
    isOpen: function () { return open; },
    isGate: function () { return gate; },
    optChecked: optChecked,
    isAnimating: function () { return rafId !== 0; },
    phase: function () { return current; },
    reason: function () { return lastReason; },
    shouldShow: shouldShow,
    reduced: reducedMotion,
    totalMs: totalMs,
    resize: resize,
    drawAt: drawAt
  };
})();
