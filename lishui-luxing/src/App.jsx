import { useEffect, useMemo, useRef, useState } from 'react';
import { createScene, LIGHTS } from './scene/createScene.js';
import { SPOTS, spotById } from './atlas/spots.js';
import { ROUTES } from './atlas/routes.js';
import { REGIONS, CATEGORIES, SEASONS, categoryOf, regionOf, hexOf } from './atlas/taxonomy.js';
import { filterSpots, summarize, nearbySpots, headline, routeDetail, EMPTY_FILTER } from './atlas/query.js';

const VIEWS = [
  { id: 'overview', name: '全卷', hint: '丽水九县全图' },
  { id: 'north', name: '缙云', hint: '仙都与好溪一带' },
  { id: 'east', name: '瓯江', hint: '青田、千峡湖与瓯江下游' },
  { id: 'center', name: '松古', hint: '松阳遂昌的盆地与古村' },
  { id: 'south', name: '南脊', hint: '龙泉庆元景宁的高山' },
  { id: 'flat', name: '平铺', hint: '当作一张平面图看' },
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
  const [light, setLight] = useState('clear');
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

  // 选行程先把整条线框进画面；想看某一站再点站点，那时才俯冲下去
  const chooseRoute = (id) => {
    const next = routeId === id ? null : id;
    setRouteId(next);
    setSelectedId(null);
    if (next) {
      const detail = routeDetail(next);
      requestAnimationFrame(() => sceneRef.current?.frameSpots(detail.stops.map((s) => s.id)));
    } else {
      sceneRef.current?.setView(view);
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
        <h1>丽水山水图</h1>
        <p className="hud-sub">千里江山色 · 九县 {SPOTS.length} 处 · 可转可缩，点印章看详情</p>
        <p className="hud-line">{headline(filter, filtered)}</p>
        <p className="hud-meta">
          {perf.fps || '--'} FPS · {(perf.tris / 1000).toFixed(0)}k 面
          {hoverId && !selectedId ? ` · ${spotById(hoverId).name}` : ''}
        </p>
      </header>

      <nav className="views" aria-label="视角与卷面">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" title={v.hint} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            {v.name}
          </button>
        ))}
        <span className="sep" />
        {LIGHTS.map((l) => (
          <button key={l.id} type="button" className={light === l.id ? 'active' : ''} onClick={() => setLight(l.id)}>
            {l.name}
          </button>
        ))}
        <span className="sep" />
        <button type="button" className={showLabels ? 'active' : ''} onClick={() => setShowLabels(!showLabels)}>
          题签
        </button>
      </nav>

      <button
        type="button"
        className={`panel-toggle ${panelOpen ? 'open' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={panelOpen ? '收起卷轴' : '展开卷轴'}
      >
        {panelOpen ? '◂' : '▸'}
      </button>

      <aside className={`panel ${panelOpen ? '' : 'closed'}`} aria-label="筛选与行程">
        <section className="group">
          <div className="group-head">
            <span>九县</span>
            {active ? <button type="button" className="link" onClick={clearFilter}>还原全卷</button> : null}
          </div>
          <div className="chips">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                title={r.blurb}
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
          <div className="group-head"><span>分类</span></div>
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
          <div className="group-head"><span>时令与检索</span></div>
          <div className="row">
            <select value={filter.season} onChange={(e) => setFilter((f) => ({ ...f, season: e.target.value }))} aria-label="季节">
              {SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input
              value={filter.keyword}
              placeholder="搜看点：云海 / 廊桥 / 青瓷"
              aria-label="关键词"
              onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
            />
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>行程</span></div>
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
                  <span className="glyph">{categoryOf(s.category).glyph}</span>
                  <span className="name">{s.name}</span>
                  <span className="place">{regionOf(s.region).name}</span>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="empty">这一组条件下没有景点，试试放宽时令或还原全卷</li>}
          </ul>
        </section>
      </aside>

      {selected && (
        <article className="card" style={{ '--chip': hexOf(categoryOf(selected.category).color) }}>
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p className="card-where">
                {regionOf(selected.region).name} · {selected.place} · {categoryOf(selected.category).name}
              </p>
            </div>
            <button type="button" className="close" onClick={() => setSelectedId(null)} aria-label="关闭">✕</button>
          </header>
          <p className="badge">{selected.badge}</p>
          <dl className="facts">
            <div><dt>建议时长</dt><dd>{selected.stay}</dd></div>
            <div><dt>时令</dt><dd>{selected.season}</dd></div>
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
          <p className="disclaimer">
            丽水多为山路，直线距离常只有实际车程的一半；门票与预约规则易变，出发前请查景区官方渠道。
          </p>
        </article>
      )}
    </div>
  );
}
