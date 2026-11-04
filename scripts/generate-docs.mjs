// Generates teacher reference documents from the game data, so the docs can never disagree with the game.
//   npm run docs   ->  docs/EVENT_SCHEDULE.md, docs/QUIZ_BANK.md, docs/COMPANIES.md
import fs from 'node:fs';
import { COMPANIES, ETF, NOISE_SIGMA, MOVE_CAP } from '../server/data/companies.js';
import { EVENTS } from '../server/data/events.js';
import { QUIZ } from '../server/data/quiz.js';
import { eventImpact, FACTOR_LABELS, FACTOR_WEIGHTS, EXPECTATION_STRENGTH } from '../server/engine.js';

const pct = (x) => `${x >= 0 ? '+' : '\u2212'}${Math.abs(x * 100).toFixed(1)}%`;
const money = (c) => `$${(c / 100).toFixed(2)}`;
const out = (f, s) => { fs.writeFileSync(new URL(`../docs/${f}`, import.meta.url), s); console.log('wrote docs/' + f); };

// ---------------- companies
out('COMPANIES.md', `# Companies (all fictional)

Ten fictional companies and one fictional fund. Names and tickers are invented; prices are simulated and unrelated to any real market.
Edit them in \`server/data/companies.js\` (see [CUSTOMIZING.md](CUSTOMIZING.md)), then run \`npm run docs\`.

| Ticker | Company | Industry | Opening price | Volatility | Rev. growth | Gross margin | Net margin | Debt | Dividend yield* | Investor expectations |
|---|---|---|---|---|---|---|---|---|---|---|
${COMPANIES.map((c) => `| ${c.ticker} | ${c.name} | ${c.industry} | ${money(c.startCents)} | ${c.vol} | ${c.revenueGrowth}% | ${c.grossMargin ? c.grossMargin + '%' : 'n/a'} | ${c.netMargin}% | ${c.debt} | ${c.dividendYield}% | ${c.expectations < 0.45 ? 'Low' : c.expectations < 0.7 ? 'Moderate' : 'High'} |`).join('\n')}
| ${ETF.ticker} | ${ETF.name} | ${ETF.industry} | ${money(ETF.startCents)} | ${ETF.vol} | | | | | | |

*Dividends are shown for realism but are **not paid out** in the simulation.

${COMPANIES.map((c) => `**${c.name} (${c.ticker}).** ${c.desc}`).join('\n\n')}

**${ETF.name} (${ETF.ticker}).** ${ETF.desc}

## Hidden sensitivities (teacher only)
How strongly each company reacts to economy-wide news (1.0 = typical; negative = moves opposite to the signal).

| Ticker | Interest rates rising | Consumer demand | Regulation | Supply chain | Market sentiment |
|---|---|---|---|---|---|
${COMPANIES.map((c) => `| ${c.ticker} | ${c.sens.rates} | ${c.sens.demand} | ${c.sens.regulation} | ${c.sens.supply} | ${c.sens.sentiment} |`).join('\n')}
`);

