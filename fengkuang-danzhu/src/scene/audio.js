// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 弹珠玩法的乐趣全在「一串球出膛、满场乱弹、连爆一片」这段听觉节奏上，
// 可此前一路上一声都没有：砸掉一块砖和吃到一颗加珠在感官上完全一样。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开。
 * noise 是一层滤波白噪，出膛、弹跳、下压这些质感全靠它。
 */
export const SOUNDS = {
  // 按下发射：一记上行，弹珠越多越厚（见 volleyShift）。
  fire: {
    tones: [{ wave: 'square', freq: 220, to: 460, dur: 0.12, gain: 0.09 }],
    noise: { dur: 0.08, gain: 0.05, cutoff: 2200, type: 'highpass' },
  },
  // 一颗球出膛：极轻的一记「哒」。一串二十颗就是二十下，这条节奏是招牌，但不能吵。
  launch: {
    noise: { dur: 0.03, gain: 0.03, cutoff: 4200, type: 'highpass' },
  },
  // 砸到砖但没砸碎：全表最高频的一条，一秒能有几十次，压到只剩轮廓并且限流。
  hit: {
    tones: [{ wave: 'triangle', freq: 520, to: 430, dur: 0.03, gain: 0.045 }],
  },
  // 砸碎了：音高跟着这一下带走的砖数走（见 chainShift），炸弹连爆会明显更高。
  break: {
    tones: [{ wave: 'square', freq: NOTE.E5, to: NOTE.E5, dur: 0.06, gain: 0.085 }],
    noise: { dur: 0.06, gain: 0.05, cutoff: 1800 },
  },
  // 吃到加珠：一记清亮的铃，和砸砖完全不在一个音色上——这是「下一串更长了」。
  pickup: {
    tones: [
      { wave: 'sine', freq: NOTE.G5, to: NOTE.G5, dur: 0.05, gain: 0.075 },
      { wave: 'sine', freq: NOTE.C6, to: NOTE.C6, dur: 0.14, gain: 0.075, delay: 0.05 },
    ],
  },
  // 弹珠回收落地：闷的一记，一回合结束的收束感一半靠它。
  land: {
    noise: { dur: 0.05, gain: 0.04, cutoff: 620 },
  },
  // 整片砖往下压一行：低频摩擦，这是这游戏唯一的倒计时。
  descend: {
    tones: [{ wave: 'sawtooth', freq: 150, to: 104, dur: 0.22, gain: 0.075 }],
    noise: { dur: 0.2, gain: 0.05, cutoff: 460 },
  },
  // 压过底线，结束。
  over: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E4, to: NOTE.E4, dur: 0.16, gain: 0.1 },
      { wave: 'sawtooth', freq: NOTE.C4, to: NOTE.C4, dur: 0.16, gain: 0.1, delay: 0.15 },
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.C3, dur: 0.5, gain: 0.11, delay: 0.3 },
    ],
    noise: { dur: 0.4, gain: 0.06, cutoff: 420 },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 连爆规模的音阶：一下带走的砖越多，音越高，第八块封顶。
export const CHAIN_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一串弹珠的规模：球越多，发射声越高，但只走到第五档，再往上就刺耳了。
export const VOLLEY_SHIFTS = [0, 2, 4, 5, 7];
// 一帧最多出这么多声。二十颗球满场乱弹，一帧好几条 hit 是常事，全放会糊成白噪。
export const MAX_PER_BATCH = 3;

/**
 * 同名两声之间的最小间隔（秒）。这一层跨帧才成立，所以放在引擎里而不是 soundsFor 里：
 * hit 在满场乱弹时每秒能有几十条，land 在回收那几帧也会连成一片。
 */
export const THROTTLE = { hit: 0.045, land: 0.05, launch: 0.03 };

const ladder = (table, n) => table[Math.min(table.length - 1, Math.max(0, n - 1))];

export const chainShift = (bricks = 1) => ladder(CHAIN_SHIFTS, bricks);

export const volleyShift = (balls = 1) => ladder(VOLLEY_SHIFTS, Math.ceil(balls / 4));

/** 这一下带走了几块砖。break.chain 把加珠也算进去了，做音高映射得把它们剔掉。 */
export const brickCount = (effect) =>
  (effect.cells ?? []).filter((cell) => cell && cell.kind !== 'plus').length;

/** 炸弹连爆顺手带走的加珠不发 pickup 事件，只躺在 break.cells 里，这里把它捞回来。 */
export const plusCount = (effect) =>
  (effect.cells ?? []).filter((cell) => cell && cell.kind === 'plus').length;

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 *
 * 排序就是「哪件事更该先知道」：结束 > 下压一行 > 加珠 > 砸碎 > 发射 > 落地 > 出膛 > 擦碰。
 */
export function soundsFor(effects = []) {
  const find = (type) => effects.find((effect) => effect.type === type);
  // 结束那一声独占这一批：这一局到此为止，别让弹珠声盖在上面。
  if (find('over')) return [{ name: 'over', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  if (find('descend')) push('descend');
  const breaks = effects.filter((effect) => effect.type === 'break');
  if (find('pickup') || breaks.some((effect) => plusCount(effect) > 0)) push('pickup');
  for (const effect of breaks) {
    const bricks = brickCount(effect);
    if (bricks > 0) push('break', chainShift(bricks));
  }
  const volley = find('fire');
  if (volley) push('fire', volleyShift(volley.balls));
  if (find('land')) push('land');
  if (find('launch')) push('launch');
  if (find('hit')) push('hit');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在结束和一次带走一大片这两个关口给。弹珠全程都震会麻。 */
export const VIBRATION = {
  over: [70, 40, 70],
  chain: [16, 24, 16],
};

/** 一次带走这么多砖才算「炸开了一片」，值得震一下。 */
export const CHAIN_FEEL = 4;

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
  if (effects.some((effect) => effect.type === 'over')) return VIBRATION.over;
  const biggest = effects.reduce(
    (best, effect) => (effect.type === 'break' ? Math.max(best, brickCount(effect)) : best),
    0,
  );
  return biggest >= CHAIN_FEEL ? VIBRATION.chain : null;
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
  // 每个音名上一次出声的时刻，配合 THROTTLE 给密集事件限流。
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


