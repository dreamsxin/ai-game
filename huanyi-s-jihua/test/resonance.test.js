// 同频共振：这一版独有的那一层，判定层、表现层与文案各守一半。
//
// 为什么单独一份测试：原来的三阶进化只是数字变大，现在「捡到同型号」会同时触发
// 四轴数值、一圈清弹冲击、一段限时过载和一次外形展开。四处散在不同的模块里，
// 任何一处悄悄回归，玩家看到的都是「捡了跟没捡一样」。

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  MAX_TIER,
  SURGE,
  TIERS,
  effectiveDps,
  tierOf,
  wingAtTier,
} from '../src/game/wings.js';
import {
  OVERDRIVE_TIME,
  SYNC_BURST_INVULN,
  SYNC_BURST_R,
  WING_HALF_W,
} from '../src/game/rules.js';
import { EMPTY_INPUT, STEP, chooseWing, startGame, step } from '../src/game/simulation.js';
import { makePhaseFrame, makeShip, makeWing } from '../src/scene/models.js';
import { SOUND_NAMES, VIBRATION, soundsFor, vibrationFor } from '../src/scene/audio.js';
import {
  loreLine,
  nextTierLabel,
  surgeLabel,
  syncLabel,
  tierGainLabel,
  tierTitle,
} from '../src/scene/readout.js';

const JET = { ...EMPTY_INPUT, jettison: true };
const armed = () => chooseWing(startGame(0), 'C');
const withDrop = (state, code = 'C', tier = 1) => ({
  ...state,
  // 别让波次在这一帧里塞进新敌人／新弹，量的是「这一枚道具」的效果。
  waveIndex: 99,
  enemies: [],
  foes: [],
  drops: [{ id: 700, code, tier, x: state.ship.x, y: state.ship.y, vy: 0, life: 5, grace: 0, mine: false }],
});
const types = (state) => state.effects.map((effect) => effect.type);
const run = (state, frames) => {
  let next = state;
  for (let i = 0; i < frames; i += 1) next = step(next, EMPTY_INPUT, STEP);
  return next;
};

// ——— 设定 ———

test('三阶的代号、设定名与说明都齐，且代号按 PRIME/SYNC/RESONANCE 递进', () => {
  assert.deepEqual(TIERS.map((item) => item.codename), ['PRIME', 'SYNC', 'RESONANCE']);
  for (const item of TIERS) {
    assert.ok(item.title && item.brief, `${item.name} 缺设定文案`);
    assert.ok(item.dmg > 0 && item.cool > 0 && item.range > 0 && item.area > 0);
  }
  assert.equal(tierOf(2).title, tierTitle(2));
  assert.ok(loreLine().includes('相位编码'), '世界观要解释「为什么只有同型号能升阶」');
});

test('界面报的百分比就是表里用的倍率，不许各写一份', () => {
  assert.match(tierGainLabel(2), /\+50%/, 'Mk.II 伤害 +50%');
  assert.match(tierGainLabel(2), /\+40%/, 'Mk.II 射程 +40%');
  assert.match(tierGainLabel(3), /\+125%/, 'Mk.III 伤害 +125%');
  assert.match(tierGainLabel(3), /\+90%/, 'Mk.III 射程 +90%');
  assert.match(tierGainLabel(3), /-30%/, 'Mk.III 冷却 -30%');
  assert.equal(tierGainLabel(99), tierGainLabel(MAX_TIER), '越界的阶级按顶阶说');
});

// ——— 玩法：四轴加强 ———

test('升阶把攻击与范围一起抬到能感觉出来的幅度，且不碰命中性质', () => {
  const base = wingAtTier('J', 1);
  const third = wingAtTier('J', MAX_TIER);
  assert.equal(third.tier, MAX_TIER);
  assert.ok(third.volley[0].dmg > base.volley[0].dmg * 2, '顶阶伤害至少翻一倍');
  assert.ok(third.cool < base.cool * 0.75, '顶阶冷却明显更短');
  assert.ok(third.volley[0].life > base.volley[0].life * 1.8, '顶阶射程明显更远');
  assert.ok(third.volley[0].blast > base.volley[0].blast * 1.8, '穿甲爆圈跟着涨');
  assert.equal(third.volley[0].pierce, base.volley[0].pierce, '进化不能把选错的机翼变成对的');
  assert.equal(third.volley[0].vx, base.volley[0].vx, '横向速度决定侧向弱点，一个都不许碰');
  assert.equal(third.surge, false, '常态配置不该带过载标记');
});

test('短程机翼升阶后射程实打实变长，速度一步没动', () => {
  const base = wingAtTier('V', 1).volley[0];
  const third = wingAtTier('V', MAX_TIER).volley[0];
  assert.ok(third.life * Math.hypot(third.vx, third.vy) > base.life * Math.hypot(base.vx, base.vy) * 1.8);
  assert.equal(third.vx, base.vx);
  assert.equal(third.vy, base.vy);
});

