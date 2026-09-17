import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Flag, Gauge, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { STEP, TOKEN_MAX } from './game/rules.js';
import { createInput, mergeInput } from './game/input.js';
import { HUMAN, advance, createGame, retryLevel, startGame, step, togglePause } from './game/simulation.js';
import { LEVEL_COUNT } from './game/tracks.js';
import { createRenderer } from './scene/render.js';
import { VIBRATION, createAudio, vibrate, vibrationFor, winSound } from './scene/audio.js';
import {
  TIPS,
  formatLap,
  formatScore,
  formatTime,
  hintLine,
  lapLabel,
  levelLabel,
  muteLabel,
  nextLabel,
  ordinal,
  qualifyLabel,
  resultTitle,
  rivalLabel,
  speedLabel,
  starLabel,
  statusLabel,
  tierName,
  tokenPips,
} from './scene/readout.js';

const BEST_KEY = 'xuanfeng-kading:best';
const MUTE_KEY = 'xuanfeng-kading:muted';

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
    sound('count');
  }, [best, push, sound]);

  const again = useCallback(() => {
    push(retryLevel(gameRef.current));
    sound('count');
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
    // 键盘挂在 window，横向拖动只挂在舞台上，HUD 上的按钮不会被当成打方向。
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
        // 攒气、喷射、撞墙、超车都从这一个出口出声，和渲染层读的是同一批 effects。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
        accumulator -= STEP;
      }

      const me = gameRef.current.karts[HUMAN];
      if (gameRef.current.status === 'playing') {
        audioRef.current?.setEngine(me.speed, me.boostTime > 0);
      } else {
        audioRef.current?.stopEngine();
      }

      renderer.render(gameRef.current, frameDelta);
      if (now - lastUiUpdate > 80 || gameRef.current.status !== lastUiStatus) {
        // 判定层是原地推进的，所以这里必须给 React 一个**新的外壳**，
        // 否则 setState 会因为引用没变而整帧跳过，画面在动而 HUD 冻在开局那一刻。
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
    setBanner(`${levelLabel(view)} · ${qualifyLabel(view)}`);
  }, [view.levelKey, view.attempt, view.status]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 1800);
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
  const boost = () => padRef.current?.press('boost');

  const me = view.karts[HUMAN];
  const ready = view.status === 'ready';
  const paused = view.status === 'paused';
  const cleared = view.status === 'clear';
  const downed = view.status === 'down';
  const finished = view.status === 'over' || view.status === 'won';
  const overlay = ready || paused || cleared || downed || finished;
  const record = finished && view.score > bestAtStartRef.current;
  const hint = hintLine(view);
  const counting = view.countdown > 0 && view.status === 'playing';
  const charge = Math.min(1, me.charge);
  const pips = tokenPips(me.tokens, TOKEN_MAX);

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-rank">
          <span className="stat-value">{ordinal(me.rank)}</span>
          <span className="stat-label">{rivalLabel(view)}</span>
        </div>
        <div className="stat stat-row">
          <Flag size={13} aria-hidden="true" />
          <span className="stat-value">{lapLabel(view)}</span>
          <span className="stat-label">{formatTime(view.time)}</span>
        </div>
        <div className="stat stat-speed">
          <span className="stat-value">{speedLabel(me.speed)}</span>
          <span className="stat-label">km/h</span>
        </div>
      </header>

      <div className="stage">
        <div ref={hostRef} className="stage-host" aria-label="旋风卡丁赛道" />
        {counting && <p className="count">{Math.ceil(view.countdown) || 'GO!'}</p>}
        {banner && !counting && <p className="banner">{banner}</p>}
        {hint && <p className={`hint${me.offTrack || me.stall > 0 ? ' hint-alarm' : ''}`}>{hint}</p>}

        {/* 暂停和静音放在舞台左上角：那块永远是空的，而右上角要留给小地图。
            它们是 .stage 的子节点而不是 .stage-host 的，所以按它们不会被当成打方向的拖动。 */}
        <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="mute-key"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muteLabel(muted)}
        >
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className="gauge">
        <div className="charge" aria-label={`攒气 ${Math.round(charge * 100)}%`}>
          <div className={`charge-fill${me.drifting ? ' charge-live' : ''}`} style={{ width: `${charge * 100}%` }} />
        </div>
        <div className="tokens" aria-label={`氮气 ${me.tokens.length} 档`}>
          {pips.map((tier, index) => (
            <i key={index} className={`pip pip-${tier}`} aria-hidden="true">
              {tier ? tierName(tier)[0] : ''}
            </i>
          ))}
        </div>
      </div>

      <nav className="pad" aria-label="触屏操作">
        <div className="pad-steer">
          <button
            type="button"
            className="pad-key"
            aria-label="向左"
            onPointerDown={() => hold('left', true)}
            onPointerUp={() => hold('left', false)}
            onPointerLeave={() => hold('left', false)}
            onPointerCancel={() => hold('left', false)}
          >
            左
          </button>
          <button
            type="button"
            className="pad-key"
            aria-label="向右"
            onPointerDown={() => hold('right', true)}
            onPointerUp={() => hold('right', false)}
            onPointerLeave={() => hold('right', false)}
            onPointerCancel={() => hold('right', false)}
          >
            右
          </button>
        </div>
        <div className="pad-actions">
          <button
            type="button"
            className={`pad-drift${me.drifting ? ' pad-drift-on' : ''}`}
            aria-label="手刹漂移"
            onPointerDown={() => hold('drift', true)}
            onPointerUp={() => hold('drift', false)}
            onPointerLeave={() => hold('drift', false)}
            onPointerCancel={() => hold('drift', false)}
          >
            <Gauge size={18} aria-hidden="true" />
            手刹
          </button>
          <button
            type="button"
            className={`pad-boost${me.tokens.length ? ' pad-boost-ready' : ''}`}
            aria-label="氮气"
            onPointerDown={boost}
          >
            <Zap size={18} aria-hidden="true" />
            氮气
          </button>
        </div>
      </nav>

      {overlay && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${finished || cleared ? ' panel-settle' : ''}`}>
            <h1>{finished || cleared || downed ? resultTitle(view.status) : '旋风卡丁'}</h1>
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
                <p className="panel-score">+{formatScore(view.earned)}</p>
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
                  {levelLabel(view)} · {ordinal(me.rank)} · 用时 {formatTime(view.time)}
                </p>
                <p className="panel-detail">
                  最快单圈 {formatLap(me.best)} · 漂移 {me.driftTime.toFixed(1)}s · 喷了 {me.boosts} 次
                </p>
                <button type="button" className="panel-action" onClick={next}>
                  <ChevronRight size={18} aria-hidden="true" />
                  {nextLabel(view)}
                </button>
              </>
            )}

            {downed && (
              <>
                <p className="panel-detail">
                  {ordinal(me.rank)}，{qualifyLabel(view)}。还剩 {view.lives} 次机会。
                </p>
                <p className="panel-detail">对手每次重开都会犯不一样的错，跟住前车吃尾流是最省力的一条路。</p>
                <button type="button" className="panel-action" onClick={again}>
                  <RotateCcw size={18} aria-hidden="true" />
                  再跑这一关
                </button>
              </>
            )}

            {finished && (
              <>
                {record && <p className="panel-badge">新纪录</p>}
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-detail">
                  打到第 {view.levelIndex + 1} / {LEVEL_COUNT} 关 · 累计 {view.totalStars} 星
                </p>
                <p className="panel-detail">
                  <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                </p>
              </>
            )}

            {!cleared && !downed && (
              <button type="button" className="panel-action" onClick={finished || ready ? restart : pause}>
                {finished ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                {finished ? '再来一局' : ready ? '发车' : '继续'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
