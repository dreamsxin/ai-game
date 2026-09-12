// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 这一关和别的游戏不一样：状态机没有 effects 数组，一次操作只是换出一个新 state。
// 所以派生音效的输入是「前后两个状态」——盖了东西 revision 会涨，走过一个月 month 会涨，
// 被拒绝则只多出一句 notice。这三种情况的声音必须分得开，否则玩家分不清刚才到底成没成。
//
// 分工照旧：SOUNDS 与 soundsFor 是纯数据／纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

import { ROAD, TOOL_BULLDOZE } from '../game/rules.js';

const NOTE = { C3: 130.81, E3: 164.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦错开成琶音。
 * noise 是一层滤波白噪，用来做夯土、碾碎这类质感。
 */
export const SOUNDS = {
  // 铺路：轻的一记刮擦。拖着画路一秒能响十几次，必须轻。
  road: {
    noise: { dur: 0.05, gain: 0.045, cutoff: 2600, type: 'highpass' },
  },
  // 盖房子：夯土的闷响，比铺路实在得多——花的钱也多得多。
  build: {
    tones: [{ wave: 'sine', freq: 170, to: 95, dur: 0.13, gain: 0.13 }],
    noise: { dur: 0.1, gain: 0.07, cutoff: 800 },
  },
  // 拆迁：碾碎，比盖起来更「散」。
  bulldoze: {
    tones: [{ wave: 'square', freq: 130, to: 70, dur: 0.14, gain: 0.1 }],
    noise: { dur: 0.16, gain: 0.09, cutoff: 1800 },
  },
  // 钱不够／位置不合法：闷的下滑。这是建造类游戏里最常听到的一声，不能刺耳。
  reject: {
    tones: [{ wave: 'square', freq: 175, to: 105, dur: 0.11, gain: 0.09 }],
  },
  // 月历翻页：极轻的一点，两秒多才响一次，用来给时间一个脉搏。
  month: {
    noise: { dur: 0.025, gain: 0.03, cutoff: 4800, type: 'highpass' },
  },
  // 有人迁入：上行两音，这是这游戏唯一真正的「好消息」。
  growth: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.08, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.14, gain: 0.09, delay: 0.06 },
    ],
  },
  // 有人搬走：把上面那两音反过来。
  exodus: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.08, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.2, gain: 0.1, delay: 0.06 },
    ],
  },
  // 本月赤字：短促的双敲警示，比搬走更急。
  deficit: {
    tones: [
      { wave: 'square', freq: 300, to: 300, dur: 0.07, gain: 0.09 },
      { wave: 'square', freq: 240, to: 240, dur: 0.12, gain: 0.09, delay: 0.1 },
    ],
  },
  // 全城跳闸：低频嗡鸣，一听就知道是最严重的那一档。
  blackout: {
    tones: [
      { wave: 'sawtooth', freq: 110, to: 84, dur: 0.5, gain: 0.12 },
      { wave: 'sawtooth', freq: 55, to: 42, dur: 0.5, gain: 0.08 },
    ],
  },
  // 破产：长长的下坠，和跳闸的持续嗡鸣分得开。
  lost: {
    tones: [
      { wave: 'sawtooth', freq: NOTE.E3, to: NOTE.E3, dur: 0.22, gain: 0.11 },
      { wave: 'sawtooth', freq: NOTE.C3, to: NOTE.C3, dur: 0.6, gain: 0.12, delay: 0.18 },
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

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

/** 落子声按工具分：铺路最轻，盖房夯实，拆迁碾碎。 */
export const placeSound = (tool) => {
  if (tool === TOOL_BULLDOZE) return 'bulldoze';
  return tool === ROAD ? 'road' : 'build';
};

/**
 * 月报里最该被听见的那一档。和 monthLine 念的是同一条优先级：
 * 跳闸和搬离比「又收了几块钱」重要，涨人口垫底但仍要给个好消息。
 */
export function monthSound(report = {}) {
  if (report.powered === false && report.demand > 0) return 'blackout';
  if (report.growth < 0) return 'exodus';
  if (report.net < 0) return 'deficit';
  if (report.growth > 0) return 'growth';
  return null;
}

/**
 * 前后两个状态该出哪些声音，按播放顺序返回音名。
 * 这一关没有 effects 数组，所以判据是三个计数器：
 * status 变了是结算，month 涨了是走过一个月，revision 涨了是真盖上了东西，
 * 都没涨却多出一句 notice 就是被拒了。
 */
export function soundsFor(prev, next) {
  if (!prev || !next || prev === next) return [];
  // 换关或重开会把月份和 revision 归零，这时不该把上一关的结算音再放一遍。
  // 用计数器倒退来判，比比对 level 对象引用可靠：restartLevel 换的是同一个 level。
  if (next.levelIndex !== prev.levelIndex) return [];
  if (next.month < prev.month || next.revision < prev.revision) return [];


  if (next.status !== prev.status) {
    if (next.status === 'won') return [winSound(next.stars)];
    if (next.status === 'lost') return ['lost'];
  }
  if (next.month > prev.month) {
    const news = monthSound(next.report);
    return news ? ['month', news] : ['month'];
  }
  if (next.revision > prev.revision) return [placeSound(prev.tool)];
  if (next.notice && next.notice !== prev.notice) return ['reject'];
  return [];
}

/** 触觉反馈：只在被拒、跳闸、结算这几个关口给。每盖一格都震会变成噪音。 */
export const VIBRATION = {
  reject: [18],
  blackout: [40, 30, 40],
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
  if (names.includes('blackout')) return VIBRATION.blackout;
  if (names.includes('reject')) return VIBRATION.reject;
  return null;
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

    /** 月历那一点和后面的月报错开一点排，两声挤在一起会听成一声。 */
    notify(prev, next) {
      const names = soundsFor(prev, next);
      names.forEach((name, index) => this.play(name, index * 0.07));
      return names.length;
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




