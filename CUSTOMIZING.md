# Customizing the game

All content lives in `server/data/` and `server/engine.js`. After editing, run `npm test` (it checks that your data is still valid) and `npm run docs` (it regenerates the reference documents), then restart the server. Games already in progress keep their stored prices; new games use the new content.

## Companies: `server/data/companies.js`
Each company has a ticker, name, industry, opening price (`startCents`), description, financial figures shown to students (revenue growth, margins, debt, dividend yield, EPS, shares outstanding), and three hidden settings:
- `vol` (`Lower`, `Medium`, `Higher`): size of the random component and the cap on a single week's move.
- `expectations` (0 to 1): how much good news is already "priced in". High values dampen good news and amplify bad news.
- `sens`: how strongly the company reacts to economy-wide news (interest rates, consumer demand, regulation, supply chains, market sentiment). Negative `rates` means the price falls when rates rise; the bank is positive.

Keep 8 to 12 companies and use fictional names. The ETF is the equal-weighted average of all companies in the list.

## News events: `server/data/events.js`
Each event: `id`, `week` (1 to 8), `time`, `type` (`company`, `industry`, `macro`), `headline`, `body` (aim for 25 to 50 words), `figures`, `concerns` (tickers shown to students), `severity` (0 to 1), and `effects`.
An effect has a `target` (a ticker, `{ industry: '...' }`, or `'ALL'`), a `relevance` (0 to 1), and `signals`: surprises **relative to what investors expected**, from -1 to +1:

| Signal | Meaning |
|---|---|
| `rev`, `mar`, `out`, `cash`, `comp` | Revenue, profit margin, management outlook, cash flow, competitive position vs expectations (+ is better) |
| `rates` | Borrowing costs rising (+) |
| `dem` | Consumer demand stronger (+) |
| `reg` | Rules more favourable (+) |
| `sup` | Supply chains improving (+) |
| `sent` | Investors more willing to take risk (+) |

Design tip: **mix signs** to make ambiguous stories (revenue +, margin -). Net impact near zero means the random element decides the direction, which is the point. Never put the outcome in the headline or article. The tests reject words such as "bullish", "bearish", "will rise", and "buy/sell".
Run `npm run docs` and read `docs/EVENT_SCHEDULE.md`: it shows each story's expected impact and whether it is clearly positive, mild, or ambiguous.

## Price-impact settings: `server/engine.js` and `companies.js`
- `FACTOR_WEIGHTS`: price change caused by a full-strength surprise of +1 for each factor.
- `EXPECTATION_STRENGTH`: how much expectations dampen good news and amplify bad news.
- `NOISE_SIGMA` and `MOVE_CAP` (in `companies.js`): size of the random component and the cap on weekly moves.
Raise the weights for bigger moves overall; raise `NOISE_SIGMA` to make outcomes less predictable. `npm test` checks that large moves stay rare, clear stories stay clear, and ambiguous ones stay ambiguous.

## Quiz questions: `server/data/quiz.js`
Add or edit `Q(id, 'question', [A, B, C, D], correctIndex, 'explanation')` entries. Each week needs at least 3 questions (5 in the supplied bank; 3 are drawn per game). Options must be four distinct strings; `correctIndex` is 0 to 3. Distractors should be plausible misconceptions. Students see shuffled order; the correct answer is never sent before they submit.
Each week also has a `topic`, a `concept` (shown in the reflection), and `consider` prompts (shown before the next week).

## Other settings
- Starting cash, number of weeks, and the price floor: `server/content.js`.
- Awards and their rules: `server/game.js` (`#final`), with the rules text in `server/content.js`.

## Look and feel
Colours, corner radii, and fonts are CSS variables at the top of `src/styles.css` (`:root`): `--accent` (the lime used for gains and the "next step" tile), `--lilac`, `--down`, `--bg`, `--panel`, `--tile` (corner radius). Plain-English explanations of financial terms and risk levels are in `src/Screens.tsx` (`TIPS`) and `src/ui.tsx` (`RISK_TEXT`); the tutorial lessons are in `src/Tutorial.tsx`.
