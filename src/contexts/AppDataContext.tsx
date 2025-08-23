'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface AppDataContextType {
  profiles: any[];
  matchSchedules: any[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  refreshSchedules: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

// 캐시된 데이터
let cachedProfiles: any[] = [];
let cachedSchedules: any[] = [];
let lastProfilesFetch = 0;
let lastSchedulesFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<any[]>(cachedProfiles);
  const [matchSchedules, setMatchSchedules] = useState<any[]>(cachedSchedules);
  const [loading, setLoading] = useState(!cachedProfiles.length && !cachedSchedules.length);
  const supabase = useMemo(() => createClientComponentClient(), []);

  const refreshProfiles = useCallback(async () => {
    const now = Date.now();
    
    // 캐시가 유효하면 건너뛰기
    if (cachedProfiles.length > 0 && now - lastProfilesFetch < CACHE_DURATION) {
      setProfiles(cachedProfiles);
      return;
    }

    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error && data) {
        cachedProfiles = data;
        lastProfilesFetch = now;
        setProfiles(data);
      }
    } catch (error) {
      console.error('프로필 데이터 로드 실패:', error);
    }
  }, [supabase]);

  const refreshSchedules = useCallback(async () => {
    const now = Date.now();
    
    // 캐시가 유효하면 건너뛰기
    if (cachedSchedules.length > 0 && now - lastSchedulesFetch < CACHE_DURATION) {
      setMatchSchedules(cachedSchedules);
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('match_schedules')
        .select('*')
        .gte('match_date', today);
      
      if (!error && data) {
        cachedSchedules = data;
        lastSchedulesFetch = now;
        setMatchSchedules(data);
      }
    } catch (error) {
      console.error('경기 일정 데이터 로드 실패:', error);
    }
  }, [supabase]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (cachedProfiles.length > 0 && cachedSchedules.length > 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await Promise.all([refreshProfiles(), refreshSchedules()]);
      } catch (error) {
        console.error('초기 데이터 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [refreshProfiles, refreshSchedules]);

  const contextValue = useMemo(() => ({
    profiles,
    matchSchedules,
    loading,
    refreshProfiles,
    refreshSchedules
  }), [profiles, matchSchedules, loading, refreshProfiles, refreshSchedules]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
