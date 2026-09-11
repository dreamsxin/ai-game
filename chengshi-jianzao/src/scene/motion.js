// 渲染层与时间推进的纯数学：插值、生长动画、月份时钟。
import { MONTH_SECONDS } from '../game/rules.js';

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const mix = (from, to, t) => from + (to - from) * t;

// 新建筑从矮到高弹一下，玩家才能确认「这一格刚才建成了」。
export const SPAWN_SECONDS = 0.32;
export const spawnScale = (elapsed) => {
  if (elapsed >= SPAWN_SECONDS) return 1;
  if (elapsed <= 0) return 0.2;
  return mix(0.2, 1, easeOutCubic(elapsed / SPAWN_SECONDS));
};

// 一帧最多补 4 个月：切标签页回来时不该一次结算半年。
const MAX_CATCHUP = 4;

/** 把真实时间攒成月份。speed 为 0 时清空存量，恢复播放不会立刻跳一个月。 */
export function advanceClock(accumulator, dt, speed, monthSeconds = MONTH_SECONDS) {
  if (speed <= 0) return { accumulator: 0, months: 0 };
  let left = accumulator + Math.max(0, dt) * speed;
  let months = 0;
  while (left >= monthSeconds && months < MAX_CATCHUP) {
    left -= monthSeconds;
    months += 1;
  }
  return { accumulator: left, months };
}

// 镜头绕 Y 轴按 45° 档位转，斜视角下四个方向都能看清街区背面。
export const YAW_STEP = Math.PI / 4;
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.6;
export const zoomStep = (zoom, step) =>
  Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((zoom + step) * 100) / 100));
