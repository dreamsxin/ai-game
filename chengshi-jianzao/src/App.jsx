import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Coins,
  Factory,
  Hammer,
  HelpCircle,
  Home,
  Leaf,
  Pause,
  Play,
  Route,
  RotateCcw,
  RotateCw,
  Store,
  Trees,
  Trophy,
  Users,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BUILD_ORDER, BUILDINGS, LEVEL_COUNT, TOOL_BULLDOZE, DEMOLISH_COST } from './game/rules.js';
import { createInput } from './game/input.js';
import {
  build,
  createGame,
  cycleTool,
  restartLevel,
  setSpeed,
  setTool,
  tick,
  togglePause,
} from './game/simulation.js';
import { createScene } from './scene/createScene.js';
import { YAW_STEP, advanceClock, zoomStep } from './scene/motion.js';
import {
  TUTORIAL_STEPS,
  buildingBrief,
  coachLine,
  levelLabel,
  loseComment,
  moneyLabel,
  monthLabel,
  netLabel,
  populationLabel,
  powerLabel,
  speedLabel,
  starLabel,
  toolLabel,
  winComment,
} from './scene/readout.js';

const STARS_KEY = 'chengshi-jianzao:stars';
const TAUGHT_KEY = 'chengshi-jianzao:taught';
const TOOL_ICONS = {
  road: Route,
  house: Home,
  shop: Store,
  factory: Factory,
  power: Zap,
  park: Trees,
  [TOOL_BULLDOZE]: Hammer,
};
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(0, randomSeed()));
  // 镜头和预览框只喂给渲染层，每帧读一次，不进游戏状态也不触发重渲染。
  const viewRef = useRef({ hover: null, yaw: Math.PI / 4, zoom: 1 });
  // 一次拖动里同一格只建一次，否则手指停住会反复扣钱。
  const paintedRef = useRef(-1);
  const paintingRef = useRef(false);
  const [view, setView] = useState(gameRef.current);
  const [stars, setStars] = useState(() => readJson(STARS_KEY, {}));
  const [guide, setGuide] = useState(() => !readJson(TAUGHT_KEY, false));

  // 权威状态在 ref 里，React state 只是 HUD 的镜像。
  const apply = useCallback((next) => {
    if (next === gameRef.current) return;
    gameRef.current = next;
    setView(next);
  }, []);

  const load = useCallback((index, seed) => {
    gameRef.current = createGame(index, seed);
    paintedRef.current = -1;
    setView(gameRef.current);
  }, []);

  const closeGuide = useCallback(() => {
    setGuide(false);
    writeJson(TAUGHT_KEY, true);
  }, []);

  const onAction = useCallback((action) => {
    const state = gameRef.current;
    if (action.startsWith('tool:')) apply(setTool(state, action.slice(5)));
    else if (action === 'nextTool') apply(cycleTool(state, 1));
    else if (action === 'prevTool') apply(cycleTool(state, -1));
    else if (action === 'pause') apply(togglePause(state));
    else if (action === 'faster') apply(setSpeed(state, 2));
    else if (action === 'slower') apply(setSpeed(state, 1));
    else if (action === 'restart') apply(restartLevel(state));
    else if (action === 'rotateLeft') viewRef.current.yaw -= YAW_STEP;
    else if (action === 'rotateRight') viewRef.current.yaw += YAW_STEP;
    else if (action === 'zoomIn') viewRef.current.zoom = zoomStep(viewRef.current.zoom, 0.15);
    else if (action === 'zoomOut') viewRef.current.zoom = zoomStep(viewRef.current.zoom, -0.15);
  }, [apply]);

  useEffect(() => {
    const host = hostRef.current;
    const scene = createScene(host);

    const paint = (x, y) => {
      const cell = scene.pick(x, y);
      viewRef.current.hover = cell;
      if (!cell || cell.index === paintedRef.current) return;
      paintedRef.current = cell.index;
      apply(build(gameRef.current, cell.col, cell.row));
    };

    const touch = createInput(host, {
      onPaintStart: ({ x, y }) => {
        paintingRef.current = true;
        paintedRef.current = -1;
        paint(x, y);
      },
      onPaintMove: ({ x, y }) => paint(x, y),
      onPaintEnd: () => {
        paintingRef.current = false;
        paintedRef.current = -1;
      },
      onHover: (point) => {
        viewRef.current.hover = point ? scene.pick(point.x, point.y) : null;
      },
      keyboard: false,
    });
    const keys = createInput(window, { onAction, pointer: false });

    let frame = 0;
    let last = 0;
    let clock = 0;
    const schedule = () => {
      frame = requestAnimationFrame((now) => {
        const time = now / 1000;
        const dt = last === 0 ? 0 : Math.min(0.25, time - last);
        last = time;
        const advanced = advanceClock(clock, dt, gameRef.current.speed);
        clock = advanced.accumulator;
        for (let month = 0; month < advanced.months; month += 1) apply(tick(gameRef.current));
        scene.render(gameRef.current, time, viewRef.current);
        schedule();
      });
    };
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      touch.dispose();
      keys.dispose();
      scene.dispose();
    };
  }, [apply, onAction]);

  useEffect(() => {
    if (view.status !== 'won') return;
    const best = stars[view.levelIndex] ?? 0;
    if (view.stars <= best) return;
    const record = { ...stars, [view.levelIndex]: view.stars };
    setStars(record);
    writeJson(STARS_KEY, record);
  }, [view.status, view.stars, view.levelIndex, stars]);

  // 提示是一次性的，留在屏幕上会和下一条月报打架。
  useEffect(() => {
    if (!view.notice || view.status !== 'playing') return;
    const timer = setTimeout(() => apply({ ...gameRef.current, notice: null }), 2200);
    return () => clearTimeout(timer);
  }, [view.notice, view.revision, view.status, apply]);

  const report = view.report;
  const coach = coachLine(view);
  const message = view.notice ?? coach;
  const bestStars = stars[view.levelIndex] ?? 0;
  const totalStars = Object.values(stars).reduce((sum, value) => sum + value, 0);
  const hasNext = view.levelIndex + 1 < LEVEL_COUNT;
  const costOf = (tool) => (tool === TOOL_BULLDOZE ? DEMOLISH_COST : BUILDINGS[tool].cost);

  return (
    <div className="app">
      <div ref={hostRef} className="scene" aria-label="天际营造三维城市场景" />

      <header className="hud-top">
        <div className="stat">
          <span className="stat-value">{levelLabel(view.levelIndex, view.level)}</span>
          <span className="stat-label">{monthLabel(view.month)} · 目标 {view.level.target} 人</span>
        </div>
        <div className="stat stat-money">
          <span className="stat-value">
            <Coins size={14} aria-hidden="true" /> {moneyLabel(view.money)}
          </span>
          <span className="stat-label">月结 {netLabel(report.net)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{totalStars}</span>
        </div>
      </header>

      <div className="hud-side">
        <span className="chip">
          <Users size={13} aria-hidden="true" /> {populationLabel(view.population, view.level.target)}
        </span>
        <span className={`chip${report.powered ? '' : ' chip-alert'}`}>
          <Zap size={13} aria-hidden="true" /> {powerLabel(report)}
        </span>
        <span className="chip">
          <Leaf size={13} aria-hidden="true" /> 环境 {report.appeal}
        </span>
        <span className="chip">
          <CalendarDays size={13} aria-hidden="true" /> 容量 {report.capacity} · 岗位 {report.jobs}
        </span>
        {bestStars > 0 && <span className="chip chip-star">{starLabel(bestStars)}</span>}
        <button type="button" className="chip chip-help" onClick={() => setGuide(true)}>
          <HelpCircle size={13} aria-hidden="true" /> 玩法
        </button>
      </div>

      <div className="hud-camera">
        <button type="button" className="pad-key" onClick={() => onAction('rotateLeft')} aria-label="视角左转">
          <RotateCcw size={18} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onClick={() => onAction('rotateRight')} aria-label="视角右转">
          <RotateCw size={18} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onClick={() => onAction('zoomIn')} aria-label="拉近">
          <ZoomIn size={18} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onClick={() => onAction('zoomOut')} aria-label="拉远">
          <ZoomOut size={18} aria-hidden="true" />
        </button>
      </div>

      {message && (
        <p className={`toast${view.notice ? '' : ' toast-coach'}`} role="status">{message}</p>
      )}

      <div className="clock" role="group" aria-label="时间控制">
        <button
          type="button"
          className={`clock-key${view.speed === 0 ? ' clock-key-on' : ''}`}
          onClick={() => apply(togglePause(gameRef.current))}
          aria-label={view.speed === 0 ? '开始' : '暂停'}
        >
          {view.speed === 0 ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
        <span className="clock-label">{speedLabel(view.speed)}</span>
        <button
          type="button"
          className={`clock-key${view.speed === 2 ? ' clock-key-on' : ''}`}
          onClick={() => apply(setSpeed(gameRef.current, view.speed === 2 ? 1 : 2))}
          aria-label="切换倍速"
        >
          <span className="clock-x">2×</span>
        </button>
      </div>

      {/* 工具栏就是这游戏的全部操作面：选中一种，按住在地图上拖就是连着建。 */}
      <nav className="palette" aria-label="建造工具">
        {[...BUILD_ORDER, TOOL_BULLDOZE].map((tool) => {
          const Icon = TOOL_ICONS[tool];
          const cost = costOf(tool);
          const affordable = view.money >= cost;
          return (
            <button
              key={tool}
              type="button"
              className={`tool${view.tool === tool ? ' tool-on' : ''}${affordable ? '' : ' tool-poor'}`}
              onClick={() => apply(setTool(gameRef.current, tool))}
              aria-pressed={view.tool === tool}
              aria-label={`${toolLabel(tool)}，${cost} 金`}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="tool-name">{toolLabel(tool)}</span>
              <span className="tool-cost">{cost}</span>
            </button>
          );
        })}
      </nav>
      <p className="palette-hint">{view.tool === TOOL_BULLDOZE ? '按住拖动可以连续拆除' : buildingBrief(view.tool)}</p>

      {guide && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>怎么玩</h1>
            <p className="panel-status">你是市长，路网、岗位、电力和环境都要自己配平</p>
            <ol className="panel-steps">
              {TUTORIAL_STEPS.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  {step.detail}
                </li>
              ))}
            </ol>
            <button type="button" className="panel-action" onClick={closeGuide}>
              <Play size={18} aria-hidden="true" />
              开始建城
            </button>
          </div>
        </div>
      )}

      {view.status === 'won' && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>达标</h1>
            <p className="panel-status">{levelLabel(view.levelIndex, view.level)} · {monthLabel(view.month)}</p>
            <p className="panel-stars">{starLabel(view.stars)}</p>
            <p className="panel-score">{view.population} 人</p>
            <p className="panel-detail">{winComment(view.month, view.level.par)}</p>
            <button
              type="button"
              className="panel-action"
              onClick={() => (hasNext ? load(view.levelIndex + 1, randomSeed()) : load(0, randomSeed()))}
            >
              {hasNext ? '下一关' : '换一张地图重头再来'}
            </button>
            <button type="button" className="panel-link" onClick={() => load(view.levelIndex, randomSeed())}>
              这一关换张新地图
            </button>
          </div>
        </div>
      )}

      {view.status === 'lost' && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>市政破产</h1>
            <p className="panel-status">{levelLabel(view.levelIndex, view.level)} · {monthLabel(view.month)}</p>
            <p className="panel-detail">{loseComment()}</p>
            <button type="button" className="panel-action" onClick={() => apply(restartLevel(gameRef.current))}>
              <RotateCcw size={18} aria-hidden="true" />
              重开这一关
            </button>
            <button type="button" className="panel-link" onClick={() => load(view.levelIndex, randomSeed())}>
              换张新地图
            </button>
          </div>
        </div>
      )}

    </div>
  );
}







