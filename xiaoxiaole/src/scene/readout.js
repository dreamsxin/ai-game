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

// 只有真刷掉旧的最高分才报新纪录，否则每局都报喜就不值钱了。
export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

export const muteLabel = (muted) => (muted ? '音效已关' : '音效已开');

// 星级点评按拿到几颗给，和上面那行「分数账」分开说。通关本身不该被挑刺。
export const rewardLabel = (stars) => {
  if (stars >= 3) return '满星过关';
  if (stars === 2) return '再多连一环就是满星';
  if (stars === 1) return '过关了，下次多攒连锁';
  return '差一点点，再来一次';
};

