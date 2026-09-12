import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEAR_SHIFTS,
  COMBO_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  VIBRATION,
  clearShift,
  comboShift,
  createAudio,
  soundsFor,
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

test('横移声是全表最轻的：长按会连着走，不能吵', () => {
  const peak = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(peak(SOUNDS.move) < peak(SOUNDS.rotate));
  assert.ok(peak(SOUNDS.rotate) < peak(SOUNDS.lock));
  assert.ok(peak(SOUNDS.lock) < peak(SOUNDS.clear));
});

test('消行音高跟着行数走，四行不走这条', () => {
  assert.equal(clearShift(1), CLEAR_SHIFTS[0]);
  assert.equal(clearShift(2), CLEAR_SHIFTS[1]);
  assert.equal(clearShift(3), CLEAR_SHIFTS[2]);
  for (let i = 1; i < CLEAR_SHIFTS.length; i += 1) {
    assert.ok(CLEAR_SHIFTS[i] > CLEAR_SHIFTS[i - 1], '半音表必须单调递增');
  }
  const shiftAt = (count) => soundsFor([{ type: 'clear', count, combo: 1 }])[0].shift;
  assert.ok(shiftAt(3) > shiftAt(1));
});

test('四行有自己的和弦，不和 1~3 行共用音色', () => {
  assert.deepEqual(names([{ type: 'clear', count: 4, combo: 1 }]), ['tetris']);
  assert.deepEqual(names([{ type: 'clear', count: 3, combo: 1 }]), ['clear']);
  // 五行以上（异常态）也按四行处理，不该掉回普通消行。
  assert.deepEqual(names([{ type: 'clear', count: 5, combo: 1 }]), ['tetris']);
});

test('T-spin 独立于行数出声：它本身就是技巧的凭证', () => {
  assert.deepEqual(names([{ type: 'clear', count: 1, tspin: true, combo: 1 }]), ['clear', 'tspin']);
  assert.deepEqual(names([{ type: 'clear', count: 4, tspin: true, combo: 1 }]), ['tetris', 'tspin']);
});

test('连击从第 2 连才算连，越连越高且封顶', () => {
  assert.deepEqual(names([{ type: 'clear', count: 1, combo: 1 }]), ['clear']);
  assert.deepEqual(names([{ type: 'clear', count: 1, combo: 2 }]), ['clear', 'combo']);
  assert.equal(comboShift(2), COMBO_SHIFTS[0]);
  assert.equal(comboShift(3), COMBO_SHIFTS[1]);
  assert.equal(comboShift(99), COMBO_SHIFTS.at(-1), '再连也不该刺耳');
  for (let i = 1; i < COMBO_SHIFTS.length; i += 1) {
    assert.ok(COMBO_SHIFTS[i] > COMBO_SHIFTS[i - 1]);
  }
});

test('有消行时锁定声让位：消行本身已经交代了落地', () => {
  assert.deepEqual(names([{ type: 'lock', rows: [] }]), ['lock']);
  const withClear = names([{ type: 'lock', rows: [3] }, { type: 'clear', count: 1, combo: 1 }]);
  assert.ok(!withClear.includes('lock'));
  assert.ok(withClear.includes('clear'));
});

test('踢墙转和原地转是两个音色', () => {
  assert.deepEqual(names([{ type: 'rotate', kicked: false }]), ['rotate']);
  assert.deepEqual(names([{ type: 'rotate', kicked: true }]), ['kick']);
});

test('硬降、换手、升级各有一声', () => {
  assert.deepEqual(names([{ type: 'hardDrop', cells: 5, column: 3 }]), ['hardDrop']);
  assert.deepEqual(names([{ type: 'hold', piece: 'T' }]), ['hold']);
  assert.deepEqual(names([{ type: 'level', level: 3 }]), ['level']);
});

test('封顶那一声独占这一批，不让锁定的闷响盖在上面', () => {
  const dying = [
    { type: 'lock', rows: [] },
    { type: 'clear', count: 2, combo: 1 },
    { type: 'topout' },
  ];
  assert.deepEqual(names(dying), ['topout']);
});

test('同名只留一条，且一批有上限，一帧挤满特效也不糊', () => {
  assert.deepEqual(names([{ type: 'move', dx: -1 }, { type: 'move', dx: -1 }]), ['move']);
  const flood = [
    { type: 'clear', count: 4, tspin: true, combo: 5 },
    { type: 'level', level: 4 },
    { type: 'hardDrop', cells: 3 },
    { type: 'hold', piece: 'I' },
    { type: 'rotate', kicked: true },
    { type: 'move', dx: 1 },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.equal(new Set(picks.map((p) => p.name)).size, picks.length, '不该有重复音名');
});

test('每个派生出来的音名都在音色表里，没特效就一声不出', () => {
  const batches = [
    [{ type: 'move', dx: 1 }],
    [{ type: 'rotate', kicked: false }],
    [{ type: 'rotate', kicked: true }],
    [{ type: 'hardDrop' }],
    [{ type: 'lock', rows: [] }],
    [{ type: 'hold' }],
    [{ type: 'clear', count: 2, tspin: true, combo: 3 }],
    [{ type: 'level', level: 2 }],
    [{ type: 'topout' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('触感只在四行、T-spin、封顶几个关口给，每块落地都震会麻', () => {
  assert.equal(vibrationFor([{ type: 'lock', rows: [] }]), null);
  assert.equal(vibrationFor([{ type: 'clear', count: 2, combo: 1 }]), null);
  assert.equal(vibrationFor([{ type: 'clear', count: 4, combo: 1 }]), VIBRATION.tetris);
  assert.equal(vibrationFor([{ type: 'clear', count: 1, tspin: true, combo: 1 }]), VIBRATION.tspin);
  assert.equal(vibrationFor([{ type: 'topout' }]), VIBRATION.topout);
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
  assert.equal(audio.play('lock'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('lock'), true);
  assert.equal(log.instances, 1);
});

test('升八度就是频率翻倍，半音移调没算错', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('clear');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('clear', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('move'), true);
  assert.equal(log.sources.length, 1);
});

test('notify 直接吃一批 effects，出声条数和 soundsFor 一致', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'clear', count: 4, combo: 3 }, { type: 'level', level: 2 }];
  assert.equal(audio.notify(effects), soundsFor(effects).length);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('rotate');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('lock'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'lock', rows: [] }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('lock');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});
