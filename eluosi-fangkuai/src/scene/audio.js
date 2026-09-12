// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 俄罗斯方块的音效有一套约定俗成的分工，缺一个都别扭：
// 横移和旋转是高频轻音（一局要响上千次），锁定是闷响，消行按行数抬音高，
// 四行单独给一段和弦。此前这些全是静默的，1 行和 4 行在耳朵里一模一样。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, E3: 164.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做落地、碎裂这类质感。
 */
export const SOUNDS = {
  // 横移：极轻的一点。长按会连着走，所以这一声必须压到几乎只剩轮廓。
  move: {
    noise: { dur: 0.018, gain: 0.028, cutoff: 5200, type: 'highpass' },
  },
  // 旋转：短促的高音点击。
  rotate: {
    tones: [{ wave: 'triangle', freq: 620, to: 760, dur: 0.05, gain: 0.06 }],
  },
  // 踢墙转：比原地转低一点、带一点噪，「贴着墙拧进去」和「原地拧」手感不同。
  kick: {
    tones: [{ wave: 'triangle', freq: 460, to: 380, dur: 0.06, gain: 0.07 }],
    noise: { dur: 0.03, gain: 0.035, cutoff: 3200, type: 'highpass' },
  },
  // 硬降：一道往下砸的滑音，落点的重量感全靠它。
  hardDrop: {
    tones: [{ wave: 'square', freq: 420, to: 90, dur: 0.11, gain: 0.11 }],
    noise: { dur: 0.07, gain: 0.06, cutoff: 1100 },
  },
  // 锁定：闷的一记。它每块都响，所以要比消行轻一档。
  lock: {
    tones: [{ wave: 'sine', freq: 165, to: 110, dur: 0.09, gain: 0.1 }],
    noise: { dur: 0.05, gain: 0.045, cutoff: 800 },
  },
  // 换手：一记上扬的短音，和锁定的下行分得开。
  hold: {
    tones: [{ wave: 'triangle', freq: 380, to: 520, dur: 0.07, gain: 0.08 }],
  },
  // 消行：基频跟着行数往上移（见 soundsFor 里的 shift），1 行到 3 行共用这一条。
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.16, gain: 0.09, delay: 0.04 },
    ],
    noise: { dur: 0.12, gain: 0.05, cutoff: 2600, type: 'highpass' },
  },
  // 四行：这游戏最值钱的一下，给一整段上行琶音，不跟消行共用音色。
  tetris: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.1, gain: 0.12, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.12, gain: 0.13, delay: 0.14 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.34, gain: 0.13, delay: 0.21 },
    ],
  },
  // T-spin：一记「拧进去了」的上滑，独立于行数，因为它本身就是技巧的凭证。
  tspin: {
    tones: [{ wave: 'sawtooth', freq: 380, to: 1100, dur: 0.22, gain: 0.1 }],
  },
  // 连击：连着消行时叠在上面，越连越高（见 soundsFor）。
  combo: {
    tones: [{ wave: 'square', freq: NOTE.G5, to: NOTE.G5, dur: 0.07, gain: 0.07 }],
  },
  // 升级：速度要变快了，得先打个招呼。
  level: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.1, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.2, gain: 0.11, delay: 0.16 },
    ],
  },
  // 封顶：长长的下坠，一局到此为止。
  topout: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.E3, dur: 0.22, gain: 0.11 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.62, gain: 0.12, delay: 0.18 },
    ],
    noise: { dur: 0.5, gain: 0.05, cutoff: 900 },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 消行音阶：1 行到 3 行往上爬，4 行不走这条（它有自己的和弦）。
export const CLEAR_SHIFTS = [0, 4, 7];
// 连击音阶：越连越高，第八连封顶——再往上就刺耳了。
export const COMBO_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一帧最多出这么多声。硬降落地能同时锁定、四行、T-spin、连击、升级，全放会糊。
export const MAX_PER_BATCH = 4;

export const clearShift = (count = 1) =>
  CLEAR_SHIFTS[Math.min(CLEAR_SHIFTS.length - 1, Math.max(0, count - 1))];

export const comboShift = (combo = 1) =>
  COMBO_SHIFTS[Math.min(COMBO_SHIFTS.length - 1, Math.max(0, combo - 2))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条音色随行数／连击数升高，省下一堆重复的音色条目。
 *
 * 同名只留一条（取最高的那个 shift）：一帧里横移两格该是一声，不是两声。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 封顶那一声独占这一批，不让锁定的闷响盖在上面。
  if (find('topout')) return [{ name: 'topout', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  const clear = find('clear');
  if (clear) {
    // 四行有自己的和弦，1~3 行共用一条音色靠移调区分。
    if (clear.count >= 4) push('tetris');
    else push('clear', clearShift(clear.count));
    if (clear.tspin) push('tspin');
    // 连击从第 2 连才算「连」，第 1 连就是普通消行。
    if (clear.combo > 1) push('combo', comboShift(clear.combo));
  }
  if (find('level')) push('level');
  if (find('hardDrop')) push('hardDrop');
  // 有消行时锁定声让位：消行本身已经交代了「落地了」。
  if (find('lock') && !clear) push('lock');
  if (find('hold')) push('hold');
  const rotated = find('rotate');
  if (rotated) push(rotated.kicked ? 'kick' : 'rotate');
  if (find('move')) push('move');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在四行、T-spin、封顶几个关口给。每块落地都震会麻。 */
export const VIBRATION = {
  tetris: [12, 30, 12],
  tspin: [16],
  topout: [70, 40, 70],
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
  if (find('topout')) return VIBRATION.topout;
  const clear = find('clear');
  if (clear?.count >= 4) return VIBRATION.tetris;
  if (clear?.tspin) return VIBRATION.tspin;
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



