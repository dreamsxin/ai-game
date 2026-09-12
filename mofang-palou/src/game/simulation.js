// 回合制状态机。一次动作产出一个新 state，渲染层只读。
// 计数只算推移，走位免费 —— 你付的代价是「改地形」，这是这个玩法的核心取舍。
//
// 无尽模式的形状：一次 run 里一座接一座地爬塔，没有失败判定。
// 一座塔通了就结算、加楼层、换下一座，阶数按 towerRecipe 自己往上走。
import {
  AXIS_PILLAR,
  HISTORY_LIMIT,
  VIEW_ORBIT,
  VIEW_SIDE,
  VIEW_TOP,
  sameCell,
  toCell,
  towerScore,
} from './rules.js';
import { canReach, cloneCube, floodFrom, pathBetween, shiftCell, shiftLine } from './cube.js';
import { generateTower } from './generator.js';
import { solve } from './solver.js';

// 只存能改回去的那几样，其余都是从它们派生的。
const snapshot = (state) => ({
  cube: state.cube,
  player: state.player,
  // 出口也长在砖上，会跟着推移走，撤销必须一起退回来。
  exit: state.exit,
  shifts: state.shifts,
  activeLayer: state.activeLayer,
  sliceRow: state.sliceRow,
});

const commit = (state, patch, effects = []) => ({
  ...state,
  ...patch,
  effects,
  tick: state.tick + 1,
});

const nextSeed = (seed, index) => (Math.imul(seed ^ (index + 1), 0x9e3779b1) >>> 0) || 1;

/** 开一座塔。生成失败（极少）就往后换 seed，绝不返回半个状态。 */
function openTower(index, seed, carry) {
  let attemptSeed = seed;
  for (let tries = 0; tries < 8; tries += 1) {
    const built = generateTower(index, attemptSeed);
    if (built.tower) return dressTower(built.tower, attemptSeed, carry);
    attemptSeed = nextSeed(attemptSeed, tries + 97);
  }
  throw new Error(`第 ${index + 1} 座塔生成不出来，seed ${seed}`);
}

function dressTower(tower, seed, carry) {
  return {
    towerIndex: tower.index,
    seed,
    tower,
    cube: cloneCube(tower.cube),
    player: { ...tower.start },
    exit: { ...tower.exit },
    // 俯视看哪一层、侧视看哪一道纵剖面。都从玩家所在的位置起步。
    activeLayer: tower.start.layer,
    sliceRow: tower.start.row,
    view: VIEW_TOP,
    selection: null,
    shifts: 0,
    status: 'climbing',
    history: [],
    effects: [{ type: 'tower', index: tower.index, order: tower.order }],
    tick: 0,
    // run 级别的累计，跨塔带着走。
    floors: carry?.floors ?? 0,
    score: carry?.score ?? 0,
    totalShifts: carry?.totalShifts ?? 0,
    towersCleared: carry?.towersCleared ?? 0,
    best: carry?.best ?? 0,
  };
}

export const createRun = (seed = 1) => openTower(0, seed >>> 0 || 1, null);

/** 重开当前这一座：同 seed 同塔，累计成绩保留，本座步数清零。 */
export const restartTower = (state) =>
  dressTower(state.tower, state.seed, {
    floors: state.floors,
    score: state.score,
    totalShifts: state.totalShifts,
    towersCleared: state.towersCleared,
    best: state.best,
  });

/** 进下一座。只有通了这座才该调用；没通就调用等于跳关，这里直接拒绝。 */
export function nextTower(state) {
  if (state.status !== 'cleared') return state;
  const index = state.towerIndex + 1;
  return openTower(index, nextSeed(state.seed, index), {
    floors: state.floors,
    score: state.score,
    totalShifts: state.totalShifts,
    towersCleared: state.towersCleared,
    best: state.best,
  });
}

/** 从头开一趟新的 run，只留最高分。 */
export const resetRun = (state, seed) => {
  const fresh = openTower(0, (seed >>> 0) || 1, null);
  return { ...fresh, best: Math.max(state?.best ?? 0, state?.score ?? 0) };
};

export const exitReachable = (state) => canReach(state.cube, state.player, state.exit);
export const reachableKeys = (state) => floodFrom(state.cube, state.player).distance;

/**
 * 方向键／滑动会推的那条线由谁决定：手指按住的格子优先，其次选中的格子，最后玩家脚下。
 * HUD 的文字和场景里的高亮都读这一个函数，两边才不会各说一套。
 */
export const shiftAnchor = (state, focus = null) => toCell(focus ?? state.selection ?? state.player);

/** 切视角。视角同时也是轴选择器，所以切完要把选中清掉，免得沿用一个另一面上的锚点。 */
export function setView(state, view) {
  if (state.status === 'cleared' || view === state.view) return state;
  return commit(state, { view, selection: null }, [{ type: 'view', view }]);
}

export function setLayer(state, layer) {
  if (layer < 0 || layer >= state.cube.order || layer === state.activeLayer) return state;
  return commit(state, { activeLayer: layer, selection: null }, [{ type: 'layer', layer }]);
}

export function setSlice(state, row) {
  if (row < 0 || row >= state.cube.order || row === state.sliceRow) return state;
  return commit(state, { sliceRow: row, selection: null }, [{ type: 'slice', row }]);
}

export function selectCell(state, cell) {
  if (state.status !== 'climbing' || !cell) return state;
  if (sameCell(state.selection, cell)) return commit(state, { selection: null }, [{ type: 'deselect' }]);
  return commit(state, { selection: toCell(cell) }, [{ type: 'select', cell: toCell(cell) }]);
}

