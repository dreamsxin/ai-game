import { ARENA_PAD } from './rules.js';

// 整张竞技场等比铺满可视区域，渲染层和输入层共用同一套换算，
// 手指点到哪一格就是哪一格。
export function viewBox(width, height, cols, rows) {
  const scale = Math.max(1, Math.min(width / (cols + ARENA_PAD * 2), height / (rows + ARENA_PAD * 2)));
  return {
    scale,
    cols,
    rows,
    originX: (width - scale * cols) / 2,
    originY: (height - scale * rows) / 2,
  };
}

export const toPixel = (box, x, y) => ({
  x: box.originX + x * box.scale,
  y: box.originY + y * box.scale,
});

export const toWorld = (box, px, py) => ({
  x: (px - box.originX) / box.scale,
  y: (py - box.originY) / box.scale,
});
