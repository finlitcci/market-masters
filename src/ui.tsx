import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const cadWhole = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
export const money = (cents: number) => cad.format(cents / 100);
export const moneyWhole = (cents: number) => cadWhole.format(cents / 100);
export const signed = (cents: number) => (cents > 0 ? '+' : cents < 0 ? '\u2212' : '') + cad.format(Math.abs(cents) / 100);
export const pct = (p: number) => (p > 0 ? '+' : p < 0 ? '\u2212' : '') + Math.abs(p).toFixed(2) + '%';
export const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const compact = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));
export const weekLabel = (w: number) => (w === 0 ? 'Start' : w > 0 ? `W${w}` : `${w}w`);

export function Brand({ small }: { small?: boolean }) {
  return (
    <span className={'brand' + (small ? ' brand-sm' : '')}>
      <svg viewBox="0 0 32 32" aria-hidden="true" width={small ? 20 : 28} height={small ? 20 : 28}>
        <rect width="32" height="32" rx="6" fill="currentColor" opacity=".16" />
        <path d="M6 22l7-8 5 5 8-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Market Masters
    </span>
  );
}

/** Price change with an arrow, so meaning never depends on colour alone. */
export function Change({ value, children }: { value: number; children: ReactNode }) {
  const t = tone(value);
  return (
    <span className={`chg chg-${t}`}>
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
        {t === 'up' && <path d="M5 1l4 7H1z" fill="currentColor" />}
        {t === 'down' && <path d="M5 9L1 2h8z" fill="currentColor" />}
        {t === 'flat' && <rect x="1" y="4" width="8" height="2" fill="currentColor" />}
      </svg>
      <span className="sr-only">{t === 'up' ? 'Up ' : t === 'down' ? 'Down ' : 'Unchanged '}</span>
      {children}
    </span>
  );
}

