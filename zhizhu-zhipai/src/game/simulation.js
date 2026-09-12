// 回合制状态机。所有动作都是纯函数：吃一份状态，吐一份新状态，绝不原地改。
// 每次推进都会带一串 effects——表现层（音效、震动、提示条）只认这一个出口。
import { freshDeck } from './cards.js';
import { createRandom } from './random.js';
import {
  DEAL_ROWS,
  FOUNDATION_COUNT,
  HISTORY_LIMIT,
  PILE_COUNT,
  RUN_LENGTH,
  levelRecipe,
  scoreOf,
  starsFor,
} from './rules.js';
import {
  canDeal,
  completedRun,
  emptyPile,
  findMove,
  isEmpty,
  isRun,
  runStart,
  targetsFor,
  topOf,
} from './moves.js';

const clonePile = (pile) => ({ cards: [...pile.cards], down: pile.down });
const clonePiles = (piles) => piles.map(clonePile);

/** 只存能改回去的那几样，牌局其余部分都是从它们派生的。 */
const snapshot = (state) => ({
  piles: clonePiles(state.piles),
  stock: [...state.stock],
  foundations: [...state.foundations],
  moves: state.moves,
  runs: state.runs,
});

const commit = (state, patch, effects = []) => ({
  ...state,
  ...patch,
  effects,
  tick: state.tick + 1,
});

export function createGame(levelIndex = 0, seed = 1) {
  const recipe = levelRecipe(levelIndex);
  const rng = createRandom(seed);
  const deck = rng.shuffle(freshDeck());
  const piles = Array.from({ length: PILE_COUNT }, emptyPile);
  let cursor = 0;
  for (let i = 0; i < PILE_COUNT; i += 1) {
    const count = DEAL_ROWS[i];
    piles[i].cards = deck.slice(cursor, cursor + count);
    // 只有最顶上那张是明牌，其余全背面。
    piles[i].down = count - 1;
    cursor += count;
  }
  return {
    seed,
    levelIndex,
    suits: recipe.suits,
    status: 'playing',
    piles,
    stock: deck.slice(cursor),
    foundations: [],
    moves: 0,
    runs: 0,
    selection: null,
    history: [],
    effects: [],
    tick: 0,
  };
}

export const restart = (state) => createGame(state.levelIndex, state.seed);
export const scoreOfState = (state) => scoreOf(state.moves, state.runs);
export const starsOfState = (state) => starsFor(scoreOfState(state));
export const dealsLeft = (state) => Math.ceil(state.stock.length / PILE_COUNT);

/**
 * 一次移动之后的收尾：收走凑成的整门、翻开露出来的背面牌、判赢、判死局。
 * 收走一门可能让下面又露出一整门，所以要循环收到收不动为止。
 */
function settle(state, piles, effects) {
  let collected = 0;
  let flipped = 0;
  let again = true;
  const foundations = [...state.foundations];
  while (again) {
    again = false;
    for (let i = 0; i < piles.length; i += 1) {
      if (!completedRun(piles[i], state.suits)) continue;
      const size = piles[i].cards.length;
      const run = piles[i].cards.slice(size - RUN_LENGTH);
      piles[i].cards = piles[i].cards.slice(0, size - RUN_LENGTH);
      // 收走整门后底下可能只剩背面牌，照样要翻一张出来。
      if (piles[i].cards.length > 0 && piles[i].down >= piles[i].cards.length) {
        piles[i].down = piles[i].cards.length - 1;
        flipped += 1;
      }
      foundations.push(run[0]);
      collected += 1;
      effects.push({ type: 'collect', pile: i, card: run[0] });
      again = true;
    }
  }
  if (flipped > 0) effects.push({ type: 'flip', count: flipped });
  const runs = state.runs + collected;
  if (runs >= FOUNDATION_COUNT) {
    effects.push({ type: 'won' });
    return { piles, foundations, runs, status: 'won' };
  }
  // 死局：一步都走不了，牌库也发不动。这时候只能撤销或重开，得明说。
  const stuck = !findMove(piles, state.suits)
    && !canDeal({ ...state, piles, stock: state.stock });
  if (stuck) effects.push({ type: 'stuck' });
  return { piles, foundations, runs, status: stuck ? 'stuck' : 'playing' };
}

