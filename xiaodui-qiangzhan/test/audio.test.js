import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  STREAK_SHIFTS,
  THROTTLE,
  VIBRATION,
  createAudio,
  matchSound,
  soundsFor,
  streakShift,
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

test('别人的枪声比自己的轻得多：满场交火时它每秒会响几十次', () => {
  assert.ok(peak(SOUNDS.shot) < peak(SOUNDS.gun) / 2);
  assert.ok(peak(SOUNDS.impact) < peak(SOUNDS.shot) + 0.01);
});

test('我的枪和别人的枪是两个音名，靠 mine 分流', () => {
  assert.deepEqual(names([{ type: 'shot', mine: true, team: 'ally' }]), ['gun']);
  assert.deepEqual(names([{ type: 'shot', mine: false, team: 'ally' }]), ['shot']);
  // 我开枪的同一帧里别人也在开枪，两条都该响。
  const both = names([
    { type: 'shot', mine: true, team: 'ally' },
    { type: 'shot', mine: false, team: 'enemy' },
  ]);
  assert.deepEqual(both, ['gun', 'shot']);
});

test('打中人和被打中在音区两端，绝不会听混', () => {
  assert.deepEqual(names([{ type: 'hit', mine: true, taken: false }]), ['mark']);
  assert.deepEqual(names([{ type: 'hit', mine: false, taken: true }]), ['hurt']);
  const lowest = (spec) => Math.min(...spec.tones.map((t) => Math.min(t.freq, t.to ?? t.freq)));
  assert.ok(lowest(SOUNDS.mark) > lowest(SOUNDS.hurt) * 3);
});

test('别人打别人不出声：这一批里既不是我打的也不是我挨的', () => {
  assert.deepEqual(names([{ type: 'hit', mine: false, taken: false }]), []);
  assert.deepEqual(names([{ type: 'kill', mine: false, lost: false, streak: 3 }]), []);
  assert.deepEqual(names([{ type: 'spawn', mine: false }]), []);
  assert.deepEqual(names([{ type: 'reload', mine: false, dry: true }]), []);
  assert.deepEqual(names([{ type: 'ready', mine: false }]), []);
});

test('连杀越串越高，串到顶就不再往上走', () => {
  assert.equal(streakShift(1), STREAK_SHIFTS[0]);
  assert.equal(streakShift(99), STREAK_SHIFTS.at(-1), '再串也不该刺耳');
  for (let i = 1; i < STREAK_SHIFTS.length; i += 1) {
    assert.ok(STREAK_SHIFTS[i] > STREAK_SHIFTS[i - 1], '半音表必须单调递增');
  }
  const shiftAt = (streak) => soundsFor([{ type: 'kill', mine: true, streak }])[0].shift;
  assert.equal(shiftAt(1), 0);
  assert.ok(shiftAt(4) > shiftAt(2));
  // 一帧里连拿两个人头（团灭那种），取更长的那一串。
  const double = soundsFor([
    { type: 'kill', mine: true, streak: 2 },
    { type: 'kill', mine: true, streak: 3 },
  ]);
  assert.equal(double[0].shift, streakShift(3));
});

test('阵亡声压过挨枪声：致命那一枪同时发 hit 和 kill', () => {
  const dying = [
    { type: 'hit', mine: false, taken: true },
    { type: 'kill', mine: false, lost: true, streak: 4 },
  ];
  assert.deepEqual(names(dying), ['down']);
});

test('我阵亡的同一帧里我也拿了人头，两声都要有', () => {
  const trade = [
    { type: 'kill', mine: true, streak: 2 },
    { type: 'kill', mine: false, lost: true, streak: 1 },
  ];
  const picked = names(trade);
  assert.deepEqual(picked, ['down', 'frag'], '先交代死了，再交代换掉了一个');
});

test('打空换弹和主动换弹是两个音色', () => {
  assert.deepEqual(names([{ type: 'reload', mine: true, dry: true }]), ['dry']);
  assert.deepEqual(names([{ type: 'reload', mine: true, dry: false }]), ['reload']);
  assert.deepEqual(names([{ type: 'ready', mine: true }]), ['ready']);
});

