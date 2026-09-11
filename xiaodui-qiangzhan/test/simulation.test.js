import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBullet } from '../src/game/combat.js';
import {
  MAG_SIZE,
  MATCH_SECONDS,
  MAX_HEALTH,
  RELOAD_TIME,
  RESPAWN_DELAY,
  SCORE_LIMIT,
  TEAM_ALLY,
  TEAM_ENEMY,
  UNIT_RADIUS,
} from '../src/game/rules.js';
import { STEP, createGame, playerUnit, startGame, step, togglePause } from '../src/game/simulation.js';

const idle = { move: { x: 0, y: 0 }, aimAngle: null, aimPoint: null, fire: false, focus: false, reload: false };
const input = (over = {}) => ({ ...idle, ...over });

const run = (state, frames, frameInput = idle) => {
  let next = state;
  for (let i = 0; i < frames; i += 1) next = step(next, frameInput, STEP);
  return next;
};

// 把其他人清场，只留玩家和一个靶子，好单独验证某条规则。
const duel = (seed = 1, over = {}) => {
  const base = startGame(seed);
  const units = base.units.map((unit) => {
    if (unit.isPlayer) return { ...unit, x: 8.5, y: 1.5, aim: 0, ...over };
    if (unit.id === 'enemy-0') return { ...unit, x: 14.5, y: 1.5, aim: Math.PI };
    return { ...unit, alive: false, respawnIn: 999 };
  });
  return { ...base, units };
};

// 只留玩家一个人的靶场：验证移动、弹药这类规则时不想被冷枪打断。
const solo = (seed = 1, over = {}) => {
  const base = duel(seed, over);
  return {
    ...base,
    units: base.units.map((unit) => (unit.isPlayer ? unit : { ...unit, alive: false, respawnIn: 999 })),
  };
};


test('开局是 3v3，玩家在我方一号位', () => {
  const state = createGame(42);
  assert.equal(state.status, 'ready');
  assert.equal(state.units.length, 6);
  assert.equal(state.units.filter((unit) => unit.team === TEAM_ALLY).length, 3);
  assert.equal(state.units.filter((unit) => unit.team === TEAM_ENEMY).length, 3);
  assert.equal(state.playerId, 'ally-0');
  assert.equal(playerUnit(state).health, MAX_HEALTH);
  assert.equal(state.timeLeft, MATCH_SECONDS);
});

test('没开打或暂停时状态不动', () => {
  const ready = createGame(1);
  assert.equal(step(ready, input({ fire: true }), STEP), ready);
  const paused = togglePause(startGame(1));
  assert.equal(step(paused, input({ fire: true }), STEP), paused);
});

test('同一个 seed 加同一串输入，逐字段一致', () => {
  const script = Array.from({ length: 120 }, (_, i) =>
    input({ move: { x: i % 3 === 0 ? 1 : 0, y: 0 }, fire: i % 7 === 0, aimAngle: i * 0.01 }),
  );
  const play = (seed) => script.reduce((state, frame) => step(state, frame, STEP), startGame(seed));
  assert.deepEqual(play(2024), play(2024));
  assert.notDeepEqual(play(2024).units, play(99).units, '不同 seed 应该跑出不同战局');
});

test('自由移动：推摇杆就走，撞墙停下但能沿墙滑', () => {
  const moved = run(solo(1, { x: 1.5, y: 1.5 }), 30, input({ move: { x: 1, y: 0 } }));
  assert.ok(playerUnit(moved).x > 1.5, '往右走起来了');
  const intoWall = run(solo(1, { x: 1.5, y: 1.5 }), 30, input({ move: { x: 0, y: -1 } }));
  const stopped = playerUnit(intoWall);
  assert.ok(stopped.y >= 1 + UNIT_RADIUS - 1e-6, `贴住上墙就停，实际 ${stopped.y}`);
  const slid = run(solo(1, { x: 1.5, y: 1.5 }), 30, input({ move: { x: 0.7, y: -0.7 } }));
  assert.ok(playerUnit(slid).x > 1.5, '斜着顶墙也能沿着墙滑走');
});

test('端稳会变慢，换来更小的散布', () => {
  const running = run(solo(1), 40, input({ move: { x: 1, y: 0 } }));
  const focused = run(solo(1), 40, input({ move: { x: 1, y: 0 }, focus: true }));
  assert.ok(playerUnit(focused).x < playerUnit(running).x, '端稳时脚步慢');
  assert.ok(focused.reticle.spread < running.reticle.spread, '端稳时准星更收');
  assert.ok(focused.reticle.focus > 0.9);
});

test('开火消耗子弹，射速有节奏，不是一帧一发', () => {
  const firing = run(solo(1), 10, input({ fire: true }));
  const player = playerUnit(firing);
  assert.ok(player.ammo < MAG_SIZE, '打出去了');
  assert.ok(MAG_SIZE - player.ammo <= 2, `10 帧最多两发，实际 ${MAG_SIZE - player.ammo}`);
  assert.equal(firing.stats.shots, MAG_SIZE - player.ammo, '统计和弹药对得上');
  assert.ok(player.recoil > 0, '连发会抬枪');
});

