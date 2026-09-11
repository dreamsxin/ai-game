// 三种格子：普通砖有血量，炸弹砖碎的时候连带炸掉周围一圈，加珠是碰到就吃的补给。
export const KINDS = ['brick', 'bomb', 'plus'];

export const KIND_LABELS = {
  brick: '砖块',
  bomb: '炸弹砖',
  plus: '加珠',
};

export const brick = (hp) => ({ kind: 'brick', hp: Math.max(1, hp) });
export const bomb = (hp) => ({ kind: 'bomb', hp: Math.max(1, hp) });
export const plus = () => ({ kind: 'plus', hp: 1 });

export const kindLabel = (kind) => KIND_LABELS[kind] ?? '';

// 血量决定砖块颜色：越硬越偏红，看一眼就知道要几下。
const HP_COLORS = ['#4de1ff', '#5ce88a', '#ffd447', '#ffb547', '#ff8a5c', '#ff5d7a'];

export function brickColor(hp) {
  const index = Math.min(HP_COLORS.length - 1, Math.max(0, Math.floor(Math.log2(Math.max(1, hp)))));
  return HP_COLORS[index];
}

export const BOMB_COLOR = '#b479ff';
export const PLUS_COLOR = '#5ce88a';
