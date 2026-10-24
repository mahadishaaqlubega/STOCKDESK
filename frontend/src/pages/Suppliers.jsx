import { useEffect, useMemo, useState } from 'react';
import {
  createPurchase,
  createSupplier,
  deleteSupplier,
  fetchProducts,
  fetchPurchase,
  fetchPurchases,
  fetchSettings,
  fetchSupplierStatement,
  fetchSuppliers,
  paySupplier,
  updateSupplier,
} from '../utils/api';
import { formatMoney } from '../utils/format';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import {
  Alert,
  Badge,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Panel,
  SearchInput,
  SkeletonRows,
  StatTile,
  Tabs,
  Toast,
  fieldInput,
  icons,
  statIcons,
} from '../components/ui';

const PAY_METHODS = ['Cash', 'Mobile Money', 'Bank', 'Card'];
const emptySupplier = { id: null, name: '', phone: '', whatsapp: '', email: '', address: '', notes: '' };

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const truckIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></svg>;

function paymentBadge(purchase) {
  const due = Number(purchase.balanceDue || 0);
  if (due <= 0) return <Badge tone="success" dot>Paid</Badge>;
  if (Number(purchase.amountPaid || 0) > 0 || due < Number(purchase.total || 0)) return <Badge tone="warning" dot>Part paid</Badge>;
  return <Badge tone="danger" dot>Unpaid</Badge>;
}

