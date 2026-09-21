import { useEffect, useMemo, useRef, useState } from 'react';
import { createScene, LIGHTS } from './scene/createScene.js';
import { SPOTS, spotById } from './atlas/spots.js';
import { ROUTES } from './atlas/routes.js';
import { DYNASTIES, THEMES, dynastyOf, themeOf, hexOf } from './atlas/taxonomy.js';
import { filterSpots, summarize, nearbySpots, headline, routeDetail, EMPTY_FILTER } from './atlas/query.js';

const VIEWS = [
  { id: 'overview', name: '全卷', hint: '西起玉门关，东到东海' },
  { id: 'saibei', name: '塞北', hint: '阴山、河套与幽燕，边塞诗的那条线' },
  { id: 'guanzhong', name: '关中', hint: '长安、渭水、华山与潼关' },
  { id: 'bashu', name: '巴蜀', hint: '蜀道、成都与三峡' },
  { id: 'jiangnan', name: '江南', hint: '金陵、扬州、姑苏与临安' },
  { id: 'lingnan', name: '岭南', hint: '贬谪最远的一段：潮州、柳州、儋州' },
  { id: 'flat', name: '平铺', hint: '当作一张平面图看' },
];

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/**
 * 抽屉档（手机竖屏、平板竖屏、或者被拖窄的窗口）。断点与 styles.css 那一档一致：
 * 过了这条线，卷轴与题跋都从下沿升起、**一次只开一块**（两块叠起来地图就没了），
 * 镜头也要重新取景 —— 左边不再压着面板，而横向视野在竖屏上装不下整幅横卷。
 * 加上 min-height 是因为**横躺的手机是另一回事**：那时 CSS 把两块改回左右分栏，
 * 面板仍压着西边，取景也不该跟着竖屏走。
 */
const NARROW = '(max-width: 980px) and (min-height: 561px)';
const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = (e) => setNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};


const READING = [
  '印章的颜色是朝代：石青唐、石绿宋、赭石元；印文是主题，「别」「思」「山」「戍」「志」「隐」「情」「挽」。',
  '一枚印章管一处地方（约十二公里见方），不是一首诗：长安、杭州这些地方压着好几首，印章会大一点，点开先出这一处的清单。',
  '全卷远看只出印章与古地名；点一枚印章、或者走近一个地区，诗名才在绢色题签上铺开 —— 几百首一起写出来就是一堵字墙。',
  '《静夜思》《锦瑟》这类写作地历来无定说的，不落在图上（硬派一个地方就是编造），但仍在左侧列表里，也搜得到。',
  '地形按《千里江山图》的矿物色标：谷地绢黄、丘陵石绿、两千四百米以上才转石青，再往上越高越淡，最后淡进绢底（画里的"高则明、远则淡"）。天空也是绢色 —— 画里的天就是绢本身。',
  '「行迹」把一位诗人一生走过的地方连成一条线，编号按年代而不是按路程，所以线会来回折。',
];



