import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Merchant/admin browser client.
 *
 * Identical to the customer client except for `storageKey`: the merchant session
 * lives in its own slot, so a merchant and a customer can stay signed in at the
 * same time in one browser profile and signing out of one does not clear the other.
 * Same Supabase project, same auth provider, same RLS — only the local slot differs.
 */
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAdminSupabaseClient() {
  const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || process.env['SUPABASE_PUBLISHABLE_KEY'];
  const PROJECT_ID = import.meta.env['VITE_SUPABASE_PROJECT_ID'] || process.env['SUPABASE_PROJECT_ID'];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing Supabase environment variables for the merchant client.');
  }

  const ref = PROJECT_ID || new URL(SUPABASE_URL).hostname.split('.')[0];

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      storageKey: `sb-${ref}-admin-auth-token`,
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _adminSupabase: ReturnType<typeof createAdminSupabaseClient> | undefined;

/** Use for merchant login, MFA, the /admin guard and admin storage uploads. */
export const adminSupabase = new Proxy({} as ReturnType<typeof createAdminSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_adminSupabase) _adminSupabase = createAdminSupabaseClient();
    return Reflect.get(_adminSupabase, prop, receiver);
  },
});

/** True when the current browsing context belongs to the merchant workspace. */
export function isMerchantSurface(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/sks-4827');
}
