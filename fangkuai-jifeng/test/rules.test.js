import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANE_COUNT,
  MAX_SPEED,
  OBSTACLE_KINDS,
  START_SPEED,
  clampLane,
  clears,
  comboMultiplier,
  laneX,
  playerHeight,
  resultStars,
  speedAt,
} from '../src/game/rules.js';

test('lane geometry is symmetric around the middle lane', () => {
  assert.equal(laneX(1), 0);
  assert.equal(laneX(0), -laneX(2));
  assert.equal(clampLane(-3), 0);
  assert.equal(clampLane(9), LANE_COUNT - 1);
});

test('speed starts at the base value and never passes the cap', () => {
  assert.equal(speedAt(0), START_SPEED);
  assert.ok(speedAt(500) > speedAt(100), `500 米时应更快，实际 ${speedAt(500)}`);
  assert.equal(speedAt(10_000_000), MAX_SPEED);
});

test('每种障碍只被设计好的那个动作放过', () => {
  const stand = { y: 0, sliding: false };
  const slide = { y: 0, sliding: true };
  const air = { y: 1.3, sliding: false };
  const expected = {
    crate: { stand: false, slide: false, air: true },
    barrier: { stand: false, slide: true, air: false },
    wall: { stand: false, slide: false, air: false },
    pit: { stand: false, slide: false, air: true },
  };
  for (const kind of OBSTACLE_KINDS) {
    assert.equal(clears(kind, stand.y, stand.sliding), expected[kind].stand, `${kind} 站立`);
    assert.equal(clears(kind, slide.y, slide.sliding), expected[kind].slide, `${kind} 滑铲`);
    assert.equal(clears(kind, air.y, air.sliding), expected[kind].air, `${kind} 空中`);
  }
});

test('slide shrinks the hit box and combo multiplier is capped', () => {
  assert.ok(playerHeight(true) < playerHeight(false));
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(5), 2);
  assert.equal(comboMultiplier(500), 4);
});

test('star thresholds line up with the score bands', () => {
  assert.equal(resultStars(0), 1);
  assert.equal(resultStars(1500), 2);
  assert.equal(resultStars(9999), 3);
});
