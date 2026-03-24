import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  const { customerId } = await params;

  const { data, error } = await supabaseAdmin
    .from('customer_ledger_entries')
    .select('*')
    .eq('store_id', auth.ctx!.storeId)
    .eq('customer_id', customerId)
    .order('entry_at', { ascending: true });

  if (error) return fail('DB_ERROR', error.message, 500);

  const balance = (data ?? []).reduce((acc, row) => acc + Number(row.debit_amount) - Number(row.credit_amount), 0);

  return ok({ entries: data, balance });
}
