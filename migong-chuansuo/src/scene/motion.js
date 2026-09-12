// 动画插值的纯数学。放在渲染层但不碰 three，所以位移、绕回、跳跃都能单测。
import { AXIS_ROW } from '../game/rules.js';

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export const mix = (from, to, t) => from + (to - from) * t;

/**
 * 一条线推移过程中每块砖的连续坐标（单位是格）。
 * state 里的棋盘已经是推完的样子，所以动画是「从来处滑到现在的位置」。
 * 绕回的那块要画两次：本体从界外滑进来，影子从对边滑出去，否则边上会空一格。
 */
export function slidePositions(length, dir, progress) {
  const t = clamp01(progress);
  const positions = [];
  let ghost = null;
  for (let index = 0; index < length; index += 1) {
    const from = index - dir;
    positions.push(from + dir * t);
    if (from < 0 || from >= length) {
      ghost = { index, position: ((from % length) + length) % length + dir * t };
    }
  }
  return { positions, ghost };
}

/**
 * 推移动画里这一格该画在哪（单位是格）。长在被推那条线上的东西都得跟着滑：
 * 玩家和出口共用这一段，别让门在砖滑动的时候先瞬移到位、砖再跟上。
 *
 * 传进来的 cell 是**推完之后**的坐标，跟 slidePositions 的下标口径一致。
 * 不在这一层、或者不在被推的那条线上，就返回 null——调用方直接用静态坐标。
 */
export function slideCell(cell, animation, board, progress) {
  if (!animation || animation.kind !== 'shift' || animation.layer !== cell.layer) return null;
  const isRow = animation.axis === AXIS_ROW;
  const onLine = isRow ? cell.row === animation.index : cell.col === animation.index;
  if (!onLine) return null;
  const along = slidePositions(isRow ? board.cols : board.rows, animation.dir, easeOutCubic(progress));
  return isRow
    ? { col: along.positions[cell.col], row: cell.row }
    : { col: cell.col, row: along.positions[cell.row] };
}

/** 走位路径的插值。progress 走完 1 就停在终点，跳跃高度取半个正弦。 */
export function walkPoint(path, progress) {
  if (path.length === 0) return null;
  if (path.length === 1) return { from: path[0], to: path[0], t: 1, hop: 0 };
  const segments = path.length - 1;
  const scaled = clamp01(progress) * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - index;
  return { from: path[index], to: path[index + 1], t, hop: Math.sin(Math.PI * t) };
}

export const walkDuration = (path, secondsPerCell) =>
  Math.max(1, path.length - 1) * secondsPerCell;

// 走完之后再留一拍，让「到了」这件事被看见。
export const REVEAL_PAUSE = 0.45;

/**
 * 通关面板要等角色真的走到出口再弹。
 * 立刻弹的话整段走位动画都被盖在面板后面，玩家只会觉得「点一下就直接通关了」。
 */
export function winRevealDelay(effects, secondsPerCell) {
  const walk = effects.find((effect) => effect.type === 'walk');
  if (!walk) return REVEAL_PAUSE;
  return walkDuration(walk.path, secondsPerCell) + REVEAL_PAUSE;
}
