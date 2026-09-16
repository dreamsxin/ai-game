import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CODES,
  LAB_CHAPTER,
  LAB_CODES,
  MAX_TIER,
  PICKABLE_CODES,
  SECRET_CODES,
  WEAKNESS,
  WEAKNESS_KINDS,
  WINGS,
  WING_CODES,
  clampTier,
  codesFor,
  damageMultiplier,
  dps,
  effectiveDps,
  hitKind,
  reachesWeakness,
  recommendedWing,
  tierOf,
  wingAtTier,
} from '../src/game/wings.js';

test('每种机翼都排得出可打的火力，冷却和伤害都是正数', () => {
  for (const code of ALL_CODES) {
    const wing = WINGS[code];
    assert.ok(wing.cool > 0, `${code} 的冷却不是正数`);
    assert.ok(wing.volley.length > 0, `${code} 一发都不射`);
    for (const shot of wing.volley) {
      assert.ok(shot.dmg > 0, `${code} 有一发伤害不是正数`);
      assert.ok(shot.life > 0, `${code} 有一发活不过零秒`);
      assert.ok(Math.hypot(shot.vx, shot.vy) > 0, `${code} 有一发不会动`);
    }
  }
});

test('10 种常规机翼可选，秘密机翼不在选单里', () => {
  assert.equal(WING_CODES.length, 10, '关卡开始前能选的应该正好是 10 种');
  assert.equal(SECRET_CODES.length, 1);
  assert.ok(!WING_CODES.includes('SS'), 'SS 只能在场上捡到，不能开局就选');
});

test('弱点情报和真能打进去的机翼必须对得上，否则简报就是骗人的', () => {
  for (const kind of WEAKNESS_KINDS) {
    const weak = WEAKNESS[kind];
    assert.ok(weak.label && weak.hint, `${kind} 缺情报文案`);
    assert.ok(weak.keys.length > 0, `${kind} 没有任何解法`);
    for (const code of weak.keys) {
      const wing = WINGS[code];
      const reaches = wing.volley.some((shot) => reachesWeakness(kind, shot));
      assert.ok(reaches, `${kind} 声称 ${code} 打得进去，实际一发都到不了`);
    }
    // 推荐的那一种必须是非秘密的、且真的打得进去。
    const pick = recommendedWing(kind);
    assert.ok(WING_CODES.includes(pick), `${kind} 推荐了一个选不到的机翼 ${pick}`);
  }
});

test('打不进弱点只剩零头伤害，打进去是满伤', () => {
  const armorPiercer = WINGS.J.volley[0];
  const plainBolt = WINGS.C.volley[0];
  assert.equal(damageMultiplier('core', armorPiercer), 1, '穿甲弹就是壳中之核的答案');
  assert.equal(damageMultiplier('core', plainBolt), WEAKNESS.core.chip);
  assert.ok(WEAKNESS.core.chip < 0.25, '装甲挡下的伤害要足够少，否则拿错机翼没有代价');
  // 生物体没有装甲：随便打都是满伤，难的是它的弹幕。
  assert.equal(damageMultiplier('swarm', plainBolt), 1);
});

test('命中反馈分得清「打进去了」和「被挡住了」', () => {
  assert.equal(hitKind('core', WINGS.J.volley[0]), 'pierce');
  assert.equal(hitKind('core', WINGS.C.volley[0]), 'chip');
  assert.equal(hitKind('low', WINGS.D.volley[1]), 'pierce', '炸弹是贴地目标的解法');
  assert.equal(hitKind('low', WINGS.D.volley[0]), 'chip', '同一副机翼的平射打不动贴地目标');
});

test('侧面弱点靠横向速度判定，不靠是哪种机翼', () => {
  const forward = { vx: 0, vy: -100 };
  const sideways = { vx: 96, vy: -20 };
  assert.equal(reachesWeakness('side', forward), false);
  assert.equal(reachesWeakness('side', sideways), true);
});

test('每种弱点的推荐机翼都是所有选得到的机翼里有效 DPS 最高的那一个', () => {
  for (const kind of WEAKNESS_KINDS) {
    const scored = PICKABLE_CODES.map((code) => [code, effectiveDps(code, kind)]).sort((a, b) => b[1] - a[1]);
    const [bestCode, bestValue] = scored[0];
    assert.equal(
      bestCode,
      recommendedWing(kind),
      `${kind} 的推荐机翼不是最优解，实测最优是 ${bestCode}`,
    );
    // 领先幅度也要够：差一点点的话「选对武器」就退化成手感问题。
    assert.ok(bestValue > scored[1][1] * 1.25, `${kind} 的最优解领先得不够多`);
  }
});

