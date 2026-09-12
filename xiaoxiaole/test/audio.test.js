import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIAL_LABELS } from '../src/game/tiles.js';
import {
  CHAIN_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  SPECIAL_SOUNDS,
  VIBRATION,
  chainShift,
  createAudio,
  soundsFor,
  vibrationFor,
  winSound,
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

test('连锁越深消除声爬得越高，爬到顶就不再往上走', () => {
  assert.equal(chainShift(1), CHAIN_SHIFTS[0]);
  assert.equal(chainShift(2), CHAIN_SHIFTS[1]);
  assert.equal(chainShift(CHAIN_SHIFTS.length), CHAIN_SHIFTS.at(-1));
  assert.equal(chainShift(99), CHAIN_SHIFTS.at(-1), '再深也不该刺耳');
  assert.equal(chainShift(0), CHAIN_SHIFTS[0]);
  for (let i = 1; i < CHAIN_SHIFTS.length; i += 1) {
    assert.ok(CHAIN_SHIFTS[i] > CHAIN_SHIFTS[i - 1], '半音表必须单调递增');
  }
  // 连锁能到七八层，梯子得够长才撑得住。
  assert.ok(CHAIN_SHIFTS.length >= 8);
});

test('消除声的音高确实随连锁抬起来', () => {
  const shiftAt = (chain) => soundsFor([{ type: 'clear', chain, cells: [] }])[0].shift;
  assert.equal(shiftAt(1), 0);
  assert.ok(shiftAt(4) > shiftAt(2));
  assert.ok(shiftAt(2) > shiftAt(1));
});

test('特殊果实的声音叠在消除声上，不是替代它', () => {
  const withBomb = names([{ type: 'clear', chain: 1, cells: [], specials: ['bomb'] }]);
  assert.deepEqual(withBomb, ['clear', 'bomb']);
  const withAll = names([{ type: 'clear', chain: 2, cells: [], specials: ['row', 'bomb', 'rainbow'] }]);
  assert.deepEqual(withAll, ['clear', 'line', 'bomb', 'rainbow']);
});

test('每种特殊果实都有对应音色，横竖爆果共用一条', () => {
  for (const special of Object.keys(SPECIAL_LABELS)) {
    const name = SPECIAL_SOUNDS[special];
    assert.ok(name, `${special} 没有配音色`);
    assert.ok(SOUNDS[name], `${special} 指向的 ${name} 不在音色表里`);
  }
  assert.equal(SPECIAL_SOUNDS.row, SPECIAL_SOUNDS.col, '方向由画面交代，耳朵分不出也不需要分');
});

test('爆破果比直线爆果更重：低频峰值更高', () => {
  const lowest = (spec) => Math.min(...(spec.tones ?? []).map((t) => Math.min(t.freq, t.to ?? t.freq)));
  assert.ok(lowest(SOUNDS.bomb) < lowest(SOUNDS.line));
});

test('换位声要轻：一局要响上百次，不能比消除还响', () => {
  const peak = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(peak(SOUNDS.swap) < peak(SOUNDS.clear));
});

test('换不动有专门一声，和换成功分得开', () => {
  assert.deepEqual(names([{ type: 'reject', a: {}, b: {} }]), ['reject']);
  assert.deepEqual(names([{ type: 'swap', a: {}, b: {} }]), ['swap']);
});

test('只有真的有果实落下来才出声，补满不动的盘面不该沙沙响', () => {
  assert.deepEqual(names([{ type: 'fall', drops: [{ x: 0 }], spawned: [] }]), ['fall']);
  assert.deepEqual(names([{ type: 'fall', drops: [], spawned: [{ x: 1 }] }]), ['fall']);
  assert.deepEqual(names([{ type: 'fall', drops: [], spawned: [] }]), []);
  assert.deepEqual(names([{ type: 'fall' }]), []);
});

test('无步可走和重排完成是两声，一个警示一个放行', () => {
  assert.deepEqual(names([{ type: 'shuffle' }]), ['shuffle']);
  assert.deepEqual(names([{ type: 'shuffled' }]), ['shuffled']);
});

test('结算音独占这一批，不让下落的沙沙声盖在和弦上', () => {
  const won = [{ type: 'clear', chain: 3, cells: [] }, { type: 'fall', drops: [{}] }, { type: 'won', stars: 2 }];
  assert.deepEqual(names(won), ['win2']);
  assert.deepEqual(names([{ type: 'over' }]), ['over']);
});

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) assert.ok(SOUNDS[winSound(stars)]);
});

test('同名只留一条，且一批有上限，连锁再猛也不糊成噪音', () => {
  const flood = [
    { type: 'swap', a: {}, b: {} },
    { type: 'clear', chain: 5, cells: [], specials: ['row', 'col', 'bomb', 'rainbow'] },
    { type: 'fall', drops: [{}] },
    { type: 'shuffle' },
    { type: 'shuffled' },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.equal(new Set(picks.map((p) => p.name)).size, picks.length, '不该有重复音名');
});

test('每个派生出来的音名都在音色表里，没特效就一声不出', () => {
  const batches = [
    [{ type: 'swap' }],
    [{ type: 'reject' }],
    [{ type: 'clear', chain: 2, specials: ['rainbow'] }],
    [{ type: 'fall', drops: [{}] }],
    [{ type: 'shuffle' }],
    [{ type: 'shuffled' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('触感只在换不动、彩虹果、结算三个关口给，每次消除都震会变成噪音', () => {
  assert.equal(vibrationFor([{ type: 'clear', chain: 4, specials: ['bomb'] }]), null);
  assert.equal(vibrationFor([{ type: 'swap' }]), null);
  assert.equal(vibrationFor([{ type: 'reject' }]), VIBRATION.reject);
  assert.equal(vibrationFor([{ type: 'clear', chain: 1, specials: ['rainbow'] }]), VIBRATION.rainbow);
  assert.equal(vibrationFor([{ type: 'won', stars: 3 }]), VIBRATION.win);
  assert.equal(vibrationFor([{ type: 'over' }]), VIBRATION.over);
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
  assert.equal(audio.play('clear'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('clear'), true);
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
  const effects = [{ type: 'clear', chain: 3, specials: ['bomb'] }, { type: 'fall', drops: [{}] }];
  assert.equal(audio.notify(effects), soundsFor(effects).length);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('swap');
  assert.equal(log.resumed, 1);
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('fall'), true);
  assert.equal(log.sources.length, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('clear'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'clear', chain: 1 }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('clear');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});

