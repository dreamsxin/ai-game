import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVE_TIME,
  FIELD_H,
  FIELD_W,
  HULL_GUN,
  START_LIVES,
  WING_HALF_W,
} from '../src/game/rules.js';
import {
  EMPTY_INPUT,
  STEP,
  advance,
  chooseWing,
  createGame,
  hitBoxes,
  orbsOf,
  startGame,
  step,
  togglePause,
} from '../src/game/simulation.js';
import { MAX_TIER, WINGS, wingAtTier } from '../src/game/wings.js';
import { LEVELS, bossAt, levelAt } from '../src/game/levels.js';
import { makeEnemy } from '../src/game/enemies.js';

const JET = { ...EMPTY_INPUT, jettison: true };

const run = (state, frames, input = EMPTY_INPUT) => {
  let next = state;
  for (let i = 0; i < frames; i += 1) next = step(next, input, STEP);
  return next;
};

const types = (state) => state.effects.map((effect) => effect.type);

/** 把一关直接推到 Boss 出场那一刻，省掉前面的杂兵。 */
const atBoss = (index, wing) => {
  const level = levelAt(index);
  const state = startGame(index, wing);
  return { ...state, time: bossAt(level) - 0.02, waveIndex: level.waves.length, enemies: [] };
};

test('第 1 关开局停在选翼界面，选完才开打', () => {
  const state = createGame(0);
  assert.equal(state.status, 'ready');
  const fresh = startGame(0);
  assert.equal(fresh.status, 'select', '每章第一关必须先回答「这一关带什么翅膀」');
  assert.equal(fresh.ship.wing, null);
  const picked = chooseWing(fresh, 'H');
  assert.equal(picked.status, 'playing');
  assert.equal(picked.ship.wing, 'H');
  assert.equal(picked.entryWing, 'H', '复活要还原成这一关带进来的那只');
});

test('选翼界面只认识存在的机翼，也不接受别的状态下按', () => {
  const fresh = startGame(0);
  assert.equal(chooseWing(fresh, '不存在'), fresh);
  const playing = chooseWing(fresh, 'C');
  assert.equal(chooseWing(playing, 'J'), playing, '开打之后不能靠选翼界面白拿一只翅膀');
});

test('同一关加同一串输入，跑出来逐字段一致', () => {
  const a = run(startGame(2, 'J'), 600);
  const b = run(startGame(2, 'J'), 600);
  assert.equal(a.score, b.score);
  assert.equal(a.lives, b.lives);
  assert.deepEqual(a.ship, b.ship);
  assert.deepEqual(a.enemies.map((item) => [item.id, item.x, item.y]), b.enemies.map((item) => [item.id, item.x, item.y]));
  assert.deepEqual(a.foes.map((item) => [item.x, item.y]), b.foes.map((item) => [item.x, item.y]));
});

test('带着机翼受击面积更大——多出来的那一截就是机翼本身', () => {
  const winged = hitBoxes({ x: 50, y: 120, wing: 'C' });
  const bare = hitBoxes({ x: 50, y: 120, wing: null });
  assert.equal(bare.length, 1);
  assert.equal(winged.length, 2);
  assert.equal(winged[1].w, WING_HALF_W);
  assert.ok(winged[1].w > bare[0].w * 2, '机翼那一块要明显宽过主机');
});

test('弃翼：翅膀脱手往上飘，主机换来一段无敌', () => {
  const before = chooseWing(startGame(0), 'C');
  const after = step(before, JET, STEP);
  assert.equal(after.ship.wing, null);
  assert.ok(after.ship.dive > DIVE_TIME - 0.05, '下潜时间应该刚点满');
  assert.ok(after.ship.invuln > 0, '下潜期间打不到你');
  assert.equal(after.drops.length, 1);
  assert.equal(after.drops[0].code, 'C');
  assert.ok(after.drops[0].vy < 0, '脱下来的翼要往上飘');
  assert.ok(types(after).includes('jettison'));
});

test('没翼可弃时按下去只会得到一声空响，状态一点不变', () => {
  const bare = { ...chooseWing(startGame(0), 'C'), ship: { ...chooseWing(startGame(0), 'C').ship, wing: null } };
  const after = step(bare, JET, STEP);
  assert.equal(after.ship.wing, null);
  assert.equal(after.drops.length, 0);
  assert.ok(types(after).includes('deny'));
});

