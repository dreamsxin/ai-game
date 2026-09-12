// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 纸牌游戏的手感几乎全在「落牌那一声」上：牌落下、背面牌翻开、凑齐一门被收走，
// 这三件事必须一听就分得清，否则满屏的牌只是在无声地挪位置。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。
const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

export const SOUNDS = {
  // 拿起一段：极轻的一记，一局要响几百次。
  select: {
    tones: [{ wave: 'triangle', freq: 700, to: 880, dur: 0.03, gain: 0.05 }],
  },
  // 落牌：纸牌拍在桌上那一记闷响，这是全局最要紧的一声。
  place: {
    noise: { dur: 0.055, gain: 0.075, cutoff: 1500 },
    tones: [{ wave: 'sine', freq: 210, to: 130, dur: 0.06, gain: 0.06 }],
  },
  // 翻开背面牌：比落牌亮，因为它是「有进展」的唯一信号。
  flip: {
    tones: [{ wave: 'square', freq: NOTE.E5, to: NOTE.G5, dur: 0.05, gain: 0.07 }],
    noise: { dur: 0.03, gain: 0.035, cutoff: 5200, type: 'highpass' },
  },
  // 收走一整门：上行三音，音高跟着「一次收了几门」往上走（见 collectShift）。
  collect: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.09, gain: 0.1, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.24, gain: 0.11, delay: 0.16 },
    ],
  },
  // 发一轮：一片牌同时落下，用一段长噪声表达「十张一起来」。
  deal: {
    noise: { dur: 0.22, gain: 0.07, cutoff: 2000 },
    tones: [{ wave: 'sawtooth', freq: 260, to: 170, dur: 0.2, gain: 0.05 }],
  },
  // 放不下：短促的低音，说「不行」而不是「你错了」。
  invalid: {
    tones: [{ wave: 'square', freq: 190, to: 130, dur: 0.11, gain: 0.075 }],
  },
  // 撤销：反向的一记滑音。
  undo: {
    tones: [{ wave: 'triangle', freq: 520, to: 340, dur: 0.08, gain: 0.06 }],
  },
  // 八门收齐。
  win: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.14, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.14, gain: 0.11, delay: 0.13 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.16, gain: 0.11, delay: 0.26 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.4, gain: 0.12, delay: 0.39 },
    ],
  },
  // 死局：下行两音，压到低音区。这不是「输」，只是「这条路走死了」。
  stuck: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E4, to: NOTE.E4, dur: 0.16, gain: 0.09 },
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.C3, dur: 0.42, gain: 0.1, delay: 0.15 },
    ],
    noise: { dur: 0.3, gain: 0.05, cutoff: 460 },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 一次连收几门就往上走几个半音，第五门封顶。
export const COLLECT_SHIFTS = [0, 3, 5, 7, 12];
// 一帧最多出这么多声。收一门可能连带翻牌又连收下一门，全放会糊。
export const MAX_PER_BATCH = 3;
/** 落牌和翻牌在连收时会密集触发，挂个最小间隔。跨帧才成立，所以放在引擎里。 */
export const THROTTLE = { place: 0.04, flip: 0.045, select: 0.03 };

export const collectShift = (count = 1) =>
  COLLECT_SHIFTS[Math.min(COLLECT_SHIFTS.length - 1, Math.max(0, count - 1))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * 排序就是「哪件事更该先知道」：赢 > 死局 > 收门 > 翻牌 > 发牌 > 落牌 > 撤销 > 放不下 > 选中。
 */
export function soundsFor(effects = []) {
  const has = (type) => effects.some((effect) => effect.type === type);
  // 这两声各自独占一批：牌局已经结束了，别让落牌声盖在上面。
  if (has('won')) return [{ name: 'win', shift: 0 }];
  if (has('stuck')) return [{ name: 'stuck', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  const collected = effects.filter((effect) => effect.type === 'collect').length;
  if (collected > 0) push('collect', collectShift(collected));
  if (has('flip')) push('flip');
  if (has('deal')) push('deal');
  if (has('move')) push('place');
  if (has('undo')) push('undo');
  if (has('invalid')) push('invalid');
  if (has('select')) push('select');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只给「放不下」「收走一门」「赢」「死局」四个关口。落牌全程都震会麻。 */
export const VIBRATION = {
  invalid: [22],
  collect: [14, 20, 14],
  win: [30, 40, 30, 40, 60],
  stuck: [60, 40, 60],
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
  if (has('won')) return VIBRATION.win;
  if (has('stuck')) return VIBRATION.stuck;
  if (has('collect')) return VIBRATION.collect;
  if (has('invalid')) return VIBRATION.invalid;
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
      if (gap && at - (lastAt.get(name) ?? -Infinity) < gap) return false;
      lastAt.set(name, at);
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0), shift);
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      return true;
    },

    /** 一批 effects 直接喂进来，返回真正出声的条数（限流掉的不算）。 */
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
      lastAt.clear();
    },
  };
}


