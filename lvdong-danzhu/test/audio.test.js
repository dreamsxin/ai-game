import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GROOVE_COMBO } from '../src/game/rules.js';
import {
  BEATS_PER_BAR,
  CHAIN_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  VIBRATION,
  createAudio,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

const names = (effects, cap = MAX_GROOVE_COMBO) => soundsFor(effects, cap).map((pick) => pick.name);

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

test('强拍和弱拍是两个音色：4/4 的骨架要立得起来', () => {
  assert.deepEqual(names([{ type: 'beat', beat: 4 }]), ['beatDown']);
  assert.deepEqual(names([{ type: 'beat', beat: 8 }]), ['beatDown']);
  assert.deepEqual(names([{ type: 'beat', beat: 5 }]), ['beatUp']);
  assert.deepEqual(names([{ type: 'beat', beat: 7 }]), ['beatUp']);
  assert.equal(BEATS_PER_BAR, 4);
});

test('弱拍比强拍轻：连着响也不该吵', () => {
  const loudest = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(loudest(SOUNDS.beatUp) < loudest(SOUNDS.beatDown));
});

test('踩准拍子和没踩准是两个音，玩家靠听就能找到拍子', () => {
  assert.deepEqual(names([{ type: 'paddle', onBeat: true, combo: 1 }]), ['paddleOn']);
  assert.deepEqual(names([{ type: 'paddle', onBeat: false, combo: 0 }]), ['paddleOff']);
});

test('律动攒到顶格那一下单独报喜，没到顶不报', () => {
  assert.deepEqual(
    names([{ type: 'paddle', onBeat: true, combo: MAX_GROOVE_COMBO }]),
    ['paddleOn', 'groove'],
  );
  assert.deepEqual(
    names([{ type: 'paddle', onBeat: true, combo: MAX_GROOVE_COMBO - 1 }]),
    ['paddleOn'],
  );
  // 没踩准就算 combo 数字对上也不该报喜。
  assert.deepEqual(
    names([{ type: 'paddle', onBeat: false, combo: MAX_GROOVE_COMBO }]),
    ['paddleOff'],
  );
});

test('连消越深消除声越高，深到顶就不再往上走', () => {
  const shiftOf = (chain) => soundsFor([{ type: 'clear', chain }])[0].shift;
  assert.equal(shiftOf(1), CHAIN_SHIFTS[0]);
  assert.equal(shiftOf(2), CHAIN_SHIFTS[1]);
  assert.equal(shiftOf(3), CHAIN_SHIFTS[2]);
  assert.equal(shiftOf(4), CHAIN_SHIFTS.at(-1));
  assert.equal(shiftOf(99), CHAIN_SHIFTS.at(-1), '再深也不该刺耳');
  for (let i = 1; i < CHAIN_SHIFTS.length; i += 1) {
    assert.ok(CHAIN_SHIFTS[i] > CHAIN_SHIFTS[i - 1], '半音表必须单调递增');
  }
});

test('结算音独占这一批，不让碎裂声盖在和弦上', () => {
  const won = [{ type: 'clear', chain: 2 }, { type: 'crack' }, { type: 'won', stars: 3 }];
  assert.deepEqual(names(won), ['win3']);
  const over = [{ type: 'lost', lives: 0 }, { type: 'over', reason: 'lives' }];
  assert.deepEqual(names(over), ['over']);
});

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) assert.ok(SOUNDS[winSound(stars)]);
});

test('同名只留一条：一步里崩三颗弹珠该是一声不是三声', () => {
  const three = [{ type: 'crack' }, { type: 'crack' }, { type: 'crack' }];
  assert.deepEqual(names(three), ['crack']);
});

test('一批声音有上限，一步里挤满特效也不会糊成噪音', () => {
  const flood = [
    { type: 'beat', beat: 4 },
    { type: 'launch' },
    { type: 'paddle', onBeat: true, combo: MAX_GROOVE_COMBO },
    { type: 'clear', chain: 3 },
    { type: 'drop' },
    { type: 'pop' },
    { type: 'break' },
    { type: 'crack' },
    { type: 'descend' },
  ];
  assert.equal(soundsFor(flood, MAX_GROOVE_COMBO).length, MAX_PER_BATCH);
});

test('每个派生出来的音名都在音色表里', () => {
  const batches = [
    [{ type: 'beat', beat: 3 }],
    [{ type: 'paddle', onBeat: true, combo: MAX_GROOVE_COMBO }],
    [{ type: 'clear', chain: 2 }, { type: 'drop' }],
    [{ type: 'pop' }],
    [{ type: 'break' }],
    [{ type: 'crack' }],
    [{ type: 'descend' }],
    [{ type: 'lost', lives: 2 }],
    [{ type: 'launch' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
});

test('没有特效就一声不出', () => {
  assert.deepEqual(soundsFor([]), []);
});

test('触感只在丢球、律动满格、结算三个关口给，每拍都震会变成噪音', () => {
  assert.equal(vibrationFor([{ type: 'beat', beat: 4 }]), null);
  assert.equal(vibrationFor([{ type: 'clear', chain: 3 }]), null);
  assert.equal(vibrationFor([{ type: 'lost', lives: 1 }]), VIBRATION.lost);
  assert.equal(vibrationFor([{ type: 'over' }]), VIBRATION.over);
  assert.equal(vibrationFor([{ type: 'won', stars: 2 }]), VIBRATION.win);
  assert.equal(
    vibrationFor([{ type: 'paddle', onBeat: true, combo: MAX_GROOVE_COMBO }], MAX_GROOVE_COMBO),
    VIBRATION.groove,
  );
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
  assert.equal(audio.play('beatDown'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('beatDown'), true);
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

test('notify 直接吃一批 effects，出声条数和 soundsFor 一致', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'clear', chain: 2 }, { type: 'drop' }, { type: 'crack' }];
  assert.equal(audio.notify(effects, MAX_GROOVE_COMBO), soundsFor(effects, MAX_GROOVE_COMBO).length);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('paddleOn');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('beatDown'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'beat', beat: 4 }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('beatDown');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});

