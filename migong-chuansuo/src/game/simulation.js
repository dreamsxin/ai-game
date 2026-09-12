// 回合制状态机：一次动作产出一个新 state，渲染层只读。
// 计数只算推移，走位是免费的——这是 warpshift 的核心取舍：你付的代价是「改地形」。
import { AXIS_ROW, cellKey, sameCell, starsFor, toCell } from './rules.js';
import { canReach, cloneBoard, floodFrom, pathBetween, shiftCell, shiftLine } from './grid.js';
import { generateCampaignLevel } from './generator.js';
import { solve } from './solver.js';

const HISTORY_LIMIT = 40;

// 出口也进快照：它跟着推移走，撤销时必须一起退回去，不然门会留在推过之后的位置。
const snapshot = (state) => ({
  board: state.board,
  player: state.player,
  exit: state.exit,
  shifts: state.shifts,
  activeLayer: state.activeLayer,
});

// 每个动作都换一份新 effects 并把 tick 加一：渲染层靠 tick 判断这批特效是不是新的。
const commit = (state, patch, effects = []) => ({
  ...state,
  ...patch,
  effects,
  tick: state.tick + 1,
});

export function createGame(levelIndex = 0, seed = 1) {
  const generated = generateCampaignLevel(levelIndex, seed);
  const level = generated.level;
  if (!level) throw new Error(`第 ${levelIndex + 1} 关在 seed ${seed} 下生成失败`);
  return {
    levelIndex,
    seed,
    level,
    board: cloneBoard(level.board),
    player: { ...level.start },
    exit: { ...level.exit },
    activeLayer: level.start.layer,
    selection: null,
    shifts: 0,
    stars: 0,
    hints: 0,
    status: 'playing',
    history: [],
    effects: [],
    tick: 0,
    generated: { attempts: generated.attempts, optimal: level.optimal },
  };
}

export const restartLevel = (state) => createGame(state.levelIndex, state.seed);

// 换一关就换一个 seed，同一关不会连着给同一张图。
export const nextLevel = (state, levelIndex, seed) =>
  createGame(levelIndex ?? state.levelIndex + 1, seed ?? state.seed + 1);

export const reachableKeys = (state) => floodFrom(state.board, state.player).distance;

/**
 * 方向键会推的那一行一列由谁决定：手指按住的格子优先，其次是选中的格子，最后是玩家脚下。
 * HUD 的文字提示和场景里的光带都读这一个函数，两边才不会各说一套。
 */
export const shiftAnchor = (state, focus = null) => focus ?? state.selection ?? state.player;

export const exitReachable = (state) => canReach(state.board, state.player, state.exit);

export function setLayer(state, layer) {
  if (state.status !== 'playing') return state;
  if (layer < 0 || layer >= state.board.layers || layer === state.activeLayer) return state;
  return commit(state, { activeLayer: layer, selection: null }, [{ type: 'layer', layer }]);
}

export function selectCell(state, cell) {
  if (state.status !== 'playing' || !cell) return state;
  if (sameCell(state.selection, cell)) return commit(state, { selection: null }, [{ type: 'deselect' }]);
  return commit(state, { selection: toCell(cell) }, [{ type: 'select', cell: toCell(cell) }]);
}


/**
 * 推移一整行或一整列。玩家站在这条线上就跟着走，这一步也是他唯一的免费位移。
 *
 * 出口同样跟着走：它是长在砖上的一道门，不是钉在空中的坐标。
 * 门固定不动的话，玩家可以盯着那个格子倒推该把哪条路凑过去，难度塌一半；
 * 门会跑，就得同时算「路通到哪」和「门被我推到哪」，这才是这个玩法该有的思考量。
 */
export function shift(state, axis, index, dir) {
  if (state.status !== 'playing') return state;
  const layer = state.activeLayer;
  const limit = axis === AXIS_ROW ? state.board.rows : state.board.cols;
  if (index < 0 || index >= limit || dir === 0) return state;
  const board = shiftLine(state.board, layer, axis, index, dir);
  const player = shiftCell(state.board, state.player, layer, axis, index, dir);
  const exit = shiftCell(state.board, state.exit, layer, axis, index, dir);
  const history = [...state.history, snapshot(state)].slice(-HISTORY_LIMIT);
  const effects = [{ type: 'shift', layer, axis, index, dir }];
  // 推完就通了要立刻提示，否则玩家会以为还没解开。
  if (canReach(board, player, exit)) effects.push({ type: 'open' });
  return commit(
    state,
    { board, player, exit, shifts: state.shifts + 1, selection: null, history },
    effects,
  );
}

/** 沿着开着的门走到目标格。走不到就返回一个 blocked 特效，状态不变。 */
export function walkTo(state, cell) {
  if (state.status !== 'playing' || !cell) return state;
  if (sameCell(state.player, cell)) return state;
  const path = pathBetween(state.board, state.player, cell);
  if (!path) return commit(state, {}, [{ type: 'blocked', cell: toCell(cell) }]);
  const player = toCell(cell);
  const won = sameCell(player, state.exit);
  const stars = won ? starsFor(state.shifts, state.level.par) : state.stars;
  const effects = [{ type: 'walk', path }];
  if (won) effects.push({ type: 'won', stars, shifts: state.shifts });
  return commit(
    state,
    { player, selection: null, activeLayer: player.layer, status: won ? 'won' : 'playing', stars },
    effects,
  );
}

/** 手机上只有一种点击：能走就走，走不到就选中它，等着被推。 */
export function tapCell(state, cell) {
  if (state.status !== 'playing' || !cell) return state;
  if (sameCell(state.player, cell)) return selectCell(state, cell);
  if (canReach(state.board, state.player, cell)) return walkTo(state, cell);
  return selectCell(state, cell);
}

export function undo(state) {
  if (state.status !== 'playing' || state.history.length === 0) return state;
  const previous = state.history[state.history.length - 1];
  return commit(
    state,
    { ...previous, selection: null, history: state.history.slice(0, -1) },
    [{ type: 'undo' }],
  );
}

/**
 * 提示：只在两步以内找解，找不到就明说。
 * 深度放宽会让手机端卡住，所以这里宁可给不出答案也不冒险。
 */
export function hint(state) {
  if (state.status !== 'playing') return { move: null, reason: '本关已结束' };
  if (exitReachable(state)) return { move: null, reason: '路已经通了，点出口走过去' };
  const search = solve(state.board, state.player, state.exit, { maxDepth: 2, maxStates: 30000 });
  if (!search.moves || search.moves.length === 0) {
    return { move: null, reason: '两步内没有解，再多推几下' };
  }
  return { move: search.moves[0], reason: null };
}

export const countHint = (state) =>
  state.status === 'playing' ? { ...state, hints: state.hints + 1 } : state;

// 给 UI 和渲染层用的派生视图，避免它们自己去理解棋盘的整数编码。
export function boardView(state) {
  const distance = reachableKeys(state);
  const cells = [];
  for (let layer = 0; layer < state.board.layers; layer += 1) {
    for (let row = 0; row < state.board.rows; row += 1) {
      for (let col = 0; col < state.board.cols; col += 1) {
        const cell = { layer, col, row };
        cells.push({
          ...cell,
          tile: state.board.tiles[layer][row * state.board.cols + col],
          reachable: distance.has(cellKey(cell)),
          isPlayer: sameCell(state.player, cell),
          isExit: sameCell(state.exit, cell),
          isSelected: sameCell(state.selection, cell),
        });
      }
    }
  }
  return cells;
}



