import { useEffect, useMemo, useRef, useState } from 'react';
import { createScene, LIGHTS } from './scene/createScene.js';
import { SPOTS, spotById } from './atlas/spots.js';
import { ROUTES } from './atlas/routes.js';
import { REGIONS, CATEGORIES, SEASONS, categoryOf, regionOf, hexOf } from './atlas/taxonomy.js';
import { filterSpots, summarize, nearbySpots, headline, routeDetail, EMPTY_FILTER } from './atlas/query.js';

const VIEWS = [
  { id: 'overview', name: '全省', hint: '默认视角，看整张地图' },
  { id: 'lake', name: '环鄱阳湖', hint: '南昌、九江与中国最大的淡水湖' },
  { id: 'northeast', name: '赣东北', hint: '三清山、龙虎山、婺源与瓷都' },
  { id: 'west', name: '赣西', hint: '武功山主脉与明月山' },
  { id: 'central', name: '赣中', hint: '吉泰盆地、井冈山与抚河流域' },
  { id: 'south', name: '赣南', hint: '宋城赣州、客家围屋与东江源' },
  { id: 'flat', name: '正俯视', hint: '当成一张平面图看' },
];

// 读图提示：这张地形图有几处是按江西的地理特点专门做的，说一句省得被误读
const MAP_NOTES = [
  '江西三面环山、向北开口：东北武夷山与怀玉山，西北九岭幕阜，西边罗霄山脉，南边南岭大庾岭',
  '赣、抚、信、饶、修五条河全汇入鄱阳湖，再从湖口一个缺口流进长江 —— 水面高度按真实水位画，赣江在赣州约 100 米、入湖只剩 15 米',
  '省界之外的邻省被整块压低并调成灰蓝，绿色的那块就是江西',
];

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [view, setView] = useState('overview');
  const [light, setLight] = useState('noon');
  const [showLabels, setShowLabels] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [perf, setPerf] = useState({ fps: 0, tris: 0 });

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      spots: SPOTS,
      onPick: (id) => setSelectedId(id),
      onHover: (id) => setHoverId(id),
    });
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

  const filtered = useMemo(() => filterSpots(filter), [filter]);
  const route = useMemo(() => (routeId ? routeDetail(routeId) : null), [routeId]);
  const stats = useMemo(() => summarize(filtered), [filtered]);
  const selected = selectedId ? spotById(selectedId) : null;
  const nearby = useMemo(() => (selected ? nearbySpots(selected, 3) : []), [selected]);

  // 行程的站点总是可见的，否则选了线路却看不到它经过哪儿
  const visibleIds = useMemo(() => {
    const ids = new Set(filtered.map((s) => s.id));
    if (route) for (const stop of route.stops) ids.add(stop.id);
    return ids;
  }, [filtered, route]);

  useEffect(() => { sceneRef.current?.setVisibleSpots(visibleIds); }, [visibleIds]);
  useEffect(() => { sceneRef.current?.setRoute(route); }, [route]);
  useEffect(() => { sceneRef.current?.setLabels(showLabels); }, [showLabels]);
  useEffect(() => { sceneRef.current?.applyLight(light); }, [light]);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  useEffect(() => {
    sceneRef.current?.setSelected(selectedId);
    if (selectedId) sceneRef.current?.focusSpot(selectedId);
  }, [selectedId]);

  const pick = (id) => setSelectedId((prev) => (prev === id ? null : id));

  // 点视角按钮总要把镜头拉回去：只靠 state 变化的话，
  // 「已经停在全省视角」时又点一次「全省」不会触发 effect，而这时相机往往正贴在某个景点上。
  const chooseView = (id) => {
    setView(id);
    sceneRef.current?.setView(id);
  };


  const chooseRoute = (id) => {
    const next = routeId === id ? null : id;
    setRouteId(next);
    if (next) {
      const detail = routeDetail(next);
      setSelectedId(detail.stops[0].id);
    }
  };

  const clearFilter = () => setFilter(EMPTY_FILTER);
  const active = filter.regions.length || filter.categories.length || filter.season !== 'all' || filter.keyword.trim();

  return (
    <div className="app">
      <div className="viewport">
        <canvas ref={canvasRef} />
      </div>

      <header className="hud">
        <h1>江西旅行地图</h1>
        <p className="hud-sub">3D 可转可缩 · 点标记看主要看点与游玩 tips</p>
        <p className="hud-line">{headline(filter, filtered)}</p>
        <p className="hud-meta">
          {perf.fps || '--'} FPS · {(perf.tris / 1000).toFixed(0)}k 三角面
          {hoverId && !selectedId ? ` · 悬停：${spotById(hoverId).name}` : ''}
        </p>
      </header>

      <nav className="views" aria-label="视角">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" title={v.hint} className={view === v.id ? 'active' : ''} onClick={() => chooseView(v.id)}>
            {v.name}
          </button>
        ))}
        <span className="views-sep" />
        {LIGHTS.map((l) => (
          <button key={l.id} type="button" className={light === l.id ? 'active' : ''} onClick={() => setLight(l.id)}>
            {l.name}
          </button>
        ))}
        <span className="views-sep" />
        <button type="button" className={showLabels ? 'active' : ''} onClick={() => setShowLabels(!showLabels)}>
          地名
        </button>
      </nav>

      <button
        type="button"
        className={`panel-toggle ${panelOpen ? 'open' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={panelOpen ? '收起面板' : '展开面板'}
      >
        {panelOpen ? '◂' : '▸'}
      </button>

      <aside className={`panel ${panelOpen ? '' : 'closed'}`} aria-label="筛选与行程">
        <section className="group">
          <div className="group-head">
            <span>按分区</span>
            {active ? <button type="button" className="link" onClick={clearFilter}>清空筛选</button> : null}
          </div>
          <div className="chips">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                title={`${r.cities} · ${r.blurb}`}
                className={`chip ${filter.regions.includes(r.id) ? 'on' : ''}`}
                style={{ '--chip': hexOf(r.color) }}
                onClick={() => setFilter((f) => ({ ...f, regions: toggle(f.regions, r.id) }))}
              >
                {r.name}<em>{stats.byRegion[r.id]}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>按类型</span></div>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${filter.categories.includes(c.id) ? 'on' : ''}`}
                style={{ '--chip': hexOf(c.color) }}
                onClick={() => setFilter((f) => ({ ...f, categories: toggle(f.categories, c.id) }))}
              >
                {c.name}<em>{stats.byCategory[c.id]}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>季节与搜索</span></div>
          <div className="row">
            <select value={filter.season} onChange={(e) => setFilter((f) => ({ ...f, season: e.target.value }))} aria-label="季节">
              {SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input
              value={filter.keyword}
              placeholder="搜看点：云海 / 晒秋 / 候鸟 / 窑"
              aria-label="关键词"
              onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
            />
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>推荐行程</span></div>
          <div className="routes">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`route ${routeId === r.id ? 'on' : ''}`}
                style={{ '--chip': hexOf(r.color) }}
                onClick={() => chooseRoute(r.id)}
              >
                <strong>{r.name}</strong>
                <em>{r.theme}</em>
              </button>
            ))}
          </div>
          {route && (
            <div className="route-detail">
              <p className="route-meta">{route.stops.length} 站 · 直线合计约 {route.totalKm} km · {route.months}</p>
              <ol className="route-stops">
                {route.stops.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" className={selectedId === s.id ? 'on' : ''} onClick={() => pick(s.id)}>
                      <span className="idx">{i + 1}</span>{s.name}
                      {route.legs[i] ? <em>↓ {route.legs[i].km}km</em> : null}
                    </button>
                  </li>
                ))}
              </ol>
              <ul className="notes">{route.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              <p className="route-pace">节奏：{route.pace}</p>
            </div>
          )}
        </section>

        <section className="group">
          <div className="group-head"><span>读图提示</span></div>
          <ul className="notes">{MAP_NOTES.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>

        <section className="group grow">
          <div className="group-head"><span>景点 {filtered.length}</span></div>
          <ul className="spot-list">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={selectedId === s.id ? 'on' : ''}
                  style={{ '--chip': hexOf(categoryOf(s.category).color) }}
                  onClick={() => pick(s.id)}
                >
                  <span className="dot" />
                  <span className="name">{s.name}</span>
                  <span className="city">{s.city}</span>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="empty">这一组条件下没有景点，试试放宽季节或清空筛选</li>}
          </ul>
        </section>
      </aside>

      {selected && (
        <article className="card" style={{ '--chip': hexOf(categoryOf(selected.category).color) }}>
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p className="card-where">
                {selected.city} · {regionOf(selected.region).name} · {categoryOf(selected.category).name}
              </p>
            </div>
            <button type="button" className="close" onClick={() => setSelectedId(null)} aria-label="关闭">✕</button>
          </header>
          <p className="badge">{selected.badge}</p>
          <dl className="facts">
            <div><dt>建议时长</dt><dd>{selected.stay}</dd></div>
            <div><dt>最佳季节</dt><dd>{selected.season}</dd></div>
            <div><dt>门票</dt><dd>{selected.ticket}</dd></div>
            <div><dt>怎么到</dt><dd>{selected.reach}</dd></div>
          </dl>
          <h3>主要看点</h3>
          <ul className="highlights">{selected.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
          <h3>游玩 tips</h3>
          <ul className="tips">{selected.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          {nearby.length > 0 && (
            <>
              <h3>顺路还有</h3>
              <div className="nearby">
                {nearby.map(({ spot, km }) => (
                  <button key={spot.id} type="button" onClick={() => pick(spot.id)}>
                    {spot.name}<em>{km}km</em>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="disclaimer">门票与预约规则常变，出发前请到景区官方渠道确认当日政策。</p>
        </article>
      )}
    </div>
  );
}
