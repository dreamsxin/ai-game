// 关卡表。八条赛道的难度必须是**单调**的：弯越来越密、路越来越窄、圈数和对手越来越多、
// 名次门槛越来越紧。这些条件里任何一条被改反了，玩家都会在中途撞上一堵墙，
// 而人肉试玩很难发现「第 5 关其实比第 6 关难」这种事。

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, buildLevel, levelCourse, starsFor } from '../src/game/tracks.js';

test('关卡表结构完整，key 不重复', () => {
  assert.equal(LEVEL_COUNT, LEVELS.length);
  assert.equal(new Set(LEVELS.map((level) => level.key)).size, LEVEL_COUNT);
  for (const level of LEVELS) {
    assert.ok(level.name && level.tint, `${level.key} 缺名字或配色`);
    assert.ok(level.laps >= 2 && level.rivals >= 3);
    assert.ok(level.qualify >= 1 && level.qualify <= level.rivals);
  }
});

test('弯道密度一路走高，路面一路收窄', () => {
  for (let i = 1; i < LEVEL_COUNT; i += 1) {
    const prev = levelCourse(i - 1);
    const next = levelCourse(i);
    assert.ok(
      next.meanCurv > prev.meanCurv,
      `第 ${i + 1} 关（${LEVELS[i].name}）平均曲率 ${next.meanCurv.toFixed(4)} 没超过上一关 ${prev.meanCurv.toFixed(4)}`,
    );
    assert.ok(next.minRadius < prev.minRadius, `第 ${i + 1} 关最紧的弯没有更紧`);
    assert.ok(LEVELS[i].width <= LEVELS[i - 1].width, `第 ${i + 1} 关的路面反而更宽`);
  }
});

test('圈数、对手数、对手档位只增不减，名次门槛只紧不松', () => {
  for (let i = 1; i < LEVEL_COUNT; i += 1) {
    const prev = LEVELS[i - 1];
    const next = LEVELS[i];
    assert.ok(next.laps >= prev.laps, `第 ${i + 1} 关圈数变少了`);
    assert.ok(next.rivals >= prev.rivals, `第 ${i + 1} 关对手变少了`);
    assert.ok(next.rivalSkill > prev.rivalSkill, `第 ${i + 1} 关对手档位没提高`);
    assert.ok(next.qualify <= prev.qualify, `第 ${i + 1} 关名次门槛反而松了`);
  }
  assert.equal(LEVELS[LEVEL_COUNT - 1].qualify, 1, '最后一关该是冠军才算过');
});

test('时限是按赛道长度反推的，改宽改弯不用回来对时间', () => {
  for (let i = 0; i < LEVEL_COUNT; i += 1) {
    const level = buildLevel(i);
    const distance = level.course.length * level.laps;
    // 平均 15 m/s 就能过线，而抓地上限是 34：时限惩罚的是一路冲进草地，不是慢了一点。
    assert.ok(level.time > distance / 34, `第 ${i + 1} 关时限 ${level.time}s 连全速跑完都不够`);
    assert.ok(level.time < distance / 10, `第 ${i + 1} 关时限 ${level.time}s 太宽松，等于没有时限`);
  }
});

test('赛道几何只算一次：同一关拿到的是同一个对象', () => {
  assert.equal(levelCourse(3), levelCourse(3));
  assert.equal(buildLevel(3).course, levelCourse(3));
});

test('名次换星星：冠军三星，亚军两星，达标至少一星', () => {
  assert.equal(starsFor(1), 3);
  assert.equal(starsFor(2), 2);
  assert.equal(starsFor(3), 1);
  assert.equal(starsFor(6), 1);
});
