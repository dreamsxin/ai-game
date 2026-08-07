import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleHelp, CirclePause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { LEVEL } from './game/level.js';
import { createInput } from './game/input.js';
import { createAutopilot } from './game/autopilot.js';
import { stageChargeProgress } from './game/progression.js';
import { ascensionProgress, createGame, enterPlanning, movePuzzle, resetGame, startGame, step, STEP, submitPuzzle, togglePause, usePuzzleHint } from './game/simulation.js';
import { createScene } from './scene/createScene.js';

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function DirectionPad({ input }) {
  const pulseTimers = useRef([]);
  const pulse = (x, y) => {
    input.current?.setPointer({ x, y });
    const timer = window.setTimeout(() => input.current?.clearPointer(), 360);
    pulseTimers.current.push(timer);
  };
  const bindPress = (x, y) => ({
    onPointerDown(event) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture may fail in test env */ }
      input.current?.setPointer({ x, y });
    },
    onPointerUp() { window.setTimeout(() => input.current?.clearPointer(), 180); },
    onPointerCancel() { input.current?.clearPointer(); },
    onLostPointerCapture() { window.setTimeout(() => input.current?.clearPointer(), 180); },
    onClick() { pulse(x, y); },
  });
  return (
    <div className="direction-pad" aria-label="方向控制">
      <button aria-label="向上移动" {...bindPress(0, -1)}><ArrowUp size={17} /></button>
      <button aria-label="向左移动" {...bindPress(-1, 0)}><ArrowLeft size={17} /></button>
      <button aria-label="向下移动" {...bindPress(0, 1)}><ArrowDown size={17} /></button>
      <button aria-label="向右移动" data-testid="move-right" {...bindPress(1, 0)}><ArrowRight size={17} /></button>
    </div>
  );
}

function VirtualStick({ input }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (event) => {
    const rect = baseRef.current.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    const limit = rect.width * 0.32;
    const scale = length > limit ? limit / length : 1;
    const next = { x: x * scale, y: y * scale };
    setKnob(next);
    input.current?.setPointer({ x: next.x / limit, y: next.y / limit });
  };
  const release = () => { setKnob({ x: 0, y: 0 }); input.current?.clearPointer(); };
  return (
    <div
      ref={baseRef}
      className="virtual-stick"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event); }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="移动摇杆"
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function PuzzlePlanner({ game, onMove, onHint, onSubmit }) {
  const hintMove = LEVEL.puzzle.solutionMoves[Math.min(game.puzzle.hintTier - 1, LEVEL.puzzle.solutionMoves.length - 1)];
  const moduleClass = (id) => {
    if (id === LEVEL.puzzle.entry) return 'is-entry';
    if (id === LEVEL.puzzle.checkpoint) return 'is-checkpoint';
    if (LEVEL.puzzle.modules[id].contents?.length) return 'has-mass';
    if (id.startsWith('gate-')) return 'has-gate';
    return '';
  };
  const moveButton = (move, icon, label, key) => {
    const highlighted = game.puzzle.hintTier >= 3
      && hintMove
      && hintMove.axis === move.axis
      && hintMove.index === move.index
      && hintMove.delta === move.delta;
    return <button key={key} className={highlighted ? 'is-hint' : ''} onClick={() => onMove(move)} aria-label={label}>{icon}</button>;
  };
  return (
    <section className="puzzle-planner" aria-label="星环迷阵规划面板">
      <header><div><p className="eyebrow">WARP SHIFT · 路线规划</p><h2>星环迷阵</h2></div><span>{game.puzzle.moduleMoves} 步</span></header>
      <div className="puzzle-board-wrap">
        <div className="column-controls top">
          {Array.from({ length: LEVEL.puzzle.columns }, (_, index) => moveButton({ axis: 'column', index, delta: -1 }, <ArrowUp size={15} />, `第 ${index + 1} 列上移`, `cu-${index}`))}
        </div>
        <div className="row-controls left">
          {Array.from({ length: LEVEL.puzzle.rows }, (_, index) => moveButton({ axis: 'row', index, delta: -1 }, <ArrowLeft size={15} />, `第 ${index + 1} 行左移`, `rl-${index}`))}
        </div>
        <div className="puzzle-board">
          {game.puzzle.board.map((id) => {
            const module = LEVEL.puzzle.modules[id];
            const mass = module.contents?.map((item) => LEVEL.objects.find((object) => object.id === item.objectId)?.mass).filter(Boolean);
            return <div className={`puzzle-module ${moduleClass(id)}`} key={id}><strong>{module.label}</strong>{mass?.length > 0 && <span>+{mass.join(' / ')}</span>}</div>;
          })}
        </div>
        <div className="row-controls right">
          {Array.from({ length: LEVEL.puzzle.rows }, (_, index) => moveButton({ axis: 'row', index, delta: 1 }, <ArrowRight size={15} />, `第 ${index + 1} 行右移`, `rr-${index}`))}
        </div>
        <div className="column-controls bottom">
          {Array.from({ length: LEVEL.puzzle.columns }, (_, index) => moveButton({ axis: 'column', index, delta: 1 }, <ArrowDown size={15} />, `第 ${index + 1} 列下移`, `cd-${index}`))}
        </div>
      </div>
      <footer>
        <button className="planner-help" onClick={onHint}><CircleHelp size={17} />提示 {game.puzzle.hintTier}/3</button>
        <button className="primary" data-testid="commit-route" onClick={onSubmit}><Play size={17} />锁定路线</button>
      </footer>
    </section>
  );
}

