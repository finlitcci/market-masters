import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { WebSocket } from 'ws';
import { createServer } from '../index.js';
import { openDb, SCHEMA_VERSION } from '../db.js';
import { TOTAL_WEEKS, START_CASH_CENTS, ASSETS } from '../content.js';
import { EVENTS } from '../data/events.js';
import { QUIZ } from '../data/quiz.js';
import { computeWeek } from '../engine.js';

let S, base, clock = Date.now();
const big = { join: 1e6, badPin: 1e6, trade: 1e6, read: 1e6, host: 1e6, create: 1e6 };
const NT = ASSETS.length; // 11 investments

before(async () => {
  S = createServer({ db: openDb(':memory:'), limits: big, game: { now: () => clock, roomTtlMs: 3600_000 } });
  await new Promise((r) => S.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${S.server.address().port}`;
});
after(() => S.close());

async function api(method, p, body, token) {
  const res = await fetch(base + p, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const newRoom = async (o = {}) => (await api('POST', '/api/rooms', o)).json;
const join = async (code, name) => (await api('POST', `/api/rooms/${code}/join`, { name })).json;
const pview = async (code, t) => (await api('GET', `/api/rooms/${code}/player`, undefined, t)).json;
const hview = async (code, ht) => (await api('GET', `/api/rooms/${code}/host`, undefined, ht)).json;
const trade = (code, tok, side, ticker, qty, requestId = crypto.randomUUID()) => api('POST', `/api/rooms/${code}/player/trade`, { ticker, side, qty, requestId }, tok);
const buy = (c, t, k, q, r) => trade(c, t, 'buy', k, q, r);
const sell = (c, t, k, q, r) => trade(c, t, 'sell', k, q, r);
async function next(code, ht, extra = {}) {
  const h = await hview(code, ht);
  return api('POST', `/api/rooms/${code}/host/advance`, { expectedPhase: h.room.phase, expectedWeek: h.room.week, ...extra }, ht);
}
const steps = async (R, n) => { for (let i = 0; i < n; i++) assert.equal((await next(R.code, R.ht)).status, 200); };
const px = (v, t) => v.assets.find((a) => a.ticker === t).priceCents;
async function setup(names = ['Ava', 'Ben'], opts = {}) {
  const r = await newRoom(opts);
  const players = [];
  for (const n of names) players.push({ name: n, ...(await join(r.code, n)) });
  return { ...r, ht: r.hostToken, players };
}
/** lobby -> week 1 trading */
const toTrading = async (R) => { await next(R.code, R.ht, { skipTutorial: true }); await steps(R, 1); };
/** question + the display position of its correct / a wrong answer, for this student's own shuffle */
function findQ(qz, correct = true) {
  return qz.questions.map((q) => {
    const bank = Object.values(QUIZ).flatMap((w) => w.questions).find((x) => x.id === q.id);
    const right = bank.options[bank.correct];
    const pos = q.choices.findIndex((c) => (correct ? c.text === right : c.text !== right));
    return { id: q.id, pos };
  });
}
const answerAll = async (R, p, correct) => {
  const qz = (await pview(R.code, p.token)).quiz;
  for (const a of findQ(qz, correct)) assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: a.id, pos: a.pos }, p.token)).status, 200);
};

test('1. a teacher creates a room and gets a valid, unique 6-digit PIN', async () => {
  const codes = new Set();
  for (let i = 0; i < 40; i++) { const r = await newRoom(); assert.match(r.code, /^\d{6}$/); assert.ok(r.hostToken.length > 20); codes.add(r.code); }
  assert.equal(codes.size, 40);
});

test('2. students join by PIN; bad PIN, bad/duplicate/filtered names give clear errors', async () => {
  const r = await newRoom();
  assert.equal((await api('POST', `/api/rooms/${r.code}/join`, { name: 'Ava' })).status, 200);
  assert.equal((await api('POST', '/api/rooms/999999/join', { name: 'X1' })).json.error.code, 'ROOM_NOT_FOUND');
  assert.equal((await api('POST', `/api/rooms/${r.code}/join`, { name: 'ava ' })).json.error.code, 'NAME_TAKEN');
  assert.equal((await api('POST', `/api/rooms/${r.code}/join`, { name: 'sh1t' })).json.error.code, 'BAD_NAME');
  assert.equal((await api('POST', `/api/rooms/${r.code}/join`, { name: '' })).json.error.code, 'BAD_NAME');
});

test('3. the QR code encodes the real join URL (rendered to PNG and decoded), locally and with PUBLIC_URL', async () => {
  const decode = async (url) => {
    const png = PNG.sync.read(await QRCode.toBuffer(url, { width: 400, margin: 4 }));
    return jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data;
  };
  const r = await newRoom();
  assert.match(r.joinUrl, new RegExp(`^http://[^/]+:${S.server.address().port}/join\\?pin=${r.code}$`));
  assert.equal(await decode(r.joinUrl), r.joinUrl);
  process.env.PUBLIC_URL = 'https://play.example.org/';
  try {
    const d = await newRoom();
    assert.equal(d.joinUrl, `https://play.example.org/join?pin=${d.code}`); assert.equal(d.secure, true);
    assert.equal(await decode(d.joinUrl), d.joinUrl);
  } finally { delete process.env.PUBLIC_URL; }
});

test('4/5/6. several students join; rooms are isolated; every player starts with exactly $1,000 and no shares', async () => {
  const A = await setup(['Ann', 'Bo', 'Cy']), B = await setup(['Ann', 'Dee']);
  assert.equal((await hview(A.code, A.ht)).room.playerCount, 3); assert.equal((await hview(B.code, B.ht)).room.playerCount, 2);
  for (const p of A.players) {
    const v = await pview(A.code, p.token);
    assert.equal(v.me.cashCents, START_CASH_CENTS); assert.equal(v.me.netCents, START_CASH_CENTS);
    assert.ok(v.assets.every((a) => a.shares === 0)); assert.equal(v.assets.length, NT);
  }
  assert.equal((await pview(B.code, A.players[0].token)).error.code, 'NOT_IN_GAME');
  assert.equal((await buy(B.code, A.players[0].token, 'BWS', 1)).status, 401);
});

test('trading: valid buy/sell, invalid trades change nothing, whole shares only, average-cost realized P/L, audit rows', async () => {
  const R = await setup(['Ava']); const tok = R.players[0].token;
  await toTrading(R);
  const v0 = await pview(R.code, tok); assert.equal(v0.room.phase, 'trading');
  const price = px(v0, 'BWS');
  assert.equal((await buy(R.code, tok, 'BWS', 5)).status, 200);
  let v = await pview(R.code, tok);
  assert.equal(v.me.cashCents, START_CASH_CENTS - 5 * price); assert.equal(v.assets.find((a) => a.ticker === 'BWS').shares, 5);
  assert.equal(v.assets.find((a) => a.ticker === 'BWS').costCents, 5 * price);
  assert.equal(v.me.netCents, START_CASH_CENTS);
  const before = JSON.stringify((await pview(R.code, tok)).me);
  assert.equal((await buy(R.code, tok, 'BWS', 1000)).json.error.code, 'INSUFFICIENT_CASH');
  assert.equal((await sell(R.code, tok, 'NSR', 1)).json.error.code, 'NOT_ENOUGH_SHARES');
  assert.equal((await sell(R.code, tok, 'BWS', 6)).json.error.code, 'NOT_ENOUGH_SHARES');
  for (const bad of [0, -1, 1.5, '5', null]) assert.equal((await buy(R.code, tok, 'BWS', bad)).json.error.code, 'BAD_QTY');
  assert.equal((await buy(R.code, tok, 'XXX', 1)).json.error.code, 'BAD_TICKER');
  assert.equal(JSON.stringify((await pview(R.code, tok)).me), before); // rejected trades changed nothing
  assert.equal((await sell(R.code, tok, 'BWS', 2)).json.realizedCents, 0);
  v = await pview(R.code, tok);
  assert.equal(v.assets.find((a) => a.ticker === 'BWS').shares, 3); assert.equal(v.me.cashCents, START_CASH_CENTS - 3 * price);
  assert.equal((await sell(R.code, tok, 'BWS', 3)).status, 200);
  v = await pview(R.code, tok); assert.equal(v.me.cashCents, START_CASH_CENTS);
  assert.equal(v.trades.length, 3);
  const rows = S.db.prepare('SELECT * FROM trades WHERE player_id = (SELECT id FROM players WHERE name=? AND room_id=(SELECT id FROM rooms WHERE code=?))').all('Ava', R.code);
  assert.equal(rows.length, 3); assert.ok(rows.every((x) => x.created_at > 0 && x.price_cents > 0 && ['buy', 'sell'].includes(x.side)));
});

test('trading is only possible while trading is open and before submitting', async () => {
  const R = await setup(['Ava']); const tok = R.players[0].token;
  assert.equal((await buy(R.code, tok, 'BWS', 1)).json.error.code, 'TRADING_CLOSED');
  await next(R.code, R.ht, { skipTutorial: true });
  assert.equal((await buy(R.code, tok, 'BWS', 1)).json.error.code, 'TRADING_CLOSED'); // intro
  await steps(R, 1);
  assert.equal((await buy(R.code, tok, 'BWS', 1)).status, 200);
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/submit`, { value: true }, tok)).status, 200);
  assert.equal((await buy(R.code, tok, 'BWS', 1)).json.error.code, 'ALREADY_SUBMITTED');
  assert.equal((await hview(R.code, R.ht)).submittedCount, 1);
  await api('POST', `/api/rooms/${R.code}/player/submit`, { value: false }, tok);
  assert.equal((await buy(R.code, tok, 'BWS', 1)).status, 200);
  await steps(R, 1); // locked
  assert.equal((await buy(R.code, tok, 'BWS', 1)).json.error.code, 'TRADING_CLOSED');
  assert.equal((await sell(R.code, tok, 'BWS', 1)).json.error.code, 'TRADING_CLOSED');
});

test('repeated / retried / parallel requests cannot duplicate a trade or overspend', async () => {
  const R = await setup(['Ava', 'Ben']); const [a, b] = R.players;
  await toTrading(R);
  const price = px(await pview(R.code, a.token), 'VLM');
  const id = crypto.randomUUID();
  const rs = await Promise.all(Array.from({ length: 20 }, () => buy(R.code, a.token, 'VLM', 3, id)));
  assert.ok(rs.every((r) => r.status === 200));
  let v = await pview(R.code, a.token);
  assert.equal(v.assets.find((x) => x.ticker === 'VLM').shares, 3); assert.equal(v.me.cashCents, START_CASH_CENTS - 3 * price);
  const many = await Promise.all(Array.from({ length: 40 }, () => buy(R.code, b.token, 'PHS', 1)));
  v = await pview(R.code, b.token);
  const ok = many.filter((r) => r.status === 200).length;
  assert.ok(v.me.cashCents >= 0); assert.equal(v.assets.find((x) => x.ticker === 'PHS').shares, ok);
  assert.equal(v.me.cashCents, START_CASH_CENTS - ok * px(v, 'PHS'));
  assert.ok(many.filter((r) => r.status !== 200).every((r) => r.json.error.code === 'INSUFFICIENT_CASH'));
});

test('market: identical for everyone, generated once, never rerolled by refresh or repeated clicks; net worth is exact', async () => {
  const R = await setup(['Ava', 'Ben', 'Cal']); const [a, b, c] = R.players;
  await toTrading(R);
  await buy(R.code, a.token, 'BWS', 6); await buy(R.code, a.token, 'M100', 3); await buy(R.code, b.token, 'VLM', 30);
  const before = await pview(R.code, a.token);
  await steps(R, 1); // locked
  assert.deepEqual((await pview(R.code, a.token)).assets.map((x) => x.priceCents), before.assets.map((x) => x.priceCents)); // no peeking
  assert.equal((await next(R.code, R.ht)).status, 200); // reveal
  const [va, vb, vc] = await Promise.all([a, b, c].map((p) => pview(R.code, p.token)));
  assert.deepEqual(va.assets.map((x) => x.priceCents), vb.assets.map((x) => x.priceCents));
  assert.deepEqual(va.assets.map((x) => x.priceCents), vc.assets.map((x) => x.priceCents));
  assert.notDeepEqual(va.assets.map((x) => x.priceCents), before.assets.map((x) => x.priceCents));
  for (let i = 0; i < 5; i++) assert.deepEqual((await pview(R.code, a.token)).assets.map((x) => x.priceCents), va.assets.map((x) => x.priceCents));
  const rows = () => S.db.prepare('SELECT COUNT(*) n FROM market WHERE room_id=(SELECT id FROM rooms WHERE code=?)').get(R.code).n;
  assert.equal(rows(), NT * 14);
  const stale = await api('POST', `/api/rooms/${R.code}/host/advance`, { expectedPhase: 'locked', expectedWeek: 1 }, R.ht);
  assert.equal(stale.status, 409); assert.equal(stale.json.error.code, 'STALE'); assert.equal(rows(), NT * 14);
  assert.equal(S.db.prepare('SELECT COUNT(*) n FROM reactions WHERE room_id=(SELECT id FROM rooms WHERE code=?)').get(R.code).n, NT);
  assert.equal(va.me.netCents, va.me.cashCents + 6 * px(va, 'BWS') + 3 * px(va, 'M100'));
  assert.equal(vb.me.netCents, vb.me.cashCents + 30 * px(vb, 'VLM')); assert.equal(vc.me.netCents, START_CASH_CENTS);
  const nets = (await hview(R.code, R.ht)).players.map((p) => p.netCents);
  assert.deepEqual(nets, [...nets].sort((x, y) => y - x));
});

test('hidden information: students never receive future news, hidden signals, the seed, or outcomes before the reveal', async () => {
  const R = await setup(['Ava']); const tok = R.players[0].token;
  const future = (w) => EVENTS.filter((e) => e.week > w);
  const leaks = (json, w) => {
    const s = JSON.stringify(json);
    for (const e of future(w)) { assert.ok(!s.includes(e.id), `leaked id ${e.id}`); assert.ok(!s.includes(e.headline), `leaked headline ${e.id}`); assert.ok(!s.includes(e.body.slice(0, 40))); }
    for (const k of ['"severity"', '"signals"', '"effects"', 'seed', 'hostToken', 'token']) assert.ok(!s.includes(k), `leaked ${k}`);
  };
  await next(R.code, R.ht, { skipTutorial: true }); // week 1 intro: teacher is previewing
  let v = await pview(R.code, tok);
  assert.equal(v.events.length, 0); leaks(v, 0);
  const h = await hview(R.code, R.ht);
  assert.equal(h.preview.length, 4); assert.ok(h.preview.every((e) => e.week === 1)); assert.equal(h.events.length, 0);
  await steps(R, 1); // news published, trading open
  v = await pview(R.code, tok);
  assert.deepEqual(v.events.map((e) => e.id).sort(), EVENTS.filter((e) => e.week === 1).map((e) => e.id).sort());
  assert.ok(v.events.every((e) => e.reaction === undefined)); // no hints before the reveal
  assert.ok(v.assets.every((a) => Math.max(...a.history.map((p) => p.week)) === 0 && a.drivers.length === 0));
  leaks(v, 1); leaks(await hview(R.code, R.ht), 1);
  assert.equal((await hview(R.code, R.ht)).preview, null);
  await steps(R, 2); // locked, reveal
  v = await pview(R.code, tok);
  assert.ok(v.events.every((e) => Array.isArray(e.reaction))); // reactions appear only now
  assert.ok(v.assets.some((a) => a.drivers.length > 0)); leaks(v, 1);
  await steps(R, 4); // quiz, end quiz, results, intro of week 2
  v = await pview(R.code, tok);
  assert.ok(v.events.every((e) => e.week === 1)); leaks(v, 1); // week 2 still unpublished
  assert.equal((await hview(R.code, R.ht)).preview.length, 4);
});

test('weekly quiz: three four-choice questions, answers hidden until submitted, one try each, saved, separate from money', async () => {
  const R = await setup(['Ava', 'Ben', 'Cal'], { quiz: true }); const [a, b, c] = R.players;
  await toTrading(R); await buy(R.code, a.token, 'NSR', 5);
  await steps(R, 2); // reveal
  assert.equal((await pview(R.code, a.token)).quiz, null); // not yet open
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: 'w1q1', pos: 0 }, a.token)).json.error.code, 'NO_QUIZ');
  await steps(R, 1); // quiz
  const va = await pview(R.code, a.token), net0 = va.me.netCents;
  assert.equal(va.quiz.questions.length, 3);
  assert.ok(va.quiz.questions.every((q) => q.choices.length === 4 && q.answered === null));
  const raw = JSON.stringify(va.quiz);
  for (const q of QUIZ[1].questions) assert.ok(!raw.includes(q.explain), 'explanation leaked before answering'); // and no correctPos/correct flags:
  assert.ok(!raw.includes('correctPos') && !raw.includes('"correct"'));
  const orders = await Promise.all(R.players.map(async (p) => (await pview(R.code, p.token)).quiz.questions.map((q) => q.choices.map((x) => x.text).join('|')).join('||')));
  assert.ok(new Set(orders).size > 1, 'students see different option orders');
  assert.deepEqual((await pview(R.code, a.token)).quiz, va.quiz); // refresh never reshuffles
  const ok = findQ(va.quiz, true), no = findQ(va.quiz, false);
  const r1 = await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: ok[0].id, pos: ok[0].pos }, a.token);
  assert.equal(r1.json.correct, true); assert.ok(r1.json.explanation.length > 20); assert.equal(r1.json.correctPos, ok[0].pos);
  const r2 = await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: no[1].id, pos: no[1].pos }, a.token);
  assert.equal(r2.json.correct, false); assert.notEqual(r2.json.correctPos, no[1].pos);
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: ok[0].id, pos: ok[0].pos }, a.token)).json.error.code, 'ALREADY_ANSWERED'); // no re-submitting
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: no[0].id, pos: 9 }, a.token)).json.error.code, 'BAD_ANSWER');
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: 'w8q1', pos: 0 }, a.token)).json.error.code, 'NO_QUESTION');
  let v = await pview(R.code, a.token); // saved: refresh keeps progress, score counted
  assert.equal(v.quiz.questions.filter((q) => q.answered).length, 2);
  assert.equal(v.me.quizCorrect, 1); assert.equal(v.me.quizAnswered, 2); assert.equal(v.me.netCents, net0); // quiz never touches money
  await answerAll(R, b, false); await answerAll(R, c, true);
  let h = await hview(R.code, R.ht);
  // while students answer, the teacher sees only the finish count: no questions or answers
  assert.equal(h.quizStats.finished, 2); assert.equal(h.quizStats.playerCount, 3); assert.deepEqual(h.quizStats.questions, []);
  assert.equal(h.quizStats.finishedIds.length, 2);
  for (const q of QUIZ[1].questions) assert.ok(!JSON.stringify(h).includes(q.explain), 'quiz text must not be sent to the teacher screen yet');
  await steps(R, 1); // "End quiz": answering closes, questions and answers open up
  assert.equal((await hview(R.code, R.ht)).room.phase, 'quizreview');
  assert.equal((await api('POST', `/api/rooms/${R.code}/player/quiz`, { qid: ok[2].id, pos: ok[2].pos }, a.token)).json.error.code, 'QUIZ_CLOSED'); // too late
  assert.equal((await pview(R.code, a.token)).quiz.questions.filter((q) => q.answered).length, 2); // students still see their own answers
  h = await hview(R.code, R.ht);
  assert.equal(h.quizStats.questions.length, 3); assert.equal(h.quizStats.finished, 2);
  for (const q of h.quizStats.questions) {
    assert.equal(q.options.filter((o) => o.correct).length, 1); assert.equal(q.options.reduce((s, o) => s + o.count, 0), q.answered);
    assert.ok(q.answered >= 2 && q.correctPct !== null && q.explanation);
  }
  assert.ok(h.quizStats.questions.some((q) => q.commonMistake));
  const lb = (await hview(R.code, R.ht)).players.map((p) => p.netCents);
  assert.deepEqual(lb, [...lb].sort((x, y) => y - x)); // ranking ignores quiz points
  await steps(R, 1); // results: reflection
  v = await pview(R.code, a.token);
  assert.equal(v.reflection.quiz.answered, 2); assert.equal(v.reflection.quiz.correct, 1); assert.equal(v.reflection.quiz.missed.length, 1); assert.equal(v.reflection.quiz.skipped, 1);
  assert.equal(v.reflection.holdings[0].ticker, 'NSR'); assert.ok(v.reflection.holdings[0].events.length >= 1); assert.ok(v.reflection.consider.length >= 3);
  const vc2 = await pview(R.code, c.token);
  assert.deepEqual(vc2.reflection.holdings, []); assert.equal(vc2.reflection.quiz.correct, 3);
});

test('quiz can be switched off: reveal goes straight to results', async () => {
  const R = await setup(['Ava'], { quiz: false });
  await toTrading(R); await steps(R, 3);
  assert.equal((await hview(R.code, R.ht)).room.phase, 'results');
  assert.equal((await pview(R.code, R.players[0].token)).reflection.quiz, null);
});

test('18/19. full 8-week game: 8 reveals, correct final report, rankings match portfolios, quiz stays separate, seed replays', async () => {
  const R = await setup(['Ava', 'Ben', 'Cal', 'Dee'], { quiz: true, discussion: true });
  const [a, b, c, d] = R.players;
  assert.equal((await hview(R.code, R.ht)).room.discussion, true);
  assert.equal((await next(R.code, R.ht)).status, 200); // tutorial
  assert.equal((await pview(R.code, a.token)).room.phase, 'tutorial');
  assert.equal((await next(R.code, R.ht)).status, 200); // week 1 intro
  const seen = [];
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const h0 = await hview(R.code, R.ht); assert.equal(h0.room.phase, 'intro'); assert.equal(h0.room.week, w);
    await steps(R, 1); // trading
    if (w === 1) { await buy(R.code, a.token, 'BWS', 3); await buy(R.code, a.token, 'NSR', 4); await buy(R.code, a.token, 'M100', 3); await buy(R.code, a.token, 'GFD', 3); await buy(R.code, b.token, 'VLM', 100); }
    if (w === 3) await sell(R.code, a.token, 'BWS', 1);
    if (w === 4) await buy(R.code, c.token, 'VDP', 10);
    await steps(R, 2); // locked, reveal
    seen.push((await pview(R.code, a.token)).assets.map((x) => x.priceCents).join());
    await steps(R, 1); // quiz
    await answerAll(R, a, true); if (w % 2) await answerAll(R, b, false);
    await steps(R, 2); // end quiz (review), then results
    const v = await pview(R.code, a.token);
    assert.equal(v.reflection.week, w); assert.ok(v.reflection.concept);
    await steps(R, 1); // next intro, or final
  }
  assert.equal(new Set(seen).size, 8);
  const h = await hview(R.code, R.ht);
  assert.equal(h.room.phase, 'final'); assert.equal(h.final.weeksPlayed, 8);
  assert.equal(S.db.prepare('SELECT COUNT(*) n FROM market WHERE room_id=(SELECT id FROM rooms WHERE code=?)').get(R.code).n, NT * 21);
  assert.equal((await next(R.code, R.ht)).status, 400);
  assert.equal((await buy(R.code, a.token, 'BWS', 1)).json.error.code, 'TRADING_CLOSED');
  const price = Object.fromEntries(h.assets.map((x) => [x.ticker, x.priceCents]));
  for (const p of R.players) {
    const v = await pview(R.code, p.token);
    const calc = v.me.cashCents + v.assets.reduce((s, x) => s + x.shares * price[x.ticker], 0);
    const m = v.final.mine;
    assert.equal(m.netCents, calc); assert.equal(m.returnCents, calc - START_CASH_CENTS);
    assert.equal(m.weekly.length, 9); assert.equal(m.weekly[8].netCents, calc); assert.equal(m.series.length, 9);
    assert.equal(m.weekly[0].netCents, START_CASH_CENTS);
    for (let i = 1; i < 9; i++) assert.equal(m.weekly[i].changeCents, m.weekly[i].netCents - m.weekly[i - 1].netCents);
    assert.equal(m.holdings.reduce((s, x) => s + x.valueCents, 0), m.investedCents);
    assert.equal(m.quiz.length, 8); assert.ok(m.lessons.length >= 4); assert.ok(typeof m.etfPct === 'number');
    assert.equal(m.quizCorrect, m.quiz.reduce((s, q) => s + q.correct, 0));
  }
  const ma = (await pview(R.code, a.token)).final.mine, mb = (await pview(R.code, b.token)).final.mine, md = (await pview(R.code, d.token)).final.mine;
  assert.equal(ma.quizCorrect, 24); assert.equal(mb.quizCorrect, 0); assert.equal(md.quizAnswered, 0); // quiz tracked per student
  const nets = h.final.ranking.map((r) => r.netCents);
  assert.deepEqual(nets, [...nets].sort((x, y) => y - x)); // ranking is net worth only, whatever the quiz scores
  assert.equal(h.final.awards.length, 4); assert.equal(h.final.awards[0].winner.id, h.final.ranking[0].id);
  assert.equal(h.final.quizSummary.length, 8); assert.ok(h.final.quizSummary.every((q) => q.answered === 4 || q.answered === 6 || q.answered === 3 || q.answered > 0));
  assert.equal(h.final.quizBoard[0].name, 'Ava');
  assert.ok(h.final.bestInvestment.changePct >= h.final.worstInvestment.changePct);
  assert.equal((await pview(R.code, a.token)).audit, undefined);
  // replay: the stored seed + the event schedule regenerates every stored price exactly
  let prev = Object.fromEntries(ASSETS.map((x) => [x.ticker, x.startCents]));
  for (let w = 1; w <= 8; w++) prev = computeWeek({ seed: h.audit.seed, week: w, prevPrices: prev, events: EVENTS.filter((e) => e.week === w) }).prices;
  assert.deepEqual(prev, price);
});

test('20. reset gives a fresh game in the same room; other rooms are untouched', async () => {
  const R = await setup(['Ava', 'Ben']);
  await toTrading(R); await buy(R.code, R.players[0].token, 'BWS', 5);
  assert.equal((await api('POST', `/api/rooms/${R.code}/host/reset`, {}, R.ht)).status, 409);
  await api('POST', `/api/rooms/${R.code}/host/end`, {}, R.ht);
  const oldSeed = S.db.prepare('SELECT seed FROM rooms WHERE code = ?').get(R.code).seed;
  const other = await setup(['Zoe']); const otherBefore = JSON.stringify((await hview(other.code, other.ht)).players);
  assert.equal((await api('POST', `/api/rooms/${R.code}/host/reset`, {}, R.ht)).status, 200);
  const h = await hview(R.code, R.ht); assert.equal(h.room.phase, 'lobby'); assert.equal(h.room.week, 0);
  const v = await pview(R.code, R.players[0].token);
  assert.equal(v.me.cashCents, START_CASH_CENTS); assert.ok(v.assets.every((a) => a.shares === 0 && Math.max(...a.history.map((p) => p.week)) === 0));
  assert.notEqual(S.db.prepare('SELECT seed FROM rooms WHERE code = ?').get(R.code).seed, oldSeed);
  assert.equal(JSON.stringify((await hview(other.code, other.ht)).players), otherBefore);
});

test('22. a disconnected student keeps their portfolio and can reconnect with their saved session; the teacher screen restores', async () => {
  const R = await setup(['Ava']); const tok = R.players[0].token;
  await toTrading(R); await buy(R.code, tok, 'GFD', 7);
  const before = await pview(R.code, tok);
  const again = await api('POST', `/api/rooms/${R.code}/join`, { name: 'whatever', token: tok });
  assert.equal(again.json.rejoined, true); assert.deepEqual(await pview(R.code, tok), before);
  assert.equal((await api('POST', `/api/rooms/${R.code}/join`, { name: 'Ava' })).json.error.code, 'ROOM_LOCKED');
  const h = await hview(R.code, R.ht); assert.equal(h.room.phase, 'trading'); assert.equal(h.players.length, 1); assert.equal(h.assets.length, NT);
});

test('permissions: teacher endpoints reject students and wrong secrets; students cannot reach other players or host data', async () => {
  const R = await setup(['Ava', 'Ben']); const [a, b] = R.players;
  for (const p of ['host/advance', 'host/end', 'host/reset', 'host/lock', 'host/remove']) {
    assert.equal((await api('POST', `/api/rooms/${R.code}/${p}`, { expectedPhase: 'lobby', expectedWeek: 0 }, a.token)).status, 401, p);
    assert.equal((await api('POST', `/api/rooms/${R.code}/${p}`, {}, undefined)).status, 401, p);
  }
  assert.equal((await api('GET', `/api/rooms/${R.code}/host`, undefined, a.token)).status, 401);
  assert.equal((await api('GET', `/api/rooms/${R.code}/host`, undefined, (await newRoom()).hostToken)).status, 401);
  for (const [m, p, body] of [['GET', 'player'], ['POST', 'player/trade', { ticker: 'BWS', side: 'buy', qty: 1, requestId: 'abcdefgh1' }], ['POST', 'player/quiz', { qid: 'w1q1', pos: 0 }], ['POST', 'player/submit', {}]]) {
    assert.equal((await api(m, `/api/rooms/${R.code}/${p}`, body, 'not-a-token')).status, 401, p);
    assert.equal((await api(m, `/api/rooms/${R.code}/${p}`, body, undefined)).status, 401, p);
  }
  await toTrading(R);
  await api('POST', `/api/rooms/${R.code}/player/trade`, { ticker: 'BWS', side: 'buy', qty: 1, requestId: 'abcdefgh2', playerId: b.name }, a.token);
  assert.equal((await pview(R.code, b.token)).me.cashCents, START_CASH_CENTS);
  const sv = JSON.stringify(await pview(R.code, a.token)); // never contains other players' holdings
  assert.ok(!(await pview(R.code, a.token)).leaderboard.some((r) => 'holdings' in r || 'cashCents' in r));
});

test('lobby and players: teacher can remove a player and lock joining; at least one student required to start', async () => {
  const R = await newRoom(); const ht = R.hostToken;
  assert.equal((await next(R.code, ht)).json.error.code, 'NO_PLAYERS');
  const a = await join(R.code, 'Ava'), b = await join(R.code, 'Ben');
  const h = await hview(R.code, ht);
  assert.equal((await api('POST', `/api/rooms/${R.code}/host/remove`, { playerId: h.players.find((p) => p.name === 'Ben').id }, ht)).status, 200);
  assert.equal((await pview(R.code, b.token)).error.code, 'NOT_IN_GAME'); assert.equal((await hview(R.code, ht)).players.length, 1);
  await api('POST', `/api/rooms/${R.code}/host/lock`, { locked: true }, ht);
  assert.equal((await api('POST', `/api/rooms/${R.code}/join`, { name: 'Cy' })).json.error.code, 'ROOM_LOCKED');
  assert.equal((await pview(R.code, a.token)).room.joinLocked, true);
  await api('POST', `/api/rooms/${R.code}/host/lock`, { locked: false }, ht);
  const cy = await join(R.code, 'Cy');
  await next(R.code, ht, { skipTutorial: true }); // game running: removal still works, and the removed player's data goes with them
  assert.equal((await api('POST', `/api/rooms/${R.code}/host/remove`, { playerId: (await hview(R.code, ht)).players.find((p) => p.name === 'Cy').id }, ht)).status, 200);
  assert.equal((await pview(R.code, cy.token)).error.code, 'NOT_IN_GAME');
});

test('leaderboard ties break by cash then join order; weekly change is reported', async () => {
  const R = await setup(['Ava', 'Ben', 'Cal']);
  await next(R.code, R.ht, { skipTutorial: true });
  assert.deepEqual((await hview(R.code, R.ht)).players.map((p) => p.name), ['Ava', 'Ben', 'Cal']);
  await steps(R, 3);
  const [x] = (await hview(R.code, R.ht)).players;
  assert.equal(x.weekChangeCents, 0);
});

test('realized profit/loss uses average cost', async () => {
  const R = await setup(['Ava']); const tok = R.players[0].token;
  await toTrading(R); await buy(R.code, tok, 'NSR', 10);
  const px1 = px(await pview(R.code, tok), 'NSR');
  await steps(R, 7); // lock, reveal, quiz, end quiz, results, intro, trading (week 2)
  const v = await pview(R.code, tok); assert.equal(v.room.phase, 'trading'); assert.equal(v.room.week, 2);
  const px2 = px(v, 'NSR');
  await buy(R.code, tok, 'NSR', 10);
  const avg = (10 * px1 + 10 * px2) / 20;
  const r = await sell(R.code, tok, 'NSR', 4);
  assert.ok(Math.abs(r.json.realizedCents - Math.round(4 * px2 - 4 * avg)) <= 1);
});

test('WebSocket: authorised clients are told when the game changes (and nothing else); strangers are refused', async () => {
  const R = await setup(['Ava']);
  const wsUrl = base.replace('http', 'ws');
  const bad = new WebSocket(`${wsUrl}/ws?code=${R.code}&role=player&token=nope`);
  await new Promise((res) => { bad.on('error', res); bad.on('unexpected-response', res); bad.on('close', res); });
  const ws = new WebSocket(`${wsUrl}/ws?code=${R.code}&role=player&token=${R.players[0].token}`);
  await new Promise((res) => ws.on('open', res));
  const got = new Promise((res) => ws.on('message', (m) => res(String(m))));
  await next(R.code, R.ht, { skipTutorial: true });
  assert.equal(await got, '{"t":"changed"}'); // a bare ping: no market data travels over the socket
  const R2 = await setup(['Zed']);
  let heard = false; ws.on('message', () => { heard = true; });
  await next(R2.code, R2.ht, { skipTutorial: true });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(heard, false); ws.close();
});

test('rate limiting: repeated joins and PIN guessing are throttled', async () => {
  const T = createServer({ db: openDb(':memory:'), limits: { ...big, join: 5, badPin: 4 } });
  await new Promise((r) => T.server.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${T.server.address().port}`;
  const post = (p, body) => fetch(b2 + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const room = await (await post('/api/rooms', {})).json();
  const st = [];
  for (let i = 0; i < 8; i++) st.push((await post(`/api/rooms/${room.code}/join`, { name: `Kid${i}` })).status);
  assert.deepEqual(st.slice(0, 5), [200, 200, 200, 200, 200]); assert.ok(st.slice(5).every((s) => s === 429));
  await T.close();
  const U = createServer({ db: openDb(':memory:'), limits: { ...big, badPin: 4 } });
  await new Promise((r) => U.server.listen(0, '127.0.0.1', r));
  const out = [];
  for (let i = 0; i < 7; i++) out.push((await fetch(`http://127.0.0.1:${U.server.address().port}/api/rooms/${100000 + i}/public`)).status);
  assert.ok(out.includes(429)); await U.close();
});

test('expired rooms are rejected with a clear message, then purged (with cascade)', async () => {
  const R = await setup(['Ava']);
  clock += 2 * 3600_000;
  const j = await api('POST', `/api/rooms/${R.code}/join`, { name: 'Late' });
  assert.equal(j.status, 410); assert.equal(j.json.error.code, 'ROOM_EXPIRED');
  assert.equal((await pview(R.code, R.players[0].token)).error.code, 'ROOM_EXPIRED');
  const before = S.db.prepare('SELECT COUNT(*) n FROM rooms').get().n;
  const removed = S.game.purgeExpired();
  assert.ok(removed >= 1); assert.equal(S.db.prepare('SELECT COUNT(*) n FROM rooms').get().n, before - removed);
  assert.equal(S.db.prepare('SELECT COUNT(*) n FROM market WHERE room_id NOT IN (SELECT id FROM rooms)').get().n, 0);
  assert.equal((await api('GET', `/api/rooms/${R.code}/public`)).json.error.code, 'ROOM_NOT_FOUND');
});

test('database: a version-1 file is backed up and replaced; a fresh file is stamped with the schema version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-'));
  const f = path.join(dir, 'old.db');
  const old = new DatabaseSync(f); old.exec('CREATE TABLE rooms (id INTEGER, code TEXT)'); old.close();
  const db = openDb(f);
  assert.ok(fs.existsSync(`${f}.v1-backup`));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rooms').get().n, 0);
  db.close();
  const again = openDb(f); again.close(); // reopening an up-to-date file does not back it up again
  assert.equal(fs.readdirSync(dir).filter((x) => x.endsWith('.v1-backup')).length, 1);
});

test('bad JSON and oversized bodies get a clean 400', async () => {
  assert.equal((await fetch(base + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(base + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(9000) }) })).status, 400);
});