export default function Suppliers() {
  const [tab, setTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  const [supplierForm, setSupplierForm] = useState(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState(null);
  const [statement, setStatement] = useState(null);
  const [purchaseDetail, setPurchaseDetail] = useState(null);

  useBodyScrollLock(Boolean(supplierForm || purchaseForm || statement || purchaseDetail));
  const money = (value) => formatMoney(currency, value);
  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3500);
  };

  const load = async () => {
    try {
      const [supplierRows, purchaseRows] = await Promise.all([fetchSuppliers(), fetchPurchases({ limit: 200 })]);
      setSuppliers(supplierRows);
      setPurchases(purchaseRows);
    } catch (error) {
      flash(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
    fetchProducts('?type=goods').then(setProducts).catch(() => {});
  }, []);

  const active = suppliers.filter((s) => s.isActive !== false);
  const owed = suppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);
  const monthStart = localISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const boughtThisMonth = purchases.filter((p) => String(p.purchaseDate) >= monthStart).reduce((sum, p) => sum + Number(p.total || 0), 0);
  const unpaidCount = purchases.filter((p) => Number(p.balanceDue) > 0).length;

  const visibleSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => !q || [s.name, s.phone, s.email].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [suppliers, search]);
  const visiblePurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => !q || [p.supplier?.name, p.reference, `#${p.id}`].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [purchases, search]);

  // ---------------------------------------------------------------- suppliers
  const saveSupplier = async (event) => {
    event.preventDefault();
    if (savingSupplier) return;
    setSavingSupplier(true);
    try {
      const saved = supplierForm.id ? await updateSupplier(supplierForm.id, supplierForm) : await createSupplier(supplierForm);
      const returnTo = supplierForm.returnToPurchase;
      setSupplierForm(null);
      await load();
      flash(supplierForm.id ? 'Supplier updated.' : `${saved.name} added.`);
      if (returnTo) setPurchaseForm({ ...returnTo, supplierId: String(saved.id) });
    } catch (error) {
      flash(error.message);
    } finally {
      setSavingSupplier(false);
    }
  };

  const removeSupplier = async (supplier) => {
    if (!window.confirm(`Remove ${supplier.name}?`)) return;
    try {
      const result = await deleteSupplier(supplier.id);
      flash(result?.message || 'Supplier removed.');
      load();
    } catch (error) {
      flash(error.message);
    }
  };

  const openStatement = async (supplier) => {
    setStatement({ supplier, data: null, error: '' });
    try {
      const data = await fetchSupplierStatement(supplier.id);
      setStatement({ supplier, data, error: '', pay: { amount: data.balance > 0 ? String(data.balance) : '', method: 'Cash', notes: '' } });
    } catch (error) {
      setStatement({ supplier, data: null, error: error.message });
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (statement.saving) return;
    setStatement((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const result = await paySupplier(statement.supplier.id, { amount: Number(statement.pay.amount), method: statement.pay.method, notes: statement.pay.notes || undefined });
      const data = await fetchSupplierStatement(statement.supplier.id);
      setStatement((prev) => ({ ...prev, data, saving: false, pay: { amount: data.balance > 0 ? String(data.balance) : '', method: prev.pay.method, notes: '' } }));
      flash(result.balance > 0 ? `Paid ${money(result.amount)}. Still owe ${money(result.balance)}.` : `Paid ${money(result.amount)}. Nothing owed now.`);
      load();
    } catch (error) {
      setStatement((prev) => ({ ...prev, saving: false, error: error.message }));
    }
  };

  // ---------------------------------------------------------------- purchases
  const newPurchase = (supplierId = '') => {
    setPurchaseForm({
      supplierId: supplierId ? String(supplierId) : '',
      purchaseDate: localISO(new Date()),
      reference: '',
      lines: [],
      paid: '',
      paidTouched: false,
      paymentMethod: 'Cash',
      dueDate: '',
      notes: '',
      productSearch: '',
      error: '',
    });
  };

  const purchaseTotal = purchaseForm ? purchaseForm.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0) : 0;
  const paidNow = purchaseForm ? (purchaseForm.paidTouched ? Number(purchaseForm.paid) || 0 : purchaseTotal) : 0;
  const owingAfter = Math.max(0, purchaseTotal - paidNow);

  const productMatches = useMemo(() => {
    const q = purchaseForm?.productSearch?.trim().toLowerCase();
    if (!q) return [];
    const inCart = new Set(purchaseForm.lines.map((l) => l.productId));
    return products
      .filter((p) => !inCart.has(p.id) && [p.name, p.sku, p.category].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [products, purchaseForm]);

  const addLine = (product) => {
    setPurchaseForm((prev) => ({
      ...prev,
      productSearch: '',
      lines: [...prev.lines, { productId: product.id, name: product.name, stock: Number(product.quantity || 0), quantity: '1', unitCost: String(Number(product.buyPrice || 0)), currentSell: Number(product.sellPrice || 0), sellPrice: '' }],
    }));
  };
  const updateLine = (productId, field, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setPurchaseForm((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.productId === productId ? { ...l, [field]: value } : l)) }));
  };
  const removeLine = (productId) => setPurchaseForm((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.productId !== productId) }));

  const savePurchase = async (event) => {
    event.preventDefault();
    if (purchaseForm.saving) return;
    const fail = (error) => setPurchaseForm((prev) => ({ ...prev, error, saving: false }));
    if (!purchaseForm.supplierId) return fail('Choose the supplier.');
    if (purchaseForm.lines.length === 0) return fail('Add the products you received.');
    const badLine = purchaseForm.lines.find((l) => !(Number.isInteger(Number(l.quantity)) && Number(l.quantity) > 0) || l.unitCost === '');
    if (badLine) return fail(`Check the quantity and cost for ${badLine.name}.`);
    if (paidNow > purchaseTotal + 0.005) return fail('Amount paid is more than the total.');
    setPurchaseForm((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const created = await createPurchase({
        supplierId: Number(purchaseForm.supplierId),
        purchaseDate: purchaseForm.purchaseDate,
        reference: purchaseForm.reference || undefined,
        notes: purchaseForm.notes || undefined,
        amountPaid: paidNow,
        paymentMethod: purchaseForm.paymentMethod,
        dueDate: owingAfter > 0 && purchaseForm.dueDate ? purchaseForm.dueDate : undefined,
        items: purchaseForm.lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
          ...(l.sellPrice !== '' ? { sellPrice: Number(l.sellPrice) } : {}),
        })),
      });
      setPurchaseForm(null);
      setTab('purchases');
      flash(Number(created.balanceDue) > 0 ? `Stock added. You owe ${money(created.balanceDue)} on this purchase.` : 'Stock added and paid.');
      load();
      fetchProducts('?type=goods').then(setProducts).catch(() => {});
    } catch (error) {
      fail(error.message);
    }
  };

  const openPurchase = async (purchase) => {
    setPurchaseDetail({ purchase, data: null });
    try {
      setPurchaseDetail({ purchase, data: await fetchPurchase(purchase.id) });
    } catch (error) {
      setPurchaseDetail({ purchase, data: null, error: error.message });
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Suppliers" value={active.length.toLocaleString()} hint={`${suppliers.length - active.length} archived`} icon={truckIcon} />
        <StatTile label="You owe suppliers" value={money(owed)} hint={`${unpaidCount} unpaid purchase${unpaidCount === 1 ? '' : 's'}`} tone={owed > 0 ? 'warning' : 'default'} iconTone="warning" icon={statIcons.credit} />
        <StatTile label="Bought this month" value={money(boughtThisMonth)} hint="Stock received" iconTone="info" icon={statIcons.box} />
        <StatTile label="Purchases" value={purchases.length.toLocaleString()} hint="Most recent 200" iconTone="violet" icon={statIcons.receipt} />
      </section>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Tabs
              value={tab}
              onChange={setTab}
              label="Suppliers sections"
              tabs={[
                { key: 'suppliers', label: 'Suppliers', count: suppliers.length },
                { key: 'purchases', label: 'Purchases', count: purchases.length },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder={tab === 'suppliers' ? 'Search suppliers' : 'Search supplier or invoice no.'} className="sm:max-w-xs sm:flex-1" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSupplierForm({ ...emptySupplier })} className="app-btn-secondary rounded-lg border px-3.5 py-2 text-sm font-medium">Add supplier</button>
            <button type="button" onClick={() => newPurchase()} className="app-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">{icons.plus} Record purchase</button>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : tab === 'suppliers' ? (
          visibleSuppliers.length === 0 ? (
            <EmptyState
              icon={truckIcon}
              title={suppliers.length ? 'No supplier matches your search' : 'No suppliers yet'}
              message="Add the people you buy stock from. Then record each delivery: stock goes up and you see what you still owe them."
              action={!suppliers.length ? <button type="button" onClick={() => setSupplierForm({ ...emptySupplier })} className="app-btn-primary rounded-lg px-4 py-2 text-sm">Add your first supplier</button> : null}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Supplier</th>
                    <th className="px-4 py-2.5 text-right font-medium">Purchases</th>
                    <th className="px-4 py-2.5 text-right font-medium">Bought</th>
                    <th className="px-4 py-2.5 text-right font-medium">You owe</th>
                    <th className="px-4 py-2.5 font-medium">Last delivery</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {visibleSuppliers.map((s) => (
                    <tr key={s.id} className={`app-row-hover ${s.isActive === false ? 'opacity-60' : ''}`}>
                      <td data-label="Supplier" className="px-4 py-2.5">
                        <p className="font-medium text-[var(--text-primary)]">
                          {s.name}
                          {s.isActive === false ? <span className="ml-2 rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--text-muted)]">Archived</span> : null}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{[s.phone, s.email].filter(Boolean).join(' · ') || 'No contact saved'}</p>
                      </td>
                      <td data-label="Purchases" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(s.purchaseCount || 0).toLocaleString()}</td>
                      <td data-label="Bought" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{money(s.purchased)}</td>
                      <td data-label="You owe" className="num px-4 py-2.5 text-right">
                        {Number(s.balance) > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-300">{money(s.balance)}</span> : <span className="text-[var(--text-muted)]">-</span>}
                      </td>
                      <td data-label="Last delivery" className="px-4 py-2.5 text-[var(--text-secondary)]">{shortDate(s.lastPurchaseDate)}</td>
                      <td data-label="Actions" className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {Number(s.balance) > 0 ? (
                            <button type="button" onClick={() => openStatement(s)} className="app-btn-primary mr-1 rounded-lg px-2.5 py-1.5 text-xs">Pay</button>
                          ) : null}
                          <button type="button" onClick={() => newPurchase(s.id)} className="app-btn-secondary mr-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium">Record purchase</button>
                          <IconButton label={`Account for ${s.name}`} onClick={() => openStatement(s)}>{icons.eye}</IconButton>
                          <IconButton label={`Edit ${s.name}`} onClick={() => setSupplierForm({ ...emptySupplier, ...s, phone: s.phone || '', whatsapp: s.whatsapp || '', email: s.email || '', address: s.address || '', notes: s.notes || '' })}>{icons.edit}</IconButton>
                          <IconButton label={`Remove ${s.name}`} tone="danger" onClick={() => removeSupplier(s)}>{icons.trash}</IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : visiblePurchases.length === 0 ? (
          <EmptyState
            icon={statIcons.receipt}
            title={purchases.length ? 'No purchase matches your search' : 'No purchases recorded yet'}
            message="When stock arrives, record it here. Stock levels and cost prices update automatically."
            action={<button type="button" onClick={() => newPurchase()} className="app-btn-primary rounded-lg px-4 py-2 text-sm">Record purchase</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lines</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Still owed</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {visiblePurchases.map((p) => (
                  <tr key={p.id} className="app-row-hover cursor-pointer" onClick={() => openPurchase(p)}>
                    <td data-label="Date" className="px-4 py-2.5 text-[var(--text-secondary)]">{shortDate(p.purchaseDate)}</td>
                    <td data-label="Supplier" className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{p.supplier?.name || '-'}</td>
                    <td data-label="Invoice" className="px-4 py-2.5 text-[var(--text-secondary)]">{p.reference || `#${p.id}`}</td>
                    <td data-label="Lines" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{p.itemCount}</td>
                    <td data-label="Total" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{money(p.total)}</td>
                    <td data-label="Still owed" className="num px-4 py-2.5 text-right">{Number(p.balanceDue) > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-300">{money(p.balanceDue)}</span> : <span className="text-[var(--text-muted)]">-</span>}</td>
                    <td data-label="Status" className="px-4 py-2.5">{paymentBadge(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {supplierForm ? (
        <Drawer
          title={supplierForm.id ? 'Edit supplier' : 'New supplier'}
          onClose={() => { if (supplierForm.returnToPurchase) setPurchaseForm(supplierForm.returnToPurchase); setSupplierForm(null); }}
          onSubmit={saveSupplier}
          footer={
            <>
              <button type="button" onClick={() => { if (supplierForm.returnToPurchase) setPurchaseForm(supplierForm.returnToPurchase); setSupplierForm(null); }} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={savingSupplier} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:opacity-60">{savingSupplier ? 'Saving…' : supplierForm.id ? 'Save changes' : 'Add supplier'}</button>
            </>
          }
        >
          <Field label="Name">
            <input autoFocus required value={supplierForm.name} onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))} className={fieldInput} placeholder="Company or person" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input type="tel" value={supplierForm.phone} onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))} className={fieldInput} placeholder="07…" /></Field>
            <Field label="WhatsApp"><input type="tel" value={supplierForm.whatsapp} onChange={(e) => setSupplierForm((p) => ({ ...p, whatsapp: e.target.value }))} className={fieldInput} placeholder="If different" /></Field>
          </div>
          <Field label="Email"><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((p) => ({ ...p, email: e.target.value }))} className={fieldInput} placeholder="Optional" /></Field>
          <Field label="Address"><input value={supplierForm.address} onChange={(e) => setSupplierForm((p) => ({ ...p, address: e.target.value }))} className={fieldInput} placeholder="Optional" /></Field>
          <Field label="Notes"><textarea rows="3" value={supplierForm.notes} onChange={(e) => setSupplierForm((p) => ({ ...p, notes: e.target.value }))} className={fieldInput} placeholder="What they supply, payment terms…" /></Field>
        </Drawer>
      ) : null}

      {purchaseForm ? (
        <div className="app-overlay fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setPurchaseForm(null); }}>
          <form onSubmit={savePurchase} className="app-modal flex h-full w-full max-w-3xl flex-col border-l" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
              <div>
                <h2 id="purchase-title" className="text-base font-semibold text-[var(--text-primary)]">Record purchase</h2>
                <p className="text-sm text-[var(--text-muted)]">Stock you received. Quantities are added and cost prices updated.</p>
              </div>
              <IconButton label="Close" onClick={() => setPurchaseForm(null)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg></IconButton>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Supplier" className="sm:col-span-1">
                  <select
                    value={purchaseForm.supplierId}
                    onChange={(e) => {
                      if (e.target.value === '__new') { setSupplierForm({ ...emptySupplier, returnToPurchase: purchaseForm }); setPurchaseForm(null); }
                      else setPurchaseForm((p) => ({ ...p, supplierId: e.target.value }));
                    }}
                    className={fieldInput}
                  >
                    <option value="">Choose…</option>
                    {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__new">+ New supplier…</option>
                  </select>
                </Field>
                <Field label="Date received">
                  <input type="date" value={purchaseForm.purchaseDate} max={localISO(new Date())} onChange={(e) => setPurchaseForm((p) => ({ ...p, purchaseDate: e.target.value }))} className={fieldInput} />
                </Field>
                <Field label="Supplier invoice no.">
                  <input value={purchaseForm.reference} onChange={(e) => setPurchaseForm((p) => ({ ...p, reference: e.target.value }))} className={fieldInput} placeholder="Optional" maxLength={64} />
                </Field>
              </div>

              <div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">Products received</p>
                <div className="relative mt-1.5">
                  <SearchInput
                    value={purchaseForm.productSearch}
                    onChange={(value) => setPurchaseForm((p) => ({ ...p, productSearch: value }))}
                    placeholder="Search a product to add"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (productMatches[0]) addLine(productMatches[0]); } }}
                  />
                  {productMatches.length ? (
                    <ul className="app-modal absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border p-1 shadow-xl">
                      {productMatches.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => addLine(p)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-[var(--text-primary)]">{p.name}</span>
                              <span className="text-xs text-[var(--text-muted)]">{p.category || 'Uncategorised'} · {Number(p.quantity || 0)} in stock</span>
                            </span>
                            <span className="num shrink-0 text-xs text-[var(--text-muted)]">cost {money(p.buyPrice)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {purchaseForm.lines.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">Search above and add each product on the delivery note.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-default)]">
                    <table className="min-w-full text-sm">
                      <thead className="app-table-head">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Product</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                          <th className="px-3 py-2 text-right font-medium">New selling price</th>
                          <th className="px-3 py-2 text-right font-medium">Line total</th>
                          <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-default)]">
                        {purchaseForm.lines.map((l) => (
                          <tr key={l.productId}>
                            <td className="px-3 py-2">
                              <p className="font-medium text-[var(--text-primary)]">{l.name}</p>
                              <p className="text-xs text-[var(--text-muted)]">{l.stock} in stock → {l.stock + (Number(l.quantity) || 0)}</p>
                            </td>
                            <td className="px-3 py-2 text-right"><input inputMode="numeric" value={l.quantity} onChange={(e) => updateLine(l.productId, 'quantity', e.target.value.trim())} aria-label={`Quantity of ${l.name}`} className="app-input num w-20 rounded-md border px-2 py-1.5 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input inputMode="decimal" value={l.unitCost} onChange={(e) => updateLine(l.productId, 'unitCost', e.target.value.trim())} aria-label={`Unit cost of ${l.name}`} className="app-input num w-28 rounded-md border px-2 py-1.5 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input inputMode="decimal" value={l.sellPrice} onChange={(e) => updateLine(l.productId, 'sellPrice', e.target.value.trim())} placeholder={String(l.currentSell)} aria-label={`New selling price of ${l.name}`} className="app-input num w-28 rounded-md border px-2 py-1.5 text-right" /></td>
                            <td className="num px-3 py-2 text-right font-medium text-[var(--text-primary)]">{money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</td>
                            <td className="px-2 py-2"><IconButton label={`Remove ${l.name}`} tone="danger" onClick={() => removeLine(l.productId)}>{icons.trash}</IconButton></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">Leave the selling price empty to keep the current one.</p>
              </div>

              <div className="app-panel-soft grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Paid now">
                    <div className="mt-1.5 flex gap-2">
                      <input
                        inputMode="decimal"
                        value={purchaseForm.paidTouched ? purchaseForm.paid : String(purchaseTotal || '')}
                        onChange={(e) => { const v = e.target.value.trim(); if (v === '' || /^\d*\.?\d*$/.test(v)) setPurchaseForm((p) => ({ ...p, paid: v, paidTouched: true })); }}
                        className="app-input num min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm"
                        placeholder="0"
                      />
                      <select value={purchaseForm.paymentMethod} onChange={(e) => setPurchaseForm((p) => ({ ...p, paymentMethod: e.target.value }))} className="app-input rounded-lg border px-3 py-2.5 text-sm" aria-label="Paid with">
                        {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                  </Field>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setPurchaseForm((p) => ({ ...p, paidTouched: false }))} className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">Paid in full</button>
                    <button type="button" onClick={() => setPurchaseForm((p) => ({ ...p, paid: '0', paidTouched: true }))} className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">On credit (pay later)</button>
                  </div>
                  {owingAfter > 0 ? (
                    <Field label="Pay supplier by" hint="Optional due date for the balance.">
                      <input type="date" value={purchaseForm.dueDate} onChange={(e) => setPurchaseForm((p) => ({ ...p, dueDate: e.target.value }))} className={fieldInput} />
                    </Field>
                  ) : null}
                </div>
                <dl className="space-y-1.5 self-end text-sm">
                  <div className="flex justify-between text-[var(--text-muted)]"><dt>Lines</dt><dd className="num">{purchaseForm.lines.length}</dd></div>
                  <div className="flex justify-between text-[var(--text-muted)]"><dt>Paid now</dt><dd className="num">{money(paidNow)}</dd></div>
                  {owingAfter > 0 ? <div className="flex justify-between font-medium text-amber-600 dark:text-amber-300"><dt>You will owe</dt><dd className="num">{money(owingAfter)}</dd></div> : null}
                  <div className="flex items-baseline justify-between border-t border-[var(--border-default)] pt-2"><dt className="font-medium text-[var(--text-primary)]">Total</dt><dd className="num text-xl font-semibold text-[var(--text-primary)]">{money(purchaseTotal)}</dd></div>
                </dl>
              </div>

              <Field label="Notes"><input value={purchaseForm.notes} onChange={(e) => setPurchaseForm((p) => ({ ...p, notes: e.target.value }))} className={fieldInput} placeholder="Optional" /></Field>
              {purchaseForm.error ? <Alert tone="danger">{purchaseForm.error}</Alert> : null}
            </div>

            <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">
              <button type="button" onClick={() => setPurchaseForm(null)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={purchaseForm.saving} className="app-btn-primary flex-[2] rounded-lg px-4 py-2.5 text-sm disabled:opacity-60">
                {purchaseForm.saving ? 'Saving…' : `Receive stock · ${money(purchaseTotal)}`}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statement ? (
        <Modal
          size="lg"
          title={`${statement.supplier.name} · Account`}
          subtitle={statement.data ? `Bought ${money(statement.data.purchased)} over ${statement.data.purchaseCount} purchase${statement.data.purchaseCount === 1 ? '' : 's'}` : 'Loading…'}
          onClose={() => setStatement(null)}
        >
          {!statement.data ? (
            statement.error ? <Alert tone="danger">{statement.error}</Alert> : <SkeletonRows rows={3} />
          ) : (
            <div className="space-y-5">
              {statement.data.balance > 0 ? (
                <form onSubmit={submitPayment} className="app-panel-soft space-y-3 rounded-xl border p-4">
                  <p className="text-sm text-[var(--text-secondary)]">You owe <strong className="text-amber-600 dark:text-amber-300">{money(statement.data.balance)}</strong>. Payments clear the oldest purchases first.</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input inputMode="decimal" required value={statement.pay.amount} onChange={(e) => { const v = e.target.value.trim(); if (v === '' || /^\d*\.?\d*$/.test(v)) setStatement((p) => ({ ...p, pay: { ...p.pay, amount: v } })); }} className="app-input num rounded-lg border px-3 py-2.5" aria-label="Amount paid" />
                    <select value={statement.pay.method} onChange={(e) => setStatement((p) => ({ ...p, pay: { ...p.pay, method: e.target.value } }))} className="app-input rounded-lg border px-3 py-2.5 text-sm" aria-label="Paid with">
                      {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <input value={statement.pay.notes} onChange={(e) => setStatement((p) => ({ ...p, pay: { ...p.pay, notes: e.target.value } }))} placeholder="Note (optional), e.g. bank reference" className="app-input w-full rounded-lg border px-3 py-2.5 text-sm" />
                  {statement.error ? <Alert tone="danger">{statement.error}</Alert> : null}
                  <button type="submit" disabled={statement.saving} className="app-btn-primary w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-60">{statement.saving ? 'Saving…' : 'Record payment'}</button>
                </form>
              ) : (
                <Alert tone="success">Nothing is owed to {statement.supplier.name}.</Alert>
              )}

              {statement.data.openPurchases.length ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Unpaid purchases</p>
                  <div className="space-y-2">
                    {statement.data.openPurchases.map((p) => {
                      const overdue = p.dueDate && new Date(`${p.dueDate}T23:59:59`) < new Date();
                      return (
                        <div key={p.id} className="app-panel-soft flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{p.reference || `Purchase #${p.id}`} · {shortDate(p.purchaseDate)}</p>
                            <p className={`text-xs ${overdue ? 'font-semibold text-red-500' : 'text-[var(--text-muted)]'}`}>Total {money(p.total)}{p.dueDate ? ` · due ${shortDate(p.dueDate)}${overdue ? ' (overdue)' : ''}` : ''}</p>
                          </div>
                          <span className="num shrink-0 font-semibold text-amber-600 dark:text-amber-300">{money(p.balanceDue)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Payments made</p>
                {statement.data.payments.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No later payments recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {statement.data.payments.map((pay) => (
                      <div key={pay.id} className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] pb-2 text-sm last:border-0">
                        <div className="min-w-0">
                          <p className="text-[var(--text-primary)]">{new Date(pay.createdAt).toLocaleString()} · {pay.method}</p>
                          <p className="text-xs text-[var(--text-muted)]">{pay.purchase?.reference || `Purchase #${pay.purchaseId}`}{pay.paidBy ? ` · by ${pay.paidBy.name}` : ''}{pay.notes ? ` · ${pay.notes}` : ''}</p>
                        </div>
                        <span className="num shrink-0 font-semibold text-[var(--text-primary)]">−{money(pay.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {purchaseDetail ? (
        <Modal
          size="lg"
          title={`${purchaseDetail.purchase.supplier?.name || 'Purchase'} · ${purchaseDetail.purchase.reference || `#${purchaseDetail.purchase.id}`}`}
          subtitle={`Received ${shortDate(purchaseDetail.purchase.purchaseDate)}${purchaseDetail.data?.createdBy ? ` · recorded by ${purchaseDetail.data.createdBy.name}` : ''}`}
          onClose={() => setPurchaseDetail(null)}
        >
          {!purchaseDetail.data ? (
            purchaseDetail.error ? <Alert tone="danger">{purchaseDetail.error}</Alert> : <SkeletonRows rows={3} />
          ) : (
            <div className="space-y-5">
              <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr><th className="px-3 py-2 text-left font-medium">Product</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Unit cost</th><th className="px-3 py-2 text-right font-medium">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {purchaseDetail.data.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-[var(--text-primary)]">{item.product?.name || `Product #${item.productId}`}</td>
                        <td className="num px-3 py-2 text-right">{item.quantity}</td>
                        <td className="num px-3 py-2 text-right">{money(item.unitCost)}</td>
                        <td className="num px-3 py-2 text-right font-medium">{money(Number(item.unitCost) * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Total</dt><dd className="num font-semibold">{money(purchaseDetail.data.total)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Paid on delivery</dt><dd className="num">{money(purchaseDetail.data.amountPaid)}{purchaseDetail.data.paymentMethod ? ` · ${purchaseDetail.data.paymentMethod}` : ''}</dd></div>
                {purchaseDetail.data.payments.map((pay) => (
                  <div key={pay.id} className="flex justify-between"><dt className="text-[var(--text-muted)]">Paid {shortDate(pay.createdAt)}</dt><dd className="num">{money(pay.amount)} · {pay.method}</dd></div>
                ))}
                <div className="flex justify-between border-t border-[var(--border-default)] pt-1.5"><dt className="font-medium">Still owed</dt><dd className={`num font-semibold ${Number(purchaseDetail.data.balanceDue) > 0 ? 'text-amber-600 dark:text-amber-300' : ''}`}>{money(purchaseDetail.data.balanceDue)}</dd></div>
              </dl>
              {purchaseDetail.data.notes ? <p className="text-sm text-[var(--text-secondary)]">{purchaseDetail.data.notes}</p> : null}
            </div>
          )}
        </Modal>
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
