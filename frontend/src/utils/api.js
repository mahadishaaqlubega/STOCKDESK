import { getToken, logout } from './auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const PRINTER_API_BASE = import.meta.env.VITE_PRINTER_API_URL || 'http://localhost:4000/api';
const PRINTER_BRIDGE_KEY = import.meta.env.VITE_PRINTER_BRIDGE_KEY || '';

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

const USE_EXTERNAL_PRINTER_BRIDGE = normalizeBaseUrl(PRINTER_API_BASE) !== normalizeBaseUrl(API_BASE);

function buildPrinterPayloadFromSale(sale, settings) {
  const items = Array.isArray(sale?.items)
    ? sale.items.map((item) => ({
        name: item?.Product?.name || item?.name || 'Item',
        price: Number(item?.price || item?.Product?.sellPrice || 0),
        quantity: Number(item?.quantity || 0),
      }))
    : [];

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    saleData: {
      id: sale.id,
      createdAt: sale.createdAt,
      receiptNumber: sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`,
      items,
      subtotal,
      discount: Number(sale.discount || 0),
      discountType: sale.discountType || 'fixed',
      total: Number(sale.total || 0),
      currency: sale.currency || settings?.currency || 'UGX',
      paymentMethod: sale.paymentMethod || 'Cash',
      cashierName: sale.cashier?.name || 'Unknown',
    },
    settings: {
      shopName: settings?.shop?.name || settings?.shopName || 'StockDesk',
      address: settings?.address || '',
      phone: settings?.phone || '',
      vat: Number(settings?.vat || 0),
      receiptFooter: settings?.receiptFooter || '',
    },
  };
}

async function request(path, options = {}) {
  const token = getToken();
  const isAuthPath = path.startsWith('/auth/');

  if (!token && !isAuthPath) {
    logout({ message: 'Session expired. Please log in again.' });
    throw new Error('Session expired. Please log in again.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    if (path === '/auth/login') {
      // Login failure — show actual error, don't logout
      throw new Error(data?.error || data?.message || 'Invalid credentials');
    }
    const sessionMessage = data?.error || data?.message || 'Session expired. Please log in again.';
    logout({ message: sessionMessage });
    throw new Error(sessionMessage);
  }

  if (response.status === 403 && data?.needsVerification) {
    const err = new Error(data.message);
    err.needsVerification = true;
    err.maskedEmail = data.email;
    throw err;
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data;
}

async function printerRequest(path, options = {}) {
  const token = getToken();

  if (!token) {
    logout({ message: 'Session expired. Please log in again.' });
    throw new Error('Session expired. Please log in again.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(PRINTER_BRIDGE_KEY ? { 'X-Printer-Bridge-Key': PRINTER_BRIDGE_KEY } : {}),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${PRINTER_API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || 'Printer request failed');
    error.status = response.status;
    error.fallback = Boolean(data?.fallback);
    error.data = data;
    throw error;
  }

  return data;
}

export const login = (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
export const signup = (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) });
export const refreshToken = () => request('/auth/refresh', { method: 'POST' });
export const verifyEmail = (body) => request('/auth/verify-email', { method: 'POST', body: JSON.stringify(body) });
export const resendVerification = (body) => request('/auth/resend-verification', { method: 'POST', body: JSON.stringify(body) });
export const forgotPassword = (body) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) });
export const resetPassword = (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) });
export const fetchUsers = () => request('/users');
export const createUser = (body) => request('/users', { method: 'POST', body: JSON.stringify(body) });
export const resetUserPassword = (id, body) => request(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(body) });
export const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' });
export const fetchProfile = () => request('/profile');
export const updateProfile = (body) => request('/profile', { method: 'PUT', body: JSON.stringify(body) });
export const changePassword = (body) => request('/profile/change-password', { method: 'POST', body: JSON.stringify(body) });
export const closeAccount = (body) => request('/profile/close-account', { method: 'POST', body: JSON.stringify(body) });
export const fetchPlatformOverview = () => request('/admin/overview');
export const fetchPlatformDashboard = (days) => request(`/admin/dashboard${days ? `?days=${days}` : ''}`);
export const fetchPlatformShops = () => request('/admin/shops');
export const fetchShopDetail = (id) => request(`/admin/shops/${id}`);
export const deleteShop = (id) => request(`/admin/shops/${id}`, { method: 'DELETE' });
export const fetchCustomers = (query = '') => request(`/customers${query}`);
export const createCustomer = (body) => request('/customers', { method: 'POST', body: JSON.stringify(body) });
export const updateCustomer = (id, body) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteCustomer = (id) => request(`/customers/${id}`, { method: 'DELETE' });
export const fetchCustomerCredit = (id) => request(`/customers/${id}/credit`);
export const recordCreditPayment = (id, body) => request(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(body) });
export const fetchCreditSummary = () => request('/credit/summary');
export const downloadReceipt = async (saleId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/sales/${saleId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Failed to download receipt');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${saleId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    alert(`Error downloading receipt: ${error.message}`);
  }
};
export const fetchProducts = (query = '') => request(`/products${query}`);
export const createProduct = (body) => request('/products', { method: 'POST', body: JSON.stringify(body) });
export const updateProduct = (id, body) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteProduct = (id) => request(`/products/${id}`, { method: 'DELETE' });
export const fetchSettings = () => request('/settings');
export const saveSettings = (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) });
export const fetchMyShop = () => request('/shops/me');
export const updateMyShop = (body) => request('/shops/me', { method: 'PUT', body: JSON.stringify(body) });
export const verifyMyShopWhatsapp = (body) => request('/shops/me/whatsapp/verify', { method: 'POST', body: JSON.stringify(body) });
export const fetchReports = () => request('/reports/daily');
export const fetchSales = () => request('/sales');
export const fetchSale = (id) => request(`/sales/${id}`);
export const createSale = (body) => request('/sales', { method: 'POST', body: JSON.stringify(body) });
export const closeBusinessDay = () => request('/sales/close-day', { method: 'POST' });
export const fetchDayClosures = () => request('/sales/day-closures');
export const createReturn = (saleId, body) => request(`/sales/${saleId}/return`, { method: 'POST', body: JSON.stringify(body) });
export const fetchReturns = () => request('/sales/returns');
export const fetchBestSelling = () => request('/reports/best-selling');
export const fetchCashierReport = () => request('/reports/by-cashier');
export const fetchDashboardSummary = () => request('/reports/summary');
export const fetchDashboardStats = () => request('/reports/dashboard-stats');
export const fetchRangeReport = (start, end) => request(`/reports/range?start=${start}&end=${end}`);
export const fetchCustomerSales = (customerId) => request(`/reports/customer/${customerId}`);
export const fetchExpenses = (start, end) => request(`/expenses${start && end ? `?start=${start}&end=${end}` : ''}`);
export const createExpense = (body) => request('/expenses', { method: 'POST', body: JSON.stringify(body) });
export const updateExpense = (id, body) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteExpense = (id) => request(`/expenses/${id}`, { method: 'DELETE' });
export const restockProduct = (id, body) => request(`/products/${id}/restock`, { method: 'POST', body: JSON.stringify(body) });
export const fetchStockHistory = (id) => request(`/products/${id}/stock-history`);
export const restockCategory = (body) => request('/products/restock-category', { method: 'POST', body: JSON.stringify(body) });
export const fetchPrinterStatus = () => printerRequest('/printer/status');
export const configurePrinter = (body) => printerRequest('/printer/configure', { method: 'POST', body: JSON.stringify(body) });
export const testPrinter = () => printerRequest('/printer/test', { method: 'POST' });
export const disconnectPrinter = () => printerRequest('/printer/disconnect', { method: 'POST' });
export const printReceiptToPrinter = async (saleId) => {
  if (!USE_EXTERNAL_PRINTER_BRIDGE) {
    return printerRequest('/printer/print-receipt', { method: 'POST', body: JSON.stringify({ saleId }) });
  }

  const [sale, settings] = await Promise.all([fetchSale(saleId), fetchSettings()]);
  const payload = buildPrinterPayloadFromSale(sale, settings);

  return printerRequest('/printer/print-receipt', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const sendWhatsappReceipt = (saleId, to) => printerRequest('/printer/send-whatsapp', { method: 'POST', body: JSON.stringify({ saleId, to }) });

// Generic api object for pages that need flexible GET/POST calls
export const api = {
  get: async (path) => { const data = await request(path); return { data }; },
  post: async (path, body) => { const data = await request(path, { method: 'POST', body: JSON.stringify(body) }); return { data }; },
};
