import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, rankOf } from '../src/game/cards.js';
import {
  DEAL_ROWS,
  FOUNDATION_COUNT,
  OPENING_CARDS,
  PILE_COUNT,
  STOCK_CARDS,
  scoreOf,
  starsFor,
} from '../src/game/rules.js';
import {
  autoMove,
  boardView,
  createGame,
  dealRow,
  dealsLeft,
  hint,
  moveTo,
  restart,
  scoreOfState,
  select,
  undo,
} from '../src/game/simulation.js';

const SPADE = (rank) => rank - 1;
const HEART = (rank) => RANKS + rank - 1;

const fresh = (level = 2, seed = 7) => createGame(level, seed);

// 手搭一个局面：只给想要的几摞，其余补空摞，牌库按需要给。
const staged = (piles, over = {}) => ({
  ...fresh(),
  piles: [
    ...piles.map((pile) => ({ cards: [...pile.cards], down: pile.down ?? 0 })),
    ...Array.from({ length: Math.max(0, PILE_COUNT - piles.length) }, () => ({ cards: [], down: 0 })),
  ],
  stock: [],
  foundations: [],
  moves: 0,
  runs: 0,
  selection: null,
  history: [],
  effects: [],
  ...over,
});

test('开局发 54 张，前四摞 6 张后六摞 5 张，每摞只有顶牌是明牌', () => {
  const game = fresh();
  assert.equal(game.piles.length, PILE_COUNT);
  game.piles.forEach((pile, index) => {
    assert.equal(pile.cards.length, DEAL_ROWS[index]);
    assert.equal(pile.down, DEAL_ROWS[index] - 1, `第 ${index + 1} 摞应该只露一张`);
  });
  const dealt = game.piles.reduce((sum, pile) => sum + pile.cards.length, 0);
  assert.equal(dealt, OPENING_CARDS);
  assert.equal(game.stock.length, STOCK_CARDS);
  assert.equal(dealsLeft(game), STOCK_CARDS / PILE_COUNT);
  // 一张牌都不能重复出现，也不能丢
  const all = [...game.piles.flatMap((pile) => pile.cards), ...game.stock];
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, OPENING_CARDS + STOCK_CARDS);
});

test('同 seed 同难度开出逐字段一致的牌局，重开也一样', () => {
  assert.deepEqual(fresh(2, 99), fresh(2, 99));
  assert.notDeepEqual(fresh(2, 99).piles, fresh(2, 100).piles);
  const game = fresh(1, 5);
  assert.deepEqual(restart(game), game);
});

test('难度决定花色数，三档共用同一套牌', () => {
  assert.equal(createGame(0, 3).suits, 1);
  assert.equal(createGame(1, 3).suits, 2);
  assert.equal(createGame(2, 3).suits, 4);
  // 同一个 seed 下三档的牌序完全一样，只是花色透镜不同
  assert.deepEqual(createGame(0, 3).piles, createGame(2, 3).piles);
});

test('选中和取消选中都留下回执，反馈层才有东西可播', () => {
  const game = staged([{ cards: [SPADE(13), SPADE(12)] }]);
  const picked = select(game, 0);
  assert.deepEqual(picked.selection, { from: 0, index: 0 }, '顶端整段连号会被一起选上');
  assert.equal(picked.effects[0].type, 'select');
  assert.equal(picked.effects[0].count, 2);
  const again = select(picked, 0);
  assert.equal(again.selection, null);
  assert.equal(again.effects[0].type, 'deselect');
});

test('选一段断开的牌只会得到一条 invalid，状态不动', () => {
  const game = staged([{ cards: [SPADE(13), HEART(5)] }]);
  const picked = select(game, 0, 0);
  assert.equal(picked.selection, null);
  assert.equal(picked.effects[0].type, 'invalid');
});

test('搬牌记一步、换新棋盘、并翻开露出来的背面牌', () => {
  const game = staged([
    { cards: [SPADE(9), SPADE(12)], down: 1 },
    { cards: [HEART(13)] },
  ]);
  const moved = moveTo(select(game, 0), 1);
  assert.equal(moved.moves, 1);
  assert.deepEqual(moved.piles[1].cards, [HEART(13), SPADE(12)]);
  assert.deepEqual(moved.piles[0].cards, [SPADE(9)]);
  assert.equal(moved.piles[0].down, 0, '底下那张该翻开了');
  assert.ok(moved.effects.some((effect) => effect.type === 'flip'));
  assert.equal(game.piles[0].cards.length, 2, '原 state 不该被改动');
  assert.equal(moved.history.length, 1);
});

test('放不下的地方只发 invalid，不记步也不进历史', () => {
  const game = staged([{ cards: [SPADE(12)] }, { cards: [SPADE(2)] }]);
  const blocked = moveTo(select(game, 0), 1);
  assert.equal(blocked.moves, 0);
  assert.equal(blocked.history.length, 0);
  assert.equal(blocked.effects[0].type, 'invalid');
});

test('点回原摞等于取消选中', () => {
  const game = staged([{ cards: [SPADE(12)] }, { cards: [SPADE(13)] }]);
  const same = moveTo(select(game, 0), 0);
  assert.equal(same.selection, null);
});

