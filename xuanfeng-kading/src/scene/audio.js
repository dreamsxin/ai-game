// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 赛车的声音有两类，这里都要：
// 1. **常驻引擎声**——频率跟着车速走，喷射时叠一层高频。它不是气氛，是仪表：
//    手机上盯着弯心的时候，速度是靠耳朵读的。
// 2. **事件声**——而事件声里有三对必须一听就分得开，因为它们的处境正好相反：
//    · overtake / passed：超掉一个人，和被人超掉。画面上都只是一辆车擦过去，方向却完全相反。
//    · launchPerfect / launchEarly：弹射起步，和抢跑罚站。同一颗按钮、差几十毫秒，结果一好一坏。
//    · ready / fizzle：这个弯的气攒够了一档，和白漂了一段。
//    没有这三对，玩家只能靠看 HUD 才知道刚才那下是赚了还是亏了。
//
// 喷射的音高跟着**档位和连喷数**一起爬：连喷是这游戏唯一会累积的东西，理应越听越亮。
//
// 分工和别的表现层一样：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = {
  C3: 130.81, E3: 164.81, G3: 196, A3: 220,
  C4: 261.63, E4: 329.63, G4: 392, A4: 440,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  C6: 1046.5, E6: 1318.5,
};

export const SOUNDS = {
  // 攒气升一档：极轻的一记 tick。一个弯会响两三次，压到刚好听见。
  tier: {
    tones: [{ wave: 'square', freq: 900, to: 1200, dur: 0.03, gain: 0.028 }],
  },
  // 这段漂移攒够了：清亮的一点「叮」，音高跟着档位走。
  ready: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.05, gain: 0.07 },
      { wave: 'triangle', freq: NOTE.D5, to: NOTE.D5, dur: 0.1, gain: 0.08, delay: 0.05 },
    ],
  },
  // 白漂了：往下掉的一小声。不刺耳，但要让人知道这个弯没换来东西。
  fizzle: {
    tones: [{ wave: 'sine', freq: 380, to: 200, dur: 0.09, gain: 0.045 }],
  },
  // 入漂：轮胎擦地。噪声为主，音调只是垫底。
  driftStart: {
    tones: [{ wave: 'sawtooth', freq: 160, to: 130, dur: 0.1, gain: 0.03 }],
    noise: { dur: 0.16, gain: 0.05, cutoff: 2200, type: 'highpass' },
  },
  // 连喷接上了：一记上挑，专门告诉你「窗口没断」。
  chain: {
    tones: [{ wave: 'square', freq: 700, to: 1050, dur: 0.06, gain: 0.05 }],
  },
  // 喷射：一层上冲的锯齿加一层气流噪。这是这游戏最值钱的一声。
  boost: {
    tones: [
      { wave: 'sawtooth', freq: 220, to: 760, dur: 0.24, gain: 0.11 },
      { wave: 'square', freq: NOTE.C5, to: NOTE.E6, dur: 0.18, gain: 0.06, delay: 0.03 },
    ],
    noise: { dur: 0.3, gain: 0.07, cutoff: 1800, type: 'highpass' },
  },
  // 手上没气还按了喷：几乎听不见的空响，告诉你这下按了没用。
  deny: {
    tones: [{ wave: 'sine', freq: 150, to: 130, dur: 0.04, gain: 0.03 }],
  },
  // 弹射起步：两记上冲，比任何一次喷都亮——一局只有一次机会。
  launchPerfect: {
    tones: [
      { wave: 'square', freq: NOTE.G4, to: NOTE.G5, dur: 0.12, gain: 0.1 },
      { wave: 'sawtooth', freq: 260, to: 900, dur: 0.3, gain: 0.11, delay: 0.06 },
    ],
    noise: { dur: 0.32, gain: 0.07, cutoff: 2000, type: 'highpass' },
  },
  // 抢跑：熄火般的一声闷响，一路沉到底。和上面那一声方向完全相反。
  launchEarly: {
    tones: [
      { wave: 'sawtooth', freq: 240, to: 60, dur: 0.42, gain: 0.11 },
      { wave: 'square', freq: 120, to: 80, dur: 0.2, gain: 0.06, delay: 0.05 },
    ],
    noise: { dur: 0.36, gain: 0.05, cutoff: 500 },
  },
  // 超掉一个人：三音上行。听到它就该继续压着他跑。
  overtake: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.07, gain: 0.08 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.07, gain: 0.08, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.16, gain: 0.09, delay: 0.14 },
    ],
  },
  // 被人超掉：两音下沉，闷。掉名次不该听起来像得分。
  passed: {
    tones: [
      { wave: 'sine', freq: NOTE.G4, to: NOTE.G4, dur: 0.08, gain: 0.08 },
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C3, dur: 0.26, gain: 0.09, delay: 0.08 },
    ],
  },
  // 撞墙：低频撞击加一层碎裂噪。速度砍半这件事必须听得出代价。
  wall: {
    tones: [{ wave: 'triangle', freq: 180, to: 70, dur: 0.26, gain: 0.12 }],
    noise: { dur: 0.2, gain: 0.08, cutoff: 1200 },
  },
  // 擦碰：轻得多的一记。它只是提醒你身边有人。
  bump: {
    tones: [{ wave: 'square', freq: 260, to: 200, dur: 0.05, gain: 0.05 }],
  },
  // 压上草地：一层沙沙的宽噪。它和撞墙的区别是「持续的亏」而不是「一下的痛」。
  grass: {
    noise: { dur: 0.3, gain: 0.07, cutoff: 900, type: 'bandpass' },
    tones: [{ wave: 'sine', freq: 90, to: 70, dur: 0.2, gain: 0.03 }],
  },
  // 过线一圈：干脆的两音。
  lap: {
    tones: [
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.07, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.14, gain: 0.08, delay: 0.07 },
    ],
  },
  // 读秒：三短一长的最后一声由 count0 负责。
  count: {
    tones: [{ wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.1, gain: 0.09 }],
  },
  count0: {
    tones: [
      { wave: 'square', freq: NOTE.A4, to: NOTE.A4, dur: 0.24, gain: 0.11 },
      { wave: 'triangle', freq: NOTE.A4, to: NOTE.C6, dur: 0.3, gain: 0.07, delay: 0.02 },
    ],
  },
  finish: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.24, gain: 0.11, delay: 0.09 },
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
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.08, gain: 0.1, delay: 0.16 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.36, gain: 0.12, delay: 0.24 },
    ],
  },
  over: {
    tones: [
      { wave: 'sawtooth', freq: 300, to: 70, dur: 0.5, gain: 0.12 },
      { wave: 'square', freq: 150, to: 90, dur: 0.2, gain: 0.07, delay: 0.08 },
    ],
    noise: { dur: 0.4, gain: 0.06, cutoff: 800 },
  },
};

