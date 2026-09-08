import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, abilityUnlocked } from '../src/game/abilities.js';
import { LEVEL } from '../src/game/level.js';
import {
  createGame, enterNextUniverse, isAscensionUnlocked, radiusForMass,
  restartCurrentUniverse, step, togglePause,
} from '../src/game/simulation.js';
import {
  massToCross, OVERLOAD_STABILITY_COST, STABILITY_MAX, STELLAR_FUEL_TARGET, STELLAR_IGNITION_MASS,
  STELLAR_STABILITY_TARGET, stellarIgnitionReady,
} from '../src/game/rules.js';
import { createReplayAgent } from './helpers/replayAgent.js';

const advance = (state, input, seconds) => {
  let next = state;
  for (let index = 0; index < Math.ceil(seconds * 60); index += 1) next = step(next, input, 1 / 60);
  return next;
};

test('game begins in the first universe and remains deterministic', () => {
  let left = createGame(77);
  let right = createGame(77);
  assert.equal(left.status, 'playing');
  assert.equal(left.universe.index, 1);
  assert.equal(left.universe.id, 'genesis');
  for (let index = 0; index < 120; index += 1) {
    const input = { x: index % 3 === 0 ? 1 : 0, z: index % 5 === 0 ? -1 : 0 };
    left = step(left, input);
    right = step(right, input);
  }
  assert.deepEqual(left, right);
});

test('restarting preserves the universe while resetting the run', () => {
  const state = createGame(77, { index: 2, cumulativeStars: 3, bestCombo: 6, completedRuns: 1 });
  state.player.mass = 42;
  state.player.fuel = 30;
  state.objects[0].active = false;
  const restarted = restartCurrentUniverse(state);
  assert.equal(restarted.universe.index, 2);
  assert.equal(restarted.universe.cumulativeStars, 3);
  assert.equal(restarted.player.mass, 0);
  assert.equal(restarted.player.fuel, 0);
  assert.equal(restarted.objects[0].active, true);
  assert.deepEqual(restarted.anchors.map((anchor) => anchor.integrity), [2, 2, 2]);
  assert.equal(restarted.encounter.coreUnlocked, false);
});

test('winning advances to the next universe and preserves meta progress', () => {
  const state = createGame(77);
  state.status = 'won';
  state.result = { stars: 2, highestCombo: 7 };
  const next = enterNextUniverse(state);
  assert.equal(next.status, 'playing');
  assert.equal(next.universe.index, 2);
  assert.equal(next.universe.id, 'antimatter');
  assert.equal(next.universe.cumulativeStars, 2);
  assert.equal(next.universe.bestCombo, 7);
  assert.equal(next.universe.completedRuns, 1);
  assert.ok(next.universe.discoveredRules.includes('甜酸极性'));
  assert.equal(next.player.mass, 0);
  assert.equal(next.player.fuel, 0);
  assert.ok(next.objects[0].mass > state.objects[0].mass);
});

test('polarity fuel is exclusive to the antimatter universe', () => {
  const genesis = createGame(77, { index: 1 });
  const antimatter = createGame(77, { index: 2 });
  const binary = createGame(77, { index: 3 });
  assert.ok(genesis.objects.every((object) => object.polarity === 'neutral'));
  assert.deepEqual(
    antimatter.objects.filter((object) => object.polarity === 'dark').map((object) => object.id),
    ['prism-1', 'crystal-2', 'core'],
  );
  assert.ok(antimatter.objects.filter((object) => !object.fuel).every((object) => object.polarity === 'neutral'));
  assert.ok(binary.objects.every((object) => object.polarity === 'neutral'));
});

