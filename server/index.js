import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openDb } from './db.js';
import { Game, GameError } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Small in-memory sliding-window limiter. Good enough for a single-instance classroom server. */
export function limiter(max, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) { const keep = v.filter((t) => t > cutoff); keep.length ? hits.set(k, keep) : hits.delete(k); }
  }, windowMs).unref();
  const check = (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => t > now - windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now); hits.set(key, arr); return true;
  };
  check.stop = () => clearInterval(timer);
  return check;
}

const lanIp = () => {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
};

export function createServer(opts = {}) {
  const db = opts.db || openDb(opts.dbFile);
  const clients = new Map(); // room code -> Set<WebSocket>
  const game = new Game(db, {
    ...opts.game,
    onChange: (code) => {
      for (const ws of clients.get(code) || []) if (ws.readyState === 1) ws.send('{"t":"changed"}');
    },
  });
  const L = {
    join: limiter(opts.limits?.join ?? 120, 60_000),
    badPin: limiter(opts.limits?.badPin ?? 30, 60_000),
    trade: limiter(opts.limits?.trade ?? 60, 60_000),
    read: limiter(opts.limits?.read ?? 400, 60_000),
    host: limiter(opts.limits?.host ?? 200, 60_000),
    create: limiter(opts.limits?.create ?? 20, 60_000),
  };
  const limit = (bucket, key) => { if (!L[bucket](key)) throw new GameError(429, 'RATE_LIMIT', 'Too many requests. Wait a moment and try again.'); };

  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '4kb' }));

  const bearer = (req) => (req.get('authorization') || '').replace(/^Bearer /i, '');
  const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };

  /** The URL students should use. Replaces "localhost" with the computer's Wi-Fi address so a QR scan works on a phone. */
  const baseUrl = (req) => {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
    const host = req.get('host') || 'localhost';
    const hostname = host.replace(/:\d+$/, '');
    if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      const ip = lanIp();
      const port = (host.match(/:(\d+)$/) || [])[1];
      if (ip) return `http://${ip}${port ? ':' + port : ''}`;
    }
    return `${req.protocol}://${host}`;
  };
  const joinInfo = (req, code) => {
    const base = baseUrl(req);
    return { joinUrl: `${base}/join?pin=${code}`, secure: base.startsWith('https://') };
  };

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/rooms', wrap((req, res) => {
    limit('create', req.ip);
    const { code, hostToken } = game.createRoom({ quiz: req.body?.quiz !== false, discussion: !!req.body?.discussion });
    res.status(201).json({ code, hostToken, ...joinInfo(req, code) });
  }));

  app.get('/api/rooms/:code/public', wrap((req, res) => {
    try { limit('read', req.ip); res.json(game.publicInfo(req.params.code)); }
    catch (e) { if (e.status === 404) limit('badPin', req.ip); throw e; }
  }));

  app.post('/api/rooms/:code/join', wrap((req, res) => {
    limit('join', req.ip);
    try { res.json(game.join(req.params.code, req.body?.name, req.body?.token)); }
    catch (e) { if (e.status === 404) limit('badPin', req.ip); throw e; }
  }));

  // ---- student
  app.get('/api/rooms/:code/player', wrap((req, res) => {
    limit('read', bearer(req) || req.ip);
    res.json(game.playerView(req.params.code, bearer(req)));
  }));
  app.post('/api/rooms/:code/player/trade', wrap((req, res) => {
    limit('trade', bearer(req) || req.ip);
    const b = req.body || {};
    res.json(game.trade(req.params.code, bearer(req), { ticker: b.ticker, side: b.side, qty: b.qty, requestId: b.requestId }));
  }));
  app.post('/api/rooms/:code/player/submit', wrap((req, res) => {
    limit('trade', bearer(req) || req.ip);
    res.json(game.setSubmitted(req.params.code, bearer(req), req.body?.value !== false));
  }));
  app.post('/api/rooms/:code/player/quiz', wrap((req, res) => {
    limit('trade', bearer(req) || req.ip);
    res.json(game.answerQuiz(req.params.code, bearer(req), { qid: req.body?.qid, pos: req.body?.pos }));
  }));

  // ---- teacher (host token required on every call)
  app.get('/api/rooms/:code/host', wrap((req, res) => {
    limit('host', req.ip);
    res.json({ ...game.hostView(req.params.code, bearer(req)), ...joinInfo(req, req.params.code) });
  }));
  app.post('/api/rooms/:code/host/advance', wrap((req, res) => {
    limit('host', req.ip);
    const b = req.body || {};
    game.advance(req.params.code, bearer(req), { expectedPhase: b.expectedPhase, expectedWeek: b.expectedWeek, skipTutorial: !!b.skipTutorial });
    res.json({ ok: true });
  }));
  app.post('/api/rooms/:code/host/end', wrap((req, res) => { limit('host', req.ip); game.endGame(req.params.code, bearer(req)); res.json({ ok: true }); }));
  app.post('/api/rooms/:code/host/reset', wrap((req, res) => { limit('host', req.ip); game.reset(req.params.code, bearer(req)); res.json({ ok: true }); }));
  app.post('/api/rooms/:code/host/lock', wrap((req, res) => { limit('host', req.ip); game.setJoinLock(req.params.code, bearer(req), !!req.body?.locked); res.json({ ok: true }); }));
  app.post('/api/rooms/:code/host/remove', wrap((req, res) => { limit('host', req.ip); game.removePlayer(req.params.code, bearer(req), req.body?.playerId); res.json({ ok: true }); }));

  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));

  // ---- static front end (after `npm run build`)
  const dist = opts.distDir || path.join(__dirname, '..', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.use((req, res) => res.status(200).type('text').send('Front end not built yet. Run "npm run build", or use "npm run dev" and open http://localhost:5173'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Bad request.' } });
    console.error(err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Try again.' } });
  });

  // ---- WebSocket: only says "something changed"; clients re-fetch their own authorised view.
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname !== '/ws') throw new Error('path');
      const code = url.searchParams.get('code') || '';
      const token = url.searchParams.get('token') || '';
      const role = url.searchParams.get('role');
      if (role === 'host') game.hostView(code, token); else game.playerView(code, token); // validates access
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        if (!clients.has(code)) clients.set(code, new Set());
        clients.get(code).add(ws);
        ws.on('close', () => { clients.get(code)?.delete(ws); if (!clients.get(code)?.size) clients.delete(code); });
        ws.on('error', () => ws.terminate());
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
    }
  });
  const beat = setInterval(() => {
    for (const set of clients.values()) for (const ws of set) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 30_000).unref();
  const purge = setInterval(() => game.purgeExpired(), 3600_000).unref();

  const close = () => new Promise((resolve) => {
    clearInterval(beat); clearInterval(purge);
    Object.values(L).forEach((l) => l.stop());
    for (const set of clients.values()) for (const ws of set) ws.terminate();
    server.close(() => { db.close(); resolve(); });
    server.closeAllConnections?.();
  });
  return { app, server, game, db, close };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3001;
  const { server, game } = createServer();
  const purged = game.purgeExpired();
  server.listen(port, '0.0.0.0', () => {
    const ip = lanIp();
    console.log(`\nMarket Masters server running.`);
    console.log(`  Teacher (this computer):  http://localhost:${port}/host`);
    if (ip) console.log(`  Phones on the same Wi-Fi: http://${ip}:${port}/`);
    if (process.env.PUBLIC_URL) console.log(`  Public URL (PUBLIC_URL):  ${process.env.PUBLIC_URL}`);
    if (purged) console.log(`  Removed ${purged} expired game(s).`);
  });
}
