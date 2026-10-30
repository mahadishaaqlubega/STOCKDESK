import { useEffect, useMemo, useState } from 'react';
import { fetchTill, openTill, addTillMovement, closeTill, fetchTillSessions, fetchTillSession, fetchSettings } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { formatMoney, formatAmount } from '../utils/format';
import { Alert, Badge, EmptyState, Field, Modal, Panel, PanelHeader, SkeletonRows, StatGrid, StatTile, Toast, fieldInput, statIcons } from '../components/ui';

const QUICK_REASONS = {
  out: ['Owner took cash', 'Bought supplies', 'Transport', 'Banked'],
  in: ['Added change', 'Owner added cash'],
};

// How the expected total is built, in order. sign: +1 adds to the drawer.
const BREAKDOWN_LINES = [
  { key: 'openingFloat', label: 'Opening float', sign: 1 },
  { key: 'cashSales', label: 'Cash sales', sign: 1 },
  { key: 'creditPayments', label: 'Debt payments in cash', sign: 1 },
  { key: 'cashIn', label: 'Cash added', sign: 1 },
  { key: 'refunds', label: 'Refunds paid out', sign: -1 },
  { key: 'expenses', label: 'Expenses paid from the till', sign: -1 },
  { key: 'supplierPayments', label: 'Suppliers paid in cash', sign: -1 },
  { key: 'cashOut', label: 'Cash taken out', sign: -1 },
];

const timeLabel = (value) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dateTimeLabel = (value) => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function DifferenceBadge({ currency, value }) {
  const diff = Number(value || 0);
  if (Math.abs(diff) < 0.005) return <Badge tone="success">Balanced</Badge>;
  return diff < 0
    ? <Badge tone="danger">Short {formatMoney(currency, -diff)}</Badge>
    : <Badge tone="warning">Over {formatMoney(currency, diff)}</Badge>;
}

