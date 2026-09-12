import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_ROW, DOOR_E, DOOR_N, DOOR_S } from '../src/game/rules.js';
import { boardSignature, canReach, createBoard, openDoor, setTile } from '../src/game/grid.js';
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
  // 出口现在会跟着推移走，所以谜题不能把玩家和出口摆在同一条线上：
  // 同一行推一格，砖和两个格子一起平移，彼此的相对位置根本没变，等于白推。
  // 这里把出口放在第 1 行、只推第 0 行：玩家被带过去，出口留在原地。
  const board = createBoard(3, 2, 1);
  setTile(board, 0, 1, 0, DOOR_S);
  setTile(board, 0, 0, 1, DOOR_N);
  const player = { layer: 0, col: 1, row: 0 };
  const exit = { layer: 0, col: 0, row: 1 };
  assert.equal(canReach(board, player, exit), false, '南门下面是实心砖，还不通');
  const result = solve(board, player, exit, { maxDepth: 2 });
  assert.equal(result.shifts, 1);
  const end = replay(board, player, exit, result.moves);
  assert.equal(canReach(end.board, end.cell, end.exit), true);
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
    const end = replay(level.board, level.start, level.exit, result.moves);
    assert.equal(canReach(end.board, end.cell, end.exit), true, `seed ${seed} 的解法回放失败`);
    assert.equal(result.moves.length, result.shifts);
  }
});

test('applyShift 不改动传进去的棋盘', () => {
  const board = createBoard(3, 3, 1);
  setTile(board, 0, 0, 0, DOOR_E);
  const before = board.tiles.map((layer) => layer.slice());
  applyShift(
    { board, cell: { layer: 0, col: 0, row: 0 }, exit: { layer: 0, col: 2, row: 2 } },
    { layer: 0, axis: AXIS_COL, index: 0, dir: 1 },
  );
  assert.deepEqual(board.tiles, before);
});

test('推移会把出口一起带走：门长在砖上，不是钉在空中', () => {
  const board = createBoard(3, 3, 1);
  const player = { layer: 0, col: 0, row: 0 };
  const exit = { layer: 0, col: 1, row: 2 };
  // 推第 2 行：出口在这一行上，跟着走一格；玩家在第 0 行，原地不动。
  const moved = applyShift({ board, cell: player, exit }, { layer: 0, axis: AXIS_ROW, index: 2, dir: 1 });
  assert.deepEqual(moved.exit, { layer: 0, col: 2, row: 2 });
  assert.deepEqual(moved.cell, player);
  // 推第 0 行：换成玩家跟着走，出口不动。
  const other = applyShift({ board, cell: player, exit }, { layer: 0, axis: AXIS_ROW, index: 0, dir: 1 });
  assert.deepEqual(other.cell, { layer: 0, col: 1, row: 0 });
  assert.deepEqual(other.exit, exit);
});

test('搜索会把出口位置算进局面指纹，不然会剪掉真解', () => {
  // 同一张图、玩家同一格，但出口被推到了别处——这是两个不同的局面。
  const board = createBoard(3, 3, 1);
  const cell = { layer: 0, col: 0, row: 0 };
  const a = boardSignature(board, cell, { layer: 0, col: 1, row: 2 });
  const b = boardSignature(board, cell, { layer: 0, col: 2, row: 2 });
  assert.notEqual(a, b);
});
