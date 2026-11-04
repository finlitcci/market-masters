import crypto from 'node:crypto';
import { ASSETS, TICKERS, TOTAL_WEEKS, START_CASH_CENTS, AWARD_RULES } from './content.js';
import { COMPANIES } from './data/companies.js';
import { EVENTS } from './data/events.js';
import { QUIZ } from './data/quiz.js';
import { computeWeek, summarizeDrivers, buildHistory } from './engine.js';
import { weekQuestions, optionOrder, grade, classStats } from './quizEngine.js';
import { newSeed } from './rng.js';
import { validateName } from './names.js';

export class GameError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new GameError(status, code, message); };

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');
const pctOf = (cents, base = START_CASH_CENTS) => (base ? Math.round((cents / base) * 10000) / 100 : 0);
const HISTORY = buildHistory(); // identical pre-game history in every room
const EVENTS_BY_WEEK = Object.fromEntries(Array.from({ length: TOTAL_WEEKS }, (_, i) => [i + 1, EVENTS.filter((e) => e.week === i + 1)]));
const QUIZ_VIEW_PHASES = ['quiz', 'quizreview', 'results']; // phases in which students can see their quiz page
const QUIZ_ANSWER_PHASE = 'quiz';                          // answers are only accepted until the teacher ends the quiz
const expectLabel = (e) => (e < 0.45 ? 'Low' : e < 0.7 ? 'Moderate' : 'High');

export class Game {
  /** @param db node:sqlite handle (see db.js)  @param opts { now, roomTtlMs, maxPlayers, onChange(code) } */
  constructor(db, opts = {}) {
    this.db = db;
    this.now = opts.now || Date.now;
    this.ttl = opts.roomTtlMs ?? 24 * 3600 * 1000;
    this.maxPlayers = opts.maxPlayers ?? 100;
    this.onChange = opts.onChange || (() => {});
    const p = (sql) => db.prepare(sql);
    this.q = {
      roomByCode: p('SELECT * FROM rooms WHERE code = ?'),
      roomById: p('SELECT * FROM rooms WHERE id = ?'),
      insRoom: p('INSERT INTO rooms (code, host_token_hash, seed, quiz_enabled, discussion, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'),
      touch: p('UPDATE rooms SET updated_at = ? WHERE id = ?'),
      setPhase: p('UPDATE rooms SET phase = ?, week = ?, updated_at = ? WHERE id = ?'),
      players: p('SELECT * FROM players WHERE room_id = ?'),
      playerByToken: p('SELECT * FROM players WHERE token_hash = ? AND room_id = ?'),
      insPlayer: p('INSERT INTO players (room_id, name, name_key, token_hash, seq, cash_cents, created_at) VALUES (?,?,?,?,?,?,?)'),
      holding: p('SELECT shares, cost_cents FROM holdings WHERE player_id = ? AND ticker = ?'),
      roomHoldings: p('SELECT h.player_id, h.ticker, h.shares, h.cost_cents FROM holdings h JOIN players p ON p.id = h.player_id WHERE p.room_id = ? AND h.shares > 0'),
      upsertHolding: p('INSERT INTO holdings (player_id, ticker, shares, cost_cents) VALUES (?,?,?,?) ON CONFLICT(player_id, ticker) DO UPDATE SET shares = excluded.shares, cost_cents = excluded.cost_cents'),
      delHolding: p('DELETE FROM holdings WHERE player_id = ? AND ticker = ?'),
      setCash: p('UPDATE players SET cash_cents = ?, realized_cents = realized_cents + ? WHERE id = ?'),
      tradeByReq: p('SELECT * FROM trades WHERE player_id = ? AND request_id = ?'),
      insTrade: p('INSERT INTO trades (room_id, player_id, week, ticker, side, qty, price_cents, total_cents, realized_cents, request_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
      myTrades: p('SELECT week, ticker, side, qty, price_cents, total_cents, created_at FROM trades WHERE player_id = ? ORDER BY id DESC LIMIT 40'),
      weekTrades: p('SELECT ticker, side, qty, price_cents FROM trades WHERE player_id = ? AND week = ? ORDER BY id'),
      tradeCount: p('SELECT COUNT(*) n FROM trades WHERE player_id = ?'),
      market: p('SELECT week, ticker, price_cents, volume FROM market WHERE room_id = ? ORDER BY week'),
      insMarket: p('INSERT INTO market (room_id, week, ticker, price_cents, volume) VALUES (?,?,?,?,?)'),
      reactions: p('SELECT week, ticker, change_bp, detail FROM reactions WHERE room_id = ?'),
      insReaction: p('INSERT INTO reactions (room_id, week, ticker, change_bp, detail) VALUES (?,?,?,?,?)'),
      snaps: p('SELECT s.* FROM snapshots s JOIN players p ON p.id = s.player_id WHERE p.room_id = ?'),
      insSnap: p('INSERT OR REPLACE INTO snapshots (player_id, week, cash_cents, invested_cents, net_cents, rank) VALUES (?,?,?,?,?,?)'),
      submit: p('UPDATE players SET submitted_week = ? WHERE id = ?'),
      myAnswers: p('SELECT qid, choice, correct FROM quiz_answers WHERE player_id = ? AND week = ?'),
      myAllAnswers: p('SELECT week, correct FROM quiz_answers WHERE player_id = ?'),
      roomAnswers: p('SELECT qa.player_id, qa.qid, qa.choice FROM quiz_answers qa JOIN players p ON p.id = qa.player_id WHERE p.room_id = ? AND qa.week = ?'),
      quizAgg: p('SELECT qa.player_id, COUNT(*) n, SUM(qa.correct) c FROM quiz_answers qa JOIN players p ON p.id = qa.player_id WHERE p.room_id = ? GROUP BY qa.player_id'),
      quizByWeek: p('SELECT qa.week, COUNT(*) n, SUM(qa.correct) c FROM quiz_answers qa JOIN players p ON p.id = qa.player_id WHERE p.room_id = ? GROUP BY qa.week ORDER BY qa.week'),
      insAnswer: p('INSERT INTO quiz_answers (player_id, week, qid, choice, correct, created_at) VALUES (?,?,?,?,?,?)'),
      delPlayer: p('DELETE FROM players WHERE id = ? AND room_id = ?'),
      purge: p('DELETE FROM rooms WHERE updated_at < ?'),
    };
    this.tx = (fn) => db.transaction(fn);
  }

  // ------------------------------------------------------------------ rooms
  purgeExpired() { return Number(this.q.purge.run(this.now() - this.ttl).changes); }

  createRoom({ quiz = true, discussion = false } = {}) {
    this.purgeExpired();
    const hostToken = newToken();
    const seed = newSeed();
    const now = this.now();
    const make = this.tx(() => {
      for (let i = 0; i < 50; i++) {
        const code = String(crypto.randomInt(100000, 1000000));
        if (this.q.roomByCode.get(code)) continue; // collision: try again
        const r = this.q.insRoom.run(code, sha(hostToken), seed, quiz ? 1 : 0, discussion ? 1 : 0, now, now);
        this.#seedMarket(Number(r.lastInsertRowid));
        return code;
      }
      return fail(503, 'NO_PIN', 'Could not create a unique PIN. Try again.');
    });
    return { code: make(), hostToken };
  }

  #seedMarket(roomId) {
    for (const a of ASSETS) {
      for (const h of HISTORY[a.ticker]) this.q.insMarket.run(roomId, h.week, a.ticker, h.priceCents, h.volume);
      this.q.insMarket.run(roomId, 0, a.ticker, a.startCents, a.baseVolume);
    }
  }

