// 关卡表与场地生成的测试。守的是「任何一张图都能开局、能走通、难度不倒挂」。

import test from 'node:test';
import assert from 'node:assert/strict';
import { H, TILE, W, key } from '../src/game/rules.js';
import { LEVELS, SPAWNS, buildLevel, reachable, safeCells } from '../src/game/maps.js';

const seeds = [1, 7, 42, 99, 1234];

test('每张图的四个出生角都互相到得了', () => {
  for (const level of LEVELS) {
    for (const seed of seeds) {
      const { grid } = buildLevel(level, seed);
      const seen = reachable(grid, SPAWNS[0]);
      for (const spawn of SPAWNS) {
        assert.ok(
          seen.has(key(spawn.cx, spawn.cy)),
          `${level.name}（seed ${seed}）把 (${spawn.cx},${spawn.cy}) 封死了`,
        );
      }
    }
  }
});

test('出生区的十字五格永远是空地', () => {
  const safe = safeCells();
  for (const level of LEVELS) {
    for (const seed of seeds) {
      const { grid } = buildLevel(level, seed);
      for (const at of safe) {
        assert.equal(grid[at], TILE.FLOOR, `${level.name}（seed ${seed}）在出生区放了东西`);
      }
    }
  }
});

test('奇行奇列永远不是柱子——所有柱阵排法都得留出这张走位网', () => {
  for (const level of LEVELS) {
    const { grid } = buildLevel(level, 5);
    for (let cy = 1; cy < H - 1; cy += 2) {
      for (let cx = 1; cx < W - 1; cx += 2) {
        assert.notEqual(grid[key(cx, cy)], TILE.WALL, `${level.name} 在 (${cx},${cy}) 立了柱子`);
      }
    }
  }
});

test('道具只藏在箱子里，拆箱是唯一的刷装备途径', () => {
  for (const level of LEVELS) {
    const { grid, items } = buildLevel(level, 11);
    for (const at of items.keys()) {
      assert.equal(grid[at], TILE.CRATE, `${level.name} 把道具放在了没有箱子的格上`);
    }
    assert.ok(items.size > 0, `${level.name} 一件道具都没有`);
  }
});

test('同 seed 同图，换 seed 换图', () => {
  const level = LEVELS[3];
  const a = buildLevel(level, 21);
  const b = buildLevel(level, 21);
  const c = buildLevel(level, 22);
  assert.deepEqual([...a.grid], [...b.grid], '同一个 seed 必须长出同一张图');
  assert.notDeepEqual([...a.grid], [...c.grid], '换了 seed 还是同一张图，说明 seed 没接上');
});

test('难度曲线不倒挂：对手数量和档位一路不降', () => {
  for (let i = 1; i < LEVELS.length; i += 1) {
    assert.ok(LEVELS[i].bots >= LEVELS[i - 1].bots, `第 ${i + 1} 关的对手比上一关少`);
    assert.ok(LEVELS[i].skill >= LEVELS[i - 1].skill, `第 ${i + 1} 关的对手比上一关笨`);
    assert.ok(LEVELS[i].time >= LEVELS[i - 1].time, `第 ${i + 1} 关反而给的时间更少`);
  }
  assert.equal(LEVELS[0].bots, 1, '第一关只放一个对手');
  assert.equal(LEVELS[LEVELS.length - 1].skill, 1, '最后一关是满档对手');
});

test('箱子够多，但不会把图堵成实心', () => {
  for (const level of LEVELS) {
    for (const seed of seeds) {
      const { grid } = buildLevel(level, seed);
      let crates = 0;
      let floors = 0;
      for (let i = 0; i < grid.length; i += 1) {
        if (grid[i] === TILE.CRATE) crates += 1;
        if (grid[i] === TILE.FLOOR) floors += 1;
      }
      assert.ok(crates >= 8, `${level.name}（seed ${seed}）只有 ${crates} 个箱子，没什么可拆的`);
      assert.ok(floors >= 20, `${level.name}（seed ${seed}）空地只剩 ${floors} 格，走不动`);
    }
  }
});
