import { useEffect, useState } from 'react';
import { closeBusinessDay, configurePrinter, disconnectPrinter, fetchDayClosures, fetchPrinterStatus, fetchSettings, fetchUsers, resetUserPassword, saveSettings, testPrinter } from '../utils/api';
import { getUser } from '../utils/auth';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ConfirmDialog from '../components/ConfirmDialog';

const currencies = [
  { code: 'AED', country: 'United Arab Emirates - Dirham' },
  { code: 'AFN', country: 'Afghanistan - Afghani' },
  { code: 'ALL', country: 'Albania - Lek' },
  { code: 'AMD', country: 'Armenia - Dram' },
  { code: 'ANG', country: 'Netherlands Antilles - Guilder' },
  { code: 'AOA', country: 'Angola - Kwanza' },
  { code: 'ARS', country: 'Argentina - Peso' },
  { code: 'AUD', country: 'Australia - Dollar' },
  { code: 'AWG', country: 'Aruba - Guilder' },
  { code: 'AZN', country: 'Azerbaijan - Manat' },
  { code: 'BAM', country: 'Bosnia - Mark' },
  { code: 'BBD', country: 'Barbados - Dollar' },
  { code: 'BDT', country: 'Bangladesh - Taka' },
  { code: 'BGN', country: 'Bulgaria - Lev' },
  { code: 'BHD', country: 'Bahrain - Dinar' },
  { code: 'BIF', country: 'Burundi - Franc' },
  { code: 'BMD', country: 'Bermuda - Dollar' },
  { code: 'BND', country: 'Brunei - Dollar' },
  { code: 'BOB', country: 'Bolivia - Boliviano' },
  { code: 'BRL', country: 'Brazil - Real' },
  { code: 'BSD', country: 'Bahamas - Dollar' },
  { code: 'BTC', country: 'Bitcoin' },
  { code: 'BTN', country: 'Bhutan - Ngultrum' },
  { code: 'BWP', country: 'Botswana - Pula' },
  { code: 'BYR', country: 'Belarus - Ruble' },
  { code: 'BZD', country: 'Belize - Dollar' },
  { code: 'CAD', country: 'Canada - Dollar' },
  { code: 'CDF', country: 'Congo - Franc' },
  { code: 'CHF', country: 'Switzerland - Franc' },
  { code: 'CLF', country: 'Chile - Unit of Account' },
  { code: 'CLP', country: 'Chile - Peso' },
  { code: 'CNY', country: 'China - Yuan' },
  { code: 'COP', country: 'Colombia - Peso' },
  { code: 'CRC', country: 'Costa Rica - Colon' },
  { code: 'CUC', country: 'Cuba - Peso' },
  { code: 'CUP', country: 'Cuba - Peso' },
  { code: 'CVE', country: 'Cape Verde - Escudo' },
  { code: 'CZK', country: 'Czechia - Koruna' },
  { code: 'DJF', country: 'Djibouti - Franc' },
  { code: 'DKK', country: 'Denmark - Krone' },
  { code: 'DOP', country: 'Dominican Republic - Peso' },
  { code: 'DZD', country: 'Algeria - Dinar' },
  { code: 'EGP', country: 'Egypt - Pound' },
  { code: 'ERN', country: 'Eritrea - Nakfa' },
  { code: 'ETB', country: 'Ethiopia - Birr' },
  { code: 'EUR', country: 'Eurozone - Euro' },
  { code: 'FJD', country: 'Fiji - Dollar' },
  { code: 'FKP', country: 'Falkland Islands - Pound' },
  { code: 'GBP', country: 'United Kingdom - Pound' },
  { code: 'GEL', country: 'Georgia - Lari' },
  { code: 'GGP', country: 'Guernsey - Pound' },
  { code: 'GHS', country: 'Ghana - Cedi' },
  { code: 'GIP', country: 'Gibraltar - Pound' },
  { code: 'GMD', country: 'Gambia - Dalasi' },
  { code: 'GNF', country: 'Guinea - Franc' },
  { code: 'GTQ', country: 'Guatemala - Quetzal' },
  { code: 'GYD', country: 'Guyana - Dollar' },
  { code: 'HKD', country: 'Hong Kong - Dollar' },
  { code: 'HNL', country: 'Honduras - Lempira' },
  { code: 'HRK', country: 'Croatia - Kuna' },
  { code: 'HTG', country: 'Haiti - Gourde' },
  { code: 'HUF', country: 'Hungary - Forint' },
  { code: 'IDR', country: 'Indonesia - Rupiah' },
  { code: 'ILS', country: 'Israel - Shekel' },
  { code: 'IMP', country: 'Isle of Man - Pound' },
  { code: 'INR', country: 'India - Rupee' },
  { code: 'IQD', country: 'Iraq - Dinar' },
  { code: 'IRR', country: 'Iran - Rial' },
  { code: 'ISK', country: 'Iceland - Krona' },
  { code: 'JEP', country: 'Jersey - Pound' },
  { code: 'JMD', country: 'Jamaica - Dollar' },
  { code: 'JOD', country: 'Jordan - Dinar' },
  { code: 'JPY', country: 'Japan - Yen' },
  { code: 'KES', country: 'Kenya - Shilling' },
  { code: 'KGS', country: 'Kyrgyzstan - Som' },
  { code: 'KHR', country: 'Cambodia - Riel' },
  { code: 'KMF', country: 'Comoros - Franc' },
  { code: 'KPW', country: 'North Korea - Won' },
  { code: 'KRW', country: 'South Korea - Won' },
  { code: 'KWD', country: 'Kuwait - Dinar' },
  { code: 'KYD', country: 'Cayman Islands - Dollar' },
  { code: 'KZT', country: 'Kazakhstan - Tenge' },
  { code: 'LAK', country: 'Laos - Kip' },
  { code: 'LBP', country: 'Lebanon - Pound' },
  { code: 'LKR', country: 'Sri Lanka - Rupee' },
  { code: 'LRD', country: 'Liberia - Dollar' },
  { code: 'LSL', country: 'Lesotho - Loti' },
  { code: 'LYD', country: 'Libya - Dinar' },
  { code: 'MAD', country: 'Morocco - Dirham' },
  { code: 'MDL', country: 'Moldova - Leu' },
  { code: 'MGA', country: 'Madagascar - Ariary' },
  { code: 'MKD', country: 'North Macedonia - Denar' },
  { code: 'MMK', country: 'Myanmar - Kyat' },
  { code: 'MNT', country: 'Mongolia - Tugrik' },
  { code: 'MOP', country: 'Macau - Pataca' },
  { code: 'MRU', country: 'Mauritania - Ouguiya' },
  { code: 'MUR', country: 'Mauritius - Rupee' },
  { code: 'MVR', country: 'Maldives - Rufiyaa' },
  { code: 'MWK', country: 'Malawi - Kwacha' },
  { code: 'MXN', country: 'Mexico - Peso' },
  { code: 'MYR', country: 'Malaysia - Ringgit' },
  { code: 'MZN', country: 'Mozambique - Metical' },
  { code: 'NAD', country: 'Namibia - Dollar' },
  { code: 'NGN', country: 'Nigeria - Naira' },
  { code: 'NIO', country: 'Nicaragua - Cordoba' },
  { code: 'NOK', country: 'Norway - Krone' },
  { code: 'NPR', country: 'Nepal - Rupee' },
  { code: 'NZD', country: 'New Zealand - Dollar' },
  { code: 'OMR', country: 'Oman - Rial' },
  { code: 'PAB', country: 'Panama - Balboa' },
  { code: 'PEN', country: 'Peru - Sol' },
  { code: 'PGK', country: 'Papua New Guinea - Kina' },
  { code: 'PHP', country: 'Philippines - Peso' },
  { code: 'PKR', country: 'Pakistan - Rupee' },
  { code: 'PLN', country: 'Poland - Zloty' },
  { code: 'PYG', country: 'Paraguay - Guarani' },
  { code: 'QAR', country: 'Qatar - Riyal' },
  { code: 'RON', country: 'Romania - Lei' },
  { code: 'RSD', country: 'Serbia - Dinar' },
  { code: 'RUB', country: 'Russia - Ruble' },
  { code: 'RWF', country: 'Rwanda - Franc' },
  { code: 'SAR', country: 'Saudi Arabia - Riyal' },
  { code: 'SBD', country: 'Solomon Islands - Dollar' },
  { code: 'SCR', country: 'Seychelles - Rupee' },
  { code: 'SDG', country: 'Sudan - Pound' },
  { code: 'SEK', country: 'Sweden - Krona' },
  { code: 'SGD', country: 'Singapore - Dollar' },
  { code: 'SHP', country: 'Saint Helena - Pound' },
  { code: 'SLL', country: 'Sierra Leone - Leone' },
  { code: 'SOS', country: 'Somalia - Shilling' },
  { code: 'SRD', country: 'Suriname - Dollar' },
  { code: 'STN', country: 'São Tomé and Príncipe - Dobra' },
  { code: 'SYP', country: 'Syria - Pound' },
  { code: 'SZL', country: 'Eswatini - Lilangeni' },
  { code: 'THB', country: 'Thailand - Baht' },
  { code: 'TJS', country: 'Tajikistan - Somoni' },
  { code: 'TMT', country: 'Turkmenistan - Manat' },
  { code: 'TND', country: 'Tunisia - Dinar' },
  { code: 'TOP', country: 'Tonga - Paanga' },
  { code: 'TRY', country: 'Turkey - Lira' },
  { code: 'TTD', country: 'Trinidad and Tobago - Dollar' },
  { code: 'TWD', country: 'Taiwan - Dollar' },
  { code: 'TZS', country: 'Tanzania - Shilling' },
  { code: 'UAH', country: 'Ukraine - Hryvnia' },
  { code: 'UGX', country: 'Uganda - Shilling' },
  { code: 'USD', country: 'United States - Dollar' },
  { code: 'UYU', country: 'Uruguay - Peso' },
  { code: 'UZS', country: 'Uzbekistan - Som' },
  { code: 'VEF', country: 'Venezuela - Bolivar' },
  { code: 'VND', country: 'Vietnam - Dong' },
  { code: 'VUV', country: 'Vanuatu - Vatu' },
  { code: 'WST', country: 'Samoa - Tala' },
  { code: 'XAF', country: 'CEMAC - Franc' },
  { code: 'XCD', country: 'Eastern Caribbean - Dollar' },
  { code: 'XOF', country: 'WAEMU - Franc' },
  { code: 'XPF', country: 'CFP - Franc' },
  { code: 'YER', country: 'Yemen - Rial' },
  { code: 'ZAR', country: 'South Africa - Rand' },
  { code: 'ZMW', country: 'Zambia - Kwacha' },
  { code: 'ZWL', country: 'Zimbabwe - Dollar' },
];

