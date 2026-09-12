import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_PILLAR, AXIS_ROW, VIEW_ORBIT, VIEW_SIDE, VIEW_TOP } from '../src/game/rules.js';
import {
  REVEAL_PAUSE,
  clamp01,
  clearRevealDelay,
  easeOutCubic,
  mix,
  slideCell,
  slidePositions,
  walkDuration,
  walkPoint,
} from '../src/scene/motion.js';
import {
  CAMERA_FOV,
  SWIPE_THRESHOLD,
  TUTORIAL_STEPS,
  cameraFor,
  cellPosition,
  clearRemark,
  coachLine,
  effectMessage,
  faceLabel,
  fitDistance,
  floorsLabel,
  gainLabel,
  gestureLabel,
  gestureShift,
  hintLabel,
  nextTowerLabel,
  orderLabel,
  shiftsLabel,
  statusLabel,
  towerLabel,
  undoLabel,
  whereLabel,
} from '../src/scene/readout.js';

const CELL = (layer, col, row) => ({ layer, col, row });
const shiftAnim = (over = {}) => ({ kind: 'shift', axis: AXIS_ROW, anchor: CELL(1, 0, 2), dir: 1, ...over });

test('阶数说成「三阶」这种玩魔方的人一看就懂的说法', () => {
  assert.equal(orderLabel(3), '三阶');
  assert.equal(orderLabel(6), '六阶');
});

test('顶栏三行字：第几座、爬了多少层、这一座推了几步', () => {
  const state = {
    towerIndex: 2,
    tower: { order: 4, par: 7 },
    floors: 6,
    shifts: 3,
    status: 'climbing',
    history: [],
  };
  assert.equal(towerLabel(state), '第 3 座 · 四阶');
  assert.equal(floorsLabel(state), '已爬 6 层');
  assert.equal(shiftsLabel(state), '3 / 7');
  assert.equal(statusLabel(state), '穿越中');
  assert.equal(statusLabel({ ...state, status: 'cleared' }), '这一座通了');
  assert.equal(undoLabel(state), '撤销');
  assert.equal(undoLabel({ ...state, history: [1, 2] }), '撤销 2');
});

test('在操作哪一面：俯视说层，侧视说剖面，转台说整座塔', () => {
  const base = { view: VIEW_TOP, activeLayer: 1, sliceRow: 2 };
  assert.equal(faceLabel(base), '第 2 层');
  assert.equal(faceLabel({ ...base, view: VIEW_SIDE }), '剖面 · 第 3 排');
  assert.equal(faceLabel({ ...base, view: VIEW_ORBIT }), '整座塔');
});

test('每个视角都写清横滑竖滑各推什么，转台明说推不了', () => {
  assert.match(gestureLabel(VIEW_TOP), /推行.*推列/);
  assert.match(gestureLabel(VIEW_SIDE), /推行.*推柱/);
  assert.match(gestureLabel(VIEW_ORBIT), /只看/);
});

test('一次动作只出一条提示，取最有信息量的那条', () => {
  assert.equal(effectMessage([{ type: 'shift' }, { type: 'open' }]), '路通了，点出口走过去');
  assert.match(effectMessage([{ type: 'open' }, { type: 'cleared' }]), /登顶/);
  assert.match(effectMessage([{ type: 'blocked' }]), /还没通/);
  assert.equal(effectMessage([{ type: 'shift' }]), null, '普通推移不刷屏');
  assert.equal(effectMessage([]), null);
});

test('提示文案说清推哪条线、往哪推；柱要说清是上还是下', () => {
  assert.equal(hintLabel(null), '提示');
  assert.equal(hintLabel({ move: null, reason: '路已经通了' }), '路已经通了');
  const row = hintLabel({ move: { axis: AXIS_ROW, anchor: CELL(0, 0, 1), dir: 1 } });
  assert.match(row, /第 1 层第 2 行.*往右/);
  const col = hintLabel({ move: { axis: AXIS_COL, anchor: CELL(1, 2, 0), dir: -1 } });
  assert.match(col, /第 2 层第 3 列.*往前/);
  const pillar = hintLabel({ move: { axis: AXIS_PILLAR, anchor: CELL(0, 1, 2), dir: 1 } });
  assert.match(pillar, /第 2 列第 3 排那根柱.*往上/, '柱是跨层的，不能说成第几层');
});

test('引导八步讲完，热身塔、柱、视角和怎么读砖面各占一步 —— 不讲清楚玩家会当成 bug', () => {
  assert.equal(TUTORIAL_STEPS.length, 8);
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.title.length > 0);
    assert.ok(step.detail.length > 10, `「${step.title}」的说明太短`);
  }
  assert.ok(TUTORIAL_STEPS.some((step) => step.detail.includes('柱')));
  assert.ok(TUTORIAL_STEPS.some((step) => step.detail.includes('视角')));
  assert.ok(TUTORIAL_STEPS.some((step) => step.detail.includes('脚下')), '得说清第一座出口就在同层');
  // 玩家最初的困惑是「出口被封起来了」：砖面画的是路线，得有一步专门教怎么读。
  assert.ok(
    TUTORIAL_STEPS.some((step) => step.detail.includes('亮线')),
    '得说清亮线接上才算通',
  );
  assert.ok(
    TUTORIAL_STEPS.some((step) => step.detail.includes('绿')),
    '竖向连接是绿的，这是唯一能区分上下门的线索',
  );
  assert.ok(
    TUTORIAL_STEPS.some((step) => step.detail.includes('走位')),
    '只有推砖计步这件事不能漏',
  );
});

