import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_ROW, starsFor } from '../src/game/rules.js';
import { canReach } from '../src/game/grid.js';
import {
  boardView,
  countHint,
  createGame,
  exitReachable,
  hint,
  nextLevel,
  restartLevel,
  selectCell,
  setLayer,
  shift,
  shiftAnchor,
  tapCell,
  undo,
  walkTo,
} from '../src/game/simulation.js';

const fresh = (index = 1, seed = 42) => createGame(index, seed);

test('开局站在起点、零步、未通关', () => {
  const state = fresh();
  assert.equal(state.status, 'playing');
  assert.equal(state.shifts, 0);
  assert.deepEqual(state.player, state.level.start);
  assert.equal(exitReachable(state), false);
  assert.equal(state.activeLayer, state.level.start.layer);
});

test('同一关同一 seed 开出逐字段一致的局面', () => {
  assert.deepEqual(fresh(2, 7).board.tiles, fresh(2, 7).board.tiles);
  assert.deepEqual(fresh(2, 7).player, fresh(2, 7).player);
});

test('推移记一步并换一份新棋盘，原 state 不被改动', () => {
  const state = fresh();
  const before = state.board.tiles.map((layer) => layer.slice());
  const next = shift(state, AXIS_ROW, 0, 1);
  assert.equal(next.shifts, 1);
  assert.deepEqual(state.board.tiles, before, '原 state 的棋盘被就地改了');
  assert.notEqual(next.board, state.board);
  assert.equal(next.tick, state.tick + 1);
  assert.equal(next.effects[0].type, 'shift');
});

test('越界的行号被忽略，返回同一个 state', () => {
  const state = fresh();
  assert.equal(shift(state, AXIS_ROW, -1, 1), state);
  assert.equal(shift(state, AXIS_ROW, state.board.rows, 1), state);
  assert.equal(shift(state, AXIS_COL, 0, 0), state);
});

test('走位免费：走一步不增加推移计数', () => {
  const state = fresh();
  const target = boardView(state).find((cell) => cell.reachable && !cell.isPlayer);
  assert.ok(target, '开局应该至少能走到一格');
  const next = walkTo(state, target);
  assert.equal(next.shifts, 0);
  assert.deepEqual(next.player, { layer: target.layer, col: target.col, row: target.row });
  assert.equal(next.effects[0].type, 'walk');
});

test('走不到的格子只给 blocked 特效，站位不变', () => {
  const state = fresh();
  const blocked = boardView(state).find((cell) => !cell.reachable);
  assert.ok(blocked, '开局应该有走不到的格子');
  const next = walkTo(state, blocked);
  assert.deepEqual(next.player, state.player);
  assert.equal(next.effects[0].type, 'blocked');
});

test('点击能走就走，走不到就选中', () => {
  const state = fresh();
  const cells = boardView(state);
  const walkable = cells.find((cell) => cell.reachable && !cell.isPlayer);
  const unreachable = cells.find((cell) => !cell.reachable);
  assert.deepEqual(tapCell(state, walkable).player, {
    layer: walkable.layer,
    col: walkable.col,
    row: walkable.row,
  });
  const selected = tapCell(state, unreachable);
  assert.deepEqual(selected.player, state.player);
  assert.deepEqual(selected.selection, {
    layer: unreachable.layer,
    col: unreachable.col,
    row: unreachable.row,
  });
});

test('再点一次同一格取消选中', () => {
  const state = fresh();
  const cell = { layer: 0, col: 1, row: 1 };
  const selected = selectCell(state, cell);
  assert.deepEqual(selected.selection, cell);
  assert.equal(selectCell(selected, cell).selection, null);
});

test('撤销回到上一步的棋盘和站位，并把计数退回去', () => {
  const state = fresh();
  const moved = shift(shift(state, AXIS_ROW, 1, 1), AXIS_COL, 2, -1);
  assert.equal(moved.shifts, 2);
  const back = undo(moved);
  assert.equal(back.shifts, 1);
  const origin = undo(back);
  assert.equal(origin.shifts, 0);
  assert.deepEqual(origin.board.tiles, state.board.tiles);
  assert.deepEqual(origin.player, state.player);
  assert.equal(undo(origin), origin, '没有历史时撤销应该原样返回');
});

test('走位不进历史，撤销只回退推移', () => {
  const state = shift(fresh(), AXIS_ROW, 0, 1);
  const target = boardView(state).find((cell) => cell.reachable && !cell.isPlayer);
  const walked = walkTo(state, target);
  assert.equal(walked.history.length, state.history.length);
});

test('照保底解法推完再走到出口就算通关', () => {
  const state = fresh(0, 11);
  let current = state;
  for (const move of state.level.solution) {
    current = shift(setLayer(current, move.layer), move.axis, move.index, move.dir);
  }
  assert.equal(exitReachable(current), true, '保底解法推完应该通路');
  const won = walkTo(current, current.exit);
  assert.equal(won.status, 'won');
  assert.ok(won.stars >= 1 && won.stars <= 3);
  assert.equal(won.effects.at(-1).type, 'won');
});

