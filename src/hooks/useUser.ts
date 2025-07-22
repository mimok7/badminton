'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface UserProfile {
  id: number;
  user_id: string;
  username?: string;
  full_name?: string;
  role?: string;
  skill_level?: string;
  skill_level_name?: string;
  gender?: string;
}

export function useUser() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchUserProfile = async (userId: string) => {
    try {
      // Rate limit 방지를 위해 지연
      await new Promise(resolve => setTimeout(resolve, 150));

      // 먼저 user_id로 프로필 찾기
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, user_id, username, full_name, role, skill_level, gender,
          level_info:level_info!skill_level(name)
        `)
        .eq('user_id', userId);

      if (error) {
        if (error.message?.includes('rate limit')) {
          return null;
        }
        return null;
      }

      // 기존 프로필이 있으면 반환
      if (data && data.length > 0) {
        const profile = data[0];
        const levelInfo = Array.isArray(profile.level_info) ? profile.level_info[0] : profile.level_info;
        return {
          ...profile,
          skill_level_name: levelInfo?.name || `${profile.skill_level || 'E2'}급`
        };
      }

      // Rate limit 방지를 위해 추가 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 프로필이 없으면 새로 생성
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          role: 'user',
          skill_level: 'E2'
        })
        .select(`
          id, user_id, username, full_name, role, skill_level,
          level_info:level_info!skill_level(name)
        `)
        .single();

      if (createError) {
        if (createError.message?.includes('rate limit')) {
          return null;
        }
        return null;
      }

      if (newProfile) {
        const levelInfo = Array.isArray(newProfile.level_info) ? newProfile.level_info[0] : newProfile.level_info;
        return {
          ...newProfile,
          skill_level_name: levelInfo?.name || `${newProfile.skill_level || 'E2'}급`
        };
      }

      return newProfile;
    } catch (error) {
      return null;
    }
  };

  const checkUser = async () => {
    try {
      setLoading(true);
      
      // Rate limit 방지를 위해 지연 추가
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        // Rate limit 오류인 경우 재시도 하지 않고 로딩만 종료
        if (error.message?.includes('rate limit')) {
          setLoading(false);
          return;
        }
        
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        return;
      }

      setUser(user);

      if (user) {
        // Rate limit 방지를 위해 추가 지연
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const userProfile = await fetchUserProfile(user.id);
        setProfile(userProfile);
        
        // 관리자 권한 확인
        const adminRole = userProfile?.role?.toLowerCase() === 'admin';
        setIsAdmin(adminRole);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    } catch (error) {
      // Rate limit 오류인 경우 상태 유지
      if (!(error instanceof Error) || !error.message?.includes('rate limit')) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUser();

    // 인증 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Rate limit을 방지하기 위해 상태 변화 로그 제거
        checkUser();
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    loading,
    isAdmin,
    refresh: checkUser
  };
}