test('刚接上的机翼有一小段锁定，不然靠连点能刷出无限无敌', () => {
  const state = chooseWing(startGame(0), 'C');
  const locked = { ...state, ship: { ...state.ship, lock: 0.3 } };
  const after = step(locked, JET, STEP);
  assert.equal(after.ship.wing, 'C', '锁定期间弃不掉');
  assert.ok(types(after).includes('deny'));
});

test('脱手的机翼飘得比主机快，追上去才接得回来', () => {
  const state = chooseWing(startGame(0), 'C');
  const dropped = step(state, JET, STEP);
  // 站着不动接不回来：翅膀会甩开你。
  const idle = run(dropped, 24);
  assert.equal(idle.ship.wing, null, '弃翼不该退化成一个白拿无敌的按钮');

  // 盯着翅膀追就能抢回来，而往上追正是敌人来的方向——这才是那笔交易。
  let chasing = dropped;
  for (let i = 0; i < 90 && !chasing.ship.wing; i += 1) {
    const target = chasing.drops[0];
    const dy = target ? Math.max(-1.2, Math.min(1.2, (target.y - chasing.ship.y) / 6)) : 0;
    chasing = step(chasing, { ...EMPTY_INPUT, drag: { dx: 0, dy } }, STEP);
  }
  assert.equal(chasing.ship.wing, 'C');
  assert.ok(chasing.ship.lock > 0, '刚接上要有一小段锁定');
});

test('机翼飘出画面就真没了，这就是「卖翅膀」的代价', () => {
  const state = chooseWing(startGame(0), 'C');
  const dropped = step(state, JET, STEP);
  // 主机往下躲开，让翅膀一路飘出上边界。
  const away = run(dropped, 300, { ...EMPTY_INPUT, drag: { dx: 0, dy: 0.4 } });
  assert.equal(away.drops.length, 0);
  assert.equal(away.ship.wing, null);
});

test('没有机翼时只剩主机小炮：冷却更长、伤害更低', () => {
  const bareState = startGame(1, null);
  const armed = chooseWing({ ...bareState, status: 'select' }, 'C');
  const bare = { ...bareState, status: 'playing', ship: { ...bareState.ship, wing: null } };
  const bareShots = run(bare, 60).shots.length;
  const armedShots = run(armed, 60).shots.length;
  assert.ok(armedShots > bareShots, '加农炮一秒内出膛数要多过小炮');
  assert.ok(HULL_GUN.cool > WINGS.C.cool * 2);
});

/** 造一个贴脸的敌弹，用来测挨打。invuln 归零，免得无敌把测试吃掉。 */
const withFoeOnShip = (state) => ({
  ...state,
  ship: { ...state.ship, invuln: 0, dive: 0 },
  foes: [{ id: 900, x: state.ship.x, y: state.ship.y, vx: 0, vy: 10, hp: 1, kind: 'pellet', age: 0 }],
  enemies: [],
});

test('机翼就是装甲：带翼被打中只掉翼，命一条不少', () => {
  const armed = withFoeOnShip(chooseWing(startGame(0), 'C'));
  const after = step(armed, EMPTY_INPUT, STEP);
  assert.equal(after.lives, START_LIVES, '带着翅膀挨一下不该掉命');
  assert.equal(after.ship.wing, null);
  assert.ok(after.ship.invuln > 0, '掉翼之后要给一段无敌，不然会被同一串弹幕连着打死');
  assert.ok(types(after).includes('wingLost'));
  // 被崩掉的翼变成一枚还能捡回来的道具：你有一次抢回来的机会。
  assert.equal(after.drops.length, 1);
  assert.equal(after.drops[0].code, 'C');
});

test('裸机被打中才掉命', () => {
  const armed = chooseWing(startGame(0), 'C');
  const bare = withFoeOnShip({ ...armed, ship: { ...armed.ship, wing: null } });
  const after = step(bare, EMPTY_INPUT, STEP);
  assert.equal(after.lives, START_LIVES - 1);
  assert.equal(after.status, 'dying');
  assert.ok(types(after).includes('die'));
});

