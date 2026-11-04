import { useMemo, useState } from 'react';
import type { Asset, CompanyInfo, FundInfo, NewsEvent, PlayerView } from './api';
import TradePanel from './Trade';
import { Change, InfoButton, Pills, PriceChart, RISK_TEXT, RiskBadge, Spark, SplitBar, Term, WeeklyStrip, money, moneyWhole, pct, signed, typeLabel } from './ui';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SPLIT_COLORS = ['var(--accent)', 'var(--lilac)', '#7fb4ff', '#ffb86b', '#5fd6c8', '#e58fd0', '#a9b4c9', '#c9a46b', '#9be37a', '#8a8fff', '#ff8f8f'];

/* ------------------------------------------------------------------ */
/*  Plain-English explanations (kept accurate and short)               */
/* ------------------------------------------------------------------ */

const TIPS: Record<string, string> = {
  'Revenue growth': 'How much the company\u2019s sales grew compared with a year ago. Faster growth can be a good sign, but growth alone does not make a good investment.',
  'Gross margin': 'The share of each dollar of sales left after paying the direct costs of making the product or service. A higher number usually means the company keeps more from every sale.',
  'Profit margin': 'How many cents of profit the company keeps from each dollar of sales after all of its costs, interest, and taxes. A negative number means the company is losing money.',
  Debt: 'How much money the company owes compared with its size. A lot of debt can be risky, especially when interest rates rise.',
  'Earnings per share': 'The company\u2019s yearly profit divided by its number of shares. It shows how much profit each share \u201cearns\u201d.',
  'P/E ratio': 'Price-to-earnings ratio: the share price divided by earnings per share. It shows how many dollars investors pay for each $1 of yearly profit. A high P/E can mean investors expect strong growth, or that the shares are expensive. It is only useful next to similar companies.',
  'Market value': 'The total value of all of the company\u2019s shares (share price multiplied by the number of shares). It tells you how big the company is.',
  'Dividend yield': 'A dividend is a share of profit some companies pay to their shareholders. The yield is the yearly dividend as a percentage of the share price. Dividends are not paid in this game.',
  'Investor expectations': 'How much good news is already built into the price. When expectations are high, even good news can disappoint, and bad news can hurt more.',
  Holdings: 'The companies inside the fund.',
  Weighting: 'How much money the fund puts into each company. \u201cEqual weight\u201d means the same amount in each.',
  Fees: 'Real funds charge a small yearly fee. This game does not charge fees.',
};
const DEBT_LINE: Record<string, string> = { Low: 'Owes little compared with its size.', Moderate: 'Owes a fair amount, which is normal for its industry.', High: 'Owes a lot, which can be risky if borrowing costs rise.' };
const EXPECT_LINE: Record<string, string> = {
  Low: 'Few big hopes are built into the price yet.', Moderate: 'Some good news is already expected by investors.', High: 'Investors expect a lot, so even good news can disappoint.',
};

/* ------------------------------------------------------------------ */
/*  Portfolio                                                          */
/* ------------------------------------------------------------------ */

