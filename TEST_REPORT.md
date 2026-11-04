# Test report (version 2.1)

Run in the build sandbox: Node 22.22, Linux, headless Chromium. Commands: `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run build`, `node scripts/load-test.mjs 60`.

## Results of tests actually run

| Check | Result |
|---|---|
| `npm test`: 43 automated tests (20 engine/quiz/data tests, 23 integration tests over real HTTP, real SQLite, real WebSocket clients) | 43 passed, 0 failed |
| `npm run test:e2e`: a real browser plays a whole game through the interface (teacher on a 1440x900 desktop viewport, two students on an iPhone 13 phone viewport, one student also at 1280x900): create game, join with the PIN link, the tutorial from the Help button, private news preview and publish, the progress stepper and "next step" card, news and article, the Companies list, a company page with the expandable details and an explanation tooltip, order preview and the "not enough cash" message, buying shares, **Finish trading for this week**, the "trading is closed" explanation after the teacher locks, reveal, quiz with explanations, leaderboard, reflection, all 8 weeks, final reports. Fails on any page error, console error, or horizontal scrolling on a phone. Run twice in a row after the last change | passed both times, 33 screenshots (34 after the later End-quiz change) |
| `npm run typecheck` (TypeScript strict) and `npm run build` | passed |
| `npm audit --omit=dev` | 0 vulnerabilities (one advisory in a dependency was found and fixed with `npm audit fix`) |
| Load simulation against the production server with default rate limits: 60 students, WebSockets, 8 full weeks, 543 purchases accepted and 897 correctly rejected for insufficient cash, all 1,440 quiz answers recorded | finished in 12.5 s, 0 unexpected failures, final ranking sorted correctly |

## Your section 7 checklist

| Requirement | Status | How it was verified |
|---|---|---|
| Teacher creates a room; students join through a PIN | Tested | API tests; browser test joins by PIN link |
| QR code points to the correct join page | Tested | QR rendered to an image and decoded with a QR reader, for the local address and for `PUBLIC_URL`; browser test confirms the join link pre-fills the PIN |
| Every player starts with exactly $1,000 | Tested | |
| Valid buys and sells | Tested | cash, shares, average cost, and realized profit checked; trade audit rows saved |
| Invalid trades rejected without changing balances | Tested | over-budget, unowned, oversell, bad quantities, closed phases; state compared before and after |
| Every student sees the same events and prices | Tested | |
| Outcomes generated once and persisted across refreshes | Tested | repeated reads, repeated "reveal" clicks rejected as stale, row counts checked |
| Event engine gives plausible outcomes for positive, negative and ambiguous news | Tested | statistics over thousands of random seeds: clear stories move the expected way over 88 to 90% of the time, mixed-signal stories are close to a coin flip (30 to 80% up), Northstar's strong sales with falling margins is more often down than up, revenue growth that misses expectations falls, macro news hits companies differently, large moves are under 1% of company-weeks |
| Students cannot access future outcomes before the reveal | Tested | every student and teacher response is scanned for future event ids, headlines, article text, hidden signals, severity, and the seed; WebSocket carries only a bare ping |
| Quizzes score correctly and explain answers | Tested | every question at every shuffle position; correct answer only revealed after submitting; one attempt per question; progress saved across refresh |
| Quiz results separate from investment returns | Tested | quiz answers change no money; ranking order checked against net worth with students scoring 24/24 and 0/24 |
| Leaderboard updates correctly | Tested | ranking, ties, weekly change, movement; also seen in the browser |
| Teacher controls inaccessible to students | Tested | every teacher endpoint rejects student tokens, no token, and another game's teacher token |
| Works on mobile and desktop | Partly tested | Chromium at desktop size and an iPhone 13 viewport, with a no-sideways-scroll check on every phone screen. **Not tested on real phones, Safari, or Firefox** |
| Multiple students play simultaneously | Tested | 60 simulated clients; 20 parallel identical requests give one trade; 40 parallel purchases never overdraw |
| Final eight-week report accurate | Tested | recomputed independently from cash and prices for every student; weekly series, holdings, quiz totals, replay of every stored price from the seed |
| Automated tests for trading, market generation, event impacts, quiz scoring, permissions | Done | see `server/test/` |

Also tested: expiring and purging rooms, name rules, removing players (also mid-game), rate limiting, bad or oversized request bodies, and upgrading from a version 1 database file (backed up, fresh file created).

## Visual review
After the **End quiz** change I looked at the two new teacher screens by eye (quiz progress with no questions shown, and the questions-and-answers screen after End quiz). The automated tests check that no question text or explanation is sent to the teacher screen while students answer, that answering is rejected once the quiz is ended, and that students can still see their own answers afterwards.

I looked at these screenshots by eye after the redesign: the student news screen and the home layout on a phone, the desktop portfolio, the desktop Companies list, the desktop company page, the order preview on a phone, a tutorial lesson, and the teacher's market-reveal screen. Problems found and fixed from that review: amounts in the cash/invested/total boxes wrapped onto two lines (replaced by a receipt-style breakdown), the summary tile was cramped on desktop, a leftover callout style appeared on explanatory text, a single weekly bar was stretched across its tile, and a chart label overlapped the axis. A test race also revealed a real usability problem, now fixed: locking trading used to move a student who was reading a company page back to the portfolio; students now stay where they are and see why trading is closed.
**Produced but not inspected by eye:** the article page with "Think like an investor", the expanded company details and tooltip, the quiz, reflection, leaderboard, "trading is closed" view, the student final report, the join and landing pages, and the teacher's lobby, monitor and leaderboard screens in the new colours (the teacher screens were reviewed before the restyle, and one, the reveal screen, after it). The automated checks above did run on every one of these screens.

## Not tested: needs you
- **Real phones and projector:** layout, tap size, readability across the room, camera scanning of the QR code, Safari/iOS, Firefox, tablets.
- **Your Windows computer:** the install steps and Node 22.13 or newer. (Built-in SQLite needs it.) Version 22.22 was tested; Node 24 was not.
- **Same-Wi-Fi play on your school network**, public HTTPS deployment, the Dockerfile, and WebSockets through a proxy.
- **Accessibility audit** (screen reader, keyboard-only). Focus outlines, labels, arrows with colour, reduced-motion support, and a keyboard-operable chart tooltip are included but not formally checked.
- **A real class.** Run one practice game with 2 or 3 phones first.

## Remaining limitations
- **The news schedule is fixed.** Every game uses the same 32 stories. Random noise and the order of quiz questions differ per game, but a student who played before knows the stories. Edit `server/data/events.js` to vary them (see CUSTOMIZING.md).
- Dividends are shown on company pages but not paid; fees are not modelled; the ETF is a simple equal-weight average. The price model is simple and educational, not a forecast.
- Single server process with one SQLite file (no horizontal scaling). Run one instance.
- A student who clears browser data or switches device cannot reclaim their player. The teacher can unlock joining so they join under a new name.
- Whoever holds the teacher's browser session controls the game. There are no teacher accounts.
- The name filter is a basic blocklist; teacher removal is the safety net.
- Rate limits are in memory and reset on restart. Rooms are deleted after 24 hours of inactivity (by a purge at start-up and hourly).
- English only; the price chart shows weekly closes (no intra-week data).
- The look is written in plain CSS. The Tailwind/shadcn component supplied as a style reference was used as inspiration for the visual language, not installed as a dependency.
- The student's progress steps (read news, explored companies, made decisions) are tracked in that browser only. They guide the "next step" card and are not stored on the server.
