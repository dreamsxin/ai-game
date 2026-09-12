import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXIS_COL,
  AXIS_PILLAR,
  AXIS_ROW,
  VIEW_ORBIT,
  VIEW_SIDE,
  VIEW_TOP,
  axesForView,
  floorsClimbed,
  towerScore,
} from '../src/game/rules.js';
import { canReach } from '../src/game/cube.js';
import {
  activeFace,
  boardView,
  createRun,
  exitReachable,
  hint,
  nextTower,
  resetRun,
  restartTower,
  selectCell,
  setLayer,
  setSlice,
  setView,
  shift,
  shiftAnchor,
  tapCell,
  undo,
  walkTo,
} from '../src/game/simulation.js';

const fresh = (seed = 2026) => createRun(seed);

/** 照保底解法把这一座推通，返回推完的状态。 */
const solveTower = (start) => {
  let current = start;
  for (const move of current.tower.solution) {
    current = shift(current, move.axis, move.anchor, move.dir);
  }
  return current;
};

test('开局：三阶、站在底层起点、零步，第一座的出口就在同一层', () => {
  const state = fresh();
  assert.equal(state.tower.order, 3);
  assert.equal(state.towerIndex, 0);
  assert.deepEqual(state.player, state.tower.start);
  assert.equal(state.player.layer, 0);
  assert.equal(state.exit.layer, 0, '第一座是热身：出口同层，不推柱也能解');
  assert.equal(state.shifts, 0);
  assert.equal(state.floors, 0);
  assert.equal(state.status, 'climbing');
  assert.equal(exitReachable(state), false, '开局不该已经通了');
  assert.equal(state.view, VIEW_TOP);
  // 「看不到出口」的根源之一：出口那一格必须在派生视图里，渲染层才画得出来。
  assert.ok(boardView(state).some((cell) => cell.isExit));
});

test('同 seed 开出同一趟 run', () => {
  assert.deepEqual(fresh(99).cube.tiles, fresh(99).cube.tiles);
  assert.notDeepEqual(fresh(99).cube.tiles, fresh(100).cube.tiles);
});

test('推移记一步、换一份新砖阵，原 state 不被改动', () => {
  const state = fresh();
  const anchor = state.player;
  const moved = shift(state, AXIS_ROW, anchor, 1);
  assert.equal(moved.shifts, 1);
  assert.equal(moved.totalShifts, 1);
  assert.notEqual(moved.cube, state.cube);
  assert.equal(state.shifts, 0);
  assert.equal(moved.effects[0].type, 'shift');
  assert.equal(moved.history.length, 1);
});

test('推柱会把玩家和出口一起带上下楼', () => {
  const state = fresh();
  // 拿出口那根柱来推：门必须跟着挪一层。
  const anchor = state.exit;
  const moved = shift(state, AXIS_PILLAR, anchor, 1);
  assert.equal(moved.exit.layer, (state.exit.layer + 1) % state.cube.order);
  assert.equal(moved.exit.col, state.exit.col);
  // 玩家那根柱推上去，玩家跟着上一层，激活层也跟着切。
  const lift = shift(state, AXIS_PILLAR, state.player, 1);
  assert.equal(lift.player.layer, (state.player.layer + 1) % state.cube.order);
  assert.equal(lift.activeLayer, lift.player.layer, '玩家换层了，看的层要跟过去');
});

test('不在被推那条线上的东西不动', () => {
  const state = fresh();
  const otherRow = { ...state.player, row: (state.player.row + 1) % state.cube.order };
  const moved = shift(state, AXIS_ROW, otherRow, 1);
  assert.deepEqual(moved.player, state.player);
});

test('撤销把砖阵、玩家、出口、步数一起退回去', () => {
  const state = fresh();
  const moved = shift(shift(state, AXIS_PILLAR, state.exit, 1), AXIS_ROW, state.player, -1);
  assert.equal(moved.shifts, 2);
  const back = undo(moved);
  assert.equal(back.shifts, 1);
  const origin = undo(back);
  assert.equal(origin.shifts, 0);
  assert.deepEqual(origin.cube.tiles, state.cube.tiles);
  assert.deepEqual(origin.player, state.player);
  assert.deepEqual(origin.exit, state.exit, '出口跟着推移走过，撤销也得跟着退回来');
  assert.equal(undo(origin), origin, '没有历史时原样返回');
  assert.equal(origin.totalShifts, 2, '累计步数不因撤销打折');
});

