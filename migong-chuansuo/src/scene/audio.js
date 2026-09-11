// 程序化音效：不引任何音频文件，全部用 WebAudio 现场合成。
// 体素画面配合成音色本来就对味，省下的是几百 KB 资源和一套加载失败的分支。
//
// 分工和渲染层一样：SOUNDS 与 soundsFor 是纯数据/纯函数，能单测；
// createAudio 才碰 AudioContext，且只在第一次真正要出声时才建。

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, G4: 392, E4: 329.63 };

/**
 * 音色表。一条音 = 一个振荡器加一段包络：
 * freq→to 是滑音，dur 是时长，gain 是峰值，delay 让和弦能错开成琶音。
 * noise 是一层低通白噪，用来给「砖块落位」这类动作加质感。
 */
export const SOUNDS = {
  // 推移：下滑的方波像石砖擦过，尾巴上补一记闷响当落位。
  shift: {
    tones: [{ wave: 'square', freq: 190, to: 120, dur: 0.14, gain: 0.16 }],
    noise: { dur: 0.12, gain: 0.1, cutoff: 900 },
  },
  // 路通了：上行琶音，和「blocked」的下滑正好相反，闭着眼也能听出成败。
  open: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.13, gain: 0.13, delay: 0.02 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.13, gain: 0.13, delay: 0.09 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.2, gain: 0.14, delay: 0.16 },
    ],
  },
  // 推不动：短促下滑，别做成刺耳的错误音——这是解谜里最常听到的一声。
  blocked: {
    tones: [{ wave: 'square', freq: 150, to: 88, dur: 0.16, gain: 0.14 }],
    noise: { dur: 0.06, gain: 0.05, cutoff: 500 },
  },
  walk: {
    tones: [{ wave: 'sine', freq: 320, to: 380, dur: 0.08, gain: 0.09 }],
  },
  // 跨层跃迁：一路往上滑，听着就像被垫子弹上去。
  warp: {
    tones: [{ wave: 'sine', freq: 420, to: 900, dur: 0.24, gain: 0.12 }],
  },
  undo: {
    tones: [{ wave: 'sine', freq: 300, to: 200, dur: 0.13, gain: 0.1 }],
  },
  hint: {
    tones: [
      { wave: 'triangle', freq: 700, to: 700, dur: 0.08, gain: 0.09 },
      { wave: 'triangle', freq: 950, to: 950, dur: 0.12, gain: 0.09, delay: 0.07 },
    ],
  },
  select: {
    tones: [{ wave: 'triangle', freq: 520, to: 520, dur: 0.06, gain: 0.07 }],
  },
  layer: {
    tones: [{ wave: 'sine', freq: 260, to: 340, dur: 0.1, gain: 0.09 }],
  },
  restart: {
    tones: [{ wave: 'sine', freq: 220, to: 165, dur: 0.18, gain: 0.1 }],
  },
  // 通关：星数越多，和弦越长越亮。一星也要是个好听的收尾，通关本身不该被判失败。
  win1: {
    tones: [
      { wave: 'triangle', freq: NOTE.E4, to: NOTE.E4, dur: 0.16, gain: 0.13 },
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.3, gain: 0.13, delay: 0.13 },
    ],
  },
  win2: {
    tones: [
      { wave: 'triangle', freq: NOTE.G4, to: NOTE.G4, dur: 0.15, gain: 0.13 },
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.15, gain: 0.13, delay: 0.12 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.34, gain: 0.14, delay: 0.24 },
    ],
  },
  win3: {
    tones: [
      { wave: 'triangle', freq: NOTE.C5, to: NOTE.C5, dur: 0.15, gain: 0.14 },
      { wave: 'triangle', freq: NOTE.E5, to: NOTE.E5, dur: 0.15, gain: 0.14, delay: 0.11 },
      { wave: 'triangle', freq: NOTE.G5, to: NOTE.G5, dur: 0.18, gain: 0.14, delay: 0.22 },
      { wave: 'triangle', freq: NOTE.C6, to: NOTE.C6, dur: 0.46, gain: 0.15, delay: 0.33 },
      { wave: 'sine', freq: NOTE.G5, to: NOTE.C6, dur: 0.46, gain: 0.08, delay: 0.33 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/** 通关和弦按星数选。星数缺失时按一星给，宁可少报也不静默。 */
export const winSound = (stars) => `win${Math.max(1, Math.min(3, stars || 1))}`;

const crossesLayer = (path = []) => path.some((step) => step.layer !== path[0].layer);

/**
 * 一批 effects 该出哪些声音。和 effectMessage 一样是纯派生，
 * 但这里可以返回多条：推完就通了要「推移声 + 通路声」两声都给。
 *
 * 通关和弦不在这里：它得等角色真的走到出口再响，由 winSound 单独取。
 */
export function soundsFor(effects = []) {
  const type = (name) => effects.find((effect) => effect.type === name);
  const names = [];
  const walk = type('walk');
  if (walk) names.push(crossesLayer(walk.path) ? 'warp' : 'walk');
  if (type('shift')) names.push('shift');
  // 通关那一刻的「通了」由结算和弦代言，这里让位。
  if (type('open') && !type('won')) names.push('open');
  if (type('blocked')) names.push('blocked');
  if (type('undo')) names.push('undo');
  if (type('layer')) names.push('layer');
  if (type('select')) names.push('select');
  return names;
}



/** 触觉反馈：只在「成」和「不成」两个关口给，到处都震会变成噪音。 */
export const VIBRATION = {
  blocked: [18],
  open: [12, 40, 12],
  win: [22, 50, 22, 50, 40],
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
 * 通关的那一串和结算和弦一样要等走位走完，所以不从这里出——见 VIBRATION.win。
 */
export function vibrationFor(effects = []) {
  const has = (name) => effects.some((effect) => effect.type === name);
  if (has('won')) return null;
  if (has('open')) return VIBRATION.open;
  if (has('blocked')) return VIBRATION.blocked;
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
      const length = Math.floor(ctx.sampleRate * 0.3);
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
    filter.type = 'lowpass';
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

    /** 一批声音顺次排开，别让推移声和通路声挤在同一毫秒里糊成一团。 */
    playAll(names = []) {
      names.forEach((name, index) => this.play(name, index * 0.06));
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


