import test from 'node:test';
import assert from 'node:assert/strict';
import { AMMO_MAX, RELOAD_FILL, REFUND_WEAK, START_LIVES } from '../src/game/rules.js';
import { weakBox } from '../src/game/entities.js';
import { STEP, createGame, startGame, step, togglePause } from '../src/game/simulation.js';
import { BASE_WEAPON } from '../src/game/weapons.js';

const idle = { jump: false, held: { left: false, right: false, up: false, down: false, jump: false } };
const press = (keys) => ({
  jump: keys.jump ?? false,
  held: { left: false, right: false, up: false, down: false, jump: false, ...keys },
});

const advance = (state, frames, input = idle) => {
  let next = state;
  const seen = [];
  for (let i = 0; i < frames; i += 1) {
    next = step(next, input, STEP);
    seen.push(...next.effects);
  }
  return { state: next, effects: seen };
};

const types = (effects) => new Set(effects.map((effect) => effect.type));

test('开局就是自动开火：什么都不按，子弹也在往外走', () => {
  const start = startGame(0);
  assert.equal(start.player.mag, AMMO_MAX);
  const { state, effects } = advance(start, 12);
  assert.ok(types(effects).has('fire'), '站着就该一直在打');
  assert.ok(state.player.mag < AMMO_MAX);
  assert.ok(state.bullets.length > 0);
});

test('弹匣打空会响一声空仓，装填只补回底数而不是补满', () => {
  const base = startGame(0);
  // 这条测的是弹药账本，所以把外面的枪子挡掉，别让它死在半路。
  const start = { ...base, player: { ...base.player, mag: 1, invuln: 99 } };
  const first = advance(start, 6);
  assert.ok(types(first.effects).has('dry'), '打空那一下要有空仓声');
  assert.equal(first.state.player.reloading, true);
  const after = advance(first.state, 180);
  assert.ok(types(after.effects).has('reload'));
  assert.ok(after.state.player.mag <= RELOAD_FILL + 1, `装填后不该接近满弹匣，实际 ${after.state.player.mag}`);
});


test('蹲下会停火，并且比站着装填快得多', () => {
  const base = startGame(0);
  const empty = { ...base.player, mag: 0, reloading: true, reloadAt: 0 };
  const proneRun = advance({ ...base, player: { ...empty } }, 20, press({ down: true }));
  const standRun = advance({ ...base, player: { ...empty } }, 20);
  assert.ok(!types(proneRun.effects).has('fire'), '蹲着不许开火');
  assert.equal(proneRun.state.player.prone, true);
  assert.ok(
    proneRun.state.player.reloadAt > standRun.state.player.reloadAt,
    '蹲着装填必须更快，否则蹲下这个动作没有理由存在',
  );
});

test('蹲下就动不了：这是停火的代价', () => {
  const base = startGame(0);
  const moved = advance(base, 20, press({ right: true, down: true }));
  assert.equal(moved.state.player.prone, true);
  assert.equal(moved.state.player.vx, 0);
  const free = advance(base, 20, press({ right: true }));
  assert.ok(free.state.player.vx > 0, '不蹲的时候该走得动');
});

test('打中核心舱回两发弹药，打在装甲上一发不回还把连击清零', () => {
  const base = startGame(0);
  const weak = weakBox(base.boss);
  const bulletAt = (open) => ({
    ...base,
    boss: { ...base.boss, open, active: true },
    // 把枪口冷却拉长，这一帧只有子弹在动，好把回弹这件事单独看清楚。
    player: { ...base.player, cool: 1, mag: 10, hitChain: 3, chainTimer: 1 },
    bullets: [{
      id: 1,
      x: base.boss.x - 0.05,
      y: weak.y + weak.h / 2,
      vx: 24,
      vy: 0,
      dmg: 1,
      pierce: 0,
      owner: 'player',
      weapon: 'rifle',
      life: 1,
    }],
  });

  const hitOpen = step(bulletAt(true), idle, STEP);
  assert.ok(types(hitOpen.effects).has('weak'), '核心舱开着就该打进去');
  assert.equal(hitOpen.boss.hp, base.boss.hp - 1);
  assert.equal(hitOpen.player.mag, 10 + REFUND_WEAK);
  assert.equal(hitOpen.player.hitChain, 4);

  const hitShut = step(bulletAt(false), idle, STEP);
  assert.ok(types(hitShut.effects).has('armor'), '闭合时该是一声闷响');
  assert.equal(hitShut.boss.hp, base.boss.hp, '装甲不掉血');
  assert.equal(hitShut.player.mag, 10, '装甲不回弹');
  assert.equal(hitShut.player.hitChain, 0, '打空了连击就该断');
});

