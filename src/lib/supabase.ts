// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// 싱글톤 인스턴스
let supabaseInstance: SupabaseClient | null = null;

// 통합 Supabase 클라이언트 (서버/클라이언트 모두 사용 가능)
export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;
  
  supabaseInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'badminton-auth-token', // 고유 키로 저장소 충돌 방지
      }
    }
  );
  
  return supabaseInstance;
};

// 기존 호환성을 위한 export (deprecated)
export const supabase = getSupabaseClient();

// 브라우저용 최적화된 클라이언트 (deprecated, getSupabaseClient 사용 권장)
export const createOptimizedBrowserClient = getSupabaseClient;
