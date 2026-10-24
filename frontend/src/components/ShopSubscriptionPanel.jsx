import { useEffect, useState } from 'react';
import {
  cancelPaymentRequest,
  confirmSubscriptionPayment,
  createPaymentRequest,
  extendShopTrial,
  fetchShopBilling,
  openPdf,
  recordShopPayment,
  rejectSubscriptionPayment,
  setShopActive,
  updateShopProfile,
} from '../utils/api';
import { STATE_META, billingMessage, fmtDate, messageKindFor, money, planName, stateLabel, whatsappLink } from '../utils/billing';
import { Alert, Badge, EmptyState, Field, Modal, Panel, PanelHeader, SkeletonRows, Toast, fieldInput } from './ui';

const PAYMENT_TONES = { pending: 'warning', confirmed: 'success', rejected: 'danger' };
const REQUEST_TONES = { open: 'warning', paid: 'success', cancelled: 'neutral' };

function PlanFields({ config, value, onChange, withAmount = true }) {
  const plan = config.plans.find((p) => p.key === value.plan) || config.plans[0];
  const suggested = (plan?.price || 0) * (Number(value.months) || 1);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Plan">
        <select value={value.plan} onChange={(e) => onChange({ ...value, plan: e.target.value })} className={fieldInput}>
          {config.plans.map((p) => <option key={p.key} value={p.key}>{p.name} · {money(p.price, config.currency)}</option>)}
        </select>
      </Field>
      <Field label="Months">
        <input type="number" min="1" max="24" value={value.months} onChange={(e) => onChange({ ...value, months: e.target.value })} className={fieldInput} />
      </Field>
      {withAmount ? (
        <Field label="Amount" hint={`Plan price: ${money(suggested, config.currency)}`} className="col-span-2">
          <input type="number" min="0" value={value.amount} placeholder={String(suggested)} onChange={(e) => onChange({ ...value, amount: e.target.value })} className={fieldInput} />
        </Field>
      ) : null}
    </div>
  );
}

