import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  VIBRATION,
  createAudio,
  engineFor,
  snapshot,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

// 模拟层是「就地改同一个 state」，所以反馈层比的是两份快照而不是两个 state 对象。
const snap = (over = {}) => ({
  levelIndex: 0,
  status: 'driving',
  stars: 0,
  elapsed: 10,
  delivered: 0,
  cargo: 0,
  gear: 'A',
  awd: false,
  diffLock: false,
  anchored: false,
  snapped: false,
  stuck: false,
  fuel: 100,
  penalty: 0,
  ...over,
});

test('每个音色都排得出可播的音，且时长和音量都是正数', () => {
  for (const name of SOUND_NAMES) {
    const spec = SOUNDS[name];
    const parts = [...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])];
    assert.ok(parts.length > 0, `${name} 一条音都没有`);
    for (const part of parts) {
      assert.ok(part.dur > 0, `${name} 的时长不是正数`);
      assert.ok(part.gain > 0 && part.gain <= 0.4, `${name} 的音量 ${part.gain} 超出安全区间`);
    }
  }
});

test('快照只留反馈要用的字段，嵌套结构被拍平', () => {
  const state = {
    levelIndex: 2,
    status: 'driving',
    stars: 0,
    elapsed: 12.5,
    delivered: 1,
    cargo: [{}, {}],
    vehicle: { gear: 'L', awd: true, diffLock: false },
    winch: { anchor: { x: 1, y: 2, z: 3 } },
    stuck: true,
    fuel: 80,
    penalty: 15,
  };
  assert.deepEqual(snapshot(state), {
    levelIndex: 2,
    status: 'driving',
    stars: 0,
    elapsed: 12.5,
    delivered: 1,
    cargo: 2,
    gear: 'L',
    awd: true,
    diffLock: false,
    anchored: true,
    snapped: false,
    stuck: true,
    fuel: 80,
    penalty: 15,
  });
});

test('引擎频率随转速线性抬起来，怠速和上限都夹住', () => {
  const idle = engineFor({ rpm: 0 }, { max: 4600 });
  const redline = engineFor({ rpm: 4600 }, { max: 4600 });
  const over = engineFor({ rpm: 9999 }, { max: 4600 });
  assert.equal(idle.hz, ENGINE.idleHz);
  assert.equal(redline.hz, ENGINE.redlineHz);
  assert.equal(over.hz, ENGINE.redlineHz, '超转也不该继续往上飙');
  assert.ok(engineFor({ rpm: 2300 }, { max: 4600 }).hz > idle.hz);
});

test('转速和油门都会抬音量，但音量有上下限', () => {
  const quiet = engineFor({ rpm: 0, throttle: 0 }, { max: 4600 });
  const loud = engineFor({ rpm: 4600, throttle: 1 }, { max: 4600 });
  assert.equal(quiet.gain, ENGINE.minGain);
  assert.equal(loud.gain, ENGINE.maxGain);
  // 光踩油门还没上转速也该听出使劲。
  assert.ok(engineFor({ rpm: 0, throttle: 1 }, { max: 4600 }).gain > quiet.gain);
});

test('空转比例决定高八度泛音：差速锁有没有用上耳朵先知道', () => {
  assert.equal(engineFor({ rpm: 2000, slipping: 0 }, { max: 4600 }).slip, 0);
  assert.equal(engineFor({ rpm: 2000, slipping: 1 }, { max: 4600 }).slip, ENGINE.slipGain);
  assert.ok(engineFor({ rpm: 2000, slipping: 0.5 }, { max: 4600 }).slip > 0);
  assert.equal(engineFor({ rpm: 2000, slipping: 9 }, { max: 4600 }).slip, ENGINE.slipGain);
});

test('熄火状态下引擎彻底不响，不留一条底噪', () => {
  const off = engineFor({ rpm: 3000, throttle: 1 }, { max: 4600, running: false });
  assert.deepEqual(off, { hz: 0, gain: 0, slip: 0 });
});

test('交付和撒货都动 cargo，但必须报成两件不同的事', () => {
  const carrying = snap({ cargo: 2 });
  // 交付：载货少一件，同时交付数涨一件。
  assert.deepEqual(soundsFor(carrying, snap({ cargo: 1, delivered: 1 })), ['deliver']);
  // 撒货：载货少一件，交付数没动。
  assert.deepEqual(soundsFor(carrying, snap({ cargo: 1 })), ['spill']);
  // 装货：载货多一件。
  assert.deepEqual(soundsFor(carrying, snap({ cargo: 3 })), ['load']);
});