test('gravity flips dark fuel once before it can be consumed', () => {
  let state = createGame(77, { index: 2 });
  const fuel = state.objects.find((object) => object.id === 'prism-1');
  state.player.mass = 30;
  state.player.radius = radiusForMass(30);
  state.player.x = fuel.x;
  state.player.z = fuel.z;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === fuel.id).active, true);
  assert.equal(state.objects.find((object) => object.id === fuel.id).polarity, 'dark');

  state.player.x = fuel.x - 5;
  state.player.z = fuel.z;
  state = advance(state, { gravityHeld: true }, 0.7);
  assert.equal(state.objects.find((object) => object.id === fuel.id).polarity, 'light');
  assert.equal(state.actionEvents.filter((event) => event.type === 'polarityFlip').length, 1);

  state = advance(state, { gravityHeld: true }, 0.7);
  assert.equal(state.actionEvents.filter((event) => event.type === 'polarityFlip').length, 1);
  state.player.x = fuel.x;
  state.player.z = fuel.z;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === fuel.id).active, false);
});

test('dash spends resonance, locks direction, and cools down', () => {
  let state = createGame();
  state = step(state, { x: 1, dashPressed: true });
  assert.ok(state.player.abilities.dash.activeFor > 0);
  assert.equal(state.player.abilities.dash.direction.x, 1);
  assert.ok(state.player.abilities.resonance < 100);
  const spent = state.player.abilities.resonance;
  state = step(state, { x: -1, dashPressed: true });
  assert.equal(state.player.abilities.dash.direction.x, 1);
  assert.ok(state.player.abilities.resonance >= spent);
  state = advance(state, {}, ABILITIES.dash.cooldown + 0.2);
  assert.equal(state.player.abilities.dash.cooldown, 0);
});

test('dash breaks a crystal panel but regular rolling does not', () => {
  let regular = createGame();
  regular.player.x = -17;
  regular.player.z = 13;
  regular = advance(regular, { x: 1 }, 0.5);
  assert.equal(regular.structures.find((item) => item.id === 'crystal-panel').active, true);

  let dashed = createGame();
  dashed.player.x = -17;
  dashed.player.z = 13;
  dashed = advance(dashed, { x: 1, dashPressed: true }, 0.2);
  assert.equal(dashed.structures.find((item) => item.id === 'crystal-panel').active, false);
  assert.ok(dashed.actionEvents.some((event) => event.type === 'structureBreak'));
});

test('gravity requires mass 12 and attracts eligible shards', () => {
  assert.equal(abilityUnlocked('gravity', 11.9), false);
  assert.equal(abilityUnlocked('gravity', 12), true);
  let state = createGame();
  state.player.mass = 12;
  state.player.radius = radiusForMass(12);
  state.player.x = -5;
  state.player.z = 13;
  const before = state.objects.find((object) => object.id === 'shard-a').z;
  state = advance(state, { gravityHeld: true }, 0.5);
  assert.notEqual(state.objects.find((object) => object.id === 'shard-a').z, before);
  assert.ok(state.player.abilities.resonance < 100);
});

test('phase gate blocks normally and records the phase shortcut', () => {
  let state = createGame();
  state.player.mass = 32;
  state.player.radius = radiusForMass(32);
  state.player.x = 4;
  state.player.z = -1;
  state = advance(state, { z: -1 }, 0.5);
  assert.ok(state.player.z > -2.3);

  state.player.z = -1;
  state.player.vz = 0;
  state = advance(state, { z: -1, phasePressed: true }, 0.5);
  assert.ok(state.player.z < -4.5);
  assert.equal(state.encounter.phaseShortcut, true);
});

test('core remains protected until both anchors are broken', () => {
  let state = createGame();
  state.player.mass = 90;
  state.player.radius = radiusForMass(90);
  const core = state.objects.find((object) => object.id === 'core');
  state.player.x = core.x;
  state.player.z = core.z;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === 'core').active, true);

  state.anchors.filter((anchor) => anchor.id !== 'phase').forEach((anchor) => {
    anchor.integrity = 0;
    anchor.active = false;
  });
  state.encounter.coreUnlocked = true;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === 'core').active, false);
});

