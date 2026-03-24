import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { udhaarPaymentSchema } from '@/lib/validation/udhaar';

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const parsed = udhaarPaymentSchema.parse(await request.json());

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        store_id: auth.ctx!.storeId,
        customer_id: parsed.customerId,
        amount: parsed.amount,
        method: parsed.method,
        notes: parsed.notes,
        created_by: auth.ctx!.storeUserId,
      })
      .select('*')
      .single();

    if (paymentError) return fail('DB_ERROR', paymentError.message, 500);

    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from('customer_ledger_entries')
      .insert({
        store_id: auth.ctx!.storeId,
        customer_id: parsed.customerId,
        entry_type: 'payment_credit',
        reference_type: 'payment',
        reference_id: payment.id,
        debit_amount: 0,
        credit_amount: parsed.amount,
        notes: parsed.notes,
        created_by: auth.ctx!.storeUserId,
      })
      .select('*')
      .single();

    if (ledgerError) return fail('DB_ERROR', ledgerError.message, 500);

    return ok({ payment, ledger }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid udhaar payment payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}
