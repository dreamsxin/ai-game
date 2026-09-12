// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 无尽跑酷靠「越跑越快」维持张力，可此前一路上一声都没有：吃到金币、撞上障碍、
// 拿到护盾在感官上完全一样。连消金币有 streak 加成，那更得听出来在涨。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, E3: 164.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做风声、擦地、撞击这类质感。
 */
export const SOUNDS = {
  // 变道：一记极轻的横向擦声。一局要响几百次，压到只剩轮廓。
  lane: {
    noise: { dur: 0.04, gain: 0.035, cutoff: 3600, type: 'highpass' },
  },
  // 起跳：短促上滑。
  jump: {
    tones: [{ wave: 'square', freq: 300, to: 620, dur: 0.09, gain: 0.08 }],
  },
  // 落地：闷的一记，跑酷的节奏感一半靠它。
  land: {
    tones: [{ wave: 'sine', freq: 150, to: 92, dur: 0.08, gain: 0.09 }],
    noise: { dur: 0.05, gain: 0.05, cutoff: 700 },
  },
  // 滑铲：贴地擦过去的一段噪声，比变道长得多。
  slide: {
    noise: { dur: 0.2, gain: 0.06, cutoff: 1800 },
    tones: [{ wave: 'sawtooth', freq: 220, to: 130, dur: 0.18, gain: 0.06 }],
  },
  // 金币：基频跟着连吃数往上移（见 soundsFor 的 shift），越串越高。
  coin: {
    tones: [
      { wave: 'square', freq: NOTE.E5, to: NOTE.E5, dur: 0.04, gain: 0.075 },
      { wave: 'square', freq: NOTE.C6, to: NOTE.C6, dur: 0.11, gain: 0.075, delay: 0.04 },
    ],
  },
  // 吃到道具：上行三音，「接下来会好过一点」。
  powerup: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.08, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.08, gain: 0.1, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.2, gain: 0.11, delay: 0.14 },
    ],
  },
  // 护盾挡下一次撞击：金属挡格的一声，和撞毁必须一听就分得开——
  // 这是「刚才那下没死」，是这游戏最需要立刻确认的一件事。
  shield: {
    tones: [{ wave: 'triangle', freq: 900, to: 520, dur: 0.16, gain: 0.11 }],
    noise: { dur: 0.1, gain: 0.06, cutoff: 4200, type: 'highpass' },
  },
  // 撞毁：低频炸开再下坠。
  crash: {
    tones: [
      { wave: 'square', freq: 320, to: 70, dur: 0.34, gain: 0.14 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.5, gain: 0.1, delay: 0.16 },
    ],
    noise: { dur: 0.3, gain: 0.1, cutoff: 1400 },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 连吃金币的音阶：越串越高，第八颗封顶——再往上就刺耳了。
export const STREAK_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一帧最多出这么多声。落地的同时吃到金币又撞上障碍是常事，全放会糊。
export const MAX_PER_BATCH = 3;

export const streakShift = (streak = 1) =>
  STREAK_SHIFTS[Math.min(STREAK_SHIFTS.length - 1, Math.max(0, streak - 1))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让金币这一条音色随连吃数升高，省下一堆重复的音色条目。
 *
 * 同名只留一条（取最高的那个 shift）：一帧里吃到两枚金币该是一声，不是两声。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 撞毁那一声独占这一批：这一局到此为止，别让脚步和金币盖在上面。
  if (find('crash')) return [{ name: 'crash', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  // 护盾挡下撞击是这游戏最需要立刻确认的一件事，排在最前。
  if (find('shield')) push('shield');
  if (find('powerup')) push('powerup');
  // 磁吸会把一排金币同一帧全吸过来，effects 是按生成顺序排的，
  // 所以要取串得最长的那一枚——那才代表现在的势头，而不是这批里的第一枚。
  const streak = effects.reduce(
    (deepest, effect) => (effect.type === 'coin' ? Math.max(deepest, Number(effect.streak) || 0) : deepest),
    -1,
  );
  if (streak >= 0) push('coin', streakShift(streak));
  if (find('jump')) push('jump');
  if (find('slide')) push('slide');
  if (find('land')) push('land');
  if (find('lane')) push('lane');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在护盾挡下和撞毁两个关口给。跑酷全程都震会麻。 */
export const VIBRATION = {
  shield: [14, 26, 14],
  crash: [70, 40, 70],
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
  const has = (name) => effects.some((effect) => effect.type === name);
  if (has('crash')) return VIBRATION.crash;
  if (has('shield')) return VIBRATION.shield;
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


