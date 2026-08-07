export const PLAYER_STAGES = [
  {
    name: '初醒', minMass: 0, shellOpacity: 0.3, trailCount: 18,
    coreColor: '#f1fbff', shellColor: '#8bd9ee',
    glow: 2.2, chargePulse: 0.08,
  },
  {
    name: '虹彩', minMass: 12, shellOpacity: 0.42, trailCount: 26,
    coreColor: '#f5f1ff', shellColor: '#c59cff',
    glow: 2.8, chargePulse: 0.12,
  },
  {
    name: '脉冲', minMass: 32, shellOpacity: 0.56, trailCount: 34,
    coreColor: '#fff2ff', shellColor: '#d66cff',
    glow: 3.5, chargePulse: 0.17,
  },
  {
    name: '星冠', minMass: 60, shellOpacity: 0.68, trailCount: 44,
    coreColor: '#fff5ff', shellColor: '#f06cff',
    glow: 4.2, chargePulse: 0.23,
  },
  {
    name: '高维', minMass: 90, shellOpacity: 0.8, trailCount: 58,
    coreColor: '#ffffff', shellColor: '#bd8cff',
    glow: 5.2, chargePulse: 0.3,
  },
];

export const ORBITAL_SATELLITES = [
  { id: 'lumen', ringId: 'inner', unlockMass: 0, radius: 1.32, speed: 1.18, direction: 1, phase: 0.3, size: 0.055, color: '#c8fff2' },
  { id: 'ember', ringId: 'middle', unlockMass: 12, radius: 1.52, speed: 0.82, direction: -1, phase: 2.1, size: 0.062, color: '#ffbd89' },
  { id: 'violet', ringId: 'outer', unlockMass: 32, radius: 1.74, speed: 0.58, direction: 1, phase: 4.35, size: 0.07, color: '#e7b1ff' },
];

