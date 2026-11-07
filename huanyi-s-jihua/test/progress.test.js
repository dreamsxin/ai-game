// 进度存档与容错机制的回归测试。
//
// 这些规则直接决定「玩家会不会在第三次失败后关掉页面」：
// 存档解析、解锁只增不减、星级不倒退、重试不刷分、跨章补给有上限。
// 每一条都用纯函数验证，不依赖浏览器。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LIVES,
  START_LIVES,
  CHAPTER_LIFE_BONUS,
} from '../src/game/rules.js';
import { LEVELS, chapterStart, isChapterEnd, levelAt } from '../src/game/levels.js';
import { advance, chooseWing, retryChapter, startGame, step } from '../src/game/simulation.js';
import { EMPTY_INPUT } from '../src/game/input.js';
import {
  emptyProgress,
  loadProgress,
  maxStars,
  mergeProgress,
  parseProgress,
  resumeIndex,
  saveProgress,
  serializeProgress,
  totalStars,
} from '../src/game/progress.js';

const clearAt = (index, extra = {}) => ({
  ...startGame(index, 'J'),
  status: 'clear',
  skipped: false,
  lives: START_LIVES,
  score: 1000,
  baseScore: 400,
  stars: 2,
  ...extra,
});

const fakeStorage = (initial = null) => {
  const data = new Map();
  if (initial !== null) data.set('huanyi-s-jihua:progress', initial);
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: () => data.get('huanyi-s-jihua:progress'),
  };
};

// ——— 解析 ———

test('坏存档一律退回「第一次玩」，而不是让游戏进不去', () => {
  for (const raw of [null, '', '{', 'null', '[]', '42', '"x"', undefined]) {
    const save = parseProgress(raw);
    assert.equal(save.unlocked, 0, `${String(raw)} 该被当成空存档`);
    assert.deepEqual(save.stars, {});
    assert.equal(save.clears, 0);
  }
});

test('存档逐字段校验：脏星级丢掉、超界的关卡夹回去、未知关名不认', () => {
  const save = parseProgress(
    JSON.stringify({
      unlocked: 999,
      clears: -3,
      stars: { '01': 5, '02': 0, '03': 2.4, ZZ: 3, '04': 'x' },
    }),
  );
  assert.equal(save.unlocked, LEVELS.length - 1, '超界的关号夹到最后一关');
  assert.equal(save.clears, 0, '负数通关次数归零');
  assert.deepEqual(save.stars, { '01': 3, '03': 2 }, '只保留 1～3 星、且真实存在的关卡');
});

test('读不到 storage（隐私模式）时返回空存档而不是抛异常', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
  };
  const save = loadProgress(broken);
  assert.equal(save.unlocked, 0);
  assert.deepEqual(save.stars, {});
});

