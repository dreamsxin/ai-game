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

test('「打进弱点」和「被装甲挡住」必须是两种声音，否则选错机翼听不出来', () => {
  assert.notDeepEqual(SOUNDS.pierce.tones, SOUNDS.chip.tones);
  const pierceFreq = SOUNDS.pierce.tones[0].freq;
  const chipFreq = SOUNDS.chip.tones[0].freq;
  assert.ok(pierceFreq > chipFreq * 2, '打进去要明显更亮，闷响留给白打');
  // 同一帧里两种都有时只报一种，报的是「有进展」那种。
  assert.deepEqual(names([{ type: 'chip' }, { type: 'pierce' }]), ['pierce']);
  assert.deepEqual(names([{ type: 'chip' }]), ['chip']);
});

test('消弹的音高跟着连消数往上爬，爬到顶就不再往上走', () => {
  assert.equal(chainShift(1), CHAIN_SHIFTS[0]);
  assert.equal(chainShift(2), CHAIN_SHIFTS[1]);
  assert.equal(chainShift(CHAIN_SHIFTS.length), CHAIN_SHIFTS.at(-1));
  assert.equal(chainShift(99), CHAIN_SHIFTS.at(-1), '再多也不该刺耳');
  assert.equal(chainShift(0), CHAIN_SHIFTS[0]);
  for (let i = 1; i < CHAIN_SHIFTS.length; i += 1) {
    assert.ok(CHAIN_SHIFTS[i] > CHAIN_SHIFTS[i - 1], '半音表必须单调递增');
  }
  const [pick] = soundsFor([{ type: 'pop', chain: 4 }]);
  assert.equal(pick.name, 'pop');
  assert.equal(pick.shift, chainShift(4));
});

test('消弹声比打中敌人的声音更亮：一个是防守成功，一个是进攻生效', () => {
  assert.ok(SOUNDS.pop.tones[0].freq > SOUNDS.hit.tones[0].freq);
  // 一帧里既打掉敌弹又打死敌人，两声都要有。
  const both = names([{ type: 'pop', chain: 1 }, { type: 'kill', kind: 'zako' }]);
  assert.ok(both.includes('pop'));
  assert.ok(both.includes('kill'));
});

test('掉命独占一拍，别让消弹和爆炸盖在上面', () => {
  assert.deepEqual(names([{ type: 'pop', chain: 3 }, { type: 'kill' }, { type: 'die' }]), ['die']);
});

test('打掉 Boss 时爆炸和过关和弦一起响，其他杂声让位', () => {
  assert.deepEqual(names([{ type: 'pop', chain: 2 }, { type: 'bossKill' }]), ['bossKill', 'clear']);
});

test('跳关是一次独立的选择，它的声音不和别的混在一起', () => {
  assert.deepEqual(names([{ type: 'skip' }, { type: 'pop', chain: 1 }]), ['skip']);
});

test('火力配置变了的几声压过一切日常音：接下来怎么打全靠它们', () => {
  const picks = names([
    { type: 'pop', chain: 6 },
    { type: 'hit' },
    { type: 'wingLost', code: 'C' },
  ]);
  assert.equal(picks[0], 'wingLost', '翅膀没了是这一帧最该被听见的事');
});

test('主动弃翼和被打掉翅膀是两种声音——一个是决定，一个是事故', () => {
  assert.notDeepEqual(SOUNDS.jettison.tones, SOUNDS.wingLost.tones);
  assert.ok(SOUNDS.wingLost.tones[0].gain > SOUNDS.jettison.tones[0].gain, '被崩掉要更难听');
});

test('换翼时只报换翼，不再补一遍接翼——同一件事不响两次', () => {
  const picks = names([{ type: 'catch', code: 'J' }, { type: 'swap', code: 'J' }]);
  assert.ok(picks.includes('swap'));
  assert.ok(!picks.includes('catch'));
});

