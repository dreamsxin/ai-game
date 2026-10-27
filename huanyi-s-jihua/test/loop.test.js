// 主循环的演习。rAF 和 setTimeout 全部换成手动推进的假时钟，
// 所以「rAF 一帧不给」「时间戳冻在原地」「rAF 中途回来」这些只有特定环境才遇得到的场景，
// 在 node 里都能一帧一帧地精确排出来。

import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_MS, WATCHDOG_MS, createLoop } from '../src/scene/loop.js';

/**
 * 可手动推时间的假环境。`advance(ms, { rafEvery })` 里 rafEvery>0 表示
 * rAF 活着、按这个周期发帧；0 表示 rAF 一帧都不给（无头、省电、内嵌 webview）。
 */
const makeEnv = () => {
  let now = 0;
  let seq = 0;
  const rafCallbacks = new Map();
  const timers = new Map();
  const requestFrame = (cb) => {
    rafCallbacks.set(++seq, cb);
    return seq;
  };
  const wait = (cb, ms) => {
    timers.set(++seq, { at: now + ms, cb });
    return seq;
  };
  const advance = (ms, { rafEvery = 0 } = {}) => {
    const end = now + ms;
    let nextRaf = rafEvery > 0 ? now : Infinity;
    for (let guard = 0; guard < 100000; guard += 1) {
      const due = [...timers.values()].map((item) => item.at).filter((at) => at <= end);
      const next = Math.min(nextRaf, ...due, end);
      if (!Number.isFinite(next)) break;
      now = next;
      if (now === nextRaf) {
        nextRaf += rafEvery;
        for (const cb of [...rafCallbacks.values()]) cb(now);
      }
      for (const [id, item] of [...timers]) {
        if (item.at <= now) {
          timers.delete(id);
          item.cb();
        }
      }
      if (now >= end && due.length === 0 && nextRaf > end) break;
    }
  };
  return {
    advance,
    opts: {
      requestFrame,
      cancelFrame: (id) => rafCallbacks.delete(id),
      wait,
      cancelWait: (id) => timers.delete(id),
      clock: () => now,
    },
  };
};

const makeRecorder = () => {
  const frames = [];
  return {
    frames,
    frame: (dt) => frames.push({ dt }),
  };
};

test('rAF 活着时循环由 rAF 驱动，dt 跟着真实间隔走', () => {
  const env = makeEnv();
  const rec = makeRecorder();
  const loop = createLoop((dt) => rec.frame(dt), env.opts);
  loop.start();
  env.advance(1000, { rafEvery: 1000 / 60 });
  assert.ok(rec.frames.length >= 55 && rec.frames.length <= 65, `一秒该有 60 帧上下，实际 ${rec.frames.length}`);
  assert.ok(rec.frames.every((item) => item.dt > 0.01 && item.dt < 0.03), 'dt 该在 16ms 附近');
  assert.equal(loop.mode(), 'raf');
  loop.stop();
});

test('rAF 一帧不给：250ms 后定时器接管，世界继续走', () => {
  const env = makeEnv();
  const frames = [];
  const loop = createLoop((dt) => frames.push(dt), env.opts);
  loop.start();
  env.advance(1000);
  // 第一帧在 250ms（判缺席），之后按 60 帧走：约 1 + 45 帧。
  assert.ok(frames.length >= 40 && frames.length <= 55, `缺席的一秒该有 ~46 帧，实际 ${frames.length}`);
  assert.equal(frames[0], 1 / 60, '第一帧还没上一帧可比，用固定步长');
  assert.equal(loop.mode(), 'timer', 'rAF 缺席就该由定时器驱动');
  const total = frames.reduce((sum, dt) => sum + dt, 0);
  assert.ok(total > 0.6 && total < 1.1, `推了一秒，帧时长加起来该接近一秒，实际 ${total.toFixed(2)}`);
  loop.stop();
});

test('缺席期间 rAF 回来了：主导权交还，不会双跑', () => {
  const env = makeEnv();
  const rec = makeRecorder();
  const loop = createLoop((dt) => {
    rec.frame(dt);
    rec.frames.at(-1).mode = loop.mode();
  }, env.opts);
  loop.start();
  env.advance(800);
  assert.equal(loop.mode(), 'timer');
  env.advance(300, { rafEvery: 1000 / 60 });
  assert.equal(loop.mode(), 'raf', 'rAF 回来就该拿回主导权');
  assert.equal(rec.frames.at(-1).mode, 'raf', '最近的帧该由 rAF 出');
  // 前段判缺席要等 250ms，后段 rAF 立即接管：两段共 1.1s 该有 ~52 帧。
  assert.ok(rec.frames.length >= 42 && rec.frames.length <= 62, `两段共 1.1s 该有 ~52 帧，实际 ${rec.frames.length}`);
  loop.stop();
});

test('时间戳冻在原地：退回固定步长，不能停在原地', () => {
  const env = makeEnv();
  const frames = [];
  const loop = createLoop((dt) => frames.push(dt), {
    ...env.opts,
    requestFrame: (cb) => env.opts.requestFrame(() => cb(5)),
  });
  loop.start();
  env.advance(300, { rafEvery: 1000 / 60 });
  assert.ok(frames.length > 10, '帧照常在走');
  for (const dt of frames) {
    assert.equal(dt, 1 / 60, `时间戳不走就该给固定步长，实际 ${dt}`);
  }
  loop.stop();
});

test('落后太多不全补：一大段空白只补 0.1 秒，不是死亡螺旋', () => {
  const env = makeEnv();
  const frames = [];
  const loop = createLoop((dt) => frames.push(dt), env.opts);
  loop.start();
  env.advance(50, { rafEvery: 1000 / 60 });
  const healthy = frames.length;
  env.advance(WATCHDOG_MS + 100);
  // 停滞后的第一帧把 350ms 的空白折成 0.1s，之后的帧回到 16ms。
  assert.equal(frames[healthy], 0.1, `卡了 ${WATCHDOG_MS + 100}ms 只该补 0.1s，实际 ${frames[healthy]}`);
  assert.ok(Math.max(...frames) <= 0.1 + 1e-9, '没有任何一帧补超过 0.1s');
  assert.ok(frames.length > healthy, '卡完之后世界继续走');
  loop.stop();
});

test('stop 之后在途的 rAF 和定时器都不再出帧', () => {
  const env = makeEnv();
  let count = 0;
  const loop = createLoop(() => {
    count += 1;
  }, env.opts);
  loop.start();
  env.advance(300);
  loop.stop();
  const atStop = count;
  env.advance(500);
  env.advance(200, { rafEvery: 1000 / 60 });
  assert.equal(count, atStop, '停了的循环谁都不该再叫醒');
});

test('start 两次不会开出两条循环', () => {
  const env = makeEnv();
  const frames = [];
  const loop = createLoop((dt) => frames.push(dt), env.opts);
  loop.start();
  loop.start();
  env.advance(400);
  assert.ok(frames.length < 60, `单条循环 400ms 该有 ~20 帧，实际 ${frames.length}`);
  loop.stop();
});
