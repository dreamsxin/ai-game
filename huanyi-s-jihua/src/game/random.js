// 确定性随机：波次的横向站位、掉落的机翼型号都走这里。
// 用 seed 而不是 Math.random，是为了让「同一关加同一串输入」跑出逐字段一致的结果——
// simulation.test.js 和 playthrough.test.js 都靠这条成立。

export function createRandom(seed = 1) {
  let state = (seed | 0) || 1;
  const next = () => {
    // xorshift32：够散、够快，而且没有浮点误差累积。
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return (state >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low, high) => low + next() * (high - low),
    int: (low, high) => low + Math.floor(next() * (high - low + 1)),
    pick: (list) => list[Math.floor(next() * list.length) % list.length],
    chance: (p) => next() < p,
  };
}
