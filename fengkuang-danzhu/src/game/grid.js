import { COLUMNS, GRID_ROWS, bombChance, brickHp } from './rules.js';
import { bomb, brick, plus } from './bricks.js';
import { createRandom } from './random.js';

export const key = (col, row) => `${col},${row}`;

export const inside = (col, row) => col >= 0 && row >= 0 && col < COLUMNS && row < GRID_ROWS;

export const at = (grid, col, row) => (inside(col, row) ? grid[row][col] : null);

const emptyRow = () => Array.from({ length: COLUMNS }, () => null);

export const cloneGrid = (grid) => grid.map((row) => row.slice());

// 一行新砖：至少留一个空位让弹珠能钻上去，尽量塞一颗加珠，按阶段概率放炸弹砖。
export function spawnRow(randomState, turn) {
  const random = createRandom(1);
  random.load(randomState);
  const row = emptyRow();
  const columns = [...Array(COLUMNS).keys()];
  // 洗牌决定填哪些列，Fisher-Yates 用同一个 PRNG，保证可复现。
  for (let i = columns.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [columns[i], columns[j]] = [columns[j], columns[i]];
  }
  const filled = columns.slice(0, random.int(3, COLUMNS - 1));
  const plusAt = random.next() < 0.85 ? filled[0] : -1;
  for (const col of filled) {
    if (col === plusAt) {
      row[col] = plus();
      continue;
    }
    if (random.next() < bombChance(turn)) {
      row[col] = bomb(brickHp(turn, random.int(-1, 0)));
      continue;
    }
    row[col] = brick(brickHp(turn, random.int(-1, 2)));
  }
  return { row, randomState: random.save() };
}

export function createGrid(seed, rows = 3) {
  let randomState = createRandom(seed).save();
  let grid = Array.from({ length: GRID_ROWS }, () => emptyRow());
  // 开局的几行按第 1 回合的强度生成，从顶部往下铺。
  for (let i = 0; i < Math.min(rows, GRID_ROWS); i += 1) {
    const spawned = spawnRow(randomState, 1);
    randomState = spawned.randomState;
    grid = [spawned.row, ...grid.slice(0, GRID_ROWS - 1)];
  }
  return { grid, randomState };
}

// 整墙下压一行：最底行还有砖就是压过底线，交给模拟层判负。
export function descend(grid, row) {
  const overflow = grid[GRID_ROWS - 1].filter(Boolean).length;
  return { grid: [row.slice(), ...grid.slice(0, GRID_ROWS - 1).map((r) => r.slice())], overflow };
}

export function setCell(grid, col, row, cell) {
  const next = cloneGrid(grid);
  next[row][col] = cell;
  return next;
}

export function clearCells(grid, cells) {
  const next = cloneGrid(grid);
  for (const { col, row } of cells) {
    if (inside(col, row)) next[row][col] = null;
  }
  return next;
}

const around = (col, row) => {
  const spots = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (inside(col + dx, row + dy)) spots.push({ col: col + dx, row: row + dy });
    }
  }
  return spots;
};

// 拆砖：炸弹砖会把周围一圈一起带走，圈里再有炸弹就继续连锁。
export function destroy(grid, seeds) {
  const next = cloneGrid(grid);
  const queue = [...seeds];
  const seen = new Set();
  const broken = [];
  while (queue.length) {
    const spot = queue.shift();
    if (!inside(spot.col, spot.row) || seen.has(key(spot.col, spot.row))) continue;
    const cell = next[spot.row][spot.col];
    if (!cell) continue;
    seen.add(key(spot.col, spot.row));
    next[spot.row][spot.col] = null;
    broken.push({ col: spot.col, row: spot.row, kind: cell.kind, hp: cell.hp });
    if (cell.kind === 'bomb') queue.push(...around(spot.col, spot.row));
  }
  return { grid: next, broken };
}

// 一次撞击的结果：加珠直接吃掉且不挡路，砖块掉一格血，血空了才拆。
export function hitCell(grid, col, row) {
  const cell = at(grid, col, row);
  if (!cell) return { grid, pass: true, broken: [], pickup: false };
  if (cell.kind === 'plus') {
    return { grid: clearCells(grid, [{ col, row }]), pass: true, broken: [], pickup: true };
  }
  const hp = cell.hp - 1;
  if (hp > 0) {
    return { grid: setCell(grid, col, row, { ...cell, hp }), pass: false, broken: [], pickup: false };
  }
  const wrecked = destroy(grid, [{ col, row }]);
  return { grid: wrecked.grid, pass: false, broken: wrecked.broken, pickup: false };
}

export const countCells = (grid) => grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

export const isEmpty = (grid) => countCells(grid) === 0;

export function lowestRow(grid) {
  for (let row = GRID_ROWS - 1; row >= 0; row -= 1) {
    if (grid[row].some(Boolean)) return row;
  }
  return -1;
}

export const totalHp = (grid) =>
  grid.reduce((sum, row) => sum + row.reduce((s, cell) => s + (cell && cell.kind !== 'plus' ? cell.hp : 0), 0), 0);