// ---------------- event schedule
const kind = (net, hasMix) => (Math.abs(net) < 0.012 ? (hasMix ? 'Ambiguous' : 'Quiet') : net > 0 ? (net > 0.03 ? 'Clearly positive' : 'Mildly positive') : (net < -0.03 ? 'Clearly negative' : 'Mildly negative'));
let sched = `# Eight-week event schedule (TEACHER ONLY)

**Do not project or share this document: it contains the expected market outcome of every story.**

Each week has four stories (company, industry, and economy news). Students see the headline, article, and key figures. They never see the signals or expected outcomes below until after the market reveal.

## How prices are produced

For each company and week:

1. **Event impact** = sum over the week's stories that concern the company, over each signal: relevance x severity x factor weight x surprise x sensitivity.
2. **Investor expectations**: good news is dampened and bad news amplified for companies whose price already assumes a lot (strength ${EXPECTATION_STRENGTH}).
3. **Random noise**: a small bell-curve draw (sigma ${Object.entries(NOISE_SIGMA).map(([k, v]) => `${k} ${v * 100}%`).join(', ')}).
4. **Soft cap** on a single week's move (${Object.entries(MOVE_CAP).map(([k, v]) => `${k} ${v * 100}%`).join(', ')}) so extreme moves are rare.
5. Price = previous price x (1 + move), rounded to cents, never below $1.00. The ETF is the average of the ten companies.

Factor weights (price change from a surprise of +1.0 at full severity): ${Object.entries(FACTOR_WEIGHTS).map(([k, v]) => `${FACTOR_LABELS[k]} ${(v * 100).toFixed(1)}%`).join('; ')}.

"Expected impact" below is the average (noise-free) effect on each company after expectations. The real move also includes the random element, so a mixed or ambiguous story can go either way.
`;
for (let w = 1; w <= 8; w++) {
  sched += `\n## Week ${w}: ${QUIZ[w].topic}\n\n*Quiz concept:* ${QUIZ[w].concept}\n`;
  const evs = EVENTS.filter((e) => e.week === w);
  for (const e of evs) {
    const rows = COMPANIES.map((c) => ({ c, imp: eventImpact(c, [e]) })).filter((r) => r.imp.contribs.length);
    const own = rows.filter((r) => e.concerns.includes(r.c.ticker));
    const focus = own.length ? own : rows;
    const net = focus.length ? focus.reduce((a, r) => a + r.imp.adjusted, 0) / focus.length : 0;
    const signs = new Set(rows.flatMap((r) => r.imp.contribs.map((x) => Math.sign(x.bp))).filter(Boolean));
    sched += `\n### ${e.headline}\n*${e.time} \u00b7 ${e.type}${e.scope ? ' \u00b7 ' + e.scope : ''} \u00b7 severity ${e.severity}* \u00b7 **${kind(net, signs.size > 1)}**\n\n${e.body}\n\n` +
      `Key figures: ${e.figures.map(([k, v]) => `${k} ${v}`).join('; ')}\n\n` +
      `Hidden signals: ${e.effects.map((f) => `${typeof f.target === 'object' ? f.target.industry + ' industry' : f.target} (relevance ${f.relevance}): ` + Object.entries(f.signals).map(([k, v]) => `${FACTOR_LABELS[k]} ${v >= 0 ? '+' : ''}${v}`).join(', ')).join(' | ')}\n\n` +
      `Expected impact: ${rows.map((r) => `${r.c.ticker} ${pct(r.imp.adjusted)}`).join(', ')}\n\n` +
      `*Discussion:* ${e.type === 'macro' ? 'Why did the same news affect companies differently? Which firms carry more debt, or depend more on consumers?' : 'Which details are good news and which are worries? What might investors already have expected?'}\n`;
  }
}
out('EVENT_SCHEDULE.md', sched);

// ---------------- quiz bank
let q = `# Weekly quiz bank and answer key (TEACHER ONLY)

Each week has 5 questions: 3 supplied core questions (marked *core*) and 2 extra ones. Every game asks 3 of the 5 each week, chosen at random from the game's seed.
Answer order is shuffled separately for every student, so the letters below are the **bank order**, not what a student sees.
Students are shown the correct answer and explanation only after they submit each question. Each question can be answered once.
Edit questions in \`server/data/quiz.js\` (see [CUSTOMIZING.md](CUSTOMIZING.md)).
`;
for (let w = 1; w <= 8; w++) {
  q += `\n## Week ${w}: ${QUIZ[w].topic}\n\n*Concept:* ${QUIZ[w].concept}\n`;
  QUIZ[w].questions.forEach((x, i) => {
    q += `\n**${i + 1}. ${x.q}** ${x.supplied ? '*(core)*' : '*(extra)*'}\n\n${x.options.map((o, k) => `- ${'ABCD'[k]}. ${o}${k === x.correct ? ' **(correct)**' : ''}`).join('\n')}\n\n*Explanation:* ${x.explain}\n`;
  });
}
out('QUIZ_BANK.md', q);