test('弃翼换来的下潜期真的打不到：这就是拿火力换的东西', () => {
  const armed = chooseWing(startGame(0), 'C');
  const diving = step(armed, JET, STEP);
  const under = { ...diving, foes: [{ id: 901, x: diving.ship.x, y: diving.ship.y, vx: 0, vy: 10, hp: 1, kind: 'pellet', age: 0 }] };
  const after = step(under, EMPTY_INPUT, STEP);
  assert.equal(after.lives, START_LIVES);
  assert.ok(!types(after).includes('die'));
  assert.ok(after.ship.dive > 0);
});

test('复活会还原成这一关带进来的那只翅膀，不留死亡螺旋', () => {
  const armed = chooseWing(startGame(0), 'J');
  const bare = withFoeOnShip({ ...armed, ship: { ...armed.ship, wing: null } });
  const dying = step(bare, EMPTY_INPUT, STEP);
  assert.equal(dying.status, 'dying');
  const revived = run(dying, 90);
  assert.equal(revived.status, 'playing');
  assert.equal(revived.ship.wing, 'J');
  assert.equal(revived.foes.length, 0, '复活时要清场，别让人在弹幕正中重开');
});

test('命打光就是任务失败', () => {
  const armed = chooseWing(startGame(0), 'C');
  let state = { ...armed, lives: 1, ship: { ...armed.ship, wing: null } };
  state = step(withFoeOnShip(state), EMPTY_INPUT, STEP);
  assert.equal(state.status, 'over');
  assert.equal(state.lives, 0);
  assert.equal(state.stars, 0);
});

test('敌弹能被火力打掉，连消越多分数越高', () => {
  const armed = chooseWing(startGame(0), 'C');
  const ship = armed.ship;
  // 在船正上方摆三发敌弹，火力打上去就该一发一发消掉。
  const foes = [0, 1, 2].map((i) => ({
    id: 800 + i,
    x: ship.x,
    y: ship.y - 12 - i * 6,
    vx: 0,
    vy: 0,
    hp: 1,
    kind: 'pellet',
    age: 0,
  }));
  const state = { ...armed, foes, enemies: [] };
  const after = run(state, 30);
  assert.equal(after.foes.length, 0, '三发都该被打掉');
  assert.equal(after.pops, 3);
  assert.ok(after.bestChain >= 3, '连消数要记下来');
  assert.ok(after.score > 0);
});

test('挨打会把连消清零：压弹幕压得再顺，被打一下就白攒了', () => {
  const armed = chooseWing(startGame(0), 'C');
  const state = withFoeOnShip({ ...armed, chain: 5 });
  const after = step(state, EMPTY_INPUT, STEP);
  assert.equal(after.chain, 0);
  assert.ok(after.bestChain >= 5, '历史最好成绩要留着');
});

test('铁球机翼绕着主机转，没这项的机翼一颗都不给', () => {
  assert.equal(orbsOf({ x: 50, y: 120, wing: 'H', orbAngle: 0 }).length, WINGS.H.orbs);
  assert.equal(orbsOf({ x: 50, y: 120, wing: 'C', orbAngle: 0 }).length, 0);
});

test('暂停不推进世界，恢复了才接着走', () => {
  const armed = chooseWing(startGame(0), 'C');
  const running = run(armed, 60);
  const paused = togglePause(running);
  assert.equal(paused.status, 'paused');
  const still = run(paused, 60);
  assert.equal(still.time, paused.time, '暂停期间时间不该走');
  assert.equal(togglePause(still).status, 'playing');
});

test('撞进跳关门就跳 4 关，跳关奖励入账、Boss 一点没削弱', () => {
  const level = levelAt(1);
  const state = { ...startGame(1, 'S'), gate: { x: 50, y: 124, w: 24, h: 9 }, enemies: [], waveIndex: level.waves.length };
  const after = step({ ...state, ship: { ...state.ship, x: 50, y: 124 } }, EMPTY_INPUT, STEP);
  assert.equal(after.status, 'clear');
  assert.equal(after.skipped, true);
  assert.ok(after.score > 0);
  assert.ok(types(after).includes('skip'));
  const nextLevel = advance(after);
  assert.equal(nextLevel.levelIndex, 5, '第 2 关的门通到第 6 关');
  assert.equal(nextLevel.ship.wing, 'S', '跳关不会没收你的翅膀');
});

