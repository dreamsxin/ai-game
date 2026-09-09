// 确定性随机源。程序生成必须可复现：同一 seed 必须给出同一张图，
// 否则分享、复盘和问题定位都无从谈起。全局 Math.random 一律禁用。

// mulberry32：状态只有 32 位，实现短、分布够用、跨环境结果一致。
export function createRandom(seed = 1) {
  // 归一化到 32 位无符号，负数与小数种子也能稳定工作
  let state = Math.floor(Math.abs(Number(seed) || 1)) >>> 0;
  if (state === 0) state = 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// 便捷取值器。都从同一个 next 消费，因此调用顺序即是随机序列的一部分——
// 生成器里绝不能按条件跳过取值，否则不同分支会错开序列。
export function createRng(seed) {
  const next = createRandom(seed);
  const rng = {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
    // Fisher-Yates，就地打乱副本
    shuffle: (list) => {
      const copy = [...list];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
      }
      return copy;
    },
  };
  return rng;
}
