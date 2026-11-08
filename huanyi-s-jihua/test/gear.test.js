// 装备槽的测试。守的全是「会骗人」的部分：
// 1. 停机位挂在后侧、不越出 12.8 格判定翼展；索敌位可前出，但不出场地与活动半径；
// 2. 装备火力永远按 chip 结算，不能把「选错机翼要磨很久」稀释掉；
// 3. 挡弹与掉命的两档惩罚、跨关 carry、重试清零，都按设定走；
// 4. 新 kind 不能把旧的机翼拾取循环弄坏（同频共振 14 条回归另在 resonance.test.js）。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESCORT_HALF_W,
  ESCORT_ORBIT_R,
  ESCORT_SORTIE_PERIOD,
  ESCORT_SORTIE_REACH,
  HOMING_TURN,
  GEAR,
  GEAR_CODES,
  MAX_FORMATION,
  escortSortie,
  escortWithinField,
  escortWorld,
  escortsOf,
  escortWithinSpan,
  gearAfterBlock,
  gearAfterLoss,
  gearFields,
  gearLine,
  gearPick,
  gearSpec,
  gearVolley,
  steerHoming,
} from '../src/game/gear.js';
import { WING_HALF_W } from '../src/game/rules.js';
import { makeEnemy } from '../src/game/enemies.js';
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

