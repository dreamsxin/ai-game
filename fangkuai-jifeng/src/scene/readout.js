import { MAX_COMBO_MULTIPLIER, comboMultiplier } from '../game/rules.js';
import { nextZone, zoneAt } from '../game/progression.js';

// HUD 文案全部在这里派生，React 组件只负责摆放。
export const formatDistance = (distance) => {
  const metres = Math.max(0, Math.floor(distance));
  if (metres < 1000) return `${metres} m`;
  return `${(metres / 1000).toFixed(2)} km`;
};

export const formatScore = (score) => Math.max(0, Math.floor(score)).toLocaleString('zh-CN');

export const formatSpeed = (speed) => `${speed.toFixed(1)} m/s`;

export const comboLabel = (streak) => {
  const multiplier = comboMultiplier(streak);
  if (multiplier <= 1) return null;
  return multiplier >= MAX_COMBO_MULTIPLIER ? `x${multiplier} 满连` : `x${multiplier} 连击`;
};

export const zoneLabel = (distance) => zoneAt(distance).name;

export const nextZoneLabel = (distance) => {
  const zone = nextZone(distance);
  if (!zone) return '已达最深区域';
  return `${zone.name} 还有 ${Math.max(0, Math.ceil(zone.from - distance))} m`;
};

export const statusLabel = (status) => {
  if (status === 'ready') return '轻点开始';
  if (status === 'paused') return '已暂停';
  if (status === 'over') return '本局结束';
  return '疾风中';
};

export const starLabel = (stars) => '★'.repeat(Math.max(0, stars)) + '☆'.repeat(Math.max(0, 3 - stars));

export const crashReason = (effects) => {
  const crash = effects.find((effect) => effect.type === 'crash');
  if (!crash) return null;
  const reasons = {
    crate: '撞上了木箱，早一点起跳',
    barrier: '横杆太低，需要滑铲',
    wall: '整面墙只能变道躲开',
    pit: '掉进了缺口，跳过去',
  };
  return reasons[crash.kind] ?? '撞上了障碍';
};
