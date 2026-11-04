import { useEffect, useState } from 'react';
import { ApiError, api, playerSession, useLive, watchlist, type LbRow, type PlayerView, type QuizView } from './api';
import { go } from './Entry';
import FinalResults from './Final';
import { Article, Companies, CompanyPage, News, Portfolio } from './Screens';
import Tutorial from './Tutorial';
import { Banner, Brand, Change, Disclaimer, PriceChart, Spinner, Term, money, moneyWhole, ordinal, pct, signed, useAnimatedNumber } from './ui';

type Kind = 'portfolio' | 'companies' | 'news' | 'board' | 'quiz' | 'reflection' | 'reveal';
type Screen = { k: Kind } | { k: 'company' | 'article'; id: string };

export default function PlayerApp() {
  const sess = playerSession.get();
  useEffect(() => { if (!sess) go('/join'); }, [sess]);
  if (!sess) return null;
  return <Player code={sess.code} token={sess.token} name={sess.name} />;
}

function Player({ code, token, name }: { code: string; token: string; name: string }) {
  const { data, error, offline, reload } = useLive<PlayerView>('player', code, token);
  if (error) {
    return (
      <main className="narrow">
        <Brand />
        <Banner kind="error">{error.message}</Banner>
        <button className="btn btn-primary" onClick={() => { playerSession.set(null); go('/join'); }}>Join a game</button>
      </main>
    );
  }
  if (!data) return <Spinner label="Joining your game" />;
  return <PlayerScreen data={data} offline={offline} reload={reload} code={code} token={token} name={name} />;
}

const PHASE_TEXT: Record<string, string> = {
  lobby: 'Waiting to start', tutorial: 'Introduction', intro: 'Getting ready', trading: 'Trading open', locked: 'Trading closed',
  reveal: 'Results are in', quiz: 'Quiz time', quizreview: 'Quiz ended', results: 'Week complete', final: 'Final results',
};
const STEPS = ['Read the news', 'Explore companies', 'Make decisions', 'Finish trading', 'Review the results', 'Quiz and reflection'];