function SectionCard({ title, subtitle, children, danger = false }) {
  return (
    <section className={`app-panel rounded-2xl border p-5 sm:p-6 ${danger ? 'border-[var(--danger-border)]' : ''}`}>
      <div className={`border-b pb-4 ${danger ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'}`}>
        <h3 className={`text-lg font-semibold ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{title}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function statusClasses(message) {
  if (!message) return 'app-alert-info';

  const lowered = message.toLowerCase();
  if (lowered.includes('success') || lowered.includes('saved') || lowered.includes('configured') || lowered.includes('sent')) {
    return 'app-alert-success';
  }
  if (lowered.includes('error') || lowered.includes('failed')) {
    return 'app-alert-danger';
  }

  return 'app-alert-info';
}

export default function Settings() {
  const isAdmin = getUser()?.role === 'Admin';
  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', currency: 'USD' });
  const [teamUsers, setTeamUsers] = useState([]);
  const [dayClosures, setDayClosures] = useState([]);
  const [printerSettings, setPrinterSettings] = useState({ type: 'usb', vendorId: '0x04b8', productId: '0x0202', ip: '192.168.1.100', port: '9100', autoPrint: false });
  const [status, setStatus] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');
  const [passwordReset, setPasswordReset] = useState({ userId: null, password: '', confirmPassword: '' });
  const [revealedCredentials, setRevealedCredentials] = useState(null);
  const [printerStatus, setPrinterStatus] = useState('Not connected');
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const data = await fetchSettings();
        setSettings(data);
      } finally {
        setLoading(false);
      }
      // Load admin-only data in background — don't block the UI
      if (isAdmin) {
        Promise.all([fetchDayClosures(), fetchUsers()])
          .then(([closures, users]) => {
            setDayClosures(closures);
            setTeamUsers(users);
          })
          .catch(() => {});
        checkPrinterStatus();
      }
    }
    loadSettings();
  }, [isAdmin]);

  const loadDayClosures = async () => {
    if (!isAdmin) {
      return;
    }

    const closures = await fetchDayClosures();
    setDayClosures(closures);
  };

  const loadUsers = async () => {
    if (!isAdmin) {
      return;
    }

    const users = await fetchUsers();
    setTeamUsers(users);
  };

  const checkPrinterStatus = async () => {
    try {
      const data = await fetchPrinterStatus();
      setPrinterStatus(data.connected ? `Connected (${data.type || 'not connected'})` : 'Not connected');
    } catch (error) {
      setPrinterStatus(error.status === 401 ? 'Authentication failed. Please refresh and login again.' : 'Not connected');
    }
  };

  const handlePrinterConfigure = async () => {
    try {
      await configurePrinter(printerSettings);
      setPrinterStatus('Printer configured successfully!');
      setTimeout(() => checkPrinterStatus(), 500);
    } catch (error) {
      setPrinterStatus(error.status === 401 ? 'Authentication failed. Please refresh and login again.' : `Error: ${error.message}`);
    }
  };

  const handleTestPrint = async () => {
    try {
      setTestingPrinter(true);
      await testPrinter();
      setPrinterStatus('Test print sent!');
    } catch (error) {
      setPrinterStatus(error.status === 401 ? 'Authentication failed. Please refresh and login again.' : `Test failed: ${error.message}`);
    } finally {
      setTestingPrinter(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectPrinter();
      setPrinterStatus('Printer disconnected');
    } catch (error) {
      setPrinterStatus(error.status === 401 ? 'Authentication failed. Please refresh and login again.' : `Disconnect failed: ${error.message}`);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const updated = await saveSettings(settings);
      setSettings(updated);
      setStatus('Settings saved successfully.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleCloseBusinessDay = async () => {
    try {
      setClosingDay(true);
      const response = await closeBusinessDay();
      setStatus(response.message);
      await loadDayClosures();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setClosingDay(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    try {
      const response = await resetUserPassword(passwordReset.userId, {
        password: passwordReset.password,
        confirmPassword: passwordReset.confirmPassword,
      });
      setCredentialStatus(response.message || 'Password reset successfully.');
      setRevealedCredentials({ username: response.username, password: response.plainPassword });
      setPasswordReset({ userId: null, password: '', confirmPassword: '' });
      await loadUsers();
    } catch (error) {
      setCredentialStatus(error.message);
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin ? (
        <div className="app-alert-info rounded-xl border border-[var(--border-default)] px-4 py-3 text-sm">
          You have read-only access to this page.
        </div>
      ) : null}
      {status ? <div className={`rounded-xl px-4 py-3 text-sm ${statusClasses(status)}`}>{status}</div> : null}

      {loading ? (
        <div className="grid gap-6">
          {Array.from({ length: isAdmin ? 3 : 1 }).map((_, index) => (
            <div key={index} className="app-panel-soft h-72 animate-pulse rounded-lg border" />
          ))}
        </div>
      ) : (
        <>
          <SectionCard title="Appearance" subtitle="Choose how StockDesk looks across this device.">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Theme mode</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Switch between light, dark, or system-based appearance preferences.</p>
              </div>
              <ThemeToggleButton stretch className="w-full lg:w-auto lg:min-w-[20rem]" />
            </div>
          </SectionCard>

          {isAdmin ? (
            <SectionCard title="Team Access" subtitle="List shop users and reset passwords when someone loses access.">
              {credentialStatus ? <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${statusClasses(credentialStatus)}`}>{credentialStatus}</div> : null}

              {revealedCredentials ? (
                <div className="app-alert-warning mb-4 rounded-2xl px-4 py-4 text-sm">
                  <p className="font-semibold text-[var(--text-primary)]">Save these updated credentials now.</p>
                  <p className="mt-2">Username: <span className="font-mono">{revealedCredentials.username}</span></p>
                  <p className="mt-1">Password: <span className="font-mono">{revealedCredentials.password}</span></p>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)]">
                <table className="table-cards min-w-full text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)] bg-[var(--surface-primary)]">
                    {teamUsers.map((user) => (
                      <tr key={user.id} className="app-row-hover transition">
                        <td data-label="Username" className="px-4 py-3 font-medium text-[var(--text-primary)]">{user.username}</td>
                        <td data-label="Role" className="px-4 py-3 text-[var(--text-muted)]">{user.displayRole || user.role}</td>
                        <td data-label="Created" className="px-4 py-3 text-[var(--text-muted)]">{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td data-label="Action" className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordReset({ userId: user.id, password: '', confirmPassword: '' });
                              setCredentialStatus('');
                            }}
                            className="app-btn-secondary rounded-xl px-3 py-2 text-sm transition"
                          >
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {passwordReset.userId ? (
                <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleResetPassword}>
                  <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                    New password
                    <input
                      type="password"
                      value={passwordReset.password}
                      onChange={(event) => setPasswordReset((prev) => ({ ...prev, password: event.target.value }))}
                      className="app-input w-full rounded-lg border px-4 py-3"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                    Confirm password
                    <input
                      type="password"
                      value={passwordReset.confirmPassword}
                      onChange={(event) => setPasswordReset((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                      className="app-input w-full rounded-lg border px-4 py-3"
                    />
                  </label>
                  <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                    <button type="submit" className="app-btn-primary rounded-2xl px-4 py-3 text-white transition">Save New Password</button>
                    <button
                      type="button"
                      onClick={() => setPasswordReset({ userId: null, password: '', confirmPassword: '' })}
                      className="app-btn-subtle rounded-2xl px-4 py-3 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard title="Shop Details" subtitle="Keep your store information and receipt branding accurate.">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Shop name
                <input
                  value={settings.shopName}
                  onChange={(e) => setSettings((prev) => ({ ...prev, shopName: e.target.value }))}
                  disabled={!isAdmin}
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Phone number
                <input
                  value={settings.phone}
                  onChange={(e) => setSettings((prev) => ({ ...prev, phone: e.target.value }))}
                  disabled={!isAdmin}
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                />
              </label>
              <label className="md:col-span-2 space-y-2 text-sm text-[var(--text-secondary)]">
                Address
                <textarea
                  value={settings.address}
                  onChange={(e) => setSettings((prev) => ({ ...prev, address: e.target.value }))}
                  disabled={!isAdmin}
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                  rows="4"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Currency
                <select
                  value={settings.currency}
                  onChange={(e) => setSettings((prev) => ({ ...prev, currency: e.target.value }))}
                  disabled={!isAdmin}
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                >
                  {currencies.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} - {curr.country}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                VAT Percentage (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.vat || 0}
                  onChange={(e) => setSettings((prev) => ({ ...prev, vat: parseFloat(e.target.value) || 0 }))}
                  disabled={!isAdmin}
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Shop Logo URL
                <input
                  value={settings.shopLogoUrl || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, shopLogoUrl: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder="https://example.com/logo.png"
                  className="app-input w-full rounded-lg border px-4 py-3 disabled:cursor-not-allowed"
                />
              </label>
              {isAdmin ? (
                <div className="md:col-span-2 pt-2">
                  <button className="app-btn-primary rounded-lg px-5 py-3 text-sm font-medium transition">Save Settings</button>
                </div>
              ) : null}
            </form>
          </SectionCard>

          {isAdmin ? (
            <SectionCard title="Thermal Printer Setup" subtitle="Connect a local USB or network printer for direct receipt printing.">
              <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${statusClasses(printerStatus)}`}>
                <span className="font-medium">Printer status:</span> {printerStatus}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                  Printer Type
                  <select
                    value={printerSettings.type}
                    onChange={(e) => setPrinterSettings((prev) => ({ ...prev, type: e.target.value }))}
                    className="app-input w-full rounded-lg border px-4 py-3"
                  >
                    <option value="usb">USB Printer</option>
                    <option value="network">Network Printer (IP)</option>
                  </select>
                </label>

                {printerSettings.type === 'usb' ? (
                  <>
                    <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                      Vendor ID (hex)
                      <input
                        value={printerSettings.vendorId}
                        onChange={(e) => setPrinterSettings((prev) => ({ ...prev, vendorId: e.target.value }))}
                        placeholder="0x04b8"
                        className="app-input w-full rounded-lg border px-4 py-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                      Product ID (hex)
                      <input
                        value={printerSettings.productId}
                        onChange={(e) => setPrinterSettings((prev) => ({ ...prev, productId: e.target.value }))}
                        placeholder="0x0202"
                        className="app-input w-full rounded-lg border px-4 py-3"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                      IP Address
                      <input
                        value={printerSettings.ip}
                        onChange={(e) => setPrinterSettings((prev) => ({ ...prev, ip: e.target.value }))}
                        placeholder="192.168.1.100"
                        className="app-input w-full rounded-lg border px-4 py-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                      Port
                      <input
                        value={printerSettings.port}
                        onChange={(e) => setPrinterSettings((prev) => ({ ...prev, port: e.target.value }))}
                        placeholder="9100"
                        className="app-input w-full rounded-lg border px-4 py-3"
                      />
                    </label>
                  </>
                )}

                <label className="app-panel-soft md:col-span-2 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={printerSettings.autoPrint}
                    onChange={(e) => setPrinterSettings((prev) => ({ ...prev, autoPrint: e.target.checked }))}
                    className="rounded"
                  />
                  <span>Auto-print receipts after a sale</span>
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={handlePrinterConfigure} className="app-btn-primary rounded-lg px-5 py-3 text-sm font-medium transition">
                  Connect Printer
                </button>
                <button
                  type="button"
                  onClick={handleTestPrint}
                  disabled={testingPrinter}
                  className="app-btn-secondary rounded-lg border px-5 py-3 text-sm font-medium transition disabled:opacity-60"
                >
                  {testingPrinter ? 'Testing...' : 'Test Print'}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="app-btn-subtle rounded-lg px-5 py-3 text-sm font-medium transition"
                >
                  Disconnect
                </button>
              </div>
            </SectionCard>
          ) : null}

          {isAdmin ? (
            <SectionCard
              title="Business Day Close"
              subtitle="Save a daily snapshot of performance while keeping all sales history available."
              danger
            >
              <div className="app-alert-danger rounded-2xl p-4 text-sm">
                Closing the day stores totals for net sales, gross sales, gross profit, discounts, orders, and items sold. No raw sales records are deleted.
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--danger-border)] bg-[var(--surface-primary)] p-4">
                <div>
                  <p className="text-base font-semibold text-[var(--danger)]">Close current business day</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">Use this at the end of the day to lock in a clean historical snapshot.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  disabled={closingDay}
                  className="app-btn-danger-solid rounded-lg px-5 py-3 text-sm font-medium transition disabled:opacity-60"
                >
                  {closingDay ? 'Closing Day...' : 'Close Business Day'}
                </button>
              </div>

              <div className="mt-6">
                <h4 className="text-base font-semibold text-[var(--text-primary)]">Recent Day Closures</h4>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Review the latest saved daily summaries.</p>

                {dayClosures.length === 0 ? (
                  <div className="app-panel-soft mt-4 rounded-lg border border-dashed px-4 py-8 text-center">
                    <p className="text-sm font-medium text-[var(--text-primary)]">No day closures yet</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">Your saved day summaries will appear here after the first close.</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {dayClosures.map((closure) => (
                      <div key={closure.id} className="app-panel rounded-2xl border p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">{closure.closedForDate}</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Closed by {closure.closedBy?.name || 'Unknown'} on {new Date(closure.createdAt).toLocaleString()}</p>
                          </div>
                          <div className="grid gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-3 lg:text-right">
                            <span>Net sales: {settings.currency} {Number(closure.netSales || 0).toFixed(2)}</span>
                            <span>Gross profit: {settings.currency} {Number(closure.grossProfit || 0).toFixed(2)}</span>
                            <span>Items sold: {Number(closure.itemsSold || 0)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}

      {confirmClose ? (
        <ConfirmDialog
          title="Close business day?"
          message="Close the current business day and save today's totals as a snapshot? Sales history will remain available."
          confirmLabel="Close Day"
          onConfirm={() => {
            setConfirmClose(false);
            handleCloseBusinessDay();
          }}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}
    </div>
  );
}