test('stellar ignition requires mass, fuel, stability, three anchors, phase, and core', () => {
  const state = createGame();
  state.player.mass = STELLAR_IGNITION_MASS;
  state.player.fuel = STELLAR_FUEL_TARGET;
  state.player.stability = 100;
  assert.equal(stellarIgnitionReady(state), false);
  state.anchors.forEach((anchor) => { anchor.integrity = 0; anchor.active = false; });
  state.encounter.phaseIgnited = true;
  state.objects.find((object) => object.id === 'core').active = false;
  assert.equal(stellarIgnitionReady(state), true);
  assert.equal(isAscensionUnlocked(state), false);
  state.player.ignited = true;
  assert.equal(isAscensionUnlocked(state), true);
});

test('simulation ignites once and emits the stellar transition events', () => {
  let state = createGame();
  state.player.mass = STELLAR_IGNITION_MASS;
  state.player.fuel = STELLAR_FUEL_TARGET;
  state.player.stability = 100;
  state.encounter.phaseIgnited = true;
  state.anchors.forEach((anchor) => { anchor.active = false; anchor.integrity = 0; });
  state.objects.find((object) => object.id === 'core').active = false;

  state = step(state, {});
  assert.equal(state.player.ignited, true);
  assert.equal(state.player.ignitionAttempts, 1);
  assert.equal(state.stageUpEvents.at(-1).stageName, '霓虹糖星');
  assert.equal(state.actionEvents.at(-1).type, 'stellarIgnition');

  state = step(state, {});
  assert.equal(state.player.ignitionAttempts, 1);
  assert.equal(state.stageUpEvents.filter((event) => event.stageName === '霓虹糖星').length, 1);
  assert.equal(state.actionEvents.filter((event) => event.type === 'stellarIgnition').length, 1);
});

test('overload eating costs stability but the tutorial stage stays free', () => {
  let free = createGame();
  free.player.mass = 3;
  free.player.radius = radiusForMass(3);
  const orb = LEVEL.objects.find((object) => object.id === 'orb-4');
  free.player.x = orb.x;
  free.player.z = orb.z;
  free = step(free, {});
  assert.equal(free.objects.find((object) => object.id === 'orb-4').active, false);
  assert.equal(free.player.stability, STABILITY_MAX);

  let risky = createGame();
  risky.player.mass = 13;
  risky.player.radius = radiusForMass(13);
  const prism = LEVEL.objects.find((object) => object.id === 'prism-1');
  risky.player.x = prism.x;
  risky.player.z = prism.z;
  risky = step(risky, {});
  assert.equal(risky.objects.find((object) => object.id === 'prism-1').active, false);
  assert.equal(risky.player.stability, STABILITY_MAX - OVERLOAD_STABILITY_COST);
  const loss = risky.actionEvents.find((event) => event.type === 'stabilityLoss');
  assert.equal(loss.cause, 'overload');
  assert.equal(loss.objectId, 'prism-1');
});

test('stability recovers after the penalty delay without exceeding the maximum', () => {
  let state = createGame();
  state.player.mass = 13;
  state.player.radius = radiusForMass(13);
  const prism = LEVEL.objects.find((object) => object.id === 'prism-1');
  state.player.x = prism.x;
  state.player.z = prism.z;
  state = step(state, {});
  const damaged = state.player.stability;
  assert.ok(damaged < STABILITY_MAX);

  state.player.x = -24;
  state.player.z = 20;
  state = advance(state, {}, 2);
  assert.ok(state.player.stability > damaged, '延迟结束后稳定度应回升');
  state = advance(state, {}, 30);
  assert.equal(state.player.stability, STABILITY_MAX);
});

test('ignition stays blocked while stability is below target', () => {
  const state = createGame();
  state.player.mass = STELLAR_IGNITION_MASS;
  state.player.fuel = STELLAR_FUEL_TARGET;
  state.encounter.phaseIgnited = true;
  state.anchors.forEach((anchor) => { anchor.integrity = 0; anchor.active = false; });
  state.objects.find((object) => object.id === 'core').active = false;

  state.player.stability = STELLAR_STABILITY_TARGET - 1;
  assert.equal(stellarIgnitionReady(state), false);
  state.player.stability = STELLAR_STABILITY_TARGET;
  assert.equal(stellarIgnitionReady(state), true);
});

