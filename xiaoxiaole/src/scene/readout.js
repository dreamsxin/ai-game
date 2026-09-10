import { levelCount } from '../game/levels.js';
import { progressRatio } from '../game/rules.js';
import { SPECIAL_LABELS } from '../game/tiles.js';

export const formatScore = (score) => Math.floor(score).toLocaleString('zh-CN');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const STATUS_LABELS = {
  ready: '拖动或点选相邻两颗果实换位',
  playing: '三颗同色即消，连锁越长得分越高',
  paused: '已暂停',
  won: '过关',
  over: '步数用完了',
};

export const statusLabel = (status) => STATUS_LABELS[status] ?? '';

export const levelLabel = (level) => `第 ${level.id}/${levelCount} 关 · ${level.name}`;

export const goalLabel = (level) => `目标 ${formatScore(level.target)}`;

export const movesLabel = (moves) => `${Math.max(0, moves)} 步`;

export const progressPercent = (score, target) => Math.round(progressRatio(score, target) * 100);

export const starLabel = (stars) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));

export const specialLabel = (special) => SPECIAL_LABELS[special] ?? '';

// 消除提示：果实数、连锁和触发的特殊果实拼在同一行里。
export function clearLabel(clear) {
  if (!clear) return '';
  const parts = [`消 ${clear.count}`];
  if (clear.chain > 1) parts.push(`${clear.chain} 连锁`);
  const specials = [...new Set(clear.specials ?? [])].map(specialLabel).filter(Boolean);
  if (specials.length) parts.push(specials.join('+'));
  parts.push(`+${formatScore(clear.gained)}`);
  return parts.join(' · ');
}

export const remainLabel = (score, target) => {
  const remain = Math.max(0, target - score);
  return remain ? `还差 ${formatScore(remain)} 分` : '目标已达成';
};
