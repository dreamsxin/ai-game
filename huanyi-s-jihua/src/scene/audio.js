// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这游戏有两组声音必须让人一听就分得开，因为它们对应的是两种完全不同的处境：
//
// 1. pierce 与 chip——「打进弱点」和「被装甲挡住」。选错机翼的惩罚是伤害只剩一两成，
//    要是这两下听起来一样，玩家会以为自己在打，其实是在耗。这一对是「武器即钥匙」的听觉版。
// 2. pop 与 hit——「打掉了一发敌弹」和「打中了一个敌人」。敌弹可以被火力抵消是这游戏的身份，
//    所以 pop 的音高跟着连消数往上爬，压弹幕压得越顺，耳朵里越亮。
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
 * noise 是一层滤波白噪，用来做爆炸、脱落这类质感。
 */
export const SOUNDS = {
  // 打掉敌弹：这一声一局要响几百次，压到刚好听见，音高由 chain 决定（见 soundsFor）。
  pop: {
    tones: [{ wave: 'square', freq: 720, to: 980, dur: 0.05, gain: 0.06 }],
  },
  // 打中敌人：闷一点、低一点，和 pop 分开——一个是防守成功，一个是进攻生效。
  hit: {
    tones: [{ wave: 'square', freq: 300, to: 240, dur: 0.04, gain: 0.05 }],
  },
  // 打进弱点：亮，带一点上滑。听到它就说明这只翅膀是对的。
  pierce: {
    tones: [{ wave: 'triangle', freq: 560, to: 940, dur: 0.09, gain: 0.1 }],
    noise: { dur: 0.04, gain: 0.04, cutoff: 3200, type: 'highpass' },
  },
  // 被装甲挡住：又钝又短，几乎没有音高。这是「白打」的声音，它该让人不舒服。
  chip: {
    tones: [{ wave: 'sawtooth', freq: 132, to: 108, dur: 0.06, gain: 0.055 }],
    noise: { dur: 0.05, gain: 0.035, cutoff: 500 },
  },
  kill: {
    tones: [{ wave: 'square', freq: 260, to: 120, dur: 0.11, gain: 0.09 }],
    noise: { dur: 0.09, gain: 0.06, cutoff: 1600 },
  },
  // 运载火箭炸开：比普通爆炸厚，因为它掉出来的是一整套火力配置。
  carrier: {
    tones: [
      { wave: 'square', freq: 200, to: 90, dur: 0.16, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.C5, dur: 0.14, gain: 0.08, delay: 0.1 },
    ],
    noise: { dur: 0.16, gain: 0.08, cutoff: 1200 },
  },
  // 接到机翼：上行三音。这是这游戏里最让人松一口气的一刻。
  catch: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.07, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.07, gain: 0.1, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.2, gain: 0.11, delay: 0.12 },
    ],
  },
  // 换翼：接到的同时旧翼脱手，所以是一上一下两个音叠着。
  swap: {
    tones: [
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.C5, dur: 0.14, gain: 0.1 },
      { wave: 'sine', freq: NOTE.G4, to: NOTE.E4, dur: 0.14, gain: 0.07, delay: 0.04 },
    ],
  },
  // 进化：捡到同型号叠上去。四级琶音一路往上顶，最后一记带一层亮噪——
  // 「上了一个台阶」这件事必须比「接到一只翅膀」更响、更长、更明确。
  evolve: {
    tones: [
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.07, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.07, gain: 0.11, delay: 0.06 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.07, gain: 0.12, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12, delay: 0.18 },
      { wave: 'square', freq: NOTE.E5, to: NOTE.C6, dur: 0.3, gain: 0.1, delay: 0.26 },
    ],
    noise: { dur: 0.24, gain: 0.05, cutoff: 4200, type: 'highpass', delay: 0.26 },
  },
  // 已经满阶还捡到同型号：一声「收到了，但没得升」的短应答，不是失败音。
  topped: {
    tones: [
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.05, gain: 0.07 },
      { wave: 'sine', freq: NOTE.C5, to: NOTE.C5, dur: 0.07, gain: 0.07, delay: 0.08 },
    ],
  },
  // 反物质弹炸开：低频闷响加一层宽噪，比普通爆炸更「空」。
  burst: {
    tones: [{ wave: 'sine', freq: 150, to: 44, dur: 0.34, gain: 0.11 }],
    noise: { dur: 0.3, gain: 0.09, cutoff: 700 },
  },
  // 链弧跳弹：一记高频电噪。它一帧可能响好几次，所以压得很轻。
  arc: {
    tones: [{ wave: 'sawtooth', freq: 1180, to: 720, dur: 0.05, gain: 0.045 }],
    noise: { dur: 0.05, gain: 0.04, cutoff: 5200, type: 'highpass' },
  },
  // 主动弃翼：一段往下沉的滑音加气流声。是自己选的，所以不刺耳，但一定听得出「东西没了」。
  jettison: {
    tones: [{ wave: 'sawtooth', freq: 480, to: 150, dur: 0.26, gain: 0.09 }],
    noise: { dur: 0.22, gain: 0.06, cutoff: 900 },
  },
  // 机翼被打掉：同样是失去翅膀，但这次不是你决定的——所以它更硬、更难听。
  wingLost: {
    tones: [
      { wave: 'sawtooth', freq: 320, to: 96, dur: 0.28, gain: 0.12 },
      { wave: 'square', freq: 180, to: 140, dur: 0.1, gain: 0.08 },
    ],
    noise: { dur: 0.2, gain: 0.09, cutoff: 2400 },
  },
  // 无敌结束了而新翼还没接上：这是全局最危险的一瞬，值得两声催命的短促警告。
  bare: {
    tones: [
      { wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.07, gain: 0.09 },
      { wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.07, gain: 0.09, delay: 0.12 },
    ],
  },
  // 没翼可弃、或刚接上还锁着：一记几乎听不见的空响，告诉你这下按了没用。
  deny: {
    tones: [{ wave: 'sine', freq: 150, to: 130, dur: 0.04, gain: 0.03 }],
  },
  bossIn: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.24, gain: 0.1 },
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.E3, dur: 0.36, gain: 0.11, delay: 0.2 },
    ],
    noise: { dur: 0.4, gain: 0.05, cutoff: 400 },
  },
  bossKill: {
    tones: [
      { wave: 'square', freq: 240, to: 70, dur: 0.4, gain: 0.13 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C6, dur: 0.3, gain: 0.09, delay: 0.24 },
    ],
    noise: { dur: 0.44, gain: 0.1, cutoff: 900 },
  },
  // 跳关门：一段往上冲的滑音。跳过去省了四关，可 Boss 一点没削弱，所以它不是胜利的和弦。
  skip: {
    tones: [
      { wave: 'sine', freq: 300, to: 1200, dur: 0.34, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.D5, to: NOTE.D5, dur: 0.18, gain: 0.08, delay: 0.22 },
    ],
  },
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.12, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.12, gain: 0.12, delay: 0.1 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.3, gain: 0.13, delay: 0.2 },
    ],
  },
  die: {
    tones: [
      { wave: 'square', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.12 },
      { wave: 'square', freq: NOTE.G4, to: NOTE.G4, dur: 0.1, gain: 0.12, delay: 0.1 },
      { wave: 'square', freq: 300, to: 80, dur: 0.5, gain: 0.12, delay: 0.22 },
    ],
    noise: { dur: 0.5, gain: 0.09, cutoff: 1400, delay: 0.2 },
  },
  revive: {
    tones: [{ wave: 'sine', freq: 180, to: NOTE.C4, dur: 0.22, gain: 0.08 }],
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
      { wave: 'sine', freq: NOTE.G5, to: NOTE.E6, dur: 0.48, gain: 0.07, delay: 0.33 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// 连消敌弹的音阶：每多消一发升一阶，第八发封顶。
// 规则上分数是往上翻的（rules.js 的 popScore），音高必须跟着涨，
// 否则「用火力抵消弹幕」这条只存在于代码里。
export const CHAIN_SHIFTS = [0, 2, 4, 5, 7, 9, 11, 12];
// 一批 effects 最多出这么多声。一帧里同时打掉三发敌弹又打中 Boss 是常事，全放会糊。
export const MAX_PER_BATCH = 3;

export const chainShift = (chain = 1) =>
  CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条 pop 音色随连消数升高，省下一堆重复的音色条目。
 *
 * 优先级就是「这一帧最该让玩家知道的是什么」：
 * 掉命 > 打完了 > 翅膀没了 > 裸机警告 > 接上了 > 打进弱点／被挡住 > 消弹 > 打中。
 * 同名只留一条（取最高的 shift）：一帧里消掉三发该是一声，不是三声。
 * 注意 over / won 没有 effects——它们是状态跳转，由 App 在状态变化时补。
 */
export function soundsFor(effects = []) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 这三件事各自独占一拍，别让打中和消弹盖在上面。
  if (find('die')) return [{ name: 'die', shift: 0 }];
  if (find('bossKill')) return [{ name: 'bossKill', shift: 0 }, { name: 'clear', shift: 0 }];
  if (find('skip')) return [{ name: 'skip', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  // 火力配置发生变化的几声优先级最高：它们改变的是接下来怎么打。
  if (find('wingLost')) push('wingLost');
  if (find('bare')) push('bare');
  // 进化压过换翼和接翼：同一帧里最该被听见的是「上了一个台阶」。
  if (find('evolve')) push('evolve');
  else if (find('swap')) push('swap');
  else if (find('catch')) push('catch');
  else if (find('topped')) push('topped');
  if (find('jettison')) push('jettison');
  if (find('revive')) push('revive');
  if (find('bossIn')) push('bossIn');
  if (find('carrier')) push('carrier');
  if (find('burst')) push('burst');
  // 打 Boss 的两种手感：进去了，还是被挡住了。
  if (find('pierce')) push('pierce');
  else if (find('chip')) push('chip');
  const popped = find('pop');
  if (popped) push('pop', chainShift(popped.chain));
  if (find('kill')) push('kill');
  else if (find('arc')) push('arc');
  else if (find('hit')) push('hit');
  if (find('deny')) push('deny');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/**
 * 触觉反馈：只在火力配置变了、掉命、过关这几个关口给。
 * 每打掉一发敌弹都震会变成一路发抖——那是噪音，不是反馈。
 */
export const VIBRATION = {
  jettison: [16],
  wingLost: [40, 30, 40],
  bare: [10, 40, 10],
  catch: [12],
  // 进化是一串往上敲的短震，和「接到一只翅膀」的单下分得开。
  evolve: [10, 24, 10, 24, 22],
  die: [60, 40, 60],
  skip: [14, 24, 14, 24],
  bossKill: [30, 40, 60],
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
  if (find('bossKill')) return VIBRATION.bossKill;
  if (find('skip')) return VIBRATION.skip;
  if (find('wingLost')) return VIBRATION.wingLost;
  if (find('bare')) return VIBRATION.bare;
  if (find('evolve')) return VIBRATION.evolve;
  if (find('jettison')) return VIBRATION.jettison;
  if (find('catch') || find('swap')) return VIBRATION.catch;
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
