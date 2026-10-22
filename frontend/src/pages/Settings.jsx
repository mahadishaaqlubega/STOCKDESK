import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { closeBusinessDay, fetchDayClosures, fetchSettings, saveSettings } from '../utils/api';
import { PAPER_SIZES, getPrintSettings, savePrintSettings } from '../utils/printSettings';
import { getUser } from '../utils/auth';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ConfirmDialog from '../components/ConfirmDialog';
import { buildReceiptHtml } from '../components/Receipt/PosReceipt';
import { formatMoney } from '../utils/format';
import { Alert, EmptyState, Field, Panel, PanelHeader, SkeletonRows, Toast, fieldInput } from '../components/ui';

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

// East African and commonly used currencies first.
const PINNED_CURRENCIES = ['UGX', 'KES', 'TZS', 'RWF', 'BIF', 'SSP', 'CDF', 'USD', 'EUR', 'GBP'];

const SAMPLE_SALE = {
  id: 1024,
  createdAt: new Date().toISOString(),
  total: 47000,
  discount: 0,
  tax: 0,
  taxAmount: 0,
  paymentMethod: 'Mobile Money',
  receipt: { receiptNumber: 'SD-001024' },
  items: [
    { quantity: 1, price: 40000, Product: { name: 'Screen replacement' } },
    { quantity: 2, price: 3500, Product: { name: 'Screen protector' } },
  ],
};

