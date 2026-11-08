// 装备槽的测试。守的全是「会骗人」的部分：
// 1. 僚机挂在后侧、整体不越出 12.8 格判定翼展（和机翼那条视觉契约同源）；
// 2. 装备火力永远按 chip 结算，不能把「选错机翼要磨很久」稀释掉；
// 3. 挡弹与掉命的两档惩罚、跨关 carry、重试清零，都按设定走；
// 4. 新 kind 不能把旧的机翼拾取循环弄坏（同频共振 14 条回归另在 resonance.test.js）。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESCORT_HALF_W,
  GEAR,
  GEAR_CODES,
  MAX_FORMATION,
  escortsOf,
  escortWithinSpan,
  gearAfterBlock,
  gearAfterLoss,
  gearFields,
  gearLine,
  gearPick,
  gearSpec,
  gearVolley,
} from '../src/game/gear.js';
import { WING_HALF_W } from '../src/game/rules.js';
import { WEAKNESS, reachesWeakness } from '../src/game/wings.js';
import { briefing, LEVELS } from '../src/game/levels.js';
import {
  STEP,
  advance,
  bossShotMultiplier,
  chooseWing,
  createGame,
  hitBoxes,
  retryChapter,
  startGame,
  step,
} from '../src/game/simulation.js';
import { EMPTY_INPUT } from '../src/game/input.js';
import { loadProgress, mergeProgress } from '../src/game/progress.js';
import { SOUND_NAMES, VIBRATION, soundsFor, vibrationFor } from '../src/scene/audio.js';

const shipWith = (code, level, guard = true) => ({
  x: 50,
  y: 124,
  wing: null,
  tier: 1,
  cool: 0,
  invuln: 0,
  dive: 0,
  lock: 0,
  orbAngle: 0,
  overdrive: 0,
  ...gearFields({ code, level, guard }),
});

/** 把一件道具摆在船身上，跑一帧就能捡到。 */
const stateWithDrop = (drop, ship = shipWith('E1', 1)) => ({
  ...createGame(0),
  status: 'playing',
  ship,
  drops: [{ id: 900, kind: 'gear', code: 'E1', x: ship.x, y: ship.y, vy: 0, life: 9, grace: 0, mine: false, ...drop }],
  foes: [],
  enemies: [],
  shots: [],
  effects: [],
});

/** 一发正撞在船身上的敌弹。 */
const stateWithFoe = (ship) => ({
  ...createGame(0),
  status: 'playing',
  ship,
  foes: [{ id: 901, x: ship.x, y: ship.y, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 }],
  enemies: [],
  shots: [],
  drops: [],
  effects: [],
});

test('三型装备一型一形一色，编队后置且整体不越出判定翼展', () => {
  assert.equal(GEAR_CODES.length, 3);
  assert.equal(new Set(GEAR_CODES.map((code) => GEAR[code].hue)).size, 3, '三型不能撞色');
  assert.equal(new Set(GEAR_CODES.map((code) => GEAR[code].shape)).size, 3, '三型不能撞形状');
  for (const code of GEAR_CODES) {
    const spec = GEAR[code];
    assert.equal(spec.kind, 'escort');
    assert.equal(spec.layouts.length, MAX_FORMATION);
    assert.ok(spec.fire.spread < 40, `${code} 的偏射横速会意外打进侧面弱点`);
    assert.ok(gearLine(code).includes('｜'), `${code} 缺选翼面板的说明`);
    for (let level = 1; level <= MAX_FORMATION; level += 1) {
      const ship = shipWith(code, level);
      const escorts = escortsOf(ship);
      assert.equal(escorts.length, level, `${code} 编队 ${level} 该有 ${level} 架`);
      assert.ok(escorts.every((escort) => escort.y > ship.y), `${code} 的僚机必须挂在主机后侧`);
      assert.ok(escortWithinSpan(ship), `${code} 编队 ${level} 撑破了 ${WING_HALF_W} 格半翼展`);
      assert.ok(
        escorts.every((escort) => Math.abs(escort.x - ship.x) + ESCORT_HALF_W <= WING_HALF_W),
        `${code} 的僚机连半宽都算上还越界`,
      );
    }
  }
});

test('escortsOf 是纯函数：不写回 ship，空装备返回空编队', () => {
  const ship = shipWith('E2', 2);
  const before = JSON.stringify(ship);
  const first = escortsOf(ship);
  const second = escortsOf(ship);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(ship), before, '读编队不该改状态');
  assert.deepEqual(escortsOf(shipWith(null, 0)), []);
  assert.deepEqual(escortsOf({ ...ship, gear: 'NOPE' }), []);
});

