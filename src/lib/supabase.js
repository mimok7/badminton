// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// 싱글톤 인스턴스
let supabaseInstance = null;

// 통합 Supabase 클라이언트 (서버/클라이언트 모두 사용 가능)
export const getSupabaseClient = () => {
  if (supabaseInstance) return supabaseInstance;
  
  supabaseInstance = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'badminton-auth-token',
    }
  });
  
  return supabaseInstance;
};

// 기존 호환성을 위한 export
export const supabase = getSupabaseClient();