test('fleeing candy creatures stay inside walls and level bounds', () => {
  const wall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-c');
  let state = createGame();
  state.player.mass = 30;
  state.player.radius = radiusForMass(30);
  const creature = state.objects.find((object) => object.id === 'cube-3');
  const margin = creature.size * 0.5;
  const wallEdge = wall.z + wall.depth / 2;
  creature.x = wall.x;
  creature.z = wallEdge + 1.5;
  state.player.x = wall.x;
  state.player.z = creature.z + 10;
  state = advance(state, {}, 3);
  const pushed = state.objects.find((object) => object.id === 'cube-3');
  assert.equal(pushed.active, true, '糖果怪不应被吃掉，否则本用例失去意义');
  assert.ok(pushed.z < creature.z + 1e-6, '糖果怪应朝远离玩家的方向逃离');
  assert.ok(pushed.z >= wallEdge + margin - 1e-6, `糖果怪不应挤入墙体，实际 z=${pushed.z}`);

  state = createGame();
  state.player.mass = 30;
  state.player.radius = radiusForMass(30);
  const runner = state.objects.find((object) => object.id === 'cube-3');
  runner.x = LEVEL.bounds.maxX - 1;
  runner.z = 0;
  state.player.x = runner.x - 10;
  state.player.z = 0;
  state = advance(state, {}, 3);
  const escaped = state.objects.find((object) => object.id === 'cube-3');
  assert.equal(escaped.active, true, '糖果怪不应被吃掉，否则本用例失去意义');
  assert.ok(escaped.x > LEVEL.bounds.maxX - 1, '糖果怪应被逼向边界');
  assert.ok(escaped.x <= LEVEL.bounds.maxX - margin + 1e-6, `糖果怪不应越出边界，实际 x=${escaped.x}`);
});

test('the level carries enough spare fuel to survive a missed pickup', () => {
  const sources = LEVEL.objects.filter((object) => object.fuel);
  const total = sources.reduce((sum, object) => sum + object.fuel, 0);
  const richest = Math.max(...sources.map((object) => object.fuel));
  assert.ok(sources.length >= 5, '燃料来源应分布在多个对象上');
  assert.ok(
    total - richest >= STELLAR_FUEL_TARGET,
    `漏掉最大燃料体后仍应能凑满 ${STELLAR_FUEL_TARGET}，当前剩余 ${total - richest}`,
  );
});

test('the replay agent actually routes around walls instead of grinding along them', () => {
  let state = createGame();
  const agent = createReplayAgent();
  agent.start();
  for (let index = 0; index < 40000 && state.status === 'playing'; index += 1) {
    state = step(state, agent.snapshot(state), 1 / 60);
  }
  const stats = agent.stats();
  assert.equal(state.status, 'ascending');
  assert.ok(stats.plans > 0, '回放必须真的用到寻路，否则避障是死代码');
  assert.equal(stats.failedPlans, 0, '路线上的目标都应可达');
  assert.ok(stats.followedSteps > 100, `沿路径行进的步数过少: ${stats.followedSteps}`);
  assert.ok(stats.straightSteps > 0, '视野无阻时应走直线而非绕路');
});

test('a low wall blocks a small candy heart and stops blocking once it can roll over', () => {
  const wall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-a');
  const westFace = wall.x - wall.width / 2;

  let small = createGame();
  small.player.x = westFace - 3;
  small.player.z = wall.z;
  small = advance(small, { x: 1, z: 0 }, 3);
  assert.ok(small.player.x < westFace, `小身位不应穿墙，实际 x=${small.player.x}`);

  let grown = createGame();
  grown.player.mass = massToCross(wall.height) + 5;
  grown.player.radius = radiusForMass(grown.player.mass);
  grown.player.x = westFace - 3;
  grown.player.z = wall.z;
  grown = advance(grown, { x: 1, z: 0 }, 3);
  assert.ok(
    grown.player.x > wall.x + wall.width / 2,
    `体型足够时应从墙上滚过，实际 x=${grown.player.x}`,
  );
});

