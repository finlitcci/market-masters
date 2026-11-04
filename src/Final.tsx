import type { Final } from './api';
import { Change, PriceChart, money, moneyWhole, ordinal, pct, signed } from './ui';

function Podium({ top3 }: { top3: Final['top3'] }) {
  const slots = [top3[1], top3[0], top3[2]];
  return (
    <ol className="podium" aria-label="Top three players by portfolio value">
      {slots.map((p, i) => p && (
        <li key={p.id} className={`pod pod-${p.rank}`} style={{ order: i }}>
          <span className="pod-name">{p.name}</span>
          <span className="pod-net">{money(p.netCents)}</span>
          <Change value={p.returnCents}>{pct(p.returnPct)}</Change>
          <span className="pod-step"><b>{p.rank}</b></span>
        </li>
      ))}
    </ol>
  );
}

const Stat = ({ label, value, t }: { label: string; value: string; t?: number }) => (
  <div className="stat"><dt>{label}</dt><dd className={t === undefined ? '' : t > 0 ? 'up' : t < 0 ? 'down' : ''}>{value}</dd></div>
);

/** Shared by the projector (host) and students (own report + class results). Portfolio ranking and quiz results are kept apart. */
export default function FinalResults({ final, host }: { final: Final; host?: boolean }) {
  const m = final.mine;
  const maxAbs = Math.max(1, ...final.investments.map((i) => Math.abs(i.changePct)));
  return (
    <div className="final">
      <header><h2>Final results</h2><p className="muted">After {final.weeksPlayed} of 8 weeks. Ranked by portfolio value.</p></header>
      {final.top3.length > 0 && <Podium top3={final.top3} />}

      {m && (
        <>
          <section className="panel" aria-labelledby="rep-h">
            <h3 id="rep-h">Your report: {ordinal(m.rank)} of {m.playerCount}</h3>
            <dl className="stats">
              <Stat label="Starting cash" value={money(m.startCents)} />
              <Stat label="Remaining cash" value={money(m.cashCents)} />
              <Stat label="Value of shares" value={money(m.investedCents)} />
              <Stat label="Final portfolio value" value={money(m.netCents)} />
              <Stat label="Total return" value={`${signed(m.returnCents)} (${pct(m.returnPct)})`} t={m.returnCents} />
              <Stat label="Market 100 ETF over the same weeks" value={pct(m.etfPct)} t={m.etfPct} />
            </dl>
            <h4>Portfolio value by week</h4>
            <PriceChart label="Your portfolio value at the end of each week" formatY={moneyWhole} yLabel="Portfolio" baseline={m.startCents}
              points={m.series.map((s) => ({ x: s.week, y: s.netCents }))} height={220} />
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Week</th><th className="num">Value</th><th className="num">Change</th><th className="num">Rank</th></tr></thead>
              <tbody>{m.weekly.map((w) => (
                <tr key={w.week}><td>{w.week === 0 ? 'Start' : `Week ${w.week}`}</td><td className="num">{money(w.netCents)}</td>
                  <td className="num">{w.week === 0 ? '' : <Change value={w.changeCents}>{signed(w.changeCents)} ({pct(w.changePct)})</Change>}</td><td className="num">{w.rank ?? ''}</td></tr>
              ))}</tbody>
            </table></div>
          </section>

          <section className="panel" aria-labelledby="hold-h">
            <h3 id="hold-h">What you own at the end</h3>
            {m.holdings.length === 0 ? <p className="muted">You finished with all cash.</p> : (
              <div className="scroll"><table className="tbl">
                <thead><tr><th>Investment</th><th className="num">Shares</th><th className="num">Cost</th><th className="num">Value</th><th className="num">Gain / loss</th></tr></thead>
                <tbody>{m.holdings.map((h) => (
                  <tr key={h.ticker}><td><b>{h.ticker}</b> <span className="muted">{h.name}</span></td><td className="num">{h.shares}</td><td className="num">{money(h.costCents)}</td>
                    <td className="num">{money(h.valueCents)}</td><td className="num"><Change value={h.plCents}>{signed(h.plCents)}</Change></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          {final.quizEnabled && (
            <section className="panel" aria-labelledby="quiz-h">
              <h3 id="quiz-h">Investing knowledge (separate from your portfolio)</h3>
              <p>You answered <b>{m.quizCorrect}</b> of {m.quiz.length * 3} quiz questions correctly.</p>
              <div className="scroll"><table className="tbl">
                <thead><tr><th>Week</th><th>Topic</th><th className="num">Score</th></tr></thead>
                <tbody>{m.quiz.map((q) => <tr key={q.week}><td>{q.week}</td><td>{q.topic}</td><td className="num">{q.answered ? `${q.correct} / ${q.total}` : 'not answered'}</td></tr>)}</tbody>
              </table></div>
            </section>
          )}

          <section className="panel" aria-labelledby="les-h">
            <h3 id="les-h">Lessons learned</h3>
            <ul className="bullets">{m.lessons.map((l) => <li key={l}>{l}</li>)}</ul>
          </section>
        </>
      )}

      <section className="panel" aria-labelledby="aw-h">
        <h3 id="aw-h">Awards</h3>
        <ul className="awards">
          {final.awards.map((a) => (
            <li key={a.key}>
              <div><b>{a.title}</b><p className="fine">{a.rule}</p></div>
              <div className="award-win">{a.winner ? <><b>{a.winner.name}</b>{a.winner.detail && <span className="muted"> {a.winner.detail}</span>}</> : <span className="muted">No one qualified</span>}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="inv-h">
        <h3 id="inv-h">How the investments did over 8 weeks</h3>
        <p className="muted">Best: <b>{final.bestInvestment.name}</b> ({pct(final.bestInvestment.changePct)}). Weakest: <b>{final.worstInvestment.name}</b> ({pct(final.worstInvestment.changePct)}).</p>
        <ul className="perf">
          {final.investments.map((i) => (
            <li key={i.ticker}>
              <span className="perf-name">{i.ticker}</span>
              <span className="perf-track"><i className={i.changePct >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(i.changePct) / maxAbs) * 100}%` }} /></span>
              <Change value={i.changePct}>{pct(i.changePct)}</Change>
            </li>
          ))}
        </ul>
      </section>

      {host && final.quizEnabled && (
        <section className="panel" aria-labelledby="cq-h">
          <h3 id="cq-h">Class quiz results (separate from the ranking)</h3>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Week</th><th>Topic</th><th className="num">Answers</th><th className="num">Correct</th></tr></thead>
            <tbody>{final.quizSummary.map((q) => <tr key={q.week}><td>{q.week}</td><td>{q.topic}</td><td className="num">{q.answered}</td><td className="num">{q.pct === null ? '-' : `${q.pct}%`}</td></tr>)}</tbody>
          </table></div>
          <h4>Top quiz scores</h4>
          <ol className="bullets">{final.quizBoard.map((q) => <li key={q.id}>{q.name}: {q.correct} correct of {q.answered} answered</li>)}</ol>
        </section>
      )}

      <section className="panel" aria-labelledby="rk-h">
        <h3 id="rk-h">{host ? 'Final rankings' : 'Top 10'}</h3>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Rank</th><th>Player</th><th className="num">Portfolio</th><th className="num">Return</th></tr></thead>
          <tbody>
            {(host ? final.ranking : final.ranking.slice(0, 10)).map((r) => (
              <tr key={r.id} className={m && r.id === m.id ? 'me' : ''}><td>{r.rank}</td><td>{r.name}</td><td className="num">{money(r.netCents)}</td><td className="num"><Change value={r.returnCents}>{pct(r.returnPct)}</Change></td></tr>
            ))}
          </tbody>
        </table></div>
      </section>
      <p className="callout">{final.note}</p>
    </div>
  );
}