test('钢缆崩断和自己脱钩是两件事，挂钩又是第三件', () => {
  const hooked = snap({ anchored: true });
  assert.deepEqual(soundsFor(hooked, snap({ anchored: false, snapped: true })), ['snap']);
  // 手动脱钩不带 snapped 标记，就不该响崩断那一声。
  assert.deepEqual(soundsFor(hooked, snap({ anchored: false })), []);
  assert.deepEqual(soundsFor(snap(), snap({ anchored: true })), ['hook']);
});

test('换挡、四驱、差速锁各有回执，陷住只在刚陷进去时响一次', () => {
  assert.deepEqual(soundsFor(snap(), snap({ gear: 'L' })), ['shift']);
  assert.deepEqual(soundsFor(snap(), snap({ awd: true })), ['clunk']);
  assert.deepEqual(soundsFor(snap(), snap({ diffLock: true })), ['clunk']);
  assert.deepEqual(soundsFor(snap(), snap({ stuck: true })), ['stuck']);
  // 一直陷着不该每帧都喊。
  assert.deepEqual(soundsFor(snap({ stuck: true }), snap({ stuck: true })), []);
});

test('加油和罚时拖回各有一声', () => {
  assert.deepEqual(soundsFor(snap({ fuel: 20 }), snap({ fuel: 100 })), ['refuel']);
  assert.deepEqual(soundsFor(snap(), snap({ penalty: 20 })), ['recover']);
});

test('结算独占这一批：交付完成按星数给和弦，报废给下坠', () => {
  assert.deepEqual(soundsFor(snap(), snap({ status: 'won', stars: 3 })), ['win3']);
  assert.deepEqual(soundsFor(snap(), snap({ status: 'lost' })), ['lost']);
});

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) assert.ok(SOUNDS[winSound(stars)]);
});

test('换趟或重开不会把上一趟的结算音再放一遍', () => {
  const won = snap({ status: 'won', stars: 3, elapsed: 300, delivered: 6 });
  assert.deepEqual(soundsFor(won, snap({ levelIndex: 1 })), []);
  // 重开同一趟：关号没变，但计时和交付数都归零了。
  assert.deepEqual(soundsFor(won, snap({ elapsed: 0 })), []);
});

test('一帧最多出几声，翻车时同时撒货崩缆也不糊成一团', () => {
  const before = snap({ cargo: 3, anchored: true });
  const after = snap({ cargo: 0, anchored: false, snapped: true, stuck: true, gear: 'N', awd: true, penalty: 20 });
  assert.equal(soundsFor(before, after).length, MAX_PER_BATCH);
});

test('每个派生出来的音名都在音色表里，没变化就一声不出', () => {
  const batches = [
    [snap(), snap({ gear: 'R' })],
    [snap({ cargo: 1 }), snap({ cargo: 0, delivered: 1 })],
    [snap({ cargo: 1 }), snap({ cargo: 0 })],
    [snap({ anchored: true }), snap({ anchored: false, snapped: true })],
    [snap(), snap({ stuck: true })],
    [snap({ fuel: 10 }), snap({ fuel: 90 })],
    [snap(), snap({ penalty: 20 })],
  ];
  for (const [prev, next] of batches) {
    for (const name of soundsFor(prev, next)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor(snap(), snap()), []);
  assert.deepEqual(soundsFor(null, snap()), []);
});

test('触感只在崩缆、陷住、结算给，开车全程都震会麻', () => {
  assert.equal(vibrationFor(snap(), snap({ gear: 'L' })), null);
  assert.equal(vibrationFor(snap({ cargo: 1 }), snap({ cargo: 0, delivered: 1 })), null);
  assert.equal(vibrationFor(snap({ anchored: true }), snap({ snapped: true })), VIBRATION.snap);
  assert.equal(vibrationFor(snap(), snap({ stuck: true })), VIBRATION.stuck);
  assert.equal(vibrationFor(snap(), snap({ status: 'won', stars: 2 })), VIBRATION.win);
  assert.equal(vibrationFor(snap(), snap({ status: 'lost' })), VIBRATION.lost);
});
