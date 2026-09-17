// 音效的语义。这个文件守的不是「好不好听」，而是**一听就分得开**：
// 超人和被超、弹射和抢跑、攒成一档和白漂一段——每一对都是相反的处境，
// 相反的处境响成同一声，等于把这三条信息从游戏里删掉。

import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, VIBRATION, engineTone, soundsFor, vibrationFor, vibrate, winSound } from '../src/scene/audio.js';

const self = (type, extra = {}) => ({ type, kart: 0, self: true, ...extra });

test('每个音色都真的有内容', () => {
  for (const [name, spec] of Object.entries(SOUNDS)) {
    assert.ok((spec.tones?.length ?? 0) > 0 || spec.noise, `${name} 是个空音色`);
    for (const tone of spec.tones ?? []) {
      assert.ok(tone.freq > 0 && tone.dur > 0 && tone.gain > 0, `${name} 的某一条音参数不完整`);
      assert.ok(tone.gain <= 0.14, `${name} 的音量 ${tone.gain} 偏大，会盖住引擎声`);
    }
  }
});

test('三对相反的处境，三种不同的声音', () => {
  const pick = (effects) => soundsFor(effects).map((sound) => sound.name);
  assert.notDeepEqual(pick([self('overtake')]), pick([self('passed')]));
  assert.notDeepEqual(pick([self('launchPerfect')]), pick([self('launchEarly')]));
  assert.notDeepEqual(pick([self('ready', { tier: 1 })]), pick([self('fizzle')]));
});

test('喷射的音高跟着档位和连喷数一起爬', () => {
  const shiftOf = (tier, chain) =>
    soundsFor([self('boost', { tier, chain })]).find((sound) => sound.name === 'boost').shift;
  assert.ok(shiftOf(2, 0) > shiftOf(1, 0), '中喷该比小喷高');
  assert.ok(shiftOf(3, 0) > shiftOf(2, 0), '大喷该比中喷高');
  assert.ok(shiftOf(1, 3) > shiftOf(1, 0), '连喷接得越多该越亮');
  // 连喷的加成有上限，不然一串长连喷会尖到刺耳。
  assert.equal(shiftOf(1, 9), shiftOf(1, 4));
});

test('只听自己的车：对手的轮胎和撞墙不出声', () => {
  const rivals = [
    { type: 'wall', kart: 3, self: false },
    { type: 'boost', kart: 2, self: false, tier: 3 },
    { type: 'driftStart', kart: 1, self: false },
  ];
  assert.deepEqual(soundsFor(rivals), []);
});

test('撞墙那一帧不再补一声擦碰：一次碰撞只给一个声音', () => {
  const both = soundsFor([self('wall'), self('bump')]).map((sound) => sound.name);
  assert.ok(both.includes('wall'));
  assert.ok(!both.includes('bump'));
  assert.ok(soundsFor([self('bump')]).some((sound) => sound.name === 'bump'), '单独擦碰还是要响');
});

test('同一帧最多四声，而且先响信息量大的', () => {
  const noisy = [
    self('driftStart'),
    self('tier', { tier: 2 }),
    self('grass'),
    self('bump'),
    self('lap', { lap: 1 }),
    self('boost', { tier: 3, chain: 1 }),
    self('overtake'),
  ];
  const picks = soundsFor(noisy).map((sound) => sound.name);
  assert.ok(picks.length <= 4, `一帧响了 ${picks.length} 声`);
  assert.ok(picks.includes('boost') && picks.includes('overtake'), '喷射和超车不该被轮胎声挤掉');
});

test('读秒最后一下是另一种声音', () => {
  assert.deepEqual(soundsFor([self('count', { n: 2 })]).map((s) => s.name), ['count']);
  assert.deepEqual(soundsFor([self('count', { n: 0 })]).map((s) => s.name), ['count0']);
});

test('震动只在处境变了的关口给，且取信息量最大的那条', () => {
  assert.equal(vibrationFor([self('wall'), self('boost', { tier: 1 })]), VIBRATION.wall);
  assert.equal(vibrationFor([self('boost', { tier: 3 })]), VIBRATION.bigBoost);
  assert.equal(vibrationFor([self('boost', { tier: 1 })]), VIBRATION.boost);
  assert.equal(vibrationFor([self('passed')]), VIBRATION.passed);
  assert.equal(vibrationFor([self('driftStart')]), null, '每次入漂都震会变成一路发抖');
  assert.equal(vibrationFor([{ type: 'wall', kart: 2, self: false }]), null);
  assert.equal(vibrate(null), false);
});

test('引擎声：越快越高越响，喷射再抬一层，停车时不出声', () => {
  const idle = engineTone(0);
  const cruise = engineTone(20);
  const flat = engineTone(34);
  const boosted = engineTone(34, true);
  assert.equal(idle.gain, 0);
  assert.ok(cruise.freq > idle.freq && flat.freq > cruise.freq);
  assert.ok(cruise.gain > 0 && flat.gain > cruise.gain);
  assert.ok(boosted.freq > flat.freq && boosted.gain > flat.gain);
});

test('通关音跟着星数走', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(2), 'win2');
  assert.equal(winSound(3), 'win3');
  assert.ok(SOUNDS[winSound(3)]);
});
