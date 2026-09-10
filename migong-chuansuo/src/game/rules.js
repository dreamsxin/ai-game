// 门位掩码、格子几何、关卡表与星级的唯一真源。
// 一块砖是一个整数：低 4 位是四个方向的门，第 5 位是跃迁垫。
// 整数表示让「整行推移」退化成数组轮转，门和跃迁垫必然跟着砖一起走。
export const DOOR_N = 1;
export const DOOR_E = 2;
export const DOOR_S = 4;
export const DOOR_W = 8;
export const WARP = 16;
export const DOOR_MASK = DOOR_N | DOOR_E | DOOR_S | DOOR_W;

// 索引即方向号：0 北、1 东、2 南、3 西。dc/dr 用列行增量表达。
export const DIRECTIONS = [
  { bit: DOOR_N, dc: 0, dr: -1, name: '北' },
  { bit: DOOR_E, dc: 1, dr: 0, name: '东' },
  { bit: DOOR_S, dc: 0, dr: 1, name: '南' },
  { bit: DOOR_W, dc: -1, dr: 0, name: '西' },
];

export const OPPOSITE = [2, 3, 0, 1];

export const hasDoor = (tile, direction) => (tile & DIRECTIONS[direction].bit) !== 0;
export const isWarp = (tile) => (tile & WARP) !== 0;
export const doorCount = (tile) => DIRECTIONS.reduce((sum, d) => sum + ((tile & d.bit) ? 1 : 0), 0);

// 世界尺寸：一格 1 单位，砖体比格子略小，缝隙让「砖在滑动」这件事看得出来。
export const TILE_SPAN = 1;
export const TILE_GAP = 0.1;
export const LAYER_HEIGHT = 1.15;

export const AXIS_ROW = 'row';
export const AXIS_COL = 'col';

export const cellKey = ({ layer, col, row }) => `${layer},${col},${row}`;
// UI 传进来的往往是带高亮标记的派生格子，动作入口先收窄成纯坐标，避免视图字段渗进状态。
export const toCell = ({ layer, col, row }) => ({ layer, col, row });
export const sameCell = (a, b) =>
  Boolean(a) && Boolean(b) && a.layer === b.layer && a.col === b.col && a.row === b.row;

// 六关递进：先教推移，再教跃迁，最后叠到三层。scramble 同时是保底解法长度。
export const LEVELS = [
  { name: '初启', cols: 3, rows: 3, layers: 1, scramble: 2, loops: 0.3 },
  { name: '错位', cols: 4, rows: 4, layers: 1, scramble: 3, loops: 0.24 },
  { name: '双阙', cols: 4, rows: 4, layers: 2, scramble: 4, loops: 0.2 },
  { name: '回环', cols: 5, rows: 4, layers: 2, scramble: 5, loops: 0.16 },
  { name: '叠城', cols: 5, rows: 5, layers: 3, scramble: 6, loops: 0.14 },
  { name: '终穿', cols: 5, rows: 5, layers: 3, scramble: 7, loops: 0.1 },
];

export const LEVEL_COUNT = LEVELS.length;
export const levelRecipe = (index) => LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, index))];

// 三星要求打到 par，二星允许多花一半，剩下都算一星——通关本身不该被判失败。
export const starsFor = (shifts, par) => {
  if (shifts <= par) return 3;
  if (shifts <= par + Math.ceil(par / 2)) return 2;
  return 1;
};

export const SHIFT_SECONDS = 0.24;
export const WALK_SECONDS_PER_CELL = 0.13;
