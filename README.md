# Market Masters 2.0: The $1,000 Investing Challenge

A multiplayer classroom investing simulator for high school financial literacy. Students join on their phones with a PIN or QR code,
start with **$1,000 of simulated money**, and spend eight weeks reading fictional company news, buying and selling shares, and seeing
how the market reacts. Each week ends with a short quiz and a reflection. The teacher controls the pace from a projector.

Everything is fictional and simulated: no real companies, no real money, no accounts, no personal information.

Guides: [Teacher guide](docs/TEACHER_GUIDE.md) | [Student guide](docs/STUDENT_GUIDE.md) | [Customizing](docs/CUSTOMIZING.md) | [Deployment](docs/DEPLOY.md) | [Test report](docs/TEST_REPORT.md)
Teacher-only references: [Event schedule](docs/EVENT_SCHEDULE.md) | [Quiz bank and answer key](docs/QUIZ_BANK.md) | [Companies](docs/COMPANIES.md)

## Quick start (free, on your own computer)

You need **Node.js 22.13 or newer** (it contains SQLite, so there is no database to install). Check with `node -v`; get it from nodejs.org (LTS).
Run these in the folder that contains `package.json`:

```bash
npm install
npm run build
npm start
```

1. On the teacher computer open **http://localhost:3001/host** and click *Create game*.
2. Students on the **same Wi-Fi** scan the QR code. The server swaps `localhost` for this computer's Wi-Fi address so the QR code works on phones.
3. To try it alone: open the host page in one window and `/join` in a private window or on your phone.

Development: `npm run dev` (server on 3001 plus hot-reloading app on 5173).

> A phone cannot open `localhost` on your computer, and many school networks stop devices talking to each other. If the QR code does not work in
> class, host the game on a public HTTPS address: see [docs/DEPLOY.md](docs/DEPLOY.md).

Upgrading from version 1? Your old database file is renamed to `*.v1-backup` automatically and a new one is created.

## What is new in 2.1 (beginner-first interface)

- **Always clear what to do next:** a six-step weekly progress bar and a highlighted "next step" card. The button students use to say they are done is **Finish trading for this week** (it is not an order).
- **Four simple sections:** My Portfolio, Companies, News, Leaderboard. Portfolio value is shown as cash + invested in shares = total.
- **Companies and company pages:** full names first, plain-English risk levels, a beginner "at a glance" section, and the advanced numbers (P/E, margins, debt and more) in an expandable section with an explanation for each.
- **Trading with an order preview:** "You are buying 2 shares at $25.00 each. Total cost, cash remaining." Clear messages when an order cannot go through or trading is closed.
- **News reader** with company/industry/economy labels, affected companies, key figures, and a "Think like an investor" box. No hints about price direction before the reveal.
- **Tutorial** with a welcome screen and five illustrated lessons, available any time from **How it works**.
- **Bento-tile visual style** (dark violet-charcoal, lime accent, rounded tiles, mono numerals).

## What is new in 2.0

- **Event-driven market.** Ten fictional companies plus a diversified fund. Every week brings four news stories (company, industry, economy). Prices react to the stories through a documented, configurable formula; randomness is only a small secondary factor. Stories are written to be ambiguous: strong sales can come with falling margins, and bad-sounding headlines can be mild.
- **Weekly sequence:** teacher previews the news privately, publishes it and opens trading; students research and trade; trading locks (optional discussion period); market reveals with an explanation of what drove each price; three-question quiz (the teacher screen shows only a finish count until the teacher clicks **End quiz**, which closes answering and reveals the questions, answers and class results); leaderboard and personal reflection; next week.
- **Quiz:** 3 four-choice questions a week from a bank of 40 (your 24 plus 16 more), shuffled per student, answered once, with explanations. The teacher sees class-wide results and the most common mistakes. Quiz scores never touch the portfolio ranking.
- **Final report** for each student: return, cash, holdings, weekly performance, quiz results by topic, comparison with the fund, and lessons learned.
- **Professional trading-style interface:** dark navy/charcoal theme, price charts with volume, tooltips and axes, compact tables, watchlist, company pages, and a news reader. It was tested in a real browser at desktop and phone sizes.

## Architecture