test('走位免费：走一步不加推移计数，也不进历史', () => {
  const state = shift(fresh(), AXIS_ROW, fresh().player, 1);
  const target = boardView(state).find((cell) => cell.reachable && !cell.isPlayer);
  if (!target) return;
  const walked = walkTo(state, target);
  assert.equal(walked.shifts, state.shifts);
  assert.equal(walked.history.length, state.history.length);
  assert.equal(walked.effects[0].type, 'walk');
});

test('走不到的格子只给 blocked，站位不变', () => {
  const state = fresh();
  const target = boardView(state).find((cell) => !cell.reachable);
  assert.ok(target, '开局总该有走不到的格子');
  const blocked = walkTo(state, target);
  assert.deepEqual(blocked.player, state.player);
  assert.equal(blocked.effects[0].type, 'blocked');
});

test('点击：能走就走，走不到就选中；再点一次取消', () => {
  const state = fresh();
  const far = boardView(state).find((cell) => !cell.reachable);
  const picked = tapCell(state, far);
  assert.deepEqual(picked.selection, { layer: far.layer, col: far.col, row: far.row });
  assert.deepEqual(tapCell(picked, far).selection, null);
  // 点自己脚下就是选中／取消
  assert.ok(selectCell(state, state.player).selection);
});

test('作用线的锚点：按住的格子优先，其次选中，最后玩家脚下', () => {
  const state = fresh();
  assert.deepEqual(shiftAnchor(state), state.player);
  const picked = selectCell(state, { layer: 0, col: 1, row: 1 });
  assert.deepEqual(shiftAnchor(picked), { layer: 0, col: 1, row: 1 });
  assert.deepEqual(shiftAnchor(picked, { layer: 2, col: 2, row: 2 }), { layer: 2, col: 2, row: 2 });
});

test('照保底解法推完就能走到出口，通关结算按爬了几层加分', () => {
  const state = fresh(31415);
  const pushed = solveTower(state);
  assert.equal(pushed.shifts, state.tower.solution.length);
  assert.equal(exitReachable(pushed), true, '保底解法推完必须通');
  const won = walkTo(pushed, pushed.exit);
  assert.equal(won.status, 'cleared');
  const climbed = floorsClimbed(state.tower.exitLayer);
  assert.equal(won.floors, climbed, '爬了几层按出口那一层算');
  assert.equal(climbed, 1, '第一座是热身塔，出口同层，只算一层');
  assert.equal(won.towersCleared, 1);
  assert.equal(won.score, towerScore(state.tower.exitLayer, pushed.shifts, state.tower.par));
  assert.ok(won.effects.some((effect) => effect.type === 'cleared'));
  assert.equal(won.best, won.score);
});

test('通关后动作被拒，只能进下一座', () => {
  const won = walkTo(solveTower(fresh(31415)), solveTower(fresh(31415)).exit);
  assert.equal(shift(won, AXIS_ROW, won.player, 1), won);
  assert.equal(undo(won), won);
  assert.equal(tapCell(won, { layer: 0, col: 0, row: 0 }), won);
  assert.equal(hint(won).move, null);
});

test('进下一座：塔号加一、本座步数清零、累计成绩带过去', () => {
  const first = fresh(31415);
  const won = walkTo(solveTower(first), solveTower(first).exit);
  const second = nextTower(won);
  assert.equal(second.towerIndex, 1);
  assert.equal(second.shifts, 0);
  assert.equal(second.status, 'climbing');
  assert.equal(second.floors, won.floors, '楼层累计跨塔带着走');
  assert.equal(second.score, won.score);
  assert.equal(second.totalShifts, won.totalShifts);
  assert.equal(second.towersCleared, 1);
  assert.notDeepEqual(second.cube.tiles, first.cube.tiles, '换塔就该换图');
});

test('没通就想进下一座：直接拒绝，不许跳塔', () => {
  const state = fresh();
  assert.equal(nextTower(state), state);
});

