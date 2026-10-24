import test from 'node:test';
import assert from 'node:assert/strict';
import { CANDY_LIGHTING, lightingState } from '../src/game/lighting.js';

test('candy lighting uses a fixed three-point plus player light palette', () => {
  assert.match(CANDY_LIGHTING.background, /^#[0-9a-f]{6}$/i);
  assert.match(CANDY_LIGHTING.key, /^#[0-9a-f]{6}$/i);
  assert.match(CANDY_LIGHTING.rim, /^#[0-9a-f]{6}$/i);
  assert.match(CANDY_LIGHTING.fill, /^#[0-9a-f]{6}$/i);
  assert.match(CANDY_LIGHTING.playerLight, /^#[0-9a-f]{6}$/i);
  assert.notEqual(CANDY_LIGHTING.key, CANDY_LIGHTING.rim);
});

test('lighting exposure grows deterministically without long-term overexposure', () => {
  const start = lightingState({ mass: 0 });
  const grown = lightingState({ mass: 90 });
  const ignited = lightingState({ mass: 130, ignited: true, ascensionProgress: 0.5 });
  const repeated = lightingState({ mass: 90 });
  assert.ok(grown.exposure > start.exposure);
  assert.ok(grown.keyIntensity > start.keyIntensity);
  assert.ok(grown.playerIntensity > start.playerIntensity);
  assert.ok(ignited.exposure > grown.exposure);
  assert.ok(ignited.exposure <= 1.5);
  assert.deepEqual(grown, repeated);
});

test('ability use adds short-lived candy glow without changing base budget', () => {
  const idle = lightingState({ mass: 32 });
  const dashing = lightingState({ mass: 32, dashActive: true });
  const gravity = lightingState({ mass: 32, gravityActive: true });
  assert.ok(dashing.exposure > idle.exposure);
  assert.ok(gravity.fillIntensity > idle.fillIntensity);
  assert.equal(dashing.playerColor, idle.playerColor);
});
