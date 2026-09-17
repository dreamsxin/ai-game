import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Droplets,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { HUMAN, STEP, advance, createGame, retryLevel, startGame, step, togglePause } from './game/simulation.js';
import { LEVEL_COUNT } from './game/maps.js';
import { createRenderer } from './scene/render.js';
import { VIBRATION, createAudio, vibrate, vibrationFor, winSound } from './scene/audio.js';
import {
  TIPS,
  actionLabel,
  formatScore,
  formatTime,
  gearLabel,
  hintLine,
  levelLabel,
  muteLabel,
  resultTitle,
  rivalLabel,
  starLabel,
  statusLabel,
} from './scene/readout.js';

const BEST_KEY = 'shuidan-tang:best';
const MUTE_KEY = 'shuidan-tang:muted';

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

const write = (storageKey, value) => {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

const DPAD = [
  { action: 'up', label: '上', className: 'pad-up' },
  { action: 'left', label: '左', className: 'pad-left' },
  { action: 'right', label: '右', className: 'pad-right' },
  { action: 'down', label: '下', className: 'pad-down' },
];

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(0, 0));
  const padRef = useRef(null);
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  const [banner, setBanner] = useState('');
  const bestAtStartRef = useRef(readBest());

  const sound = useCallback((name) => {
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    return audioRef.current.play(name);
  }, [muted]);

  const push = useCallback((next) => {
    gameRef.current = next;
    setView(next);
  }, []);

  const restart = useCallback(() => {
    bestAtStartRef.current = best;
    push(startGame(0, 0));
    // 面板上的按钮是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    sound('place');
  }, [best, push, sound]);

  const again = useCallback(() => {
    push(retryLevel(gameRef.current));
    sound('place');
  }, [push, sound]);

  const next = useCallback(() => {
    push(advance(gameRef.current));
  }, [push]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const value = !current;
      write(MUTE_KEY, value);
      if (audioRef.current) audioRef.current.setMuted(value);
      return value;
    });
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      bestAtStartRef.current = best;
      push(startGame(0, 0));
      return;
    }
    if (state.status === 'clear') {
      next();
      return;
    }
    if (state.status === 'down') {
      again();
      return;
    }
    if (state.status === 'over' || state.status === 'won') {
      restart();
      return;
    }
    push(togglePause(state));
  }, [again, best, next, push, restart]);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在舞台上，HUD 上的按钮不会被当成走位拖动。
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
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        // 放弹、困住、补刀都从这一个出口出声，和渲染层读的是同一批 effects。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
        accumulator -= STEP;
      }

      renderer.render(gameRef.current, frameDelta);
      if (now - lastUiUpdate > 90 || gameRef.current.status !== lastUiStatus) {
        // 判定层是原地推进的（每帧克隆一张图和四个角色是白扔的开销），
        // 所以这里必须给 React 一个**新的外壳**，否则 setState 会因为引用没变而整帧跳过，
        // 画面在动而 HUD 上的时间和装备永远停在开局那一刻。
        setView({ ...gameRef.current });
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
    write(BEST_KEY, view.score);
  }, [view.status, view.score, best]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // clear / over / won 是状态跳转而不是 effect，所以这几声在这里补。
  useEffect(() => {
    if (view.status === 'clear') {
      sound('clear');
      vibrate(VIBRATION.clear);
      return;
    }
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

  useEffect(() => {
    if (view.status !== 'playing') return;
    setBanner(levelLabel(view));
  }, [view.levelKey, view.attempt, view.status]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 1600);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && gameRef.current.status === 'playing') {
        push(togglePause(gameRef.current));
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [push]);

  const hold = (action, on) => padRef.current?.hold(action, on);
  const act = () => padRef.current?.press('bomb');

  const me = view.players[HUMAN];
  const ready = view.status === 'ready';
  const paused = view.status === 'paused';
  const cleared = view.status === 'clear';
  const downed = view.status === 'down';
  const finished = view.status === 'over' || view.status === 'won';
  const overlay = ready || paused || cleared || downed || finished;
  const record = finished && view.score > bestAtStartRef.current;
  const hint = hintLine(view);
  const urgent = view.time <= 20;

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{levelLabel(view)}</span>
        </div>
        <div className={`stat stat-row${urgent ? ' stat-urgent' : ''}`}>
          <Timer size={14} aria-hidden="true" />
          <span className="stat-value">{formatTime(view.time)}</span>
          <Heart size={14} aria-hidden="true" />
          <span className="stat-value">{view.lives}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rivalLabel(view)}</span>
          <span className="stat-label">{gearLabel(me)}</span>
        </div>
      </header>

      <div className="stage">
        <div ref={hostRef} className="stage-host" aria-label="水弹堂场地" />
        {banner && <p className="banner">{banner}</p>}
        {hint && <p className={`hint${me.state === 'bubble' ? ' hint-alarm' : ''}`}>{hint}</p>}
      </div>

      <nav className="pad" aria-label="触屏操作">
        <div className="pad-dir">
          {DPAD.map((keyItem) => (
            <button
              key={keyItem.action}
              type="button"
              className={`pad-key ${keyItem.className}`}
              aria-label={keyItem.label}
              onPointerDown={() => hold(keyItem.action, true)}
              onPointerUp={() => hold(keyItem.action, false)}
              onPointerLeave={() => hold(keyItem.action, false)}
              onPointerCancel={() => hold(keyItem.action, false)}
            >
              {keyItem.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`pad-action${me.state === 'bubble' ? ' pad-action-struggle' : ''}`}
          onPointerDown={act}
          aria-label={actionLabel(me)}
        >
          <Droplets size={18} aria-hidden="true" />
          {actionLabel(me)}
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
          <div className={`panel${finished || cleared ? ' panel-settle' : ''}`}>
            <h1>{finished || downed ? resultTitle(view.status) : '水弹堂'}</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>

            {ready && (
              <ul className="panel-tips">
                {TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}

            {cleared && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
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
                <p className="panel-detail">
                  {levelLabel(view)} · 困住 {view.bubbles} 次 · 补掉 {view.kills} 个 · 拆箱 {view.crates}
                </p>
                <p className="panel-detail">剩余 {formatTime(view.time)}，越早清场星越多</p>
                <button type="button" className="panel-action" onClick={next}>
                  <ChevronRight size={18} aria-hidden="true" />
                  {view.levelIndex + 1 >= LEVEL_COUNT ? '收官' : '下一关'}
                </button>
              </>
            )}

            {downed && (
              <>
                <p className="panel-detail">
                  还剩 {view.lives} 条命。重开这一关会换一张新图——箱子和道具的位置都不一样。
                </p>
                <p className="panel-detail">{hintLine({ ...view, time: 999 }) || '记住：先困住，再补刀'}</p>
                <button type="button" className="panel-action" onClick={again}>
                  <RotateCcw size={18} aria-hidden="true" />
                  再打这一关
                </button>
              </>
            )}

            {finished && (
              <>
                {record && <p className="panel-badge">新纪录</p>}
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-detail">
                  打到第 {view.levelIndex + 1} 关 · 累计 {view.totalStars} 星 · 补掉 {view.kills} 个对手
                </p>
                <p className="panel-detail">
                  <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                </p>
              </>
            )}

            {!cleared && !downed && (
              <button type="button" className="panel-action" onClick={finished || ready ? restart : pause}>
                {finished ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                {finished ? '再来一局' : ready ? '开打' : '继续'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
