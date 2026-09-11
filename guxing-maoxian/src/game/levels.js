import { EMPTY } from './tiles.js';

// 关卡统一 14 行高，第 12、13 行是地面，玩家站在地面上时占第 11 行。
export const LEVEL_ROWS = 14;
const GROUND_ROW = 12;

// 用局部字符画拼关卡：text() 在指定坐标横着写一小段，比整行 100 多个字符好核对。
function sketch(width, plan) {
  const grid = Array.from({ length: LEVEL_ROWS }, () => Array.from({ length: width }, () => EMPTY));
  const put = (x, y, tile) => {
    if (x >= 0 && x < width && y >= 0 && y < LEVEL_ROWS) grid[y][x] = tile;
  };
  const fill = (x0, y0, x1, y1, tile) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) put(x, y, tile);
  };
  const text = (x, y, str) => [...str].forEach((tile, i) => put(x + i, y, tile));
  const ground = (x0, x1) => fill(x0, GROUND_ROW, x1, LEVEL_ROWS - 1, '#');
  const pit = (x0, x1) => fill(x0, GROUND_ROW, x1, LEVEL_ROWS - 1, EMPTY);
  // 台阶：从地面往上垒 steps 级，朝右为 dir=1。
  const stairs = (x, steps, dir = 1) => {
    for (let i = 0; i < steps; i += 1) {
      const col = x + i * dir;
      fill(col, GROUND_ROW - 1 - i, col, GROUND_ROW - 1, '=');
    }
  };
  plan({ put, fill, text, ground, pit, stairs, width });
  return grid;
}

const level1 = sketch(112, ({ put, fill, text, ground, pit, stairs }) => {
  ground(0, 111);
  put(2, 11, '@');
  text(9, 9, '?');
  text(14, 9, 'B?BB?B');
  put(20, 11, 'g');
  fill(24, 10, 25, 11, 'P');
  text(30, 11, 'gg');
  text(34, 8, 'ooo');
  text(38, 9, 'BB!BB');
  fill(46, 9, 47, 11, 'P');
  put(52, 11, 't');
  stairs(54, 3);
  pit(58, 60);
  text(64, 11, 'gg');
  text(68, 7, 'BCBBB');
  text(69, 6, 'ooo');
  text(76, 9, '?');
  put(78, 11, 't');
  text(84, 8, 'ooo');
  pit(84, 86);
  put(92, 11, 'g');
  stairs(96, 4);
  fill(104, 8, 104, 11, 'G');
});

const level2 = sketch(120, ({ put, fill, text, ground, pit, stairs }) => {
  ground(0, 119);
  put(2, 11, '@');
  text(8, 9, 'BB?BB');
  text(9, 6, 'oo');
  put(14, 11, 'g');
  text(16, 11, 'xx');
  fill(20, 10, 21, 11, 'P');
  put(24, 11, 't');
  text(26, 8, 'BBBB');
  text(27, 7, 'oo');
  text(32, 11, 'gg');
  text(34, 10, '=');
  text(36, 9, 'B!BB');
  // 砖块顶棚之后立刻留出一段空地当助跑，紧接着才是坑。
  text(41, 10, 'o');
  pit(44, 46);
  text(44, 9, 'BBB');
  put(50, 11, 't');
  put(51, 11, 't');
  text(54, 7, 'BCB');
  text(55, 6, 'o');
  // 砖块平台正下方不放尖刺，往后挪出一段助跑距离再放一根。
  put(60, 11, 'x');
  fill(62, 9, 63, 11, 'P');
  text(66, 9, '?B?');
  put(70, 11, 'g');
  pit(72, 75);
  text(72, 8, 'oooo');
  text(72, 9, 'BBBB');
  put(80, 11, 't');
  stairs(82, 3);
  stairs(88, 3, -1);
  put(93, 11, 'x');
  put(96, 11, 'g');
  text(98, 9, 'B?B');
  stairs(104, 4);
  fill(112, 8, 112, 11, 'G');
});

const level3 = sketch(128, ({ put, fill, text, ground, pit, stairs }) => {
  ground(0, 127);
  put(2, 11, '@');
  text(7, 9, '?B?');
  put(12, 11, 'g');
  text(13, 11, 'g');
  text(15, 8, '=====');
  text(16, 7, 'ooo');
  put(17, 6, 't');
  text(22, 11, 'xxx');
  fill(26, 10, 27, 11, 'P');
  text(30, 9, 'B!B');
  pit(34, 37);
  text(34, 7, 'BBBB');
  text(35, 6, 'oo');
  put(41, 11, 't');
  text(43, 10, '==');
  text(45, 8, '==');
  text(47, 6, '==');
  text(47, 5, 'oo');
  put(48, 4, 'g');
  pit(52, 56);
  text(52, 9, 'BCB');
  text(58, 11, 'tt');
  stairs(62, 4);
  text(68, 7, 'BB?BB');
  text(69, 6, 'oooo');
  pit(74, 78);
  text(74, 10, '===');
  put(82, 11, 'g');
  text(84, 11, 'xx');
  text(86, 9, 'B?B');
  put(90, 11, 't');
  text(92, 8, '=====');
  text(93, 7, 'ooo');
  put(94, 6, 'g');
  pit(100, 104);
  text(100, 9, 'BBBBB');
  text(100, 8, 'ooooo');
  text(108, 11, 'gg');
  text(110, 9, '?!?');
  stairs(116, 5);
  fill(124, 7, 124, 11, 'G');
});

// 每关一张字符画加一份限时，通关顺序就是数组顺序。
export const LEVELS = [
  { key: '1-1', name: '青草丘陵', time: 240, rows: level1 },
  { key: '1-2', name: '砖窑遗迹', time: 260, rows: level2 },
  { key: '1-3', name: '星塔之巅', time: 300, rows: level3 },
];

export const levelCount = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)];


