// ===========================================================================================
// Event-driven market engine. Pure functions: the same seed + week + prices + events always
// gives the same result, which makes games testable, auditable, and replayable.
//
// For every company, each week:
//   1. EVENT IMPACT   = sum over this week's events that concern the company, over each signal:
//                       relevance x severity x FACTOR_WEIGHT[factor] x surprise x sensitivity
//        - surprise (-1..+1) is how much better/worse than investors EXPECTED (see data/events.js)
//        - sensitivity is 1 for company factors (rev, mar, out, cash, comp) and the company's own
//          rates/demand/regulation/supply/sentiment number (data/companies.js) for macro factors.
//   2. EXPECTATIONS   = good news is dampened, bad news amplified, for companies whose price already assumes a lot:
//                       impact x (1 -/+ EXPECTATION_STRENGTH x (expectations - 0.5))
//   3. NOISE          = Normal(0, NOISE_SIGMA[volatility class])   <- the small random component
//   4. CAP            = soft cap:  cap x tanh(total / cap), so huge moves are rare and never exceed the cap
//   5. PRICE          = round(previous price x (1 + change)), never below MIN_PRICE_CENTS
// The Market 100 ETF's change is the plain average of the ten company changes (no extra noise).
// This is an educational model. It does not predict real markets.
// ===========================================================================================
import { COMPANIES, ETF, NOISE_SIGMA, MOVE_CAP } from './data/companies.js';
import { MIN_PRICE_CENTS, HISTORY_WEEKS } from './content.js';
import { rngFromString, gaussian } from './rng.js';

/** Price change (as a fraction) caused by a surprise of +1.0 at full severity and relevance. Tune these to taste. */
export const FACTOR_WEIGHTS = { rev: 0.05, mar: 0.06, out: 0.06, cash: 0.035, comp: 0.04, rates: 0.04, dem: 0.04, reg: 0.04, sup: 0.04, sent: 0.04 };
export const FACTOR_LABELS = {
  rev: 'Revenue vs expectations', mar: 'Profit margins', out: 'Management outlook', cash: 'Cash flow', comp: 'Competition',
  rates: 'Interest rates', dem: 'Consumer demand', reg: 'Regulation', sup: 'Supply chain', sent: 'Market sentiment',
};
export const EXPECTATION_STRENGTH = 0.5;
const MACRO_KEY = { rates: 'rates', dem: 'demand', reg: 'regulation', sup: 'supply', sent: 'sentiment' };

const appliesTo = (target, c) => target === 'ALL' || target === c.ticker || (typeof target === 'object' && target.industry === c.industry);
const bp = (x) => Math.round(x * 10000);

/** Deterministic (noise-free) event impact for a company. Used by the engine, the tests, and the schedule doc. */
export function eventImpact(company, events) {
  const contribs = [];
  for (const ev of events) {
    for (const eff of ev.effects) {
      if (!appliesTo(eff.target, company)) continue;
      for (const [f, s] of Object.entries(eff.signals)) {
        const sens = MACRO_KEY[f] ? company.sens[MACRO_KEY[f]] : 1;
        const v = (eff.relevance ?? 1) * ev.severity * FACTOR_WEIGHTS[f] * s * sens;
        if (v !== 0) contribs.push({ eventId: ev.id, factor: f, bp: bp(v) });
      }
    }
  }
  const raw = contribs.reduce((a, c) => a + c.bp, 0) / 10000;
  const adj = raw > 0 ? 1 - EXPECTATION_STRENGTH * (company.expectations - 0.5) : 1 + EXPECTATION_STRENGTH * (company.expectations - 0.5);
  return { contribs, raw, adjusted: raw * adj, expectationBp: bp(raw * adj - raw) };
}

/**
 * Compute one week's market.
 * @param prevPrices {ticker: cents}
 * @param events     the events scheduled for this week
 * @returns {prices, volumes, changes, detail}  detail[ticker] = { contribs, expectBp, noiseBp, totalBp } (stored for audit and explanations)
 */
