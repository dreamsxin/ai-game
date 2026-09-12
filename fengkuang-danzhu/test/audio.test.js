import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_FEEL,
  CHAIN_SHIFTS,
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  VIBRATION,
  VOLLEY_SHIFTS,
  brickCount,
  chainShift,
  createAudio,
  plusCount,
  soundsFor,
  vibrationFor,
  volleyShift,
} from '../src/scene/audio.js';

const names = (effects) => soundsFor(effects).map((pick) => pick.name);
const peak = (spec) =>
  Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
const brick = (over = {}) => ({ col: 3, row: 4, kind: 'brick', hp: 1, ...over });

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

test('越高频的事件越轻：出膛 < 擦碰 < 砸碎 < 结束', () => {
  assert.ok(peak(SOUNDS.launch) < peak(SOUNDS.hit));
  assert.ok(peak(SOUNDS.hit) < peak(SOUNDS.break));
  assert.ok(peak(SOUNDS.break) < peak(SOUNDS.over));
});

test('一下带走的砖越多音越高，到顶就不再往上走', () => {
  assert.equal(chainShift(1), CHAIN_SHIFTS[0]);
  assert.equal(chainShift(2), CHAIN_SHIFTS[1]);
  assert.equal(chainShift(99), CHAIN_SHIFTS.at(-1), '再大也不该刺耳');
  for (let i = 1; i < CHAIN_SHIFTS.length; i += 1) {
    assert.ok(CHAIN_SHIFTS[i] > CHAIN_SHIFTS[i - 1], '半音表必须单调递增');
  }
});

test('一串弹珠越长发射声越高，每四颗上一档', () => {
  assert.equal(volleyShift(1), VOLLEY_SHIFTS[0]);
  assert.equal(volleyShift(4), VOLLEY_SHIFTS[0]);
  assert.equal(volleyShift(5), VOLLEY_SHIFTS[1]);
  assert.equal(volleyShift(200), VOLLEY_SHIFTS.at(-1));
  const shiftAt = (balls) => soundsFor([{ type: 'fire', balls, aim: { x: 0, y: -1 } }])[0].shift;
  assert.equal(shiftAt(3), 0);
  assert.ok(shiftAt(20) > shiftAt(6));
});

test('break.chain 把加珠也算进去了，做音高映射要按真砖数', () => {
  const mixed = { type: 'break', cells: [brick(), brick(), brick({ kind: 'plus' })], chain: 3 };
  assert.equal(mixed.chain, 3);
  assert.equal(brickCount(mixed), 2, '加珠不是砖');
  assert.equal(plusCount(mixed), 1);
  // 这一片里还有加珠，铃声排在砸碎声之前，所以按音名找而不是取第一条。
  const pick = soundsFor([mixed]).find((p) => p.name === 'break');
  assert.equal(pick.shift, chainShift(2), '两块砖就按两块算');
});

test('炸弹连爆顺手带走的加珠也要出铃声：它不发 pickup 事件', () => {
  const swallowed = { type: 'break', cells: [brick(), brick({ kind: 'plus' })], chain: 2 };
  const picked = names([swallowed]);
  assert.ok(picked.includes('pickup'), '这一片里有加珠，得听得出来');
  assert.ok(picked.includes('break'));
});

test('纯砖的连爆不出铃声', () => {
  assert.deepEqual(names([{ type: 'break', cells: [brick(), brick()], chain: 2 }]), ['break']);
});

test('全是加珠的一片只出铃声，不出砸碎声', () => {
  const onlyPlus = { type: 'break', cells: [brick({ kind: 'plus' })], chain: 1 };
  assert.deepEqual(names([onlyPlus]), ['pickup']);
});

test('结束那一声独占这一批：这一局到此为止', () => {
  const ending = [
    { type: 'hit', col: 1, row: 1 },
    { type: 'land', count: 3 },
    { type: 'descend', turn: 12 },
    { type: 'over', reason: 'overflow' },
  ];
  assert.deepEqual(names(ending), ['over']);
});

test('每种事件都能派生出音，且都在音色表里', () => {
  const batches = [
    [{ type: 'fire', balls: 6, aim: { x: 0, y: -1 } }],
    [{ type: 'launch', remaining: 4 }],
    [{ type: 'hit', col: 2, row: 3 }],
    [{ type: 'break', cells: [brick()], chain: 1 }],
    [{ type: 'pickup', col: 2, row: 3, balls: 7 }],
    [{ type: 'land', count: 2 }],
    [{ type: 'descend', turn: 5 }],
    [{ type: 'over', reason: 'overflow' }],
  ];
  for (const effects of batches) {
    const picked = names(effects);
    assert.ok(picked.length > 0, `${effects[0].type} 一声都不出`);
    for (const name of picked) assert.ok(SOUNDS[name], `${name} 不在音色表里`);
  }
  assert.deepEqual(soundsFor([]), []);
});

