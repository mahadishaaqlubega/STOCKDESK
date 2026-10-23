# StockDesk API

Base URL: `https://<backend>/api`. Send `Authorization: Bearer <token>` on
everything except the public endpoints. Every request is scoped to the
signed-in user's shop; ids from another shop return 404.

Roles: **Admin** (shop owner/manager), **Staff** (cashier), **SuperAdmin**
(platform owner, no shop). "All" = Admin and Staff.

Errors are JSON `{ "message": "..." }`. `503` with `status: "STARTING"` means
the server is still migrating after a deploy; retry shortly.

## Public (no sign-in)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api` | Health check |
| POST | `/api/auth/signup` | Register a shop (rate-limited) |
| POST | `/api/auth/login` | `{ shopName, username or email, password }`. 10 wrong passwords lock the account for 15 min (429) |
| POST | `/api/auth/verify-email` | Email verification token |
| POST | `/api/auth/resend-verification` | |
| POST | `/api/auth/forgot-password` | Always answers success (no email enumeration) |
| POST | `/api/auth/reset-password` | Ends all sessions, lifts lockout |
| POST | `/api/auth/refresh` | New token for a current session |
| GET | `/api/public/receipts/:token` | Customer's receipt PDF from a WhatsApp link (30/min per IP) |

## Sales

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/api/sales` | All | See body below |
| GET | `/api/sales` | All | Paged: `limit` (≤500), `offset`, `q` (receipt no., customer, phone, cashier) |
| GET | `/api/sales/:id` | All | With items, customer, cashier, receipt (incl. `publicToken`) |
| GET | `/api/sales/:id/receipt` | All | PDF |
| POST | `/api/sales/:id/share` | All | Receipt link token (created for older sales) |
| POST | `/api/sales/:id/return` | Admin | Refund / return items |
| GET | `/api/sales/returns` | Admin | |
| GET | `/api/sales/day-closures` | Admin | |
| POST | `/api/sales/close-day` | Admin | |

`POST /api/sales` body:

```jsonc
{
  "items": [{ "productId": 12, "quantity": 2, "price": 9000 }], // price optional: discount for goods, agreed amount for services
  "paymentMethod": "Cash",            // Cash | Card | Mobile Money | Split | Credit
  "paymentSplits": [{ "method": "Cash", "amount": 5000 }],     // Split only
  "discount": 0, "discountType": "fixed",                       // or "percentage"
  "customerId": 7,                    // required for Credit
  "amountPaid": 5000, "depositMethod": "Cash", "dueDate": "2026-11-30", // Credit only
  "clientRef": "uuid",                // optional; makes the call idempotent (repeat -> 200 { duplicate: true })
  "offline": true, "soldAt": "ISO time", "cashierId": 170       // offline-queue sync only
}
```

Rules: goods never above catalogue price; Staff never below cost and within
the shop's `maxDiscountPercent`; online sales need enough stock (409),
offline-synced sales may take stock negative; credit respects the customer's
limit and needs a connection.

## Products

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/api/products` | All | `search`, `category`, `type=goods|service`, `includeArchived=1` |
| GET | `/api/products/low-stock` | All | Goods at/below their reorder level |
| GET | `/api/products/:id` | All | |
| POST | `/api/products` | Admin | |
| PUT | `/api/products/:id` | Admin | |
| DELETE | `/api/products/:id` | Admin | Archives if it has sales history |
| POST | `/api/products/:id/restock` | Admin | `{ quantity, costPrice, supplier, notes }` |
| GET | `/api/products/:id/stock-history` | All | |
| POST | `/api/products/restock-category` | Admin | |

