import { LEVEL } from './level.js';

const DIRECTIONS = {
  north: { opposite: 'south', row: -1, column: 0 },
  east: { opposite: 'west', row: 0, column: 1 },
  south: { opposite: 'north', row: 1, column: 0 },
  west: { opposite: 'east', row: 0, column: -1 },
};

const objectFor = (id) => LEVEL.objects.find((object) => object.id === id);

const passageHeight = (mass) => 1.15 + Math.sqrt(Math.max(0, mass) / 7);

const boardIndex = (row, column) => row * LEVEL.puzzle.columns + column;

const moduleAt = (board, row, column) => {
  if (row < 0 || row >= LEVEL.puzzle.rows || column < 0 || column >= LEVEL.puzzle.columns) return null;
  const id = board[boardIndex(row, column)];
  return id ? { id, ...LEVEL.puzzle.modules[id] } : null;
};

const gateBlocks = (gate, capability) => {
  if (!gate) return null;
  if (gate.massMin !== undefined && capability.mass < gate.massMin) return `需要质量 ≥ ${gate.massMin}`;
  if (gate.massMax !== undefined && capability.mass > gate.massMax) return `体型需 ≤ ${gate.massMax}`;
  if (gate.heightMin !== undefined && capability.height < gate.heightMin) return `需要通行高度 ≥ ${gate.heightMin}`;
  return null;
};

const portBlocks = (fromPort, toPort, capability) => {
  if (!fromPort || !toPort) return '缺口未对齐';
  if ((fromPort.color ?? 'white') !== (toPort.color ?? 'white')) return '接口颜色不匹配';
  const fromBlocked = gateBlocks(fromPort.gate, capability);
  if (fromBlocked) return fromBlocked;
  return gateBlocks(toPort.gate, capability);
};

function collectContents(module, routeState) {
  const collections = [];
  for (const content of module.contents ?? []) {
    const object = objectFor(content.objectId);
    if (!object || routeState.collected.has(object.id)) continue;
    if (routeState.mass + 2 < object.mass) {
      return { error: `${module.label} 需要吞噬 ${object.mass} 质量目标`, collections };
    }
    routeState.mass += object.mass;
    routeState.height = passageHeight(routeState.mass);
    routeState.collected.add(object.id);
    collections.push(object.id);
  }
  return { collections };
}

export function createPuzzleState() {
  return {
    board: [...LEVEL.puzzle.initialBoard],
    moduleMoves: 0,
    travelSteps: 0,
    hintTier: 0,
    committed: false,
  };
}

export function slideModules(board, { axis, index, delta }) {
  const next = [...board];
  const step = Math.sign(delta);
  const count = Math.abs(delta);
  for (let turn = 0; turn < count; turn += 1) {
    if (axis === 'row') {
      const row = next.slice(index * LEVEL.puzzle.columns, (index + 1) * LEVEL.puzzle.columns);
      const wrapped = step > 0 ? [row.at(-1), ...row.slice(0, -1)] : [...row.slice(1), row[0]];
      for (let column = 0; column < LEVEL.puzzle.columns; column += 1) next[boardIndex(index, column)] = wrapped[column];
    } else {
      const values = Array.from({ length: LEVEL.puzzle.rows }, (_, row) => next[boardIndex(row, index)]);
      const wrapped = step > 0 ? [values.at(-1), ...values.slice(0, -1)] : [...values.slice(1), values[0]];
      for (let row = 0; row < LEVEL.puzzle.rows; row += 1) next[boardIndex(row, index)] = wrapped[row];
    }
  }
  return next;
}

export function analyzePuzzle(board, initialMass = 0) {
  const startIndex = board.indexOf(LEVEL.puzzle.entry);
  const targetIndex = board.indexOf(LEVEL.puzzle.checkpoint);
  const start = { row: Math.floor(startIndex / LEVEL.puzzle.columns), column: startIndex % LEVEL.puzzle.columns };
  const target = { row: Math.floor(targetIndex / LEVEL.puzzle.columns), column: targetIndex % LEVEL.puzzle.columns };
  const startModule = moduleAt(board, start.row, start.column);
  const initialCollections = [];
  const routeState = { mass: initialMass, height: passageHeight(initialMass), collected: new Set() };
  const initialResult = collectContents(startModule, routeState);
  if (initialResult.error) return { connected: false, executable: false, reason: initialResult.error, route: [] };
  initialCollections.push(...initialResult.collections);
  const queue = [{ ...start, state: routeState, route: [{ ...start, moduleId: startModule.id, collections: initialCollections }] }];
  const visited = new Set([`${start.row},${start.column}|${routeState.mass}|${[...routeState.collected].sort().join('|')}`]);
  let bestFailure = '未找到完整路线';

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.row === target.row && current.column === target.column) {
      return {
        connected: true,
        executable: true,
        route: current.route,
        mass: current.state.mass,
        height: current.state.height,
        collected: [...current.state.collected],
        travelSteps: Math.max(0, current.route.length - 1),
      };
    }
    for (const [direction, delta] of Object.entries(DIRECTIONS)) {
      const row = current.row + delta.row;
      const column = current.column + delta.column;
      const fromModule = moduleAt(board, current.row, current.column);
      const toModule = moduleAt(board, row, column);
      if (!toModule) continue;
      const fromPort = fromModule.ports?.[direction];
      const toPort = toModule.ports?.[delta.opposite];
      const blocked = portBlocks(fromPort, toPort, current.state);
      if (blocked) {
        bestFailure = `${fromModule.label} → ${toModule.label}：${blocked}`;
        continue;
      }
      const state = { mass: current.state.mass, height: current.state.height, collected: new Set(current.state.collected) };
      const collectionResult = collectContents(toModule, state);
      if (collectionResult.error) {
        bestFailure = collectionResult.error;
        continue;
      }
      const key = `${row},${column}|${state.mass}|${[...state.collected].sort().join('|')}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({
        row,
        column,
        state,
        route: [...current.route, { row, column, moduleId: toModule.id, direction, collections: collectionResult.collections }],
      });
    }
  }
  return { connected: false, executable: false, reason: bestFailure, route: [] };
}

export function applyPuzzleMove(state, move) {
  if (state.committed) return state;
  return { ...state, board: slideModules(state.board, move), moduleMoves: state.moduleMoves + 1 };
}

export function commitPuzzle(state) {
  const analysis = analyzePuzzle(state.board);
  if (!analysis.executable) return { state, analysis, committed: false };
  const next = {
    ...state,
    committed: true,
    travelSteps: analysis.travelSteps,
    analysis,
  };
  return { state: next, analysis, committed: true };
}

export function scorePuzzle(puzzleState, { assisted = false } = {}) {
  if (assisted) return { stars: 0, reason: '辅助模式不计星' };
  const { three, two } = LEVEL.puzzle.rating;
  if (puzzleState.moduleMoves <= three.moduleMoves && puzzleState.travelSteps <= three.travelSteps && puzzleState.hintTier < 2) return { stars: 3, reason: '最优路线' };
  if (puzzleState.moduleMoves <= two.moduleMoves && puzzleState.travelSteps <= two.travelSteps && puzzleState.hintTier < 3) return { stars: 2, reason: '接近最优路线' };
  return { stars: 1, reason: '完成主目标' };
}
