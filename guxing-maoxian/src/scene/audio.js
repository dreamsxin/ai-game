// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 横版跳跃的手感一半在腿上一半在耳朵里：跳、踩、吃金币这三声是这个类型的招牌，
// 而「连续踩不落地分数翻倍」这条规则此前完全听不出来——所以踩敌的音高跟着连踩数往上爬。
//
// 分工和表现层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, E3: 164.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做落地、撞击这类质感。
 */
export const SOUNDS = {
  // 起跳：短促上滑。一局要响几百次，压到刚好听见就够。
  jump: {
    tones: [{ wave: 'square', freq: 260, to: 560, dur: 0.09, gain: 0.08 }],
  },
  // 踩中：基频跟着连踩数往上移（见 soundsFor 里的 shift），这是这游戏最该被听见的一声。
  stomp: {
    tones: [{ wave: 'square', freq: 380, to: 620, dur: 0.09, gain: 0.11 }],
    noise: { dur: 0.05, gain: 0.06, cutoff: 1800 },
  },
  // 撞飞龟壳：低频加宽噪，比踩中更「实」。
  kick: {
    tones: [{ wave: 'square', freq: 240, to: 150, dur: 0.11, gain: 0.1 }],
    noise: { dur: 0.08, gain: 0.07, cutoff: 2200 },
  },
  // 金币：两个音一前一后，是这个类型的招牌声。
  coin: {
    tones: [
      { wave: 'square', freq: NOTE.E5, to: NOTE.E5, dur: 0.05, gain: 0.09 },
      { wave: 'square', freq: NOTE.C6, to: NOTE.C6, dur: 0.14, gain: 0.09, delay: 0.05 },
    ],
  },
  // 吃蘑菇变大：一路往上爬的琶音，「我变强了」要听得出来。
  grow: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.07, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.07, gain: 0.1, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.07, gain: 0.1, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.18, gain: 0.11, delay: 0.18 },
    ],
  },
  // 星星无敌：更亮更长，和变大分得开。
  star: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.07, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.07, gain: 0.11, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.07, gain: 0.11, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.09, gain: 0.12, delay: 0.18 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.26, gain: 0.12, delay: 0.26 },
    ],
  },
  // 挨打变小：下行滑音。这是「差一点就死了」，不能听成死亡。
  shrink: {
    tones: [{ wave: 'square', freq: 620, to: 220, dur: 0.24, gain: 0.11 }],
  },
  // 死亡：先弹上去再摔下来，和画面里那一跳对上。
  die: {
    tones: [
      { wave: 'square', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'square', freq: NOTE.G4, to: NOTE.G4, dur: 0.1, gain: 0.12, delay: 0.1 },
      { wave: 'square', freq: 300, to: 90, dur: 0.5, gain: 0.12, delay: 0.22 },
    ],
  },
  // 过关：短一点的旗杆号，后面还有下一关，别抢结算的戏。
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.12, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.12, gain: 0.12, delay: 0.1 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.3, gain: 0.13, delay: 0.2 },
    ],
  },
  over: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.E3, dur: 0.2, gain: 0.11 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.55, gain: 0.12, delay: 0.18 },
    ],
  },
  win1: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.16, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.32, gain: 0.13, delay: 0.14 },
    ],
  },
  win2: {
    tones: [
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.15, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.15, gain: 0.12, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.36, gain: 0.13, delay: 0.24 },
    ],
  },
  win3: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.15, gain: 0.13 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.15, gain: 0.13, delay: 0.11 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.18, gain: 0.13, delay: 0.22 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.48, gain: 0.14, delay: 0.33 },
      { wave: 'sine', freq: NOTE.G5, to: NOTE.C6, dur: 0.48, gain: 0.07, delay: 0.33 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 连踩音阶：每多踩一只升一阶，第八只封顶。规则上分数是翻倍的，
// 所以音高必须跟着涨，否则「连续踩不落地」这条只存在于代码里。
export const CHAIN_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一批 effects 最多出这么多声。一帧里同时吃金币又踩到人是常事，全放会糊。
export const MAX_PER_BATCH = 3;

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

export const chainShift = (chain = 1) =>
  CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条踩击音色随连踩数升高，省下一堆重复的音色条目。
 *
 * 同名只留一条（取最高的那个 shift）：一帧里踩到两只该是一声，不是两声。
 * 注意 over / won 没有 effects——它们是状态跳转，由 App 在状态变化时补声。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 死亡和过关是这一拍的主角，别让脚步和金币盖在上面。
  if (find('die')) return [{ name: 'die', shift: 0 }];
  if (find('clear')) return [{ name: 'clear', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  // 变强的两声优先级最高：它们改变的是接下来怎么玩。
  if (find('star')) push('star');
  if (find('grow')) push('grow');
  if (find('shrink')) push('shrink');
  const stomp = find('stomp');
  if (stomp) push('stomp', chainShift(stomp.chain));
  if (find('kick')) push('kick');
  if (find('coin')) push('coin');
  if (find('jump')) push('jump');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在挨打、死亡、过关这几个关口给。每次跳跃都震会变成噪音。 */
export const VIBRATION = {
  shrink: [22],
  die: [60, 40, 60],
  clear: [12, 30, 12],
  win: [22, 50, 22, 50, 40],
  over: [70, 40, 70],
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

/** 一批 effects 该震哪一种。同时命中就取信息量最大的那条。 */
export function vibrationFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  if (find('die')) return VIBRATION.die;
  if (find('clear')) return VIBRATION.clear;
  if (find('shrink')) return VIBRATION.shrink;
  return null;
}

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
      const length = Math.floor(ctx.sampleRate * 0.4);
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
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0), shift);
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      return true;
    },

    /** 一批 effects 直接喂进来。同一帧里的几声堆在同一时刻是对的，靠 soundsFor 去重控量。 */
    notify(effects) {
      const picks = soundsFor(effects);
      for (const pick of picks) this.play(pick.name, { shift: pick.shift });
      return picks.length;
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



