# Companies (all fictional)

Ten fictional companies and one fictional fund. Names and tickers are invented; prices are simulated and unrelated to any real market.
Edit them in `server/data/companies.js` (see [CUSTOMIZING.md](CUSTOMIZING.md)), then run `npm run docs`.

| Ticker | Company | Industry | Opening price | Volatility | Rev. growth | Gross margin | Net margin | Debt | Dividend yield* | Investor expectations |
|---|---|---|---|---|---|---|---|---|---|---|
| BWS | Brightwave Software | Technology | $84.20 | Higher | 22% | 74% | 11% | Low | 0% | High |
| NSR | Northstar Retail | Retail | $38.40 | Medium | 8% | 34% | 4% | Moderate | 1.2% | Moderate |
| VDP | Verdant Power | Renewable Energy | $27.60 | Higher | 31% | 28% | 3% | High | 0% | Moderate |
| PHS | Pioneer Health Sciences | Healthcare | $61.75 | Medium | 9% | 61% | 14% | Low | 0.6% | Moderate |
| HLL | Harbourline Logistics | Transportation & Logistics | $45.10 | Medium | 7% | 22% | 6% | Moderate | 1.8% | Moderate |
| GFD | Goodfield Foods | Food & Beverage | $52.90 | Lower | 4% | 37% | 8% | Moderate | 3.4% | Low |
| IRB | Ironbridge Industrial | Manufacturing | $33.80 | Medium | 6% | 26% | 5% | High | 2.1% | Low |
| EVB | Everyday Basics Co. | Consumer Products | $71.40 | Lower | 3% | 48% | 12% | Low | 2.8% | Moderate |
| CBB | Cedar Bay Bank | Financials | $58.20 | Medium | 5% | n/a | 22% | Moderate | 3.1% | Moderate |
| VLM | Voltaic Mobility | Electric Vehicles | $24.30 | Higher | 45% | 19% | -2% | High | 0% | High |
| M100 | Market 100 ETF | Diversified fund | $50.00 | Lower | | | | | | |

*Dividends are shown for realism but are **not paid out** in the simulation.

**Brightwave Software (BWS).** Brightwave sells subscription software that helps mid-sized businesses manage projects and customer data.

**Northstar Retail (NSR).** Northstar operates 400 department and home-goods stores across Canada and sells online.

**Verdant Power (VDP).** Verdant builds and operates wind and solar farms and sells the electricity under long-term contracts.

**Pioneer Health Sciences (PHS).** Pioneer develops medical devices and supplies hospitals and clinics with diagnostic equipment.

**Harbourline Logistics (HLL).** Harbourline moves freight by truck, rail, and container ship for retailers and manufacturers.

**Goodfield Foods (GFD).** Goodfield makes packaged foods, cereals, and snacks that are sold in grocery stores nationwide.

**Ironbridge Industrial (IRB).** Ironbridge manufactures steel components, rail equipment, and machinery for other businesses.

**Everyday Basics Co. (EVB).** Everyday Basics sells household staples such as soap, paper goods, and cleaning products.

**Cedar Bay Bank (CBB).** Cedar Bay is a regional bank that offers chequing accounts, mortgages, and business loans.

**Voltaic Mobility (VLM).** Voltaic designs and builds electric cars and light trucks and is expanding quickly.

**Market 100 ETF (M100).** A fictional fund holding equal amounts of all ten companies in this game. It spreads risk across industries but still falls when the whole market falls.

## Hidden sensitivities (teacher only)
How strongly each company reacts to economy-wide news (1.0 = typical; negative = moves opposite to the signal).

| Ticker | Interest rates rising | Consumer demand | Regulation | Supply chain | Market sentiment |
|---|---|---|---|---|---|
| BWS | -1 | 0.6 | 0.8 | 0.3 | 1.3 |
| NSR | -0.7 | 1.4 | 0.3 | 1 | 0.9 |
| VDP | -1.5 | 0.6 | 1.4 | 0.8 | 1.1 |
| PHS | -0.5 | 0.4 | 1.5 | 0.6 | 0.8 |
| HLL | -0.9 | 1.1 | 0.5 | 1.4 | 1 |
| GFD | -0.4 | 0.8 | 0.5 | 1.2 | 0.6 |
| IRB | -0.8 | 1 | 0.6 | 1.5 | 1 |
| EVB | -0.3 | 0.9 | 0.3 | 0.7 | 0.5 |
| CBB | 0.7 | 0.8 | 1 | 0.1 | 1 |
| VLM | -1.3 | 1 | 1 | 1.3 | 1.5 |
