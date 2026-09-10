// 数值与判定集中在这里，模拟层只负责按这些规则推进状态。
export const LOCK_DELAY = 0.5;
export const MAX_LOCK_RESETS = 15;
export const SOFT_DROP_FACTOR = 20;
export const REPEAT_DELAY = 0.17;
export const REPEAT_RATE = 0.045;
export const LINES_PER_LEVEL = 10;
export const MAX_LEVEL = 15;

// 每级下落一格所需秒数，越高级越快，15 级后不再加速。
const GRAVITY_TABLE = [
  0.8, 0.72, 0.63, 0.55, 0.47, 0.38, 0.3, 0.22, 0.17, 0.13, 0.1, 0.08, 0.07, 0.06, 0.05,
];

export const levelFor = (lines) =>
  Math.min(MAX_LEVEL, Math.floor(lines / LINES_PER_LEVEL) + 1);

export const gravityInterval = (level) =>
  GRAVITY_TABLE[Math.min(GRAVITY_TABLE.length, Math.max(1, level)) - 1];

export const linesToNextLevel = (lines) =>
  (levelFor(lines) >= MAX_LEVEL ? 0 : LINES_PER_LEVEL - (lines % LINES_PER_LEVEL));

const LINE_SCORES = [0, 100, 300, 500, 800];
// 按消行数索引，0 号位（转身不消行）用不到，因为 count <= 0 会提前返回。
const TSPIN_SCORES = [400, 800, 1200, 1600];


// 消行得分：T-spin 与 Tetris 连续触发时享受 1.5 倍 back-to-back。
export function lineScore(count, level, { tspin = false, backToBack = false } = {}) {
  if (count <= 0) return 0;
  const base = tspin ? TSPIN_SCORES[Math.min(count, 3)] : LINE_SCORES[Math.min(count, 4)];
  const bonus = backToBack && (tspin || count === 4) ? 1.5 : 1;
  return Math.floor(base * level * bonus);
}

export const comboScore = (combo, level) => (combo > 0 ? 50 * combo * level : 0);

export const dropScore = (cells, hard) => cells * (hard ? 2 : 1);

// 消 4 行或 T-spin 才算“困难消行”，它决定 back-to-back 是否延续。
export const isDifficultClear = (count, tspin) => count === 4 || (tspin && count > 0);

export const resultStars = (score) => {
  if (score >= 60000) return 3;
  if (score >= 25000) return 2;
  if (score >= 8000) return 1;
  return 0;
};
