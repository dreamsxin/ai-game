// 千年江山图——标注避让。屏幕空间的贪心摆放，和 3D 那几张导览图同一套思路。
//
// 138 条条目挤在一卷里，不避让就是一堵字墙。做法：每帧把候选标注按优先级排序
// （选中 > 悬停 > 按卷面从左到右），逐个找位置，压上已放好的就换一侧，两侧都不行就不画。
// 这里只算矩形，不碰 canvas 的绘制状态——除了量字宽必须问一次 ctx。

const LINE_H = 18;
const PAD_X = 6;
const OFFSET = 12;

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * candidates: [{ id, text, sx, sy, priority }]，sx/sy 是标记在屏幕上的位置。
 * 返回可以画的那些：[{ id, text, x, y, w, h, align }]。
 * bounds 是视口 { width, height }，越界的直接丢掉。
 */
export function placeLabels(ctx, candidates, bounds) {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || a.sx - b.sx);
  const placed = [];
  const out = [];
  for (const cand of sorted) {
    const w = ctx.measureText(cand.text).width + PAD_X * 2;
    const y = cand.sy - LINE_H / 2;
    const right = { x: cand.sx + OFFSET, y, w, h: LINE_H };
    const left = { x: cand.sx - OFFSET - w, y, w, h: LINE_H };
    const pick = [right, left].find(
      (box) => box.x >= 2 && box.x + box.w <= bounds.width - 2 && box.y >= 2 && box.y + box.h <= bounds.height - 2 && !placed.some((p) => overlaps(p, box)),
    );
    if (!pick) continue;
    placed.push(pick);
    out.push({ id: cand.id, text: cand.text, ...pick, align: pick === right ? 'left' : 'right' });
  }
  return out;
}

export const LABEL_LINE_H = LINE_H;