// Shrink an uploaded logo in the browser so it stays small enough to store
// with the shop settings and print quickly (max 320px on the longest side).
function resizeLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Choose a PNG, JPG or WebP image.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not a readable image.'));
      image.onload = () => {
        const scale = Math.min(1, 320 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        // PNG keeps transparent backgrounds; photos compress better as JPEG.
        const dataUrl = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png');
        if (dataUrl.length > 400000) {
          reject(new Error('That logo is too detailed. Try a simpler or smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function SectionNav({ sections, active, onSelect }) {
  return (
    <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col" aria-label="Settings sections">
      {sections.map((section) => (
        <button
          key={section.key}
          type="button"
          onClick={() => onSelect(section.key)}
          aria-current={active === section.key ? 'page' : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
            active === section.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--border-default)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

export default function Settings() {
  const isAdmin = getUser()?.role === 'Admin';
  const [section, setSection] = useState('shop');
  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', currency: 'UGX', vat: 0, receiptHeader: '', receiptFooter: '', shopLogoUrl: '' });
  const [dayClosures, setDayClosures] = useState([]);
  const [printPrefs, setPrintPrefs] = useState(getPrintSettings);
  const testFrameRef = useRef(null);
  const logoInputRef = useRef(null);
  const [closingDay, setClosingDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSettings();
        setSettings((prev) => ({ ...prev, ...data }));
      } catch (error) {
        flash(error.message);
      } finally {
        setLoading(false);
      }
      if (isAdmin) {
        fetchDayClosures().then(setDayClosures).catch(() => {});
      }
    })();
  }, [isAdmin]);

  const update = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await saveSettings(settings);
      setSettings((prev) => ({ ...prev, ...updated }));
      setDirty(false);
      flash('Settings saved.');
    } catch (error) {
      flash(error.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePrintPrefs = (next) => setPrintPrefs(savePrintSettings(next));

  const printTest = () => {
    const frameWindow = testFrameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    frameWindow.print();
  };

  const handleLogoFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      update('shopLogoUrl', await resizeLogo(file));
      flash('Logo ready — save changes to keep it.');
    } catch (error) {
      flash(error.message);
    }
  };

  const handleCloseBusinessDay = async () => {
    try {
      setClosingDay(true);
      const response = await closeBusinessDay();
      flash(response.message || 'Day closed.');
      setDayClosures(await fetchDayClosures());
    } catch (error) {
      flash(error.message);
    } finally {
      setClosingDay(false);
    }
  };

  const orderedCurrencies = useMemo(() => {
    const pinned = PINNED_CURRENCIES.map((code) => currencies.find((c) => c.code === code) || { code, country: code === 'SSP' ? 'South Sudan - Pound' : code }).filter(Boolean);
    return { pinned, rest: currencies.filter((c) => !PINNED_CURRENCIES.includes(c.code)) };
  }, []);

  const sampleShop = { ...settings, shop: { name: settings.shopName } };
  const previewHtml = useMemo(
    () => buildReceiptHtml({ ...SAMPLE_SALE, currency: settings.currency }, sampleShop, getUser()?.name || 'Cashier', { paper: '80mm' }),
    [settings]
  );
  const testHtml = useMemo(
    () => buildReceiptHtml({ ...SAMPLE_SALE, currency: settings.currency }, sampleShop, getUser()?.name || 'Cashier', { paper: printPrefs.paper }),
    [settings, printPrefs.paper]
  );

  const sections = [
    { key: 'shop', label: 'Shop & receipt' },
    { key: 'printer', label: 'Printing' },
    ...(isAdmin ? [{ key: 'day', label: 'Closing the day' }] : []),
    { key: 'appearance', label: 'Appearance' },
  ];

  const disabled = !isAdmin;

  return (
    <div className="space-y-5">
      {!isAdmin ? <Alert>You can view these settings. Only an admin can change them.</Alert> : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SectionNav sections={sections} active={section} onSelect={setSection} />

        <div className="min-w-0 space-y-5">
          {loading ? (
            <Panel><SkeletonRows rows={6} /></Panel>
          ) : section === 'shop' ? (
            <form onSubmit={handleSave} className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <Panel>
                  <PanelHeader title="Shop details" description="Shown on receipts and to your team." />
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <Field label="Shop name" className="sm:col-span-2">
                      <input value={settings.shopName || ''} onChange={(e) => update('shopName', e.target.value)} disabled={disabled} className={fieldInput} />
                    </Field>
                    <Field label="Phone">
                      <input type="tel" value={settings.phone || ''} onChange={(e) => update('phone', e.target.value)} disabled={disabled} className={fieldInput} placeholder="+256 7…" />
                    </Field>
                    <Field label="Currency">
                      <select value={settings.currency} onChange={(e) => update('currency', e.target.value)} disabled={disabled} className={fieldInput}>
                        <optgroup label="Common">
                          {orderedCurrencies.pinned.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.country.split(' - ')[1] || c.country}</option>)}
                        </optgroup>
                        <optgroup label="All currencies">
                          {orderedCurrencies.rest.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.country}</option>)}
                        </optgroup>
                      </select>
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                      <input value={settings.address || ''} onChange={(e) => update('address', e.target.value)} disabled={disabled} className={fieldInput} placeholder="Street, town" />
                    </Field>
                    <Field label="VAT (%)" hint="Added on top of prices at checkout. Leave 0 if you don't charge VAT.">
                      <input type="number" min="0" max="100" step="0.01" value={settings.vat ?? 0} onChange={(e) => update('vat', parseFloat(e.target.value) || 0)} disabled={disabled} className={fieldInput} />
                    </Field>
                    <div className="sm:col-span-2">
                      <p className="text-sm font-medium text-[var(--text-secondary)]">Logo</p>
                      <div className="mt-1.5 flex items-center gap-4 rounded-xl border border-dashed border-[var(--border-strong)] p-3">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-secondary)]">
                          {settings.shopLogoUrl ? (
                            <img src={settings.shopLogoUrl} alt="Shop logo" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xl font-semibold text-[var(--text-muted)]">{String(settings.shopName || 'S').slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--text-primary)]">{settings.shopLogoUrl ? 'Your logo appears on receipts.' : 'Add your logo to receipts.'}</p>
                          <p className="text-xs text-[var(--text-muted)]">PNG, JPG or WebP. A square logo on a white or transparent background works best.</p>
                        </div>
                        {isAdmin ? (
                          <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                            <button type="button" onClick={() => logoInputRef.current?.click()} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-sm font-medium">
                              {settings.shopLogoUrl ? 'Replace' : 'Upload'}
                            </button>
                            {settings.shopLogoUrl ? (
                              <button type="button" onClick={() => update('shopLogoUrl', '')} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--danger)]">Remove</button>
                            ) : null}
                          </div>
                        ) : null}
                        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoFile} />
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader title="Receipt messages" description="Printed at the top and bottom of every receipt." />
                  <div className="grid gap-4 p-5">
                    <Field label="Header note" hint="e.g. your TIN, opening hours or a promotion.">
                      <input value={settings.receiptHeader || ''} onChange={(e) => update('receiptHeader', e.target.value)} disabled={disabled} maxLength={160} className={fieldInput} placeholder="Open Mon–Sat, 8am–8pm" />
                    </Field>
                    <Field label="Footer message">
                      <input value={settings.receiptFooter || ''} onChange={(e) => update('receiptFooter', e.target.value)} disabled={disabled} maxLength={160} className={fieldInput} placeholder="Thank you for your business!" />
                    </Field>
                  </div>
                </Panel>

                {isAdmin ? (
                  <div className="flex items-center justify-end gap-3">
                    {dirty ? <span className="text-sm text-[var(--text-muted)]">Unsaved changes</span> : null}
                    <button type="submit" disabled={saving || !dirty} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
                  </div>
                ) : null}
              </div>

              <div className="xl:sticky xl:top-20">
                <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Receipt preview</p>
                <div className="rounded-xl bg-[var(--surface-secondary)] p-4">
                  <div className="mx-auto max-w-[290px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.25)]">
                    <iframe title="Receipt preview" srcDoc={previewHtml} className="block h-[520px] w-full border-0" />
                  </div>
                </div>
              </div>
            </form>
          ) : section === 'printer' ? (
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <Panel>
                  <PanelHeader title="Printing on this device" description="Receipts print through this computer or phone, so any printer it can use works — USB, Wi-Fi or Bluetooth receipt printers and normal A4 printers." />
                  <div className="space-y-5 p-5">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-secondary)]">Paper</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Paper size">
                        {PAPER_SIZES.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={printPrefs.paper === option.value}
                            onClick={() => updatePrintPrefs({ paper: option.value })}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${printPrefs.paper === option.value ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'}`}
                          >
                            <span className={`flex h-11 shrink-0 items-start justify-center rounded border border-[var(--border-strong)] bg-white pt-1 ${option.value === 'a4' ? 'w-9' : option.value === '58mm' ? 'w-4' : 'w-6'}`}>
                              <span className="block h-0.5 w-2/3 rounded bg-slate-300" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[var(--text-primary)]">{option.label}</span>
                              <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] px-4 py-3">
                      <input type="checkbox" className="mt-0.5" checked={printPrefs.autoPrint} onChange={(e) => updatePrintPrefs({ autoPrint: e.target.checked })} />
                      <span>
                        <span className="block text-sm font-medium text-[var(--text-primary)]">Print automatically after each sale</span>
                        <span className="block text-xs text-[var(--text-muted)]">The print dialog opens as soon as a sale is completed. In Chrome you can make it print silently with the <span className="font-mono">--kiosk-printing</span> shortcut option.</span>
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-default)] pt-4">
                      <button type="button" onClick={printTest} className="app-btn-primary rounded-lg px-4 py-2 text-sm">Print test receipt</button>
                      <span className="text-xs text-[var(--text-muted)]">Choose your printer in the dialog that opens.</span>
                    </div>
                  </div>
                </Panel>
                <Panel>
                  <PanelHeader title="Thermal printer tips" />
                  <ul className="list-disc space-y-1.5 px-9 py-4 text-sm text-[var(--text-secondary)]">
                    <li>Install the printer's driver on this computer first, then pick it in the print dialog.</li>
                    <li>In the print dialog set <strong>Margins: None</strong> and paper to match your roll (80 mm or 58 mm).</li>
                    <li>Turn off <strong>Headers and footers</strong> so the date and web address don't print.</li>
                    <li>Phones: pair a Bluetooth receipt printer and use a printing app such as RawBT, then share to it.</li>
                    <li>Each till remembers its own paper size, so a counter printer and an office A4 printer can both be used.</li>
                  </ul>
                </Panel>
              </div>
              <div className="xl:sticky xl:top-20">
                <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Test receipt · {PAPER_SIZES.find((p) => p.value === printPrefs.paper)?.label}</p>
                <div className="rounded-xl bg-[var(--surface-secondary)] p-4">
                  <div className={`mx-auto bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.25)] ${printPrefs.paper === 'a4' ? 'max-w-full' : printPrefs.paper === '58mm' ? 'max-w-[220px]' : 'max-w-[290px]'}`}>
                    <iframe ref={testFrameRef} key={printPrefs.paper} title="Test receipt" srcDoc={testHtml} className="block h-[520px] w-full border-0" />
                  </div>
                </div>
              </div>
            </div>
          ) : section === 'day' ? (
            <Panel>
              <PanelHeader
                title="Closing the day"
                description="Saves the day's totals as a snapshot. Sales are never deleted. Days you forget are closed automatically overnight."
                actions={<button type="button" onClick={() => setConfirmClose(true)} disabled={closingDay} className="app-btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">{closingDay ? 'Closing…' : 'Close today'}</button>}
              />
              {dayClosures.length === 0 ? (
                <EmptyState title="No closed days yet" message="Your daily summaries will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-cards min-w-full text-left text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Day</th>
                        <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                        <th className="px-4 py-2.5 text-right font-medium">Items</th>
                        <th className="px-4 py-2.5 text-right font-medium">Net sales</th>
                        <th className="px-4 py-2.5 text-right font-medium">Gross profit</th>
                        <th className="px-4 py-2.5 font-medium">Closed by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {dayClosures.map((closure) => (
                        <tr key={closure.id} className="app-row-hover">
                          <td data-label="Day" className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{new Date(`${closure.closedForDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                          <td data-label="Orders" className="num px-4 py-2.5 text-right">{Number(closure.orderCount || 0)}</td>
                          <td data-label="Items" className="num px-4 py-2.5 text-right">{Number(closure.itemsSold || 0)}</td>
                          <td data-label="Net sales" className="num px-4 py-2.5 text-right font-medium">{formatMoney(settings.currency, closure.netSales)}</td>
                          <td data-label="Gross profit" className="num px-4 py-2.5 text-right">{formatMoney(settings.currency, closure.grossProfit)}</td>
                          <td data-label="Closed by" className="px-4 py-2.5 text-[var(--text-muted)]">{closure.closedBy?.name || 'Automatic'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          ) : (
            <Panel>
              <PanelHeader title="Appearance" description="Saved on this device only." />
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Theme</p>
                  <p className="text-sm text-[var(--text-muted)]">Light, dark, or follow your device.</p>
                </div>
                <ThemeToggleButton />
              </div>
              {isAdmin ? (
                <div className="flex items-center justify-between border-t border-[var(--border-default)] px-5 py-4 text-sm">
                  <span className="text-[var(--text-muted)]">Looking for team accounts and password resets?</span>
                  <Link to="/app/users" className="font-medium text-[var(--accent)] hover:underline">Go to Team</Link>
                </div>
              ) : null}
            </Panel>
          )}
        </div>
      </div>

      {confirmClose ? (
        <ConfirmDialog
          title="Close today?"
          message="Save today's totals as a snapshot now? Sales stay available and you can keep selling."
          confirmLabel="Close today"
          onConfirm={() => {
            setConfirmClose(false);
            handleCloseBusinessDay();
          }}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
