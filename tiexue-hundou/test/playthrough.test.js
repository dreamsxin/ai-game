import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels.js';
import { runLevel } from './arena.js';

// 同一个机器人（skill=1）跑完八关，说明每关都过得去。
for (const [i, level] of LEVELS.entries()) {
  test(`${level.key} ${level.name} 机器人能打倒 Boss`, { timeout: 60000 }, () => {
    const out = runLevel(i);
    assert.ok(out.cleared, `打不过去，停在 x=${out.state.player.x.toFixed(1)} status=${out.status}`);
    assert.ok(out.hits > 10, `只打中了 ${out.hits} 发，枪法有问题`);
    assert.ok(out.bossHp <= 0, `Boss 没倒，还剩 ${out.bossHp} 血`);
  });
}
