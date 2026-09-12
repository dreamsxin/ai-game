import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKS } from '../src/game/cards.js';
import {
  canDeal,
  completedRun,
  emptyPile,
  findMove,
  isEmpty,
  isRun,
  mobility,
  productiveMove,
  rankedMoves,
  runStart,
  targetsFor,
  topOf,
} from '../src/game/moves.js';

// 4 花色下 id 的含义：0..12 黑桃 A..K，13..25 红桃 A..K，26..38 梅花，39..51 方块，
// 52..103 是第二副（同样的排布）。下面直接用 id 拼出想要的局面。
const SPADE = (rank) => rank - 1;
const HEART = (rank) => RANKS + rank - 1;
const CLUB = (rank) => RANKS * 2 + rank - 1;

const pile = (cards, down = 0) => ({ cards, down });

test('空摞的基本查询不抛错', () => {
  const empty = emptyPile();
  assert.equal(isEmpty(empty), true);
  assert.equal(topOf(empty), null);
  assert.equal(runStart(empty, 4), -1);
  assert.equal(isRun(empty, 0, 4), false);
});

test('整段判定：同门递减才算，中间断一张就不算', () => {
  const run = pile([SPADE(13), SPADE(12), SPADE(11)]);
  assert.equal(isRun(run, 0, 4), true);
  assert.equal(isRun(run, 2, 4), true, '只有顶牌一张永远算整段');
  const broken = pile([SPADE(13), HEART(12), SPADE(11)]);
  assert.equal(isRun(broken, 0, 4), false);
  assert.equal(isRun(broken, 1, 4), false, '红桃 Q 接黑桃 J 也不同门');
  assert.equal(isRun(broken, 2, 4), true);
});

test('背面牌不能当整段的起点', () => {
  const covered = pile([SPADE(13), SPADE(12), SPADE(11)], 1);
  assert.equal(isRun(covered, 0, 4), false, '第 0 张是背面');
  assert.equal(isRun(covered, 1, 4), true);
  assert.equal(runStart(covered, 4), 1, '整段最多回退到明牌区的头一张');
});

test('1 花色下所有牌同门，整段判定只剩点数', () => {
  const run = pile([SPADE(13), HEART(12), CLUB(11)]);
  assert.equal(isRun(run, 0, 1), true, '一门难度下这三张就是同门递减');
  assert.equal(isRun(run, 0, 4), false, '四门难度下它们是三个花色');
});

test('落点：空摞什么都收，实牌只收小一点的', () => {
  const piles = [
    pile([SPADE(13), SPADE(12)]),
    pile([HEART(13)]),
    emptyPile(),
    pile([SPADE(2)]),
  ];
  // 把第 0 摞的黑桃 Q（下标 1）搬走：红桃 K 收得下，黑桃 2 收不下，空摞收得下
  assert.deepEqual(targetsFor(piles, 0, 1, 4), [1, 2]);
  // 整段黑桃 K-Q 只有空摞收得下：没有比 K 更大的牌。
  // 这一步没有进展，但经典规则允许，落点照给——不推荐是提示的事。
  assert.deepEqual(targetsFor(piles, 0, 0, 4), [2]);
});

test('整摞搬进空位是合法的，但提示永远不推荐', () => {
  const piles = [pile([SPADE(13), SPADE(12)]), emptyPile()];
  assert.deepEqual(targetsFor(piles, 0, 0, 4), [1], '经典规则里空列收任意合法一段');
  // 唯一的走法也得给出来，不然玩家会以为游戏卡了；但它的权重必须是负的。
  const only = findMove(piles, 4);
  assert.deepEqual({ from: only.from, to: only.to }, { from: 0, to: 1 });
  assert.ok(only.weight < 0, '换个位置而已，权重不该是正的');

  // 有别的走法时，换位置那一步必须排在最后。
  const better = [pile([SPADE(13), SPADE(12)]), emptyPile(), pile([HEART(13)])];
  const ranked = rankedMoves(better, 4);
  assert.deepEqual({ from: ranked[0].from, to: ranked[0].to }, { from: 0, to: 2 }, '接到红桃 K 上更值');
  assert.equal(ranked[ranked.length - 1].to, 1, '搬进空位垫底');

  // 底下压着背面牌就完全不一样了：搬走能翻出新牌，这是实打实的进展。
  const covered = [pile([SPADE(5), SPADE(13), SPADE(12)], 1), emptyPile()];
  assert.deepEqual(targetsFor(covered, 0, 1, 4), [1]);
  assert.ok(findMove(covered, 4).weight > 0);
});


test('断开的一段根本没有落点', () => {
  const piles = [pile([SPADE(13), HEART(12)]), pile([CLUB(13)])];
  assert.deepEqual(targetsFor(piles, 0, 0, 4), [], '这一段本身就不合法');
});

test('凑齐 K 到 A 才算一门，差一张都不算', () => {
  const full = pile(Array.from({ length: RANKS }, (unused, i) => SPADE(RANKS - i)));
  assert.equal(full.cards.length, RANKS);
  assert.equal(completedRun(full, 4), true);
  const short = pile(full.cards.slice(1));
  assert.equal(completedRun(short, 4), false, '少了 K 就不是一整门');
  // 花色混了也不算
  const mixed = pile([...full.cards.slice(0, RANKS - 1), HEART(1)]);
  assert.equal(completedRun(mixed, 4), false);
  // 背面牌盖着的部分不能算进这一门
  const buried = pile(full.cards, 1);
  assert.equal(completedRun(buried, 4), false, '整门里有背面牌就不该被收走');
});

