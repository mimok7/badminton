'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { type AppProfile, getRoleFromUser, getProfileByUserId, isAdminOrManagerRole } from '@/lib/auth';

type Profile = AppProfile;

// 캐시된 프로필 데이터
let cachedProfile: Profile | null = null;
let cachedUserId: string | null = null;
let cachedUser: User | null = null;
let hasResolvedAuth = false;

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Auth request timed out'));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function useUser() {
  const [user, setUser] = useState<User | null>(cachedUser);
  const [profile, setProfile] = useState<Profile | null>(cachedProfile);
  const [loading, setLoading] = useState(!hasResolvedAuth);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const fetchProfile = useCallback(async (userId: string) => {
    // 캐시된 프로필이 같은 사용자의 것이면 재사용
    if (cachedProfile && cachedUserId === userId) {
      setProfile(cachedProfile);
      return cachedProfile;
    }

    try {
      const profile = await getProfileByUserId(supabase, userId);
      
      if (profile) {
        cachedProfile = profile;
        cachedUserId = userId;
        setProfile(profile);
        return profile;
      }

      setProfile(null);
    } catch (error) {
      console.error('Profile fetch error:', error);
      setProfile(null);
    }
    
    return null;
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const getUser = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await withTimeout(supabase.auth.getSession());
        
        if (!isMounted) return;

        if (sessionError) {
          console.error('Session fetch error:', sessionError);
        }

        const sessionUser = session?.user ?? null;
        cachedUser = sessionUser;
        hasResolvedAuth = true;
        setUser(sessionUser);

        if (sessionUser) {
          await withTimeout(fetchProfile(sessionUser.id));
        } else {
          setProfile(null);
          cachedProfile = null;
          cachedUserId = null;
        }
      } catch (error) {
        console.error('User fetch error:', error);
        cachedUser = null;
        hasResolvedAuth = true;
        setUser(null);
        setProfile(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        const sessionUser = session?.user ?? null;
        cachedUser = sessionUser;
        hasResolvedAuth = true;
        setUser(sessionUser);
        
        if (sessionUser) {
          try {
            await withTimeout(fetchProfile(sessionUser.id));
          } catch (error) {
            console.error('Auth state profile fetch error:', error);
          }
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
  const isAdmin = useMemo(
    () => isAdminOrManagerRole(profile?.role) || isAdminOrManagerRole(getRoleFromUser(user)),
    [profile?.role, user]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    cachedProfile = null;
    cachedUserId = null;
    await fetchProfile(user.id);
  }, [user, fetchProfile]);

  return { user, profile, loading, isAdmin, refreshProfile };
}
