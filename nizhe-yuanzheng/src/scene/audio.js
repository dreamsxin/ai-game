// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 越野卡车和别的游戏不一样：最重要的声音不是某个瞬间的「叮」，而是一条一直在响的引擎音。
// 转速、油门、有没有陷住全靠它交代——差速锁到底有没有用上，耳朵比仪表盘先知道。
// 所以这个模块分两半：engineFor 是连续音的参数（纯函数），soundsFor 是离散事件。
//
// 离散事件不去解析 state.effects 里的中文句子（那是给人读的），而是比对前后两个状态：
// 交付数涨了就是交付、载货数掉了就是货撒了，这两件事都归 kind 'cargo'，只看 kind 会说错话。

const NOTE = { C3: 130.81, E3: 164.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/** 引擎连续音的取值区间。怠速低沉、拉高转速也不刺耳，是实测出来的上下限。 */
export const ENGINE = {
  idleHz: 38,
  redlineHz: 132,
  minGain: 0.05,
  maxGain: 0.16,
  // 陷住时轮子空转，音色要发飘：叠一层高八度的泛音并抬一点音量。
  slipGain: 0.07,
  // 参数每帧都在变，直接跳会有台阶感，所以用一小段时间常数平滑过去。
  glideSeconds: 0.08,
};

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * 引擎该以什么频率和音量响。rpm 按引擎上限归一化后线性映到频率区间，
 * 油门只影响音量——转速已经代表了「发动机在多努力」，再乘一次会过冲。
 *
 * `max` 取的是 spec.engine.max；`slipping` 是 0..1 的空转比例，
 * 它越大高八度泛音越明显，差速锁到底有没有用上耳朵比仪表盘先知道。
 */
export function engineFor(vehicle = {}, options = {}) {
  const { max = 4600, running = true } = options;
  if (!running) return { hz: 0, gain: 0, slip: 0 };
  const load = clamp01(Math.max(0, Number(vehicle.rpm) || 0) / Math.max(1, max));
  const throttle = clamp01(vehicle.throttle);
  return {
    hz: ENGINE.idleHz + (ENGINE.redlineHz - ENGINE.idleHz) * load,
    gain: ENGINE.minGain + (ENGINE.maxGain - ENGINE.minGain) * Math.max(load, throttle * 0.6),
    slip: ENGINE.slipGain * clamp01(vehicle.slipping),
  };
}


/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做金属、泥浆这类质感。
 */
export const SOUNDS = {
  // 换挡：一记干脆的机械咔哒。
  shift: {
    tones: [{ wave: 'square', freq: 190, to: 130, dur: 0.06, gain: 0.09 }],
    noise: { dur: 0.04, gain: 0.05, cutoff: 2800, type: 'highpass' },
  },
  // 四驱／差速锁接合：比换挡更沉更闷，是「底盘里有东西咬上了」。
  clunk: {
    tones: [{ wave: 'sine', freq: 120, to: 72, dur: 0.13, gain: 0.13 }],
    noise: { dur: 0.06, gain: 0.05, cutoff: 700 },
  },
  // 绞盘挂钩：金属扣上去的一声。
  hook: {
    tones: [{ wave: 'square', freq: 520, to: 380, dur: 0.08, gain: 0.09 }],
    noise: { dur: 0.05, gain: 0.05, cutoff: 3400, type: 'highpass' },
  },
  // 钢缆崩断：高频炸开再往下坠，和挂钩一听就分得开。
  snap: {
    tones: [{ wave: 'sawtooth', freq: 900, to: 120, dur: 0.3, gain: 0.14 }],
    noise: { dur: 0.18, gain: 0.1, cutoff: 4200, type: 'highpass' },
  },
  // 陷住：低频警示，提醒该锁差速或者挂绞盘了。
  stuck: {
    tones: [{ wave: 'sawtooth', freq: 150, to: 96, dur: 0.34, gain: 0.11 }],
    noise: { dur: 0.3, gain: 0.06, cutoff: 500 },
  },
  // 装货：闷闷的一坨落到货斗里。
  load: {
    tones: [{ wave: 'sine', freq: 150, to: 88, dur: 0.16, gain: 0.12 }],
    noise: { dur: 0.12, gain: 0.07, cutoff: 900 },
  },
  // 交付：这一趟真正的进度，给一段上行三音。
  deliver: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.09, gain: 0.11, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.2, gain: 0.12, delay: 0.14 },
    ],
  },
  // 货撒了：把交付那三音倒过来。
  spill: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.22, gain: 0.11, delay: 0.07 },
    ],
    noise: { dur: 0.22, gain: 0.07, cutoff: 1400 },
  },
  // 加油：注油的持续噪声，尾巴上一声「满了」。
  refuel: {
    tones: [{ wave: 'triangle', freq: 420, to: 620, dur: 0.14, gain: 0.09, delay: 0.24 }],
    noise: { dur: 0.24, gain: 0.06, cutoff: 1200 },
  },
  // 拖回路线：认输式的下滑，同时是罚时的回执。
  recover: {
    tones: [{ wave: 'sawtooth', freq: 300, to: 120, dur: 0.32, gain: 0.1 }],
  },
  lost: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.E3, dur: 0.22, gain: 0.11 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.62, gain: 0.12, delay: 0.18 },
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

