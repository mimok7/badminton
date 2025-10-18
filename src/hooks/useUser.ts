'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  skill_level: string | null;
  role: string | null;
  gender: string | null;
}

// 캐시된 프로필 데이터
let cachedProfile: Profile | null = null;
let cachedUserId: string | null = null;

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const fetchProfile = useCallback(async (userId: string) => {
    // 캐시된 프로필이 같은 사용자의 것이면 재사용
    if (cachedProfile && cachedUserId === userId) {
      setProfile(cachedProfile);
      return cachedProfile;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (!error && profile) {
        cachedProfile = profile;
        cachedUserId = userId;
        setProfile(profile);
        return profile;
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
    }
    
    return null;
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        
        setUser(user);

        if (user) {
          await fetchProfile(user.id);
        }
      } catch (error) {
        console.error('User fetch error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          cachedProfile = null;
          cachedUserId = null;
        }
        
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  // 파생 상태: 관리자 여부 (메모이제이션)
  const isAdmin = useMemo(() => profile?.role === 'admin', [profile?.role]);

  return { user, profile, loading, isAdmin };
}
