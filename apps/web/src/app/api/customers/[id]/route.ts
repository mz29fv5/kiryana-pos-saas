import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { fail, ok } from '@/lib/api/response';
import { requireAuthContext } from '@/lib/auth/server-auth';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { customerUpdateSchema } from '@/lib/validation/customers';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('store_id', auth.ctx!.storeId)
    .single();

  if (error) return fail('NOT_FOUND', 'Customer not found.', 404);
  return ok(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const parsed = customerUpdateSchema.parse(await request.json());

    const payload = {
      name: parsed.name,
      phone: parsed.phone,
      address: parsed.address,
      updated_at: new Date().toISOString(),
    };

    const cleaned = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(cleaned)
      .eq('id', id)
      .eq('store_id', auth.ctx!.storeId)
      .select('*')
      .single();

    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', 'Invalid customer update payload.', 422, error.flatten());
    }
    return fail('SERVER_ERROR', 'Unexpected server error.', 500);
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuthContext();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('store_id', auth.ctx!.storeId);

  if (error) return fail('DB_ERROR', error.message, 500);
  return ok({ id, deleted: true });
}
