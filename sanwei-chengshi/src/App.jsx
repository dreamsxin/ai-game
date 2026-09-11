import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Dices, HelpCircle, Layers, Map as MapIcon, Search, X,
} from 'lucide-react';
import { SCALES, DEFAULT_SCALE } from './game/rules.js';
import { findBuildings, generateCity } from './game/city.js';
import { hashSeed } from './game/random.js';
import { createScene } from './scene/createScene.js';
import {
  HELP_STEPS, buildingCard, seedLabel, statLines, tallestLabel, zoneLabel,
} from './scene/readout.js';

const randomSeed = () => Math.floor(Math.random() * 1_000_000) + 1;
// 输入框里既能敲数字也能敲城市名，非数字就折成 hash 当 seed。
const parseSeed = (text) => {
  const trimmed = String(text).trim();
  if (!trimmed) return randomSeed();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) % 1_000_000_000;
  return hashSeed(trimmed) % 1_000_000;
};

export default function App() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [seed, setSeed] = useState(() => randomSeed());
  const [seedText, setSeedText] = useState('');
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState({ buildings: true, ground: true });
  const [help, setHelp] = useState(false);

  // 生成一整座城是同步的重活，seed / 尺度不变就不要重算。
  const city = useMemo(() => generateCity(seed, scaleId), [seed, scaleId]);
  const results = useMemo(() => findBuildings(city, query), [city, query]);
  const card = buildingCard(selected);

  useEffect(() => {
    const host = hostRef.current;
    const scene = createScene(host);
    sceneRef.current = scene;

    // OrbitControls 也吃拖拽，所以按下和抬起位移小于阈值才算点选。
    let start = null;
    const onDown = (event) => {
      start = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event) => {
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      start = null;
      if (moved > 6) return;
      const hit = scene.pick(event.clientX, event.clientY);
      scene.select(hit);
      setSelected(hit);
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointerup', onUp);

    let frame = 0;
    const schedule = () => {
      frame = requestAnimationFrame((now) => {
        scene.render(now / 1000);
        schedule();
      });
    };
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.load(city);
    setSelected(null);
  }, [city]);

  useEffect(() => {
    sceneRef.current?.setLayers(layers);
  }, [layers]);

  const regenerate = useCallback(() => {
    setSeed(parseSeed(seedText));
  }, [seedText]);

  const shuffle = useCallback(() => {
    const next = randomSeed();
    setSeedText(String(next));
    setSeed(next);
  }, []);

  const locate = useCallback((building) => {
    sceneRef.current?.focus(building);
    setSelected(building);
  }, []);

  const clearSelection = useCallback(() => {
    sceneRef.current?.select(null);
    setSelected(null);
  }, []);


  const toggle = (key) => () => setLayers((current) => ({ ...current, [key]: !current[key] }));
  return (
    <div className="app">
      <div ref={hostRef} className="scene" aria-label="三维仿真城市场景" />

      <header className="topbar">
        <div className="brand">
          <MapIcon size={18} aria-hidden="true" />
          <span>三维城市</span>
          <em>{city.scaleName} · {seedLabel(city.seed)}</em>
        </div>
        <div className="seedbox">
          <input
            className="seed-input"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && regenerate()}
            placeholder="seed 或城市名"
            aria-label="输入 seed 或城市名"
          />
          <button type="button" className="btn" onClick={regenerate}>生成</button>
          <button type="button" className="btn btn-ghost" onClick={shuffle} aria-label="随机换一座城">
            <Dices size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="scales" role="group" aria-label="城市尺度">
          {SCALES.map((scale) => (
            <button
              key={scale.id}
              type="button"
              className={`chip${scale.id === scaleId ? ' chip-on' : ''}`}
              onClick={() => setScaleId(scale.id)}
              aria-pressed={scale.id === scaleId}
            >
              {scale.name}
            </button>
          ))}
        </div>
        <button type="button" className="chip" onClick={() => setHelp(true)}>
          <HelpCircle size={14} aria-hidden="true" /> 说明
        </button>
      </header>
      <aside className="side">
        <div className="search">
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜楼名 / 门牌 / 用地性质"
            aria-label="搜索城市要素"
          />
          {query && (
            <button type="button" className="icon" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {query && (
          <ul className="results">
            {results.length === 0 && <li className="results-empty">没找到「{query}」</li>}
            {results.map((building) => (
              <li key={building.id}>
                <button type="button" className="result" onClick={() => locate(building)}>
                  <b>{building.name}</b>
                  <span>{building.address} · {zoneLabel(building.zone)} · {building.floors} 层</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="stats">
          {statLines(city.stats).map((line) => (
            <div key={line.label} className="stat">
              <span className="stat-label">{line.label}</span>
              <span className="stat-value">{line.value}</span>
            </div>
          ))}
        </div>

        <div className="zones">
          {city.stats.zones.map((entry) => (
            <div key={entry.zone} className="zone-row">
              <span className={`swatch swatch-${entry.zone}`} aria-hidden="true" />
              <span className="zone-name">{entry.name}</span>
              <span className="zone-value">{entry.blocks} 街区</span>
            </div>
          ))}
        </div>

        <p className="tallest">
          <Building2 size={14} aria-hidden="true" /> 最高：{tallestLabel(city.stats)}
        </p>

        <div className="toggles" role="group" aria-label="图层">
          <button
            type="button"
            className={`chip${layers.buildings ? ' chip-on' : ''}`}
            onClick={toggle('buildings')}
            aria-pressed={layers.buildings}
          >
            <Layers size={14} aria-hidden="true" /> 楼宇
          </button>
          <button
            type="button"
            className={`chip${layers.ground ? ' chip-on' : ''}`}
            onClick={toggle('ground')}
            aria-pressed={layers.ground}
          >
            <MapIcon size={14} aria-hidden="true" /> 底图
          </button>
        </div>
      </aside>
      {card && (
        <section className="card" aria-label="楼宇信息">
          <header>
            <h2>{card.title}</h2>
            {card.landmark && <span className="badge">地标</span>}
            <button type="button" className="icon" onClick={clearSelection} aria-label="关闭信息卡">
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <p className="card-address">{card.address}</p>
          <dl>
            {card.lines.map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {help && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>三维仿真城市</h1>
            <p className="panel-status">一个 seed 就是一座城</p>
            <ol className="panel-steps">
              {HELP_STEPS.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  {step.detail}
                </li>
              ))}
            </ol>
            <button type="button" className="panel-action" onClick={() => setHelp(false)}>
              开始逛
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



