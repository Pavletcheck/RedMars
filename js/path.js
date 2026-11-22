/* Поиск пути по сетке. Стены проходимы, но дорого — поэтому юниты
   срезают через них и натыкаются на стену, которую приходится ломать.
   Поле 44×44 — 1936 клеток, поэтому минимум открытого списка ищется
   двоичной кучей, а направление подсказывает октильная эвристика A*.
   Опционально opts.wallCost делает стены проходимыми (подкоп/прыжок). */
window.CC = window.CC || {};

CC.Path = (function () {
  'use strict';

  const SQRT2 = 1.4142135623730951;

  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];
  const DIAG = [false, false, false, false, true, true, true, true];

  // Октильное расстояние: минимум стоимости шага по пустой клетке — 1,
  // поэтому эвристика не переоценивает путь и A* остаётся точным.
  function octile(dx, dy) {
    if (dx < 0) dx = -dx;
    if (dy < 0) dy = -dy;
    return dx < dy
      ? SQRT2 * dx + (dy - dx)
      : SQRT2 * dy + (dx - dy);
  }

  return {
    // costs: Float32Array, Infinity = непроходимо
    // opts.wallCost — переопределить стоимость стен (прыжок/подкоп).
    // возвращает массив {x,y} без стартовой клетки, [] если уже на месте, null если пути нет
    find: function (costs, W, H, sx, sy, tx, ty, opts) {
      if (sx === tx && sy === ty) return [];
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
      if (!isFinite(costs[ty * W + tx])) return null;

      const total = W * H;
      const start = sy * W + sx;
      const goal = ty * W + tx;
      const wallCost = opts && isFinite(opts.wallCost) ? Number(opts.wallCost) : 0;

      const g = new Float32Array(total).fill(Infinity);
      const h = new Float32Array(total);
      const prev = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          h[y * W + x] = octile(x - tx, y - ty);
        }
      }

      // Двоичная куча индексов; ключ — g[n] + h[n]. Устаревшие записи
      // (когда g улучшился после добавления) отсеиваются по closed.
      const heap = [];
      let size = 0;

      function push(n) {
        let i = size++;
        heap[i] = n;
        const key = g[n] + h[n];

        while (i > 0) {
          const p = (i - 1) >> 1;
          const pn = heap[p];
          if (g[pn] + h[pn] <= key) break;
          heap[i] = pn;
          i = p;
        }
        heap[i] = n;
      }

      function pop() {
        const top = heap[0];
        size--;
        if (size > 0) {
          const last = heap[size];
          const key = g[last] + h[last];
          let i = 0;

          for (;;) {
            const l = i * 2 + 1;
            if (l >= size) break;
            const r = l + 1;
            let m = l;
            if (r < size && g[heap[r]] + h[heap[r]] < g[heap[l]] + h[heap[l]]) m = r;
            if (g[heap[m]] + h[heap[m]] >= key) break;
            heap[i] = heap[m];
            i = m;
          }
          heap[i] = last;
        }
        return top;
      }

      g[start] = 0;
      push(start);

      // Защита от зависания на 44×44: каждая клетка закрывается один раз,
      // но старые записи в куче могут дублироваться. Лимит — 4×клеток.
      let guard = total * 4;
      while (size > 0 && guard-- > 0) {
        const cur = pop();
        if (cur === goal) break;
        if (closed[cur]) continue;
        closed[cur] = 1;

        const cx = cur % W;
        const cy = (cur / W) | 0;

        for (let k = 0; k < DIRS.length; k++) {
          const nx = cx + DIRS[k][0];
          const ny = cy + DIRS[k][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;

          const n = ny * W + nx;
          if (closed[n]) continue;

          let c = costs[n];
          if (!isFinite(c)) continue;
          // Стены становятся проходимыми для подкопа/прыжка.
          if (wallCost > 0 && c === 8) c = wallCost;

          const diag = DIAG[k];
          if (diag) {
            // не режем угол между двумя занятыми клетками
            let sideA = costs[cy * W + nx];
            let sideB = costs[ny * W + cx];
            if (wallCost > 0 && sideA === 8) sideA = wallCost;
            if (wallCost > 0 && sideB === 8) sideB = wallCost;
            if (!isFinite(sideA) || !isFinite(sideB)) continue;
          }

          const ng = g[cur] + c * (diag ? SQRT2 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            prev[n] = cur;
            push(n);
          }
        }
      }

      if (prev[goal] === -1) return null;

      const path = [];
      let cur = goal;
      while (cur !== start) {
        path.push({ x: cur % W, y: (cur / W) | 0 });
        cur = prev[cur];
        if (cur < 0) return null;
      }
      path.reverse();
      return path;
    }
  };
})();
