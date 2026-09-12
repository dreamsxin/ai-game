// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这一关最要紧的不是「有声音」而是「听得见拍子」——关卡表里早就写了 bpm 和
// descendBeats，踩准拍子接球能攒到两倍律动，可玩家此前只能靠画布上的闪光去猜节拍。
// 所以 beat 一定要出声，而且强拍要和弱拍分得开。
//
// 分工和渲染层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层带通白噪，用来做敲击质感。
 */
export const SOUNDS = {
  // 强拍：每 4 拍一次，低而实，是整首的锚点。
  beatDown: {
    tones: [{ wave: 'sine', freq: 96, to: 62, dur: 0.11, gain: 0.16 }],
    noise: { dur: 0.03, gain: 0.05, cutoff: 220 },
  },
  // 弱拍：短促的高频点击，音量刻意压低，连着响也不吵。
  beatUp: {
    noise: { dur: 0.022, gain: 0.035, cutoff: 5200, type: 'highpass' },
  },
  // 踩准拍子接球：亮堂的三度和音，这是律动倍率的听觉凭证。
  paddleOn: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.1, gain: 0.12 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.13, gain: 0.1, delay: 0.02 },
    ],
  },
  // 没踩准：闷的一记，和上面对比明显，玩家自己就会去找拍子。
  paddleOff: {
    tones: [{ wave: 'sine', freq: 190, to: 130, dur: 0.08, gain: 0.1 }],
  },
  launch: {
    tones: [{ wave: 'triangle', freq: 300, to: 700, dur: 0.12, gain: 0.11 }],
  },
  // 整组同色消：基频跟着连消深度往上移（见 soundsFor 里的 shift）。
  clear: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.1, gain: 0.13 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.16, gain: 0.1, delay: 0.04 },
    ],
  },
  // 断了支撑整片掉下来：下行滑音，听着就是「塌了」。
  drop: {
    tones: [{ wave: 'sine', freq: 520, to: 150, dur: 0.3, gain: 0.12 }],
    noise: { dur: 0.22, gain: 0.06, cutoff: 1400 },
  },
  pop: {
    tones: [{ wave: 'triangle', freq: 620, to: 480, dur: 0.07, gain: 0.09 }],
  },
  break: {
    tones: [{ wave: 'square', freq: 220, to: 150, dur: 0.09, gain: 0.08 }],
    noise: { dur: 0.07, gain: 0.07, cutoff: 2600 },
  },
  // 异色砸裂：只是「咔」一下，不能比消除还响。
  crack: {
    noise: { dur: 0.04, gain: 0.05, cutoff: 3200, type: 'highpass' },
  },
  // 又挤进一行：下压的警示音，提醒场地在变窄。
  descend: {
    tones: [{ wave: 'sawtooth', freq: 260, to: 120, dur: 0.26, gain: 0.1 }],
  },
  // 律动攒满：短促的上行三连，攒到顶了值得听见。
  groove: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.09, gain: 0.11, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.18, gain: 0.12, delay: 0.14 },
    ],
  },
  lost: {
    tones: [{ wave: 'square', freq: 300, to: 110, dur: 0.3, gain: 0.12 }],
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

// 一拍四数：每 4 拍一个强拍，这样 4/4 的骨架才立起来。
export const BEATS_PER_BAR = 4;
// 连消越深，消除声越高：0、大三度、纯五度、八度。再深也不往上走了，会刺耳。
export const CHAIN_SHIFTS = [0, 4, 7, 12];
// 一批 effects 最多出这么多声。一步里同时崩好几颗是常事，全放会糊成噪音。
export const MAX_PER_BATCH = 5;

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

const chainShift = (chain = 1) => CHAIN_SHIFTS[Math.min(CHAIN_SHIFTS.length - 1, Math.max(0, chain - 1))];

/**
 * 一批 effects 该出哪些声音，按播放顺序返回 `{ name, shift }`。
 * shift 是半音数，让同一条音色随连消深度升高，省下一堆重复的音色条目。
 *
 * 同名只留一条（取最高的那个 shift）：一步里崩三颗弹珠该是一声，不是三声。
 */
export function soundsFor(effects = [], grooveCap = 10) {
  const find = (name) => effects.find((effect) => effect.type === name);
  // 结算音要独占这一批，不然脚步和碎裂声会盖在和弦上。
  const won = find('won');
  if (won) return [{ name: winSound(won.stars), shift: 0 }];
  if (find('over')) return [{ name: 'over', shift: 0 }];

  const picked = new Map();
  const push = (name, shift = 0) => {
    const current = picked.get(name);
    if (current === undefined || shift > current) picked.set(name, shift);
  };

  const beat = find('beat');
  if (beat) push(beat.beat % BEATS_PER_BAR === 0 ? 'beatDown' : 'beatUp');
  if (find('launch')) push('launch');
  const paddle = find('paddle');
  if (paddle) {
    push(paddle.onBeat ? 'paddleOn' : 'paddleOff');
    // 律动攒满顶格的那一下单独报喜，否则玩家不知道倍率已经吃满。
    if (paddle.onBeat && paddle.combo === grooveCap) push('groove');
  }
  const clear = find('clear');
  if (clear) push('clear', chainShift(clear.chain));
  if (find('drop')) push('drop');
  if (find('pop')) push('pop');
  if (find('break')) push('break');
  if (find('crack')) push('crack');
  if (find('descend')) push('descend');
  if (find('lost')) push('lost');

  return [...picked].slice(0, MAX_PER_BATCH).map(([name, shift]) => ({ name, shift }));
}

/** 触觉反馈：只在丢球、律动满格、结算三个关口给。每拍都震会变成噪音。 */
export const VIBRATION = {
  lost: [26],
  groove: [10, 30, 10],
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
 * 这一关的结算面板是随状态立刻弹的，不像有走位动画的游戏要等一拍，
 * 所以通关的那一串就在这里出，不用另外排。
 */
export function vibrationFor(effects = [], grooveCap = 10) {
  const find = (name) => effects.find((effect) => effect.type === name);
  if (find('won')) return VIBRATION.win;
  if (find('over')) return VIBRATION.over;
  if (find('lost')) return VIBRATION.lost;
  const paddle = find('paddle');
  if (paddle && paddle.onBeat && paddle.combo === grooveCap) return VIBRATION.groove;
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

    /**
     * 一批 effects 直接喂进来。节拍音必须准点，所以这里不给偏移——
     * 一批里的几声本来就来自同一步，堆在同一时刻是对的，靠 soundsFor 去重控量。
     */
    notify(effects, grooveCap) {
      const picks = soundsFor(effects, grooveCap);
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



