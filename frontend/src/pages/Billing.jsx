import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchBillingPayments, fetchBillingStatus, openPdf, submitBillingPayment, updateBillingProfile } from '../utils/api';
import { getUser } from '../utils/auth';
import { STATE_META, fmtDate, money, planName, stateLabel, whatsappLink } from '../utils/billing';
import { Alert, Badge, EmptyState, Field, Panel, PanelHeader, SkeletonRows, Toast, fieldInput } from '../components/ui';

const MONTH_OPTIONS = [1, 3, 6, 12];
const PAYMENT_TONES = { pending: 'warning', confirmed: 'success', rejected: 'danger' };

function CopyValue({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s/g, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" onClick={copy} className="num inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] px-2.5 py-1 font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)]">
      {value}
      <span className="text-xs font-medium text-[var(--accent)]">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export default function Billing() {
  const user = getUser();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [plan, setPlan] = useState('');
  const [months, setMonths] = useState(1);
  const [requestId, setRequestId] = useState(null);
  const [form, setForm] = useState({ method: 'MTN Mobile Money', reference: '', payerPhone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState({ ownerPhone: '', businessType: '', location: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const load = async () => {
    try {
      const [status, history] = await Promise.all([fetchBillingStatus(), fetchBillingPayments()]);
      setData(status);
      setPayments(history.payments || []);
      setProfile({
        ownerPhone: status.profile?.ownerPhone || '',
        businessType: status.profile?.businessType || '',
        location: status.profile?.location || '',
      });
      setPlan((current) => current || status.status?.plan || 'growth');
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load billing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const config = data?.config;
  const currency = config?.currency || 'UGX';
  const selectedPlan = config?.plans?.find((p) => p.key === plan);
  const request = data?.openRequests?.find((r) => r.id === requestId) || null;
  const total = request ? request.amount : (selectedPlan?.price || 0) * months;
  const payTo = config?.payTo || {};
  const hasNumbers = Boolean(payTo.mtnNumber || payTo.airtelNumber);

  const statusLine = useMemo(() => {
    const st = data?.status;
    if (!st) return '';
    if (st.state === 'trial') return `Your free trial runs until ${fmtDate(st.endsAt)}. Pay any time before then: your paid month starts when the trial ends, so you lose nothing by paying early.`;
    if (st.state === 'active') return `${planName(config, st.plan)} plan, paid up until ${fmtDate(st.endsAt)}. Paying now adds time after that date.`;
    if (st.state === 'past_due') return `Your ${st.paidUntil ? 'plan' : 'trial'} ended on ${fmtDate(st.endsAt)}. Everything still works until ${fmtDate(st.graceEndsAt)}, then the shop becomes read-only.`;
    return 'The shop is read-only: you can view and export your records, but not make sales or changes. Pay below and selling starts again as soon as we confirm it.';
  }, [data, config]);

  if (user?.role !== 'Admin') return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await submitBillingPayment({ plan, months, requestId, ...form });
      setForm((f) => ({ ...f, reference: '' }));
      setRequestId(null);
      setToast('Payment sent for confirmation. We will email you once it is confirmed.');
      window.setTimeout(() => setToast(''), 4000);
      window.dispatchEvent(new CustomEvent('sd:subscription'));
      await load();
    } catch (err) {
      setError(err.message || 'Could not send the payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateBillingProfile(profile);
      setToast('Contact details saved.');
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(err.message || 'Could not save your details.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) return <Panel><SkeletonRows rows={6} /></Panel>;
  if (!data) return <Panel><EmptyState title={error || 'Billing is not available right now'} /></Panel>;

  const st = data.status;
  const meta = STATE_META[st.state] || STATE_META.trial;

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Subscription</h2>
              <Badge tone={meta.tone} dot>{stateLabel(st)}</Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">{statusLine}</p>
          </div>
          <a href={whatsappLink(config?.supportWhatsapp, 'Hi StockDesk, I have a question about my subscription.')} target="_blank" rel="noopener noreferrer" className="app-btn-secondary inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium">
            Questions? WhatsApp us
          </a>
        </div>
      </Panel>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {data.openRequests?.length ? (
        <Panel>
          <PanelHeader title="Payment requests" description="Sent to you by StockDesk" />
          <ul className="divide-y divide-[var(--border-default)]">
            {data.openRequests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-[var(--text-primary)]">{money(r.amount, currency)} · {planName(config, r.plan)} plan · {r.months} month{r.months > 1 ? 's' : ''}</p>
                  <p className="text-[var(--text-muted)]">{r.message || 'Please pay to keep your shop running.'}{r.dueDate ? ` Due ${fmtDate(r.dueDate)}.` : ''}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => openPdf(`/billing/requests/${r.id}/invoice.pdf`).catch((e) => setError(e.message))} className="app-btn-secondary rounded-lg border px-3 py-2 text-sm font-medium">Invoice (PDF)</button>
                  <button type="button" onClick={() => { setRequestId(r.id); setPlan(r.plan); setMonths(r.months); document.getElementById('pay-form')?.scrollIntoView({ behavior: 'smooth' }); }} className={`${requestId === r.id ? 'app-btn-primary' : 'app-btn-secondary border'} rounded-lg px-3.5 py-2 text-sm font-medium`}>
                    {requestId === r.id ? 'Selected' : 'Pay this'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel>
          <PanelHeader title="1. Choose your plan" description={request ? 'Paying the selected request' : 'Prices are per month, in shillings'} />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
            {config.plans.map((p) => {
              const on = plan === p.key && !request;
              return (
                <button key={p.key} type="button" disabled={Boolean(request)} onClick={() => setPlan(p.key)} className={`rounded-xl border p-4 text-left transition disabled:opacity-50 ${on ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'}`}>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                  <p className="num mt-1 text-xl font-semibold text-[var(--text-primary)]">{money(p.price, currency)}</p>
                  <p className="text-xs text-[var(--text-muted)]">per month · {p.staffLimit ? `owner + ${p.staffLimit} staff` : 'unlimited staff'}</p>
                  {data.staff && p.staffLimit != null && data.staff.used >= p.staffLimit ? (
                    <p className="mt-1.5 text-[11px] font-medium text-[var(--warning)]">You have {data.staff.used} staff: you couldn&apos;t add more on this plan</p>
                  ) : null}
                </button>
              );
            })}
          </div>
          {!request ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] px-4 py-3.5 sm:px-5">
              <span className="text-sm text-[var(--text-muted)]">Pay for</span>
              {MONTH_OPTIONS.map((m) => (
                <button key={m} type="button" onClick={() => setMonths(m)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${months === m ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'border-[var(--border-default)] text-[var(--text-secondary)]'}`}>
                  {m} month{m > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-[var(--border-default)] px-4 py-4 sm:px-5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Amount to send
              {!request ? <button type="button" onClick={() => openPdf(`/billing/invoice.pdf?plan=${plan}&months=${months}`).catch((e) => setError(e.message))} className="ml-3 text-xs font-semibold text-[var(--accent)] hover:underline">Get invoice (PDF)</button> : null}
            </span>
            <span className="num text-2xl font-semibold text-[var(--text-primary)]">{money(total, currency)}</span>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="2. Send the money" description="By Mobile Money" />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            {hasNumbers ? (
              <>
                {payTo.mtnNumber ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[var(--text-secondary)]">MTN Mobile Money</span><CopyValue value={payTo.mtnNumber} /></div> : null}
                {payTo.airtelNumber ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[var(--text-secondary)]">Airtel Money</span><CopyValue value={payTo.airtelNumber} /></div> : null}
                {payTo.accountName ? <p className="text-[var(--text-muted)]">Registered name: <span className="font-medium text-[var(--text-primary)]">{payTo.accountName}</span></p> : null}
              </>
            ) : (
              <Alert tone="info">Message us on WhatsApp and we will send you the number to pay to.</Alert>
            )}
            {payTo.instructions ? <p className="text-[var(--text-muted)]">{payTo.instructions}</p> : null}
          </div>
        </Panel>
      </div>

      <Panel id="pay-form">
        <PanelHeader title="3. Tell us you paid" description="We check our statement and confirm, usually within a few hours" />
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="How you paid">
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={fieldInput}>
              {(data.methods || ['MTN Mobile Money', 'Airtel Money']).map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Transaction ID" hint="From the confirmation SMS">
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={`${fieldInput} font-mono`} placeholder="e.g. 12345678901" required={form.method !== 'Cash'} />
          </Field>
          <Field label="Number you paid from" hint="Helps us find it faster">
            <input value={form.payerPhone} onChange={(e) => setForm({ ...form, payerPhone: e.target.value })} className={fieldInput} placeholder="07XX XXX XXX" inputMode="tel" />
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-muted)]">{request ? `Paying request for ${money(request.amount, currency)}.` : `${planName(config, plan)} plan, ${months} month${months > 1 ? 's' : ''}: ${money(total, currency)}.`}</p>
            <button type="submit" disabled={submitting} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
              {submitting ? 'Sending…' : 'Send for confirmation'}
            </button>
          </div>
        </form>
      </Panel>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel>
          <PanelHeader title="Payment history" />
          {!payments.length ? (
            <EmptyState title="No payments yet" message="Payments you send will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Transaction</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Date" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-secondary)]">{fmtDate(p.createdAt)}</td>
                      <td data-label="Plan" className="px-4 py-2.5">{planName(config, p.plan)} · {p.months} mo{p.periodEnd ? <span className="block text-xs text-[var(--text-muted)]">until {fmtDate(p.periodEnd)}</span> : null}</td>
                      <td data-label="Amount" className="num px-4 py-2.5 text-right font-medium">{money(p.amount, currency)}</td>
                      <td data-label="Transaction" className="px-4 py-2.5 text-[var(--text-secondary)]">{p.method}{p.reference ? <span className="block font-mono text-xs text-[var(--text-muted)]">{p.reference}</span> : null}</td>
                      <td data-label="Status" className="px-4 py-2.5">
                        <Badge tone={PAYMENT_TONES[p.status]}>{p.status === 'pending' ? 'Being checked' : p.status === 'confirmed' ? 'Confirmed' : 'Not confirmed'}</Badge>
                        {p.status === 'confirmed' ? <button type="button" onClick={() => openPdf(`/billing/payments/${p.id}/receipt.pdf`).catch((e) => setError(e.message))} className="mt-1 block text-xs font-semibold text-[var(--accent)] hover:underline">Receipt (PDF)</button> : null}
                        {p.status === 'rejected' && p.note ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{p.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Your contact details" description="How StockDesk reaches you about your account" />
          <form onSubmit={saveProfile} className="space-y-4 p-4 sm:p-5">
            <Field label="Phone / WhatsApp">
              <input value={profile.ownerPhone} onChange={(e) => setProfile({ ...profile, ownerPhone: e.target.value })} className={fieldInput} placeholder="07XX XXX XXX" inputMode="tel" />
            </Field>
            <Field label="Type of business">
              <select value={profile.businessType} onChange={(e) => setProfile({ ...profile, businessType: e.target.value })} className={fieldInput}>
                <option value="">Choose…</option>
                {(data.businessTypes || []).map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Town / area">
              <input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} className={fieldInput} placeholder="e.g. Kampala, Nakawa" />
            </Field>
            <button type="submit" disabled={savingProfile} className="app-btn-secondary w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {savingProfile ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </Panel>
      </div>

      <Toast text={toast} />
    </div>
  );
}
