// 千年江山图——外壳。判定层（src/atlas）算出版面，表现层（src/scene）照着画，
// 这里只做三件事：把筛选结果交给长卷、把选中的条目摊成右侧那块面板、接键鼠。

import { useEffect, useMemo, useRef, useState } from 'react';
import { yearLabel } from './atlas/dynasties.js';
import { buildLayout, segmentById } from './atlas/layout.js';
import { KIND_COLOR, KIND_NAME } from './atlas/palette.js';
import {
  ITEMS, KINDS, countsByDynasty, filterItems, itemById, kindName, neighborOf, subtitleOf, tagsOf,
} from './atlas/query.js';
import { createScroll } from './scene/scroll.js';

const KIND_SHAPE = { event: 'diamond', figure: 'round', book: 'square' };

function KindDot({ kind }) {
  return <span className={`dot ${KIND_SHAPE[kind]}`} style={{ background: KIND_COLOR[kind] }} />;
}

export default function App() {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const stateRef = useRef({ selectedId: null, hoverId: null });
  const visibleRef = useRef(ITEMS);

  const layout = useMemo(() => buildLayout(), []);
  const allTags = useMemo(() => tagsOf(null), []);

  const [kinds, setKinds] = useState(KINDS);
  const [tag, setTag] = useState('');
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [segmentId, setSegmentId] = useState(layout.segments[0].id);

  const visible = useMemo(() => filterItems({ kinds, tags: tag ? [tag] : [], text }), [kinds, tag, text]);
  const counts = useMemo(() => countsByDynasty(visible), [visible]);
  const selected = selectedId ? itemById(selectedId) : null;
  const segment = segmentById(layout, selected ? selected.dynasty : segmentId) ?? layout.segments[0];
  const segCount = counts.get(segment.id) ?? { total: 0, event: 0, figure: 0, book: 0 };

  visibleRef.current = visible;
  stateRef.current = { selectedId, hoverId };

  // 长卷本体：只在挂载时建一次，之后靠 ref 读最新的状态
  useEffect(() => {
    const canvas = canvasRef.current;
    const scroll = createScroll(canvas, layout);
    scrollRef.current = scroll;
    scroll.resize();
    scroll.setVisible(visibleRef.current);

    let raf = 0;
    let lastSeg = '';
    const loop = () => {
      scroll.step();
      scroll.draw(stateRef.current);
      const seg = scroll.centerSegment();
      if (seg.id !== lastSeg) {
        lastSeg = seg.id;
        setSegmentId(seg.id);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => scroll.resize();
    window.addEventListener('resize', onResize);

    let dragging = false;
    let moved = 0;
    let lastX = 0;
    const onDown = (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        moved += Math.abs(dx);
        scroll.panBy(dx);
        return;
      }
      const hit = scroll.hitTest(e.clientX, e.clientY);
      setHoverId(hit);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    };
    const onUp = (e) => {
      const wasDragging = dragging;
      dragging = false;
      if (!wasDragging || moved > 5) return;
      setSelectedId(scroll.hitTest(e.clientX, e.clientY));
    };
    const onWheel = (e) => {
      e.preventDefault();
      scroll.scrollBy((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.8);
    };
    const onKey = (e) => {
      const list = visibleRef.current;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = neighborOf(list, stateRef.current.selectedId, e.key === 'ArrowRight' ? 1 : -1);
        if (next) setSelectedId(next.id);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', () => setHoverId(null));
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      scrollRef.current = null;
    };
  }, [layout]);

  // 筛选变了：卷上的标记跟着变；选中的条目被筛掉就撤销选中
  useEffect(() => {
    scrollRef.current?.setVisible(visible);
    if (selectedId && !visible.some((it) => it.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  // 选中一条就把卷面移过去
  useEffect(() => {
    if (!selectedId) return;
    const mark = layout.marks.find((m) => m.id === selectedId);
    if (mark) scrollRef.current?.panTo(mark.x);
  }, [selectedId, layout]);

  const toggleKind = (kind) => {
    setKinds((prev) => {
      const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind];
      return next.length === 0 ? KINDS : next;
    });
  };

  const gotoSegment = (id) => {
    const seg = segmentById(layout, id);
    if (!seg) return;
    setSelectedId(null);
    setSegmentId(id);
    scrollRef.current?.panTo((seg.x0 + seg.x1) / 2);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="title">
          <h1>千年江山图</h1>
          <p>
            五千年摊成一卷：横轴是时间，山高是国力——盛世是石青高峰，乱世压成江面与云雾。
            卷上 {ITEMS.length} 条事件、人物与典籍各归其朝。
          </p>
        </div>
        <div className="filters">
          <div className="chips">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`chip ${kinds.includes(kind) ? 'on' : ''}`}
                onClick={() => toggleKind(kind)}
              >
                <KindDot kind={kind} />
                {KIND_NAME[kind]}
              </button>
            ))}
          </div>
          <select className="pick" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">全部标签</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            className="search"
            type="search"
            placeholder="搜人名、事件、书名、关键词"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="tally">卷上 {visible.length} / {ITEMS.length} 条</span>
        </div>
      </header>

      <nav className="strip">
        {layout.segments.map((seg) => (
          <button
            key={seg.id}
            type="button"
            className={`era ${seg.id === segment.id ? 'on' : ''} ${seg.kind}`}
            style={{ borderBottomColor: seg.tint }}
            onClick={() => gotoSegment(seg.id)}
            title={`${seg.name}　${seg.span}`}
          >
            {seg.name}
          </button>
        ))}
      </nav>

      <main className="stage">
        <canvas ref={canvasRef} className="scroll" />
        <aside className="panel">
          {selected ? (
            <article className="detail">
              <div className="badge">
                <KindDot kind={selected.kind} />
                {kindName(selected.kind)}
                <span className="era-tag" style={{ color: segment.tint }}>{segment.name}</span>
              </div>
              <h2>{selected.kind === 'book' ? `《${selected.name}》` : selected.name}</h2>
              <p className="meta">{subtitleOf(selected)}</p>
              <p className="meta">{selected.when}　·　{yearLabel(selected.year)}</p>
              <p className="summary">{selected.summary}</p>
              <p className="body">{selected.detail}</p>
              <ul className="points">
                {selected.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <div className="tags">
                {selected.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
              <button type="button" className="ghost" onClick={() => setSelectedId(null)}>返回本朝概览</button>
            </article>
          ) : (
            <article className="detail">
              <div className="badge">
                <span className="era-tag" style={{ color: segment.tint }}>
                  {segment.kind === 'unified' ? '大一统' : segment.kind === 'divided' ? '分裂割据' : '传说期'}
                </span>
              </div>
              <h2>{segment.name}</h2>
              <p className="meta">{segment.span}</p>
              <p className="meta">都：{segment.capital}</p>
              <p className="summary">{segment.summary}</p>
              <p className="body">{segment.detail}</p>
              <p className="meta">
                卷上此段 {segCount.total} 条：事件 {segCount.event} · 人物 {segCount.figure} · 典籍 {segCount.book}
              </p>
              <p className="meta">峰高 {Math.round(segment.power * 100)} / 100</p>
            </article>
          )}

          <div className="list">
            {visible.map((it) => (
              <button
                key={it.id}
                type="button"
                className={`row ${it.id === selectedId ? 'on' : ''}`}
                onMouseEnter={() => setHoverId(it.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setSelectedId(it.id)}
              >
                <KindDot kind={it.kind} />
                <span className="row-year">{yearLabel(it.year)}</span>
                <span className="row-name">{it.kind === 'book' ? `《${it.name}》` : it.name}</span>
              </button>
            ))}
          </div>
        </aside>
      </main>

      <footer className="hint">
        拖动或滚轮平移长卷　·　点标记看详情　·　←→ 在筛选结果里前后走　·　Esc 收起
      </footer>
    </div>
  );
}
