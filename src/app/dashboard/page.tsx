'use client';

import { RequireAuth } from '@/components/AuthGuard';
import ClientDashboard from './ClientDashboard';
import AdminDashboard from './AdminDashboard';
import { useUser } from '@/hooks/useUser';
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface MatchRecord {
  id: string;
  matchNumber: number;
  date: string;
  result: 'win' | 'loss' | 'pending';
  score: string;
  teammates: string[];
  opponents: string[];
  isUserTeam1: boolean;
}

interface MatchHistory {
  id: string;
  match_date: string;
  match_number: number;
  session_name: string;
  result: 'win' | 'lose' | 'pending';
  score: string;
  my_team: 'team1' | 'team2';
  teammates: {
    id: string;
    name: string;
    skill_level: string;
  }[];
  opponents: {
    id: string;
    name: string;
    skill_level: string;
  }[];
  completed_at?: string;
}

interface WinLossStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface RankingStats {
  userId: string;
  name: string;
  skill_level: string;
  wins: number;
  totalMatches: number;
  winRate: number;
  attendanceCount: number;
}

interface OpponentStats extends WinLossStats {
  opponentName: string;
  opponentId: string;
  skill_level: string;
}

export default function DashboardPage() {
  const { user, profile, loading: userLoading, isAdmin } = useUser();
  const supabase = createClientComponentClient();
  
  // 상태 관리
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'history' | 'search'>('stats'); // stats를 첫 번째로 변경
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<MatchRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [myStats, setMyStats] = useState<WinLossStats>({ totalMatches: 0, wins: 0, losses: 0, winRate: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpponentStats[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [winRanking, setWinRanking] = useState<RankingStats[]>([]);
  const [attendanceRanking, setAttendanceRanking] = useState<RankingStats[]>([]);

  // 날짜 필터 변경 핸들러
  const handleDateFilter = (date: string) => {
    setSelectedDate(date);
    if (date === '') {
      setFilteredRecords(matchRecords);
    } else {
      const filtered = matchRecords.filter(record => record.date === date);
      setFilteredRecords(filtered);
    }
  };

  // 랭킹 데이터 조회
  const fetchRankings = async () => {
    try {
      // 1. 승률 랭킹 조회
      const { data: allProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, username, full_name, skill_level')
        .not('username', 'is', null)
        .not('full_name', 'is', null);

      if (profileError) {
        console.error('프로필 조회 실패:', profileError);
        return;
      }

      const rankingData: RankingStats[] = [];

      // 각 프로필의 경기 통계 계산
      for (const profile of allProfiles || []) {
        const { data: matches, error } = await supabase
          .from('generated_matches')
          .select('match_result, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
          .or(`team1_player1_id.eq.${profile.id},team1_player2_id.eq.${profile.id},team2_player1_id.eq.${profile.id},team2_player2_id.eq.${profile.id}`)
          .eq('status', 'completed')
          .not('match_result', 'is', null);

        if (error) continue;

        let wins = 0;
        let totalMatches = 0;

        matches?.forEach((match) => {
          const result = match.match_result as any;
          if (!result?.winner) return;

          totalMatches++;
          const isTeam1 = match.team1_player1_id === profile.id || match.team1_player2_id === profile.id;
          const myTeam = isTeam1 ? 'team1' : 'team2';
          
          if (result.winner === myTeam) {
            wins++;
          }
        });

        // 출석 통계 조회
        const { data: attendances, error: attendanceError } = await supabase
          .from('attendances')
          .select('id')
          .eq('user_id', profile.user_id)
          .in('status', ['출석', '레슨']);

        const attendanceCount = attendances?.length || 0;

        if (totalMatches > 0) {
          rankingData.push({
            userId: profile.user_id,
            name: profile.username || profile.full_name || '이름없음',
            skill_level: profile.skill_level || 'E2',
            wins,
            totalMatches,
            winRate: Math.round((wins / totalMatches) * 100),
            attendanceCount
          });
        }
      }

      // 승률 랭킹 (최소 3경기 이상, 승률 높은 순)
      const winRankingFiltered = rankingData
        .filter(player => player.totalMatches >= 3)
        .sort((a, b) => {
          if (b.winRate === a.winRate) return b.wins - a.wins; // 승률 같으면 승수로
          return b.winRate - a.winRate;
        })
        .slice(0, 5);

      // 출석 랭킹 (출석 수 높은 순)
      const attendanceRankingFiltered = rankingData
        .filter(player => player.attendanceCount > 0)
        .sort((a, b) => b.attendanceCount - a.attendanceCount)
        .slice(0, 5);

      setWinRanking(winRankingFiltered);
      setAttendanceRanking(attendanceRankingFiltered);

    } catch (error) {
      console.error('랭킹 조회 실패:', error);
    }
  };

  // 내 경기 내역 조회
  const fetchMatchHistory = async () => {
    if (!user || !profile) return;
    
    console.log('🔍 내 경기 내역 조회 시작...');
    setLoading(true);

    try {
      // 내 프로필 ID로 참여한 모든 generated_matches 조회
      const { data: matches, error } = await supabase
        .from('generated_matches')
        .select(`
          id,
          match_number,
          status,
          match_result,
          created_at,
          team1_player1:profiles!team1_player1_id(id, user_id, username, full_name, skill_level),
          team1_player2:profiles!team1_player2_id(id, user_id, username, full_name, skill_level),
          team2_player1:profiles!team2_player1_id(id, user_id, username, full_name, skill_level),
          team2_player2:profiles!team2_player2_id(id, user_id, username, full_name, skill_level),
          match_sessions(
            session_name,
            session_date
          )
        `)
        .or(`team1_player1_id.eq.${profile.id},team1_player2_id.eq.${profile.id},team2_player1_id.eq.${profile.id},team2_player2_id.eq.${profile.id}`)
        .eq('status', 'completed')
        .not('match_result', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('경기 내역 조회 실패:', error);
        return;
      }

      console.log('조회된 경기 수:', matches?.length || 0);

      // 경기 내역 데이터 변환
      const historyData: MatchHistory[] = [];
      const records: MatchRecord[] = [];
      let totalWins = 0;
      let totalLosses = 0;

      matches?.forEach((match) => {
        if (!match.match_result) return;

        const result = match.match_result as any;
        const session = match.match_sessions?.[0];
        
        // 내가 어느 팀인지 확인
        const isTeam1 = match.team1_player1?.user_id === user.id || match.team1_player2?.user_id === user.id;
        const myTeam = isTeam1 ? 'team1' : 'team2';
        
        // 승패 결정
        const matchResult = result.winner === myTeam ? 'win' : 'lose';
        if (matchResult === 'win') totalWins++;
        else totalLosses++;

        // 팀메이트와 상대방 정보
        const teammates = isTeam1 
          ? [match.team1_player1, match.team1_player2].filter(p => p?.user_id !== user.id)
          : [match.team2_player1, match.team2_player2].filter(p => p?.user_id !== user.id);
        
        const opponents = isTeam1
          ? [match.team2_player1, match.team2_player2]
          : [match.team1_player1, match.team1_player2];

        const matchDate = session?.session_date || match.created_at.split('T')[0];

        // 기존 상세 데이터 (MatchHistory)
        historyData.push({
          id: match.id,
          match_date: matchDate,
          match_number: match.match_number,
          session_name: session?.session_name || '세션 정보 없음',
          result: matchResult,
          score: result.score || '점수 없음',
          my_team: myTeam,
          teammates: teammates.map(p => ({
            id: p?.id || '',
            name: p?.username || p?.full_name || '미정',
            skill_level: p?.skill_level || 'E2'
          })),
          opponents: opponents.map(p => ({
            id: p?.id || '',
            name: p?.username || p?.full_name || '미정',
            skill_level: p?.skill_level || 'E2'
          })),
          completed_at: result.completed_at
        });

        // 테이블용 간단한 데이터 (MatchRecord)
        const getPlayerNames = (players: any[]) => 
          players
            .filter(p => p && p.user_id !== user.id) // 나 제외
            .map(p => p.username || p.full_name || '미정');

        records.push({
          id: match.id,
          matchNumber: match.match_number,
          date: matchDate,
          result: matchResult === 'win' ? 'win' : 'loss',
          score: result.score || '',
          teammates: getPlayerNames(teammates),
          opponents: getPlayerNames(opponents),
          isUserTeam1: isTeam1
        });
      });

      setMatchHistory(historyData);
      setMatchRecords(records);
      setFilteredRecords(records);
      
      // 통계 계산
      const totalMatches = totalWins + totalLosses;
      const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
      
      setMyStats({
        totalMatches,
        wins: totalWins,
        losses: totalLosses,
        winRate
      });

      console.log(`✅ 경기 내역 조회 완료: ${historyData.length}경기`);
      
    } catch (error) {
      console.error('경기 내역 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 상대방 검색
  const searchOpponent = async () => {
    if (!searchQuery.trim() || !user || !profile) return;
    
    setSearchLoading(true);
    try {
      // 검색어로 프로필 찾기
      const { data: searchProfiles, error: searchError } = await supabase
        .from('profiles')
        .select('id, user_id, username, full_name, skill_level')
        .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
        .neq('user_id', user.id) // 본인 제외
        .limit(10);

      if (searchError) {
        console.error('상대방 검색 실패:', searchError);
        return;
      }

      const opponentStats: OpponentStats[] = [];

      // 각 검색된 프로필에 대해 승부 기록 계산
      for (const opponent of searchProfiles || []) {
        console.log(`🔍 ${opponent.username || opponent.full_name}과의 경기 조회 중...`);
        
        // 해당 상대방과 함께한 경기들 조회 (수정된 쿼리)
        const { data: vsMatches, error: vsError } = await supabase
          .from('generated_matches')
          .select(`
            id,
            match_result,
            team1_player1_id,
            team1_player2_id,
            team2_player1_id,
            team2_player2_id
          `)
          .eq('status', 'completed')
          .not('match_result', 'is', null)
          .or(`team1_player1_id.eq.${profile.id},team1_player2_id.eq.${profile.id},team2_player1_id.eq.${profile.id},team2_player2_id.eq.${profile.id}`)
          .or(`team1_player1_id.eq.${opponent.id},team1_player2_id.eq.${opponent.id},team2_player1_id.eq.${opponent.id},team2_player2_id.eq.${opponent.id}`);

        if (vsError) {
          console.error(`${opponent.username}과의 경기 조회 실패:`, vsError);
          continue;
        }
        
        console.log(`📊 ${opponent.username || opponent.full_name}과의 경기 수: ${vsMatches?.length || 0}`);

        let wins = 0;
        let losses = 0;

        // 각 경기에서 승패 계산 (나와 상대방이 함께 있는 경기만)
        vsMatches?.forEach((match) => {
          const result = match.match_result as any;
          if (!result?.winner) return;

          // 내가 어느 팀인지 확인
          const isMyTeam1 = match.team1_player1_id === profile.id || match.team1_player2_id === profile.id;
          const myTeam = isMyTeam1 ? 'team1' : 'team2';
          
          // 상대방이 어느 팀인지 확인
          const isOpponentTeam1 = match.team1_player1_id === opponent.id || match.team1_player2_id === opponent.id;
          const opponentTeam = isOpponentTeam1 ? 'team1' : 'team2';
          
          // 나와 상대방이 같은 경기에 있지만 다른 팀에 있는 경우만 계산
          if (myTeam !== opponentTeam) {
            if (result.winner === myTeam) {
              wins++;
            } else {
              losses++;
            }
          }
        });

        console.log(`🏆 ${opponent.username || opponent.full_name}: ${wins}승 ${losses}패`);

        const totalMatches = wins + losses;
        if (totalMatches > 0) {
          opponentStats.push({
            opponentName: opponent.username || opponent.full_name || '이름 없음',
            opponentId: opponent.id,
            skill_level: opponent.skill_level || 'E2',
            totalMatches,
            wins,
            losses,
            winRate: Math.round((wins / totalMatches) * 100)
          });
        }
      }

      // 경기 수가 많은 순으로 정렬
      opponentStats.sort((a, b) => b.totalMatches - a.totalMatches);
      setSearchResults(opponentStats);
      
    } catch (error) {
      console.error('상대방 검색 중 오류:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile) {
      fetchMatchHistory();
      fetchRankings(); // 랭킹 데이터도 함께 조회
    }
  }, [user, profile]);

  // 로딩 중
  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 미로그인
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">로그인이 필요합니다.</p>
          <Link href="/login">
            <Button>로그인하기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 min-h-screen">
      {/* 상단 헤더 */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg shadow-md p-6 mb-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            🏆 나의 경기 현황         </h1>
          <Link href="/" className="text-white hover:text-purple-100 transition-colors">
            🏠 홈
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm mb-4">
          <span className="bg-purple-200 text-purple-800 px-3 py-1 rounded-full">
            {profile?.username || profile?.full_name || '회원'}님
          </span>
          <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
            레벨: {profile?.skill_level}급
          </span>
        </div>
        <p className="text-purple-100">
          나의 경기 기록과 통계를 확인하고 상대방별 승부 기록을 검색해보세요! 📊
        </p>
      </div>

      {/* 탭 메뉴 */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            � 승률
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            � 내역
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🔍 검색
          </button>
        </div>

        {/* 탭 내용 */}
        <div className="p-6">
          {/* 승률 통계 탭 */}
          {activeTab === 'stats' && (
            <div>
              <h2 className="text-xl font-semibold mb-6 text-gray-900">📊 나의 승률 통계</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-blue-50 p-6 rounded-lg text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{myStats.totalMatches}</div>
                  <div className="text-blue-600">총 경기수</div>
                </div>
                <div className="bg-green-50 p-6 rounded-lg text-center">
                  <div className="text-3xl font-bold text-green-900 mb-2">{myStats.wins}</div>
                  <div className="text-green-600">승리</div>
                </div>
                <div className="bg-red-50 p-6 rounded-lg text-center">
                  <div className="text-3xl font-bold text-red-900 mb-2">{myStats.losses}</div>
                  <div className="text-red-600">패배</div>
                </div>
                <div className="bg-purple-50 p-6 rounded-lg text-center">
                  <div className="text-3xl font-bold text-purple-900 mb-2">{myStats.winRate}%</div>
                  <div className="text-purple-600">승률</div>
                </div>
              </div>

              {/* 승률 그래프 */}
              {myStats.totalMatches > 0 && (
                <div className="bg-gray-50 p-6 rounded-lg mb-6">
                  <h3 className="text-lg font-semibold mb-4">승부 기록</h3>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                        style={{ width: `${myStats.winRate}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{myStats.winRate}%</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>🏆 {myStats.wins}승</span>
                    <span>😔 {myStats.losses}패</span>
                  </div>
                </div>
              )}

              {/* 승률 평가 */}
              {myStats.totalMatches > 0 && (
                <div className="p-4 bg-purple-50 rounded-lg mb-8">
                  <h4 className="font-semibold text-purple-800 mb-2">📈 승률 평가</h4>
                  <p className="text-purple-700">
                    {myStats.winRate >= 70 ? '🔥 우수한 성과입니다!' :
                     myStats.winRate >= 50 ? '👍 좋은 성과입니다!' :
                     '💪 더 좋은 결과를 위해 화이팅!'}
                  </p>
                </div>
              )}

              {/* 랭킹 섹션 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 승률 랭킹 */}
                <div className="bg-white border rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 text-green-700 flex items-center gap-2">
                    🏆 승률 랭킹 TOP 5
                  </h3>
                  {winRanking.length > 0 ? (
                    <div className="space-y-3">
                      {winRanking.map((player, index) => (
                        <div key={player.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                              index === 0 ? 'bg-yellow-400 text-yellow-900' :
                              index === 1 ? 'bg-gray-300 text-gray-700' :
                              index === 2 ? 'bg-orange-400 text-orange-900' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{player.name}</div>
                              <div className="text-sm text-gray-500">{player.skill_level}급</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-600">{player.winRate}%</div>
                            <div className="text-sm text-gray-500">{player.wins}승/{player.totalMatches}경기</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <div className="text-4xl mb-2">🏸</div>
                      <p>충분한 경기 데이터가 없습니다</p>
                      <p className="text-sm">(최소 3경기 필요)</p>
                    </div>
                  )}
                </div>

                {/* 출석 랭킹 */}
                <div className="bg-white border rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 text-blue-700 flex items-center gap-2">
                    📅 출석 랭킹 TOP 5
                  </h3>
                  {attendanceRanking.length > 0 ? (
                    <div className="space-y-3">
                      {attendanceRanking.map((player, index) => (
                        <div key={player.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                              index === 0 ? 'bg-yellow-400 text-yellow-900' :
                              index === 1 ? 'bg-gray-300 text-gray-700' :
                              index === 2 ? 'bg-orange-400 text-orange-900' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{player.name}</div>
                              <div className="text-sm text-gray-500">{player.skill_level}급</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-blue-600">{player.attendanceCount}회</div>
                            <div className="text-sm text-gray-500">출석</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <div className="text-4xl mb-2">📅</div>
                      <p>출석 데이터가 없습니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 경기 내역 탭 */}
          {activeTab === 'history' && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900">📋 내 경기 내역</h2>
              
              {/* 날짜 필터 */}
              <div className="mb-6 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">날짜 필터:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {selectedDate && (
                  <button
                    onClick={() => handleDateFilter('')}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                  >
                    전체 보기
                  </button>
                )}
              </div>

              {/* 경기 내역 테이블 */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p>경기 내역을 불러오는 중...</p>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏸</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {selectedDate ? '선택한 날짜에 경기 내역이 없습니다' : '아직 완료된 경기가 없습니다'}
                  </h3>
                  <p className="text-gray-600">
                    {selectedDate ? '다른 날짜를 선택해보세요.' : '경기를 완료하면 결과가 여기에 표시됩니다.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full bg-white rounded-lg border">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          경기번호
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          경기일
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          승패
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          점수
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          파트너
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          상대방1
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          상대방2
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{record.matchNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(record.date).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              record.result === 'win' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {record.result === 'win' ? '🏆 승' : '😞 패'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-mono">
                            {record.score}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.teammates[0] || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.opponents[0] || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.opponents[1] || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 상대방 검색 탭 */}
          {activeTab === 'search' && (
            <div>
              <h2 className="text-xl font-semibold mb-6 text-gray-900">🔍 상대방별 승부 기록</h2>
              
              {/* 검색 입력 */}
              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  placeholder="상대방 이름을 입력하세요..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchOpponent()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <Button onClick={searchOpponent} disabled={searchLoading || !searchQuery.trim()}>
                  {searchLoading ? '검색 중...' : '🔍 검색'}
                </Button>
              </div>

              {/* 검색 결과 */}
              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">검색 결과</h3>
                  {searchResults.map((opponent) => (
                    <div key={opponent.opponentId} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">{opponent.opponentName}</h4>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded">
                              {opponent.skill_level}급
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            총 {opponent.totalMatches}경기 | {opponent.wins}승 {opponent.losses}패
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className={`text-2xl font-bold mb-1 ${
                            opponent.winRate >= 50 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {opponent.winRate}%
                          </div>
                          <div className="text-sm text-gray-500">
                            {opponent.winRate >= 50 ? '우세' : '열세'}
                          </div>
                        </div>
                      </div>

                      {/* 승률 바 */}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              opponent.winRate >= 50 ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'
                            }`}
                            style={{ width: `${opponent.winRate}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-600 w-12">{opponent.winRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searchLoading && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🤷‍♀️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">검색 결과가 없습니다</h3>
                  <p className="text-gray-600">다른 이름으로 검색해보세요.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 새로고침 버튼 */}
      <div className="text-center">
        <Button 
          onClick={() => {
            fetchMatchHistory();
            fetchRankings();
          }} 
          disabled={loading}
          variant="outline"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              새로고침 중...
            </>
          ) : (
            '🔄 새로고침'
          )}
        </Button>
      </div>
    </div>
  );
}
