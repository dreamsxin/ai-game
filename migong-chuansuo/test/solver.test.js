import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_ROW, DOOR_E, DOOR_W } from '../src/game/rules.js';
import { canReach, createBoard, openDoor, setTile } from '../src/game/grid.js';
import { applyShift, replay, shiftActions, solve } from '../src/game/solver.js';
import { generateLevel } from '../src/game/generator.js';

test('动作全集覆盖每层的每行每列两个方向', () => {
  const actions = shiftActions(createBoard(4, 3, 2));
  assert.equal(actions.length, 2 * 2 * (4 + 3));
  assert.equal(actions.filter((a) => a.axis === AXIS_ROW && a.layer === 1).length, 6);
  assert.equal(actions.filter((a) => a.axis === AXIS_COL && a.dir === -1).length, 8);
});

test('已经通了就返回零步，不做任何搜索', () => {
  const board = createBoard(2, 1, 1);
  openDoor(board, 0, 0, 0, 1);
  const result = solve(board, { layer: 0, col: 0, row: 0 }, { layer: 0, col: 1, row: 0 });
  assert.equal(result.shifts, 0);
  assert.deepEqual(result.moves, []);
});

test('一步能解的局面就报一步', () => {
  // 三格一行：两端各有一扇朝内的门，中间那块是实心的。
  // 把整行推一格，两扇门就对上了。
  const board = createBoard(3, 1, 1);
  setTile(board, 0, 0, 0, DOOR_E);
  setTile(board, 0, 1, 0, 0);
  setTile(board, 0, 2, 0, DOOR_W);
  const player = { layer: 0, col: 0, row: 0 };
  const exit = { layer: 0, col: 2, row: 0 };
  assert.equal(canReach(board, player, exit), false);
  const result = solve(board, player, exit, { maxDepth: 2 });
  assert.equal(result.shifts, 1);
  const end = replay(board, player, result.moves);
  assert.equal(canReach(end.board, end.cell, exit), true);
});

test('深度不够就明确报 exhausted，而不是谎称无解', () => {
  const { level } = generateLevel({ seed: 4, cols: 5, rows: 5, layers: 3, scramble: 6 });
  const result = solve(level.board, level.start, level.exit, { maxDepth: 1, maxStates: 5000 });
  assert.equal(result.shifts, null);
  assert.equal(result.exhausted, true);
});

test('状态预算用尽会立刻收手', () => {
  const { level } = generateLevel({ seed: 6, cols: 5, rows: 5, layers: 3, scramble: 7 });
  const result = solve(level.board, level.start, level.exit, { maxDepth: 4, maxStates: 300 });
  assert.equal(result.exhausted, true);
  assert.ok(result.visited <= 320, `实际展开了 ${result.visited} 个状态`);
});

test('搜出来的解法回放后确实可达出口', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const { level } = generateLevel({ seed, cols: 4, rows: 4, layers: 1, scramble: 2 });
    const result = solve(level.board, level.start, level.exit, { maxDepth: 2 });
    if (!result.moves) continue;
    const end = replay(level.board, level.start, result.moves);
    assert.equal(canReach(end.board, end.cell, level.exit), true, `seed ${seed} 的解法回放失败`);
    assert.equal(result.moves.length, result.shifts);
  }
});

test('applyShift 不改动传进去的棋盘', () => {
  const board = createBoard(3, 3, 1);
  setTile(board, 0, 0, 0, DOOR_E);
  const before = board.tiles.map((layer) => layer.slice());
  applyShift(board, { layer: 0, col: 0, row: 0 }, { layer: 0, axis: AXIS_COL, index: 0, dir: 1 });
  assert.deepEqual(board.tiles, before);
});
