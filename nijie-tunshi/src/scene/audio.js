// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这游戏的接法跟仓库里其他几个不一样，原因在事件通道的形状。别的游戏一次动作吐一份
// effects 数组，放完就丢；这里 simulation 维护三条**带 id 的队列**
// （collectionEvents / stageUpEvents / actionEvents，各封顶 48 条），每帧读到的是
// 「至今为止的尾巴」，不是「这一帧新增的」。照直喂给播放器会把同一声重放几十遍。
//
// createScene 用三个 Set 去重。音频这边不照抄：那三个 Set 一局下来只涨不消。
// 事件 id 是 `${type}-${eventCursor}`，而 eventCursor 在一局里单调递增 —— 所以记住
// 「听到第几号」就够了：O(1) 内存，而且换局时 eventCursor 归零，一比就知道该重置水位线。
//
// 分工照旧：数据表和 listen/cuesFor 是纯的，能在 node 里单测；只有 createAudio 碰
// AudioContext，且懒建。
import { PLAYER_STAGES } from '../game/progression.js';

const NOTE = {
  C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392,
  A4: 440, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5,
};

export const SOUNDS = {
  // 吞下小糖：一记短脆的「啵」。一局要响上百次，压到只剩轮廓。
  bite: {
    tones: [{ wave: 'sine', freq: 620, to: 880, dur: 0.07, gain: 0.05 }],
  },
  // 吞下大糖：低一截、带一点噗的空气声，跟小糖一听就分得开。
  chomp: {
    tones: [
      { wave: 'sine', freq: 300, to: 460, dur: 0.13, gain: 0.075 },
      { wave: 'triangle', freq: 150, to: 210, dur: 0.11, gain: 0.04 },
    ],
    noise: { dur: 0.1, gain: 0.035, cutoff: 900 },
  },
  // 形态进阶：上行三音，音高跟着阶段走（见 stageShift）。这是成长感的主音。
  stage: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.1, gain: 0.08 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.1, gain: 0.08, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.26, gain: 0.09, delay: 0.16 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.3, gain: 0.06, delay: 0.24 },
    ],
  },
  // 剧情推进：一记轻钟。故意做得比 stage 素，它是「新目标」而不是「我变强了」。
  story: {
    tones: [{ wave: 'sine', freq: NOTE.A4, to: NOTE.E5, dur: 0.28, gain: 0.055 }],
  },
  // 糖化爆发：全曲最亮的一声，一局只响一次。
  ignite: {
    tones: [
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C6, dur: 0.7, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G5, dur: 0.6, gain: 0.07, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.5, gain: 0.06, delay: 0.18 },
    ],
    noise: { dur: 0.9, gain: 0.05, cutoff: 400, type: 'highpass' },
  },
  // 冲刺碎糖壳：一记干脆的裂响。
  crack: {
    tones: [{ wave: 'square', freq: 380, to: 180, dur: 0.09, gain: 0.05 }],
    noise: { dur: 0.16, gain: 0.06, cutoff: 2200, type: 'highpass' },
  },
  // 锚点解除：上行两音 + 一记闷响，「开了一道门」。
  unlock: {
    tones: [
      { wave: 'triangle', freq: NOTE.G3, to: NOTE.G3, dur: 0.1, gain: 0.06 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.26, gain: 0.07, delay: 0.09 },
    ],
    noise: { dur: 0.12, gain: 0.04, cutoff: 700 },
  },
  // 甜酸反转：一记上滑的滑音，像糖化了。
  flip: {
    tones: [{ wave: 'sine', freq: 240, to: 700, dur: 0.24, gain: 0.05 }],
  },
  // 稳定度扣减：下滑的一声，明确是「亏了」而不是「没反应」。
  hurt: {
    tones: [{ wave: 'sawtooth', freq: 320, to: 110, dur: 0.22, gain: 0.06 }],
    noise: { dur: 0.14, gain: 0.04, cutoff: 500 },
  },
  // 进糖洞：一段上行的长音，跟结算分开，玩家还在跃迁动画里。
  ascend: {
    tones: [
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C5, dur: 0.9, gain: 0.08 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G5, dur: 0.8, gain: 0.05, delay: 0.15 },
    ],
  },
  // 通关：大三和弦铺开。
  won: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.5, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.5, gain: 0.08, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.55, gain: 0.08, delay: 0.14 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.7, gain: 0.07, delay: 0.22 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 一帧最多出这么多声。实时游戏里「吃到糖 + 掉稳定度 + 碎糖壳」同帧发生是常事，全放会糊。
export const MAX_PER_BATCH = 3;

