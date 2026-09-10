import { COLUMNS, ROWS } from './rules.js';

// 棋盘按正方格居中铺开的纯数学，渲染层和输入层共用，保证点到哪就是哪一格。
export function boardBox(width, height, columns = COLUMNS, rows = ROWS) {
  const cell = Math.max(1, Math.floor(Math.min(width / columns, height / rows)));
  return {
    cell,
    columns,
    rows,
    originX: Math.floor((width - cell * columns) / 2),
    originY: Math.floor((height - cell * rows) / 2),
  };
}

export function cellFromPoint(box, x, y) {
  const cx = Math.floor((x - box.originX) / box.cell);
  const cy = Math.floor((y - box.originY) / box.cell);
  if (cx < 0 || cy < 0 || cx >= box.columns || cy >= box.rows) return null;
  return { x: cx, y: cy };
}

export const cellCenter = (box, x, y) => ({
  x: box.originX + (x + 0.5) * box.cell,
  y: box.originY + (y + 0.5) * box.cell,
});

// 拖动方向量化成四邻中的一格，斜着拖按位移更大的那个轴算。
export function directionOf(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { dx: dx > 0 ? 1 : -1, dy: 0 };
  return { dx: 0, dy: dy > 0 ? 1 : -1 };
}
