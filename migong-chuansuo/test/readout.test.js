import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_ROW, LEVELS } from '../src/game/rules.js';
import {
  CAMERA_FOV,
  TUTORIAL_STEPS,
  cameraDistance,
  coachLine,
  effectMessage,
  hintLabel,
  layerLabel,
  levelLabel,
  levelName,
  lineLabel,
  muteLabel,
  parLabel,
  progressLabel,
  pushLabel,
  recordLabel,
  rewardLabel,
  shiftLabel,
  sizeLabel,
  starLabel,
  statusLabel,
  undoLabel,
  winComment,
} from '../src/scene/readout.js';


test('关卡标题带关号和关名', () => {
  assert.equal(levelLabel(0), `第 1 关 · ${LEVELS[0].name}`);
  assert.equal(levelLabel(LEVELS.length - 1), `第 ${LEVELS.length} 关 · ${LEVELS.at(-1).name}`);
});

test('越界的关号被夹回表内，不会渲染出 undefined', () => {
  assert.equal(levelName(-3), LEVELS[0].name);
  assert.equal(levelName(99), LEVELS.at(-1).name);
});

test('步数和标准步数都露出来', () => {
  assert.equal(shiftLabel(3, 5), '3 / 5');
  assert.equal(parLabel(5), '标准 5 步');
});

test('单层不写层数，多层才写', () => {
  assert.equal(sizeLabel({ cols: 4, rows: 4, layers: 1 }), '4×4');
  assert.equal(sizeLabel({ cols: 5, rows: 4, layers: 3 }), '5×4 × 3 层');
  assert.equal(layerLabel(0, 1), '单层');
  assert.equal(layerLabel(1, 3), '第 2 / 3 层');
});

test('星级用实心和空心凑满三颗', () => {
  assert.equal(starLabel(3), '★★★');
  assert.equal(starLabel(1), '★☆☆');
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(-1), '☆☆☆');
});

test('通关评语按超出标准的幅度给，不在玩家赢了时挑刺', () => {
  assert.match(winComment(3, 5), /少 2 步/);
  assert.match(winComment(5, 5), /正好/);
  assert.match(winComment(8, 5), /多用了 3 步/);
});

test('状态文案只有两种', () => {
  assert.equal(statusLabel('playing'), '穿越中');
  assert.equal(statusLabel('won'), '已穿越');
});

test('通关时不再弹路况提示，避免和结算面板抢话', () => {
  assert.equal(effectMessage([{ type: 'open' }, { type: 'won' }]), null);
});

test('路通了和推不动各有各的提示，撤销也有回执', () => {
  assert.match(effectMessage([{ type: 'open' }]), /出口通了/);
  assert.match(effectMessage([{ type: 'blocked' }]), /还没门/);
  assert.match(effectMessage([{ type: 'undo' }]), /撤回/);
  assert.equal(effectMessage([]), null);
  assert.equal(effectMessage([{ type: 'shift' }]), null);
});

test('提示文案把行列号换成从 1 开始的说法', () => {
  assert.equal(hintLabel({ move: { axis: AXIS_ROW, index: 0, dir: 1 } }), '推第 1 行往右');
  assert.equal(hintLabel({ move: { axis: AXIS_ROW, index: 2, dir: -1 } }), '推第 3 行往左');
  assert.equal(hintLabel({ move: { axis: AXIS_COL, index: 1, dir: 1 } }), '推第 2 列往下');
  assert.equal(hintLabel({ move: { axis: AXIS_COL, index: 1, dir: -1 } }), '推第 2 列往上');
});

test('给不出提示时把原因照实说出来', () => {
  assert.equal(hintLabel({ move: null, reason: '两步内没有解，再多推几下' }), '两步内没有解，再多推几下');
  assert.equal(hintLabel(null), '提示');
  assert.equal(hintLabel({ move: null }), '提示');
});

test('撤销按钮带上可撤销的步数', () => {
  assert.equal(undoLabel(0), '撤销');
  assert.equal(undoLabel(3), '撤销 3');
});

