import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWeek, eventImpact, summarizeDrivers, buildHistory, FACTOR_WEIGHTS } from '../engine.js';
import { COMPANIES, ETF, MOVE_CAP } from '../data/companies.js';
import { EVENTS } from '../data/events.js';
import { QUIZ } from '../data/quiz.js';
import { weekQuestions, optionOrder, grade, classStats } from '../quizEngine.js';
import { newSeed } from '../rng.js';
import { MIN_PRICE_CENTS, ASSETS } from '../content.js';
import { validateName } from '../names.js';

const start = Object.fromEntries(ASSETS.map((a) => [a.ticker, a.startCents]));
const wk = (w) => EVENTS.filter((e) => e.week === w);
const co = (t) => COMPANIES.find((c) => c.ticker === t);
const impact = (t, w) => eventImpact(co(t), wk(w)).adjusted;
/** Share of random seeds in which `ticker` ends the week higher, plus its mean change. */
function sample(ticker, week, n = 3000) {
  let up = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const r = computeWeek({ seed: newSeed(), week, prevPrices: start, events: wk(week) });
    if (r.changes[ticker] > 0) up++;
    sum += r.changes[ticker];
  }
  return { pUp: up / n, mean: sum / n };
}

// ---------------------------------------------------------------- engine
test('same seed + week + prices + events reproduces exactly; different seeds differ', () => {
  const s = newSeed();
  const a = computeWeek({ seed: s, week: 3, prevPrices: start, events: wk(3) });
  assert.deepEqual(a, computeWeek({ seed: s, week: 3, prevPrices: start, events: wk(3) }));
  assert.notDeepEqual(a.prices, computeWeek({ seed: newSeed(), week: 3, prevPrices: start, events: wk(3) }).prices);
});

test('prices are whole cents, positive, never above the soft cap, and the ETF is the average of the companies', () => {
  for (let i = 0; i < 500; i++) {
    const w = 1 + (i % 8);
    const r = computeWeek({ seed: newSeed(), week: w, prevPrices: start, events: wk(w) });
    for (const c of COMPANIES) {
      assert.ok(Number.isInteger(r.prices[c.ticker]) && r.prices[c.ticker] >= MIN_PRICE_CENTS);
      assert.ok(Math.abs(r.changes[c.ticker]) <= MOVE_CAP[c.vol] + 0.001, `${c.ticker} ${r.changes[c.ticker]}`);
      assert.ok(r.volumes[c.ticker] > 0);
    }
    const avg = COMPANIES.reduce((a, c) => a + r.changes[c.ticker], 0) / COMPANIES.length;
    assert.ok(Math.abs(r.changes[ETF.ticker] - avg) < 0.0005);
  }
});

test('price floor holds from very low prices', () => {
  const low = Object.fromEntries(ASSETS.map((a) => [a.ticker, 100]));
  for (let i = 0; i < 300; i++) for (const w of [3, 5, 8]) {
    const r = computeWeek({ seed: newSeed(), week: w, prevPrices: low, events: wk(w) });
    assert.ok(Object.values(r.prices).every((p) => p >= MIN_PRICE_CENTS));
  }
});

test('clearly positive news -> usually up; clearly negative news -> usually down', () => {
  assert.ok(impact('PHS', 2) > 0.02);              // hospital contract
  assert.ok(sample('PHS', 2).pUp > 0.88);
  assert.ok(impact('IRB', 6) > 0.03);              // large rail order
  assert.ok(sample('IRB', 6).pUp > 0.9);
  assert.ok(impact('IRB', 3) < -0.03);             // supply-chain delays
  assert.ok(sample('IRB', 3).pUp < 0.12);
  assert.ok(impact('VDP', 7) < -0.02);             // solar farm delayed
  assert.ok(sample('VDP', 7).pUp < 0.2);
});

test('ambiguous news is genuinely uncertain: mixed signals net out near zero and the direction is close to a coin flip', () => {
  for (const [t, w] of [['BWS', 1], ['VLM', 3], ['EVB', 4], ['VDP', 4], ['NSR', 1], ['GFD', 1]]) {
    assert.ok(Math.abs(impact(t, w)) < 0.012, `${t} week ${w}: ${impact(t, w)}`);
    const s = sample(t, w, 2000);
    assert.ok(s.pUp > 0.3 && s.pUp < 0.8, `${t} week ${w} pUp=${s.pUp}`);
  }
});

test('good sales do not guarantee a rise: Northstar (revenue +12%, margin 34% to 29%) is more often down than up', () => {
  const ev = wk(1).find((e) => e.id === 'w1-nsr');
  assert.ok(ev.effects[0].signals.rev > 0, 'revenue signal is positive');
  assert.ok(impact('NSR', 1) < 0);
  const s = sample('NSR', 1);
  assert.ok(s.mean < 0 && s.pUp > 0.2 && s.pUp < 0.46, `pUp=${s.pUp}`);
});

