// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这个游戏的音效该表达什么，是被服务端的事件表决定的。`caseEngine` 每个动作只吐**一个**
// `event`，十二种 type —— 其中**四种是空动作**（`location_unchanged`／`hotspot_revisited`／
// `confrontation_repeated`／`confrontation_failed`），连 `version` 都不加。
//
// 侦探游戏里玩家会把每个热点点一遍、把每个问题问一遍，所以最缺的反馈恰恰是
// **「这一下推进了案子」和「这一下什么都没发生」的区别**。这个区别服务端已经算好了，
// 白扔掉太可惜。至于「这一手漂亮不漂亮」，服务端没有这种分档 —— 结局只有 solved／failed
// 两种，没有「完美通关」，所以音效层不假装有。
//
// 一个坑：`state.lastEvent` 一直留在 state 里，而开局／读档的响应**没有**顶层 `event`
// （`investigationService.startCase`／`getCase` 只返回 `{ gameId, state }`）。
// 所以只认 `result.event`，绝不读 `state.lastEvent` —— 否则刷新页面会把上一次的动作重播一遍。
//
// 分工照旧：表和 cueForEvent 是纯的，能在 node 里单测；只有 createAudio 碰 AudioContext 且懒建。

const NOTE = {
  C2: 65.41, G2: 98, C3: 130.81, E3: 164.81, G3: 196,
  C4: 261.63, E4: 329.63, G4: 392, B4: 493.88, C5: 523.25, E5: 659.25,
};

