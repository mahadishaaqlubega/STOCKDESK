import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  API_BASE, fetchQuotations, fetchQuotation, createQuotation, updateQuotation, cancelQuotation, shareQuotation,
  openPdf, fetchProducts, fetchCustomers, fetchSettings,
} from '../utils/api';
import { whatsappLink, toWhatsAppNumber, countryCodeFor, publicQuoteUrl } from '../utils/whatsapp';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMoney, formatAmount } from '../utils/format';
import { Badge, Drawer, EmptyState, Field, IconButton, Modal, Panel, PanelHeader, SearchInput, SkeletonRows, Tabs, Toast, fieldInput, icons } from '../components/ui';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'expired', label: 'Expired' },
  { key: 'converted', label: 'Sold' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE = {
  open: ['accent', 'Open'],
  expired: ['warning', 'Expired'],
  converted: ['success', 'Sold'],
  cancelled: ['neutral', 'Cancelled'],
};

const TYPE_LABEL = { quotation: 'Quotation', proforma: 'Proforma invoice' };

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localISO(d); };
const dateLabel = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const emptyForm = () => ({
  id: null,
  docType: 'quotation',
  customerId: '',
  billToName: '',
  billToPhone: '',
  billToAddress: '',
  items: [],
  discount: '',
  validUntil: inDays(14),
  notes: '',
});