test('单架僚机站在斜后方：弹道不和主机直射弹重叠', () => {
  for (const code of GEAR_CODES) {
    const ship = shipWith(code, 1);
    const [escort] = escortsOf(ship);
    // 站在正后方（dx = 0）时僚机弹与主机加农炮的弹列完全重合，加色叠成一列白光，
    // 实机截图里就是「僚机没有子弹」。偏出去两格以上才有自己那条轨道。
    assert.ok(Math.abs(escort.x - ship.x) >= 2,
      `${code} 单架又回到正后方，弹道会被主机弹列淹没`);
    assert.ok(escort.y > ship.y, `${code} 仍要挂在后侧`);
    assert.ok(escortWithinSpan(ship), `${code} 偏移后仍要守住判定翼展`);
    const [shot] = gearVolley(ship, 1).shots;
    assert.equal(shot.x, escort.x, '子弹得从僚机自己那条轨道上出来');
  }
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

// ——— 自主索敌走位：僚机不是钉在尾巴上的固定炮台 ———

const worldWith = (time, targets) => ({ time, targets });

test('escortWorld：Boss 优先、只认主机上方的目标、近的排前面', () => {
  const ship = shipWith('E1', 3);
  const state = {
    ship,
    elapsed: 7.2,
    boss: null,
    enemies: [
      { x: 20, y: 40, hp: 1, kind: 'zako' },
      { x: 70, y: 95, hp: 1, kind: 'diver' },   // 离玩家最近
      { x: 40, y: 130, hp: 1, kind: 'zako' },   // 在主机身后，排除
      { x: 60, y: 60, hp: 0, kind: 'carrier' }, // 已死，排除
    ],
  };
  const world = escortWorld(state);
  assert.equal(world.time, 7.2);
  assert.deepEqual(world.targets.map((t) => t.kind), ['diver', 'zako']);
  assert.ok(world.targets.every((t) => t.y < ship.y - 6));

  const withBoss = escortWorld({ ...state, boss: { x: 50, y: 28, entering: false, dying: false } });
  assert.equal(withBoss.targets[0].kind, 'boss', 'Boss 在场就先集火 Boss');
  assert.deepEqual(escortWorld({ ...state, enemies: [], boss: null }).targets, []);
  assert.deepEqual(
    escortWorld({ ...state, boss: { x: 50, y: 28, entering: true, dying: false } })
      .targets.map((t) => t.kind),
    ['diver', 'zako'],
    '入场中 / 死亡过载的 Boss 还不算目标',
  );
});

test('走位相位连续、每架错相：位置不会整队一起瞬移', () => {
  for (let i = 0; i <= 200; i += 1) {
    const t = (i / 200) * ESCORT_SORTIE_PERIOD;
    const a = escortSortie(t, 0, 3);
    const b = escortSortie(t + STEP, 0, 3);
    assert.ok(a >= 0 && a <= 1, `${t.toFixed(2)}s 相位越界`);
    assert.ok(Math.abs(b - a) < 0.06, `${t.toFixed(2)}s 相位跳变了`);
  }
  assert.ok(escortSortie(ESCORT_SORTIE_PERIOD * 0.35, 0, 3) > 0.9, '周期中段该在前出');
  assert.ok(escortSortie(0, 0, 3) < 0.01, '周期开头该回到护卫位');
  assert.notEqual(
    escortSortie(ESCORT_SORTIE_PERIOD * 0.1, 0, 3),
    escortSortie(ESCORT_SORTIE_PERIOD * 0.1, 1, 3),
    '两架要错开相位，轮流散开',
  );
});

test('E2 游猎：周期性前出到主机前方、横向对齐敌舰，相位为 0 时回防', () => {
  const ship = shipWith('E2', 1);
  const target = { x: 22, y: 38, kind: 'carrier' };
  const world = worldWith(ESCORT_SORTIE_PERIOD * 0.35, [target]);
  const [escort] = escortsOf(ship, world);
  assert.equal(escort.formation, 'sortie');
  assert.ok(escort.y < ship.y - 8, '索敌位必须在主机前方，不能还钉在正后方');
  assert.ok(escort.y >= ship.y - ESCORT_SORTIE_REACH - 2, '也不许前出到看不见的地方');
  assert.ok(Math.abs(escort.x - target.x) < Math.abs(ship.x - target.x), '要朝目标那一列靠过去');
  assert.ok(escort.sortie > 0.9);
  assert.deepEqual(escort.target, target);
  assert.ok(escortWithinField(ship, world));

  // 相位回到 0 / 没有目标，位置与改动前逐字段一致。旧调用方一律不受影响。
  assert.deepEqual(escortsOf(ship, worldWith(0, [target])), escortsOf(ship));
  assert.deepEqual(escortsOf(ship, worldWith(10, [])), escortsOf(ship));
  assert.ok(escortWithinSpan(ship), '停机位仍守住 12.8 格判定翼展');
});

test('三型各走各的伴飞阵型：左右侧翼 / 前方游猎 / 环绕', () => {
  const target = { x: 22, y: 38, kind: 'carrier' };
  const time = ESCORT_SORTIE_PERIOD * 0.35;
  const at = (code, level, t = time) =>
    escortsOf(shipWith(code, level), worldWith(t, [target]));

  // E1：分列主机两侧，明显跑到机翼之外，但纵向仍贴着主机（不前出几十格）。
  const flank = at('E1', 3);
  assert.ok(flank.some((e) => e.x < 50 - WING_HALF_W), '得有左翼');
  assert.ok(flank.some((e) => e.x > 50 + WING_HALF_W), '得有右翼');
  assert.ok(flank.every((e) => Math.abs(e.y - 124) < 10), '侧翼只是左右，不远离主机');

  // E2：整队往主机前方压过去，是唯一真正「前出」的一型。
  assert.ok(at('E2', 3).some((e) => e.y < 124 - ESCORT_SORTIE_REACH * 0.6), '至少一架明显前出');
  assert.ok(at('E1', 3).every((e) => e.y > 124 - ESCORT_SORTIE_REACH * 0.6), '侧翼不该跟着前出');

  // E3：绕圈，不同时刻会依次经过主机的左 / 右 / 前 / 后。
  const samples = [0, 0.6, 1.2, 1.8, 2.4, 3.0].map((t) => at('E3', 1, t)[0]);
  assert.ok(samples.some((e) => e.x < 50), '环绕得经过左侧');
  assert.ok(samples.some((e) => e.x > 50), '环绕得经过右侧');
  assert.ok(samples.some((e) => e.y < 124), '环绕得经过前方');
  assert.ok(samples.some((e) => e.y > 124), '环绕得经过后方');
  assert.ok(samples.every((e) => {
    const r = Math.hypot(e.x - 50, e.y - 124);
    return r > 3 && r < ESCORT_ORBIT_R + 4;
  }), '环绕别甩出主机那一屏，也别缩成一点');

  // 同一时刻、同一目标，三型的伴飞位不能重合——换装备得换站位。
  const same = GEAR_CODES.map((code) => at(code, 1)[0]);
  assert.equal(new Set(same.map((e) => `${e.x.toFixed(2)}/${e.y.toFixed(2)}`)).size, 3);
  assert.deepEqual(same.map((e) => e.formation), ['flank', 'sortie', 'orbit']);
  // 没有目标时三型一起回后侧停机位，这就是第四种站位「后方」。
  for (const code of GEAR_CODES) {
    const ship = shipWith(code, 3);
    assert.deepEqual(escortsOf(ship, worldWith(10, [])), escortsOf(ship));
    assert.ok(escortWithinSpan(ship), `${code} 停机位仍守住判定翼展`);
  }
});

test('三型各级、各相位走位都不飞出场地、不甩出主机那一屏', () => {
  const targets = [
    { x: 4, y: 10, kind: 'zako' },
    { x: 96, y: 118, kind: 'diver' },
    { x: 50, y: 26, kind: 'boss' },
  ];
  for (const code of GEAR_CODES) {
    for (let level = 1; level <= MAX_FORMATION; level += 1) {
      for (let i = 0; i <= 60; i += 1) {
        const ship = {
          ...shipWith(code, level),
          x: 50 + ((i % 3) - 1) * 30,
          y: 100 + (i % 5) * 9,
        };
        const world = worldWith((i / 60) * ESCORT_SORTIE_PERIOD * 2, targets);
        assert.equal(escortsOf(ship, world).length, level);
        assert.ok(escortWithinField(ship, world), `${code} ×${level} 第 ${i} 帧飞出了活动半径`);
      }
    }
  }
});

test('索敌瞄准只改弹道方向，火力契约一条都没松', () => {
  const ship = shipWith('E2', 3);
  const world = worldWith(ESCORT_SORTIE_PERIOD * 0.35, [
    { x: 18, y: 40, kind: 'carrier' },
    { x: 84, y: 60, kind: 'zako' },
  ]);
  const escorts = escortsOf(ship, world);
  const { shots } = gearVolley(ship, 10, world);
  assert.equal(shots.length, 3, '弹数仍恒等于编队数');
  for (const [i, shot] of shots.entries()) {
    assert.equal(shot.x, escorts[i].x, '弹得从僚机自己那条轨道上出来');
    assert.equal(shot.chipOnly, true);
    assert.ok(Math.abs(shot.vx) < 40, '瞄准修正不能碰巧打进 side 弱点');
    assert.equal(bossShotMultiplier('side', shot), WEAKNESS.side.chip);
    assert.equal(reachesWeakness('side', shot), false);
    assert.ok(shot.dmg < 1, '伤害仍比主机弹低一档');
  }
  assert.ok(shots.some((shot) => ![18, -18].includes(shot.vx)), '弹道里要有朝目标收拢的分量');
});

test('simulation 真的把战况接进开火：有从主机前方索敌位打出去的弹', () => {
  // 一架打不死的运载舰，保证整段窗口里 targets 一直非空。
  const foe = {
    ...makeEnemy('carrier', 9001, 24, 44, { tune: { hp: 1, fire: 0, speed: 1 } }),
    hp: 1e6,
  };
  let state = startGame(0, 'C', 'E1');
  state = { ...state, ship: { ...state.ship, gearLevel: 3 }, enemies: [foe] };
  // 前出窗口是周期 4.4s 的 0.88~2.55s；跑 2.2s 正好覆盖一轮咬住目标。
  // 不能只看最后一帧：从前方发出的弹更快飞出屏幕上边界，快照里只剩停机位的弹。
  const births = [];
  const seen = new Set();
  for (let i = 0; i < 132; i += 1) {
    state = step(state, EMPTY_INPUT, STEP);
    for (const shot of state.shots) {
      if (shot.source !== 'gear' || seen.has(shot.id)) continue;
      seen.add(shot.id);
      births.push({ x: shot.x - shot.vx * shot.age, y: shot.y - shot.vy * shot.age });
    }
  }
  assert.ok(births.length >= 9, `僚机得连续打了好几轮，实际 ${births.length} 发`);
  assert.ok(
    births.some((birth) => birth.y < state.ship.y - 4),
    '得有从主机前方发出的，不是全钉在尾巴上',
  );
  assert.ok(
    births.some((birth) => Math.abs(birth.x - state.ship.x) > 6.5),
    '也得有一发横向跑出了停机位的翼展',
  );
});

test('只有游猎僚机发巡航导弹：追踪标记、chipOnly 与生成横速都不破例', () => {
  const world = worldWith(ESCORT_SORTIE_PERIOD * 0.35, [{ x: 22, y: 38, kind: 'carrier' }]);
  const flags = GEAR_CODES.map((code) => gearVolley(shipWith(code, 1), 1, world).shots[0].homing);
  assert.deepEqual(flags, [false, true, false], '只有 E2 带追踪');
  const missile = gearVolley(shipWith('E2', 3), 1, world).shots;
  assert.equal(missile.length, 3, '追踪不改弹数');
  for (const shot of missile) {
    assert.equal(shot.chipOnly, true, '追踪弹打 Boss 仍只按 chip');
    assert.ok(Math.abs(shot.vx) < 40, '生成时仍不能碰巧打进侧面弱点');
    assert.equal(bossShotMultiplier('side', shot), WEAKNESS.side.chip);
  }
});

test('巡航导弹朝目标转向：速度大小不变、单帧转角封顶、角度收敛', () => {
  const world = worldWith(ESCORT_SORTIE_PERIOD * 0.35, [{ x: 20, y: 40, kind: 'carrier' }]);
  const shot = gearVolley(shipWith('E2', 1), 1, world).shots[0];
  const target = { x: 86, y: 34 }; // 故意放在侧上方，逼它掉头
  const speed = Math.hypot(shot.vx, shot.vy);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const miss = (s) => Math.abs(wrap(
    Math.atan2(target.y - s.y, target.x - s.x) - Math.atan2(s.vy, s.vx),
  ));
  const before = miss(shot);
  let cur = { ...shot };
  let maxTurn = 0;
  for (let i = 0; i < 30; i += 1) {
    const v = steerHoming(cur, target, STEP);
    maxTurn = Math.max(maxTurn, Math.abs(wrap(Math.atan2(v.vy, v.vx) - Math.atan2(cur.vy, cur.vx))));
    cur = { ...cur, ...v, x: cur.x + v.vx * STEP, y: cur.y + v.vy * STEP };
  }
  assert.ok(Math.abs(Math.hypot(cur.vx, cur.vy) - speed) < 1e-6, '转向不改速度大小');
  assert.ok(maxTurn <= HOMING_TURN * STEP + 1e-6, '单帧转角不许超过上限，得是「追」不是瞬移');
  assert.ok(miss(cur) < before, '方向要朝目标收敛');
});

test('simulation 把巡航导弹接进了飞行：同一发弹的横速会随目标变', () => {
  const foe = {
    ...makeEnemy('carrier', 9002, 84, 40, { tune: { hp: 1, fire: 0, speed: 1 } }),
    hp: 1e6,
  };
  let state = startGame(0, 'C', 'E2');
  state = { ...state, ship: { ...state.ship, gearLevel: 1 }, enemies: [foe] };
  const track = new Map();
  let changed = 0;
  for (let i = 0; i < 90; i += 1) {
    state = step(state, EMPTY_INPUT, STEP);
    for (const shot of state.shots) {
      if (!shot.homing) continue;
      const prev = track.get(shot.id);
      if (prev !== undefined && Math.abs(shot.vx - prev) > 0.5) changed += 1;
      track.set(shot.id, shot.vx);
    }
  }
  assert.ok(track.size > 0, '得打出巡航导弹');
  assert.ok(changed > 0, '导弹得真的在逐帧拐弯，不是一条直线');
});
