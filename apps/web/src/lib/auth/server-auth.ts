import { headers } from 'next/headers';
import { fail } from '@/lib/api/response';
import { supabaseAdmin } from '@/lib/db/supabase-server';

export type AuthContext = {
  authUserId: string;
  storeId: string;
  storeUserId: string;
};

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function requireAuthContext(): Promise<{ ctx?: AuthContext; errorResponse?: Response }> {
  const headersList = await headers();
  const token = getBearerToken(headersList.get('authorization'));

  if (!token) {
    return { errorResponse: fail('UNAUTHORIZED', 'Missing authorization token.', 401) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { errorResponse: fail('UNAUTHORIZED', 'Invalid authentication token.', 401) };
  }

  const authUserId = data.user.id;
  const { data: storeUser, error: storeError } = await supabaseAdmin
    .from('store_users')
    .select('id, store_id, is_active')
    .eq('auth_user_id', authUserId)
    .single();

  if (storeError || !storeUser || !storeUser.is_active) {
    return { errorResponse: fail('FORBIDDEN', 'No active store mapping found.', 403) };
  }

  return {
    ctx: {
      authUserId,
      storeId: storeUser.store_id as string,
      storeUserId: storeUser.id as string,
    },
  };
}
