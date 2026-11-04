import { useEffect, useState } from 'react';
import { ApiError, api, hostSession, playerSession } from './api';
import { Banner, Brand, Disclaimer } from './ui';

export const go = (path: string) => window.location.assign(path);

export function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <Brand />
        <h1>The $1,000 Investing Challenge</h1>
        <p className="lead">Eight weeks of company news, real decisions, and live results. Read the news, weigh the evidence, and build the strongest portfolio in your class.</p>
        <div className="row-actions">
          <button className="btn btn-primary btn-lg" onClick={() => go('/join')}>Join a game</button>
          <button className="btn btn-ghost btn-lg" onClick={() => go('/host')}>Host a game</button>
        </div>
        <ol className="how">
          <li><b>Start with $1,000.</b> Everyone gets the same virtual cash.</li>
          <li><b>Read the news.</b> Each week brings company, industry, and economy stories. Not every good headline is good for the share price.</li>
          <li><b>Buy, sell, or hold.</b> Choose from ten fictional companies and one diversified fund.</li>
          <li><b>See what the market thinks.</b> Prices react to the news, the same for the whole class, then a short quiz tests what you learned.</li>
        </ol>
        <Disclaimer />
      </div>
    </main>
  );
}

export function JoinPage() {
  const params = new URLSearchParams(window.location.search);
  const [pin, setPin] = useState((params.get('pin') || '').replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = playerSession.get();
  useEffect(() => { document.title = 'Join | Market Masters'; }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!/^\d{6}$/.test(pin)) return setErr('The game PIN is 6 digits.');
    setBusy(true);
    try {
      const existing = saved && saved.code === pin ? saved.token : undefined; // same phone, same game: reuse the player
      const r = await api<{ token: string; name: string }>('POST', `/api/rooms/${pin}/join`, { name, token: existing });
      playerSession.set({ code: pin, token: r.token, name: r.name });
      go('/play');
    } catch (e2) { setErr((e2 as ApiError).message); setBusy(false); }
  }

  return (
    <main className="narrow">
      <Brand />
      <h1 className="h-join">Join a game</h1>
      <p className="muted">Scan the QR code on your teacher&rsquo;s screen with your phone camera, or type the PIN below.</p>
      {saved && <Banner>You are already in game {saved.code} as {saved.name}. <button className="link" onClick={() => go('/play')}>Go back to it</button></Banner>}
      <form onSubmit={submit} className="form" noValidate>
        <label htmlFor="pin">Game PIN</label>
        <input id="pin" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={6} placeholder="6 digits" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="input input-pin" />
        <label htmlFor="name">Display name</label>
        <input id="name" autoComplete="off" maxLength={16} placeholder="Shown on the leaderboard" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <p className="fine">No account needed. Use a nickname, not your full name or any personal information.</p>
        {err && <Banner kind="error">{err}</Banner>}
        <button className="btn btn-primary btn-lg" disabled={busy || !pin || !name}>{busy ? 'Joining...' : 'Join game'}</button>
      </form>
      <section className="about">
        <h2>The challenge</h2>
        <p>Over eight simulated weeks you will manage $1,000 in virtual cash. Each week you read the news, decide what to buy or sell, and watch how the market reacts. A short quiz follows each round. The highest portfolio value wins.</p>
      </section>
      <button className="link" onClick={() => go('/')}>Back to start</button>
      <Disclaimer />
    </main>
  );
}

export function CreateGame({ onCreated }: { onCreated: () => void }) {
  const [quiz, setQuiz] = useState(true);
  const [discussion, setDiscussion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function create() {
    setBusy(true); setErr('');
    try {
      const r = await api<{ code: string; hostToken: string }>('POST', '/api/rooms', { quiz, discussion });
      hostSession.set({ code: r.code, token: r.hostToken });
      onCreated();
    } catch (e) { setErr((e as ApiError).message); setBusy(false); }
  }
  return (
    <main className="narrow">
      <Brand />
      <h1 className="h-join">Host a game</h1>
      <p className="lead">You control the pace. Students join on their phones with a PIN or QR code, and you move the game forward one step at a time.</p>
      <label className="check">
        <input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} />
        <span><b>Weekly knowledge quiz</b><br /><span className="muted">Three questions after each market reveal, with explanations and class results for you. Adds about 3 minutes a week. Quiz scores never affect the portfolio ranking.</span></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={discussion} onChange={(e) => setDiscussion(e.target.checked)} />
        <span><b>Discussion period before each reveal</b><br /><span className="muted">After trading locks, students see a discussion prompt and you get a timer. The market is not revealed until you choose.</span></span>
      </label>
      {err && <Banner kind="error">{err}</Banner>}
      <button className="btn btn-primary btn-lg" onClick={create} disabled={busy}>{busy ? 'Creating...' : 'Create game'}</button>
      <button className="link" onClick={() => go('/')}>Back to start</button>
    </main>
  );
}
