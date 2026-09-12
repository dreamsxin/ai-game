// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
//
// 五子棋的音效有一件别的游戏没有的事可做：**这一手的战术含义本来就算好了**。
// game.js 的 `analyzeMoveSituation` 已经在返回 'win' / 'block-win' / 'attack-four' /
// 'block-four' / 'attack-three' / 'block-three'，棋手真正需要知道的就是这个 ——
// 「刚才有人成四了，不应就输」。一律一声「哒」等于把这份信息扔掉。
//
// 还有一层：**同一个战术事实，按落子方不同是相反的情绪**。我成四是喜，AI 成四是危；
// 我挡住了是稳，我的攻势被挡是憋。所以映射同时看 situation 和 player，而不是只看 situation。
//
// 分工照旧：表和 cueFor 是纯的，能在 node 里单测；只有 createAudio 碰 AudioContext 且懒建。
import { AI, HUMAN, analyzeMoveSituation } from './game.js';

const NOTE = {
  E2: 82.41, A2: 110, C3: 130.81, E3: 164.81, A3: 220,
  C4: 261.63, E4: 329.63, A4: 440, C5: 523.25, E5: 659.25, A5: 880,
};

export const SOUNDS = {
  // 落子：人和 AI 两种音色。AI 想完要 300ms 才落，光靠视觉容易漏掉它下在哪。
  stone: { tones: [{ wave: 'triangle', freq: 520, to: 380, dur: 0.07, gain: 0.06 }] },
  stoneAi: { tones: [{ wave: 'triangle', freq: 300, to: 210, dur: 0.09, gain: 0.055 }] },

  // 我成活三：一记上行两音，轻，还不到该紧张的时候。
  three: {
    tones: [
      { wave: 'triangle', freq: NOTE.A3, to: NOTE.A3, dur: 0.08, gain: 0.055 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.14, gain: 0.055, delay: 0.07 },
    ],
  },
  // AI 成活三：同一件事，下行小二度。听起来就是「不太对」。
  warn: {
    tones: [
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C4, dur: 0.08, gain: 0.05 },
      { wave: 'sine', freq: 247, to: 247, dur: 0.16, gain: 0.05, delay: 0.07 },
    ],
  },

  // 我成四：上行三音，全局第二亮的一声。
  four: {
    tones: [
      { wave: 'triangle', freq: NOTE.A3, to: NOTE.A3, dur: 0.08, gain: 0.07 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.08, gain: 0.07, delay: 0.07 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.22, gain: 0.08, delay: 0.14 },
    ],
  },
  // AI 成四：不应就输。做成刺耳的方波颤音，这一声必须让人停下来看棋盘。
  threat: {
    tones: [
      { wave: 'square', freq: NOTE.A3, to: NOTE.A3, dur: 0.1, gain: 0.06 },
      { wave: 'square', freq: NOTE.A3, to: 415, dur: 0.24, gain: 0.06, delay: 0.13 },
    ],
    noise: { dur: 0.1, gain: 0.03, cutoff: 1800, type: 'highpass' },
  },

  // 我挡住了：一记扎实的闷响，「接住了」。
  block: {
    tones: [{ wave: 'sine', freq: NOTE.A2, to: NOTE.A2, dur: 0.18, gain: 0.07 }],
    noise: { dur: 0.08, gain: 0.045, cutoff: 600 },
  },
  // 我的攻势被 AI 挡了：下滑一记，泄气。
  blocked: {
    tones: [{ wave: 'triangle', freq: 330, to: 180, dur: 0.2, gain: 0.055 }],
  },

  win: {
    tones: [
      { wave: 'triangle', freq: NOTE.A3, to: NOTE.A3, dur: 0.45, gain: 0.09 },
      { wave: 'triangle', freq: NOTE.C4, to: NOTE.C4, dur: 0.45, gain: 0.08, delay: 0.08 },
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.5, gain: 0.08, delay: 0.16 },
      { wave: 'sine', freq: NOTE.A4, to: NOTE.A4, dur: 0.65, gain: 0.07, delay: 0.24 },
    ],
  },
  // 输：小三和弦往下塌。不做得难听，输了不该被音效再踩一脚。
  lose: {
    tones: [
      { wave: 'sine', freq: NOTE.A3, to: NOTE.A3, dur: 0.5, gain: 0.07 },
      { wave: 'sine', freq: NOTE.E3, to: NOTE.E3, dur: 0.55, gain: 0.06, delay: 0.1 },
      { wave: 'sine', freq: NOTE.A2, to: NOTE.A2, dur: 0.8, gain: 0.06, delay: 0.2 },
    ],
  },
  draw: {
    tones: [
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C4, dur: 0.4, gain: 0.06 },
      { wave: 'sine', freq: NOTE.C4, to: NOTE.C4, dur: 0.4, gain: 0.05, delay: 0.22 },
    ],
  },

  // 点了下不了的地方。原来这里是静默 return，玩家分不清「没点中」和「不能点」。
  deny: { tones: [{ wave: 'square', freq: 160, to: 110, dur: 0.1, gain: 0.05 }] },
  undo: { tones: [{ wave: 'triangle', freq: 300, to: 460, dur: 0.11, gain: 0.05 }] },
  restart: { tones: [{ wave: 'sine', freq: NOTE.C3, to: NOTE.C4, dur: 0.3, gain: 0.06 }] },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/**
 * 战术含义 → 音色。左边是我方，右边是 AI 方 —— 同一件事两种情绪。
 * `null` 表示这一档不值得单独出声，落回普通落子声。
 */
