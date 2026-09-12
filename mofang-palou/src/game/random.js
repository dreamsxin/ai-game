// seed 驱动的确定性 PRNG，是程序生成的唯一随机来源。
// 无尽模式里每座塔的 seed 都存在状态里，所以「重开这一座」能开出一模一样的塔。
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
