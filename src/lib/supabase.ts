import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type BrowserSupabaseClient = SupabaseClient<Database>;

let supabaseInstance: BrowserSupabaseClient | null = null;
const serverSupabasePlaceholder = {} as BrowserSupabaseClient;

export const getSupabaseClient = (): BrowserSupabaseClient => {
  if (typeof window === 'undefined') {
    // Client components are still pre-rendered on the server in Next.js.
    // Avoid constructing a browser client until we are actually in the browser.
    return serverSupabasePlaceholder;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {
    window.localStorage.removeItem('badminton-auth-token');
  } catch {
    // Ignore localStorage access errors in restricted browsers.
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

export const supabase = new Proxy({} as BrowserSupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(getSupabaseClient(), property, receiver);
  },
});

export const createOptimizedBrowserClient = getSupabaseClient;
