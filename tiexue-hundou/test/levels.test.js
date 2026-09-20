import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_ROW, LEVELS, LEVEL_ROWS, levelAt, levelCount, levelStats } from '../src/game/levels.js';
import { isSolid, isPlatform, parseLevel } from '../src/game/tiles.js';

test('八关，每关都有出生点和关末那台机器', () => {
  assert.equal(levelCount, 8);
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    assert.ok(parsed.boss, `${level.key} 没有 Boss`);
    assert.ok(parsed.spawn.x < 6, `${level.key} 的出生点应该在最左边`);
    assert.ok(parsed.pods.length >= 1, `${level.key} 至少要有一个补给箱`);
    assert.equal(level.rows.length, LEVEL_ROWS);
  }
});

test('难度曲线：兵力和炮台一路不降，Boss 血量一路走高', () => {
  const stats = LEVELS.map(levelStats);
  for (let i = 1; i < stats.length; i += 1) {
    assert.ok(
      stats[i].troops >= stats[i - 1].troops,
      `第 ${i + 1} 关的兵力反而少了：${stats[i - 1].troops} → ${stats[i].troops}`,
    );
    assert.ok(
      stats[i].turrets >= stats[i - 1].turrets,
      `第 ${i + 1} 关的炮台反而少了：${stats[i - 1].turrets} → ${stats[i].turrets}`,
    );
    assert.ok(
      stats[i].bossHp > stats[i - 1].bossHp,
      `第 ${i + 1} 关的 Boss 反而更软：${stats[i - 1].bossHp} → ${stats[i].bossHp}`,
    );
    assert.ok(stats[i].width >= stats[i - 1].width, `第 ${i + 1} 关反而更短了`);
    assert.ok(LEVELS[i].time >= LEVELS[i - 1].time, `第 ${i + 1} 关的限时反而更紧了`);
  }
  assert.ok(stats[7].troops > stats[0].troops * 1.5, '最后一关的兵力应该明显比第一关多');
});

test('坑不超过 3 格宽：跳得过去才算设计，跳不过去只是刁难', () => {
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    const row = parsed.grid[GROUND_ROW];
    let run = 0;
    for (let col = 0; col < row.length; col += 1) {
      const solidHere = isSolid(row[col]) || isPlatform(row[col]);
      run = solidHere ? 0 : run + 1;
      assert.ok(run <= 3, `${level.key} 在 x=${col} 附近有一个 ${run} 格宽的坑`);
    }
  }
});

test('每一格兵和补给箱脚下都有能站的面，不会悬空', () => {
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    for (const spot of [...parsed.enemies, ...parsed.pods]) {
      let found = false;
      for (let row = spot.y + 1; row < LEVEL_ROWS && !found; row += 1) {
        const tile = parsed.grid[row][spot.x];
        if (isSolid(tile) || isPlatform(tile)) found = true;
      }
      assert.ok(found, `${level.key} 在 (${spot.x}, ${spot.y}) 的布点悬空了`);
    }
  }
});

test('取关卡会把序号夹在范围内', () => {
  assert.equal(levelAt(-3).key, LEVELS[0].key);
  assert.equal(levelAt(99).key, LEVELS[levelCount - 1].key);
});
