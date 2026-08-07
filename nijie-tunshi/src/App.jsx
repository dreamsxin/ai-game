import { useCallback, useEffect, useRef, useState } from 'react';
import { Atom, CirclePause, Gauge, Magnet, Play, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { ABILITIES, abilityUnlocked } from './game/abilities.js';
import { createInput } from './game/input.js';
import { stageChargeProgress } from './game/progression.js';
import { ascensionProgress, createGame, resetGame, step, STEP, togglePause } from './game/simulation.js';
import { ASCENSION_MASS } from './game/rules.js';
import { createScene } from './scene/createScene.js';

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const cooldownPercent = (cooldown, duration) => Math.max(0, Math.min(100, (1 - cooldown / duration) * 100));

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
    ><span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>
  );
}

function ActionButton({ action, label, icon, input, locked, className = '' }) {
  const press = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    input.current?.pressAction(action);
  };
  const release = () => input.current?.releaseAction(action);
  return (
    <button
      className={`action-button ${className}`}
      aria-label={label}
      disabled={locked}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >{icon}<span>{label}</span></button>
  );
}

export default function App() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const inputRef = useRef(null);
  const gameRef = useRef(createGame());
  const [view, setView] = useState(gameRef.current);

  const commit = useCallback((next) => {
    gameRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    const scene = createScene(hostRef.current);
    const input = createInput(() => {
      gameRef.current = togglePause(gameRef.current);
      input.clear();
      setView(gameRef.current);
    });
    sceneRef.current = scene;
    inputRef.current = input;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUiUpdate = 0;
    let lastUiStatus = gameRef.current.status;
    const animate = (now) => {
      const frameDelta = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      accumulator += frameDelta;
      while (accumulator >= STEP) {
        gameRef.current = step(gameRef.current, input.snapshot(), STEP);
        accumulator -= STEP;
      }
      scene.render(gameRef.current, now / 1000);
      if (now - lastUiUpdate > 90 || gameRef.current.status !== lastUiStatus) {
        setView(gameRef.current);
        lastUiUpdate = now;
        lastUiStatus = gameRef.current.status;
      }
    };
    const schedule = () => {
      frame = requestAnimationFrame((now) => { animate(now); schedule(); });
    };
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      input.dispose();
      scene.dispose();
      sceneRef.current = null;
      inputRef.current = null;
    };
  }, []);

  const restart = () => {
    inputRef.current?.clear();
    commit(resetGame());
  };
  const charge = stageChargeProgress(view.player.mass);
  const progress = Math.min(100, (view.player.mass / ASCENSION_MASS) * 100);
  const coreActive = view.objects.find((object) => object.id === 'core')?.active;
  const objective = view.encounter.coreUnlocked && coreActive ? '核心窗口已开放' : view.message;
  const dashReady = cooldownPercent(view.player.abilities.dash.cooldown, ABILITIES.dash.cooldown);
  const phaseReady = cooldownPercent(view.player.abilities.phase.cooldown, ABILITIES.phase.cooldown);

  return (
    <main className={`game-shell is-${view.status}`}>
      <div ref={hostRef} className="scene" aria-label="霓界吞噬三维游戏场景" />
      <header className="topbar">
        <div className="brand"><Sparkles size={18} /><strong>霓界吞噬</strong><span>01 · 荧光庭院</span></div>
        <div className="top-actions">
          <span className="timer">{formatTime(view.elapsed)}</span>
          <button className="icon-button" onClick={() => commit(togglePause(gameRef.current))} title={view.status === 'paused' ? '继续' : '暂停'}>
            {view.status === 'paused' ? <Play size={19} /> : <CirclePause size={19} />}
          </button>
          <button className="icon-button" onClick={restart} title="重新开始"><RotateCcw size={19} /></button>
        </div>
      </header>

      <section className="mission-panel">
        <p className="eyebrow">共鸣质量</p>
        <div className="mass-row"><strong>{Math.floor(view.player.mass)}</strong><span>/ {ASCENSION_MASS}</span></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="charge-row"><span>{charge.ringName}</span><strong>{Math.floor(charge.progress * 100)}%</strong></div>
        <div className="charge-track" role="progressbar" aria-label={charge.ringName} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(charge.progress * 100)}><i style={{ width: `${charge.progress * 100}%` }} /></div>
        <dl>
          <div><dt>体积</dt><dd>{view.player.radius.toFixed(1)}</dd></div>
          <div><dt>共鸣</dt><dd>{Math.floor(view.player.abilities.resonance)}%</dd></div>
        </dl>
      </section>

      <aside className="objective-chip"><span>{view.encounter.route ? `${view.encounter.route === 'swift' ? '迅捷' : '稳健'}路线` : '当前目标'}</span><strong>{objective}</strong></aside>

      <section className="ability-hud" aria-label="共鸣能力">
        <div className="ability-slot is-ready"><Zap size={16} /><span>冲刺</span><i style={{ '--ready': `${dashReady}%` }} /></div>
        <div className={`ability-slot ${abilityUnlocked('gravity', view.player.mass) ? 'is-ready' : 'is-locked'}`}><Magnet size={16} /><span>{abilityUnlocked('gravity', view.player.mass) ? '牵引' : '12 解锁'}</span></div>
        <div className={`ability-slot ${abilityUnlocked('phase', view.player.mass) ? 'is-ready' : 'is-locked'}`}><Atom size={16} /><span>{abilityUnlocked('phase', view.player.mass) ? '相位' : '32 解锁'}</span><i style={{ '--ready': `${phaseReady}%` }} /></div>
      </section>

      {view.player.combo > 1 && <div className="combo"><span>RESONANCE</span><strong>×{view.player.combo}</strong><i style={{ width: `${(view.player.comboRemaining / 2.7) * 100}%` }} /></div>}
      <section className="status-line"><Gauge size={15} /><span>{view.message}</span></section>

      <VirtualStick input={inputRef} />
      <div className="mobile-actions">
        <ActionButton action="gravity" label="牵引" icon={<Magnet size={18} />} input={inputRef} locked={!abilityUnlocked('gravity', view.player.mass)} />
        <ActionButton action="phase" label="相位" icon={<Atom size={18} />} input={inputRef} locked={!abilityUnlocked('phase', view.player.mass)} />
        <ActionButton action="dash" label="冲刺" icon={<Zap size={23} />} input={inputRef} className="primary-action" />
      </div>

      <div className="opening-title"><span>SEED {view.seed}</span><strong>荧光庭院</strong></div>

      {view.status === 'paused' && (
        <section className="overlay compact"><p className="eyebrow">世界静止</p><h2>能量悬停</h2><button className="primary" onClick={() => commit(togglePause(gameRef.current))}><Play size={18} />继续滚动</button></section>
      )}
      {view.status === 'ascending' && (
        <section className="ascension-hud"><p className="eyebrow">浑天仪跃迁 · LAYER {view.ascensionLevel + 1}</p><strong>坐标校准 {Math.floor(ascensionProgress(view) * 100)}%</strong><div className="ascension-bar"><i style={{ width: `${ascensionProgress(view) * 100}%` }} /></div></section>
      )}
      {view.status === 'won' && (
        <section className="overlay results"><p className="eyebrow">维度跃迁完成</p><h2>{'★'.repeat(view.result?.stars ?? 1)}</h2><div className="result-grid"><span>用时<strong>{formatTime(view.result?.elapsed ?? 0)}</strong></span><span>最高连击<strong>×{view.result?.highestCombo ?? 0}</strong></span><span>路线<strong>{view.result?.route === 'swift' ? '迅捷' : '稳健'}</strong></span><span>相位捷径<strong>{view.result?.phaseShortcut ? '完成' : '未使用'}</strong></span></div><button className="primary" onClick={restart}><RotateCcw size={18} />再次挑战</button></section>
      )}
    </main>
  );
}
