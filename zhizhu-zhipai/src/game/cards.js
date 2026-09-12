// 一张牌就是一个整数 id（0..103），花色和点数都是纯算术算出来的，不查表。
//
// 关键设计：id 里没有「花色」这一维，只有「第几摞十三张」。花色是难度对 id 的一层透镜：
//   suitOf(id, suits) = floor(id / 13) % suits
// 于是同一副 [0..103] 牌，在 1 花色下是同一门 8 张，2 花色下是两门各 4 张，
// 4 花色下是四门各 2 张——三种难度共用一套牌与一套洗牌逻辑，id 还天然唯一，
// 可以直接当 React 的 key（两副牌里的「黑桃 K」是两个不同的 id）。
export const RANKS = 13;
export const CARD_COUNT = 104;
// 花色顺序固定，1/2/4 花色分别取前 1/2/4 门。
export const SUITS = ['♠', '♥', '♣', '♦'];
export const SUIT_NAMES = ['黑桃', '红桃', '梅花', '方块'];
// 红色的是第 1、3 门，正好在 1/2/4 花色下都能保证黑红交替出现。
const RED = new Set([1, 3]);

export const rankOf = (id) => (id % RANKS) + 1;
export const suitOf = (id, suits) => Math.floor(id / RANKS) % suits;
export const isRed = (id, suits) => RED.has(suitOf(id, suits));
export const suitSymbol = (id, suits) => SUITS[suitOf(id, suits)];
export const suitName = (id, suits) => SUIT_NAMES[suitOf(id, suits)];

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankLabel = (id) => RANK_LABELS[id % RANKS];

/** 报读用的整名，无障碍标签就靠它，不然读屏只会念出一堆符号。 */
export const cardLabel = (id, suits) => `${suitName(id, suits)}${rankLabel(id)}`;

/** 一副完整的牌就是 0..103。洗牌交给调用方，这里只负责「有哪些牌」。 */
export const freshDeck = () => Array.from({ length: CARD_COUNT }, (unused, index) => index);

/** 同门且点数正好差一（大的在下），这是蜘蛛纸牌里「能整段搬走」的唯一条件。 */
export const stacksInRun = (lower, upper, suits) =>
  suitOf(lower, suits) === suitOf(upper, suits) && rankOf(lower) === rankOf(upper) + 1;

/** 落点判定比整段判定松：只要点数差一就能放，花色不管。 */
export const canPlaceOn = (target, moving) => rankOf(target) === rankOf(moving) + 1;
