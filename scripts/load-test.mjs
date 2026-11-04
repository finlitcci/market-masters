// Simulates a classroom: N students join, trade every week, answer quizzes, over real HTTP + WebSocket.
//   npm start            (in one terminal)
//   node scripts/load-test.mjs [students] [baseUrl]
import { WebSocket } from 'ws';
const N = Number(process.argv[2] || 60), B = process.argv[3] || 'http://localhost:3001';
const j = async (m, p, b, t) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json() }; };
const t0 = Date.now();
const room = (await j('POST', '/api/rooms', { quiz: true })).j; const { code, hostToken: ht } = room;
const ps = await Promise.all(Array.from({ length: N }, (_, i) => j('POST', `/api/rooms/${code}/join`, { name: 'Student' + i }).then((r) => r.j.token)));
let pings = 0; const socks = ps.map((t) => { const w = new WebSocket(`${B.replace('http', 'ws')}/ws?role=player&code=${code}&token=${t}`); w.on('message', () => pings++); return w; });
await new Promise((r) => setTimeout(r, 500));
const host = async () => (await j('GET', `/api/rooms/${code}/host`, null, ht)).j;
const adv = async (x = {}) => { const h = await host(); return j('POST', `/api/rooms/${code}/host/advance`, { expectedPhase: h.room.phase, expectedWeek: h.room.week, ...x }, ht); };
await adv({ skipTutorial: true });
const tk = ['BWS', 'NSR', 'VDP', 'PHS', 'HLL', 'GFD', 'IRB', 'EVB', 'CBB', 'VLM', 'M100'];
let ok = 0, rejected = 0, unexpected = 0, quizOk = 0;
for (let w = 1; w <= 8; w++) {
  await adv(); // publish news, open trading
  const rs = await Promise.all(ps.flatMap((t, i) => [0, 1, 2].map((k) => j('POST', `/api/rooms/${code}/player/trade`, { ticker: tk[(i + k + w) % 11], side: 'buy', qty: 1 + ((i + k) % 4), requestId: `load-${w}-${i}-${k}-xxxx` }, t))));
  rs.forEach((r) => (r.s === 200 ? ok++ : r.j.error.code === 'INSUFFICIENT_CASH' ? rejected++ : unexpected++));
  await Promise.all(ps.map((t) => j('POST', `/api/rooms/${code}/player/submit`, { value: true }, t)));
  await adv(); await adv(); await adv(); // locked, reveal, quiz
  const answers = await Promise.all(ps.map(async (t) => { const v = (await j('GET', `/api/rooms/${code}/player`, null, t)).j; return Promise.all(v.quiz.questions.map((q) => j('POST', `/api/rooms/${code}/player/quiz`, { qid: q.id, pos: 0 }, t))); }));
  quizOk += answers.flat().filter((r) => r.s === 200).length;
  await adv(); await adv(); await adv(); // end quiz, results, next week
}
const h = await host(); const nets = h.final.ranking.map((r) => r.netCents);
console.log(JSON.stringify({ phase: h.room.phase, players: h.room.playerCount, tradesOk: ok, insufficientCash: rejected, unexpectedFailures: unexpected, quizAnswers: quizOk, expectedQuizAnswers: N * 24, wsPings: pings, rankingSorted: nets.every((v, i) => !i || nets[i - 1] >= v), seconds: (Date.now() - t0) / 1000 }));
socks.forEach((s) => s.close()); process.exit(0);
