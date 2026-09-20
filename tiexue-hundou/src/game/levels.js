import { EMPTY } from './tiles.js';

// 关卡统一 18 行高，第 13 行起是地面：13～15 是能站的地表，16～17 是实心岩层，
// 这样竖屏手机上镜头再往下也是岩石，不会露出一片虚空。
export const LEVEL_ROWS = 18;

export const GROUND_ROW = 13;


// 用局部字符画拼关卡：一条 ground 铺地，pit 挖个灌水的坑，plat 架一段可以从下面跳上来的钢架。
function sketch(width, plan) {
  const grid = Array.from({ length: LEVEL_ROWS }, () => Array.from({ length: width }, () => EMPTY));
  const put = (x, y, tile) => {
    if (x >= 0 && x < width && y >= 0 && y < LEVEL_ROWS) grid[y][x] = tile;
  };
  const fill = (x0, y0, x1, y1, tile) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) put(x, y, tile);
  };
  const text = (x, y, str) => [...str].forEach((tile, i) => put(x + i, y, tile));
  // 地表三行踩得到，再往下是实心岩层：镜头往下多看几行也是岩石，不是虚空。
  const ground = (x0, x1) => {
    fill(x0, GROUND_ROW, x1, GROUND_ROW + 2, '#');
    fill(x0, GROUND_ROW + 3, x1, LEVEL_ROWS - 1, '=');
  };

  // 坑里灌水：踩进去就是一条命，所以坑一律不超过 3 格宽，跳得过去才算设计。
  const pit = (x0, x1) => {
    fill(x0, GROUND_ROW, x1, LEVEL_ROWS - 1, EMPTY);
    fill(x0, GROUND_ROW + 1, x1, LEVEL_ROWS - 1, 'x');
  };
  const plat = (x0, x1, y) => fill(x0, y, x1, y, '-');
  const wall = (x0, y0, x1, y1) => fill(x0, y0, x1, y1, '=');
  // 台阶：从地面往上垒 steps 级，朝右为 dir=1。
  const stairs = (x, steps, dir = 1) => {
    for (let i = 0; i < steps; i += 1) {
      const col = x + i * dir;
      fill(col, GROUND_ROW - 1 - i, col, GROUND_ROW - 1, '=');
    }
  };
  // Boss 坐在关卡末尾的地面上，锚点就是它右下角那一格。
  const boss = (x) => put(x, GROUND_ROW - 1, 'B');
  plan({ put, fill, text, ground, pit, plat, wall, stairs, boss, width, row: GROUND_ROW - 1 });
  return grid;
}

// 第一关：一条几乎平的丛林小道。只教三件事——往右压、跳过灌水的坑、打爆补给箱换枪。
const level1 = sketch(120, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 119);
  put(2, row, '@');
  text(14, row, 's');
  plat(20, 26, 10);
  put(23, 9, 'p');
  pit(30, 32);
  text(38, row, 's');
  wall(43, 11, 45, 12);
  put(44, 10, 't');
  plat(49, 56, 10);
  put(52, 9, 's');
  pit(61, 63);
  text(70, row, 'ss');
  plat(76, 83, 9);
  pit(88, 90);
  text(96, row, 's');
  boss(112);
});

// 第二关：钢架桥。平台成段出现，地面兵在下面、跳兵会跨上来，第一次出现两个补给箱。
const level2 = sketch(130, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 129);
  put(2, row, '@');
  text(12, row, 's');
  plat(18, 27, 10);
  put(22, 9, 'p');
  pit(31, 33);
  text(39, row, 'sj');
  plat(44, 52, 9);
  put(48, 8, 's');
  wall(56, 11, 58, 12);
  put(57, 10, 't');
  pit(64, 66);
  plat(70, 79, 10);
  put(74, 9, 'p');
  text(84, row, 'ss');
  plat(90, 97, 9);
  put(93, 8, 'j');
  pit(102, 104);
  text(108, row, 's');
  boss(122);
});