test('negative-sounding news can be mild, and revenue growth below expectations can hurt (Brightwave +20% vs 35% expected)', () => {
  assert.ok(Math.abs(impact('PHS', 7)) < 0.015); // recall of under 2% of sales
  assert.ok(impact('BWS', 6) < -0.02);
  assert.ok(sample('BWS', 6).pUp < 0.2);
});

test('macro news affects companies differently (rates +0.50% hits indebted growth firms, spares the bank)', () => {
  const mean = (t) => sample(t, 5, 1500).mean;
  const vdp = mean('VDP'), bws = mean('BWS'), cbb = mean('CBB'), evb = mean('EVB');
  assert.ok(vdp < bws && bws < evb && evb < cbb, `VDP ${vdp} BWS ${bws} EVB ${evb} CBB ${cbb}`);
  assert.ok(cbb > -0.01 && vdp < -0.04);
});

test('high investor expectations dampen good news and amplify bad news', () => {
  const mk = (e) => ({ ...co('NSR'), expectations: e });
  const good = [{ id: 'g', severity: 1, effects: [{ target: 'NSR', relevance: 1, signals: { rev: 0.5 } }] }];
  const bad = [{ id: 'b', severity: 1, effects: [{ target: 'NSR', relevance: 1, signals: { rev: -0.5 } }] }];
  assert.ok(eventImpact(mk(0.9), good).adjusted < eventImpact(mk(0.2), good).adjusted);
  assert.ok(eventImpact(mk(0.9), bad).adjusted < eventImpact(mk(0.2), bad).adjusted); // more negative
});

test('impact is relevance x severity x weight x surprise x sensitivity (documented formula)', () => {
  const c = { ...co('IRB'), expectations: 0.5 };
  const ev = [{ id: 'x', severity: 0.5, effects: [{ target: 'IRB', relevance: 0.8, signals: { sup: 0.5, rev: 0.25 } }] }];
  const expected = 0.8 * 0.5 * (FACTOR_WEIGHTS.sup * 0.5 * c.sens.supply + FACTOR_WEIGHTS.rev * 0.25 * 1);
  assert.ok(Math.abs(eventImpact(c, ev).adjusted - expected) < 0.0002);
  assert.deepEqual(eventImpact(c, [{ id: 'y', severity: 1, effects: [{ target: 'BWS', relevance: 1, signals: { rev: 1 } }] }]).contribs, []); // unrelated target
});

test('large moves are rare: under 1% of company-weeks exceed 10%, and the typical move is small', () => {
  let big = 0, n = 0; const abs = [];
  for (let i = 0; i < 1500; i++) {
    let p = { ...start };
    const seed = newSeed();
    for (let w = 1; w <= 8; w++) {
      const r = computeWeek({ seed, week: w, prevPrices: p, events: wk(w) });
      for (const c of COMPANIES) { n++; abs.push(Math.abs(r.changes[c.ticker])); if (Math.abs(r.changes[c.ticker]) > 0.1) big++; }
      p = r.prices;
    }
  }
  abs.sort((a, b) => a - b);
  assert.ok(big / n < 0.01, `${big / n}`);
  assert.ok(abs[abs.length >> 1] < 0.03);
});

test('randomness is secondary: a company with no news this week moves only a little', () => {
  let sum = 0, n = 0;
  for (let i = 0; i < 1000; i++) { // week 1: VLM and CBB have no direct news
    const r = computeWeek({ seed: newSeed(), week: 1, prevPrices: start, events: wk(1) });
    sum += Math.abs(r.changes.CBB); n++;
  }
  assert.ok(sum / n < 0.02);
});

test('driver explanations describe the biggest contributors, largest first', () => {
  const r = computeWeek({ seed: 'abc', week: 1, prevPrices: start, events: wk(1) });
  const d = summarizeDrivers(r.detail.NSR);
  assert.ok(d.length >= 2);
  assert.equal(d[0].label, 'Profit margins');
  assert.ok(Math.abs(d[0].pct) >= Math.abs(d[1].pct));
});

test('pre-game history: 12 weeks, positive, deterministic, identical in every game', () => {
  const a = buildHistory(), b = buildHistory();
  assert.deepEqual(a, b);
  for (const t of Object.keys(a)) { assert.equal(a[t].length, 12); assert.ok(a[t].every((r) => r.priceCents >= MIN_PRICE_CENTS && r.volume > 0)); }
});

