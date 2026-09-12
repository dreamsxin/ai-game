import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_PILLAR, AXIS_ROW } from '../src/game/rules.js';
import { GHOST_SCALE, drawModeFor, lineHasCell, materialNameFor, poolBudget } from '../src/scene/frame.js';

const cell = (layer, col, row, extra = {}) => ({
  layer, col, row, tile: 0, reachable: false, isPlayer: false, isExit: false, isSelected: false, ...extra,
});

const topFrame = (over = {}) => ({
  clip: 'focus', activeLayer: 0, sliceRow: 1, exitLayer: 2, selection: null, axes: null, anchor: null, ...over,
});

test('俯视：激活层画实的，其余层不画', () => {
  const frame = topFrame();
  assert.equal(drawModeFor(frame, cell(0, 1, 1)), 'solid');
  assert.equal(drawModeFor(frame, cell(1, 1, 1)), 'hidden', '中间那层挡视线，不画');
});

test('俯视：出口整层画成幽灵 —— 只画出口那一格看不出通向它的路', () => {
  const frame = topFrame();
  assert.equal(drawModeFor(frame, cell(2, 0, 0)), 'ghost');
  assert.equal(drawModeFor(frame, cell(2, 2, 2, { isExit: true })), 'ghost');
});

test('侧视：只有选中那一排剖面是实的', () => {
  const frame = topFrame({ clip: 'slice' });
  assert.equal(drawModeFor(frame, cell(0, 0, 1)), 'solid');
  assert.equal(drawModeFor(frame, cell(2, 2, 1)), 'solid', '剖面是竖着切的，跨层都算');
  assert.equal(drawModeFor(frame, cell(0, 0, 0)), 'hidden');
});

test('铁律：出口和玩家那一格永远至少是幽灵，任何视角都不许藏', () => {
  // 侧视里出口不在选中那一排 —— 第一版就是这样把出口的砖弄没的。
  const side = topFrame({ clip: 'slice', sliceRow: 1 });
  assert.equal(drawModeFor(side, cell(2, 2, 0, { isExit: true })), 'ghost');
  assert.equal(drawModeFor(side, cell(0, 0, 0, { isPlayer: true })), 'ghost');
  // 俯视里玩家被推到别的层去了，也一样保底。
  const top = topFrame({ activeLayer: 0 });
  assert.equal(drawModeFor(top, cell(1, 1, 1, { isPlayer: true })), 'ghost');
  // 转台全是实的，用不着保底。
  const orbit = topFrame({ clip: 'none' });
  assert.equal(drawModeFor(orbit, cell(1, 1, 1)), 'solid');
  assert.equal(drawModeFor(orbit, cell(2, 2, 2, { isExit: true })), 'solid');
});

test('出口和玩家同格时也只是幽灵，不会因为两条规则打架变成别的', () => {
  const frame = topFrame({ clip: 'slice', sliceRow: 0 });
  assert.equal(drawModeFor(frame, cell(2, 2, 2, { isExit: true, isPlayer: true })), 'ghost');
});

test('材质优先级：幽灵 > 选中 > 作用线 > 走得到 > 走不到', () => {
  const anchor = { layer: 0, col: 1, row: 1 };
  const axes = { horizontal: AXIS_ROW, vertical: AXIS_COL };
  const frame = topFrame({ axes, anchor, selection: { layer: 0, col: 2, row: 2 } });

  // 幽灵压过一切：它本来就不是你在操作的那一面。
  assert.equal(materialNameFor(frame, cell(0, 2, 2, { reachable: true }), 'ghost'), 'ghost');
  // 选中的那一格
  assert.equal(materialNameFor(frame, cell(0, 2, 2), 'solid'), 'picked');
  // 作用线上的（锚点同行或同列）
  assert.equal(materialNameFor(frame, cell(0, 0, 1), 'solid'), 'line', '同一行');
  assert.equal(materialNameFor(frame, cell(0, 1, 0), 'solid'), 'line', '同一列');
  // 走得到 / 走不到垫在最底下 —— 这是判断路通没通的唯一线索
  assert.equal(materialNameFor(frame, cell(0, 0, 0, { reachable: true }), 'solid'), 'near');
  assert.equal(materialNameFor(frame, cell(0, 0, 0), 'solid'), 'far');
});

test('转台没有作用线，不该把整座塔描成琥珀色', () => {
  const frame = topFrame({ clip: 'none', axes: null, anchor: { layer: 0, col: 1, row: 1 } });
  assert.equal(materialNameFor(frame, cell(0, 0, 1, { reachable: true }), 'solid'), 'near');
});

test('侧视的作用线含柱：一根柱在剖面里是竖着的一排', () => {
  const anchor = { layer: 1, col: 1, row: 1 };
  const frame = topFrame({ clip: 'slice', axes: { horizontal: AXIS_ROW, vertical: AXIS_PILLAR }, anchor });
  assert.equal(materialNameFor(frame, cell(0, 1, 1), 'solid'), 'line', '同一根柱，层号不同也在线上');
  assert.equal(materialNameFor(frame, cell(0, 0, 1), 'solid'), 'far', '不同列不在这根柱上');
});

test('lineHasCell 三条轴各看哪两维，锚点缺失一律不算', () => {
  const anchor = { layer: 1, col: 2, row: 3 };
  assert.equal(lineHasCell(AXIS_ROW, anchor, cell(1, 0, 3)), true);
  assert.equal(lineHasCell(AXIS_ROW, anchor, cell(0, 0, 3)), false, '层号不同');
  assert.equal(lineHasCell(AXIS_COL, anchor, cell(1, 2, 0)), true);
  assert.equal(lineHasCell(AXIS_PILLAR, anchor, cell(0, 2, 3)), true, '柱跨层');
  assert.equal(lineHasCell(AXIS_ROW, null, cell(1, 0, 3)), false);
  assert.equal(lineHasCell(null, anchor, cell(1, 0, 3)), false);
});

test('mesh 池按全画的上界开，幽灵最多再叠一层也超不出去', () => {
  for (const order of [3, 4, 5, 6]) {
    const budget = poolBudget(order);
    assert.equal(budget, order ** 3);
    // 俯视最坏情况：激活层 + 出口整层 + 保底的玩家那一格，远小于上界。
    assert.ok(budget >= order * order * 2 + 1, `${order} 阶的池不够画激活层加出口层`);
  }
  assert.ok(GHOST_SCALE > 0 && GHOST_SCALE < 1, '幽灵得比实层小才读得出前后');
});
