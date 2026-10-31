import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchSettings, restockProduct, restockCategory, fetchStockHistory } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMoney, formatCompactMoney, formatAmount } from '../utils/format';
import { StatTile, statIcons } from '../components/ui';
import ImportDialog from '../components/ImportDialog';
import ExcelMenu from '../components/ExcelMenu';
import { importProducts } from '../utils/api';
import { PRODUCT_COLUMNS, downloadWorkbook, fileDate } from '../utils/spreadsheet';

const PRODUCT_SHEET_COLUMNS = [
  { header: 'Name', key: 'name', width: 34 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'SKU', key: 'sku', width: 14 },
  { header: 'Type', key: 'type', width: 10 },
  { header: 'Cost price', key: 'buyPrice', width: 14, money: true },
  { header: 'Selling price', key: 'sellPrice', width: 14, money: true },
  { header: 'Wholesale price', key: 'wholesalePrice', width: 15, money: true },
  { header: 'Quantity', key: 'quantity', width: 11 },
  { header: 'Reorder level', key: 'lowStock', width: 14 },
];

const emptyForm = { name: '', sku: '', category: '', buyPrice: '', sellPrice: '', wholesalePrice: '', wholesaleMinQty: '', quantity: 0, lowStock: 5, expiryDate: '', type: 'goods' };
const PAGE_SIZE = 50;

const isService = (product) => product?.type === 'service';

function stockStatus(product) {
  if (isService(product)) return 'service';
  const quantity = Number(product.quantity || 0);
  if (quantity <= 0) return 'out';
  if (quantity <= Number(product.lowStock ?? 5)) return 'low';
  return 'ok';
}