test('存不进 storage 时返回 false，但游戏照常继续', () => {
  const broken = {
    getItem: () => null,
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(saveProgress(emptyProgress(), broken), false);
});

test('写进去再读出来是同一份档案', () => {
  const storage = fakeStorage();
  const progress = mergeProgress(emptyProgress(), clearAt(3));
  assert.equal(saveProgress(progress, storage), true);
  assert.deepEqual(loadProgress(storage), progress);
  assert.equal(JSON.parse(serializeProgress(progress)).unlocked, progress.unlocked);
});

// ——— 解锁与星级 ———

test('过关把解锁往前推一关，星级按历史最高留', () => {
  const first = mergeProgress(emptyProgress(), clearAt(0, { stars: 1 }));
  assert.equal(first.unlocked, 1, '第 1 关打完，下次可以从第 2 关接上');
  assert.equal(first.stars['01'], 1);

  const better = mergeProgress(first, clearAt(0, { stars: 3 }));
  assert.equal(better.stars['01'], 3, '重打三星该覆盖一星');

  const worse = mergeProgress(better, clearAt(0, { stars: 1 }));
  assert.equal(worse.stars['01'], 3, '重打一星不该把三星抹掉');
  assert.equal(worse.unlocked, 1, '解锁只增不减');
});

test('跳关门直接把解锁推到落点，而不是只推一关', () => {
  const state = clearAt(1, { skipped: true, stars: 1 });
  const progress = mergeProgress(emptyProgress(), state);
  assert.equal(progress.unlocked, 5, '第 2 关的门通到第 6 关');
});

test('整部通关：解锁到最后一关，通关次数 +1', () => {
  const last = LEVELS.length - 1;
  const won = { ...clearAt(last), status: 'won', stars: 3 };
  const progress = mergeProgress(emptyProgress(), won);
  assert.equal(progress.unlocked, last);
  assert.equal(progress.clears, 1);
  assert.equal(progress.stars[levelAt(last).key], 3);
});

test('没通关的状态不写档：playing / over 都不该改变进度', () => {
  const progress = mergeProgress(emptyProgress(), clearAt(0));
  const same = mergeProgress(progress, { ...clearAt(0), status: 'over', stars: 0 });
  assert.deepEqual(same, progress);
});

test('继续游戏接着上次过掉的那一关，不退回本章开头重打', () => {
  assert.equal(resumeIndex({ unlocked: 0 }), 0);
  assert.equal(resumeIndex({ unlocked: 7 }), 7, '打完第 7 关就接着第 8 关，而不是回第 5 关');
  assert.equal(resumeIndex({ unlocked: LEVELS.length - 1 }), LEVELS.length - 1);
  assert.equal(resumeIndex({ unlocked: 999 }), LEVELS.length - 1, '超界的进度夹到最后一关');
  assert.equal(resumeIndex(emptyProgress()), 0);
});

test('总星级按关卡累加，上限是全三星', () => {
  const progress = mergeProgress(mergeProgress(emptyProgress(), clearAt(0, { stars: 3 })), clearAt(1, { stars: 2 }));
  assert.equal(totalStars(progress), 5);
  assert.equal(maxStars(), LEVELS.length * 3);
});

// ——— 章节边界 ———

test('章节边界按 chapter 字段算，不靠写死的 4 关', () => {
  assert.equal(chapterStart(0), 0);
  assert.equal(chapterStart(3), 0);
  assert.equal(chapterStart(4), 4);
  assert.equal(chapterStart(LEVELS.length - 1), 12);
  assert.equal(isChapterEnd(3), true);
  assert.equal(isChapterEnd(4), false);
  assert.equal(isChapterEnd(LEVELS.length - 1), true, '最后一关也是本章最后一关');
});

// ——— 跨章补给 ———

test('跨章补一条命：这是「打到第 13 关死在 Boss 手上」的续气，不是难度开关', () => {
  const state = clearAt(3, { lives: 2 });
  const next = advance(state);
  assert.equal(next.levelIndex, 4);
  assert.equal(next.lives, 2 + CHAPTER_LIFE_BONUS);
});

test('同章推进不补命，补给也不会超过上限', () => {
  const same = advance(clearAt(0, { lives: 2 }));
  assert.equal(same.lives, 2, '第 1 章内部推进不该回血');

  const full = advance(clearAt(3, { lives: MAX_LIVES }));
  assert.equal(full.lives, MAX_LIVES, '补到上限就停');
});

// ——— 失败重试 ———

test('失败重试回到本章第一关：分数退回本章起点，命重置，得重新选翼', () => {
  const dead = {
    ...startGame(14, 'C'),
    status: 'over',
    lives: 0,
    score: 5200,
    baseScore: 4800,
    stars: 0,
  };
  const retry = retryChapter(dead);
  assert.equal(retry.levelIndex, 12, '第 15 关属于第 4 章，从第 13 关重来');
  assert.equal(retry.status, 'select', '重来一定包含一次重新挑机翼');
  assert.equal(retry.lives, START_LIVES);
  assert.equal(retry.score, 4800, '分数退回本章起点，重打同一关刷不出新纪录');
  assert.equal(retry.retried, 1);
});

test('重试累计次数但不惩罚：连试三次也只是记个数', () => {
  let state = { ...startGame(9, 'W'), status: 'over', baseScore: 0 };
  for (let i = 1; i <= 3; i += 1) {
    state = retryChapter(state);
    assert.equal(state.retried, i);
    state = { ...state, status: 'over', baseScore: 0 };
  }
  assert.equal(state.levelIndex, 8, '第 10 关属于第 3 章，从第 9 关重来');
});

test('重试后进度存档不受影响：失败不倒退已解锁的关', () => {
  const progress = mergeProgress(emptyProgress(), clearAt(9, { stars: 3 }));
  const retried = retryChapter({ ...startGame(9, 'W'), status: 'over', score: 0, baseScore: 0 });
  assert.deepEqual(mergeProgress(progress, retried), progress);
});

// ——— 战报统计 ———

test('带翼挨打记一次掉翼，裸机挨打记一次掉命，两个数分开算', () => {
  const armed = chooseWing(startGame(0), 'C');
  const hit = (state, wing) => {
    const base = {
      ...state,
      ship: { ...state.ship, wing, tier: wing ? 2 : 1, invuln: 0 },
      foes: [{ id: 999, x: state.ship.x, y: state.ship.y, vx: 0, vy: 0, life: 3, age: 0 }],
      enemies: [],
    };
    return step(base, EMPTY_INPUT, 1 / 60);
  };

  const armedHit = hit(armed, 'C');
  assert.equal(armedHit.wingLosses, 1, '翼被打掉一次');
  assert.equal(armedHit.hits, 1, '总共挨一下');
  assert.equal(armedHit.lives, START_LIVES, '带翼挨打不掉命');

  const bareHit = hit(armedHit, null);
  assert.equal(bareHit.hits, 2, '第二下挨在裸机上');
  assert.equal(bareHit.wingLosses, 1, '这次没有翼可掉');
  assert.equal(bareHit.lives, START_LIVES - 1);
});
