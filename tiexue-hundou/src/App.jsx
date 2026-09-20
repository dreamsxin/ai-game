import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import { VIBRATION, createAudio, vibrate, vibrationFor, winSound } from './scene/audio.js';
import {
  ammoHint,
  ammoLabel,
  ammoMood,
  ammoRatio,
  bossLabel,
  bossRatio,
  chainLabel,
  formatScore,
  formatTime,
  levelLabel,
  muteLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  reloadRatio,
  resultTitle,
  rewardLabel,
  starLabel,
  statusLabel,
  weaponLabel,
} from './scene/readout.js';

const BEST_KEY = 'tiexue-hundou:best';
const MUTE_KEY = 'tiexue-hundou:muted';

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeBest = (score) => {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

const writeMuted = (muted) => {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // 同上：存不下静音偏好也不该影响这一局。
  }
};

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(0));
  const padRef = useRef(null);
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  const [banner, setBanner] = useState('');
  // 最高分在结算时才写盘，但仍要拿开局那一刻的旧纪录比，重开一局才不会误报破纪录。
  const bestAtStartRef = useRef(readBest());

  const sound = useCallback((name) => {
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    return audioRef.current.play(name);
  }, [muted]);

  const restart = useCallback(() => {
    bestAtStartRef.current = best;
    gameRef.current = startGame(0);
    setView(gameRef.current);
    setBanner('');
    // 面板上的按钮是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    sound('reload');
  }, [best, sound]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      writeMuted(next);
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'over' || state.status === 'won') {
      restart();
      return;
    }
    if (state.status === 'ready') {
      bestAtStartRef.current = best;
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      sound('reload');
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [best, restart, sound]);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在舞台上，HUD 上的按钮不会被当成摇杆拖动。
    const keys = createInput(window, { pointer: false, onPause: pause });
    const touch = createInput(host, { keyboard: false });
    padRef.current = touch;

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
        const merged = mergeInput(keys.snapshot(), touch.snapshot());
        const state = gameRef.current;
        // 第一次给出任何操作就开局，不用先点开始按钮。
        if (state.status === 'ready' && (merged.jump || merged.held.left || merged.held.right)) {
          gameRef.current = { ...state, status: 'playing' };
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        // 枪声、回弹、装甲这几声都从这一个出口出去，和渲染层读的是同一批 effects。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
        accumulator -= STEP;
      }

      renderer.render(gameRef.current, frameDelta);
      if (now - lastUiUpdate > 90 || gameRef.current.status !== lastUiStatus) {
        setView(gameRef.current);
        lastUiUpdate = now;
        lastUiStatus = gameRef.current.status;
      }
    };
    const schedule = () => {
      frame = requestAnimationFrame((now) => {
        animate(now);
        schedule();
      });
    };
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      keys.dispose();
      touch.dispose();
      renderer.dispose();
      padRef.current = null;
    };
  }, [pause]);

  useEffect(() => {
    if (view.status !== 'over' && view.status !== 'won') return;
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.status, view.score, best]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // over 和 won 是状态跳转而不是 effect（afterDeath / afterClear 都把 effects 清空了），
  // 所以这两声在这里补。
  useEffect(() => {
    if (view.status === 'won') {
      sound(winSound(view.stars));
      vibrate(VIBRATION.win);
      return;
    }
    if (view.status === 'over') {
      sound('over');
      vibrate(VIBRATION.over);
    }
  }, [view.status, view.stars, sound]);

  // 进新关或重生时闪一下关卡名，让玩家知道自己在哪。
  useEffect(() => {
    if (view.status !== 'playing') return;
    setBanner(levelLabel(view));
  }, [view.levelKey, view.status]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 1400);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && gameRef.current.status === 'playing') {
        gameRef.current = togglePause(gameRef.current);
        setView(gameRef.current);
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const hold = (action) => ({
    onPointerDown: () => padRef.current?.hold(action, true),
    onPointerUp: () => padRef.current?.hold(action, false),
    onPointerCancel: () => padRef.current?.hold(action, false),
    onPointerLeave: () => padRef.current?.hold(action, false),
  });

  const paused = view.status === 'paused';
  const ready = view.status === 'ready';
  const finished = view.status === 'over' || view.status === 'won';
  const overlay = ready || paused || finished;
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = finished && view.score > bestAtStartRef.current;
  const mood = ammoMood(view.player);
  const bossOn = Boolean(view.boss && view.boss.active && view.boss.hp > 0);

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{progressLabel(view)}</span>
        </div>
        <div className="stat stat-row">
          <Heart size={14} aria-hidden="true" />
          <span className="stat-value">{view.lives}</span>
          <Crosshair size={14} aria-hidden="true" />
          <span className="stat-value stat-weapon">{weaponLabel(view.player)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatTime(view.timeLeft)}</span>
          <span className="stat-label">{chainLabel(view.player) || levelLabel(view)}</span>
        </div>
      </header>

      {/* 弹匣是这游戏的命，所以它不藏在角落，而是横在画面顶上。 */}
      <div className={`ammo ammo-${mood}`}>
        <div className="ammo-bar" aria-hidden="true">
          <i className="ammo-fill" style={{ width: `${Math.round(ammoRatio(view.player) * 100)}%` }} />
          <i className="ammo-reload" style={{ width: `${Math.round(reloadRatio(view.player) * 100)}%` }} />
        </div>
        <span className="ammo-text">{ammoLabel(view.player)}</span>
        {ammoHint(view.player) && <span className="ammo-hint">{ammoHint(view.player)}</span>}
      </div>

      <div className="stage">
        <div ref={hostRef} className="stage-host" aria-label="铁血魂斗关卡" />
        {banner && <p className="banner">{banner}</p>}
        {bossOn && (
          <div className="boss" aria-label="Boss 核心">
            <i style={{ width: `${Math.round(bossRatio(view.boss) * 100)}%` }} />
            <span className={view.boss.open ? 'boss-open' : 'boss-shut'}>{bossLabel(view.boss)}</span>
          </div>
        )}
        <div className="progress" aria-hidden="true">
          <i style={{ width: `${Math.round(progressRatio(view) * 100)}%` }} />
        </div>
      </div>

      <nav className="pad" aria-label="触屏操作">
        <button type="button" className="pad-key" {...hold('left')} aria-label="向左走">
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" {...hold('right')} aria-label="向右走">
          <ChevronRight size={24} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-aim" {...hold('up')} aria-label="抬枪">
          <ChevronUp size={22} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-aim" {...hold('down')} aria-label="蹲下换弹">
          <ChevronDown size={22} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-jump" {...hold('jump')} aria-label="跳跃">
          跳
        </button>
      </nav>

      <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>

      <button
        type="button"
        className="mute-key"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muteLabel(muted)}
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>

      {overlay && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${finished ? ' panel-settle' : ''}`}>
            <h1>{finished ? resultTitle(view.status) : '铁血魂斗'}</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>枪是<b>自动开火</b>的：左半屏拖动走位，往上拖抬枪打斜上，空中往下拖压枪</li>
                <li>右半屏点一下起跳，按住跳得更高；按住下键再跳能从钢架上漏下去</li>
                <li><b>弹药只从命中里来</b>：打中人回 1 发，打中核心舱回 2 发，打在装甲上一发不回</li>
                <li>装填只补回 5 发而且很慢——<b>蹲下会停火并快速换弹</b>，这是唯一的喘气动作</li>
                <li>碰到人也是一条命；关末那台机器只有核心舱开着时才打得进去</li>
              </ul>
            )}
            {finished && (
              <>
                {record && <p className="panel-badge">{recordLabel(record)}</p>}
                <p className="panel-score">{formatScore(view.score)}</p>
                {/* 星星逐颗弹出来，一次性全亮就没有「攒到了」的感觉。 */}
                <p className="panel-stars" aria-label={`获得 ${view.stars} 星`}>
                  {starLabel(view.stars).split('').map((mark, index) => (
                    <i
                      key={index}
                      className={mark === '★' ? 'star-on' : 'star-off'}
                      style={{ animationDelay: `${index * 180}ms` }}
                      aria-hidden="true"
                    >
                      {mark}
                    </i>
                  ))}
                </p>
                <p className="panel-detail">{rewardLabel(view.stars)}</p>
                <p className="panel-detail">
                  {levelLabel(view)} · 用时 {formatTime(view.elapsed)}
                </p>
                <p className="panel-detail">
                  <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                </p>
              </>
            )}

            {!finished && !ready && <p className="panel-detail">{levelLabel(view)}</p>}
            <button type="button" className="panel-action" onClick={finished || ready ? restart : pause}>
              {finished ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {finished ? '再来一次' : ready ? '出击' : '继续'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



