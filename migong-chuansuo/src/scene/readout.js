import { LEVELS, LEVEL_COUNT, TILE_SPAN, clampLevelIndex, levelRecipe } from '../game/rules.js';

// HUD 文案全部在这里派生，React 组件只负责摆放。
export const levelName = (index) => LEVELS[clampLevelIndex(index)].name;

export const levelLabel = (index) => `第 ${index + 1} 关 · ${levelName(index)}`;

// 章节名单独露出来：一百关光看关号说不清进度，说到「第几章」才有坐标感。
export const chapterLabel = (index) => {
  const level = levelRecipe(index);
  return `${level.chapter} · 第 ${level.chapterIndex + 1} 章`;
};


export const shiftLabel = (shifts, par) => `${shifts} / ${par}`;

export const parLabel = (par) => `标准 ${par} 步`;

// 先把星数夹到 0~3，否则负数会多画出一颗空星。
export const starLabel = (stars) => {
  const filled = Math.max(0, Math.min(3, stars));
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
};

export const layerLabel = (layer, layers) => (layers > 1 ? `第 ${layer + 1} / ${layers} 层` : '单层');

export const sizeLabel = (level) =>
  `${level.cols}×${level.rows}${level.layers > 1 ? ` × ${level.layers} 层` : ''}`;

// 通关评语按超出 par 的幅度给，别在玩家已经赢了的时候还挑刺。
export const winComment = (shifts, par) => {
  if (shifts < par) return `比标准还少 ${par - shifts} 步`;
  if (shifts === par) return '正好踩在标准步数上';
  return `比标准多用了 ${shifts - par} 步`;
};

export const statusLabel = (status) => (status === 'won' ? '已穿越' : '穿越中');

// 一次动作只可能触发一条提示，取最有信息量的那条。
export const effectMessage = (effects) => {
  if (effects.some((effect) => effect.type === 'won')) return null;
  if (effects.some((effect) => effect.type === 'open')) return '出口通了，点它走过去';
  if (effects.some((effect) => effect.type === 'blocked')) return '那边还没门，先把它推到路上';
  if (effects.some((effect) => effect.type === 'undo')) return '已撤回一步';
  return null;
};

export const undoLabel = (count) => (count > 0 ? `撤销 ${count}` : '撤销');

// 通关奖励：只有真的刷掉旧纪录才说「新纪录」，否则重刷同一关每次都报喜就不值钱了。
export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

// 总星进度要给出分母，玩家才知道还剩多少可拿。
export const progressLabel = (total) => `${total} / ${LEVEL_COUNT * 3}`;

export const muteLabel = (muted) => (muted ? '音效已关' : '音效已开');

// 星级奖励的一句话点评：按拿到几颗给，和 winComment 的「步数账」分开说。
export const rewardLabel = (stars) => {
  if (stars >= 3) return '满星穿越';
  if (stars === 2) return '再省几步就是满星';
  return '通了就算过，下次少推几下';
};


// 行列号对玩家一律从 1 开始数，内部索引不外露。
export const lineLabel = (anchor) => `行 ${anchor.row + 1} · 列 ${anchor.col + 1}`;

export const pushLabel = (axis, dir) => {
  if (axis === 'row') return dir > 0 ? '整行右移' : '整行左移';
  return dir > 0 ? '整列下移' : '整列上移';
};

// 新手引导：四步讲完，多一步都会被跳过。
export const TUTORIAL_STEPS = [
  { title: '目标', detail: '走到绿色门拱那一格就算穿越成功。' },
  { title: '推砖', detail: '在场景上横滑推动一整行，竖滑推动一整列，越界的砖从对面绕回来。' },
  { title: '走位', detail: '点亮起来的格子可以直接走过去，走位不计步——只有推砖才计步。' },
  { title: '对门', detail: '两块砖的门必须正对着才通。琥珀色光带就是你当前会推的那一行一列。' },
];

// 第一关且还没推过的时候贴一句话，比任何图示都直接。
export const coachLine = (state) => {
  if (state.status !== 'playing') return null;
  if (state.levelIndex > 0 || state.shifts > 0) return null;
  return '横滑推整行，竖滑推整列，把门对上';
};

// 提示按钮的文案：给不出答案时也要说清是为什么。
export const hintLabel = (advice) => {
  if (!advice) return '提示';
  if (advice.move) {
    const axis = advice.move.axis === 'row' ? '行' : '列';
    const index = advice.move.index + 1;
    const towards = advice.move.axis === 'row'
      ? (advice.move.dir > 0 ? '往右' : '往左')
      : (advice.move.dir > 0 ? '往下' : '往上');
    return `推第 ${index} ${axis}${towards}`;
  }
  return advice.reason ?? '提示';
};

// 相机的垂直视野角，和 createScene 里 PerspectiveCamera 的第一个参数必须一致。
export const CAMERA_FOV = 50;
const HALF_FOV_TAN = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);

/**
 * 相机高度随棋盘大小走，5×5 也要能整张塞进手机竖屏。
 *
 * aspect 是画布的宽高比，必须传：竖屏手机 aspect≈0.46，水平视野比垂直窄一半多，
 * 只按边长算距离会把左右两列直接切出画面——这就是真机上「显示不全」的来源。
 */
export const cameraDistance = (cols, rows, layers, aspect = 1) => {
  const span = Math.max(cols, rows) * TILE_SPAN;
  const height = span * 1.35 + layers * 0.55 + 1.6;
  const back = span * 0.95 + 1.2;
  // 先算「横着装下整排砖」需要多远，不够就把整个机位按比例推远，机位角度保持不变。
  const halfWidth = (cols * TILE_SPAN) / 2 + TILE_SPAN * 0.7;
  const needed = halfWidth / (Math.max(0.2, aspect) * HALF_FOV_TAN);
  const scale = Math.max(1, needed / Math.hypot(height, back));
  return { height: height * scale, back: back * scale };
};

