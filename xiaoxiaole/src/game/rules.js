// 数值与判定集中在这里，模拟层只负责按这些规则推进状态。
export const COLUMNS = 8;
export const ROWS = 8;

// 各阶段时长：交换、消除闪光、下落补充、洗盘，单位秒。
export const SWAP_TIME = 0.12;
export const REJECT_TIME = 0.18;
export const CLEAR_TIME = 0.2;
export const FALL_TIME = 0.16;
export const SHUFFLE_TIME = 0.45;

export const TILE_SCORE = 60;
export const CHAIN_STEP = 0.5;
export const MAX_CHAIN_MULTIPLIER = 4;

export const SPECIAL_BONUS = {
  row: 120,
  col: 120,
  bomb: 180,
  rainbow: 300,
};

// 连锁倍率：第一次消除 1 倍，之后每一环 +0.5，最高 4 倍。
export const chainMultiplier = (chain) =>
  Math.min(MAX_CHAIN_MULTIPLIER, 1 + Math.max(0, chain - 1) * CHAIN_STEP);

// 一次消除的得分：果实数按连锁倍率放大，触发的特殊果实各自再加固定奖励。
export function clearScore(count, chain = 1, specials = []) {
  if (count <= 0) return 0;
  const base = count * TILE_SCORE * chainMultiplier(chain);
  const bonus = specials.reduce((sum, special) => sum + (SPECIAL_BONUS[special] ?? 0), 0);
  return Math.floor(base + bonus);
}

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