test('配平用的 effectiveDps 不带过载：Boss 血量不该被限时增益污染', () => {
  assert.equal(effectiveDps.length, 2, '它没有 surge 口子，只按 code/kind/tier 算');
  assert.ok(effectiveDps('C', 'swarm', MAX_TIER) > effectiveDps('C', 'swarm'));
  assert.equal(wingAtTier('C', MAX_TIER).surge, false);
});

// ——— 玩法：共鸣冲击 ———

test('升阶瞬间放一圈相位冲击：半径内的敌弹被震碎并计入连消，半径外的留着', () => {
  const ready = armed();
  const base = { ...ready, ship: { ...ready.ship, invuln: 0 } };
  const ship = base.ship;
  const near = [
    { id: 910, x: ship.x + 8, y: ship.y - 10, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 },
    { id: 911, x: ship.x - 12, y: ship.y + 6, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 },
    { id: 912, x: ship.x, y: ship.y - 20, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 },
  ];
  const far = { id: 913, x: ship.x, y: ship.y - 60, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 };
  const state = { ...withDrop(base), foes: [...near, far] };
  const after = step(state, EMPTY_INPUT, STEP);

  assert.equal(after.ship.tier, 2);
  assert.equal(after.foes.length, 1, '只该剩下半径外那一发');
  assert.equal(after.foes[0].id, far.id);
  assert.ok(after.pops >= near.length, '震碎的弹照样算消弹');
  assert.ok(after.chain >= near.length, '震碎的弹照样接上连消');
  assert.ok(types(after).includes('pop'), '要有消弹的音画出口');
  const evolve = after.effects.find((effect) => effect.type === 'evolve');
  assert.equal(evolve.cleared, near.length);
  assert.equal(evolve.radius, SYNC_BURST_R, '表现层画的圈就是判定用的半径');
  assert.ok(after.ship.invuln >= SYNC_BURST_INVULN - STEP, '合榫那一瞬给一小段无敌');
});

test('共鸣冲击的半径是真 drawn 的范围：26 格外的弹一发都不许消失', () => {
  const ready = armed();
  const base = { ...ready, ship: { ...ready.ship, invuln: 0 } };
  const outside = { id: 920, x: base.ship.x + SYNC_BURST_R + 5, y: base.ship.y, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 };
  const after = step({ ...withDrop(base), foes: [outside] }, EMPTY_INPUT, STEP);
  assert.equal(after.foes.length, 1);
  assert.equal(after.effects.find((effect) => effect.type === 'evolve').cleared, 0);
});

// ——— 玩法：相位过载 ———

test('过载只是临时的一层：四个轴再涨一截，阶级与命中性质不动', () => {
  const plain = wingAtTier('C', MAX_TIER);
  const surge = wingAtTier('C', MAX_TIER, true);
  assert.equal(surge.tier, MAX_TIER, '过载不把阶级顶到 Mk.IV');
  assert.equal(surge.surge, true);
  assert.ok(surge.volley[0].dmg > plain.volley[0].dmg);
  assert.ok(surge.cool < plain.cool);
  assert.ok(surge.volley[0].life > plain.volley[0].life);
  assert.equal(surge.volley[0].pierce, plain.volley[0].pierce);
  assert.equal(surge.volley[0].ground, plain.volley[0].ground);
  assert.ok(SURGE.dmg > 1 && SURGE.cool < 1 && SURGE.range > 1);
});

test('满阶再捡同型号触发过载：给分、给演出、给一段倒计时，且真的打得更密', () => {
  const ready = armed();
  const topped = { ...ready, ship: { ...ready.ship, tier: MAX_TIER } };
  const after = step(withDrop(topped), EMPTY_INPUT, STEP);
  assert.equal(after.ship.tier, MAX_TIER, '阶级封顶不动');
  assert.equal(after.ship.overdrive, OVERDRIVE_TIME);
  assert.ok(after.score > topped.score, '重复机翼不白捡');
  assert.ok(types(after).includes('topped'));
  const surge = after.effects.find((effect) => effect.type === 'overdrive');
  assert.ok(surge, '过载要单独出一个 effect 给表现层');
  assert.equal(surge.radius, SYNC_BURST_R);

  const base = { ...startGame(1, 'C'), waveIndex: 99, enemies: [], foes: [] };
  const normal = { ...base, ship: { ...base.ship, tier: MAX_TIER, overdrive: 0, invuln: 0 } };
  const boosted = { ...normal, ship: { ...normal.ship, overdrive: 99 } };
  const fired = (state) => run(state, 60).nextId - state.nextId;
  assert.ok(fired(boosted) > fired(normal), `过载该出更多膛（${fired(boosted)} vs ${fired(normal)}）`);
});

