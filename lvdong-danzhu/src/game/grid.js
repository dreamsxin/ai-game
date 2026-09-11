import { COLUMNS, GRID_ROWS } from './rules.js';
import { marble } from './marbles.js';
import { createRandom } from './random.js';

export const key = (col, row) => `${col},${row}`;

export const inside = (col, row) => col >= 0 && row >= 0 && col < COLUMNS && row < GRID_ROWS;

export const at = (grid, col, row) => (inside(col, row) ? grid[row][col] : null);

const emptyRow = () => Array.from({ length: COLUMNS }, () => null);

export const cloneGrid = (grid) => grid.map((row) => row.slice());

// 弹珠墙自上而下排布，第 0 行是天花板，新行从这里挤进来把整墙往下推。
export function createGrid(seed, colors, startRows = 4) {
  const random = createRandom(seed);
  const grid = Array.from({ length: GRID_ROWS }, () => emptyRow());
  for (let row = 0; row < Math.min(startRows, GRID_ROWS); row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      grid[row][col] = marble(colors[random.int(0, colors.length - 1)]);
    }
  }
  return { grid, randomState: random.save() };
}

export function spawnRow(randomState, colors) {
  const random = createRandom(1);
  random.load(randomState);
  const row = Array.from({ length: COLUMNS }, () => marble(colors[random.int(0, colors.length - 1)]));
  return { row, randomState: random.save() };
}

// 整墙下移一行：最底行被顶出去就是越线，交给模拟层判负。
export function descend(grid, row) {
  const overflow = grid[GRID_ROWS - 1].filter(Boolean).length;
  const next = [row.slice(), ...grid.slice(0, GRID_ROWS - 1).map((r) => r.slice())];
  return { grid: next, overflow };
}

export const neighbors = (col, row) => [
  { col: col - 1, row },
  { col: col + 1, row },
  { col, row: row - 1 },
  { col, row: row + 1 },
].filter((spot) => inside(spot.col, spot.row));

// 从落点出发的同色连通块，是「弹珠消除」判定的核心。
export function groupAt(grid, col, row) {
  const start = at(grid, col, row);
  if (!start) return [];
  const seen = new Set([key(col, row)]);
  const queue = [{ col, row }];
  const cells = [];
  while (queue.length) {
    const spot = queue.shift();
    cells.push(spot);
    for (const next of neighbors(spot.col, spot.row)) {
      if (seen.has(key(next.col, next.row))) continue;
      const cell = at(grid, next.col, next.row);
      if (!cell || cell.color !== start.color) continue;
      seen.add(key(next.col, next.row));
      queue.push(next);
    }
  }
  return cells;
}

export function clearCells(grid, cells) {
  const next = cloneGrid(grid);
  for (const { col, row } of cells) {
    if (inside(col, row)) next[row][col] = null;
  }
  return next;
}

export function damageCell(grid, col, row) {
  const cell = at(grid, col, row);
  if (!cell) return { grid, broken: false };
  const next = cloneGrid(grid);
  next[row][col] = marble(cell.color, cell.damage + 1);
  return { grid: next, damage: next[row][col].damage, broken: false };
}

// 挂不到天花板的弹珠会掉下去，这是消除之后的额外收益。
export function floating(grid) {
  const anchored = new Set();
  const queue = [];
  for (let col = 0; col < COLUMNS; col += 1) {
    if (grid[0][col]) {
      anchored.add(key(col, 0));
      queue.push({ col, row: 0 });
    }
  }
  while (queue.length) {
    const spot = queue.shift();
    for (const next of neighbors(spot.col, spot.row)) {
      if (anchored.has(key(next.col, next.row))) continue;
      if (!at(grid, next.col, next.row)) continue;
      anchored.add(key(next.col, next.row));
      queue.push(next);
    }
  }
  const loose = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      if (grid[row][col] && !anchored.has(key(col, row))) loose.push({ col, row });
    }
  }
  return loose;
}

export const countMarbles = (grid) =>
  grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

export const isEmpty = (grid) => countMarbles(grid) === 0;

// 最靠下的一行弹珠，HUD 用它显示压迫感，机器人测试用它挑颜色。
export function lowestRow(grid) {
  for (let row = GRID_ROWS - 1; row >= 0; row -= 1) {
    if (grid[row].some(Boolean)) return row;
  }
  return -1;
}

export function colorCounts(grid) {
  const counts = new Map();
  for (const row of grid) {
    for (const cell of row) {
      if (!cell) continue;
      counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
    }
  }
  return counts;
}
