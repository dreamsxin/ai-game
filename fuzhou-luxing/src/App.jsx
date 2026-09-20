import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPOTS, spotById } from './data/spots.js';
import { CATEGORIES, COUNTIES, SEASONS, categoryOf, countyOf } from './data/taxonomy.js';
import { filterSpots, summarize, nearbySpots, headline, EMPTY_FILTER } from './data/query.js';
import { createView, project, zoomAt, panView, zoomOf, distanceKm } from './scene/projection.js';
import { paint } from './scene/painter.js';

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export default function App() {
  const canvasRef = useRef(null);
  const viewRef = useRef(null);
  const rafRef = useRef(0);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const filtered = useMemo(() => filterSpots(filter), [filter]);
  const stats = useMemo(() => summarize(filtered), [filtered]);
  const selected = selectedId ? spotById(selectedId) : null;
  const nearby = useMemo(() => (selected ? nearbySpots(selected, 3) : []), [selected]);

  const pick = useCallback((id) => setSelectedId((prev) => (prev === id ? null : id)), []);

  // ---------- Canvas rendering ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!viewRef.current || viewRef.current.width !== w || viewRef.current.height !== h) {
      viewRef.current = createView(w, h);
    }

    paint(ctx, viewRef.current, { spots: filtered, selectedId, hoverId });
  }, [filtered, selectedId, hoverId]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // Resize
  useEffect(() => {
    const obs = new ResizeObserver(() => { viewRef.current = null; });
    if (canvasRef.current?.parentElement) obs.observe(canvasRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  // ---------- Pointer interaction ----------
  const downRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    downRef.current = { x: e.clientX, y: e.clientY, cx: viewRef.current?.cx, cy: viewRef.current?.cy };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e) => {
    if (!downRef.current || !viewRef.current) return;
    const dx = e.clientX - downRef.current.x;
    const dy = e.clientY - downRef.current.y;
    viewRef.current = panView({ ...viewRef.current, cx: downRef.current.cx, cy: downRef.current.cy }, dx, dy);
  }, []);
  const onPointerUp = useCallback((e) => {
    if (!downRef.current) return;
    const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
    downRef.current = null;
    if (moved > 6 || !viewRef.current) return;
    // Hit test spots
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let hit = null;
    let best = 20;
    for (const s of filtered) {
      const p = project(viewRef.current, s.lng, s.lat);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < best) { best = d; hit = s.id; }
    }
    pick(hit);
  }, [filtered, pick]);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    if (!viewRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    viewRef.current = zoomAt(viewRef.current, e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const clearFilter = () => setFilter(EMPTY_FILTER);
  const active = filter.counties.length || filter.categories.length || filter.season !== 'all' || filter.keyword.trim();

  return (
    <div className="app">
      <div className="viewport">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        />
      </div>

      <header className="hud">
        <h1>抚州山水行旅图</h1>
        <p className="hud-sub">千里江山图风格 · 可移动缩放 · 点击景点了解详情</p>
        <p className="hud-line">{headline(filter, filtered)}</p>
      </header>

      <aside className="panel" aria-label="筛选">
        <section className="group">
          <div className="group-head">
            <span>按区县</span>
            {active ? <button type="button" className="link" onClick={clearFilter}>清空</button> : null}
          </div>
          <div className="chips">
            {COUNTIES.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.blurb}
                className={`chip ${filter.counties.includes(c.id) ? 'on' : ''}`}
                style={{ '--chip': '#a9663a' }}
                onClick={() => setFilter((f) => ({ ...f, counties: toggle(f.counties, c.id) }))}
              >
                {c.name}<em>{stats.byCounty[c.id] ?? 0}</em>
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
                style={{ '--chip': c.color }}
                onClick={() => setFilter((f) => ({ ...f, categories: toggle(f.categories, c.id) }))}
              >
                {c.name}<em>{stats.byCat[c.id] ?? 0}</em>
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
              placeholder="搜看点：傩 / 温泉 / 雕版"
              aria-label="关键词"
              onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
            />
          </div>
        </section>

        <section className="group grow">
          <div className="group-head"><span>景点 {filtered.length}</span></div>
          <ul className="spot-list">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={selectedId === s.id ? 'on' : ''}
                  style={{ '--chip': categoryOf(s.category)?.color ?? '#a9663a' }}
                  onClick={() => pick(s.id)}
                >
                  <span className="dot" />
                  <span className="name">{s.name}</span>
                  <span className="county">{countyOf(s.county)?.name ?? s.county}</span>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="empty">没有匹配的景点，试试放宽条件</li>}
          </ul>
        </section>
      </aside>

      {selected && (
        <article className="card" style={{ '--chip': categoryOf(selected.category)?.color ?? '#a9663a' }}>
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p className="card-where">{countyOf(selected.county)?.name} · {categoryOf(selected.category)?.name}</p>
            </div>
            <button type="button" className="close" onClick={() => setSelectedId(null)} aria-label="关闭">✕</button>
          </header>
          <p className="badge-tag">{selected.badge}</p>
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
          <p className="disclaimer">门票与预约规则常变，出发前请到景区官方渠道确认。</p>
        </article>
      )}
    </div>
  );
}
