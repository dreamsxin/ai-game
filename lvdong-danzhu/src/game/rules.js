// 数值与判定集中在这里，模拟层只负责按这些规则推进状态。
// 所有坐标都以「格」为单位：场地宽 COLUMNS 格、高 FIELD_ROWS 格，渲染层再换算成像素。
export const COLUMNS = 9;
export const GRID_ROWS = 13;
export const FIELD_ROWS = 16;

export const BALL_RADIUS = 0.3;
export const PADDLE_WIDTH = 2.4;
export const PADDLE_HEIGHT = 0.4;
export const PADDLE_Y = 15;
export const PADDLE_KEY_SPEED = 16;

// 挡板出球/反弹的最大偏角，越靠边角度越斜。
export const MAX_BOUNCE_ANGLE = 1.05;
// 反弹后强制保留的最小竖直分量，避免球卡成纯水平来回弹。
export const MIN_VERTICAL_RATIO = 0.28;
// 同样保留一点横向分量：纯垂直的球会在一条打空的列里无意义地上下弹，永远打不到东西。
export const MIN_HORIZONTAL_RATIO = 0.12;

export const MATCH_MIN = 3;
// 异色撞击只是砸裂，累计到这个次数才碎。
export const ARMOR = 2;

export const LIVES = 3;

export const MARBLE_SCORE = 50;
export const CRACK_SCORE = 10;
export const DROP_SCORE = 80;
export const CHAIN_STEP = 0.5;
export const MAX_CHAIN_MULTIPLIER = 4;
export const GROOVE_STEP = 0.1;
export const MAX_GROOVE_MULTIPLIER = 2;
export const MAX_GROOVE_COMBO = 10;

// 挡板接球时离节拍中心不超过这个秒数就算踩准拍子。
export const BEAT_WINDOW = 0.13;

export const beatPeriod = (bpm) => 60 / Math.max(1, bpm);

// 同一趟飞行里每多消一组，倍率再加 0.5，最高 4 倍。
export const chainMultiplier = (chain) =>
  Math.min(MAX_CHAIN_MULTIPLIER, 1 + Math.max(0, chain - 1) * CHAIN_STEP);

// 连续踩准拍子攒律动，每一拍 +0.1 倍，最高 2 倍。
export const grooveMultiplier = (combo) =>
  Math.min(MAX_GROOVE_MULTIPLIER, 1 + Math.min(Math.max(0, combo), MAX_GROOVE_COMBO) * GROOVE_STEP);

// 一组同色消除的得分：弹珠数 × 连消倍率 × 律动倍率。
export function clearScore(count, chain = 1, combo = 0) {
  if (count <= 0) return 0;
  return Math.floor(count * MARBLE_SCORE * chainMultiplier(chain) * grooveMultiplier(combo));
}

// 断了支撑掉下来的弹珠单独结算，只吃律动倍率。
export function dropScore(count, combo = 0) {
  if (count <= 0) return 0;
  return Math.floor(count * DROP_SCORE * grooveMultiplier(combo));
}

export const crackScore = (combo = 0) => Math.floor(CRACK_SCORE * grooveMultiplier(combo));

// 关卡星级门槛从低到高排列，够到第几档就是几颗星。
export function starsFor(score, thresholds = []) {
  let stars = 0;
  for (const threshold of thresholds) {
    if (score >= threshold) stars += 1;
  }
  return Math.min(3, stars);
}

export const progressRatio = (score, target) =>
  (target > 0 ? Math.min(1, Math.max(0, score / target)) : 1);

// 距离最近节拍的偏差，用来判定挡板接球有没有踩上拍。
export const beatOffset = (beatTimer, period) =>
  Math.min(Math.max(0, beatTimer), Math.max(0, period - beatTimer));

export const onBeat = (beatTimer, period, window = BEAT_WINDOW) =>
  beatOffset(beatTimer, period) <= window;
