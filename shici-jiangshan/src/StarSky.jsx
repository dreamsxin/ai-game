import { useEffect, useRef, useState } from 'react';
import { authorStars } from './atlas/starmap.js';
import { drawStarChart, hitTest } from './scene/starChart.js';
import { dynastyOf, themeOf } from './atlas/taxonomy.js';

const STARS = authorStars();
const TIERS = [1, 2, 3, 4, 5, 6].map((mag) => {
  const list = STARS.filter((s) => s.mag === mag);
  return { mag, tier: list[0]?.tier ?? `${mag} 等星`, note: list[0]?.tierNote ?? '', count: list.length };
});

/**
 * 作者星图。判定层把星等与星位算好（`atlas/starmap.js`，纯函数、有测试），
 * 这里只负责一块画布加几个事件：悬停出名字、点一颗星出这位作者的清单，
 * 清单里点一首诗就回地图上去读它（`onPick`）。
 */
export default function StarSky({ onPick, onClose }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const paint = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      drawStarChart(ctx, { stars: STARS, width: w, height: h, hover, selected: picked?.name, dpr });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [hover, picked]);

  const locate = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return hitTest(STARS, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  };

  return (
    <div className="sky">
      <canvas
        ref={canvasRef}
        className="sky-canvas"
        onPointerMove={(e) => setHover(locate(e)?.name ?? null)}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => setPicked(locate(e) ?? null)}
      />

      <div className="sky-head">
        <h2>作者星图</h2>
        <p>{STARS.length} 位作者，按收录篇数分星等 —— 一等最亮，六等是肉眼极限。石青唐、石绿宋、赭石元，同朝的连成一条旋臂。</p>
        <ul className="sky-tiers">
          {TIERS.filter((t) => t.count > 0).map((t) => (
            <li key={t.mag}><span className={`dot m${t.mag}`} />{t.tier} {t.count} 位<em>{t.note}</em></li>
          ))}
        </ul>
        <button type="button" className="close" onClick={onClose} aria-label="回到地图">✕</button>
      </div>

      <ol className="sky-rank">
        {STARS.slice(0, 12).map((s) => (
          <li key={s.name}>
            <button
              type="button"
              className={picked?.name === s.name ? 'on' : ''}
              style={{ '--chip': `#${dynastyOf(s.dynasty).color.toString(16).padStart(6, '0')}` }}
              onMouseEnter={() => setHover(s.name)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setPicked(s)}
            >
              <span className="idx">{s.rank}</span>
              <span className="name">{s.name}</span>
              <span className="num">{s.count}</span>
            </button>
          </li>
        ))}
      </ol>

      {picked && (
        <article className="card sky-card">
          <header>
            <div>
              <h2>{picked.name}</h2>
              <p className="card-sub">
                {dynastyOf(picked.dynasty).name} · 第 {picked.rank} 名 · {picked.tier}（{picked.count} 首）
              </p>
            </div>
            <button type="button" className="close" onClick={() => setPicked(null)} aria-label="关闭">✕</button>
          </header>
          <dl className="facts">
            {picked.homeCount > 1
              ? <div><dt>写得最多</dt><dd>{picked.home}（{picked.homeCount} 首）</dd></div>
              : <div><dt>落点</dt><dd>各不相同</dd></div>}
            <div><dt>落在几处</dt><dd>{picked.placeCount} 处</dd></div>
            <div><dt>常写的题</dt><dd>{themeOf(picked.theme).name}</dd></div>
          </dl>
          <h3>收了这几首</h3>
          <ul className="spot-list">
            {picked.poems.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)}>
                  <span className="name">{p.name}</span>
                  <span className="place">{p.place.split('·')[0]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="sky-foot">点一首，回到图上去读它。</p>
        </article>
      )}
    </div>
  );
}