## Customers & credit

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/api/customers` | All | With `balance`, `salesCount`, `whatsapp`, `lastReminderAt` |
| GET | `/api/customers/:id` | All | |
| POST / PUT | `/api/customers`, `/api/customers/:id` | All | `creditLimit` only settable by Admin |
| DELETE | `/api/customers/:id` | Admin | Refused if they have sales |
| GET | `/api/customers/:id/credit` | All | Statement: open sales, payments |
| POST | `/api/customers/:id/payments` | All | `{ amount, method, notes?, saleId? }` oldest debt first |
| POST | `/api/customers/:id/reminders` | All | Records a WhatsApp reminder (`lastReminderAt`, activity log) |
| GET | `/api/credit/summary` | All | Everyone who owes, overdue totals |

## Suppliers & purchases (Admin)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/suppliers` | With `purchased`, `balance`, `lastPurchaseDate` |
| POST / PUT | `/api/suppliers`, `/api/suppliers/:id` | |
| DELETE | `/api/suppliers/:id` | Archives if it has purchases |
| GET | `/api/suppliers/:id/statement` | Unpaid purchases, payments |
| POST | `/api/suppliers/:id/payments` | `{ amount, method: Cash|Mobile Money|Bank|Card, notes?, purchaseId? }` |
| GET | `/api/purchases` | `supplierId`, `unpaid=1`, `limit`, `offset` |
| GET | `/api/purchases/:id` | Items and payments |
| POST | `/api/purchases` | `{ supplierId, items: [{ productId, quantity, unitCost, sellPrice? }], amountPaid?, paymentMethod?, purchaseDate?, dueDate?, reference?, notes? }` — adds stock, sets cost price |

## Import / export (Admin)

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/import/products` | `{ rows, dryRun = true, updateStock = false }` → per-row create/update/unchanged/error. Saves only with `dryRun: false` and no errors. Max 5,000 rows |
| POST | `/api/import/customers` | `{ rows, dryRun }`, matched by phone then name |
| GET | `/api/exports/sales` | `start`, `end` (YYYY-MM-DD), `tz` (browser offset). One row per item sold, ≤50,000 |

## Reports

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/reports/summary` | Today / week / month metrics (net sales, profit, refunds, discounts, credit) |
| GET | `/api/reports/dashboard-stats` | Stock counts, 7-day trend |
| GET | `/api/reports/best-selling` | |
| GET | `/api/reports/by-cashier` | |
| GET | `/api/reports/range` | `start`, `end` |
| GET | `/api/reports/daily`, `/monthly`, `/customer/:customerId` | |

## Expenses, stock counts, activity log

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/expenses` | All |
| POST / PUT / DELETE | `/api/expenses[/:id]` | Admin |
| GET | `/api/stock-reconciliation/products`, `/history`, `/summary` | Admin |
| POST | `/api/stock-reconciliation/create` | Admin |
| GET | `/api/audit/logs`, `/users`, `/stats` | Admin |

## Settings, team, profile

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/api/settings` | All | |
| PUT | `/api/settings` | Admin | Incl. `shopLogoUrl` (PNG/JPEG/WebP ≤300 KB or https), `maxDiscountPercent` (0–100 or null) |
| GET / POST | `/api/users` | Admin | Passwords: 8+ chars with letter, number, symbol |
| PUT / DELETE | `/api/users/:id` | Admin | |
| POST | `/api/users/:id/reset-password` | Admin | Signs the user out everywhere |
| GET / PUT | `/api/profile` | Admin, SuperAdmin | |
| POST | `/api/profile/change-password` | Admin, SuperAdmin | Returns a new token; other sessions end |
| POST | `/api/profile/sign-out-everywhere` | Admin, SuperAdmin | |
| POST | `/api/profile/close-account` | Admin, SuperAdmin | |
| GET / PUT | `/api/shops/me` | All / Admin | |

## Platform owner (SuperAdmin)

`GET /api/admin/overview`, `GET /api/admin/dashboard`, `GET /api/admin/shops/:id`,
`DELETE /api/admin/shops/:id`.

## Legacy

`/api/printer/*` (server-side ESC/POS printing and Twilio WhatsApp sending)
remains for compatibility but is not used by the app: printing goes through
the device, and WhatsApp uses click-to-chat. The ESC/POS packages are optional
dependencies and are not installed in the production image, so
`GET /api/printer/status` reports `available: false` there.
