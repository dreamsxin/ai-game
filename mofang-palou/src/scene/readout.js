// HUD 的全部文案和相机取景，都是纯函数：不碰 DOM 也不碰 three，所以能在 node 里单测。
// 组件只负责把这里算出来的字摆上去，不自己拼字符串 —— 文案有唯一出处才不会两处说法不一致。
import {
  LAYER_HEIGHT,
  TILE_SPAN,
  VIEW_SIDE,
  VIEW_TOP,
  axesForView,
  orderForTower,
  viewLabel,
} from '../game/rules.js';

const ORDINALS = ['三', '四', '五', '六', '七', '八'];

/** 「四阶」这种说法比「4×4×4」短，而且玩过魔方的人一看就懂。 */
export const orderLabel = (order) => `${ORDINALS[order - 3] ?? order}阶`;

export const towerLabel = (state) => `第 ${state.towerIndex + 1} 座 · ${orderLabel(state.tower.order)}`;

/** 楼层是这一趟的主成绩：一座 N 阶塔算 N 层。 */
export const floorsLabel = (state) => `已爬 ${state.floors} 层`;

export const scoreLabel = (state) => `${state.score}`;
export const bestLabel = (state) => (state.best > 0 ? `最高 ${state.best}` : '还没有记录');

/** 步数对着打乱步数看：不超过就有效率分，超了也只是少拿分，不会失败。 */
export const shiftsLabel = (state) => `${state.shifts} / ${state.tower.par}`;

export const viewButtonLabel = (view) => viewLabel(view);

/** 当前在操作哪一面。转台不操作，只说在看整座塔。 */
export const faceLabel = (state) => {
  if (state.view === VIEW_TOP) return `第 ${state.activeLayer + 1} 层`;
  if (state.view === VIEW_SIDE) return `剖面 · 第 ${state.sliceRow + 1} 排`;
  return '整座塔';
};

/** 这个视角下横滑竖滑各推什么，写在十字键中间，推之前就知道会动哪一条。 */
export const gestureLabel = (view) => {
  if (view === VIEW_TOP) return '横滑推行 · 竖滑推列';
  if (view === VIEW_SIDE) return '横滑推行 · 竖滑推柱';
  return '转台只看，切回俯视或侧视才能推';
};

export const statusLabel = (state) => {
  if (state.status === 'cleared') return '这一座通了';
  return '穿越中';
};

/** 一次动作只出一条提示，取最有信息量的那条。 */
export function effectMessage(effects = []) {
  if (effects.some((effect) => effect.type === 'cleared')) return '登顶！继续往上爬';
  if (effects.some((effect) => effect.type === 'open')) return '路通了，点出口走过去';
  if (effects.some((effect) => effect.type === 'blocked')) return '那边还没通，先推砖对门';
  if (effects.some((effect) => effect.type === 'tower')) return null;
  return null;
}

/** 提示按钮的文案：给不出答案时也要说清是为什么，不编一个看着像答案的走法。 */
export function hintLabel(advice) {
  if (!advice) return '提示';
  if (!advice.move) return advice.reason;
  const { axis, anchor, dir } = advice.move;
  const where = axis === 'pillar'
    ? `第 ${anchor.col + 1} 列第 ${anchor.row + 1} 排那根柱`
    : axis === 'row'
      ? `第 ${anchor.layer + 1} 层第 ${anchor.row + 1} 行`
      : `第 ${anchor.layer + 1} 层第 ${anchor.col + 1} 列`;
  const towards = axis === 'pillar'
    ? (dir > 0 ? '往上' : '往下')
    : axis === 'row'
      ? (dir > 0 ? '往右' : '往左')
      : (dir > 0 ? '往后' : '往前');
  return `推${where}${towards}一格`;
}

export const undoLabel = (state) =>
  state.history.length > 0 ? `撤销 ${state.history.length}` : '撤销';

export const TUTORIAL_STEPS = [
  { title: '目标', detail: '走到绿色门拱那一格就算通了。绿色光柱指着它在哪一列哪一排。' },
  { title: '前两座是热身', detail: '第 1 座的出口就在你脚下那一层，只用推行推列；第 2 座才抬到楼上。' },
  { title: '推砖', detail: '横滑推动一整行，竖滑推动一整列，掉出边界的砖从对面绕回来。只有推砖计步，走位免费。' },
  { title: '推柱', detail: '切到侧视再竖滑，推的就是一整根柱 —— 砖在楼层之间上下搬，这是第三条轴。' },
  { title: '视角', detail: '视角就是轴选择器：转到哪一面就推那一面，跟拧魔方一样。转台只看不推。' },
  { title: '看路线', detail: '砖上那条亮线就是路。两格的亮线在交界处接上才通得过，顶着墙就是断的。' },
  { title: '上下', detail: '偏绿的四角立柱是能往上走，地板上一圈绿框是能往下走 —— 竖着的连接是绿的。' },
  { title: '爬楼', detail: '通一座接一座，阶数从三阶涨到六阶。没有失败，只看你能爬多高。' },
];

/** 你在第几层、出口在第几层。这一行是「看不到出口」的直接答案，任何视角都显示。 */
export const whereLabel = (state) =>
  state.player.layer === state.exit.layer
    ? `同在第 ${state.player.layer + 1} 层`
    : `你在第 ${state.player.layer + 1} 层 · 出口在第 ${state.exit.layer + 1} 层`;

