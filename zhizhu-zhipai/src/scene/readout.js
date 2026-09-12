// HUD 文案全部在这里派生，React 组件只负责摆放。
import { FOUNDATION_COUNT, LEVELS, LEVEL_COUNT, PILE_COUNT, clampLevel, levelRecipe } from '../game/rules.js';
import { rankLabel, suitSymbol } from '../game/cards.js';

export const levelName = (index) => LEVELS[clampLevel(index)].name;
export const levelDetail = (index) => LEVELS[clampLevel(index)].detail;
export const levelLabel = (index) => `${levelRecipe(index).suits} 花色 · ${levelName(index)}`;

export const formatScore = (score) => Math.max(0, Math.floor(score)).toLocaleString('zh-CN');

export const movesLabel = (moves) => `${moves} 步`;

// 收了几门要带分母，玩家才知道离赢还有多远。
export const runsLabel = (runs) => `${runs} / ${FOUNDATION_COUNT} 门`;

export const dealsLabel = (left) => (left > 0 ? `还能发 ${left} 轮` : '牌库已空');

export const statusLabel = (status) => {
  if (status === 'won') return '八门收齐';
  if (status === 'stuck') return '走不动了';
  return '牌局进行中';
};

// 先把星数夹到 0~3，否则负数会多画出一颗空星。
export const starLabel = (stars) => {
  const filled = Math.max(0, Math.min(3, stars));
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
};

export const cardFace = (id, suits) => `${rankLabel(id)}${suitSymbol(id, suits)}`;

/** 一次动作只出一条提示，取最有信息量的那条。 */
export function effectMessage(effects, state) {
  if (effects.some((effect) => effect.type === 'won')) return null;
  if (effects.some((effect) => effect.type === 'stuck')) return '没有可走的一步了，撤销或者重开';
  const collected = effects.filter((effect) => effect.type === 'collect').length;
  if (collected > 1) return `一次收走 ${collected} 门`;
  if (collected === 1) return '收走一门，加 100 分';
  if (effects.some((effect) => effect.type === 'flip')) return '翻开一张新牌';
  const invalid = effects.find((effect) => effect.type === 'invalid');
  if (invalid) {
    if (invalid.reason === 'empty-pile') return `有空摞时不能发牌，先把 ${PILE_COUNT} 摞都填上`;
    if (invalid.reason === 'no-stock') return '牌库已经发完了';
    return '这里放不下：只能压在大一点的牌上';
  }
  if (effects.some((effect) => effect.type === 'deal')) return '又发下来一轮';
  if (effects.some((effect) => effect.type === 'undo')) return '已撤回一步';
  return null;
}

export const undoLabel = (count) => (count > 0 ? `撤销 ${count}` : '撤销');

export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

/** 通关点评按星数给，一星也不说难听话。 */
export const rewardLabel = (stars) => {
  if (stars >= 3) return '几乎一步没废';
  if (stars === 2) return '再省几十步就是满星';
  return '收齐就是本事，下次少走弯路';
};

export const bestLabel = (best) => (best > 0 ? `最佳 ${formatScore(best)}` : '还没有成绩');

// 提示按钮的文案：给不出答案时也要说清是为什么。
export function hintLabel(move, canDealNow) {
  if (move) {
    const from = move.from + 1;
    const to = move.to + 1;
    return move.count > 1
      ? `把第 ${from} 摞的 ${move.count} 张搬到第 ${to} 摞`
      : `把第 ${from} 摞顶牌搬到第 ${to} 摞`;
  }
  return canDealNow ? '场上没得搬了，发一轮新牌' : '这局走不动了，撤销或者重开';
}

// 新手引导：四步讲完，多一步都会被跳过。
export const TUTORIAL_STEPS = [
  { title: '目标', detail: `凑出 8 门从 K 到 A 的同花顺子，收齐 ${FOUNDATION_COUNT} 门就赢。` },
  { title: '搬牌', detail: '点一摞选中顶端那一段，再点目标摞放下。只能压在比它大一点的牌上，花色不限。' },
  { title: '整段', detail: '同花且逐张递减的一段能整段搬走，所以尽量把同花的牌串起来。' },
  { title: '发牌', detail: '实在没得搬就发一轮新牌，但十摞里有空摞时不许发——先把空位填上。' },
];

export const LEVEL_OPTIONS = Array.from({ length: LEVEL_COUNT }, (unused, index) => ({
  index,
  suits: levelRecipe(index).suits,
  name: levelName(index),
  detail: levelDetail(index),
}));
