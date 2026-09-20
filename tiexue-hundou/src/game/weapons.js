// 枪械表。这游戏只有一把枪在手，捡到新枪就换掉旧的，死一次掉回步枪——
// 所以「换枪」是一次投资，不是收集。
//
// cost 是一次扣掉的弹药数，count 是这一次吐出几颗子弹。
// 关键的不对称在这里：散弹一次扣 2 发，但三颗都能各自回弹，
// 所以贴身打散弹是唯一能让弹匣「越打越满」的开法。
export const WEAPONS = {
  rifle: { key: 'rifle', name: '制式步枪', mark: 'R', cd: 0.15, cost: 1, count: 1, speed: 28, dmg: 1, pierce: 0, spread: 0 },
  spread: { key: 'spread', name: '散弹枪', mark: 'S', cd: 0.26, cost: 2, count: 3, speed: 25, dmg: 1, pierce: 0, spread: 0.26 },
  machine: { key: 'machine', name: '机枪', mark: 'M', cd: 0.07, cost: 1, count: 1, speed: 30, dmg: 1, pierce: 0, spread: 0.03 },
  laser: { key: 'laser', name: '穿甲激光', mark: 'L', cd: 0.3, cost: 2, count: 1, speed: 44, dmg: 2, pierce: 3, spread: 0 },
};

export const BASE_WEAPON = 'rifle';
export const WEAPON_KEYS = Object.keys(WEAPONS);

export const weaponAt = (key) => WEAPONS[key] ?? WEAPONS[BASE_WEAPON];

// 补给箱掉什么，按箱子序号轮着来：同一关每次玩掉的东西一样，读图就能背下来。
const DROPS = ['spread', 'machine', 'ammo', 'laser'];

export const dropFor = (index) => DROPS[index % DROPS.length];

// 八向瞄准：横向按键决定 x，上下键决定 y，只按上下就是纯垂直射击。
// 站着不动按上是打天上的炮台，空中按下是横版射击的招牌下压火力。
export function aimVector({ dir = 1, up = false, down = false, left = false, right = false, airborne = false }) {
  const ax = (right ? 1 : 0) - (left ? 1 : 0);
  let ay = 0;
  if (up) ay = -1;
  else if (down && airborne) ay = 1;
  if (ay !== 0 && ax === 0) return { ax: 0, ay };
  const x = ax !== 0 ? ax : dir;
  if (ay === 0) return { ax: x, ay: 0 };
  const inv = Math.SQRT1_2;
  return { ax: x * inv, ay: ay * inv };
}

const rotate = (ax, ay, angle) => ({
  ax: ax * Math.cos(angle) - ay * Math.sin(angle),
  ay: ax * Math.sin(angle) + ay * Math.cos(angle),
});

/**
 * 一次扣扳机吐出的子弹。纯函数：给定枪、枪口和瞄准方向，返回子弹初速数组。
 * 散布是对称展开的，count=3 就是 -spread / 0 / +spread。
 */
export function shotsFor(weaponKey, { x, y, ax, ay }) {
  const gun = weaponAt(weaponKey);
  const shots = [];
  const mid = (gun.count - 1) / 2;
  for (let i = 0; i < gun.count; i += 1) {
    const angle = gun.spread * (i - mid);
    const aimed = angle ? rotate(ax, ay, angle) : { ax, ay };
    shots.push({
      x,
      y,
      vx: aimed.ax * gun.speed,
      vy: aimed.ay * gun.speed,
      dmg: gun.dmg,
      pierce: gun.pierce,
      owner: 'player',
      weapon: gun.key,
    });
  }
  return shots;
}
