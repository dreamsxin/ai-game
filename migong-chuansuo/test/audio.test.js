import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUNDS,
  SOUND_NAMES,
  VIBRATION,
  createAudio,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

const cell = (layer, col, row) => ({ layer, col, row });

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

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) {
    assert.ok(SOUNDS[winSound(stars)], `${stars} 星选出的音色不存在`);
  }
});

test('推移出推移声，推完就通了再补一声通路', () => {
  assert.deepEqual(soundsFor([{ type: 'shift' }]), ['shift']);
  assert.deepEqual(soundsFor([{ type: 'shift' }, { type: 'open' }]), ['shift', 'open']);
});

test('通关那一刻不再报「通了」，那一声让给结算和弦', () => {
  const effects = [{ type: 'walk', path: [cell(0, 0, 0), cell(0, 1, 0)] }, { type: 'open' }, { type: 'won' }];
  assert.deepEqual(soundsFor(effects), ['walk']);
});

test('跨层走位换成跃迁音，同层走位是脚步声', () => {
  const flat = [{ type: 'walk', path: [cell(0, 0, 0), cell(0, 1, 0)] }];
  const across = [{ type: 'walk', path: [cell(0, 0, 0), cell(1, 0, 0)] }];
  assert.deepEqual(soundsFor(flat), ['walk']);
  assert.deepEqual(soundsFor(across), ['warp']);
});

test('撤销、切层、选中都有回执，没特效就一声不出', () => {
  assert.deepEqual(soundsFor([{ type: 'blocked' }]), ['blocked']);
  assert.deepEqual(soundsFor([{ type: 'undo' }]), ['undo']);
  assert.deepEqual(soundsFor([{ type: 'layer', layer: 1 }]), ['layer']);
  assert.deepEqual(soundsFor([{ type: 'select', cell: cell(0, 1, 1) }]), ['select']);
  assert.deepEqual(soundsFor([]), []);
  assert.deepEqual(soundsFor([{ type: 'deselect' }]), []);
});

test('每个派生出来的音名都在音色表里', () => {
  const batches = [
    [{ type: 'shift' }, { type: 'open' }],
    [{ type: 'walk', path: [cell(0, 0, 0), cell(1, 0, 0)] }],
    [{ type: 'blocked' }],
    [{ type: 'undo' }],
    [{ type: 'layer' }],
    [{ type: 'select' }],
  ];
  for (const effects of batches) {
    for (const name of soundsFor(effects)) {
      assert.ok(SOUNDS[name], `${name} 不在音色表里`);
    }
  }
});

test('触感只在「不成」和「通了」两个关口给，通关那串等结算再震', () => {
  assert.equal(vibrationFor([{ type: 'blocked' }]), VIBRATION.blocked);
  assert.equal(vibrationFor([{ type: 'open' }]), VIBRATION.open);
  assert.equal(vibrationFor([{ type: 'shift' }]), null);
  assert.equal(vibrationFor([{ type: 'won' }, { type: 'open' }]), null);
  assert.equal(vibrationFor([]), null);
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」「同一批声音错开排」这两条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { oscillators: [], sources: [], started: [], resumed: 0, suspended: 0, closed: 0 };
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect(target) {
      return target;
    },
  });
  class Fake {
    constructor() {
      this.sampleRate = 48000;
      this.currentTime = 10;
      this.state = 'suspended';
      this.destination = node();
      this.log = log;
      log.instances = (log.instances ?? 0) + 1;
    }

    createGain() {
      return { ...node(), gain: { value: 1, ...param() } };
    }

    createOscillator() {
      const osc = {
        ...node(),
        type: 'sine',
        frequency: param(),
        start(at) {
          log.started.push(at);
        },
        stop() {},
      };
      log.oscillators.push(osc);
      return osc;
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
  assert.equal(audio.play('shift'), false);
  assert.equal(log.instances, undefined, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('shift'), true);
  assert.equal(log.instances, 1);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('walk');
  assert.equal(log.resumed, 1);
});

test('一批声音顺次排开，不挤在同一毫秒里糊成一团', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.playAll(['shift', 'open']);
  // shift 一条音、open 三条琶音，起始时刻必须严格递增。
  assert.equal(log.oscillators.length, 4);
  const sorted = [...log.started].sort((a, b) => a - b);
  assert.deepEqual(log.started, sorted);
  assert.ok(log.started.at(-1) > log.started[0]);
  assert.equal(log.sources.length, 1, 'shift 的闷响是一层噪声源');
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('shift'), false);
  assert.doesNotThrow(() => audio.playAll(['shift', 'open']));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('shift');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});

