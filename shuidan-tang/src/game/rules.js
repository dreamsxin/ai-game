// 场地尺度与判定常量。逻辑层全部用「格」做单位，像素只活在渲染层。
//
// 这游戏的判定有一条贯穿全局的规矩：**炸中不等于打死**。
// 水弹的爆流把人裹成一颗水泡，水泡自己会挣脱；想真的清掉一个对手，
// 必须在它挣脱之前再补一发。所以 BUBBLE_LIFE 和 FUSE 的比例是整个玩法的心跳：
// 一发水弹的引信 2.4 秒，水泡撑 4.2 秒——补刀窗口刚够跑两格、放一发、再躲开。

export const W = 11;
export const H = 13;

/** 模拟步长。逻辑固定 60Hz，渲染插值，机器人测试也走同一个步长。 */
export const STEP = 1 / 60;

export const TILE = { FLOOR: 0, WALL: 1, CRATE: 2 };

/** 身体半径。小于半格，所以贴着墙角也能拐进单格宽的巷子。 */
export const BODY = 0.34;

export const FUSE = 2.4;
/** 爆流留在场上的时间。它不只是特效——这段时间里踩进去照样中招。 */
export const BLAST_LIFE = 0.34;

export const BUBBLE_LIFE = 4.2;
/** 连点一次抵扣的挣脱时间。手速能救命，但救不回站位。 */
export const STRUGGLE_GAIN = 0.3;
/** 挣脱出来的无敌时间。没有它，困在爆流里的人一出泡就再被同一发爆流打回去。 */
export const GRACE = 1.1;

export const BASE_SPEED = 4.2;
export const SPEED_STEP = 0.5;
export const MAX_SPEED_LV = 4;
export const MAX_POWER = 6;
export const MAX_BOMBS = 6;

/** 踢出去的水弹滑行速度。比人快一点，所以踢完要马上想「它停在哪」。 */
export const KICK_SPEED = 7.5;

export const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export const clamp = (v, low, high) => (v < low ? low : v > high ? high : v);

export const key = (cx, cy) => cy * W + cx;
export const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;

/** 坐标是格中心制：(1.5, 1.5) 就是左上角那格的正中。 */
export const cellOf = (v) => Math.floor(v);
export const centerOf = (c) => c + 0.5;

export const tileAt = (grid, cx, cy) => (inside(cx, cy) ? grid[key(cx, cy)] : TILE.WALL);
export const isSolid = (grid, cx, cy) => tileAt(grid, cx, cy) !== TILE.FLOOR;

/** 曼哈顿距离。爆流沿直线走，所以这游戏里的「近」永远是曼哈顿意义上的近。 */
export const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

/**
 * 一发水弹的爆流会盖住哪些格。十字四向各走 power 格：
 * 撞到柱子当场停，撞到箱子把箱子算进去再停——**箱子既是掩体也是消耗品**，
 * 这条几何关系是整张图的攻防语言，所以判定层和机器人共用同一个函数，不许各算一份。
 */
export function blastCells(grid, cx, cy, power) {
  const cells = [{ cx, cy, crate: false }];
  for (const { dx, dy } of DIRS) {
    for (let r = 1; r <= power; r += 1) {
      const nx = cx + dx * r;
      const ny = cy + dy * r;
      const tile = tileAt(grid, nx, ny);
      if (tile === TILE.WALL) break;
      if (tile === TILE.CRATE) {
        cells.push({ cx: nx, cy: ny, crate: true });
        break;
      }
      cells.push({ cx: nx, cy: ny, crate: false });
    }
  }
  return cells;
}