/**
 * 推一整条线。砖阵、玩家、出口一起走 —— 三者都长在砖上，只挪一样就散架了。
 * 玩家被带着走是他唯一的免费位移；出口被带着走意味着终点不是死坐标，
 * 每一步都要同时算「路通到哪」和「门被我推到哪」。
 */
export function shift(state, axis, anchor, dir) {
  if (state.status !== 'climbing' || !anchor || dir === 0) return state;
  const cube = shiftLine(state.cube, axis, anchor, dir);
  const player = shiftCell(state.cube, state.player, axis, anchor, dir);
  const exit = shiftCell(state.cube, state.exit, axis, anchor, dir);
  const history = [...state.history, snapshot(state)].slice(-HISTORY_LIMIT);
  const effects = [{ type: 'shift', axis, anchor: toCell(anchor), dir }];
  // 推完就通了要立刻说，否则玩家会以为还没解开。
  if (canReach(cube, player, exit)) effects.push({ type: 'open' });
  return commit(
    state,
    {
      cube,
      player,
      exit,
      shifts: state.shifts + 1,
      totalShifts: state.totalShifts + 1,
      selection: null,
      history,
      // 玩家被推到别的层就跟着切过去，不然他会在看不见的层上。
      activeLayer: player.layer,
      sliceRow: player.row,
    },
    effects,
  );
}

/** 沿着开着的门走到目标格。走不到就只给一个 blocked，状态不动。 */
export function walkTo(state, cell) {
  if (state.status !== 'climbing' || !cell) return state;
  if (sameCell(state.player, cell)) return state;
  const path = pathBetween(state.cube, state.player, cell);
  if (!path) return commit(state, {}, [{ type: 'blocked', cell: toCell(cell) }]);
  const player = toCell(cell);
  const cleared = sameCell(player, state.exit);
  const effects = [{ type: 'walk', path }];
  if (!cleared) {
    return commit(
      state,
      { player, selection: null, activeLayer: player.layer, sliceRow: player.row },
      effects,
    );
  }
  const gained = towerScore(state.tower.order, state.shifts, state.tower.par);
  const score = state.score + gained;
  effects.push({
    type: 'cleared',
    order: state.tower.order,
    shifts: state.shifts,
    par: state.tower.par,
    gained,
  });
  return commit(
    state,
    {
      player,
      selection: null,
      activeLayer: player.layer,
      sliceRow: player.row,
      status: 'cleared',
      floors: state.floors + state.tower.order,
      towersCleared: state.towersCleared + 1,
      score,
      best: Math.max(state.best, score),
    },
    effects,
  );
}

/** 手机上只有一种点击：能走就走，走不到就选中它，等着被推。 */
export function tapCell(state, cell) {
  if (state.status !== 'climbing' || !cell) return state;
  if (sameCell(state.player, cell)) return selectCell(state, cell);
  if (canReach(state.cube, state.player, cell)) return walkTo(state, cell);
  return selectCell(state, cell);
}

export function undo(state) {
  if (state.status !== 'climbing' || state.history.length === 0) return state;
  const previous = state.history[state.history.length - 1];
  return commit(
    state,
    {
      ...previous,
      selection: null,
      history: state.history.slice(0, -1),
      // 累计步数不回退：撤销是给思考留余地，不是给成绩打折。
      totalShifts: state.totalShifts,
    },
    [{ type: 'undo' }],
  );
}

/**
 * 提示。深度按阶数收：三四阶搜两步，五六阶只搜一步。
 * 六阶分支 216，搜两步是四万多个节点、每个还要洪泛一次 —— 手机上点一下能卡住半秒以上。
 * 搜不到就明说「这个深度内没有」，不编一个看着像答案的走法。
 */
export function hint(state) {
  if (state.status !== 'climbing') return { move: null, reason: '这一座已经通了' };
  if (exitReachable(state)) return { move: null, reason: '路已经通了，点出口走过去' };
  const maxDepth = state.cube.order <= 4 ? 2 : 1;
  const search = solve(state.cube, state.player, state.exit, { maxDepth, maxStates: 30000 });
  if (!search.moves || search.moves.length === 0) {
    return { move: null, reason: `${maxDepth} 步内没有解，再多推几下` };
  }
  return { move: search.moves[0], reason: null };
}

/**
 * 给 UI 和渲染层用的派生视图，避免它们自己去理解砖的位编码。
 * 一次返回整座塔的所有格子；哪些该画由渲染层按视角自己筛。
 */
export function boardView(state) {
  const distance = reachableKeys(state);
  const cells = [];
  for (let layer = 0; layer < state.cube.order; layer += 1) {
    for (let row = 0; row < state.cube.order; row += 1) {
      for (let col = 0; col < state.cube.order; col += 1) {
        const cell = { layer, col, row };
        const key = `${layer},${col},${row}`;
        cells.push({
          ...cell,
          tile: state.cube.tiles[layer][row * state.cube.order + col],
          reachable: distance.has(key),
          distance: distance.get(key) ?? null,
          isPlayer: sameCell(state.player, cell),
          isExit: sameCell(state.exit, cell),
          isSelected: sameCell(state.selection, cell),
        });
      }
    }
  }
  return cells;
}

/** 这条线上有哪些格子会被推 —— 高亮和文案都读它。 */
export const shiftPreview = (state, axis, anchor) => ({
  axis,
  anchor: toCell(anchor),
  pillar: axis === AXIS_PILLAR,
});

/** 当前视角下，哪一层／哪一道剖面是「在操作的那一面」。 */
export const activeFace = (state) => {
  if (state.view === VIEW_TOP) return { kind: 'layer', index: state.activeLayer };
  if (state.view === VIEW_SIDE) return { kind: 'slice', index: state.sliceRow };
  return { kind: 'orbit', index: null };
};