test('加农炮是纸面火力最猛的常规机翼，穿甲弹最慢', () => {
  const ranked = WING_CODES.map((code) => [code, dps(code)]).sort((a, b) => b[1] - a[1]);
  assert.equal(ranked[0][0], 'C');
  assert.ok(dps('J') < dps('C') / 2, '穿甲弹靠的是穿得进去，不是打得快');
});

test('进化只放大火力，不改机翼的性质', () => {
  for (const code of PICKABLE_CODES) {
    const base = wingAtTier(code, 1);
    const top = wingAtTier(code, MAX_TIER);
    assert.ok(top.cool < base.cool, `${code} 升到顶阶冷却没变短`);
    for (const [i, shot] of top.volley.entries()) {
      const from = base.volley[i];
      assert.ok(shot.dmg > from.dmg, `${code} 第 ${i} 发升阶后伤害没涨`);
      // pierce / ground / 横向速度决定的是「打不打得进弱点」，进化一律不许碰。
      assert.equal(shot.pierce, from.pierce, `${code} 升阶改了穿透性质`);
      assert.equal(shot.ground, from.ground, `${code} 升阶改了对地性质`);
      assert.equal(shot.vx, from.vx, `${code} 升阶改了横向速度`);
    }
  }
});

test('进化不能把选错的机翼变成对的：倍率之比逐阶不变', () => {
  for (const kind of WEAKNESS_KINDS) {
    if (kind === 'swarm') continue;
    const right = recommendedWing(kind);
    const ratios = [1, 2, MAX_TIER].map((tier) => effectiveDps(right, kind, tier) / effectiveDps('C', kind, tier));
    for (const ratio of ratios) {
      assert.ok(Math.abs(ratio - ratios[0]) < 1e-9, `${kind} 的正确答案优势被进化冲淡了`);
      assert.ok(ratio > 1.2, `${kind} 的正确答案本来就不够强`);
    }
  }
});

test('阶级夹在 1 到 3 之间，越界不炸也不越权', () => {
  assert.equal(clampTier(0), 1);
  assert.equal(clampTier(99), MAX_TIER);
  assert.equal(tierOf(2).name, 'Mk.II');
  assert.equal(wingAtTier('C', 9).tier, MAX_TIER);
  assert.equal(wingAtTier('不存在', 1), null);
});

test('顶阶给带铁球的机翼多挂一枚——进化要看得见', () => {
  assert.equal(wingAtTier('H', 1).orbs, 2);
  assert.equal(wingAtTier('H', MAX_TIER).orbs, 3);
  assert.equal(wingAtTier('C', MAX_TIER).orbs, 0, '本来没铁球的不该凭空长出来');
});

test('实验机翼是另一条路，不是更强的常规机翼', () => {
  assert.equal(LAB_CODES.length, 5);
  for (const code of LAB_CODES) {
    assert.ok(WINGS[code].lab, `${code} 没标成实验机翼`);
    assert.ok(!WING_CODES.includes(code), `${code} 混进常规十种里了`);
    // 四种弱点的答案只能是常规机翼：实验机翼强在清弹幕和覆盖，不在啃装甲。
    for (const kind of WEAKNESS_KINDS) {
      if (kind === 'swarm') continue;
      assert.ok(
        !WEAKNESS[kind].keys.includes(code),
        `${code} 成了 ${kind} 的答案，弱点系统就被冲淡了`,
      );
    }
  }
});

test('前两章只有常规十种，第 3 章才解锁实验机翼', () => {
  assert.deepEqual(codesFor(0), WING_CODES);
  assert.deepEqual(codesFor(1), WING_CODES);
  assert.equal(codesFor(LAB_CHAPTER).length, WING_CODES.length + LAB_CODES.length);
  assert.deepEqual(codesFor(3), PICKABLE_CODES);
});

test('每种实验机翼都带着一条自己的机制，不是换皮', () => {
  const traits = LAB_CODES.map((code) => {
    const shot = WINGS[code].volley[0];
    return shot.well || shot.chain || shot.burst || WINGS[code].echo || shot.pierce;
  });
  for (const [i, trait] of traits.entries()) {
    assert.ok(trait, `${LAB_CODES[i]} 没有任何新机制`);
  }
  // 引力井吃弹幕，链弧跳目标，反物质炸一圈，量子分身镜像开火，相位激光连穿。
  assert.ok(WINGS.G.volley[0].well > 0);
  assert.ok(WINGS.Z.volley[0].chain > 0);
  assert.ok(WINGS.X.volley[0].burst > 0);
  assert.equal(WINGS.Q.echo, true);
  assert.equal(WINGS.L.volley[0].pierce, 'targets');
});
