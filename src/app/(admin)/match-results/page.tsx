'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { RequireAdmin } from '@/components/AuthGuard';
import { Button } from '@/components/ui/button';
import { DEFAULT_MATCH_WAGER, MAX_MATCH_WAGER } from '@/lib/coins';
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
    id: number;
    match_number: number;
    status?: string;
    completed_at?: string | null;
    match_result?: {
      winner?: 'team1' | 'team2';
      score?: string;
      team1_score?: number;
      team2_score?: number;
      completed_at?: string;
      recorded_by?: string;
    } | null;
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
  
  const supabase = getSupabaseClient();

  useEffect(() => {
    fetchCurrentUser();
    fetchAssignedMatches();
    fetchMatchSessions();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error) throw error;
      const user = session?.user ?? null;
      
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
          generated_match_id,
          match_date,
          start_time,
          end_time,
          location,
          status,
          description,
          max_participants,
          current_participants
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

      const { data: schedules, error } = await query;

      if (error) throw error;

      if (!schedules || schedules.length === 0) {
        setAssignedMatches([]);
        return;
      }

      const generatedMatchIds = Array.from(
        new Set(
          schedules
            .map((s) => s.generated_match_id)
            .filter((id): id is number => typeof id === 'number')
        )
      );

      const generatedMatchesById = new Map();

      if (generatedMatchIds.length > 0) {
        const { data: genMatches, error: genMatchesError } = await supabase
          .from('generated_matches')
          .select(`
            id,
            match_number,
            session_id,
            status,
            completed_at,
            match_result,
            team1_player1_id,
            team1_player2_id,
            team2_player1_id,
            team2_player2_id
          `)
          .in('id', generatedMatchIds);

        if (genMatchesError) throw genMatchesError;

        (genMatches || []).forEach((match) => {
          generatedMatchesById.set(match.id, match);
        });
      }

      // 플레이어 정보와 세션 정보를 벌크로 가져오기
      const allPlayerIds = new Set<string>();
      const allSessionIds = new Set<string>();

      generatedMatchesById.forEach((match) => {
        if (match.team1_player1_id) allPlayerIds.add(match.team1_player1_id);
        if (match.team1_player2_id) allPlayerIds.add(match.team1_player2_id);
        if (match.team2_player1_id) allPlayerIds.add(match.team2_player1_id);
        if (match.team2_player2_id) allPlayerIds.add(match.team2_player2_id);
        if (match.session_id) allSessionIds.add(match.session_id);
      });

      const playersById = new Map();
      if (allPlayerIds.size > 0) {
        const { data: players, error: playersError } = await supabase
          .from('profiles')
          .select('id, username, full_name, skill_level')
          .in('id', Array.from(allPlayerIds));

        if (playersError) throw playersError;

        (players || []).forEach((p) => {
          playersById.set(p.id, p);
        });
      }

      const sessionsById = new Map();
      if (allSessionIds.size > 0) {
        const { data: sessions, error: sessionsError } = await supabase
          .from('match_sessions')
          .select('id, session_name, session_date')
          .in('id', Array.from(allSessionIds));

        if (sessionsError) throw sessionsError;

        (sessions || []).forEach((s) => {
          sessionsById.set(s.id, s);
        });
      }

      const matchesWithDetails = [];
      
      for (const match of schedules) {
        if (!match.generated_match_id) continue;

        const generatedMatch = generatedMatchesById.get(match.generated_match_id);
        if (!generatedMatch) continue;

        const getPlayer = (id: string) => 
          playersById.get(id) || { username: '미정', full_name: '미정', skill_level: 'E2' };

        const session = generatedMatch.session_id
          ? sessionsById.get(generatedMatch.session_id)
          : null;

        const formattedMatch = {
          id: match.id,
          match_date: match.match_date || '',
          start_time: match.start_time || '',
          end_time: match.end_time || '',
          location: match.location || '',
          status: match.status,
          description: match.description || '',
          max_participants: match.max_participants,
          current_participants: match.current_participants,
          generated_match: {
            id: generatedMatch.id,
            match_number: generatedMatch.match_number,
            status: generatedMatch.status,
            completed_at: generatedMatch.completed_at,
            match_result: generatedMatch.match_result,
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

      setAssignedMatches(finalMatches as AssignedMatch[]);
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

  // 결과 제출 컴포넌트
  function MatchResultRow({ match, onSaved }: { match: AssignedMatch, onSaved: () => void }) {
    const [team1Score, setTeam1Score] = useState<number>(match.generated_match?.match_result?.team1_score || 0);
    const [team2Score, setTeam2Score] = useState<number>(match.generated_match?.match_result?.team2_score || 0);
    const [submitting, setSubmitting] = useState(false);

    const submitResult = async () => {
      if (!match || !match.generated_match) return;

      if (team1Score === team2Score) {
        alert('무승부는 저장할 수 없습니다.');
        return;
      }

      setSubmitting(true);
      try {
        const payload = {
          match_id: match.generated_match.id,
          winner_team1: team1Score > team2Score,
          team1_score: team1Score,
          team2_score: team2Score
        };

        const res = await fetch('/api/match-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || '결과 저장 중 오류');

        alert(
          `결과 저장 완료\n기본 배팅 ${DEFAULT_MATCH_WAGER}코인, 최대 ${MAX_MATCH_WAGER}코인 규칙으로 정산되었습니다.`
        );

        // 저장 후 목록 새로고침
        onSaved();
      } catch (err) {
        console.error('결과 저장 오류:', err);
        alert('결과 저장에 실패했습니다. 콘솔을 확인하세요.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex flex-col items-center justify-center gap-3">
        {match.generated_match?.match_result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            저장된 결과: {match.generated_match.match_result.winner === 'team1' ? '라켓팀' : '셔틀팀'} 승
            {' · '}
            {match.generated_match.match_result.score || `${team1Score}:${team2Score}`}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={team1Score}
            onChange={(e) => setTeam1Score(Number(e.target.value))}
            className="w-20 px-2 py-1 border rounded" />
          <span className="text-sm text-gray-500">vs</span>
          <input
            type="number"
            value={team2Score}
            onChange={(e) => setTeam2Score(Number(e.target.value))}
            className="w-20 px-2 py-1 border rounded" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            기본 {DEFAULT_MATCH_WAGER}코인 · 최대 {MAX_MATCH_WAGER}코인
          </span>
          <Button onClick={submitResult} disabled={submitting}>
            {submitting ? '저장 중...' : match.generated_match?.match_result ? '결과 수정' : '결과 저장'}
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
        <div className="w-full px-2 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-6 lg:px-8">
        {/* 상단 제목 */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl font-semibold sm:text-2xl">📋 배정 현황 확인</h1>
          <p className="mt-2 hidden text-sm text-gray-600 sm:block">
            관리자 확인용 화면입니다. 기본 배팅은 {DEFAULT_MATCH_WAGER}코인이고, 사용자는 경기별로 최대 {MAX_MATCH_WAGER}코인까지 올릴 수 있습니다.
          </p>
        </div>

        {/* 필터 컨트롤 */}
        <div className="mb-4 rounded-lg bg-white p-3 shadow-sm sm:mb-6 sm:p-6">
          <h3 className="mb-3 text-base font-medium text-gray-900 sm:mb-4 sm:text-lg">🔍 필터 설정</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
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
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-6 sm:gap-6 md:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-3 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">📊</div>
                </div>
                <div className="ml-3 w-0 flex-1 sm:ml-5">
                  <dl>
                    <dt className="truncate text-xs font-medium text-gray-500 sm:text-sm">총 배정 경기</dt>
                    <dd className="text-sm font-medium text-gray-900 sm:text-lg">{assignedMatches.length}경기</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-3 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">⏰</div>
                </div>
                <div className="ml-3 w-0 flex-1 sm:ml-5">
                  <dl>
                    <dt className="truncate text-xs font-medium text-gray-500 sm:text-sm">예정된 경기</dt>
                    <dd className="text-sm font-medium text-gray-900 sm:text-lg">
                      {assignedMatches.filter(m => m.status === 'scheduled').length}경기
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-3 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">✅</div>
                </div>
                <div className="ml-3 w-0 flex-1 sm:ml-5">
                  <dl>
                    <dt className="truncate text-xs font-medium text-gray-500 sm:text-sm">완료된 경기</dt>
                    <dd className="text-sm font-medium text-gray-900 sm:text-lg">
                      {assignedMatches.filter(m => m.status === 'completed').length}경기
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-3 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">🏟️</div>
                </div>
                <div className="ml-3 w-0 flex-1 sm:ml-5">
                  <dl>
                    <dt className="truncate text-xs font-medium text-gray-500 sm:text-sm">총 세션</dt>
                    <dd className="text-sm font-medium text-gray-900 sm:text-lg">{matchSessions.length}개</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 배정된 게임 목록 */}
        <div className="rounded-lg bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
            <h3 className="text-base font-medium text-gray-900 sm:text-lg">배정된 게임 목록</h3>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">총 {assignedMatches.length}개의 배정된 게임</p>
          </div>

          {assignedMatches.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🤷‍♂️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">배정된 게임이 없습니다</h3>
              <p className="text-gray-500 mb-4">게임을 생성하고 배정해보세요</p>
              <Link href="/players">
                <Button>게임 생성하러 가기</Button>
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
                        <td className="w-1/12 px-2 py-4 whitespace-nowrap text-center align-top">
                          <div className="text-sm font-medium text-gray-900">
                            {match.generated_match?.match_number}
                          </div>
                        </td>
                        <td className="w-10/12 px-6 py-4 align-top">
                          <div className="flex flex-col gap-2">
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

                            {/* 결과 입력 UI */}
                            <MatchResultRow
                              match={match}
                              onSaved={() => fetchAssignedMatches()}
                            />
                          </div>
                        </td>
                        <td className="w-1/12 px-3 py-4 whitespace-nowrap text-center align-top">
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
    <RequireAdmin>
      <MatchResultsPage />
    </RequireAdmin>
  );
}
