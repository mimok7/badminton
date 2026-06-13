import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type BrowserSupabaseClient = SupabaseClient<Database>;

let supabaseInstance: BrowserSupabaseClient | null = null;

export const getSupabaseClient = (): BrowserSupabaseClient => {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('badminton-auth-token');
    } catch {
      // Ignore localStorage access errors in restricted browsers.
    }
  }

  supabaseInstance = createBrowserClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  ) as unknown as BrowserSupabaseClient;

  return supabaseInstance;
};

export const supabase = getSupabaseClient();
export const createOptimizedBrowserClient = getSupabaseClient;
