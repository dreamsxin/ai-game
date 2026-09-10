import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_ROW, DOOR_E, DOOR_N, DOOR_S, DOOR_W, WARP } from '../src/game/rules.js';
import {
  canReach,
  connectedNeighbours,
  createBoard,
  openDoor,
  pathBetween,
  reachableFrom,
  setTile,
  shiftCell,
  shiftLine,
  tileAt,
} from '../src/game/grid.js';

const board3 = () => createBoard(3, 3, 1);

test('开门是双向的，两块砖同时记下这道门', () => {
  const board = board3();
  openDoor(board, 0, 0, 0, 1);
  assert.equal(tileAt(board, 0, 0, 0) & DOOR_E, DOOR_E);
  assert.equal(tileAt(board, 0, 1, 0) & DOOR_W, DOOR_W);
});

test('越界方向开不出门，也不会写坏邻格', () => {
  const board = board3();
  assert.equal(openDoor(board, 0, 0, 0, 0), false);
  assert.equal(tileAt(board, 0, 0, 0), 0);
});

test('只有一侧有门就走不通，连通判定要求两边对齐', () => {
  const board = board3();
  setTile(board, 0, 0, 0, DOOR_E);
  assert.deepEqual(connectedNeighbours(board, { layer: 0, col: 0, row: 0 }), []);
});

test('推移一整行，越界的砖从对面回来', () => {
  const board = board3();
  setTile(board, 0, 0, 1, DOOR_N);
  setTile(board, 0, 2, 1, DOOR_S);
  const moved = shiftLine(board, 0, AXIS_ROW, 1, 1);
  assert.equal(tileAt(moved, 0, 1, 1), DOOR_N, '第 0 列的砖应该滑到第 1 列');
  assert.equal(tileAt(moved, 0, 0, 1), DOOR_S, '第 2 列的砖应该绕回第 0 列');
});

test('推移一整列走的是行方向', () => {
  const board = board3();
  setTile(board, 0, 2, 0, DOOR_W);
  const moved = shiftLine(board, 0, AXIS_COL, 2, 1);
  assert.equal(tileAt(moved, 0, 2, 1), DOOR_W);
  assert.equal(tileAt(moved, 0, 2, 0), 0);
});

test('推移只动指定的那一层', () => {
  const board = createBoard(3, 3, 2);
  setTile(board, 1, 0, 0, DOOR_E);
  const moved = shiftLine(board, 0, AXIS_ROW, 0, 1);
  assert.equal(tileAt(moved, 1, 0, 0), DOOR_E, '第 1 层不该被第 0 层的推移带走');
});

test('推移正反两次回到原状，这是打乱可逆的前提', () => {
  const board = board3();
  setTile(board, 0, 0, 0, DOOR_E | WARP);
  setTile(board, 0, 1, 0, DOOR_S);
  const there = shiftLine(board, 0, AXIS_ROW, 0, 1);
  const back = shiftLine(there, 0, AXIS_ROW, 0, -1);
  assert.deepEqual(back.tiles, board.tiles);
});

test('站在被推的行上就跟着砖走，不在这条线上原地不动', () => {
  const board = board3();
  const onRow = shiftCell(board, { layer: 0, col: 2, row: 1 }, 0, AXIS_ROW, 1, 1);
  assert.deepEqual(onRow, { layer: 0, col: 0, row: 1 }, '走到边界应该绕回列 0');
  const offRow = shiftCell(board, { layer: 0, col: 2, row: 0 }, 0, AXIS_ROW, 1, 1);
  assert.deepEqual(offRow, { layer: 0, col: 2, row: 0 });
  const otherLayer = shiftCell(board, { layer: 1, col: 0, row: 1 }, 0, AXIS_ROW, 1, 1);
  assert.equal(otherLayer.col, 0);
});

test('跃迁垫要上下两层都对齐才接得上', () => {
  const board = createBoard(2, 2, 2);
  setTile(board, 0, 0, 0, WARP);
  assert.deepEqual(connectedNeighbours(board, { layer: 0, col: 0, row: 0 }), []);
  setTile(board, 1, 0, 0, WARP);
  const linked = connectedNeighbours(board, { layer: 0, col: 0, row: 0 });
  assert.deepEqual(linked, [{ layer: 1, col: 0, row: 0 }]);
});

test('推歪的跃迁垫会断链，这就是关卡的难点来源', () => {
  const board = createBoard(2, 2, 2);
  setTile(board, 0, 0, 0, WARP);
  setTile(board, 1, 0, 0, WARP);
  const moved = shiftLine(board, 1, AXIS_ROW, 0, 1);
  assert.equal(canReach(moved, { layer: 0, col: 0, row: 0 }, { layer: 1, col: 0, row: 0 }), false);
});

test('路径含起点和终点，且每一步都是相邻格', () => {
  const board = board3();
  openDoor(board, 0, 0, 0, 1);
  openDoor(board, 0, 1, 0, 2);
  const path = pathBetween(board, { layer: 0, col: 0, row: 0 }, { layer: 0, col: 1, row: 1 });
  assert.equal(path.length, 3);
  assert.deepEqual(path[0], { layer: 0, col: 0, row: 0 });
  assert.deepEqual(path[2], { layer: 0, col: 1, row: 1 });
  for (let i = 1; i < path.length; i += 1) {
    const step = Math.abs(path[i].col - path[i - 1].col) + Math.abs(path[i].row - path[i - 1].row);
    assert.equal(step, 1, `第 ${i} 步跨了 ${step} 格`);
  }
});

test('走不到就返回 null，而不是抛错或给半条路', () => {
  const board = board3();
  assert.equal(pathBetween(board, { layer: 0, col: 0, row: 0 }, { layer: 0, col: 2, row: 2 }), null);
  const alone = reachableFrom(board, { layer: 0, col: 0, row: 0 });
  assert.equal(alone.size, 1, '全是墙时只能站在原地');
});
