import { clamp01 } from './rules.js';

export const CANDY_LIGHTING = {
  background: '#1a0717',
  hemisphereSky: '#ffd6f2',
  hemisphereGround: '#160916',
  key: '#ffcf8b',
  rim: '#7df3ff',
  fill: '#ff62c7',
  playerLight: '#ffb1e8',
};

export function lightingState({ mass = 0, ignited = false, ascensionProgress = 0, dashActive = false, gravityActive = false } = {}) {
  const safeMass = Math.max(0, Number(mass) || 0);
  const ascent = clamp01(ascensionProgress);
  const massGlow = clamp01(safeMass / 130);
  const burst = ignited ? 0.16 + ascent * 0.2 : 0;
  const actionGlow = (dashActive ? 0.035 : 0) + (gravityActive ? 0.025 : 0);
  return {
    exposure: 1.08 + massGlow * 0.08 + burst + actionGlow,
    keyIntensity: 4 + massGlow * 0.55,
    rimIntensity: 2.3 + massGlow * 0.7 + (ignited ? 0.7 : 0),
    fillIntensity: 1.35 + (gravityActive ? 0.45 : 0),
    playerIntensity: 1.5 + massGlow * 2.1 + (ignited ? 1.2 : 0),
    playerDistance: 9 + massGlow * 5,
    playerColor: ignited ? '#fff3ad' : massGlow > 0.68 ? '#ff8fbf' : massGlow > 0.24 ? '#ffb1e8' : '#fff6c8',
  };
}