test('通关后所有动作都被拒绝', () => {
  let current = fresh(0, 11);
  for (const move of current.level.solution) {
    current = shift(setLayer(current, move.layer), move.axis, move.index, move.dir);
  }
  const won = walkTo(current, current.exit);
  assert.equal(shift(won, AXIS_ROW, 0, 1), won);
  assert.equal(undo(won), won);
  assert.equal(tapCell(won, { layer: 0, col: 0, row: 0 }), won);
  assert.equal(setLayer(won, 0), won);
});

test('推完就通路时会额外抛一个 open 特效', () => {
  let current = fresh(0, 11);
  const solution = current.level.solution;
  for (let index = 0; index < solution.length - 1; index += 1) {
    const move = solution[index];
    current = shift(setLayer(current, move.layer), move.axis, move.index, move.dir);
  }
  const last = solution.at(-1);
  const opened = shift(setLayer(current, last.layer), last.axis, last.index, last.dir);
  assert.ok(opened.effects.some((effect) => effect.type === 'open'));
});

test('切层只在层数范围内生效', () => {
  const state = fresh(2, 3);
  assert.ok(state.board.layers >= 2);
  const up = setLayer(state, 1);
  assert.equal(up.activeLayer, 1);
  assert.equal(setLayer(up, 1), up, '切到当前层应该原样返回');
  assert.equal(setLayer(state, state.board.layers), state);
  assert.equal(setLayer(state, -1), state);
});

test('推移作用在当前激活层上', () => {
  const state = setLayer(fresh(2, 3), 1);
  const next = shift(state, AXIS_ROW, 0, 1);
  assert.equal(next.effects[0].layer, 1);
  assert.deepEqual(next.board.tiles[0], state.board.tiles[0], '非激活层不该被动到');
});

test('提示在路已通时明说不用再推', () => {
  let current = fresh(0, 11);
  for (const move of current.level.solution) {
    current = shift(setLayer(current, move.layer), move.axis, move.index, move.dir);
  }
  const advice = hint(current);
  assert.equal(advice.move, null);
  assert.match(advice.reason, /已经通/);
});

test('提示给得出的动作确实能推出通路', () => {
  const state = fresh(0, 11);
  const advice = hint(state);
  if (!advice.move) {
    assert.match(advice.reason, /两步内没有解/);
    return;
  }
  const move = advice.move;
  const after = shift(setLayer(state, move.layer), move.axis, move.index, move.dir);
  const solvedNow = exitReachable(after);
  const oneMore = solvedNow || canReach(after.board, after.player, after.exit);
  assert.ok(oneMore || hint(after).move, '提示后的局面应该离通路更近');
});

test('提示计数只在进行中累加', () => {
  const state = fresh();
  assert.equal(countHint(state).hints, 1);
  const finished = { ...state, status: 'won' };
  assert.equal(countHint(finished).hints, 0);
});

test('重开同一关得到完全一样的初始局面', () => {
  const state = shift(fresh(1, 5), AXIS_ROW, 0, 1);
  const again = restartLevel(state);
  assert.equal(again.shifts, 0);
  assert.deepEqual(again.board.tiles, fresh(1, 5).board.tiles);
});

test('下一关换关号也换 seed', () => {
  const state = fresh(1, 5);
  const next = nextLevel(state);
  assert.equal(next.levelIndex, 2);
  assert.equal(next.seed, 6);
});

test('派生视图每格都带齐渲染需要的标记', () => {
  const state = fresh();
  const cells = boardView(state);
  assert.equal(cells.length, state.board.cols * state.board.rows * state.board.layers);
  assert.equal(cells.filter((cell) => cell.isPlayer).length, 1);
  assert.equal(cells.filter((cell) => cell.isExit).length, 1);
  assert.ok(cells.every((cell) => typeof cell.tile === 'number'));
});

test('星级按 par 分档', () => {
  assert.equal(starsFor(3, 4), 3);
  assert.equal(starsFor(4, 4), 3);
  assert.equal(starsFor(6, 4), 2);
  assert.equal(starsFor(7, 4), 1);
});

test('方向键的作用行列：按住的格子优先，其次选中，最后玩家脚下', () => {
  const state = fresh();
  assert.deepEqual(shiftAnchor(state), state.player, '什么都没选时就是玩家脚下那条线');
  const selected = selectCell(state, { layer: 0, col: 1, row: 2 });
  assert.deepEqual(shiftAnchor(selected), { layer: 0, col: 1, row: 2 });
  const pressed = { layer: 0, col: 3, row: 0 };
  assert.deepEqual(shiftAnchor(selected, pressed), pressed, '手指按住的格子应该盖过选中的');
});

test('方向键推的正是作用行列', () => {
  const state = selectCell(fresh(), { layer: 0, col: 1, row: 2 });
  const anchor = shiftAnchor(state);
  const pushed = shift(state, AXIS_ROW, anchor.row, 1);
  assert.equal(pushed.effects[0].index, 2);
  assert.equal(pushed.effects[0].axis, AXIS_ROW);
});
