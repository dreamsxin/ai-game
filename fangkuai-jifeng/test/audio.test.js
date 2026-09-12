import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  STREAK_SHIFTS,
  VIBRATION,
  createAudio,
  soundsFor,
  streakShift,
  vibrationFor,
} from '../src/scene/audio.js';

const names = (effects) => soundsFor(effects).map((pick) => pick.name);

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

test('变道声是全表最轻的：一局要响几百次，不能吵', () => {
  const peak = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(peak(SOUNDS.lane) < peak(SOUNDS.jump));
  assert.ok(peak(SOUNDS.jump) < peak(SOUNDS.crash));
});

test('连吃金币越串越高，串到顶就不再往上走', () => {
  assert.equal(streakShift(1), STREAK_SHIFTS[0]);
  assert.equal(streakShift(2), STREAK_SHIFTS[1]);
  assert.equal(streakShift(99), STREAK_SHIFTS.at(-1), '再串也不该刺耳');
  assert.equal(streakShift(0), STREAK_SHIFTS[0]);
  for (let i = 1; i < STREAK_SHIFTS.length; i += 1) {
    assert.ok(STREAK_SHIFTS[i] > STREAK_SHIFTS[i - 1], '半音表必须单调递增');
  }
  const shiftAt = (streak) => soundsFor([{ type: 'coin', streak }])[0].shift;
  assert.equal(shiftAt(1), 0);
  assert.ok(shiftAt(4) > shiftAt(2));
});

test('护盾挡下和撞毁一听就分得开，这是最需要立刻确认的一件事', () => {
  assert.deepEqual(names([{ type: 'shield', x: 0, z: 4 }]), ['shield']);
  assert.deepEqual(names([{ type: 'crash', kind: 'wall', x: 0, z: 4 }]), ['crash']);
  // 护盾的基频在高处、撞毁在低处，不会听混。
  const lowest = (spec) => Math.min(...spec.tones.map((t) => Math.min(t.freq, t.to ?? t.freq)));
  assert.ok(lowest(SOUNDS.shield) > lowest(SOUNDS.crash));
});

test('撞毁那一声独占这一批：这一局到此为止', () => {
  const dying = [
    { type: 'lane', from: 1, to: 0 },
    { type: 'coin', streak: 3 },
    { type: 'crash', kind: 'pit' },
  ];
  assert.deepEqual(names(dying), ['crash']);
});

test('护盾排在道具和金币之前：先确认没死，再说赚了什么', () => {
  const picked = names([
    { type: 'lane', from: 0, to: 1 },
    { type: 'coin', streak: 2 },
    { type: 'powerup', kind: 'magnet' },
    { type: 'shield' },
  ]);
  assert.equal(picked[0], 'shield');
  assert.equal(picked[1], 'powerup');
});

test('跳跃、滑铲、落地、变道各有一声', () => {
  assert.deepEqual(names([{ type: 'jump', x: 0, y: 0 }]), ['jump']);
  assert.deepEqual(names([{ type: 'slide', x: 0, y: 0 }]), ['slide']);
  assert.deepEqual(names([{ type: 'land', x: 0, y: 0 }]), ['land']);
  assert.deepEqual(names([{ type: 'lane', from: 1, to: 2 }]), ['lane']);
});

test('同名只留一条，且一批有上限，一帧挤满特效也不糊', () => {
  assert.deepEqual(names([{ type: 'coin', streak: 1 }, { type: 'coin', streak: 3 }]), ['coin']);
  // 同名取最高的那个 shift：这一帧里最长的那串才代表现在的势头。
  assert.equal(soundsFor([{ type: 'coin', streak: 1 }, { type: 'coin', streak: 4 }])[0].shift, streakShift(4));
  const flood = [
    { type: 'shield' },
    { type: 'powerup', kind: 'shield' },
    { type: 'coin', streak: 2 },
    { type: 'jump' },
    { type: 'slide' },
    { type: 'land' },
    { type: 'lane', from: 0, to: 1 },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.equal(new Set(picks.map((p) => p.name)).size, picks.length, '不该有重复音名');
});

test('每个派生出来的音名都在音色表里，没特效就一声不出', () => {
  const batches = [
    [{ type: 'lane', from: 0, to: 1 }],
    [{ type: 'jump' }],
    [{ type: 'slide' }],
    [{ type: 'land' }],
    [{ type: 'coin', streak: 5 }],
    [{ type: 'powerup', kind: 'magnet' }],
    [{ type: 'shield' }],
    [{ type: 'crash', kind: 'crate' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('触感只在护盾挡下和撞毁两个关口给，跑酷全程都震会麻', () => {
  assert.equal(vibrationFor([{ type: 'jump' }]), null);
  assert.equal(vibrationFor([{ type: 'coin', streak: 8 }]), null);
  assert.equal(vibrationFor([{ type: 'shield' }]), VIBRATION.shield);
  assert.equal(vibrationFor([{ type: 'crash', kind: 'wall' }]), VIBRATION.crash);
  assert.equal(vibrationFor([]), null);
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」「半音移调真的移了」这两条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { freqs: [], sources: [], resumed: 0, suspended: 0, closed: 0, instances: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (target) => target });
  class Fake {
    constructor() {
      this.sampleRate = 48000;
      this.currentTime = 10;
      this.state = 'suspended';
      this.destination = node();
      log.instances += 1;
    }

    createGain() {
      return { ...node(), gain: { value: 1, ...param() } };
    }

    createOscillator() {
      return {
        ...node(),
        type: 'sine',
        frequency: {
          setValueAtTime(value) {
            log.freqs.push(value);
          },
          exponentialRampToValueAtTime() {},
        },
        start() {},
        stop() {},
      };
    }

    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }

    createBufferSource() {
      const source = { ...node(), buffer: null, start() {}, stop() {} };
      log.sources.push(source);
      return source;
    }

    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: { value: 0 } };
    }

    resume() {
      log.resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      log.suspended += 1;
      return Promise.resolve();
    }

    close() {
      log.closed += 1;
      return Promise.resolve();
    }
  }
  return { Fake, log };
};

test('静音开局一个音频节点都不建，取消静音后才起 AudioContext', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ muted: true, Ctor: Fake });
  assert.equal(audio.muted, true);
  assert.equal(audio.play('jump'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('jump'), true);
  assert.equal(log.instances, 1);
});

test('升八度就是频率翻倍，半音移调没算错', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('coin');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('coin', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('lane'), true);
  assert.equal(log.sources.length, 1);
});

test('notify 直接吃一批 effects，出声条数和 soundsFor 一致', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'coin', streak: 3 }, { type: 'land' }];
  assert.equal(audio.notify(effects), soundsFor(effects).length);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('jump');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('jump'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'jump' }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('jump');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});
