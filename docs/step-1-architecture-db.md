# Step 1 — System Architecture + Database Schema

## 1) High-Level Architecture (Offline-First SaaS)

### Core Principles
- **Offline-first**: shop operations continue during internet outage.
- **Fast local UX**: POS actions complete from local state/IndexedDB first, then sync in background.
- **SaaS multi-tenant**: every record scoped by `store_id`.
- **Simple for kiryana owners**: minimal clicks, Urdu + English labels, PKR currency, quick cash workflow.

### Logical Layers

1. **Client Layer (Next.js PWA + Tailwind)**
   - POS, inventory, udhaar, reports screens.
   - Service worker for caching shell + static assets.
   - IndexedDB for local operational data and offline queue.
   - i18n labels (Urdu/English).

2. **API Layer (Next.js Route Handlers / REST)**
   - Authenticated REST endpoints.
   - Validation, tenant isolation, business rules.
   - Idempotent sync endpoints for offline uploads.

3. **Data Layer (Supabase PostgreSQL)**
   - Transaction-safe source of truth.
   - Row Level Security (RLS) for per-store segregation.
   - Auditable ledger + stock movement records.

4. **Sync/Conflict Layer**
   - Client writes local operation log (`sync_queue`).
   - On reconnect, queue uploads in order.
   - Server applies operations using idempotency keys.
   - Last-write-wins for mutable metadata; append-only records for financial/stock events.

### Request/Data Flow
1. Cashier creates sale in POS while online/offline.
2. App immediately saves sale draft + line items + stock deduction event to IndexedDB.
3. UI updates instantly (<2 sec interaction target).
4. If online, background sync posts records to API.
5. API commits sale + payment + stock movement in DB transaction.
6. Sync status updates locally; failures remain queued for retry.

---

## 2) Suggested Monorepo Folder Structure

```text
kiryana-pos-saas/
  apps/
    web/                        # Next.js app (UI + API routes)
      src/
        app/
          (auth)/login/
          (dashboard)/pos/
          (dashboard)/inventory/
          (dashboard)/customers/
          (dashboard)/reports/
          api/
            auth/
            products/
            sales/
            customers/
            udhaar/
            reports/
            sync/
        components/
          pos/
          inventory/
          ledger/
          reports/
          ui/
        lib/
          auth/
          db/
          validation/
          i18n/
          pwa/
          offline/
            indexeddb/
            sync-engine/
            queue/
        styles/
  packages/
    shared/                     # shared TS types, constants, DTOs
    eslint-config/
    tsconfig/
  supabase/
    migrations/
    seed/
  docs/
    architecture/
    api/
```

---

## 3) Domain Model (Core Entities)

- **Store** → tenant/account boundary
- **User** → store operator/owner
- **Category** → product grouping
- **Product** → inventory item
- **InventoryTransaction** → stock in/out adjustments with reason
- **Sale** → POS bill header
- **SaleItem** → line items with quantity/unit/rate
- **Payment** → cash/credit collections against sale
- **Customer** → udhaar account holder
- **CustomerLedgerEntry** → append-only ledger for debit/credit
- **Expense** → shop operating expenses
- **SyncOperation** → server-side idempotency tracking for offline uploads

---

## 4) PostgreSQL Schema (Supabase)

> Notes:
> - All business tables include `store_id` for multi-tenancy.
> - Use `numeric(14,3)` for precise money/quantity.
> - Use append-only ledger and stock transaction tables for auditability.

### 4.1 Enums

```sql
create type unit_type as enum ('unit', 'kg', 'g', 'l', 'ml', 'pack');
create type payment_method as enum ('cash', 'bank', 'wallet');
create type sale_status as enum ('completed', 'void');
create type ledger_entry_type as enum ('udhaar_debit', 'payment_credit', 'adjustment');
create type inventory_txn_type as enum ('purchase_in', 'sale_out', 'manual_adjustment', 'return_in', 'return_out');
create type sync_status as enum ('received', 'processed', 'failed');
```

### 4.2 Core Tables

