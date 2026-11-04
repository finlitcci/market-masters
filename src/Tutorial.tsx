import { useState, type ReactNode } from 'react';

/* Simple illustrations. They are examples with made-up numbers, and are labelled as such. */

function VisShares() {
  return (
    <figure className="vis" aria-label="A company divided into 24 equal pieces, 2 of which are yours">
      <div className="vis-grid">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i === 7 || i === 8 ? 'mine' : ''} />)}</div>
      <figcaption>A company, cut into small equal pieces called <b>shares</b>. The two lit-up pieces are yours.</figcaption>
    </figure>
  );
}

function VisEtf() {
  const t = ['BWS', 'NSR', 'VDP', 'PHS', 'HLL', 'GFD'];
  return (
    <figure className="vis" aria-label="A basket holding six different companies">
      <div className="vis-basket">{t.map((x) => <span key={x}>{x}</span>)}</div>
      <figcaption>An <b>ETF</b> is a basket. Buying one share of the basket gives you a small piece of every company inside it.</figcaption>
    </figure>
  );
}

function VisPrice() {
  return (
    <figure className="vis" aria-label="Example price line moving up after good news and down after disappointing news">
      <svg viewBox="0 0 300 110" role="img" aria-hidden="true">
        <path d="M5 80 L50 66 L95 72 L140 36 L185 44 L230 78 L295 60" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="140" cy="36" r="5" fill="var(--accent)" /><circle cx="230" cy="78" r="5" fill="var(--down)" />
        <text x="140" y="22" textAnchor="middle" className="vis-t">Good news</text><text x="230" y="98" textAnchor="middle" className="vis-t">Worse than expected</text>
      </svg>
      <figcaption>Prices move when investors react to news. <b>Example only.</b></figcaption>
    </figure>
  );
}

function VisPortfolio() {
  const Box = ({ k, v, hi }: { k: string; v: string; hi?: boolean }) => <div className={'eq-box' + (hi ? ' hi' : '')}><span>{k}</span><b className="num">{v}</b></div>;
  return (
    <figure className="vis" aria-label="Cash plus investments equals portfolio value">
      <div className="eq"><Box k="Cash" v="$600" /><span className="eq-op">+</span><Box k="Investments" v="$400" /><span className="eq-op">=</span><Box k="Portfolio" v="$1,000" hi /></div>
      <div className="eq eq-2"><Box k="Cash" v="$600" /><span className="eq-op">+</span><Box k="Investments" v="$440" /><span className="eq-op">=</span><Box k="Portfolio" v="$1,040" hi /></div>
      <figcaption>If your investments grow from $400 to $440, your portfolio grows by $40. Cash stays the same.</figcaption>
    </figure>
  );
}

function VisRisk() {
  return (
    <figure className="vis" aria-label="Money in one company versus spread across five">
      <div className="vis-risk"><span>All in one</span><div className="bar"><i style={{ width: '100%' }} /></div></div>
      <div className="vis-risk"><span>Spread out</span><div className="bar">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ width: '19%' }} />)}</div></div>
      <figcaption>Spreading your money out means one bad story can&rsquo;t hurt you as much.</figcaption>
    </figure>
  );
}

const WELCOME = [
  ['You start with $1,000', 'It is virtual money, so nothing here is real.'],
  ['Pick your investments', 'Ten fictional companies, or one fund that holds them all.'],
  ['Read the news', 'Each week brings new stories to help you decide.'],
  ['Buy, sell, or hold', 'Doing nothing is a perfectly good choice.'],
  ['Learn from the results', 'See how the market reacted, then take a short quiz.'],
];

const SLIDES: { title: string; lead: string; example: string; vis: ReactNode }[] = [
  { title: 'A share is a tiny piece of a company', lead: 'When you buy a share, you own a small part of that company.', example: 'Example: buy 2 shares at $25 each. You spend $50 and have $950 cash left.', vis: <VisShares /> },
  { title: 'An ETF is a basket of companies', lead: 'One purchase gives you a little of many companies at once.', example: 'In this game, the Market 100 ETF holds all ten companies equally.', vis: <VisEtf /> },
  { title: 'Prices change because of news and expectations', lead: 'A price shows what investors will pay right now. It moves when they learn something new.', example: 'A company reports record sales, but investors hoped for even more. Its price can still fall.', vis: <VisPrice /> },
  { title: 'Cash plus investments is your portfolio', lead: 'Cash is money you have not invested. Investments are shares, valued at today\u2019s prices.', example: 'Portfolio value = cash + value of your shares. Selling swaps shares for cash. It does not change your total.', vis: <VisPortfolio /> },
  { title: 'Spread your money, and know the risk', lead: 'Diversification means not putting everything in one place. Risk means a price can go down as well as up.', example: 'A \u201cHigher risk\u201d company can move a lot in a week, both up and down. Lower risk never means no risk.', vis: <VisRisk /> },
];

/** Welcome screen plus five short lessons. Used for first-time students and from the Help button at any time. */
export default function Tutorial({ onDone, replay }: { onDone?: () => void; replay?: boolean }) {
  const [i, setI] = useState(0);
  const total = SLIDES.length + 1;
  const last = i === total - 1;
  const s = i > 0 ? SLIDES[i - 1] : null;
  return (
    <section className="tutorial" aria-label="How Market Masters works">
      <div className="dots" role="img" aria-label={`Step ${i + 1} of ${total}`}>{Array.from({ length: total }, (_, k) => <span key={k} className={k === i ? 'dot-on' : k < i ? 'dot-done' : ''} />)}</div>
      <p className="meta">{i === 0 ? 'Welcome' : `Lesson ${i} of ${SLIDES.length}`}</p>
      {s ? (
        <>
          <h2>{s.title}</h2>
          <p className="lead">{s.lead}</p>
          {s.vis}
          <p className="example">{s.example}</p>
        </>
      ) : (
        <>
          <h2>How Market Masters works</h2>
          <ol className="welcome">{WELCOME.map(([h, p], k) => <li key={h}><b className="num">{k + 1}</b><div><strong>{h}</strong><span>{p}</span></div></li>)}</ol>
        </>
      )}
      <div className="row-actions">
        {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Back</button>}
        <button className="btn btn-primary grow" onClick={() => (last ? onDone?.() : setI(i + 1))}>{last ? (replay ? 'Close' : 'Got it, let\u2019s play') : i === 0 ? 'Show me' : 'Next'}</button>
      </div>
      {!last && <button className="link" onClick={() => onDone?.()}>{replay ? 'Close' : 'Skip the introduction'}</button>}
    </section>
  );
}