test('紧急的事排在前面，一批有上限，一帧挤满特效也不糊', () => {
  const flood = [
    { type: 'kill', mine: false, lost: true, streak: 1 },
    { type: 'kill', mine: true, streak: 2 },
    { type: 'hit', mine: true },
    { type: 'ready', mine: true },
    { type: 'shot', mine: true },
    { type: 'shot', mine: false },
    { type: 'impact' },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.deepEqual(picks.map((p) => p.name), ['down', 'frag', 'mark', 'ready']);
  assert.equal(new Set(picks.map((p) => p.name)).size, picks.length, '不该有重复音名');
});

test('每个派生出来的音名都在音色表里，没特效就一声不出', () => {
  const batches = [
    [{ type: 'shot', mine: true }],
    [{ type: 'shot', mine: false }],
    [{ type: 'impact' }],
    [{ type: 'hit', mine: true }],
    [{ type: 'hit', taken: true }],
    [{ type: 'kill', mine: true, streak: 5 }],
    [{ type: 'kill', lost: true }],
    [{ type: 'spawn', mine: true }],
    [{ type: 'reload', mine: true, dry: true }],
    [{ type: 'ready', mine: true }],
  ];
  for (const effects of batches) {
    for (const name of names(effects)) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('比赛结束按状态出声，交火中不出声', () => {
  assert.equal(matchSound('won'), 'win');
  assert.equal(matchSound('over'), 'lose');
  assert.equal(matchSound('playing'), null);
  assert.equal(matchSound('paused'), null);
  assert.ok(SOUNDS.win && SOUNDS.lose);
});

test('触感只给和自己性命相关的三件事，枪声全程震手会麻', () => {
  assert.equal(vibrationFor([{ type: 'shot', mine: true }]), null);
  assert.equal(vibrationFor([{ type: 'hit', mine: true }]), null, '打中人不震，一局能打中几百次');
  assert.equal(vibrationFor([{ type: 'hit', taken: true }]), VIBRATION.hurt);
  assert.equal(vibrationFor([{ type: 'kill', mine: true, streak: 2 }]), VIBRATION.frag);
  assert.equal(vibrationFor([{ type: 'kill', lost: true }]), VIBRATION.down);
  assert.equal(vibrationFor([]), null);
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」「限流真的挡住了」这两条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { freqs: [], sources: [], resumed: 0, suspended: 0, closed: 0, instances: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (target) => target });
  class Fake {
    constructor() {
      this.sampleRate = 48000;
      // 可推进的时钟：限流是跨帧才成立的，固定 currentTime 测不出来。
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
  const instances = [];
  return {
    Fake: class extends Fake {
      constructor() {
        super();
        instances.push(this);
      }
    },
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
  assert.equal(audio.play('gun'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('gun'), true);
  assert.equal(log.instances, 1);
});

test('别人的枪声被限流挡住，等过了间隔才放行', () => {
  const { Fake, advance } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('shot'), true);
  assert.equal(audio.play('shot'), false, '同一时刻的第二声该被挡住');
  advance(THROTTLE.shot / 2);
  assert.equal(audio.play('shot'), false);
  advance(THROTTLE.shot);
  assert.equal(audio.play('shot'), true);
});

test('限流只管挂了牌的那几个音名，关键反馈一次都不能丢', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  for (const name of ['gun', 'mark', 'hurt', 'frag', 'down', 'ready']) {
    assert.equal(THROTTLE[name], undefined, `${name} 不该被限流`);
    assert.equal(audio.play(name), true);
    assert.equal(audio.play(name), true, `${name} 连着两声都该出`);
  }
});

test('升八度就是频率翻倍，半音移调没算错', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('frag');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('frag', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('shot'), true);
  assert.equal(log.sources.length, 1);
});

test('notify 返回真正出声的条数，被限流掉的不算', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'shot', mine: true }, { type: 'shot', mine: false }];
  assert.equal(audio.notify(effects), 2);
  // 紧接着的下一帧：我的枪照旧出声，别人的枪被间隔挡住。
  assert.equal(audio.notify(effects), 1);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('gun');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('gun'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'shot', mine: true }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('gun');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});


