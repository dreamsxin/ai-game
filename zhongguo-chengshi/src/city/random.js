// 确定性随机数：同一个种子必须永远生成同一座城市，否则参数面板的对照实验就没有意义。
export function hashSeed(input) {
  const text = String(input);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRandom(seed) {
  let state = hashSeed(seed) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** [min, max) 之间的浮点数 */
    range: (min, max) => min + (max - min) * next(),
    /** [min, max] 之间的整数 */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** 概率为 p 的布尔值 */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** 中心偏置：绝大多数取值落在中间，用来做「大部分楼差不多高、偶尔冒一栋」的效果 */
    bell: () => (next() + next() + next()) / 3,
    /** 加权抽取，weights 与 list 等长 */
    weighted: (list, weights) => {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return list[0];
      let roll = next() * total;
      for (let i = 0; i < list.length; i += 1) {
        roll -= Math.max(0, weights[i]);
        if (roll <= 0) return list[i];
      }
      return list[list.length - 1];
    },
  };
}

// 二维值噪声：地形起伏、密度扰动都靠它，比 Perlin 简单但足够拉开山城和平原的差别。
export function createNoise2D(seed) {
  const base = hashSeed(seed);
  const hash = (x, y) => {
    let h = base ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);

  const value = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };

  /** 分形叠加，octaves 越多山脊越碎 */
  const fractal = (x, y, octaves = 4, gain = 0.5, lacunarity = 2) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i += 1) {
      sum += value(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  };

  /** 山脊噪声：把噪声折起来，做出重庆那种连续山脊线 */
  const ridge = (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i += 1) {
      const n = 1 - Math.abs(value(fx, fy) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2.07;
      fy *= 2.03;
    }
    return sum / norm;
  };

  return { value, fractal, ridge };
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