test('紧急的事排在前面，一批有上限，一帧挤满特效也不糊', () => {
  const flood = [
    { type: 'descend', turn: 9 },
    { type: 'pickup', col: 1, row: 1, balls: 9 },
    { type: 'break', cells: [brick(), brick(), brick()], chain: 3 },
    { type: 'fire', balls: 9, aim: { x: 0, y: -1 } },
    { type: 'land', count: 1 },
    { type: 'launch', remaining: 2 },
    { type: 'hit', col: 4, row: 2 },
  ];
  const picks = soundsFor(flood);
  assert.equal(picks.length, MAX_PER_BATCH);
  assert.deepEqual(picks.map((p) => p.name), ['descend', 'pickup', 'break']);
});

test('同一帧里两次连爆取更大的那一片', () => {
  const two = [
    { type: 'break', cells: [brick()], chain: 1 },
    { type: 'break', cells: [brick(), brick(), brick(), brick()], chain: 4 },
  ];
  const picks = soundsFor(two).filter((p) => p.name === 'break');
  assert.equal(picks.length, 1, '同名只留一条');
  assert.equal(picks[0].shift, chainShift(4));
});

test('触感只在结束和一次炸开一大片时给，弹珠全程都震会麻', () => {
  assert.equal(vibrationFor([{ type: 'launch', remaining: 1 }]), null);
  assert.equal(vibrationFor([{ type: 'hit', col: 1, row: 1 }]), null);
  const small = [{ type: 'break', cells: [brick(), brick()], chain: 2 }];
  assert.equal(vibrationFor(small), null, `不到 ${CHAIN_FEEL} 块不算炸开一片`);
  const big = [{ type: 'break', cells: Array.from({ length: CHAIN_FEEL }, () => brick()), chain: CHAIN_FEEL }];
  assert.equal(vibrationFor(big), VIBRATION.chain);
  assert.equal(vibrationFor([{ type: 'over', reason: 'overflow' }]), VIBRATION.over);
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
      // 可推进的时钟：限流是跨帧才成立的，固定 currentTime 测不出来。
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
  assert.equal(audio.play('break'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('break'), true);
  assert.equal(log.instances, 1);
});

test('擦碰声被限流挡住，等过了间隔才放行', () => {
  const { Fake, advance } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('hit'), true);
  assert.equal(audio.play('hit'), false, '同一时刻的第二声该被挡住');
  advance(THROTTLE.hit / 2);
  assert.equal(audio.play('hit'), false);
  advance(THROTTLE.hit);
  assert.equal(audio.play('hit'), true);
});

test('限流只管挂了牌的那几个音名，关键反馈一次都不能丢', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  for (const name of ['fire', 'break', 'pickup', 'descend', 'over']) {
    assert.equal(THROTTLE[name], undefined, `${name} 不该被限流`);
    assert.equal(audio.play(name), true);
    assert.equal(audio.play(name), true, `${name} 连着两声都该出`);
  }
});

test('升八度就是频率翻倍，半音移调没算错', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('pickup');
  const base = [...log.freqs];
  log.freqs.length = 0;
  audio.play('pickup', { shift: 12 });
  assert.equal(log.freqs.length, base.length);
  for (let i = 0; i < base.length; i += 1) {
    assert.ok(Math.abs(log.freqs[i] / base[i] - 2) < 1e-9, '升 12 个半音应该正好翻一倍');
  }
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('launch'), true);
  assert.equal(log.sources.length, 1);
});

test('notify 返回真正出声的条数，被限流掉的不算', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const effects = [{ type: 'hit', col: 1, row: 1 }, { type: 'break', cells: [{ kind: 'brick' }], chain: 1 }];
  assert.equal(audio.notify(effects), 2);
  // 紧接着的下一帧：砸碎照旧出声，擦碰被间隔挡住。
  assert.equal(audio.notify(effects), 1);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('fire');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('fire'), false);
  assert.doesNotThrow(() => audio.notify([{ type: 'launch', remaining: 1 }]));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('fire');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});


