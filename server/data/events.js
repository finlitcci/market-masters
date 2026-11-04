// The eight-week event schedule.
//
// Public fields (shown to students once the week's news is published): id, week, time, type, headline, body, figures, concerns, scope.
// Hidden fields (never sent to students before the market reveal): severity and effects.
//
// effects[].target: a ticker, { industry: '...' }, or 'ALL'.
// effects[].relevance (0..1): how directly the event concerns that target.
// effects[].signals: surprises RELATIVE TO WHAT INVESTORS EXPECTED, each from -1 (much worse) to +1 (much better):
//   rev  revenue vs expectations        mar  profit margin        out  management outlook / guidance       cash  cash flow
//   comp competitive position (+ better)
//   Macro factors (multiplied by each company's sensitivity, see companies.js):
//   rates (+ = borrowing costs rising)  dem (+ = stronger demand)  reg (+ = more favourable rules)
//   sup (+ = supply chains improving)   sent (+ = investors more willing to take risk)
// Mixed signals (good revenue, weak margin) are intentional: students must weigh both sides.
const E = (id, week, time, type, headline, body, figures, concerns, severity, effects, scope) =>
  ({ id, week, time, type, headline, body, figures, concerns, scope, severity, effects });

export const EVENTS = [
  // ---------------- Week 1: Stock market fundamentals
  E('w1-nsr', 1, 'Mon 08:30', 'company', 'Northstar Reports Strong Holiday Sales as Inventory Costs Rise',
    'Northstar Retail reported a 12% increase in quarterly revenue compared with the same period last year. However, its gross profit margin declined from 34% to 29%, partly due to discounting and higher shipping costs. Management expects demand to remain stable but has not confirmed whether margins will recover next quarter.',
    [['Revenue growth', '+12% y/y'], ['Gross margin', '34% to 29%']], ['NSR'], 0.8,
    [{ target: 'NSR', relevance: 1, signals: { rev: 0.6, mar: -0.55, out: -0.1 } }]),
  E('w1-bws', 1, 'Tue 10:15', 'company', 'Brightwave Launches Analytics Suite; Analysts Question Profitability',
    'Brightwave released a new analytics product, and early sign-ups beat the company\u2019s internal targets. Operating expenses rose 18% on marketing and engineering. Management says its full-year profit target is unchanged, though some analysts want to see proof first.',
    [['New-product sign-ups', 'above target'], ['Operating expenses', '+18%']], ['BWS'], 0.7,
    [{ target: 'BWS', relevance: 1, signals: { rev: 0.6, mar: -0.5, out: 0.1 } }]),
  E('w1-gfd', 1, 'Wed 07:45', 'company', 'Goodfield Foods Lifts Annual Outlook as Cash Flow Dips',
    'Goodfield raised its full-year sales forecast after steady grocery demand. Operating cash flow fell 9% this quarter because the company stocked up on ingredients. Management described the dip as temporary but gave no date for a rebound.',
    [['Full-year sales forecast', 'raised'], ['Operating cash flow', '-9% q/q']], ['GFD'], 0.7,
    [{ target: 'GFD', relevance: 1, signals: { out: 0.5, cash: -0.8, rev: 0.1 } }]),
  E('w1-cpi', 1, 'Thu 08:30', 'macro', 'Consumer Prices Rise 2.4%, In Line With Forecasts',
    'Canada\u2019s statistics agency said consumer prices were 2.4% higher than a year ago, matching economists\u2019 forecasts. Gasoline prices eased while rent and grocery costs rose. The central bank meets next month.',
    [['Inflation (y/y)', '2.4%'], ['Forecast', '2.4%']], [], 0.4,
    [{ target: 'ALL', relevance: 1, signals: { sent: 0.15, rates: 0.0 } }], 'Broad market'),

  // ---------------- Week 2: ETFs and diversification
  E('w2-phs', 2, 'Mon 09:00', 'company', 'Pioneer Health Wins $180 Million Hospital Supply Contract',
    'Pioneer Health won a three-year contract to supply diagnostic equipment to a group of provincial hospitals. The company accepted lower prices than usual to secure the deal. Delivery is expected to begin in the second half of next year.',
    [['Contract value', '$180M over 3 years'], ['Delivery start', 'next year']], ['PHS'], 0.8,
    [{ target: 'PHS', relevance: 1, signals: { rev: 0.7, out: 0.4, mar: -0.2 } }]),
  E('w2-hll', 2, 'Tue 11:30', 'company', 'Harbourline Says Major Customer Delays Shipping Contract',
    'A large retail customer postponed a $90 million shipping contract by two quarters. Harbourline said volumes from other customers grew 6% and that lower fuel prices are helping costs. It did not change its full-year forecast.',
    [['Delayed contract', '$90M, two quarters'], ['Other customer volumes', '+6%']], ['HLL'], 0.8,
    [{ target: 'HLL', relevance: 1, signals: { rev: -0.5, out: -0.4, mar: 0.3 } }]),
  E('w2-ren', 2, 'Wed 14:00', 'industry', 'Government Proposes Faster Approvals for Renewable Projects',
    'The energy minister proposed shortening approval times for wind and solar projects from 36 months to 18. The plan needs a legislative vote, and funding for grid upgrades has not been confirmed. Industry groups welcomed the proposal.',
    [['Proposed approval time', '36 to 18 months'], ['Status', 'awaiting vote']], ['VDP'], 0.7,
    [{ target: 'VDP', relevance: 1, signals: { reg: 0.6, out: -0.1 } }, { target: 'VLM', relevance: 0.3, signals: { reg: 0.4 } }], 'Renewable energy'),
  E('w2-evb', 2, 'Thu 09:30', 'company', 'Rival Launches Lower-Priced Alternative to Everyday Basics\u2019 Top Product',
    'A competitor introduced a household-cleaning range priced about 15% below Everyday Basics\u2019 best-selling line. Everyday Basics said its customers are loyal and that it has no plans to change prices. Analysts expect the rival to start with limited shelf space.',
    [['Rival price gap', 'about 15% lower'], ['Everyday Basics price plan', 'unchanged']], ['EVB'], 0.7,
    [{ target: 'EVB', relevance: 1, signals: { comp: -0.7, out: 0.0 } }]),

  // ---------------- Week 3: Risk and return
  E('w3-vlm', 3, 'Mon 08:00', 'company', 'Voltaic Reports Record Deliveries and Cuts Entry-Model Price',
    'Voltaic delivered a record number of vehicles last quarter, up 58% from a year ago. To keep demand high it cut the price of its entry model by 8%, which management said will lower profit per vehicle in the coming quarters.',
    [['Deliveries', '+58% y/y'], ['Entry-model price', '-8%']], ['VLM'], 0.9,
    [{ target: 'VLM', relevance: 1, signals: { rev: 0.8, mar: -0.8, out: 0.2 } }]),
  E('w3-irb', 3, 'Tue 13:20', 'company', 'Ironbridge Warns of Supply-Chain Delays at Two Plants',
    'Ironbridge said shortages of specialty steel will slow production at two of its six plants for several weeks. The company expects to meet most customer orders but will pay more to rush deliveries. It has not yet updated its profit forecast.',
    [['Plants affected', '2 of 6'], ['Profit forecast', 'not yet updated']], ['IRB'], 0.8,
    [{ target: 'IRB', relevance: 1, signals: { sup: -0.5, out: -0.4 } }]),
  E('w3-cbb', 3, 'Wed 08:45', 'company', 'Cedar Bay Bank Beats Earnings Estimates as Late Payments Edge Up',
    'Cedar Bay earned more than analysts expected, helped by higher income from loans. The share of loans more than 90 days overdue rose from 0.8% to 1.1%. Management said credit quality remains \u201cwithin normal range.\u201d',
    [['Earnings vs estimates', 'above'], ['Loans 90+ days overdue', '0.8% to 1.1%']], ['CBB'], 0.7,
    [{ target: 'CBB', relevance: 1, signals: { rev: 0.6, mar: 0.2, out: -0.3 } }]),
  E('w3-med', 3, 'Thu 10:00', 'industry', 'Regulator Opens Review of Medical-Device Approval Rules',
    'Health Canada announced a review of how medical devices are approved and monitored after approval. No rule changes have been proposed, and the review is expected to take about a year. Industry groups said they will take part in consultations.',
    [['Review length', 'about 12 months'], ['Rule changes proposed', 'none yet']], ['PHS'], 0.6,
    [{ target: 'PHS', relevance: 1, signals: { reg: -0.6 } }], 'Healthcare'),

  // ---------------- Week 4: Dividends and company financials
  E('w4-evb', 4, 'Mon 09:15', 'company', 'Everyday Basics Raises Dividend as Free Cash Flow Declines',
    'Everyday Basics announced a 6% increase in its quarterly dividend. Free cash flow for the quarter fell 14% because of higher packaging costs and new equipment spending. The company said it remains comfortable with its dividend.',
    [['Quarterly dividend', '+6%'], ['Free cash flow', '-14%']], ['EVB'], 0.7,
    [{ target: 'EVB', relevance: 1, signals: { cash: -0.6, out: 0.3 } }]),
  E('w4-vdp', 4, 'Tue 10:40', 'company', 'Verdant Power Wins Government Contract but Faces Higher Production Costs',
    'Verdant won a government contract to supply electricity from a new solar farm for 15 years. The company also said equipment and installation costs have risen about 11%, which will reduce the project\u2019s expected profit margin.',
    [['Contract length', '15 years'], ['Equipment and installation costs', '+11%']], ['VDP'], 0.8,
    [{ target: 'VDP', relevance: 1, signals: { rev: 0.8, mar: -0.7, out: 0.2 } }]),
  E('w4-gfd', 4, 'Wed 08:10', 'company', 'Goodfield Revenue Climbs 4%, but Net Income Falls',
    'Goodfield reported 4% higher sales this quarter, but net income fell 7% as ingredient and transportation costs rose faster than its prices. Management said it will review pricing but did not announce any changes.',
    [['Revenue', '+4% y/y'], ['Net income', '-7% y/y']], ['GFD'], 0.7,
    [{ target: 'GFD', relevance: 1, signals: { rev: 0.3, mar: -0.6, sup: -0.3 } }]),
  E('w4-bws', 4, 'Thu 15:30', 'company', 'Brightwave Announces $200 Million Share Repurchase',
    'Brightwave\u2019s board approved a program to buy back up to $200 million of its own shares over two years. The company has about $650 million in cash. It said the program will not affect its product spending.',
    [['Buyback size', 'up to $200M'], ['Cash on hand', 'about $650M']], ['BWS'], 0.6,
    [{ target: 'BWS', relevance: 1, signals: { out: 0.4, cash: -0.2 } }]),

  // ---------------- Week 5: Interest rates and economic conditions
  E('w5-rates', 5, 'Mon 10:00', 'macro', 'Central Bank Raises Rate by 0.50%, Larger Than Forecast',
    'The central bank raised its key interest rate by half a percentage point to 4.5%. Most economists had forecast a 0.25 point increase. The bank said further increases depend on incoming inflation data.',
    [['New policy rate', '4.50%'], ['Expected increase', '0.25 points'], ['Actual increase', '0.50 points']], [], 1.0,
    [{ target: 'ALL', relevance: 1, signals: { rates: 0.8, sent: -0.4 } }], 'Broad market'),
  E('w5-nsr', 5, 'Tue 09:20', 'company', 'Northstar Reports Strong Sales as More Shoppers Use Credit Cards',
    'Northstar\u2019s same-store sales grew 6%. Management said the share of purchases paid with store and bank credit cards reached a record 58%. Analysts debated whether household spending at this pace can continue.',
    [['Same-store sales', '+6%'], ['Purchases on credit', '58% (record)']], ['NSR'], 0.6,
    [{ target: 'NSR', relevance: 1, signals: { rev: 0.6, dem: -0.2, out: -0.2 } }]),
  E('w5-hll', 5, 'Wed 12:00', 'company', 'Harbourline Refinances Debt at a Higher Interest Rate',
    'Harbourline replaced $400 million of maturing debt with new bonds paying 6.1%, up from the 3.8% on the old debt. The company said the transaction extends its debt maturities to 2034 and removes refinancing risk for several years.',
    [['New bond rate', '6.1%'], ['Old bond rate', '3.8%'], ['Amount', '$400M']], ['HLL'], 0.7,
    [{ target: 'HLL', relevance: 1, signals: { rates: 0.5, mar: -0.3 } }]),
  E('w5-phs', 5, 'Thu 08:00', 'company', 'Pioneer Health Reports Steady Quarter, Keeps Outlook Unchanged',
    'Pioneer Health reported results close to analysts\u2019 estimates, with sales up 9% and margins roughly flat. Management kept its full-year outlook unchanged and said it expects no major changes in its product plans.',
    [['Sales', '+9% y/y'], ['Outlook', 'unchanged']], ['PHS'], 0.4,
    [{ target: 'PHS', relevance: 1, signals: { rev: 0.1, mar: 0.1, out: 0.0 } }]),

  // ---------------- Week 6: Valuation and investor expectations
  E('w6-bws', 6, 'Mon 16:05', 'company', 'Brightwave Revenue Grows 20% Versus Analyst Forecasts of 35%',
    'Brightwave reported 20% revenue growth, down from 28% a year earlier. Analysts surveyed by the company had expected about 35%. Management said enterprise customers are taking longer to approve new software spending.',
    [['Revenue growth', '+20% y/y'], ['Analyst forecast', '+35%']], ['BWS'], 0.8,
    [{ target: 'BWS', relevance: 1, signals: { rev: -0.6, out: -0.2 } }]),
  E('w6-irb', 6, 'Tue 09:45', 'company', 'Ironbridge Wins Rail Equipment Order From National Operator',
    'Ironbridge won a $240 million order for rail cars and track components, to be delivered over four years. Management said the order fills about 70% of planned capacity at its largest plant and that pricing is in line with its usual margins.',
    [['Order value', '$240M over 4 years'], ['Capacity filled', 'about 70%']], ['IRB'], 0.8,
    [{ target: 'IRB', relevance: 1, signals: { rev: 0.7, out: 0.4 } }]),
  E('w6-ret', 6, 'Wed 08:30', 'industry', 'Retail Sales Data Shows Shoppers Trading Down to Cheaper Brands',
    'Monthly retail data showed total sales up 1.2%, but shoppers moved toward store brands and discount items. Sales of premium brands fell, while sales of basic household and grocery items rose.',
    [['Total retail sales', '+1.2% m/m'], ['Premium brands', 'down']], ['NSR', 'EVB', 'GFD'], 0.6,
    [{ target: 'NSR', relevance: 1, signals: { dem: -0.4, mar: -0.2 } }, { target: 'EVB', relevance: 0.7, signals: { dem: -0.3, comp: -0.2 } }, { target: 'GFD', relevance: 0.6, signals: { dem: 0.2 } }], 'Retail and consumer'),
  E('w6-cbb', 6, 'Thu 11:15', 'company', 'Cedar Bay Raises Loan-Loss Reserves After Portfolio Review',
    'Cedar Bay set aside an extra $65 million to cover possible loan losses after reviewing its business-lending portfolio. The bank said actual losses have not risen yet and that the move is precautionary.',
    [['Extra reserves', '$65M'], ['Actual losses', 'not yet higher']], ['CBB'], 0.7,
    [{ target: 'CBB', relevance: 1, signals: { out: -0.5, mar: -0.3 } }]),

  // ---------------- Week 7: Portfolio management and trading decisions
  E('w7-phs', 7, 'Mon 07:30', 'company', 'Pioneer Health Recalls One Product Line',
    'Pioneer Health is recalling one model of portable monitor after a software fault. The product represents less than 2% of sales. The company said no injuries have been reported and a software fix will ship within weeks.',
    [['Share of sales affected', 'under 2%'], ['Injuries reported', 'none']], ['PHS'], 0.5,
    [{ target: 'PHS', relevance: 1, signals: { rev: -0.2, out: -0.1, reg: -0.1 } }]),
  E('w7-ports', 7, 'Tue 09:00', 'macro', 'Port Congestion Eases as Shipping Delays Shorten',
    'Average container wait times at major ports fell to four days from nine. Shipping companies said schedules are returning to normal. Freight rates remain above last year\u2019s levels.',
    [['Average port wait', '9 to 4 days']], [], 0.8,
    [{ target: 'ALL', relevance: 1, signals: { sup: 0.6, sent: 0.1 } }], 'Broad market'),
  E('w7-vdp', 7, 'Wed 10:30', 'company', 'Verdant Power Delays Solar Farm Opening by One Quarter',
    'Verdant said its largest solar farm will open one quarter later than planned because of permit delays and late equipment delivery. Revenue from the site will move into next year. Total project costs are expected to rise slightly.',
    [['Opening delay', 'one quarter'], ['Project cost change', 'slightly higher']], ['VDP'], 0.7,
    [{ target: 'VDP', relevance: 1, signals: { rev: -0.4, out: -0.5, cash: -0.2 } }]),
  E('w7-gfd', 7, 'Thu 08:20', 'company', 'Goodfield Signs Distribution Deal With National Grocer',
    'Goodfield agreed to supply its snack brands to a national grocery chain with more than 900 stores. The company said it will offer volume discounts and expects the first shipments next quarter.',
    [['Stores covered', '900+'], ['First shipments', 'next quarter']], ['GFD'], 0.6,
    [{ target: 'GFD', relevance: 1, signals: { rev: 0.5, out: 0.3, mar: -0.1 } }]),

  // ---------------- Week 8: Long-term investing and final review
  E('w8-conf', 8, 'Mon 10:00', 'macro', 'Consumer Confidence Rises for a Third Straight Month',
    'A monthly survey showed consumer confidence at its highest level in eight months. Households said they plan to spend more on travel and big-ticket items. Economists noted that confidence surveys do not always match actual spending.',
    [['Confidence index', 'eight-month high']], [], 0.7,
    [{ target: 'ALL', relevance: 1, signals: { dem: 0.5, sent: 0.4 } }], 'Broad market'),
  E('w8-nsr', 8, 'Tue 09:30', 'company', 'Northstar Margin Recovers to 31% After Discounting Ends',
    'Northstar\u2019s gross margin recovered to 31% from 29% as it ended heavy discounting. Sales growth slowed to 5% from 12% as shoppers bought less. Management said it expects margins to hold if shipping costs stay stable.',
    [['Gross margin', '29% to 31%'], ['Sales growth', '12% to 5%']], ['NSR'], 0.7,
    [{ target: 'NSR', relevance: 1, signals: { mar: 0.5, rev: -0.2, out: 0.1 } }]),
  E('w8-vlm', 8, 'Wed 08:40', 'company', 'Voltaic Issues Safety Recall on 3% of Vehicles',
    'Voltaic is recalling about 3% of its vehicles to replace a faulty battery connector. The company estimates the repair will cost $55 million and said deliveries will continue. Regulators are reviewing the case.',
    [['Vehicles recalled', 'about 3%'], ['Estimated cost', '$55M']], ['VLM'], 0.8,
    [{ target: 'VLM', relevance: 1, signals: { rev: -0.3, out: -0.4, reg: -0.3 } }]),
  E('w8-priv', 8, 'Thu 11:00', 'industry', 'Government Proposes New Data-Privacy Rules for Software Firms',
    'A government draft would require software companies to get clearer customer consent before using personal data. The draft is open for public comment for 90 days and details on penalties are still being written.',
    [['Comment period', '90 days'], ['Penalties', 'not yet set']], ['BWS'], 0.6,
    [{ target: 'BWS', relevance: 1, signals: { reg: -0.5 } }], 'Technology'),
];
