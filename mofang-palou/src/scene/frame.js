// 一帧里的取舍：这一格画不画、画成什么样。
//
// 这些本来埋在 createScene 的 render 里，但它们跟 WebGL 一点关系都没有 ——
// 全是「给定状态，这一格该怎么处理」的纯判断。抽出来之后不需要浏览器就能验，
// 而「看不到出口」这类问题恰恰全部出在这一层，不是出在 draw call 上。
import { AXIS_PILLAR, AXIS_ROW } from '../game/rules.js';

/**
 * 这一格该怎么画：`solid` 实的、`ghost` 幽灵、`hidden` 不画。
 *
 * 三条裁剪策略（见 readout.js 的 cameraFor）：
 * - `focus`（俯视）只让激活层是实的；
 * - `slice`（侧视）只让选中那一排剖面是实的；
 * - `none`（转台）全是实的。
 *
 * 之上压着一条**铁律：出口和玩家那一格永远至少是幽灵**。
 * 第一版只有 focus 的裁剪，结果开局出口那一整层都没画，玩家只看见一个悬空的绿环；
 * 侧视的 slice 也有同样的洞 —— 出口不在选中那一排时它的砖就没了。
 * 与其在每条策略里各补一次，不如把它提成一条无条件的规则。
 */
export function drawModeFor(frame, cell) {
  const { clip, activeLayer, sliceRow, exitLayer } = frame;
  const solid = clip === 'slice'
    ? cell.row === sliceRow
    : clip === 'focus'
      ? cell.layer === activeLayer
      : true;
  if (solid) return 'solid';
  if (cell.isExit || cell.isPlayer) return 'ghost';
  // 俯视时把出口整层都画成幽灵：只画出口那一格看不出「通向它的路」长什么样。
  if (clip === 'focus' && cell.layer === exitLayer) return 'ghost';
  return 'hidden';
}

/** 这一格在不在这条线上。锚点缺失时一律不算。 */
export const lineHasCell = (axis, anchor, cell) => {
  if (!anchor || !axis) return false;
  if (axis === AXIS_ROW) return cell.layer === anchor.layer && cell.row === anchor.row;
  if (axis === AXIS_PILLAR) return cell.col === anchor.col && cell.row === anchor.row;
  return cell.layer === anchor.layer && cell.col === anchor.col;
};

/**
 * 这一格该用哪个材质。返回材质名，由场景层去查表 —— 这样颜色怎么配是场景的事，
 * 「什么状态该突出」是这里的事。
 *
 * 优先级：幽灵 > 选中 > 当前能推的那两条线 > 走得到 > 走不到。
 * 「走得到的亮、走不到的暗」是判断路通没通的唯一视觉线索，所以它垫在最底下 ——
 * 上面几条都是临时状态，压过它是对的。
 */
export function materialNameFor(frame, cell, mode) {
  if (mode === 'ghost') return 'ghost';
  const { selection, axes, anchor } = frame;
  if (selection
    && selection.layer === cell.layer
    && selection.col === cell.col
    && selection.row === cell.row) return 'picked';
  if (axes && (lineHasCell(axes.horizontal, anchor, cell) || lineHasCell(axes.vertical, anchor, cell))) {
    return 'line';
  }
  return cell.reachable ? 'near' : 'far';
}

// 幽灵层缩一点，读起来才像「在后面」，也不会挡住实层的门。
export const GHOST_SCALE = 0.82;

/** mesh 池要开多大。全画的时候是 order³，这是上界。 */
export const poolBudget = (order) => order ** 3;