export const PLANETARY_RINGS = [
  {
    id: 'inner', name: '第一共鸣环', radius: 1.32, unlockMass: 0, completeMass: 12,
    trackColor: '#173743', gradientStart: '#d8fdff', gradientEnd: '#52d9ff',
    direction: 1, rotationSpeed: 0.42, flowSpeed: 0.08,
  },
  {
    id: 'middle', name: '第二共鸣环', radius: 1.52, unlockMass: 12, completeMass: 32,
    trackColor: '#302044', gradientStart: '#f4d2ff', gradientEnd: '#b54cff',
    direction: -1, rotationSpeed: 0.31, flowSpeed: 0.065,
  },
  {
    id: 'outer', name: '第三共鸣环', radius: 1.74, unlockMass: 32, completeMass: 90,
    trackColor: '#351a49', gradientStart: '#ffb5f1', gradientEnd: '#694cff',
    direction: 1, rotationSpeed: 0.22, flowSpeed: 0.045,
  },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const easeInOut = (value) => value * value * (3 - 2 * value);

const mixHex = (from, to, amount) => {
  const start = Number.parseInt(from.slice(1), 16);
  const end = Number.parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(lerp((start >> shift) & 255, (end >> shift) & 255, amount));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
};

export function planetaryRingState(mass) {
  const safeMass = Math.max(0, Number(mass) || 0);
  const rings = PLANETARY_RINGS
    .filter((ring) => safeMass >= ring.unlockMass)
    .map((ring) => {
      const progress = clamp01((safeMass - ring.unlockMass) / (ring.completeMass - ring.unlockMass));
      return {
        ...ring,
        progress,
        status: progress >= 1 ? 'complete' : 'charging',
      };
    });
  const chargingRing = rings.find((ring) => ring.status === 'charging') ?? rings.at(-1);
  return {
    rings,
    chargingRingId: chargingRing?.id ?? null,
    complete: safeMass >= PLANETARY_RINGS.at(-1).completeMass,
  };
}

export function armillaryState(status, progress = 0) {
  const ascending = status === 'ascending';
  const completed = status === 'won';
  const amount = completed ? 1 : ascending ? clamp01(progress) : 0;
  const spread = easeInOut(Math.min(1, amount * 1.8));
  const turns = amount * Math.PI * 2;
  const targets = [
    { tiltX: Math.PI / 2, tiltY: 0, direction: 1, speed: 1.25 },
    { tiltX: 0.35, tiltY: 0.72, direction: -1, speed: 1.7 },
    { tiltX: 1.03, tiltY: -0.68, direction: 1, speed: 0.92 },
  ];
  return targets.map((target, index) => ({
    id: PLANETARY_RINGS[index].id,
    tiltX: lerp(Math.PI / 2, target.tiltX, spread),
    tiltY: lerp(0, target.tiltY, spread),
    spin: target.direction * target.speed * turns,
    direction: target.direction,
    active: ascending || completed,
  }));
}

export function ringMotionState(status, progress = 0, time = 0) {
  const armillary = armillaryState(status, progress);
  return PLANETARY_RINGS.map((ring, index) => ({
    id: ring.id,
    tiltX: armillary[index].tiltX,
    tiltY: armillary[index].tiltY,
    spin: armillary[index].spin + ring.direction * ring.rotationSpeed * time,
    flowPhase: ring.flowSpeed * time,
    direction: ring.direction,
  }));
}

export function satelliteOrbitState(mass, time = 0, status = 'playing', ascensionProgress = 0) {
  const safeMass = Math.max(0, Number(mass) || 0);
  const ringMotion = ringMotionState(status, ascensionProgress, time);
  return ORBITAL_SATELLITES
    .filter((satellite) => safeMass >= satellite.unlockMass)
    .map((satellite) => {
      const ringIndex = PLANETARY_RINGS.findIndex((item) => item.id === satellite.ringId);
      const motion = ringMotion[ringIndex] ?? ringMotion[0];
      const ringDef = PLANETARY_RINGS[ringIndex] ?? PLANETARY_RINGS[0];
      const ringProgress = clamp01((safeMass - ringDef.unlockMass) / (ringDef.completeMass - ringDef.unlockMass));
      const innerStart = 0.4;
      const orbitRadius = lerp(innerStart, satellite.radius, ringProgress);
      return {
        ...satellite,
        radius: orbitRadius,
        tiltX: motion.tiltX,
        tiltY: motion.tiltY,
        angle: satellite.phase + time * satellite.speed * satellite.direction,
        trailArc: lerp(0.45, 1.1, ringProgress),
      };
    });
}

export function playerVisualForMass(mass) {
  const safeMass = Math.max(0, Number(mass) || 0);
  let stageIndex = 0;
  for (let index = 1; index < PLAYER_STAGES.length; index += 1) {
    if (safeMass >= PLAYER_STAGES[index].minMass) stageIndex = index;
  }
  const current = PLAYER_STAGES[stageIndex];
  const next = PLAYER_STAGES[Math.min(stageIndex + 1, PLAYER_STAGES.length - 1)];
  const range = Math.max(1, next.minMass - current.minMass);
  const stageProgress = stageIndex === PLAYER_STAGES.length - 1
    ? 1
    : clamp01((safeMass - current.minMass) / range);
  const ringState = planetaryRingState(safeMass);
  return {
    stageIndex,
    stageName: current.name,
    stageProgress,
    coreColor: mixHex(current.coreColor, next.coreColor, stageProgress),
    shellColor: mixHex(current.shellColor, next.shellColor, stageProgress),
    rings: ringState.rings,
    ringCount: ringState.rings.length,
    ringColors: ringState.rings.map((ring) => ring.gradientEnd),
    shellOpacity: lerp(current.shellOpacity, next.shellOpacity, stageProgress),
    trailCount: Math.round(lerp(current.trailCount, next.trailCount, stageProgress)),
    glow: lerp(current.glow, next.glow, stageProgress),
    chargePulse: lerp(current.chargePulse, next.chargePulse, stageProgress),
    energy: clamp01(safeMass / PLAYER_STAGES.at(-1).minMass),
  };
}

export function stageChargeProgress(mass) {
  const safeMass = Math.max(0, Number(mass) || 0);
  let stageIndex = 0;
  for (let index = 1; index < PLAYER_STAGES.length; index += 1) {
    if (safeMass >= PLAYER_STAGES[index].minMass) stageIndex = index;
  }
  const ringState = planetaryRingState(safeMass);
  const ring = ringState.rings.find((item) => item.status === 'charging') ?? ringState.rings.at(-1);
  return {
    stageIndex,
    ringIndex: ring ? PLANETARY_RINGS.findIndex((item) => item.id === ring.id) : 0,
    ringName: ring?.name ?? PLANETARY_RINGS[0].name,
    progress: ring?.progress ?? 0,
    nextThreshold: ring?.completeMass ?? PLANETARY_RINGS.at(-1).completeMass,
    complete: ringState.complete,
  };
}
