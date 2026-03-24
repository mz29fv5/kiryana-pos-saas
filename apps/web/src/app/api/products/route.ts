import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { productCreateSchema } from '@/lib/validation/products';

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  const q = request.nextUrl.searchParams.get('q');
  let query = supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', auth.ctx!.storeId)
    .order('name_en', { ascending: true })
    .limit(200);

  if (q) {
    query = query.ilike('name_en', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return fail('DB_ERROR', error.message, 500);

  return ok(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const parsed = productCreateSchema.parse(await request.json());
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        store_id: auth.ctx!.storeId,
        category_id: parsed.categoryId ?? null,
        sku: parsed.sku,
        barcode: parsed.barcode,
        name_en: parsed.nameEn,
        name_ur: parsed.nameUr,
        unit: parsed.unit,
        sale_price: parsed.salePrice,
        cost_price: parsed.costPrice,
        stock_qty: parsed.stockQty,
        low_stock_threshold: parsed.lowStockThreshold,
        is_active: parsed.isActive,
      })
      .select('*')
      .single();

    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid product payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}