test('gearPick：新装 / 合流 / 满编队给分 / 换型号掉出旧件', () => {
  const fresh = { gear: null, gearLevel: 0 };
  assert.equal(gearPick(fresh, 'E1').kind, 'new');
  assert.equal(gearPick(fresh, 'E1').fields.gearLevel, 1);
  assert.equal(gearPick(fresh, 'E1').fields.gearGuard, true);
  assert.equal(gearPick(fresh, 'NOPE').kind, 'invalid');

  const one = shipWith('E1', 1, false);
  assert.equal(gearPick(one, 'E1').kind, 'sync');
  assert.equal(gearPick(one, 'E1').fields.gearLevel, 2);
  assert.equal(gearPick(one, 'E1').fields.gearGuard, true, '合流补回一次替挡机会');

  const three = shipWith('E1', 3, false);
  assert.equal(gearPick(three, 'E1').kind, 'full');
  assert.equal(gearPick(three, 'E1').fields.gearLevel, MAX_FORMATION, '满编队不再往上涨');

  const swap = gearPick(one, 'E2');
  assert.equal(swap.kind, 'swap');
  assert.equal(swap.fields.gear, 'E2');
  assert.equal(swap.fields.gearLevel, 1);
  assert.deepEqual(swap.old, { code: 'E1', level: 1 });
});

test('替挡消耗一架僚机；掉命掉一级而不是清零', () => {
  const three = shipWith('E1', 3, true);
  const blocked = gearAfterBlock(three);
  assert.equal(blocked.gearLevel, 2);
  assert.equal(blocked.gear, 'E1');
  assert.equal(blocked.gearGuard, false, '一次替挡机会用完就没了');
  const empty = gearAfterBlock(shipWith('E1', 1, true));
  assert.equal(empty.gearLevel, 0);
  assert.equal(empty.gear, null, '编队打光，装备槽不该留个空编号在 HUD 上骗人');

  const lost = gearAfterLoss(three);
  assert.equal(lost.gearLevel, 2, '掉命只掉一级');
  assert.equal(lost.gear, 'E1');
  assert.equal(gearAfterLoss(shipWith('E1', 1)).gear, null, '只剩一架时掉命才清空');
});

test('僚机弹：弹数恒等于编队数，全带 chipOnly，且打不进任何装甲弱点', () => {
  for (const code of GEAR_CODES) {
    for (let level = 1; level <= MAX_FORMATION; level += 1) {
      const { shots, nextId } = gearVolley(shipWith(code, level), 40);
      assert.equal(shots.length, level, `${code} 编队 ${level} 的弹数不对`);
      assert.equal(nextId, 40 + level);
      for (const shot of shots) {
        assert.equal(shot.source, 'gear');
        assert.equal(shot.chipOnly, true);
        assert.equal(shot.kind, 'escort');
        assert.equal(shot.gearCode, code);
        assert.ok(Math.abs(shot.vx) < 40, `${code} 的偏射横速打进了 side 弱点`);
        assert.ok(shot.dmg < 1, '僚机弹伤害必须比主机弹低一档');
      }
    }
  }
  assert.deepEqual(gearVolley(shipWith(null, 0)).shots, []);
});

test('Boss 命中：装备弹只按 chip，机翼弹照旧按弱点判定', () => {
  const gearShot = gearVolley(shipWith('E1', 1), 1).shots[0];
  for (const [weak, table] of Object.entries(WEAKNESS)) {
    assert.equal(bossShotMultiplier(weak, gearShot), table.chip, `${weak} 弱点没按 chip 结算`);
  }
  const piercer = { vx: 0, vy: -90, pierce: 'armor', ground: false };
  assert.equal(bossShotMultiplier('core', piercer), 1);
  assert.equal(bossShotMultiplier('core', { vx: 0, vy: -90 }), WEAKNESS.core.chip);
  assert.equal(bossShotMultiplier('side', { vx: 60, vy: -60 }), 1);
  // 僚机弹的横速确实过不了侧向弱点那道 40 的门槛。
  assert.equal(reachesWeakness('side', gearShot), false);
});

test('僚机不进 hitBoxes：带装备不会把受击面积撑大', () => {
  const bare = shipWith(null, 0);
  const withGear = shipWith('E3', 3);
  assert.deepEqual(hitBoxes(withGear), hitBoxes(bare));
  assert.equal(hitBoxes(withGear).length, 1, '裸机只有一个机身盒');
});

