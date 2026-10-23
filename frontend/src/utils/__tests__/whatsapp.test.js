import { describe, expect, it } from 'vitest';
import { countryCodeFor, toWhatsAppNumber, reminderMessage, receiptMessage } from '../whatsapp';

describe('toWhatsAppNumber', () => {
  it('turns a local Ugandan number into international form', () => {
    expect(toWhatsAppNumber('0772 123 456', '256')).toBe('256772123456');
  });
  it('keeps numbers already written with +', () => {
    expect(toWhatsAppNumber('+254 712 345678', '256')).toBe('254712345678');
  });
  it('handles 00 prefixes and bare subscriber numbers', () => {
    expect(toWhatsAppNumber('00256772123456')).toBe('256772123456');
    expect(toWhatsAppNumber('772123456', '256')).toBe('256772123456');
  });
  it('rejects things that are not phone numbers', () => {
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('12')).toBeNull();
  });
});

describe('countryCodeFor', () => {
  it('uses the shop phone, then the currency', () => {
    expect(countryCodeFor({ phone: '+254700000000', currency: 'KES' })).toBe('254');
    expect(countryCodeFor({ phone: '0755 817074', currency: 'UGX' })).toBe('256');
    expect(countryCodeFor({ currency: 'TZS' })).toBe('255');
  });
});

describe('messages', () => {
  const settings = { shopName: 'GSM Tools', currency: 'UGX', phone: '+256755817074' };
  it('reminder names the balance and overdue receipts', () => {
    const text = reminderMessage({ name: 'Grace Namukasa' }, 70000, settings, [
      { id: 1, balanceDue: 70000, createdAt: '2026-01-02T10:00:00Z', dueDate: '2026-01-31', receipt: { receiptNumber: 'SD-000476' } },
    ]);
    expect(text).toMatch(/^Hello Grace,/);
    expect(text).toMatch(/UGX 70,000/);
    expect(text).toMatch(/overdue/);
    expect(text).toMatch(/SD-000476/);
  });
  it('receipt lists items, total and link', () => {
    const text = receiptMessage(
      { id: 5, total: 20000, balanceDue: 0, paymentMethod: 'Cash', createdAt: '2026-10-22T10:00:00Z', items: [{ quantity: 2, price: 10000, Product: { name: 'Charger' } }] },
      settings,
      'https://x/api/public/receipts/abc'
    );
    expect(text).toMatch(/2 × Charger: UGX 20,000/);
    expect(text).toMatch(/Total: \*UGX 20,000\*/);
    expect(text).toMatch(/https:\/\/x\/api\/public\/receipts\/abc/);
  });
});
