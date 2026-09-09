import { useCallback, useEffect, useRef, useState } from 'react';
import { Atom, CirclePause, Dices, Gauge, Magnet, Play, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { ABILITIES, abilityUnlocked } from './game/abilities.js';
import { HANDMADE_SLOT, nextMapSlot } from './game/generator.js';
import { createInput } from './game/input.js';
import { createReplayAgent } from './game/replayAgent.js';
import { stageChargeProgress } from './game/progression.js';
import {
  ascensionProgress, createGame, enterNextUniverse, restartCurrentUniverse,
  step, STEP, togglePause,
} from './game/simulation.js';
import {
  ASCENSION_MASS, fuelPurity, passageHeight, RING_COMPLETION_MASS, STABILITY_MAX,
  STELLAR_FUEL_TARGET, STELLAR_STABILITY_TARGET,
} from './game/rules.js';
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
  const replayRef = useRef(createReplayAgent());
  const [slot, setSlot] = useState(HANDMADE_SLOT);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGame(slot.seed, {}, slot.level);
  const [view, setView] = useState(gameRef.current);

  const commit = useCallback((next) => {
    gameRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    const scene = createScene(hostRef.current, slot.level);
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
        const manualInput = input.snapshot();
        const replayInput = replayRef.current.isActive() ? replayRef.current.snapshot(gameRef.current) : {};
        const merged = replayRef.current.isActive() ? replayInput : manualInput;
        gameRef.current = step(gameRef.current, merged, STEP);
        if (gameRef.current.status === 'ascending' && replayRef.current.isActive()) replayRef.current.stop();
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
    // 关卡几何在建场时铺好，换图只能整场重建
  }, [slot.level]);

  const restart = () => {
    replayRef.current?.stop();
    inputRef.current?.clear();
    commit(restartCurrentUniverse(gameRef.current));
  };
  const continueUniverse = () => {
    replayRef.current?.stop();
    inputRef.current?.clear();
    commit(enterNextUniverse(gameRef.current));
  };
  const swapLevel = (target) => {
    replayRef.current?.stop();
    inputRef.current?.clear();
    if (target.error) {
      setSlot({ ...slot, error: target.error });
      return;
    }
    gameRef.current = createGame(target.seed, {}, target.level);
    setSlot(target);
    setView(gameRef.current);
  };
  const shuffleLevel = () => swapLevel(nextMapSlot(slot));
  const backToHandmade = () => swapLevel(HANDMADE_SLOT);
  const toggleReplay = () => {
    if (replayRef.current?.isActive()) {
      replayRef.current.stop();
    } else {
      if (gameRef.current.status !== 'playing') commit(restartCurrentUniverse(gameRef.current));
      replayRef.current?.start();
    }
    setView(gameRef.current);
  };
  const charge = stageChargeProgress(view.player.mass);
  const progress = Math.min(100, (view.player.mass / ASCENSION_MASS) * 100);
  const fuelProgress = Math.min(100, (view.player.fuel / STELLAR_FUEL_TARGET) * 100);
  const stabilityProgress = Math.min(100, (view.player.stability / STABILITY_MAX) * 100);
  const stabilityAtRisk = view.player.stability < STELLAR_STABILITY_TARGET;
  const activeAnchors = view.anchors.filter((anchor) => anchor.active).length;
  const darkPolarityCount = view.objects.filter((object) => object.active && object.polarity === 'dark').length;
  const coreActive = view.objects.find((object) => object.id === 'core')?.active;
  const objective = view.encounter.coreUnlocked && coreActive ? '糖心熔炉已开放' : view.message;
  const objectiveLabel = view.universe.id === 'antimatter'
    ? `酸极性夹心 ${darkPolarityCount}`
    : view.encounter.route ? `${view.encounter.route === 'swift' ? '迅捷' : '稳健'}路线` : '当前目标';
  const dashReady = cooldownPercent(view.player.abilities.dash.cooldown, ABILITIES.dash.cooldown);
  const phaseReady = cooldownPercent(view.player.abilities.phase.cooldown, ABILITIES.phase.cooldown);

  return (
    <main className={`game-shell is-${view.status}`}>
      <div ref={hostRef} className="scene" aria-label="糖怪吞噬三维游戏场景" />
      <header className="topbar">
        <div className="brand"><Sparkles size={18} /><strong>糖怪吞噬</strong><span>U{String(view.universe.index).padStart(2, '0')} · {view.universe.name} · {view.universe.rule} · {slot.label}</span></div>
        <div className="top-actions">
          <button className={`route-button ${slot.generated ? 'is-active' : ''}`} onClick={shuffleLevel} title="用新种子生成一张关卡"><Dices size={15} />换一张图</button>
          {slot.generated && <button className="route-button" onClick={backToHandmade} title="回到手工关">回手工关</button>}
          <button className={`route-button ${replayRef.current?.isActive() ? 'is-active' : ''}`} onClick={toggleReplay} disabled={slot.generated} title={slot.generated ? '演示路线是为手工关编排的，生成关卡上无效' : '自动演示完整通关流程'}>{replayRef.current?.isActive() ? '演示中' : '自动演示'}</button>
          <span className="timer">{formatTime(view.elapsed)}</span>
          <button className="icon-button" onClick={() => commit(togglePause(gameRef.current))} title={view.status === 'paused' ? '继续' : '暂停'}>
            {view.status === 'paused' ? <Play size={19} /> : <CirclePause size={19} />}
          </button>
          <button className="icon-button" onClick={restart} title="重新开始"><RotateCcw size={19} /></button>
        </div>
      </header>

      <section className="mission-panel">
        <p className="eyebrow">{view.player.ignited ? '霓虹糖星诞生' : view.player.mass >= RING_COMPLETION_MASS ? '熔糖巨怪蓄力' : '糖怪成长'}</p>
        <div className="mass-row"><strong>{Math.floor(view.player.mass)}</strong><span>/ {ASCENSION_MASS} 质量</span></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="charge-row"><span>{charge.complete ? '三环糖釉完成' : charge.ringName}</span><strong>{Math.floor(charge.progress * 100)}%</strong></div>
        <div className="charge-track" role="progressbar" aria-label={charge.ringName} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(charge.progress * 100)}><i style={{ width: `${charge.progress * 100}%` }} /></div>
        <div className="stellar-row"><span>夹心燃料</span><strong>{Math.floor(view.player.fuel)}%</strong></div>
        <div className="stellar-track fuel" role="progressbar" aria-label="夹心燃料" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(fuelProgress)}><i style={{ width: `${fuelProgress}%` }} /></div>
        <div className="stellar-row"><span>糖心稳定</span><strong>{Math.floor(view.player.stability)}% {stabilityAtRisk ? `· 需 ${STELLAR_STABILITY_TARGET}%` : ''}</strong></div>
        <div className={`stellar-track stability${stabilityAtRisk ? ' at-risk' : ''}`} role="progressbar" aria-label="糖心稳定度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(view.player.stability)}><i style={{ width: `${stabilityProgress}%` }} /></div>
        <dl>
          <div><dt>糖域层级</dt><dd>U{view.universe.index}</dd></div>
          <div><dt>通行高度</dt><dd>H{passageHeight(view.player.mass).toFixed(1)}</dd></div>
          <div><dt>糖核锚点</dt><dd>{3 - activeAnchors} / 3</dd></div>
        </dl>
      </section>

      <aside className="objective-chip"><span>{objectiveLabel}</span><strong>{objective}</strong></aside>

      <section className="ability-hud" aria-label="糖怪能力">
        <div className="ability-slot is-ready"><Zap size={16} /><span>糖冲</span><i style={{ '--ready': `${dashReady}%` }} /></div>
        <div className={`ability-slot ${abilityUnlocked('gravity', view.player.mass) ? 'is-ready' : 'is-locked'}`}><Magnet size={16} /><span>{abilityUnlocked('gravity', view.player.mass) ? '糖引' : '12 解锁'}</span></div>
        <div className={`ability-slot ${abilityUnlocked('phase', view.player.mass) ? 'is-ready' : 'is-locked'}`}><Atom size={16} /><span>{abilityUnlocked('phase', view.player.mass) ? '酸雾' : '32 解锁'}</span><i style={{ '--ready': `${phaseReady}%` }} /></div>
      </section>

      {view.player.combo > 1 && <div className="combo"><span>RESONANCE</span><strong>×{view.player.combo}</strong><i style={{ width: `${(view.player.comboRemaining / 2.7) * 100}%` }} /></div>}
      <section className="status-line"><Gauge size={15} /><span>{slot.error ?? view.message}</span></section>

      <VirtualStick input={inputRef} />
      <div className="mobile-actions">
        <ActionButton action="gravity" label="糖引" icon={<Magnet size={18} />} input={inputRef} locked={!abilityUnlocked('gravity', view.player.mass)} />
        <ActionButton action="phase" label="酸雾" icon={<Atom size={18} />} input={inputRef} locked={!abilityUnlocked('phase', view.player.mass)} />
        <ActionButton action="dash" label="糖冲" icon={<Zap size={23} />} input={inputRef} className="primary-action" />
      </div>

      <div className="opening-title"><span>UNIVERSE {view.universe.index} · {view.universe.rule}</span><strong>{view.universe.name}</strong></div>

      {view.status === 'paused' && (
        <section className="overlay compact"><p className="eyebrow">糖果静止</p><h2>糖心悬停</h2><button className="primary" onClick={() => commit(togglePause(gameRef.current))}><Play size={18} />继续滚动</button></section>
      )}
      {view.status === 'ascending' && (
        <section className="ascension-hud"><p className="eyebrow">糖心压缩 · UNIVERSE {view.universe.index + 1}</p><strong>糖洞校准 {Math.floor(ascensionProgress(view) * 100)}%</strong><div className="ascension-bar"><i style={{ width: `${ascensionProgress(view) * 100}%` }} /></div></section>
      )}
      {view.status === 'won' && (
        <section className="overlay results">
          <p className="eyebrow">糖星诞生 · {view.universe.name}</p>
          <h2>{'★'.repeat(view.result?.stars ?? 1)}</h2>
          <div className="result-grid"><span>用时<strong>{formatTime(view.result?.elapsed ?? 0)}</strong></span><span>最高连击<strong>×{view.result?.highestCombo ?? 0}</strong></span><span>燃料纯度<strong>{Math.round(fuelPurity(view.result) * 100)}%</strong></span><span>最低稳定<strong>{Math.floor(view.result?.stabilityLowest ?? STABILITY_MAX)}%</strong></span><span>累计星级<strong>{view.universe.cumulativeStars + (view.result?.stars ?? 0)}</strong></span><span>下一宇宙<strong>{view.universe.index + 1}</strong></span></div>
          <div className="result-actions"><button className="secondary" onClick={restart}><RotateCcw size={17} />重试本宇宙</button><button className="primary" data-testid="next-universe" onClick={continueUniverse}><Sparkles size={17} />进入下一宇宙</button></div>
        </section>
      )}
    </main>
  );
}