test('a narrow gate lets a small heart through and closes permanently after growth', () => {
  const gate = LEVEL.gates.find((candidate) => candidate.id === 'gate-north');
  const southFace = gate.z - gate.depth / 2;

  let small = createGame();
  small.player.mass = gate.maxMass - 8;
  small.player.radius = radiusForMass(small.player.mass);
  small.player.x = gate.x;
  small.player.z = southFace - 5;
  small = advance(small, { x: 0, z: 1 }, 4);
  assert.ok(
    small.player.z > gate.z + gate.depth / 2,
    `未超上限时应能穿过窄门，实际 z=${small.player.z}`,
  );

  let grown = createGame();
  grown.player.mass = gate.maxMass + 12;
  grown.player.radius = radiusForMass(grown.player.mass);
  grown.player.x = gate.x;
  grown.player.z = southFace - 5;
  grown = advance(grown, { x: 0, z: 1 }, 4);
  assert.ok(grown.player.z < southFace, `超过上限后窄门应关闭，实际 z=${grown.player.z}`);
});

test('phase anchor only breaks while phase is active', () => {
  let state = createGame();
  state.player.mass = 32;
  state.player.radius = radiusForMass(32);
  const anchor = state.anchors.find((item) => item.id === 'phase');
  state.player.x = anchor.x;
  state.player.z = anchor.z;
  state = step(state, {});
  assert.equal(state.anchors.find((item) => item.id === 'phase').active, true);
  state = step(state, { phasePressed: true });
  assert.equal(state.anchors.find((item) => item.id === 'phase').active, false);
  assert.equal(state.encounter.phaseIgnited, true);
});

test('combo persists across steps and expires', () => {
  let state = createGame();
  state.player.x = LEVEL.objects[0].x;
  state.player.z = LEVEL.objects[0].z;
  state = step(state, {});
  assert.equal(state.player.combo, 1);
  state.player.x = LEVEL.objects[1].x;
  state.player.z = LEVEL.objects[1].z;
  state = step(state, {});
  assert.equal(state.player.combo, 2);
  state = advance(state, {}, 3);
  assert.equal(state.player.combo, 0);
  assert.equal(state.player.highestCombo, 2);
});

test('scripted replay completes stellar ignition and reaches the universe rift', () => {
  let state = createGame();
  const agent = createReplayAgent();
  agent.start();
  for (let index = 0; index < 40000 && state.status === 'playing'; index += 1) {
    state = step(state, agent.snapshot(state), 1 / 60);
  }
  assert.equal(state.status, 'ascending');
  assert.equal(state.encounter.coreUnlocked, true);
  assert.equal(state.encounter.phaseIgnited, true);
  assert.deepEqual(state.anchors.map((anchor) => anchor.integrity <= 0), [true, true, true]);
  assert.equal(state.objects.find((object) => object.id === 'core').active, false);
  assert.ok(state.player.mass >= STELLAR_IGNITION_MASS);
  assert.equal(state.player.fuel, STELLAR_FUEL_TARGET);
  assert.equal(state.player.ignited, true);
  assert.ok(state.encounter.brokenStructures.includes('crystal-panel'));
});

test('scripted replay completes stellar ignition in every defined universe', () => {
  for (let universe = 1; universe <= 4; universe += 1) {
    let state = createGame(77, { index: universe });
    const agent = createReplayAgent();
    agent.start();
    for (let index = 0; index < 40000 && state.status === 'playing'; index += 1) {
      state = step(state, agent.snapshot(state), 1 / 60);
    }
    assert.equal(state.status, 'ascending', `universe ${universe}`);
    assert.equal(state.player.ignited, true, `universe ${universe}`);
  }
});

test('pause freezes simulation and toggle resumes it', () => {
  let state = createGame();
  state = togglePause(state);
  const paused = step(state, { x: 1 }, 1);
  assert.deepEqual(paused, state);
  state = togglePause(state);
  assert.equal(state.status, 'playing');
});