  #room(code) {
    const room = typeof code === 'string' && /^\d{6}$/.test(code) ? this.q.roomByCode.get(code) : null;
    if (!room) fail(404, 'ROOM_NOT_FOUND', 'No game found with that PIN. Check the number and try again.');
    if (this.now() - room.updated_at > this.ttl) fail(410, 'ROOM_EXPIRED', 'This game has expired. Ask your teacher to start a new one.');
    return room;
  }

  #host(code, token) {
    const room = this.#room(code);
    const a = Buffer.from(sha(token || ''));
    const b = Buffer.from(room.host_token_hash);
    if (!crypto.timingSafeEqual(a, b)) fail(401, 'BAD_HOST', 'Host access denied.');
    return room;
  }

  #player(code, token) {
    const room = this.#room(code);
    const player = token ? this.q.playerByToken.get(sha(token), room.id) : null;
    if (!player) fail(401, 'NOT_IN_GAME', 'You are not in this game. Rejoin with the PIN.');
    return { room, player };
  }

  publicInfo(code) {
    const room = this.#room(code);
    return { code: room.code, phase: room.phase, joinLocked: !!room.join_locked, open: room.phase === 'lobby' && !room.join_locked };
  }

  // ------------------------------------------------------------------ joining
  join(code, rawName, existingToken) {
    const room = this.#room(code);
    if (existingToken) {
      const back = this.q.playerByToken.get(sha(existingToken), room.id);
      if (back) return { token: existingToken, name: back.name, rejoined: true };
    }
    if (room.join_locked) fail(403, 'ROOM_LOCKED', 'The teacher has locked this game, so no new players can join.');
    if (room.phase === 'final') fail(403, 'ROOM_LOCKED', 'This game has finished.');
    const v = validateName(rawName);
    if (!v.ok) fail(400, 'BAD_NAME', v.error);
    const run = this.tx(() => {
      const fresh = this.q.roomById.get(room.id);
      if (this.q.players.all(room.id).length >= this.maxPlayers) fail(403, 'ROOM_FULL', 'This game is full.');
      const token = newToken();
      try {
        const r = this.q.insPlayer.run(room.id, v.name, v.key, sha(token), fresh.next_seq, START_CASH_CENTS, this.now());
        this.db.prepare('UPDATE rooms SET next_seq = next_seq + 1, updated_at = ? WHERE id = ?').run(this.now(), room.id);
        if (fresh.phase !== 'lobby') { // late joiner (teacher re-opened the room)
          this.q.insSnap.run(Number(r.lastInsertRowid), this.#prices(room.id).pw, START_CASH_CENTS, 0, START_CASH_CENTS, null);
        }
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) fail(409, 'NAME_TAKEN', 'Someone in this game already has that name. Try another.');
        throw e;
      }
      return { token, name: v.name, rejoined: false };
    });
    const out = run();
    this.onChange(code);
    return out;
  }

  removePlayer(code, hostToken, playerId) {
    const room = this.#host(code, hostToken);
    if (room.phase === 'final') fail(409, 'TOO_LATE', 'The game has finished.');
    this.q.delPlayer.run(Number(playerId), room.id);
    this.q.touch.run(this.now(), room.id);
    this.onChange(code);
  }

  // ------------------------------------------------------------------ prices, standings
  #prices(roomId) {
    const history = Object.fromEntries(TICKERS.map((t) => [t, []]));
    let pw = 0;
    for (const r of this.q.market.all(roomId)) {
      history[r.ticker].push({ week: r.week, priceCents: r.price_cents, volume: r.volume });
      if (r.week > pw) pw = r.week;
    }
    const prices = {}, prev = {};
    for (const t of TICKERS) { const h = history[t]; prices[t] = h[h.length - 1].priceCents; prev[t] = h[h.length - 2].priceCents; }
    return { pw, prices, prev, history };
  }

  #reactions(roomId) {
    const map = new Map();
    for (const r of this.q.reactions.all(roomId)) {
      if (!map.has(r.week)) map.set(r.week, new Map());
      map.get(r.week).set(r.ticker, { changeBp: r.change_bp, detail: JSON.parse(r.detail) });
    }
    return map;
  }

  /** Ranked standings at the latest revealed prices. */
  #standings(room, mk = this.#prices(room.id)) {
    const holdBy = new Map();
    for (const h of this.q.roomHoldings.all(room.id)) {
      if (!holdBy.has(h.player_id)) holdBy.set(h.player_id, []);
      holdBy.get(h.player_id).push(h);
    }
    const snaps = this.q.snaps.all(room.id);
    const quiz = new Map(this.q.quizAgg.all(room.id).map((r) => [r.player_id, r]));
    const rows = this.q.players.all(room.id).map((p) => {
      const hs = (holdBy.get(p.id) || []).map((h) => ({ ticker: h.ticker, shares: h.shares, costCents: h.cost_cents, valueCents: h.shares * mk.prices[h.ticker] }));
      const invested = hs.reduce((s, h) => s + h.valueCents, 0);
      return { p, hs, cash: p.cash_cents, invested, net: p.cash_cents + invested };
    });
    // Tie-break: more net worth, then more cash, then who joined first.
    rows.sort((a, b) => b.net - a.net || b.cash - a.cash || a.p.seq - b.p.seq);
    return rows.map((r, i) => {
      const before = snaps.find((s) => s.player_id === r.p.id && s.week === mk.pw - 1);
      const q = quiz.get(r.p.id);
      return {
        id: r.p.id, name: r.p.name, rank: i + 1, prevRank: before?.rank ?? null,
        netCents: r.net, cashCents: r.cash, investedCents: r.invested, holdings: r.hs,
        returnCents: r.net - START_CASH_CENTS, returnPct: pctOf(r.net - START_CASH_CENTS),
        weekChangeCents: before ? r.net - before.net_cents : 0,
        weekChangePct: before ? pctOf(r.net - before.net_cents, before.net_cents) : 0,
        submittedWeek: r.p.submitted_week, realizedCents: r.p.realized_cents,
        quizCorrect: Number(q?.c ?? 0), quizAnswered: Number(q?.n ?? 0),
      };
    });
  }

  #publicRow(r) {
    return {
      id: r.id, name: r.name, rank: r.rank, moved: r.prevRank ? r.prevRank - r.rank : null,
      netCents: r.netCents, returnCents: r.returnCents, returnPct: r.returnPct,
      weekChangeCents: r.weekChangeCents, weekChangePct: r.weekChangePct,
    };
  }

  // ------------------------------------------------------------------ news
  /** Highest week whose news is published to students. In "intro" the teacher is still previewing it. */
  #visibleWeek(room) { return room.week < 1 ? 0 : room.phase === 'intro' ? room.week - 1 : room.week; }

  /** Public fields only. Severity and hidden signals never leave the server. */
  #publicEvent(ev, reacts) {
    const out = { id: ev.id, week: ev.week, time: ev.time, type: ev.type, headline: ev.headline, body: ev.body, figures: ev.figures, concerns: ev.concerns, scope: ev.scope || null };
    const wk = reacts.get(ev.week);
    if (wk) { // only after the market reveal
      out.reaction = [...wk.entries()].map(([ticker, r]) => {
        const sum = r.detail.contribs.filter((c) => c.eventId === ev.id).reduce((a, c) => a + c.bp, 0);
        return { ticker, eventPct: sum / 100, totalPct: r.changeBp / 100 };
      }).filter((x) => Math.abs(x.eventPct) >= 0.05).sort((a, b) => Math.abs(b.eventPct) - Math.abs(a.eventPct));
    }
    return out;
  }

  #eventsView(room, reacts) {
    const out = [];
    for (let w = this.#visibleWeek(room); w >= 1; w--) for (const ev of EVENTS_BY_WEEK[w]) out.push(this.#publicEvent(ev, reacts));
    return out;
  }

  // ------------------------------------------------------------------ views
  #assetViews(mk, reacts, byT = {}) {
    const wkReact = reacts.get(mk.pw);
    return ASSETS.map((a) => {
      const price = mk.prices[a.ticker], prev = mk.prev[a.ticker], h = byT[a.ticker];
      const isEtf = a.kind === 'ETF';
      return {
        ticker: a.ticker, name: a.name, industry: a.industry, kind: a.kind, vol: a.vol, desc: a.desc,
        priceCents: price, prevPriceCents: prev, changePct: Math.round(((price - prev) / prev) * 10000) / 100,
        history: mk.history[a.ticker],
        info: isEtf ? { holdings: COMPANIES.length, weighting: 'Equal weight', note: 'Fees are not modelled in this game.' } : {
          revenueGrowth: a.revenueGrowth, grossMargin: a.grossMargin, netMargin: a.netMargin, debt: a.debt, dividendYield: a.dividendYield,
          expectations: expectLabel(a.expectations), eps: a.eps, pe: Math.round((price / 100 / a.eps) * 10) / 10,
          marketCapM: Math.round((price / 100) * a.sharesOutM),
        },
        drivers: mk.pw >= 1 && wkReact?.get(a.ticker) ? summarizeDrivers(wkReact.get(a.ticker).detail) : [],
        shares: h?.shares ?? 0, costCents: h?.costCents ?? 0, valueCents: h?.valueCents ?? 0,
        weekChangeCents: h ? h.shares * (price - prev) : 0,
      };
    });
  }

  #roomView(room, playerCount) {
    return {
      code: room.code, phase: room.phase, week: room.week, totalWeeks: TOTAL_WEEKS, joinLocked: !!room.join_locked,
      quizEnabled: !!room.quiz_enabled, discussion: !!room.discussion, playerCount,
      topic: room.week >= 1 ? QUIZ[room.week].topic : null,
    };
  }

  playerView(code, token) {
    const { room, player } = this.#player(code, token);
    const mk = this.#prices(room.id);
    const reacts = this.#reactions(room.id);
    const st = this.#standings(room, mk);
    const me = st.find((r) => r.id === player.id);
    const byT = Object.fromEntries(me.holdings.map((h) => [h.ticker, h]));
    const snaps = this.q.snaps.all(room.id).filter((s) => s.player_id === player.id).sort((a, b) => a.week - b.week);
    const out = {
      room: this.#roomView(room, st.length),
      me: {
        id: me.id, name: me.name, cashCents: me.cashCents, investedCents: me.investedCents, netCents: me.netCents,
        returnCents: me.returnCents, returnPct: me.returnPct, rank: me.rank, prevRank: me.prevRank,
        moved: me.prevRank ? me.prevRank - me.rank : null, weekChangeCents: me.weekChangeCents, weekChangePct: me.weekChangePct,
        realizedCents: me.realizedCents, quizCorrect: me.quizCorrect, quizAnswered: me.quizAnswered,
        submitted: me.submittedWeek === room.week && room.week > 0,
      },
      assets: this.#assetViews(mk, reacts, byT),
      events: this.#eventsView(room, reacts),
      leaderboard: st.slice(0, 10).map((r) => this.#publicRow(r)),
      series: snaps.map((s) => ({ week: s.week, netCents: s.net_cents })),
      trades: this.q.myTrades.all(player.id).map((t) => ({ week: t.week, ticker: t.ticker, side: t.side, qty: t.qty, priceCents: t.price_cents, totalCents: t.total_cents, at: t.created_at })),
      quiz: this.#quizView(room, player),
      reflection: room.phase === 'results' ? this.#reflection(room, mk, reacts, me, player) : null,
    };
    if (room.phase === 'final') out.final = this.#final(room, mk, st, reacts, player.id);
    return out;
  }

  hostView(code, hostToken) {
    const room = this.#host(code, hostToken);
    const mk = this.#prices(room.id);
    const reacts = this.#reactions(room.id);
    const st = this.#standings(room, mk);
    const out = {
      room: this.#roomView(room, st.length),
      players: st.map((r) => ({ ...this.#publicRow(r), submitted: r.submittedWeek === room.week && room.week > 0, quizAnswered: r.quizAnswered })),
      leaderboard: st.slice(0, 5).map((r) => this.#publicRow(r)),
      submittedCount: st.filter((r) => r.submittedWeek === room.week && room.week > 0).length,
      assets: this.#assetViews(mk, reacts),
      events: this.#eventsView(room, reacts),
      preview: room.phase === 'intro' ? EVENTS_BY_WEEK[room.week].map((e) => this.#publicEvent(e, new Map())) : null,
      quizStats: this.#quizHost(room, st.length),
    };
    if (room.phase === 'final') {
      out.final = this.#final(room, mk, st, reacts, null);
      out.audit = { seed: room.seed, note: 'Weekly prices are generated from this seed plus the event schedule. Keep it if you need to audit or replay the game.' };
    }
    return out;
  }

  // ------------------------------------------------------------------ quiz
  #quizView(room, player) {
    if (!room.quiz_enabled || !QUIZ_VIEW_PHASES.includes(room.phase) || room.week < 1) return null;
    const done = new Map(this.q.myAnswers.all(player.id, room.week).map((a) => [a.qid, a]));
    return {
      week: room.week, topic: QUIZ[room.week].topic,
      questions: weekQuestions(room.seed, room.week).map((q) => {
        const perm = optionOrder(room.seed, player.id, room.week, q.id);
        const a = done.get(q.id);
        return {
          id: q.id, question: q.q, choices: perm.map((orig, pos) => ({ pos, text: q.options[orig] })),
          // The right answer is revealed only once this student has answered.
          answered: a ? { pos: perm.indexOf(a.choice), correct: !!a.correct, correctPos: perm.indexOf(q.correct), explanation: q.explain } : null,
        };
      }),
    };
  }

  answerQuiz(code, token, { qid, pos }) {
    if (typeof qid !== 'string' || !Number.isInteger(pos) || pos < 0 || pos > 3) fail(400, 'BAD_ANSWER', 'Pick one of the four answers.');
    const run = this.tx(() => {
      const { room, player } = this.#player(code, token);
      if (room.quiz_enabled && room.week >= 1 && ['quizreview', 'results'].includes(room.phase)) fail(409, 'QUIZ_CLOSED', 'Your teacher has ended the quiz, so answers are no longer accepted.');
      if (!room.quiz_enabled || room.phase !== QUIZ_ANSWER_PHASE || room.week < 1) fail(409, 'NO_QUIZ', 'There is no quiz open right now.');
      const q = weekQuestions(room.seed, room.week).find((x) => x.id === qid);
      if (!q) fail(404, 'NO_QUESTION', 'That question is not part of this week\u2019s quiz.');
      if (this.q.myAnswers.all(player.id, room.week).some((a) => a.qid === qid)) fail(409, 'ALREADY_ANSWERED', 'You already answered this question.');
      const perm = optionOrder(room.seed, player.id, room.week, qid);
      const g = grade(q, perm, pos);
      this.q.insAnswer.run(player.id, room.week, qid, g.chosen, g.correct ? 1 : 0, this.now());
      this.q.touch.run(this.now(), room.id);
      return { correct: g.correct, correctPos: g.correctPos, explanation: q.explain };
    });
    const out = run();
    this.onChange(code);
    return out;
  }

  /** Class quiz information. While students are still answering (phase "quiz") only the finish count is shown: no questions, no answers. */
  #quizHost(room, playerCount) {
    if (!room.quiz_enabled || !QUIZ_VIEW_PHASES.includes(room.phase) || room.week < 1) return null;
    const rows = this.q.roomAnswers.all(room.id, room.week);
    const per = new Map();
    rows.forEach((r) => per.set(r.player_id, (per.get(r.player_id) || 0) + 1));
    const finishedIds = [...per.entries()].filter(([, n]) => n >= 3).map(([id]) => id);
    return {
      week: room.week, topic: QUIZ[room.week].topic, finished: finishedIds.length, finishedIds, playerCount,
      questions: room.phase === 'quiz' ? [] : classStats(room.seed, room.week, rows, playerCount),
    };
  }

  // ------------------------------------------------------------------ student actions
  trade(code, token, { ticker, side, qty, requestId }) {
    if (!TICKERS.includes(ticker)) fail(400, 'BAD_TICKER', 'Unknown investment.');
    if (side !== 'buy' && side !== 'sell') fail(400, 'BAD_SIDE', 'Choose buy or sell.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) fail(400, 'BAD_QTY', 'Enter a whole number of shares, 1 or more.');
    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 64) fail(400, 'BAD_REQUEST', 'Missing request id.');
    const run = this.tx(() => {
      const { room, player } = this.#player(code, token); // re-read inside the transaction
      if (room.phase !== 'trading') fail(409, 'TRADING_CLOSED', 'Trading is not open right now.');
      if (player.submitted_week === room.week) fail(409, 'ALREADY_SUBMITTED', 'You already submitted this week. Tap "Change my choices" to keep trading.');
      const dup = this.q.tradeByReq.get(player.id, requestId);
      if (dup) return { duplicate: true, side: dup.side, qty: dup.qty, ticker: dup.ticker, priceCents: dup.price_cents, totalCents: dup.total_cents, realizedCents: dup.realized_cents, cashCents: player.cash_cents };
      const price = this.#prices(room.id).prices[ticker];
      const total = qty * price;
      const held = this.q.holding.get(player.id, ticker) || { shares: 0, cost_cents: 0 };
      let cash = player.cash_cents, realized = 0;
      if (side === 'buy') {
        if (total > cash) fail(409, 'INSUFFICIENT_CASH', 'Not enough cash for that purchase.');
        cash -= total;
        this.q.upsertHolding.run(player.id, ticker, held.shares + qty, held.cost_cents + total);
      } else {
        if (qty > held.shares) fail(409, 'NOT_ENOUGH_SHARES', `You only own ${held.shares} share${held.shares === 1 ? '' : 's'} of ${ticker}.`);
        // Average-cost method: the cost of the shares sold is their share of the total cost basis.
        const costOut = qty === held.shares ? held.cost_cents : Math.round((held.cost_cents * qty) / held.shares);
        realized = total - costOut;
        cash += total;
        if (qty === held.shares) this.q.delHolding.run(player.id, ticker);
        else this.q.upsertHolding.run(player.id, ticker, held.shares - qty, held.cost_cents - costOut);
      }
      this.q.setCash.run(cash, realized, player.id);
      this.q.insTrade.run(room.id, player.id, room.week, ticker, side, qty, price, total, realized, requestId, this.now());
      this.q.touch.run(this.now(), room.id);
      return { duplicate: false, side, qty, ticker, priceCents: price, totalCents: total, realizedCents: realized, cashCents: cash };
    });
    const out = run();
    if (!out.duplicate) this.onChange(code);
    return out;
  }

  setSubmitted(code, token, value) {
    const { room, player } = this.#player(code, token);
    if (room.phase !== 'trading') fail(409, 'TRADING_CLOSED', 'Trading is not open right now.');
    this.q.submit.run(value ? room.week : 0, player.id);
    this.q.touch.run(this.now(), room.id);
    this.onChange(code);
    return { submitted: !!value };
  }

  // ------------------------------------------------------------------ host actions
  advance(code, hostToken, { expectedPhase, expectedWeek, skipTutorial = false } = {}) {
    const run = this.tx(() => {
      const room = this.#host(code, hostToken); // re-read inside the transaction
      if (room.phase !== expectedPhase || room.week !== expectedWeek) fail(409, 'STALE', 'The game has already moved on. Your screen has been refreshed.');
      const now = this.now();
      const set = (phase, week = room.week) => this.q.setPhase.run(phase, week, now, room.id);
      switch (room.phase) {
        case 'lobby': {
          const players = this.q.players.all(room.id);
          if (players.length < 1) fail(400, 'NO_PLAYERS', 'Wait for at least one student to join.');
          this.db.prepare('UPDATE rooms SET join_locked = 1 WHERE id = ?').run(room.id);
          for (const p of players) this.q.insSnap.run(p.id, 0, START_CASH_CENTS, 0, START_CASH_CENTS, null);
          skipTutorial ? set('intro', 1) : set('tutorial', 0);
          break;
        }
        case 'tutorial': set('intro', 1); break;
        case 'intro': set('trading'); break;   // publishes the week's news and opens trading
        case 'trading': set('locked'); break;
        case 'locked': this.#reveal(room); set('reveal'); break;
        case 'reveal': set(room.quiz_enabled ? 'quiz' : 'results'); break;
        case 'quiz': set('quizreview'); break;   // "End quiz": closes answering and shows the questions and answers
        case 'quizreview': set('results'); break;
        case 'results': room.week < TOTAL_WEEKS ? set('intro', room.week + 1) : set('final'); break;
        default: fail(400, 'NO_NEXT', 'The game is finished.');
      }
    });
    run();
    this.onChange(code);
  }

  /** Generates this week's prices exactly once. Guarded by the stored rows (and the primary keys behind them). */
  #reveal(room) {
    const mk = this.#prices(room.id);
    if (mk.pw >= room.week) return; // already generated: never reroll
    const gen = computeWeek({ seed: room.seed, week: room.week, prevPrices: mk.prices, events: EVENTS_BY_WEEK[room.week] });
    for (const t of TICKERS) {
      this.q.insMarket.run(room.id, room.week, t, gen.prices[t], gen.volumes[t]);
      this.q.insReaction.run(room.id, room.week, t, Math.round(gen.changes[t] * 10000), JSON.stringify(gen.detail[t]));
    }
    for (const r of this.#standings(room, this.#prices(room.id))) {
      this.q.insSnap.run(r.id, room.week, r.cashCents, r.investedCents, r.netCents, r.rank);
    }
  }

  endGame(code, hostToken) {
    const room = this.#host(code, hostToken);
    if (['lobby', 'final'].includes(room.phase)) fail(409, 'CANNOT_END', 'Nothing to end yet.');
    this.q.setPhase.run('final', room.week, this.now(), room.id);
    this.onChange(code);
  }

  setJoinLock(code, hostToken, locked) {
    const room = this.#host(code, hostToken);
    if (room.phase === 'final') fail(409, 'FINISHED', 'The game has finished.');
    this.db.prepare('UPDATE rooms SET join_locked = ?, updated_at = ? WHERE id = ?').run(locked ? 1 : 0, this.now(), room.id);
    this.onChange(code);
  }

  /** Same room and players, fresh market and fresh $1,000 each. */
  reset(code, hostToken) {
    const run = this.tx(() => {
      const room = this.#host(code, hostToken);
      if (room.phase !== 'final') fail(409, 'NOT_FINISHED', 'You can reset once the game has finished.');
      const id = room.id;
      for (const t of ['trades', 'market', 'reactions']) this.db.prepare(`DELETE FROM ${t} WHERE room_id = ?`).run(id);
      for (const t of ['holdings', 'snapshots', 'quiz_answers']) this.db.prepare(`DELETE FROM ${t} WHERE player_id IN (SELECT id FROM players WHERE room_id = ?)`).run(id);
      this.db.prepare('UPDATE players SET cash_cents = ?, realized_cents = 0, submitted_week = 0 WHERE room_id = ?').run(START_CASH_CENTS, id);
      this.db.prepare("UPDATE rooms SET seed = ?, phase = 'lobby', week = 0, join_locked = 0, updated_at = ? WHERE id = ?").run(newSeed(), this.now(), id);
      this.#seedMarket(id);
    });
    run();
    this.onChange(code);
  }

  // ------------------------------------------------------------------ reflection (end of each week)
  #reflection(room, mk, reacts, me, player) {
    const w = room.week;
    const wkEvents = EVENTS_BY_WEEK[w];
    const wkReact = reacts.get(w);
    const impactOn = (ticker) => wkEvents.map((e) => {
      const sum = (wkReact?.get(ticker)?.detail.contribs || []).filter((c) => c.eventId === e.id).reduce((a, c) => a + c.bp, 0);
      return { id: e.id, headline: e.headline, pct: sum / 100 };
    }).filter((x) => Math.abs(x.pct) >= 0.3).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const changePct = (t) => Math.round(((mk.prices[t] - mk.prev[t]) / mk.prev[t]) * 10000) / 100;
    const asset = (t) => ASSETS.find((a) => a.ticker === t);
    const answers = new Map(this.q.myAnswers.all(player.id, w).map((a) => [a.qid, a]));
    const qs = weekQuestions(room.seed, w);
    return {
      week: w, topic: QUIZ[w].topic,
      portfolio: { weekChangeCents: me.weekChangeCents, weekChangePct: me.weekChangePct, rank: me.rank, prevRank: me.prevRank, netCents: me.netCents },
      holdings: me.holdings.map((h) => ({
        ticker: h.ticker, name: asset(h.ticker).name, shares: h.shares, valueCents: h.valueCents,
        changeCents: h.shares * (mk.prices[h.ticker] - mk.prev[h.ticker]), changePct: changePct(h.ticker), events: impactOn(h.ticker),
      })),
      trades: this.q.weekTrades.all(player.id, w).map((t) => ({ ticker: t.ticker, side: t.side, qty: t.qty, priceCents: t.price_cents, afterPct: changePct(t.ticker) })),
      quiz: room.quiz_enabled ? {
        total: qs.length, answered: answers.size, correct: [...answers.values()].filter((a) => a.correct).length,
        missed: qs.filter((q) => answers.has(q.id) && !answers.get(q.id).correct).map((q) => ({ question: q.q, explanation: q.explain })),
        skipped: qs.length - answers.size,
      } : null,
      concept: QUIZ[w].concept, consider: QUIZ[w].consider,
    };
  }

  // ------------------------------------------------------------------ final results and report
  #final(room, mk, st, reacts, forPlayerId) {
    const snaps = this.q.snaps.all(room.id);
    const snapsOf = (pid) => snaps.filter((s) => s.player_id === pid).sort((a, b) => a.week - b.week);
    const best = (list, key, dir = 'max') => {
      let b = null;
      for (const r of list) if (!b || (dir === 'max' ? key(r) > key(b) : key(r) < key(b))) b = r; // list is in rank order: ties go to the higher rank
      return b;
    };
    const naming = (r, detail) => (r ? { id: r.id, name: r.name, detail } : null);
    const awards = [{ key: 'net', title: 'Highest final net worth', rule: 'Most total money (cash plus the value of shares) at the end.', winner: st[0] ? naming(st[0], null) : null }];

    const div = st.filter((r) => r.holdings.length >= 3 && r.netCents > 0 && r.investedCents / r.netCents >= 0.5);
    const hhi = (r) => 1 - r.holdings.reduce((s, h) => s + (h.valueCents / r.investedCents) ** 2, 0);
    const dv = best(div, hhi);
    awards.push({ key: 'diversified', title: 'Best diversified portfolio', rule: AWARD_RULES.diversified, winner: naming(dv, dv && `${dv.holdings.length} investments held`) });

    const maxDrop = (r) => { const s = snapsOf(r.id); let d = 0; for (let i = 1; i < s.length; i++) d = Math.max(d, (s[i - 1].net_cents - s[i].net_cents) / s[i - 1].net_cents); return d; };
    const riskOk = st.filter((r) => {
      const s = snapsOf(r.id);
      if (r.netCents < START_CASH_CENTS || s.length < 3) return false;
      const later = s.filter((x) => x.week >= 1);
      return later.reduce((a, x) => a + (x.net_cents ? x.invested_cents / x.net_cents : 0), 0) / (later.length || 1) >= 0.3;
    });
    const rk = best(riskOk, maxDrop, 'min');
    awards.push({ key: 'risk', title: 'Best risk management', rule: AWARD_RULES.risk, winner: naming(rk, rk && `Biggest weekly drop: ${(maxDrop(rk) * 100).toFixed(1)}%`) });

    const at4 = (r) => snapsOf(r.id).find((s) => s.week === 4);
    const half = st.filter((r) => at4(r) && mk.pw > 4);
    const gain = (r) => (r.netCents - at4(r).net_cents) / at4(r).net_cents;
    const im = best(half, gain);
    awards.push({ key: 'improved', title: 'Most improved portfolio value', rule: AWARD_RULES.improved, winner: naming(im, im && `${(gain(im) * 100).toFixed(1)}% in the second half`) });

    const perf = ASSETS.map((a) => ({
      ticker: a.ticker, name: a.name, changePct: Math.round(((mk.prices[a.ticker] - a.startCents) / a.startCents) * 10000) / 100,
      startCents: a.startCents, endCents: mk.prices[a.ticker],
    })).sort((a, b) => b.changePct - a.changePct);
    const ranking = st.map((r) => ({ ...this.#publicRow(r), cashCents: r.cashCents, investedCents: r.investedCents, quizCorrect: r.quizCorrect, quizAnswered: r.quizAnswered }));

    const byWeek = new Map(this.q.quizByWeek.all(room.id).map((r) => [r.week, r]));
    const quizSummary = room.quiz_enabled ? Array.from({ length: mk.pw }, (_, i) => i + 1).map((w) => {
      const r = byWeek.get(w);
      return { week: w, topic: QUIZ[w].topic, answered: Number(r?.n ?? 0), correct: Number(r?.c ?? 0), pct: r?.n ? Math.round((Number(r.c) / Number(r.n)) * 100) : null };
    }) : [];

    const out = {
      weeksPlayed: mk.pw, startCents: START_CASH_CENTS, ranking, top3: ranking.slice(0, 3), awards,
      bestInvestment: perf[0], worstInvestment: perf[perf.length - 1], investments: perf,
      quizEnabled: !!room.quiz_enabled, quizSummary,
      quizBoard: room.quiz_enabled ? [...ranking].sort((a, b) => b.quizCorrect - a.quizCorrect || a.rank - b.rank).slice(0, 5).map((r) => ({ id: r.id, name: r.name, correct: r.quizCorrect, answered: r.quizAnswered })) : [],
      note: 'Remember: the top player may have benefited from random outcomes and lucky timing. Winning this game does not mean someone understands investing best.',
    };
    if (forPlayerId) out.mine = this.#report(room, mk, st, snapsOf(forPlayerId), forPlayerId);
    return out;
  }

  #report(room, mk, st, mySnaps, playerId) {
    const me = st.find((r) => r.id === playerId);
    const asset = (t) => ASSETS.find((a) => a.ticker === t);
    const weekly = mySnaps.map((s, i) => ({
      week: s.week, netCents: s.net_cents, rank: s.rank,
      changeCents: i ? s.net_cents - mySnaps[i - 1].net_cents : 0, changePct: i ? pctOf(s.net_cents - mySnaps[i - 1].net_cents, mySnaps[i - 1].net_cents) : 0,
    }));
    const all = this.q.myAllAnswers.all(playerId);
    const quiz = room.quiz_enabled ? Array.from({ length: mk.pw }, (_, i) => i + 1).map((w) => {
      const a = all.filter((x) => x.week === w);
      return { week: w, topic: QUIZ[w].topic, answered: a.length, correct: a.filter((x) => x.correct).length, total: 3 };
    }) : [];
    const holdings = me.holdings.map((h) => ({ ticker: h.ticker, name: asset(h.ticker).name, shares: h.shares, costCents: h.costCents, valueCents: h.valueCents, plCents: h.valueCents - h.costCents }));
    const etfPct = Math.round(((mk.prices.M100 - asset('M100').startCents) / asset('M100').startCents) * 10000) / 100;
    const trades = Number(this.q.tradeCount.get(playerId).n);
    const biggest = [...me.holdings].sort((a, b) => b.valueCents - a.valueCents)[0];
    const lessons = [];
    if (!biggest) lessons.push('You finished fully in cash. Cash is safe from price swings, but it cannot grow in this game. Investing means accepting some risk for the chance of a return.');
    else if (biggest.valueCents / me.netCents > 0.5) lessons.push(`${Math.round((biggest.valueCents / me.netCents) * 100)}% of your net worth ended in ${biggest.ticker}. A concentrated position can help or hurt a lot, so size it according to what you can afford to lose.`);
    else lessons.push(`You finished spread across ${me.holdings.length} investment${me.holdings.length === 1 ? '' : 's'}, which limits the damage any single news story can do.`);
    lessons.push(`Your portfolio returned ${me.returnPct.toFixed(2)}% while the Market 100 ETF returned ${etfPct.toFixed(2)}%. A benchmark shows whether your result came from skill, risk, or the market as a whole.`);
    lessons.push(trades === 0 ? 'You made no trades. Holding is a legitimate decision, but make sure it was a decision.' : `You made ${trades} trade${trades === 1 ? '' : 's'} in eight weeks. More trading is not better trading. Each decision should rest on evidence.`);
    const graded = quiz.filter((q) => q.answered > 0);
    if (graded.length) {
      const bestQ = [...graded].sort((a, b) => b.correct - a.correct || a.week - b.week)[0];
      const worstQ = [...graded].sort((a, b) => a.correct - b.correct || a.week - b.week)[0];
      lessons.push(`Strongest quiz topic: ${bestQ.topic} (${bestQ.correct}/${bestQ.total}). Worth revisiting: ${worstQ.topic} (${worstQ.correct}/${worstQ.total}).`);
    }
    lessons.push('Short results are heavily influenced by luck. Judge a decision by the reasoning behind it, not only by what happened next.');
    return {
      ...this.#publicRow(me), startCents: START_CASH_CENTS, cashCents: me.cashCents, investedCents: me.investedCents, realizedCents: me.realizedCents,
      playerCount: st.length, holdings, weekly, quiz, quizCorrect: me.quizCorrect, quizAnswered: me.quizAnswered, trades, etfPct, lessons,
      series: weekly.map((w) => ({ week: w.week, netCents: w.netCents })),
    };
  }
}
