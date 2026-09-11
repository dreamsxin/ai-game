import { UNIT_RADIUS } from './rules.js';

// 竞技场是固定的对称掩体地图：'#' 是掩体墙，'.' 是可走地面。
// 竖版布局贴合手机屏幕，敌我各占上下两端，横向长廊把三条纵向通道串起来，
// 谁都不会被一枪穿场，也不存在绕不过去的死角。
export const MAP_ROWS = [
  '####################',
  '#..................#',
  '#..................#',
  '#...####....####...#',
  '#...####....####...#',
  '#..................#',
  '#.....###..###.....#',
  '#.....###..###.....#',
  '#..................#',
  '#.###...####...###.#',
  '#.###...####...###.#',
  '#..................#',
  '#..................#',
  '#.###...####...###.#',
  '#.###...####...###.#',
  '#..................#',
  '#.....###..###.....#',
  '#.....###..###.....#',
  '#..................#',
  '#...####....####...#',
  '#...####....####...#',
  '#..................#',
  '#..................#',
  '####################',
];

// 我方从下方出生，敌方从上方出生。
export const ALLY_SPAWNS = [
  { x: 2.5, y: 22.5 },
  { x: 10.5, y: 22.5 },
  { x: 17.5, y: 22.5 },
];

export const ENEMY_SPAWNS = [
  { x: 2.5, y: 1.5 },
  { x: 10.5, y: 1.5 },
  { x: 17.5, y: 1.5 },
];

export function createArena(rows = MAP_ROWS) {
  const cols = rows[0].length;
  const tiles = rows.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0)));
  return { cols, rows: rows.length, tiles };
}

export const isWallTile = (arena, cx, cy) =>
  cx < 0 || cy < 0 || cx >= arena.cols || cy >= arena.rows || arena.tiles[cy][cx] === 1;

export const isWall = (arena, x, y) => isWallTile(arena, Math.floor(x), Math.floor(y));

// 圆形碰撞：只查外接矩形覆盖到的格子，取格子上离圆心最近的点比距离。
export function circleBlocked(arena, x, y, radius = UNIT_RADIUS) {
  const minX = Math.floor(x - radius);
  const maxX = Math.floor(x + radius);
  const minY = Math.floor(y - radius);
  const maxY = Math.floor(y + radius);
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      if (!isWallTile(arena, cx, cy)) continue;
      const nearestX = Math.min(Math.max(x, cx), cx + 1);
      const nearestY = Math.min(Math.max(y, cy), cy + 1);
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  return false;
}

// 分轴推进：贴着墙走时保留另一个轴的位移，不会被墙角吸住。
export function resolveMove(arena, x, y, dx, dy, radius = UNIT_RADIUS) {
  let nx = x;
  let ny = y;
  if (dx !== 0 && !circleBlocked(arena, nx + dx, ny, radius)) nx += dx;
  if (dy !== 0 && !circleBlocked(arena, nx, ny + dy, radius)) ny += dy;
  return { x: nx, y: ny };
}

// 采样式射线：竞技场很小，逐点推进比 DDA 更好读，也够精确。
export function castRay(arena, x0, y0, dx, dy, maxDist, step = 0.05) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  for (let t = 0; t <= maxDist; t += step) {
    const x = x0 + ux * t;
    const y = y0 + uy * t;
    if (isWall(arena, x, y)) return { hit: true, x, y, distance: t };
  }
  return { hit: false, x: x0 + ux * maxDist, y: y0 + uy * maxDist, distance: maxDist };
}

// 视线判定：两点之间没有墙才算看得见。
export function canSee(arena, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return true;
  const ray = castRay(arena, from.x, from.y, dx, dy, dist);
  return !ray.hit;
}

// 复活点选离敌人最远的那个，避免一睁眼就被枪口顶着。
export function safestSpawn(arena, spawns, enemies = []) {
  let best = spawns[0];
  let bestScore = -Infinity;
  for (const spawn of spawns) {
    let nearest = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dist = Math.hypot(enemy.x - spawn.x, enemy.y - spawn.y);
      const penalty = canSee(arena, spawn, enemy) ? 0 : 6;
      nearest = Math.min(nearest, dist + penalty);
    }
    if (nearest > bestScore) {
      bestScore = nearest;
      best = spawn;
    }
  }
  return best;
}
