import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchProducts, createSale, fetchSettings, downloadReceipt, fetchSale, fetchCustomers, fetchCustomerPrices, saveCustomerPrice } from '../utils/api';
import { Link } from 'react-router-dom';
import { getUser } from '../utils/auth';
import { getPrintSettings, savePrintSettings } from '../utils/printSettings';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import PosReceipt from '../components/Receipt/PosReceipt';
import { formatMoney, formatAmount } from '../utils/format';
import { isOffline, subscribeConnectivity } from '../utils/connectivity';
import { cacheGet, cacheSet } from '../utils/offlineStore';
import {
  discardQueuedSale,
  newClientRef,
  offlineReceiptNumber,
  pendingSales,
  queueSale,
  retryQueuedSale,
  subscribeQueue,
} from '../utils/offlineSales';

// Money actually handed over at the till.
const tenderMethods = ['Cash', 'Card', 'Mobile Money'];

const isServiceProduct = (product) => product?.type === 'service';

// The catalogue price for a cart line, in the same order as the server:
// the customer's special price, then wholesale (wholesale sale and minimum
// quantity met), then the customer's loyalty %, then retail. Nothing goes
// below the product's wholesale price. A price the cashier typed is kept.
function repriceLine(item, ctx) {
  if (item.isService || item.retailPrice == null) return item;
  const retail = item.retailPrice;
  const floor = item.wholesalePrice;
  const special = ctx.specials?.get(item.productId);
  let listPrice = retail;
  let priceSource = 'retail';
  if (special != null) {
    listPrice = Math.min(retail, special);
    if (floor != null) listPrice = Math.max(listPrice, floor);
    priceSource = 'special';
  } else if (ctx.wholesale && floor != null && item.quantity >= (item.wholesaleMinQty || 1)) {
    listPrice = floor;
    priceSource = 'wholesale';
  } else if (ctx.loyalty > 0 && retail > 0) {
    const loyal = Math.max(Math.round(retail * (1 - ctx.loyalty / 100)), floor != null ? floor : Math.min(item.buyPrice || 0, retail));
    if (loyal < retail) {
      listPrice = loyal;
      priceSource = 'loyalty';
    }
  }
  const price = item.priceInput !== undefined ? item.price : listPrice;
  return listPrice === item.listPrice && price === item.price && priceSource === item.priceSource ? item : { ...item, listPrice, price, priceSource };
}

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
  const [editingPriceId, setEditingPriceId] = useState(null);
  const isAdmin = ['Admin', 'SuperAdmin'].includes(getUser()?.role);
  const shopId = getUser()?.shopId;
  const [offline, setOffline] = useState(isOffline());
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [creditDeposit, setCreditDeposit] = useState('');
  const [creditDepositMethod, setCreditDepositMethod] = useState('Cash');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [splitPayments, setSplitPayments] = useState([{ method: 'Cash', amount: '' }, { method: 'Card', amount: '' }]);
  const [wholesaleWalkIn, setWholesaleWalkIn] = useState(false);
  const [customerPrices, setCustomerPrices] = useState(() => new Map());
  const isAdminUser = getUser()?.role === 'Admin';

  useBodyScrollLock(showReceipt);

  useEffect(() => {
    loadProducts();
    loadSettings();
    loadCustomers();
    const refreshQueue = async () => setOfflineQueue(shopId ? await pendingSales(shopId) : []);
    refreshQueue();
    const offQueue = subscribeQueue(refreshQueue);
    const offConn = subscribeConnectivity(setOffline);
    // After queued sales reach the server, reload real stock levels.
    const onSynced = () => loadProducts();
    window.addEventListener('stockdesk:sales-synced', onSynced);
    return () => {
      offQueue();
      offConn();
      window.removeEventListener('stockdesk:sales-synced', onSynced);
    };
  }, []);

  // Online: fetch and keep a copy on the device. Offline: use that copy, so
  // the till keeps working with the last known catalogue.
  const loadWithCache = async (key, fetcher) => {
    const cacheKey = `${key}:${shopId}`;
    try {
      const data = await fetcher();
      cacheSet(cacheKey, data);
      return data;
    } catch (error) {
      const saved = await cacheGet(cacheKey);
      if (saved) {
        setUsingSavedData(true);
        return saved.value;
      }
      throw error;
    }
  };

  const loadSettings = async () => {
    try {
      const settingsData = await loadWithCache('settings', fetchSettings);
      setSettingsState(settingsData);
      setCurrency(settingsData.currency || 'UGX');
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setProducts(await loadWithCache('products', () => fetchProducts()));
    } catch (error) {
      setMessage(error.isNetworkError ? 'No connection, and no saved product list on this device yet. Connect once to download it.' : error.message);
    }
  };

  const loadCustomers = async () => {
    try {
      const data = await loadWithCache('customers', fetchCustomers);
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

  // Wholesale customers always get wholesale prices; admins can also switch a
  // walk-in sale to wholesale.
  const customerIsWholesale = selectedCustomer?.priceTier === 'wholesale';
  const wholesaleMode = customerIsWholesale || (isAdminUser && wholesaleWalkIn);

  const loyaltyPercent = Number(selectedCustomer?.loyaltyPercent) || 0;

  // Special prices for the chosen customer, kept on the device for offline use.
  useEffect(() => {
    let cancelled = false;
    if (!customerId) { setCustomerPrices(new Map()); return undefined; }
    const key = `customer-prices:${shopId}:${customerId}`;
    const apply = (rows) => { if (!cancelled) setCustomerPrices(new Map((rows || []).map((r) => [Number(r.productId), Number(r.price)]))); };
    fetchCustomerPrices(customerId)
      .then((res) => { apply(res.prices); cacheSet(key, res.prices); })
      .catch(async () => apply(await cacheGet(key)));
    return () => { cancelled = true; };
  }, [customerId, shopId]);

  const pricing = useMemo(() => ({ wholesale: wholesaleMode, loyalty: loyaltyPercent, specials: customerPrices }), [wholesaleMode, loyaltyPercent, customerPrices]);

  useEffect(() => {
    setCart((prev) => {
      const next = prev.map((item) => repriceLine(item, pricing));
      return next.some((item, i) => item !== prev[i]) ? next : prev;
    });
  }, [pricing]);

  const rememberPrice = async (item) => {
    try {
      await saveCustomerPrice(customerId, item.productId, Number(item.price));
      setCustomerPrices((prev) => new Map(prev).set(item.productId, Number(item.price)));
      setCart((prev) => prev.map((line) => (line.productId === item.productId ? { ...line, priceInput: undefined } : line)));
      setMessage(`${item.name} will be ${formatMoney(currency, item.price)} for ${selectedCustomer?.name} from now on.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

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
            ? repriceLine({ ...item, quantity: item.isService ? item.quantity + 1 : Math.min(item.quantity + 1, product.quantity) }, pricing)
            : item
        );
      }
      if (!isServiceProduct(product) && Number(product.quantity) <= 0) {
        setMessage(`${product.name} is out of stock.`);
        return prev;
      }
      return [...prev, repriceLine({
        productId: product.id,
        name: product.name,
        price: parseFloat(product.sellPrice),
        // Catalogue price and cost, so a typed-in price can be shown and
        // checked as a discount.
        listPrice: parseFloat(product.sellPrice) || 0,
        retailPrice: parseFloat(product.sellPrice) || 0,
        wholesalePrice: product.wholesalePrice == null ? null : parseFloat(product.wholesalePrice),
        wholesaleMinQty: product.wholesaleMinQty || null,
        buyPrice: parseFloat(product.buyPrice) || 0,
        quantity: 1,
        isService: isServiceProduct(product),
      }, pricing)];
    });
  };

  // The price actually charged: an agreed amount for services, or a
  // discounted price for goods.
  const updatePrice = (productId, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setCart((prev) => prev.map((item) => (item.productId === productId ? { ...item, price: value === '' ? '' : Number(value), priceInput: value } : item)));
  };

  const updateQuantity = (productId, amount) => {
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? repriceLine({ ...item, quantity: Math.max(0, item.quantity + amount) }, pricing) : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setWholesaleWalkIn(false);
    setDiscount(0);
    setDiscountType('fixed');
    setMobileSection('browse');
  };

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * item.quantity, 0);
  // What the cart would cost at catalogue prices; the gap is item discounts.
  const listSubtotal = cart.reduce((sum, item) => sum + Math.max(Number(item.listPrice) || 0, Number(item.price) || 0) * item.quantity, 0);
  const itemDiscounts = Math.max(0, listSubtotal - subtotal);
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




  // Records the sale on this device and prints an offline receipt; the
  // queue sends it to the server when the connection is back.
  const saveOfflineSale = async (clientRef, salePayload) => {
    if (isCredit) {
      setLoading(false);
      setMessage('Credit sales need an internet connection so the customer\'s balance can be checked. Take cash, card or mobile money, or wait for the connection.');
      return;
    }
    const user = getUser();
    const customer = customers.find((c) => String(c.id) === String(customerId));
    const localSale = {
      id: null,
      offline: true,
      createdAt: new Date().toISOString(),
      currency,
      total,
      discount: discountAmount,
      taxAmount,
      tax: vatRate,
      paymentMethod: useSplit ? 'Split' : paymentMethod,
      paymentSplits: useSplit ? splitPayments.filter((p) => parseFloat(p.amount) > 0).map((p) => ({ ...p, amount: Number(p.amount) })) : null,
      balanceDue: 0,
      creditAmount: 0,
      priceTier: wholesaleMode ? 'wholesale' : 'retail',
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
      cashier: { name: user?.name },
      receipt: { receiptNumber: offlineReceiptNumber(clientRef) },
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
        listPrice: item.listPrice,
        Product: { name: item.name, type: item.isService ? 'service' : 'goods' },
      })),
    };
    try {
      await queueSale({ clientRef, shopId, cashierId: user?.id, payload: salePayload, localSale });
    } catch (error) {
      setLoading(false);
      setMessage(`Could not save the sale on this device: ${error.message}`);
      return;
    }
    // Show the stock going down here too, and keep the saved list in step.
    const sold = new Map(cart.filter((i) => !i.isService).map((i) => [i.productId, i.quantity]));
    setProducts((prev) => {
      const next = prev.map((p) => (sold.has(p.id) ? { ...p, quantity: Number(p.quantity || 0) - sold.get(p.id) } : p));
      cacheSet(`products:${shopId}`, next);
      return next;
    });
    setLastSaleId(null);
    setLastSale(localSale);
    setPrintOnOpen(autoPrint);
    setShowReceipt(true);
    setCart([]);
    setDiscount(0);
    setDiscountType('fixed');
    setMobileSection('browse');
    setMessage('Sale recorded offline. It is saved on this device and will sync automatically.');
    setLoading(false);
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
      const underFloor = cart.find((item) => !item.isService && item.wholesalePrice != null && Number(item.price) < item.wholesalePrice - 0.005);
      if (underFloor) {
        setMessage(`${underFloor.name} can't be sold below its wholesale price of ${formatMoney(currency, underFloor.wholesalePrice)}.`);
        return;
      }
      const overpriced = cart.find((item) => !item.isService && Number(item.price) > (item.retailPrice ?? item.listPrice) + 0.005);
      if (overpriced) {
        setMessage(`${overpriced.name} can't be sold above its price of ${formatMoney(currency, overpriced.retailPrice ?? overpriced.listPrice)}.`);
        return;
      }
      const unpricedGoods = cart.find((item) => !item.isService && item.price === '');
      if (unpricedGoods) {
        setMessage(`Enter the price for ${unpricedGoods.name}.`);
        return;
      }
      if (!isAdmin) {
        const belowCost = cart.find((item) => !item.isService && Number(item.price) < item.listPrice && Number(item.price) < item.buyPrice);
        if (belowCost) {
          setMessage(`${belowCost.name} can't be sold below its cost price. Ask an admin.`);
          return;
        }
        const limit = settings?.maxDiscountPercent != null ? Number(settings.maxDiscountPercent) : null;
        const given = listSubtotal > 0 ? ((itemDiscounts + Math.min(discountAmount, subtotal)) / listSubtotal) * 100 : 0;
        if (limit != null && given > limit + 0.01) {
          setMessage(`That is a ${given.toFixed(1)}% discount; your limit is ${limit}%. Ask an admin.`);
          return;
        }
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
      // One id per checkout: if the connection drops after the server stored
      // the sale, the offline copy carries the same id and is not stored twice.
      const clientRef = newClientRef();
      const salePayload = {
        // Send the price only when it differs from the catalogue (services
        // always), so normal sales stay at the server's current price.
        items: cart.map(({ productId, quantity, price, listPrice, isService }) => ({
          productId,
          quantity,
          ...(isService || Number(price) !== listPrice ? { price: Number(price) } : {}),
        })),
        paymentMethod: useSplit ? 'Split' : paymentMethod,
        paymentSplits: useSplit ? splitPayments.filter((p) => parseFloat(p.amount) > 0) : null,
        currency: currency || 'USD',
        discount,
        discountType,
        customerId: customerId ? Number(customerId) : null,
        priceTier: wholesaleMode ? 'wholesale' : 'retail',
        ...(isCredit
          ? { amountPaid: depositValue, depositMethod: creditDepositMethod, dueDate: creditDueDate || null }
          : {}),
      };

      let response;
      try {
        if (isOffline()) throw Object.assign(new Error('offline'), { isNetworkError: true });
        response = await createSale({ ...salePayload, clientRef });
      } catch (error) {
        if (!error.isNetworkError) throw error;
        await saveOfflineSale(clientRef, salePayload);
        return;
      }

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
              placeholder="Search by name, code or category, then press Enter to add"
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
            {usingSavedData && offline ? <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">Saved list · prices and stock as of the last connection</span> : null}
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
                        {wholesaleMode && !service && product.wholesalePrice != null ? (
                          <span className="min-w-0">
                            <span className="num block text-sm font-semibold text-[var(--accent)]">{formatMoney(currency, product.wholesalePrice)}</span>
                            <span className="block truncate text-[10px] text-[var(--text-muted)]">wholesale{product.wholesaleMinQty ? ` · ${product.wholesaleMinQty}+` : ''}</span>
                          </span>
                        ) : (
                          <span className="num text-sm font-semibold text-[var(--text-primary)]">{service && !(Number(product.sellPrice) > 0) ? 'Set price' : formatMoney(currency, product.sellPrice)}</span>
                        )}
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
          className={`app-panel flex min-w-0 flex-col rounded-2xl border xl:sticky xl:top-20 xl:max-h-[calc(100dvh/var(--app-zoom,1)_-_6rem)] ${mobileSection !== 'cart' ? 'hidden xl:flex' : ''}`}
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
                    {customer.priceTier === 'wholesale' ? ' · wholesale' : ''}
                    {Number(customer.balance) > 0 ? ` (owes ${formatMoney(currency, customer.balance)})` : ''}
                  </option>
                ))}
              </select>
              {customerIsWholesale ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)]">Wholesale prices</p>
              ) : isAdminUser ? (
                <label className="mt-2 flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                  <input type="checkbox" checked={wholesaleWalkIn} onChange={(e) => setWholesaleWalkIn(e.target.checked)} />
                  Use wholesale prices for this sale
                </label>
              ) : null}
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
                      ) : editingPriceId === item.productId ? (
                        <label className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span>Sold at</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={item.priceInput ?? item.price}
                            onChange={(e) => updatePrice(item.productId, e.target.value.trim())}
                            onBlur={() => setEditingPriceId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingPriceId(null);
                              if (e.key === 'Escape') { updatePrice(item.productId, String(item.listPrice)); setEditingPriceId(null); }
                            }}
                            aria-label={`Price charged for ${item.name}`}
                            className={`app-input num w-24 rounded-md border px-2 py-0.5 text-xs ${Number(item.price) > (item.retailPrice ?? item.listPrice) || (item.wholesalePrice != null && Number(item.price) < item.wholesalePrice) || item.price === '' ? 'border-amber-500' : ''}`}
                          />
                          <span className="whitespace-nowrap">{item.wholesalePrice != null ? `${formatAmount(currency, item.wholesalePrice)} to ${formatAmount(currency, item.retailPrice)}` : `of ${formatAmount(currency, item.listPrice)}`}</span>
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingPriceId(item.productId)}
                          className="num group/price flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          title="Change the price for this sale"
                        >
                          {Number(item.price) < item.listPrice ? (
                            <>
                              <span className="line-through">{formatAmount(currency, item.listPrice)}</span>
                              <span className="whitespace-nowrap font-medium text-[var(--success)]">{formatAmount(currency, item.price)}</span>
                              <span className="rounded bg-emerald-500/10 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                −{Math.round(((item.listPrice - Number(item.price)) / item.listPrice) * 100)}%
                              </span>
                            </>
                          ) : (
                            <span>{formatMoney(currency, item.price)}</span>
                          )}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 opacity-50 group-hover/price:opacity-100" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                      )}
                      {!item.isService && item.priceSource && item.priceSource !== 'retail' ? (
                        <p className="mt-0.5 text-[10px] font-medium text-[var(--accent)]">
                          {item.priceSource === 'special' ? 'Special price' : item.priceSource === 'loyalty' ? `Loyalty ${loyaltyPercent}%` : 'Wholesale price'}
                        </p>
                      ) : null}
                      {isAdminUser && customerId && !isWalkIn && !item.isService && item.priceInput !== undefined && Number(item.price) > 0 && Number(item.price) !== customerPrices.get(item.productId) ? (
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => rememberPrice(item)} className="mt-0.5 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                          Save {formatAmount(currency, item.price)} for {selectedCustomer?.name}
                        </button>
                      ) : null}
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
              <div className="flex justify-between text-[var(--text-muted)]"><span>Subtotal</span><span className="num">{formatMoney(currency, listSubtotal)}</span></div>
              {itemDiscounts > 0 ? (
                <div className="flex justify-between text-[var(--text-muted)]"><span>Item discounts</span><span className="num">−{formatMoney(currency, itemDiscounts)}</span></div>
              ) : null}
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
              <div className={`rounded-lg px-3 py-2 text-sm ${/offline/i.test(message) && /recorded/i.test(message) ? 'app-alert-warning' : /successfully|recorded/i.test(message) ? 'app-alert-success' : 'app-alert-danger'}`} role="status">
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

      {offlineQueue.length > 0 ? (
        <section className="app-panel rounded-2xl border" aria-label="Sales saved offline">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Saved offline</h2>
            <span className="text-xs text-[var(--text-muted)]">{offline ? 'Will sync when the connection is back' : 'Syncing automatically'}</span>
          </div>
          <ul className="divide-y divide-[var(--border-default)]">
            {offlineQueue.map((entry) => (
              <li key={entry.clientRef} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="num text-sm font-medium text-[var(--text-primary)]">
                    {formatMoney(entry.localSale?.currency || currency, entry.localSale?.total)} · {entry.localSale?.receipt?.receiptNumber}
                    {entry.status === 'failed' ? <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300">Not saved</span> : <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Waiting</span>}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {new Date(entry.soldAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {(entry.localSale?.items || []).map((i) => i.Product?.name).join(', ')}
                  </p>
                  {entry.error ? <p className="text-xs text-red-600 dark:text-red-400">{entry.error}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => { setLastSale(entry.localSale); setLastSaleId(null); setShowReceipt(true); }} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">Receipt</button>
                  {entry.status === 'failed' ? (
                    <>
                      {isAdmin ? <button type="button" onClick={() => { if (window.confirm('Discard this sale? It will not be recorded.')) discardQueuedSale(entry.clientRef); }} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--danger)]">Discard</button> : null}
                      <button type="button" onClick={() => retryQueuedSale(entry).then(() => loadProducts())} disabled={offline} className="app-btn-primary rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Retry</button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
