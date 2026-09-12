import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECT_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  VIBRATION,
  collectShift,
  createAudio,
  soundsFor,
  vibrationFor,
} from '../src/scene/audio.js';

const names = (effects) => soundsFor(effects).map((pick) => pick.name);
const peak = (spec) =>
  Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));

test('每个音色都排得出可播的音，且时长和音量都在安全区间', () => {
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

test('越高频的动作越轻：选中 < 落牌 < 收门', () => {
  assert.ok(peak(SOUNDS.select) < peak(SOUNDS.place));
  assert.ok(peak(SOUNDS.place) < peak(SOUNDS.collect));
});

test('翻牌比落牌亮：它是「有进展」的唯一信号', () => {
  const lowest = (spec) => Math.min(...spec.tones.map((t) => Math.min(t.freq, t.to ?? t.freq)));
  assert.ok(lowest(SOUNDS.flip) > lowest(SOUNDS.place) * 2);
});

test('一次连收几门就往上走几个半音，到顶就不再往上', () => {
  assert.equal(collectShift(1), COLLECT_SHIFTS[0]);
  assert.equal(collectShift(2), COLLECT_SHIFTS[1]);
  assert.equal(collectShift(99), COLLECT_SHIFTS.at(-1), '再多也不该刺耳');
  for (let i = 1; i < COLLECT_SHIFTS.length; i += 1) {
    assert.ok(COLLECT_SHIFTS[i] > COLLECT_SHIFTS[i - 1], '半音表必须单调递增');
  }
  const shiftAt = (count) =>
    soundsFor(Array.from({ length: count }, () => ({ type: 'collect' })))[0].shift;
  assert.equal(shiftAt(1), 0);
  assert.ok(shiftAt(3) > shiftAt(2));
});

test('赢和死局各自独占一批：牌局已经结束了，别让落牌声盖上去', () => {
  const winning = [{ type: 'move' }, { type: 'collect' }, { type: 'won' }];
  assert.deepEqual(names(winning), ['win']);
  const dead = [{ type: 'move' }, { type: 'flip' }, { type: 'stuck' }];
  assert.deepEqual(names(dead), ['stuck']);
});

test('收门压过翻牌、翻牌压过落牌，一批最多出三声', () => {
  const busy = [
    { type: 'move' },
    { type: 'flip' },
    { type: 'collect' },
    { type: 'select' },
    { type: 'undo' },
  ];
  const picks = soundsFor(busy);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.deepEqual(picks.map((p) => p.name), ['collect', 'flip', 'place']);
});

test('每种事件都派生得出音，且都在音色表里', () => {
  const batches = [
    [{ type: 'select' }],
    [{ type: 'deselect' }],
    [{ type: 'move' }],
    [{ type: 'flip' }],
    [{ type: 'collect' }],
    [{ type: 'deal' }],
    [{ type: 'undo' }],
    [{ type: 'invalid' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
  assert.deepEqual(names([{ type: 'deselect' }]), [], '取消选中不该出声，太吵');
});

test('触感只给放不下、收门、赢、死局四个关口', () => {
  assert.equal(vibrationFor([{ type: 'move' }]), null);
  assert.equal(vibrationFor([{ type: 'flip' }]), null, '翻牌不震，一局能翻几十次');
  assert.equal(vibrationFor([{ type: 'invalid' }]), VIBRATION.invalid);
  assert.equal(vibrationFor([{ type: 'collect' }]), VIBRATION.collect);
  assert.equal(vibrationFor([{ type: 'won' }]), VIBRATION.win);
  assert.equal(vibrationFor([{ type: 'stuck' }]), VIBRATION.stuck);
  assert.equal(vibrationFor([]), null);
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」「限流真的挡住了」这两条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { freqs: [], sources: [], resumed: 0, suspended: 0, closed: 0, instances: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (target) => target });
  const instances = [];
  class Fake {
    constructor() {
      this.sampleRate = 48000;
      // 可推进的时钟：限流跨帧才成立，固定 currentTime 测不出来。
      this.currentTime = 10;
      this.state = 'suspended';
      this.destination = node();
      log.instances += 1;
      instances.push(this);
    }

    createGain() {
      return { ...node(), gain: { value: 1, ...param() } };
    }

    createOscillator() {
      return {
        ...node(),
        type: 'sine',
        frequency: {
          setValueAtTime: (value) => log.freqs.push(value),
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
  return {
    Fake,
    log,
    advance(seconds) {
      for (const ctx of instances) ctx.currentTime += seconds;
    },
  };
};

test('静音开局一个音频节点都不建，取消静音后才起 AudioContext', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ muted: true, Ctor: Fake });
  assert.equal(audio.muted, true);
  assert.equal(audio.play('place'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('place'), true);
  assert.equal(log.instances, 1);
});

test('落牌声被限流挡住，过了间隔才放行', () => {
  const { Fake, advance } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('place'), true);
  assert.equal(audio.play('place'), false, '同一时刻的第二声该被挡住');
  advance(THROTTLE.place / 2);
  assert.equal(audio.play('place'), false);
  advance(THROTTLE.place);
  assert.equal(audio.play('place'), true);
});

test('限流只管挂了牌的那几个音名，关键反馈一次都不能丢', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  for (const name of ['collect', 'deal', 'win', 'stuck', 'invalid']) {
    assert.equal(THROTTLE[name], undefined, `${name} 不该被限流`);
    assert.equal(audio.play(name), true);
    assert.equal(audio.play(name), true, `${name} 连着两声都该出`);
  }
});

test('升八度就是频率翻倍，半音移调没算错', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('collect');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('collect', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('notify 返回真正出声的条数，被限流掉的不算', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'move' }, { type: 'collect' }];
  assert.equal(audio.notify(effects), 2);
  // 紧接着的下一批：收门照旧出声，落牌被间隔挡住。
  assert.equal(audio.notify(effects), 1);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('place');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('place'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'move' }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('place');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});
