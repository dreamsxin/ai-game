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

// 十个章节，每章十关，共一百关。
//
// 每章只写首尾两个端点，中间八关线性插值——难度曲线因此一定是单调的，
// 也不用手写一百行配方。tint 是这一章的砖块染色（乘在体素顶点色上，
// 所以砖内部的明暗关系不变），sky 是背景与雾色。
export const LEVELS_PER_CHAPTER = 10;

export const CHAPTERS = [
  { name: '初启', tint: 0xffffff, sky: 0x070b18, cols: [3, 4], rows: [3, 4], layers: [1, 1], scramble: [2, 4], loops: [0.22, 0.21] },
  { name: '错位', tint: 0xc9d8ff, sky: 0x0a1024, cols: [4, 4], rows: [4, 4], layers: [1, 1], scramble: [4, 6], loops: [0.21, 0.2] },
  { name: '双阙', tint: 0xffd9c0, sky: 0x150d1f, cols: [4, 5], rows: [4, 4], layers: [2, 2], scramble: [6, 7], loops: [0.2, 0.19] },
  { name: '回环', tint: 0xc7ffe6, sky: 0x061a18, cols: [5, 5], rows: [4, 5], layers: [2, 2], scramble: [7, 8], loops: [0.19, 0.175] },
  { name: '叠城', tint: 0xffe6a8, sky: 0x1a1206, cols: [5, 5], rows: [5, 5], layers: [3, 3], scramble: [8, 9], loops: [0.175, 0.16] },
  { name: '深井', tint: 0xb9c6ff, sky: 0x05091c, cols: [5, 6], rows: [5, 5], layers: [3, 3], scramble: [9, 10], loops: [0.16, 0.145] },
  { name: '环廊', tint: 0xffc9e8, sky: 0x1a0a18, cols: [6, 6], rows: [5, 6], layers: [3, 3], scramble: [10, 11], loops: [0.145, 0.13] },
  { name: '穹顶', tint: 0xd6ffcf, sky: 0x0a1a0c, cols: [6, 6], rows: [6, 6], layers: [4, 4], scramble: [11, 12], loops: [0.13, 0.115] },
  { name: '虚径', tint: 0xcfd4ff, sky: 0x0d0820, cols: [6, 7], rows: [6, 6], layers: [4, 4], scramble: [12, 13], loops: [0.115, 0.1] },
  { name: '归途', tint: 0xfff0d0, sky: 0x1c1408, cols: [7, 7], rows: [6, 7], layers: [4, 4], scramble: [13, 15], loops: [0.1, 0.085] },
];

const ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

// 端点之间取整插值。步长只有一关时直接取起点，避免除零。
const lerpStep = (range, step, steps, round) => {
  const [from, to] = range;
  const ratio = steps > 1 ? step / (steps - 1) : 0;
  const value = from + (to - from) * ratio;
  return round ? Math.round(value) : value;
};

const buildLevels = () =>
  CHAPTERS.flatMap((chapter, chapterIndex) =>
    Array.from({ length: LEVELS_PER_CHAPTER }, (unused, step) => ({
      name: `${chapter.name} ${ORDINALS[step]}`,
      chapter: chapter.name,
      chapterIndex,
      tint: chapter.tint,
      sky: chapter.sky,
      cols: lerpStep(chapter.cols, step, LEVELS_PER_CHAPTER, true),
      rows: lerpStep(chapter.rows, step, LEVELS_PER_CHAPTER, true),
      layers: lerpStep(chapter.layers, step, LEVELS_PER_CHAPTER, true),
      scramble: lerpStep(chapter.scramble, step, LEVELS_PER_CHAPTER, true),
      // loops 是概率，别取整。
      loops: Number(lerpStep(chapter.loops, step, LEVELS_PER_CHAPTER, false).toFixed(3)),
    })),
  );

export const LEVELS = buildLevels();

export const LEVEL_COUNT = LEVELS.length;
export const clampLevelIndex = (index) => Math.max(0, Math.min(LEVEL_COUNT - 1, Math.trunc(index) || 0));
export const levelRecipe = (index) => LEVELS[clampLevelIndex(index)];
// 场景配色跟着章节走：换章就换一次天色和砖色，玩家一眼知道进了新一章。
export const levelTheme = (index) => {
  const level = levelRecipe(index);
  return { tint: level.tint, sky: level.sky };
};


// 三星要求打到 par，二星允许多花一半，剩下都算一星——通关本身不该被判失败。
export const starsFor = (shifts, par) => {
  if (shifts <= par) return 3;
  if (shifts <= par + Math.ceil(par / 2)) return 2;
  return 1;
};

export const SHIFT_SECONDS = 0.24;
export const WALK_SECONDS_PER_CELL = 0.13;