export const winSound = (stars) => (stars >= 3 ? 'win3' : stars === 2 ? 'win2' : 'win1');

/**
 * 一批 effects 该出哪几声。只听自己的车——把五个对手的轮胎声全放出来，
 * 玩家反而听不见自己刚才是赚了还是亏了。
 *
 * 排序是按「信息量」来的：起步、喷射、撞墙、名次变化在前，
 * 轮胎和攒气这类每个弯都会响的垫在后面，同帧最多四声。
 */
export function soundsFor(effects = []) {
  const mine = effects.filter((effect) => effect.self);
  const find = (type) => mine.find((effect) => effect.type === type);
  const picks = [];
  const take = (name, shift = 0) => {
    if (!picks.some((pick) => pick.name === name)) picks.push({ name, shift });
  };

  const count = find('count');
  if (count) take(count.n === 0 ? 'count0' : 'count');
  if (find('launchPerfect')) take('launchPerfect');
  if (find('launchEarly')) take('launchEarly');

  const boost = find('boost');
  // 档位抬五个半音，连喷每接一次再抬两个：一串连喷听起来是一条爬上去的音阶。
  if (boost) take('boost', (boost.tier - 1) * 5 + Math.min(boost.chain ?? 0, 4) * 2);

  const wall = find('wall');
  if (wall) take('wall');
  if (find('passed')) take('passed');
  if (find('overtake')) take('overtake');
  if (find('finish')) take('finish');
  if (find('lap')) take('lap');

  const ready = find('ready');
  if (ready) take('ready', (ready.tier - 1) * 4);
  const chain = find('chain');
  if (chain) take('chain', Math.min(chain.chain ?? 1, 5) * 2);
  if (find('fizzle')) take('fizzle');
  // 撞墙那一帧不再补擦碰声：一次碰撞只该有一个声音，取重的那个。
  if (!wall && find('bump')) take('bump');
  if (find('grass')) take('grass');
  if (find('driftStart')) take('driftStart');
  const tier = find('tier');
  if (tier) take('tier', (tier.tier - 1) * 3);
  if (find('deny')) take('deny');

  return picks.slice(0, 4);
}