export function Spark({ values, width = 76, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(1 + (i / (values.length - 1)) * (width - 2)).toFixed(1)} ${(2 + (1 - (v - min) / span) * (height - 4)).toFixed(1)}`).join('');
  const up = values[values.length - 1] >= values[0];
  return <svg width={width} height={height} className={up ? 'spark spark-up' : 'spark spark-down'} role="img" aria-label={`Trend, ${up ? 'higher' : 'lower'} than 12 weeks ago`}><path d={d} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export interface ChartPoint { x: number; y: number; volume?: number }

/**
 * Line chart with labelled axes, optional volume panel, a "game start" marker, and a tooltip that follows the pointer
 * (or the arrow keys). Every number drawn comes from the points passed in.
 */
export function PriceChart({ points, label, formatY = money, volume = false, baseline, baselineLabel, startX, height = 260, yLabel = 'Price' }: {
  points: ChartPoint[]; label: string; formatY?: (v: number) => string; volume?: boolean; baseline?: number; baselineLabel?: string; startX?: number; height?: number; yLabel?: string;
}) {
  // Draw at the real container width so text stays readable on a phone (no shrinking a wide drawing).
  const [W, setW] = useState(720);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 480;
  const padL = narrow ? 54 : 62, padR = 10, padT = 12, padB = 24;
  height = narrow ? Math.min(height, 230) : height;
  const volH = volume ? (narrow ? 44 : 54) : 0, gap = volume ? 10 : 0;
  const plotH = height - padT - padB - volH - gap;
  const [idx, setIdx] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const m = useMemo(() => {
    const ys = points.map((p) => p.y).concat(baseline ?? []);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo || hi * 0.05 || 1) * 0.12; lo -= pad; hi += pad;
    const x0 = points[0]?.x ?? 0, x1 = points[points.length - 1]?.x ?? 1;
    const X = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * (W - padL - padR);
    const Y = (y: number) => padT + (1 - (y - lo) / (hi - lo)) * plotH;
    const vmax = Math.max(1, ...points.map((p) => p.volume || 0));
    return { lo, hi, X, Y, vmax };
  }, [points, baseline, plotH, W, padL]);
  if (points.length < 2) return <div ref={wrap}><p className="muted">The chart appears after the first market reveal.</p></div>;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${m.X(p.x).toFixed(1)} ${m.Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${m.X(points[points.length - 1].x).toFixed(1)} ${padT + plotH}L${m.X(points[0].x).toFixed(1)} ${padT + plotH}Z`;
  const ticks = [0, 1, 2, 3].map((i) => m.lo + ((m.hi - m.lo) * i) / 3);
  const step = Math.max(1, Math.round(points.length / (narrow ? 4 : 7)));
  const bw = Math.max(2, ((W - padL - padR) / points.length) * 0.6);
  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const d = Math.abs(m.X(p.x) - vx); if (d < bd) { bd = d; best = i; } });
    setIdx(best);
  };
  const cur = idx === null ? null : points[idx];
  const prev = idx !== null && idx > 0 ? points[idx - 1] : null;
  const up = points[points.length - 1].y >= (baseline ?? points[0].y);
  return (
    <div className="chart" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} tabIndex={0} className="chart-svg"
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setIdx(null)} onBlur={() => setIdx(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { setIdx((i) => Math.max(0, (i ?? points.length) - 1)); e.preventDefault(); }
          if (e.key === 'ArrowRight') { setIdx((i) => Math.min(points.length - 1, (i ?? -1) + 1)); e.preventDefault(); }
          if (e.key === 'Escape') setIdx(null);
        }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={m.Y(t)} y2={m.Y(t)} className="c-grid" />
            <text x={padL - 8} y={m.Y(t) + 4} textAnchor="end" className="c-axis">{formatY(t)}</text>
          </g>
        ))}
        {startX !== undefined && startX > points[0].x && (
          <g>
            <line x1={m.X(startX)} x2={m.X(startX)} y1={padT} y2={padT + plotH + gap + volH} className="c-start" />
            {m.X(startX) + 74 < W
              ? <text x={m.X(startX) + 5} y={padT + 11} className="c-axis">Game start</text>
              : <text x={m.X(startX) - 5} y={padT + 11} textAnchor="end" className="c-axis">Game start</text>}
          </g>
        )}
        {baseline !== undefined && (
          <g>
            <line x1={padL} x2={W - padR} y1={m.Y(baseline)} y2={m.Y(baseline)} className="c-base" />
            {baselineLabel && <text x={W - padR - 4} y={m.Y(baseline) - 6} textAnchor="end" className="c-axis c-base-label">{baselineLabel}</text>}
          </g>
        )}
        <path d={area} className={up ? 'c-area c-area-up' : 'c-area c-area-down'} />
        <path d={path} fill="none" className={up ? 'c-line c-line-up' : 'c-line c-line-down'} />
        {volume && points.map((p, i) => {
          const h = Math.max(1, ((p.volume || 0) / m.vmax) * volH);
          const dir = i === 0 || p.y >= points[i - 1].y;
          return <rect key={p.x} x={m.X(p.x) - bw / 2} y={padT + plotH + gap + volH - h} width={bw} height={h} className={dir ? 'c-vol c-vol-up' : 'c-vol c-vol-down'} />;
        })}
        {volume && <text x={padL - 8} y={padT + plotH + gap + 22} textAnchor="end" className="c-axis">Vol</text>}
        {points.map((p, i) => (i % step === 0 || i === points.length - 1) && (
          <text key={p.x} x={m.X(p.x)} y={height - 6} textAnchor={m.X(p.x) > W - 24 ? 'end' : m.X(p.x) < padL + 8 ? 'start' : 'middle'} className="c-axis">{weekLabel(p.x)}</text>
        ))}
        {cur && (
          <g>
            <line x1={m.X(cur.x)} x2={m.X(cur.x)} y1={padT} y2={padT + plotH + gap + volH} className="c-cross" />
            <circle cx={m.X(cur.x)} cy={m.Y(cur.y)} r="4" className="c-dot" />
          </g>
        )}
      </svg>
      {cur && (
        <div className="c-tip" style={{ left: `${(m.X(cur.x) / W) * 100}%` }} role="status">
          <b>{cur.x === 0 ? 'Game start' : cur.x < 0 ? `${-cur.x} weeks before` : `Week ${cur.x} close`}</b>
          <span>{yLabel}: {formatY(cur.y)}</span>
          {prev && <span>Change: {pct(((cur.y - prev.y) / prev.y) * 100)}</span>}
          {cur.volume !== undefined && <span>Volume: {compact(cur.volume)}</span>}
        </div>
      )}
    </div>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok' | 'warn'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="center-fill"><div className="spinner" role="status" aria-label={label} /><p className="muted">{label}...</p></div>;
}