export function computeWeek({ seed, week, prevPrices, events }) {
  const prices = {}, volumes = {}, changes = {}, detail = {};
  for (const c of COMPANIES) {
    const imp = eventImpact(c, events);
    const rand = rngFromString(`${seed}:${week}:noise:${c.ticker}`);
    const noise = gaussian(rand) * NOISE_SIGMA[c.vol];
    const cap = MOVE_CAP[c.vol];
    const change = cap * Math.tanh((imp.adjusted + noise) / cap);
    const price = Math.max(MIN_PRICE_CENTS, Math.round(prevPrices[c.ticker] * (1 + change)));
    prices[c.ticker] = price;
    changes[c.ticker] = (price - prevPrices[c.ticker]) / prevPrices[c.ticker];
    volumes[c.ticker] = volumeFor(c.baseVolume, changes[c.ticker], cap, rngFromString(`${seed}:${week}:vol:${c.ticker}`));
    detail[c.ticker] = { contribs: imp.contribs, expectBp: imp.expectationBp, noiseBp: bp(noise), totalBp: bp(changes[c.ticker]) };
  }
  const avg = COMPANIES.reduce((a, c) => a + changes[c.ticker], 0) / COMPANIES.length;
  prices[ETF.ticker] = Math.max(MIN_PRICE_CENTS, Math.round(prevPrices[ETF.ticker] * (1 + avg)));
  changes[ETF.ticker] = (prices[ETF.ticker] - prevPrices[ETF.ticker]) / prevPrices[ETF.ticker];
  volumes[ETF.ticker] = volumeFor(ETF.baseVolume, changes[ETF.ticker], MOVE_CAP.Lower, rngFromString(`${seed}:${week}:vol:${ETF.ticker}`));
  detail[ETF.ticker] = { contribs: [], expectBp: 0, noiseBp: 0, totalBp: bp(changes[ETF.ticker]) };
  return { prices, volumes, changes, detail };
}

/** Simulated shares traded: busier on big-move weeks. */
function volumeFor(base, change, cap, rand) {
  return Math.round(base * (0.85 + 0.3 * rand()) * (1 + 2.5 * Math.min(1, Math.abs(change) / cap)));
}

/** Plain-language list of what drove a company's move: [{label, pct}] sorted by size. */
export function summarizeDrivers(d) {
  if (!d) return [];
  const by = {};
  for (const c of d.contribs) by[c.factor] = (by[c.factor] || 0) + c.bp;
  const rows = Object.entries(by).map(([f, v]) => ({ label: FACTOR_LABELS[f], bp: v }));
  if (Math.abs(d.expectBp) >= 3) rows.push({ label: 'Investor expectations', bp: d.expectBp });
  rows.push({ label: 'Random market noise', bp: d.noiseBp });
  return rows.filter((r) => Math.abs(r.bp) >= 3).sort((a, b) => Math.abs(b.bp) - Math.abs(a.bp)).slice(0, 5).map((r) => ({ label: r.label, pct: r.bp / 100 }));
}

/**
 * Twelve weeks of believable price history before the game starts, identical in every game
 * (seeded by ticker), ending exactly at each investment's opening price. Gives charts context on day one.
 * @returns {ticker: [{week: -12..-1, priceCents, volume}]}
 */
export function buildHistory() {
  const sigma = { Lower: 0.02, Medium: 0.03, Higher: 0.045 };
  const rets = {}; // rets[ticker][k] = return of the week ending at week -k (k = 0 is the move into week 0)
  for (const c of COMPANIES) {
    const rand = rngFromString(`history:${c.ticker}`);
    rets[c.ticker] = Array.from({ length: HISTORY_WEEKS }, () => Math.max(-0.2, Math.min(0.2, gaussian(rand) * sigma[c.vol])));
  }
  rets[ETF.ticker] = Array.from({ length: HISTORY_WEEKS }, (_, k) => COMPANIES.reduce((a, c) => a + rets[c.ticker][k], 0) / COMPANIES.length);
  const out = {};
  for (const inv of [...COMPANIES, ETF]) {
    const rand = rngFromString(`history-vol:${inv.ticker}`);
    const cap = MOVE_CAP[inv.vol];
    let p = inv.startCents;
    const rows = [];
    for (let k = 0; k < HISTORY_WEEKS; k++) {
      p = Math.max(MIN_PRICE_CENTS, Math.round(p / (1 + rets[inv.ticker][k])));
      rows.unshift({ week: -(k + 1), priceCents: p, volume: volumeFor(inv.baseVolume, rets[inv.ticker][k], cap, rand) });
    }
    out[inv.ticker] = rows;
  }
  return out;
}