export function Portfolio({ view, onOpen, onBrowse }: { view: PlayerView; onOpen: (t: string) => void; onBrowse: () => void }) {
  const held = view.assets.filter((a) => a.shares > 0);
  const [openT, setOpenT] = useState<string | null>(null);
  const series = view.series;
  const weekly = series.slice(1).map((s, i) => ({ week: s.week, pct: ((s.netCents - series[i].netCents) / series[i].netCents) * 100 }));
  const parts = [{ label: 'Cash', value: view.me.cashCents, color: 'var(--cash)' }, ...held.map((a, i) => ({ label: a.name, value: a.valueCents, color: SPLIT_COLORS[i % SPLIT_COLORS.length] }))];
  return (
    <div className="bento">
      <section className="tile c8">
        <h2>How your portfolio is doing</h2>
        <p className="explain">Each point is your <b>total portfolio value</b> at the end of a week. The dashed line is where you started ($1,000). <span className="up">Above it you are ahead</span>, <span className="down">below it you are behind</span>.</p>
        {series.length > 1
          ? <PriceChart label="Your portfolio value at the end of each week" formatY={moneyWhole} yLabel="Portfolio" baseline={100000} baselineLabel="Starting value $1,000" points={series.map((s) => ({ x: s.week, y: s.netCents }))} height={230} />
          : <div className="empty-chart"><p className="big num">{money(view.me.netCents)}</p><p className="muted">You are at the starting line. Your chart begins after the first market results.</p></div>}
      </section>
      <section className="tile c4">
        <h2>Where your money is</h2>
        <p className="explain">Cash is money you have not invested. The rest is invested in shares.</p>
        <SplitBar parts={parts} />
      </section>

      <section className="tile c7">
        <h2>Your investments</h2>
        {held.length === 0 ? (
          <div className="empty"><p>You do not own any shares yet, so all of your money is cash. That is fine. When you are ready, pick a company to learn about.</p><button className="btn btn-primary" onClick={onBrowse}>Browse companies</button></div>
        ) : (
          <ul className="holds">{held.map((a) => {
            const pl = a.valueCents - a.costCents;
            const open = openT === a.ticker;
            return (
              <li key={a.ticker}>
                <button className="hold-main" aria-expanded={open} onClick={() => setOpenT(open ? null : a.ticker)}>
                  <span className="hold-name"><b>{a.name}</b><span className="sub">{plural(a.shares, 'share')}</span></span>
                  <span className="hold-val"><b className="num">{money(a.valueCents)}</b><Change value={pl}>{signed(pl)} <span className="muted">overall</span></Change></span>
                  <span className="chev" aria-hidden="true">{open ? '\u2212' : '+'}</span>
                </button>
                {open && (
                  <div className="hold-more">
                    <dl><div><dt>Price now</dt><dd className="num">{money(a.priceCents)}</dd></div><div><dt>Average price you paid</dt><dd className="num">{money(Math.round(a.costCents / a.shares))}</dd></div><div><dt>Total you paid</dt><dd className="num">{money(a.costCents)}</dd></div></dl>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpen(a.ticker)}>View company and trade</button>
                  </div>
                )}
              </li>
            );
          })}</ul>
        )}
      </section>
      <section className="tile c5">
        <h2>Week by week</h2>
        <p className="explain">How much your total portfolio value changed each week.</p>
        {weekly.length ? <WeeklyStrip items={weekly} /> : <p className="muted">Your first week of results will show up here.</p>}
      </section>

      <details className="tile c12 fold">
        <summary><h2>Recent transactions <span className="muted">({view.trades.length})</span></h2></summary>
        {view.trades.length === 0 ? <p className="muted">You have not bought or sold anything yet.</p> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Week</th><th>What you did</th><th className="num">Shares</th><th className="num">Price each</th><th className="num">Total</th></tr></thead>
            <tbody>{view.trades.slice(0, 15).map((t, i) => {
              const a = view.assets.find((x) => x.ticker === t.ticker);
              return <tr key={i}><td>{t.week}</td><td>{t.side === 'buy' ? 'Bought' : 'Sold'} {a?.name ?? t.ticker}</td><td className="num">{t.qty}</td><td className="num">{money(t.priceCents)}</td><td className="num">{money(t.totalCents)}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Companies                                                          */
/* ------------------------------------------------------------------ */

export function Companies({ assets, watch, onWatch, onOpen, moveLabel }: { assets: Asset[]; watch: string[]; onWatch: (t: string) => void; onOpen: (t: string) => void; moveLabel: string }) {
  const [q, setQ] = useState('');
  const [starred, setStarred] = useState(false);
  const [help, setHelp] = useState(false);
  const rows = useMemo(() => assets.filter((a) => (!starred || watch.includes(a.ticker)) && `${a.name} ${a.ticker} ${a.industry}`.toLowerCase().includes(q.trim().toLowerCase())), [assets, q, starred, watch]);
  return (
    <section className="tile">
      <div className="toolbar">
        <h2>Companies</h2>
        <input className="input input-sm" type="search" placeholder="Search by name or industry" aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="explain">Choose a company to open its page, where you can read about it and buy or sell shares.</p>
      <div className="help-line"><span>What does &ldquo;risk&rdquo; mean?</span><InfoButton open={help} onClick={() => setHelp(!help)} label="risk" /></div>
      {help && (
        <ul className="risk-help" role="note">
          {(['Lower', 'Medium', 'Higher'] as const).map((v) => <li key={v}><RiskBadge vol={v} /><span>{RISK_TEXT[v].replace(/^[A-Za-z]+ risk: /, '')}</span></li>)}
        </ul>
      )}
      {watch.length > 0 && <button className={'chip chip-quiet' + (starred ? ' on' : '')} aria-pressed={starred} onClick={() => setStarred(!starred)}>Show only my starred ({watch.length})</button>}
      {rows.length === 0 ? <p className="muted">{starred && !q ? 'You have not starred any companies.' : 'No companies match your search.'}</p> : (
        <ul className="cos">{rows.map((a) => (
          <li key={a.ticker} className="co-card">
            <button className="co-main" onClick={() => onOpen(a.ticker)} aria-label={`Open ${a.name}. ${money(a.priceCents)}, ${pct(a.changePct)} ${moveLabel}.`}>
              <span className="co-top"><b className="co-name">{a.name}</b><span className="tick">{a.ticker}</span></span>
              <span className="sub">{a.industry}</span>
              <span className="co-mid"><span className="num co-price">{money(a.priceCents)}</span><Change value={a.changePct}>{pct(a.changePct)} <span className="muted">{moveLabel}</span></Change><Spark values={a.history.map((h) => h.priceCents)} /></span>
              <span className="co-foot"><RiskBadge vol={a.vol} /><span className="open-hint">View company &rsaquo;</span></span>
            </button>
            <button className={'star' + (watch.includes(a.ticker) ? ' on' : '')} aria-pressed={watch.includes(a.ticker)} aria-label={`${watch.includes(a.ticker) ? 'Remove' : 'Add'} ${a.name} ${watch.includes(a.ticker) ? 'from' : 'to'} your starred list`} onClick={() => onWatch(a.ticker)}>{watch.includes(a.ticker) ? '\u2605' : '\u2606'}</button>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Company page                                                       */
/* ------------------------------------------------------------------ */

function Metric({ label, value, tip }: { label: string; value: string; tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="metric">
      <div className="metric-row"><span>{label}</span><b className="num">{value}</b><InfoButton open={open} onClick={() => setOpen(!open)} label={label} /></div>
      {open && <p className="term-tip" role="note">{tip}</p>}
    </li>
  );
}

export function CompanyPage({ a, view, code, token, reload, onBack, onArticle, watched, onWatch, onReopen, moveLabel }: {
  a: Asset; view: PlayerView; code: string; token: string; reload: () => void; onBack: () => void; onArticle: (id: string) => void; watched: boolean; onWatch: () => void; onReopen: () => void; moveLabel: string;
}) {
  const [more, setMore] = useState(false);
  const [range, setRange] = useState<'All' | 'Game only'>('All');
  const news = view.events.filter((e) => e.concerns.includes(a.ticker) || e.type === 'macro');
  const isEtf = a.kind === 'ETF';
  const c = a.info as CompanyInfo, f = a.info as FundInfo;
  const pts = a.history.map((h) => ({ x: h.week, y: h.priceCents, volume: h.volume }));
  const shown = range === 'Game only' && pts.filter((p) => p.x >= 0).length > 1 ? pts.filter((p) => p.x >= 0) : pts;
  return (
    <div className="company-grid">
      <section className="tile area-head">
        <button className="link-btn back" onClick={onBack}>&larr; All companies</button>
        <div className="co-head">
          <div>
            <h2 className="co-title">{a.name}</h2>
            <p className="sub"><span className="tick">{a.ticker}</span> {a.industry} &middot; {isEtf ? 'Fund' : 'Company'}</p>
          </div>
          <div className="co-px"><span className="num big">{money(a.priceCents)}</span><span className="sub">price of 1 share</span><Change value={a.changePct}>{pct(a.changePct)} <span className="muted">{moveLabel}</span></Change></div>
        </div>
        <div className="co-badges">
          <Term label="risk level" tip={RISK_TEXT[a.vol]}><RiskBadge vol={a.vol} /></Term>
          <button className={'chip chip-quiet' + (watched ? ' on' : '')} aria-pressed={watched} onClick={onWatch}>{watched ? '\u2605 Starred' : '\u2606 Star'}</button>
        </div>
      </section>

      <section className="tile area-chart">
        <div className="toolbar"><h3>Share price</h3><Pills label="Chart range" value={range} options={['All', 'Game only']} onChange={setRange} /></div>
        <PriceChart label={`${a.name} weekly closing share price`} points={shown} startX={0} volume />
        <p className="fine">Each point is the share price at the end of a week. Weeks before &ldquo;Game start&rdquo; are history so you can see the trend. Bars show how many shares were traded.</p>
      </section>

      <div className="area-trade"><TradePanel key={a.ticker} asset={a} view={view} code={code} token={token} reload={reload} onReopen={onReopen} /></div>

      <section className="tile area-about">
        <h3>About {a.name}</h3>
        <p>{a.desc}</p>
        <h4>At a glance</h4>
        {isEtf ? (
          <ul className="glance">
            <li><b>What it holds</b><span>{f.holdings} companies, in equal amounts.</span></li>
            <li><b>Why people use funds</b><span>Spreading money across many companies means one bad story hurts less.</span></li>
            <li><b>Can it lose value?</b><span>Yes. If the whole market falls, the fund usually falls too.</span></li>
          </ul>
        ) : (
          <ul className="glance">
            <li><b>Is it growing?</b><span>{c.revenueGrowth >= 0 ? `Its sales grew ${c.revenueGrowth}% over the past year.` : `Its sales shrank ${Math.abs(c.revenueGrowth)}% over the past year.`}</span></li>
            <li><b>Does it make a profit?</b><span>{c.netMargin >= 0 ? `For every $1 of sales, it keeps about ${c.netMargin}\u00a2 as profit.` : `For every $1 of sales, it currently loses about ${Math.abs(c.netMargin)}\u00a2.`}</span></li>
            <li><b>How much does it owe?</b><span>{DEBT_LINE[c.debt]}</span></li>
            <li><b>What do investors expect?</b><span>{EXPECT_LINE[c.expectations]}</span></li>
          </ul>
        )}
        <button className="btn btn-ghost btn-sm" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Hide company details' : 'Explore more company details'}</button>
        {more && (
          <ul className="metrics">
            {isEtf ? (
              <>
                <Metric label="Holdings" value={`${f.holdings} companies`} tip={TIPS.Holdings} />
                <Metric label="Weighting" value={f.weighting} tip={TIPS.Weighting} />
                <Metric label="Fees" value="Not modelled" tip={TIPS.Fees} />
              </>
            ) : (
              <>
                <Metric label="Revenue growth" value={`${c.revenueGrowth}%`} tip={TIPS['Revenue growth']} />
                <Metric label="Gross margin" value={c.grossMargin ? `${c.grossMargin}%` : 'n/a'} tip={TIPS['Gross margin']} />
                <Metric label="Profit margin" value={`${c.netMargin}%`} tip={TIPS['Profit margin']} />
                <Metric label="Debt" value={c.debt} tip={TIPS.Debt} />
                <Metric label="Earnings per share" value={`$${c.eps.toFixed(2)}`} tip={TIPS['Earnings per share']} />
                <Metric label="P/E ratio" value={`${c.pe}`} tip={TIPS['P/E ratio']} />
                <Metric label="Market value" value={`$${c.marketCapM.toLocaleString('en-CA')}M`} tip={TIPS['Market value']} />
                <Metric label="Dividend yield" value={c.dividendYield ? `${c.dividendYield}%` : 'None'} tip={TIPS['Dividend yield']} />
                <Metric label="Investor expectations" value={c.expectations} tip={TIPS['Investor expectations']} />
              </>
            )}
          </ul>
        )}
      </section>

      {a.drivers.length > 0 && (
        <section className="tile area-drv">
          <h3>What moved the price this week</h3>
          <ul className="drivers">{a.drivers.map((d) => <li key={d.label}><span>{d.label}</span><Change value={d.pct}>{pct(d.pct)}</Change></li>)}</ul>
        </section>
      )}

      <section className="tile area-news">
        <h3>News about {a.name}</h3>
        {news.length === 0 ? <p className="muted">No stories about this company have been published yet.</p> : (
          <ul className="newslist compact">{news.slice(0, 6).map((e) => <li key={e.id}><button onClick={() => onArticle(e.id)}><span className="meta"><span className="tag">{typeLabel(e.type)}</span> Week {e.week}</span><span className="hl">{e.headline}</span></button></li>)}</ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  News                                                               */
/* ------------------------------------------------------------------ */

export function News({ events, assets, week, phase, read, onOpen }: { events: NewsEvent[]; assets: Asset[]; week: number; phase: string; read: Set<string>; onOpen: (id: string) => void }) {
  const weeks = [...new Set(events.map((e) => e.week))].sort((a, b) => b - a);
  const nameOf = (t: string) => assets.find((a) => a.ticker === t)?.name ?? t;
  return (
    <section className="tile">
      <h2>News</h2>
      <p className="explain">Read each story all the way through. For each one, ask: what is good news here, what is a worry, and what might investors already have expected?</p>
      {weeks.length === 0 && <div className="empty"><p>{phase === 'intro' ? `Week ${week}'s news will appear here when your teacher publishes it.` : 'No news has been published yet.'}</p></div>}
      {weeks.map((w) => (
        <div key={w}>
          <h3 className="wk">Week {w}{w === week ? ' \u00b7 this week' : ''}</h3>
          <ul className="newslist">
            {events.filter((e) => e.week === w).map((e) => (
              <li key={e.id}><button onClick={() => onOpen(e.id)}>
                <span className="meta"><span className="tag">{typeLabel(e.type)}</span><span>{e.time}</span>{read.has(e.id) && <span className="readmark">Read</span>}</span>
                <span className="hl">{e.headline}</span>
                <span className="about">{e.concerns.length ? e.concerns.map((t) => <span key={t} className="chip chip-static">{nameOf(t)}</span>) : <span className="chip chip-static">{e.scope ?? 'Wider economy'}</span>}</span>
                {e.figures[0] && <span className="figs">{e.figures.slice(0, 2).map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</span>}
                <span className="open-hint">Read the story &rsaquo;</span>
              </button></li>
            ))}
          </ul>
        </div>
      ))}
      <p className="fine">News stories are fictional.</p>
    </section>
  );
}

const THINK = [
  ['What happened?', 'Say it in one sentence, in your own words.'],
  ['What is positive about this news?', 'Look for growth, new customers, or lower costs.'],
  ['What could be concerning?', 'Look for rising costs, falling profit, or uncertainty.'],
  ['How might this affect the company?', 'Remember what investors already expected. New surprises move prices more than old news.'],
];

export function Article({ ev, assets, onBack, onCompany }: { ev?: NewsEvent; assets: Asset[]; onBack: () => void; onCompany: (t: string) => void }) {
  if (!ev) return <section className="tile"><button className="link-btn back" onClick={onBack}>&larr; News</button><p>That story is not available.</p></section>;
  return (
    <div className="article-grid">
      <article className="tile article">
        <button className="link-btn back" onClick={onBack}>&larr; All news</button>
        <p className="meta"><span className="tag">{typeLabel(ev.type)}</span><span>Week {ev.week} &middot; {ev.time}</span>{ev.scope && <span>{ev.scope}</span>}</p>
        <h2>{ev.headline}</h2>
        <p className="body">{ev.body}</p>
        {ev.figures.length > 0 && (
          <>
            <h4>Key figures</h4>
            <dl className="figtiles">{ev.figures.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
          </>
        )}
        <h4>Who this story is about</h4>
        {ev.concerns.length === 0 ? <p className="muted">This story is about the wider economy, so it may affect many companies in different ways.</p> : (
          <div className="chips">{ev.concerns.map((t) => { const a = assets.find((x) => x.ticker === t)!; return <button key={t} className="chip chip-co" onClick={() => onCompany(t)}><b>{a.name}</b><span className="num">{money(a.priceCents)}</span></button>; })}</div>
        )}
      </article>
      <aside className="tile think">
        <h3>Think like an investor</h3>
        <ol>{THINK.map(([q, h]) => <li key={q}><b>{q}</b><span>{h}</span></li>)}</ol>
        <p className="fine">There is no single right answer yet. After your teacher reveals the market, you will see how prices reacted.</p>
      </aside>
      {ev.reaction && (
        <section className="tile span-all">
          <h3>How the market reacted</h3>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Company</th><th className="num">Effect of this story</th><th className="num">Total move this week</th></tr></thead>
            <tbody>{ev.reaction.map((r) => { const a = assets.find((x) => x.ticker === r.ticker)!; return <tr key={r.ticker}><td><button className="link-btn" onClick={() => onCompany(r.ticker)}>{a.name}</button></td><td className="num"><Change value={r.eventPct}>{pct(r.eventPct)}</Change></td><td className="num"><Change value={r.totalPct}>{pct(r.totalPct)}</Change></td></tr>; })}</tbody>
          </table></div>
          <p className="fine">The total move also includes other news that week, investor expectations, and a small random element.</p>
        </section>
      )}
    </div>
  );
}
