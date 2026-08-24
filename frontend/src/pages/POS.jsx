import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, createSale, fetchSettings, downloadReceipt, fetchSale, fetchCustomers, printReceiptToPrinter, createReturn } from '../utils/api';
import { getToken, getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import PosReceipt from '../components/Receipt/PosReceipt';

const paymentMethods = ['Cash', 'Card', 'Mobile Money'];

function formatMoney(currency, value) {
  return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SummaryStat({ label, value, helper }) {
  return (
    <div className="app-panel rounded-[1.2rem] border border-l-[3px] border-l-[var(--accent)] p-4 transition duration-200 hover:shadow-lg">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">POS</p>
      <p className="mt-1.5 text-[13px] font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value}</p>
      <p className="mt-1.5 text-[12px] leading-4 text-[var(--text-muted)]">{helper}</p>
    </div>
  );
}

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
  const [autoPrint, setAutoPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [mobileSection, setMobileSection] = useState('browse');
  const [heldSales, setHeldSales] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_held_sales') || '[]'); } catch { return []; }
  });
  const [useSplit, setUseSplit] = useState(false);
  const [splitPayments, setSplitPayments] = useState([{ method: 'Cash', amount: '' }, { method: 'Card', amount: '' }]);
  const [showReturns, setShowReturns] = useState(false);
  const [returnSaleId, setReturnSaleId] = useState('');
  const [returnLookup, setReturnLookup] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [returnMessage, setReturnMessage] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);

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
      setAutoPrint(false);
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

  const filteredProducts = useMemo(
    () => products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

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
          item.productId === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.quantity) } : item
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: parseFloat(product.sellPrice), quantity: 1 }];
    });
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

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatRate = Number(settings?.vat || 0);
  const taxAmount = (afterDiscount * vatRate) / 100;
  const total = afterDiscount + taxAmount;

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

  const lookupReturnSale = async () => {
    if (!returnSaleId.trim()) return;
    try {
      setReturnLoading(true);
      setReturnMessage('');
      const sale = await fetchSale(returnSaleId.trim());
      setReturnLookup(sale);
      const initItems = {};
      (sale.items || []).forEach((item) => { initItems[item.productId] = 0; });
      setReturnItems(initItems);
    } catch (e) {
      setReturnMessage(e.message);
      setReturnLookup(null);
    } finally {
      setReturnLoading(false);
    }
  };

  const handleReturn = async () => {
    try {
      setReturnLoading(true);
      setReturnMessage('');
      const items = Object.entries(returnItems)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([productId, quantity]) => ({ productId: Number(productId), quantity: Number(quantity) }));
      if (!items.length) { setReturnMessage('Select at least one item to return.'); setReturnLoading(false); return; }
      const result = await createReturn(returnLookup.id, { items, reason: returnReason });
      setReturnMessage(`Return processed. Total refund: ${formatMoney(currency, result.totalRefund)}`);
      setReturnLookup(null);
      setReturnItems({});
      setReturnSaleId('');
      setReturnReason('');
    } catch (e) {
      setReturnMessage(e.message);
    } finally {
      setReturnLoading(false);
    }
  };

  const printToThermalPrinter = async (saleId) => {
    try {
      setPrinting(true);
      const token = getToken();
      if (!token) {
        setMessage('Not authenticated. Opening PDF instead.');
        window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/sales/${saleId}/receipt`, '_blank');
        setPrinting(false);
        return;
      }
      await printReceiptToPrinter(saleId);
      setMessage('Receipt printed to thermal printer.');
    } catch (error) {
      if (error.fallback) {
        window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/sales/${saleId}/receipt`, '_blank');
        setMessage('Thermal printer unavailable. Opened PDF in new tab.');
      } else {
        setMessage(`Print failed: ${error.message}`);
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleCheckout = async () => {
    try {
      if (!cart.length) {
        setMessage('Add at least one product to cart.');
        return;
      }
      
      // Pre-checkout validation: verify stock availability
      const outOfStockItems = [];
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (product && product.quantity < item.quantity) {
          outOfStockItems.push(`${product.name} - Available: ${product.quantity}, Requested: ${item.quantity}`);
        }
      }
      
      if (outOfStockItems.length > 0) {
        setMessage(`Out of stock: ${outOfStockItems.join('; ')}. Please adjust quantities in your cart.`);
        return;
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
        items: cart,
        paymentMethod: useSplit ? 'Split' : paymentMethod,
        paymentSplits: useSplit ? splitPayments.filter((p) => parseFloat(p.amount) > 0) : null,
        currency: currency || 'USD',
        discount,
        discountType,
        customerId: customerId ? Number(customerId) : null,
      });
      
      // Fetch the full sale data to display in receipt
      const saleData = await fetchSale(response.saleId);
      
      setLastSaleId(response.saleId);
      setLastSale(saleData);
      setShowReceipt(true);
      setCart([]);
      setDiscount(0);
      setDiscountType('fixed');
      setMobileSection('browse');
      setMessage('Sale recorded successfully.');
      
      // Auto-print if enabled
      if (autoPrint) {
        setTimeout(() => {
          printToThermalPrinter(response.saleId);
        }, 500);
      }
      
      setLoading(false);
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-6 ${mobileSection === 'browse' && cartItemCount > 0 ? 'pb-28 xl:pb-0' : ''}`}>
      <section className="app-panel relative overflow-hidden rounded-[1.7rem] border p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(30,167,189,0.14),transparent_58%)] lg:block" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="relative">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Point of Sale</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Search products, add items to cart, apply discounts, and complete sales quickly.</p>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:min-w-[460px]">
            <SummaryStat label="Available Products" value={products.length.toLocaleString()} helper="Items ready to sell." />
            <SummaryStat label="Cart Items" value={cart.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} helper="Units currently in cart." />
            <SummaryStat label="Cart Total" value={formatMoney(currency, total)} helper="Before completing the sale." />
          </div>
        </div>
      </section>

      <div className="grid gap-2 xl:hidden">
        <div className="app-panel-soft grid grid-cols-2 rounded-[1.2rem] border p-2">
          <button
            type="button"
            onClick={() => setMobileSection('browse')}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition ${mobileSection === 'browse' ? 'app-btn-primary text-white' : 'app-btn-subtle'}`}
          >
            Browse Products
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('cart')}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition ${mobileSection === 'cart' ? 'app-btn-primary text-white' : 'app-btn-subtle'}`}
          >
            Cart {cartItemCount > 0 ? `(${cartItemCount})` : ''}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <section className={`app-panel rounded-[1.5rem] border p-5 sm:p-6 ${mobileSection !== 'browse' ? 'hidden xl:block' : ''}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Product Search</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Find products quickly and add them to the current sale.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product"
                className="app-input w-full min-w-0 rounded-lg border px-4 py-3"
              />
              <button
                type="button"
                onClick={loadProducts}
                className="app-btn-primary w-full rounded-lg px-4 py-3 transition sm:w-auto"
              >
                Search
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {filteredProducts.length === 0 ? (
              <div className="app-panel-soft rounded-lg border border-dashed px-4 py-12 text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">No matching products</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Try another search term or refresh the product list.</p>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div key={product.id} className="app-panel flex flex-col gap-4 rounded-[1.35rem] border p-4 transition hover:-translate-y-1 hover:shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] text-sm font-semibold text-[var(--accent-strong)]">
                      {String(product.name || 'P').slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{product.name}</p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{product.category || 'Uncategorized'}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{product.quantity} units in stock</p>
                    </div>
                  </div>
                  <div className="w-full text-left sm:w-auto sm:text-right">
                    <p className="font-semibold text-[var(--text-primary)]">{formatMoney(currency, product.sellPrice)}</p>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="app-btn-primary mt-2 w-full rounded-lg px-4 py-2 text-sm transition sm:w-auto"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={`app-panel rounded-[1.5rem] border p-5 sm:p-6 ${mobileSection !== 'cart' ? 'hidden xl:block' : ''}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Current Sale</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Review cart items, customer, and payment before checkout.</p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="app-btn-danger rounded-lg px-4 py-2 text-sm font-medium transition"
                >
                  Clear Cart
                </button>
              )}
            </div>
            <div className="mt-4 space-y-4">
              {cart.length === 0 ? (
                  <div className="app-panel-soft rounded-lg border border-dashed px-4 py-10 text-center">
                  <p className="text-sm font-medium text-[var(--text-primary)]">No items in the cart yet</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Add products from the list to start a sale.</p>
                </div>
              ) : (
                <>
                  {cart.map((item) => (
                    <div key={item.productId} className="app-panel-soft rounded-[1.35rem] border p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="mb-2 inline-flex rounded-full bg-[var(--surface-primary)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Cart Item</p>
                          <p className="font-semibold text-[var(--text-primary)]">{item.name}</p>
                          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{formatMoney(currency, item.price)} each</p>
                          <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">Line total: {formatMoney(currency, item.price * item.quantity)}</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:items-end">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            className="app-btn-danger inline-flex h-9 w-9 items-center justify-center rounded-full transition"
                            aria-label={`Remove ${item.name} from cart`}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, -1)}
                              className="app-btn-secondary flex h-11 w-11 items-center justify-center rounded-full border text-lg transition"
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-semibold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, 1)}
                              className="app-btn-secondary flex h-11 w-11 items-center justify-center rounded-full border text-lg transition"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            className="app-btn-danger hidden rounded-full px-3 py-1 text-sm font-medium transition sm:inline-flex"
                            aria-label={`Remove ${item.name} from cart`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">Customer</label>
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      className="app-input w-full rounded-lg border px-4 py-3"
                    >
                      <option value="">Walk-in / no customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}{customer.phone ? ` - ${customer.phone}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedCustomer ? (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Selected: {selectedCustomer.name}{selectedCustomer.phone ? ` • ${selectedCustomer.phone}` : ''}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <div className="app-panel-soft mt-6 rounded-[1.35rem] border p-4 sm:p-5">
              <p className="text-sm text-[var(--text-muted)]">Payment method</p>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    disabled={useSplit}
                    className="app-btn-secondary flex-1 rounded-lg border px-4 py-3 disabled:opacity-50"
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] whitespace-nowrap">
                    <input type="checkbox" checked={useSplit} onChange={(e) => setUseSplit(e.target.checked)} />
                    Split
                  </label>
                </div>
                {useSplit && (
                  <div className="mt-2 space-y-2">
                    {splitPayments.map((sp, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          value={sp.method}
                          onChange={(e) => setSplitPayments((prev) => prev.map((p, idx) => idx === i ? { ...p, method: e.target.value } : p))}
                          className="app-btn-secondary rounded-lg border px-3 py-2 text-sm"
                        >
                          {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={sp.amount}
                          onChange={(e) => setSplitPayments((prev) => prev.map((p, idx) => idx === i ? { ...p, amount: e.target.value } : p))}
                          className="app-input flex-1 rounded-lg border px-3 py-2 text-sm"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSplitPayments((prev) => [...prev, { method: 'Cash', amount: '' }])} className="app-btn-secondary rounded-lg border px-3 py-2 text-xs">+ Add method</button>
                      {splitPayments.length > 2 && <button type="button" onClick={() => setSplitPayments((prev) => prev.slice(0, -1))} className="app-btn-danger rounded-lg px-3 py-2 text-xs">Remove</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="app-panel-soft mt-6 rounded-[1.35rem] border p-4 sm:p-5">
              <p className="text-sm text-[var(--text-muted)]">Discount</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value)}
                  className="app-btn-secondary w-full rounded-lg border px-4 py-3 sm:w-24"
                >
                  <option value="fixed">Fixed</option>
                  <option value="percentage">Percent</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  placeholder={discountType === 'percentage' ? 'Discount' : 'Amount'}
                  className="app-btn-secondary flex-1 rounded-lg border px-4 py-3"
                />
                <span className="flex items-center px-2 text-sm text-[var(--text-muted)]">{discountType === 'percentage' ? '%' : currency}</span>
              </div>
            </div>

            <div className="app-panel mt-6 rounded-[1.45rem] border p-4 sm:p-5">
              <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
                <span>Subtotal</span>
                <span>{formatMoney(currency, subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-[var(--text-muted)]">
                  <span>Discount</span>
                  <span>-{formatMoney(currency, discountAmount)}</span>
                </div>
              )}
              {vatRate > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-[var(--text-muted)]">
                  <span>VAT ({vatRate}%)</span>
                  <span>+{formatMoney(currency, taxAmount)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-[var(--border-default)] pt-2 text-[var(--text-primary)]">
                <span>Total</span>
                <strong>{formatMoney(currency, total)}</strong>
              </div>
              <label className="app-panel-soft mt-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={autoPrint} onChange={(event) => setAutoPrint(event.target.checked)} />
                Print receipt automatically after checkout
              </label>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={loading}
                  className={`w-full rounded-3xl px-4 py-3 text-white transition ${
                    loading ? 'cursor-not-allowed bg-gray-400' : 'app-btn-primary'
                  }`}
                >
                  {loading ? 'Processing...' : 'Complete Sale'}
                </button>
                {cart.length > 0 && (
                  <button type="button" onClick={holdSale} className="app-btn-secondary w-full rounded-3xl border px-4 py-2.5 text-sm transition">
                    Hold Sale
                  </button>
                )}
              </div>
            </div>
            {message && (
              <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${message.includes('successfully') ? 'app-alert-success' : 'app-alert-danger'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>{message}</span>
                  {message.includes('successfully') && lastSaleId && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => downloadReceipt(lastSaleId)}
                        className="whitespace-nowrap rounded-lg bg-[var(--success)] px-3 py-1 text-xs text-white transition hover:bg-[var(--success-hover)]"
                      >
                        Download Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => printToThermalPrinter(lastSaleId)}
                        disabled={printing}
                        className="app-btn-primary whitespace-nowrap rounded-lg px-3 py-1 text-xs transition disabled:opacity-50"
                      >
                        {printing ? 'Printing...' : 'Print Receipt'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
        </section>
      </div>

      {mobileSection === 'browse' && cartItemCount > 0 ? (
        <button
          type="button"
          onClick={() => setMobileSection('cart')}
          className="app-btn-primary fixed bottom-4 left-4 right-4 z-30 rounded-2xl px-4 py-4 text-left shadow-xl xl:hidden"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <span className="block text-xs uppercase tracking-[0.16em] text-white/80">Current Sale</span>
          <span className="mt-1 flex items-center justify-between gap-4 text-sm font-semibold text-white">
            <span>{cartItemCount} item{cartItemCount === 1 ? '' : 's'} in cart</span>
            <span>{formatMoney(currency, total)}</span>
          </span>
        </button>
      ) : null}

      {/* POS Receipt Modal */}
      {showReceipt && lastSale && settings && (
        <PosReceipt
          sale={lastSale}
          settings={settings}
          cashierName={getUser()?.name || 'Unknown'}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {/* Held Sales */}
      {heldSales.length > 0 && (
        <section className="app-panel rounded-[1.5rem] border p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Held Sales</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Saved carts waiting to be completed.</p>
          <div className="mt-4 space-y-3">
            {heldSales.map((held) => {
              const heldTotal = held.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
              return (
                <div key={held.id} className="app-panel-soft flex items-center justify-between gap-4 rounded-[1.35rem] border p-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{held.cart.length} item{held.cart.length !== 1 ? 's' : ''} &middot; {formatMoney(currency, heldTotal)}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{new Date(held.savedAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => restoreHeld(held)} className="app-btn-primary rounded-lg px-3 py-2 text-sm">Restore</button>
                    <button type="button" onClick={() => deleteHeld(held.id)} className="app-btn-danger rounded-lg px-3 py-2 text-sm">Discard</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Returns */}
      <section className="app-panel rounded-[1.5rem] border p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Process Return</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Look up a past sale by ID and refund items. Stock is restored automatically.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowReturns((v) => !v)}
            className="app-btn-secondary rounded-xl border px-4 py-2 text-sm transition"
          >
            {showReturns ? 'Hide' : 'Open'}
          </button>
        </div>
        {showReturns && (
          <div className="mt-5 space-y-4">
            {returnMessage && (
              <div className={`rounded-xl px-4 py-3 text-sm ${returnMessage.includes('processed') ? 'app-alert-success' : 'app-alert-danger'}`}>{returnMessage}</div>
            )}
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Sale ID (e.g. 42)"
                value={returnSaleId}
                onChange={(e) => setReturnSaleId(e.target.value)}
                className="app-input flex-1 rounded-lg border px-4 py-3"
              />
              <button type="button" onClick={lookupReturnSale} disabled={returnLoading} className="app-btn-primary rounded-lg px-4 py-3 transition disabled:opacity-50">
                {returnLoading && !returnLookup ? 'Looking...' : 'Lookup'}
              </button>
            </div>
            {returnLookup && (
              <div className="app-panel-soft rounded-[1.35rem] border p-4 space-y-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Sale #{returnLookup.id} &middot; {formatMoney(currency, returnLookup.total)} &middot; {new Date(returnLookup.createdAt).toLocaleDateString()}</p>
                {(returnLookup.items || []).map((item) => (
                  <div key={item.productId} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-[var(--text-primary)]">{item.Product?.name || `Product #${item.productId}`}</span>
                    <span className="text-[var(--text-muted)]">Sold: {item.quantity}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Return qty:</span>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        inputMode="numeric"
                        value={returnItems[item.productId] || 0}
                        onChange={(e) => setReturnItems((prev) => ({ ...prev, [item.productId]: Number(e.target.value) }))}
                        className="app-input w-20 rounded-lg border px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                ))}
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="app-input w-full rounded-lg border px-4 py-3 text-sm"
                />
                <button type="button" onClick={handleReturn} disabled={returnLoading} className="app-btn-primary w-full rounded-2xl px-4 py-3 text-sm transition disabled:opacity-50">
                  {returnLoading ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
