import { useRef, useState } from 'react';
import { ApiError, api, uid, type Asset, type PlayerView } from './api';
import { Banner, money } from './ui';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Why trading is unavailable, in words a beginner understands. */
function closedReason(phase: string, submitted: boolean): string {
  if (phase === 'trading' && submitted) return 'You have finished trading for this week, so your choices are locked in.';
  if (phase === 'intro') return 'Trading has not opened yet. Your teacher will open it after publishing this week\u2019s news.';
  if (phase === 'locked') return 'Trading is closed for this week. Your teacher has locked it, and the market results come next.';
  return 'Trading is closed while the class reviews this week. It opens again when the next week starts.';
}

/** Buy / sell panel with an order preview. The server checks everything again; this just makes the effect of an order obvious. */
export default function TradePanel({ asset, view, code, token, reload, onReopen }: { asset: Asset; view: PlayerView; code: string; token: string; reload: () => void; onReopen: () => void }) {
  const phase = view.room.phase;
  const open = phase === 'trading' && !view.me.submitted;
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const reqId = useRef(uid()); // one id per intended order, so a retry or double-tap is applied once

  const cash = view.me.cashCents;
  const price = asset.priceCents;
  const maxBuy = Math.floor(cash / price);
  const total = qty * price;
  const buying = side === 'buy';
  const problem =
    qty < 1 ? 'Choose at least 1 share.'
    : buying && total > cash ? (maxBuy === 0 ? `You do not have enough cash to buy even one share. One share costs ${money(price)} and you have ${money(cash)}.` : `You need ${money(total - cash)} more cash for this order. With ${money(cash)} you can buy up to ${plural(maxBuy, 'share')}.`)
    : !buying && qty > asset.shares ? `You only own ${plural(asset.shares, 'share')} of ${asset.name}, so you cannot sell ${qty}.`
    : '';

  async function run() {
    if (busyRef.current || problem) return;
    busyRef.current = true; setBusy(true); setMsg(null);
    try {
      const r = await api<{ totalCents: number; cashCents: number }>('POST', `/api/rooms/${code}/player/trade`, { ticker: asset.ticker, side, qty, requestId: reqId.current }, token);
      reqId.current = uid();
      setMsg({ kind: 'ok', text: `${buying ? 'Purchase' : 'Sale'} complete. You ${buying ? 'bought' : 'sold'} ${plural(qty, 'share')} of ${asset.name} for ${money(r.totalCents)}. Your cash is now ${money(r.cashCents)}.` });
      setQty(1); reload();
    } catch (e) {
      const err = e as ApiError;
      if (!err.network) reqId.current = uid(); // a rejected order is finished; a network failure can be retried safely with the same id
      setMsg({ kind: 'error', text: err.network ? 'No connection. Tap the button again to retry. It will not be counted twice.' : err.message });
      if (!err.network) reload();
    } finally { busyRef.current = false; setBusy(false); }
  }

  const quick = buying
    ? [{ l: '1', v: 1 }, { l: '5', v: 5 }, { l: '10', v: 10 }, { l: `Max (${maxBuy})`, v: maxBuy }]
    : [{ l: '1', v: 1 }, { l: 'Half', v: Math.floor(asset.shares / 2) }, { l: `All (${asset.shares})`, v: asset.shares }];

  return (
    <section className="tile trade" aria-label={`Invest in ${asset.name}`}>
      <h3>Invest in {asset.name}</h3>
      <dl className="trade-facts">
        <div><dt>Price of 1 share</dt><dd className="num">{money(price)}</dd></div>
        <div><dt>Your cash</dt><dd className="num">{money(cash)}</dd></div>
        <div><dt>You own</dt><dd className="num">{plural(asset.shares, 'share')}{asset.shares > 0 ? ` (${money(asset.valueCents)})` : ''}</dd></div>
      </dl>

      {!open ? (
        <div className="closed" role="status">
          <b>Trading is closed.</b> {closedReason(phase, view.me.submitted)}
          {phase === 'trading' && view.me.submitted && <div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={onReopen}>Change my decisions</button></div>}
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="Buy or sell">
            <button role="tab" aria-selected={buying} className={buying ? 'on' : ''} onClick={() => { setSide('buy'); setQty(1); setMsg(null); }}>Buy</button>
            <button role="tab" aria-selected={!buying} className={!buying ? 'on' : ''} disabled={asset.shares === 0} onClick={() => { setSide('sell'); setQty(1); setMsg(null); }}>Sell</button>
          </div>
          {asset.shares === 0 && <p className="fine">You can sell once you own shares of this company.</p>}

          <p className="label" id="qty-l">How many shares?</p>
          <div className="qty-quick">{quick.map((q) => <button key={q.l} className="chip" disabled={q.v < 1} onClick={() => setQty(q.v)}>{q.l}</button>)}</div>
          <div className="qty">
            <button className="btn btn-ghost" aria-label="One fewer share" onClick={() => setQty(Math.max(1, qty - 1))}>&minus;</button>
            <input aria-labelledby="qty-l" inputMode="numeric" value={qty || ''} onChange={(e) => setQty(Math.min(100000, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))} />
            <button className="btn btn-ghost" aria-label="One more share" onClick={() => setQty(qty + 1)}>+</button>
          </div>

          <div className={'preview' + (problem ? ' bad' : '')} aria-live="polite">
            <p className="preview-title">Order preview</p>
            <p>You are {buying ? 'buying' : 'selling'} <b>{plural(qty || 0, 'share')}</b> at <b className="num">{money(price)}</b> each.</p>
            <dl>
              <div><dt>{buying ? 'Total cost' : 'You will receive'}</dt><dd className="num">{money(total)}</dd></div>
              <div><dt>Cash remaining</dt><dd className={'num' + (buying && total > cash ? ' down' : '')}>{money(buying ? cash - total : cash + total)}</dd></div>
              {!buying && <div><dt>Shares left</dt><dd className="num">{Math.max(0, asset.shares - qty)}</dd></div>}
            </dl>
          </div>
          {problem && <Banner kind="error">{problem}</Banner>}
          <div aria-live="polite">{msg && <Banner kind={msg.kind}>{msg.text}</Banner>}</div>
          <button className="btn btn-primary btn-lg" disabled={!!problem || busy} onClick={run}>{busy ? 'Working...' : buying ? 'Confirm purchase' : 'Confirm sale'}</button>
          <p className="fine">Your teacher can see that you are done once you tap &ldquo;Finish trading for this week&rdquo;. Buying and selling here happens right away.</p>
        </>
      )}
    </section>
  );
}
