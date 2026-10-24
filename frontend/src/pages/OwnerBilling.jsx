import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  confirmSubscriptionPayment,
  fetchPlatformBilling,
  fetchPlatformContacts,
  rejectSubscriptionPayment,
  updatePlatformBillingConfig,
} from '../utils/api';
import { getUser } from '../utils/auth';
import { STATE_META, billingMessage, downloadCsv, fmtDate, messageKindFor, money, planName, whatsappLink } from '../utils/billing';
import { Alert, Badge, EmptyState, Field, Modal, Panel, PanelHeader, SkeletonRows, StatGrid, StatTile, Toast, fieldInput, icons, statIcons } from '../components/ui';

function RejectModal({ payment, currency, onCancel, onConfirm, busy }) {
  const [note, setNote] = useState('We could not find this transaction on our statement.');
  return (
    <Modal
      title="Reject this payment?"
      subtitle={`${payment.shop?.name}: ${money(payment.amount, currency)} · ${payment.reference || 'no transaction ID'}`}
      onClose={onCancel}
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onCancel} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => onConfirm(note)} disabled={busy} className="app-btn-danger-solid flex-1 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? 'Rejecting…' : 'Reject'}</button>
        </>
      )}
    >
      <Field label="Reason (the shop owner sees this)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={fieldInput} />
      </Field>
    </Modal>
  );
}

function SettingsPanel({ config, onSaved }) {
  const [form, setForm] = useState(() => ({
    trialDays: config.trialDays,
    graceDays: config.graceDays,
    supportWhatsapp: config.supportWhatsapp || '',
    payTo: { ...config.payTo },
    plans: config.plans.map((p) => ({ ...p })),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setPlan = (key, field, value) => setForm((f) => ({ ...f, plans: f.plans.map((p) => (p.key === key ? { ...p, [field]: value } : p)) }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await updatePlatformBillingConfig(form);
      onSaved(res.config);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Billing settings" description="Prices and where shops send money" />
      <form onSubmit={save} className="space-y-5 p-4 sm:p-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="MTN Mobile Money number"><input value={form.payTo.mtnNumber} onChange={(e) => setForm({ ...form, payTo: { ...form.payTo, mtnNumber: e.target.value } })} className={fieldInput} placeholder="07XX XXX XXX" /></Field>
          <Field label="Airtel Money number"><input value={form.payTo.airtelNumber} onChange={(e) => setForm({ ...form, payTo: { ...form.payTo, airtelNumber: e.target.value } })} className={fieldInput} placeholder="07XX XXX XXX" /></Field>
          <Field label="Registered name on the numbers"><input value={form.payTo.accountName} onChange={(e) => setForm({ ...form, payTo: { ...form.payTo, accountName: e.target.value } })} className={fieldInput} /></Field>
          <Field label="Support WhatsApp" hint="International format, e.g. 256742226839"><input value={form.supportWhatsapp} onChange={(e) => setForm({ ...form, supportWhatsapp: e.target.value })} className={fieldInput} /></Field>
          <Field label="Payment instructions shops see" className="sm:col-span-2"><textarea value={form.payTo.instructions} onChange={(e) => setForm({ ...form, payTo: { ...form.payTo, instructions: e.target.value } })} rows={2} className={fieldInput} /></Field>
          <Field label="Free trial for new shops (days)"><input type="number" min="0" max="365" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} className={fieldInput} /></Field>
          <Field label="Grace period before read-only (days)"><input type="number" min="0" max="60" value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: e.target.value })} className={fieldInput} /></Field>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">Plans</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {form.plans.map((p) => (
              <div key={p.key} className="rounded-xl border border-[var(--border-default)] p-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                <Field label="Price per month" className="mt-2"><input type="number" min="0" value={p.price} onChange={(e) => setPlan(p.key, 'price', e.target.value)} className={fieldInput} /></Field>
                <Field label="Staff logins (blank = unlimited)" className="mt-2"><input type="number" min="1" value={p.staffLimit ?? ''} onChange={(e) => setPlan(p.key, 'staffLimit', e.target.value === '' ? null : e.target.value)} className={fieldInput} /></Field>
              </div>
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </Panel>
  );
}

