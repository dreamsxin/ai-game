import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../src/game/progression.js';
import {
  comboLabel,
  crashReason,
  formatDistance,
  formatSpeed,
  nextZoneLabel,
  starLabel,
  statusLabel,
  zoneLabel,
} from '../src/scene/readout.js';

test('distance switches to kilometres past 1000 metres', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(-5), '0 m');
  assert.equal(formatDistance(999.9), '999 m');
  assert.equal(formatDistance(1500), '1.50 km');
});

test('combo label only appears once the multiplier bites', () => {
  assert.equal(comboLabel(0), null);
  assert.equal(comboLabel(4), null);
  assert.equal(comboLabel(5), 'x2 连击');
  assert.equal(comboLabel(100), 'x4 满连');
});

test('zone labels follow the distance thresholds', () => {
  assert.equal(zoneLabel(0), ZONES[0].name);
  assert.equal(zoneLabel(ZONES[1].from), ZONES[1].name);
  assert.equal(zoneLabel(ZONES.at(-1).from + 1000), ZONES.at(-1).name);
  assert.match(nextZoneLabel(0), new RegExp(ZONES[1].name));
  assert.equal(nextZoneLabel(ZONES.at(-1).from + 10), '已达最深区域');
});

test('crash reason names the action the player missed', () => {
  assert.equal(crashReason([]), null);
  assert.match(crashReason([{ type: 'crash', kind: 'barrier' }]), /滑铲/);
  assert.match(crashReason([{ type: 'crash', kind: 'wall' }]), /变道/);
  assert.equal(crashReason([{ type: 'coin' }]), null);
});

test('status and stars render for every state', () => {
  assert.equal(statusLabel('ready'), '轻点开始');
  assert.equal(statusLabel('paused'), '已暂停');
  assert.equal(statusLabel('over'), '本局结束');
  assert.equal(statusLabel('playing'), '疾风中');
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(starLabel(3), '★★★');
  assert.equal(formatSpeed(12.34), '12.3 m/s');
});
