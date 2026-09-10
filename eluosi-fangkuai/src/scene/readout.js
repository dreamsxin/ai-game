import { PIECE_COLORS, pieceBox, pieceCells } from '../game/pieces.js';
import { levelFor, linesToNextLevel } from '../game/rules.js';

export const formatScore = (score) => Math.floor(score).toLocaleString('zh-CN');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const STATUS_LABELS = {
  ready: '轻点旋转，拖动移动，下甩硬降',
  playing: '消行升级，速度会越来越快',
  paused: '已暂停',
  over: '方块堆到顶了',
};

export const statusLabel = (status) => STATUS_LABELS[status] ?? '';

export const levelLabel = (lines) => `LV ${levelFor(lines)}`;

export const nextLevelLabel = (lines) => {
  const remain = linesToNextLevel(lines);
  return remain ? `再消 ${remain} 行升级` : '已达最高速度';
};

const CLEAR_NAMES = ['', '单消', '双消', '三消', 'TETRIS'];

// 消行提示：T-spin、连击和 back-to-back 都拼在同一行里。
export function clearLabel(clear) {
  if (!clear) return '';
  const name = clear.tspin ? `T-SPIN ${CLEAR_NAMES[Math.min(clear.count, 3)]}` : CLEAR_NAMES[Math.min(clear.count, 4)];
  return clear.combo > 1 ? `${name} · ${clear.combo} 连击` : name;
}

export const starLabel = (stars) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));

// 预览面板用的格子：把方块压到左上角，DOM 端按 box 边长铺网格。
export function previewCells(type) {
  if (!type) return { box: 0, cells: [], color: 'transparent' };
  const cells = pieceCells(type, 0);
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const width = Math.max(...cells.map(([x]) => x)) - minX + 1;
  const height = Math.max(...cells.map(([, y]) => y)) - minY + 1;
  return {
    box: pieceBox(type),
    width,
    height,
    cells: cells.map(([x, y]) => [x - minX, y - minY]),
    color: PIECE_COLORS[type],
  };
}
