import { LEVEL } from './level.js';
import { canCrossObstacle, canPassGate, MAX_NAVIGATION_RADIUS } from './rules.js';

// 导航网格：把关卡压成占位格，供回放代理避障与后续的死锁验证器共用。
// 全部为纯函数且确定性，A* 的 tie-break 按格索引排序，不引入随机数。
// 网格随质量变化：矮墙在体型足够时不再阻挡，窄门在体型过大时反而关闭。

export const NAV_CELL_SIZE = 1;

const cellIndex = (grid, col, row) => col + grid.cols * row;

export function createNavGrid(radius = MAX_NAVIGATION_RADIUS, mass = 0, cellSize = NAV_CELL_SIZE) {
  const { minX, maxX, minZ, maxZ } = LEVEL.bounds;
  const cols = Math.ceil((maxX - minX) / cellSize);
  const rows = Math.ceil((maxZ - minZ) / cellSize);
  const blocked = new Uint8Array(cols * rows);
  const grid = { cols, rows, cellSize, minX, minZ, radius, mass, blocked };
  // 只有当前体型跨不过去的墙才计入障碍
  const walls = LEVEL.obstacles.filter((obstacle) => !canCrossObstacle(mass, obstacle));
  // 只有当前体型挤不过去的窄门才计入障碍
  const gates = (LEVEL.gates ?? []).filter((gate) => !canPassGate(mass, gate));
  const barriers = [...walls, ...gates];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = minX + (col + 0.5) * cellSize;
      const z = minZ + (row + 0.5) * cellSize;
      // 障碍按导航半径膨胀，格中心落在膨胀区内即视为不可通行。
      // 可破坏糖板与相位门不算障碍：代理用冲刺与相位处理它们。
      const hit = barriers.some((barrier) => (
        Math.abs(x - barrier.x) <= barrier.width / 2 + radius
        && Math.abs(z - barrier.z) <= barrier.depth / 2 + radius
      ));
      const outside = x < minX + radius || x > maxX - radius || z < minZ + radius || z > maxZ - radius;
      if (hit || outside) blocked[cellIndex(grid, col, row)] = 1;
    }
  }
  return grid;
}

// 当前体型下窄门的开合状态，用于给网格缓存做键。
export const gateSignature = (mass) => (LEVEL.gates ?? [])
  .map((gate) => (canPassGate(mass, gate) ? '1' : '0'))
  .join('');

// 当前体型下可跨越墙体的状态，同样参与缓存键。
export const crossSignature = (mass) => LEVEL.obstacles
  .map((obstacle) => (canCrossObstacle(mass, obstacle) ? '1' : '0'))
  .join('');

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

// 从一点开始的洪泛，返回可达格位图。验证器用它判断"成长后是否还能回到出口"。
export function reachableFrom(grid, point) {
  const raw = worldToCell(grid, point.x, point.z);
  const seed = nearestOpenCell(grid, raw.col, raw.row);
  const visited = new Uint8Array(grid.cols * grid.rows);
  if (!seed) return visited;
  const queue = [cellIndex(grid, seed.col, seed.row)];
  visited[queue[0]] = 1;
  while (queue.length) {
    const current = queue.pop();
    const col = current % grid.cols;
    const row = (current - col) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (isBlocked(grid, nextCol, nextRow)) continue;
      const next = cellIndex(grid, nextCol, nextRow);
      if (visited[next]) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }
  return visited;
}

export const cellReachable = (grid, visited, point) => {
  const cell = worldToCell(grid, point.x, point.z);
  const open = nearestOpenCell(grid, cell.col, cell.row);
  if (!open) return false;
  return visited[cellIndex(grid, open.col, open.row)] === 1;
};

// 验证用的严格可达性：只接受目标格自身或紧邻一圈中真正被洪泛标记过的格。
// 不能复用 nearestOpenCell —— 它会向外搜索 6 环，足以跨过一道墙落到另一个连通域，
// 从而把"被封死的目标"误判成可达。
export function targetReachable(grid, visited, point, ring = 1) {
  const cell = worldToCell(grid, point.x, point.z);
  for (let dr = -ring; dr <= ring; dr += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      const col = cell.col + dc;
      const row = cell.row + dr;
      if (isBlocked(grid, col, row)) continue;
      if (visited[cellIndex(grid, col, row)] === 1) return true;
    }
  }
  return false;
}


