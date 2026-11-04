import { useCallback, useEffect, useRef, useState } from 'react';

export type Phase = 'lobby' | 'tutorial' | 'intro' | 'trading' | 'locked' | 'reveal' | 'quiz' | 'quizreview' | 'results' | 'final';

export interface PricePoint { week: number; priceCents: number; volume: number }
export interface CompanyInfo { revenueGrowth: number; grossMargin: number; netMargin: number; debt: string; dividendYield: number; expectations: string; eps: number; pe: number; marketCapM: number }
export interface FundInfo { holdings: number; weighting: string; note: string }
export interface Driver { label: string; pct: number }
export interface Asset {
  ticker: string; name: string; industry: string; kind: 'Stock' | 'ETF'; vol: 'Lower' | 'Medium' | 'Higher'; desc: string;
  priceCents: number; prevPriceCents: number; changePct: number; history: PricePoint[]; info: CompanyInfo | FundInfo; drivers: Driver[];
  shares: number; costCents: number; valueCents: number; weekChangeCents: number;
}
export interface Reaction { ticker: string; eventPct: number; totalPct: number }
export interface NewsEvent {
  id: string; week: number; time: string; type: 'company' | 'industry' | 'macro'; headline: string; body: string;
  figures: [string, string][]; concerns: string[]; scope: string | null; reaction?: Reaction[];
}
export interface LbRow { id: number; name: string; rank: number; moved: number | null; netCents: number; returnCents: number; returnPct: number; weekChangeCents: number; weekChangePct: number }
export interface RoomInfo { code: string; phase: Phase; week: number; totalWeeks: number; joinLocked: boolean; quizEnabled: boolean; discussion: boolean; playerCount: number; topic: string | null }
export interface QuizQuestion {
  id: string; question: string; choices: { pos: number; text: string }[];
  answered: { pos: number; correct: boolean; correctPos: number; explanation: string } | null;
}
export interface QuizView { week: number; topic: string; questions: QuizQuestion[] }
export interface ClassQuestion {
  id: string; question: string; options: { text: string; count: number; correct: boolean }[]; answered: number; playerCount: number;
  correctCount: number; correctPct: number | null; commonMistake: { text: string; count: number } | null; explanation: string;
}
/** `questions` is empty while students are still answering; it fills in once the teacher ends the quiz. */
export interface HostQuiz { week: number; topic: string; questions: ClassQuestion[]; finished: number; finishedIds: number[]; playerCount: number }
export interface Reflection {
  week: number; topic: string;
  portfolio: { weekChangeCents: number; weekChangePct: number; rank: number; prevRank: number | null; netCents: number };
  holdings: { ticker: string; name: string; shares: number; valueCents: number; changeCents: number; changePct: number; events: { id: string; headline: string; pct: number }[] }[];
  trades: { ticker: string; side: 'buy' | 'sell'; qty: number; priceCents: number; afterPct: number }[];
  quiz: { total: number; answered: number; correct: number; skipped: number; missed: { question: string; explanation: string }[] } | null;
  concept: string; consider: string[];
}
export interface Perf { ticker: string; name: string; changePct: number; startCents: number; endCents: number }
export interface Award { key: string; title: string; rule: string; winner: { id: number; name: string; detail: string | null } | null }
export interface FinalRow extends LbRow { cashCents: number; investedCents: number; quizCorrect: number; quizAnswered: number }
export interface Report extends LbRow {
  startCents: number; cashCents: number; investedCents: number; realizedCents: number; playerCount: number;
  holdings: { ticker: string; name: string; shares: number; costCents: number; valueCents: number; plCents: number }[];
  weekly: { week: number; netCents: number; rank: number | null; changeCents: number; changePct: number }[];
  quiz: { week: number; topic: string; answered: number; correct: number; total: number }[];
  quizCorrect: number; quizAnswered: number; trades: number; etfPct: number; lessons: string[]; series: { week: number; netCents: number }[];
}
export interface Final {
  weeksPlayed: number; startCents: number; ranking: FinalRow[]; top3: FinalRow[]; awards: Award[];
  bestInvestment: Perf; worstInvestment: Perf; investments: Perf[]; quizEnabled: boolean;
  quizSummary: { week: number; topic: string; answered: number; correct: number; pct: number | null }[];
  quizBoard: { id: number; name: string; correct: number; answered: number }[]; note: string; mine?: Report;
}
export interface Trade { week: number; ticker: string; side: 'buy' | 'sell'; qty: number; priceCents: number; totalCents: number; at: number }
export interface PlayerView {
  room: RoomInfo;
  me: { id: number; name: string; cashCents: number; investedCents: number; netCents: number; returnCents: number; returnPct: number; rank: number; prevRank: number | null; moved: number | null; weekChangeCents: number; weekChangePct: number; realizedCents: number; quizCorrect: number; quizAnswered: number; submitted: boolean };
  assets: Asset[]; events: NewsEvent[]; leaderboard: LbRow[]; series: { week: number; netCents: number }[]; trades: Trade[];
  quiz: QuizView | null; reflection: Reflection | null; final?: Final;
}
export interface HostView {
  room: RoomInfo; players: (LbRow & { submitted: boolean; quizAnswered: number })[]; leaderboard: LbRow[]; submittedCount: number;
  assets: Asset[]; events: NewsEvent[]; preview: NewsEvent[] | null; quizStats: HostQuiz | null;
  final?: Final; audit?: { seed: string; note: string }; joinUrl: string; secure: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public network = false) { super(message); }
}

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the game server. Check your connection.', true);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Something went wrong.');
  return json as T;
}

