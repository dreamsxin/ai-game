// seed 驱动的确定性 PRNG，是散布抖动、机器人决策的唯一随机来源。
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
    // 均匀落在 [-1, 1]，用来抖散布和机器人瞄准误差。
    signed: () => next() * 2 - 1,
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    // 记录/恢复内部状态，模拟层因此可以把随机源放进不可变的游戏状态里。
    save: () => state,
    load: (value) => {
      state = (value >>> 0) || 0x9e3779b9;
    },
  };
}
