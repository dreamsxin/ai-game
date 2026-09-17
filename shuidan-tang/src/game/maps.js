// 关卡表与场地生成。
//
// 八关递进的不是「敌人血更厚」，而是**场地形状**和**对手会不会算退路**：
// 柱阵密的图，一发水弹能封死整条巷子；空旷的图，谁先把对手逼到墙角谁赢。
// 所以每关只有四个旋钮：柱子的排法（style）、箱子密度、对手数量、对手档位。
//
// 箱子和道具由 seed 现场生成，所以同一关每次开局都是新图；
// 但同一个 seed 一定长出同一张图，机器人通关测试靠这条成立。

import { H, TILE, W, key } from './rules.js';
import { createRandom } from './random.js';

/** 四个出生角。人固定在左上，机器人从剩下三个角按顺序占。 */
export const SPAWNS = [
  { cx: 1, cy: 1 },
  { cx: W - 2, cy: H - 2 },
  { cx: W - 2, cy: 1 },
  { cx: 1, cy: H - 2 },
];

export const ITEMS = {
  bomb: { name: '加弹', weight: 30 },
  power: { name: '加压', weight: 30 },
  speed: { name: '加速', weight: 22 },
  kick: { name: '踢弹', weight: 18 },
};

const ITEM_BAG = Object.entries(ITEMS).flatMap(([code, item]) => Array(item.weight).fill(code));

/**
 * 柱子的四种排法。判定只有一条硬约束：**奇行奇列必须是空地**，
 * 出生角都落在奇/奇上，这样任何一张图都不会开局就把人埋死。
 */
export const STYLES = {
  // 经典柱阵：偶/偶一根柱子，巷子全是单格宽。
  grid: (cx, cy) => cx % 2 === 0 && cy % 2 === 0,
  // 缺柱阵：拆掉四分之一的柱子，出现二格宽的空场，适合开局教走位。
  sparse: (cx, cy) => cx % 2 === 0 && cy % 2 === 0 && (cx + cy) % 4 !== 0,
  // 长廊：偶数列连成竖墙，只有第 4、8 行横穿。跑错一步要绕半张图。
  lane: (cx, cy) => cx % 2 === 0 && cy % 4 !== 0,
  // 蜂巢：柱子按行错位，横巷全通、竖巷交错，最容易被爆流封住。
  hive: (cx, cy) => cy % 2 === 0 && (cx + cy / 2) % 2 === 0,
};

export const LEVELS = [
  { key: 'l1', name: '初堂', style: 'sparse', density: 0.3, itemChance: 0.42, bots: 1, skill: 0.35, time: 100 },
  { key: 'l2', name: '木箱巷', style: 'grid', density: 0.5, itemChance: 0.38, bots: 1, skill: 0.5, time: 100 },
  { key: 'l3', name: '双环', style: 'sparse', density: 0.4, itemChance: 0.34, bots: 2, skill: 0.5, time: 110 },
  { key: 'l4', name: '迷格', style: 'grid', density: 0.52, itemChance: 0.32, bots: 2, skill: 0.62, time: 110 },
  { key: 'l5', name: '四方', style: 'sparse', density: 0.42, itemChance: 0.3, bots: 3, skill: 0.62, time: 120 },
  { key: 'l6', name: '长廊', style: 'lane', density: 0.44, itemChance: 0.3, bots: 3, skill: 0.75, time: 120 },
  { key: 'l7', name: '蜂巢', style: 'hive', density: 0.5, itemChance: 0.28, bots: 3, skill: 0.85, time: 130 },
  { key: 'l8', name: '终堂', style: 'grid', density: 0.46, itemChance: 0.26, bots: 3, skill: 1, time: 130 },
];

export const LEVEL_COUNT = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))];

/** 出生角周围的十字五格永远留空：不留这一块，开局第一秒就可能被自己的柱子锁住。 */
export function safeCells() {
  const cells = new Set();
  const add = (cx, cy) => {
    // 边墙不算在内——它本来就该是墙。
    if (cx < 1 || cy < 1 || cx > W - 2 || cy > H - 2) return;
    cells.add(key(cx, cy));
  };
  for (const spawn of SPAWNS) {
    add(spawn.cx, spawn.cy);
    add(spawn.cx + 1, spawn.cy);
    add(spawn.cx - 1, spawn.cy);
    add(spawn.cx, spawn.cy + 1);
    add(spawn.cx, spawn.cy - 1);
  }
  return cells;
}

/**
 * 生成一张图。返回的 grid 是 W*H 的 Uint8Array，items 是「箱子拆开会掉什么」的表。
 * 道具藏在箱子里而不是散在地上，所以拆箱既是开路也是刷装备——这两件事在这游戏里是同一个动作。
 */
export function buildLevel(level, seed = 1) {
  const rng = createRandom(seed);
  const grid = new Uint8Array(W * H);
  const solid = STYLES[level.style] ?? STYLES.grid;
  const safe = safeCells();

  for (let cy = 0; cy < H; cy += 1) {
    for (let cx = 0; cx < W; cx += 1) {
      const at = key(cx, cy);
      const border = cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1;
      if (border) {
        grid[at] = TILE.WALL;
        continue;
      }
      // 出生区不放柱子也不放箱子。
      if (safe.has(at)) {
        grid[at] = TILE.FLOOR;
        continue;
      }
      grid[at] = solid(cx, cy) ? TILE.WALL : TILE.FLOOR;
    }
  }

  const items = new Map();
  for (let cy = 1; cy < H - 1; cy += 1) {
    for (let cx = 1; cx < W - 1; cx += 1) {
      const at = key(cx, cy);
      if (grid[at] !== TILE.FLOOR || safe.has(at)) continue;
      if (!rng.chance(level.density)) continue;
      grid[at] = TILE.CRATE;
      if (rng.chance(level.itemChance)) items.set(at, rng.pick(ITEM_BAG));
    }
  }

  return { grid, items };
}

/**
 * 连通性检查：箱子算可通（它们会被拆掉），墙不算。
 * maps.test.js 拿它守着「四个出生角永远互相到得了」——
 * 一张把某个角封死的图会让那一关的对手凭空消失，比难度失衡更糟。
 */
export function reachable(grid, from = SPAWNS[0]) {
  const seen = new Set([key(from.cx, from.cy)]);
  const queue = [from];
  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = cell.cx + dx;
      const cy = cell.cy + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const at = key(cx, cy);
      if (seen.has(at) || grid[at] === TILE.WALL) continue;
      seen.add(at);
      queue.push({ cx, cy });
    }
  }
  return seen;
}
