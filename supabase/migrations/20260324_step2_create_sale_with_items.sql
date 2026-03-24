-- Transactional sale creation RPC for offline/online POS writes.
create or replace function public.create_sale_with_items(
  p_store_id uuid,
  p_customer_id uuid,
  p_invoice_prefix text,
  p_subtotal numeric,
  p_discount_total numeric,
  p_grand_total numeric,
  p_paid_amount numeric,
  p_change_amount numeric,
  p_sold_at timestamptz,
  p_created_by uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sale_id uuid;
  v_invoice_no text;
  v_item jsonb;
  v_line_total numeric;
  v_seq integer;
begin
  -- invoice sequence by day prefix within store.
  select coalesce(max(split_part(invoice_no, '-', 3)::int), 0) + 1
  into v_seq
  from sales
  where store_id = p_store_id
    and invoice_no like (p_invoice_prefix || '-%');

  v_invoice_no := p_invoice_prefix || '-' || lpad(v_seq::text, 3, '0');

  insert into sales (
    store_id, customer_id, invoice_no, subtotal, discount_total, grand_total,
    paid_amount, change_amount, sold_at, created_by
  ) values (
    p_store_id, p_customer_id, v_invoice_no, p_subtotal, p_discount_total, p_grand_total,
    p_paid_amount, p_change_amount, p_sold_at, p_created_by
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := ((v_item->>'qty')::numeric * (v_item->>'unitPrice')::numeric)
      - coalesce((v_item->>'lineDiscount')::numeric, 0);

    insert into sale_items (
      sale_id, product_id, product_name_snapshot, unit, qty,
      unit_price, line_discount, line_total
    ) values (
      v_sale_id,
      (v_item->>'productId')::uuid,
      v_item->>'productNameSnapshot',
      (v_item->>'unit')::unit_type,
      (v_item->>'qty')::numeric,
      (v_item->>'unitPrice')::numeric,
      coalesce((v_item->>'lineDiscount')::numeric, 0),
      v_line_total
    );

    update products
    set stock_qty = stock_qty - (v_item->>'qty')::numeric,
        updated_at = now()
    where id = (v_item->>'productId')::uuid
      and store_id = p_store_id;

    insert into inventory_transactions (
      store_id, product_id, txn_type, qty, reference_type, reference_id, created_by
    ) values (
      p_store_id,
      (v_item->>'productId')::uuid,
      'sale_out',
      (v_item->>'qty')::numeric,
      'sale',
      v_sale_id,
      p_created_by
    );
  end loop;

  if p_paid_amount > 0 then
    insert into payments (
      store_id, sale_id, customer_id, method, amount, created_by
    ) values (
      p_store_id, v_sale_id, p_customer_id, 'cash', p_paid_amount, p_created_by
    );
  end if;

  if p_customer_id is not null and (p_grand_total - p_paid_amount) > 0 then
    insert into customer_ledger_entries (
      store_id, customer_id, entry_type, reference_type, reference_id,
      debit_amount, credit_amount, notes, created_by
    ) values (
      p_store_id, p_customer_id, 'udhaar_debit', 'sale', v_sale_id,
      (p_grand_total - p_paid_amount), 0, 'Auto ledger from sale', p_created_by
    );
  end if;

  return jsonb_build_object('saleId', v_sale_id, 'invoiceNo', v_invoice_no);
end;
$$;