```sql
-- Tenant store
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  currency_code text not null default 'PKR',
  locale text not null default 'ur-PK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- App users mapped to auth.users (Supabase Auth)
create table store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  auth_user_id uuid not null unique,
  full_name text,
  role text not null default 'owner',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name_en text not null,
  name_ur text,
  created_at timestamptz not null default now(),
  unique(store_id, name_en)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  sku text,
  barcode text,
  name_en text not null,
  name_ur text,
  unit unit_type not null default 'unit',
  sale_price numeric(14,3) not null check (sale_price >= 0),
  cost_price numeric(14,3) not null default 0 check (cost_price >= 0),
  stock_qty numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, sku),
  unique(store_id, barcode)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  opening_balance numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_no text not null,
  subtotal numeric(14,3) not null check (subtotal >= 0),
  discount_total numeric(14,3) not null default 0 check (discount_total >= 0),
  grand_total numeric(14,3) not null check (grand_total >= 0),
  paid_amount numeric(14,3) not null default 0 check (paid_amount >= 0),
  change_amount numeric(14,3) not null default 0 check (change_amount >= 0),
  status sale_status not null default 'completed',
  sold_at timestamptz not null default now(),
  created_by uuid references store_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(store_id, invoice_no)
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name_snapshot text not null,
  unit unit_type not null,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,3) not null check (unit_price >= 0),
  line_discount numeric(14,3) not null default 0 check (line_discount >= 0),
  line_total numeric(14,3) not null check (line_total >= 0)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sale_id uuid references sales(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  method payment_method not null default 'cash',
  amount numeric(14,3) not null check (amount > 0),
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid references store_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  entry_type ledger_entry_type not null,
  reference_type text not null, -- sale | payment | manual
  reference_id uuid,
  debit_amount numeric(14,3) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14,3) not null default 0 check (credit_amount >= 0),
  notes text,
  entry_at timestamptz not null default now(),
  created_by uuid references store_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  txn_type inventory_txn_type not null,
  qty numeric(14,3) not null check (qty > 0),
  unit_cost numeric(14,3),
  reference_type text not null, -- sale | purchase | adjust
  reference_id uuid,
  notes text,
  txn_at timestamptz not null default now(),
  created_by uuid references store_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category text not null,
  title text not null,
  amount numeric(14,3) not null check (amount > 0),
  expense_at timestamptz not null default now(),
  notes text,
  created_by uuid references store_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Track idempotent sync operations from offline clients
create table sync_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  device_id text not null,
  operation_id text not null,
  entity_type text not null,
  entity_id uuid,
  status sync_status not null default 'received',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(store_id, device_id, operation_id)
);
```

### 4.3 Indexing Strategy

```sql
create index idx_products_store_active on products(store_id, is_active);
create index idx_products_store_name on products(store_id, name_en);
create index idx_sales_store_sold_at on sales(store_id, sold_at desc);
create index idx_sales_store_customer on sales(store_id, customer_id);
create index idx_sale_items_sale on sale_items(sale_id);
create index idx_ledger_store_customer_time on customer_ledger_entries(store_id, customer_id, entry_at desc);
create index idx_inventory_store_product_time on inventory_transactions(store_id, product_id, txn_at desc);
create index idx_expenses_store_time on expenses(store_id, expense_at desc);
create index idx_sync_store_device_status on sync_operations(store_id, device_id, status);
```

### 4.4 Integrity/Automation Rules (Recommended)

- DB trigger on `sale_items` insert to create corresponding `inventory_transactions` (`sale_out`).
- Transactional API flow for sale creation:
  1. Insert `sales`
  2. Insert `sale_items`
  3. Deduct stock from `products.stock_qty`
  4. Insert `payments` (if paid amount > 0)
  5. Insert `customer_ledger_entries` for udhaar debit/credit
- Daily invoice sequence by store (e.g., `INV-20260324-001`).
- RLS policies using `store_users` mapping + JWT user id.

---

## 5) Multi-Tenancy and Security Baseline

- **Row Level Security enabled** on all business tables.
- JWT user (`auth.uid()`) must map to active `store_users` record.
- All `select/insert/update/delete` restricted to same `store_id`.
- Server validates any client-supplied `store_id` against authenticated context.
- Sensitive actions logged with `created_by` and timestamps.

---

## 6) Performance and UX Baseline for Step 1

- Keep hot POS product list in local IndexedDB cache.
- Debounced product search (<150ms local query target).
- Minimal payload APIs (pagination + selective fields).
- Pre-computed daily summary materialized views can be added in later phase for heavy stores.

---

## 7) What Comes Next (Step 2 Preview)

- Build REST API contracts and handlers for:
  - `/api/products`
  - `/api/sales`
  - `/api/customers`
  - `/api/udhaar`
  - `/api/reports`
  - `/api/sync/push` and `/api/sync/pull`
- Add validation schemas (Zod) + transactional service layer.
