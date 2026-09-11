import { GRID_ROWS, comboMultiplier } from '../game/rules.js';
import { lowestRow, totalHp } from '../game/grid.js';

export const formatScore = (score) => Math.floor(score).toLocaleString('zh-CN');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const STATUS_LABELS = {
  ready: '拖动瞄准，松手射出一串弹珠',
  playing: '砸满血量才碎，吃加珠让弹珠越来越多',
  paused: '已暂停',
  over: '砖块压到底线了',
};

export const statusLabel = (status) => STATUS_LABELS[status] ?? '';

export const turnLabel = (turn) => `第 ${turn} 回合`;

export const stageLabel = (stage) => `第 ${stage} 阶段`;

export const ballsLabel = (count) => `${count} 颗弹珠`;

export const bricksLabel = (count) => `${count} 块砖`;

export const hpLabel = (grid) => `总血量 ${formatScore(totalHp(grid))}`;

export const aimLabel = (aim) => `${Math.round((Math.atan2(-aim.y, aim.x) * 180) / Math.PI)}°`;

export const comboLabel = (destroyed) => `×${comboMultiplier(destroyed).toFixed(2)} 连砸`;

// 砖块压到多低：越接近底线越危险，HUD 用它变色示警。
export const dangerRatio = (grid) => {
  const row = lowestRow(grid);
  return row < 0 ? 0 : (row + 1) / GRID_ROWS;
};

export const dangerLabel = (grid) => {
  const row = lowestRow(grid);
  const gap = row < 0 ? GRID_ROWS : GRID_ROWS - 1 - row;
  return gap <= 0 ? '就要压到底线了' : `离底线还有 ${gap} 行`;
};

// 回合小结：这一回合砸了多少块、吃了几颗加珠。
export function turnSummary(last) {
  if (!last) return '';
  const parts = [`第 ${last.turn} 回合`];
  if (last.destroyed > 0) parts.push(`砸 ${last.destroyed} 块`);
  if (last.pickups > 0) parts.push(`+${last.pickups} 珠`);
  parts.push(`共 ${last.balls} 颗`);
  return parts.join(' · ');
}