export default function Quotations() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const currency = settings?.currency || 'UGX';
  const vatRate = Number(settings?.vat || 0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  useBodyScrollLock(Boolean(form || detail || cancelTarget));

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (query.trim()) params.set('q', query.trim());
      const data = await fetchQuotations(params.toString());
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      flash(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [status, query]);

  const ensurePickers = () => {
    if (!products.length) fetchProducts().then((p) => setProducts((Array.isArray(p) ? p : []).filter((x) => x.isActive !== false))).catch(() => {});
    if (!customers.length) fetchCustomers().then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
  };

  const openNew = () => {
    ensurePickers();
    setForm(emptyForm());
    setFormError('');
    setProductSearch('');
  };

  const openEdit = (quote) => {
    ensurePickers();
    setDetail(null);
    setForm({
      id: quote.id,
      docType: quote.docType,
      customerId: quote.customerId ? String(quote.customerId) : '',
      billToName: quote.billToName || '',
      billToPhone: quote.billToPhone || '',
      billToAddress: quote.billToAddress || '',
      items: (quote.items || []).map((i, n) => ({ key: `${n}-${i.productId || 'c'}`, productId: i.productId, name: i.name, quantity: String(i.quantity), price: String(i.price) })),
      discount: Number(quote.discount) ? String(Number(quote.discount)) : '',
      validUntil: String(quote.validUntil).slice(0, 10),
      notes: quote.notes || '',
    });
    setFormError('');
    setProductSearch('');
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setLine = (key, field, value) => setForm((f) => ({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, [field]: value } : i)) }));
  const removeLine = (key) => setForm((f) => ({ ...f, items: f.items.filter((i) => i.key !== key) }));

  const addProduct = (product) => {
    setForm((f) => {
      const existing = f.items.find((i) => i.productId === product.id);
      if (existing) return { ...f, items: f.items.map((i) => (i === existing ? { ...i, quantity: String(Number(i.quantity || 0) + 1) } : i)) };
      return { ...f, items: [...f.items, { key: `${Date.now()}-${product.id}`, productId: product.id, name: product.name, quantity: '1', price: String(Number(product.sellPrice) || 0) }] };
    });
    setProductSearch('');
  };

  const addCustomLine = () => setForm((f) => ({ ...f, items: [...f.items, { key: `${Date.now()}-c`, productId: null, name: '', quantity: '1', price: '' }] }));

  const chooseCustomer = (id) => {
    const customer = customers.find((c) => String(c.id) === id);
    setForm((f) => ({
      ...f,
      customerId: id,
      billToName: customer ? customer.name : f.billToName,
      billToPhone: customer ? customer.phone || '' : f.billToPhone,
      billToAddress: customer ? customer.address || '' : f.billToAddress,
    }));
  };

  const matches = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return products.filter((p) => p.name?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term)).slice(0, 8);
  }, [productSearch, products]);

  const totals = useMemo(() => {
    if (!form) return null;
    const subtotal = form.items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
    const discount = Math.min(Number(form.discount) || 0, subtotal);
    const tax = ((subtotal - discount) * vatRate) / 100;
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [form, vatRate]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.billToName.trim()) return setFormError('Say who the quote is for.');
    if (!form.items.length) return setFormError('Add at least one item.');
    if (form.items.some((i) => !i.name.trim() || !(Number(i.quantity) > 0) || i.price === '' || Number(i.price) < 0)) {
      return setFormError('Every line needs a description, a quantity and a price.');
    }
    setSaving(true);
    setFormError('');
    const body = {
      docType: form.docType,
      customerId: form.customerId ? Number(form.customerId) : null,
      billToName: form.billToName,
      billToPhone: form.billToPhone || null,
      billToAddress: form.billToAddress || null,
      items: form.items.map((i) => ({ productId: i.productId || null, name: i.name, quantity: Number(i.quantity), price: Number(i.price) })),
      discount: Number(form.discount) || 0,
      validUntil: form.validUntil,
      notes: form.notes || null,
    };
    try {
      const saved = form.id ? await updateQuotation(form.id, body) : await createQuotation(body);
      setForm(null);
      flash(`${saved.displayNumber} saved · ${formatMoney(currency, saved.total)}`);
      await load();
      setDetail(saved);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (row) => {
    try {
      setDetail(await fetchQuotation(row.id));
    } catch (err) {
      flash(err.message);
    }
  };

  const sharePdf = async (quote) => {
    // Open the window inside the click so the browser allows it, then send
    // it to WhatsApp once the link exists.
    const tab = window.open('', '_blank');
    try {
      const { token } = await shareQuotation(quote.id);
      const link = publicQuoteUrl(API_BASE, token);
      const shopName = settings?.shopName || 'our shop';
      const text = `Hello ${quote.billToName}, here is your ${TYPE_LABEL[quote.docType].toLowerCase()} ${quote.displayNumber} from ${shopName} for ${formatMoney(currency, quote.total)}, valid until ${dateLabel(quote.validUntil)}:\n${link}`;
      const url = whatsappLink(toWhatsAppNumber(quote.billToPhone, countryCodeFor(settings)), text);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      if (tab) tab.close();
      flash(err.message);
    }
  };

  const openInTill = (quote) => {
    navigate('/app/pos', { state: { quote } });
  };

  const handleCancel = async (quote) => {
    try {
      const updated = await cancelQuotation(quote.id);
      flash(`${updated.displayNumber} cancelled.`);
      setDetail(null);
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={STATUS_TABS} value={status} onChange={setStatus} label="Quote status" />
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name or number" className="w-full sm:w-64" />
          <button type="button" onClick={openNew} className="app-btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">{icons.plus}New quote</button>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Quotations and proforma invoices"
          description="Prices you send before a customer buys. When they accept, open the quote in the till to sell it."
        />
        {loading ? (
          <SkeletonRows rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={query || status ? 'No quotes match' : 'No quotes yet'}
            message="Schools, offices and builders often ask for a quotation or proforma invoice before they pay. Make one in a minute and send it on WhatsApp."
            action={<button type="button" onClick={openNew} className="app-btn-primary rounded-lg px-4 py-2 text-sm">New quote</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">For</th>
                  <th className="px-4 py-2.5 font-medium">Valid until</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total ({currency})</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {rows.map((row) => {
                  const [tone, label] = STATUS_BADGE[row.displayStatus] || STATUS_BADGE.open;
                  return (
                    <tr key={row.id} className="app-row-hover cursor-pointer" onClick={() => openDetail(row)}>
                      <td data-label="Number" className="whitespace-nowrap px-4 py-2.5">
                        <p className="num font-medium text-[var(--text-primary)]">{row.displayNumber}</p>
                        <p className="text-xs text-[var(--text-muted)]">{TYPE_LABEL[row.docType]} · {dateLabel(row.createdAt)}</p>
                      </td>
                      <td data-label="For" className="px-4 py-2.5 text-[var(--text-primary)]">{row.billToName}</td>
                      <td data-label="Valid until" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-secondary)]">{dateLabel(row.validUntil)}</td>
                      <td data-label="Total" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, row.total)}</td>
                      <td data-label="Status" className="px-4 py-2.5 text-right"><Badge tone={tone}>{label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > rows.length ? <p className="px-4 py-3 text-xs text-[var(--text-muted)]">Showing the latest {rows.length} of {total}. Search to find older quotes.</p> : null}
          </div>
        )}
      </Panel>

      {form ? (
        <Drawer
          title={form.id ? 'Edit quote' : 'New quote'}
          onClose={() => setForm(null)}
          onSubmit={handleSave}
          footer={(
            <>
              <button type="button" onClick={() => setForm(null)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving…' : 'Save quote'}</button>
            </>
          )}
        >
          <div className="grid grid-cols-2 rounded-xl bg-[var(--surface-secondary)] p-1" role="tablist" aria-label="Document type">
            {['quotation', 'proforma'].map((type) => (
              <button key={type} type="button" role="tab" aria-selected={form.docType === type} onClick={() => setField('docType', type)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${form.docType === type ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}>
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          <Field label="Customer" hint="Pick a customer on file, or leave it empty and type the name below.">
            <select value={form.customerId} onChange={(e) => chooseCustomer(e.target.value)} className={fieldInput}>
              <option value="">Not on file</option>
              {customers.filter((c) => c.name !== 'Walk-in Customer').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Prepared for">
            <input required value={form.billToName} onChange={(e) => setField('billToName', e.target.value)} maxLength={160} className={fieldInput} placeholder="e.g. St. Mary's School, Kisubi" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone (for WhatsApp)">
              <input value={form.billToPhone} onChange={(e) => setField('billToPhone', e.target.value)} maxLength={40} inputMode="tel" className={fieldInput} placeholder="07XX XXX XXX" />
            </Field>
            <Field label="Valid until">
              <input required type="date" value={form.validUntil} min={localISO(new Date())} onChange={(e) => setField('validUntil', e.target.value)} className={fieldInput} />
            </Field>
          </div>
          <Field label="Address">
            <input value={form.billToAddress} onChange={(e) => setField('billToAddress', e.target.value)} maxLength={255} className={fieldInput} placeholder="Optional" />
          </Field>

          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">Items</p>
            <div className="relative mt-1.5">
              <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Search products to add" />
              {matches.length ? (
                <ul className="app-modal absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-[var(--shadow-raised)]">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]">
                        <span className="truncate text-[var(--text-primary)]">{p.name}</span>
                        <span className="num shrink-0 text-[var(--text-muted)]">{formatAmount(currency, p.sellPrice)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {form.items.map((item) => (
                <div key={item.key} className="rounded-lg border border-[var(--border-default)] p-2.5">
                  <div className="flex items-start gap-2">
                    <input value={item.name} onChange={(e) => setLine(item.key, 'name', e.target.value)} maxLength={200} aria-label="Description"
                      className="app-input min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm" placeholder="Description, e.g. Delivery to Mukono" />
                    <IconButton label="Remove line" tone="danger" onClick={() => removeLine(item.key)}>{icons.trash}</IconButton>
                  </div>
                  <div className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                    <input type="number" min="0" step="any" inputMode="decimal" value={item.quantity} onChange={(e) => setLine(item.key, 'quantity', e.target.value)} aria-label="Quantity"
                      className="app-input num rounded-md border px-2 py-1.5 text-right" />
                    <input type="number" min="0" step="any" inputMode="decimal" value={item.price} onChange={(e) => setLine(item.key, 'price', e.target.value)} aria-label="Price each"
                      className="app-input num rounded-md border px-2 py-1.5 text-right" placeholder="Price each" />
                    <span className="num w-28 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, (Number(item.price) || 0) * (Number(item.quantity) || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addCustomLine} className="mt-2 text-sm font-medium text-[var(--accent)] hover:underline">+ Add a line that is not a product</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Discount (${currency})`}>
              <input type="number" min="0" step="any" inputMode="decimal" value={form.discount} onChange={(e) => setField('discount', e.target.value)} className={fieldInput} placeholder="0" />
            </Field>
            <div className="rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-sm">
              <div className="flex justify-between text-[var(--text-muted)]"><span>Subtotal</span><span className="num">{formatAmount(currency, totals.subtotal)}</span></div>
              {vatRate ? <div className="flex justify-between text-[var(--text-muted)]"><span>VAT {vatRate}%</span><span className="num">{formatAmount(currency, totals.tax)}</span></div> : null}
              <div className="mt-1 flex justify-between font-semibold text-[var(--text-primary)]"><span>Total</span><span className="num">{formatMoney(currency, totals.total)}</span></div>
            </div>
          </div>
          <Field label="Notes" hint="Shown on the PDF, e.g. delivery time or payment terms.">
            <textarea rows="3" value={form.notes} onChange={(e) => setField('notes', e.target.value)} maxLength={2000} className={fieldInput} placeholder="Optional" />
          </Field>
          {formError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{formError}</p> : null}
        </Drawer>
      ) : null}

      {detail ? (
        <Modal
          title={`${TYPE_LABEL[detail.docType]} ${detail.displayNumber}`}
          subtitle={`For ${detail.billToName} · valid until ${dateLabel(detail.validUntil)}${detail.createdBy?.name ? ` · by ${detail.createdBy.name}` : ''}`}
          onClose={() => setDetail(null)}
          size="lg"
          footer={(
            <div className="flex w-full flex-wrap gap-2">
              <button type="button" onClick={() => openPdf(`/quotations/${detail.id}/pdf`).catch((e) => flash(e.message))} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">PDF</button>
              {detail.displayStatus !== 'cancelled' ? (
                <button type="button" onClick={() => sharePdf(detail)} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Send on WhatsApp</button>
              ) : null}
              {detail.status === 'open' ? (
                <>
                  <button type="button" onClick={() => openEdit(detail)} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Edit</button>
                  <button type="button" onClick={() => setCancelTarget(detail)} className="rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">Cancel quote</button>
                  <button type="button" onClick={() => openInTill(detail)} className="app-btn-primary ml-auto rounded-lg px-4 py-2 text-sm">Open in till</button>
                </>
              ) : null}
            </div>
          )}
        >
          <div className="space-y-4">
            {(() => {
              const [tone, label] = STATUS_BADGE[detail.displayStatus] || STATUS_BADGE.open;
              return <Badge tone={tone}>{label}</Badge>;
            })()}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {(detail.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-[var(--text-primary)]">{item.name}{item.productId ? null : <span className="ml-1.5 text-xs text-[var(--text-muted)]">(not a product)</span>}</td>
                    <td className="num py-2 text-right">{Number(item.quantity)}</td>
                    <td className="num py-2 text-right">{formatAmount(currency, item.price)}</td>
                    <td className="num py-2 text-right font-medium">{formatAmount(currency, item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-[var(--text-muted)]"><dt>Subtotal</dt><dd className="num">{formatAmount(currency, detail.subtotal)}</dd></div>
              {Number(detail.discount) > 0 ? <div className="flex justify-between text-[var(--text-muted)]"><dt>Discount</dt><dd className="num">−{formatAmount(currency, detail.discount)}</dd></div> : null}
              {Number(detail.taxAmount) > 0 ? <div className="flex justify-between text-[var(--text-muted)]"><dt>VAT {Number(detail.taxRate)}%</dt><dd className="num">{formatAmount(currency, detail.taxAmount)}</dd></div> : null}
              <div className="flex justify-between border-t border-[var(--border-default)] pt-1 font-semibold text-[var(--text-primary)]"><dt>Total</dt><dd className="num">{formatMoney(currency, detail.total)}</dd></div>
            </dl>
            {detail.notes ? <p className="whitespace-pre-line rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">{detail.notes}</p> : null}
            {detail.status === 'open' && (detail.items || []).some((i) => !i.productId) ? (
              <p className="text-xs text-[var(--text-muted)]">Lines that are not products are left out when you open the quote in the till. Add them there as a service if you charge for them.</p>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {cancelTarget ? (
        <ConfirmDialog
          title="Cancel this quote?"
          message={<>Cancel <strong className="font-semibold text-[var(--text-primary)]">{cancelTarget.displayNumber}</strong> for {cancelTarget.billToName}? Its link will stop working for the customer.</>}
          confirmLabel="Cancel quote"
          onConfirm={() => {
            const target = cancelTarget;
            setCancelTarget(null);
            handleCancel(target);
          }}
          onCancel={() => setCancelTarget(null)}
        />
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
