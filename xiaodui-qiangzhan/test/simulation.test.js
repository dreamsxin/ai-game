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

// 下面几条守着反馈层要用的字段。少一个 mine，满场交火时就分不出是谁在开枪。
test('枪声带 mine：我的枪和别人的枪必须分得开', () => {
  // effects 只装这一 tick 新发生的事，所以要取开枪那一帧，不是第四帧。
  const mine = step(solo(1), input({ fire: true }), STEP).effects.filter((e) => e.type === 'shot');
  assert.ok(mine.length > 0, '开火了却没有 shot 事件');
  assert.ok(mine.every((e) => e.mine === true));
  // 机器人也会开枪，那些不是我的。
  let others = [];
  let state = startGame(7);
  for (let i = 0; i < 600 && others.length === 0; i += 1) {
    state = step(state, idle, STEP);
    others = state.effects.filter((e) => e.type === 'shot' && !e.mine);
  }
  assert.ok(others.length > 0, '跑了 10 秒也没等到机器人开枪');
});

test('换弹发事件，打空和主动换弹用 dry 分开，上膛完成另发一条', () => {
  const empty = solo(1);
  empty.units = empty.units.map((unit) => (unit.isPlayer ? { ...unit, ammo: 0 } : unit));
  const forced = step(empty, input({ fire: true }), STEP).effects.find((e) => e.type === 'reload');
  assert.deepEqual(forced, { type: 'reload', mine: true, dry: true });

  const half = solo(1);
  half.units = half.units.map((unit) => (unit.isPlayer ? { ...unit, ammo: 10 } : unit));
  const started = step(half, input({ reload: true }), STEP);
  assert.deepEqual(
    started.effects.find((e) => e.type === 'reload'),
    { type: 'reload', mine: true, dry: false },
  );
  const done = run(started, Math.ceil(RELOAD_TIME / STEP) + 2, idle);
  assert.equal(playerUnit(done).ammo, MAG_SIZE);
  // ready 是换弹那段空窗期结束的唯一凭证，逐帧扫一遍确认它真的发过。
  let sawReady = false;
  let scan = started;
  for (let i = 0; i < Math.ceil(RELOAD_TIME / STEP) + 2; i += 1) {
    scan = step(scan, idle, STEP);
    if (scan.effects.some((e) => e.type === 'ready' && e.mine)) sawReady = true;
  }
  assert.ok(sawReady, '上膛完成没发 ready');
});

test('命中和击杀带上「谁打的、谁挨的、第几连杀」', () => {
  const base = duel(1);
  const staged = {
    ...base,
    units: base.units.map((unit) => (unit.id === 'enemy-0' ? { ...unit, x: 10.5, y: 1.5, health: 5 } : unit)),
    bullets: [spawnBullet(1, { id: 'ally-0', team: TEAM_ALLY, x: 9.9, y: 1.5 }, 0)],
  };
  const after = step(staged, idle, STEP);
  const hit = after.effects.find((e) => e.type === 'hit');
  assert.equal(hit.mine, true, '我打中的');
  assert.equal(hit.taken, false, '不是我挨的');
  const kill = after.effects.find((e) => e.type === 'kill');
  assert.equal(kill.mine, true);
  assert.equal(kill.lost, false);
  assert.equal(kill.streak, 1, 'streak 要用加一之后的值');
});

test('我被打死时 taken 和 lost 都立起来', () => {
  const base = duel(1);
  const staged = {
    ...base,
    units: base.units.map((unit) => (unit.isPlayer ? { ...unit, health: 4 } : unit)),
    bullets: [spawnBullet(1, { id: 'enemy-0', team: TEAM_ENEMY, x: 9.1, y: 1.5 }, Math.PI)],
  };
  const after = step(staged, idle, STEP);
  assert.equal(after.effects.find((e) => e.type === 'hit').taken, true);
  const kill = after.effects.find((e) => e.type === 'kill');
  assert.equal(kill.lost, true);
  assert.equal(kill.mine, false);
});

