import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, hasNextLevel, levelAt, levelCount, levelKinds } from '../src/game/levels.js';
import { KINDS } from '../src/game/tiles.js';

test('关卡表非空且编号连续', () => {
  assert.ok(LEVELS.length >= 3);
  LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1, '关卡编号应与顺序一致');
  });
});

test('每关的步数、目标和星级门槛都合法', () => {
  for (const level of LEVELS) {
    assert.ok(level.moves > 0, `${level.name} 应该有步数`);
    assert.ok(level.target > 0, `${level.name} 应该有目标分`);
    assert.equal(level.stars.length, 3, `${level.name} 需要三档星级`);
    assert.equal(level.stars[0], level.target, `${level.name} 一星门槛就是过关目标`);
    assert.ok(level.stars[1] > level.stars[0] && level.stars[2] > level.stars[1], '星级门槛应递增');
    assert.ok(level.kinds >= 4 && level.kinds <= KINDS.length, `${level.name} 果实种类超出范围`);
  }
});

test('难度随关卡递进', () => {
  for (let i = 1; i < LEVELS.length; i += 1) {
    assert.ok(LEVELS[i].target > LEVELS[i - 1].target, '后面的关卡目标分应更高');
    assert.ok(LEVELS[i].kinds >= LEVELS[i - 1].kinds, '果实种类不应变少');
  }
});

test('取关卡会把越界索引夹回范围内', () => {
  assert.equal(levelAt(-3).id, 1);
  assert.equal(levelAt(999).id, levelCount);
});

test('关卡果实种类取前 N 种', () => {
  assert.deepEqual(levelKinds({ kinds: 4 }), KINDS.slice(0, 4));
  assert.deepEqual(levelKinds({ kinds: 99 }), KINDS, '超出总数时用全部果实');
});

test('最后一关没有下一关', () => {
  assert.ok(hasNextLevel(0));
  assert.equal(hasNextLevel(levelCount - 1), false);
});