test('开局 / 选翼预带装备，跨关 carry，重试本章整槽清空', () => {
  const started = startGame(0, 'C', 'E2');
  assert.equal(started.ship.gear, 'E2');
  assert.equal(started.ship.gearLevel, 1);
  assert.equal(started.ship.gearGuard, true);
  assert.equal(startGame(0, 'C').ship.gear, null, '不选装备就是旧版那样开局');

  let selected = startGame(0);
  assert.equal(selected.status, 'select');
  selected = chooseWing(selected, 'C', 'E1');
  assert.equal(selected.status, 'playing');
  assert.equal(selected.ship.gear, 'E1');
  assert.equal(selected.ship.gearLevel, 1);
  assert.ok(selected.effects.some((effect) => effect.type === 'gearCatch'));

  const carried = advance({
    ...startGame(0, 'C', 'E1'),
    status: 'clear',
    ship: { ...startGame(0, 'C', 'E1').ship, gearLevel: 3, gearGuard: false },
  });
  assert.equal(carried.ship.gear, 'E1');
  assert.equal(carried.ship.gearLevel, 3);
  assert.equal(carried.ship.gearGuard, false, '跨关不白送一次替挡机会');

  const retried = retryChapter({ ...carried, levelIndex: 2, status: 'over' });
  assert.equal(retried.ship.gear, null);
  assert.equal(retried.ship.gearLevel, 0);
});

test('关卡情报给出装备主题，且 16 关 Boss 血量仍是推荐翼反推出来的', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const brief = briefing(index);
    assert.equal(brief.gearCodes.length, 1, `第 ${index + 1} 关没给装备主题`);
    assert.ok(gearSpec(brief.gearCodes[0]), `第 ${index + 1} 关的装备型号不存在`);
    assert.deepEqual(brief.gearCodes, LEVELS[index].gearDrops);
    assert.ok(LEVELS[index].boss.hp > 0);
  }
});

test('装备不进存档：progress 里一个 gear 字段都没有', () => {
  const merged = mergeProgress(loadProgress(), { ...startGame(0, 'C', 'E1'), status: 'clear', stars: 2 });
  assert.equal(JSON.stringify(merged).includes('gear'), false);
});

test('运载火箭带出装备道具：一关一件，形状信息与机翼分开', () => {
  let state = startGame(0, 'C');
  state = {
    ...state,
    enemies: [{
      id: 1, kind: 'carrier', x: 50, y: 30, vx: 0, vy: 0,
      hp: 0, maxHp: 100, w: 8, h: 8, armor: null, blocks: false,
      score: 400, cool: 0, timer: 0, wing: 'C', gear: 'E1', age: 0,
    }],
  };
  state = step(state, EMPTY_INPUT, STEP);
  const gears = state.drops.filter((drop) => drop.kind === 'gear');
  assert.equal(gears.length, 1, '这一关只该掉一件装备');
  assert.equal(gears[0].code, 'E1');
  assert.equal(state.drops.filter((drop) => drop.kind === 'wing').length, 1, '机翼道具照常掉');
  assert.ok(state.effects.some((effect) => effect.type === 'gearCarrier'));
});

test('拾取装备：编队 1→2→3，满编队给分不空捡，换型号掉出旧件', () => {
  let state = stateWithDrop({}, shipWith(null, 0));
  state = step(state, EMPTY_INPUT, STEP);
  assert.equal(state.ship.gear, 'E1');
  assert.equal(state.ship.gearLevel, 1);
  assert.ok(state.effects.some((effect) => effect.type === 'gearCatch'));

  // 连捡两枚同型号：合流到满编队。
  for (const level of [2, 3]) {
    state = stateWithDrop({}, state.ship);
    state = step(state, EMPTY_INPUT, STEP);
    assert.equal(state.ship.gearLevel, level);
    assert.ok(state.effects.some((effect) => effect.type === 'gearSync'));
  }
  const full = stateWithDrop({}, state.ship);
  const topped = step(full, EMPTY_INPUT, STEP);
  assert.ok(topped.score > full.score, '满编队再捡也得给分');
  assert.equal(topped.ship.gearLevel, MAX_FORMATION);
  assert.ok(topped.effects.some((effect) => effect.type === 'gearFull'));
  state = topped;

  state = stateWithDrop({ code: 'E2' }, state.ship);
  state = step(state, EMPTY_INPUT, STEP);
  assert.equal(state.ship.gear, 'E2');
  assert.equal(state.ship.gearLevel, 1);
  assert.ok(state.effects.some((effect) => effect.type === 'gearSwap'));
  assert.equal(state.drops.filter((drop) => drop.kind === 'gear' && drop.mine).length, 1, '旧装备脱手还能捡回来');
});