/** 触觉反馈：只在处境变了的那几个关口给。每个弯都震会变成一路发抖。 */
export const VIBRATION = {
  wall: [50, 30, 50],
  launchEarly: [90],
  launchPerfect: [18, 30, 40],
  boost: [16],
  bigBoost: [26, 20, 34],
  passed: [14, 40, 14],
  overtake: [10, 20, 10],
  ready: [8],
  lap: [12],
  clear: [22, 40, 30],
  win: [22, 50, 22, 50, 40],
  over: [70, 40, 70],
};

export function vibrationFor(effects = []) {
  const mine = effects.filter((effect) => effect.self);
  const find = (type) => mine.find((effect) => effect.type === type);
  if (find('wall')) return VIBRATION.wall;
  if (find('launchEarly')) return VIBRATION.launchEarly;
  if (find('launchPerfect')) return VIBRATION.launchPerfect;
  const boost = find('boost');
  if (boost) return boost.tier >= 3 ? VIBRATION.bigBoost : VIBRATION.boost;
  if (find('passed')) return VIBRATION.passed;
  if (find('overtake')) return VIBRATION.overtake;
  if (find('lap')) return VIBRATION.lap;
  if (find('ready')) return VIBRATION.ready;
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

/** 引擎声的频率／音量映射。纯函数，所以「越快越高、喷射更高」这条能单测。 */
export function engineTone(speed = 0, boosting = false) {
  const freq = 62 + Math.max(0, speed) * 4.4 + (boosting ? 46 : 0);
  const gain = speed < 0.5 ? 0 : 0.016 + 0.03 * Math.min(1, speed / 46) + (boosting ? 0.012 : 0);
  return { freq, gain };
}

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

    notify(effects) {
      const picks = soundsFor(effects);
      for (const pick of picks) this.play(pick.name, { shift: pick.shift });
      return picks.length;
    },

    /**
     * 常驻引擎声。每帧调用，参数变化用 50 毫秒的斜坡跟过去——
     * 直接赋值会在频率跳变处听出「咔咔」，而车速本来就是每帧都在动的。
     */
    setEngine(speed = 0, boosting = false) {
      if (!ensure()) return false;
      const { freq, gain } = engineTone(speed, boosting);
      if (!engine) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const volume = ctx.createGain();
        volume.gain.value = 0;
        osc.connect(filter).connect(volume).connect(master);
        osc.start();
        engine = { osc, volume };
      }
      const at = ctx.currentTime;
      engine.osc.frequency.linearRampToValueAtTime(Math.max(20, freq), at + 0.05);
      engine.volume.gain.linearRampToValueAtTime(gain, at + 0.05);
      return true;
    },

    stopEngine() {
      if (!engine || !ctx) return;
      engine.volume.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    },

    setMuted(next) {
      silent = Boolean(next);
      if (silent && ctx) ctx.suspend().catch(() => {});
      return silent;
    },

    dispose() {
      if (!ctx) return;
      if (engine) {
        try {
          engine.osc.stop();
        } catch {
          // 已经停了就算了，关 context 会把节点一起带走。
        }
        engine = null;
      }
      ctx.close().catch(() => {});
      ctx = null;
      master = null;
      noiseBuffer = null;
    },
  };
}


