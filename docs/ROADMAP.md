# Roadmap

Last updated 23 Oct 2026. Start the next session from **Next up**.

## Done (branch `consolidate-backend`, not yet deployed)

See [RELEASE-NOTES.md](RELEASE-NOTES.md): credit sales, services, discounts,
offline selling, receipt redesign, WhatsApp receipts and reminders,
suppliers and purchases, Excel import/export, security hardening, local
time zone, scale fixes, full redesign.

## Next up

1. **Go live** with this branch (checklist in RELEASE-NOTES.md).
2. **Landing page** for stockdeskinventory.com: what StockDesk does,
   screenshots, pricing, "Start free trial", WhatsApp contact.
3. **Free trial and subscriptions** (platform owner console):
   - every new shop gets 1 month free;
   - plans and prices; payment requests after the trial (Mobile Money);
   - what happens when a shop doesn't pay (reminders → read-only mode,
     never deleting data);
   - owner console: trial/paid status per shop, extend trial, mark paid.
   Needs decisions: prices, plan limits, payment provider (e.g. MTN MoMo /
   Airtel Money API or a gateway such as Flutterwave / Pesapal).

## Later

- **VAT / URA EFRIS** fiscal receipts (parked by the owner; required for
  VAT-registered shops in Uganda).
- **Automatic WhatsApp** (no button press, bulk reminders) via the Meta
  WhatsApp Business API — paid per conversation; fits a paid plan.
- Multiple branches per business and stock transfers.
- Product variants (size / colour).
- Opening and closing the till with a cash count (short/over).
- Two-step sign-in for owners and the platform admin.
- Off-Railway automatic daily database backups.
- Camera barcode scanning (USB scanners already work as a keyboard).