test('同一帧机翼与装备都在拾取圈里：两槽各捡各的，机翼先处理', () => {
  const ship = shipWith(null, 0);
  let state = {
    ...stateWithDrop({}, ship),
    drops: [
      { id: 1, kind: 'gear', code: 'E1', x: ship.x, y: ship.y, vy: 0, life: 9, grace: 0, mine: false },
      { id: 2, kind: 'wing', code: 'C', tier: 1, x: ship.x, y: ship.y, vy: 0, life: 9, grace: 0, mine: false },
    ],
  };
  state = step(state, EMPTY_INPUT, STEP);
  assert.equal(state.ship.wing, 'C');
  assert.equal(state.ship.gear, 'E1');
  const names = state.effects.map((effect) => effect.type);
  assert.ok(names.indexOf('catch') < names.indexOf('gearCatch'), '机翼飘字该排在装备合流之前');
});

test('老 drop 没有 kind 字段仍按机翼处理：旧状态与存档不崩', () => {
  const ship = shipWith(null, 0);
  const state = {
    ...stateWithDrop({}, ship),
    drops: [{ id: 7, code: 'M', tier: 2, x: ship.x, y: ship.y, vy: 0, life: 9, grace: 0, mine: false }],
  };
  const next = step(state, EMPTY_INPUT, STEP);
  assert.equal(next.ship.wing, 'M');
  assert.equal(next.ship.tier, 2);
  assert.equal(next.ship.gear, null);
});

test('替主机挡一发：消耗编队、不掉命；机会用完后再挨一下才掉命', () => {
  const ship = shipWith('E1', 2, true);
  let state = step(stateWithFoe(ship), EMPTY_INPUT, STEP);
  assert.equal(state.status, 'playing', '挡下这一发不该掉命');
  assert.equal(state.ship.gearLevel, 1, '替挡消耗一架僚机');
  assert.equal(state.ship.gearGuard, false);
  assert.equal(state.ship.gear, 'E1');
  assert.ok(state.effects.some((effect) => effect.type === 'gearBlock'));

  // 挡完有一小段无敌，等它过去再撞一次。
  state = { ...state, ship: { ...state.ship, invuln: 0 }, foes: [{ id: 902, x: state.ship.x, y: state.ship.y, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 }] };
  state = step(state, EMPTY_INPUT, STEP);
  assert.equal(state.status, 'dying', '机会用完了，裸机再挨一下就该掉命');
  assert.ok(state.effects.some((effect) => effect.type === 'gearLost'));
});

test('掉命装备掉一级，复活不偷偷补回满编队', () => {
  const ship = shipWith('E3', 3, false);
  let state = step(stateWithFoe(ship), EMPTY_INPUT, STEP);
  assert.equal(state.status, 'dying');
  assert.equal(state.ship.gear, 'E3');
  assert.equal(state.ship.gearLevel, 2, '掉命掉一级，不清零');
  for (let i = 0; i < 80 && state.status === 'dying'; i += 1) state = step(state, EMPTY_INPUT, STEP);
  assert.equal(state.status, 'playing');
  assert.equal(state.ship.gearLevel, 2, '复活不该还原成进关时的三架');
});

test('装备在场上真的会开火、会蹭掉敌弹：不是纯观赏挂件', () => {
  let state = startGame(0, 'C', 'E1');
  state = { ...state, ship: { ...state.ship, gearLevel: 2 } };
  for (let i = 0; i < 30; i += 1) state = step(state, EMPTY_INPUT, STEP);
  assert.ok(state.shots.some((shot) => shot.source === 'gear'), '僚机该有自己的弹道');

  // 把一发敌弹摆进僚机的消弹圈里：下一帧它该被蹭掉并计入连消。
  const escort = escortsOf(state.ship)[0];
  const withFoe = {
    ...state,
    foes: [{ id: 990, x: escort.x, y: escort.y, vx: 0, vy: 0, hp: 1, kind: 'pellet', age: 0 }],
  };
  const next = step(withFoe, EMPTY_INPUT, STEP);
  assert.ok(next.pops > state.pops, '僚机蹭掉的敌弹要算连消');
  assert.ok(next.effects.some((effect) => effect.type === 'pop'));
});

test('装备的每个事件都在音效与震动里登记了：不会闷声合流、闷声替挡', () => {
  const events = [
    'gearCatch', 'gearSync', 'gearFull', 'gearSwap',
    'gearBlock', 'gearLost', 'gearGone', 'gearCarrier',
  ];
  for (const type of events) {
    const picks = soundsFor([{ type, code: 'E1' }]);
    assert.ok(picks.length > 0, `${type} 一声都没有`);
    for (const pick of picks) assert.ok(SOUND_NAMES.includes(pick.name), `${type} 指向了不存在的音色 ${pick.name}`);
  }
  assert.deepEqual(vibrationFor([{ type: 'gearBlock' }]), VIBRATION.gearBlock, '替挡要震得出来');
  assert.deepEqual(vibrationFor([{ type: 'gearSync' }]), VIBRATION.gearSync);
  assert.deepEqual(vibrationFor([{ type: 'gearCatch' }]), VIBRATION.gearCatch);
});