test('前两座各贴一句针对性的话：第一座教推行列，第二座教推柱', () => {
  const start = { status: 'climbing', towerIndex: 0, shifts: 0 };
  assert.match(coachLine(start), /这一层/, '第一座出口同层，先只教平面推移');
  assert.match(coachLine({ ...start, towerIndex: 1 }), /柱/, '第二座出口在楼上，该教柱了');
  assert.equal(coachLine({ ...start, towerIndex: 2 }), null, '第三座起不再唠叨');
  assert.equal(coachLine({ ...start, shifts: 1 }), null, '推过一下就收起来');
  assert.equal(coachLine({ ...start, status: 'cleared' }), null);
});

test('顶栏那行字直接回答「出口在哪」——「看不到出口」得先有个文字答案', () => {
  const base = { player: { layer: 0, col: 0, row: 0 }, exit: { layer: 2, col: 1, row: 1 } };
  assert.match(whereLabel(base), /你在第 1 层.*出口在第 3 层/);
  assert.match(
    whereLabel({ ...base, exit: { layer: 0, col: 2, row: 2 } }),
    /同在第 1 层/,
    '同层时不该说两遍层号',
  );
});


test('通关点评：不超打乱步数才夸，超了也不说难听话', () => {
  assert.match(clearRemark({ shifts: 6, par: 7, order: 3, gained: 500 }), /利落/);
  assert.match(clearRemark({ shifts: 9, par: 7, order: 3, gained: 300 }), /差 2 步/);
  assert.match(clearRemark({ shifts: 20, par: 7, order: 3, gained: 300 }), /少绕几圈/);
  assert.equal(clearRemark(null), '');
  assert.equal(gainLabel({ climbed: 4, gained: 600 }), '+4 层 · +600 分');
  assert.equal(gainLabel({ climbed: 1, gained: 300 }), '+1 层 · +300 分', '热身塔只算一层');
});

test('下一座会不会升阶是问配方表，不是拿 index 猜', () => {
  // 前两座是热身塔，都是三阶；第 3、4 座还是三阶，第 5 座才升四阶。
  assert.match(nextTowerLabel({ towerIndex: 0, tower: { order: 3 } }), /^进第 2 座$/);
  assert.match(nextTowerLabel({ towerIndex: 2, tower: { order: 3 } }), /^进第 4 座$/);
  assert.match(nextTowerLabel({ towerIndex: 3, tower: { order: 3 } }), /升到四阶/);
  assert.match(nextTowerLabel({ towerIndex: 20, tower: { order: 6 } }), /^进第 22 座$/, '六阶封顶不再说升阶');
});

test('取景两边都算：竖屏比例下光按高度取会横向溢出', () => {
  assert.equal(CAMERA_FOV, 50);
  const tall = fitDistance(6, 6, 0.46);
  const square = fitDistance(6, 6, 1);
  assert.ok(tall > square, '窄屏必须退得更远');
  // 高的画面按高度取景，宽的按宽度取景。
  assert.ok(fitDistance(2, 10, 1) > fitDistance(2, 4, 1));
  assert.equal(fitDistance(6, 6, 0), fitDistance(6, 6, 0.2), 'aspect 为 0 也不该除爆');
});

test('三个视角各给相机位置、目标和裁剪策略', () => {
  const top = cameraFor(VIEW_TOP, 4, 0.46);
  assert.equal(top.clip, 'focus', '俯视画激活层 + 出口那一层的幽灵，不能把出口整层藏起来');
  assert.ok(top.position[1] > 0 && top.position[2] > 0, '压成仰角，纯垂直看不见砖侧面的门');
  const side = cameraFor(VIEW_SIDE, 4, 0.46);
  assert.equal(side.clip, 'slice');
  assert.ok(Math.abs(side.position[0]) < 1e-9, '侧视正对着剖面');
  const orbit = cameraFor(VIEW_ORBIT, 4, 0.46, 0);
  assert.equal(orbit.clip, 'none', '转台要看得见整座塔');
  const spun = cameraFor(VIEW_ORBIT, 4, 0.46, Math.PI / 2);
  assert.notDeepEqual(orbit.position, spun.position, '转台会转');
  // 阶数越大退得越远，六阶不能溢出屏幕。
  assert.ok(cameraFor(VIEW_ORBIT, 6, 0.46).position[1] > cameraFor(VIEW_ORBIT, 3, 0.46).position[1]);
});

