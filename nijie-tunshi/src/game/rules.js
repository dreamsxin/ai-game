export const RING_COMPLETION_MASS = 90;
export const STELLAR_IGNITION_MASS = 130;
export const STELLAR_FUEL_TARGET = 100;
export const STELLAR_STABILITY_TARGET = 75;
export const ASCENSION_MASS = STELLAR_IGNITION_MASS;
export const INITIAL_RADIUS = 1.15;
export const MASS_PER_RADIUS = 7;
export const MAX_NAVIGATION_RADIUS = 2.35;

export const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function radiusForMass(mass) {
  return INITIAL_RADIUS + Math.sqrt(Math.max(0, mass) / MASS_PER_RADIUS);
}

export function consumePower(player) {
  const overload = player.mass >= 60 ? 5 : player.mass >= 32 ? 3 : 2;
  return player.mass + overload;
}

export function canConsume(player, object, encounter) {
  if (!object.active || object.polarity === 'dark') return false;
  if (object.type === 'core') return encounter.coreUnlocked;
  return object.mass <= consumePower(player);
}

export function passageHeight(mass) {
  return INITIAL_RADIUS + Math.sqrt(Math.max(0, mass) / MASS_PER_RADIUS);
}

export function comboMultiplier(combo) {
  return 1 + Math.min(1.5, Math.max(0, combo - 1) * 0.12);
}

export function stellarIgnitionReady(state) {
  const anchorsReady = Object.values(state.encounter.anchors).every((integrity) => integrity <= 0);
  const coreConsumed = !state.objects.find((object) => object.id === 'core')?.active;
  return state.player.mass >= STELLAR_IGNITION_MASS
    && state.player.fuel >= STELLAR_FUEL_TARGET
    && state.player.stability >= STELLAR_STABILITY_TARGET
    && anchorsReady
    && state.encounter.phaseIgnited
    && coreConsumed;
}

export function resultStars(result) {
  if (!result) return 0;
  if (result.elapsed <= 150 && result.highestCombo >= 6 && result.phaseShortcut) return 3;
  if (result.elapsed <= 195 || result.highestCombo >= 4) return 2;
  return 1;
}
