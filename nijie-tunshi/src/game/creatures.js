import { canConsume } from './rules.js';

export const CREATURE_BEHAVIOR = {
  senseRadius: 14,
  fleeSpeed: 1.45,
  approachSpeed: 0.72,
  damping: 0.88,
};

export function creatureMotion(object, player, encounter, dt) {
  if (!object.active || object.type === 'core' || object.gravity) return { x: 0, z: 0 };
  const dx = object.x - player.x;
  const dz = object.z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.01 || distance > CREATURE_BEHAVIOR.senseRadius) return { x: 0, z: 0 };
  const normal = { x: dx / distance, z: dz / distance };
  const fear = canConsume(player, object, encounter) && object.polarity !== 'dark';
  const threat = object.mass > player.mass * 1.8;
  const speed = fear ? CREATURE_BEHAVIOR.fleeSpeed : threat ? CREATURE_BEHAVIOR.approachSpeed : 0;
  if (!speed) return { x: 0, z: 0 };
  const direction = fear ? 1 : -1;
  const urgency = 1 - distance / CREATURE_BEHAVIOR.senseRadius;
  return {
    x: normal.x * speed * direction * (0.45 + urgency) * dt,
    z: normal.z * speed * direction * (0.45 + urgency) * dt,
  };
}
