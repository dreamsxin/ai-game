import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  chainShift,
  createAudio,
  fireShift,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

const names = (effects) => soundsFor(effects).map((pick) => pick.name);

test('相反的处境不会响成同一声：命中回弹 vs 打在装甲上', () => {
  const hit = soundsFor([{ type: 'hit', chain: 1 }]);
  const armor = soundsFor([{ type: 'armor' }]);
  assert.notEqual(hit[0].name, armor[0].name);
  // 一个往上滑、一个往下坠：靠的是音色本身，不是音量大小。
  const hitTone = SOUNDS[hit[0].name].tones[0];
  const armorTone = SOUNDS[armor[0].name].tones[0];
  assert.ok(hitTone.to > hitTone.freq, '回弹那一声是上行的');
  assert.ok(armorTone.to < armorTone.freq, '打在装甲上那一声是下坠的');
});

test('空仓和装填完成也是相反的两声', () => {
  const dry = soundsFor([{ type: 'dry' }]);
  const reload = soundsFor([{ type: 'reload' }]);
  assert.notEqual(dry[0].name, reload[0].name);
  const reloadTones = SOUNDS.reload.tones;
  assert.ok(reloadTones[1].freq > reloadTones[0].freq, '装填完成是上行两音');
});

test('打空了必须听得见：同一帧里既命中又打到装甲，两声都留着', () => {
  const picks = names([{ type: 'hit', chain: 2 }, { type: 'armor' }, { type: 'fire', weapon: 'rifle' }]);
  assert.ok(picks.includes('armor'));
  assert.ok(picks.includes('hit'));
});

test('阵亡和过关是这一拍的主角，别的声音一律让路', () => {
  assert.deepEqual(names([{ type: 'die' }, { type: 'fire' }, { type: 'hit' }]), ['die']);
  assert.deepEqual(names([{ type: 'clear' }, { type: 'kill' }]), ['clear']);
});

test('连击越长，命中的音高越高，到顶封顶', () => {
  const low = soundsFor([{ type: 'hit', chain: 1 }])[0].shift;
  const mid = soundsFor([{ type: 'hit', chain: 4 }])[0].shift;
  const high = soundsFor([{ type: 'hit', chain: 8 }])[0].shift;
  assert.ok(mid > low);
  assert.ok(high > mid);
  assert.equal(chainShift(20), chainShift(8));
  assert.equal(chainShift(0), chainShift(1));
});

test('四把枪四个音区：听枪声就知道手里是什么', () => {
  const shifts = ['rifle', 'spread', 'machine', 'laser'].map(fireShift);
  assert.equal(new Set(shifts).size, 4);
  assert.equal(fireShift('unknown'), 0);
});

test('一帧最多出三声，枪声垫在最后，糊不到关键信息', () => {
  const picks = names([
    { type: 'pickup' },
    { type: 'weak', chain: 3 },
    { type: 'armor' },
    { type: 'kill' },
    { type: 'hit', chain: 3 },
    { type: 'fire', weapon: 'rifle' },
    { type: 'jump' },
  ]);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.ok(!picks.includes('fire'), '信息量低的枪声该被挤掉');
  assert.ok(picks.includes('pickup'));
});

test('音色表里每个名字都能查到，通关和弦按星数选', () => {
  for (const name of SOUND_NAMES) assert.ok(SOUNDS[name]);
  assert.equal(winSound(0), 'win1');
  assert.equal(winSound(2), 'win2');
  assert.equal(winSound(5), 'win3');
});

test('震动只给关口事件，开枪不震', () => {
  assert.ok(vibrationFor([{ type: 'die' }]));
  assert.ok(vibrationFor([{ type: 'pickup' }]));
  assert.ok(vibrationFor([{ type: 'dry' }]));
  assert.equal(vibrationFor([{ type: 'fire' }]), null);
  assert.equal(vibrationFor([]), null);
});

test('静音时一个音频节点都不建', () => {
  let built = 0;
  class FakeCtx {
    constructor() {
      built += 1;
    }
  }
  const audio = createAudio({ muted: true, Ctor: FakeCtx });
  assert.equal(audio.play('hit'), false);
  assert.equal(audio.notify([{ type: 'hit', chain: 1 }]), 1, 'soundsFor 仍然算出该响什么');
  assert.equal(built, 0, '静音状态下不该建 AudioContext');
});
