'use client';

import { useState, useEffect } from 'react';

interface ClubContextData {
  clubId: string | null;
  clubName: string | null;
  clubRole: string | null;
  loading: boolean;
  error: Error | null;
}

export function useClub(): ClubContextData {
  const [data, setData] = useState<ClubContextData>({
    clubId: null,
    clubName: null,
    clubRole: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchClubInfo() {
      try {
        // 클라이언트에서 active_club_id 쿠키 확인
        const match = document.cookie.match(/(?:^|;\s*)active_club_id=([^;]*)/);
        const activeClubId = match ? decodeURIComponent(match[1]) : null;

        if (!activeClubId) {
          if (isMounted) {
            setData(prev => ({ ...prev, clubId: null, clubName: null, clubRole: null, loading: false }));
          }
          return;
        }

        // API를 통해 클럽 이름 및 권한 조회
        const res = await fetch('/api/user/active-club');
        if (!res.ok) {
          throw new Error('Failed to fetch active club');
        }

        const json = await res.json();
        
        if (isMounted) {
          setData({
            clubId: activeClubId,
            clubName: json.club?.name || null,
            clubRole: json.clubRole || null,
            loading: false,
            error: null,
          });
        }
      } catch (err: any) {
        console.error('Error in useClub:', err);
        if (isMounted) {
          setData(prev => ({
            ...prev,
            loading: false,
            error: err,
          }));
        }
      }
    }

    fetchClubInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return data;
}
