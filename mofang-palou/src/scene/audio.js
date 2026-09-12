// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能在 node 里单测；
// createAudio 才碰 AudioContext，且只在第一次真要出声时才建。
//
// 这游戏最要紧的一条：**推柱和推行列必须一听就分得开**。柱是那条多出来的轴，
// 玩家需要一个听觉确认「我刚才动的是楼层之间那一维」，不然三条轴在感官上是一样的。
import { AXIS_PILLAR } from '../game/rules.js';

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99 };

export const SOUNDS = {
  // 推行／推列：一记短促的木质摩擦。一局要响几十次，压到只剩轮廓。
  slide: {
    noise: { dur: 0.09, gain: 0.05, cutoff: 1500 },
    tones: [{ wave: 'triangle', freq: 210, to: 150, dur: 0.1, gain: 0.05 }],
  },
  // 推柱：低一截、拖长一点，像整根柱子在井里升降。
  lift: {
    noise: { dur: 0.14, gain: 0.045, cutoff: 700 },
    tones: [
      { wave: 'sine', freq: 120, to: 190, dur: 0.18, gain: 0.08 },
      { wave: 'triangle', freq: NOTE.C3, to: NOTE.G3, dur: 0.16, gain: 0.04, delay: 0.05 },
    ],
  },
  // 路通了：上行三音。这是整局最该被听见的一声。
  open: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.09, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.09, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.22, gain: 0.1, delay: 0.16 },
    ],
  },
  step: {
    tones: [{ wave: 'sine', freq: 320, to: 240, dur: 0.06, gain: 0.045 }],
  },
  // 走不过去：闷的一记，明确是「不行」而不是「没反应」。
  blocked: {
    tones: [{ wave: 'square', freq: 150, to: 96, dur: 0.12, gain: 0.07 }],
    noise: { dur: 0.07, gain: 0.04, cutoff: 500 },
  },
  // 登顶：大三和弦铺开，音高跟着阶数走（见 soundsFor 的 shift）。
  cleared: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.4, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.4, gain: 0.08, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.45, gain: 0.08, delay: 0.12 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.55, gain: 0.07, delay: 0.2 },
    ],
  },
  // 新塔：一记低钟，把「换了一座」这件事划开。
  tower: {
    tones: [{ wave: 'sine', freq: NOTE.C3, to: NOTE.C3, dur: 0.5, gain: 0.07 }],
  },
  select: { tones: [{ wave: 'square', freq: 660, to: 660, dur: 0.03, gain: 0.035 }] },
  deselect: { tones: [{ wave: 'square', freq: 440, to: 440, dur: 0.03, gain: 0.03 }] },
  // 切视角：一记扫过去的噪声，像把魔方转了一面。
  view: { noise: { dur: 0.12, gain: 0.04, cutoff: 2600, type: 'highpass' } },
  undo: { tones: [{ wave: 'triangle', freq: 300, to: 460, dur: 0.1, gain: 0.05 }] },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 一帧最多出这么多声。推移的同时通了路又走了一段是常事，全放会糊。
export const MAX_PER_BATCH = 3;

// 登顶那一声跟着阶数升：三阶原调，每高一阶升两个半音，六阶最亮。
export const orderShift = (order = 3) => (Math.max(3, Math.min(6, order)) - 3) * 2;

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条音色随阶数升高，省下一堆重复的音色条目。
 *
 * 登顶那一声独占这一批：这一座到此为止，别让推移声和脚步盖在上面。
 */
export function soundsFor(effects = []) {
  const find = (type) => effects.find((effect) => effect.type === type);
  const cleared = find('cleared');
  if (cleared) return [{ name: 'cleared', shift: orderShift(cleared.order) }];

  const picked = [];
  const push = (name, shift = 0) => {
    if (!picked.some((entry) => entry.name === name)) picked.push({ name, shift });
  };

  if (find('tower')) push('tower');
  // 通了路最该被听见，排在推移声前面。
  if (find('open')) push('open');
  const moved = find('shift');
  // 推柱和推行列必须一听就分得开：柱是那条多出来的轴。
  if (moved) push(moved.axis === AXIS_PILLAR ? 'lift' : 'slide');
  if (find('blocked')) push('blocked');
  if (find('walk')) push('step');
  if (find('undo')) push('undo');
  if (find('view')) push('view');
  if (find('select')) push('select');
  if (find('deselect')) push('deselect');

  return picked.slice(0, MAX_PER_BATCH);
}

/** 触觉反馈只给四个关口：通了、走不过去、登顶、换新塔。推移全程都震手会麻。 */
export const VIBRATION = {
  open: [18, 30, 18],
  blocked: [26],
  cleared: [30, 50, 30, 50, 60],
  tower: [16, 40, 16],
};

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

export function vibrationFor(effects = []) {
  const has = (type) => effects.some((effect) => effect.type === type);
  if (has('cleared')) return VIBRATION.cleared;
  if (has('tower')) return VIBRATION.tower;
  if (has('open')) return VIBRATION.open;
  if (has('blocked')) return VIBRATION.blocked;
  return null;
}

// 最小间隔，秒。连着按十字键或者连滑几下时这几条会密集触发。
// 限流跨帧才成立，所以放在引擎里而不是 soundsFor 里 —— soundsFor 只管一批之内。
export const THROTTLE = { slide: 0.07, lift: 0.09, step: 0.05, select: 0.04, view: 0.1 };

// 半音换算：升 n 个半音就是乘 2^(n/12)。
const transpose = (freq, shift) => (shift ? freq * 2 ** (shift / 12) : freq);

/**
 * 出声的那一半。AudioContext 必须等用户手势才能起，所以这里全程懒建：
 * 静音状态下一个节点都不建，玩家从头到尾静音玩就不会有音频线程。
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
      master.gain.value = 0.9;
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

    /** 一批 effects 直接喂进来。同一帧的几声堆在同一时刻是对的，靠 soundsFor 去重控量。 */
    notify(effects) {
      let played = 0;
      for (const pick of soundsFor(effects)) {
        if (this.play(pick.name, { shift: pick.shift })) played += 1;
      }
      return played;
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