test('打掉 Boss 才算过关，过关后带着战果进下一关', () => {
  let state = atBoss(0, 'C');
  state = run(state, 240);
  assert.ok(state.boss, 'Boss 该已经出场了');
  // 直接把 Boss 打到没血，省掉十几秒的实弹测试。
  state = step({ ...state, boss: { ...state.boss, hp: 0, entering: false } }, EMPTY_INPUT, STEP);
  assert.equal(state.status, 'clear');
  assert.equal(state.skipped, false);
  assert.ok(types(state).includes('bossKill'));
  assert.ok(state.stars > 0, '过关至少一星');

  const nextLevel = advance(state);
  assert.equal(nextLevel.levelIndex, 1);
  assert.equal(nextLevel.score, state.score, '分数要带过去');
  assert.equal(nextLevel.lives, state.lives);
  assert.equal(nextLevel.ship.wing, 'C', '上一关剩下的翅膀继续挂着');
  assert.equal(nextLevel.status, 'playing', '第 2 关不是选翼关，直接开打');
});

test('每章第一关一定会再问一次带什么翅膀', () => {
  const state = { ...startGame(3, 'D'), status: 'clear', skipped: false };
  const chapterStart = advance(state);
  assert.equal(chapterStart.levelIndex, 4);
  assert.equal(chapterStart.status, 'select', '进新章要重新做一次配置决策');
  assert.equal(chapterStart.ship.wing, 'D', '选之前身上还是上一关那只');
});

test('打完最后一关就是全线通关，剩下的命折成分', () => {
  const last = LEVELS.length - 1;
  const state = { ...startGame(last, 'J'), status: 'clear', lives: 2, score: 1000 };
  const won = advance(state);
  assert.equal(won.status, 'won');
  assert.ok(won.score > 1000, '剩命要折成奖励分');
  assert.ok(won.stars >= 2);
});

test('非 playing 状态不推进世界，effects 也会被清空', () => {
  const armed = chooseWing(startGame(0), 'C');
  const clear = { ...armed, status: 'clear', effects: [{ type: 'clear' }] };
  const after = step(clear, EMPTY_INPUT, STEP);
  assert.equal(after.status, 'clear');
  assert.deepEqual(after.effects, []);
  assert.equal(FIELD_H > 0, true);
});

/** 在船身边放一枚机翼道具，用来测捡翼、换装和进化。 */
const withDrop = (state, code, tier = 1) => ({
  ...state,
  drops: [{ id: 700, code, tier, x: state.ship.x, y: state.ship.y, vy: 0, life: 5, grace: 0, mine: false }],
  enemies: [],
  foes: [],
});

test('捡到同型号的机翼就进化：冷却更短、每发更重', () => {
  const armed = chooseWing(startGame(0), 'C');
  assert.equal(armed.ship.tier, 1);
  const after = step(withDrop(armed, 'C'), EMPTY_INPUT, STEP);
  assert.equal(after.ship.tier, 2);
  assert.equal(after.ship.wing, 'C');
  assert.ok(after.score > armed.score, '进化要给分');
  assert.ok(types(after).includes('evolve'));
  assert.ok(wingAtTier('C', 2).cool < wingAtTier('C', 1).cool);
});

test('进化到顶就不再往上，也不会静默地吞掉道具', () => {
  const armed = chooseWing(startGame(0), 'C');
  const topped = { ...armed, ship: { ...armed.ship, tier: MAX_TIER } };
  const after = step(withDrop(topped, 'C'), EMPTY_INPUT, STEP);
  assert.equal(after.ship.tier, MAX_TIER);
  assert.ok(types(after).includes('topped'));
  assert.ok(!types(after).includes('evolve'));
});

test('换成别的型号是从头再来：新翼是 Mk.I，旧翼带着攒下的阶级脱手', () => {
  const armed = chooseWing(startGame(0), 'C');
  const veteran = { ...armed, ship: { ...armed.ship, tier: 3 } };
  const after = step(withDrop(veteran, 'J'), EMPTY_INPUT, STEP);
  assert.equal(after.ship.wing, 'J');
  assert.equal(after.ship.tier, 1, '换型号不该继承阶级');
  assert.ok(types(after).includes('swap'));
  const dropped = after.drops.find((item) => item.code === 'C');
  assert.ok(dropped, '旧翼要原地脱手');
  assert.equal(dropped.tier, 3, '脱手的旧翼带着它攒的阶级——追回来还是 Mk.III');
});

