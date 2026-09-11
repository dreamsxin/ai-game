import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, COLUMNS, FLOOR_Y } from '../src/game/rules.js';
import { advanceBall, advanceBalls, keepVertical, pullDown, speedOf } from '../src/game/physics.js';

const ball = (over = {}) => ({ x: 3.5, y: 8, vx: 0, vy: -14, ...over });
const emptyWorld = (over = {}) => ({ occupied: () => false, hit: () => ({ pass: false }), ...over });

test('撞左右墙和天花板都原速反弹', () => {
  const left = advanceBall(ball({ x: BALL_RADIUS + 0.05, vx: -14, vy: -1 }), 1 / 60, emptyWorld());
  assert.ok(left.ball.vx > 0);
  assert.ok(left.ball.x >= BALL_RADIUS - 1e-9);

  const right = advanceBall(ball({ x: COLUMNS - BALL_RADIUS - 0.05, vx: 14, vy: -1 }), 1 / 60, emptyWorld());
  assert.ok(right.ball.vx < 0);

  const top = advanceBall(ball({ y: BALL_RADIUS + 0.05, vx: 1, vy: -14 }), 1 / 60, emptyWorld());
  assert.ok(top.ball.vy > 0);
  assert.ok(Math.abs(speedOf(top.ball) - Math.hypot(1, 14)) < 1e-9);
});

test('落到地面下方标成 landed', () => {
  const flight = advanceBall(ball({ y: FLOOR_Y, vy: 14 }), 0.2, emptyWorld());
  assert.equal(flight.ball.landed, true);
});

test('撞砖反弹并把命中格报给上层', () => {
  const hits = [];
  const flight = advanceBall(ball({ x: 3.5, y: 3.3, vy: -14 }), 1 / 60, {
    occupied: (col, row) => col === 3 && row === 2,
    hit: (col, row) => {
      hits.push({ col, row });
      return { pass: false };
    },
  });
  assert.deepEqual(hits, [{ col: 3, row: 2 }]);
  assert.ok(flight.ball.vy > 0);
});

test('不挡路的格子直接穿过去', () => {
  const occupied = new Set(['3,2', '3,1']);
  const flight = advanceBall(ball({ x: 3.5, y: 3.3, vy: -14 }), 1 / 5, {
    occupied: (col, row) => occupied.has(`${col},${row}`),
    hit: (col, row) => {
      occupied.delete(`${col},${row}`);
      return { pass: true };
    },
  });
  assert.equal(flight.hits, 2);
  assert.ok(flight.ball.vy < 0, '穿过去不改方向');
});

test('再快的弹珠也不会跳过一格砖', () => {
  const hits = [];
  const flight = advanceBall(ball({ x: 3.5, y: 6, vy: -60 }), 0.1, {
    occupied: (col, row) => col === 3 && row === 3,
    hit: (col, row) => {
      hits.push({ col, row });
      return { pass: false };
    },
  });
  assert.equal(hits.length, 1);
  assert.ok(flight.ball.vy > 0);
});

test('竖直分量过小会被掰回最小仰角，速度不变', () => {
  const fixed = keepVertical(14, 0.1);
  assert.ok(Math.abs(fixed.vy) > 0.1);
  assert.ok(Math.abs(Math.hypot(fixed.vx, fixed.vy) - Math.hypot(14, 0.1)) < 1e-9);
  assert.deepEqual(keepVertical(3, -9), { vx: 3, vy: -9 }, '够斜就不动');
  assert.deepEqual(keepVertical(0, 0), { vx: 0, vy: 0 });
});

test('超时拉拽把弹珠压成向下', () => {
  const pulled = pullDown(ball({ vy: -14 }));
  assert.ok(pulled.vy > 0);
  const flat = pullDown(ball({ vx: 14, vy: 0 }));
  assert.ok(flat.vy > 0, '横着飞的也会被拽下来');
});

test('一帧推进所有弹珠，落地的单独挑出来', () => {
  const balls = [ball({ y: 8, vy: -14 }), ball({ y: FLOOR_Y, vy: 14 }), ball({ y: FLOOR_Y, vy: 14, x: 1 })];
  const result = advanceBalls(balls, 0.2, emptyWorld());
  assert.equal(result.balls.length, 1);
  assert.equal(result.landed.length, 2);
  assert.equal(result.landed[0].x, 3.5, '落地顺序按输入顺序，结果可复现');
});

test('开启拉拽后所有在飞的弹珠都朝下', () => {
  const result = advanceBalls([ball({ vy: -14 }), ball({ x: 2, vx: 14, vy: 0 })], 1 / 60, emptyWorld(), { pull: true });
  assert.ok(result.balls.every((b) => b.vy > 0));
});
