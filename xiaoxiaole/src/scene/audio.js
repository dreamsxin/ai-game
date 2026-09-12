// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 三消的手感全靠「连锁在往上爬」这件事被听见：第一组消除和第五组连锁得分差好几倍，
// 可此前两者的反馈一模一样。所以消除声的音高跟着连锁深度走，爬一格就升一阶音。
//
// 分工和表现层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做「散落」和「爆开」的质感。
 */
export const SOUNDS = {
  // 换位：极短的一记，一局要响上百次，宁可轻到几乎听不见也不能吵。
  swap: {
    tones: [{ wave: 'sine', freq: 420, to: 520, dur: 0.05, gain: 0.06 }],
  },
  // 换不动：闷的下滑，和换成功的上滑正好相反。
  reject: {
    tones: [{ wave: 'square', freq: 180, to: 110, dur: 0.1, gain: 0.09 }],
  },
  // 消除：基频跟着连锁深度往上移（见 soundsFor 里的 shift），这是三消最重要的一声。
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.15, gain: 0.08, delay: 0.03 },
    ],
  },
  // 直线爆果：一道扫过去的啸音，横竖用同一条，方向由画面交代。
  line: {
    tones: [{ wave: 'sawtooth', freq: 300, to: 1500, dur: 0.2, gain: 0.1 }],
    noise: { dur: 0.16, gain: 0.05, cutoff: 2400, type: 'highpass' },
  },
  // 爆破果：低频砸下去加一层宽噪，听着比直线更「重」。
  bomb: {
    tones: [{ wave: 'sine', freq: 200, to: 55, dur: 0.28, gain: 0.15 }],
    noise: { dur: 0.2, gain: 0.1, cutoff: 900 },
  },
  // 彩虹果：整盘同色一起走，给一段上行琶音，是这游戏里最值钱的一下。
  rainbow: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.11, delay: 0.02 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.1, gain: 0.11, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.12, gain: 0.11, delay: 0.14 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.3, gain: 0.12, delay: 0.2 },
    ],
  },
  // 下落：一层短噪当「散落」，果实越多也只出这一声，不然会连成沙沙声。
  fall: {
    noise: { dur: 0.08, gain: 0.045, cutoff: 1600 },
  },
  // 无步可走：低沉的警示，紧接着就是重排。
  shuffle: {
    tones: [{ wave: 'sawtooth', freq: 240, to: 110, dur: 0.24, gain: 0.1 }],
  },
  // 重排完成：一记上扬，告诉玩家盘面可以继续了。
  shuffled: {
    tones: [{ wave: 'triangle', freq: 330, to: 620, dur: 0.18, gain: 0.1 }],
  },
  over: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.G3, dur: 0.22, gain: 0.11 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.5, gain: 0.12, delay: 0.18 },
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

// 连锁音阶：一路爬大调音阶，第八格封顶。连锁能到 7、8 层，所以梯子要够长，
// 但再往上就会刺耳，所以顶格之后不再升。
export const CHAIN_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一批 effects 最多出这么多声。一次连锁能同时引爆好几种特殊果实，全放会糊成噪音。
export const MAX_PER_BATCH = 4;
// 直线爆果横竖同一条音色：方向由画面交代，耳朵分不出也不需要分。
export const SPECIAL_SOUNDS = { row: 'line', col: 'line', bomb: 'bomb', rainbow: 'rainbow' };

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

export const chainShift = (chain = 1) =>
  CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条消除音色随连锁深度升高，省下一堆重复的音色条目。
 *
 * 同名只留一条（取最高的那个 shift）：一次连锁里炸了三颗爆破果该是一声，不是三声。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 结算音要独占这一批，不然下落的沙沙声会盖在和弦上。
  const won = find('won');
  if (won) return [{ name: winSound(won.stars), shift: 0 }];
  if (find('over')) return [{ name: 'over', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  if (find('reject')) push('reject');
  if (find('swap')) push('swap');
  const clear = find('clear');
  if (clear) {
    push('clear', chainShift(clear.chain));
    // 特殊果实的声音叠在消除声上：它是「额外发生了什么」，不是替代。
    for (const special of new Set(clear.specials ?? [])) {
      const name = SPECIAL_SOUNDS[special];
      if (name) push(name);
    }
  }
  // 只有真的有果实落下来才出声，补满不动的盘面不该沙沙响。
  const fall = find('fall');
  if (fall && (fall.drops?.length || fall.spawned?.length)) push('fall');
  if (find('shuffle')) push('shuffle');
  if (find('shuffled')) push('shuffled');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在换不动、彩虹果、结算三个关口给。每次消除都震会变成噪音。 */
export const VIBRATION = {
  reject: [18],
  rainbow: [12, 30, 12],
  win: [22, 50, 22, 50, 40],
  over: [60, 40, 60],
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

/**
 * 一批 effects 该震哪一种。同时命中就取信息量最大的那条。
 * 这一关的结算面板是随状态立刻弹的，所以通关那一串就在这里出，不用另外排。
 */
export function vibrationFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  if (find('won')) return VIBRATION.win;
  if (find('over')) return VIBRATION.over;
  if (find('reject')) return VIBRATION.reject;
  const clear = find('clear');
  if (clear && (clear.specials ?? []).includes('rainbow')) return VIBRATION.rainbow;
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

    /** 一批 effects 直接喂进来。同一步里的几声堆在同一时刻是对的，靠 soundsFor 去重控量。 */
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



