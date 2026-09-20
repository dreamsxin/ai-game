// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 横版跑射最该被听见的不是「我开了一枪」——枪是一直在响的——
// 而是**这一枪有没有换来弹药**：打中人回一发（hit，音高跟着连击往上爬），
// 打在装甲上一发不回（armor，一声闷响往下掉）。这两种处境是相反的，
// 所以它们的声音必须是相反的；同理，打空仓（dry）和装填完成（reload）也是一上一下。
//
// 分工和表现层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

export const SOUNDS = {
  // 开火：一局要响上千次，压到刚好听见就够。音色靠 shift 区分枪械（见 FIRE_SHIFT）。
  fire: {
    tones: [{ wave: 'square', freq: 320, to: 180, dur: 0.05, gain: 0.05 }],
    noise: { dur: 0.03, gain: 0.03, cutoff: 2600 },
  },
  // 命中回弹：短促上滑，基频跟着连击数往上移。这是这游戏的「收钱」声。
  hit: {
    tones: [{ wave: 'square', freq: 430, to: 700, dur: 0.07, gain: 0.09 }],
  },
  // 打中核心舱：比普通命中更亮更长，回的弹药也是两倍。
  weak: {
    tones: [
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.G5, dur: 0.09, gain: 0.11 },
      { wave: 'square', freq: NOTE.C6, to: NOTE.C6, dur: 0.07, gain: 0.06, delay: 0.05 },
    ],
  },
  // 打在装甲上：下坠的闷响加一层厚噪。听见这个就该知道「这一发白打了」。
  armor: {
    tones: [{ wave: 'sawtooth', freq: 260, to: 120, dur: 0.14, gain: 0.09 }],
    noise: { dur: 0.1, gain: 0.07, cutoff: 700 },
  },
  kill: {
    tones: [{ wave: 'square', freq: 220, to: 90, dur: 0.16, gain: 0.1 }],
    noise: { dur: 0.13, gain: 0.09, cutoff: 1500 },
  },
  // 空仓：干巴巴两声咔哒，没有音高，和任何「有收获」的声音都不像。
  dry: {
    tones: [{ wave: 'square', freq: 150, to: 130, dur: 0.04, gain: 0.07 }],
    noise: { dur: 0.06, gain: 0.05, cutoff: 3200 },
  },
  // 装填完成：上行两音，告诉你「可以接着打了」。
  reload: {
    tones: [
      { wave: 'triangle', freq: NOTE.G3, to: NOTE.G3, dur: 0.06, gain: 0.08 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.1, gain: 0.09, delay: 0.06 },
    ],
  },
  // 换枪：一串往上的琶音，「我变强了」要听得出来。
  pickup: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.07, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.07, gain: 0.1, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.07, gain: 0.1, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.18, gain: 0.11, delay: 0.18 },
    ],
  },
  jump: {
    tones: [{ wave: 'square', freq: 240, to: 480, dur: 0.07, gain: 0.05 }],
  },
  // 阵亡：先弹上去再摔下来，和画面里那一跳对上。
  die: {
    tones: [
      { wave: 'square', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'square', freq: NOTE.G4, to: NOTE.G4, dur: 0.1, gain: 0.12, delay: 0.1 },
      { wave: 'square', freq: 300, to: 80, dur: 0.5, gain: 0.12, delay: 0.22 },
    ],
  },
  // Boss 倒下 = 过关：短一点的号角，后面还有下一关，别抢结算的戏。
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.12, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.12, gain: 0.12, delay: 0.1 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.3, gain: 0.13, delay: 0.2 },
    ],
    noise: { dur: 0.3, gain: 0.08, cutoff: 900 },
  },
  over: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.G3, dur: 0.2, gain: 0.11 },
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
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 四把枪四个音区：听见枪声就知道手里是什么，不用看 HUD。
export const FIRE_SHIFT = { rifle: 0, spread: -5, machine: 4, laser: 8 };
// 连击音阶：每多一次不落空的命中就升一阶，第八次封顶。
export const CHAIN_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一批 effects 最多出这么多声。一帧里又开枪又命中又爆一个是常事，全放会糊。
export const MAX_PER_BATCH = 3;

export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

export const chainShift = (chain = 1) =>
  CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

export const fireShift = (weapon) => FIRE_SHIFT[weapon] ?? 0;

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 *
 * 优先级就是信息量：阵亡和过关是这一拍的主角；
 * 接下来是「弹药账本」上的四件事（换枪、核心舱、装甲、命中）——
 * 它们改变的是接下来还能不能打；开火和起跳垫在最后，能被盖掉也不心疼。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  if (find('die')) return [{ name: 'die', shift: 0 }];
  if (find('clear')) return [{ name: 'clear', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  if (find('pickup')) push('pickup');
  const weak = find('weak');
  if (weak) push('weak', chainShift(weak.chain));
  // 装甲和命中是相反的两件事，谁都不许盖掉谁：打空了必须听得见。
  if (find('armor')) push('armor');
  if (find('kill')) push('kill');
  const hit = find('hit');
  if (hit) push('hit', chainShift(hit.chain));
  if (find('dry')) push('dry');
  if (find('reload')) push('reload');
  const fire = find('fire');
  if (fire) push('fire', fireShift(fire.weapon));
  if (find('jump')) push('jump');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在阵亡、过关、换枪、空仓这几个关口给。每发子弹都震会变成噪音。 */
export const VIBRATION = {
  die: [60, 40, 60],
  clear: [12, 30, 12],
  pickup: [10, 24, 10],
  dry: [18],
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
  if (find('pickup')) return VIBRATION.pickup;
  if (find('dry')) return VIBRATION.dry;
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



