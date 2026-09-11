import { COLUMNS, FIELD_ROWS } from './rules.js';

// 场地按格居中铺开的纯数学，渲染层和输入层共用，保证手指指到哪就是哪。
export function fieldBox(width, height, columns = COLUMNS, rows = FIELD_ROWS) {
  const cell = Math.max(1, Math.min(width / columns, height / rows));
  return {
    cell,
    columns,
    rows,
    originX: (width - cell * columns) / 2,
    originY: (height - cell * rows) / 2,
  };
}

export const toPixel = (box, x, y) => ({
  x: box.originX + x * box.cell,
  y: box.originY + y * box.cell,
});

export const toField = (box, px, py) => ({
  x: (px - box.originX) / box.cell,
  y: (py - box.originY) / box.cell,
});
