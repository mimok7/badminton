'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface TodayMatch {
  id: string;
  match_date: string;
  match_time: string | null;
  court_number: number | null;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
  status: string;
  team1_player1_name: string;
  team1_player2_name: string;
  team2_player1_name: string;
  team2_player2_name: string;
}

export default function TodayMatches() {
  const { user, loading: userLoading } = useUser();
  const [matches, setMatches] = useState<TodayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (userLoading) return;
    
    const fetchTodayMatches = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        // 오늘의 모든 배정된 경기 조회
        const { data: todayMatches, error } = await supabase
          .from('match_schedules')
          .select(`
            id,
            match_date,
            match_time,
            court_number,
            team1_player1,
            team1_player2,
            team2_player1,
            team2_player2,
            status
          `)
          .eq('match_date', today)
          .eq('status', 'scheduled')
          .order('court_number', { ascending: true })
          .order('match_time', { ascending: true });

        if (error) {
          console.error('오늘 경기 조회 오류:', error);
          return;
        }

        if (todayMatches && todayMatches.length > 0) {
          // 모든 참가 선수들의 이름 조회
          const playerIds = new Set<string>();
          todayMatches.forEach(match => {
            if (match.team1_player1) playerIds.add(match.team1_player1);
            if (match.team1_player2) playerIds.add(match.team1_player2);
            if (match.team2_player1) playerIds.add(match.team2_player1);
            if (match.team2_player2) playerIds.add(match.team2_player2);
          });

          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .in('id', Array.from(playerIds));

          if (!profileError && profiles) {
            const profileMap = new Map();
            profiles.forEach(profile => {
              profileMap.set(profile.id, profile.username || profile.full_name || '선수');
            });

            const matchesWithNames = todayMatches.map(match => ({
              ...match,
              team1_player1_name: profileMap.get(match.team1_player1) || '선수1',
              team1_player2_name: profileMap.get(match.team1_player2) || '선수2',
              team2_player1_name: profileMap.get(match.team2_player1) || '선수3',
              team2_player2_name: profileMap.get(match.team2_player2) || '선수4',
            }));

            setMatches(matchesWithNames);
          }
        }
      } catch (error) {
        console.error('데이터 조회 중 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayMatches();
  }, [userLoading, supabase]);

  if (userLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const isPlayerInMatch = (match: TodayMatch) => {
    return match.team1_player1 === user?.id || 
           match.team1_player2 === user?.id || 
           match.team2_player1 === user?.id || 
           match.team2_player2 === user?.id;
  };

  const getPlayerTeam = (match: TodayMatch) => {
    if (match.team1_player1 === user?.id || match.team1_player2 === user?.id) {
      return 'team1';
    }
    if (match.team2_player1 === user?.id || match.team2_player2 === user?.id) {
      return 'team2';
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🏆 오늘의 경기 일정</h1>
            <p className="text-gray-600 mt-1">
              {new Date().toLocaleDateString('ko-KR', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                weekday: 'long'
              })}
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">대시보드로 돌아가기</Button>
          </Link>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🏸</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">오늘 배정된 경기가 없습니다</h3>
            <p className="text-gray-600">관리자가 경기를 배정하면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">📊 오늘 경기 요약</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">총 경기 수:</span>
                  <span className="font-bold text-blue-900 ml-2">{matches.length}경기</span>
                </div>
                <div>
                  <span className="text-blue-700">사용 코트:</span>
                  <span className="font-bold text-blue-900 ml-2">
                    {Math.max(...matches.map(m => m.court_number || 0))}개
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">내 경기:</span>
                  <span className="font-bold text-blue-900 ml-2">
                    {matches.filter(isPlayerInMatch).length}경기
                  </span>
                </div>
              </div>
            </div>

            {matches.map((match, index) => (
              <div 
                key={match.id} 
                className={`bg-white p-6 rounded-lg border-2 transition-all ${
                  isPlayerInMatch(match) 
                    ? 'border-yellow-300 bg-yellow-50 shadow-md' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      isPlayerInMatch(match) ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        경기 #{index + 1}
                        {isPlayerInMatch(match) && (
                          <span className="ml-2 px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-full font-medium">
                            내 경기
                          </span>
                        )}
                      </h3>
                      <div className="text-sm text-gray-600 flex items-center gap-4 mt-1">
                        <span>⏰ {match.match_time || '시간 미정'}</span>
                        <span>🏟️ 코트 {match.court_number || '미정'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-lg ${
                    getPlayerTeam(match) === 'team1' ? 'bg-blue-100 border-2 border-blue-300' : 'bg-blue-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-blue-800">팀 1</span>
                      {getPlayerTeam(match) === 'team1' && (
                        <span className="px-2 py-1 bg-blue-200 text-blue-800 text-xs rounded-full font-medium">
                          내 팀
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-blue-700">
                      <div className={`font-medium ${
                        match.team1_player1 === user?.id ? 'text-blue-900 underline' : ''
                      }`}>
                        👤 {match.team1_player1_name}
                      </div>
                      <div className={`font-medium ${
                        match.team1_player2 === user?.id ? 'text-blue-900 underline' : ''
                      }`}>
                        👤 {match.team1_player2_name}
                      </div>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${
                    getPlayerTeam(match) === 'team2' ? 'bg-red-100 border-2 border-red-300' : 'bg-red-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-red-800">팀 2</span>
                      {getPlayerTeam(match) === 'team2' && (
                        <span className="px-2 py-1 bg-red-200 text-red-800 text-xs rounded-full font-medium">
                          내 팀
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-red-700">
                      <div className={`font-medium ${
                        match.team2_player1 === user?.id ? 'text-red-900 underline' : ''
                      }`}>
                        👤 {match.team2_player1_name}
                      </div>
                      <div className={`font-medium ${
                        match.team2_player2 === user?.id ? 'text-red-900 underline' : ''
                      }`}>
                        👤 {match.team2_player2_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
