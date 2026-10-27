// 主循环：把「一帧多久」这件事从环境手里拿回来。不 import three，也不碰 DOM，node 里能单测。
//
// rAF 是正门，但它会缺席：无头浏览器、内嵌 webview、省电模式、被冻结的时钟，
// 都可能一帧都不给。以前整个循环挂在 rAF 上——rAF 不来，连「时间戳不走就退回固定步长」
// 那道保险都没机会执行，因为它写在 rAF 的回调里。症状是画面停在第 0 帧、
// 面板照样能点，正是「打开了但玩不了」里最难查的一种。
//
// 所以正门之外永远留一条 setTimeout 的命：rAF 250ms 不应答就判它缺席，
// 循环改由 16ms 定时器驱动，世界继续走；缺席期间每隔半秒仍去敲一次 rAF 的门，
// 它一回来就交还主导权（定时器那帧的世代号已经作废，不会双跑）。

/** rAF 这么久不应答就当它缺席。比三帧长得多，比一次明显的卡顿短。 */
export const WATCHDOG_MS = 250;
/** 缺席期间自己按 60 帧走。 */
export const FRAME_MS = 1000 / 60;
/** 缺席期间每隔多少个定时器帧去敲一次 rAF 的门（约半秒）。 */
const PROBE_EVERY = 31;
/** 落后太多就不全补：切后台回来不该被一小段历史追着跑成死亡螺旋。 */
const MAX_DT = 0.1;

/**
 * 开一个循环。`frame(dt)` 每帧调用一次，dt 是秒。
 * 调度原语全部可注入，所以这条循环在 node 里可以精确地逐帧演习。
 */
export function createLoop(frame, {
  fallbackDt = 1 / 60,
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
  wait = (cb, ms) => setTimeout(cb, ms),
  cancelWait = (id) => clearTimeout(id),
  clock = () => performance.now(),
} = {}) {
  let running = false;
  // 世代号：每次重新调度都加一。在途的 rAF / 定时器回调回来时对不上号就成了空操作，
  // 「rAF 和定时器同时挂着同一帧」因此不会双跑。
  let live = 0;
  let last = null;
  let timerId = null;
  let frameId = null;
  let rafAlive = true;
  let sinceProbe = 0;

  const run = (stamp) => {
    if (!running) return;
    live += 1;
    // 时间戳不走（冻在 0 或原地）就退回固定步长：宁可当成匀速 60 帧，也不能停在原地。
    const now = Number.isFinite(stamp) && stamp > 0 ? stamp : clock();
    const measured = last == null ? fallbackDt : (now - last) / 1000;
    const dt = measured > 0 ? Math.min(measured, MAX_DT) : fallbackDt;
    last = now;
    frame(dt);
    if (running) schedule();
  };

  const clearTimer = () => {
    if (timerId != null) {
      cancelWait(timerId);
      timerId = null;
    }
  };

  const schedule = () => {
    live += 1;
    const gen = live;
    // rAF 应答着就每帧都走正门；缺席期间每隔约半秒敲一次门，等它回来交还。
    const probing = rafAlive || sinceProbe >= PROBE_EVERY;
    if (probing) {
      if (frameId != null) cancelFrame(frameId);
      frameId = requestFrame((stamp) => {
        frameId = null;
        if (!running) return;
        if (!rafAlive) {
          // 缺席期间的一次探门。不作世代号检查——探门本来就是隔着好几个定时器帧
          // 发出去的，等它回应时号早换了。rAF 既然应答，就当场拿回主导权。
          rafAlive = true;
          run(stamp);
          return;
        }
        if (gen !== live) return;
        run(stamp);
      });
    }
    clearTimer();
    timerId = wait(
      () => {
        timerId = null;
        if (!running || gen !== live) return;
        if (rafAlive) rafAlive = false;
        sinceProbe = probing ? 0 : sinceProbe + 1;
        run(clock());
      },
      rafAlive ? WATCHDOG_MS : FRAME_MS,
    );
  };

  return {
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      live += 1;
      clearTimer();
      if (frameId != null) {
        cancelFrame(frameId);
        frameId = null;
      }
    },
    /** 现在由谁驱动。测试和诊断用。 */
    mode() {
      return rafAlive ? 'raf' : 'timer';
    },
  };
}
