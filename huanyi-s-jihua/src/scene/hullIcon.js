// 机身 2D 图标：选机面板上看到的那艘船，就是场上飞的那艘。
//
// 纯数据，返回点/线/圆/多边形，由 App.jsx 摆成 SVG；不认识 three，也不认识 React，
// 所以 Node 测试能守住「三型各画各的、都落在框里」。数据取自 models.js 的 dressHull：
// H1 三角乘波体、H2 楔形分层舰艏 + 环形舰桥 + 尖塔 + 外张引擎、H3 削甲露骨架 + 双尾翼。

import { HULL_SKINS } from './palette.js';

export const HULL_ICON = { w: 64, h: 52, cx: 32, cy: 25 };

const hullPoints = (points) =>
  points.map(([x, y]) => `${HULL_ICON.cx + x},${HULL_ICON.cy + y}`).join(' ');

/**
 * @returns {{ skin, box, body, bands, bridge, towers, engines, fins, tail }}
 */
export function hullIcon(code) {
  const skin = HULL_SKINS[code] ?? HULL_SKINS.H1;
  const { cx, cy } = HULL_ICON;
  const base = {
    skin,
    box: { w: HULL_ICON.w, h: HULL_ICON.h },
    bands: [],
    bridge: null,
    towers: [],
    engines: [],
    fins: [],
  };

  if (code === 'H2') {
    return {
      ...base,
      // 楔形分层舰艏：主壳 + 两片错开的肩甲，从俯视看是三层铲形。
      body: hullPoints([[0, -23], [7, -6], [11, 15], [6, 22], [-6, 22], [-11, 15], [-7, -6]]),
      plates: [
        hullPoints([[-7, -6], [-3.2, -19], [-2.4, -2], [-9.5, 9]]),
        hullPoints([[7, -6], [3.2, -19], [2.4, -2], [9.5, 9]]),
      ],
      // 纵向双光带：从舰艏一路贯到引擎。
      bands: [
        { x1: cx - 5.2, y1: cy - 15, x2: cx - 4.6, y2: cy + 17 },
        { x1: cx + 5.2, y1: cy - 15, x2: cx + 4.6, y2: cy + 17 },
      ],
      // 环形舰桥：斜俯视压成椭圆；内圈是一道亮边。
      bridge: { cx, cy: cy + 1, rx: 12, ry: 5.2, inner: 9.6 },
      // 尖塔群：五根，中央最高。
      towers: [
        { x: cx, y: cy - 7, h: 10 },
        { x: cx - 6, y: cy - 2, h: 6 },
        { x: cx + 6, y: cy - 2, h: 6 },
        { x: cx - 3.5, y: cy + 6, h: 5 },
        { x: cx + 3.5, y: cy + 6, h: 5 },
      ],
      // 外张引擎：两侧各一具，喷口向外偏。
      engines: [
        { x: cx - 10.5, y: cy + 13, r: 2.2, flare: 4.5 },
        { x: cx + 10.5, y: cy + 13, r: 2.2, flare: 4.5 },
      ],
      tail: [
        { x1: cx - 4, y1: cy + 16, x2: cx - 2.2, y2: cy + 24 },
        { x1: cx + 4, y1: cy + 16, x2: cx + 2.2, y2: cy + 24 },
      ],
    };
  }

  if (code === 'H3') {
    return {
      ...base,
      // 削掉肩甲之后只剩窄芯：壳更瘦、艏更尖。
      body: hullPoints([[0, -24], [4.6, -4], [6.2, 16], [4, 22], [-4, 22], [-6.2, 16], [-4.6, -4]]),
      bands: [
        { x1: cx - 3.2, y1: cy - 12, x2: cx - 2.6, y2: cy + 15 },
        { x1: cx + 3.2, y1: cy - 12, x2: cx + 2.6, y2: cy + 15 },
      ],
      // 露出来的两根骨架梁。
      fins: [
        { x1: cx - 6.6, y1: cy - 10, x2: cx - 5.4, y2: cy + 14, w: 1.8 },
        { x1: cx + 6.6, y1: cy - 10, x2: cx + 5.4, y2: cy + 14, w: 1.8 },
      ],
      // 双尾翼拉高外张，俯视是两把剪子。
      tail: [
        { x1: cx - 3, y1: cy + 10, x2: cx - 11, y2: cy + 23, w: 2.4 },
        { x1: cx + 3, y1: cy + 10, x2: cx + 11, y2: cy + 23, w: 2.4 },
      ],
      engines: [
        { x: cx - 3.6, y: cy + 21, r: 1.6, flare: 3.6 },
        { x: cx + 3.6, y: cy + 21, r: 1.6, flare: 3.6 },
      ],
    };
  }

  // H1 玄鸟：原乘波体，宽肩、低矮、三喷口。
  return {
    ...base,
    body: hullPoints([[0, -22], [6.5, -7], [8.5, 14], [5, 21], [-5, 21], [-8.5, 14], [-6.5, -7]]),
    plates: [
      hullPoints([[-6.5, -7], [-2, -16], [-1.8, 2], [-7.5, 8]]),
      hullPoints([[6.5, -7], [2, -16], [1.8, 2], [7.5, 8]]),
    ],
    bands: [
      { x1: cx - 6.4, y1: cy - 4, x2: cx - 5.6, y2: cy + 13 },
      { x1: cx + 6.4, y1: cy - 4, x2: cx + 5.6, y2: cy + 13 },
    ],
    engines: [
      { x: cx - 4, y: cy + 20, r: 1.7, flare: 3.8 },
      { x: cx, y: cy + 21, r: 1.7, flare: 3.8 },
      { x: cx + 4, y: cy + 20, r: 1.7, flare: 3.8 },
    ],
    tail: [],
  };
}
