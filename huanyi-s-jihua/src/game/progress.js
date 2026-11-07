// 本地进度存档：只记「打到哪里、每关几星、通关几次」。
//
// 为什么需要它：16 关一局十几分钟，网页版刷新一下、手机切后台被系统回收，
// 进度就全没了——这是最致命的一处漏水。街机时代靠投币续命，
// 网页版只能靠存档把「这一段旅程」接住。
//
// 存档**不记局内状态**（弹幕位置、血量、机翼阶级）：那些东西存下来，
// 「一命到底」的紧张感就一起被存下来了。它只回答一个问题——下次从哪一关开始。
//
// 这一层是纯函数，存储用注入的 storage，所以测试不用真浏览器也能守住全部规则。

import { LEVELS, levelAt, skipTarget } from './levels.js';

export const PROGRESS_KEY = 'huanyi-s-jihua:progress';
export const PROGRESS_VERSION = 1;

const clampInt = (value, low, high) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return low;
  return Math.min(high, Math.max(low, number));
};

export const emptyProgress = () => ({
  version: PROGRESS_VERSION,
  unlocked: 0,
  stars: {},
  clears: 0,
});

/**
 * 解析存档。任何一处坏了都退回「没存档」，而不是抛异常——
 * 玩家不该因为一条脏数据就进不去游戏。逐字段校验，能救的救回来：
 * 星级只认 1～3 的整数、关卡只认真正存在的 key。
 */
export function parseProgress(raw) {
  const empty = emptyProgress();
  if (typeof raw !== 'string' || !raw) return empty;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return empty;

  const valid = new Set(LEVELS.map((level) => level.key));
  const stars = {};
  const source = data.stars && typeof data.stars === 'object' && !Array.isArray(data.stars) ? data.stars : {};
  for (const [key, value] of Object.entries(source)) {
    const star = clampInt(value, 0, 3);
    if (valid.has(key) && star > 0) stars[key] = star;
  }

  return {
    version: PROGRESS_VERSION,
    unlocked: clampInt(data.unlocked, 0, LEVELS.length - 1),
    stars,
    clears: clampInt(data.clears, 0, 9999),
  };
}

export const serializeProgress = (progress) => JSON.stringify(progress);

/**
 * 过关之后合并进度。三条不变量：
 * 1. unlocked 只增不减——重打旧关不能把进度往回拨；
 * 2. 每关星级取历史最高，打完一星不会把之前的三星盖掉；
 * 3. clears 只在整部通关时 +1，跳关通关也算通关。
 */
export function mergeProgress(progress, state) {
  if (state.status !== 'clear' && state.status !== 'won') return progress;
  const base = { ...emptyProgress(), ...progress };
  const key = levelAt(state.levelIndex).key;
  const stars = { ...base.stars };
  const earned = clampInt(state.stars, 0, 3);
  if (earned > 0) stars[key] = Math.max(stars[key] ?? 0, earned);

  const reached =
    state.status === 'won'
      ? LEVELS.length - 1
      : state.skipped
        ? skipTarget(state.levelIndex)
        : Math.min(state.levelIndex + 1, LEVELS.length - 1);

  return {
    ...base,
    unlocked: Math.max(base.unlocked ?? 0, reached),
    stars,
    clears: (base.clears ?? 0) + (state.status === 'won' ? 1 : 0),
  };
}

/**
 * 继续游戏从哪一关落：直接接着「上次过掉的那一关」。
 * 不退回本章开头——打完第 8 关再回来重打第 5～8 关，那比丢进度更劝退。
 * 落点若不是章首（机制上不能选翼），表现层会替它带上这一关的推荐机翼。
 */
export const resumeIndex = (progress) => clampInt(progress?.unlocked ?? 0, 0, LEVELS.length - 1);

export const totalStars = (progress) =>
  Object.values(progress?.stars ?? {}).reduce((sum, value) => sum + clampInt(value, 0, 3), 0);

export const maxStars = () => LEVELS.length * 3;

export function loadProgress(storage = globalThis.localStorage) {
  try {
    return parseProgress(storage?.getItem(PROGRESS_KEY));
  } catch {
    // 隐私模式下连读都可能抛，那就当第一次玩。
    return emptyProgress();
  }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PROGRESS_KEY, serializeProgress(progress));
    return true;
  } catch {
    // 存不下（隐身模式、配额满）不该影响这一局，只是下次还得从头来。
    return false;
  }
}
