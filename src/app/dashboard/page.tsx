'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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

interface OpponentStats extends WinLossStats {
  opponentName: string;
  opponentId: string;
  skill_level: string;
}

// 프로필 타입 정의 추가
interface ProfileData {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  skill_level: string | null;
}

export default function DashboardPage() {
  const { user, profile, loading: userLoading } = useUser();
  const supabase = createClientComponentClient();
  
  // 상태 관리
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'stats' | 'search'>('history');
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [myStats, setMyStats] = useState<WinLossStats>({ totalMatches: 0, wins: 0, losses: 0, winRate: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpponentStats[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

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
      let totalWins = 0;
      let totalLosses = 0;

      matches?.forEach((match) => {
        if (!match.match_result) return;

        const result = match.match_result as any;
        const session = match.match_sessions?.[0];
        
        // 🔧 안전한 타입 처리
        const team1_player1 = Array.isArray(match.team1_player1) 
          ? match.team1_player1[0] as ProfileData
          : match.team1_player1 as ProfileData;
        const team1_player2 = Array.isArray(match.team1_player2) 
          ? match.team1_player2[0] as ProfileData
          : match.team1_player2 as ProfileData;
        const team2_player1 = Array.isArray(match.team2_player1) 
          ? match.team2_player1[0] as ProfileData
          : match.team2_player1 as ProfileData;
        const team2_player2 = Array.isArray(match.team2_player2) 
          ? match.team2_player2[0] as ProfileData
          : match.team2_player2 as ProfileData;

        // null 체크 추가
        if (!team1_player1 || !team1_player2 || !team2_player1 || !team2_player2) {
          console.warn('일부 플레이어 정보가 누락된 경기 건너뜀:', match.id);
          return;
        }

        // 내가 어느 팀인지 확인
        const isTeam1 = team1_player1?.user_id === user.id || team1_player2?.user_id === user.id;
        const myTeam = isTeam1 ? 'team1' : 'team2';
        
        // 승패 결정
        const matchResult = result.winner === myTeam ? 'win' : 'lose';
        if (matchResult === 'win') totalWins++;
        else totalLosses++;

        // 팀메이트와 상대방 정보
        const teammates = isTeam1 
          ? [team1_player1, team1_player2].filter(p => p?.user_id !== user.id)
          : [team2_player1, team2_player2].filter(p => p?.user_id !== user.id);
        
        const opponents = isTeam1
          ? [team2_player1, team2_player2]
          : [team1_player1, team1_player2];

        historyData.push({
          id: match.id,
          match_date: session?.session_date || match.created_at.split('T')[0],
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
      });

      setMatchHistory(historyData);
      
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
        // 해당 상대방과 함께한 경기들 조회 - 쿼리 단순화
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
          .not('match_result', 'is', null);

        if (vsError) {
          console.error(`${opponent.username}과의 경기 조회 실패:`, vsError);
          continue;
        }

        let wins = 0;
        let losses = 0;

        // 각 경기에서 승패 계산
        vsMatches?.forEach((match) => {
          // 내가 참여한 경기인지 확인
          const isMyMatch = match.team1_player1_id === profile.id || 
                           match.team1_player2_id === profile.id ||
                           match.team2_player1_id === profile.id || 
                           match.team2_player2_id === profile.id;
          
          // 상대방이 참여한 경기인지 확인
          const isOpponentMatch = match.team1_player1_id === opponent.id || 
                                 match.team1_player2_id === opponent.id ||
                                 match.team2_player1_id === opponent.id || 
                                 match.team2_player2_id === opponent.id;
          
          if (!isMyMatch || !isOpponentMatch) return;
          
          const result = match.match_result as any;
          if (!result?.winner) return;

          // 내가 어느 팀인지 확인
          const isMyTeam1 = match.team1_player1_id === profile.id || match.team1_player2_id === profile.id;
          const myTeam = isMyTeam1 ? 'team1' : 'team2';
          
          if (result.winner === myTeam) {
            wins++;
          } else {
            losses++;
          }
        });

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
            🏆 나의 경기 대시보드
          </h1>
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
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 경기 내역
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📊 승률 통계
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🔍 상대방 검색
          </button>
        </div>

        {/* 탭 내용 */}
        <div className="p-6">
          {/* 경기 내역 탭 */}
          {activeTab === 'history' && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900">📋 내 경기 내역</h2>
              
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p>경기 내역을 불러오는 중...</p>
                </div>
              ) : matchHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏸</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">완료된 경기가 없습니다</h3>
                  <p className="text-gray-600">경기에 참여하고 결과를 기록해보세요!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {matchHistory.map((match) => (
                    <div key={match.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* 경기 기본 정보 */}
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-lg font-bold text-gray-900">#{match.match_number}</span>
                            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                              match.result === 'win' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {match.result === 'win' ? '🏆 승리' : '😔 패배'}
                            </span>
                            <span className="text-sm text-gray-500">
                              {new Date(match.match_date).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600 mb-2">
                            📍 {match.session_name} | 📊 {match.score}
                          </div>

                          {/* 팀 구성 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className={`p-2 rounded border-l-4 ${
                              match.my_team === 'team1' ? 'bg-blue-50 border-blue-400' : 'bg-gray-100 border-gray-300'
                            }`}>
                              <div className="font-medium text-blue-700 mb-1">
                                {match.my_team === 'team1' ? '👤 내 팀' : '상대 팀'} (라켓팀)
                              </div>
                              <div className="space-y-1">
                                {match.my_team === 'team1' && (
                                  <div className="font-semibold">나 ({profile?.skill_level}급)</div>
                                )}
                                {(match.my_team === 'team1' ? match.teammates : match.opponents).map((player, idx) => (
                                  <div key={idx} className={match.my_team === 'team1' ? 'text-blue-700' : 'text-gray-600'}>
                                    {player.name} ({player.skill_level}급)
                                  </div>
                                ))}
                                {match.my_team !== 'team1' && (
                                  <div className="font-semibold">나 ({profile?.skill_level}급)</div>
                                )}
                              </div>
                            </div>

                            <div className={`p-2 rounded border-l-4 ${
                              match.my_team === 'team2' ? 'bg-red-50 border-red-400' : 'bg-gray-100 border-gray-300'
                            }`}>
                              <div className="font-medium text-red-700 mb-1">
                                {match.my_team === 'team2' ? '👤 내 팀' : '상대 팀'} (셔틀팀)
                              </div>
                              <div className="space-y-1">
                                {match.my_team === 'team2' && (
                                  <div className="font-semibold">나 ({profile?.skill_level}급)</div>
                                )}
                                {(match.my_team === 'team2' ? match.teammates : match.opponents).map((player, idx) => (
                                  <div key={idx} className={match.my_team === 'team2' ? 'text-red-700' : 'text-gray-600'}>
                                    {player.name} ({player.skill_level}급)
                                  </div>
                                ))}
                                {match.my_team !== 'team2' && (
                                  <div className="font-semibold">나 ({profile?.skill_level}급)</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 완료 시간 */}
                        {match.completed_at && (
                          <div className="text-xs text-gray-500 md:text-right">
                            완료: {new Date(match.completed_at).toLocaleString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 승률 통계 탭 */}
          {activeTab === 'stats' && (
            <div>
              <h2 className="text-xl font-semibold mb-6 text-gray-900">📊 나의 승률 통계</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                <div className="bg-gray-50 p-6 rounded-lg">
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
                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-2">📈 승률 평가</h4>
                  <p className="text-purple-700">
                    {myStats.winRate >= 70 ? '🔥 우수한 성과입니다!' :
                     myStats.winRate >= 50 ? '👍 좋은 성과입니다!' :
                     '💪 더 좋은 결과를 위해 화이팅!'}
                  </p>
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
          onClick={fetchMatchHistory} 
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