/** What this student has done this week (kept in this browser only; it just drives the "next step" hints). */
function useJourney(code: string, week: number) {
  const key = `mm.journey.${code}`;
  type W = { read: string[]; seen: string[] };
  const [all, setAll] = useState<Record<string, W>>(() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } });
  const cur = all[week] ?? { read: [], seen: [] };
  const mark = (kind: 'read' | 'seen', id: string) => setAll((prev) => {
    const w = prev[week] ?? { read: [], seen: [] };
    if (w[kind].includes(id)) return prev;
    const next = { ...prev, [week]: { ...w, [kind]: [...w[kind], id] } };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  return { read: new Set(cur.read), seen: new Set(cur.seen), everRead: new Set(Object.values(all).flatMap((w) => w.read)), mark };
}

/** Which of the six steps is current, and which are finished. */
function progress(view: PlayerView, read: number, seen: number): { current: number; done: boolean[] } {
  const { room, me, trades } = view;
  const done = [false, false, false, false, false, false];
  const decided = trades.some((t) => t.week === room.week);
  switch (room.phase) {
    case 'intro': return { current: 1, done };
    case 'trading':
      if (me.submitted) { done.fill(true, 0, 4); return { current: 5, done }; }
      done[0] = read > 0; done[1] = seen > 0; done[2] = decided;
      return { current: done[0] ? (done[1] ? (done[2] ? 4 : 3) : 2) : 1, done };
    case 'locked': case 'reveal': done.fill(true, 0, 4); return { current: 5, done };
    case 'quiz': case 'quizreview': case 'results': done.fill(true, 0, 5); return { current: 6, done };
    default: return { current: 1, done };
  }
}

export function PlayerScreen({ data, offline, reload, code, token, name }: { data: PlayerView; offline: boolean; reload: () => void; code: string; token: string; name: string }) {
  const { room, me, assets } = data;
  const phase = room.phase;
  const [screen, setScreen] = useState<Screen>({ k: 'portfolio' });
  const [tutorialDone, setTutorialDone] = useState(false);
  const [help, setHelp] = useState(false);
  const [watch, setWatch] = useState<string[]>(() => watchlist.get());
  const journey = useJourney(code, room.week);
  const stage = `${phase}:${room.week}`;

  // Take students to the right place when the teacher moves the game on.
  useEffect(() => {
    const to: Partial<Record<string, Kind>> = { trading: 'news', reveal: 'reveal', quiz: 'quiz', results: 'reflection' };
    const k = to[phase];
    // Only move students when there is a new screen for them to see. Locking trading keeps them where they are (they just see why trading is closed).
    if (k) setScreen({ k }); else if (phase === 'intro') setScreen({ k: 'portfolio' });
    if (k || phase === 'intro') window.scrollTo?.(0, 0);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (screen.k === 'article') journey.mark('read', screen.id); if (screen.k === 'company') journey.mark('seen', screen.id); }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!help) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [help]);

  const asset = (t: string) => assets.find((a) => a.ticker === t)!;
  const published = data.events.filter((e) => e.week === room.week && phase !== 'intro');
  const moveLabel = ['reveal', 'quiz', 'results'].includes(phase) ? 'this week' : 'last week';
  const answered = data.quiz ? data.quiz.questions.filter((q) => q.answered).length : 0;
  const submit = async (value: boolean) => { await api('POST', `/api/rooms/${code}/player/submit`, { value }, token); reload(); };
  const open = (k: Kind) => setScreen({ k });
  const prog = progress(data, journey.read.size, journey.seen.size);

  if (phase === 'final' && data.final) {
    return (
      <div className="app">
        <TopBar room={room} name={name} onHelp={() => setHelp(true)} />
        <main className="screen"><FinalResults final={data.final} /></main>
        {help && <HelpModal onClose={() => setHelp(false)} />}
      </div>
    );
  }

  const tab: Kind = screen.k === 'company' ? 'companies' : screen.k === 'article' ? 'news' : screen.k;
  const tabs: [Kind, string][] = [['portfolio', 'My Portfolio'], ['companies', 'Companies'], ['news', `News${published.length ? ` (${published.length})` : ''}`], ['board', 'Leaderboard']];

  return (
    <div className="app">
      <TopBar room={room} name={name} onHelp={() => setHelp(true)} />
      {offline && <Banner kind="warn">Connection lost. Your game is saved, and we are trying to reconnect.</Banner>}

      {phase !== 'lobby' && phase !== 'tutorial' && (
        <div className="top-bento">
          <Summary view={data} />
          <div className="top-right">
            <Stepper current={prog.current} done={prog.done} week={room.week} />
            <ActionCard view={data} read={journey.read.size} seen={journey.seen.size} answered={answered} onOpen={open} onSubmit={submit} />
          </div>
        </div>
      )}

      {phase !== 'lobby' && phase !== 'tutorial' && (
        <nav className="tabs" aria-label="Sections">
          {tabs.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => open(k)}>{label}</button>)}
        </nav>
      )}

      <main className="screen">
        {phase === 'lobby' && <section className="tile"><h2>You are in, {name}.</h2><p>{room.playerCount} {room.playerCount === 1 ? 'player has' : 'players have'} joined. Your teacher will start the game soon.</p><button className="btn btn-ghost" onClick={() => setHelp(true)}>See how the game works</button><Disclaimer /></section>}
        {phase === 'tutorial' && (tutorialDone
          ? <section className="tile"><h2>Ready for Week 1</h2><p>Waiting for your teacher to begin.</p><button className="link" onClick={() => setTutorialDone(false)}>Read the introduction again</button></section>
          : <Tutorial onDone={() => setTutorialDone(true)} />)}

        {phase !== 'lobby' && phase !== 'tutorial' && (
          <>
            {screen.k === 'portfolio' && <Portfolio view={data} onOpen={(t) => setScreen({ k: 'company', id: t })} onBrowse={() => open('companies')} />}
            {screen.k === 'companies' && <Companies assets={assets} watch={watch} onWatch={(t) => setWatch(watchlist.toggle(t))} onOpen={(t) => setScreen({ k: 'company', id: t })} moveLabel={moveLabel} />}
            {screen.k === 'company' && <CompanyPage a={asset(screen.id)} view={data} code={code} token={token} reload={reload} onBack={() => open('companies')} onArticle={(id) => setScreen({ k: 'article', id })} watched={watch.includes(screen.id)} onWatch={() => setWatch(watchlist.toggle(screen.id))} onReopen={() => submit(false)} moveLabel={moveLabel} />}
            {screen.k === 'news' && <News events={data.events} assets={assets} week={room.week} phase={phase} read={journey.everRead} onOpen={(id) => setScreen({ k: 'article', id })} />}
            {screen.k === 'article' && <Article ev={data.events.find((e) => e.id === screen.id)} assets={assets} onBack={() => open('news')} onCompany={(t) => setScreen({ k: 'company', id: t })} />}
            {screen.k === 'board' && <Board rows={data.leaderboard} me={me.id} meRank={me.rank} />}
            {screen.k === 'reveal' && <Reveal view={data} onOpen={(t) => setScreen({ k: 'company', id: t })} />}
            {screen.k === 'quiz' && <QuizScreen quiz={data.quiz} code={code} token={token} reload={reload} onDone={() => open('portfolio')} phase={phase} />}
            {screen.k === 'reflection' && <ReflectionScreen view={data} />}
          </>
        )}
      </main>
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="How Market Masters works">
      <button className="modal-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="modal-card"><Tutorial replay onDone={onClose} /></div>
    </div>
  );
}