// 这几条队列按这个顺序合并，之后再按 id 排序，所以顺序只影响同号事件（不存在）。
export const QUEUES = ['collectionEvents', 'stageUpEvents', 'actionEvents'];

// 质量到这个数才算「大糖」。手工关里 orb/shard 是 1~5，cylinder 起跳就是 7 以上。
export const CHOMP_MASS = 8;

// 连击的音高走五声音阶：连吃二十颗时半音阶会像警笛，五声音阶每一级都还在调里。
export const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

export const comboShift = (combo = 1) =>
  PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, Math.trunc(combo) - 1))];

// 形态越高，进阶那一声越亮。六个形态铺满一个八度出头。
export const stageShift = (toStage = 0) =>
  Math.max(0, Math.min(PLAYER_STAGES.length - 1, Math.trunc(toStage) || 0)) * 2;

/** 从 `${type}-${cursor}` 里取出那个单调递增的号。取不出来当 0，宁可漏放不要重放。 */
export const sequenceOf = (id) => {
  const tail = String(id ?? '').split('-').at(-1);
  const seq = Number.parseInt(tail, 10);
  return Number.isFinite(seq) ? seq : 0;
};

export const createListener = () => ({ cursor: 0, stage: null, status: null });

/**
 * 三条队列里比水位线新的事件，按 id 号排好。
 * 换局时 state.eventCursor 归零，此时水位线整个作废 —— 否则新一局前几十个事件全被吞掉。
 */
export function eventsSince(state = {}, cursor = 0) {
  const base = (Number(state.eventCursor) || 0) < cursor ? 0 : cursor;
  const events = [];
  for (const queue of QUEUES) {
    for (const event of state[queue] ?? []) {
      const seq = sequenceOf(event.id);
      if (seq > base) events.push({ ...event, seq, queue });
    }
  }
  events.sort((a, b) => a.seq - b.seq);
  // 队列封顶 48 条，被挤掉的号永远追不回来了，所以水位线只认「真看见过的最大号」。
  const next = events.length > 0 ? events.at(-1).seq : base;
  return { events, cursor: next };
}

/**
 * 这一批该出哪些声，按播放顺序返回 `{ name, shift }`。shift 是半音数。
 * `previous` 是上一帧的 listener，用来 diff 那些不走事件队列的跳变（状态、剧情阶段）。
 */
export function cuesFor(events = [], state = {}, previous = {}) {
  // 通关和跃迁是状态跳变，不在队列里。它们独占这一批：这一局到此为止，别让咀嚼声压在上面。
  if (state.status === 'won' && previous.status !== 'won') return [{ name: 'won', shift: 0 }];
  if (state.status === 'ascending' && previous.status !== 'ascending') return [{ name: 'ascend', shift: 0 }];

  const picked = [];
  const push = (name, shift = 0) => {
    if (!picked.some((cue) => cue.name === name)) picked.push({ name, shift });
  };
  const has = (type) => events.some((event) => event.type === type);

  if (has('stellarIgnition')) push('ignite');
  const grew = events.find((event) => event.type === 'stageUp');
  if (grew) {
    push('stage', stageShift(grew.toStage));
  } else if (state.encounter?.stage && previous.stage && state.encounter.stage !== previous.stage) {
    // 剧情阶段只在**没有形态进阶**的那一帧才出声。七个剧情阈值（0/12/22/32/60/90/130）
    // 里有六个跟形态阈值重合，照直 diff 会在同一帧响两声 —— 只有 22 那一档（选甜味路线）
    // 是剧情独有的，而那一档恰恰是最该被听见的：它是唯一一个要玩家做决定的节点。
    push('story');
  }

  if (has('stabilityLoss')) push('hurt');
  if (has('anchorBreak')) push('unlock');
  if (has('structureBreak')) push('crack');
  if (has('polarityFlip')) push('flip');

  const eaten = events.filter((event) => event.queue === 'collectionEvents');
  if (eaten.length > 0) {
    // 一帧能同时吞下好几颗（吸附把一片糖屑一起拉进来）。挑最大的那颗定音色，
    // 剩下的数量差别靠 combo 的音高体现 —— 同帧放五声只会糊成一团噪音。
    const biggest = eaten.reduce((best, event) => ((event.mass ?? 0) > (best.mass ?? 0) ? event : best));
    push((biggest.mass ?? 0) >= CHOMP_MASS ? 'chomp' : 'bite', comboShift(state.player?.combo ?? 1));
  }

  return picked.slice(0, MAX_PER_BATCH);
}

