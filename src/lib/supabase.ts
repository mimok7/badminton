// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// 서버 사이드용 클라이언트
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 브라우저용 최적화된 클라이언트 (싱글톤 패턴)
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createOptimizedBrowserClient = () => {
  if (browserClient) return browserClient;
  
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  return browserClient;
};
