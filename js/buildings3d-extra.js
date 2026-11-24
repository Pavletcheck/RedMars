/* Дополнительные 3D-здания (продолжение перевода 2.5D → 3D).
   Файл грузится ДО js/render.js: render.js подмешивает записи в свою
   таблицу BUILDING3D_ART. Ассеты — assets/buildings3d/<id>/L<nn>/render-256.png,
   уровни 1..max, ортокамера как в пайплайне (2.55 для 1×1, 4.0 для 2×2).
   Формат: id: { max: <уровень>, foot: 1|2 }.
   Заполняется арт-агентом; пустой объект — игра рисует эти типы 2.5D. */
CC.BUILDING3D_EXTRA = {
  /* партия 4: армия/развитие, 2×1 — арт снят под 2×2, render.js сжимает
     кадр ×0.707 под фактическое пятно 2×1. */
  train: { max: 19, foot: 2 },
  darktrain: { max: 13, foot: 2 },
  spellfactory: { max: 10, foot: 2 },
  darkspellfactory: { max: 8, foot: 2 },
  pethouse: { max: 12, foot: 2 },
  blacksmith: { max: 9, foot: 2 },
  workshop: { max: 9, foot: 2 },
  clancastle: { max: 15, foot: 2 },
  squadbarracks: { max: 12, foot: 2 },
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
