// Real-browser end-to-end test. Starts the server, opens a teacher on a desktop viewport and two students on
// phone viewports, and plays the game by clicking through the actual interface.
// Optional dev tool: needs `npm run build` first and a Chromium (set CHROME_PATH, or run `npx playwright-core install chromium`).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { createServer } from '../index.js';
import { openDb } from '../db.js';

const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const big = { join: 1e6, badPin: 1e6, trade: 1e6, read: 1e6, host: 1e6, create: 1e6 };
const S = createServer({ db: openDb(':memory:'), limits: big });
await new Promise((r) => S.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${S.server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const problems = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => problems.push(`${who} page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push(`${who} console: ${m.text()}`); });
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  // Phones must never scroll sideways: report the widest offending elements.
  const bad = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= vw + 1) return [];
    return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('.scroll, .tabs, .stage-bar'))
      .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} right=${Math.round(e.getBoundingClientRect().right)} vw=${vw}`);
  });
  if (bad.length) problems.push(`horizontal overflow on ${name}: ${bad.join('; ')}`);
};

const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const host = await hostCtx.newPage(); watch(host, 'host');
const phone = devices['iPhone 13'];
const mk = async (name) => { const ctx = await browser.newContext({ ...phone }); const p = await ctx.newPage(); watch(p, name); return p; };

// ---- teacher creates a game
await host.goto(base + '/host');
await host.getByRole('button', { name: 'Create game' }).click();
await host.waitForSelector('.pin');
const pin = (await host.textContent('.pin')).trim();
assert.match(pin, /^\d{6}$/);
await shot(host, '01-host-lobby');

// ---- students join from their phones
const ava = await mk('ava'), ben = await mk('ben');
for (const [p, n] of [[ava, 'Ava'], [ben, 'Ben']]) {
  await p.goto(`${base}/join?pin=${pin}`);
  assert.equal(await p.inputValue('#pin'), pin); // the QR link pre-fills the PIN
  if (n === 'Ava') await shot(p, '02-student-join');
  await p.fill('#name', n);
  await p.getByRole('button', { name: 'Join game' }).click();
  await p.waitForURL('**/play');
  await p.waitForSelector('text=You are in');
}
await host.waitForSelector('text=2 players have joined');
await shot(ava, '03-student-lobby');
await ava.getByRole('button', { name: 'See how the game works' }).click();
await ava.waitForSelector('.modal .tutorial');
for (let i = 0; i < 6; i++) { if (i === 3) await shot(ava, '03b-student-tutorial-slide'); await ava.locator('.modal .btn-primary').click(); }
assert.equal(await ava.locator('.modal').count(), 0, 'the tutorial closes at the end');
await shot(host, '04-host-lobby-2players');

// ---- start, preview news privately, publish
await host.getByLabel('Skip the student introduction').check();
await host.getByRole('button', { name: 'Start game' }).click();
await host.waitForSelector('text=Private preview');
assert.equal(await host.locator('.news-card').count(), 0, 'news hidden until the teacher chooses to show it');
await ava.waitForSelector('text=Your teacher is getting');
await shot(ava, '05-student-intro-no-news');
await host.getByRole('button', { name: 'Show preview' }).click();
await host.waitForSelector('.news-card');
await shot(host, '06-host-intro-preview');
await host.getByRole('button', { name: 'Publish news and open trading' }).click();
await ava.waitForSelector('.newslist');
assert.equal(await ava.locator('.newslist li').count(), 4);
await shot(ava, '07-student-news');
await ava.locator('.newslist button').first().click();
await ava.waitForSelector('.article');
await shot(ava, '08-student-article');

// ---- Ava researches and trades through the UI
await ava.waitForSelector('.stepper');
assert.match(await ava.textContent('.action'), /Read the news|Look at the companies/);
await ava.getByRole('button', { name: 'Companies', exact: true }).click();
await ava.waitForSelector('.co-card');
await shot(ava, '09-student-markets');
await ava.getByRole('button', { name: /Open Brightwave Software/ }).click();
await ava.waitForSelector('.chart-svg');
await ava.locator('.chart-svg').hover({ position: { x: 150, y: 80 } });
await shot(ava, '10-student-company-chart');
// beginner explanations: expandable company details with a plain-English tooltip
await ava.getByRole('button', { name: 'Explore more company details' }).click();
await ava.getByRole('button', { name: 'What does P/E ratio mean?' }).click();
await ava.waitForSelector('.term-tip');
assert.match(await ava.textContent('.term-tip'), /share price divided by earnings per share/);
await shot(ava, '10b-student-company-details');
// order preview and clear errors before anything is sent
await ava.fill('.qty input', '100000');
await ava.waitForSelector('text=You need');
assert.equal(await ava.getByRole('button', { name: 'Confirm purchase' }).isDisabled(), true);
await ava.fill('.qty input', '5');
await ava.waitForSelector('text=You are buying');
assert.match(await ava.textContent('.preview'), /Total cost[\s\S]*Cash remaining/);
await shot(ava, '10c-student-order-preview');
await ava.getByRole('button', { name: 'Confirm purchase' }).click();
await ava.waitForSelector('text=Purchase complete');
await ava.getByRole('button', { name: 'Finish trading for this week' }).first().click();
await ava.waitForSelector('text=You have finished trading');
await shot(ava, '11-student-submitted');
const net0 = await ava.locator('.sum-big').textContent();
// Ben holds (does nothing) and submits
await ben.getByRole('button', { name: 'Finish trading for this week' }).first().click();
await host.waitForSelector('text=2 of 2 players have submitted');
await shot(host, '12-host-trading-monitor');