export default function App() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const inputRef = useRef(null);
  const autopilotRef = useRef(null);
  const gameRef = useRef(createGame());
  const [view, setView] = useState(gameRef.current);

  const commit = useCallback((next) => {
    gameRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    const scene = createScene(hostRef.current);
    const input = createInput((code) => {
      if (code !== 'Space' && code !== 'KeyP') return;
      gameRef.current = gameRef.current.status === 'ready' ? startGame(gameRef.current) : togglePause(gameRef.current);
      setView(gameRef.current);
    });
    const autopilot = createAutopilot();
    autopilotRef.current = autopilot;
    sceneRef.current = scene;
    inputRef.current = input;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUiUpdate = 0;
    let lastUiStatus = gameRef.current.status;
    const animate = (now) => {
      const frameDelta = Math.min(Math.max((now - last) / 1000, STEP), 0.1);
      last = now;
      accumulator += frameDelta;
      while (accumulator >= STEP) {
        const manualInput = input.snapshot(now);
        const routeInput = autopilot.snapshot(gameRef.current);
        const mergedInput = autopilot.isActive() ? routeInput : manualInput;
        gameRef.current = step(gameRef.current, mergedInput, STEP);
        if (gameRef.current.status === 'ascending' && autopilot.isActive()) autopilot.complete();
        accumulator -= STEP;
      }
      scene.render(gameRef.current, now / 1000);
      if (now - lastUiUpdate > 120 || gameRef.current.status !== lastUiStatus) {
        setView(gameRef.current);
        lastUiUpdate = now;
        lastUiStatus = gameRef.current.status;
      }
    };
    const scheduleRaf = () => {
      frame = requestAnimationFrame((now) => {
        animate(now);
        scheduleRaf();
      });
    };
    scheduleRaf();
    return () => {
      cancelAnimationFrame(frame);
      input.dispose();
      scene.dispose();
      sceneRef.current = null;
      inputRef.current = null;
    };
  }, []);

  const restart = () => {
    autopilotRef.current?.stop();
    commit(startGame(resetGame()));
  };
  const runFixedRoute = () => {
    if (gameRef.current.status === 'ready') {
      commit(enterPlanning(gameRef.current));
      return;
    }
    if (gameRef.current.status === 'planning') return;
    if (gameRef.current.status === 'paused') commit(startGame(gameRef.current));
    autopilotRef.current?.start();
  };
  const shiftPuzzle = (move) => commit(movePuzzle(gameRef.current, move));
  const hintPuzzle = () => commit(usePuzzleHint(gameRef.current));
  const lockPuzzle = () => {
    const next = submitPuzzle(gameRef.current);
    commit(next);
    if (next.status === 'playing') autopilotRef.current?.start();
  };
  const routeMode = autopilotRef.current?.mode() ?? 'idle';
  const progress = Math.min(100, (view.player.mass / 90) * 100);
  const charge = stageChargeProgress(view.player.mass);
  const chargePercent = Math.floor(charge.progress * 100);
  const ascensionUnlocked = charge.complete;
  const nextTarget = ascensionUnlocked
    ? null
    : view.objects.find((object) => object.active && object.mass <= view.player.mass + 2);

  return (
    <main className="game-shell">
      <div ref={hostRef} className="scene" aria-label="霓界吞噬三维游戏场景" />
      <header className="topbar">
        <div className="brand"><Sparkles size={18} /><strong>霓界吞噬</strong><span>01 · 荧光庭院</span></div>
        <div className="top-actions">
          <button className="route-button" onClick={runFixedRoute} title="运行第一关固定路线">{routeMode === 'completed' ? '路线完成' : '自动路线'}</button>
          <span className="timer">{formatTime(view.elapsed)}</span>
          <button className="icon-button" onClick={() => commit(togglePause(gameRef.current))} title={view.status === 'paused' ? '继续' : '暂停'}>
            {view.status === 'paused' ? <Play size={19} /> : <CirclePause size={19} />}
          </button>
          <button className="icon-button" onClick={restart} title="重新开始"><RotateCcw size={19} /></button>
        </div>
      </header>

      <section className="mission-panel">
        <p className="eyebrow">共鸣目标</p>
        <div className="mass-row"><strong>{Math.floor(view.player.mass)}</strong><span>/ 90 能量</span></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="charge-row">
          <span>{ascensionUnlocked ? '三环已完整' : charge.ringName}</span>
          <strong>{ascensionUnlocked ? '浑天仪跃迁已解锁' : `${chargePercent}% → ${charge.nextThreshold}`}</strong>
        </div>
        <div
          className={`charge-track ${ascensionUnlocked ? 'is-complete' : ''}`}
          role="progressbar"
          aria-label={ascensionUnlocked ? '三环共鸣完成' : charge.ringName}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={chargePercent}
        ><i style={{ width: `${chargePercent}%` }} /></div>
        <dl>
          <div><dt>体积</dt><dd>{view.player.radius.toFixed(1)}</dd></div>
          <div><dt>已吞噬</dt><dd>{view.collected} / {view.objects.length}</dd></div>
        </dl>
      </section>

      <section className="status-line">
        <i className={view.player.mass >= 90 ? 'open' : ''} />
        <span>{view.message}</span>
      </section>

      <aside className="target-chip">
        <span>{ascensionUnlocked ? '跃迁目标' : '当前可吞噬'}</span>
        <strong>{ascensionUnlocked ? '前往浑天仪环阵' : nextTarget ? `${nextTarget.type.toUpperCase()} · ${nextTarget.mass}` : '规划下一条路线'}</strong>
      </aside>

      <DirectionPad input={inputRef} />
      <VirtualStick input={inputRef} />

      {view.status === 'ready' && (
        <section className="overlay intro">
          <p className="eyebrow">SEED {view.seed}</p>
          <h1>霓界吞噬</h1>
          <p>滚过荧光庭院，按正确顺序吞噬几何体。使三层共鸣环完整，解锁浑天仪跃迁。</p>
          <button className="primary" data-testid="start-game" autoFocus onClick={() => commit(enterPlanning(gameRef.current))}><Play size={18} />规划成长路线</button>
          <span className="controls-hint">先移动九宫模块 · 再自动执行路线</span>
        </section>
      )}

      {view.status === 'planning' && (
        <PuzzlePlanner game={view} onMove={shiftPuzzle} onHint={hintPuzzle} onSubmit={lockPuzzle} />
      )}

      {view.status === 'paused' && (
        <section className="overlay compact"><p className="eyebrow">世界静止</p><h2>能量悬停</h2><button className="primary" onClick={() => commit(togglePause(gameRef.current))}><Play size={18} />继续滚动</button></section>
      )}

      {view.status === 'ascending' && (
        <section className="ascension-hud">
          <p className="eyebrow">浑天仪跃迁 · LAYER {view.ascensionLevel + 1}</p>
          <strong>坐标校准 {Math.floor(ascensionProgress(view) * 100)}%</strong>
          <div className="ascension-bar"><i style={{ width: `${ascensionProgress(view) * 100}%` }} /></div>
        </section>
      )}

      {view.status === 'won' && (
        <section className="overlay compact"><p className="eyebrow">跃迁完成</p><h2>抵达下一维层</h2><p>用时 {formatTime(view.elapsed)} · 吞噬 {view.collected} 个几何体</p><button className="primary" onClick={restart}><RotateCcw size={18} />再次挑战</button></section>
      )}
    </main>
  );
}
