// 关卡是一张字符画，这里定义每个字符的含义，逻辑层只通过这些谓词判断瓦片。
export const EMPTY = ' ';
export const GROUND = '#';
export const STONE = '=';
export const BRICK = 'B';
export const QUESTION = '?';
export const STAR_BLOCK = '!';
export const COIN_BLOCK = 'C';
export const USED = 'U';
export const PIPE = 'P';
export const COIN = 'o';
export const SPIKE = 'x';
export const GOAL = 'G';
export const SPAWN = '@';

const SOLID = new Set([GROUND, STONE, BRICK, QUESTION, STAR_BLOCK, COIN_BLOCK, USED, PIPE]);
// 顶一下会有反应的块：问号出蘑菇、感叹号出星星、C 出金币、砖块被顶碎。
const BUMP_ITEMS = { [QUESTION]: 'mushroom', [STAR_BLOCK]: 'star', [COIN_BLOCK]: 'coin' };
const ENEMY_CHARS = { g: 'walker', t: 'turtle' };

export const isSolid = (tile) => SOLID.has(tile);
export const isBumpable = (tile) => tile === BRICK || tile in BUMP_ITEMS;
export const isBreakable = (tile) => tile === BRICK;
export const isHazard = (tile) => tile === SPIKE;
export const isCoin = (tile) => tile === COIN;
export const isGoal = (tile) => tile === GOAL;

// 顶到块之后它变成什么、掉出什么；砖块直接碎成空气。
export const bumpResult = (tile) => {
  if (tile in BUMP_ITEMS) return { tile: USED, item: BUMP_ITEMS[tile] };
  if (tile === BRICK) return { tile: EMPTY, item: null };
  return { tile, item: null };
};

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

// 出生点和敌人字符只是布点标记，解析完就从网格里抹掉，免得当成瓦片渲染或碰撞。
export function parseLevel(rows) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const grid = [];
  const enemies = [];
  let spawn = { x: 1, y: 1 };
  let coins = 0;

  rows.forEach((row, y) => {
    const line = Array.from({ length: width }, (_, x) => row[x] ?? EMPTY);
    line.forEach((tile, x) => {
      if (tile === SPAWN) {
        spawn = { x, y };
        line[x] = EMPTY;
        return;
      }
      const kind = ENEMY_CHARS[tile];
      if (kind) {
        enemies.push({ kind, x, y });
        line[x] = EMPTY;
        return;
      }
      if (tile === COIN) coins += 1;
    });
    grid.push(line);
  });

  return { grid, width, height: grid.length, spawn, enemies, coins };
}