// 一帧最多出这么多声。一次翻车能同时撒货、崩缆、报废，全放会糊成一团。
export const MAX_PER_BATCH = 3;

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

const cargoCount = (state) => (Array.isArray(state.cargo) ? state.cargo.length : 0);

/**
 * 反馈层只关心这十几个字段，而模拟层是「就地改同一个 state」——
 * 所以不能拿两个 state 对象比，必须自己留一份快照。
 */
export const snapshot = (state) => ({
  levelIndex: state.levelIndex,
  status: state.status,
  stars: state.stars,
  elapsed: state.elapsed,
  delivered: state.delivered,
  cargo: cargoCount(state),
  gear: state.vehicle?.gear,
  awd: Boolean(state.vehicle?.awd),
  diffLock: Boolean(state.vehicle?.diffLock),
  anchored: Boolean(state.winch?.anchor),
  snapped: Boolean(state.winch?.snapped),
  stuck: Boolean(state.stuck),
  fuel: state.fuel,
  penalty: state.penalty,
});

/**
 * 前后两份快照该出哪些离散声音，按播放顺序返回音名。
 *
 * 判据一律是状态差，不去读 state.effects 里的句子——那些字是给人看的，
 * 而且交付和撒货共用 kind 'cargo'，只看 kind 会把坏消息报成好消息。
 */
export function soundsFor(prev, next) {
  if (!prev || !next) return [];
  // 换趟或重开会把计时和进度归零，这时不该把上一趟的结算音再放一遍。
  if (next.levelIndex !== prev.levelIndex) return [];
  if (next.elapsed < prev.elapsed || next.delivered < prev.delivered) return [];

  if (next.status !== prev.status) {
    if (next.status === 'won') return [winSound(next.stars)];
    if (next.status === 'lost') return ['lost'];
  }

  const names = [];
  // 崩缆最急，排在最前：钢缆断了和自己决定收工是两件事。
  if (prev.anchored && !next.anchored && next.snapped) names.push('snap');
  else if (!prev.anchored && next.anchored) names.push('hook');
  if (next.delivered > prev.delivered) names.push('deliver');
  // 装货是「多了一件」，撒货是「少了一件而且不是因为交付」。
  if (next.cargo > prev.cargo) names.push('load');
  else if (next.cargo < prev.cargo && next.delivered === prev.delivered) names.push('spill');
  if (next.gear !== prev.gear) names.push('shift');
  if (next.awd !== prev.awd || next.diffLock !== prev.diffLock) names.push('clunk');
  if (next.stuck && !prev.stuck) names.push('stuck');
  if (next.fuel > prev.fuel) names.push('refuel');
  if (next.penalty > prev.penalty) names.push('recover');

  return [...new Set(names)].slice(0, MAX_PER_BATCH);
}


