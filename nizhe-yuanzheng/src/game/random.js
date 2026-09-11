// seed 驱动的确定性 PRNG，是地形生成的唯一随机来源。
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))],
    // Fisher-Yates 就地洗牌，调用方传副本进来。
    shuffle: (list) => {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
  };
}

// 格点散列。地形噪声要能按坐标随机寻址，不能靠顺序推进的 PRNG。
export function hash2(seed, ix, iy) {
  let h = (seed ^ 0x27d4eb2d) >>> 0;
  h = (Math.imul(h ^ (ix | 0), 0x9e3779b1) ^ Math.imul(iy | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** 双线性 + smoothstep 的值噪声，格距为 1。 */
export function valueNoise(seed, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1);
  const d = hash2(seed, ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** 分形叠加，返回 0..1。octaves 越多细节越碎，地形只需要 4 层。 */
export function fbm(seed, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let freq = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(seed + octave * 1013, x * freq, y * freq) * amplitude;
    total += amplitude;
    amplitude *= gain;
    freq *= lacunarity;
  }
  return sum / total;
}

// FNV-1a 散列日期串，不读时钟，方便测试。
export function dailySeed(dateKey) {
  let hash = 2166136261;
  for (let index = 0; index < dateKey.length; index += 1) {
    hash ^= dateKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const dateKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