// 第三关：废弃基地。箱子是掩体也是障碍，两座炮台从高处封走位，逼你用斜上射。
const level3 = sketch(140, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 139);
  put(2, row, '@');
  put(10, row, 'o');
  text(14, row, 's');
  wall(20, 11, 22, 12);
  put(21, 10, 't');
  plat(26, 35, 10);
  put(30, 9, 'p');
  pit(39, 41);
  text(46, row, 'ss');
  put(50, row, 'o');
  plat(54, 63, 9);
  put(58, 8, 'j');
  pit(68, 70);
  wall(74, 11, 76, 12);
  put(75, 10, 't');
  text(80, row, 's');
  plat(84, 93, 10);
  put(88, 9, 'p');
  text(98, row, 'sj');
  pit(104, 106);
  plat(110, 117, 9);
  put(113, 8, 's');
  text(122, row, 's');
  boss(133);
});

// 第四关：瀑布垂降。平台叠成两层，掉下去就是水，第一次要在空中按下压枪打脚下的兵。
const level4 = sketch(140, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 139);
  put(2, row, '@');
  text(11, row, 's');
  plat(16, 24, 10);
  plat(20, 28, 7);
  put(23, 6, 's');
  pit(31, 33);
  put(36, row, 'o');
  text(39, row, 'sj');
  wall(45, 11, 47, 12);
  put(46, 10, 't');
  plat(51, 60, 9);
  put(55, 8, 'p');
  pit(64, 66);
  pit(70, 72);
  text(77, row, 'ss');
  plat(82, 91, 10);
  plat(86, 95, 7);
  put(89, 6, 'j');
  wall(99, 11, 101, 12);
  put(100, 10, 't');
  text(105, row, 's');
  plat(109, 118, 9);
  put(113, 8, 'p');
  pit(122, 124);
  text(128, row, 'ss');
  boss(137);
});

// 第五关：雪原铁路。冲锋兵登场——它不开枪，只往你身上撞，所以远远地打它反而更危险。
const level5 = sketch(150, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 149);
  put(2, row, '@');
  text(12, row, 'sr');
  plat(18, 27, 10);
  put(22, 9, 'p');
  pit(31, 33);
  wall(37, 11, 39, 12);
  put(38, 10, 't');
  text(44, row, 'sr');
  plat(49, 58, 9);
  put(53, 8, 's');
  pit(62, 64);
  put(68, row, 'o');
  text(71, row, 'sj');
  wall(77, 11, 79, 12);
  put(78, 10, 't');
  plat(83, 92, 10);
  put(87, 9, 'p');
  text(97, row, 'rs');
  pit(103, 105);
  wall(109, 11, 111, 12);
  put(110, 10, 't');
  plat(115, 124, 9);
  put(119, 8, 'j');
  text(130, row, 'ss');
  pit(134, 136);
  boss(146);
});

// 第六关：能源工厂。三层结构，炮台架在中层，地面全是冲锋兵开的路。
const level6 = sketch(150, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 149);
  put(2, row, '@');
  text(11, row, 'sj');
  plat(16, 25, 10);
  plat(20, 29, 7);
  put(23, 6, 's');
  put(27, 6, 'p');
  pit(32, 34);
  text(38, row, 'rr');
  wall(43, 11, 45, 12);
  put(44, 10, 't');
  plat(49, 58, 9);
  put(53, 8, 'j');
  pit(62, 64);
  put(67, row, 'o');
  text(70, row, 'ss');
  wall(75, 11, 77, 12);
  put(76, 10, 't');
  plat(81, 90, 10);
  plat(85, 94, 7);
  put(88, 6, 'p');
  text(99, row, 'rs');
  pit(104, 106);
  wall(110, 11, 112, 12);
  put(111, 10, 't');
  plat(116, 125, 9);
  put(120, 8, 's');
  put(128, 9, 'p');
  text(132, row, 'sj');
  boss(146);
});