test('凑齐一门就自动收走，并翻开底下的牌', () => {
  // 第 0 摞：一张背面牌 + K..2，第 1 摞放着 A，搬过去正好凑成一门
  const descending = Array.from({ length: RANKS - 1 }, (unused, i) => SPADE(RANKS - i));
  const game = staged([
    { cards: [HEART(7), ...descending], down: 1 },
    { cards: [SPADE(1)] },
  ]);
  const moved = moveTo(select(game, 1), 0);
  assert.equal(moved.runs, 1);
  assert.equal(moved.foundations.length, 1);
  assert.equal(rankOf(moved.foundations[0]), RANKS, '收走的那门该记 K');
  assert.deepEqual(moved.piles[0].cards, [HEART(7)]);
  assert.equal(moved.piles[0].down, 0, '收完门底下的背面牌要翻开');
  assert.ok(moved.effects.some((effect) => effect.type === 'collect'));
});

test('收满八门就赢，分数按步数和门数算', () => {
  const descending = Array.from({ length: RANKS - 1 }, (unused, i) => SPADE(RANKS - i));
  const game = staged([
    { cards: descending },
    { cards: [SPADE(1)] },
  ], { runs: FOUNDATION_COUNT - 1, moves: 40 });
  const won = moveTo(select(game, 1), 0);
  assert.equal(won.status, 'won');
  assert.equal(won.runs, FOUNDATION_COUNT);
  assert.ok(won.effects.some((effect) => effect.type === 'won'));
  assert.equal(scoreOfState(won), scoreOf(41, FOUNDATION_COUNT));
});

test('发牌给十摞各加一张，有空摞时拒绝', () => {
  const filled = Array.from({ length: PILE_COUNT }, () => ({ cards: [SPADE(7)] }));
  const game = staged(filled, { stock: Array.from({ length: PILE_COUNT }, (unused, i) => HEART(i + 1)) });
  const dealt = dealRow(game);
  assert.equal(dealt.stock.length, 0);
  dealt.piles.forEach((pile) => assert.equal(pile.cards.length, 2));
  assert.ok(dealt.effects.some((effect) => effect.type === 'deal'));

  const withHole = staged(filled.slice(0, PILE_COUNT - 1), { stock: [HEART(3)] });
  const refused = dealRow(withHole);
  assert.equal(refused.stock.length, 1);
  assert.equal(refused.effects[0].type, 'invalid');
  assert.equal(refused.effects[0].reason, 'empty-pile');
});

test('撤销把牌局退回上一步，连分数一起退', () => {
  const game = staged([{ cards: [SPADE(9), SPADE(12)], down: 1 }, { cards: [HEART(13)] }]);
  const moved = moveTo(select(game, 0), 1);
  const back = undo(moved);
  assert.equal(back.moves, 0);
  assert.deepEqual(back.piles[0].cards, [SPADE(9), SPADE(12)]);
  assert.equal(back.piles[0].down, 1, '翻开的牌要盖回去');
  assert.deepEqual(back.piles[1].cards, [HEART(13)]);
  assert.equal(back.effects[0].type, 'undo');
  assert.equal(undo(back), back, '没得撤时原样返回');
});

test('双击直接搬到最好的落点，优先落在实牌上而不是占空位', () => {
  const game = staged([
    { cards: [SPADE(12)] },
    { cards: [HEART(13)] },
  ]);
  // 第 2..9 摞是空的，但实牌落点更值钱
  const moved = autoMove(game, 0);
  assert.deepEqual(moved.piles[1].cards, [HEART(13), SPADE(12)]);
});

test('没有落点时双击只出一条 invalid', () => {
  const game = staged([{ cards: [SPADE(13)] }]);
  const stuck = autoMove(game, 0);
  assert.equal(stuck.moves, 0);
  assert.equal(stuck.effects[0].type, 'invalid');
});

test('提示会把建议的那一段顺手选上', () => {
  const game = staged([{ cards: [SPADE(12)] }, { cards: [HEART(13)] }]);
  const { state, move } = hint(game);
  assert.ok(move);
  assert.equal(move.from, 0);
  assert.equal(move.to, 1);
  assert.deepEqual(state.selection, { from: 0, index: 0 });
});

test('渲染视图给出候选落点集合', () => {
  const game = staged([{ cards: [SPADE(12)] }, { cards: [HEART(13)] }, { cards: [SPADE(2)] }]);
  const view = boardView(select(game, 0));
  assert.ok(view.targets.has(1), '红桃 K 收得下黑桃 Q');
  assert.ok(!view.targets.has(2), '黑桃 2 收不下');
});

test('星级按最终分给，满星要求几乎一步不废', () => {
  assert.equal(starsFor(1300), 3);
  assert.equal(starsFor(1000), 2);
  assert.equal(starsFor(600), 1);
  assert.equal(scoreOf(0, 0), 500);
  assert.equal(scoreOf(0, FOUNDATION_COUNT), 1300);
  assert.equal(scoreOf(9999, 0), 0, '分数有底线，不该出现负分');
});
