import { LEVEL } from './level.js';

const WAYPOINT_RADIUS = 2.1;

export function createAutopilot() {
  let routeIndex = 0;
  let mode = 'idle';

  return {
    start() {
      routeIndex = 0;
      mode = 'running';
    },
    stop() {
      mode = 'idle';
    },
    complete() {
      mode = 'completed';
    },
    mode() {
      return mode;
    },
    isActive() {
      return mode === 'running';
    },
    routeIndex() {
      return routeIndex;
    },
    snapshot(state) {
      if (mode !== 'running' || state.status !== 'playing') return { x: 0, z: 0 };
      const plannedObjects = state.plannedRoute?.length > 0 ? state.plannedRoute : LEVEL.autoplayRoute.slice(0, LEVEL.firstStageRoute.length);
      const route = [...plannedObjects, ...LEVEL.autoplayRoute.slice(LEVEL.firstStageRoute.length)];
      const node = route[routeIndex];
      if (!node) {
        mode = 'completed';
        return { x: 0, z: 0 };
      }

      let target;
      if (node.kind === 'object') {
        target = state.objects.find((object) => object.id === node.id && object.active);
        if (!target) {
          routeIndex += 1;
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
      const radius = node.kind === 'exit' ? LEVEL.exit.radius : WAYPOINT_RADIUS;
      if (distance <= radius) {
        if (node.kind === 'exit') {
          return { x: dx, z: dz };
        }
        routeIndex += 1;
        return this.snapshot(state);
      }
      return { x: dx, z: dz };
    },
  };
}