const statusStyles = {
  ok: { label: 'In stock', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  low: { label: 'Running low', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  out: { label: 'Out of stock', className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  service: { label: 'Service', className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
};

function StatusBadge({ product }) {
  const status = statusStyles[stockStatus(product)];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}</span>;
}

// Optional expiry dates: products expiring within this many days are flagged.
const EXPIRY_WARNING_DAYS = 30;
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (value) => {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Days until the product expires (negative once expired), or null when it has
// no expiry date.
function daysToExpiry(product) {
  if (isService(product) || !product.expiryDate) return null;
  return Math.round((parseISO(product.expiryDate) - parseISO(localISO(new Date()))) / 86400000);
}

// Expired or expiring soon, with stock still on the shelf.
const needsExpiryCheck = (product) => {
  const days = daysToExpiry(product);
  return days != null && days <= EXPIRY_WARNING_DAYS && Number(product.quantity || 0) > 0;
};

function ExpiryNote({ product }) {
  const days = daysToExpiry(product);
  if (days == null) return null;
  const date = parseISO(product.expiryDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (days < 0) return <span className="mt-1 block text-[11px] font-semibold text-red-700 dark:text-red-300">Expired {date}</span>;
  if (days <= EXPIRY_WARNING_DAYS) {
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return <span className="mt-1 block text-[11px] font-semibold text-amber-700 dark:text-amber-300" title={date}>Expires {when}</span>;
  }
  return <span className="mt-1 block text-[11px] text-[var(--text-muted)]">Expires {date}</span>;
}

function marginPercent(product) {
  const sell = Number(product.sellPrice || 0);
  const buy = Number(product.buyPrice || 0);
  if (sell <= 0) return null;
  return Math.round(((sell - buy) / sell) * 100);
}


function IconButton({ label, onClick, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition ${danger ? 'hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]' : 'hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`app-modal max-h-[calc(92dvh/var(--app-zoom,1))] w-full overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl sm:p-6 ${wide ? 'max-w-xl' : 'max-w-lg'}`} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

const fieldLabel = 'block text-sm font-medium text-[var(--text-secondary)]';
const fieldInput = 'app-input mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm';

export default function Products() {
  const isAdmin = getUser()?.role === 'Admin';
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // ?show=expiring (from the dashboard) opens a filtered list.
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => {
    const show = searchParams.get('show');
    return ['low', 'out', 'expiring', 'service'].includes(show) ? show : 'all';
  });
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('products_view') || 'table'; } catch { return 'table'; }
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [restockmodal, setRestockModal] = useState(null);
  const [restockForm, setRestockForm] = useState({ quantity: '', costPrice: '', supplier: '', notes: '' });
  const [restockMessage, setRestockMessage] = useState('');
  const [stockHistory, setStockHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restockCategoryModal, setRestockCategoryModal] = useState(false);
  const [restockCategoryForm, setRestockCategoryForm] = useState({ category: '', quantity: '', costPrice: '', supplier: '', notes: '' });
  const [restockCategoryMessage, setRestockCategoryMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useBodyScrollLock(Boolean(restockmodal) || restockCategoryModal || Boolean(deleteTarget) || drawerOpen || importOpen);

  const exportProducts = () => downloadWorkbook(`products-${fileDate()}.xlsx`, [{
    name: 'Products',
    columns: [...PRODUCT_SHEET_COLUMNS, { header: 'Expiry date', key: 'expiryDate', width: 13 }, { header: 'Stock value (cost)', key: 'stockValue', width: 18, money: true }],
    rows: products.map((p) => ({
      name: p.name,
      category: p.category,
      sku: p.sku || '',
      type: p.type || 'goods',
      buyPrice: Number(p.buyPrice || 0),
      sellPrice: Number(p.sellPrice || 0),
      wholesalePrice: p.wholesalePrice == null ? '' : Number(p.wholesalePrice),
      quantity: p.type === 'service' ? '' : Number(p.quantity || 0),
      lowStock: p.type === 'service' ? '' : Number(p.lowStock || 0),
      expiryDate: p.expiryDate || '',
      stockValue: p.type === 'service' ? '' : Number(p.buyPrice || 0) * Number(p.quantity || 0),
    })),
  }]).catch((error) => showToast(error.message));

  const showToast = (text) => {
    setToast(text);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(''), 3500);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const settings = await fetchSettings();
      setCurrency(settings.currency || 'UGX');
      const data = await fetchProducts();
      setProducts(data);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Debounced server-side search by name and category.
  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        let q = '';
        if (search) q = `?search=${encodeURIComponent(search)}`;
        if (categoryFilter) q += `${q ? '&' : '?'}category=${encodeURIComponent(categoryFilter)}`;
        const data = await fetchProducts(q);
        setProducts(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, categoryFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    try { localStorage.setItem('products_view', view); } catch { /* per-device preference only */ }
  }, [view]);

  const counts = useMemo(() => {
    const result = { all: products.length, low: 0, out: 0, service: 0, expiring: 0, withExpiry: 0, units: 0, value: 0 };
    products.forEach((product) => {
      const status = stockStatus(product);
      if (status === 'low') result.low += 1;
      if (status === 'out') result.out += 1;
      if (status === 'service') result.service += 1;
      if (product.expiryDate && !isService(product)) result.withExpiry += 1;
      if (needsExpiryCheck(product)) result.expiring += 1;
      if (status !== 'service') {
        result.units += Number(product.quantity || 0);
        result.value += Number(product.quantity || 0) * Number(product.buyPrice || 0);
      }
    });
    return result;
  }, [products]);

  const visibleProducts = useMemo(() => {
    if (statusFilter === 'all') return products;
    if (statusFilter === 'expiring') {
      return products.filter(needsExpiryCheck).sort((a, b) => daysToExpiry(a) - daysToExpiry(b));
    }
    return products.filter((product) => stockStatus(product) === statusFilter);
  }, [products, statusFilter]);

  const uniqueCategories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setDrawerOpen(true);
  };

  const editProduct = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku || '',
      category: product.category,
      buyPrice: product.buyPrice,
      sellPrice: product.sellPrice,
      wholesalePrice: product.wholesalePrice ?? '',
      wholesaleMinQty: product.wholesaleMinQty ?? '',
      quantity: product.quantity,
      lowStock: product.lowStock,
      expiryDate: product.expiryDate || '',
      type: product.type || 'goods',
    });
    setFormError('');
    setDrawerOpen(true);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    const errors = [];
    if (!form.name || !form.name.trim()) errors.push('Enter a name');
    if (!form.category || !String(form.category).trim()) errors.push('Choose or type a category');
    const isServiceForm = form.type === 'service';
    if (!isServiceForm && (form.sellPrice === '' || Number(form.sellPrice) <= 0)) errors.push('Enter a selling price');
    if (form.sellPrice !== '' && Number(form.sellPrice) < 0) errors.push('Price cannot be negative');
    if (form.buyPrice !== '' && Number(form.buyPrice) < 0) errors.push('Cost cannot be negative');
    if (form.wholesalePrice !== '' && Number(form.wholesalePrice) > Number(form.sellPrice || 0)) errors.push('Wholesale price cannot be higher than the selling price');
    if (errors.length) {
      setFormError(`${errors.join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, buyPrice: form.buyPrice === '' ? 0 : form.buyPrice, sellPrice: form.sellPrice === '' ? 0 : form.sellPrice };
      if (editingId) {
        await updateProduct(editingId, body);
        showToast(`${form.name} updated.`);
      } else {
        await createProduct(body);
        showToast(`${form.name} added.`);
      }
      setDrawerOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadData();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (product) => {
    try {
      await deleteProduct(product.id);
      showToast(`${product.name} deleted.`);
      await loadData();
    } catch (error) {
      showToast(error.message);
    }
  };

  const openRestock = async (product) => {
    setRestockModal(product);
    setRestockForm({ quantity: '', costPrice: product.buyPrice || '', supplier: '', notes: '' });
    setRestockMessage('');
    setHistoryLoading(true);
    try {
      setStockHistory(await fetchStockHistory(product.id));
    } catch {
      setStockHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestock = async (e) => {
    e.preventDefault();
    try {
      const result = await restockProduct(restockmodal.id, restockForm);
      setRestockMessage(`Restocked. New stock: ${result.newQuantity} units.`);
      setRestockModal((prev) => ({ ...prev, quantity: result.newQuantity }));
      setRestockForm((prev) => ({ ...prev, quantity: '' }));
      setStockHistory(await fetchStockHistory(restockmodal.id).catch(() => stockHistory));
      await loadData();
    } catch (err) {
      setRestockMessage(err.message);
    }
  };

  const openRestockCategory = () => {
    setRestockCategoryForm((prev) => ({ ...prev, category: categoryFilter || '' }));
    setRestockCategoryMessage('');
    setRestockCategoryModal(true);
  };

  const handleRestockCategory = async (e) => {
    e.preventDefault();
    try {
      const result = await restockCategory({
        category: restockCategoryForm.category || categoryFilter,
        quantity: Number(restockCategoryForm.quantity),
        costPrice: restockCategoryForm.costPrice || undefined,
        supplier: restockCategoryForm.supplier || undefined,
        notes: restockCategoryForm.notes || undefined,
      });
      setRestockCategoryModal(false);
      showToast(`Restocked ${result.updated} products.`);
      await loadData();
    } catch (err) {
      setRestockCategoryMessage(err.message);
    }
  };

  const formMargin = Number(form.sellPrice) > 0 ? Math.round(((Number(form.sellPrice) - Number(form.buyPrice || 0)) / Number(form.sellPrice)) * 100) : null;
  const shown = visibleProducts.slice(0, visibleCount);

  const statusTabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'low', label: 'Running low', count: counts.low },
    { key: 'out', label: 'Out of stock', count: counts.out },
    ...(counts.withExpiry > 0 || statusFilter === 'expiring' ? [{ key: 'expiring', label: 'Expiring', count: counts.expiring }] : []),
    { key: 'service', label: 'Services', count: counts.service },
  ];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Products" value={counts.all.toLocaleString()} hint={`${counts.units.toLocaleString()} units in stock`} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} icon={statIcons.box} />
        {isAdmin ? (
          <StatTile label="Stock value at cost" value={formatCompactMoney(currency, counts.value)} hint={formatMoney(currency, counts.value)} icon={statIcons.money} iconTone="success" />
        ) : (
          <StatTile label="Services" value={counts.service.toLocaleString()} hint="Sold without stock" active={statusFilter === 'service'} onClick={() => setStatusFilter('service')} icon={statIcons.receipt} iconTone="info" />
        )}
        <StatTile label="Running low" value={counts.low.toLocaleString()} hint="At or below reorder level" tone={counts.low ? 'warning' : 'default'} iconTone="warning" active={statusFilter === 'low'} onClick={() => setStatusFilter('low')} icon={statIcons.low} />
        <StatTile label="Out of stock" value={counts.out.toLocaleString()} hint="Cannot be sold" tone={counts.out ? 'danger' : 'default'} iconTone="danger" active={statusFilter === 'out'} onClick={() => setStatusFilter('out')} icon={statIcons.alert} />
      </section>

      <section className="app-panel rounded-2xl border">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                placeholder="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search products"
                className="app-input w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Category"
              className="app-input rounded-lg border px-3 py-2 text-sm sm:w-48"
            >
              <option value="">All categories</option>
              {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-grid grid-cols-2 rounded-lg border border-[var(--border-strong)] p-0.5" role="group" aria-label="View">
              {[
                { key: 'table', label: 'List', icon: <path d="M4 6h16M4 12h16M4 18h16" /> },
                { key: 'grid', label: 'Grid', icon: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></> },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  title={`${option.label} view`}
                  className={`flex h-7 w-8 items-center justify-center rounded-md ${view === option.key ? 'bg-[var(--surface-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">{option.icon}</svg>
                </button>
              ))}
            </div>
            {isAdmin ? (
              <>
                <button type="button" onClick={openRestockCategory} className="app-btn-secondary hidden rounded-lg border px-3 py-2 text-sm font-medium sm:inline-flex">
                  Restock category
                </button>
                <ExcelMenu
                  items={[
                    { label: 'Import products…', hint: 'Add or update many at once', onClick: () => setImportOpen(true) },
                    { label: 'Export products', hint: `${products.length} rows with stock value`, onClick: exportProducts },
                  ]}
                />
                <button type="button" onClick={openCreate} className="app-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
                  Add product
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-default)] px-4" role="tablist" aria-label="Stock status">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium transition ${
                statusFilter === tab.key ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              <span className="num rounded-full bg-[var(--surface-secondary)] px-1.5 text-xs text-[var(--text-muted)]">{tab.count.toLocaleString()}</span>
            </button>
          ))}
        </div>

        {!isAdmin ? (
          <p className="border-b border-[var(--border-default)] bg-[var(--panel-soft-bg)] px-4 py-2 text-xs text-[var(--text-muted)]">View only. Ask an admin to add or change products.</p>
        ) : null}

        {/* Content */}
        {loading && products.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-secondary)]" />)}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{products.length === 0 && !search && !categoryFilter ? 'No products yet' : 'Nothing matches'}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {products.length === 0 && !search && !categoryFilter ? 'Add your first product or service to start selling.' : 'Try another search, category or status.'}
            </p>
            {isAdmin && products.length === 0 && !search && !categoryFilter ? (
              <button type="button" onClick={openCreate} className="app-btn-primary mt-4 rounded-lg px-4 py-2 text-sm">Add product</button>
            ) : null}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {shown.map((product) => (
              <div key={product.id} className="group flex flex-col rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-3.5 transition hover:border-[var(--border-strong)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">{product.name}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{product.category || 'Uncategorized'}{product.sku ? ` · ${product.sku}` : ''}</p>
                <ExpiryNote product={product} />
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="num text-base font-semibold text-[var(--text-primary)]">{formatMoney(currency, product.sellPrice)}</p>
                  {!isService(product) ? <p className="num text-xs text-[var(--text-muted)]">{Number(product.quantity || 0).toLocaleString()} in stock</p> : null}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <StatusBadge product={product} />
                  {isAdmin ? (
                    <div className="flex">
                      <IconButton label={`Edit ${product.name}`} onClick={() => editProduct(product)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </IconButton>
                      {!isService(product) ? (
                        <IconButton label={`Restock ${product.name}`} onClick={() => openRestock(product)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
                        </IconButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">In stock</th>
                  {isAdmin ? <th className="px-4 py-2.5 text-right font-medium">Cost ({currency})</th> : null}
                  <th className="px-4 py-2.5 text-right font-medium">Price ({currency})</th>
                  {isAdmin ? <th className="px-4 py-2.5 text-right font-medium">Margin</th> : null}
                  {isAdmin ? <th className="w-28 px-4 py-2.5"><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {shown.map((product) => {
                  const service = isService(product);
                  const margin = marginPercent(product);
                  return (
                    <tr key={product.id} className="app-row-hover">
                      <td data-label="Product" className="px-4 py-2.5">
                        <p className="font-medium text-[var(--text-primary)]">{product.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{product.category || 'Uncategorized'}{product.sku ? ` · ${product.sku}` : ''}</p>
                      </td>
                      <td data-label="Status" className="px-4 py-2.5"><StatusBadge product={product} /><ExpiryNote product={product} /></td>
                      <td data-label="In stock" className="num px-4 py-2.5 text-right text-[var(--text-primary)]">
                        {service ? <span className="text-[var(--text-muted)]">-</span> : (
                          <>
                            {Number(product.quantity || 0).toLocaleString()}
                            <span className="block text-[11px] text-[var(--text-muted)]">reorder at {product.lowStock}</span>
                          </>
                        )}
                      </td>
                      {isAdmin ? <td data-label="Cost" className="num px-4 py-2.5 text-right text-[var(--text-muted)]">{formatAmount(currency, product.buyPrice)}</td> : null}
                      <td data-label="Price" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{service && !(Number(product.sellPrice) > 0) ? <span className="font-normal text-[var(--text-muted)]">At checkout</span> : formatAmount(currency, product.sellPrice)}{product.wholesalePrice != null ? <span className="block text-[11px] font-normal text-[var(--text-muted)]">wholesale {formatAmount(currency, product.wholesalePrice)}{product.wholesaleMinQty ? ` · ${product.wholesaleMinQty}+` : ''}</span> : null}</td>
                      {isAdmin ? (
                        <td data-label="Margin" className={`num px-4 py-2.5 text-right ${margin == null ? 'text-[var(--text-muted)]' : margin < 0 ? 'text-red-600' : margin < 10 ? 'text-amber-600' : 'text-[var(--text-secondary)]'}`}>
                          {margin == null ? '-' : `${margin}%`}
                        </td>
                      ) : null}
                      {isAdmin ? (
                        <td data-label="Actions" className="px-4 py-2.5">
                          <div className="flex justify-end">
                            <IconButton label={`Edit ${product.name}`} onClick={() => editProduct(product)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </IconButton>
                            {!service ? (
                              <IconButton label={`Restock ${product.name}`} onClick={() => openRestock(product)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M12 13v8" /><path d="M8 17h8" /></svg>
                              </IconButton>
                            ) : null}
                            <IconButton label={`Delete ${product.name}`} onClick={() => setDeleteTarget(product)} danger>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                            </IconButton>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visibleProducts.length > visibleCount ? (
          <div className="border-t border-[var(--border-default)] p-3 text-center">
            <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="app-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium">
              Show more · {(visibleProducts.length - visibleCount).toLocaleString()} remaining
            </button>
          </div>
        ) : null}
      </section>

      {/* Add / edit drawer */}
      {drawerOpen ? (
        <div className="app-overlay fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <form onSubmit={saveProduct} className="app-modal flex h-full w-full max-w-md flex-col border-l" role="dialog" aria-modal="true" aria-labelledby="product-drawer-title">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
              <h2 id="product-drawer-title" className="text-base font-semibold text-[var(--text-primary)]">
                {editingId ? `Edit ${form.type === 'service' ? 'service' : 'product'}` : `New ${form.type === 'service' ? 'service' : 'product'}`}
              </h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Item type">
                {[
                  { value: 'goods', label: 'Goods', hint: 'Tracked in stock' },
                  { value: 'service', label: 'Service', hint: 'Repairs, labour, fees' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={form.type === option.value}
                    onClick={() => setForm((prev) => ({ ...prev, type: option.value }))}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      form.type === option.value ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{option.label}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                  </button>
                ))}
              </div>

              <label className={fieldLabel}>
                Name
                <input autoFocus value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={form.type === 'service' ? 'e.g. Screen replacement' : 'e.g. Samsung A05 screen'} className={fieldInput} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className={fieldLabel}>
                  Category
                  <input list="categoryList" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Choose or type" className={fieldInput} />
                  <datalist id="categoryList">{uniqueCategories.map((cat) => <option key={cat} value={cat} />)}</datalist>
                </label>
                <label className={fieldLabel}>
                  Item code <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                  <input value={form.sku} onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))} placeholder="e.g. A505-SB" className={fieldInput} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className={fieldLabel}>
                  {form.type === 'service' ? 'Cost to provide' : 'Cost price'}
                  <input type="number" step="any" min="0" inputMode="decimal" value={form.buyPrice} onChange={(e) => setForm((prev) => ({ ...prev, buyPrice: e.target.value }))} placeholder="0" className={fieldInput} />
                </label>
                <label className={fieldLabel}>
                  {form.type === 'service' ? <>Price <span className="font-normal text-[var(--text-muted)]">(optional)</span></> : 'Selling price'}
                  <input type="number" step="any" min="0" inputMode="decimal" value={form.sellPrice} onChange={(e) => setForm((prev) => ({ ...prev, sellPrice: e.target.value }))} placeholder={form.type === 'service' ? 'Set at checkout' : '0'} className={fieldInput} />
                </label>
              </div>
              {formMargin != null ? (
                <p className={`-mt-2 text-xs ${formMargin < 0 ? 'text-red-600' : 'text-[var(--text-muted)]'}`}>
                  Profit per sale: <span className="num font-medium">{formatMoney(currency, Number(form.sellPrice) - Number(form.buyPrice || 0))}</span> · {formMargin}% margin
                </p>
              ) : null}

              {form.type !== 'service' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className={fieldLabel}>
                    Wholesale price <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                    <input type="number" step="any" min="0" inputMode="decimal" value={form.wholesalePrice} onChange={(e) => setForm((prev) => ({ ...prev, wholesalePrice: e.target.value }))} placeholder="Same as selling price" className={fieldInput} />
                  </label>
                  <label className={fieldLabel}>
                    Wholesale from <span className="font-normal text-[var(--text-muted)]">(units)</span>
                    <input type="number" step="1" min="1" inputMode="numeric" value={form.wholesaleMinQty} onChange={(e) => setForm((prev) => ({ ...prev, wholesaleMinQty: e.target.value }))} placeholder="Any quantity" disabled={form.wholesalePrice === ''} className={`${fieldInput} disabled:opacity-50`} />
                  </label>
                  {form.wholesalePrice !== '' ? (
                    <p className="col-span-2 -mt-1 text-xs text-[var(--text-muted)]">
                      Wholesale customers pay <span className="num font-medium">{formatMoney(currency, Number(form.wholesalePrice))}</span>{form.wholesaleMinQty ? ` when they buy ${form.wholesaleMinQty} or more` : ''}. Profit per unit: <span className="num font-medium">{formatMoney(currency, Number(form.wholesalePrice) - Number(form.buyPrice || 0))}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {form.type !== 'service' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className={fieldLabel}>
                    {editingId ? 'Quantity in stock' : 'Opening stock'}
                    <input type="number" min="0" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className={fieldInput} />
                  </label>
                  <label className={fieldLabel}>
                    Reorder at
                    <input type="number" min="0" inputMode="numeric" value={form.lowStock} onChange={(e) => setForm((prev) => ({ ...prev, lowStock: Number(e.target.value) }))} className={fieldInput} />
                  </label>
                  <label className={`${fieldLabel} col-span-2`}>
                    Expiry date <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                    <input type="date" value={form.expiryDate} onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))} className={fieldInput} />
                    <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">Leave empty if it doesn&apos;t expire. For several batches, use the soonest date.</span>
                  </label>
                </div>
              ) : (
                <p className="rounded-lg bg-[var(--panel-soft-bg)] px-3 py-2.5 text-xs text-[var(--text-muted)]">Services have no stock count, so they can always be sold. Leave the price empty when it depends on the job; the cashier enters the amount at checkout.</p>
              )}

              {formError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{formError}</p> : null}
            </div>

            <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">
              <button type="button" onClick={() => setDrawerOpen(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:opacity-60">
                {saving ? 'Saving…' : editingId ? 'Save changes' : form.type === 'service' ? 'Add service' : 'Add product'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Restock */}
      {restockmodal ? (
        <Modal title={`Restock ${restockmodal.name}`} subtitle={`${Number(restockmodal.quantity || 0).toLocaleString()} in stock now`} onClose={() => setRestockModal(null)}>
          {restockMessage ? (
            <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${restockMessage.startsWith('Restocked') ? 'app-alert-success' : 'app-alert-danger'}`}>{restockMessage}</p>
          ) : null}
          <form className="grid grid-cols-2 gap-3" onSubmit={handleRestock}>
            <label className={fieldLabel}>
              Quantity to add
              <input type="number" min="1" required autoFocus inputMode="numeric" value={restockForm.quantity} onChange={(e) => setRestockForm((prev) => ({ ...prev, quantity: e.target.value }))} className={fieldInput} placeholder="e.g. 20" />
            </label>
            <label className={fieldLabel}>
              Cost price
              <input type="number" step="any" min="0" value={restockForm.costPrice} onChange={(e) => setRestockForm((prev) => ({ ...prev, costPrice: e.target.value }))} className={fieldInput} placeholder={String(restockmodal.buyPrice)} />
            </label>
            <label className={fieldLabel}>
              Supplier
              <input type="text" value={restockForm.supplier} onChange={(e) => setRestockForm((prev) => ({ ...prev, supplier: e.target.value }))} className={fieldInput} placeholder="Optional" />
            </label>
            <label className={fieldLabel}>
              Note
              <input type="text" value={restockForm.notes} onChange={(e) => setRestockForm((prev) => ({ ...prev, notes: e.target.value }))} className={fieldInput} placeholder="Optional" />
            </label>
            <button type="submit" className="app-btn-primary col-span-2 mt-1 rounded-lg px-4 py-2.5 text-sm">Add to stock</button>
          </form>
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Recent deliveries</p>
            {historyLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-secondary)]" />
            ) : stockHistory.length ? (
              <ul className="max-h-48 divide-y divide-[var(--border-default)] overflow-y-auto text-sm">
                {stockHistory.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="num font-medium text-[var(--text-primary)]">+{entry.quantity}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{entry.supplier || '-'}</span>
                    <span className="text-xs text-[var(--text-muted)]">{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No deliveries recorded yet.</p>
            )}
          </div>
        </Modal>
      ) : null}

      {/* Restock a whole category */}
      {restockCategoryModal ? (
        <Modal title="Restock a category" subtitle="Adds the same quantity to every product in the category." onClose={() => setRestockCategoryModal(false)}>
          {restockCategoryMessage ? <p className="app-alert-danger mb-4 rounded-lg px-3 py-2 text-sm">{restockCategoryMessage}</p> : null}
          <form className="grid grid-cols-2 gap-3" onSubmit={handleRestockCategory}>
            <label className={`${fieldLabel} col-span-2`}>
              Category
              <select required value={restockCategoryForm.category || categoryFilter} onChange={(e) => setRestockCategoryForm((prev) => ({ ...prev, category: e.target.value }))} className={fieldInput}>
                <option value="">Choose a category</option>
                {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label className={fieldLabel}>
              Quantity to add
              <input required type="number" min="1" value={restockCategoryForm.quantity} onChange={(e) => setRestockCategoryForm((prev) => ({ ...prev, quantity: e.target.value }))} className={fieldInput} />
            </label>
            <label className={fieldLabel}>
              Cost price
              <input type="number" step="any" min="0" value={restockCategoryForm.costPrice} onChange={(e) => setRestockCategoryForm((prev) => ({ ...prev, costPrice: e.target.value }))} className={fieldInput} placeholder="Keep current" />
            </label>
            <label className={fieldLabel}>
              Supplier
              <input type="text" value={restockCategoryForm.supplier} onChange={(e) => setRestockCategoryForm((prev) => ({ ...prev, supplier: e.target.value }))} className={fieldInput} />
            </label>
            <label className={fieldLabel}>
              Note
              <input type="text" value={restockCategoryForm.notes} onChange={(e) => setRestockCategoryForm((prev) => ({ ...prev, notes: e.target.value }))} className={fieldInput} />
            </label>
            <button type="submit" className="app-btn-primary col-span-2 mt-1 rounded-lg px-4 py-2.5 text-sm">Restock category</button>
          </form>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete product?"
          message={<>Delete <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.name}</strong> permanently? This cannot be undone.</>}
          confirmLabel="Delete"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            removeProduct(target);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[var(--surface-inverse)] px-4 py-2.5 text-sm text-[var(--bg-app)] shadow-[var(--shadow-raised)]" role="status">
          {toast}
        </div>
      ) : null}
      {importOpen ? (
        <ImportDialog
          title="Import products"
          noun="products"
          columns={PRODUCT_COLUMNS}
          required={['name']}
          submit={importProducts}
          options={[{ key: 'updateStock', label: 'Also set stock quantities of existing products', hint: 'Off: only new products get the quantity in the file; existing stock is left alone (use Record purchase for deliveries).' }]}
          template={{
            filename: 'stockdesk-products-template.xlsx',
            columns: PRODUCT_SHEET_COLUMNS,
            rows: [
              { name: 'Tecno Spark 20 screen', category: 'Screens', sku: 'TS20-LCD', type: 'goods', buyPrice: 45000, sellPrice: 65000, quantity: 10, lowStock: 3 },
              { name: 'Phone repair (labour)', category: 'Services', sku: '', type: 'service', buyPrice: 0, sellPrice: 0, quantity: '', lowStock: '' },
            ],
          }}
          onClose={() => setImportOpen(false)}
          onDone={() => loadData()}
        />
      ) : null}
    </div>
  );
}
