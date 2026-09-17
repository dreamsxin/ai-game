// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这游戏有两对声音必须让人一听就分得开，因为它们对应的处境正好相反：
//
// 1. bubbleFoe 与 bubbleSelf——「我把人困住了」和「我被困住了」。
//    这两件事在画面上长得几乎一样（都是一颗水泡），但一个是你该冲上去补刀，
//    一个是你该开始猛点按钮挣脱。声音是这里唯一能立刻分开它们的通道：
//    一个往上滑，一个往下沉。
// 2. popFoe 与 popSelf——「补掉了一个人」和「自己被补掉了」。清场和丢命不该是同一声。
//
// blast 的音高跟着**连锁数**爬：连锁越大越亮，因为连锁是这游戏里唯一会失控的东西。
//
// 分工和别的表现层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = {
  C3: 130.81, E3: 164.81, G3: 196, A3: 220,
  C4: 261.63, E4: 329.63, G4: 392, A4: 440,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  C6: 1046.5, E6: 1318.5,
};

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做水花、木裂这类质感。
 */
export const SOUNDS = {
  // 放下一发：短促的一记「咚」，一局要响上百次，压到刚好听见。
  place: {
    tones: [{ wave: 'sine', freq: 300, to: 190, dur: 0.07, gain: 0.06 }],
  },
  // 爆开：一层低频闷响加一层水噪。音高由连锁数决定（见 soundsFor）。
  blast: {
    tones: [{ wave: 'triangle', freq: 210, to: 90, dur: 0.2, gain: 0.1 }],
    noise: { dur: 0.22, gain: 0.075, cutoff: 1500 },
  },
  // 拆箱：干、脆、短。它和爆开叠在同一帧，所以音色要能穿过去。
  crate: {
    tones: [{ wave: 'square', freq: 520, to: 300, dur: 0.06, gain: 0.05 }],
    noise: { dur: 0.05, gain: 0.04, cutoff: 3600, type: 'highpass' },
  },
  // 捡到道具：上行两音。这游戏里唯一「纯赚」的一刻。
  item: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.06, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.D5, to: NOTE.D5, dur: 0.12, gain: 0.1, delay: 0.06 },
    ],
  },
  // 困住对手：往上滑的泡音，亮。听到它就该往那边冲——水泡只撑 4.2 秒。
  bubbleFoe: {
    tones: [{ wave: 'sine', freq: 420, to: 900, dur: 0.16, gain: 0.09 }],
    noise: { dur: 0.08, gain: 0.03, cutoff: 4200, type: 'highpass' },
  },
  // 自己被困住：往下沉的闷音，加一层水下的噪。和上面那一声方向完全相反。
  bubbleSelf: {
    tones: [
      { wave: 'sawtooth', freq: 400, to: 120, dur: 0.3, gain: 0.11 },
      { wave: 'sine', freq: 180, to: 90, dur: 0.34, gain: 0.08, delay: 0.04 },
    ],
    noise: { dur: 0.3, gain: 0.06, cutoff: 600 },
  },
  // 自己挣脱出来：破水面的那一下，清亮。
  escapeSelf: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.G4, dur: 0.1, gain: 0.1 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.E5, dur: 0.18, gain: 0.09, delay: 0.08 },
    ],
    noise: { dur: 0.1, gain: 0.04, cutoff: 5000, type: 'highpass' },
  },
  // 对手挣脱了：一记短促的「跑了」。不刺耳，但要让人知道刚才那个补刀窗口关了。
  escapeFoe: {
    tones: [{ wave: 'sine', freq: 700, to: 520, dur: 0.08, gain: 0.05 }],
  },
  // 补掉一个对手：水泡炸开的脆响加一记上扬。这是这游戏最值钱的一声。
  popFoe: {
    tones: [
      { wave: 'square', freq: 640, to: 980, dur: 0.1, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.C6, dur: 0.2, gain: 0.09, delay: 0.07 },
    ],
    noise: { dur: 0.14, gain: 0.06, cutoff: 3000, type: 'highpass' },
  },
  // 自己被补掉：一路沉到底。丢命不该听起来像得分。
  popSelf: {
    tones: [
      { wave: 'sawtooth', freq: 300, to: 70, dur: 0.4, gain: 0.12 },
      { wave: 'square', freq: 150, to: 100, dur: 0.16, gain: 0.08, delay: 0.06 },
    ],
    noise: { dur: 0.34, gain: 0.08, cutoff: 900 },
  },
  // 踢弹：一声滑出去的气流。它意味着「这发弹现在不在你脚下了」。
  kick: {
    tones: [{ wave: 'sawtooth', freq: 260, to: 620, dur: 0.14, gain: 0.06 }],
    noise: { dur: 0.14, gain: 0.04, cutoff: 2600, type: 'highpass' },
  },
  // 放不出来：几乎听不见的空响，告诉你这下按了没用。
  deny: {
    tones: [{ wave: 'sine', freq: 150, to: 130, dur: 0.04, gain: 0.03 }],
  },
  // 剩 20 秒：两记催命的短促警告。时间到算输，所以这一声必须有压迫感。
  hurry: {
    tones: [
      { wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.08, gain: 0.09 },
      { wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.08, gain: 0.09, delay: 0.14 },
    ],
  },
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.08, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.08, gain: 0.1, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.22, gain: 0.11, delay: 0.16 },
    ],
  },
  win1: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.1, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.26, gain: 0.11, delay: 0.1 },
    ],
  },
  win2: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.09, gain: 0.1, delay: 0.09 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.3, gain: 0.11, delay: 0.18 },
    ],
  },
  win3: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.08, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.08, gain: 0.1, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.08, gain: 0.11, delay: 0.16 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.12, gain: 0.11, delay: 0.24 },
      { wave: 'square', freq: NOTE.E5, to: NOTE.C6, dur: 0.34, gain: 0.1, delay: 0.32 },
    ],
    noise: { dur: 0.26, gain: 0.05, cutoff: 4200, type: 'highpass', delay: 0.32 },
  },
  over: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.A3, to: NOTE.A3, dur: 0.16, gain: 0.1 },
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.C3, dur: 0.5, gain: 0.11, delay: 0.14 },
    ],
    noise: { dur: 0.4, gain: 0.05, cutoff: 500 },
  },
};

