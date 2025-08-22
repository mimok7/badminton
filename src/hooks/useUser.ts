'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  skill_level: string | null;
  role: string | null;
  gender: string | null;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  const fetchProfile = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    setProfile(profile);
    return profile;
  };

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
        }
        
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 파생 상태: 관리자 여부
  const isAdmin = profile?.role === 'admin';

  return { user, profile, loading, isAdmin };
}