// ---------------------------------------------------------------- data integrity
test('event schedule: every week has 4 events; articles are 25 to 50 words; targets and signals are valid', () => {
  const ids = new Set();
  const signals = new Set(Object.keys(FACTOR_WEIGHTS));
  for (let w = 1; w <= 8; w++) assert.equal(wk(w).length, 4, `week ${w}`);
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    const words = e.body.split(/\s+/).length;
    assert.ok(words >= 25 && words <= 50, `${e.id}: ${words} words`);
    assert.ok(e.headline && e.time && e.severity > 0 && e.severity <= 1);
    for (const eff of e.effects) {
      const ok = eff.target === 'ALL' || (typeof eff.target === 'object' && COMPANIES.some((c) => c.industry === eff.target.industry)) || COMPANIES.some((c) => c.ticker === eff.target);
      assert.ok(ok, `${e.id} target`);
      for (const [f, s] of Object.entries(eff.signals)) { assert.ok(signals.has(f), `${e.id} ${f}`); assert.ok(Math.abs(s) <= 1); }
    }
    for (const t of e.concerns) assert.ok(COMPANIES.some((c) => c.ticker === t));
    assert.doesNotMatch(e.headline + e.body, /bullish|bearish|will (rise|fall|soar|surge|plunge)|\b(buy|sell)\b(?! back)|explode/i); // no tipping off the answer
  }
  assert.ok(COMPANIES.length >= 8 && COMPANIES.length <= 12);
  assert.equal(new Set(COMPANIES.map((c) => c.industry)).size >= 8, true);
});

test('quiz bank: 5 questions a week with four options; all 24 supplied questions have the specified answers', () => {
  const supplied = [[2, 1, 1], [1, 1, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1], [0, 0, 1], [1, 1, 1], [0, 1, 1]];
  for (let w = 1; w <= 8; w++) {
    const qs = QUIZ[w].questions;
    assert.ok(qs.length >= 3, `week ${w} needs at least 3 questions`);
    assert.deepEqual(qs.filter((q) => q.supplied).map((q) => q.correct), supplied[w - 1], `week ${w} supplied answers`);
    for (const q of qs) { assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4); assert.ok(q.correct >= 0 && q.correct <= 3); assert.ok(q.explain.length > 20); }
    assert.ok(QUIZ[w].concept && QUIZ[w].consider.length >= 3 && QUIZ[w].topic);
  }
});

// ---------------------------------------------------------------- quiz engine
test('each week asks 3 distinct questions from the bank, stable for a seed and varied across seeds', () => {
  const seed = newSeed();
  const a = weekQuestions(seed, 4);
  assert.equal(a.length, 3); assert.equal(new Set(a.map((q) => q.id)).size, 3);
  assert.deepEqual(a.map((q) => q.id), weekQuestions(seed, 4).map((q) => q.id));
  const variants = new Set(Array.from({ length: 40 }, () => weekQuestions(newSeed(), 4).map((q) => q.id).join()));
  assert.ok(variants.size > 5);
});

test('answer shuffling never changes which answer is correct; grading is right for every position', () => {
  for (let w = 1; w <= 8; w++) for (const q of QUIZ[w].questions) for (let pid = 1; pid <= 5; pid++) {
    const perm = optionOrder('seed', pid, w, q.id);
    assert.deepEqual([...perm].sort(), [0, 1, 2, 3]);
    assert.deepEqual(perm, optionOrder('seed', pid, w, q.id)); // stable: refresh never reshuffles
    for (let pos = 0; pos < 4; pos++) {
      const g = grade(q, perm, pos);
      assert.equal(g.correct, q.options[perm[pos]] === q.options[q.correct]);
      assert.equal(perm[g.correctPos], q.correct);
    }
  }
  const orders = new Set(Array.from({ length: 30 }, (_, pid) => optionOrder('s', pid, 1, 'w1q1').join()));
  assert.ok(orders.size > 3); // different students see different orders
});

test('class statistics count answers, percent correct and the most common mistake', () => {
  const seed = 's1', qs = weekQuestions(seed, 2);
  const q = qs[0], wrong = [0, 1, 2, 3].filter((i) => i !== q.correct);
  const rows = [{ qid: q.id, choice: q.correct }, { qid: q.id, choice: wrong[0] }, { qid: q.id, choice: wrong[0] }, { qid: q.id, choice: wrong[1] }];
  const s = classStats(seed, 2, rows, 5).find((x) => x.id === q.id);
  assert.equal(s.answered, 4); assert.equal(s.correctCount, 1); assert.equal(s.correctPct, 25);
  assert.equal(s.commonMistake.text, q.options[wrong[0]]); assert.equal(s.commonMistake.count, 2);
  assert.equal(classStats(seed, 2, [], 5)[0].correctPct, null);
});

// ---------------------------------------------------------------- names
test('display names: sanitised, length-limited, filtered', () => {
  assert.equal(validateName('  Sam   Lee ').name, 'Sam Lee');
  assert.equal(validateName('A').ok, false);
  assert.equal(validateName('x'.repeat(17)).ok, false);
  assert.equal(validateName('<script>').ok, false);
  assert.equal(validateName('f u c k').ok, false);
  assert.equal(validateName('sh1t').ok, false);
  assert.equal(validateName('Dickson').ok, true);
  assert.equal(validateName('Zo\u00eb').ok, true);
  assert.equal(validateName('SAM').key, validateName('sam ').key);
});