test('弃翼扔掉的是一整套投资：脱落的道具带着阶级', () => {
  const armed = chooseWing(startGame(0), 'C');
  const veteran = { ...armed, ship: { ...armed.ship, tier: 3 } };
  const after = step(veteran, JET, STEP);
  assert.equal(after.drops[0].tier, 3);
  assert.equal(after.ship.tier, 1, '手上没翼了，阶级也就归零');
});

test('掉命会把攒下来的阶级还原：复活只给这一关带进来的 Mk.I', () => {
  const armed = chooseWing(startGame(0), 'J');
  const veteran = { ...armed, ship: { ...armed.ship, tier: 3, wing: null } };
  const dying = step(withFoeOnShip(veteran), EMPTY_INPUT, STEP);
  const revived = run(dying, 90);
  assert.equal(revived.ship.wing, 'J');
  assert.equal(revived.ship.tier, 1);
});

test('进化后的火力真的更密：同样一秒里出膛数更多', () => {
  const one = { ...startGame(1, 'C'), enemies: [], foes: [] };
  const three = { ...one, ship: { ...one.ship, tier: 3 } };
  // nextId 每生成一发子弹就往前走一格，清了敌人之后它就是「这一秒出了多少膛」。
  const fired = (state) => run(state, 60).nextId - state.nextId;
  assert.ok(fired(three) > fired(one), `Mk.III 一秒该比 Mk.I 出得多（${fired(three)} vs ${fired(one)}）`);
});

test('引力井把敌弹拽进井心湮灭——这是实验机翼那条路的核心', () => {
  const armed = chooseWing(startGame(0), 'G');
  const ship = armed.ship;
  // 在船正上方摆一圈敌弹，井飞上去应该一路吃掉它们。
  const foes = [-6, -2, 2, 6].map((dx, i) => ({
    id: 600 + i,
    x: ship.x + dx,
    y: ship.y - 24,
    vx: 0,
    vy: 0,
    hp: 1,
    kind: 'pellet',
    age: 0,
  }));
  const after = run({ ...armed, foes, enemies: [] }, 60);
  assert.equal(after.foes.length, 0, '井扫过的地方不该剩下敌弹');
  assert.ok(after.pops >= 4);
});

test('链弧炮命中后会跳到旁边的敌人身上', () => {
  const armed = chooseWing(startGame(0), 'Z');
  const ship = armed.ship;
  const enemies = [0, 9].map((dx, i) => makeEnemy('zako', 500 + i, ship.x + dx, ship.y - 26));
  let state = { ...armed, enemies, foes: [] };
  let arcs = 0;
  for (let i = 0; i < 60; i += 1) {
    state = step(state, EMPTY_INPUT, STEP);
    arcs += state.effects.filter((effect) => effect.type === 'arc').length;
  }
  assert.ok(arcs > 0, '一发都没跳');
  // 两只都该掉过血——第二只是电弧跳过去打的，子弹本身只碰到第一只。
  const untouched = state.enemies.filter((enemy) => enemy.hp >= enemy.maxHp).length;
  assert.equal(untouched, 0, '旁边那只没吃到电弧');
});

test('反物质弹炸开成一圈碎片，碎片也能打掉敌弹', () => {
  const armed = chooseWing(startGame(0), 'X');
  const ship = armed.ship;
  const enemies = [makeEnemy('zako', 400, ship.x, ship.y - 20)];
  let state = { ...armed, enemies, foes: [] };
  let burst = false;
  for (let i = 0; i < 60 && !burst; i += 1) {
    state = step(state, EMPTY_INPUT, STEP);
    burst = types(state).includes('burst');
  }
  assert.ok(burst, '反物质弹该炸开');
  assert.ok(state.shots.some((shot) => shot.kind === 'shard'), '炸开要留下碎片');
});

test('量子分身在场地另一侧同步开火', () => {
  const armed = chooseWing(startGame(0), 'Q');
  const off = { ...armed, ship: { ...armed.ship, x: 20 }, enemies: [], foes: [] };
  const after = step(off, EMPTY_INPUT, STEP);
  const echoes = after.shots.filter((shot) => shot.echo);
  assert.ok(echoes.length > 0, '分身没开火');
  // 分身的位置是本体关于场地中线的镜像。
  assert.ok(echoes.every((shot) => shot.x > FIELD_W / 2), '分身该在另一侧');
});
