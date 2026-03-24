import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { udhaarChargeSchema } from '@/lib/validation/udhaar';

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const parsed = udhaarChargeSchema.parse(await request.json());

    const { data, error } = await supabaseAdmin
      .from('customer_ledger_entries')
      .insert({
        store_id: auth.ctx!.storeId,
        customer_id: parsed.customerId,
        entry_type: 'udhaar_debit',
        reference_type: parsed.referenceType,
        reference_id: parsed.referenceId,
        debit_amount: parsed.amount,
        credit_amount: 0,
        notes: parsed.notes,
        created_by: auth.ctx!.storeUserId,
      })
      .select('*')
      .single();

    if (error) return fail('DB_ERROR', error.message, 500);

    return ok(data, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid udhaar charge payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}
