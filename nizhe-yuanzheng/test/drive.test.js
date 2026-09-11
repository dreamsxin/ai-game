import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/level.js';
import { loadedMass } from '../src/game/cargo.js';
import { createGame, step } from '../src/game/simulation.js';
import { autopilot, driveMission } from './helpers/driver.js';

// 这一组是「关卡到底能不能通」的兜底。物理参数一改动，最先在这里出问题。
for (let index = 0; index < LEVELS.length; index += 1) {
  test(`${LEVELS[index].name} 能被自动驾驶跑完`, () => {
    const game = createGame(index, 20260911 + index);
    const { state, recoveries } = driveMission(game, { seconds: 1500, cruise: 9 });
    assert.equal(state.status, 'won', `跑了 ${state.elapsed.toFixed(0)} 秒还没交付完，已交 ${state.delivered}/${state.required} 件，救援 ${recoveries} 次`);
    assert.equal(state.delivered, state.required);
    assert.ok(state.elapsed < 1500);
  });
}

test('自动驾驶不需要靠救援硬拖也能拿到进展', () => {
  const game = createGame(0, 777);
  const { state, recoveries } = driveMission(game, { seconds: 900, cruise: 8, stuckLimit: 999 });
  assert.ok(state.delivered > 0, `一件都没送到，走了 ${state.distance.toFixed(0)} 米`);
  assert.equal(recoveries, 0);
});

test('满载会明显拖慢速度：同一段路空车跑得更远', () => {
  const drive = (loaded) => {
    const state = createGame(1, 555);
    state.status = 'driving';
    state.vehicle.gear = 'A';
    state.vehicle.diffLock = true;
    if (loaded) {
      for (let index = 0; index < state.spec.slots; index += 1) state.cargo.push({ type: state.level.cargo.type });
      const load = loadedMass(state.spec, state.cargo);
      state.vehicle.mass = load.mass;
      state.vehicle.comLift = load.comLift;
    }
    for (let frame = 0; frame < 600; frame += 1) step(state, autopilot(state, { cruise: 12 }), 1 / 60);
    return state.distance;
  };
  const empty = drive(false);
  const full = drive(true);
  assert.ok(empty > full, `空车 ${empty.toFixed(1)} 米应该比满载 ${full.toFixed(1)} 米走得远`);
  assert.ok(full > 20, `满载十秒只挪了 ${full.toFixed(1)} 米，太夸张了`);
});
