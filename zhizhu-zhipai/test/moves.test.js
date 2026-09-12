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
  // 整段黑桃 K-Q 无处可去：没有比 K 更大的牌，而它已经是整摞明牌，
  // 搬到空摞等于原地打转（下一条测试专门盯这件事）。
  assert.deepEqual(targetsFor(piles, 0, 0, 4), []);
});

test('把整摞明牌搬到空位不算落点：那是原地打转', () => {
  const piles = [pile([SPADE(13), SPADE(12)]), emptyPile()];
  assert.deepEqual(targetsFor(piles, 0, 0, 4), [], '整摞搬过去没有任何进展');
  // 底下压着背面牌就不一样了：搬走能翻出新牌
  const covered = [pile([SPADE(5), SPADE(13), SPADE(12)], 1), emptyPile()];
  assert.deepEqual(targetsFor(covered, 0, 1, 4), [1]);
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

