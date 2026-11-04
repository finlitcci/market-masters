// Fictional companies. Edit freely: see docs/CUSTOMIZING.md.
//
// sens = how strongly each *macro* factor moves this company's price:
//   rates       (+ signal = borrowing costs rising)  negative for debt-heavy / long-horizon growth firms, positive for banks
//   demand      (+ signal = stronger consumer demand)
//   regulation  (+ signal = more favourable rules)
//   supply      (+ signal = supply chains improving)
//   sentiment   (+ signal = investors more willing to take risk)  ~ the company's "beta"
// expectations: 0..1, how much good news is already "priced in". High values dampen good news and amplify bad news.
// vol: noise class. Lower / Medium / Higher (sets the size of the random component and the price-move cap).
// eps and sharesOutM are fixed for the game, so P/E and market cap change only because the price changes.
export const COMPANIES = [
  { ticker: 'BWS', name: 'Brightwave Software', industry: 'Technology', vol: 'Higher', startCents: 8420, eps: 2.1, sharesOutM: 310,
    revenueGrowth: 22, grossMargin: 74, netMargin: 11, debt: 'Low', dividendYield: 0, expectations: 0.75, baseVolume: 640000,
    desc: 'Brightwave sells subscription software that helps mid-sized businesses manage projects and customer data.',
    sens: { rates: -1.0, demand: 0.6, regulation: 0.8, supply: 0.3, sentiment: 1.3 } },
  { ticker: 'NSR', name: 'Northstar Retail', industry: 'Retail', vol: 'Medium', startCents: 3840, eps: 2.4, sharesOutM: 540,
    revenueGrowth: 8, grossMargin: 34, netMargin: 4, debt: 'Moderate', dividendYield: 1.2, expectations: 0.5, baseVolume: 910000,
    desc: 'Northstar operates 400 department and home-goods stores across Canada and sells online.',
    sens: { rates: -0.7, demand: 1.4, regulation: 0.3, supply: 1.0, sentiment: 0.9 } },
  { ticker: 'VDP', name: 'Verdant Power', industry: 'Renewable Energy', vol: 'Higher', startCents: 2760, eps: 0.9, sharesOutM: 420,
    revenueGrowth: 31, grossMargin: 28, netMargin: 3, debt: 'High', dividendYield: 0, expectations: 0.65, baseVolume: 780000,
    desc: 'Verdant builds and operates wind and solar farms and sells the electricity under long-term contracts.',
    sens: { rates: -1.5, demand: 0.6, regulation: 1.4, supply: 0.8, sentiment: 1.1 } },
  { ticker: 'PHS', name: 'Pioneer Health Sciences', industry: 'Healthcare', vol: 'Medium', startCents: 6175, eps: 3.1, sharesOutM: 260,
    revenueGrowth: 9, grossMargin: 61, netMargin: 14, debt: 'Low', dividendYield: 0.6, expectations: 0.6, baseVolume: 420000,
    desc: 'Pioneer develops medical devices and supplies hospitals and clinics with diagnostic equipment.',
    sens: { rates: -0.5, demand: 0.4, regulation: 1.5, supply: 0.6, sentiment: 0.8 } },
  { ticker: 'HLL', name: 'Harbourline Logistics', industry: 'Transportation & Logistics', vol: 'Medium', startCents: 4510, eps: 2.8, sharesOutM: 380,
    revenueGrowth: 7, grossMargin: 22, netMargin: 6, debt: 'Moderate', dividendYield: 1.8, expectations: 0.45, baseVolume: 560000,
    desc: 'Harbourline moves freight by truck, rail, and container ship for retailers and manufacturers.',
    sens: { rates: -0.9, demand: 1.1, regulation: 0.5, supply: 1.4, sentiment: 1.0 } },
  { ticker: 'GFD', name: 'Goodfield Foods', industry: 'Food & Beverage', vol: 'Lower', startCents: 5290, eps: 3.3, sharesOutM: 295,
    revenueGrowth: 4, grossMargin: 37, netMargin: 8, debt: 'Moderate', dividendYield: 3.4, expectations: 0.4, baseVolume: 380000,
    desc: 'Goodfield makes packaged foods, cereals, and snacks that are sold in grocery stores nationwide.',
    sens: { rates: -0.4, demand: 0.8, regulation: 0.5, supply: 1.2, sentiment: 0.6 } },
  { ticker: 'IRB', name: 'Ironbridge Industrial', industry: 'Manufacturing', vol: 'Medium', startCents: 3380, eps: 1.7, sharesOutM: 450,
    revenueGrowth: 6, grossMargin: 26, netMargin: 5, debt: 'High', dividendYield: 2.1, expectations: 0.4, baseVolume: 500000,
    desc: 'Ironbridge manufactures steel components, rail equipment, and machinery for other businesses.',
    sens: { rates: -0.8, demand: 1.0, regulation: 0.6, supply: 1.5, sentiment: 1.0 } },
  { ticker: 'EVB', name: 'Everyday Basics Co.', industry: 'Consumer Products', vol: 'Lower', startCents: 7140, eps: 4.4, sharesOutM: 330,
    revenueGrowth: 3, grossMargin: 48, netMargin: 12, debt: 'Low', dividendYield: 2.8, expectations: 0.45, baseVolume: 350000,
    desc: 'Everyday Basics sells household staples such as soap, paper goods, and cleaning products.',
    sens: { rates: -0.3, demand: 0.9, regulation: 0.3, supply: 0.7, sentiment: 0.5 } },
  { ticker: 'CBB', name: 'Cedar Bay Bank', industry: 'Financials', vol: 'Medium', startCents: 5820, eps: 4.9, sharesOutM: 520,
    revenueGrowth: 5, grossMargin: 0, netMargin: 22, debt: 'Moderate', dividendYield: 3.1, expectations: 0.5, baseVolume: 600000,
    desc: 'Cedar Bay is a regional bank that offers chequing accounts, mortgages, and business loans.',
    sens: { rates: 0.7, demand: 0.8, regulation: 1.0, supply: 0.1, sentiment: 1.0 } },
  { ticker: 'VLM', name: 'Voltaic Mobility', industry: 'Electric Vehicles', vol: 'Higher', startCents: 2430, eps: 0.4, sharesOutM: 700,
    revenueGrowth: 45, grossMargin: 19, netMargin: -2, debt: 'High', dividendYield: 0, expectations: 0.85, baseVolume: 1100000,
    desc: 'Voltaic designs and builds electric cars and light trucks and is expanding quickly.',
    sens: { rates: -1.3, demand: 1.0, regulation: 1.0, supply: 1.3, sentiment: 1.5 } },
];

// An equal-weighted fund of the ten companies above. Its price change is the average of their changes (no extra noise).
export const ETF = {
  ticker: 'M100', name: 'Market 100 ETF', industry: 'Diversified fund', kind: 'ETF', vol: 'Lower', startCents: 5000, baseVolume: 1300000,
  desc: 'A fictional fund holding equal amounts of all ten companies in this game. It spreads risk across industries but still falls when the whole market falls.',
};

export const NOISE_SIGMA = { Lower: 0.010, Medium: 0.015, Higher: 0.022 }; // the small random component, per week
export const MOVE_CAP = { Lower: 0.10, Medium: 0.14, Higher: 0.18 };       // soft cap on a single week's move