/** 连锁数对应的半音升高。连锁越大越亮，因为连锁是这游戏里唯一会失控的东西。 */
const CHAIN_SHIFTS = [0, 4, 7, 12, 16];

export const MAX_PER_BATCH = 3;

export const chainShift = (chain = 1) =>
  CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 *
 * 优先级就是「这一帧最该让玩家知道的是什么」：
 * 自己被补掉 > 补掉对手 > 自己被困 > 困住对手 > 挣脱 > 时间警告 >
 * 爆开 > 拆箱 > 捡到 > 踢弹 > 放下 > 空响。
 * 同名只留一条（取最高的 shift）：一帧里炸掉三个箱子该是一声，不是三声。
 * 注意 clear / over / win 没有对应 effect 的那几声由 App 在状态跳转时补。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  const self = (name) => effects.find((effect) => effect.type === name && effect.self);
  const foe = (name) => effects.find((effect) => effect.type === name && !effect.self);

  // 丢命独占一拍：这一刻不该再有别的声音抢戏。
  if (find('die') || self('pop')) return [{ name: 'popSelf', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  if (foe('pop')) push('popFoe');
  // 「我被困住了」和「我困住了人」是相反的处境，所以永远不合并成一声。
  if (self('bubble')) push('bubbleSelf');
  else if (foe('bubble')) push('bubbleFoe');
  if (self('escape')) push('escapeSelf');
  else if (foe('escape')) push('escapeFoe');
  if (find('timeup')) push('over');
  if (find('hurry')) push('hurry');
  const blast = find('blast');
  if (blast) push('blast', chainShift(blast.chain));
  if (find('crate')) push('crate');
  if (self('item')) push('item');
  if (self('kick')) push('kick');
  if (self('place')) push('place');
  if (self('deny')) push('deny');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/**
 * 触觉反馈：只在处境变了的那几个关口给。
 * 每放一发弹都震会变成一路发抖——那是噪音，不是反馈。
 */
export const VIBRATION = {
  bubbleSelf: [40, 30, 40],
  escapeSelf: [12],
  popFoe: [18, 30, 24],
  item: [10],
  kick: [12],
  hurry: [16, 40, 16],
  die: [70, 40, 70],
  clear: [22, 40, 30],
  win: [22, 50, 22, 50, 40],
  over: [70, 40, 70],
};

/** 一批 effects 该震哪一种。同时命中就取信息量最大的那条。 */
export function vibrationFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  const self = (name) => effects.find((effect) => effect.type === name && effect.self);
  if (find('die') || self('pop')) return VIBRATION.die;
  if (self('bubble')) return VIBRATION.bubbleSelf;
  if (effects.some((effect) => effect.type === 'pop' && !effect.self)) return VIBRATION.popFoe;
  if (self('escape')) return VIBRATION.escapeSelf;
  if (find('hurry')) return VIBRATION.hurry;
  if (self('item')) return VIBRATION.item;
  if (self('kick')) return VIBRATION.kick;
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
