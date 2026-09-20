import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels.js';
import { runBossDuel, runLevel } from './arena.js';

// 这个文件守的是玩法本身的经济关系，而不是某个函数的返回值。
// 「弹药只从命中里来」如果只写在说明里、在数值上无所谓，那这游戏就是假的。

test('命中回弹关掉之后，同一个机器人打同一台 Boss 明显更慢', { timeout: 120000 }, () => {
  for (const [index, level] of LEVELS.entries()) {
    const on = runBossDuel(index);
    const off = runBossDuel(index, { refund: false });
    assert.ok(on.status !== 'over', `${level.key} 开着回弹都打不完，说明 Boss 太厚`);
    assert.ok(
      off.seconds > on.seconds * 1.25,
      `${level.key} 关掉回弹只慢了 ${(off.seconds / on.seconds).toFixed(2)} 倍，`
        + '弹药经济没起作用',
    );
    assert.ok(
      off.reloads > on.reloads,
      `${level.key} 关掉回弹反而装填得更少（${off.reloads} vs ${on.reloads}）`,
    );
  }
});

test('不往前压就打不完：站在出生点对着空气扫射不是一种打法', { timeout: 120000 }, () => {
  for (const index of [0, 3, 7]) {
    const held = runLevel(index, { allow: { advance: false } });
    assert.equal(held.cleared, false, `第 ${index + 1} 关不前压也过了，那前压就不是必需的`);
    assert.ok(held.bossHp > 0, '守在原地不可能把 Boss 打掉');
  }
});

test('贴身打的回报体现在弹匣上：一路压上去的那局，装填次数远少于命中次数', { timeout: 60000 }, () => {
  const out = runLevel(0);
  assert.ok(out.cleared);
  assert.ok(out.hits > 20, `命中太少：${out.hits}`);
  // 每次命中回 1 发（核心舱 2 发），所以一局里回弹拿到的子弹应该比装填拿到的多得多。
  const fromHits = out.hits;
  const fromReloads = out.shots - fromHits;
  assert.ok(fromHits * 3 > fromReloads, `回弹撑起的火力太少：命中 ${fromHits}，总发射 ${out.shots}`);
});
