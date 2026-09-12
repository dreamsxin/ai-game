// 回合制状态机。所有动作都是纯函数：吃一份状态，吐一份新状态，绝不原地改。
// 每次推进都会带一串 effects——表现层（音效、震动、提示条）只认这一个出口。
import { CARD_COUNT, freshDeck } from './cards.js';
import { createRandom } from './random.js';
import {
  DEAL_ROWS,
  FOUNDATION_COUNT,
  HISTORY_LIMIT,
  PILE_COUNT,
  RUN_LENGTH,
  clampLevel,
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
  mobility,
  productiveMove,
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

// 筛 seed 最多试这么多个。达标率量过是八成上下，实际一两个就中了，
// 40 只是个兜底上限——绝不能为了「完美牌局」让玩家点一下等半秒。
export const SEED_TRIES = 40;

/**
 * 这个 seed 开出来的局好不好。达标就直接用，不达标时 score 用来挑「最不坏」的那个。
 *
 * 注意 createGame 本身不筛：restart 和存档都靠「同 seed 开出同一局」这条，
 * 筛选只发生在**挑 seed** 的时候。
 */
export function dealRating(levelIndex, seed) {
  const game = createGame(levelIndex, seed);
  const { moves, sameSuit } = mobility(game.piles, game.suits);
  const recipe = levelRecipe(levelIndex);
  return {
    moves,
    sameSuit,
    ok: moves >= recipe.minMoves && sameSuit >= recipe.minSameSuit,
    // 挑「最不坏」时同门走法更值钱：它才是真能往收门推进的一步。
    score: sameSuit * 10 + moves,
  };
}

/**
 * 给新局挑一个 seed。蜘蛛纸牌最伤人的体验是「牌摆在那儿就没得走」，
 * 随机发牌里约一成开局能走的步数少得可怜，四花色下还有近两成一步同门的都没有，
 * 玩家碰上这种局只会以为是自己看漏了。
 *
 * 从 seed 起往后逐个试，第一个达标的就用；全都不达标就用最不坏的那个——
 * 玩家点了「换一局」必须拿到一局，宁可牌差点也不能卡在这儿。
 */
export function pickSeed(levelIndex, seed, tries = SEED_TRIES) {
  let best = seed;
  let bestScore = -1;
  for (let i = 0; i < tries; i += 1) {
    const candidate = seed + i;
    const rating = dealRating(levelIndex, candidate);
    if (rating.ok) return candidate;
    if (rating.score > bestScore) {
      bestScore = rating.score;
      best = candidate;
    }
  }
  return best;
}

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

/**
 * 提示：把建议的一步交出去，并顺手把那一段选中。
 *
 * `productive` 是这里最要紧的一个字段。以前提示只会给「权重最高的一步」，
 * 但一堆废棋里也总有个最高分——量过一组牌局，照这个建议一直走下去四花色下一门都收不到，
 * 机器人全程在原地挪牌。玩家跟着走会踩同一个坑，所以提示必须说实话：
 * 这一步只是挪个位置，还是真在推进牌局。文案怎么改口是 readout 的事。
 */
export function hint(state) {
  if (state.status === 'won') return { state, move: null, productive: false };
  const move = productiveMove(state.piles, state.suits) ?? findMove(state.piles, state.suits);
  if (!move) return { state, move: null, productive: false };
  // 只有真值得走的一步才顺手选上。劝玩家发牌的同时又把一段废棋高亮起来，是自相矛盾的。
  if (!move.productive) return { state, move, productive: false };
  return { state: select(state, move.from, move.index), move, productive: true };
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

// 存档格式版本号。牌局结构一变就往上加一，旧存档直接丢掉当新局开，
// 绝不能拿一份对不上的存档去渲染——那会白屏，比丢一局严重得多。
export const SAVE_VERSION = 1;

/** 只存能还原牌局的那几样。selection 和 effects 是瞬时的，不进存档。 */
export const serialize = (state) => ({
  v: SAVE_VERSION,
  seed: state.seed,
  levelIndex: state.levelIndex,
  status: state.status,
  piles: state.piles.map((pile) => ({ c: pile.cards, d: pile.down })),
  stock: state.stock,
  foundations: state.foundations,
  moves: state.moves,
  runs: state.runs,
  // 历史存最近 12 步就够了：存满 60 步会让存档大到几十 KB，而玩家实际只会撤几步。
  history: state.history.slice(-12).map((snap) => ({
    piles: snap.piles.map((pile) => ({ c: pile.cards, d: pile.down })),
    stock: snap.stock,
    foundations: snap.foundations,
    moves: snap.moves,
    runs: snap.runs,
  })),
});

const validPile = (pile) =>
  Boolean(pile)
  && Array.isArray(pile.c)
  && Number.isInteger(pile.d)
  && pile.d >= 0
  && pile.d <= pile.c.length
  && pile.c.every((id) => Number.isInteger(id) && id >= 0 && id < CARD_COUNT);

const readPiles = (piles) => piles.map((pile) => ({ cards: [...pile.c], down: pile.d }));

/**
 * 从存档还原一局。任何一处对不上就返回 null，让调用方开新局。
 *
 * 校验的核心是「牌数守恒」：摞里的 + 牌库里的 + 已收门×13 必须正好 104，而且不能有重复 id。
 * 存档是唯一会被外部改坏的输入（玩家可以手改 localStorage），这一关必须自己把住。
 */
export function restore(raw) {
  if (!raw || raw.v !== SAVE_VERSION) return null;
  if (!Array.isArray(raw.piles) || raw.piles.length !== PILE_COUNT) return null;
  if (!raw.piles.every(validPile)) return null;
  if (!Array.isArray(raw.stock) || !Array.isArray(raw.foundations)) return null;
  if (!Number.isInteger(raw.moves) || raw.moves < 0) return null;
  if (!Number.isInteger(raw.runs) || raw.runs < 0 || raw.runs > FOUNDATION_COUNT) return null;

  const piles = readPiles(raw.piles);
  const stock = [...raw.stock];
  const onBoard = [...piles.flatMap((pile) => pile.cards), ...stock];
  if (onBoard.length + raw.runs * RUN_LENGTH !== CARD_COUNT) return null;
  if (new Set(onBoard).size !== onBoard.length) return null;
  if (raw.foundations.length !== raw.runs) return null;

  const recipe = levelRecipe(raw.levelIndex);
  const history = Array.isArray(raw.history)
    ? raw.history.filter((snap) => Array.isArray(snap?.piles) && snap.piles.every(validPile)).map((snap) => ({
      piles: readPiles(snap.piles),
      stock: [...snap.stock],
      foundations: [...snap.foundations],
      moves: snap.moves,
      runs: snap.runs,
    }))
    : [];

  return {
    seed: raw.seed ?? 1,
    levelIndex: clampLevel(raw.levelIndex),
    suits: recipe.suits,
    // 存档里的 status 只信 won，其余一律当「还在打」——死局是从局面现算的，不该被存档定死。
    status: raw.status === 'won' ? 'won' : 'playing',
    piles,
    stock,
    foundations: [...raw.foundations],
    moves: raw.moves,
    runs: raw.runs,
    selection: null,
    history,
    effects: [],
    tick: 0,
  };
}

