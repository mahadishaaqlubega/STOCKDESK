import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fetchOwnerMessage, fetchOwnerMessages, previewOwnerMessage, sendOwnerMessage } from '../utils/api';
import { getUser } from '../utils/auth';
import { STATE_META, fmtDate } from '../utils/billing';
import { Alert, Badge, EmptyState, Field, Modal, Panel, PanelHeader, SearchInput, SkeletonRows, Toast, fieldInput } from '../components/ui';

const PLACEHOLDERS = [
  ['{name}', "owner's name"],
  ['{shop}', 'shop name'],
  ['{plan}', 'plan'],
  ['{amount}', 'plan price'],
  ['{daysLeft}', 'days left'],
  ['{endDate}', 'trial / plan end'],
];

const BUTTONS = [
  { key: '', label: 'No button', cta: '' },
  { key: '/app', label: 'Open StockDesk', cta: 'Open StockDesk' },
  { key: '/app/billing', label: 'Billing / pay now', cta: 'Pay now' },
];

export default function OwnerMessages() {
  const user = getUser();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ audience: 'all', template: 'custom', subject: '', body: '', ctaPath: '', shopIds: [], attach: 'none' });
  const [shopSearch, setShopSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState(null);
  const bodyRef = useRef(null);

  const load = async () => {
    try {
      setData(await fetchOwnerMessages());
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Opened from a shop's page: start with that shop chosen.
    const shop = params.get('shop');
    if (shop) setForm((f) => ({ ...f, audience: 'custom', shopIds: [Number(shop)] }));
  }, []);

  // Refresh history while something is still sending.
  useEffect(() => {
    if (!data?.history?.some((m) => m.status === 'sending')) return undefined;
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [data]);

  const templates = data?.templates || [];
  const audience = data?.audiences?.find((a) => a.key === form.audience);
  const recipients = form.audience === 'custom'
    ? (data?.shops || []).filter((s) => form.shopIds.includes(s.shopId))
    : null;
  const recipientCount = form.audience === 'custom' ? recipients.filter((s) => s.hasEmail).length : audience?.withEmail || 0;
  const missingEmail = form.audience === 'custom' ? recipients.filter((s) => !s.hasEmail).length : (audience?.total || 0) - (audience?.withEmail || 0);

  const visibleShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    return (data?.shops || []).filter((s) => !q || s.shopName.toLowerCase().includes(q));
  }, [data, shopSearch]);

  if (user?.role !== 'SuperAdmin') return <Navigate to="/app" replace />;

  const chooseTemplate = (key) => {
    const t = templates.find((x) => x.key === key);
    setForm((f) => ({ ...f, template: key, subject: t?.subject || '', body: t?.body || '', ctaPath: t?.cta?.path || '', attach: t?.attach || 'none' }));
    setPreview(null);
  };

  const insertPlaceholder = (token) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? form.body.length;
    const body = form.body.slice(0, start) + token + form.body.slice(end);
    setForm((f) => ({ ...f, body }));
    window.requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  const payload = () => ({
    audience: form.audience,
    shopIds: form.audience === 'custom' ? form.shopIds : undefined,
    template: form.template,
    subject: form.subject,
    body: form.body,
    attach: form.attach,
    ctaPath: form.ctaPath || undefined,
    // The template's own button text when its button is chosen, e.g. "Choose a plan".
    ctaLabel: (() => {
      const t = templates.find((x) => x.key === form.template);
      if (t?.cta && t.cta.path === form.ctaPath) return t.cta.label;
      return BUTTONS.find((b) => b.key === form.ctaPath && b.key)?.cta;
    })(),
  });

  const showPreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      setPreview(await previewOwnerMessage(payload()));
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await sendOwnerMessage(payload());
      setToast(`Sending to ${res.recipientCount} shop owner${res.recipientCount === 1 ? '' : 's'}…`);
      window.setTimeout(() => setToast(''), 3500);
      setConfirming(false);
      setPreview(null);
      await load();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const toggleShop = (id) => setForm((f) => ({ ...f, shopIds: f.shopIds.includes(id) ? f.shopIds.filter((x) => x !== id) : [...f.shopIds, id] }));

  if (loading) return <Panel><SkeletonRows rows={8} /></Panel>;
  if (!data) return <Panel><EmptyState title={error || 'Messages are not available'} /></Panel>;

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Write to shop owners" description="Sent from StockDesk with each owner's name and shop filled in" />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Send to">
              <select value={form.audience} onChange={(e) => { setForm((f) => ({ ...f, audience: e.target.value })); setPreview(null); }} className={fieldInput}>
                {data.audiences.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}{a.key !== 'custom' ? ` (${a.withEmail})` : ''}</option>
                ))}
              </select>
            </Field>

            {form.audience === 'custom' ? (
              <div className="rounded-xl border border-[var(--border-default)]">
                <div className="border-b border-[var(--border-default)] p-2"><SearchInput value={shopSearch} onChange={setShopSearch} placeholder="Search shops" /></div>
                <ul className="max-h-56 divide-y divide-[var(--border-default)] overflow-y-auto">
                  {visibleShops.map((s) => (
                    <li key={s.shopId}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--surface-secondary)]">
                        <input type="checkbox" checked={form.shopIds.includes(s.shopId)} onChange={() => toggleShop(s.shopId)} disabled={!s.hasEmail} />
                        <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{s.shopName}</span>
                        {s.hasEmail ? <Badge tone={STATE_META[s.state]?.tone}>{STATE_META[s.state]?.label}</Badge> : <span className="text-xs text-[var(--text-muted)]">no email</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button key={t.key} type="button" onClick={() => chooseTemplate(t.key)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${form.template === t.key ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <Field label="Subject">
              <input value={form.subject} onChange={(e) => { setForm((f) => ({ ...f, subject: e.target.value })); setPreview(null); }} maxLength={200} className={fieldInput} placeholder="e.g. Your free trial ends soon" />
            </Field>
            <Field label="Message" hint='Each email starts with "Hello {name}," automatically. Leave a blank line between paragraphs.'>
              <textarea ref={bodyRef} value={form.body} onChange={(e) => { setForm((f) => ({ ...f, body: e.target.value })); setPreview(null); }} rows={9} maxLength={5000} className={fieldInput} placeholder="Write your message…" />
            </Field>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--text-muted)]">Insert:</span>
              {PLACEHOLDERS.map(([token, label]) => (
                <button key={token} type="button" onClick={() => insertPlaceholder(token)} title={label} className="rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)] hover:border-[var(--accent)]">{token}</button>
              ))}
            </div>
            <Field label="Button in the email">
              <select value={form.ctaPath} onChange={(e) => { setForm((f) => ({ ...f, ctaPath: e.target.value })); setPreview(null); }} className={fieldInput}>
                {BUTTONS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </Field>

            <Field label="Attach a PDF" hint={form.attach === 'invoice' ? 'Each shop gets its own invoice: its open payment request, or one month of its plan.' : form.attach === 'receipt' ? 'Each shop gets the receipt for its latest confirmed payment. Shops that have not paid yet get the email without one.' : 'No attachment'}>
              <select value={form.attach} onChange={(e) => setForm((f) => ({ ...f, attach: e.target.value }))} className={fieldInput}>
                <option value="none">No attachment</option>
                <option value="invoice">Invoice (amount due)</option>
                <option value="receipt">Payment receipt (paid)</option>
              </select>
            </Field>

            <div className="flex flex-col gap-3 border-t border-[var(--border-default)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{recipientCount}</span> recipient{recipientCount === 1 ? '' : 's'}
                {missingEmail > 0 ? <span className="text-[var(--text-muted)]"> · {missingEmail} without an email will be skipped</span> : null}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={showPreview} disabled={previewing || !form.subject.trim() || !form.body.trim()} className="app-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">{previewing ? 'Loading…' : 'Preview'}</button>
                <button type="button" onClick={() => setConfirming(true)} disabled={!recipientCount || !form.subject.trim() || !form.body.trim()} className="app-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">Send</button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Preview" description={preview ? `As ${preview.sampleShop || 'a shop owner'} will see it · subject: ${preview.subject}` : 'Click Preview to see the email exactly as it will arrive'} />
          {preview ? (
            <iframe title="Email preview" srcDoc={preview.html} className="block h-[640px] w-full rounded-b-2xl border-0 bg-[#eef2f6]" />
          ) : (
            <EmptyState title="No preview yet" message="Choose a template or write your own message, then click Preview." />
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Sent emails" description="The last 30 messages you sent" />
        {!data.history.length ? (
          <EmptyState title="Nothing sent yet" message="Emails you send to shop owners appear here." />
        ) : (
          <ul className="divide-y divide-[var(--border-default)]">
            {data.history.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={async () => setDetail(await fetchOwnerMessage(m.id))} className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-[var(--surface-secondary)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-primary)]">{m.subject}</p>
                    <p className="text-xs text-[var(--text-muted)]">{fmtDate(m.createdAt)} · {data.audiences.find((a) => a.key === m.audience)?.label || m.audience}</p>
                  </div>
                  <span className="num shrink-0 text-xs text-[var(--text-secondary)]">{m.status === 'sending' ? 'Sending…' : `${m.sentCount} of ${m.recipientCount} sent`}</span>
                  {m.failedCount ? <Badge tone="danger">{m.failedCount} failed</Badge> : m.status === 'sending' ? <Badge tone="info">Sending</Badge> : <Badge tone="success">Sent</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {confirming ? (
        <Modal title="Send this email?" subtitle={form.subject} onClose={() => setConfirming(false)} size="sm" footer={(
          <>
            <button type="button" onClick={() => setConfirming(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button type="button" onClick={send} disabled={sending} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{sending ? 'Sending…' : `Send to ${recipientCount}`}</button>
          </>
        )}>
          <p className="text-sm text-[var(--text-secondary)]">It goes to {recipientCount} shop owner{recipientCount === 1 ? '' : 's'} ({form.audience === 'custom' ? 'chosen shops' : audience?.label}). Emails can't be unsent.</p>
        </Modal>
      ) : null}

      {detail ? (
        <Modal title={detail.subject} subtitle={`${fmtDate(detail.createdAt)} · ${detail.sentCount} sent${detail.failedCount ? `, ${detail.failedCount} failed` : ''}`} onClose={() => setDetail(null)} size="lg">
          <ul className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)] text-sm">
            {(detail.recipients || []).map((r) => (
              <li key={`${r.shopId}-${r.email}`} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{r.shopName}<span className="block truncate text-xs text-[var(--text-muted)]">{r.email}{r.attachment ? ` · ${r.attachment}` : ''}{r.error ? ` · ${r.error}` : ''}</span></span>
                <Badge tone={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'danger' : 'info'}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
