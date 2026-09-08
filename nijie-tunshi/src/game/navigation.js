import { LEVEL } from './level.js';
import { MAX_NAVIGATION_RADIUS } from './rules.js';

// 导航网格：把关卡压成占位格，供回放代理避障与后续的死锁验证器共用。
// 全部为纯函数且确定性，A* 的 tie-break 按格索引排序，不引入随机数。

export const NAV_CELL_SIZE = 1;

const cellIndex = (grid, col, row) => col + grid.cols * row;

export function createNavGrid(radius = MAX_NAVIGATION_RADIUS, cellSize = NAV_CELL_SIZE) {
  const { minX, maxX, minZ, maxZ } = LEVEL.bounds;
  const cols = Math.ceil((maxX - minX) / cellSize);
  const rows = Math.ceil((maxZ - minZ) / cellSize);
  const blocked = new Uint8Array(cols * rows);
  const grid = { cols, rows, cellSize, minX, minZ, radius, blocked };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = minX + (col + 0.5) * cellSize;
      const z = minZ + (row + 0.5) * cellSize;
      // 障碍按导航半径膨胀，格中心落在膨胀区内即视为不可通行。
      // 可破坏糖板与相位门不算障碍：代理用冲刺与相位处理它们。
      const hit = LEVEL.obstacles.some((obstacle) => (
        Math.abs(x - obstacle.x) <= obstacle.width / 2 + radius
        && Math.abs(z - obstacle.z) <= obstacle.depth / 2 + radius
      ));
      const outside = x < minX + radius || x > maxX - radius || z < minZ + radius || z > maxZ - radius;
      if (hit || outside) blocked[cellIndex(grid, col, row)] = 1;
    }
  }
  return grid;
}

export const worldToCell = (grid, x, z) => ({
  col: Math.max(0, Math.min(grid.cols - 1, Math.floor((x - grid.minX) / grid.cellSize))),
  row: Math.max(0, Math.min(grid.rows - 1, Math.floor((z - grid.minZ) / grid.cellSize))),
});

export const cellToWorld = (grid, col, row) => ({
  x: grid.minX + (col + 0.5) * grid.cellSize,
  z: grid.minZ + (row + 0.5) * grid.cellSize,
});

export const isBlocked = (grid, col, row) => {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return true;
  return grid.blocked[cellIndex(grid, col, row)] === 1;
};

// 目标或起点可能落在膨胀区内（例如贴墙的糖果怪）。就近找一个可通行格，
// 否则寻路会直接失败并让代理卡死。
export function nearestOpenCell(grid, col, row, maxRing = 6) {
  if (!isBlocked(grid, col, row)) return { col, row };
  for (let ring = 1; ring <= maxRing; ring += 1) {
    let best = null;
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const candidate = { col: col + dc, row: row + dr };
        if (isBlocked(grid, candidate.col, candidate.row)) continue;
        const cost = dc * dc + dr * dr;
        // 同环内按距离再按索引排序，保证确定性
        if (!best || cost < best.cost
          || (cost === best.cost && cellIndex(grid, candidate.col, candidate.row) < cellIndex(grid, best.col, best.row))) {
          best = { ...candidate, cost };
        }
      }
    }
    if (best) return { col: best.col, row: best.row };
  }
  return null;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// A*：八向移动，斜向不允许贴角穿过两个障碍之间的缝。
export function findPath(grid, from, to) {
  const startRaw = worldToCell(grid, from.x, from.z);
  const startCell = nearestOpenCell(grid, startRaw.col, startRaw.row);
  const goalRaw = worldToCell(grid, to.x, to.z);
  const goalCell = nearestOpenCell(grid, goalRaw.col, goalRaw.row);
  if (!startCell || !goalCell) return null;

  const total = grid.cols * grid.rows;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const start = cellIndex(grid, startCell.col, startCell.row);
  const goal = cellIndex(grid, goalCell.col, goalCell.row);
  gScore[start] = 0;
  const open = [start];
  const heuristic = (index) => {
    const col = index % grid.cols;
    const row = (index - col) / grid.cols;
    return Math.hypot(col - goalCell.col, row - goalCell.row);
  };

  while (open.length) {
    // 线性取最小 f。网格只有约 2000 格，省掉堆结构换取实现简单与可复现。
    let bestSlot = 0;
    let bestScore = Infinity;
    for (let slot = 0; slot < open.length; slot += 1) {
      const index = open[slot];
      const score = gScore[index] + heuristic(index);
      if (score < bestScore || (score === bestScore && index < open[bestSlot])) {
        bestScore = score;
        bestSlot = slot;
      }
    }
    const current = open.splice(bestSlot, 1)[0];
    if (current === goal) break;
    closed[current] = 1;
    const col = current % grid.cols;
    const row = (current - col) / grid.cols;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (isBlocked(grid, nextCol, nextRow)) continue;
      // 斜向必须两侧正交格都空，避免贴着墙角穿过去
      if (dc !== 0 && dr !== 0 && (isBlocked(grid, col + dc, row) || isBlocked(grid, col, row + dr))) continue;
      const next = cellIndex(grid, nextCol, nextRow);
      if (closed[next]) continue;
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[next]) continue;
      gScore[next] = tentative;
      cameFrom[next] = current;
      if (!open.includes(next)) open.push(next);
    }
  }

  if (gScore[goal] === Infinity) return null;
  const path = [];
  for (let index = goal; index !== -1; index = cameFrom[index]) {
    const col = index % grid.cols;
    const row = (index - col) / grid.cols;
    path.push(cellToWorld(grid, col, row));
    if (index === start) break;
  }
  return path.reverse();
}

// 去掉共线的中间点，减少代理的转向抖动。
export function simplifyPath(path) {
  if (!path || path.length <= 2) return path ?? null;
  const result = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = path[index];
    const next = path[index + 1];
    const crossProduct = (current.x - previous.x) * (next.z - previous.z)
      - (current.z - previous.z) * (next.x - previous.x);
    if (Math.abs(crossProduct) > 1e-9) result.push(current);
  }
  result.push(path[path.length - 1]);
  return result;
}

// 直线可达性检查。用于让代理在视野无阻时走直线，避免贴着航点抖动。
export function segmentBlocked(grid, from, to) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.ceil(distance / (grid.cellSize * 0.5)));
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    const x = from.x + (to.x - from.x) * amount;
    const z = from.z + (to.z - from.z) * amount;
    const cell = worldToCell(grid, x, z);
    if (isBlocked(grid, cell.col, cell.row)) return true;
  }
  return false;
}


