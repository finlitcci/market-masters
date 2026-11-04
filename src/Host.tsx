import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError, api, hostSession, useLive, type HostView, type NewsEvent } from './api';
import { CreateGame, go } from './Entry';
import FinalResults from './Final';
import { Move } from './Player';
import { Banner, Brand, Change, CopyButton, Disclaimer, Spinner, money, pct, signed, typeLabel } from './ui';

export default function HostApp() {
  const [sess, setSess] = useState(hostSession.get());
  useEffect(() => { document.title = 'Host | Market Masters'; }, []);
  if (!sess) return <CreateGame onCreated={() => setSess(hostSession.get())} />;
  return <Host code={sess.code} token={sess.token} onLost={() => { hostSession.set(null); setSess(null); }} />;
}

function QR({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0f17', light: '#ffffff' } }).then(setSvg); }, [url]);
  return <div className="qr" role="img" aria-label={`QR code that opens ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const NEXT_LABEL = (v: HostView) => {
  const { phase, week, totalWeeks, quizEnabled } = v.room;
  return ({
    lobby: 'Start game', tutorial: 'Begin Week 1', intro: 'Publish news and open trading', trading: 'Lock trading', locked: 'Reveal market reaction',
    reveal: quizEnabled ? 'Start the quiz' : 'Show the leaderboard', quiz: 'End quiz', quizreview: 'Show the leaderboard',
    results: week < totalWeeks ? `Start Week ${week + 1}` : 'Show final results', final: '',
  } as Record<string, string>)[phase];
};

function Host({ code, token, onLost }: { code: string; token: string; onLost: () => void }) {
  const { data, error, offline, reload } = useLive<HostView>('host', code, token);
  if (error) {
    return (
      <main className="narrow">
        <Brand />
        <Banner kind="error">{error.message}</Banner>
        <button className="btn btn-primary" onClick={onLost}>Host a new game</button>
      </main>
    );
  }
  if (!data) return <Spinner label="Loading your game" />;
  return <HostScreen data={data} offline={offline} reload={reload} code={code} token={token} />;
}

export function HostScreen({ data, offline, reload, code, token }: { data: HostView; offline: boolean; reload: () => void; code: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [skipIntro, setSkipIntro] = useState(false);
  const [managing, setManaging] = useState(false);
  const { room } = data;
  const call = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) { setMsg((e as ApiError).message); } finally { setBusy(false); reload(); }
  };
  const post = (p: string, body: object = {}) => api('POST', `/api/rooms/${code}/host/${p}`, body, token);
  const advance = () => call(() => api('POST', `/api/rooms/${code}/host/advance`, { expectedPhase: room.phase, expectedWeek: room.week, skipTutorial: skipIntro }, token));
  const inGame = !['lobby', 'final'].includes(room.phase);

  return (
    <div className="stage">
      <header className="stage-top">
        <Brand small />
        <div className="joininfo" aria-label="How to join">
          <span>Join at <b>{data.joinUrl.replace(/^https?:\/\//, '').replace(/\/join.*/, '')}</b></span>
          <span>PIN <b className="pin-sm">{room.code}</b></span>
        </div>
        <div className="statline">
          {room.week > 0 && <span className="status-pill">Week {room.week} of {room.totalWeeks}{room.topic ? ` \u00b7 ${room.topic}` : ''}</span>}
          <span><b>{room.playerCount}</b> {room.playerCount === 1 ? 'player' : 'players'}</span>
        </div>
      </header>
      <div className="progress" role="img" aria-label={`Week ${room.week} of ${room.totalWeeks}`}>
        {Array.from({ length: room.totalWeeks }, (_, i) => <i key={i} className={i + 1 < room.week || (i + 1 === room.week && ['results', 'final'].includes(room.phase)) ? 'done' : i + 1 === room.week ? 'now' : ''} />)}
      </div>
      {offline && <Banner kind="warn">Connection lost. The game is saved on the server, and this screen is reconnecting.</Banner>}

      <main className="stage-main">
        {room.phase === 'lobby' && <Lobby v={data} />}
        {room.phase === 'tutorial' && <section className="center-msg"><h1>Students are reading the 5-step introduction</h1><p className="lead">It covers stocks, ETFs, prices, cash, and diversification. Talk it through, then begin Week 1.</p></section>}
        {room.phase === 'intro' && <Intro v={data} />}
        {room.phase === 'trading' && <Trading v={data} />}
        {room.phase === 'locked' && <Locked v={data} />}
        {room.phase === 'reveal' && <Reveal v={data} />}
        {room.phase === 'quiz' && <QuizMonitor v={data} />}
        {room.phase === 'quizreview' && <QuizReview v={data} />}
        {room.phase === 'results' && <Results v={data} />}
        {room.phase === 'final' && data.final && (
          <>
            <FinalResults final={data.final} host />
            {data.audit && <details className="audit"><summary>Audit information</summary><p className="fine">{data.audit.note}</p><code>{data.audit.seed}</code></details>}
          </>
        )}
        {managing && <ManagePlayers v={data} onRemove={(id, nm) => { if (window.confirm(`Remove ${nm} from the game? Their portfolio will be deleted.`)) call(() => post('remove', { playerId: id })); }} onClose={() => setManaging(false)} />}
      </main>

      <footer className="stage-bar">
        <div className="bar-left">
          {msg && <span className="bar-msg" role="alert">{msg}</span>}
          {room.phase === 'lobby' && <label className="check dark"><input type="checkbox" checked={skipIntro} onChange={(e) => setSkipIntro(e.target.checked)} /> Skip the student introduction</label>}
          {room.phase !== 'final' && <button className="btn btn-ghost-dark" onClick={() => setManaging(!managing)}>Manage players ({room.playerCount})</button>}
          {room.phase !== 'final' && <button className="btn btn-ghost-dark" onClick={() => call(() => post('lock', { locked: !room.joinLocked }))}>{room.joinLocked ? 'Unlock joining' : 'Lock joining'}</button>}
          {inGame && <button className="btn btn-ghost-dark" onClick={() => { if (window.confirm('End the game now and show final results?')) call(() => post('end')); }}>End game</button>}
        </div>
        <div className="bar-right">
          {room.phase === 'final' ? (
            <>
              <button className="btn btn-ghost-dark" onClick={() => { if (window.confirm('Start over with the same players? Everyone gets $1,000 and a new market.')) call(() => post('reset')); }}>Play again with these players</button>
              <button className="btn btn-primary" onClick={() => { hostSession.set(null); go('/host'); }}>Host a new game</button>
            </>
          ) : (
            <button className="btn btn-primary btn-xl" disabled={busy || (room.phase === 'lobby' && room.playerCount === 0)} onClick={advance}>{busy ? 'Working...' : NEXT_LABEL(data)}</button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Lobby({ v }: { v: HostView }) {
  const { room, players } = v;
  return (
    <div className="lobby">
      <section className="join-card">
        <p className="muted-dark">Scan with your phone camera, or open the address and type the PIN</p>
        <div className="pin" aria-label={`Game PIN ${room.code.split('').join(' ')}`}>{room.code}</div>
        <QR url={v.joinUrl} />
        <p className="joinurl">{v.joinUrl}</p>
        <div className="row-actions center"><CopyButton text={v.joinUrl} label="Copy join link" /><CopyButton text={room.code} label="Copy PIN" /></div>
        {!v.secure && <p className="fine warn-note">This address works for phones on the same Wi-Fi as this computer. For a school network or students at home, host the game on an HTTPS address (see the deployment guide).</p>}
      </section>
      <section className="roster">
        <h2>{players.length === 0 ? 'Waiting for players' : `${players.length} ${players.length === 1 ? 'player has' : 'players have'} joined`}</h2>
        {room.joinLocked && <Banner kind="warn">Joining is locked. New players cannot join.</Banner>}
        {players.length === 0 ? <p className="muted-dark">Names appear here as students join.</p> : <ul className="chips">{players.map((p) => <li key={p.id}>{p.name}</li>)}</ul>}
        <p className="muted-dark">Settings: weekly quiz {room.quizEnabled ? 'on' : 'off'}; discussion period {room.discussion ? 'on' : 'off'}.</p>
        <Disclaimer className="on-dark" />
      </section>
    </div>
  );
}

function ManagePlayers({ v, onRemove, onClose }: { v: HostView; onRemove: (id: number, name: string) => void; onClose: () => void }) {
  return (
    <aside className="drawer" aria-label="Manage players">
      <div className="drawer-head"><h3>Players</h3><button className="btn btn-ghost-dark btn-sm" onClick={onClose}>Close</button></div>
      {v.players.length === 0 ? <p className="muted-dark">No players yet.</p> : (
        <ul>{v.players.map((p) => <li key={p.id}><span>{p.name}</span><span className="muted-dark">{money(p.netCents)}</span><button className="btn btn-ghost-dark btn-sm" onClick={() => onRemove(p.id, p.name)}>Remove</button></li>)}</ul>
      )}
      <p className="fine">Removing a player deletes their portfolio and answers. Use it for inappropriate names or mistaken joins.</p>
    </aside>
  );
}

function Article({ e, showBody = true }: { e: NewsEvent; showBody?: boolean }) {
  return (
    <article className="news-card">
      <p className="meta"><span className="tag">{typeLabel(e.type)}</span> {e.time}{e.concerns.length ? ` \u00b7 ${e.concerns.join(', ')}` : e.scope ? ` \u00b7 ${e.scope}` : ''}</p>
      <h3>{e.headline}</h3>
      {showBody && <p>{e.body}</p>}
      {showBody && e.figures.length > 0 && <p className="figs">{e.figures.map(([k, val]) => <span key={k}>{k}: <b>{val}</b></span>)}</p>}
    </article>
  );
}

function Intro({ v }: { v: HostView }) {
  const [show, setShow] = useState(false);
  return (
    <section>
      <h1 className="h-big">Week {v.room.week}: {v.room.topic}</h1>
      <p className="lead">Students can see company information and prices, but not this week&rsquo;s news yet. Preview the stories privately, then publish them and open trading.</p>
      <div className="panel">
        <div className="toolbar"><h2>Private preview of this week&rsquo;s news</h2><button className="btn btn-ghost-dark" onClick={() => setShow(!show)}>{show ? 'Hide preview' : 'Show preview'}</button></div>
        {show ? <div className="news-grid">{v.preview?.map((e) => <Article key={e.id} e={e} />)}</div> : <p className="muted-dark">Hidden so it is safe to project. Click &ldquo;Show preview&rdquo; on your own screen when you are ready.</p>}
      </div>
    </section>
  );
}

function Trading({ v }: { v: HostView }) {
  const n = v.room.playerCount;
  const done = v.players.filter((p) => p.submitted), waiting = v.players.filter((p) => !p.submitted);
  const thisWeek = v.events.filter((e) => e.week === v.room.week);
  return (
    <section>
      <h1 className="h-big">Trading is open</h1>
      <p className="lead"><b>{v.submittedCount}</b> of {n} players have submitted their decisions.</p>
      <div className="meter" role="progressbar" aria-valuenow={v.submittedCount} aria-valuemin={0} aria-valuemax={n} aria-label="Players submitted"><i style={{ width: n ? `${(v.submittedCount / n) * 100}%` : '0%' }} /></div>
      <div className="two-col">
        <div><h3>Waiting ({waiting.length})</h3>{waiting.length === 0 ? <p className="muted-dark">Everyone has submitted.</p> : <ul className="chips">{waiting.map((p) => <li key={p.id}>{p.name}</li>)}</ul>}</div>
        <div><h3>Submitted ({done.length})</h3>{done.length === 0 ? <p className="muted-dark">No one yet.</p> : <ul className="chips chips-done">{done.map((p) => <li key={p.id}>{p.name}</li>)}</ul>}</div>
      </div>
      <h2 className="sec">This week&rsquo;s news</h2>
      <div className="news-grid">{thisWeek.map((e) => <Article key={e.id} e={e} />)}</div>
    </section>
  );
}

function Locked({ v }: { v: HostView }) {
  const [secs, setSecs] = useState(0);
  const [run, setRun] = useState(true);
  useEffect(() => { if (!v.room.discussion || !run) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [v.room.discussion, run]);
  const thisWeek = v.events.filter((e) => e.week === v.room.week);
  return (
    <section>
      <h1 className="h-big">Trading is locked</h1>
      <p className="lead">{v.submittedCount} of {v.room.playerCount} players had submitted. This week&rsquo;s market reaction has not been revealed yet.</p>
      {v.room.discussion && (
        <div className="panel discuss">
          <div className="toolbar"><h2>Discussion</h2><span className="timer num" aria-label="Discussion time">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
            <button className="btn btn-ghost-dark btn-sm" onClick={() => setRun(!run)}>{run ? 'Pause' : 'Resume'}</button><button className="btn btn-ghost-dark btn-sm" onClick={() => setSecs(0)}>Reset</button></div>
          <ul className="bullets">
            <li>Pick one story. Which details are good news, and which are worries?</li>
            <li>What might investors already have expected before this story?</li>
            <li>Which companies could be affected differently by the same story, and why?</li>
          </ul>
        </div>
      )}
      <div className="news-grid">{thisWeek.map((e) => <Article key={e.id} e={e} showBody={false} />)}</div>
    </section>
  );
}

function Reveal({ v }: { v: HostView }) {
  const rows = [...v.assets].sort((a, b) => b.changePct - a.changePct);
  const thisWeek = v.events.filter((e) => e.week === v.room.week);
  return (
    <section>
      <h1 className="h-big">Week {v.room.week}: how the market reacted</h1>
      <div className="scroll"><table className="tbl tbl-big reveal-table">
        <thead><tr><th>Company</th><th className="num">Price</th><th className="num">Move</th><th>Main drivers</th></tr></thead>
        <tbody>{rows.map((a, i) => (
          <tr key={a.ticker} style={{ animationDelay: `${i * 140}ms` }}>
            <td><b>{a.ticker}</b> {a.name}<div className="sub">{a.industry}</div></td>
            <td className="num">{money(a.prevPriceCents)} &rarr; {money(a.priceCents)}</td>
            <td className="num"><Change value={a.changePct}>{pct(a.changePct)}</Change></td>
            <td className="sub">{a.drivers.slice(0, 3).map((d) => `${d.label} (${pct(d.pct)})`).join(', ') || 'Mostly random noise'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <h2 className="sec">What each story did</h2>
      <div className="news-grid">
        {thisWeek.map((e) => (
          <article key={e.id} className="news-card">
            <p className="meta"><span className="tag">{typeLabel(e.type)}</span> {e.time}</p>
            <h3>{e.headline}</h3>
            <p className="figs">{e.reaction?.slice(0, 4).map((r) => <span key={r.ticker}>{r.ticker}: <Change value={r.eventPct}>{pct(r.eventPct)}</Change></span>)}</p>
          </article>
        ))}
      </div>
      <p className="fine">Each company&rsquo;s total move also includes other news, investor expectations, and a small random element. Ask: did the market react the way the headline suggested?</p>
    </section>
  );
}

/** While students answer: only how many have finished. Questions and answers stay hidden until "End quiz". */
function QuizMonitor({ v }: { v: HostView }) {
  const q = v.quizStats;
  if (!q) return null;
  const finished = new Set(q.finishedIds);
  const still = v.players.filter((p) => !finished.has(p.id)), done = v.players.filter((p) => finished.has(p.id));
  return (
    <section>
      <h1 className="h-big">Week {q.week} quiz: {q.topic}</h1>
      <p className="lead"><b>{q.finished}</b> of {q.playerCount} students have finished the quiz.</p>
      <div className="meter" role="progressbar" aria-valuenow={q.finished} aria-valuemin={0} aria-valuemax={q.playerCount} aria-label="Students who finished the quiz"><i style={{ width: q.playerCount ? `${(q.finished / q.playerCount) * 100}%` : '0%' }} /></div>
      <div className="two-col">
        <div><h3>Still answering ({still.length})</h3>{still.length === 0 ? <p className="muted-dark">Everyone has finished.</p> : <ul className="chips">{still.map((p) => <li key={p.id}>{p.name}</li>)}</ul>}</div>
        <div><h3>Finished ({done.length})</h3>{done.length === 0 ? <p className="muted-dark">No one yet.</p> : <ul className="chips chips-done">{done.map((p) => <li key={p.id}>{p.name}</li>)}</ul>}</div>
      </div>
      <p className="fine">The questions and answers are hidden for now. Click <b>End quiz</b> when you are ready: students can no longer answer, and you will see the questions, the answers, and what the class chose.</p>
    </section>
  );
}

/** After "End quiz": the questions, the correct answers, and how the class answered. */
function QuizReview({ v }: { v: HostView }) {
  const q = v.quizStats;
  if (!q) return null;
  return (
    <section>
      <h1 className="h-big">Week {q.week} quiz: questions and answers</h1>
      <p className="lead">The quiz has ended. <b>{q.finished}</b> of {q.playerCount} students finished all {q.questions.length} questions.</p>
      <ClassResults q={q} />
    </section>
  );
}

function ClassResults({ q }: { q: NonNullable<HostView['quizStats']> }) {
  return (
    <div className="qstats">
      {q.questions.map((c, i) => {
        const max = Math.max(1, ...c.options.map((o) => o.count));
        return (
          <article key={c.id} className="panel">
            <h3>Question {i + 1}: {c.question}</h3>
            <ul className="optbars">{c.options.map((o, k) => (
              <li key={k} className={o.correct ? 'right' : ''}><span className="letter">{'ABCD'[k]}</span><span className="optt">{o.text}{o.correct ? ' (correct)' : ''}</span>
                <span className="qbar"><i style={{ width: `${(o.count / max) * 100}%` }} /><b>{o.count}</b></span></li>
            ))}</ul>
            <p>{c.answered} answered{c.correctPct !== null ? `, ${c.correctPct}% correct` : ''}.{c.commonMistake ? <> Most common mistake ({c.commonMistake.count}): <i>&ldquo;{c.commonMistake.text}&rdquo;</i></> : null}</p>
            <p className="fine"><b>Explanation:</b> {c.explanation}</p>
          </article>
        );
      })}
    </div>
  );
}

function Results({ v }: { v: HostView }) {
  const top = v.players[0];
  return (
    <section>
      <div className="results-head">
        <h1 className="h-big">Leaderboard after Week {v.room.week}</h1>
        {top && <p className="lead">Highest portfolio value: <b>{money(top.netCents)}</b> ({top.name}). Ranked by portfolio value only.</p>}
      </div>
      <Leaderboard key={v.room.week} rows={v.players} />
      {v.quizStats && <details className="panel"><summary>Class quiz results for Week {v.room.week}</summary><ClassResults q={v.quizStats} /></details>}
    </section>
  );
}

function Leaderboard({ rows }: { rows: HostView['players'] }) {
  const reduce = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const [settled, setSettled] = useState(reduce);
  useEffect(() => { if (!settled) { const t = setTimeout(() => setSettled(true), 1400); return () => clearTimeout(t); } }, [settled]);
  const prevOf = (r: { rank: number; moved: number | null }) => r.rank + (r.moved ?? 0);
  const shown = rows.filter((r) => r.rank <= 5 || prevOf(r) <= 5);
  if (rows.length === 0) return <p className="muted-dark">No players yet.</p>;
  return (
    <div>
      <div className="board-head" aria-hidden="true"><span>Rank</span><span>Player</span><span>Move</span><span>Week</span><span>Return</span><span className="r">Portfolio</span></div>
      <ol className="board" aria-label="Top five players" style={{ ['--n' as string]: Math.min(5, rows.length) }}>
        {shown.map((r) => {
          const order = settled ? r.rank : prevOf(r);
          const visible = order <= 5;
          return (
            <li key={r.id} className={`brow ${visible ? '' : 'brow-off'}`} style={{ transform: `translateY(calc(${order - 1} * var(--row-h)))` }} aria-hidden={!visible}>
              <span className="brow-rank">{r.rank}</span><span className="brow-name">{r.name}</span><Move moved={r.moved} />
              <span className="brow-wk"><Change value={r.weekChangeCents}>{pct(r.weekChangePct)}</Change></span>
              <span className="brow-ret"><Change value={r.returnCents}>{signed(r.returnCents)} ({pct(r.returnPct)})</Change></span>
              <span className="brow-net num">{money(r.netCents)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
