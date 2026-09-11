// 路网：整块用地按「长边随机切一刀」递归二分，切出来的刀口就是道路，剩下的矩形就是街区。
// 这样切的好处是路网天然连通、街区天然闭合，不用事后再跑一遍连通性修补。
import { ROAD_LANE, ROAD_NONE, ROAD_STREET, ROAD_TRUNK, roadSpec } from './rules.js';

// 深度决定等级：外圈先切的是主干道，越切到里面越是支路。
const levelForDepth = (depth) => {
  if (depth <= 0) return ROAD_TRUNK;
  if (depth <= 2) return ROAD_STREET;
  return ROAD_LANE;
};

// 递归只由「还切得下吗」收尾，这个上限纯粹是防呆护栏。
const MAX_DEPTH = 24;

const paintBand = (roads, cols, rect, level, vertical, offset, width) => {
  for (let step = 0; step < width; step += 1) {
    if (vertical) {
      const col = rect.col + offset + step;
      for (let row = rect.row; row < rect.row + rect.rows; row += 1) {
        const index = row * cols + col;
        // 同一格被两次切分碰到时保留等级高的那条，路口才不会被支路吃掉。
        if (roads[index] < level) roads[index] = level;
      }
    } else {
      const row = rect.row + offset + step;
      for (let col = rect.col; col < rect.col + rect.cols; col += 1) {
        const index = row * cols + col;
        if (roads[index] < level) roads[index] = level;
      }
    }
  }
};

/**
 * @param {{ minBlock: number }} options minBlock 是切分的停手线，也是街区大小的唯一旋钮
 * @returns {{ roads: Uint8Array, blocks: object[], segments: object[] }}
 */
export function generateRoads(random, cols, rows, options) {
  const minBlock = Math.max(3, options.minBlock);
  const roads = new Uint8Array(cols * rows).fill(ROAD_NONE);
  const blocks = [];
  const segments = [];

  // 外环路：先框住整座城，城市边缘才不会出现半截街区。
  const ringWidth = roadSpec(ROAD_TRUNK).width;
  const full = { col: 0, row: 0, cols, rows };
  paintBand(roads, cols, full, ROAD_TRUNK, true, 0, ringWidth);
  paintBand(roads, cols, full, ROAD_TRUNK, true, cols - ringWidth, ringWidth);
  paintBand(roads, cols, full, ROAD_TRUNK, false, 0, ringWidth);
  paintBand(roads, cols, full, ROAD_TRUNK, false, rows - ringWidth, ringWidth);
  segments.push(
    { level: ROAD_TRUNK, vertical: true, offset: 0, width: ringWidth, span: rows, ring: true },
    { level: ROAD_TRUNK, vertical: true, offset: cols - ringWidth, width: ringWidth, span: rows, ring: true },
    { level: ROAD_TRUNK, vertical: false, offset: 0, width: ringWidth, span: cols, ring: true },
    { level: ROAD_TRUNK, vertical: false, offset: rows - ringWidth, width: ringWidth, span: cols, ring: true },
  );

  const canSplit = (length, width) => length >= minBlock * 2 + width;

  const subdivide = (rect, depth) => {
    const level = levelForDepth(depth);
    const width = roadSpec(level).width;
    const splitVertical = rect.cols >= rect.rows
      ? canSplit(rect.cols, width)
      : !canSplit(rect.rows, width) && canSplit(rect.cols, width);
    const splitHorizontal = !splitVertical && canSplit(rect.rows, width);

    // 只要还切得下就继续切：街区大小于是被 minBlock 夹在 [minBlock, 2*minBlock) 里，
    // 不会出现一块占掉半座城的巨型街区。
    if (depth >= MAX_DEPTH || (!splitVertical && !splitHorizontal)) {
      blocks.push({ id: blocks.length, ...rect, depth });
      return;
    }

    const vertical = splitVertical;
    const length = vertical ? rect.cols : rect.rows;
    // 切点在中段随机，偏心一点街区大小才有层次，但两侧都要留够 minBlock。
    const offset = random.int(minBlock, length - minBlock - width);
    paintBand(roads, cols, rect, level, vertical, offset, width);
    segments.push({
      level,
      vertical,
      offset: (vertical ? rect.col : rect.row) + offset,
      width,
      span: vertical ? rect.rows : rect.cols,
      ring: false,
    });

    const head = vertical
      ? { col: rect.col, row: rect.row, cols: offset, rows: rect.rows }
      : { col: rect.col, row: rect.row, cols: rect.cols, rows: offset };
    const tail = vertical
      ? { col: rect.col + offset + width, row: rect.row, cols: rect.cols - offset - width, rows: rect.rows }
      : { col: rect.col, row: rect.row + offset + width, cols: rect.cols, rows: rect.rows - offset - width };
    subdivide(head, depth + 1);
    subdivide(tail, depth + 1);
  };

  subdivide(
    { col: ringWidth, row: ringWidth, cols: cols - ringWidth * 2, rows: rows - ringWidth * 2 },
    0,
  );
  return { roads, blocks, segments };
}

export const roadAt = (city, col, row) => (
  col >= 0 && col < city.cols && row >= 0 && row < city.rows
    ? city.roads[row * city.cols + col]
    : ROAD_NONE
);

/** 路面压在水上就是桥：渲染层要把它抬起来，不然桥面会沉到河里。 */
export function bridgeCells(roads, terrain) {
  const cells = [];
  for (let index = 0; index < roads.length; index += 1) {
    if (roads[index] !== ROAD_NONE && terrain[index] === 1) cells.push(index);
  }
  return cells;
}

/** 路网总里程（公里），统计面板要用。 */
export function roadLength(roads, cellMeters) {
  let cells = 0;
  for (let index = 0; index < roads.length; index += 1) {
    if (roads[index] !== ROAD_NONE) cells += 1;
  }
  return (cells * cellMeters) / 1000;
}