/** 一帧的全部工作：读新事件、算出该出的声、给出新的 listener。纯函数，可单测。 */
export function listen(listener, state = {}) {
  const base = listener ?? createListener();
  const { events, cursor } = eventsSince(state, base.cursor);
  return {
    cues: cuesFor(events, state, base),
    listener: { cursor, stage: state.encounter?.stage ?? null, status: state.status ?? null },
  };
}

/** 触觉反馈只给四个关口。实时游戏里吃一颗糖就震一下会麻。 */
export const VIBRATION = {
  won: [30, 50, 30, 50, 60],
  ascend: [20, 40, 20, 40, 50],
  ignite: [40, 60, 40],
  stage: [18, 30, 18],
  hurt: [26],
};

export function vibrationFor(cues = []) {
  for (const name of ['won', 'ascend', 'ignite', 'stage', 'hurt']) {
    if (cues.some((cue) => cue.name === name)) return VIBRATION[name];
  }
  return null;
}

export function vibrate(pattern) {
  if (!pattern) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    // 部分浏览器在无用户手势时会抛，震不了不该影响这一局。
    return false;
  }
}

// 最小间隔，秒。限流跨帧才成立，所以放在引擎里而不是 cuesFor 里 —— cuesFor 只管一批之内。
export const THROTTLE = { bite: 0.05, chomp: 0.07, crack: 0.1, flip: 0.14, hurt: 0.25 };

// 半音换算：升 n 个半音就是乘 2^(n/12)。
const transpose = (freq, shift) => (shift ? freq * 2 ** (shift / 12) : freq);

/**
 * 出声的那一半。AudioContext 必须等用户手势才能起，所以全程懒建：
 * 静音状态下一个节点都不建，从头到尾静音玩就不会有音频线程。
 */
export function createAudio({ muted = false, Ctor } = {}) {
  const AudioCtor = Ctor
    ?? (typeof window === 'undefined' ? null : window.AudioContext ?? window.webkitAudioContext);
  let ctx = null;
  let master = null;
  let silent = Boolean(muted);
  let noiseBuffer = null;
  let listener = createListener();
  const lastAt = new Map();

  const ensure = () => {
    if (silent || !AudioCtor) return null;
    if (!ctx) {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    // 移动端切后台回来会挂起，不 resume 就是一路静默。
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const takeNoise = () => {
    if (!noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  };

  // 包络统一走 setValueAtTime + 指数衰减：线性衰减在短音上会听出一声「咔」。
  const envelope = (node, at, dur, gain) => {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, dur * 0.3));
    node.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  };

  const playTone = (spec, at, shift) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const from = transpose(spec.freq, shift);
    const to = transpose(spec.to ?? spec.freq, shift);
    osc.type = spec.wave ?? 'sine';
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + spec.dur);
    envelope(gain, at, spec.dur, spec.gain);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + spec.dur + 0.02);
  };

  const playNoise = (spec, at) => {
    const source = ctx.createBufferSource();
    source.buffer = takeNoise();
    const filter = ctx.createBiquadFilter();
    filter.type = spec.type ?? 'lowpass';
    filter.frequency.value = spec.cutoff ?? 800;
    const gain = ctx.createGain();
    envelope(gain, at, spec.dur, spec.gain);
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
    source.stop(at + spec.dur + 0.02);
  };

  return {
    get muted() {
      return silent;
    },

    play(name, { shift = 0, offset = 0 } = {}) {
      const spec = SOUNDS[name];
      if (!spec || !ensure()) return false;
      const at = ctx.currentTime + offset;
      const gap = THROTTLE[name];
      if (gap !== undefined && at - (lastAt.get(name) ?? -Infinity) < gap) return false;
      lastAt.set(name, at);
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0), shift);
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      return true;
    },

    /**
     * 每帧把整份 state 喂进来。水位线在这里推进 —— 即使静音也要推进，
     * 否则中途开声会把攒下的几十个事件一起放出来。
     */
    notify(state) {
      const result = listen(listener, state);
      listener = result.listener;
      let played = 0;
      for (const cue of result.cues) {
        if (this.play(cue.name, { shift: cue.shift })) played += 1;
      }
      if (played > 0 && !silent) vibrate(vibrationFor(result.cues));
      return played;
    },

    setMuted(next) {
      silent = Boolean(next);
      if (silent && ctx) ctx.suspend().catch(() => {});
      return silent;
    },

    dispose() {
      listener = createListener();
      if (!ctx) return;
      ctx.close().catch(() => {});
      ctx = null;
      master = null;
      noiseBuffer = null;
    },
  };
}


