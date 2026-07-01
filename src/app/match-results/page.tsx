'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RequireAuth } from '@/components/AuthGuard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface AssignedMatch {
  id: string;
  match_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: string;
  description: string;
  max_participants: number;
  current_participants: number;
  generated_match: {
    id: string;
    match_number: number;
    session: {
      session_name: string;
      session_date: string;
      id?: string;
    };
    team1_player1: {
      username: string;
      full_name: string;
      skill_level: string;
    };
    team1_player2: {
      username: string;
      full_name: string;
      skill_level: string;
    };
    team2_player1: {
      username: string;
      full_name: string;
      skill_level: string;
    };
    team2_player2: {
      username: string;
      full_name: string;
      skill_level: string;
    };
  };
}

interface MatchSession {
  id: string;
  session_name: string;
  session_date: string;
  total_matches: number;
  assigned_matches: number;
  created_at: string;
}

function MatchResultsPage() {
  const [assignedMatches, setAssignedMatches] = useState<AssignedMatch[]>([]);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchCurrentUser();
    fetchAssignedMatches();
    fetchMatchSessions();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name')
          .eq('user_id', user.id)
          .single();
        
        if (profileError) throw profileError;
        setCurrentUser(profile);
      }
    } catch (error) {
      console.error('현재 사용자 조회 오류:', error);
    }
  };

  const fetchMatchSessions = async () => {
    try {
      const { data: sessions, error } = await supabase
        .from('match_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMatchSessions(sessions || []);
    } catch (error) {
      console.error('경기 세션 조회 오류:', error);
    }
  };

  const fetchAssignedMatches = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('match_schedules')
        .select(`
          id,
          match_date,
          start_time,
          end_time,
          location,
          status,
          description,
          max_participants,
          current_participants,
          generated_matches:generated_match_id (
            id,
            match_number,
            session_id,
            team1_player1_id,
            team1_player2_id,
            team2_player1_id,
            team2_player2_id
          )
        `)
        .not('generated_match_id', 'is', null)
        .order('match_date', { ascending: false })
        .order('start_time', { ascending: true });

      // 날짜 필터 적용
      if (dateFilter !== 'all') {
        if (dateFilter === 'today') {
          const today = new Date().toISOString().split('T')[0];
          query = query.eq('match_date', today);
        } else if (dateFilter === 'upcoming') {
          const today = new Date().toISOString().split('T')[0];
          query = query.gte('match_date', today);
        } else if (dateFilter === 'past') {
          const today = new Date().toISOString().split('T')[0];
          query = query.lt('match_date', today);
        }
      }

      // 상태 필터 적용
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: matches, error } = await query;

      if (error) throw error;

      if (!matches || matches.length === 0) {
        setAssignedMatches([]);
        return;
      }

      // 플레이어 정보와 세션 정보를 별도로 가져오기
      const matchesWithDetails = [];
      
      for (const match of matches) {
        if (!match.generated_matches) continue;

        // generated_matches가 배열이므로 첫 번째 요소를 가져옴
        const generatedMatch = Array.isArray(match.generated_matches) 
          ? match.generated_matches[0] 
          : match.generated_matches;

        if (!generatedMatch) continue;

        // 플레이어 정보 조회
        const { data: players, error: playersError } = await supabase
          .from('profiles')
          .select('id, username, full_name, skill_level')
          .in('id', [
            generatedMatch.team1_player1_id,
            generatedMatch.team1_player2_id,
            generatedMatch.team2_player1_id,
            generatedMatch.team2_player2_id
          ].filter(Boolean));

        if (playersError) {
          console.error('플레이어 정보 조회 오류:', playersError);
          continue;
        }

        // 세션 정보 조회
        const { data: session, error: sessionError } = await supabase
          .from('match_sessions')
          .select('id, session_name, session_date')
          .eq('id', generatedMatch.session_id)
          .single();

        if (sessionError) {
          console.error('세션 정보 조회 오류:', sessionError);
        }

        const getPlayer = (id: string) => players?.find(p => p.id === id) || { username: '미정', full_name: '미정', skill_level: 'E2' };

        const formattedMatch = {
          id: match.id,
          match_date: match.match_date,
          start_time: match.start_time,
          end_time: match.end_time,
          location: match.location,
          status: match.status,
          description: match.description,
          max_participants: match.max_participants,
          current_participants: match.current_participants,
          generated_match: {
            id: generatedMatch.id,
            match_number: generatedMatch.match_number,
            session: session || { session_name: '알 수 없음', session_date: '', id: '' },
            team1_player1: getPlayer(generatedMatch.team1_player1_id),
            team1_player2: getPlayer(generatedMatch.team1_player2_id),
            team2_player1: getPlayer(generatedMatch.team2_player1_id),
            team2_player2: getPlayer(generatedMatch.team2_player2_id)
          }
        };

        matchesWithDetails.push(formattedMatch);
      }

      // 세션 필터 적용
      const finalMatches = selectedSession === 'all' 
        ? matchesWithDetails
        : matchesWithDetails.filter(match => 
            match.generated_match?.session?.id === selectedSession
          );

      setAssignedMatches(finalMatches);
    } catch (error) {
      console.error('배정된 경기 조회 오류:', error);
      setAssignedMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedMatches();
  }, [selectedSession, dateFilter, statusFilter]);

  const getStatusBadge = (status: string) => {
    const statusMap = {
      'scheduled': { text: '예정됨', color: 'bg-blue-100 text-blue-800' },
      'in_progress': { text: '진행중', color: 'bg-yellow-100 text-yellow-800' },
      'completed': { text: '완료됨', color: 'bg-green-100 text-green-800' },
      'cancelled': { text: '취소됨', color: 'bg-red-100 text-red-800' }
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { text: status, color: 'bg-gray-100 text-gray-800' };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.text}
      </span>
    );
  };

  const getPlayerName = (player: any) => {
    return player?.username || player?.full_name || '미정';
  };

  const isCurrentUser = (player: any) => {
    if (!currentUser || !player) return false;
    return player.username === currentUser.username || player.full_name === currentUser.full_name;
  };

  const getPlayerNameWithHighlight = (player: any) => {
    const name = getPlayerName(player);
    const isMe = isCurrentUser(player);
    
    return (
      <span className={isMe ? "text-sm text-yellow-600 font-bold bg-yellow-100 px-2 py-1 rounded" : "text-sm text-gray-900"}>
        {name}
      </span>
    );
  };

  const getLevelBadge = (level: string) => {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
        {level}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 상단 인사말 섹션 */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              📋 배정 현황 확인
            </h1>
            <Link href="/" className="text-white hover:text-blue-100 transition-colors">
              🏠 홈
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm mb-4">
            <span className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full">
              회원님
            </span>
            <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
              배정된 경기 현황
            </span>
          </div>
          <p className="text-blue-100">
            배정된 경기 현황과 일정을 확인하고 관리하세요! 🎯
          </p>
        </div>

        {/* 필터 컨트롤 */}
        <div className="bg-white shadow-sm rounded-lg mb-6 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">🔍 필터 설정</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 세션 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">경기 세션</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="all">전체 세션</option>
                {matchSessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.session_name}
                  </option>
                ))}
              </select>
            </div>

            {/* 날짜 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="all">전체 날짜</option>
                <option value="today">오늘</option>
                <option value="upcoming">예정된 경기</option>
                <option value="past">지난 경기</option>
              </select>
            </div>

            {/* 상태 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="all">전체 상태</option>
                <option value="scheduled">예정됨</option>
                <option value="in_progress">진행중</option>
                <option value="completed">완료됨</option>
                <option value="cancelled">취소됨</option>
              </select>
            </div>

            {/* 새로고침 버튼 */}
            <div className="flex items-end">
              <Button
                onClick={fetchAssignedMatches}
                disabled={loading}
                className="w-full"
              >
                {loading ? '새로고침 중...' : '🔄 새로고침'}
              </Button>
            </div>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">📊</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">총 배정 경기</dt>
                    <dd className="text-lg font-medium text-gray-900">{assignedMatches.length}경기</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">⏰</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">예정된 경기</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {assignedMatches.filter(m => m.status === 'scheduled').length}경기
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">✅</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">완료된 경기</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {assignedMatches.filter(m => m.status === 'completed').length}경기
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">🏟️</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">총 세션</dt>
                    <dd className="text-lg font-medium text-gray-900">{matchSessions.length}개</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 배정된 경기 목록 */}
        <div className="bg-white shadow-sm rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">배정된 경기 목록</h3>
            <p className="text-sm text-gray-500 mt-1">총 {assignedMatches.length}개의 배정된 경기</p>
          </div>

          {assignedMatches.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🤷‍♂️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">배정된 경기가 없습니다</h3>
              <p className="text-gray-500 mb-4">경기를 생성하고 배정해보세요</p>
              <Link href="/players">
                <Button>경기 생성하러 가기</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-1/12 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        회차
                      </th>
                      <th className="w-10/12 px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        팀 구성
                      </th>
                      <th className="w-1/12 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignedMatches.map((match) => (
                      <tr key={match.id} className="hover:bg-gray-50">
                        <td className="w-1/12 px-2 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {match.generated_match?.match_number}
                          </div>
                        </td>
                        <td className="w-10/12 px-6 py-4">
                          <div className="flex justify-center items-center gap-4">
                            {/* 팀 1 */}
                            <div className="flex items-center justify-center space-x-2 flex-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                              {getPlayerNameWithHighlight(match.generated_match?.team1_player1)}
                              <span className="text-gray-400">,</span>
                              {getPlayerNameWithHighlight(match.generated_match?.team1_player2)}
                            </div>
                            
                            {/* 팀 2 */}
                            <div className="flex items-center justify-center space-x-2 flex-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                              {getPlayerNameWithHighlight(match.generated_match?.team2_player1)}
                              <span className="text-gray-400">,</span>
                              {getPlayerNameWithHighlight(match.generated_match?.team2_player2)}
                            </div>
                          </div>
                        </td>
                        <td className="w-1/12 px-3 py-4 whitespace-nowrap text-center">
                          {getStatusBadge(match.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProtectedMatchResultsPage() {
  return (
    <RequireAuth>
      <MatchResultsPage />
    </RequireAuth>
  );
}