test('过载会自己走完，且弃翼／换翼／掉翼一律清零', () => {
  const ready = armed();
  const topped = { ...ready, ship: { ...ready.ship, tier: MAX_TIER } };
  const surged = step(withDrop(topped), EMPTY_INPUT, STEP);
  const ticked = run(surged, 30);
  assert.ok(ticked.ship.overdrive < surged.ship.overdrive, '倒计时要真的在走');
  assert.ok(ticked.ship.overdrive > 0, '半秒还没到点');

  const jettisoned = step({ ...surged, ship: { ...surged.ship, lock: 0 } }, JET, STEP);
  assert.equal(jettisoned.ship.overdrive, 0, '弃翼扔掉的是一整套投资');

  const swapped = step(withDrop(surged, 'J'), EMPTY_INPUT, STEP);
  assert.equal(swapped.ship.overdrive, 0, '相位编码不兼容，过载不继承');

  const hit = step({
    ...surged,
    ship: { ...surged.ship, invuln: 0 },
    foes: [{ id: 930, x: surged.ship.x, y: surged.ship.y, vx: 0, vy: 10, hp: 1, kind: 'pellet', age: 0 }],
  }, EMPTY_INPUT, STEP);
  assert.equal(hit.ship.overdrive, 0, '被崩掉翼的时候过载也一起没');
});

// ——— 外形 ———

test('相位翼场是单独一层：部件齐、默认全灭，不挂进 makeShip 免得污染量宽', () => {
  const frame = makePhaseFrame();
  const ud = frame.userData;
  assert.equal(ud.rails.length, 2, '两道能量导轨');
  assert.equal(ud.gyros.length, 2, '两道交叉陀螺环');
  assert.equal(ud.cores.length, 2, '左右两枚悬浮棱晶');
  assert.equal(ud.nodes.length, 8, '导轨上跑的八颗能量节点');
  assert.equal(ud.sails.length, 2, '左右两片能量翼');
  assert.equal(ud.ribs.length, 6, '每片能量翼三根发光翼肋');
  assert.equal(ud.halos.length, 2, '两枚棱晶各有一团光晕，手机上才看得见');
  assert.ok(ud.core.isMesh, '机背共振核心');
  assert.ok(ud.coreHalo.isMesh && ud.coreRing.isMesh, '核心的光晕与环');
  for (const sail of ud.sails) {
    assert.equal(sail.material.side, THREE.DoubleSide, '镜像出来的能量翼必须双面');
  }
  for (const child of frame.children) {
    assert.equal(child.visible, false, '没升阶时一件都不该露出来');
  }
  assert.ok(!makeShip().children.some((child) => child.userData?.rails), '相位翼场不能进 makeShip');
});

test('共鸣导线长在翼面内侧：升阶外形再科幻，翼展还是判定用的 12.8 格', () => {
  for (const code of ['C', 'W', 'G', 'O', 'SS']) {
    const wing = makeWing(code);
    assert.equal(wing.userData.spines.length, 6, `${code} 两侧各三条相位纹路`);
    for (const { mesh } of wing.userData.spines) {
      assert.ok(Math.abs(mesh.position.x) + 1.9 <= WING_HALF_W + 0.2, `${code} 的导线探出翼展了`);
      assert.equal(mesh.visible, false, 'Mk.I 时全灭');
    }
    const box = new THREE.Box3().setFromObject(wing);
    assert.ok(
      Math.abs(box.max.x - box.min.x - WING_HALF_W * 2) < 1.2,
      `${code} 的翼展被升阶部件改掉了`,
    );
  }
});

// ——— 声音与文案 ———

test('过载有自己的一声爆发，压过「已满阶」应答但不抢进化的戏', () => {
  assert.ok(SOUND_NAMES.includes('overdrive'));
  const names = (effects) => soundsFor(effects).map((pick) => pick.name);
  assert.deepEqual(names([{ type: 'topped' }]), ['topped']);
  const both = names([{ type: 'topped', code: 'C' }, { type: 'overdrive' }]);
  assert.ok(both.includes('overdrive'));
  assert.ok(!both.includes('topped'), '同一次拾取不该响两声');
  assert.ok(names([{ type: 'evolve' }, { type: 'topped' }]).includes('evolve'));
  assert.deepEqual(vibrationFor([{ type: 'overdrive' }]), VIBRATION.overdrive);
});

test('HUD 说得清过载还剩多久，也说得出下一阶会涨什么', () => {
  assert.equal(surgeLabel({ overdrive: 0 }), '');
  assert.match(surgeLabel({ overdrive: 3 }), /3\.0s/);
  assert.ok(syncLabel({ wing: 'C', tier: 3 }).includes('RESONANCE'));
  assert.equal(syncLabel({ wing: null }), '');
  assert.ok(nextTierLabel({ wing: 'C', tier: 1 }).includes('Mk.II'));
  assert.ok(nextTierLabel({ wing: 'C', tier: MAX_TIER }).includes('过载'));
});