test('收门那一步权重最高：收门是这游戏唯一的得分动作', () => {
  // 第 0 摞已经是黑桃 K→2 的十二张，第 1 摞就剩一张黑桃 A。
  const target = Array.from({ length: RANKS - 1 }, (unused, i) => SPADE(RANKS - i));
  const piles = [pile(target), pile([SPADE(1)])];
  const ranked = rankedMoves(piles, 4);
  const best = ranked[0];
  assert.deepEqual({ from: best.from, to: best.to }, { from: 1, to: 0 });
  assert.equal(best.productive, true);
  assert.ok(best.weight > 1000, '凑满一门的权重该甩开所有别的走法');
  // 差一张 K 的时候，A 照样接得上那个 2——但那一步收不了门，
  // 所以权重里不该有那 1000 分。「接上同门」和「凑满一门」是两件事。
  const short = rankedMoves([pile(target.slice(1)), pile([SPADE(1)])], 4);
  assert.equal(short.length, 1, 'A 还是压得到 2 上');
  assert.ok(short[0].weight < 1000, '没收到门就不该拿收门的分');
});

test('从一段的中间切一截出来接同门，不算有进展', () => {
  // 第 0 摞是 红5 / 黑8-黑7-黑6：整段的起点在下标 1。
  // 把下标 2 那截（黑7-黑6）搬到另一张黑8 上，拆掉一个同门接头又接上一个，
  // 同门连接数一点没变——合法，但白走一步。
  const piles = [
    pile([HEART(5), SPADE(8), SPADE(7), SPADE(6)]),
    pile([SPADE(8) + RANKS * 4]),      // 第二副牌里的黑桃 8
    pile([SPADE(2)]),
    pile([SPADE(2) + RANKS * 4]),
  ];
  assert.equal(runStart(piles[0], 4), 1, '整段从黑桃 8 起');
  const ranked = rankedMoves(piles, 4);
  assert.equal(ranked.length, 1, '这个局面只有一步可走');
  assert.deepEqual({ from: ranked[0].from, to: ranked[0].to, index: ranked[0].index },
    { from: 0, to: 1, index: 2 });
  assert.equal(ranked[0].productive, false, '同门接头一进一出，净变化是零');
  assert.equal(productiveMove(piles, 4), null);
});

test('productiveMove 和 findMove 分工不同：一个答「值得走吗」，一个答「还动得了吗」', () => {
  // 黑桃 K-Q 摆着，唯一能接的是红桃 K（异花），另有一个空位（占了也白占）。
  const piles = [pile([SPADE(13), SPADE(12)]), emptyPile(), pile([HEART(13)])];
  assert.ok(findMove(piles, 4), '有合法走法，所以不是死局');
  assert.equal(productiveMove(piles, 4), null, '但一步有进展的都没有');

  // 底下压着背面牌就完全不一样了：搬走能翻出新牌。
  const covered = [pile([SPADE(5), SPADE(13), SPADE(12)], 1), emptyPile()];
  const move = productiveMove(covered, 4);
  assert.ok(move, '翻出背面牌永远算进展');
  assert.equal(move.productive, true);
  assert.equal(move.index, 1, '搬走明牌那一段才翻得出底下那张');
});

test('发牌要求牌库有牌且场上没有空摞', () => {
  const filled = Array.from({ length: 10 }, () => pile([SPADE(5)]));
  assert.equal(canDeal({ piles: filled, stock: [1] }), true);
  assert.equal(canDeal({ piles: filled, stock: [] }), false, '牌库空了不能发');
  const withHole = [...filled.slice(0, 9), emptyPile()];
  assert.equal(canDeal({ piles: withHole, stock: [1] }), false, '有空摞不能发');
});

test('提示优先给「能腾空一摞」的走法', () => {
  const piles = [
    pile([SPADE(12)]),              // 整摞一张，搬走就空了
    pile([SPADE(13)]),              // 能收 Q
    pile([SPADE(4), SPADE(3)], 1),  // 也有一步可走，但只是翻牌
    pile([SPADE(5)]),
    emptyPile(),
  ];
  const move = findMove(piles, 4);
  assert.ok(move);
  assert.equal(move.from, 0, '腾空第 0 摞的权重最高');
  assert.equal(move.to, 1);
});

test('一步都走不了时提示给 null，死局判断就靠它', () => {
  // 十摞都是同点数、又没有空摞：谁也压不上谁
  const piles = Array.from({ length: 10 }, (unused, i) => pile([SPADE(7) + i * 0]));
  assert.equal(findMove(piles, 4), null);
});

test('mobility 分开数「能走几步」和「几步在接同门」', () => {
  // 黑桃 8 能压黑桃 9 也能压红桃 9，两步都合法，但只有前一步在接同门。
  const piles = [
    pile([SPADE(8)]),
    pile([SPADE(9)]),
    pile([HEART(9)]),
    ...Array.from({ length: 7 }, () => pile([SPADE(2)])),
  ];
  assert.deepEqual(mobility(piles, 4), { moves: 2, sameSuit: 1 });
  // 1 花色下这两个 9 就是同一门了，同门那一栏跟着变——难度就体现在这一栏上。
  assert.deepEqual(mobility(piles, 1), { moves: 2, sameSuit: 2 });
});

test('死局的 mobility 是两个 0', () => {
  const piles = Array.from({ length: 10 }, () => pile([SPADE(7)]));
  assert.deepEqual(mobility(piles, 4), { moves: 0, sameSuit: 0 });
});

