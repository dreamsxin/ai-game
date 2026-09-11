// 区域只影响视觉：调色板、雾浓度和地面纹样，由距离派生，模拟层不读取。
export const ZONES = [
  {
    id: 'meadow',
    name: '翠原',
    from: 0,
    sky: 0x8fd3ff,
    fog: 0.016,
    ground: [0x4f9d4b, 0x3f8a3d, 0x5aa856],
    accent: 0xffe066,
  },
  {
    id: 'dunes',
    name: '流沙',
    from: 900,
    sky: 0xf7c98b,
    fog: 0.02,
    ground: [0xd9a95f, 0xc79450, 0xe6ba72],
    accent: 0xff8f4d,
  },
  {
    id: 'neon',
    name: '霓虹',
    from: 2200,
    sky: 0x1b1140,
    fog: 0.028,
    ground: [0x2c1d5c, 0x3b2a78, 0x201646],
    accent: 0x4de1ff,
  },
  {
    id: 'void',
    name: '虚空',
    from: 4200,
    sky: 0x07070d,
    fog: 0.034,
    ground: [0x14141f, 0x1d1d2c, 0x0d0d15],
    accent: 0xff4d8d,
  },
];

export const ZONE_FADE = 220;

export const zoneIndexAt = (distance) => {
  let index = 0;
  for (let candidate = 0; candidate < ZONES.length; candidate += 1) {
    if (distance >= ZONES[candidate].from) index = candidate;
  }
  return index;
};

export const zoneAt = (distance) => ZONES[zoneIndexAt(distance)];

// 进入新区域后用 ZONE_FADE 米做渐变，避免颜色硬切。
export function zoneBlend(distance) {
  const index = zoneIndexAt(distance);
  const current = ZONES[index];
  const next = ZONES[Math.min(ZONES.length - 1, index + 1)];
  const travelled = distance - current.from;
  if (index === 0 || travelled >= ZONE_FADE) return { from: current, to: current, t: 0 };
  const previous = ZONES[index - 1];
  return { from: previous, to: current, t: Math.max(0, Math.min(1, travelled / ZONE_FADE)) };
}

export const nextZone = (distance) => {
  const index = zoneIndexAt(distance);
  return index + 1 < ZONES.length ? ZONES[index + 1] : null;
};

