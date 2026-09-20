// 关卡是一张字符画，这里定义每个字符的含义，逻辑层只通过这些谓词判断瓦片。
export const EMPTY = ' ';
export const GROUND = '#';
export const ROCK = '=';
// 单向平台：从下面能穿上去，落下来能站住。横版射击里的钢架就是这种。
export const GRID_PLAT = '-';
export const CRATE = 'o';
export const WATER = 'x';
export const SPAWN = '@';

const SOLID = new Set([GROUND, ROCK, CRATE]);
const ENEMY_CHARS = { s: 'soldier', j: 'jumper', r: 'runner', t: 'turret' };

export const isSolid = (tile) => SOLID.has(tile);
export const isPlatform = (tile) => tile === GRID_PLAT;
export const isHazard = (tile) => tile === WATER;
export const isCrate = (tile) => tile === CRATE;

export const tileAt = (grid, col, row) => {
  if (row < 0 || row >= grid.length) return EMPTY;
  const line = grid[row];
  if (col < 0 || col >= line.length) return EMPTY;
  return line[col];
};

// 只复制被改动的那一行，其余行继续共享，保证状态可以整体当成不可变对象传递。
export const setTile = (grid, col, row, tile) => {
  if (row < 0 || row >= grid.length) return grid;
  const line = grid[row];
  if (col < 0 || col >= line.length) return grid;
  const nextLine = [...line];
  nextLine[col] = tile;
  const next = [...grid];
  next[row] = nextLine;
  return next;
};

// 出生点、敌人、补给箱和 Boss 只是布点标记，解析完就从网格里抹掉，
// 免得被当成瓦片渲染或参与碰撞。
export function parseLevel(rows) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const grid = [];
  const enemies = [];
  const pods = [];
  let spawn = { x: 2, y: 2 };
  let boss = null;

  rows.forEach((row, y) => {
    const line = Array.from({ length: width }, (_, x) => row[x] ?? EMPTY);
    line.forEach((tile, x) => {
      if (tile === SPAWN) {
        spawn = { x, y };
        line[x] = EMPTY;
        return;
      }
      if (tile === 'p') {
        pods.push({ x, y });
        line[x] = EMPTY;
        return;
      }
      if (tile === 'B') {
        boss = { x, y };
        line[x] = EMPTY;
        return;
      }
      const kind = ENEMY_CHARS[tile];
      if (kind) {
        enemies.push({ kind, x, y });
        line[x] = EMPTY;
      }
    });
    grid.push(line);
  });

  return { grid, width, height: grid.length, spawn, enemies, pods, boss };
}
