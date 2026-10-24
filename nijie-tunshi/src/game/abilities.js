import { clamp01 } from './rules.js';

export const ABILITIES = {
  dash: { unlockMass: 0, cost: 14, cooldown: 1.15, duration: 0.24, speed: 24 },
  gravity: { unlockMass: 12, costPerSecond: 16, radius: 7.5, strength: 19 },
  phase: { unlockMass: 32, cost: 28, cooldown: 4.5, duration: 0.8, speed: 16 },
};

export const createAbilityState = () => ({
  resonance: 100,
  dash: { cooldown: 0, activeFor: 0, direction: { x: 0, z: -1 } },
  gravity: { active: false },
  phase: { cooldown: 0, activeFor: 0 },
});

export const abilityUnlocked = (name, mass) => mass >= ABILITIES[name].unlockMass;

export function updateAbilities(player, input, dt) {
  const abilities = player.abilities;
  abilities.resonance = Math.min(100, abilities.resonance + dt * 8);
  abilities.dash.cooldown = Math.max(0, abilities.dash.cooldown - dt);
  abilities.dash.activeFor = Math.max(0, abilities.dash.activeFor - dt);
  abilities.phase.cooldown = Math.max(0, abilities.phase.cooldown - dt);
  abilities.phase.activeFor = Math.max(0, abilities.phase.activeFor - dt);

  const moveLength = Math.hypot(input.x ?? 0, input.z ?? 0);
  if (input.dashPressed && abilities.dash.cooldown === 0 && abilities.resonance >= ABILITIES.dash.cost) {
    if (moveLength > 0.05) abilities.dash.direction = { x: input.x / moveLength, z: input.z / moveLength };
    abilities.resonance -= ABILITIES.dash.cost;
    abilities.dash.cooldown = ABILITIES.dash.cooldown;
    abilities.dash.activeFor = ABILITIES.dash.duration;
  }

  abilities.gravity.active = Boolean(
    input.gravityHeld
    && abilityUnlocked('gravity', player.mass)
    && abilities.resonance > 0,
  );
  if (abilities.gravity.active) abilities.resonance = Math.max(0, abilities.resonance - ABILITIES.gravity.costPerSecond * dt);

  if (
    input.phasePressed
    && abilityUnlocked('phase', player.mass)
    && abilities.phase.cooldown === 0
    && abilities.resonance >= ABILITIES.phase.cost
  ) {
    abilities.resonance -= ABILITIES.phase.cost;
    abilities.phase.cooldown = ABILITIES.phase.cooldown;
    abilities.phase.activeFor = ABILITIES.phase.duration;
  }
  abilities.resonance = clamp01(abilities.resonance / 100) * 100;
}

export const dashActive = (player) => player.abilities.dash.activeFor > 0;
export const phaseActive = (player) => player.abilities.phase.activeFor > 0;