test('重开本座：同一张图，本座步数清零，累计成绩不动', () => {
  const state = fresh(8888);
  const moved = shift(state, AXIS_ROW, state.player, 1);
  const again = restartTower(moved);
  assert.deepEqual(again.cube.tiles, state.cube.tiles);
  assert.deepEqual(again.player, state.player);
  assert.deepEqual(again.exit, state.exit);
  assert.equal(again.shifts, 0);
  assert.equal(again.totalShifts, moved.totalShifts, '累计步数是这一趟的账，不该被重开抹掉');
});

test('重来一趟只留最高分', () => {
  const first = fresh(31415);
  const won = walkTo(solveTower(first), solveTower(first).exit);
  const again = resetRun(won, 555);
  assert.equal(again.towerIndex, 0);
  assert.equal(again.score, 0);
  assert.equal(again.floors, 0);
  assert.equal(again.best, won.score, '最高分要留住');
});

test('视角就是轴选择器：俯视推行列，侧视推行和柱，转台不推', () => {
  assert.deepEqual(axesForView(VIEW_TOP), { horizontal: AXIS_ROW, vertical: AXIS_COL });
  assert.deepEqual(axesForView(VIEW_SIDE), { horizontal: AXIS_ROW, vertical: AXIS_PILLAR });
  assert.equal(axesForView(VIEW_ORBIT), null, '转台只看不推');
  const state = fresh();
  const side = setView(state, VIEW_SIDE);
  assert.equal(side.view, VIEW_SIDE);
  assert.equal(side.effects[0].type, 'view');
  assert.equal(setView(side, VIEW_SIDE), side, '切到同一个视角原样返回');
  // 切视角要清掉选中：锚点可能在另一面上，沿用会推错线。
  const picked = selectCell(state, { layer: 0, col: 1, row: 1 });
  assert.equal(setView(picked, VIEW_ORBIT).selection, null);
});

test('看哪一层／哪一道剖面都只在范围内生效', () => {
  const state = fresh();
  const last = state.cube.order - 1;
  assert.equal(setLayer(state, last).activeLayer, last);
  assert.equal(setLayer(state, -1), state);
  assert.equal(setLayer(state, state.cube.order), state);
  assert.equal(setSlice(state, last).sliceRow, last);
  assert.equal(setSlice(state, -1), state);
  assert.deepEqual(activeFace(setLayer(state, last)), { kind: 'layer', index: last });
  assert.deepEqual(activeFace(setView(state, VIEW_SIDE)), { kind: 'slice', index: state.sliceRow });
  assert.deepEqual(activeFace(setView(state, VIEW_ORBIT)), { kind: 'orbit', index: null });
});

test('提示给得出的推法确实能推出通路', () => {
  const state = fresh(4321);
  const advice = hint(state);
  if (!advice.move) {
    assert.ok(advice.reason.length > 0, '给不出答案也要说清为什么');
    return;
  }
  const moved = shift(state, advice.move.axis, advice.move.anchor, advice.move.dir);
  assert.equal(canReach(moved.cube, moved.player, moved.exit), true);
});

test('路已通时提示明说不用再推', () => {
  const pushed = solveTower(fresh(31415));
  assert.equal(hint(pushed).move, null);
  assert.match(hint(pushed).reason, /已经通/);
});

test('派生视图每格都带齐渲染要的标记，一次给出整座塔', () => {
  const state = fresh();
  const cells = boardView(state);
  assert.equal(cells.length, state.cube.order ** 3, '一次给出整座塔，哪些该画由渲染层按视角筛');
  const player = cells.find((cell) => cell.isPlayer);
  assert.equal(player.distance, 0, '玩家脚下距离为零');
  assert.equal(player.reachable, true);
  assert.equal(cells.filter((cell) => cell.isPlayer).length, 1);
  assert.equal(cells.filter((cell) => cell.isExit).length, 1);
  assert.ok(cells.every((cell) => typeof cell.tile === 'number'));
  assert.ok(cells.some((cell) => !cell.reachable), '开局总有走不到的格子');
  // 没选中任何格子时，一格都不该被标成选中。
  assert.equal(cells.filter((cell) => cell.isSelected).length, 0);
});



