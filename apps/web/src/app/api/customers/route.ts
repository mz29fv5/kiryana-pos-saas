import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { customerCreateSchema } from '@/lib/validation/customers';

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  const q = request.nextUrl.searchParams.get('q');

  let query = supabaseAdmin
    .from('customers')
    .select('*')
    .eq('store_id', auth.ctx!.storeId)
    .order('name', { ascending: true })
    .limit(200);

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return fail('DB_ERROR', error.message, 500);

  return ok(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const parsed = customerCreateSchema.parse(await request.json());

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        store_id: auth.ctx!.storeId,
        name: parsed.name,
        phone: parsed.phone,
        address: parsed.address,
        opening_balance: parsed.openingBalance,
      })
      .select('*')
      .single();

    if (error) return fail('DB_ERROR', error.message, 500);

    if (parsed.openingBalance > 0) {
      const { error: ledgerError } = await supabaseAdmin.from('customer_ledger_entries').insert({
        store_id: auth.ctx!.storeId,
        customer_id: data.id,
        entry_type: 'adjustment',
        reference_type: 'opening_balance',
        debit_amount: parsed.openingBalance,
        credit_amount: 0,
        notes: 'Opening balance',
        created_by: auth.ctx!.storeUserId,
      });

      if (ledgerError) return fail('DB_ERROR', ledgerError.message, 500);
    }

    return ok(data, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid customer payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}
