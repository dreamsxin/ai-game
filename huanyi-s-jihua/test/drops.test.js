// 「同型掉落」的判定测试。
//
// 这一条是玩家唯一能提前看见的成长提示：灯柱亮起来就等于说「捡了会变强」。
// 所以它必须**只**在真会变强的时候亮：
// 1. 机翼同型号、且没满阶 → 升一阶；已 Mk.III → 转相位过载（也是收益，但文案不同）。
// 2. 僚机同型号、且编队没满 → 编队 +1；已满编 → 折算加分。
// 3. 不同型号 / 裸机 / 空字段 → 一律不亮（宁可少亮，也不能让玩家白绕一圈）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADE_KIND, dropUpgrade } from '../src/game/drops.js';
import { MAX_FORMATION } from '../src/game/gear.js';
import { MAX_TIER } from '../src/game/wings.js';
import { upgradeMark } from '../src/scene/readout.js';

const ship = (over = {}) => ({ wing: 'C', tier: 1, gear: 'E1', gearLevel: 1, ...over });

test('同型号机翼：没满阶算升阶，Mk.III 再捡算相位过载', () => {
  assert.equal(dropUpgrade({ kind: 'wing', code: 'C' }, ship()), UPGRADE_KIND.TIER);
  assert.equal(dropUpgrade({ kind: 'wing', code: 'C' }, ship({ tier: 2 })), UPGRADE_KIND.TIER);
  assert.equal(
    dropUpgrade({ kind: 'wing', code: 'C' }, ship({ tier: MAX_TIER })),
    UPGRADE_KIND.OVERDRIVE,
    '满阶后同型号不再涨阶级，改给限时过载——文案与光柱都该照这条走',
  );
});

test('型号不同 / 裸机 / 空输入：一根灯柱都不许亮', () => {
  assert.equal(dropUpgrade({ kind: 'wing', code: 'H' }, ship()), null, '换装没有成长');
  assert.equal(dropUpgrade({ kind: 'wing', code: 'C' }, ship({ wing: null })), null, '裸机随便捡都是换装');
  assert.equal(dropUpgrade({ kind: 'gear', code: 'E2' }, ship()), null);
  assert.equal(dropUpgrade({ kind: 'gear', code: 'E1' }, ship({ gear: null, gearLevel: 0 })), null);
  assert.equal(dropUpgrade(null, ship()), null);
  assert.equal(dropUpgrade({ kind: 'wing', code: 'C' }, null), null);
});

test('同型号僚机：编队未满算合流，满编算折算加分', () => {
  assert.equal(dropUpgrade({ kind: 'gear', code: 'E1' }, ship()), UPGRADE_KIND.MERGE);
  assert.equal(dropUpgrade({ kind: 'gear', code: 'E1' }, ship({ gearLevel: 2 })), UPGRADE_KIND.MERGE);
  assert.equal(
    dropUpgrade({ kind: 'gear', code: 'E1' }, ship({ gearLevel: MAX_FORMATION })),
    UPGRADE_KIND.FULL,
    '满编再捡只加钱，不和「还能合流」说同一句话',
  );
});

test('旧掉落物没有 kind 时按机翼处理', () => {
  // 装备道具是后加的字段；老存档/老掉落可能只有 code。把它当机翼读，
  // 才不会因为字段缺失就把同型号的机翼也整片点亮或整片熄灭。
  assert.equal(dropUpgrade({ code: 'C' }, ship()), UPGRADE_KIND.TIER);
  assert.equal(dropUpgrade({ code: 'H' }, ship()), null);
});

test('升级提示文案够短，且说清「捡了会怎样」', () => {
  const cases = [
    [UPGRADE_KIND.TIER, ship({ tier: 1 }), '可升 Mk.II'],
    [UPGRADE_KIND.TIER, ship({ tier: 2 }), '可升 Mk.III'],
    [UPGRADE_KIND.OVERDRIVE, ship({ tier: MAX_TIER }), '满阶 · 转过载'],
    [UPGRADE_KIND.MERGE, ship({ gearLevel: 1 }), '合流 ×2'],
    [UPGRADE_KIND.MERGE, ship({ gearLevel: 2 }), '合流 ×3'],
    [UPGRADE_KIND.FULL, ship({ gearLevel: MAX_FORMATION }), '已满编 · 加分'],
  ];
  for (const [kind, owner, expected] of cases) {
    const text = upgradeMark(kind, owner);
    assert.equal(text, expected);
    assert.ok([...text].length <= 10, `「${text}」太长，会盖住邻座道具`);
  }
  assert.equal(upgradeMark(null, ship()), null, '不是同型号就不写这一行');
});