/** 选中某摞从 index 起的一段。index 省略时取顶端那一整段连号。 */
export function select(state, from, index = null) {
  if (state.status === 'won') return state;
  const pile = state.piles[from];
  if (!pile || isEmpty(pile)) return state;
  const at = index === null ? runStart(pile, state.suits) : index;
  if (!isRun(pile, at, state.suits)) {
    return commit(state, {}, [{ type: 'invalid', pile: from }]);
  }
  if (state.selection && state.selection.from === from && state.selection.index === at) {
    return commit(state, { selection: null }, [{ type: 'deselect' }]);
  }
  return commit(state, { selection: { from, index: at } }, [
    { type: 'select', from, index: at, count: pile.cards.length - at },
  ]);
}

export const clearSelection = (state) =>
  (state.selection ? commit(state, { selection: null }, [{ type: 'deselect' }]) : state);

/** 把当前选中的那一段搬到 to 摞。落不下就发一条 invalid，不改状态。 */
export function moveTo(state, to) {
  if (state.status === 'won' || !state.selection) return state;
  const { from, index } = state.selection;
  if (from === to) return clearSelection(state);
  if (!targetsFor(state.piles, from, index, state.suits).includes(to)) {
    return commit(state, {}, [{ type: 'invalid', pile: to }]);
  }
  const history = [...state.history, snapshot(state)].slice(-HISTORY_LIMIT);
  const piles = clonePiles(state.piles);
  const moving = piles[from].cards.splice(index);
  piles[to].cards.push(...moving);
  const effects = [{ type: 'move', from, to, count: moving.length }];
  // 搬走后原摞露出背面牌就翻开，这是蜘蛛纸牌里唯一的「进展」信号。
  if (piles[from].cards.length > 0 && piles[from].down >= piles[from].cards.length) {
    piles[from].down = piles[from].cards.length - 1;
    effects.push({ type: 'flip', count: 1 });
  }
  const settled = settle({ ...state, piles }, piles, effects);
  return commit(state, { ...settled, moves: state.moves + 1, selection: null, history }, effects);
}

/** 双击的那条路：直接搬到权重最高的落点，省掉「再点一次目标」。 */
export function autoMove(state, from, index = null) {
  if (state.status === 'won') return state;
  const pile = state.piles[from];
  if (!pile || isEmpty(pile)) return state;
  const at = index === null ? runStart(pile, state.suits) : index;
  if (!isRun(pile, at, state.suits)) return commit(state, {}, [{ type: 'invalid', pile: from }]);
  const targets = targetsFor(state.piles, from, at, state.suits);
  if (targets.length === 0) return commit(state, {}, [{ type: 'invalid', pile: from }]);
  // 优先落在实牌上：空位是稀缺资源，能不占就不占。
  const best = targets.find((to) => !isEmpty(state.piles[to])) ?? targets[0];
  return moveTo({ ...state, selection: { from, index: at } }, best);
}

/** 发一轮：十摞各加一张明牌。有空摞时不许发，这是经典规则。 */
export function dealRow(state) {
  if (state.status === 'won') return state;
  if (!canDeal(state)) {
    return commit(state, {}, [{ type: 'invalid', reason: state.stock.length ? 'empty-pile' : 'no-stock' }]);
  }
  const history = [...state.history, snapshot(state)].slice(-HISTORY_LIMIT);
  const piles = clonePiles(state.piles);
  const stock = [...state.stock];
  for (let i = 0; i < PILE_COUNT; i += 1) piles[i].cards.push(stock.shift());
  const effects = [{ type: 'deal', count: PILE_COUNT }];
  const settled = settle({ ...state, piles, stock }, piles, effects);
  return commit(state, { ...settled, stock, selection: null, history }, effects);
}

export function undo(state) {
  if (state.history.length === 0) return state;
  const history = [...state.history];
  const previous = history.pop();
  return commit(
    state,
    { ...previous, history, selection: null, status: 'playing' },
    [{ type: 'undo' }],
  );
}

/** 提示：把 findMove 的结果原样交出去，并顺手把那一段选中。 */
export function hint(state) {
  if (state.status === 'won') return { state, move: null };
  const move = findMove(state.piles, state.suits);
  if (!move) return { state, move: null };
  return { state: select(state, move.from, move.index), move };
}

/** 派生给渲染层：每摞的明牌起点、是否被选中、可落点集合。 */
export function boardView(state) {
  const targets = state.selection
    ? targetsFor(state.piles, state.selection.from, state.selection.index, state.suits)
    : [];
  return {
    targets: new Set(targets),
    selection: state.selection,
    top: state.piles.map(topOf),
  };
}
