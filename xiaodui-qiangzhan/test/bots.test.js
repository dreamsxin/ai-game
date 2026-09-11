import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../src/game/arena.js';
import { ROAM_POINTS, botIntent, steerTo } from '../src/game/bots.js';
import { createRandom } from '../src/game/random.js';
import { angleDelta } from '../src/game/aim.js';
import { MAG_SIZE } from '../src/game/rules.js';

const arena = createArena();
const rng = () => createRandom(7);

const bot = (over = {}) => ({
  id: 'enemy-0',
  team: 'enemy',
  x: 10.5,
  y: 1.5,
  aim: 0,
  alive: true,
  ammo: MAG_SIZE,
  reloading: 0,
  skill: { aimError: 0.05, reaction: 0.3, trigger: 0.1 },
  brain: { memory: null, roam: 0, strafe: 1, strafeTimer: 0, retarget: 0, reaction: 0.3, error: 0 },
  ...over,
});
const foe = (over = {}) => ({ id: 'ally-0', team: 'ally', alive: true, x: 16.5, y: 1.5, ...over });

test('游走锚点都在空地上', () => {
  for (const point of ROAM_POINTS) {
    assert.equal(arena.tiles[Math.floor(point.y)][Math.floor(point.x)], 0, JSON.stringify(point));
  }
});

test('八方向贪心会绕开掩体，而不是撞上去', () => {
  const unit = { x: 4 - 0.6, y: 3.5 };
  const dir = steerTo(arena, unit, { x: 10, y: 3.5 });
  assert.ok(Math.abs(dir.y) > 0.1, `应该斜着绕过去，实际 ${JSON.stringify(dir)}`);
});

test('看得见敌人时顶完反应时间才开枪', () => {
  const random = rng();
  const first = botIntent(arena, bot(), [foe()], random, 1 / 60);
  assert.equal(first.fire, false, '刚看到就开枪属于作弊');
  let unit = bot({ brain: first.brain });
  let fired = false;
  for (let i = 0; i < 40 && !fired; i += 1) {
    const intent = botIntent(arena, unit, [foe()], random, 1 / 60);
    fired = intent.fire;
    unit = { ...unit, brain: intent.brain, aim: intent.aimAngle };
  }
  assert.ok(fired, '反应时间过后应该扣扳机');
});

test('瞄准误差有界，不会指到天上去', () => {
  const random = rng();
  let unit = bot({ brain: { ...bot().brain, reaction: 0 } });
  for (let i = 0; i < 30; i += 1) {
    const intent = botIntent(arena, unit, [foe()], random, 1 / 60);
    assert.ok(Math.abs(angleDelta(0, intent.aimAngle)) <= unit.skill.aimError + 1e-9);
    unit = { ...unit, brain: intent.brain };
  }
});

test('掩体后面看不见人：不开枪，往记忆点或锚点走', () => {
  const intent = botIntent(arena, bot({ x: 10.5, y: 3.5 }), [foe({ x: 1.5, y: 3.5 })], rng(), 1 / 60);
  assert.equal(intent.fire, false);
  assert.ok(Math.hypot(intent.move.x, intent.move.y) > 0, '不该站着发呆');
});

test('看不见人时会记住最后位置，走到了就清空', () => {
  const random = rng();
  const seen = botIntent(arena, bot(), [foe()], random, 1 / 60);
  assert.deepEqual(seen.brain.memory, { x: 16.5, y: 1.5 });
  const arrived = botIntent(
    arena,
    bot({ x: 16.5, y: 1.5, brain: { ...seen.brain } }),
    [foe({ alive: false })],
    random,
    1 / 60,
  );
  assert.equal(arrived.brain.memory, null, '到位了就不再执念');
});

test('弹匣打空立刻换弹，闲着也会补满', () => {
  assert.equal(botIntent(arena, bot({ ammo: 0 }), [foe()], rng(), 1 / 60).reload, true);
  assert.equal(botIntent(arena, bot({ ammo: 5 }), [], rng(), 1 / 60).reload, true, '脱战补弹');
  assert.equal(botIntent(arena, bot({ ammo: MAG_SIZE }), [foe()], rng(), 1 / 60).reload, false);
});

test('同一个 seed 给出同一串决策', () => {
  const a = botIntent(arena, bot(), [foe()], rng(), 1 / 60);
  const b = botIntent(arena, bot(), [foe()], rng(), 1 / 60);
  assert.deepEqual(a, b);
});