function Breakdown({ currency, breakdown, expectedCash }) {
  if (!breakdown) return null;
  return (
    <dl className="space-y-1.5 text-sm">
      {BREAKDOWN_LINES.filter((line) => line.key === 'openingFloat' || Number(breakdown[line.key])).map((line) => (
        <div key={line.key} className="flex justify-between gap-3 text-[var(--text-secondary)]">
          <dt>{line.label}</dt>
          <dd className="num">{line.sign < 0 ? '−' : line.key === 'openingFloat' ? '' : '+'}{formatAmount(currency, breakdown[line.key])}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-[var(--border-default)] pt-1.5 font-semibold text-[var(--text-primary)]">
        <dt>Should be in the drawer</dt>
        <dd className="num">{formatMoney(currency, expectedCash)}</dd>
      </div>
    </dl>
  );
}

function MovementList({ currency, movements }) {
  if (!movements?.length) return <p className="px-5 py-5 text-sm text-[var(--text-muted)]">No cash added or taken out.</p>;
  return (
    <ul className="divide-y divide-[var(--border-default)]">
      {movements.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--text-primary)]">{m.reason}</p>
            <p className="text-xs text-[var(--text-muted)]">{timeLabel(m.createdAt)}{m.user?.name ? ` · ${m.user.name}` : ''}</p>
          </div>
          <span className={`num shrink-0 font-medium ${m.type === 'out' ? 'text-[var(--danger)]' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {m.type === 'out' ? '−' : '+'}{formatAmount(currency, m.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Till() {
  const user = getUser();
  const isAdmin = user?.role === 'Admin';
  const [currency, setCurrency] = useState('UGX');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const [floatInput, setFloatInput] = useState('');
  const [openNote, setOpenNote] = useState('');

  const [movementType, setMovementType] = useState(null);
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementError, setMovementError] = useState('');

  const [countMode, setCountMode] = useState('notes');
  const [counts, setCounts] = useState({});
  const [totalInput, setTotalInput] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [result, setResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [detail, setDetail] = useState(null);

  useBodyScrollLock(Boolean(movementType || confirmClose || result || detail));

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3000);
  };

  const load = async () => {
    try {
      const data = await fetchTill();
      setState(data);
      if (!data.session && data.lastClosed && floatInput === '') {
        setFloatInput(String(Math.round(data.lastClosed.openingFloat)));
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = () => {
    if (!isAdmin) return;
    fetchTillSessions().then((rows) => setHistory(Array.isArray(rows) ? rows : [])).catch(() => {});
  };

  useEffect(() => {
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
    load();
    loadHistory();
  }, []);

  const session = state?.session;
  const denominations = useMemo(() => state?.denominations || [], [state]);
  const useNotes = currency === 'UGX' && countMode === 'notes';
  const notesTotal = useMemo(
    () => denominations.reduce((sum, note) => sum + note * (Number(counts[note]) || 0), 0),
    [counts, denominations],
  );
  const countedCash = useNotes ? notesTotal : Number(totalInput);

  const handleOpen = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (floatInput === '' || !(Number(floatInput) >= 0)) {
      setError('Enter the cash in the drawer to start with (0 if empty).');
      return;
    }
    setBusy(true);
    try {
      await openTill({ openingFloat: Number(floatInput), note: openNote || undefined });
      setOpenNote('');
      setCounts({});
      setTotalInput('');
      flash(`Till opened with ${formatMoney(currency, floatInput)}`);
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const startMovement = (type) => {
    setMovementType(type);
    setMovementAmount('');
    setMovementReason('');
    setMovementError('');
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!(Number(movementAmount) > 0)) {
      setMovementError('Enter an amount greater than 0.');
      return;
    }
    if (!movementReason.trim()) {
      setMovementError('Say what the cash was for.');
      return;
    }
    setBusy(true);
    try {
      await addTillMovement({ type: movementType, amount: Number(movementAmount), reason: movementReason.trim() });
      flash(`${movementType === 'out' ? 'Cash out' : 'Cash in'} recorded · ${formatMoney(currency, movementAmount)}`);
      setMovementType(null);
      await load();
    } catch (err) {
      setMovementError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askClose = (e) => {
    e.preventDefault();
    if (!useNotes && (totalInput === '' || !(Number(totalInput) >= 0))) {
      setError('Enter the total cash you counted.');
      return;
    }
    setError('');
    setConfirmClose(true);
  };

  const handleClose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = { countedCash, note: closeNote || undefined };
      if (useNotes) body.denominations = Object.fromEntries(Object.entries(counts).filter(([, c]) => Number(c) > 0).map(([n, c]) => [n, Number(c)]));
      const res = await closeTill(body);
      setConfirmClose(false);
      setResult(res);
      setCounts({});
      setTotalInput('');
      setCloseNote('');
      setFloatInput('');
      await load();
      loadHistory();
    } catch (err) {
      setConfirmClose(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (row) => {
    try {
      setDetail(await fetchTillSession(row.id));
    } catch (err) {
      flash(err.message);
    }
  };

  if (loading) return <Panel><SkeletonRows rows={4} /></Panel>;

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!session ? (
        <Panel>
          <PanelHeader
            title="Open the till"
            description="Count the cash in the drawer before the first sale. At closing, StockDesk works out what should be there."
          />
          <form onSubmit={handleOpen} className="grid max-w-xl gap-4 px-4 py-5 sm:px-5">
            <Field
              label={`Cash in the drawer now (${currency})`}
              hint={state?.lastClosed ? `Last closing count: ${formatMoney(currency, state.lastClosed.countedCash)} on ${dateTimeLabel(state.lastClosed.closedAt)}` : 'The float, usually small notes and coins for change.'}
            >
              <input autoFocus required type="number" min="0" step="any" inputMode="decimal" value={floatInput} onChange={(e) => setFloatInput(e.target.value)} className={fieldInput} placeholder="0" />
            </Field>
            <Field label="Note">
              <input value={openNote} onChange={(e) => setOpenNote(e.target.value)} maxLength={500} className={fieldInput} placeholder="Optional" />
            </Field>
            <div>
              <button type="submit" disabled={busy} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                {busy ? 'Opening…' : 'Open till'}
              </button>
            </div>
          </form>
        </Panel>
      ) : (
        <>
          <StatGrid cols={isAdmin ? 4 : 2}>
            <StatTile label="Till open since" value={timeLabel(session.openedAt)} hint={session.openedBy?.name ? `Opened by ${session.openedBy.name}` : dateTimeLabel(session.openedAt)} icon={statIcons.calendar} iconTone="info" />
            <StatTile label="Opening float" value={formatMoney(currency, session.openingFloat)} hint="Cash at the start" icon={statIcons.money} />
            {isAdmin ? (
              <>
                <StatTile label="Cash sales" value={formatMoney(currency, state.breakdown?.cashSales)} hint={`${state.breakdown?.salesCount ?? 0} sales since opening`} icon={statIcons.receipt} iconTone="success" />
                <StatTile label="Should be in the drawer" value={formatMoney(currency, state.expectedCash)} hint="Only owners and managers see this" icon={statIcons.check} iconTone="accent" />
              </>
            ) : null}
          </StatGrid>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel>
              <PanelHeader
                title="Close and count"
                description={isAdmin ? 'Count the cash in the drawer, then close the till.' : 'Count the cash in the drawer. You will see if it balances after you close.'}
              />
              <form onSubmit={askClose} className="space-y-4 px-4 py-5 sm:px-5">
                {currency === 'UGX' ? (
                  <div className="inline-flex rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-1" role="tablist" aria-label="How to count">
                    {[{ key: 'notes', label: 'Count notes and coins' }, { key: 'total', label: 'Enter the total' }].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={countMode === tab.key}
                        onClick={() => setCountMode(tab.key)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${countMode === tab.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {useNotes ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {denominations.map((note) => (
                      <label key={note} className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2">
                        <span className="num w-16 shrink-0 text-sm font-medium text-[var(--text-primary)]">{formatAmount('UGX', note)}</span>
                        <span className="text-xs text-[var(--text-muted)]">×</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Number of ${formatAmount('UGX', note)} ${note >= 1000 ? 'notes' : 'coins'}`}
                          value={counts[note] ?? ''}
                          onChange={(e) => setCounts((p) => ({ ...p, [note]: e.target.value.replace(/[^0-9]/g, '') }))}
                          className="app-input num w-full min-w-0 rounded-md border px-2 py-1 text-right text-sm"
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <Field label={`Cash counted (${currency})`}>
                    <input type="number" min="0" step="any" inputMode="decimal" value={totalInput} onChange={(e) => setTotalInput(e.target.value)} className={fieldInput} placeholder="0" />
                  </Field>
                )}

                <div className="flex items-baseline justify-between rounded-lg bg-[var(--surface-secondary)] px-4 py-3">
                  <span className="text-sm text-[var(--text-secondary)]">Cash counted</span>
                  <span className="num text-xl font-semibold text-[var(--text-primary)]">{formatMoney(currency, Number.isFinite(countedCash) ? countedCash : 0)}</span>
                </div>

                <Field label="Note">
                  <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={500} className={fieldInput} placeholder="Optional, e.g. a torn note set aside" />
                </Field>

                <button type="submit" disabled={busy} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">Close till</button>
              </form>
            </Panel>

            <div className="space-y-5">
              <Panel>
                <PanelHeader
                  title="Cash in and out"
                  description="Money added or taken that is not a sale."
                  actions={(
                    <>
                      <button type="button" onClick={() => startMovement('in')} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-sm font-medium">Cash in</button>
                      <button type="button" onClick={() => startMovement('out')} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-sm font-medium">Cash out</button>
                    </>
                  )}
                />
                <MovementList currency={currency} movements={state.movements} />
              </Panel>

              {isAdmin ? (
                <Panel>
                  <PanelHeader title="How the total is worked out" />
                  <div className="px-5 py-4">
                    <Breakdown currency={currency} breakdown={state.breakdown} expectedCash={state.expectedCash} />
                  </div>
                </Panel>
              ) : null}
            </div>
          </div>
        </>
      )}

      {isAdmin ? (
        <Panel>
          <PanelHeader title="Past counts" description="Every closing, with any shortage or extra cash." />
          {history.length === 0 ? (
            <EmptyState title="No counts yet" message="Each time the till is closed, the count shows here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Closed</th>
                    <th className="px-4 py-2.5 font-medium">Counted by</th>
                    <th className="px-4 py-2.5 text-right font-medium">Expected ({currency})</th>
                    <th className="px-4 py-2.5 text-right font-medium">Counted ({currency})</th>
                    <th className="px-4 py-2.5 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {history.map((row) => (
                    <tr key={row.id} className="app-row-hover cursor-pointer" onClick={() => openDetail(row)}>
                      <td data-label="Closed" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-secondary)]">{dateTimeLabel(row.closedAt)}</td>
                      <td data-label="Counted by" className="px-4 py-2.5 text-[var(--text-primary)]">{row.closedBy?.name || '-'}</td>
                      <td data-label="Expected" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{formatAmount(currency, row.expectedCash)}</td>
                      <td data-label="Counted" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, row.countedCash)}</td>
                      <td data-label="Result" className="px-4 py-2.5 text-right"><DifferenceBadge currency={currency} value={row.difference} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {movementType ? (
        <Modal
          title={movementType === 'out' ? 'Cash out of the till' : 'Cash into the till'}
          subtitle={movementType === 'out' ? 'Money taken from the drawer that is not a refund or expense.' : 'Money put in the drawer that is not a sale.'}
          onClose={() => setMovementType(null)}
          size="sm"
        >
          <form onSubmit={handleMovement} className="space-y-4">
            <Field label={`Amount (${currency})`}>
              <input autoFocus required type="number" min="0" step="any" inputMode="decimal" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} className={fieldInput} placeholder="0" />
            </Field>
            <div>
              <Field label="What it was for">
                <input required value={movementReason} onChange={(e) => setMovementReason(e.target.value)} maxLength={200} className={fieldInput} />
              </Field>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_REASONS[movementType].map((reason) => (
                  <button key={reason} type="button" onClick={() => setMovementReason(reason)} className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)]">
                    {reason}
                  </button>
                ))}
              </div>
            </div>
            {movementError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{movementError}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={() => setMovementType(null)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={busy} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{busy ? 'Saving…' : 'Record'}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmClose ? (
        <Modal
          title="Close the till?"
          subtitle={`You counted ${formatMoney(currency, countedCash)}. After closing, nobody can change this count.`}
          onClose={() => setConfirmClose(false)}
          size="sm"
          footer={(
            <>
              <button type="button" onClick={() => setConfirmClose(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Count again</button>
              <button type="button" onClick={handleClose} disabled={busy} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{busy ? 'Closing…' : 'Close till'}</button>
            </>
          )}
        >
          <p className="text-sm text-[var(--text-secondary)]">Sales made while the till is closed are not counted in any till. Open it again before the next sale.</p>
        </Modal>
      ) : null}

      {result ? (
        <Modal
          title="Till closed"
          onClose={() => setResult(null)}
          size="sm"
          footer={<button type="button" onClick={() => setResult(null)} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm">Done</button>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-[var(--surface-secondary)] px-3 py-2.5">
                <p className="text-xs text-[var(--text-muted)]">Should be</p>
                <p className="num mt-0.5 font-semibold text-[var(--text-primary)]">{formatMoney(currency, result.expectedCash)}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-secondary)] px-3 py-2.5">
                <p className="text-xs text-[var(--text-muted)]">Counted</p>
                <p className="num mt-0.5 font-semibold text-[var(--text-primary)]">{formatMoney(currency, result.session?.countedCash)}</p>
              </div>
            </div>
            <div className="text-center"><DifferenceBadge currency={currency} value={result.difference} /></div>
            <Breakdown currency={currency} breakdown={result.breakdown} expectedCash={result.expectedCash} />
          </div>
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          title={`Till closed ${dateTimeLabel(detail.session.closedAt)}`}
          subtitle={`Opened ${dateTimeLabel(detail.session.openedAt)}${detail.session.openedBy?.name ? ` by ${detail.session.openedBy.name}` : ''} · counted by ${detail.session.closedBy?.name || 'a former team member'}`}
          onClose={() => setDetail(null)}
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--text-secondary)]">Counted <span className="num font-semibold text-[var(--text-primary)]">{formatMoney(currency, detail.session.countedCash)}</span></p>
              <DifferenceBadge currency={currency} value={detail.session.difference} />
            </div>
            <Breakdown currency={currency} breakdown={detail.session.breakdown} expectedCash={detail.session.expectedCash} />
            {detail.session.denominations && Object.keys(detail.session.denominations).length ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">Notes and coins</p>
                <p className="num text-sm text-[var(--text-muted)]">
                  {Object.entries(detail.session.denominations).sort((a, b) => Number(b[0]) - Number(a[0])).map(([note, count]) => `${formatAmount('UGX', note)} × ${count}`).join(' · ')}
                </p>
              </div>
            ) : null}
            {detail.session.openingNote || detail.session.closingNote ? (
              <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                {detail.session.openingNote ? <p>Opening note: {detail.session.openingNote}</p> : null}
                {detail.session.closingNote ? <p>Closing note: {detail.session.closingNote}</p> : null}
              </div>
            ) : null}
            <div className="-mx-5 border-t border-[var(--border-default)]">
              <MovementList currency={currency} movements={detail.movements} />
            </div>
          </div>
        </Modal>
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