function TopBar({ room, name, onHelp }: { room: PlayerView['room']; name: string; onHelp: () => void }) {
  return (
    <header className="topbar">
      <Brand small />
      <span className="status-pill"><span className={`dot dot-${room.phase}`} aria-hidden="true" />{room.week > 0 ? `Week ${room.week} of ${room.totalWeeks}` : 'Game ' + room.code}<span className="sep">&middot;</span>{PHASE_TEXT[room.phase]}</span>
      <span className="top-right-bits"><button className="btn btn-ghost btn-sm" onClick={onHelp}>How it works</button><span className="who">{name}</span></span>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary: the one place that answers "how am I doing?"              */
/* ------------------------------------------------------------------ */

function Summary({ view }: { view: PlayerView }) {
  const { me, room } = view;
  const total = useAnimatedNumber(me.netCents);
  const played = view.series.length > 1;
  return (
    <section className="tile summary" aria-label="Your portfolio">
      <p className="label"><Term label="total portfolio value" tip="Total portfolio value = available cash + the current value of your investments. It is the number the leaderboard uses.">Total portfolio value</Term></p>
      <p className="sum-big num">{money(Math.round(total))}</p>
      <p className="sum-gain"><Change value={me.returnCents}>{signed(me.returnCents)} ({pct(me.returnPct)})</Change> <span className="muted">since you started with $1,000</span></p>
      <dl className="formula" aria-label="How your total is made up">
        <div><dt>Available cash</dt><dd className="num">{money(me.cashCents)}</dd></div>
        <div><dt><span className="f-op" aria-hidden="true">+</span> Invested in shares</dt><dd className="num">{money(me.investedCents)}</dd></div>
        <div className="f-total"><dt><span className="f-op" aria-hidden="true">=</span> Total portfolio value</dt><dd className="num">{money(me.netCents)}</dd></div>
      </dl>
      <dl className="sum-grid">
        <div><dt>This week</dt><dd>{played ? <Change value={me.weekChangeCents}>{signed(me.weekChangeCents)} ({pct(me.weekChangePct)})</Change> : <span className="muted">No results yet</span>}</dd></div>
        <div><dt>Your rank</dt><dd className="num">{ordinal(me.rank)} of {room.playerCount}</dd></div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly progress and the next step                                  */
/* ------------------------------------------------------------------ */

function Stepper({ current, done, week }: { current: number; done: boolean[]; week: number }) {
  return (
    <section className="tile stepper" aria-label={`Week ${week} progress`}>
      <ol>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const st = done[i] ? 'done' : n === current ? 'now' : 'todo';
          return (
            <li key={s} className={`step ${st}`} aria-current={n === current ? 'step' : undefined}>
              <span className="dotn" aria-hidden="true">{done[i] ? '\u2713' : n}</span>
              <span className="lbl">{s}<span className="sr-only">{done[i] ? ' (done)' : n === current ? ' (current step)' : ''}</span></span>
            </li>
          );
        })}
      </ol>
      <p className="step-now">Step {current} of 6: <b>{STEPS[current - 1]}</b></p>
    </section>
  );
}

function ActionCard({ view, read, seen, answered, onOpen, onSubmit }: { view: PlayerView; read: number; seen: number; answered: number; onOpen: (k: Kind) => void; onSubmit: (v: boolean) => void }) {
  const { room, me, trades } = view;
  const decided = trades.some((t) => t.week === room.week);
  const total = view.quiz?.questions.length ?? 3;
  let kicker = 'Your next step', title = '', body = '', primary: [string, () => void] | null = null, secondary: [string, () => void] | null = null, note = '';
  const finish: [string, () => void] = ['Finish trading for this week', () => onSubmit(true)];
  switch (room.phase) {
    case 'intro':
      title = 'Your teacher is getting this week\u2019s news ready'; body = 'While you wait, look through the companies or review your portfolio.'; primary = ['Explore companies', () => onOpen('companies')]; break;
    case 'trading':
      if (me.submitted) { kicker = 'All done'; title = 'You have finished trading'; body = 'Your choices are locked in. Waiting for your teacher to close trading and reveal the results.'; secondary = ['Change my decisions', () => onSubmit(false)]; break; }
      if (!read) { title = 'Start with the news'; body = 'Read this week\u2019s stories. They help you decide what to do.'; primary = ['Read the news', () => onOpen('news')]; secondary = finish; }
      else if (!seen) { title = 'Look at the companies'; body = 'Open a company to see its price chart and learn about it.'; primary = ['Explore companies', () => onOpen('companies')]; secondary = finish; }
      else if (!decided) { title = 'Decide: buy, sell, or hold'; body = 'Open a company and tap Buy or Sell. Doing nothing is a fine choice too.'; primary = ['Choose a company', () => onOpen('companies')]; secondary = finish; }
      else { title = 'Ready to wrap up?'; body = 'Happy with your choices? Finish trading so your teacher knows you are done.'; primary = finish; secondary = ['Make another trade', () => onOpen('companies')]; }
      note = 'Finishing trading does not place an order. Your buys and sells already happened. It just tells your teacher you are done, and you can change your mind until trading closes.';
      break;
    case 'locked':
      kicker = 'Trading is closed'; title = 'Waiting for the results'; body = room.discussion ? 'Your teacher is leading a discussion. What did each news story really mean for the companies?' : 'Your teacher will reveal how the market reacted in a moment.'; break;
    case 'reveal':
      kicker = 'Results are in'; title = 'See how the market reacted'; body = 'Find out how each company moved, and why.'; primary = ['Review the results', () => onOpen('reveal')]; break;
    case 'quiz':
      title = answered >= total ? 'Quiz finished' : 'Take the weekly quiz'; body = `${answered} of ${total} questions answered. Each question gets one try, and you will see an explanation.`; primary = [answered >= total ? 'Review the quiz' : answered ? 'Continue the quiz' : 'Start the quiz', () => onOpen('quiz')]; break;
    case 'quizreview':
      kicker = 'Quiz ended'; title = 'The quiz is over'; body = 'Your teacher is going over the questions and answers with the class.'; primary = ['See my answers', () => onOpen('quiz')]; break;
    case 'results':
      kicker = 'Week complete'; title = 'Reflect on your week'; body = 'See what affected your investments and what to think about next. The next week starts when your teacher is ready.'; primary = ['Open my reflection', () => onOpen('reflection')]; secondary = ['See the leaderboard', () => onOpen('board')]; break;
    default: return null;
  }
  return (
    <section className="tile tile-accent action" aria-live="polite">
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="row-actions">
        {primary && <button className="btn btn-dark" onClick={primary[1]}>{primary[0]}</button>}
        {secondary && <button className="btn btn-ghost-ink" onClick={secondary[1]}>{secondary[0]}</button>}
      </div>
      {note && <p className="fine on-accent">{note}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Results, quiz, reflection, leaderboard                             */
/* ------------------------------------------------------------------ */

function Reveal({ view, onOpen }: { view: PlayerView; onOpen: (t: string) => void }) {
  const sorted = [...view.assets].sort((a, b) => b.changePct - a.changePct);
  return (
    <section className="tile">
      <h2>Week {view.room.week} results</h2>
      <p>Your portfolio changed by <Change value={view.me.weekChangeCents}>{signed(view.me.weekChangeCents)} ({pct(view.me.weekChangePct)})</Change> this week.</p>
      <p className="explain">Here is how every company moved, and what pushed its price. Tap a company to see more.</p>
      <div className="scroll"><table className="tbl tbl-click">
        <thead><tr><th>Company</th><th className="num">Price</th><th className="num">Move</th><th className="hide-sm">Main reasons</th><th className="num">You own</th></tr></thead>
        <tbody>{sorted.map((a) => (
          <tr key={a.ticker}>
            <td><button className="link-btn" onClick={() => onOpen(a.ticker)}><b>{a.name}</b></button></td>
            <td className="num">{money(a.priceCents)}</td><td className="num"><Change value={a.changePct}>{pct(a.changePct)}</Change></td>
            <td className="hide-sm sub">{a.drivers.slice(0, 2).map((d) => `${d.label} (${pct(d.pct)})`).join(', ') || 'Mostly random ups and downs'}</td>
            <td className="num">{a.shares ? <>{a.shares} <Change value={a.weekChangeCents}>{signed(a.weekChangeCents)}</Change></> : '\u2013'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function QuizScreen({ quiz, code, token, reload, onDone, phase }: { quiz: QuizView | null; code: string; token: string; reload: () => void; onDone: () => void; phase: string }) {
  const qs = quiz?.questions ?? [];
  const firstOpen = qs.findIndex((q) => !q.answered);
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!quiz) return <section className="tile"><h2>Quiz</h2><p className="muted">{phase === 'results' || phase === 'quiz' ? 'There is no quiz this week.' : 'The quiz opens after the market results.'}</p></section>;
  const q = qs[i];
  const done = qs.filter((x) => x.answered).length;
  const closed = phase !== 'quiz';
  async function submit() {
    if (pick === null || busy) return;
    setBusy(true); setErr('');
    try { await api('POST', `/api/rooms/${code}/player/quiz`, { qid: q.id, pos: pick }, token); setPick(null); reload(); }
    catch (e) { setErr((e as ApiError).message); reload(); } finally { setBusy(false); }
  }
  if ((done === qs.length || closed) && i >= qs.length) {
    return <section className="tile"><h2>Quiz complete</h2><p>You answered {qs.filter((x) => x.answered?.correct).length} of {qs.length} correctly. Quiz scores are separate from your portfolio.</p><button className="btn btn-primary" onClick={onDone}>Back to my portfolio</button></section>;
  }
  return (
    <section className="tile quiz" aria-label="Weekly quiz">
      <p className="meta">Week {quiz.week} quiz &middot; {quiz.topic}</p>
      <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={done} aria-label="Quiz progress"><i style={{ width: `${(done / qs.length) * 100}%` }} /></div>
      <h2>Question {i + 1} of {qs.length}</h2>
      <p className="q">{q.question}</p>
      <ul className="choices">
        {q.choices.map((c) => {
          const a = q.answered;
          const state = a ? (c.pos === a.correctPos ? 'right' : c.pos === a.pos ? 'wrong' : '') : pick === c.pos ? 'picked' : '';
          return (
            <li key={c.pos}><button className={`choice ${state}`} disabled={!!a || busy || closed} aria-pressed={pick === c.pos} onClick={() => setPick(c.pos)}>
              <span className="letter">{'ABCD'[c.pos]}</span><span>{c.text}</span>
              {a && c.pos === a.correctPos && <span className="mark">Correct answer</span>}{a && c.pos === a.pos && c.pos !== a.correctPos && <span className="mark">Your answer</span>}
            </button></li>
          );
        })}
      </ul>
      {err && <Banner kind="error">{err}</Banner>}
      {q.answered ? (
        <div className="explain-box" aria-live="polite">
          <b>{q.answered.correct ? 'Correct.' : 'Not quite.'}</b> {q.answered.explanation}
          <div className="row-actions"><button className="btn btn-primary" onClick={() => { const next = qs.findIndex((x, k) => k > i && !x.answered); if (next !== -1) setI(next); else if (i < qs.length - 1) setI(i + 1); else setI(qs.length); }}>{i < qs.length - 1 ? 'Next question' : 'Finish quiz'}</button></div>
        </div>
      ) : closed ? (
        <div className="explain-box"><b>The quiz has ended.</b> This question can no longer be answered.
          {i < qs.length - 1 && <div className="row-actions"><button className="btn btn-ghost" onClick={() => setI(i + 1)}>Next question</button></div>}</div>
      ) : <button className="btn btn-primary btn-lg" disabled={pick === null || busy} onClick={submit}>{busy ? 'Checking...' : 'Submit answer'}</button>}
    </section>
  );
}

function ReflectionScreen({ view }: { view: PlayerView }) {
  const r = view.reflection;
  if (!r) return <section className="tile"><h2>Weekly reflection</h2><p className="muted">Your reflection appears at the end of each week.</p></section>;
  const p = r.portfolio;
  const moved = p.prevRank ? p.prevRank - p.rank : null;
  return (
    <div className="bento">
      <section className="tile c12">
        <h2>Week {r.week} reflection</h2>
        <p>Your portfolio changed by <Change value={p.weekChangeCents}>{signed(p.weekChangeCents)} ({pct(p.weekChangePct)})</Change> and is now worth {money(p.netCents)}. You are ranked {ordinal(p.rank)}{moved ? (moved > 0 ? `, up ${moved}.` : `, down ${-moved}.`) : '.'}</p>
      </section>
      <section className="tile c6">
        <h3>What affected your investments</h3>
        {r.holdings.length === 0 ? <p className="muted">You held only cash, so no company news changed your portfolio. Cash can be a smart choice, but ask yourself whether you had a reason.</p> : (
          <ul className="reflect">{r.holdings.map((h) => (
            <li key={h.ticker}><b>{h.name}</b> ({h.shares} share{h.shares === 1 ? '' : 's'}): <Change value={h.changeCents}>{signed(h.changeCents)} ({pct(h.changePct)})</Change>
              {h.events.length ? <ul>{h.events.map((e) => <li key={e.id}>{e.headline} <span className="muted">({pct(e.pct)} effect)</span></li>)}</ul> : <p className="muted">No major story about this company. Its move came mostly from the wider market and random ups and downs.</p>}</li>
          ))}</ul>
        )}
      </section>
      <section className="tile c6">
        <h3>Your decisions this week</h3>
        {r.trades.length === 0 ? <p className="muted">You made no trades. Holding is a good decision when you chose it on purpose.</p> : (
          <ul className="reflect">{r.trades.map((t, i) => { const a = view.assets.find((x) => x.ticker === t.ticker); return <li key={i}>You {t.side === 'buy' ? 'bought' : 'sold'} {t.qty} share{t.qty === 1 ? '' : 's'} of {a?.name ?? t.ticker} at {money(t.priceCents)}. It then moved <Change value={t.afterPct}>{pct(t.afterPct)}</Change>.</li>; })}</ul>
        )}
        <p className="fine">One week is a small sample. A good decision can have a bad result, and a poor one can get lucky.</p>
      </section>
      <section className="tile c6">
        <h3>What this week&rsquo;s quiz was about</h3>
        <p><b>{r.topic}.</b> {r.concept}</p>
        {r.quiz && <><p>You answered {r.quiz.correct} of {r.quiz.total} correctly{r.quiz.skipped ? ` and skipped ${r.quiz.skipped}` : ''}.</p>
          {r.quiz.missed.length > 0 && <><h4>Worth another look</h4><ul className="reflect">{r.quiz.missed.map((m) => <li key={m.question}><b>{m.question}</b><br />{m.explanation}</li>)}</ul></>}</>}
      </section>
      <section className="tile c6">
        <h3>Before next week, think about</h3>
        <ul className="bullets">{r.consider.map((c) => <li key={c}>{c}</li>)}</ul>
        {view.series.length > 1 && <><h4>Your portfolio so far</h4><PriceChart label="Your portfolio value by week" formatY={moneyWhole} yLabel="Portfolio" baseline={100000} baselineLabel="Starting value $1,000" points={view.series.map((s) => ({ x: s.week, y: s.netCents }))} height={180} /></>}
      </section>
    </div>
  );
}

export function Board({ rows, me, meRank }: { rows: LbRow[]; me: number; meRank: number }) {
  return (
    <section className="tile">
      <h2>Leaderboard</h2>
      <p className="explain">Ranked by total portfolio value (cash plus the value of your shares). Quiz scores are not included.</p>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Rank</th><th>Player</th><th className="num">Portfolio</th><th className="num">Since start</th><th className="num">This week</th><th>Move</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className={r.id === me ? 'me' : ''}><td>{r.rank}</td><td>{r.name}{r.id === me ? ' (you)' : ''}</td><td className="num">{money(r.netCents)}</td>
            <td className="num"><Change value={r.returnCents}>{pct(r.returnPct)}</Change></td><td className="num"><Change value={r.weekChangeCents}>{pct(r.weekChangePct)}</Change></td><td><Move moved={r.moved} /></td></tr>
        ))}</tbody>
      </table></div>
      {!rows.some((r) => r.id === me) && <p>You are ranked {ordinal(meRank)}.</p>}
    </section>
  );
}

export function Move({ moved }: { moved: number | null }) {
  if (!moved) return <span className="move move-none" aria-label="No change in rank">&ndash;</span>;
  return <span className={`move ${moved > 0 ? 'move-up' : 'move-down'}`} aria-label={`${moved > 0 ? 'Up' : 'Down'} ${Math.abs(moved)} places`}>{moved > 0 ? '\u25B2' : '\u25BC'} {Math.abs(moved)}</span>;
}