export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const panelRef = useRef(null);
  const narrow = useNarrow();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState(null);
  // 一枚印章底下可能压着几十首（长安、杭州），所以拾取先给出"这一处叫什么、有哪些"
  const [here, setHere] = useState({ place: '', ids: [] });
  const [hover, setHover] = useState({ place: '', ids: [] });
  const [routeId, setRouteId] = useState(null);
  const [view, setView] = useState('overview');
  const [light, setLight] = useState('clear');
  const [showLabels, setShowLabels] = useState(true);
  // 手机上一进来就展开卷轴，地图只剩中间一条，所以窄屏默认收起
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia(NARROW).matches);
  const [perf, setPerf] = useState({ fps: 0, tris: 0 });

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      spots: SPOTS,
      onPick: (picked) => {
        setHere(picked.ids.length > 1 ? picked : { place: '', ids: [] });
        setSelectedId(picked.ids.length === 1 ? picked.ids[0] : null);
        if (picked.ids.length > 1) sceneRef.current?.focusSpot(picked.ids[0]);
      },
      onHover: setHover,
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
  const hoverText = hover.ids.length === 1

    ? spotById(hover.ids[0]).name
    : hover.ids.length > 1
      ? `${hover.place} · ${hover.ids.length} 首`
      : '';



  // 选了行迹就把它的站点强行显示出来，否则筛选会把这条线自己的站点藏掉
  const visibleIds = useMemo(() => {
    const ids = new Set(filtered.map((s) => s.id));
    if (route) for (const stop of route.stops) ids.add(stop.id);
    return ids;
  }, [filtered, route]);

  // 这一处的清单要跟着筛选走：开着卡片再筛一次朝代，卡里不该还留着筛掉的那几首
  const hereSpots = useMemo(
    () => here.ids.map((id) => spotById(id)).filter((s) => s && visibleIds.has(s.id)),
    [here, visibleIds],
  );


  useEffect(() => { sceneRef.current?.setVisibleSpots(visibleIds); }, [visibleIds]);
  useEffect(() => { sceneRef.current?.setRoute(route); }, [route]);
  useEffect(() => { sceneRef.current?.setLabels(showLabels); }, [showLabels]);
  useEffect(() => { sceneRef.current?.applyLight(light); }, [light]);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  // 取景要知道卷轴实际压掉了多少画面宽：320px 面板在 1440 上占两成二，
  // 在 3440 上只占一成，"全卷"的注视点该往西挪多少得按这个比例算（窄屏是抽屉，占 0）。
  // 跨过断点时顺手把卷轴恢复成这一档的常态：宽屏摊开、窄屏收起。
  useEffect(() => {
    const report = () => sceneRef.current?.setLayout({
      narrow,
      panelShare: narrow ? 0 : (panelRef.current?.offsetWidth ?? 0) / window.innerWidth,
    });
    report();
    setPanelOpen(!narrow);
    window.addEventListener('resize', report);
    return () => window.removeEventListener('resize', report);
  }, [narrow]);
  // 手机上抽屉只能开一块：点开一首诗就把卷轴收起来，不然两块叠起来把地图盖光
  useEffect(() => {
    if (narrow && (selectedId || here.ids.length > 1)) setPanelOpen(false);
  }, [narrow, selectedId, here]);
  useEffect(() => {
    sceneRef.current?.setSelected(selectedId);
    if (selectedId) sceneRef.current?.focusSpot(selectedId);
  }, [selectedId]);

  const pick = (id) => {
    setHere({ place: '', ids: [] });
    setSelectedId((prev) => (prev === id ? null : id));
  };



  // 再点同一个视角按钮时 state 没变，effect 不会触发，镜头会一直停在某首诗上，所以直接下命令
  const chooseView = (id) => {
    setView(id);
    sceneRef.current?.setView(id);
  };

  // 选行迹先把整条线框进画面；想看某一站再点站点，那时才俯冲下去
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
  const active = filter.dynasties.length || filter.themes.length || filter.keyword.trim();

  return (
    <div className="app">
      <div className="viewport">
        <canvas ref={canvasRef} />
      </div>

      <header className="hud">
        <h1>诗词江山图</h1>
        <p className="hud-sub">千里江山色 · 唐宋元 {SPOTS.length} 首 · 可转可缩，点印章读诗</p>
        <p className="hud-line">{headline(filter, filtered)}</p>
        <p className="hud-meta">
          {perf.fps || '--'} FPS · {(perf.tris / 1000).toFixed(0)}k 面
          {hoverText && !selectedId ? ` · ${hoverText}` : ''}
        </p>

      </header>

      <nav className="views" aria-label="视角与卷面">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            title={v.hint}
            className={view === v.id ? 'active' : ''}
            onClick={() => chooseView(v.id)}
          >
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

      <aside ref={panelRef} className={`panel ${panelOpen ? '' : 'closed'}`} aria-label="筛选与行迹">
        <section className="group">
          <div className="group-head">
            <span>朝代</span>
            {active ? <button type="button" className="link" onClick={clearFilter}>还原全卷</button> : null}
          </div>
          <div className="chips">
            {DYNASTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                title={d.blurb}
                className={`chip ${filter.dynasties.includes(d.id) ? 'on' : ''}`}
                style={{ '--chip': hexOf(d.color) }}
                onClick={() => setFilter((f) => ({ ...f, dynasties: toggle(f.dynasties, d.id) }))}
              >
                {d.name}<em>{stats.byDynasty[d.id]}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>主题</span></div>
          <div className="chips">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${filter.themes.includes(t.id) ? 'on' : ''}`}
                style={{ '--chip': hexOf(t.color) }}
                onClick={() => setFilter((f) => ({ ...f, themes: toggle(f.themes, t.id) }))}
              >
                {t.name}<em>{stats.byTheme[t.id]}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>检索</span></div>
          <div className="row">
            <input
              value={filter.keyword}
              placeholder="搜作者、地名或句子：李白 / 黄河 / 明月"
              aria-label="关键词"
              onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
            />
          </div>
        </section>

        <section className="group">
          <div className="group-head"><span>行迹</span></div>
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
              <p className="route-meta">{route.stops.length} 站 · 直线合计约 {route.totalKm} km</p>
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
              <p className="route-pace">读法：{route.pace}</p>
            </div>
          )}
        </section>

        <section className="group">
          <div className="group-head"><span>怎么看这张图</span></div>
          <ul className="notes">{READING.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>

        <section className="group grow">
          <div className="group-head"><span>诗词 {filtered.length}</span></div>
          <ul className="spot-list">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  title={Number.isFinite(s.lng) ? s.place : `${s.place} —— 定不住地点，不落在图上`}
                  className={selectedId === s.id ? 'on' : ''}
                  style={{ '--chip': hexOf(themeOf(s.theme).color) }}
                  onClick={() => pick(s.id)}
                >
                  <span className="glyph">{themeOf(s.theme).glyph}</span>
                  <span className="name">{s.name}</span>
                  <span className="place">{s.author}</span>
                </button>
              </li>
            ))}

            {!filtered.length && <li className="empty">这组条件下没有作品，试试少选一个主题或清空检索</li>}
          </ul>
        </section>
      </aside>

      {hereSpots.length > 1 && !selected && (
        <article className="card">
          <header>
            <div>
              <h2>{here.place}</h2>
              <p className="card-where">这一处写过 {hereSpots.length} 首 —— 点一首读它</p>
            </div>
            <button type="button" className="close" onClick={() => setHere({ place: '', ids: [] })} aria-label="关闭">✕</button>
          </header>
          <ul className="spot-list">
            {hereSpots.map((s) => (

              <li key={s.id}>
                <button
                  type="button"
                  style={{ '--chip': hexOf(themeOf(s.theme).color) }}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="glyph">{themeOf(s.theme).glyph}</span>
                  <span className="name">{s.name}</span>
                  <span className="place">{s.author}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="disclaimer">
            一枚印章管一处地方（约十二公里见方）。同一处的诗按朝代先后列在这里。
          </p>
        </article>
      )}

      {selected && (
        <article className="card" style={{ '--chip': hexOf(themeOf(selected.theme).color) }}>
          <header>
            <div>
              {hereSpots.length > 1 && (
                <button type="button" className="link" onClick={() => setSelectedId(null)}>
                  ‹ 回到{here.place}这 {hereSpots.length} 首
                </button>
              )}
              <h2>{selected.name}</h2>
              <p className="card-where">
                {dynastyOf(selected.dynasty).name} · {selected.author} · {selected.place}
              </p>
            </div>
            <button type="button" className="close" onClick={() => { setSelectedId(null); setHere({ place: '', ids: [] }); }} aria-label="关闭">✕</button>

          </header>
          <p className="badge">{themeOf(selected.theme).name}</p>
          <blockquote className="poem">{selected.text}</blockquote>
          <dl className="facts">
            <div><dt>主要感情</dt><dd>{selected.emotion}</dd></div>
            <div><dt>主题</dt><dd>{themeOf(selected.theme).name}</dd></div>
            <div>
              <dt>写在哪</dt>
              <dd>
                {Number.isFinite(selected.lng)
                  ? `${selected.place}（${selected.lng.toFixed(2)}°E ${selected.lat.toFixed(2)}°N）`
                  : `${selected.place} —— 定不住地点，所以不落在图上`}
              </dd>
            </div>
          </dl>

          <h3>当时的处境</h3>
          <p className="context">{selected.context}</p>
          <h3>看这几处</h3>
          <ul className="highlights">{selected.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
          {nearby.length > 0 && (
            <>
              <h3>附近还写过</h3>
              <div className="nearby">
                {nearby.map(({ spot, km }) => (
                  <button key={spot.id} type="button" onClick={() => pick(spot.id)}>
                    {spot.author}《{spot.name}》<em>{km}km</em>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="disclaimer">
            创作地点多据诗题、诗序与年谱推定，历来说法不一；图上取的是通行的一说，经纬度只精确到那一带。
            地形是按高程控制点插值画出来的青绿山水，不作测绘用途。
          </p>
        </article>
      )}
    </div>
  );
}
