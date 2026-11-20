// 机身判定层：三型都是外观身份，测试守住「不带数值、坏码归位、跨关不丢」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { HULLS, HULL_CODES, DEFAULT_HULL, hullSpec, isHull, normalizeHull } from '../src/game/hulls.js';
import { advance, chooseWing, createGame, retryChapter, startGame, step, STEP } from '../src/game/simulation.js';
import { LEVELS } from '../src/game/levels.js';
import { EMPTY_INPUT } from '../src/game/input.js';
import { HULL_HALF_H, HULL_HALF_W, PLAYER_SPEED } from '../src/game/rules.js';

test('三型机身各有身份，默认玄鸟，坏码一律归位', () => {
  assert.deepEqual(HULL_CODES, ['H1', 'H2', 'H3']);
  assert.equal(DEFAULT_HULL, 'H1');
  assert.equal(normalizeHull('H2'), 'H2');
  assert.equal(normalizeHull('不存在'), DEFAULT_HULL);
  assert.equal(normalizeHull(null), DEFAULT_HULL);
  assert.equal(isHull('H3'), true);
  assert.equal(isHull('__proto__'), false, '原型链上的键不能当机型');
  assert.equal(hullSpec('坏码').code, DEFAULT_HULL);
  for (const code of HULL_CODES) {
    assert.ok(HULLS[code].name && HULLS[code].brief, `${code} 要有名字与简介`);
  }
});

test('机身是纯外观：换机不改速度、受击面积与任何战斗字段', () => {
  // 这三型在判定层的唯一区别就是 ship.hull 这个字符串。
  const fields = ['x', 'y', 'wing', 'tier', 'cool', 'invuln', 'dive', 'lock', 'overdrive'];
  const make = (hull) => startGame(0, 'C', null, hull).ship;
  const a = make('H1');
  const b = make('H2');
  for (const field of fields) assert.deepEqual(b[field], a[field], `${field} 不该随机型改变`);
  assert.equal(HULL_HALF_W, 2.4);
  assert.equal(HULL_HALF_H, 3.2);
  assert.equal(PLAYER_SPEED, 74);
});

test('startGame 可指定机型；chooseWing 兼容旧的二参/三参调用', () => {
  assert.equal(startGame(0).ship.hull, DEFAULT_HULL);
  assert.equal(startGame(0, 'C', null, 'H2').ship.hull, 'H2');
  const fresh = startGame(0);
  const picked = chooseWing(fresh, 'C');
  assert.equal(picked.ship.hull, DEFAULT_HULL, '旧调用不该丢机身');
  const pickedHull = chooseWing(fresh, 'C', null, 'H3');
  assert.equal(pickedHull.ship.hull, 'H3');
  assert.equal(pickedHull.ship.wing, 'C', '换机身不影响选翼');
  assert.equal(pickedHull.status, 'playing');
  assert.equal(chooseWing(pickedHull, 'J', null, 'H2'), pickedHull, '开打后不能靠选翼换机');
});

test('机身跨关 carry、掉命复活与重试本章都保留', () => {
  let state = { ...startGame(0, 'C', null, 'H2'), status: 'clear' };
  const next = advance(state);
  assert.equal(next.ship.hull, 'H2', '过关换章不该重置外形选择');

  const retried = retryChapter(next);
  assert.equal(retried.ship.hull, 'H2', '重试本章不该没收机身');
  assert.equal(retried.ship.wing, null, '但机翼仍要作废');

  // 造一次致命命中：裸机被打中才掉命，复活后机型仍在。
  let live = startGame(0, 'C', null, 'H3');
  live = { ...live, ship: { ...live.ship, wing: null, invuln: 0 }, lives: 2 };
  live = { ...live, foes: [{ id: 1, x: live.ship.x, y: live.ship.y, vx: 0, vy: 0, r: 2, dmg: 1, hostile: true }] };
  for (let i = 0; i < 40 && live.status !== 'dying'; i += 1) live = step(live, EMPTY_INPUT, STEP);
  assert.equal(live.status, 'dying', '裸机挨打应进入掉命流程');
  for (let i = 0; i < 120 && live.status !== 'playing'; i += 1) live = step(live, EMPTY_INPUT, STEP);
  assert.equal(live.ship.hull, 'H3', '复活后仍是同一型机身');
});

test('机身选择不影响 16 关配平：三型机器人的状态轨迹逐字段一致', () => {
  for (const index of [0, 5, 11, 15]) {
    const traces = HULL_CODES.map((hull) => {
      let state = startGame(index, LEVELS[index].boss.weak === 'core' ? 'J' : 'C', null, hull);
      for (let i = 0; i < 60 * 20; i += 1) state = step(state, EMPTY_INPUT, STEP);
      return {
        status: state.status, score: state.score, lives: state.lives,
        x: state.ship.x.toFixed(3), y: state.ship.y.toFixed(3),
        time: state.time.toFixed(3), wave: state.waveIndex,
      };
    });
    const [base, ...others] = traces;
    for (const trace of others) assert.deepEqual(trace, base, `第 ${index + 1} 关的配平轨迹被机身影响了`);
  }
});
