import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, COLUMNS, FIELD_ROWS, PADDLE_WIDTH, PADDLE_Y } from '../src/game/rules.js';
import { advanceBall, ballSpeed, clampPaddle, keepAngle, paddleBounce } from '../src/game/physics.js';

const ball = (over = {}) => ({ x: 4.5, y: 8, vx: 0, vy: 6, color: 'rose', ...over });
const emptyWorld = (over = {}) => ({ occupied: () => false, hit: () => ({ pass: false }), ...over });

test('挡板夹在场地内，半个挡板宽是极限', () => {
  assert.equal(clampPaddle(-3), PADDLE_WIDTH / 2);
  assert.equal(clampPaddle(99), COLUMNS - PADDLE_WIDTH / 2);
  assert.equal(clampPaddle(4.5), 4.5);
});

test('挡板正中接球垂直弹回，速度大小不变', () => {
  const b = ball({ x: 4.5, y: PADDLE_Y, vy: 8 });
  const bounced = paddleBounce(b, { x: 4.5 });
  assert.ok(Math.abs(bounced.vx) < 1e-9);
  assert.ok(bounced.vy < 0, '永远朝上');
  assert.ok(Math.abs(Math.hypot(bounced.vx, bounced.vy) - 8) < 1e-9);
});

test('接球点越偏角度越斜，方向跟着偏', () => {
  const b = ball({ y: PADDLE_Y, vy: 8 });
  const right = paddleBounce({ ...b, x: 5.5 }, { x: 4.5 });
  const left = paddleBounce({ ...b, x: 3.5 }, { x: 4.5 });
  assert.ok(right.vx > 0);
  assert.ok(left.vx < 0);
  assert.ok(Math.abs(right.vx) > 1, '偏到边上应该明显斜出去');
});

test('竖直分量过小会被掰回最小仰角，总速度不变', () => {
  const fixed = keepAngle(10, 0.2);
  assert.ok(Math.abs(fixed.vy) > 0.2);
  assert.ok(Math.abs(Math.hypot(fixed.vx, fixed.vy) - Math.hypot(10, 0.2)) < 1e-9);
  const kept = keepAngle(3, 4);
  assert.deepEqual(kept, { vx: 3, vy: 4 }, '够斜就不动');
});

test('纯垂直的球会被推出一点横向分量，方向朝场地中央', () => {
  const left = keepAngle(0, -9, 1);
  assert.ok(left.vx > 0, '左半场朝右推');
  assert.ok(Math.abs(Math.hypot(left.vx, left.vy) - 9) < 1e-9, '只改方向不改速度');
  const right = keepAngle(0, 9, -1);
  assert.ok(right.vx < 0);
  assert.deepEqual(keepAngle(0, 0), { vx: 0, vy: 0 }, '静止的球不动');
});

test('撞左右墙和顶墙都原速反弹', () => {
  const left = advanceBall(ball({ x: BALL_RADIUS + 0.05, vx: -8, vy: 0.1 }), { x: 4.5 }, 1 / 60, emptyWorld());
  assert.ok(left.ball.vx > 0);
  assert.ok(left.ball.x >= BALL_RADIUS - 1e-9);
  assert.equal(left.wallHits, 1);

  const top = advanceBall(ball({ y: BALL_RADIUS + 0.05, vx: 0.1, vy: -8 }), { x: 4.5 }, 1 / 60, emptyWorld());
  assert.ok(top.ball.vy > 0);
  assert.ok(Math.abs(ballSpeed(top.ball) - ballSpeed(ball({ vx: 0.1, vy: -8 }))) < 1e-9);
});

test('掉到场地下方算丢球', () => {
  const flight = advanceBall(ball({ y: FIELD_ROWS, vy: 12 }), { x: 0 }, 0.2, emptyWorld());
  assert.equal(flight.lost, true);
});

test('接住的球换成挡板上膛的颜色', () => {
  const flight = advanceBall(
    ball({ x: 4.5, y: PADDLE_Y - BALL_RADIUS - 0.02, vy: 8 }),
    { x: 4.5 },
    1 / 60,
    emptyWorld({ paddle: () => 'azure' }),
  );
  assert.equal(flight.paddleHits, 1);
  assert.equal(flight.ball.color, 'azure');
  assert.ok(flight.ball.vy < 0);
  assert.equal(flight.lost, false);
});

test('挡板没接到就漏过去', () => {
  const flight = advanceBall(
    ball({ x: 1, y: PADDLE_Y - BALL_RADIUS - 0.02, vy: 8 }),
    { x: 7 },
    1 / 60,
    emptyWorld(),
  );
  assert.equal(flight.paddleHits, 0);
});

test('撞到弹珠会反弹，并把命中格报给上层', () => {
  const hits = [];
  const flight = advanceBall(ball({ x: 4.5, y: 3.4, vx: 0, vy: -9 }), { x: 4.5 }, 1 / 60, {
    occupied: (col, row) => col === 4 && row === 2,
    hit: (col, row) => {
      hits.push({ col, row });
      return { pass: false };
    },
  });
  assert.deepEqual(hits, [{ col: 4, row: 2 }]);
  assert.ok(flight.ball.vy > 0, '从下往上撞应该被顶回来');
  assert.ok(flight.ball.y >= 3, '球被推到格子外面');
});

test('整组被消掉时球直接穿过去继续往前', () => {
  const occupied = new Set(['4,2', '4,1']);
  const flight = advanceBall(ball({ x: 4.5, y: 3.2, vx: 0, vy: -9 }), { x: 4.5 }, 1 / 6, {
    occupied: (col, row) => occupied.has(`${col},${row}`),
    hit: (col, row) => {
      occupied.delete(`${col},${row}`);
      return { pass: true };
    },
  });
  assert.equal(flight.marbleHits, 2, '一趟里连着穿了两格');
  assert.ok(flight.ball.vy < 0, '穿过去不改方向');
  assert.ok(flight.ball.y < 2, '继续往上钻');
});

test('再快的球也不会跳过一格弹珠', () => {
  const hits = [];
  const flight = advanceBall(ball({ x: 4.5, y: 5, vx: 0, vy: -40 }), { x: 4.5 }, 0.1, {
    occupied: (col, row) => col === 4 && row === 3,
    hit: (col, row) => {
      hits.push({ col, row });
      return { pass: false };
    },
  });
  assert.equal(hits.length, 1, '一格挡在路上就必须结算，不能穿过去');
  assert.ok(flight.ball.vy > 0, '撞完要被弹回来');
});
