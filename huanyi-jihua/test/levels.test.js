import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS,
  LEVELS,
  bossAt,
  briefing,
  canSelect,
  levelAt,
  levelCount,
  skipTarget,
} from '../src/game/levels.js';
import { WEAKNESS, WEAKNESS_KINDS, WING_CODES, recommendedWing } from '../src/game/wings.js';
import { bossPatterns } from '../src/game/boss.js';

test('16 关分 4 章，每章 4 关，关号连续', () => {
  assert.equal(levelCount, 16);
  assert.equal(CHAPTERS.length, 4);
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.key, String(index + 1).padStart(2, '0'), `第 ${index + 1} 关的关号不对`);
    assert.equal(level.chapter, Math.floor(index / 4), `第 ${index + 1} 关的章节不对`);
    assert.ok(level.name.length > 0);
  }
});

test('只有每章第一关能在开打前挑机翼——中途换翼只能靠打运载火箭', () => {
  for (const [index, level] of LEVELS.entries()) {
    const first = index % 4 === 0;
    assert.equal(Boolean(level.select), first, `第 ${index + 1} 关的选翼资格不对`);
    assert.equal(canSelect(index), first);
  }
});

test('跳关门开在第 4n+2 关，跳过去正好省 4 关', () => {
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(Boolean(level.skip), index % 4 === 1, `第 ${index + 1} 关的跳关门不对`);
  }
  assert.equal(skipTarget(1), 5, '第 2 关的门通到第 6 关');
  assert.equal(skipTarget(13), 15, '最后一道门只能跳到终点关，不能跳出关卡表');
  assert.equal(skipTarget(0), 1, '没门的关卡就是老老实实下一关');
});

test('每一关都有波次和 Boss，Boss 出场在最后一波之后', () => {
  for (const [index, level] of LEVELS.entries()) {
    assert.ok(level.waves.length >= 3, `第 ${index + 1} 关的波次太少`);
    const last = Math.max(...level.waves.map((item) => item.at));
    assert.ok(bossAt(level) > last, `第 ${index + 1} 关的 Boss 抢在杂兵前面出场了`);
    assert.ok(WEAKNESS_KINDS.includes(level.boss.weak), `第 ${index + 1} 关的弱点类型不认识`);
    assert.ok(bossPatterns.includes(level.boss.pattern), `第 ${index + 1} 关的走位套路不认识`);
    assert.ok(level.boss.hp > 0);
  }
});

test('波次时间递增，运载火箭都带着一种真实存在的机翼', () => {
  for (const [index, level] of LEVELS.entries()) {
    for (let i = 1; i < level.waves.length; i += 1) {
      assert.ok(level.waves[i].at > level.waves[i - 1].at, `第 ${index + 1} 关的波次时间没有递增`);
    }
    for (const item of level.waves) {
      if (item.kind !== 'carrier') continue;
      assert.ok(item.wing, `第 ${index + 1} 关有运载火箭没装机翼`);
      assert.ok(level.wingDrops.includes(item.wing), `第 ${index + 1} 关的掉落表没写上 ${item.wing}`);
    }
  }
});

test('每一关的关卡简报都指向一个选得到、也真打得进去的机翼', () => {
  for (let index = 0; index < levelCount; index += 1) {
    const brief = briefing(index);
    assert.equal(brief.boss, levelAt(index).boss.name);
    assert.ok(brief.label && brief.hint, `第 ${index + 1} 关的情报缺文案`);
    assert.ok(WING_CODES.includes(brief.pick));
    assert.equal(brief.pick, recommendedWing(levelAt(index).boss.weak));
  }
});

test('难度按章递增：每一章的 Boss 目标时长都比上一章长', () => {
  const perChapter = CHAPTERS.map((_, chapter) =>
    LEVELS.filter((level) => level.chapter === chapter).reduce((sum, level) => sum + level.boss.ttk, 0),
  );
  for (let i = 1; i < perChapter.length; i += 1) {
    assert.ok(perChapter[i] > perChapter[i - 1], `第 ${i + 1} 章没有比上一章更难`);
  }
});

test('四种弱点都要出现，不能整局只考一道题', () => {
  const seen = new Set(LEVELS.map((level) => level.boss.weak));
  for (const kind of WEAKNESS_KINDS) assert.ok(seen.has(kind), `没有一关考 ${kind}`);
});

test('有硬性解法的关卡，掉落表里一定有那把钥匙——跳关来的人不至于无解', () => {
  for (const [index, level] of LEVELS.entries()) {
    const keys = WEAKNESS[level.boss.weak].keys;
    // 生物系 Boss 没有装甲，什么都打得动，不需要指定钥匙。
    if (keys.length >= WING_CODES.length) continue;
    const found = level.wingDrops.some((code) => keys.includes(code));
    assert.ok(
      found,
      `第 ${index + 1} 关只吃 ${keys.join('/')}，但这一关一个都捡不到`,
    );
  }
});