test('只有真刷掉旧成绩才报新纪录', () => {
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), null);
});

test('总星进度带分母，玩家才知道还剩多少可拿', () => {
  assert.equal(progressLabel(0), `0 / ${LEVELS.length * 3}`);
  assert.equal(progressLabel(LEVELS.length * 3), `${LEVELS.length * 3} / ${LEVELS.length * 3}`);
});

test('星级点评按拿到几颗给，一星也不说难听话', () => {
  assert.match(rewardLabel(3), /满星/);
  assert.match(rewardLabel(2), /满星/);
  assert.notEqual(rewardLabel(2), rewardLabel(3));
  assert.ok(rewardLabel(1).length > 0);
  assert.equal(rewardLabel(0), rewardLabel(1), '零星只会在异常态出现，按一星说法兜住');
});

test('音效开关的文案把当前状态说清楚', () => {
  assert.equal(muteLabel(true), '音效已关');
  assert.equal(muteLabel(false), '音效已开');
});


test('棋盘越大相机拉得越远，层数越多抬得越高', () => {
  const small = cameraDistance(3, 3, 1);
  const large = cameraDistance(5, 5, 1);
  assert.ok(large.height > small.height);
  assert.ok(large.back > small.back);
  assert.ok(cameraDistance(4, 4, 3).height > cameraDistance(4, 4, 1).height);
});

test('竖屏要把机位推更远，否则左右两列会被切出画面', () => {
  const square = cameraDistance(7, 7, 4, 1);
  const portrait = cameraDistance(7, 7, 4, 0.46);
  assert.ok(portrait.height > square.height, '窄屏该拉得更远');
  assert.ok(portrait.back > square.back);
  // 只许整体推远，不许把机位角度改掉，否则俯视感每换一个屏幕就变一次。
  const ratio = (view) => view.height / view.back;
  assert.ok(Math.abs(ratio(portrait) - ratio(square)) < 1e-9);

  // 真的装得下：拿该距离下的水平半视野和半个棋盘宽比一比（7 列的一半是 3.5）。
  const reach = (view, aspect) =>
    Math.hypot(view.height, view.back) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180) * aspect;
  assert.ok(reach(portrait, 0.46) >= 3.5, `竖屏只覆盖到 ${reach(portrait, 0.46).toFixed(2)}，装不下 7 列`);

  // 宽屏本来就装得下，不该被无谓地推远。
  assert.deepEqual(cameraDistance(5, 5, 1, 2), cameraDistance(5, 5, 1, 1.4));
});

test('作用行列的文案从 1 开始数，和十字键上写的一致', () => {
  assert.equal(lineLabel({ layer: 0, col: 0, row: 0 }), '行 1 · 列 1');
  assert.equal(lineLabel({ layer: 1, col: 3, row: 2 }), '行 3 · 列 4');
});

test('推移方向的说法和屏幕方向对得上', () => {
  assert.equal(pushLabel(AXIS_ROW, 1), '整行右移');
  assert.equal(pushLabel(AXIS_ROW, -1), '整行左移');
  assert.equal(pushLabel(AXIS_COL, 1), '整列下移');
  assert.equal(pushLabel(AXIS_COL, -1), '整列上移');
});

test('新手引导五步讲完，每步都有标题和说明', () => {
  assert.equal(TUTORIAL_STEPS.length, 5);
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.title.length > 0);
    assert.ok(step.detail.length > 8, `「${step.title}」的说明太短`);
  }
});

test('新手提示只在第一关且还没推过的时候出现', () => {
  const start = { status: 'playing', levelIndex: 0, shifts: 0 };
  assert.match(coachLine(start), /横滑/);
  assert.equal(coachLine({ ...start, shifts: 1 }), null, '推过一步就不该再教了');
  assert.equal(coachLine({ ...start, levelIndex: 1 }), null, '第二关不该再教');
  assert.equal(coachLine({ ...start, status: 'won' }), null);
});
