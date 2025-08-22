'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface AppDataContextType {
  profiles: any[];
  matchSchedules: any[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  refreshSchedules: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [matchSchedules, setMatchSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  const refreshProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*');
    setProfiles(data || []);
  };

  const refreshSchedules = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('match_schedules')
      .select('*')
      .gte('match_date', today);
    setMatchSchedules(data || []);
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([refreshProfiles(), refreshSchedules()]);
      setLoading(false);
    };

    loadInitialData();
  }, []);

  return (
    <AppDataContext.Provider value={{
      profiles,
      matchSchedules,
      loading,
      refreshProfiles,
      refreshSchedules
    }}>
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
