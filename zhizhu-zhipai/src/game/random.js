// 可存档的 PRNG：同一个 seed 加同一串操作，牌局逐字段一致。
// xorshift32，够随机也够快，状态就一个 32 位整数，能直接塞进存档。
export function createRandom(seed = 1) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  return {
    next,
    /** [0, 1) */
    unit: () => next() / 4294967296,
    /** 含两端的整数 */
    int: (min, max) => min + (next() % (max - min + 1)),
    /** Fisher–Yates，原地洗一份拷贝，不动入参。 */
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = next() % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    save: () => state,
    load: (value) => {
      state = (value >>> 0) || 1;
    },
  };
}
