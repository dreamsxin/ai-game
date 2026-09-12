import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { VIEWS, VIEW_ORBIT, VIEW_TOP } from './game/rules.js';
import {
  boardView,
  createRun,
  hint,
  nextTower,
  resetRun,
  restartTower,
  setLayer,
  setSlice,
  setView,
  shift,
  shiftAnchor,
  tapCell,
  undo,
} from './game/simulation.js';
import { createScene } from './scene/createScene.js';
import { clearRevealDelay } from './scene/motion.js';
import {
  TUTORIAL_STEPS,
  clearRemark,
  coachLine,
  effectMessage,
  faceLabel,
  floorsLabel,
  gainLabel,
  gestureLabel,
  gestureShift,
  hintLabel,
  nextTowerLabel,
  scoreLabel,
  shiftsLabel,
  towerLabel,
  undoLabel,
  viewButtonLabel,
  whereLabel,
} from './scene/readout.js';
import { createAudio, vibrate, vibrationFor } from './scene/audio.js';

const BEST_KEY = 'mofang-palou:best';
const MUTE_KEY = 'mofang-palou:muted';
const TAUGHT_KEY = 'mofang-palou:taught';

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
    // 隐身模式下写不进 localStorage，不影响这一趟。
  }
};

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const gameRef = useRef(null);
  const cellsRef = useRef([]);
  const focusRef = useRef(null);
  const audioRef = useRef(null);
  const pointerRef = useRef(null);
  const [game, setGame] = useState(() => {
    const fresh = createRun(randomSeed());
    return { ...fresh, best: readJson(BEST_KEY, 0) };
  });
  const [muted, setMuted] = useState(() => readJson(MUTE_KEY, false));
  const [guide, setGuide] = useState(() => !readJson(TAUGHT_KEY, false));
  const [advice, setAdvice] = useState(null);
  const [panel, setPanel] = useState(null);
  const mutedRef = useRef(muted);

  // 洪泛每帧算一次太浪费，而且一次动作里它不会变 —— 按 state 缓存一份就够。
  const cells = useMemo(() => boardView(game), [game]);
  gameRef.current = game;
  cellsRef.current = cells;

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudio({ muted: mutedRef.current });
    return audioRef.current;
  }, []);

  /**
   * 权威状态就是这个 state。副作用（音效、震动）放在 setGame 外面：
   * React 允许多次调用 updater，塞进 updater 里会把同一声音效重放好几遍。
   */
  const apply = useCallback((next) => {
    if (next === game) return;
    setGame(next);
    setAdvice(null);
    ensureAudio().notify(next.effects);
    vibrate(vibrationFor(next.effects));
  }, [game, ensureAudio]);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { writeJson(MUTE_KEY, muted); audioRef.current?.setMuted(muted); }, [muted]);
  useEffect(() => { writeJson(BEST_KEY, game.best); }, [game.best]);

  // 通关面板要等角色真的走到出口再弹，否则整段走位动画都被面板盖住。
  useEffect(() => {
    const cleared = game.effects.find((effect) => effect.type === 'cleared');
    if (!cleared) return undefined;
    const timer = setTimeout(() => setPanel(cleared), clearRevealDelay(game.effects) * 1000);
    return () => clearTimeout(timer);
  }, [game]);

  // 场景只建一次。每帧都从 ref 读最新状态，避免把 rAF 循环挂进 React 的依赖里反复重建。
  useEffect(() => {
    const scene = createScene(canvasRef.current);
    sceneRef.current = scene;
    let frame = 0;
    const loop = (now) => {
      scene.render(gameRef.current, cellsRef.current, now / 1000, focusRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => () => audioRef.current?.dispose(), []);

  const onPointerDown = useCallback((event) => {
    ensureAudio();
    const cell = sceneRef.current?.pick(event.clientX, event.clientY) ?? null;
    focusRef.current = cell;
    pointerRef.current = { x: event.clientX, y: event.clientY, cell };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [ensureAudio]);

  const onPointerUp = useCallback((event) => {
    const down = pointerRef.current;
    pointerRef.current = null;
    focusRef.current = null;
    if (!down) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    const swipe = gestureShift(game.view, dx, dy);
    if (!swipe) {
      // 没滑够距离就是点击：能走就走，走不到就选中它等着被推。
      if (down.cell) apply(tapCell(game, down.cell));
      return;
    }
    // 滑动推的是「手指按住那一格」所在的线，没按到砖就退回选中格／玩家脚下。
    apply(shift(game, swipe.axis, shiftAnchor(game, down.cell), swipe.dir));
  }, [game, apply]);

  const onHint = useCallback(() => {
    const found = hint(game);
    setAdvice(found);
    if (found.move) apply(shift(game, found.move.axis, found.move.anchor, found.move.dir));
  }, [game, apply]);

  const onNext = useCallback(() => {
    setPanel(null);
    apply(nextTower(game));
  }, [game, apply]);

  const onRestart = useCallback(() => {
    setPanel(null);
    apply(restartTower(game));
  }, [game, apply]);

  const onResetRun = useCallback(() => {
    setPanel(null);
    apply(resetRun(game, randomSeed()));
  }, [game, apply]);

  const closeGuide = useCallback(() => {
    setGuide(false);
    writeJson(TAUGHT_KEY, true);
  }, []);

  const coach = coachLine(game);
  const message = effectMessage(game.effects);

  return (
    <div className="app">
      <canvas
        ref={canvasRef}
        className="stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerRef.current = null; focusRef.current = null; }}
      />

      <header className="top">
        <div className="tower">
          <strong>{towerLabel(game)}</strong>
          <span>{whereLabel(game)}</span>
        </div>
        <div className="shifts">
          <strong>{shiftsLabel(game)}</strong>
          <span>推移步数</span>
        </div>
        <div className="score">
          <Trophy size={13} aria-hidden="true" />
          <strong>{scoreLabel(game)}</strong>
          <span>{floorsLabel(game)}</span>
        </div>
      </header>

      <div className="views" role="group" aria-label="观察视角">
        {VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className={`view${game.view === view ? ' view-on' : ''}`}
            onClick={() => apply(setView(game, view))}
            aria-pressed={game.view === view}
          >
            {viewButtonLabel(view)}
          </button>
        ))}
      </div>

      {(message || coach) && <p className="ticker">{message ?? coach}</p>}

      <div className="face">
        <span>{faceLabel(game)}</span>
        {game.view !== VIEW_ORBIT && (
          <div className="stepper">
            <button
              type="button"
              onClick={() => apply(game.view === VIEW_TOP
                ? setLayer(game, game.activeLayer + 1)
                : setSlice(game, game.sliceRow + 1))}
              aria-label={game.view === VIEW_TOP ? '看上一层' : '看下一排剖面'}
            >
              <ChevronUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => apply(game.view === VIEW_TOP
                ? setLayer(game, game.activeLayer - 1)
                : setSlice(game, game.sliceRow - 1))}
              aria-label={game.view === VIEW_TOP ? '看下一层' : '看上一排剖面'}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <p className="gesture">{gestureLabel(game.view)}</p>

      <footer className="keys">
        <button type="button" className="key" onClick={() => apply(undo(game))} aria-label={undoLabel(game)}>
          <Undo2 size={18} aria-hidden="true" />
          {game.history.length > 0 && <em>{game.history.length}</em>}
        </button>
        <button type="button" className="key" onClick={onHint} aria-label={hintLabel(advice)}>
          <Lightbulb size={18} aria-hidden="true" />
        </button>
        <button type="button" className="key" onClick={onRestart} aria-label="重开这一座">
          <RotateCcw size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="key"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? '音效已关' : '音效已开'}
        >
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="key" onClick={() => setGuide(true)} aria-label="玩法">
          <HelpCircle size={18} aria-hidden="true" />
        </button>
      </footer>

      {advice && !advice.move && <p className="advice">{hintLabel(advice)}</p>}

      {panel && (
        <div className="sheet" role="dialog" aria-label="这一座通了">
          <h2>登顶</h2>
          <p className="gain">{gainLabel(panel)}</p>
          <p className="remark">{clearRemark(panel)}</p>
          <p className="tally">累计 {game.floors} 层 · {game.score} 分 · 最高 {game.best}</p>
          <button type="button" className="primary" onClick={onNext}>{nextTowerLabel(game)}</button>
          <button type="button" className="ghost" onClick={onResetRun}>从三阶重来一趟</button>
        </div>
      )}

      {guide && (
        <div className="sheet" role="dialog" aria-label="玩法">
          <h2>魔方爬楼</h2>
          <ol className="steps">
            {TUTORIAL_STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="primary" onClick={closeGuide}>开始爬</button>
        </div>
      )}
    </div>
  );
}




