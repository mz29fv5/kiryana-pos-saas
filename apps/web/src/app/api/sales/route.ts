import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { saleCreateSchema, saleListQuerySchema } from '@/lib/validation/sales';

function todayInvoicePrefix(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `INV-${yyyy}${mm}${dd}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = saleListQuerySchema.parse(params);

    let query = supabaseAdmin
      .from('sales')
      .select('*, sale_items(*)')
      .eq('store_id', auth.ctx!.storeId)
      .order('sold_at', { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (parsed.from) query = query.gte('sold_at', parsed.from);
    if (parsed.to) query = query.lte('sold_at', parsed.to);
    if (parsed.customerId) query = query.eq('customer_id', parsed.customerId);

    const { data, error } = await query;
    if (error) return fail('DB_ERROR', error.message, 500);

    return ok(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid sale listing query.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const parsed = saleCreateSchema.parse(await request.json());

    const subtotal = parsed.items.reduce((sum, item) => sum + item.qty * item.unitPrice - item.lineDiscount, 0);
    const grandTotal = subtotal - parsed.discountTotal;

    if (grandTotal < 0) {
      return fail('VALIDATION_ERROR', 'Grand total cannot be negative.', 422);
    }

    const { data, error } = await supabaseAdmin.rpc('create_sale_with_items', {
      p_store_id: auth.ctx!.storeId,
      p_customer_id: parsed.customerId ?? null,
      p_invoice_prefix: todayInvoicePrefix(),
      p_subtotal: subtotal,
      p_discount_total: parsed.discountTotal,
      p_grand_total: grandTotal,
      p_paid_amount: parsed.paidAmount,
      p_change_amount: parsed.changeAmount,
      p_sold_at: parsed.soldAt ?? new Date().toISOString(),
      p_created_by: auth.ctx!.storeUserId,
      p_items: parsed.items,
    });

    if (error) {
      return fail('DB_ERROR', error.message, 500, {
        hint: 'Ensure SQL function create_sale_with_items exists and is transactional.',
      });
    }

    return ok(data, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid sale payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}
