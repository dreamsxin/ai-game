import { LEVEL } from '../../src/game/level.js';

const ROUTE = [
  { kind: 'object', id: 'orb-1' },
  { kind: 'object', id: 'orb-2' },
  { kind: 'object', id: 'orb-4' },
  { kind: 'object', id: 'cylinder-1' },
  { kind: 'object', id: 'cube-1' },
  { kind: 'object', id: 'prism-1' },
  { kind: 'point', x: 22, z: 14 },
  { kind: 'point', x: 22, z: -13 },
  { kind: 'object', id: 'prism-3' },
  { kind: 'object', id: 'crystal-2' },
  { kind: 'anchor', id: 'north', action: 'dash' },
  { kind: 'anchor', id: 'south', action: 'gravity' },
  { kind: 'object', id: 'core' },
  { kind: 'exit' },
];

export function createReplayAgent() {
  let index = 0;
  let previousDash = false;

  return {
    snapshot(state) {
      const node = ROUTE[index];
      if (!node || state.status !== 'playing') return {};
      let target;
      if (node.kind === 'object') {
        target = state.objects.find((object) => object.id === node.id && object.active);
        if (!target) {
          index += 1;
          return this.snapshot(state);
        }
      } else if (node.kind === 'anchor') {
        target = state.anchors.find((anchor) => anchor.id === node.id && anchor.active);
        if (!target) {
          index += 1;
          return this.snapshot(state);
        }
      } else if (node.kind === 'exit') {
        target = LEVEL.exit;
      } else {
        target = node;
      }

      const dx = target.x - state.player.x;
      const dz = target.z - state.player.z;
      const distance = Math.hypot(dx, dz);
      const arrival = node.kind === 'exit' ? LEVEL.exit.radius : node.kind === 'anchor' ? 1.4 : 1.9;
      if (distance <= arrival && node.kind === 'point') {
        index += 1;
        return this.snapshot(state);
      }
      const nearbyBreakable = state.structures.find((structure) => (
        structure.active
        && structure.kind === 'breakable'
        && Math.hypot(state.player.x - structure.x, state.player.z - structure.z) < 4.5
      ));
      const dashPressed = (node.action === 'dash' && distance < 5 && !previousDash)
        || Boolean(nearbyBreakable && state.player.abilities.dash.cooldown === 0);
      previousDash = node.action === 'dash' && distance < 5;
      return {
        x: dx,
        z: dz,
        dashPressed,
        gravityHeld: node.action === 'gravity' && distance < 5,
      };
    },
    routeIndex: () => index,
  };
}
