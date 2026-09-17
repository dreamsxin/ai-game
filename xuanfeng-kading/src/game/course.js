// 赛道几何。一条赛道就是一条**闭合中心线**加一个宽度，
// 判定、机器人、渲染、小地图全部只读这一份数据，谁也不许自己再算一份。
//
// 中心线用极坐标的谐波和写成 r(θ) = R · (1 + Σ aₖ·sin(kθ + φₖ))：
// 这样闭合是白送的（θ 走满一圈自然回到起点），不用手工对齐首尾，
// 而「弯道密度」正好落在谐波的阶数 k 和振幅 a 上——关卡表调这两个数就是在调难度。
//
// 采样分两步：先按角度密采一圈算弧长，再**按等弧长重采**成节点表。
// 等弧长这一步是后面所有事情的前提：里程 s 与节点下标只差一个常数间距，
// 于是「s 处的点」「s 处的曲率」「某个位置投影到哪一米」都是 O(1)。

import { TAU, clamp, wrapAngle } from './rules.js';

/** 节点间距。3 米一节，一条 700 米的赛道约 230 节，够渲染也够机器人前瞻。 */
export const SPACING = 3;

const DENSE = 4096;

const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

export function buildCourse({ radius = 110, harmonics = [], width = 26 } = {}) {
  // 第一步：密采一圈，只为了拿到弧长表。
  const dense = [];
  let total = 0;
  for (let i = 0; i <= DENSE; i += 1) {
    const theta = (i / DENSE) * TAU;
    let r = 1;
    for (const { k, amp, phase = 0 } of harmonics) r += amp * Math.sin(k * theta + phase);
    const x = radius * r * Math.cos(theta);
    const y = radius * r * Math.sin(theta);
    if (i > 0) total += Math.hypot(x - dense[i - 1].x, y - dense[i - 1].y);
    dense.push({ x, y, s: total });
  }

  // 第二步：等弧长重采。首尾节点不重复——节点表是环形的，下标越界一律取模。
  const count = Math.max(24, Math.round(total / SPACING));
  const step = total / count;
  const nodes = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const want = i * step;
    while (cursor < DENSE && dense[cursor + 1].s < want) cursor += 1;
    const a = dense[cursor];
    const b = dense[Math.min(cursor + 1, DENSE)];
    const span = b.s - a.s || 1;
    const t = clamp((want - a.s) / span, 0, 1);
    nodes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: want });
  }

  const at = (i) => nodes[((i % count) + count) % count];

  for (let i = 0; i < count; i += 1) {
    const prev = at(i - 1);
    const next = at(i + 1);
    nodes[i].heading = Math.atan2(next.y - prev.y, next.x - prev.x);
  }
  for (let i = 0; i < count; i += 1) {
    // 曲率 = 车头方向的变化率。正数向左弯，负数向右弯——机器人靠这个符号找内线。
    nodes[i].curv = wrapAngle(at(i + 1).heading - at(i - 1).heading) / (2 * step);
  }
  // 曲率按 ±2 节平滑一次。重采残留的锯齿会让机器人在直道上误判成弯道，一路乱漂。
  const raw = nodes.map((node) => node.curv);
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let d = -2; d <= 2; d += 1) sum += raw[((i + d) % count + count) % count];
    nodes[i].curv = sum / 5;
  }

  const half = width / 2;
  const peak = nodes.reduce((max, node) => Math.max(max, Math.abs(node.curv)), 0);
  const mean = nodes.reduce((sum, node) => sum + Math.abs(node.curv), 0) / count;

  const indexAt = (s) => ((s / step) % count + count) % count;

  const course = {
    nodes,
    count,
    step,
    length: total,
    width,
    half,
    /** 全场最紧的弯心半径。抓地能画出的最小半径是 speed/GRIP_TURN，两者一比就知道这弯要不要漂。 */
    minRadius: peak > 0 ? 1 / peak : Infinity,
    meanCurv: mean,
    node: at,
    wrapS: (s) => ((s % total) + total) % total,

    pointAt(s) {
      const idx = indexAt(s);
      const i = Math.floor(idx);
      const t = idx - i;
      const a = at(i);
      const b = at(i + 1);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        heading: lerpAngle(a.heading, b.heading, t),
        curv: a.curv + (b.curv - a.curv) * t,
      };
    },

    curvatureAt(s) {
      return this.pointAt(s).curv;
    },

    /** 前瞻曲率：往前 span 米里最紧的一段（带符号）。机器人用它决定什么时候入漂。 */
    curvatureAhead(s, span = 24) {
      let worst = 0;
      for (let d = 0; d <= span; d += step) {
        const curv = this.curvatureAt(s + d);
        if (Math.abs(curv) > Math.abs(worst)) worst = curv;
      }
      return worst;
    },

    /**
     * 把世界坐标投影到赛道上，返回里程 s 与横向偏移 lateral（左正右负）。
     * hint 是上一帧的节点下标：给了就只在附近搜，这样每帧每辆车都是常数开销。
     */
    project(x, y, hint = null) {
      let best = 0;
      let bestDist = Infinity;
      if (hint === null) {
        for (let i = 0; i < count; i += 1) {
          const d = (nodes[i].x - x) ** 2 + (nodes[i].y - y) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
      } else {
        // ±20 节 = ±60 米。一帧最多跑 0.8 米，这个窗口足够宽。
        for (let d = -20; d <= 20; d += 1) {
          const i = ((hint + d) % count + count) % count;
          const dist = (nodes[i].x - x) ** 2 + (nodes[i].y - y) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        }
      }
      const node = nodes[best];
      const cos = Math.cos(node.heading);
      const sin = Math.sin(node.heading);
      const dx = x - node.x;
      const dy = y - node.y;
      const along = dx * cos + dy * sin;
      const lateral = -dx * sin + dy * cos;
      return { index: best, s: course.wrapS(node.s + along), lateral };
    },

    /** 边线上的一点。渲染路面、路肩和小地图都用它，省得各画一套。 */
    edgeAt(i, side) {
      const node = at(i);
      const nx = -Math.sin(node.heading) * half * side;
      const ny = Math.cos(node.heading) * half * side;
      return { x: node.x + nx, y: node.y + ny };
    },
  };

  return course;
}