test('一帧最多出三声，再热闹也不糊', () => {
  const picks = soundsFor([
    { type: 'wingLost', code: 'C' },
    { type: 'bare' },
    { type: 'carrier', code: 'J' },
    { type: 'pierce' },
    { type: 'pop', chain: 2 },
    { type: 'kill' },
  ]);
  assert.equal(picks.length, MAX_PER_BATCH);
});

test('震动只给关口事件，消弹和打中一概不震', () => {
  assert.equal(vibrationFor([{ type: 'pop', chain: 5 }]), null);
  assert.equal(vibrationFor([{ type: 'hit' }]), null);
  assert.deepEqual(vibrationFor([{ type: 'die' }]), VIBRATION.die);
  assert.deepEqual(vibrationFor([{ type: 'wingLost' }]), VIBRATION.wingLost);
  assert.deepEqual(vibrationFor([{ type: 'jettison' }]), VIBRATION.jettison);
  // 同时命中就取信息量最大的那条。
  assert.deepEqual(vibrationFor([{ type: 'jettison' }, { type: 'die' }]), VIBRATION.die);
});

test('进化压过接翼和换翼：同一帧里最该被听见的是「上了一个台阶」', () => {
  const picks = names([
    { type: 'catch', code: 'C' },
    { type: 'swap', code: 'C' },
    { type: 'evolve', code: 'C', tier: 2 },
  ]);
  assert.ok(picks.includes('evolve'));
  assert.ok(!picks.includes('catch'));
  assert.ok(!picks.includes('swap'));
  // 进化比接翼更长更亮：它改变的是接下来整关的火力。
  assert.ok(SOUNDS.evolve.tones.length > SOUNDS.catch.tones.length);
  assert.deepEqual(vibrationFor([{ type: 'evolve' }]), VIBRATION.evolve);
});

test('满阶再捡到同型号是一声应答，不是失败音也不是静默', () => {
  assert.deepEqual(names([{ type: 'topped', code: 'C' }]), ['topped']);
  // 它比进化轻得多，不能抢戏。
  assert.ok(SOUNDS.topped.tones[0].gain < SOUNDS.evolve.tones[0].gain);
});

test('链弧的跳弹声压得很轻：它一帧可能响好几次', () => {
  assert.ok(SOUNDS.arc.tones[0].gain < SOUNDS.kill.tones[0].gain);
  // 有爆炸的时候让位给爆炸。
  assert.ok(!names([{ type: 'kill' }, { type: 'arc' }]).includes('arc'));
  assert.deepEqual(names([{ type: 'arc' }]), ['arc']);
});

test('反物质爆炸有自己的一声，和普通爆炸分得开', () => {
  assert.notDeepEqual(SOUNDS.burst.tones, SOUNDS.kill.tones);
  assert.ok(names([{ type: 'burst' }]).includes('burst'));
});

test('通关和弦按星数走，星数缺失也不静默', () => {
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1');
  assert.equal(winSound(undefined), 'win1');
  assert.equal(winSound(9), 'win3');
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」「半音移调真的移了」这两条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { freqs: [], sources: 0, resumed: 0, suspended: 0, closed: 0, instances: 0 };
  class Fake {
    constructor() {
      log.instances += 1;
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = { connect() {} };
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (node) => node,
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: (value) => log.freqs.push(value),
          exponentialRampToValueAtTime() {},
        },
        connect: (node) => node,
        start() {},
        stop() {},
      };
    }
    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      log.sources += 1;
      return { buffer: null, connect: (node) => node, start() {}, stop() {} };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, connect: (node) => node };
    }
    resume() {
      log.resumed += 1;
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
  assert.equal(audio.play('pop'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('pop'), true);
  assert.equal(log.instances, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
});

test('半音移调真的把频率抬上去了', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('pop');
  const base = log.freqs[0];
  log.freqs.length = 0;
  audio.play('pop', { shift: 12 });
  assert.ok(Math.abs(log.freqs[0] - base * 2) < 0.01, '升 12 个半音就是翻一倍');
});

test('notify 直接吃一批 effects，出几声就报几声', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.notify([{ type: 'die' }]), 1);
  assert.equal(audio.notify([]), 0);
});
