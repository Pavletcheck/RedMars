/* Дополнительные 3D-здания (продолжение перевода 2.5D → 3D).
   Файл грузится ДО js/render.js: render.js подмешивает записи в свою
   таблицу BUILDING3D_ART. Ассеты — assets/buildings3d/<id>/L<nn>/render-256.png.

   Формат: id: { max, foot, ov?, rect? }
     foot — 1 для 1×1, 2 для бывших 2×2;
     rect: 1 — кадр снят в НАСТОЯЩЕМ прямоугольном пятне 2×1 (новый пайплайн
       с ortho 3.0, плита 2×1). Такой кадр не сжимается и рисуется 1:1;
     ov: 3 — ортокамера рендера для 2×1 (если rect не задан — 4.0/2.55).

   Здесь же — overrides для типов из основной таблицы render.js, которые
   тоже стали 2×1 (`lab/herohall/barracks/eagle/scattershot/monolith`):
   merge в render.js идёт после основной таблицы, поэтому запись побеждает. */
CC.BUILDING3D_EXTRA = {
  /* армия/развитие и поздняя оборона, нативное пятно 2×1 */
  train: { max: 19, foot: 2, ov: 3, rect: 1 },
  darktrain: { max: 13, foot: 2, ov: 3, rect: 1 },
  spellfactory: { max: 10, foot: 2, ov: 3, rect: 1 },
  darkspellfactory: { max: 8, foot: 2, ov: 3, rect: 1 },
  pethouse: { max: 12, foot: 2, ov: 3, rect: 1 },
  blacksmith: { max: 9, foot: 2, ov: 3, rect: 1 },
  workshop: { max: 9, foot: 2, ov: 3, rect: 1 },
  clancastle: { max: 15, foot: 2, ov: 3, rect: 1 },
  squadbarracks: { max: 12, foot: 2, ov: 3, rect: 1 },
  lab: { max: 17, foot: 2, ov: 3, rect: 1 },
  herohall: { max: 13, foot: 2, ov: 3, rect: 1 },
  barracks: { max: 14, foot: 2, ov: 3, rect: 1 },
  eagle: { max: 7, foot: 2, ov: 3, rect: 1 },
  scattershot: { max: 7, foot: 2, ov: 3, rect: 1 },
  monolith: { max: 5, foot: 2, ov: 3, rect: 1 },
  /* поздняя оборона, 1×1 */
  revenge: { max: 2, foot: 1 },
  superwizard: { max: 2, foot: 1 },
  spiky: { max: 2, foot: 1 },
  firecracker: { max: 2, foot: 1 },
  /* ловушки, 1×1, взведённое (armed) состояние */
  airmine: { max: 13, foot: 1 },
  giantbomb: { max: 11, foot: 1 },
  seekingair: { max: 7, foot: 1 },
  skeletontrap: { max: 6, foot: 1 },
  tornado: { max: 3, foot: 1 },
  gigabomb: { max: 3, foot: 1 }
};
