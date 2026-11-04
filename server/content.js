// Game-wide constants. Companies, events, and quiz questions live in server/data/.
import { COMPANIES, ETF } from './data/companies.js';

export const TOTAL_WEEKS = 8;
export const START_CASH_CENTS = 100_000; // $1,000.00
export const MIN_PRICE_CENTS = 100;       // prices never fall below $1.00
export const HISTORY_WEEKS = 12;          // pre-game price history shown on charts

export const ASSETS = [
  ...COMPANIES.map((c) => ({ ...c, kind: 'Stock' })),
  { ...ETF },
];
export const TICKERS = ASSETS.map((a) => a.ticker);

export const AWARD_RULES = {
  diversified: 'Most evenly spread across your investments (at least 3 different investments, and at least half of your net worth invested at the end).',
  risk: 'Smallest biggest weekly drop in net worth, among players who finished at or above $1,000 and kept at least 30% invested on average.',
  improved: 'Biggest percentage gain in net worth over the second half (end of Week 4 to end of Week 8).',
};