/** 触觉反馈：只在崩缆、陷住、翻车报废、结算这几个关口给。开车全程都震会麻。 */
export const VIBRATION = {
  snap: [40, 30, 40],
  stuck: [26],
  win: [22, 50, 22, 50, 40],
  lost: [70, 40, 70],
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

/** 前后两个状态该震哪一种。判据和 soundsFor 一致，只是门槛更高。 */
export function vibrationFor(prev, next) {
  const names = soundsFor(prev, next);
  if (names.some((name) => name.startsWith('win'))) return VIBRATION.win;
  if (names.includes('lost')) return VIBRATION.lost;
  if (names.includes('snap')) return VIBRATION.snap;
  if (names.includes('stuck')) return VIBRATION.stuck;
  return null;
}

/**
 * 出声的那一半。AudioContext 必须等用户手势才能起，所以这里全程懒建：
 * 静音状态下一个节点都不建，玩家从头到尾静音玩就不会有音频线程。
 *
 * 引擎是一条常驻的振荡器，每帧只改参数不重建节点——重建会听见「咔」。
 */
export function createAudio({ muted = false, Ctor } = {}) {
  const AudioCtor = Ctor
    ?? (typeof window === 'undefined' ? null : window.AudioContext ?? window.webkitAudioContext);
  let ctx = null;
  let master = null;
  let silent = Boolean(muted);
  let noiseBuffer = null;
  let engine = null;

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

  const playTone = (spec, at) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.wave ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, at);
    if (spec.to && spec.to !== spec.freq) {
      osc.frequency.exponentialRampToValueAtTime(spec.to, at + spec.dur);
    }
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

  // 引擎：一条锯齿当基频，一条高八度方波当空转泛音，两条各有自己的增益。
  const startEngine = () => {
    const base = ctx.createOscillator();
    const baseGain = ctx.createGain();
    base.type = 'sawtooth';
    base.frequency.value = ENGINE.idleHz;
    baseGain.gain.value = 0;
    base.connect(baseGain).connect(master);
    base.start();

    const slip = ctx.createOscillator();
    const slipGain = ctx.createGain();
    slip.type = 'square';
    slip.frequency.value = ENGINE.idleHz * 2;
    slipGain.gain.value = 0;
    slip.connect(slipGain).connect(master);
    slip.start();

    return { base, baseGain, slip, slipGain };
  };

  const stopEngine = () => {
    if (!engine) return;
    engine.base.stop();
    engine.slip.stop();
    engine = null;
  };

  return {
    get muted() {
      return silent;
    },

    play(name, offset = 0) {
      const spec = SOUNDS[name];
      if (!spec || !ensure()) return false;
      const at = ctx.currentTime + offset;
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0));
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      return true;
    },

    /** 前后两个状态直接喂进来，几声错开一点排，挤在一起会听成一声。 */
    notify(prev, next) {
      const names = soundsFor(prev, next);
      names.forEach((name, index) => this.play(name, index * 0.07));
      return names.length;
    },

    /**
     * 每帧调一次。参数用 setTargetAtTime 平滑过去而不是直接赋值：
     * 转速每帧都在跳，硬赋值会听出一格一格的台阶。
     */
    updateEngine(vehicle, options = {}) {
      const target = engineFor(vehicle, options);
      if (target.gain <= 0) {
        stopEngine();
        return false;
      }
      if (!ensure()) return false;
      if (!engine) engine = startEngine();
      const now = ctx.currentTime;
      const glide = ENGINE.glideSeconds;
      engine.base.frequency.setTargetAtTime(target.hz, now, glide);
      engine.baseGain.gain.setTargetAtTime(target.gain, now, glide);
      engine.slip.frequency.setTargetAtTime(target.hz * 2, now, glide);
      engine.slipGain.gain.setTargetAtTime(target.slip, now, glide);
      return true;
    },

    setMuted(next) {
      silent = Boolean(next);
      if (silent) {
        stopEngine();
        if (ctx) ctx.suspend().catch(() => {});
      }
      return silent;
    },

    dispose() {
      if (!ctx) return;
      stopEngine();
      ctx.close().catch(() => {});
      ctx = null;
      master = null;
      noiseBuffer = null;
    },
  };
}




