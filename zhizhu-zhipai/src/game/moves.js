// 规则判定全在这里，全是纯函数：入参是牌摞，出参是布尔或下标，不碰状态机也不碰 DOM。
//
// 一摞牌表示成 { cards, down }：cards 是从底到顶的 id，前 down 张是背面朝下的。
// 蜘蛛纸牌里背面牌永远垫在底下，用一个计数比给每张牌挂 faceUp 标记省事得多，
// 翻牌也就退化成 down -= 1。
import { RUN_LENGTH } from './rules.js';
import { canPlaceOn, rankOf, stacksInRun, suitOf } from './cards.js';

export const emptyPile = () => ({ cards: [], down: 0 });
export const pileSize = (pile) => pile.cards.length;
export const isEmpty = (pile) => pile.cards.length === 0;
export const topOf = (pile) => (pile.cards.length ? pile.cards[pile.cards.length - 1] : null);
/** 明牌的起始下标。背面牌都在前面，所以它就是 down。 */
export const faceUpFrom = (pile) => pile.down;
export const faceUpCount = (pile) => pile.cards.length - pile.down;

/**
 * 从 index 到顶端是不是一整段「同门且逐张递减」的牌。
 * 这是能不能整段搬走的唯一判据；只搬一张永远成立（只要它是明牌）。
 */
export function isRun(pile, index, suits) {
  if (index < pile.down || index >= pile.cards.length) return false;
  for (let i = index; i + 1 < pile.cards.length; i += 1) {
    if (!stacksInRun(pile.cards[i], pile.cards[i + 1], suits)) return false;
  }
  return true;
}

/**
 * 顶端那一整段连号同门的起点下标。玩家点顶牌时用它算「顺手能带走多少」，
 * 也是提示和自动移动的搜索起点。
 */
export function runStart(pile, suits) {
  if (isEmpty(pile)) return -1;
  let index = pile.cards.length - 1;
  while (index > pile.down && stacksInRun(pile.cards[index - 1], pile.cards[index], suits)) {
    index -= 1;
  }
  return index;
}

/** 这一摞能不能接住 moving 这张牌：空摞什么都收，否则要点数正好差一。 */
export const canDrop = (pile, moving) =>
  isEmpty(pile) ? true : canPlaceOn(topOf(pile), moving);

/**
 * 把 from 摞从 index 起的那一段，能放到哪些摞上。
 * 返回下标数组，已经排除了原摞自己。
 */
export function targetsFor(piles, from, index, suits) {
  const source = piles[from];
  if (!isRun(source, index, suits)) return [];
  const moving = source.cards[index];
  const targets = [];
  for (let i = 0; i < piles.length; i += 1) {
    if (i === from) continue;
    // 整摞明牌都搬到空位上等于原地打转，没有进展，不给这种落点。
    if (isEmpty(piles[i]) && index === source.down && source.down === 0) continue;
    if (canDrop(piles[i], moving)) targets.push(i);
  }
  return targets;
}

/** 顶端是不是刚好凑出一整门 K→A。凑出来就该被收走。 */
export function completedRun(pile, suits) {
  const size = pile.cards.length;
  if (size - pile.down < RUN_LENGTH) return false;
  const start = size - RUN_LENGTH;
  if (rankOf(pile.cards[start]) !== RUN_LENGTH) return false;
  if (rankOf(pile.cards[size - 1]) !== 1) return false;
  return isRun(pile, start, suits);
}

/** 牌库还能不能发：牌发完了不行，场上有空摞也不行（经典规则）。 */
export const canDeal = (state) =>
  state.stock.length > 0 && state.piles.every((pile) => !isEmpty(pile));

/**
 * 场上还有没有一步能走的合法移动。找得到就把它交出来当提示，
 * 找不到又不能发牌，那这局就是死局了——这两件事同一个函数说清楚。
 *
 * 权重的排序就是蜘蛛纸牌的基本功：腾空一摞 > 翻出背面牌 > 把同门的牌串起来 >
 * 落在实牌上（而不是浪费空位）。最后那条负分很关键：把一张牌挪到另一个异花牌上、
 * 既不翻牌也不腾空，那是纯粹的原地打转，提示给这种走法等于骗人。
 */
export function rankedMoves(piles, suits) {
  const scored = [];
  for (let from = 0; from < piles.length; from += 1) {
    const pile = piles[from];
    if (isEmpty(pile)) continue;
    const start = runStart(pile, suits);
    // 从整段的起点往顶端逐个试：搬得越多越好，但短一点往往才放得下。
    for (let index = start; index < pile.cards.length; index += 1) {
      const moving = pile.cards[index];
      for (const to of targetsFor(piles, from, index, suits)) {
        const target = topOf(piles[to]);
        const moved = pile.cards.length - index;
        const opensDown = index === pile.down && pile.down > 0;
        const emptiesPile = index === 0;
        const onCard = target !== null;
        // 落点和被搬的牌同门，说明这一步在把一门顺子接起来——离收门更近了。
        const buildsRun = onCard && suitOf(target, suits) === suitOf(moving, suits);
        const idle = !emptiesPile && !opensDown && !buildsRun;
        const weight = (emptiesPile ? 400 : 0)
          + (opensDown ? 200 : 0)
          + (buildsRun ? 120 : 0)
          + (onCard ? 50 : 0)
          + moved
          - (idle ? 100 : 0);
        scored.push({ from, to, index, count: moved, weight });
      }
    }
  }
  scored.sort((a, b) => b.weight - a.weight);
  return scored;
}

/** 最值得走的那一步。提示按钮和死局判断都只要这一个。 */
export function findMove(piles, suits) {
  const ranked = rankedMoves(piles, suits);
  return ranked.length > 0 ? ranked[0] : null;
}


