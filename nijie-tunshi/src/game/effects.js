export const PARTICLE_PROFILES = {
  orb: {
    ambientCount: 8,
    burstCount: 22,
    ambientRadius: 1.45,
    burstSpeed: 4.8,
    lifetime: 0.72,
    ambientSize: 0.07,
    burstSize: 0.13,
    ambientOpacity: 0.46,
  },
  cylinder: {
    ambientCount: 10,
    burstCount: 28,
    ambientRadius: 1.35,
    burstSpeed: 5.6,
    lifetime: 0.82,
    ambientSize: 0.075,
    burstSize: 0.14,
    ambientOpacity: 0.42,
  },
  cube: {
    ambientCount: 10,
    burstCount: 30,
    ambientRadius: 1.5,
    burstSpeed: 5.2,
    lifetime: 0.78,
    ambientSize: 0.08,
    burstSize: 0.16,
    ambientOpacity: 0.4,
  },
  prism: {
    ambientCount: 12,
    burstCount: 34,
    ambientRadius: 1.6,
    burstSpeed: 6,
    lifetime: 0.84,
    ambientSize: 0.08,
    burstSize: 0.15,
    ambientOpacity: 0.44,
  },
  crystal: {
    ambientCount: 14,
    burstCount: 40,
    ambientRadius: 1.75,
    burstSpeed: 6.5,
    lifetime: 0.95,
    ambientSize: 0.085,
    burstSize: 0.17,
    ambientOpacity: 0.52,
  },
  core: {
    ambientCount: 18,
    burstCount: 56,
    ambientRadius: 2.05,
    burstSpeed: 7.8,
    lifetime: 1.15,
    ambientSize: 0.095,
    burstSize: 0.2,
    ambientOpacity: 0.6,
  },
};

const hashString = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mix32 = (seed) => {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  value = Math.imul(value ^ (value >>> 13), 3266489909);
  return (value ^ (value >>> 16)) >>> 0;
};

const unit = (seed, salt) => mix32(seed + Math.imul(salt, 2654435761)) / 4294967296;

export function burstDirection(type, index, count, seed) {
  const offset = index / Math.max(1, count);
  const jitter = unit(seed, index + 11) - 0.5;
  if (type === 'cylinder') {
    const angle = index * 2.399963 + jitter * 0.35;
    const lift = index % 3 === 0 ? 0.58 : 0.14;
    return normalize3([Math.cos(angle), lift, Math.sin(angle)]);
  }
  if (type === 'cube') {
    const axis = index % 6;
    const spread = 0.35 + unit(seed, index + 21) * 0.25;
    const axes = [
      [1, jitter, jitter], [-1, jitter, -jitter], [jitter, 1, jitter],
      [jitter, -1, -jitter], [jitter, jitter, 1], [-jitter, -jitter, -1],
    ];
    return normalize3(axes[axis].map((value) => value * spread));
  }
  if (type === 'prism') {
    const arm = index % 3;
    const angle = (Math.PI * 2 * arm) / 3 + Math.floor(index / 3) * 0.11;
    return normalize3([Math.cos(angle), 0.2 + offset * 0.4, Math.sin(angle)]);
  }
  if (type === 'crystal' || type === 'core') {
    const golden = index * 2.399963 + jitter * 0.5;
    const z = 1 - 2 * offset;
    const horizontal = Math.sqrt(Math.max(0, 1 - z * z));
    const upwardBias = type === 'core' ? 0.3 : 0.55;
    return normalize3([Math.cos(golden) * horizontal, z + upwardBias, Math.sin(golden) * horizontal]);
  }
  const angle = offset * Math.PI * 4.8 + jitter;
  const radius = 0.58 + unit(seed, index + 31) * 0.42;
  return normalize3([Math.cos(angle) * radius, 0.35 + Math.sin(offset * Math.PI) * 0.3, Math.sin(angle) * radius]);
}

export function ambientOffset(type, index, seed, time, radius) {
  const phase = unit(seed, index + 41) * Math.PI * 2;
  if (type === 'cylinder') {
    const angle = phase + time * (0.55 + unit(seed, index + 51) * 0.3);
    return [Math.cos(angle) * radius, Math.sin(angle * 1.7) * 0.75, Math.sin(angle) * radius];
  }
  if (type === 'cube') {
    const phaseOffset = phase * 0.25;
    return [
      Math.sin(time * 0.8 + phase) * radius,
      Math.cos(time * 0.55 + phaseOffset) * radius * 0.58,
      Math.sin(time * 0.65 + phaseOffset) * radius,
    ];
  }
  if (type === 'prism') {
    const angle = phase + time * 0.5;
    const arm = index % 3;
    return [
      Math.cos(angle + arm * 2.094) * radius,
      Math.sin(time * 0.7 + phase) * radius * 0.42,
      Math.sin(angle + arm * 2.094) * radius,
    ];
  }
  if (type === 'crystal' || type === 'core') {
    const angle = phase + time * (0.34 + unit(seed, index + 61) * 0.26);
    const height = ((index % 5) - 2) * 0.32;
    return [Math.cos(angle) * radius * (0.72 + height * 0.08), height, Math.sin(angle) * radius * (0.72 + height * 0.08)];
  }
  const angle = phase + time * (0.7 + unit(seed, index + 71) * 0.35);
  return [Math.cos(angle) * radius, Math.sin(time * 0.9 + phase) * 0.35, Math.sin(angle) * radius];
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function profileFor(type) {
  return PARTICLE_PROFILES[type] ?? PARTICLE_PROFILES.orb;
}

export function seedFor(id) {
  return hashString(String(id));
}
