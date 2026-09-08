import { canConsume } from './rules.js';

export function creatureMood(object, player, encounter) {
  if (!object.active || object.type === 'core') return 'dormant';
  if (object.polarity === 'dark') return 'sour';
  if (object.gravity) return 'drawn';
  if (canConsume(player, object, encounter)) return 'fleeing';
  if (object.mass > player.mass * 1.8) return 'looming';
  return 'watching';
}

export function creatureMoodPose(object, player, encounter, time = 0) {
  const mood = creatureMood(object, player, encounter);
  const distance = Math.hypot(player.x - object.x, player.z - object.z);
  const intensity = Math.max(0, 1 - distance / 14);
  const pulse = Math.sin(time * 5.2) * 0.5 + 0.5;
  if (mood === 'fleeing') {
    return { mood, lean: -0.12 * intensity, glintScale: 0.78 - pulse * 0.08, bob: pulse * 0.04 };
  }
  if (mood === 'looming') {
    return { mood, lean: 0.14 * intensity, glintScale: 1.08 + pulse * 0.1, bob: pulse * 0.07 };
  }
  if (mood === 'drawn') {
    return { mood, lean: 0, glintScale: 0.9 + pulse * 0.12, bob: pulse * 0.12 };
  }
  if (mood === 'sour') {
    return { mood, lean: -0.05 * intensity, glintScale: 1 + pulse * 0.16, bob: pulse * 0.05 };
  }
  return { mood, lean: 0, glintScale: 1, bob: 0 };
}