test('命中回弹真的在撑火力：同样打一段时间，关掉回弹的弹匣明显更空', () => {
  const make = (refund) => {
    const base = startGame(0, { refund });
    // 面前摆三个兵，保证这段时间里确实在命中。
    const enemies = base.enemies.map((enemy, i) => ({
      ...enemy,
      x: base.player.x + 4 + i * 1.6,
      y: base.player.y,
      awake: true,
      hp: 99,
    })).slice(0, 3);
    return { ...base, enemies, player: { ...base.player, invuln: 99 } };
  };
  const on = advance(make(true), 150).state;
  const off = advance(make(false), 150).state;
  assert.ok(on.player.mag > off.player.mag, `回弹开 ${on.player.mag} 发，关 ${off.player.mag} 发`);
});

test('挨一发就是一条命，重生只带一个底数弹匣、枪也掉回步枪', () => {
  const base = startGame(0);
  const shot = {
    ...base,
    player: { ...base.player, invuln: 0, weapon: 'laser', mag: AMMO_MAX },
    bullets: [{
      id: 1,
      x: base.player.x + base.player.w / 2,
      y: base.player.y + base.player.h / 2,
      vx: -12,
      vy: 0,
      dmg: 1,
      pierce: 0,
      owner: 'enemy',
      life: 1,
    }],
  };
  const hit = step(shot, idle, STEP);
  assert.equal(hit.status, 'dying');
  assert.ok(types(hit.effects).has('die'));

  // 一路推到重生的那一帧就停：再往后它就开始自动开火，弹匣数就不是重生时的数了。
  let after = hit;
  for (let i = 0; i < 200 && after.status !== 'playing'; i += 1) after = step(after, idle, STEP);
  assert.equal(after.status, 'playing');

  assert.equal(after.lives, START_LIVES - 1);
  assert.equal(after.player.weapon, BASE_WEAPON, '换来的火力是一次投资，死了就没了');
  assert.equal(after.player.mag, RELOAD_FILL, '死一次不能变成白送一管弹药');
  assert.equal(after.bullets.length, 0, '重生那一刻要清屏');
});

test('踩进水里同样是一条命，而且无敌时间也救不了', () => {
  const base = startGame(0);
  const drowning = {
    ...base,
    // 第一关 x=61～63 是一片灌水的坑。
    player: { ...base.player, x: 62, y: 11.5, invuln: 99, safeX: 58, safeY: 11.5 },
  };
  const out = advance(drowning, 30);
  const die = out.effects.find((effect) => effect.type === 'die');
  assert.ok(die, '掉进水里必须死');
  assert.equal(die.reason, 'water');
  const after = advance(out.state, 120).state;
  assert.ok(after.player.x < 61, `应该重生在坑左边，实际 x=${after.player.x}`);
});

test('捡到补给会换枪，弹药箱直接把弹匣填满', () => {
  const base = startGame(0);
  const at = (kind) => ({
    ...base,
    player: { ...base.player, mag: 4, invuln: 99 },
    pickups: [{
      id: 1,
      kind,
      x: base.player.x,
      y: base.player.y,
      w: 0.74,
      h: 0.74,
      vx: 0,
      vy: 0,
      life: 5,
    }],
  });
  const gun = step(at('spread'), idle, STEP);
  assert.equal(gun.player.weapon, 'spread');
  assert.ok(types(gun.effects).has('pickup'));
  assert.ok(gun.player.mag <= 4, '换枪不附赠弹药');

  const ammo = step(at('ammo'), idle, STEP);
  assert.equal(ammo.player.mag, AMMO_MAX);
  assert.equal(ammo.player.weapon, BASE_WEAPON);
});

test('Boss 倒下就过关，演出放完进下一关', () => {
  const base = startGame(0);
  const down = { ...base, boss: { ...base.boss, hp: 0, active: true } };
  const cleared = step(down, idle, STEP);
  assert.equal(cleared.status, 'clear');
  assert.ok(cleared.score > base.score, '过关要把剩余时间折成分数');
  const next = advance(cleared, 180).state;
  assert.equal(next.levelIndex, 1);
  assert.equal(next.status, 'playing');
});

test('超时是任务失败，不是掉一条命', () => {
  const base = startGame(0);
  const out = step({ ...base, timeLeft: 0.01 }, idle, STEP);
  assert.equal(out.status, 'over');
  assert.equal(out.lives, START_LIVES);
});

test('暂停只在进行中和暂停之间切换，结算画面按不动', () => {
  const base = startGame(0);
  assert.equal(togglePause(base).status, 'paused');
  assert.equal(togglePause(togglePause(base)).status, 'playing');
  const ready = createGame(0);
  assert.equal(togglePause(ready).status, 'ready');
  assert.equal(step(ready, idle, STEP), ready, 'ready 状态不该自己往前跑');
});

test('远处的兵是睡着的：不靠近就不会替你把子弹打光', () => {
  const base = startGame(0);
  const out = advance(base, 30).state;
  const far = out.enemies.filter((enemy) => Math.abs(enemy.x - out.player.x) > 30);
  assert.ok(far.length > 0);
  for (const enemy of far) assert.equal(enemy.awake, false);
});

