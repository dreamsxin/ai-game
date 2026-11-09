import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_INPUT, STEP, startGame, step } from '../src/game/simulation.js';
import { FORMATION_PLAN, LEVELS } from '../src/game/levels.js';
import { FORMATIONS, enemyEscaped, spawnWave } from '../src/game/enemies.js';
import { createRandom } from '../src/game/random.js';
import { FIELD_H, FIELD_W, FLASH_SCORE, MEDAL_UNIT, SKIP_SCORE, clamp } from '../src/game/rules.js';
import {
  bountyTracker,
  bountyWaves,
  forceSettleBounty,
  loseMedals,
  medalBonus,
  registerBounty,
  settleBounty,
} from '../src/game/bounty.js';

const tune = { hp: 1, fire: 1, speed: 1 };
const wave = (bounty = true) => ({ waves: [
  { at: 1.5, kind: 'zako', count: 4, bounty },
  { at: 8, kind: 'carrier', count: 1 },
] });

test('赏金波只点名能被全歼的杂兵，障碍墙与运载火箭不当奖券', () => {
  for (const [index, level] of LEVELS.entries()) {
    const picked = bountyWaves(level);
    assert.ok(picked.length >= 1 && picked.length <= 2, `第 ${index + 1} 关赏金波数量不对`);
    assert.equal(level.bounties, picked.length);
    for (const item of picked) {
      assert.ok(['zako', 'diver', 'turret'].includes(item.kind), `第 ${index + 1} 关点了打不干净的 ${item.kind}`);
    }
  }
});

test('每关都有可背的队形，且队形不能把敌机摆出场地', () => {
  for (const [index, level] of LEVELS.entries()) {
    const shaped = level.waves.filter((item) => item.formation);
    assert.ok(shaped.length >= 1, `第 ${index + 1} 关一整关都是直线平铺`);
    for (const item of shaped) {
      assert.ok(FORMATIONS.includes(item.formation), `第 ${index + 1} 关用了不认识的队形`);
    }
  }
  for (const formation of FORMATIONS) {
    const { enemies } = spawnWave(
      { at: 0, kind: 'zako', count: 9, spread: 78, formation },
      { tune, rng: createRandom(7), nextId: 1 },
    );
    assert.equal(enemies.length, 9, `${formation} 把敌机数量改了`);
    for (const enemy of enemies) {
      assert.ok(enemy.x >= 8 && enemy.x <= FIELD_W - 8, `${formation} 有敌机站到 x=${enemy.x}`);
      assert.ok(enemy.y < 0, `${formation} 有敌机一出场就在画面里`);
    }
  }
});

test('不写 formation 时退回老队形，逐字段不变', () => {
  const spec = { at: 0, kind: 'zako', count: 5, spread: 40 };
  const plain = spawnWave(spec, { tune, rng: createRandom(7), nextId: 1 }).enemies;
  const line = spawnWave({ ...spec, formation: 'line' }, { tune, rng: createRandom(7), nextId: 1 }).enemies;
  assert.deepEqual(line, plain);
  for (let i = 0; i < plain.length; i += 1) {
    assert.equal(plain[i].x, clamp(FIELD_W / 2 + (i / 4 - 0.5) * 80, 8, FIELD_W - 8));
  }
});

test('pincer 给中路留一条缝，column 把队伍收成一列', () => {
  const pincer = spawnWave(
    { at: 0, kind: 'zako', count: 6, spread: 60, formation: 'pincer' },
    { tune, rng: createRandom(7), nextId: 1 },
  ).enemies;
  const opening = pincer.every((enemy) => Math.abs(enemy.x - FIELD_W / 2) >= 14);
  assert.ok(opening, '两翼包抄没给中间留通道');
  const column = spawnWave(
    { at: 0, kind: 'zako', count: 6, spread: 60, formation: 'column' },
    { tune, rng: createRandom(7), nextId: 1 },
  ).enemies;
  assert.ok(column.every((enemy) => Math.abs(enemy.x - FIELD_W / 2) <= 8), '单纵队散得太开');
});