export default function ShopSubscriptionPanel({ shopId, shopName, isActive, onActiveChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const [sentRequest, setSentRequest] = useState(null);

  const load = async () => {
    try {
      setData(await fetchShopBilling(shopId));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load billing for this shop.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [shopId]);

  const flash = (text) => { setToast(text); window.setTimeout(() => setToast(''), 3000); };
  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (done) done(res);
      await load();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Panel><SkeletonRows rows={4} /></Panel>;
  if (!data) return <Panel><EmptyState title={error || 'Billing not available'} /></Panel>;

  const { status, config, profile, payments, requests, staff } = data;
  const currency = config.currency || 'UGX';
  const meta = STATE_META[status.state];
  const defaultPlan = status.plan || 'starter';
  const price = config.plans.find((p) => p.key === defaultPlan)?.price;
  const followUp = billingMessage(messageKindFor(status.state), {
    shopName, ownerName: profile.ownerName, amount: price, planLabel: planName(config, defaultPlan), endsAt: status.endsAt, payTo: config.payTo, currency,
  });

  const open = (name, initial = {}) => { setForm(initial); setModal(name); };
  const close = () => { setModal(null); setSentRequest(null); };

  return (
    <Panel>
      <PanelHeader
        title="Subscription"
        description={status.state === 'trial' ? `Free trial until ${fmtDate(status.trialEndsAt)}` : status.paidUntil ? `${planName(config, status.plan)} · paid until ${fmtDate(status.paidUntil)}` : `Trial ended ${fmtDate(status.trialEndsAt)}`}
        actions={<Badge tone={meta.tone} dot>{stateLabel(status)}</Badge>}
      />
      <div className="space-y-4 p-4 sm:p-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => open('request', { plan: defaultPlan, months: 1, amount: '', dueDate: '', message: '', sendEmail: true })} className="app-btn-primary rounded-lg px-3.5 py-2 text-sm font-semibold">Send payment request</button>
          <button type="button" onClick={() => open('record', { plan: defaultPlan, months: 1, amount: '', method: 'Cash', reference: '', note: '' })} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Record payment</button>
          <button type="button" onClick={() => open('extend', { days: 7 })} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Extend trial</button>
          <a href={`/app/messages?shop=${shopId}`} className="app-btn-secondary inline-flex items-center rounded-lg border px-3.5 py-2 text-sm font-medium">Email owner</a>
          <button type="button" onClick={() => openPdf(`/admin/shops/${shopId}/invoice.pdf`).catch((e) => setError(e.message))} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Invoice (PDF)</button>
          {profile.whatsapp ? <a href={whatsappLink(profile.whatsapp, followUp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-[#25d366] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">WhatsApp owner</a> : null}
          <button type="button" onClick={() => open('profile', { ownerPhone: profile.ownerPhone || '', businessType: profile.businessType || '', location: profile.location || '', billingNotes: profile.billingNotes || '', staffLimitOverride: staff?.override ?? '' })} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Edit contact, staff &amp; notes</button>
          <button
            type="button"
            onClick={() => run(() => setShopActive(shopId, !isActive), (res) => { onActiveChange?.(res.isActive); flash(res.isActive ? 'Shop enabled.' : 'Shop disabled: it can only view its data now.'); })}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium ${isActive ? 'border-[var(--danger-border)] text-[var(--danger)] hover:bg-[var(--danger-soft)]' : 'app-btn-secondary'}`}
          >
            {isActive ? 'Disable shop' : 'Enable shop'}
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--text-muted)]">Phone / WhatsApp</dt><dd className="text-[var(--text-primary)]">{profile.ownerPhone || 'Not given'}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Business</dt><dd className="text-[var(--text-primary)]">{[profile.businessType, profile.location].filter(Boolean).join(' · ') || 'Not given'}</dd></div>
          {staff ? (
            <div>
              <dt className="text-[var(--text-muted)]">Staff logins</dt>
              <dd className={staff.canAdd ? 'text-[var(--text-primary)]' : 'font-medium text-[var(--warning)]'}>
                {staff.limit == null ? `${staff.used} (unlimited)` : `${staff.used} of ${staff.limit}`}
                <span className="text-[var(--text-muted)]"> · {staff.source === 'custom' ? 'custom limit' : staff.source === 'trial' ? 'free trial' : `${staff.planName || 'no'} plan`}</span>
              </dd>
            </div>
          ) : null}
          {profile.billingNotes ? <div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">Notes</dt><dd className="whitespace-pre-line text-[var(--text-primary)]">{profile.billingNotes}</dd></div> : null}
        </dl>

        {requests.some((r) => r.status === 'open') ? (
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Open requests</p>
            <ul className="space-y-2">
              {requests.filter((r) => r.status === 'open').map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm">
                  <span>{money(r.amount, currency)} · {planName(config, r.plan)} · {r.months} mo{r.dueDate ? ` · due ${fmtDate(r.dueDate)}` : ''}<span className="block text-xs text-[var(--text-muted)]">Sent {fmtDate(r.createdAt)}{r.emailedAt ? ' · emailed' : ''}</span></span>
                  <span className="flex gap-3">
                    <button type="button" onClick={() => openPdf(`/admin/payment-requests/${r.id}/invoice.pdf`).catch((e) => setError(e.message))} className="text-xs font-semibold text-[var(--accent)]">Invoice</button>
                    <button type="button" onClick={() => run(() => cancelPaymentRequest(r.id), () => flash('Request cancelled.'))} className="text-xs font-medium text-[var(--danger)]">Cancel</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Payments</p>
          {!payments.length ? (
            <p className="text-sm text-[var(--text-muted)]">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)]">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)]">{money(p.amount, currency)} · {planName(config, p.plan)} · {p.months} mo</p>
                    <p className="text-xs text-[var(--text-muted)]">{fmtDate(p.createdAt)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}{p.periodEnd ? ` · until ${fmtDate(p.periodEnd)}` : ''}</p>
                  </div>
                  {p.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => run(() => rejectSubscriptionPayment(p.id, 'We could not find this transaction on our statement.'), () => flash('Payment rejected.'))} className="app-btn-secondary rounded-lg border px-2.5 py-1 text-xs">Reject</button>
                      <button type="button" disabled={busy} onClick={() => run(() => confirmSubscriptionPayment(p.id), () => flash('Payment confirmed.'))} className="app-btn-primary rounded-lg px-2.5 py-1 text-xs font-semibold">Confirm</button>
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      {p.status === 'confirmed' ? <button type="button" onClick={() => openPdf(`/admin/payments/${p.id}/receipt.pdf`).catch((e) => setError(e.message))} className="text-xs font-semibold text-[var(--accent)]">Receipt</button> : null}
                      <Badge tone={PAYMENT_TONES[p.status]}>{p.status}</Badge>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal === 'extend' ? (
        <Modal title="Extend free trial" onClose={close} size="sm" footer={(
          <>
            <button type="button" onClick={close} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => extendShopTrial(shopId, form.days), (res) => { close(); flash(`Trial now ends ${fmtDate(res.status?.trialEndsAt)}.`); })} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold">Add {form.days} days</button>
          </>
        )}>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <button key={d} type="button" onClick={() => setForm({ days: d })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${form.days === d ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'border-[var(--border-default)]'}`}>{d} days</button>
            ))}
          </div>
          <Field label="Or any number of days" className="mt-4"><input type="number" min="1" max="365" value={form.days} onChange={(e) => setForm({ days: Number(e.target.value) })} className={fieldInput} /></Field>
        </Modal>
      ) : null}

      {modal === 'record' ? (
        <Modal title="Record a payment" subtitle="For money you received directly (cash, bank or Mobile Money). It is confirmed straight away." onClose={close} footer={(
          <>
            <button type="button" onClick={close} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => recordShopPayment(shopId, form), (res) => { close(); flash(`Recorded. Paid until ${fmtDate(res.status?.paidUntil)}.`); })} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold">{busy ? 'Saving…' : 'Record payment'}</button>
          </>
        )}>
          <div className="space-y-3">
            <PlanFields config={config} value={form} onChange={setForm} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method">
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={fieldInput}>
                  {(data.methods || []).map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Transaction ID (optional)"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={`${fieldInput} font-mono`} /></Field>
            </div>
            <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={fieldInput} /></Field>
          </div>
        </Modal>
      ) : null}

      {modal === 'request' ? (
        <Modal title={sentRequest ? 'Request sent' : 'Send a payment request'} subtitle={sentRequest ? null : 'The shop sees it in StockDesk and gets an email. You can also send it on WhatsApp.'} onClose={close} footer={sentRequest ? (
          <>
            <button type="button" onClick={close} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Done</button>
            <a href={whatsappLink(profile.whatsapp, billingMessage('request', { shopName, ownerName: profile.ownerName, amount: sentRequest.amount, planLabel: planName(config, sentRequest.plan), payTo: config.payTo, currency }))} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg bg-[#25d366] px-4 py-2.5 text-center text-sm font-semibold text-white">Send on WhatsApp</a>
          </>
        ) : (
          <>
            <button type="button" onClick={close} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => createPaymentRequest(shopId, form), (res) => setSentRequest({ ...res.request, emailed: res.emailed }))} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold">{busy ? 'Sending…' : 'Send request'}</button>
          </>
        )}>
          {sentRequest ? (
            <div className="space-y-3 text-sm">
              <Alert tone="success">Request for {money(sentRequest.amount, currency)} created. {sentRequest.emailed ? 'The owner was emailed.' : 'No email was sent (no email on file, or email is not set up).'}</Alert>
              {!profile.whatsapp ? <p className="text-[var(--text-muted)]">Add the owner's phone number under “Edit contact &amp; notes” to send it on WhatsApp.</p> : null}
            </div>
          ) : (
            <div className="space-y-3">
              <PlanFields config={config} value={form} onChange={setForm} />
              <Field label="Due date (optional)"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={fieldInput} /></Field>
              <Field label="Message (optional)"><textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={fieldInput} placeholder="Leave empty to use the standard message" /></Field>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />Email the owner{profile.ownerEmail ? ` (${profile.ownerEmail})` : ''}</label>
            </div>
          )}
        </Modal>
      ) : null}

      {modal === 'profile' ? (
        <Modal title="Contact details & notes" onClose={close} footer={(
          <>
            <button type="button" onClick={close} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => updateShopProfile(shopId, form), () => { close(); flash('Saved.'); })} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold">Save</button>
          </>
        )}>
          <div className="space-y-3">
            <Field label="Phone / WhatsApp"><input value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} className={fieldInput} placeholder="07XX XXX XXX" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type of business">
                <select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} className={fieldInput}>
                  <option value="">Not set</option>
                  {(data.businessTypes || []).map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Town / area"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={fieldInput} /></Field>
            </div>
            <Field label="Custom staff limit" hint={`Leave empty to use the plan's limit${staff ? ` (this shop has ${staff.used} staff now)` : ''}. Applies even during the trial.`}>
              <input type="number" min="0" max="500" value={form.staffLimitOverride} onChange={(e) => setForm({ ...form, staffLimitOverride: e.target.value })} className={fieldInput} placeholder="Plan limit" />
            </Field>
            <Field label="Private notes" hint="Only you see these"><textarea rows={3} value={form.billingNotes} onChange={(e) => setForm({ ...form, billingNotes: e.target.value })} className={fieldInput} /></Field>
          </div>
        </Modal>
      ) : null}

      <Toast text={toast} />
    </Panel>
  );
}
