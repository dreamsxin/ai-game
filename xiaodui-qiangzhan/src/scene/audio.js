// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 3v3 死斗此前是完全静默的：自己有没有在开枪、子弹有没有打中人、刚才那下是谁在挨枪，
// 全靠盯屏幕上那几个小圈。射击游戏里这几件事本来就是靠耳朵判断的。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开。
 * noise 是一层滤波白噪，枪声、机械声、弹着全靠它。
 */
export const SOUNDS = {
  // 我手里这把枪：一记干脆的爆音，全场最靠前。
  gun: {
    tones: [{ wave: 'square', freq: 240, to: 70, dur: 0.07, gain: 0.1 }],
    noise: { dur: 0.09, gain: 0.11, cutoff: 2600, type: 'highpass' },
  },
  // 场上别人的枪：同一件事，但闷、远、轻。满场交火时这一条会响得最频繁。
  shot: {
    noise: { dur: 0.06, gain: 0.032, cutoff: 900 },
  },
  // 子弹啃在墙上：极轻的一记脆响。
  impact: {
    noise: { dur: 0.04, gain: 0.028, cutoff: 5200, type: 'highpass' },
  },
  // 我打中人了。射击游戏里最该做对的一声：短、亮、准，一听就知道枪口是实的。
  mark: {
    tones: [{ wave: 'square', freq: NOTE.G5, to: NOTE.G5, dur: 0.035, gain: 0.1 }],
    noise: { dur: 0.03, gain: 0.05, cutoff: 6000, type: 'highpass' },
  },
  // 我被打中了：闷在胸口的一记，往下坠。和 mark 在音区两端，绝不会听混。
  hurt: {
    tones: [{ wave: 'sawtooth', freq: 190, to: 88, dur: 0.2, gain: 0.13 }],
    noise: { dur: 0.12, gain: 0.07, cutoff: 520 },
  },
  // 我拿下一个人：上行两音，音高跟着连杀往上走（见 STREAK_SHIFTS）。
  frag: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.07, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.16, gain: 0.11, delay: 0.06 },
    ],
  },
  // 我被淘汰：下行两音，压到最低音区。
  down: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.G3, dur: 0.12, gain: 0.12 },
      { wave: 'sawtooth', freq: NOTE.C3, to: 62, dur: 0.42, gain: 0.12, delay: 0.1 },
    ],
    noise: { dur: 0.3, gain: 0.06, cutoff: 400 },
  },
  // 我重生了：一记轻快的上滑，「可以再上了」。
  spawn: {
    tones: [{ wave: 'sine', freq: NOTE.C4, to: NOTE.G4, dur: 0.14, gain: 0.08 }],
  },
  // 主动换弹：两记机械声，卸匣加上匣。
  reload: {
    noise: { dur: 0.05, gain: 0.06, cutoff: 1600 },
    tones: [{ wave: 'square', freq: 170, to: 130, dur: 0.05, gain: 0.05, delay: 0.09 }],
  },
  // 打空了被迫换弹：比主动换弹更硬更刺，这是「刚才那几枪你按空了」。
  dry: {
    tones: [{ wave: 'square', freq: 1250, to: 700, dur: 0.05, gain: 0.07 }],
    noise: { dur: 0.07, gain: 0.075, cutoff: 3400, type: 'highpass' },
  },
  // 上膛完成：一记清亮的咔嗒。换弹这段空窗期结束的唯一凭证。
  ready: {
    tones: [{ wave: 'square', freq: NOTE.E5, to: NOTE.G5, dur: 0.05, gain: 0.085 }],
  },
  // 拿下这一局。
  win: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.14, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.14, gain: 0.11, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.36, gain: 0.12, delay: 0.24 },
    ],
  },
  // 输掉这一局。
  lose: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E4, to: NOTE.E4, dur: 0.16, gain: 0.1 },
      { wave: 'sawtooth', freq: NOTE.C4, to: NOTE.C4, dur: 0.16, gain: 0.1, delay: 0.15 },
      { wave: 'sawtooth', freq: NOTE.G3, to: NOTE.C3, dur: 0.5, gain: 0.11, delay: 0.3 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 连杀的音阶：第一杀是基音，越串越高，第六杀封顶。
export const STREAK_SHIFTS = [0, 3, 5, 7, 10, 12];
// 一帧最多出这么多声。六个人同时开枪、同时命中是常事，全放会糊成白噪。
export const MAX_PER_BATCH = 4;

/**
 * 同名两声之间的最小间隔（秒）。这一层是这个游戏特有的：
 * 单枪间隔 FIRE_INTERVAL 是 0.12 秒，但场上有 6 个人，别人的枪声叠起来
 * 每秒能有 40 多条。限流放在引擎里而不是 soundsFor 里，因为它跨帧才成立。
 */
export const THROTTLE = { shot: 0.06, impact: 0.05 };

export const streakShift = (streak = 1) =>
  STREAK_SHIFTS[Math.min(STREAK_SHIFTS.length - 1, Math.max(0, streak - 1))];

/** 比赛结束那一声。status 变化时才有，effects 里不带。 */
export const matchSound = (status) => (status === 'won' ? 'win' : status === 'over' ? 'lose' : null);

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 *
 * 排序就是「哪件事更该先知道」：我死了 > 我杀了 > 我在挨枪 > 我打中了 >
 * 上膛好了 > 在换弹 > 重生 > 我的枪 > 别人的枪 > 弹着。
 */
export function soundsFor(effects = []) {
  const find = (type, flag) => effects.find((e) => e.type === type && (!flag || e[flag]));
  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  const lost = find('kill', 'lost');
  if (lost) push('down');
  const frag = effects.reduce(
    (best, e) => (e.type === 'kill' && e.mine ? Math.max(best, Number(e.streak) || 1) : best),
    0,
  );
  if (frag > 0) push('frag', streakShift(frag));
  // 致命那一枪同时发 hit 和 kill，阵亡声已经交代了「你挨的这下是最后一下」。
  if (!lost && find('hit', 'taken')) push('hurt');
  if (find('hit', 'mine')) push('mark');
  if (find('ready', 'mine')) push('ready');
  const reload = find('reload', 'mine');
  if (reload) push(reload.dry ? 'dry' : 'reload');
  if (find('spawn', 'mine')) push('spawn');
  if (find('shot', 'mine')) push('gun');
  if (effects.some((e) => e.type === 'shot' && !e.mine)) push('shot');
  if (find('impact')) push('impact');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只给和自己性命相关的三件事。枪声全程都震手会麻。 */
export const VIBRATION = {
  down: [70, 40, 70],
  hurt: [26],
  frag: [14, 22, 14],
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
  const mine = (type, flag) => effects.some((e) => e.type === type && e[flag]);
  if (mine('kill', 'lost')) return VIBRATION.down;
  if (mine('hit', 'taken')) return VIBRATION.hurt;
  if (mine('kill', 'mine')) return VIBRATION.frag;
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



