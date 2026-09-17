// 确定性随机。发车顺位、对手性格的抖动、赛道装饰都走这里，
// 这样「同一关 + 同一串输入」跑出来逐字段一致，机器人通关测试才有意义。

export function createRandom(seed = 1) {
  let state = (seed | 0) || 1;
  const next = () => {
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