// ---- lock, reveal
await host.getByRole('button', { name: 'Lock trading' }).click();
await host.waitForSelector('text=Trading is locked');
await shot(host, '13-host-locked');
await ava.waitForSelector('text=Trading is closed');
await ava.getByRole('button', { name: 'Companies', exact: true }).click();
await ava.getByRole('button', { name: /Open Brightwave Software/ }).click();
await ava.waitForSelector('text=Your teacher has locked it');
await shot(ava, '13b-student-trading-closed');
await host.getByRole('button', { name: 'Reveal market reaction' }).click();
await host.waitForSelector('.reveal-table');
await ava.waitForSelector('text=Week 1 results');
await new Promise((r) => setTimeout(r, 1200));
await shot(host, '14-host-reveal');
await shot(ava, '15-student-reveal');
assert.notEqual(await ava.locator('.sum-big').textContent(), net0, 'portfolio value changed after the reveal');

// ---- quiz
await host.getByRole('button', { name: 'Start the quiz' }).click();
await ava.waitForSelector('.quiz');
await shot(ava, '16-student-quiz');
for (let i = 0; i < 3; i++) {
  await ava.locator('.choice').nth(i % 4).click();
  await ava.getByRole('button', { name: 'Submit answer' }).click();
  await ava.waitForSelector('.explain-box');
  if (i === 0) await shot(ava, '17-student-quiz-explained');
  await ava.getByRole('button', { name: /Next question|Finish quiz/ }).click();
}
await ava.waitForSelector('text=Quiz complete');
// teacher: only a finish count while students answer, no questions or answers
await host.waitForSelector('text=1 of 2 students have finished the quiz');
assert.equal(await host.locator('.qstats').count(), 0, 'no questions or answers on the projector during the quiz');
assert.equal(await host.getByText('Explanation:').count(), 0);
await shot(host, '18-host-quiz-progress');
await host.getByRole('button', { name: 'End quiz' }).click();
await host.waitForSelector('.qstats');
assert.equal(await host.locator('.qstats article').count(), 3);
assert.match(await host.textContent('.qstats'), /Explanation:/);
await shot(host, '18b-host-quiz-questions-and-answers');
await ben.waitForSelector('text=The quiz is over');

// ---- leaderboard and reflection
await host.getByRole('button', { name: 'Show the leaderboard' }).click();
await host.waitForSelector('.board');
await new Promise((r) => setTimeout(r, 1600));
await shot(host, '19-host-leaderboard');
await ava.getByRole('heading', { name: /Week 1 reflection/ }).waitFor();
await shot(ava, '20-student-reflection');
await ava.getByRole('button', { name: 'Leaderboard', exact: true }).click();
await shot(ava, '21-student-leaderboard');
await ava.getByRole('button', { name: 'My Portfolio', exact: true }).click();
await shot(ava, '22-student-portfolio');

// ---- the same student on a laptop-sized screen
await ava.setViewportSize({ width: 1280, height: 900 });
await shot(ava, '22b-desktop-portfolio');
await ava.getByRole('button', { name: 'Companies', exact: true }).click();
await shot(ava, '22c-desktop-companies');
await ava.getByRole('button', { name: /Open Brightwave Software/ }).click();
await ava.waitForSelector('.chart-svg');
await shot(ava, '22d-desktop-company');
await ava.getByRole('button', { name: /^News/ }).click();
await ava.locator('.newslist button').first().click();
await ava.waitForSelector('.think');
await shot(ava, '22e-desktop-article');
await ava.setViewportSize({ width: 390, height: 664 });

// ---- play the remaining weeks via the teacher's own session, then check the finale
const advance = () => host.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('mm.host'));
  const h = await (await fetch(`/api/rooms/${s.code}/host`, { headers: { authorization: `Bearer ${s.token}` } })).json();
  if (h.room.phase === 'final') return 'final';
  await fetch(`/api/rooms/${s.code}/host/advance`, { method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ expectedPhase: h.room.phase, expectedWeek: h.room.week }) });
  return h.room.phase;
});
await host.getByRole('button', { name: 'Start Week 2' }).click();
for (let i = 0; i < 200; i++) if ((await advance()) === 'final') break;
await host.waitForSelector('text=Final results');
await shot(host, '23-host-final');
await ava.waitForSelector('text=Your report');
await shot(ava, '24-student-final');
await shot(ben, '25-student-final-ben');

await browser.close(); await S.close();
assert.deepEqual(problems, [], problems.join('\n'));
console.log(`browser end-to-end test passed (pin ${pin}); ${fs.readdirSync(SHOTS).length} screenshots in ${SHOTS}`);
