import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key || !url.startsWith('http')) {
        throw new Error(
          'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
        );
      }
      _supabase = createClient(url, key);
    }
    const value = (_supabase as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === 'function') {
      return value.bind(_supabase);
    }
    return value;
  },
});