export const SOUNDS = {
  // 换场景：一记轻轻的空间感扫声，像推开一扇门。
  move: { noise: { dur: 0.22, gain: 0.035, cutoff: 1400, type: 'bandpass' } },

  // 找到新证据：上行两音 + 一点微光。音高随进度走（见 progressShift），越接近凑齐越亮。
  evidence: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.09, gain: 0.06 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.24, gain: 0.07, delay: 0.08 },
      { wave: 'sine', freq: NOTE.E5, to: NOTE.E5, dur: 0.3, gain: 0.04, delay: 0.16 },
    ],
  },
  // 问出了新线索：比证据素一点，但明确「这句话有用」。
  lead: {
    tones: [
      { wave: 'sine', freq: NOTE.E4, to: NOTE.E4, dur: 0.1, gain: 0.055 },
      { wave: 'sine', freq: NOTE.B4, to: NOTE.B4, dur: 0.26, gain: 0.055, delay: 0.09 },
    ],
  },
  // 对方答了一句，但没给出新东西。一记温和的落点，不该像奖励。
  reply: { tones: [{ wave: 'sine', freq: 420, to: 360, dur: 0.11, gain: 0.04 }] },

  // 出示证据把人问住了：全局最好的中段时刻，做成一记闷钟 + 上行。
  breakthrough: {
    tones: [
      { wave: 'sine', freq: NOTE.C3, to: NOTE.C3, dur: 0.5, gain: 0.075 },
      { wave: 'triangle', freq: NOTE.G3, to: NOTE.G3, dur: 0.3, gain: 0.06, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.4, gain: 0.06, delay: 0.16 },
      { wave: 'sine', freq: NOTE.E4, to: NOTE.E4, dur: 0.45, gain: 0.045, delay: 0.26 },
    ],
    noise: { dur: 0.14, gain: 0.03, cutoff: 900 },
  },

  // 这份证据对这个人没用。是错，但不是重罪 —— 一记短的下行，别做成蜂鸣器。
  wrong: { tones: [{ wave: 'triangle', freq: 300, to: 190, dur: 0.16, gain: 0.05 }] },
  // 已经看过／已经在这儿／已经出示过：一记很轻的木头声。重看不是错，别惩罚它。
  nothing: { tones: [{ wave: 'sine', freq: 230, to: 210, dur: 0.07, gain: 0.03 }] },

  // 指控被驳回。机会越少音越低（见 remainingShift），这是全局唯一一处真正的分档。
  rejected: {
    tones: [
      { wave: 'triangle', freq: NOTE.G3, to: NOTE.G3, dur: 0.2, gain: 0.06 },
      { wave: 'triangle', freq: NOTE.E3, to: NOTE.E3, dur: 0.4, gain: 0.06, delay: 0.16 },
    ],
    noise: { dur: 0.12, gain: 0.03, cutoff: 600 },
  },
  solved: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.5, gain: 0.085 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.5, gain: 0.075, delay: 0.09 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.55, gain: 0.075, delay: 0.18 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.8, gain: 0.06, delay: 0.28 },
    ],
  },
  // 三次用尽。往下塌，但不刺耳 —— 输了不该被音效再踩一脚。
  failed: {
    tones: [
      { wave: 'sine', freq: NOTE.G3, to: NOTE.G3, dur: 0.5, gain: 0.07 },
      { wave: 'sine', freq: NOTE.C3, to: NOTE.C3, dur: 0.6, gain: 0.06, delay: 0.14 },
      { wave: 'sine', freq: NOTE.C2, to: NOTE.C2, dur: 1, gain: 0.05, delay: 0.3 },
    ],
  },

  // 请求失败／版本冲突。跟「猜错了」必须分开：一个是你的判断，一个是机器的问题。
  error: {
    tones: [{ wave: 'square', freq: 220, to: 220, dur: 0.07, gain: 0.045 }],
    noise: { dur: 0.1, gain: 0.035, cutoff: 1200, type: 'highpass' },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/**
 * 服务端 event.type → 音色。`null` 表示这一档不出声。
 * 有两个 type 需要看 event 上的别的字段才能定，见 cueForEvent。
 */
export const EVENT_CUES = {
  case_started: null,          // 开局／读档的响应根本没有顶层 event，这里只是把它写全
  location_visited: 'move',
  location_unchanged: 'nothing',
  hotspot_inspected: 'evidence',
  hotspot_revisited: 'nothing',
  dialogue_completed: 'reply', // 带 evidenceId 时升级成 lead，见 cueForEvent
  confrontation_succeeded: 'breakthrough',
  confrontation_failed: 'wrong',
  confrontation_repeated: 'nothing',
  case_solved: 'solved',
  accusation_rejected: 'rejected',
  case_failed: 'failed',
};

// 收集音的音高随进度爬。用大调音阶而不是等分半音：等分听起来像仪器读数，音阶像在收拢。
export const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

export const progressShift = (found = 0, total = 0) => {
  const span = Math.max(1, Math.trunc(total) || 1);
  const at = Math.max(0, Math.min(span, Math.trunc(found) || 0));
  return SCALE[Math.round((at / span) * (SCALE.length - 1))];
};

// 指控机会越少，驳回声越低。这是服务端唯一给出的分档，别浪费。
export const remainingShift = (remaining) => {
  const left = Number.isFinite(remaining) ? Math.max(0, Math.trunc(remaining)) : 2;
  return left >= 2 ? 0 : left === 1 ? -3 : -5;
};

/**
 * 一次动作该出哪一声。`event` 只能是响应的**顶层** event，不能是 state.lastEvent。
 * 返回 `{ name, shift }` 或 null。
 */
export function cueForEvent(event, state = {}) {
  if (!event?.type) return null;
  const base = EVENT_CUES[event.type];
  if (base === undefined) return null;   // 服务端加了新 type，宁可静默也不要乱响
  if (base === null) return null;

  if (event.type === 'hotspot_inspected') {
    const { found, total } = state.progress ?? {};
    return { name: 'evidence', shift: progressShift(found, total) };
  }
  if (event.type === 'dialogue_completed') {
    // 问出新证据是稀罕事（整个案子只有一处），该跟普通回答分开。
    return event.evidenceId ? { name: 'lead', shift: 0 } : { name: 'reply', shift: 0 };
  }
  if (event.type === 'accusation_rejected') {
    return { name: 'rejected', shift: remainingShift(event.remaining) };
  }
  if (event.type === 'confrontation_succeeded' && event.evidenceIdGranted) {
    // 问住人又顺带拿到证据：还是那一声，但升一点，听得出来这次更值。
    // 字段名跟 hotspot 那边不一样（evidenceIdGranted vs evidenceId），是服务端的既有命名。
    return { name: 'breakthrough', shift: 2 };
  }
  return { name: base, shift: 0 };
}

/** 震动只给四个关口：结案、失败、被驳回、问住人。翻证据不震。 */
export const VIBRATION = {
  solved: [30, 50, 30, 50, 60],
  failed: [60, 40, 60],
  rejected: [26, 30, 26],
  breakthrough: [18, 30, 18],
};

export const vibrationFor = (name) => VIBRATION[name] ?? null;

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

// 最小间隔，秒。只压那几条会被连点触发的；破案和结案一次一响，不许被吞。
export const THROTTLE = { nothing: 0.12, move: 0.1, reply: 0.08, error: 0.3 };

// 半音换算：升 n 个半音就是乘 2^(n/12)。
const transpose = (freq, shift) => (shift ? freq * 2 ** (shift / 12) : freq);

/**
 * 出声的那一半。AudioContext 必须等用户手势才能起，所以全程懒建：
 * 静音状态下一个节点都不建。
 */
export function createAudio({ muted = false, Ctor } = {}) {
  const AudioCtor = Ctor
    ?? (typeof window === 'undefined' ? null : window.AudioContext ?? window.webkitAudioContext);
  let ctx = null;
  let master = null;
  let silent = Boolean(muted);
  let noiseBuffer = null;
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

    play(name, shift = 0) {
      const spec = SOUNDS[name];
      if (!spec || !ensure()) return false;
      const at = ctx.currentTime;
      const gap = THROTTLE[name];
      if (gap !== undefined && at - (lastAt.get(name) ?? -Infinity) < gap) return false;
      lastAt.set(name, at);
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0), shift);
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      if (!silent) vibrate(vibrationFor(name));
      return true;
    },

    /**
     * 直接喂服务端响应。只认 `result.event` —— 开局／读档没有它，所以刷新页面不会重播。
     */
    notify(result) {
      const cue = cueForEvent(result?.event, result?.state);
      return cue ? this.play(cue.name, cue.shift) : false;
    },

    setMuted(next) {
      silent = Boolean(next);
      if (silent && ctx) ctx.suspend().catch(() => {});
      return silent;
    },

    dispose() {
      if (!ctx) return;
      ctx.close().catch(() => {});
      ctx = null;
      master = null;
      noiseBuffer = null;
    },
  };
}

