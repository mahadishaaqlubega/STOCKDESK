import { useEffect, useMemo, useState } from 'react';
import { deleteCustomerPrice, fetchCustomerPrices, fetchProducts, saveCustomerPrice } from '../utils/api';
import { formatMoney } from '../utils/format';
import { Alert, EmptyState, Field, IconButton, Modal, SkeletonRows, fieldInput, icons } from './ui';

// Prices agreed with one customer. The till uses them automatically for that
// customer. Each must sit between the product's cost and its retail price.
export default function CustomerPricesModal({ customer, currency, onClose }) {
  const [prices, setPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productId, setProductId] = useState('');
  const [price, setPrice] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [p, list] = await Promise.all([fetchCustomerPrices(customer.id), fetchProducts()]);
      setPrices(p.prices || []);
      setProducts((Array.isArray(list) ? list : []).filter((x) => x.type !== 'service'));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load prices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [customer.id]);

  const selected = products.find((p) => String(p.id) === String(productId));
  const floor = selected ? Number(selected.buyPrice || 0) : null;
  const wholesale = selected && selected.wholesalePrice != null ? Number(selected.wholesalePrice) : null;
  const retail = selected ? Number(selected.sellPrice || 0) : null;
  const options = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 200);
  }, [products, filter]);

  const pick = (id, current) => {
    setProductId(String(id));
    setPrice(current != null ? String(current) : '');
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (!selected) return setError('Choose a product.');
    const value = Number(price);
    if (!(value > 0)) return setError('Enter a price.');
    if (value > retail) return setError(`The price can't be above the retail price of ${formatMoney(currency, retail)}.`);
    if (value < floor) return setError(`The price can't be below the cost price of ${formatMoney(currency, floor)}.`);
    setSaving(true);
    try {
      await saveCustomerPrice(customer.id, selected.id, value);
      setProductId('');
      setPrice('');
      setFilter('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not save the price.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteCustomerPrice(customer.id, id);
      setPrices((prev) => prev.filter((p) => p.productId !== id));
    } catch (err) {
      setError(err.message || 'Could not remove the price.');
    }
  };

  return (
    <Modal title={`Special prices · ${customer.name}`} subtitle="Used automatically at the till whenever this customer buys" onClose={onClose} size="lg">
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-default)] p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <Field label="Product">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to search" className={fieldInput} />
            <select value={productId} onChange={(e) => pick(e.target.value, prices.find((p) => String(p.productId) === e.target.value)?.price)} className={`${fieldInput} mt-2`} size={1}>
              <option value="">Choose a product…</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(currency, p.sellPrice)}</option>)}
            </select>
          </Field>
          <Field label="Price for this customer">
            <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldInput} placeholder={retail != null ? String(retail) : ''} />
          </Field>
          <button type="submit" disabled={saving} className="app-btn-primary rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save price'}</button>
          {selected ? (
            <p className="text-xs text-[var(--text-muted)] sm:col-span-3">
              Cost {formatMoney(currency, floor)}{wholesale != null ? ` · wholesale ${formatMoney(currency, wholesale)}` : ''} · retail {formatMoney(currency, retail)}. Any price from cost up to retail is allowed.
            </p>
          ) : null}
        </form>

        {loading ? <SkeletonRows rows={3} /> : !prices.length ? (
          <EmptyState title="No special prices yet" message="Save a price above and the till will use it for this customer automatically." />
        ) : (
          <ul className="divide-y divide-[var(--border-default)] rounded-xl border border-[var(--border-default)]">
            {prices.map((p) => {
              const saving_ = p.product ? p.product.sellPrice - p.price : 0;
              return (
                <li key={p.productId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <button type="button" onClick={() => pick(p.productId, p.price)} className="min-w-0 flex-1 text-left">
                    <p className="truncate font-medium text-[var(--text-primary)]">{p.product?.name || `Product ${p.productId}`}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Retail {formatMoney(currency, p.product?.sellPrice)}{p.product?.wholesalePrice != null ? ` · wholesale ${formatMoney(currency, p.product.wholesalePrice)}` : ''}
                    </p>
                  </button>
                  <div className="text-right">
                    <p className="num font-semibold text-[var(--text-primary)]">{formatMoney(currency, p.price)}</p>
                    {saving_ > 0 ? <p className="text-xs text-[var(--text-muted)]">saves {formatMoney(currency, saving_)}</p> : null}
                  </div>
                  <IconButton label={`Remove price for ${p.product?.name || 'product'}`} tone="danger" onClick={() => remove(p.productId)}>{icons.trash}</IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
