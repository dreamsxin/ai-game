import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
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

test('连踩越多音高爬得越高，爬到顶就不再往上走', () => {
  assert.equal(chainShift(1), CHAIN_SHIFTS[0]);
  assert.equal(chainShift(2), CHAIN_SHIFTS[1]);
  assert.equal(chainShift(CHAIN_SHIFTS.length), CHAIN_SHIFTS.at(-1));
  assert.equal(chainShift(99), CHAIN_SHIFTS.at(-1), '再多也不该刺耳');
  assert.equal(chainShift(0), CHAIN_SHIFTS[0]);
  for (let i = 1; i < CHAIN_SHIFTS.length; i += 1) {
    assert.ok(CHAIN_SHIFTS[i] > CHAIN_SHIFTS[i - 1], '半音表必须单调递增');
  }
});

test('踩敌的音高确实随连踩数抬起来——分数是翻倍的，耳朵得听出来', () => {
  const shiftAt = (chain) => soundsFor([{ type: 'stomp', x: 0, y: 0, chain }])[0].shift;
  assert.equal(shiftAt(1), 0);
  assert.ok(shiftAt(2) > shiftAt(1));
  assert.ok(shiftAt(4) > shiftAt(2));
});

test('跳跃声要轻：一局要响几百次，不能比踩中还响', () => {
  const peak = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(peak(SOUNDS.jump) < peak(SOUNDS.stomp));
});

test('挨打变小和死亡是两声，不能听成一回事', () => {
  assert.deepEqual(names([{ type: 'shrink', x: 0, y: 0 }]), ['shrink']);
  assert.deepEqual(names([{ type: 'die', x: 0, y: 0, reason: 'pit' }]), ['die']);
  assert.notEqual(SOUNDS.shrink.tones.length, SOUNDS.die.tones.length);
});

test('死亡和过关独占这一拍，脚步和金币不许盖在上面', () => {
  const dying = [{ type: 'jump' }, { type: 'coin' }, { type: 'die', reason: 'enemy' }];
  assert.deepEqual(names(dying), ['die']);
  const clearing = [{ type: 'coin' }, { type: 'clear' }];
  assert.deepEqual(names(clearing), ['clear']);
});

test('变强的两声优先级最高：它们改变的是接下来怎么玩', () => {
  const picked = names([
    { type: 'jump' },
    { type: 'coin' },
    { type: 'stomp', chain: 1 },
    { type: 'star' },
    { type: 'grow' },
  ]);
  assert.equal(picked[0], 'star');
  assert.equal(picked[1], 'grow');
});

test('吃星星和吃蘑菇分得开：无敌那段更亮更长', () => {
  assert.deepEqual(names([{ type: 'star' }]), ['star']);
  assert.deepEqual(names([{ type: 'grow' }]), ['grow']);
  const span = (spec) => Math.max(...spec.tones.map((t) => (t.delay ?? 0) + t.dur));
  assert.ok(span(SOUNDS.star) > span(SOUNDS.grow));
});

test('同名只留一条，且一批有上限，一帧里挤满特效也不糊', () => {
  assert.deepEqual(names([{ type: 'coin' }, { type: 'coin' }, { type: 'coin' }]), ['coin']);
  const flood = [
    { type: 'star' },
    { type: 'grow' },
    { type: 'shrink' },
    { type: 'stomp', chain: 3 },
    { type: 'kick' },
    { type: 'coin' },
    { type: 'jump' },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.equal(new Set(picks.map((p) => p.name)).size, picks.length, '不该有重复音名');
});

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) assert.ok(SOUNDS[winSound(stars)]);
});

test('每个派生出来的音名都在音色表里，没特效就一声不出', () => {
  const batches = [
    [{ type: 'jump' }],
    [{ type: 'stomp', chain: 2 }],
    [{ type: 'kick' }],
    [{ type: 'coin' }],
    [{ type: 'grow' }],
    [{ type: 'star' }],
    [{ type: 'shrink' }],
    [{ type: 'die' }],
    [{ type: 'clear' }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('over 和 won 不从 effects 出声，音色表里仍要备着这两条', () => {
  // afterDeath / afterClear 都把 effects 清空了，所以 App 靠状态变化补声。
  assert.deepEqual(soundsFor([{ type: 'over' }]), []);
  assert.deepEqual(soundsFor([{ type: 'won' }]), []);
  assert.ok(SOUNDS.over);
  assert.ok(SOUNDS.win3);
});

test('触感只在挨打、死亡、过关几个关口给，每次跳跃都震会变成噪音', () => {
  assert.equal(vibrationFor([{ type: 'jump' }]), null);
  assert.equal(vibrationFor([{ type: 'stomp', chain: 5 }]), null);
  assert.equal(vibrationFor([{ type: 'coin' }]), null);
  assert.equal(vibrationFor([{ type: 'shrink' }]), VIBRATION.shrink);
  assert.equal(vibrationFor([{ type: 'clear' }]), VIBRATION.clear);
  assert.equal(vibrationFor([{ type: 'die' }]), VIBRATION.die);
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
  audio.play('stomp');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('stomp', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('notify 直接吃一批 effects，出声条数和 soundsFor 一致', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'stomp', chain: 3 }, { type: 'coin' }];
  assert.equal(audio.notify(effects), soundsFor(effects).length);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('coin');
  assert.equal(log.resumed, 1);
});

test('带噪声的音色会同时排出振荡器和噪声源', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('stomp'), true);
  assert.ok(log.freqs.length > 0);
  assert.equal(log.sources.length, 1);
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