export const SITUATION_CUES = {
  'win': ['win', 'lose'],
  // 挡掉对方的成五点也是不对称的：我挡是「接住了」，AI 挡走我的胜点是「攻势被截」。
  // 第一版这里写成两边都 'block'，被测试当场抓出来 —— 那等于把最难受的一手做成了安心声。
  'block-win': ['block', 'blocked'],
  'attack-four': ['four', 'threat'],
  'block-four': ['block', 'blocked'],
  'attack-three': ['three', 'warn'],
  'block-three': [null, null],
};


/** 落子声按谁下的分两种音色：AI 落子在延迟之后，听得出来才不会漏看。 */
export const stoneCue = (player) => (player === AI ? 'stoneAi' : 'stone');

/**
 * 这一手该出哪一声。`board` 是**落子之前**的棋盘 —— analyzeMoveSituation 要自己试摆。
 * 拿落子之后的棋盘传进来会一路返回 null（那一格已经不空了），退化成一律「哒」。
 */
export function cueForMove(board, move, player = HUMAN) {
  const situation = analyzeMoveSituation(board, move, player, player === AI ? HUMAN : AI);
  const pair = SITUATION_CUES[situation];
  const index = player === AI ? 1 : 0;
  return pair?.[index] ?? stoneCue(player);
}

/**
 * 一手落完该出的那一声，终局在内。
 * 赢／输那一声已经由 `SITUATION_CUES['win']` 给出，所以这里只需要额外接住平局 ——
 * 平局是「棋盘满了」而不是「这一手怎么样」，它该盖掉落子声。
 * 把这个判断收在一处，就不会出现「落子声 + 终局声」同时响的双响。
 */
export function cueForTurn(board, move, player = HUMAN, result = 'playing') {
  if (result === 'draw') return 'draw';
  return cueForMove(board, move, player);
}


/** 震动只给三个关口：终局、AI 成四、点了下不了的地方。每手都震会麻。 */
export const VIBRATION = {
  win: [30, 50, 30, 50, 60],
  lose: [60, 40, 60],
  draw: [30, 40, 30],
  threat: [26, 30, 26],
  deny: [18],
};

export const vibrationFor = (name) => VIBRATION[name] ?? null;

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

// 最小间隔，秒。只有连点会触发的那几条需要限流，战术声一手一次，不该被吞。
export const THROTTLE = { deny: 0.15, stone: 0.05, stoneAi: 0.05 };

/**
 * 出声的那一半。AudioContext 必须等用户手势才能起，所以全程懒建：
 * 静音状态下一个节点都不建，从头到尾静音下棋就不会有音频线程。
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

  const playTone = (spec, at) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const to = spec.to ?? spec.freq;
    osc.type = spec.wave ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, at);
    if (to !== spec.freq) osc.frequency.exponentialRampToValueAtTime(to, at + spec.dur);
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

    play(name) {
      const spec = SOUNDS[name];
      if (!spec || !ensure()) return false;
      const at = ctx.currentTime;
      const gap = THROTTLE[name];
      if (gap !== undefined && at - (lastAt.get(name) ?? -Infinity) < gap) return false;
      lastAt.set(name, at);
      for (const tone of spec.tones ?? []) playTone(tone, at + (tone.delay ?? 0));
      if (spec.noise) playNoise(spec.noise, at + (spec.noise.delay ?? 0));
      if (!silent) vibrate(vibrationFor(name));
      return true;
    },

    /** 一手棋：棋盘要传**落子之前**的那份。 */
    move(board, position, player, result) {
      return this.play(cueForTurn(board, position, player, result));
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

