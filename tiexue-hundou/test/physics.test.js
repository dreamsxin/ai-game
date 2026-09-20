import test from 'node:test';
import assert from 'node:assert/strict';
import { bulletBlocked, isGrounded, moveBody, overlap, walkStep } from '../src/game/physics.js';

// 6 行 8 列的小场地：第 2 行是一段单向钢架，第 4～5 行是地面，第 3 行放一段墙。
const ROWS = [
  '        ',
  '        ',
  '  ----  ',
  '      = ',
  '########',
  '########',
];
const grid = ROWS.map((row) => Array.from(row));
const body = (x, y, vx = 0, vy = 0) => ({ x, y, w: 0.7, h: 1.5, vx, vy });

const run = (start, options = {}, frames = 120) => {
  let current = start;
  let last = null;
  for (let i = 0; i < frames; i += 1) {
    last = moveBody(grid, current, 1 / 60, options);
    current = last.body;
    if (last.hit.down || last.hit.up) break;
  }
  return { body: current, hit: last.hit };
};

test('从下往上跳能穿过单向钢架', () => {
  const out = run(body(3, 2.5, 0, -15));
  assert.equal(out.hit.up, false, '钢架不该把人顶回去');
  assert.ok(out.body.y + out.body.h < 2, `应该整个人都升到钢架上方，实际 y=${out.body.y}`);
});

test('落下来能站在钢架上，而且脚正好停在钢架上沿', () => {
  const out = run(body(3, 0.2, 0, 6));
  assert.equal(out.hit.down, true);
  assert.ok(Math.abs(out.body.y + out.body.h - 2) < 1e-6, `脚应停在 y=2，实际 ${out.body.y + out.body.h}`);
});

test('按住下键（dropping）时钢架不再挡人，可以漏到下一层', () => {
  const out = run(body(3, 0.5, 0, 6), { dropping: true });
  assert.equal(out.hit.down, true, '最终应该落到地面上');
  assert.ok(Math.abs(out.body.y + out.body.h - 4) < 1e-6, '落点应该是地面而不是钢架');
});

test('横向撞墙会贴边停下', () => {
  const moved = moveBody(grid, body(5.6, 2.5, 6, 0), 1 / 60);
  assert.equal(moved.hit.right, true);
  assert.ok(Math.abs(moved.body.x + moved.body.w - 6) < 1e-6);
  assert.equal(moved.body.vx, 0);
});

test('站在钢架上算落地，悬在空中不算', () => {
  assert.equal(isGrounded(grid, body(3, 0.5)), true);
  assert.equal(isGrounded(grid, body(3, 0.2)), false);
  assert.equal(isGrounded(grid, body(1, 2.5)), true, '站在地面上');
});

test('走到平台边缘会转身，不会自己走下去', () => {
  // 敌人身上一直有重力，所以这一帧必然是「落地的那一帧」，转身判定就挂在这上面。
  const walker = { ...body(5.2, 0.49, 2.4, 2), dir: 1 };
  const out = walkStep(grid, walker, 1 / 60);
  assert.equal(out.hit.down, true);
  assert.equal(out.body.dir, -1, '前面没路了就该转回来');
});


test('子弹被实心瓦片挡住，但不会被单向钢架挡住', () => {
  assert.equal(bulletBlocked(grid, 1.5, 4.5), true);
  assert.equal(bulletBlocked(grid, 3.5, 2.5), false, '钢架下面不该是绝对安全区');
  assert.equal(bulletBlocked(grid, 6.5, 3.5), true);
});

test('overlap 是半开区间：贴边不算相交', () => {
  assert.equal(overlap({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }), false);
  assert.equal(overlap({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.9, y: 0.9, w: 1, h: 1 }), true);
});
