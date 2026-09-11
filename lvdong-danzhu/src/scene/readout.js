import { levelCount } from '../game/levels.js';
import { GRID_ROWS, grooveMultiplier, progressRatio } from '../game/rules.js';
import { colorLabel } from '../game/marbles.js';
import { lowestRow } from '../game/grid.js';

export const formatScore = (score) => Math.floor(score).toLocaleString('zh-CN');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const STATUS_LABELS = {
  ready: '拖动挡板接球，点一下发球',
  playing: '同色三连整组消，踩着拍子接球攒倍率',
  paused: '已暂停',
  won: '清场过关',
  over: '这一局结束了',
};

export const statusLabel = (status) => STATUS_LABELS[status] ?? '';

export const levelLabel = (level) => `第 ${level.id}/${levelCount} 关 · ${level.name}`;

export const goalLabel = (level) => `目标 ${formatScore(level.target)}`;

export const bpmLabel = (level) => `${level.bpm} BPM`;

export const livesLabel = (lives) => `剩 ${Math.max(0, lives)} 条命`;

export const waveLabel = (wavesLeft) => (wavesLeft > 0 ? `还有 ${wavesLeft} 波下压` : '最后一波，清场即过关');

export const marbleLabel = (count) => `${count} 颗`;

export const progressPercent = (score, target) => Math.round(progressRatio(score, target) * 100);

export const starLabel = (stars) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));

export const grooveLabel = (combo) => `×${grooveMultiplier(combo).toFixed(1)} 律动`;

export const ammoLabel = (color) => `上膛 ${colorLabel(color)}`;

// 弹珠墙压到多低：越接近底部越危险，HUD 用它变色示警。
export const pressureRatio = (grid) => {
  const row = lowestRow(grid);
  return row < 0 ? 0 : (row + 1) / GRID_ROWS;
};

// 消除提示：颗数、连消、掉落和得分拼成同一行。
export function clearLabel(clear) {
  if (!clear) return '';
  const parts = [`${colorLabel(clear.color)} ${clear.count} 连`];
  if (clear.chain > 1) parts.push(`${clear.chain} 连消`);
  if (clear.dropped > 0) parts.push(`掉落 ${clear.dropped}`);
  if (clear.combo > 0) parts.push(`×${grooveMultiplier(clear.combo).toFixed(1)}`);
  parts.push(`+${formatScore(clear.gained)}`);
  return parts.join(' · ');
}

export const remainLabel = (score, target) => {
  const remain = Math.max(0, target - score);
  return remain ? `还差 ${formatScore(remain)} 分拿第一颗星` : '星级门槛已达成';
};