test('滑动到轴的映射：俯视往下滑是 row 加，侧视往上滑才是 layer 加', () => {
  // 横滑在两个视角里都是推行，符号一致。
  assert.deepEqual(gestureShift(VIEW_TOP, 60, 4), { axis: AXIS_ROW, dir: 1 });
  assert.deepEqual(gestureShift(VIEW_SIDE, -60, 4), { axis: AXIS_ROW, dir: -1 });
  // 竖滑的符号是反的：这一处搞错会让「推柱」整个反向。
  assert.deepEqual(gestureShift(VIEW_TOP, 4, 60), { axis: AXIS_COL, dir: 1 }, '俯视往下滑 = row 加');
  assert.deepEqual(gestureShift(VIEW_TOP, 4, -60), { axis: AXIS_COL, dir: -1 });
  assert.deepEqual(gestureShift(VIEW_SIDE, 4, -60), { axis: AXIS_PILLAR, dir: 1 }, '侧视往上滑 = layer 加');
  assert.deepEqual(gestureShift(VIEW_SIDE, 4, 60), { axis: AXIS_PILLAR, dir: -1 });
  // 转台不推；没滑够距离算点击不算滑动。
  assert.equal(gestureShift(VIEW_ORBIT, 60, 4), null);
  assert.equal(gestureShift(VIEW_TOP, 5, 5), null, `没超过 ${SWIPE_THRESHOLD}px 就是点击`);
});

test('格子坐标以塔心为原点，三视角共用一套', () => {
  assert.deepEqual(cellPosition(3, CELL(1, 1, 1)), [0, 0, 0], '正中那格就是原点');
  const [x] = cellPosition(3, CELL(1, 2, 1));
  assert.ok(x > 0);
  const [, y] = cellPosition(3, CELL(2, 1, 1));
  assert.ok(y > 0, '层号越大越高');
});

test('推移插值：停下来落在自己格上，开始时还在来处', () => {
  const cell = CELL(1, 2, 2);
  assert.deepEqual(slideCell(cell, shiftAnim(), 4, 1), { ...cell, col: 2 });
  assert.deepEqual(slideCell(cell, shiftAnim(), 4, 0), { ...cell, col: 1 });
  assert.equal(slideCell(CELL(1, 2, 0), shiftAnim(), 4, 0.5), null, '不在这一行上');
  assert.equal(slideCell(CELL(0, 2, 2), shiftAnim(), 4, 0.5), null, '不在这一层上');
  assert.equal(slideCell(cell, null, 4, 0.5), null);
  assert.equal(slideCell(cell, { kind: 'walk' }, 4, 0.5), null);
});

test('推柱的插值改的是 layer，中途真的卡在两层之间', () => {
  const cell = CELL(1, 2, 3);
  const anim = shiftAnim({ axis: AXIS_PILLAR, anchor: CELL(0, 2, 3), dir: 1 });
  assert.deepEqual(slideCell(cell, anim, 4, 1), cell);
  const mid = slideCell(cell, anim, 4, 0.5);
  assert.equal(mid.col, 2);
  assert.ok(mid.layer > 0 && mid.layer < 1, `中途该在 0~1 之间，实际 ${mid.layer}`);
});

test('绕回那块要画两次，否则边上会空一格', () => {
  const { positions, ghost } = slidePositions(3, 1, 0.5);
  assert.equal(positions.length, 3);
  assert.ok(ghost, '往右推时第 0 块是从界外进来的，得有影子');
  assert.equal(ghost.index, 0);
  assert.equal(slidePositions(3, 1, 1).positions[1], 1, '推完就落在自己格上');
});

test('基础插值该有的边界', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(9), 1);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(mix(2, 4, 0.5), 3);
});

test('走位插值走完停在终点，跨格时有跳跃', () => {
  const path = [CELL(0, 0, 0), CELL(0, 1, 0), CELL(1, 1, 0)];
  assert.equal(walkPoint([], 0.5), null);
  assert.deepEqual(walkPoint([path[0]], 0.5), { from: path[0], to: path[0], t: 1, hop: 0 });
  const mid = walkPoint(path, 0.25);
  assert.deepEqual(mid.from, path[0]);
  assert.ok(mid.hop > 0);
  const end = walkPoint(path, 1);
  assert.deepEqual(end.to, path[2]);
  assert.equal(walkDuration(path, 0.1), 0.2);
});

test('结算面板要等角色真走到再弹', () => {
  const path = [CELL(0, 0, 0), CELL(0, 1, 0), CELL(0, 2, 0)];
  const delay = clearRevealDelay([{ type: 'walk', path }, { type: 'cleared' }], 0.1);
  assert.ok(delay > walkDuration(path, 0.1));
  assert.ok(Math.abs(delay - (0.2 + REVEAL_PAUSE)) < 1e-9);
  assert.equal(clearRevealDelay([{ type: 'cleared' }], 0.1), REVEAL_PAUSE);
  assert.equal(clearRevealDelay(undefined), REVEAL_PAUSE);
});

