import { useEffect, useMemo, useRef, useState } from 'react';
import { createScene } from './scene/createScene.js';
import { generateCity } from './city/generate.js';
import { CONTROL_GROUPS, DEFAULT_PARAMS, STRUCTURAL, VIEW_PRESETS, paramsForStyle } from './city/params.js';
import { STYLES } from './city/styles.js';
import { Group } from './ui/controls.jsx';

const SEED_WORDS = ['朝天门', '洪崖洞', '外滩', '雁塔', '西溪', '前海', '磁器口', '龙井', '陆家嘴', '含光门'];

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [city, setCity] = useState(null);
  const [perf, setPerf] = useState({ fps: 0, calls: 0, tris: 0 });
  const [view, setView] = useState('orbit');
  const [panelOpen, setPanelOpen] = useState(true);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const scene = createScene(canvasRef.current);
    sceneRef.current = scene;
    scene.onStats(setPerf);
    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(canvasRef.current.parentElement);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 结构参数指纹：只有它变了才重算城市，避免拖亮度滑块也去重建几何
  const structuralKey = useMemo(
    () => JSON.stringify(Object.fromEntries([...STRUCTURAL].map((k) => [k, params[k]]))),
    [params],
  );

  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => {
      const next = generateCity(params);
      setCity(next);
      sceneRef.current?.setCity(next, params);
      setBusy(false);
    }, 70);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  useEffect(() => {
    sceneRef.current?.applyAppearance(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.lightPreset, params.brightness, params.haze, params.neon]);

  const update = (key, value) => setParams((prev) => ({ ...prev, [key]: value }));

  const pickStyle = (id) => setParams((prev) => paramsForStyle(id, prev.seed));

  const reroll = () => {
    const word = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
    update('seed', `${word}-${Math.floor(Math.random() * 9000 + 1000)}`);
  };

  const chooseView = (id) => {
    setView(id);
    sceneRef.current?.setView(id);
  };

  const style = city?.style ?? STYLES[0];
  const stats = city?.stats;

  return (
    <div className="app">
      <div className="viewport">
        <canvas ref={canvasRef} />
      </div>

      <header className="hud">
        <div className="hud-title">
          <span className="hud-city">{style.name}</span>
          <span className="hud-sub">{style.subtitle}</span>
        </div>
        <p className="hud-tag">{style.tagline}</p>
        {stats && (
          <dl className="hud-stats">
            <div><dt>建筑</dt><dd>{stats.buildings}</dd></div>
            <div><dt>最高</dt><dd>{stats.tallest}m</dd></div>
            <div><dt>地形高差</dt><dd>{stats.relief}m</dd></div>
            <div><dt>路网</dt><dd>{stats.roadKm}km</dd></div>
            <div><dt>立交层数</dt><dd>{stats.interchangeLevels || '—'}</dd></div>
            <div><dt>桥梁</dt><dd>{stats.bridges}</dd></div>
          </dl>
        )}
        <p className="hud-meta">
          {busy ? '生成中…' : `生成 ${stats?.genMs ?? 0}ms`} · {perf.fps || '--'} FPS · {perf.calls} draw calls
        </p>
      </header>

      <nav className="views" aria-label="视角预设">
        {VIEW_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.hint}
            className={view === preset.id ? 'active' : ''}
            onClick={() => chooseView(preset.id)}
          >
            {preset.name}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className={`panel-toggle ${panelOpen ? 'open' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={panelOpen ? '收起编辑器' : '展开编辑器'}
      >
        {panelOpen ? '▸' : '◂'}
      </button>

      <aside className={`panel ${panelOpen ? '' : 'closed'}`} aria-label="城市生成编辑器">
        <div className="panel-head">
          <h1>中国城市生成器</h1>
          <p>China City Lab · 程序化生成</p>
        </div>

        <section className="group open styles">
          <div className="group-head static"><span className="group-name">城市风格</span></div>
          <div className="style-list">
            {STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`style-card ${params.style === item.id ? 'active' : ''}`}
                onClick={() => pickStyle(item.id)}
              >
                <span className="swatches" aria-hidden="true">
                  {[item.palette.skyBottom, item.palette.buildings[0], item.palette.accent, item.palette.water].map((c, i) => (
                    <i key={i} style={{ background: `#${c.toString(16).padStart(6, '0')}` }} />
                  ))}
                </span>
                <span className="style-text">
                  <strong>{item.name}</strong>
                  <em>{item.tagline}</em>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="group open seed">
          <div className="group-head static"><span className="group-name">种子</span></div>
          <div className="group-body seed-row">
            <input
              value={params.seed}
              aria-label="随机种子"
              onChange={(e) => update('seed', e.target.value)}
            />
            <button type="button" onClick={reroll}>换一座</button>
          </div>
        </section>

        {CONTROL_GROUPS.map((group) => (
          <Group
            key={group.id}
            group={group}
            params={params}
            onChange={update}
            defaultOpen={group.id === 'layout' || group.id === 'signature'}
          />
        ))}
      </aside>
    </div>
  );
}
