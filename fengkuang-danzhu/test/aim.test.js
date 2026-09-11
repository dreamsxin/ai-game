import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, LAUNCH_Y, MIN_AIM_ANGLE } from '../src/game/rules.js';
import { DEFAULT_AIM, aimAt, aimDegrees, clampAim, nudgeAim, previewPath } from '../src/game/aim.js';

const launcher = { x: 3.5 };

test('瞄准方向永远是朝上的单位向量', () => {
  const aim = clampAim(3, -4);
  assert.ok(Math.abs(Math.hypot(aim.x, aim.y) - 1) < 1e-9);
  assert.ok(aim.y < 0);
  assert.deepEqual(clampAim(0, 0), DEFAULT_AIM, '零向量退回正上方');
});

test('朝下或太平的方向被夹到最小仰角', () => {
  const limit = Math.sin(MIN_AIM_ANGLE);
  const down = clampAim(1, 5);
  assert.ok(Math.abs(down.y + limit) < 1e-9, '朝下会被掰成刚好过线的朝上');
  assert.ok(down.x > 0, '保留原来的左右方向');
  const flatLeft = clampAim(-9, 0);
  assert.ok(flatLeft.x < 0);
  assert.ok(Math.abs(flatLeft.y + limit) < 1e-9);
});

test('点哪指哪：从发射点指向手指位置', () => {
  const aim = aimAt(launcher, { x: 3.5, y: 2 });
  assert.ok(Math.abs(aim.x) < 1e-9);
  assert.ok(Math.abs(aim.y + 1) < 1e-9, '正上方');
  const right = aimAt(launcher, { x: 6.5, y: LAUNCH_Y - 3 });
  assert.ok(right.x > 0 && right.y < 0);
  const below = aimAt(launcher, { x: 3.5, y: LAUNCH_Y + 2 });
  assert.ok(below.y < 0, '点到发射点下方也只会朝上打');
});

test('键盘微调绕发射点转，正数往右', () => {
  const right = nudgeAim(DEFAULT_AIM, 0.3);
  assert.ok(right.x > 0);
  const left = nudgeAim(DEFAULT_AIM, -0.3);
  assert.ok(left.x < 0);
  // 一直往右拧最终停在边界，不会翻到朝下。
  let aim = DEFAULT_AIM;
  for (let i = 0; i < 30; i += 1) aim = nudgeAim(aim, 0.2);
  assert.ok(aim.y < 0);
  assert.ok(Math.abs(aim.y + Math.sin(MIN_AIM_ANGLE)) < 1e-9);
});

test('角度读数按数学习惯：正上方 90 度', () => {
  assert.equal(aimDegrees(DEFAULT_AIM), 90);
  assert.equal(aimDegrees(clampAim(1, -1)), 45);
});

test('预瞄从发射点出发，撞左右墙会折返', () => {
  const path = previewPath(launcher, clampAim(-3, -1));
  assert.deepEqual(path[0], { x: launcher.x, y: LAUNCH_Y });
  assert.ok(path.length > 2);
  assert.ok(path.every((point) => point.x >= 0 && point.x <= COLUMNS));
  assert.ok(path.some((point, i) => i > 0 && point.x <= 0.2), '应该贴到过左墙');
});

test('预瞄撞到砖块就收尾', () => {
  const blocked = previewPath(launcher, DEFAULT_AIM, (col, row) => col === 3 && row === 6);
  const tip = blocked[blocked.length - 1];
  assert.ok(tip.y > 6.9 && tip.y < 8.2, `预瞄该停在砖块下沿，实际 ${tip.y}`);
  const open = previewPath(launcher, DEFAULT_AIM);
  const top = open[open.length - 1];
  assert.ok(top.y < 0.5, '没有阻挡就一路顶到天花板');
});
