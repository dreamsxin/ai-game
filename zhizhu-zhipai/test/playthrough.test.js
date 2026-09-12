import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_COUNT, RANKS } from '../src/game/cards.js';
import { FOUNDATION_COUNT, LEVELS } from '../src/game/rules.js';
import { canDeal, rankedMoves } from '../src/game/moves.js';
import { createGame, dealRow, moveTo, scoreOfState, select } from '../src/game/simulation.js';

// 场上的牌永远是 104 张：摞里的 + 牌库里的 + 已收走的（每门 13 张）。
// 这一条守住了，就说明搬牌、收门、发牌三条路径都没把牌弄丢或弄出重复。
const countCards = (state) =>
  state.piles.reduce((sum, pile) => sum + pile.cards.length, 0)
  + state.stock.length
  + state.runs * RANKS;

const allIds = (state) => [
  ...state.piles.flatMap((pile) => pile.cards),
  ...state.stock,
];

const signature = (state) =>
  `${state.piles.map((pile) => `${pile.down}:${pile.cards.join(',')}`).join('|')}#${state.stock.length}`;

/**
 * 一个「照权重挑一步、避开走过的局面、实在没得搬就发牌」的机器人，用来把整局跑完。
 *
 * 避开重复局面这一步是必须的：纯贪心会把同一张牌在两个等权落点之间来回搬，
 * 一步都推进不了。那是机器人的局限，不是规则的问题。
 */
function playOut(level, seed, limit = 1200) {
  let state = createGame(level, seed);
  const seen = new Set([signature(state)]);
  let steps = 0;
  let deals = 0;
  let ended = 'limit';
  for (; steps < limit; steps += 1) {
    assert.equal(countCards(state), CARD_COUNT, `第 ${steps} 步牌数不对`);
    // 明牌不该有重复 id：id 是 React 的 key，重了会渲染错乱
    const ids = allIds(state);
    assert.equal(new Set(ids).size, ids.length, `第 ${steps} 步出现了重复的牌`);
    if (state.status === 'won') {
      ended = 'won';
      break;
    }
    let advanced = false;
    for (const move of rankedMoves(state.piles, state.suits)) {
      const next = moveTo(select(state, move.from, move.index), move.to);
      // 排出来的走法必须真的能走：走不动就说明 rankedMoves 和 moveTo 判据不一致
      assert.ok(next.moves > state.moves, `第 ${steps} 步排出了一个走不了的动作`);
      const mark = signature(next);
      if (seen.has(mark)) continue;
      seen.add(mark);
      state = next;
      advanced = true;
      break;
    }
    if (advanced) continue;
    if (canDeal(state)) {
      state = dealRow(state);
      deals += 1;
      seen.add(signature(state));
      continue;
    }
    ended = state.status === 'stuck' ? 'stuck' : 'exhausted';
    break;
  }
  return { state, steps, deals, ended };
}

for (const [level, recipe] of LEVELS.entries()) {
  test(`${recipe.suits} 花色（${recipe.name}）连跑 6 局都不崩，牌一张不丢`, () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      // 牌类游戏没有「一定会结束」的规则，机器人跑到步数上限是正常收场之一，
      // 所以这里不断言它必须赢或必须卡死。真正的保证是 playOut 里逐步检查的那两条
      // 不变量（牌数恒为 104、id 不重复），以及下面这些「状态始终自洽」。
      const { state, steps } = playOut(level, seed);
      assert.ok(steps > 0, `${recipe.name} seed ${seed} 一步都没走`);
      assert.equal(countCards(state), CARD_COUNT);
      assert.ok(['playing', 'won', 'stuck'].includes(state.status));
      assert.ok(state.runs >= 0 && state.runs <= FOUNDATION_COUNT);
      assert.equal(state.foundations.length, state.runs, '收门数和记录条数要对得上');
      assert.ok(scoreOfState(state) >= 0, '分数不该出现负数');
      assert.ok(state.moves >= state.runs, '收一门至少得走一步');
    }
  });
}

test('一花色下多数局面都能被机器人收出门来，说明规则确实走得通', () => {
  let scored = 0;
  let bestRuns = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const { state } = playOut(0, seed);
    if (state.runs > 0) scored += 1;
    bestRuns = Math.max(bestRuns, state.runs);
  }
  // 断言的是「这游戏走得通」，不是「机器人多强」：一个只看单步权重、还被步数
  // 上限掐着的机器人赢不了整局很正常，但一花色下它该在多数局里凑出门来。
  // 一门都凑不出就说明规则或判定错了。
  assert.ok(scored >= 6, `12 局里只有 ${scored} 局收到了门`);
  assert.ok(bestRuns >= 2, `最好的一局也只收了 ${bestRuns} 门`);
});



test('牌库发完之后就不能再发了', () => {
  let state = createGame(0, 3);
  let guard = 0;
  while (canDeal(state) && guard < 20) {
    state = dealRow(state);
    guard += 1;
  }
  if (state.stock.length === 0) {
    const refused = dealRow(state);
    assert.equal(refused.effects[0].type, 'invalid');
    assert.equal(refused.stock.length, 0);
  }
  assert.equal(countCards(state), CARD_COUNT);
});
