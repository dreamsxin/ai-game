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
 *
 * 合法性完全照 Windows 经典蜘蛛纸牌：空摞收任意单张或任意一段同花连续牌，
 * 包括「把一整摞搬进另一个空位」——那一步没有进展，但规则允许，玩家想走就该走得了。
 * 「不推荐没进展的走法」是提示的事，归 rankedMoves 管，不该混进合法性判定里。
 */
export function targetsFor(piles, from, index, suits) {
  const source = piles[from];
  if (!isRun(source, index, suits)) return [];
  const moving = source.cards[index];
  const targets = [];
  for (let i = 0; i < piles.length; i += 1) {
    if (i === from) continue;
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

/**
 * 往 target 上再接 moved 张，是不是正好凑满一门 K→A。
 *
 * 只在「同门且点数衔接」已经成立时调用，所以这里只要数两件事：目标那一段从 K 起，
 * 而且两段加起来正好 13 张。剩下的由调用方那两条保证——搬的那一段本身是同门递减的，
 * 接口又对得上，凑满 13 张就必然一路排到 A。
 */
function completesWith(target, moved, suits) {
  if (isEmpty(target)) return false;
  const start = runStart(target, suits);
  if (target.cards.length - start + moved !== RUN_LENGTH) return false;
  return rankOf(target.cards[start]) === RUN_LENGTH;
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
 *
 * 每一步还带一个 `productive` 标记：这一步到底有没有推进牌局。
 * 权重是**相对**的（一堆废棋里也会有个最高分），`productive` 是**绝对**的——
 * 提示要用它决定该不该改口劝玩家发牌，那件事光看权重排名答不了。
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
        // 把一整摞搬进另一个空位：空摞数没变、没翻出牌、也没接上同门，只是换了个位置。
        // 经典规则允许这么走（targetsFor 照给落点），但提示和双击绝不该推荐它。
        const relocates = emptiesPile && !onCard;
        const idle = !emptiesPile && !opensDown && !buildsRun;
        // 这一步直接凑满一门 K→A。收门是这游戏唯一的得分动作，权重表里必须有它，
        // 不然「接上就能收走」和「随便接一下同门」在提示眼里一样重。
        const completes = buildsRun && completesWith(piles[to], moved, suits);
        const weight = (completes ? 1000 : 0)
          + (emptiesPile ? 400 : 0)
          + (opensDown ? 200 : 0)
          + (buildsRun ? 120 : 0)
          + (onCard ? 50 : 0)
          + moved
          - (idle ? 100 : 0)
          - (relocates ? 1000 : 0);
        // 「有进展」是个比权重严得多的判据，三条各有各的理由：
        // - 腾空一摞只有落在实牌上才算，落进另一个空位是换位置；
        // - 翻出背面牌永远算，那是这游戏唯一的新信息；
        // - 接同门必须从**整段的起点**接。从一段的中间切一截出来接到别处，
        //   拆掉一个同门接头又接上一个，同门连接数一点没变，那也是白走一步。
        const productive = completes
          || (emptiesPile && onCard)
          || opensDown
          || (buildsRun && index === start);
        scored.push({ from, to, index, count: moved, weight, productive });
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

/**
 * 真能推进牌局的那一步，没有就是 null。
 *
 * 和 findMove 的分工是这样的：findMove 答「还动得了吗」（死局判断要的是这个），
 * 这个函数答「还有值得走的吗」。量过一组牌局：照权重一直走下去，四花色下一门都收不到，
 * 因为一堆废棋里总有个最高分，机器人就一直在那儿挪牌。
 * 玩家跟着提示走会踩同一个坑——所以提示必须分得清这两件事。
 */
export function productiveMove(piles, suits) {
  return rankedMoves(piles, suits).find((move) => move.productive) ?? null;
}

/**
 * 这个局面有多「活」：一共能走几步，其中几步是在把同门的牌接起来。
 *
 * 两个数缺一不可。能走的步数只看点数（放牌只比大小，不看花色），所以它跟难度无关；
 * 同门那一栏才是难度敏感的——四花色下「有得走但一步都推进不了收门」是最难受的局面，
 * 光数步数看不出来。发新局筛 seed 就靠这两个数。
 */
export function mobility(piles, suits) {
  const moves = rankedMoves(piles, suits);
  let sameSuit = 0;
  for (const move of moves) {
    const target = topOf(piles[move.to]);
    if (target === null) continue;
    const moving = piles[move.from].cards[move.index];
    if (suitOf(target, suits) === suitOf(moving, suits)) sameSuit += 1;
  }
  return { moves: moves.length, sameSuit };
}