test('打空自动换弹，换完弹匣是满的', () => {
  const empty = solo(1);
  empty.units = empty.units.map((unit) => (unit.isPlayer ? { ...unit, ammo: 0 } : unit));
  const reloading = step(empty, input({ fire: true }), STEP);
  assert.ok(playerUnit(reloading).reloading > 0, '空匣自动换弹');
  const done = run(reloading, Math.ceil(RELOAD_TIME / STEP) + 2, idle);
  assert.equal(playerUnit(done).ammo, MAG_SIZE);
  assert.equal(playerUnit(done).reloading, 0);
});

test('主动换弹按下就生效，换弹期间不出枪', () => {
  const half = solo(1);
  half.units = half.units.map((unit) => (unit.isPlayer ? { ...unit, ammo: 10 } : unit));
  const state = step(half, input({ reload: true }), STEP);
  assert.ok(playerUnit(state).reloading > 0);
  const during = run(state, 6, input({ fire: true }));
  assert.equal(playerUnit(during).ammo, 10, '换弹中扣扳机没用');
  assert.equal(step(solo(1), input({ reload: true }), STEP).units[0].reloading, 0, '满匣按换弹不做无用功');
});


test('瞄准辅助锁住视线内的敌人，掩体后面就松开', () => {
  const locked = run(duel(1), 20, input({ aimAngle: 0 }));
  assert.equal(locked.reticle.targetId, 'enemy-0');
  assert.ok(locked.reticle.locked, '正对着的目标应该被咬住');
  const hidden = { ...duel(1) };
  hidden.units = hidden.units.map((unit) => (unit.id === 'enemy-0' ? { ...unit, x: 8.5, y: 8.5 } : unit));
  const free = run(hidden, 5, input({ aimAngle: 0 }));
  assert.equal(free.reticle.targetId, null);
});

test('鼠标给的场上一点会被换成枪口角', () => {
  const state = run(duel(1), 30, input({ aimPoint: { x: 8.5, y: 8.5 } }));
  const player = playerUnit(state);
  assert.ok(Math.abs(player.aim - Math.PI / 2) < 0.2, `枪口该朝下，实际 ${player.aim}`);
});

test('击杀记账：加分、进击杀播报、开始重生倒计时', () => {
  const base = duel(1);
  const staged = {
    ...base,
    units: base.units.map((unit) => (unit.id === 'enemy-0' ? { ...unit, x: 10.5, y: 1.5, health: 5 } : unit)),
    bullets: [spawnBullet(1, { id: 'ally-0', team: TEAM_ALLY, x: 9.9, y: 1.5 }, 0)],
  };
  const after = step(staged, idle, STEP);
  const victim = after.units.find((unit) => unit.id === 'enemy-0');
  assert.equal(victim.alive, false);
  assert.equal(victim.respawnIn, RESPAWN_DELAY);
  assert.equal(after.score[TEAM_ALLY], 1);
  assert.equal(after.stats.kills, 1);
  assert.ok(after.stats.score > 0);
  assert.equal(after.killfeed.length, 1);
  assert.equal(after.killfeed[0].victim, victim.name);
});

test('倒计时结束后原地复活，满血满弹', () => {
  const base = duel(1);
  const downed = {
    ...base,
    units: base.units.map((unit) =>
      unit.id === 'enemy-0' ? { ...unit, alive: false, health: 0, ammo: 0, respawnIn: 0.05 } : unit,
    ),
  };
  const back = run(downed, 6, idle).units.find((unit) => unit.id === 'enemy-0');
  assert.equal(back.alive, true);
  assert.equal(back.health, MAX_HEALTH);
  assert.equal(back.ammo, MAG_SIZE);
});

test('先到分数线就结束，领先方赢', () => {
  const base = duel(1);
  const staged = {
    ...base,
    score: { [TEAM_ALLY]: SCORE_LIMIT - 1, [TEAM_ENEMY]: 0 },
    units: base.units.map((unit) => (unit.id === 'enemy-0' ? { ...unit, x: 10.5, y: 1.5, health: 3 } : unit)),
    bullets: [spawnBullet(1, { id: 'ally-0', team: TEAM_ALLY, x: 9.9, y: 1.5 }, 0)],
  };
  const after = step(staged, idle, STEP);
  assert.equal(after.score[TEAM_ALLY], SCORE_LIMIT);
  assert.equal(after.status, 'won');
});

test('时间耗尽按比分判定，落后就是败', () => {
  const base = { ...duel(1), timeLeft: STEP / 2, score: { [TEAM_ALLY]: 2, [TEAM_ENEMY]: 5 } };
  const after = step(base, idle, STEP);
  assert.equal(after.timeLeft, 0);
  assert.equal(after.status, 'over');
});