/** crypto.randomUUID only exists on HTTPS/localhost; phones on http://192.168.x.x need this fallback. */
export function uid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---- saved sessions (this browser only)
export interface HostSession { code: string; token: string }
export interface PlayerSession { code: string; token: string; name: string }
const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch { /* private mode */ } };
export const hostSession = { get: () => read<HostSession>('mm.host'), set: (v: HostSession | null) => write('mm.host', v) };
export const playerSession = { get: () => read<PlayerSession>('mm.player'), set: (v: PlayerSession | null) => write('mm.player', v) };
export const watchlist = {
  get: (): string[] => read<string[]>('mm.watch') || [],
  toggle: (t: string): string[] => { const w = watchlist.get(); const n = w.includes(t) ? w.filter((x) => x !== t) : [...w, t]; write('mm.watch', n); return n; },
};

const FATAL = new Set(['NOT_IN_GAME', 'BAD_HOST', 'ROOM_EXPIRED', 'ROOM_NOT_FOUND']);

/**
 * Keeps a view fresh. The WebSocket only says "something changed"; we then re-fetch our own authorised view.
 * A slow poll covers any missed message, and the socket reconnects automatically after drops.
 */
export function useLive<T>(role: 'host' | 'player', code: string, token: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const v = await api<T>('GET', `/api/rooms/${code}/${role}`, undefined, token);
      if (!alive.current) return;
      setData(v); setError(null); setOffline(false);
    } catch (e) {
      if (!alive.current) return;
      const err = e as ApiError;
      if (err.network) setOffline(true);
      else if (FATAL.has(err.code)) setError(err);
    }
  }, [code, role, token]);

  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(load, 120);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    load();
    let ws: WebSocket | null = null;
    let retry = 0;
    let closed = false;
    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}&code=${code}&token=${encodeURIComponent(token)}`);
      ws.onopen = () => { retry = 0; load(); };
      ws.onmessage = refresh;
      ws.onclose = () => { if (!closed) window.setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); };
    };
    connect();
    const poll = window.setInterval(load, 8000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', load);
    return () => {
      alive.current = false; closed = true;
      ws?.close(); window.clearInterval(poll); window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', load);
    };
  }, [role, code, token, load, refresh]);

  return { data, error, offline, reload: load, setData };
}
