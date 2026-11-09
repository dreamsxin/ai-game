// 掉落物的「同型」判定：捡到和自己身上同型号的东西，才有额外收益。
//
// 两条收益路径本来就存在，只是玩家要走近才知道：
// 1. 机翼同型号 → 升一阶（Mk.I → II → III）；已经满阶再捡同型号则转成限时相位过载。
// 2. 僚机同型号 → 编队 +1（1 → 3）；编队满员再捡则折算成一笔分。
//
// 表现层据此在道具上点亮一根光柱，让「这个值得绕过去捡」在还隔着半个屏幕时就看得见。
// 这里只回答「算不算升级、算哪一种」，颜色、亮度、尺寸全部留在 scene 层——
// 判定层不认识 three，也不认识 HUD。

import { MAX_FORMATION } from './gear.js';
import { MAX_TIER } from './wings.js';

/** 四种「捡了有额外收益」的情形，表现层按这个值决定文案。 */
export const UPGRADE_KIND = {
  TIER: 'tier',
  OVERDRIVE: 'overdrive',
  MERGE: 'merge',
  FULL: 'full',
};

const formation = (ship) => Math.max(0, Math.min(MAX_FORMATION, ship?.gearLevel ?? 0));
const tierOfShip = (ship) => Math.max(1, Math.min(MAX_TIER, ship?.tier ?? 1));

/**
 * 这枚掉落物捡起来会不会让当前装配更上一层？
 *
 * - `null`：不同型号（或压根没装、道具已失效）——捡了只是换装，没有成长。
 * - `'tier'`：同型号机翼，且没满阶——捡了升一阶。
 * - `'overdrive'`：同型号机翼且已 Mk.III——捡了转相位过载。
 * - `'merge'`：同型号僚机，编队未满——捡了编队 +1。
 * - `'full'`：同型号僚机且已满编——捡了折算加分。
 *
 * 注意它**不判断这枚道具能不能打本关弱点**：拿错机翼时同型号仍然升级，
 * 那是真实的收益，光柱照旧该亮；「能不能打出伤害」是另一条独立提示（金色描边）。
 */
export function dropUpgrade(drop, ship) {
  if (!drop || !ship) return null;

  if (drop.kind === 'gear') {
    if (!drop.code || drop.code !== ship.gear) return null;
    return formation(ship) >= MAX_FORMATION ? UPGRADE_KIND.FULL : UPGRADE_KIND.MERGE;
  }

  if (!drop.code || drop.code !== ship.wing) return null;
  return tierOfShip(ship) >= MAX_TIER ? UPGRADE_KIND.OVERDRIVE : UPGRADE_KIND.TIER;
}
