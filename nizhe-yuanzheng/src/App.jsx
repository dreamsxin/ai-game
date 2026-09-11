import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Boxes,
  Fuel,
  HelpCircle,
  Lock,
  LockOpen,
  Play,
  RotateCcw,
  Truck,
  Video,
  Wrench,
} from 'lucide-react';
import { LEVEL_COUNT } from './game/level.js';
import {
  createGame,
  handleCargo,
  recover,
  refuel,
  setGear,
  step,
  toggleAwd,
  toggleDiffLock,
  toggleWinch,
} from './game/simulation.js';
import { createInput } from './game/input.js';
import { createScene } from './scene/createScene.js';
import { CAMERA_MODES } from './scene/camera.js';
import { TUTORIAL_STEPS, gearOptions, readout, starLabel, winComment } from './scene/readout.js';

const STARS_KEY = 'nizhe-yuanzheng:stars';
const TAUGHT_KEY = 'nizhe-yuanzheng:taught';
// HUD 不需要 60 Hz：仪表每 6 帧刷一次，眼睛看不出差别，React 却省下大半开销。
const HUD_EVERY = 6;
const MAX_FRAME = 1 / 20;

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
  // 触屏踏板和方向键写进 ref，每帧和键盘状态合并一次，不触发 React 更新。
  const touchRef = useRef({ throttle: 0, brake: 0, steer: 0, handbrake: false, winch: false });
  const modeRef = useRef('chase');
  // 教程面板开着的时候不能推进模拟：不然计时和油耗在玩家读说明的时候就开始跑了。
  const pausedRef = useRef(true);
  const [session, setSession] = useState(`${gameRef.current.levelIndex}:${gameRef.current.seed}`);
  const [view, setView] = useState(() => readout(gameRef.current));
  const [mode, setMode] = useState('chase');
  const [toast, setToast] = useState(null);
  const [stars, setStars] = useState(() => readJson(STARS_KEY, {}));
  const [guide, setGuide] = useState(() => !readJson(TAUGHT_KEY, false));
  const gears = useMemo(gearOptions, []);

  const load = useCallback((index, seed) => {
    gameRef.current = createGame(index, seed);
    setView(readout(gameRef.current));
    setToast(null);
    setSession(`${index}:${seed}`);
  }, []);

  const closeGuide = useCallback(() => {
    setGuide(false);
    writeJson(TAUGHT_KEY, true);
  }, []);

  const cycleCamera = useCallback(() => {
    setMode((current) => {
      const next = CAMERA_MODES[(CAMERA_MODES.indexOf(current) + 1) % CAMERA_MODES.length];
      modeRef.current = next;
      return next;
    });
  }, []);

  const onAction = useCallback((action) => {
    const state = gameRef.current;
    if (action === 'gearR') setGear(state, 'R');
    else if (action === 'gearN') setGear(state, 'N');
    else if (action === 'gearA') setGear(state, 'A');
    else if (action === 'gearL') setGear(state, 'L');
    else if (action === 'gearLL') setGear(state, 'LL');
    else if (action === 'awd') toggleAwd(state);
    else if (action === 'diffLock') toggleDiffLock(state);
    else if (action === 'winchToggle') toggleWinch(state);
    else if (action === 'cargo') handleCargo(state);
    else if (action === 'refuel') refuel(state);
    else if (action === 'recover') recover(state);
    else if (action === 'camera') cycleCamera();
    else if (action === 'help') setGuide((current) => !current);
    else if (action === 'restart') load(state.levelIndex, state.seed);
    setView(readout(gameRef.current));
  }, [cycleCamera, load]);

  useEffect(() => {
    const host = hostRef.current;
    const state = gameRef.current;
    const scene = createScene(host, state.level, state.spec);
    scene.setMode(modeRef.current);
    const input = createInput(window, { onAction });

    let frame = 0;
    let last = 0;
    let counter = 0;
    let lastEffect = -1;
    const tick = (now) => {
      const seconds = now / 1000;
      // 首帧和切标签页回来时 dt 会很大，夹住它，别让物理一步跨过半个车身。
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_FRAME, seconds - last);
      last = seconds;

      const game = gameRef.current;
      const controls = input.axes(dt, touchRef.current);
      if (!pausedRef.current) step(game, controls, dt);
      // 镜头模式放在 ref 里每帧读，切镜头就不必重建整个场景。
      scene.setMode(modeRef.current);
      scene.render(game, dt);

      counter += 1;
      if (counter % HUD_EVERY === 0 || game.status === 'won' || game.status === 'lost') {
        setView(readout(game));
      }
      const latest = game.effects[game.effects.length - 1];
      if (latest && latest.at !== lastEffect) {
        lastEffect = latest.at;
        setToast(latest);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      input.dispose();
      scene.dispose();
    };
  }, [session, onAction]);

  useEffect(() => {
    pausedRef.current = guide;
  }, [guide]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (view.status !== 'won') return;
    const index = gameRef.current.levelIndex;
    const best = stars[index] ?? 0;
    if (view.stars <= best) return;
    const record = { ...stars, [index]: view.stars };
    setStars(record);
    writeJson(STARS_KEY, record);
  }, [view.status, view.stars, stars]);

  const touch = (patch) => () => Object.assign(touchRef.current, patch);
  const levelIndex = gameRef.current.levelIndex;
  const level = gameRef.current.level;
  const hasNext = levelIndex + 1 < LEVEL_COUNT;
  const totalStars = Object.values(stars).reduce((sum, value) => sum + value, 0);

  return (
    <div className="app">
      <div ref={hostRef} className="scene" aria-label="泥辙远征三维越野场景" />

      <header className="hud-top">
        <div className="stat">
          <span className="stat-value">{level.name}</span>
          <span className="stat-label">{level.brief}</span>
        </div>
        <div className="stat stat-time">
          <span className={`stat-value${view.overPar ? ' stat-over' : ''}`}>{view.time}</span>
          <span className="stat-label">目标 {view.par}{view.penalty > 0 ? ` · 罚时 ${view.penalty}s` : ''}</span>
        </div>
        <div className="stat stat-cargo">
          <span className="stat-value">{view.delivered}/{view.required}</span>
          <span className="stat-label">{view.cargoName} · 车上 {view.cargo}/{view.slots} · 场上 {view.pending}</span>
        </div>
        <div className="stat stat-star">
          <span className="stat-value">{totalStars}</span>
          <span className="stat-label">总星数</span>
        </div>
      </header>

      <div className="gauges">
        <div className="dial">
          <span className="dial-value">{view.speed}</span>
          <span className="dial-unit">km/h{view.reversing ? ' 倒' : ''}</span>
        </div>
        <div className="bars">
          <Bar label={`转速 ${view.rpm}`} value={view.rpmFraction} tone="rpm" />
          <Bar label={`打滑`} value={view.slip} tone="slip" />
          <Bar label={`下陷 · ${view.ground}`} value={view.sink} tone="sink" />
          <Bar label={`燃油 ${view.fuel}`} value={view.fuelFraction} tone="fuel" />
          {view.winched && <Bar label="钢缆张力" value={view.winchTension} tone="winch" />}
          {view.drown > 0.02 && <Bar label={`涉水 ${view.submerged.toFixed(2)} m`} value={view.drown} tone="water" />}
        </div>
        <p className="damage">{view.damageText} · 剩 {view.remaining}</p>
      </div>

      <nav className="gearbox" aria-label="分动箱">
        {gears.map((gear) => (
          <button
            key={gear.id}
            type="button"
            className={`gear${view.gearId === gear.id ? ' gear-on' : ''}`}
            onClick={() => onAction(`gear${gear.id}`)}
            aria-pressed={view.gearId === gear.id}
            title={gear.name}
          >
            <b>{gear.short}</b>
            <i>{gear.name}</i>
          </button>
        ))}
      </nav>

      <div className="tools">
        <button type="button" className={`tool${view.awd ? ' tool-on' : ''}`} onClick={() => onAction('awd')} aria-pressed={view.awd}>
          <Truck size={16} aria-hidden="true" /> 四驱
        </button>
        <button type="button" className={`tool${view.diffLock ? ' tool-on' : ''}`} onClick={() => onAction('diffLock')} aria-pressed={view.diffLock}>
          {view.diffLock ? <Lock size={16} aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />} 差速锁
        </button>
        <button type="button" className={`tool${view.winched ? ' tool-on' : ''}`} onClick={() => onAction('winchToggle')} aria-pressed={view.winched}>
          <Anchor size={16} aria-hidden="true" /> 绞盘
        </button>
        <button type="button" className="tool" onClick={() => onAction('cargo')}>
          <Boxes size={16} aria-hidden="true" /> 装卸
        </button>
        <button type="button" className="tool" onClick={() => onAction('refuel')}>
          <Fuel size={16} aria-hidden="true" /> 加油
        </button>
        <button type="button" className="tool" onClick={() => onAction('recover')}>
          <Wrench size={16} aria-hidden="true" /> 拖车
        </button>
        <button type="button" className="tool" onClick={cycleCamera} title={`镜头：${mode}`}>
          <Video size={16} aria-hidden="true" /> 镜头
        </button>
        <button type="button" className="tool" onClick={() => setGuide(true)}>
          <HelpCircle size={16} aria-hidden="true" /> 玩法
        </button>
        <button type="button" className="tool" onClick={() => load(levelIndex, gameRef.current.seed)}>
          <RotateCcw size={16} aria-hidden="true" /> 重开
        </button>
      </div>

      {/* 触屏操作。按下写 ref、抬手清零，不进 React 状态，所以不会每帧重渲染。 */}
      <div className="pad">
        <div className="pad-steer">
          <button
            type="button"
            className="pedal pedal-steer"
            onPointerDown={touch({ steer: -1 })}
            onPointerUp={touch({ steer: 0 })}
            onPointerLeave={touch({ steer: 0 })}
            onPointerCancel={touch({ steer: 0 })}
            aria-label="向左"
          >
            ◀
          </button>
          <button
            type="button"
            className="pedal pedal-steer"
            onPointerDown={touch({ steer: 1 })}
            onPointerUp={touch({ steer: 0 })}
            onPointerLeave={touch({ steer: 0 })}
            onPointerCancel={touch({ steer: 0 })}
            aria-label="向右"
          >
            ▶
          </button>
        </div>
        <div className="pad-drive">
          <button
            type="button"
            className="pedal pedal-winch"
            onPointerDown={touch({ winch: true })}
            onPointerUp={touch({ winch: false })}
            onPointerLeave={touch({ winch: false })}
            aria-label="收绞盘"
          >
            收线
          </button>
          <button
            type="button"
            className="pedal pedal-brake"
            onPointerDown={touch({ brake: 1 })}
            onPointerUp={touch({ brake: 0 })}
            onPointerLeave={touch({ brake: 0 })}
            aria-label="刹车"
          >
            刹车
          </button>
          <button
            type="button"
            className="pedal pedal-gas"
            onPointerDown={touch({ throttle: 1 })}
            onPointerUp={touch({ throttle: 0 })}
            onPointerLeave={touch({ throttle: 0 })}
            aria-label="油门"
          >
            油门
          </button>
        </div>
      </div>

      {(toast || view.coach) && (
        <p className={`toast${toast ? ` toast-${toast.kind}` : ' toast-coach'}`} role="status">
          {toast ? toast.text : view.coach}
        </p>
      )}

      {guide && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>怎么开</h1>
            <p className="panel-status">这不是赛车。能不能到，取决于你怎么对待泥。</p>
            <ol className="panel-steps">
              {TUTORIAL_STEPS.map((stepItem) => (
                <li key={stepItem.title}>
                  <b>{stepItem.title}</b>
                  {stepItem.detail}
                </li>
              ))}
            </ol>
            <button type="button" className="panel-action" onClick={closeGuide}>
              <Play size={18} aria-hidden="true" />
              发车
            </button>
          </div>
        </div>
      )}

      {view.status === 'won' && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>交付完成</h1>
            <p className="panel-status">{level.name}</p>
            <p className="panel-stars">{starLabel(view.stars)}</p>
            <p className="panel-score">{view.time}{view.penalty > 0 ? ` + 罚时 ${view.penalty}s` : ''}</p>
            <p className="panel-detail">{winComment(gameRef.current.elapsed + gameRef.current.penalty, level.par)}</p>
            <button
              type="button"
              className="panel-action"
              onClick={() => (hasNext ? load(levelIndex + 1, randomSeed()) : load(0, randomSeed()))}
            >
              {hasNext ? '下一趟' : '换张新图重头跑'}
            </button>
            <button type="button" className="panel-link" onClick={() => load(levelIndex, randomSeed())}>
              这一关换张新图
            </button>
          </div>
        </div>
      )}

      {view.status === 'lost' && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>车报废了</h1>
            <p className="panel-status">{level.name}</p>
            <p className="panel-detail">下次撞之前先松油门。泥不吃人，石头吃。</p>
            <button type="button" className="panel-action" onClick={() => load(levelIndex, gameRef.current.seed)}>
              <RotateCcw size={18} aria-hidden="true" />
              重开这一趟
            </button>
            <button type="button" className="panel-link" onClick={() => load(levelIndex, randomSeed())}>
              换张新图
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 一根横条仪表。value 是 0..1。 */
function Bar({ label, value, tone }) {
  const width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  return (
    <div className={`bar bar-${tone}`}>
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <i style={{ width }} />
      </span>
    </div>
  );
}