| Piece | Choice | Why |
|---|---|---|
| Front end | React + TypeScript + Vite; hand-written SVG charts | Phone-first student UI and projector teacher UI, no chart library to break |
| Server | Node.js + Express | One small process serves the app, the API, and WebSockets |
| Database | SQLite (built into Node as `node:sqlite`), one file | Free, nothing to install, real transactions, survives restarts |
| Live updates | WebSocket pings | A ping only says "something changed"; each client then re-fetches **its own authorised view**, so no market data or other player's data travels over the socket |
| QR code | `qrcode`, drawn in the browser from the real join URL | Never decorative; the tests decode it and compare |

Code is separated by responsibility:

| File | Responsibility |
|---|---|
| `server/engine.js` | Market simulation (pure functions, seeded, documented formula) |
| `server/game.js` | Rooms, players, trading engine, phases, views, reflections, final report |
| `server/quizEngine.js` | Question selection, answer shuffling, grading, class statistics |
| `server/data/` | Companies, event schedule, quiz bank (the content you edit) |
| `server/db.js` | Schema (versioned; created automatically, no migration step) |
| `server/index.js` | HTTP routes, WebSocket, rate limits, static hosting |
| `src/` | React interface |

### The server is authoritative
Browsers never compute prices, balances, scores, or correct answers.

- **Rooms/PINs:** random 6-digit PIN, unique; rooms expire after 24 hours of inactivity and are then rejected and purged.
- **Teacher security:** creating a game returns a random host token kept only in that browser; only its SHA-256 hash is stored. Every teacher call needs it, so students cannot invoke teacher actions.
- **Students:** joining returns a random player token (hash stored). A request carries no player id, so it can only affect the token's owner. A phone that clears its storage cannot reclaim its player.
- **Trades:** one transaction re-reads phase, cash, and holdings. Money is integer cents; shares are whole numbers; the database enforces `cash >= 0`. A client request id (unique index) makes retries and double-taps apply once.
- **Market:** generated on the server when the teacher reveals, from the room's random seed plus the event schedule, and stored once per room/week (primary keys). Refresh, reconnect, or repeated clicks cannot reroll it. The seed is shown to the teacher only after the game ends, for auditing.
- **No future information to students:** news for weeks not yet published, hidden signals, severity, price outcomes, and the seed are never in any student API response or WebSocket message (a test scans the responses for them). Correct quiz answers are sent only after a student submits that question.
- **Rate limits** on joins, PIN guessing, trades, and teacher calls (in memory; generous because a class often shares one school IP).
- **Names:** trimmed, 2-16 characters, duplicate check, basic filter; the teacher can remove any player at any time before the final screen.

### The market model (short version)
Per company and week: **event impact** (relevance x severity x factor weight x surprise x company sensitivity, summed over the week's stories)
adjusted for **investor expectations**, plus a small **random component**, passed through a **soft cap**, rounded to cents. The Market 100 ETF is the
average of the ten companies. Full formula, weights, and every story's hidden signals: [docs/EVENT_SCHEDULE.md](docs/EVENT_SCHEDULE.md) and the header of `server/engine.js`.
This is an educational model; it does not predict real markets.

### Database
Tables: `rooms`, `players`, `holdings`, `trades` (timestamp, player, investment, quantity, price, type, request id), `market` (weekly price and volume, including 12 weeks of pre-game history),
`reactions` (how each move was produced), `snapshots` (portfolio and rank after each week), `quiz_answers` (one row per answered question). See `server/db.js`.
The schema version is stored in the file; there is nothing to migrate.

## Environment variables
`PORT` (default 3001), `DB_FILE` (default `./data/market-masters.db`), `PUBLIC_URL` (your public HTTPS address, used in the QR code), `TRUST_PROXY` (set to 1 behind a hosting proxy). See `.env.example`. No secret keys exist anywhere.

## Commands
`npm test` (43 automated tests) | `npm run test:e2e` (real-browser test, needs Chromium) | `npm run docs` (regenerate the reference docs from the data) | `npm run build` | `npm run typecheck` | `node scripts/load-test.mjs 60` (classroom simulation against a running server).

## Known limitations
See the end of [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Deploy to Render

This repository includes a Render Blueprint (`render.yaml`) and a GitHub Actions workflow. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the GitHub-to-Render setup, persistent SQLite disk requirements, and post-deployment checks. Use one paid Render instance with the `/data` persistent disk; do not scale this SQLite/WebSocket application horizontally.
