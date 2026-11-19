/* Перевод координат сетки в пиксели и обратно. */
window.CC = window.CC || {};

CC.Iso = {
  // сетка -> мировые пиксели (до камеры)
  project: function (gx, gy) {
    return {
      x: (gx - gy) * CC.TW / 2,
      y: (gx + gy) * CC.TH / 2
    };
  },

  // мировые пиксели -> сетка (дробная)
  unproject: function (wx, wy) {
    const a = wx / (CC.TW / 2);
    const b = wy / (CC.TH / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
};
