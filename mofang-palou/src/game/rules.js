// 规则常量的唯一真源。全是纯数据和纯函数，不碰 DOM 也不碰 three。
//
// 这游戏的骨架是一个 N 阶魔方：N×N×N 个砖格，N 从三阶爬到六阶。
// 一块砖是一个六位掩码，六个面各有一扇门 —— 上下两个面就是楼层之间的通道，
// 所以整座塔是一张真正的三维图，不是「几层二维图靠垫子拼起来」。

// 六个面的门。位序按 北→东→南→西→上→下，掩码就是六位。
export const DOOR_N = 1;
export const DOOR_E = 2;
export const DOOR_S = 4;
export const DOOR_W = 8;
export const DOOR_U = 16;
export const DOOR_D = 32;
export const DOOR_MASK = DOOR_N | DOOR_E | DOOR_S | DOOR_W | DOOR_U | DOOR_D;

/**
 * 六个方向的位移。dc/dr/dl 分别是列、行、层的增量。
 * OPPOSITE 给出「从对面看回来」是哪一个方向：接一条边要两头同时开门。
 */
export const DIRECTIONS = [
  { bit: DOOR_N, dc: 0, dr: -1, dl: 0, name: '北' },
  { bit: DOOR_E, dc: 1, dr: 0, dl: 0, name: '东' },
  { bit: DOOR_S, dc: 0, dr: 1, dl: 0, name: '南' },
  { bit: DOOR_W, dc: -1, dr: 0, dl: 0, name: '西' },
  { bit: DOOR_U, dc: 0, dr: 0, dl: 1, name: '上' },
  { bit: DOOR_D, dc: 0, dr: 0, dl: -1, name: '下' },
];
export const OPPOSITE = [2, 3, 0, 1, 5, 4];

export const hasDoor = (tile, direction) => (tile & DIRECTIONS[direction].bit) !== 0;
export const doorCount = (tile) =>
  DIRECTIONS.reduce((sum, dir) => sum + ((tile & dir.bit) ? 1 : 0), 0);

// 三条线族，一个三维格子里就只有这三种取法，不存在第四种。
// 每条线由「锚点格 + 轴」确定：线上的格子跟锚点共享另外两维。
export const AXIS_ROW = 'row';       // 固定 (layer, row)，沿 col 走 —— 推一整行
export const AXIS_COL = 'col';       // 固定 (layer, col)，沿 row 走 —— 推一整列
export const AXIS_PILLAR = 'pillar'; // 固定 (col, row)，沿 layer 走 —— 推一整柱
export const AXES = [AXIS_ROW, AXIS_COL, AXIS_PILLAR];

export const axisLabel = (axis) =>
  axis === AXIS_ROW ? '行' : axis === AXIS_COL ? '列' : '柱';

export const cellKey = ({ layer, col, row }) => `${layer},${col},${row}`;
// UI 传进来的常是带高亮标记的派生格子，动作入口先收窄成纯坐标，别让视图字段渗进状态。
export const toCell = ({ layer, col, row }) => ({ layer, col, row });
export const sameCell = (a, b) =>
  Boolean(a) && Boolean(b) && a.layer === b.layer && a.col === b.col && a.row === b.row;

// 世界尺寸：一格 1 单位，砖体比格子略小，缝隙让「砖在滑动」这件事看得出来。
export const TILE_SPAN = 1;
export const TILE_GAP = 0.12;
export const LAYER_HEIGHT = 1.2;

// 三个观察视角。视角同时也是**轴选择器**：转到哪一面，滑动就推那一面的行列，
// 跟拧真魔方一样先把要动的那面转到眼前。所以不需要额外的轴切换按钮。
export const VIEW_TOP = 'top';     // 俯视当前层：横滑推行，竖滑推列
export const VIEW_SIDE = 'side';   // 侧视纵剖面：横滑推行，竖滑推柱
export const VIEW_ORBIT = 'orbit'; // 转台看整座塔：只看不推
export const VIEWS = [VIEW_TOP, VIEW_SIDE, VIEW_ORBIT];

export const viewLabel = (view) =>
  view === VIEW_TOP ? '俯视' : view === VIEW_SIDE ? '侧视' : '转台';

/** 这个视角下，横滑和竖滑各推哪条轴。转台不推，返回 null。 */
export const axesForView = (view) => {
  if (view === VIEW_TOP) return { horizontal: AXIS_ROW, vertical: AXIS_COL };
  if (view === VIEW_SIDE) return { horizontal: AXIS_ROW, vertical: AXIS_PILLAR };
  return null;
};

// 阶数：三阶起步，六阶封顶。N 阶就是 N×N×N —— 楼层数和每层边长一起涨，
// 这正是「阶」的含义，也让难度只有一个旋钮。
export const MIN_ORDER = 3;
export const MAX_ORDER = 6;
// 同一阶连爬两座再升阶：一座用来学、一座用来熟。
export const TOWERS_PER_ORDER = 2;

export const orderForTower = (index) => {
  const step = Math.floor(Math.max(0, Math.trunc(index) || 0) / TOWERS_PER_ORDER);
  return Math.min(MAX_ORDER, MIN_ORDER + step);
};

// 到六阶就没有更高的阶了，之后靠打乱步数继续加压，封顶 40 —— 再深下去
// 一座塔要磨掉十几分钟，无尽模式的节奏会断。
export const SCRAMBLE_BASE = { 3: 4, 4: 7, 5: 10, 6: 14 };
export const SCRAMBLE_CAP = 40;
export const TOWERS_TO_MAX_ORDER = (MAX_ORDER - MIN_ORDER) * TOWERS_PER_ORDER;

export const scrambleForTower = (index) => {
  const at = Math.max(0, Math.trunc(index) || 0);
  const order = orderForTower(at);
  const extra = order === MAX_ORDER ? (at - TOWERS_TO_MAX_ORDER) * 2 : 0;
  return Math.min(SCRAMBLE_CAP, SCRAMBLE_BASE[order] + extra);
};

// 额外开门率：越往上越少，路越容易断。三阶给得宽松，六阶压到只剩骨架。
export const loopsForTower = (index) => {
  const order = orderForTower(index);
  return { 3: 0.24, 4: 0.19, 5: 0.14, 6: 0.1 }[order];
};

/** 一座塔的配方。生成器只认这个对象。 */
export const towerRecipe = (index) => {
  const at = Math.max(0, Math.trunc(index) || 0);
  const order = orderForTower(at);
  return { index: at, order, scramble: scrambleForTower(at), loops: loopsForTower(at) };
};

// 记分：爬上去的楼层是主分，一座 N 阶塔就是 N 层。步数不超过打乱步数再给一笔效率分。
export const FLOOR_BONUS = 100;
export const PAR_BONUS = 200;
export const towerScore = (order, shifts, par) =>
  order * FLOOR_BONUS + (shifts <= par ? PAR_BONUS : 0);

// 撤销上限。无尽模式里一座塔最多几十步，四十步的历史足够回头。
export const HISTORY_LIMIT = 40;