test('出生在画面上方的后排敌机不会被误判脱逃', () => {
  const { enemies } = spawnWave(
    { at: 0, kind: 'zako', count: 9, spread: 70, formation: 'column' },
    { tune, rng: createRandom(7), nextId: 1 },
  );
  const back = enemies.at(-1);
  assert.ok(back.y < -32, '纵队后排本来就生在画面上方');
  assert.equal(enemyEscaped(back), false, '刚出生不能算飞走');
  assert.equal(enemyEscaped({ ...back, age: 2, y: -40 }), true, '赖在上方不走才回收');
  assert.equal(enemyEscaped({ ...back, y: FIELD_H + 30 }), true, '真的往下飞出去要回收');
});

test('赏金波生成的是紧凑、轻装、会盘旋的一队', () => {
  let state = startGame(0, 'C');
  const waveId = LEVELS[0].waves.findIndex((item) => item.bounty);
  for (let i = 0; i < 95; i += 1) state = step(state, EMPTY_INPUT, STEP);
  const squad = state.enemies.filter((enemy) => enemy.waveId === waveId);
  assert.ok(squad.length > 0);
  assert.ok(squad.every((enemy) => enemy.hold && enemy.holdUntil > 0), '赏金波该停在中场');
  assert.ok(squad.every((enemy) => Math.abs(enemy.x - FIELD_W / 2) < 10), '赏金波该收成窄带');
  const plain = spawnWave(
    { ...LEVELS[0].waves[waveId] },
    { tune, rng: createRandom(1), nextId: 1 },
  ).enemies;
  assert.ok(squad[0].hp < plain[0].hp, '轻装编队要比普通杂兵薄');
});

test('阵型轮换表是关卡编排唯一的来源，且和波次数配套', () => {
  assert.ok(FORMATION_PLAN.length >= 4);
  assert.ok(FORMATION_PLAN.every((name) => FORMATIONS.includes(name)));
});

test('全歼才给勋章：飞出去一架整波作废', () => {
  let tracker = bountyTracker(wave());
  tracker = registerBounty(tracker, 0, 4, 1.5);
  const clean = settleBounty(tracker, [{ waveId: 0, kind: 'kill', count: 4 }], 3.0);
  assert.equal(clean.tracker.medals, 1);
  assert.equal(clean.events.length, 1);
  assert.equal(clean.events[0].type, 'medal');
  assert.equal(clean.events[0].flash, true, '三秒内打完该算速歼');
  assert.equal(clean.events[0].points, FLASH_SCORE);

  let missed = bountyTracker(wave());
  missed = registerBounty(missed, 0, 4, 1.5);
  const lost = settleBounty(missed, [
    { waveId: 0, kind: 'kill', count: 2 },
    { waveId: 0, kind: 'escape', count: 2 },
  ], 6.0);
  assert.equal(lost.tracker.medals, 0);
  assert.equal(lost.events[0].type, 'bountyLost');
  assert.equal(lost.tracker.waves[0].settled, true);
});

test('速歼窗口之外只给勋章，不给额外分；同一波只结算一次', () => {
  let tracker = registerBounty(bountyTracker(wave()), 0, 4, 1.5);
  const first = settleBounty(tracker, [{ waveId: 0, kind: 'kill', count: 4 }], 9.0);
  assert.equal(first.events[0].flash, false);
  assert.equal(first.events[0].points, 0);
  const again = settleBounty(first.tracker, [{ waveId: 0, kind: 'kill', count: 4 }], 10.0);
  assert.equal(again.tracker.medals, 1, 'settled 的波不能再发一次勋章');
  assert.deepEqual(again.events, []);
});

test('total 以实际生成数为准：墙留了缺口也不能多要一架', () => {
  let tracker = registerBounty(bountyTracker(wave()), 0, 3, 1.5);
  const done = settleBounty(tracker, [{ waveId: 0, kind: 'kill', count: 3 }], 2.0);
  assert.equal(done.tracker.medals, 1);
});