/** 第一座且还没推过的时候贴一句话，比任何图示都直接。 */
export const coachLine = (state) => {
  if (state.status !== 'climbing') return null;
  if (state.shifts > 0) return null;
  // 前两座是热身：第一座出口就在脚下这一层，第二座才抬到楼上。
  if (state.towerIndex === 0) return '出口就在这一层：横滑推整行，竖滑推整列，把门对上';
  if (state.towerIndex === 1) return '出口在楼上了：切「侧视」，竖滑就是推整根柱';
  return null;
};

export const gainLabel = (effect) =>
  effect ? `+${effect.climbed} 层 · +${effect.gained} 分` : '';


/** 通关点评。不超打乱步数才夸「利落」，超了也不说难听话 —— 无尽模式没有失败。 */
export function clearRemark(effect) {
  if (!effect) return '';
  if (effect.shifts <= effect.par) return `${effect.shifts} 步登顶，比保底解法还利落`;
  const over = effect.shifts - effect.par;
  if (over <= 3) return `${effect.shifts} 步登顶，就差 ${over} 步拿效率分`;
  return `${effect.shifts} 步登顶，下一座试试少绕几圈`;
}

/** 下一座会不会升阶，直接问配方表，别在这儿拿 index 去猜。 */
export const nextTowerLabel = (state) => {
  const next = orderForTower(state.towerIndex + 1);
  if (next > state.tower.order) return `进第 ${state.towerIndex + 2} 座 · 升到${orderLabel(next)}`;
  return `进第 ${state.towerIndex + 2} 座`;
};

// ── 相机取景 ────────────────────────────────────────────────────────────
// 竖屏比例大概 0.46，光按高度取景横向会溢出，所以两边都要算，取更远的那个。

export const CAMERA_FOV = 50;
const HALF_FOV_TAN = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);

/** 把 width×height（世界单位）这块画面装进视野，相机得退到多远。 */
export function fitDistance(width, height, aspect = 1) {
  const byHeight = height / 2 / HALF_FOV_TAN;
  const byWidth = width / 2 / (HALF_FOV_TAN * Math.max(0.2, aspect));
  return Math.max(byHeight, byWidth);
}

const span = (order) => order * TILE_SPAN;
const towerHeight = (order) => (order - 1) * LAYER_HEIGHT + TILE_SPAN;

/**
 * 三个视角各自的相机位置和目标点。
 *
 * 俯视不用正上方：纯垂直看不见砖侧面的门，玩家判断不了通不通，所以压成 62° 仰角。
 * 侧视看的是一道纵剖面，要装下 order 宽 × 塔高。
 * 转台绕着整座塔转，取景要把对角线也算进去。
 */
export function cameraFor(view, order, aspect = 1, spin = 0) {
  const width = span(order);
  const height = towerHeight(order);
  if (view === VIEW_TOP) {
    const distance = fitDistance(width, width, aspect) * 1.15;
    const tilt = (62 * Math.PI) / 180;
    return {
      position: [0, Math.sin(tilt) * distance, Math.cos(tilt) * distance],
      target: [0, 0, 0],
      // 俯视画激活层 + 出口那一层的幽灵。原来是「只画激活层及以下」，
      // 结果开局站在底层时出口那一层整层都不画，玩家只看见一个悬空的绿环。
      clip: 'focus',
    };
  }
  if (view === VIEW_SIDE) {
    const distance = fitDistance(width, height, aspect) * 1.2;
    return {
      position: [0, height * 0.1, distance],
      target: [0, 0, 0],
      // 侧视要看穿整座塔，所以只画选中那一排剖面。
      clip: 'slice',
    };
  }
  const diagonal = Math.hypot(width, width);
  const distance = fitDistance(diagonal, height * 1.25, aspect) * 1.25;
  return {
    position: [
      Math.sin(spin) * distance * 0.82,
      height * 0.55 + distance * 0.35,
      Math.cos(spin) * distance * 0.82,
    ],
    target: [0, 0, 0],
    clip: 'none',
  };
}

/** 这一格在世界里的坐标。三个视角共用，免得各算一套摆歪了。 */
export const cellPosition = (order, cell) => [
  (cell.col - (order - 1) / 2) * TILE_SPAN,
  (cell.layer - (order - 1) / 2) * LAYER_HEIGHT,
  (cell.row - (order - 1) / 2) * TILE_SPAN,
];

// 滑够这么多像素才算一次推移，短于它就是点击。太小会把点击误判成滑动。
export const SWIPE_THRESHOLD = 22;

/**
 * 一次滑动该推哪条轴、往哪个方向。**屏幕方向到世界方向的符号在两个视角里是反的**：
 * 俯视时相机在上方朝下压，世界 +z（row 变大）投在屏幕下方，所以往下滑 = row 加；
 * 侧视时相机正对塔身，世界 +y（layer 变大）投在屏幕上方，所以往**上**滑才是 layer 加。
 * 这个符号搞反了会让「推柱」整个反向，是最容易错又最难看出来的一处。
 */
export function gestureShift(view, dx, dy) {
  const axes = axesForView(view);
  if (!axes) return null;
  if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { axis: axes.horizontal, dir: dx > 0 ? 1 : -1 };
  const down = dy > 0;
  if (view === VIEW_TOP) return { axis: axes.vertical, dir: down ? 1 : -1 };
  return { axis: axes.vertical, dir: down ? -1 : 1 };
}



