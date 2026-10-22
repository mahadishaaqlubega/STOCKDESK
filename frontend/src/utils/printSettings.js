// Receipt printing preferences, stored per device.
//
// Printing goes through the device's own print system, so StockDesk works with
// any printer the computer or phone can use: USB, Wi-Fi or Bluetooth thermal
// receipt printers, and ordinary A4 office printers. Each till can pick the
// paper it actually has.

const STORAGE_KEY = 'stockdesk_print_settings';

export const PAPER_SIZES = [
  { value: '80mm', label: '80 mm roll', hint: 'Standard thermal receipt printer' },
  { value: '58mm', label: '58 mm roll', hint: 'Small / mobile thermal printer' },
  { value: 'a4', label: 'A4 page', hint: 'Office printer, full invoice layout' },
];

const DEFAULTS = { paper: '80mm', autoPrint: false };

export function getPrintSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const paper = PAPER_SIZES.some((p) => p.value === stored.paper) ? stored.paper : DEFAULTS.paper;
    return { ...DEFAULTS, ...stored, paper };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrintSettings(next) {
  const merged = { ...getPrintSettings(), ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Private mode or storage blocked: settings apply for this session only.
  }
  return merged;
}
