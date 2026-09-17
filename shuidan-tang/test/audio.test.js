// 音效表和「一批 effects 该出哪几声」的测试。
// 这里守的不是好不好听，而是**声音有没有说对处境**：
// 「我被困住了」和「我困住了人」永远不能是同一声。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PER_BATCH,
  SOUNDS,
  VIBRATION,
  chainShift,
  createAudio,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

const names = (effects) => soundsFor(effects).map((pick) => pick.name);

test('每条音色都填齐了合成需要的字段', () => {
  for (const [name, spec] of Object.entries(SOUNDS)) {
    assert.ok(spec.tones?.length || spec.noise, `${name} 既没有音也没有噪`);
    for (const tone of spec.tones ?? []) {
      assert.ok(tone.freq > 0, `${name} 的音高不合法`);
      assert.ok(tone.dur > 0 && tone.dur < 1, `${name} 的时长不合法`);
      assert.ok(tone.gain > 0 && tone.gain <= 0.2, `${name} 的音量越界`);
    }
  }
});

test('自己被困和困住对手是两条相反的声音', () => {
  const mine = names([{ type: 'bubble', victim: 0, owner: 1, self: true }]);
  const theirs = names([{ type: 'bubble', victim: 1, owner: 0, self: false }]);
  assert.deepEqual(mine, ['bubbleSelf']);
  assert.deepEqual(theirs, ['bubbleFoe']);
  assert.notDeepEqual(mine, theirs, '这两件事在画面上长得一样，只能靠声音分开');
});

test('自己被补掉独占一拍，不和别的声音抢', () => {
  const picks = names([
    { type: 'pop', victim: 0, owner: 1, self: true },
    { type: 'crate', cx: 1, cy: 1, owner: 1 },
    { type: 'blast', owner: 1, cells: [], chain: 1 },
  ]);
  assert.deepEqual(picks, ['popSelf']);
});

test('补掉对手压过同一帧里的爆开和拆箱', () => {
  const picks = names([
    { type: 'pop', victim: 1, owner: 0, self: false },
    { type: 'blast', owner: 0, cells: [], chain: 1 },
    { type: 'crate', cx: 1, cy: 1, owner: 0 },
  ]);
  assert.equal(picks[0], 'popFoe');
  assert.ok(picks.length <= MAX_PER_BATCH);
});

test('爆开的音高跟着连锁数爬', () => {
  const single = soundsFor([{ type: 'blast', owner: 0, cells: [], chain: 1 }])[0];
  const triple = soundsFor([{ type: 'blast', owner: 0, cells: [], chain: 3 }])[0];
  assert.equal(single.name, 'blast');
  assert.equal(single.shift, 0);
  assert.ok(triple.shift > single.shift, '连锁越大越亮');
  assert.equal(chainShift(99), chainShift(5), '连锁再大也不会无上限地尖下去');
});

test('一帧里拆三个箱子只响一声', () => {
  const picks = names([
    { type: 'crate', cx: 1, cy: 1, owner: 0 },
    { type: 'crate', cx: 1, cy: 3, owner: 0 },
    { type: 'crate', cx: 3, cy: 1, owner: 0 },
  ]);
  assert.deepEqual(picks, ['crate']);
});

test('别人放弹、别人捡道具不出声', () => {
  const picks = names([
    { type: 'place', who: 1, cx: 2, cy: 2, self: false },
    { type: 'item', who: 1, code: 'bomb', cx: 2, cy: 2, self: false },
  ]);
  assert.deepEqual(picks, [], '一局四个人，别人的每个动作都出声会糊成一片');
});

test('通关和弦跟着星数走', () => {
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(0), 'win1', '星数缺失时宁可少报也不静默');
});

test('触觉只在处境变了的关口给', () => {
  assert.equal(vibrationFor([{ type: 'bubble', victim: 0, self: true }]), VIBRATION.bubbleSelf);
  assert.equal(vibrationFor([{ type: 'pop', victim: 1, self: false }]), VIBRATION.popFoe);
  assert.equal(vibrationFor([{ type: 'die', self: true }]), VIBRATION.die);
  assert.equal(vibrationFor([{ type: 'place', who: 0, self: true }]), null, '每放一发都震会变成一路发抖');
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
  assert.equal(audio.play('place'), false);
  assert.equal(built, 0, '静音状态下不该出现音频线程');
});

test('出声时按音色表把振荡器和噪声都接上', () => {
  const started = [];
  const node = () => ({
    connect(next) {
      return next;
    },
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 },
    start(at) {
      started.push(at);
    },
    stop() {},
    type: '',
    buffer: null,
  });
  class FakeCtx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = node();
      this.state = 'running';
    }
    createGain() {
      return node();
    }
    createOscillator() {
      return node();
    }
    createBufferSource() {
      return node();
    }
    createBiquadFilter() {
      return { ...node(), frequency: { value: 0 } };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    }
  }
  const audio = createAudio({ Ctor: FakeCtx });
  assert.equal(audio.play('blast'), true);
  assert.ok(started.length >= 2, 'blast 有音也有噪，两条都该起来');
  assert.equal(audio.play('不存在的音'), false);
  assert.equal(audio.notify([{ type: 'blast', owner: 0, cells: [], chain: 2 }]), 1);
});