test('Boss 出场收口：没打完的赏金波按撤离结算，不静默悬到关末', () => {
  const level = { waves: [
    { at: 1, kind: 'zako', count: 4, bounty: true },
    { at: 9, kind: 'zako', count: 4, bounty: true },
  ] };
  let tracker = registerBounty(bountyTracker(level), 0, 4, 1);
  tracker = registerBounty(tracker, 1, 4, 9);
  tracker = settleBounty(tracker, [{ waveId: 0, kind: 'kill', count: 4 }], 2).tracker;
  const forced = forceSettleBounty(tracker);
  assert.equal(forced.tracker.medals, 1, '已拿到的勋章不能被收口抹掉');
  assert.equal(forced.events.length, 1);
  assert.equal(forced.events[0].reason, 'boss');
  assert.equal(forced.tracker.waves[1].settled, true);
  assert.equal(forced.tracker.waves[1].escaped, 4);
  assert.deepEqual(forceSettleBounty(forced.tracker).events, [], '收口只能做一次');
});

test('掉命清零只清勋章，速歼战绩留着；没点名的波不进表', () => {
  let tracker = registerBounty(bountyTracker(wave()), 0, 4, 1.5);
  tracker = settleBounty(tracker, [{ waveId: 0, kind: 'kill', count: 4 }], 2.0).tracker;
  const wiped = loseMedals(tracker);
  assert.equal(wiped.medals, 0);
  assert.equal(wiped.flashes, 1);
  const ignored = settleBounty(bountyTracker(wave()), [{ waveId: 1, kind: 'kill', count: 1 }], 2.0);
  assert.equal(ignored.tracker.medals, 0);
  assert.deepEqual(ignored.events, []);
});

test('关末结算：勋章 × 保住的阶级，裸机也按一阶算', () => {
  assert.equal(medalBonus(0, 3), 0);
  assert.equal(medalBonus(2, 1), MEDAL_UNIT * 2);
  assert.equal(medalBonus(2, 3), MEDAL_UNIT * 2 * 3);
  assert.equal(medalBonus(2, 99), MEDAL_UNIT * 2 * 3, '阶级越界不能把结算刷爆');
  assert.equal(medalBonus(-1, 2), 0);
});

test('状态机：同一帧打光一整波 → 发勋章、记速歼分', () => {
  let state = startGame(0, 'C');
  const waveId = LEVELS[0].waves.findIndex((item) => item.bounty);
  assert.ok(waveId >= 0);
  for (let i = 0; i < 100; i += 1) state = step(state, EMPTY_INPUT, STEP);
  const tagged = state.enemies.filter((enemy) => enemy.waveId === waveId);
  assert.ok(tagged.length > 0, '赏金波的敌机没打上波次标记');
  const before = state.score;
  state = { ...state, enemies: state.enemies.map((enemy) => (
    enemy.waveId === waveId ? { ...enemy, hp: 0 } : enemy
  )) };
  const out = step(state, EMPTY_INPUT, STEP);
  const medal = out.effects.find((effect) => effect.type === 'medal');
  assert.ok(medal, '全歼没发勋章');
  assert.equal(out.bounty.medals, 1);
  assert.ok(out.score > before, '击破分与速歼分没进账');
});

test('状态机：走跳关门过关也照常结算勋章 × 阶级', () => {
  let state = startGame(1, 'C');
  state = {
    ...state,
    ship: { ...state.ship, tier: 2 },
    bounty: { ...state.bounty, medals: 2 },
    gate: { x: state.ship.x, y: state.ship.y, w: 24, h: 9 },
  };
  const out = step(state, EMPTY_INPUT, STEP);
  assert.equal(out.status, 'clear');
  const paid = out.effects.find((effect) => effect.type === 'medalBonus');
  assert.ok(paid, '关末没结算勋章');
  assert.equal(paid.points, MEDAL_UNIT * 2 * 2);
  assert.equal(out.score, state.score + SKIP_SCORE + paid.points, '跳关奖励与勋章结算都该进分');
  assert.ok(
    Object.values(out.bounty.waves).every((item) => item.settled),
    '跳关门在 Boss 之前收场，也该把没打完的赏金波收口',
  );
});