export default function OwnerBilling() {
  const user = getUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    try {
      setData(await fetchPlatformBilling());
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load billing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (user?.role !== 'SuperAdmin') return <Navigate to="/app" replace />;

  const flash = (text) => { setToast(text); window.setTimeout(() => setToast(''), 3000); };

  const confirm = async (p) => {
    setBusyId(p.id);
    try {
      const res = await confirmSubscriptionPayment(p.id);
      flash(`${p.shop?.name} confirmed, paid until ${fmtDate(res.status?.paidUntil)}.`);
      await load();
    } catch (err) {
      setError(err.message || 'Could not confirm.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (note) => {
    const p = rejecting;
    setBusyId(p.id);
    try {
      await rejectSubscriptionPayment(p.id, note);
      flash(`Payment from ${p.shop?.name} rejected.`);
      setRejecting(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not reject.');
    } finally {
      setBusyId(null);
    }
  };

  const exportContacts = async () => {
    setExporting(true);
    try {
      const { contacts } = await fetchPlatformContacts();
      downloadCsv(`stockdesk-contacts-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Shop', 'Owner', 'Email', 'Email verified', 'Phone', 'WhatsApp', 'Business type', 'Town / area', 'Status', 'Plan', 'Days left', 'Ends', 'Joined'],
        ...contacts.map((c) => [
          c.shopName, c.ownerName, c.ownerEmail, c.emailVerified ? 'yes' : 'no', c.ownerPhone, c.whatsapp, c.businessType, c.location,
          STATE_META[c.state]?.label || c.state, c.plan || '', c.daysLeft ?? '', c.endsAt ? fmtDate(c.endsAt) : '', fmtDate(c.joined),
        ]),
      ]);
    } catch (err) {
      setError(err.message || 'Could not export contacts.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <Panel><SkeletonRows rows={8} /></Panel>;
  if (!data) return <Panel><EmptyState title={error || 'Billing is not available'} /></Panel>;

  const { summary, config } = data;
  const currency = config.currency || 'UGX';

  return (
    <div className="space-y-5">
      <StatGrid cols={4}>
        <StatTile label="On free trial" value={summary.trial} hint={`${summary.totalShops} shops in total`} icon={statIcons.calendar} iconTone="info" />
        <StatTile label="Paying" value={summary.active} hint={`${money(summary.monthlyRecurring, currency)} a month`} tone="success" icon={statIcons.check} iconTone="success" />
        <StatTile label="Payment due · read-only" value={`${summary.past_due} · ${summary.expired}`} hint="In grace period · locked" tone={summary.past_due + summary.expired ? 'warning' : 'default'} icon={statIcons.alert} iconTone="warning" />
        <StatTile label="Collected this month" value={money(summary.revenueThisMonth, currency)} hint={`Last month ${money(summary.revenueLastMonth, currency)}`} icon={statIcons.money} />
      </StatGrid>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!config.payTo?.mtnNumber && !config.payTo?.airtelNumber ? (
        <Alert tone="warning">Add your MTN or Airtel Money number in Billing settings below so shops know where to pay.</Alert>
      ) : null}

      <Panel>
        <PanelHeader
          title="Payments to confirm"
          description={summary.pendingPayments ? 'Check each one on your Mobile Money statement, then confirm or reject it' : 'Nothing waiting'}
          actions={<button type="button" onClick={load} className="app-btn-secondary inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm">{icons.refresh}Refresh</button>}
        />
        {!data.pending.length ? (
          <EmptyState title="All caught up" message="When a shop sends a payment it appears here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Shop</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Transaction</th>
                  <th className="px-4 py-2.5 font-medium">Sent</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.pending.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Shop" className="px-4 py-2.5"><Link to={`/app/shops/${p.shopId}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{p.shop?.name}</Link>{p.submittedBy ? <span className="block text-xs text-[var(--text-muted)]">by {p.submittedBy.name}</span> : null}</td>
                    <td data-label="Plan" className="px-4 py-2.5">{planName(config, p.plan)} · {p.months} mo</td>
                    <td data-label="Amount" className="num px-4 py-2.5 text-right font-semibold">{money(p.amount, currency)}</td>
                    <td data-label="Transaction" className="px-4 py-2.5">{p.method}<span className="block font-mono text-xs text-[var(--text-muted)]">{p.reference || 'no ID'}{p.payerPhone ? ` · from ${p.payerPhone}` : ''}</span></td>
                    <td data-label="Sent" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">{fmtDate(p.createdAt)}</td>
                    <td data-label="Actions" className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setRejecting(p)} disabled={busyId === p.id} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-xs font-medium">Reject</button>
                        <button type="button" onClick={() => confirm(p)} disabled={busyId === p.id} className="app-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60">{busyId === p.id ? 'Confirming…' : 'Confirm'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Shops to follow up"
          description="Trials and plans ending within 7 days, payments due, and read-only shops"
          actions={<button type="button" onClick={exportContacts} disabled={exporting} className="app-btn-secondary inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm">{icons.download}{exporting ? 'Exporting…' : 'Export all contacts'}</button>}
        />
        {!data.attention.length ? (
          <EmptyState title="Nobody to chase right now" message="Shops appear here a week before their trial or plan ends." />
        ) : (
          <ul className="divide-y divide-[var(--border-default)]">
            {data.attention.map((s) => {
              const meta = STATE_META[s.state];
              const price = config.plans.find((p) => p.key === (s.plan || 'starter'))?.price;
              const text = billingMessage(messageKindFor(s.state), { shopName: s.name, ownerName: s.ownerName, amount: price, planLabel: planName(config, s.plan || 'starter'), endsAt: s.endsAt, payTo: config.payTo, currency });
              return (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/app/shops/${s.id}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{s.name}</Link>
                      <Badge tone={meta.tone}>{meta.label}{s.daysLeft != null && s.daysLeft >= 0 ? ` · ${s.daysLeft}d` : ''}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{[s.ownerName, s.ownerPhone, s.ownerEmail].filter(Boolean).join(' · ') || 'No contact details'}{s.endsAt ? ` · ends ${fmtDate(s.endsAt)}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {s.whatsapp ? <a href={whatsappLink(s.whatsapp, text)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">WhatsApp</a> : null}
                    {s.ownerEmail ? <a href={`mailto:${s.ownerEmail}?subject=${encodeURIComponent(`StockDesk: ${s.name}`)}&body=${encodeURIComponent(text)}`} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-xs font-medium">Email</a> : null}
                    <Link to={`/app/shops/${s.id}`} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-xs font-medium">Open</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <SettingsPanel key={JSON.stringify(config)} config={config} onSaved={() => { flash('Billing settings saved.'); load(); }} />
        <Panel>
          <PanelHeader title="Recent decisions" />
          {!data.recent.length ? (
            <EmptyState title="No payments reviewed yet" />
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {data.recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]">{p.shop?.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{planName(config, p.plan)} · {fmtDate(p.reviewedAt || p.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">{money(p.amount, currency)}</p>
                    <Badge tone={p.status === 'confirmed' ? 'success' : 'danger'}>{p.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {rejecting ? <RejectModal payment={rejecting} currency={currency} onCancel={() => setRejecting(null)} onConfirm={reject} busy={busyId === rejecting.id} /> : null}
      <Toast text={toast} />
    </div>
  );
}
