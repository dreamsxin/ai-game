// seed 驱动的确定性 PRNG，是整张城市地图唯一的随机来源。
// 同一个 seed 必须长出同一座城，所以生成链路上不许出现 Math.random。
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
  };
}

/** 把任意字符串折成 32 位整数：用户在输入框里敲城市名也能当 seed 用。 */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
