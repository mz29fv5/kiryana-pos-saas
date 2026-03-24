# Step 2 — Backend API Design + Implementation

## Scope
Implemented REST endpoints for:
- Products
- Sales
- Customers
- Udhaar (charge/payment/ledger)

Built using Next.js Route Handlers and Supabase PostgreSQL.

## API Conventions
- Base path: `/api`
- Auth: `Authorization: Bearer <supabase_access_token>`
- Tenant resolution: server maps authenticated user to `store_users.store_id`
- Response envelope:
  - Success: `{ success: true, data: ... }`
  - Error: `{ success: false, error: { code, message, details? } }`

## Endpoints

### Products
- `GET /api/products?q=` — List/search products.
- `POST /api/products` — Create product.
- `GET /api/products/:id` — Product details.
- `PATCH /api/products/:id` — Update product.
- `DELETE /api/products/:id` — Soft-delete (`is_active=false`).

### Customers
- `GET /api/customers?q=` — List/search customers.
- `POST /api/customers` — Create customer (+ opening balance ledger entry).
- `GET /api/customers/:id` — Customer details.
- `PATCH /api/customers/:id` — Update customer.
- `DELETE /api/customers/:id` — Delete customer.

### Sales
- `GET /api/sales?from=&to=&customerId=&limit=&offset=` — List sales.
- `POST /api/sales` — Create sale via transactional RPC.

### Udhaar
- `POST /api/udhaar/charge` — Manual debit entry.
- `POST /api/udhaar/payment` — Record customer payment + credit ledger.
- `GET /api/udhaar/ledger/:customerId` — Full ledger and current balance.

## Validation
- Zod schemas for all write endpoints and list query filters:
  - products
  - customers
  - sales
  - udhaar

## Transaction Strategy for Sales
To keep stock, sale rows, payment rows, and ledger rows consistent, API uses:
- `supabase.rpc('create_sale_with_items', payload)`
- SQL function in migration:
  - `supabase/migrations/20260324_step2_create_sale_with_items.sql`

This function:
1. Generates invoice sequence per store/day.
2. Inserts `sales` and `sale_items`.
3. Deducts `products.stock_qty`.
4. Inserts `inventory_transactions` (`sale_out`).
5. Inserts `payments` (if paid amount > 0).
6. Inserts `customer_ledger_entries` for remaining udhaar.

## Security
- API rejects requests with missing/invalid bearer token.
- API enforces active `store_users` mapping.
- Every read/write is scoped with `.eq('store_id', ctx.storeId)`.

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Next Step (Step 3)
- Build frontend pages for POS, inventory dashboard, customer ledger, and reports dashboard consuming these APIs.
