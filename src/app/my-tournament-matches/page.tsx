'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';

interface Match {
  id: string;
  tournament_id: string;
  round: number;
  match_number: number;
  team1: string[];
  team2: string[];
  court: string;
  scheduled_time?: string;
  status: 'pending' | 'in_progress' | 'completed';
  score_team1?: number;
  score_team2?: number;
  winner?: 'team1' | 'team2' | 'draw';
  tournament_title?: string;
  tournament_date?: string;
}

export default function MyTournamentMatchesPage() {
  const { user, profile, loading: userLoading } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (userLoading) return;
    if (!profile?.username) return;

    fetchMyMatches();
  }, [userLoading, profile]);

  const fetchMyMatches = async () => {
    if (!profile?.username) return;

    try {
      // 1. 모든 대회 경기 조회
      const { data: allMatches, error: matchesError } = await supabase
        .from('tournament_matches')
        .select(`
          *,
          tournaments (
            title,
            tournament_date,
            round_number,
            match_type
          )
        `)
        .order('scheduled_time', { ascending: true });

      if (matchesError) throw matchesError;

      // 2. 내가 참가한 경기만 필터링
      const myMatches = allMatches?.filter((match) => {
        const isInTeam1 = match.team1?.includes(profile.username);
        const isInTeam2 = match.team2?.includes(profile.username);
        return isInTeam1 || isInTeam2;
      }) || [];

      // 3. 대회 정보 추가
      const matchesWithTournament = myMatches.map((match) => ({
        ...match,
        tournament_title: match.tournaments?.title || '대회',
        tournament_date: match.tournaments?.tournament_date,
        match_type: match.tournaments?.match_type,
      }));

      setMatches(matchesWithTournament);
    } catch (error) {
      console.error('경기 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 내 팀 확인
  const getMyTeam = (match: Match) => {
    if (!profile?.username) return null;
    
    if (match.team1?.includes(profile.username)) return 'team1';
    if (match.team2?.includes(profile.username)) return 'team2';
    return null;
  };

  // 통계 계산
  const getStats = () => {
    let total = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let pending = 0;

    matches.forEach((match) => {
      const myTeam = getMyTeam(match);
      if (!myTeam) return;

      total++;

      if (match.status === 'completed') {
        if (match.winner === myTeam) wins++;
        else if (match.winner === 'draw') draws++;
        else losses++;
      } else {
        pending++;
      }
    });

    return { total, wins, losses, draws, pending, completed: total - pending };
  };

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-xl text-gray-600 mb-4">로그인이 필요합니다.</div>
          <a href="/login" className="text-blue-600 hover:underline">
            로그인하기
          </a>
        </div>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">🏆 내 대회 경기</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">총 경기</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 text-center border border-green-200">
          <div className="text-2xl font-bold text-green-600">{stats.wins}</div>
          <div className="text-sm text-gray-600">승리</div>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 text-center border border-red-200">
          <div className="text-2xl font-bold text-red-600">{stats.losses}</div>
          <div className="text-sm text-gray-600">패배</div>
        </div>
        <div className="bg-gray-50 rounded-lg shadow p-4 text-center border border-gray-200">
          <div className="text-2xl font-bold text-gray-600">{stats.draws}</div>
          <div className="text-sm text-gray-600">무승부</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4 text-center border border-blue-200">
          <div className="text-2xl font-bold text-blue-600">
            {stats.completed > 0 ? ((stats.wins / stats.completed) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-gray-600">승률</div>
        </div>
      </div>

      {/* 경기 목록 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📋 경기 일정</h2>

        {matches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">🎾</div>
            <p>참가한 대회 경기가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => {
              const myTeam = getMyTeam(match);
              const isCompleted = match.status === 'completed';
              const isPending = match.status === 'pending';
              const didIWin = isCompleted && match.winner === myTeam;
              const didILose = isCompleted && match.winner && match.winner !== myTeam && match.winner !== 'draw';

              return (
                <div
                  key={match.id}
                  className={`border-2 rounded-lg p-4 ${
                    didIWin
                      ? 'border-green-300 bg-green-50'
                      : didILose
                      ? 'border-red-300 bg-red-50'
                      : isPending
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  {/* 헤더 */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-lg text-gray-900">
                        {match.tournament_title}
                      </div>
                      <div className="text-sm text-gray-600">
                        📅 {match.tournament_date ? new Date(match.tournament_date).toLocaleDateString('ko-KR') : '날짜 미정'} | 
                        경기 {match.match_number} | 🏟️ {match.court}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-medium ${
                        isCompleted
                          ? didIWin
                            ? 'bg-green-200 text-green-800'
                            : didILose
                            ? 'bg-red-200 text-red-800'
                            : 'bg-gray-200 text-gray-800'
                          : isPending
                          ? 'bg-blue-200 text-blue-700'
                          : 'bg-yellow-200 text-yellow-800'
                      }`}
                    >
                      {isCompleted
                        ? didIWin
                          ? '✓ 승리'
                          : didILose
                          ? '✗ 패배'
                          : '= 무승부'
                        : isPending
                        ? '⏳ 대기중'
                        : '⚡ 진행중'}
                    </span>
                  </div>

                  {/* 경기 정보 */}
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                    {/* 팀 1 */}
                    <div
                      className={`text-center p-3 rounded-lg ${
                        myTeam === 'team1'
                          ? 'bg-blue-100 border-2 border-blue-400'
                          : 'bg-white'
                      }`}
                    >
                      <div className="font-semibold text-blue-700 mb-2">
                        {myTeam === 'team1' ? '🌟 내 팀' : '상대 팀'}
                      </div>
                      {match.team1?.map((player, i) => (
                        <div
                          key={i}
                          className={`text-sm ${
                            player === profile?.username
                              ? 'font-bold text-blue-600'
                              : 'text-gray-800'
                          }`}
                        >
                          {player}
                        </div>
                      ))}
                      {isCompleted && (
                        <div className="text-2xl font-bold text-blue-600 mt-2">
                          {match.score_team1}
                        </div>
                      )}
                    </div>

                    {/* VS */}
                    <div className="text-2xl font-bold text-gray-400">VS</div>

                    {/* 팀 2 */}
                    <div
                      className={`text-center p-3 rounded-lg ${
                        myTeam === 'team2'
                          ? 'bg-blue-100 border-2 border-blue-400'
                          : 'bg-white'
                      }`}
                    >
                      <div className="font-semibold text-red-700 mb-2">
                        {myTeam === 'team2' ? '🌟 내 팀' : '상대 팀'}
                      </div>
                      {match.team2?.map((player, i) => (
                        <div
                          key={i}
                          className={`text-sm ${
                            player === profile?.username
                              ? 'font-bold text-red-600'
                              : 'text-gray-800'
                          }`}
                        >
                          {player}
                        </div>
                      ))}
                      {isCompleted && (
                        <div className="text-2xl font-bold text-red-600 mt-2">
                          {match.score_team2}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 결과 */}
                  {isCompleted && (
                    <div className="text-center mt-3 pt-3 border-t">
                      {didIWin ? (
                        <span className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-semibold">
                          🎉 승리했습니다!
                        </span>
                      ) : didILose ? (
                        <span className="inline-block bg-red-100 text-red-800 px-4 py-2 rounded-full font-semibold">
                          아쉽게 패배했습니다
                        </span>
                      ) : (
                        <span className="inline-block bg-gray-100 text-gray-800 px-4 py-2 rounded-full font-semibold">
                          무승부
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