// 第七关：要塞回廊。四座炮台把走廊切成一格格的射界，钢架是唯一的躲法。
const level7 = sketch(160, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 159);
  put(2, row, '@');
  text(11, row, 'ss');
  wall(17, 11, 19, 12);
  put(18, 10, 't');
  plat(23, 32, 10);
  put(27, 9, 'p');
  pit(36, 38);
  text(42, row, 'rj');
  plat(47, 56, 9);
  put(51, 8, 's');
  wall(60, 11, 62, 12);
  put(61, 10, 't');
  pit(66, 68);
  put(71, row, 'o');
  text(74, row, 'sr');
  plat(79, 88, 10);
  plat(83, 92, 7);
  put(86, 6, 'p');
  wall(96, 11, 98, 12);
  put(97, 10, 't');
  text(102, row, 'js');
  pit(107, 109);
  plat(113, 122, 9);
  put(117, 8, 'j');
  wall(126, 11, 128, 12);
  put(127, 10, 't');
  text(132, row, 'rs');
  put(137, 9, 'p');
  pit(141, 143);
  text(147, row, 's');
  boss(156);
});

// 第八关：魂斗核心。前面教过的全上一遍，最后那台机器的血量是第一关的三倍多。
const level8 = sketch(160, ({ put, text, ground, pit, plat, wall, boss, row }) => {
  ground(0, 159);
  put(2, row, '@');
  text(10, row, 'sr');
  plat(15, 24, 10);
  plat(19, 28, 7);
  put(22, 6, 's');
  wall(32, 11, 34, 12);
  put(33, 10, 't');
  pit(38, 40);
  text(44, row, 'rj');
  put(48, 9, 'p');
  plat(46, 55, 10);
  wall(59, 11, 61, 12);
  put(60, 10, 't');
  pit(65, 67);
  text(70, row, 'ss');
  plat(75, 84, 9);
  put(79, 8, 'j');
  put(88, row, 'o');
  text(91, row, 'rs');
  wall(96, 11, 98, 12);
  put(97, 10, 't');
  plat(102, 111, 10);
  plat(106, 115, 7);
  put(109, 6, 'p');
  pit(119, 121);
  text(124, row, 'js');
  wall(129, 11, 131, 12);
  put(130, 10, 't');
  plat(135, 144, 9);
  put(139, 8, 'p');
  text(148, row, 'sr');
  boss(157);
});

// 每关四个旋钮：兵力、炮台数、Boss 血量、限时。关卡顺序就是数组顺序。
export const LEVELS = [
  { key: '1-1', name: '丛林突入', time: 150, bossHp: 20, rows: level1 },
  { key: '1-2', name: '钢架桥道', time: 155, bossHp: 26, rows: level2 },
  { key: '2-1', name: '废弃基地', time: 160, bossHp: 32, rows: level3 },
  { key: '2-2', name: '瀑布垂降', time: 165, bossHp: 38, rows: level4 },
  { key: '3-1', name: '雪原铁路', time: 170, bossHp: 46, rows: level5 },
  { key: '3-2', name: '能源工厂', time: 175, bossHp: 54, rows: level6 },
  { key: '4-1', name: '要塞回廊', time: 180, bossHp: 62, rows: level7 },
  { key: '4-2', name: '魂斗核心', time: 195, bossHp: 72, rows: level8 },
];


export const levelCount = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)];

// 关卡的难度指标直接从字符画里数出来，所以「第几关更难」是可测的事实而不是说法。
export function levelStats(level) {
  const count = (chars) => level.rows.reduce(
    (sum, line) => sum + line.filter((tile) => chars.includes(tile)).length,
    0,
  );
  return {
    troops: count(['s', 'j', 'r']),
    turrets: count(['t']),
    pods: count(['p']),
    bossHp: level.bossHp,
    width: level.rows[0].length,
  };
}




