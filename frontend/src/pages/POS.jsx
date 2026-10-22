import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchProducts, createSale, fetchSettings, downloadReceipt, fetchSale, fetchCustomers } from '../utils/api';
import { Link } from 'react-router-dom';
import { getUser } from '../utils/auth';
import { getPrintSettings, savePrintSettings } from '../utils/printSettings';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import PosReceipt from '../components/Receipt/PosReceipt';
import { formatMoney, formatAmount } from '../utils/format';

// Money actually handed over at the till.
const tenderMethods = ['Cash', 'Card', 'Mobile Money'];

const isServiceProduct = (product) => product?.type === 'service';

// Tiles rendered at once; more load on demand so big catalogues stay fast on phones.
const PAGE_SIZE = 60;

export default function POS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [currency, setCurrency] = useState('UGX');
  const [message, setMessage] = useState('');
  const [lastSaleId, setLastSaleId] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  // Per-device preference (see Settings → Printing).
  const [autoPrint, setAutoPrint] = useState(() => getPrintSettings().autoPrint);
  const [showReceipt, setShowReceipt] = useState(false);
  // Auto-print only the receipt of a sale that was just completed.
  const [printOnOpen, setPrintOnOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState('browse');
  const [category, setCategory] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef(null);
  const [heldSales, setHeldSales] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_held_sales') || '[]'); } catch { return []; }
  });
  const [useSplit, setUseSplit] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [creditDeposit, setCreditDeposit] = useState('');
  const [creditDepositMethod, setCreditDepositMethod] = useState('Cash');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [splitPayments, setSplitPayments] = useState([{ method: 'Cash', amount: '' }, { method: 'Card', amount: '' }]);

  useBodyScrollLock(showReceipt);

  useEffect(() => {
    loadProducts();
    loadSettings();
    loadCustomers();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsData = await fetchSettings();
      setSettingsState(settingsData);
      setCurrency(settingsData.currency || 'UGX');
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadProducts = async () => {
    const data = await fetchProducts(search ? `?search=${encodeURIComponent(search)}` : '');
    setProducts(data);
  };

  const loadCustomers = async () => {
    try {
      const data = await fetchCustomers();
      setCustomers(data);
      const walkIn = data.find((customer) => customer.name === 'Walk-in Customer');
      if (walkIn) {
        setCustomerId(String(walkIn.id));
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const categories = useMemo(() => {
    const counts = new Map();
    products.forEach((product) => {
      const key = product.category || 'Uncategorized';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category && (product.category || 'Uncategorized') !== category) return false;
      if (!query) return true;
      return [product.name, product.sku, product.category].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [products, search, category]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, category]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const cartQuantities = useMemo(() => new Map(cart.map((item) => [item.productId, item.quantity])), [cart]);

  // Barcode scanners type the code and press Enter: add an exact SKU match,
  // or the only result, straight to the cart.
  const handleSearchKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;
    const exact = products.find((product) => String(product.sku || '').toLowerCase() === query);
    const target = exact || (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (target) {
      addToCart(target);
      setSearch('');
    }
  };

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(customerId)),
    [customers, customerId]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.isService ? item.quantity + 1 : Math.min(item.quantity + 1, product.quantity) }
            : item
        );
      }
      if (!isServiceProduct(product) && Number(product.quantity) <= 0) {
        setMessage(`${product.name} is out of stock.`);
        return prev;
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: parseFloat(product.sellPrice),
        quantity: 1,
        isService: isServiceProduct(product),
      }];
    });
  };

  // Services can be charged at a price agreed at the counter.
  const updatePrice = (productId, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setCart((prev) => prev.map((item) => (item.productId === productId ? { ...item, price: value === '' ? '' : Number(value), priceInput: value } : item)));
  };

  const updateQuantity = (productId, amount) => {
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setDiscountType('fixed');
    setMobileSection('browse');
  };

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * item.quantity, 0);
  const discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatRate = Number(settings?.vat || 0);
  const taxAmount = (afterDiscount * vatRate) / 100;
  const total = afterDiscount + taxAmount;

  const isCredit = paymentMethod === 'Credit' && !useSplit;
  const depositValue = Math.max(0, parseFloat(creditDeposit) || 0);
  const creditPortion = Math.max(0, total - depositValue);
  const customerBalance = Number(selectedCustomer?.balance || 0);
  const customerLimit = selectedCustomer?.creditLimit != null ? Number(selectedCustomer.creditLimit) : null;
  const isWalkIn = !selectedCustomer || selectedCustomer.name === 'Walk-in Customer';

  const holdSale = () => {
    if (!cart.length) return;
    const held = { id: Date.now(), cart, customerId, paymentMethod, discount, discountType, savedAt: new Date().toISOString() };
    const newHeld = [...heldSales, held];
    setHeldSales(newHeld);
    localStorage.setItem('pos_held_sales', JSON.stringify(newHeld));
    clearCart();
    setMessage('Sale held. You can restore it any time.');
  };

  const restoreHeld = (held) => {
    setCart(held.cart);
    setCustomerId(held.customerId);
    setPaymentMethod(held.paymentMethod);
    setDiscount(held.discount);
    setDiscountType(held.discountType);
    const newHeld = heldSales.filter((h) => h.id !== held.id);
    setHeldSales(newHeld);
    localStorage.setItem('pos_held_sales', JSON.stringify(newHeld));
  };

  const deleteHeld = (id) => {
    const newHeld = heldSales.filter((h) => h.id !== id);
    setHeldSales(newHeld);
    localStorage.setItem('pos_held_sales', JSON.stringify(newHeld));
  };




  const handleCheckout = async () => {
    try {
      if (!cart.length) {
        setMessage('Add at least one product to cart.');
        return;
      }

      const unpriced = cart.find((item) => item.isService && !(Number(item.price) > 0));
      if (unpriced) {
        setMessage(`Enter the amount charged for ${unpriced.name}.`);
        return;
      }
      
      // Pre-checkout validation: verify stock availability
      const outOfStockItems = [];
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (product && !isServiceProduct(product) && product.quantity < item.quantity) {
          outOfStockItems.push(`${product.name} - Available: ${product.quantity}, Requested: ${item.quantity}`);
        }
      }
      
      if (outOfStockItems.length > 0) {
        setMessage(`Out of stock: ${outOfStockItems.join('; ')}. Please adjust quantities in your cart.`);
        return;
      }
      
      if (isCredit) {
        if (isWalkIn) {
          setMessage('Choose a named customer to sell on credit, so you know who owes the money.');
          return;
        }
        if (depositValue >= total) {
          setMessage('The amount paid covers the full total. Choose Cash, Card or Mobile Money instead of credit.');
          return;
        }
        if (customerLimit != null && customerBalance + creditPortion > customerLimit + 0.005) {
          setMessage(`${selectedCustomer.name} would exceed their credit limit of ${formatMoney(currency, customerLimit)} (currently owes ${formatMoney(currency, customerBalance)}).`);
          return;
        }
      }

      if (useSplit) {
        const splitTotal = splitPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        if (Math.abs(splitTotal - total) > 0.01) {
          setMessage(`Split amounts (${formatMoney(currency, splitTotal)}) must equal the total (${formatMoney(currency, total)}).`);
          return;
        }
      }
      setLoading(true);
      setMessage('');
      const response = await createSale({
        items: cart.map(({ productId, quantity, price, isService }) => ({ productId, quantity, ...(isService ? { price: Number(price) } : {}) })),
        paymentMethod: useSplit ? 'Split' : paymentMethod,
        paymentSplits: useSplit ? splitPayments.filter((p) => parseFloat(p.amount) > 0) : null,
        currency: currency || 'USD',
        discount,
        discountType,
        customerId: customerId ? Number(customerId) : null,
        ...(isCredit
          ? { amountPaid: depositValue, depositMethod: creditDepositMethod, dueDate: creditDueDate || null }
          : {}),
      });
      
      // Fetch the full sale data to display in receipt
      const saleData = await fetchSale(response.saleId);
      
      setLastSaleId(response.saleId);
      setLastSale(saleData);
      setPrintOnOpen(autoPrint);
      setShowReceipt(true);
      setCart([]);
      setDiscount(0);
      setDiscountType('fixed');
      setMobileSection('browse');
      setMessage(
        response.balanceDue > 0
          ? `Credit sale recorded. ${selectedCustomer?.name || 'Customer'} owes ${formatMoney(currency, response.balanceDue)} on this sale.`
          : 'Sale recorded successfully.'
      );
      if (isCredit) {
        setCreditDeposit('');
        setCreditDueDate('');
        setPaymentMethod('Cash');
        loadCustomers();
      }
      

      setLoading(false);
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-5 ${mobileSection === 'browse' && cartItemCount > 0 ? 'pb-24 xl:pb-0' : ''}`}>
      <div className="app-panel-soft grid grid-cols-2 rounded-xl border p-1 xl:hidden" role="tablist" aria-label="Point of sale view">
        {[
          { key: 'browse', label: 'Products' },
          { key: 'cart', label: `Cart${cartItemCount ? ` · ${cartItemCount}` : ''}` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={mobileSection === tab.key}
            onClick={() => setMobileSection(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              mobileSection === tab.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className={`app-panel min-w-0 rounded-2xl border p-4 sm:p-5 ${mobileSection !== 'browse' ? 'hidden xl:block' : ''}`}>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by name, code or category — press Enter to add"
              aria-label="Search products"
              className="app-input w-full rounded-xl border py-3 pl-10 pr-4"
            />
          </div>

          {categories.length > 1 ? (
            <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categories">
              {['', ...categories].map((name) => (
                <button
                  key={name || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={category === name}
                  onClick={() => setCategory(name)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    category === name
                      ? 'border-transparent bg-[var(--text-primary)] text-[var(--surface-primary)]'
                      : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  {name || 'All'}
                </button>
              ))}
            </div>
          ) : null}

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {filteredProducts.length.toLocaleString()} item{filteredProducts.length === 1 ? '' : 's'}
          </p>

          {filteredProducts.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">No matching items</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Try a different name or SKU, or clear the category filter.</p>
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {filteredProducts.slice(0, visibleCount).map((product) => {
                  const service = isServiceProduct(product);
                  const stock = Number(product.quantity || 0);
                  const outOfStock = !service && stock <= 0;
                  const inCart = cartQuantities.get(product.id) || 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={outOfStock}
                      className={`group relative flex min-h-[112px] flex-col rounded-xl border p-3 text-left transition ${
                        inCart
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-default)] bg-[var(--surface-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--panel-soft-bg)]'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {inCart ? (
                        <span className="num absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">
                          {inCart}
                        </span>
                      ) : null}
                      <span className="line-clamp-2 pr-6 text-sm font-medium leading-snug text-[var(--text-primary)]">{product.name}</span>
                      <span className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{product.category || 'Uncategorized'}</span>
                      <span className="mt-auto flex items-end justify-between gap-2 pt-2">
                        <span className="num text-sm font-semibold text-[var(--text-primary)]">{service && !(Number(product.sellPrice) > 0) ? 'Set price' : formatMoney(currency, product.sellPrice)}</span>
                        <span className={`num shrink-0 text-[11px] ${outOfStock ? 'font-semibold text-[var(--danger)]' : service ? 'text-[var(--accent)]' : stock <= Number(product.lowStock ?? 5) ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                          {service ? 'Service' : outOfStock ? 'Out' : `${stock} left`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {filteredProducts.length > visibleCount ? (
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="app-btn-secondary mt-3 w-full rounded-xl border px-4 py-2.5 text-sm font-medium"
                >
                  Show more ({(filteredProducts.length - visibleCount).toLocaleString()} remaining)
                </button>
              ) : null}
            </>
          )}
        </section>

        <section
          className={`app-panel flex min-w-0 flex-col rounded-2xl border xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] ${mobileSection !== 'cart' ? 'hidden xl:flex' : ''}`}
          aria-label="Current sale"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Current sale</h2>
              {cartItemCount > 0 ? (
                <span className="num rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{cartItemCount}</span>
              ) : null}
            </div>
            {cart.length > 0 ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={holdSale} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]">
                  Hold
                </button>
                <button type="button" onClick={clearCart} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Customer */}
            <div className="border-b border-[var(--border-default)] px-4 py-3">
              <label htmlFor="pos-customer" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Customer</label>
              <select
                id="pos-customer"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="app-input w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Walk-in customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}
                    {Number(customer.balance) > 0 ? ` (owes ${formatMoney(currency, customer.balance)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Lines */}
            {cart.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--text-muted)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 2h12l2 6H4l2-6Z" /><path d="M4 8v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" /></svg>
                </div>
                <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">No items yet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Tap a product to add it to the sale.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-default)]">
                {cart.map((item) => (
                  <li key={item.productId} className="group flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={item.name}>{item.name}</p>
                      {item.isService ? (
                        <label className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span>Price</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.priceInput ?? (item.price || '')}
                            onChange={(e) => updatePrice(item.productId, e.target.value.trim())}
                            placeholder="Amount"
                            aria-label={`Price charged for ${item.name}`}
                            className={`app-input num w-24 rounded-md border px-2 py-0.5 text-xs ${!(Number(item.price) > 0) ? 'border-amber-500' : ''}`}
                          />
                        </label>
                      ) : (
                        <p className="num text-xs text-[var(--text-muted)]">{formatMoney(currency, item.price)}</p>
                      )}
                    </div>
                    <div className="flex items-center rounded-lg border border-[var(--border-strong)]">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
                        aria-label={`One less ${item.name}`}
                      >
                        −
                      </button>
                      <span className="num w-7 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
                        aria-label={`One more ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                    <p className="num w-20 text-right text-sm font-semibold text-[var(--text-primary)]">{formatAmount(currency, (Number(item.price) || 0) * item.quantity)}</p>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="app-touch-reveal -mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Remove ${item.name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Checkout */}
          <div className="space-y-3 border-t border-[var(--border-default)] bg-[var(--panel-soft-bg)] px-4 py-4">
            {showDiscount || discount > 0 ? (
              <div className="flex items-center gap-2">
                <div className="inline-grid shrink-0 grid-cols-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-primary)] p-0.5 text-xs">
                  {[
                    { value: 'fixed', label: currency },
                    { value: 'percentage', label: '%' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDiscountType(option.value)}
                      className={`rounded-md px-2 py-1 font-medium ${discountType === option.value ? 'bg-[var(--text-primary)] text-[var(--surface-primary)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={discount || ''}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  placeholder="Discount"
                  aria-label="Discount"
                  className="app-input min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { setDiscount(0); setShowDiscount(false); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowDiscount(true)} className="text-xs font-medium text-[var(--accent)] hover:underline">
                + Add discount
              </button>
            )}

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[var(--text-muted)]"><span>Subtotal</span><span className="num">{formatMoney(currency, subtotal)}</span></div>
              {discountAmount > 0 ? (
                <div className="flex justify-between text-[var(--text-muted)]"><span>Discount</span><span className="num">−{formatMoney(currency, discountAmount)}</span></div>
              ) : null}
              {vatRate > 0 ? (
                <div className="flex justify-between text-[var(--text-muted)]"><span>VAT {vatRate}%</span><span className="num">{formatMoney(currency, taxAmount)}</span></div>
              ) : null}
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-medium text-[var(--text-primary)]">Total</span>
                <span className="num text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{formatMoney(currency, total)}</span>
              </div>
            </div>

            {/* Payment */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">Payment</p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 xl:grid-cols-5">
                {[...tenderMethods, 'Credit', 'Split'].map((method) => {
                  const active = method === 'Split' ? useSplit : !useSplit && paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (method === 'Split') {
                          setUseSplit(true);
                          if (paymentMethod === 'Credit') setPaymentMethod('Cash');
                        } else {
                          setUseSplit(false);
                          setPaymentMethod(method);
                        }
                      }}
                      className={`rounded-lg border px-1 py-2 text-xs font-medium leading-tight transition ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                          : 'border-[var(--border-strong)] bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      {method === 'Mobile Money' ? 'Mobile money' : method}
                    </button>
                  );
                })}
              </div>
            </div>

            {isCredit && (
              <div className="space-y-2.5 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3">
                {isWalkIn ? (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Choose a named customer above to sell on credit.</p>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedCustomer.name} owes <strong className="num">{formatMoney(currency, customerBalance)}</strong>
                    {customerLimit != null ? <> · limit <span className="num">{formatMoney(currency, customerLimit)}</span></> : ' · no limit set'}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-[var(--text-muted)]">
                    Paid now
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="0"
                      value={creditDeposit}
                      onChange={(e) => setCreditDeposit(e.target.value)}
                      className="app-input mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-[var(--text-muted)]">
                    Paid with
                    <select
                      value={creditDepositMethod}
                      onChange={(e) => setCreditDepositMethod(e.target.value)}
                      disabled={depositValue <= 0}
                      className="app-input mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-50"
                    >
                      {tenderMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2 text-xs text-[var(--text-muted)]">
                    Due date
                    <input
                      type="date"
                      value={creditDueDate}
                      onChange={(e) => setCreditDueDate(e.target.value)}
                      className="app-input mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">On credit</span>
                  <strong className="num text-amber-700 dark:text-amber-300">{formatMoney(currency, creditPortion)}</strong>
                </div>
              </div>
            )}

            {useSplit && (
              <div className="space-y-2">
                {splitPayments.map((sp, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      value={sp.method}
                      onChange={(e) => setSplitPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, method: e.target.value } : p)))}
                      className="app-input rounded-lg border px-2.5 py-1.5 text-sm"
                      aria-label={`Split ${i + 1} method`}
                    >
                      {tenderMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="Amount"
                      value={sp.amount}
                      onChange={(e) => setSplitPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, amount: e.target.value } : p)))}
                      className="app-input min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm"
                      aria-label={`Split ${i + 1} amount`}
                    />
                  </div>
                ))}
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setSplitPayments((prev) => [...prev, { method: 'Cash', amount: '' }])} className="font-medium text-[var(--accent)] hover:underline">+ Add method</button>
                  {splitPayments.length > 2 ? (
                    <button type="button" onClick={() => setSplitPayments((prev) => prev.slice(0, -1))} className="text-[var(--text-muted)] hover:text-[var(--danger)]">Remove last</button>
                  ) : null}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={loading || cart.length === 0}
              className="app-btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Processing…' : cart.length === 0 ? 'Add items to charge' : isCredit ? `Record credit sale · ${formatMoney(currency, total)}` : `Charge ${formatMoney(currency, total)}`}
            </button>

            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <input type="checkbox" checked={autoPrint} onChange={(event) => { setAutoPrint(event.target.checked); savePrintSettings({ autoPrint: event.target.checked }); }} />
              Print receipt automatically
            </label>

            {message ? (
              <div className={`rounded-lg px-3 py-2 text-sm ${/successfully|recorded/i.test(message) ? 'app-alert-success' : 'app-alert-danger'}`} role="status">
                <p>{message}</p>
                {/successfully|recorded/i.test(message) && lastSaleId ? (
                  <div className="mt-1.5 flex gap-3 text-xs font-medium">
                    <button type="button" onClick={() => setShowReceipt(true)} className="underline">View receipt</button>
                    <button type="button" onClick={() => downloadReceipt(lastSaleId)} className="underline">Download PDF</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {mobileSection === 'browse' && cartItemCount > 0 ? (
        <button
          type="button"
          onClick={() => setMobileSection('cart')}
          className="app-btn-primary fixed bottom-3 left-3 right-3 z-30 flex items-center justify-between rounded-xl px-4 py-3.5 shadow-[var(--shadow-raised)] xl:hidden"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <span className="text-sm font-medium">View cart · {cartItemCount} item{cartItemCount === 1 ? '' : 's'}</span>
          <span className="num text-sm font-semibold">{formatMoney(currency, total)}</span>
        </button>
      ) : null}

      {/* POS Receipt Modal */}
      {showReceipt && lastSale && settings && (
        <PosReceipt
          sale={lastSale}
          settings={settings}
          cashierName={getUser()?.name || 'Unknown'}
          onClose={() => { setShowReceipt(false); setPrintOnOpen(false); }}
          autoPrint={printOnOpen}
        />
      )}

      {heldSales.length > 0 ? (
        <section className="app-panel rounded-2xl border" aria-label="Held sales">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Held sales</h2>
            <span className="text-xs text-[var(--text-muted)]">Saved on this device</span>
          </div>
          <ul className="divide-y divide-[var(--border-default)]">
            {heldSales.map((held) => {
              const heldTotal = held.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
              const units = held.cart.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <li key={held.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="num text-sm font-medium text-[var(--text-primary)]">{formatMoney(currency, heldTotal)} · {units} item{units === 1 ? '' : 's'}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">Held at {new Date(held.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {held.cart.map((i) => i.name).join(', ')}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => deleteHeld(held.id)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--danger)]">Discard</button>
                    <button type="button" onClick={() => restoreHeld(held)} className="app-btn-primary rounded-lg px-3 py-1.5 text-sm">Resume</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-sm text-[var(--text-muted)]">
        Customer bringing something back? <Link to="/app/returns" className="font-medium text-[var(--accent)] hover:underline">Process a return</Link>
      </p>
    </div>
  );
}