export function Disclaimer({ className = '' }: { className?: string }) {
  return <p className={'fine ' + className}>Simulated money and fictional companies. Not real investments and not investment advice.</p>;
}

/** Works on http:// pages too (navigator.clipboard needs HTTPS). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); } }}>
      {done ? 'Copied' : label}
    </button>
  );
}

export const volClass = (v: string) => `vol vol-${v.toLowerCase()}`;
export const typeLabel = (t: string) => (t === 'company' ? 'Company' : t === 'industry' ? 'Industry' : 'Economy');


/* ------------------------------------------------------------------ */
/*  Beginner-friendly building blocks                                  */
/* ------------------------------------------------------------------ */

/** Smoothly animates between numbers (skipped when the person prefers reduced motion). */
export function useAnimatedNumber(target: number, ms = 900) {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [v, setV] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now(), a = from.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const val = a + (target - a) * (1 - Math.pow(1 - p, 4));
      setV(val); from.current = val;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return v;
}

/** Small round "i" button. Pair it with <Explain> to show the plain-English meaning right below. */
export function InfoButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={'info-btn' + (open ? ' on' : '')} aria-expanded={open} aria-label={`What does ${label} mean?`} onClick={onClick}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.2M8 4.7v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
  );
}

/** A label with its own explanation that opens inline when tapped (works on phones; nothing to hover). */
export function Term({ label, tip, children }: { label: string; tip: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term">
      <span className="term-row">{children ?? label}<InfoButton open={open} onClick={() => setOpen(!open)} label={label} /></span>
      {open && <span className="term-tip" role="note">{tip}</span>}
    </span>
  );
}

export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="pills">
      {options.map((o) => <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}

export const RISK_TEXT: Record<string, string> = {
  Lower: 'Lower risk: the price usually changes by small amounts from week to week. No investment is risk-free, though.',
  Medium: 'Medium risk: the price can move a fair amount from week to week, up or down.',
  Higher: 'Higher risk: the price can swing a lot in a single week, up or down. That means bigger possible gains, but also bigger possible losses.',
};
export const RiskBadge = ({ vol }: { vol: string }) => <span className={`risk risk-${vol.toLowerCase()}`} title={RISK_TEXT[vol]}><i aria-hidden="true" />{vol} risk</span>;

/** Segmented bar: how a portfolio is split (cash vs each investment). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="splitbar" onPointerLeave={() => setHover(null)} role="img" aria-label={parts.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(0)}%`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p, i) => <span key={p.label} onPointerEnter={() => setHover(i)} style={{ flexBasis: `${(p.value / total) * 100}%`, background: p.color, opacity: hover === null || hover === i ? 1 : 0.35 }} />)}
      </div>
      <ul className="splitlegend">
        {parts.filter((p) => p.value > 0).map((p) => (
          <li key={p.label}><span className="swatch" style={{ background: p.color }} aria-hidden="true" /><span>{p.label}</span><span className="num">{money(p.value)}</span><span className="num muted">{((p.value / total) * 100).toFixed(0)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/** One bar per week, showing how your portfolio changed. Up and down are different colours AND different arrows. */
export function WeeklyStrip({ items }: { items: { week: number; pct: number }[] }) {
  const max = Math.max(0.5, ...items.map((i) => Math.abs(i.pct)));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="strip" onPointerLeave={() => setHover(null)}>
        {items.map((i, k) => (
          <button key={i.week} type="button" className={`strip-bar ${i.pct >= 0 ? 'up' : 'down'}`} style={{ height: `${22 + (Math.abs(i.pct) / max) * 78}%`, opacity: hover === null || hover === k ? 1 : 0.35 }}
            onPointerEnter={() => setHover(k)} onFocus={() => setHover(k)} onBlur={() => setHover(null)} aria-label={`Week ${i.week}: ${pct(i.pct)}`} />
        ))}
      </div>
      <div className="strip-labels">{items.map((i) => <span key={i.week}>W{i.week}</span>)}</div>
      <p className="fine strip-read" aria-live="polite">{hover !== null ? `Week ${items[hover].week}: ${items[hover].pct >= 0 ? 'up' : 'down'} ${Math.abs(items[hover].pct).toFixed(2)}%` : 'Tap a bar to see that week.'}</p>
    </div>
  );
}
