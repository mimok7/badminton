'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '../../hooks/useUser';
import { createBalancedDoublesMatches, createMixedDoublesMatches } from '../../utils/match-utils';
import RequireAuth from '../../../components/RequireAuth';

// 타입 정의
interface ExtendedPlayer {
  id: string;
  name: string;
  skill_level: string;
  skill_label?: string;
  gender: string;
  status: 'present' | 'lesson' | 'absent';
}

interface MatchSession {
  id: string;
  session_name: string;
  total_matches: number;
  assigned_matches: number;
  created_at: string;
}

interface GeneratedMatch {
  id: string;
  match_number: number;
  team1_player1: { name: string; skill_level: string };
  team1_player2: { name: string; skill_level: string };
  team2_player1: { name: string; skill_level: string };
  team2_player2: { name: string; skill_level: string };
  is_scheduled: boolean;
}

// 상수 정의
const LEVEL_LABELS: Record<string, string> = {
  a1: '랍스터', a2: '랍스터',
  b1: '소갈비', b2: '소갈비', 
  c1: '돼지갈비', c2: '돼지갈비',
  d1: '양갈비', d2: '양갈비',
  e1: '닭갈비', e2: '닭갈비',
  'n': 'N (미지정)'
};

function PlayersPage() {
  const supabase = createClientComponentClient();
  const { user, profile, loading: authLoading, isAdmin } = useUser();
  
  // 상태 정의
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [perPlayerMinGames, setPerPlayerMinGames] = useState(1);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('scheduled');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [generatedMatches, setGeneratedMatches] = useState<GeneratedMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [selectedAssignDate, setSelectedAssignDate] = useState('');
  const [availableDates, setAvailableDates] = useState<any[]>([]);

  // Utility functions
  const fetchTodayPlayers = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: attendanceData, error } = await supabase
        .from('attendances')
        .select(`
          user_id,
          status,
          profiles!inner (
            id,
            name,
            skill_level,
            gender
          )
        `)
        .eq('date', today);

      if (error) throw error;

      const playersWithLabels = attendanceData.map((attendance: any) => ({
        id: attendance.user_id,
        name: attendance.profiles.name,
        skill_level: attendance.profiles.skill_level || 'e2',
        skill_label: LEVEL_LABELS[attendance.profiles.skill_level?.toLowerCase()] || 'E2 (초급)',
        gender: attendance.profiles.gender,
        status: attendance.status
      }));

      setTodayPlayers(playersWithLabels);
    } catch (error) {
      console.error('오늘 선수 데이터 로딩 오류:', error);
      setTodayPlayers([]);
    }
  }, [supabase]);

  const fetchMatchSessions = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('created_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMatchSessions(data || []);
    } catch (error) {
      console.error('경기 세션 로딩 오류:', error);
      setMatchSessions([]);
    }
  }, [supabase]);

  const fetchAvailableDates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('match_schedules')
        .select('*')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      
      const dateInfos = data.map(schedule => ({
        date: schedule.date,
        location: schedule.location,
        availableSlots: schedule.max_participants - schedule.current_participants,
        timeRange: `${schedule.start_time} - ${schedule.end_time}`
      })).filter(info => info.availableSlots > 0);

      setAvailableDates(dateInfos);
    } catch (error) {
      console.error('가능한 날짜 로딩 오류:', error);
      setAvailableDates([]);
    }
  }, [supabase]);

  const fetchGeneratedMatches = useCallback(async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('generated_matches')
        .select('*')
        .eq('session_id', sessionId)
        .order('match_number', { ascending: true });

      if (error) throw error;
      setGeneratedMatches(data || []);
    } catch (error) {
      console.error('생성된 경기 로딩 오류:', error);
      setGeneratedMatches([]);
    }
  }, [supabase]);

  const calculatePlayerGameCounts = (matches: any[]) => {
    const counts: Record<string, number> = {};
    
    matches.forEach(match => {
      const players = [
        match.team1?.player1,
        match.team1?.player2, 
        match.team2?.player1,
        match.team2?.player2
      ];
      
      players.forEach(player => {
        if (player && typeof player === 'object' && player.name) {
          counts[player.name] = (counts[player.name] || 0) + 1;
        } else if (typeof player === 'string') {
          counts[player] = (counts[player] || 0) + 1;
        }
      });
    });
    
    return counts;
  };

  const normalizeLevel = (level: string): string => {
    if (!level || typeof level !== 'string') return 'e2';
    return level.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  // 초기 데이터 로딩
  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      fetchTodayPlayers();
      fetchMatchSessions();
      fetchAvailableDates();
    }
  }, [authLoading, user, isAdmin, fetchTodayPlayers, fetchMatchSessions, fetchAvailableDates]);

  // 경기 생성 핸들러
  const handleAssignByLevel = async () => {
    if (!todayPlayers) return;

    setLoading(true);
    try {
      const presentPlayers = todayPlayers.filter(p => p.status === 'present');
      if (presentPlayers.length < 4) {
        alert('경기를 생성하려면 최소 4명의 출석자가 필요합니다.');
        return;
      }

      const playersForMatch = presentPlayers.map(player => ({
        ...player,
        skill_level: normalizeLevel(player.skill_level)
      }));

      const generatedMatches = createBalancedDoublesMatches(playersForMatch);
      
      if (generatedMatches.length === 0) {
        alert('균형잡힌 경기를 생성할 수 없습니다.');
        return;
      }

      setMatches(generatedMatches);
      setPlayerGameCounts(calculatePlayerGameCounts(generatedMatches));
      
      console.log(`✅ 레벨별 경기 생성 완료: ${generatedMatches.length}경기`);
    } catch (error) {
      console.error('❌ 레벨별 경기 생성 중 오류:', error);
      alert(`레벨별 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const assignMatchesRandomly = async () => {
    if (!todayPlayers) return;

    setLoading(true);
    try {
      const presentPlayers = todayPlayers.filter(p => p.status === 'present');
      if (presentPlayers.length < 4) {
        alert('경기를 생성하려면 최소 4명의 출석자가 필요합니다.');
        return;
      }

      const shuffledPlayers = [...presentPlayers].sort(() => Math.random() - 0.5);
      const generatedMatches = [];
      let gameId = 1;

      for (let i = 0; i < shuffledPlayers.length; i += 4) {
        if (i + 3 < shuffledPlayers.length) {
          const match = {
            id: `random-${gameId}`,
            team1: {
              player1: shuffledPlayers[i],
              player2: shuffledPlayers[i + 1]
            },
            team2: {
              player1: shuffledPlayers[i + 2],
              player2: shuffledPlayers[i + 3]
            }
          };
          generatedMatches.push(match);
          gameId++;
        }
      }

      setMatches(generatedMatches);
      setPlayerGameCounts(calculatePlayerGameCounts(generatedMatches));
      
      console.log(`✅ 랜덤 경기 생성 완료: ${generatedMatches.length}경기`);
    } catch (error) {
      console.error('❌ 랜덤 경기 생성 중 오류:', error);
      alert(`랜덤 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignMixedDoubles = async () => {
    if (!todayPlayers) return;

    setLoading(true);
    try {
      const presentPlayers = todayPlayers.filter(p => p.status === 'present');
      if (presentPlayers.length < 4) {
        alert('혼합복식 경기를 생성하려면 최소 4명의 출석자가 필요합니다.');
        return;
      }

      const playersForMatch = presentPlayers.map(player => ({
        ...player,
        skill_level: normalizeLevel(player.skill_level)
      }));

      const generatedMatches = createMixedDoublesMatches(playersForMatch);
      
      if (generatedMatches.length === 0) {
        alert('혼합복식 경기를 생성할 수 없습니다. 남녀 선수 구성을 확인해주세요.');
        return;
      }

      setMatches(generatedMatches);
      setPlayerGameCounts(calculatePlayerGameCounts(generatedMatches));
      
      console.log(`✅ 혼복 경기 생성 완료: ${generatedMatches.length}경기`);
    } catch (error) {
      console.error('❌ 혼복 경기 생성 중 오류:', error);
      alert(`혼복 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) {
      alert('배정할 경기가 없습니다.');
      return;
    }

    setLoading(true);
    try {
      const sessionName = `${new Date().toLocaleDateString('ko-KR')} ${assignType === 'today' ? '즉시배정' : '예정배정'} - ${matches.length}경기`;
      
      // 경기 세션 생성
      const { data: sessionData, error: sessionError } = await supabase
        .from('match_sessions')
        .insert({
          session_name: sessionName,
          total_matches: matches.length,
          assigned_matches: assignType === 'today' ? matches.length : 0,
          created_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 개별 경기 데이터 생성
      const matchData = matches.map((match, index) => ({
        session_id: sessionData.id,
        match_number: index + 1,
        team1_player1: match.team1.player1,
        team1_player2: match.team1.player2,
        team2_player1: match.team2.player1,
        team2_player2: match.team2.player2,
        is_scheduled: assignType === 'today'
      }));

      const { error: matchError } = await supabase
        .from('generated_matches')
        .insert(matchData);

      if (matchError) throw matchError;

      alert(`✅ ${matches.length}개 경기가 ${assignType === 'today' ? '오늘 바로' : '예정으로'} 배정되었습니다!`);
      
      // 상태 초기화 및 새로고침
      setMatches([]);
      setPlayerGameCounts({});
      await fetchMatchSessions();
      
    } catch (error) {
      console.error('경기 배정 오류:', error);
      alert(`경기 배정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedMatches.size === 0 || !selectedAssignDate) {
      alert('경기를 선택하고 날짜를 지정해주세요.');
      return;
    }

    setLoading(true);
    try {
      const matchIds = Array.from(selectedMatches);
      
      const { error } = await supabase
        .from('generated_matches')
        .update({ 
          is_scheduled: true,
          scheduled_date: selectedAssignDate
        })
        .in('id', matchIds);

      if (error) throw error;

      // 세션 업데이트
      if (selectedSessionId) {
        const assignedCount = generatedMatches.filter(m => m.is_scheduled).length + selectedMatches.size;
        await supabase
          .from('match_sessions')
          .update({ assigned_matches: assignedCount })
          .eq('id', selectedSessionId);
      }

      alert(`✅ ${selectedMatches.size}개 경기가 배정되었습니다!`);
      
      // 데이터 새로고침
      setSelectedMatches(new Set());
      if (selectedSessionId) {
        await fetchGeneratedMatches(selectedSessionId);
      }
      await fetchMatchSessions();
      
    } catch (error) {
      console.error('일괄 배정 오류:', error);
      alert(`일괄 배정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  // 권한 체크
  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">접근 권한이 없습니다</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>이 페이지는 관리자만 접근할 수 있습니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <h1 className="text-2xl md:text-3xl font-bold text-white">⚡ 경기 생성 관리</h1>
            <p className="text-blue-100 text-sm md:text-base mt-1">출석한 선수들로 균형잡힌 경기를 생성하세요</p>
          </div>
          
          <div className="p-6">
            {/* 데이터 로딩 중 표시 */}
            {todayPlayers === null ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                <span className="ml-3 text-gray-600 text-lg">출석 데이터 로딩 중...</span>
              </div>
            ) : todayPlayers.length === 0 ? (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 p-6 mb-8 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium">출석자가 없습니다</h3>
                    <div className="mt-2 text-sm">
                      <p>오늘 등록된 출석자가 없습니다.</p>
                      <p>관리자에게 문의하거나 출석 체크를 먼저 진행해 주세요.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 출석자 요약 */}
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="mb-4">
                    <span className="font-semibold">오늘 출석자: </span>
                    <span className="text-blue-600 font-bold">{todayPlayers.length}명</span>
                  </div>

                  {/* 레벨별 현황 */}
                  <div className="mb-4">
                    <div className="text-sm text-gray-700 mb-2">레벨별 현황:</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(() => {
                        const levelCounts: Record<string, number> = {};
                        const activePlayers = todayPlayers.filter(p => p.status === 'present');
                        
                        activePlayers.forEach(player => {
                          const level = player.skill_level || 'n';
                          const levelLabel = player.skill_label || LEVEL_LABELS[level] || 'E2 (초급)';
                          levelCounts[levelLabel] = (levelCounts[levelLabel] || 0) + 1;
                        });

                        return Object.entries(levelCounts)
                          .sort(([a], [b]) => {
                            const order = ['랍스터', '소갈비', '돼지갈비', '양갈비', '닭갈비', 'N (미지정)'];
                            const indexA = order.indexOf(a);
                            const indexB = order.indexOf(b);
                            if (indexA === -1) return 1;
                            if (indexB === -1) return -1;
                            return indexA - indexB;
                          })
                          .map(([level, count]) => (
                            <span key={level} className="bg-blue-50 text-blue-700 px-2 py-1 rounded border">
                              {level}: {count}명
                            </span>
                          ));
                      })()}
                    </div>
                  </div>

                  {/* 출석 상태별 현황 */}
                  <div className="flex flex-wrap gap-2 mb-3 text-sm">
                    <div className="border rounded px-3 py-1 bg-green-50">
                      <span className="font-medium">출석</span>: 
                      <span className="ml-1 text-green-600 font-medium">{todayPlayers.filter(p => p.status === 'present').length}명</span>
                    </div>
                    <div className="border rounded px-3 py-1 bg-yellow-50">
                      <span className="font-medium">레슨</span>: 
                      <span className="ml-1 text-yellow-600 font-medium">{todayPlayers.filter(p => p.status === 'lesson').length}명</span>
                    </div>
                    <div className="border rounded px-3 py-1 bg-red-50">
                      <span className="font-medium">불참</span>: 
                      <span className="ml-1 text-red-600 font-medium">{todayPlayers.filter(p => p.status === 'absent').length}명</span>
                    </div>
                  </div>
                  
                  {/* 선수 목록 */}
                  <div className="mt-3 border rounded p-3 max-h-48 overflow-y-auto">
                    <h4 className="font-semibold mb-2">선수 목록</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {todayPlayers.map((player, index) => (
                        <div key={player.id} className="flex justify-between items-center py-1 border-b last:border-b-0 text-sm">
                          <span>
                            {index + 1}. {player.name} ({player.skill_label})
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            player.status === 'present' ? 'bg-green-100 text-green-800' :
                            player.status === 'lesson' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {player.status === 'present' ? '출석' : player.status === 'lesson' ? '레슨' : '불참'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 1인당 경기수 설정 */}
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <label className="font-medium text-gray-700">1인당 목표 경기수:</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={perPlayerMinGames}
                      onChange={(e) => setPerPlayerMinGames(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                    />
                    <span className="text-sm text-gray-600">경기</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    예상 총 경기수: {(() => {
                      const presentPlayers = todayPlayers.filter(p => p.status === 'present').length;
                      return Math.ceil(presentPlayers / 4);
                    })()}경기 (전원 참여)
                  </div>
                </div>

                {/* 오늘의 경기 일정 현황 */}
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">📅 오늘의 경기 일정</h3>
                  {matchSessions.length === 0 ? (
                    <div className="text-gray-600 text-center py-4">
                      <p className="mb-2">📋 아직 생성된 경기 일정이 없습니다</p>
                      <p className="text-sm">아래 버튼으로 경기를 생성하면 자동으로 경기 일정이 만들어집니다</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matchSessions.map(session => (
                        <div key={session.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-white rounded border gap-4">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{session.session_name}</div>
                            <div className="text-sm text-gray-600">
                              총 {session.total_matches}경기 | 배정 완료: {session.assigned_matches}경기 | 
                              남은 경기: {session.total_matches - session.assigned_matches}경기
                            </div>
                            <div className="text-xs text-gray-500">
                              생성일시: {new Date(session.created_at).toLocaleString('ko-KR')}
                            </div>
                          </div>
                          <div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              session.assigned_matches === session.total_matches 
                                ? 'bg-green-100 text-green-800' 
                                : session.assigned_matches > 0 
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {session.assigned_matches === session.total_matches 
                                ? '배정완료' 
                                : session.assigned_matches > 0 
                                ? '부분배정'
                                : '미배정'
                              }
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 경기 생성 버튼들 */}
                <div className="bg-white border rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3">🎯 새로운 경기 일정 생성</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    출석한 선수들로 경기를 생성합니다. 생성된 경기는 위의 경기 일정에 추가되고, 
                    <strong className="text-blue-600"> 경기 배정 관리</strong>에서 실제 진행할 경기를 선택할 수 있습니다.
                  </p>
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <p className="text-sm text-blue-800">
                          💡 <strong>Tip:</strong> 경기 생성 후 배정 관리에서 날짜별로 경기를 배정하세요!
                        </p>
                      </div>
                      <a
                        href="/match-assignment"
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
                      >
                        ⚡ 배정 관리로 이동
                      </a>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button 
                      className="bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:bg-gray-400"
                      onClick={handleAssignByLevel}
                      disabled={loading}
                    >
                      {loading ? '생성 중...' : '레벨별 경기'}
                    </button>
                    <button 
                      className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:bg-gray-400"
                      onClick={assignMatchesRandomly}
                      disabled={loading}
                    >
                      {loading ? '생성 중...' : '랜덤 경기'}
                    </button>
                    <button 
                      className="bg-purple-500 hover:bg-purple-600 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:bg-gray-400"
                      onClick={handleAssignMixedDoubles}
                      disabled={loading}
                    >
                      {loading ? '생성 중...' : '혼복 경기'}
                    </button>
                  </div>
                </div>

                {/* 생성된 경기 목록 */}
                {matches.length > 0 && (
                  <div className="bg-white border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-3">생성된 경기 ({matches.length}경기)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 bg-white">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">회차</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">라켓팀</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">셔틀팀</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map((match, index) => {
                            const getPlayerName = (player: any) => {
                              if (typeof player === 'object' && player.name) {
                                const level = player.skill_level || 'E2';
                                return `${player.name}(${level.toUpperCase()})`;
                              }
                              return String(player);
                            };

                            return (
                              <tr key={match.id || `match-${index}`} className="hover:bg-gray-50">
                                <td className="border border-gray-300 px-2 py-2 text-center font-medium text-sm">
                                  {index + 1}
                                </td>
                                <td className="border border-gray-300 px-2 py-2 text-center text-blue-600 text-xs">
                                  {getPlayerName(match.team1.player1)}, {getPlayerName(match.team1.player2)}
                                </td>
                                <td className="border border-gray-300 px-2 py-2 text-center text-red-600 text-xs">
                                  {getPlayerName(match.team2.player1)}, {getPlayerName(match.team2.player2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 1인당 게임수 표시 및 배정 옵션 */}
                {matches.length > 0 && Object.keys(playerGameCounts).length > 0 && (
                  <div className="bg-white border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-3">1인당 총 게임수</h3>
                    <div className="bg-gray-50 p-4 rounded border">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm mb-4">
                        {Object.entries(playerGameCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map(([playerName, gameCount]) => (
                            <div key={playerName} className="flex justify-between bg-white p-2 rounded border">
                              <span className="font-medium">{playerName}</span>
                              <span className="text-blue-600 font-bold">{gameCount}</span>
                            </div>
                          ))}
                      </div>
                      
                      <div className="mb-4 text-xs text-gray-600 flex flex-wrap gap-4">
                        <span>총 선수: {Object.keys(playerGameCounts).length}명</span>
                        <span>총 경기: {matches.length}경기</span>
                        <span>평균 경기수: {Object.keys(playerGameCounts).length > 0 
                          ? (Object.values(playerGameCounts).reduce((a, b) => a + b, 0) / Object.keys(playerGameCounts).length).toFixed(1)
                          : '0'
                        }경기/인</span>
                      </div>

                      {/* 배정 옵션 */}
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="text-lg font-semibold mb-4 text-gray-800">🎯 경기 배정하기</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          생성된 {matches.length}개의 경기를 어떻게 배정하시겠습니까?
                        </p>
                        
                        <div className="space-y-3 mb-4">
                          <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-white cursor-pointer">
                            <input
                              type="radio"
                              name="assignType"
                              value="today"
                              checked={assignType === 'today'}
                              onChange={(e) => setAssignType(e.target.value as 'today' | 'scheduled')}
                              className="form-radio text-green-500"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-green-700">🔥 오늘 바로 배정</span>
                              <p className="text-sm text-gray-600">회원들이 지금 바로 경기할 수 있도록 배정합니다</p>
                            </div>
                          </label>
                          
                          <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-white cursor-pointer">
                            <input
                              type="radio"
                              name="assignType"
                              value="scheduled"
                              checked={assignType === 'scheduled'}
                              onChange={(e) => setAssignType(e.target.value as 'today' | 'scheduled')}
                              className="form-radio text-blue-500"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-blue-700">📅 예정 경기로 저장</span>
                              <p className="text-sm text-gray-600">나중에 경기 배정 관리에서 일정을 배정합니다</p>
                            </div>
                          </label>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() => {
                              setMatches([]);
                              setPlayerGameCounts({});
                            }}
                            className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition-colors"
                            disabled={loading}
                          >
                            경기 초기화
                          </button>
                          <button
                            onClick={handleDirectAssign}
                            disabled={loading || matches.length === 0}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-all shadow-lg"
                          >
                            {loading ? '배정 중...' : '✨ 배정하기'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 경기 배정 관리 섹션 */}
                <div className="bg-white border rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">📋 경기 배정 관리</h2>
                  
                  {/* 세션 선택 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      생성된 경기 세션 선택:
                    </label>
                    <select
                      value={selectedSessionId}
                      onChange={async (e) => {
                        setSelectedSessionId(e.target.value);
                        if (e.target.value) {
                          await fetchGeneratedMatches(e.target.value);
                        } else {
                          setGeneratedMatches([]);
                        }
                      }}
                      className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">세션을 선택하세요</option>
                      {matchSessions.map(session => (
                        <option key={session.id} value={session.id}>
                          {session.session_name} ({session.total_matches}경기, 배정완료: {session.assigned_matches}경기)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 배정할 날짜 선택 */}
                  {selectedSessionId && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        배정할 날짜 선택:
                      </label>
                      <select
                        value={selectedAssignDate}
                        onChange={(e) => setSelectedAssignDate(e.target.value)}
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">날짜를 선택하세요</option>
                        {availableDates.map(dateInfo => (
                          <option key={dateInfo.date} value={dateInfo.date}>
                            {new Date(dateInfo.date).toLocaleDateString('ko-KR')} 
                            ({dateInfo.location} | 여유: {dateInfo.availableSlots}명 | {dateInfo.timeRange})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 생성된 경기 목록 */}
                  {generatedMatches.length > 0 && (
                    <div className="mt-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          생성된 경기 목록 ({generatedMatches.length}경기)
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const unassignedMatches = generatedMatches.filter(m => !m.is_scheduled);
                              if (unassignedMatches.length === 0) {
                                alert('배정 가능한 경기가 없습니다.');
                                return;
                              }
                              const newSelection = new Set(unassignedMatches.map(m => m.id));
                              setSelectedMatches(newSelection);
                            }}
                            className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                          >
                            미배정 모두 선택
                          </button>
                          <button
                            onClick={() => setSelectedMatches(new Set())}
                            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                          >
                            선택 초기화
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                                선택
                              </th>
                              <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                                경기번호
                              </th>
                              <th className="border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700">
                                팀1
                              </th>
                              <th className="border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700">
                                팀2
                              </th>
                              <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                                배정상태
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedMatches.map(match => (
                              <tr key={match.id} className="hover:bg-gray-50">
                                <td className="border border-gray-200 px-2 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedMatches.has(match.id)}
                                    onChange={(e) => {
                                      const newSelection = new Set(selectedMatches);
                                      if (e.target.checked) {
                                        if (!match.is_scheduled) {
                                          newSelection.add(match.id);
                                        }
                                      } else {
                                        newSelection.delete(match.id);
                                      }
                                      setSelectedMatches(newSelection);
                                    }}
                                    disabled={match.is_scheduled}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                </td>
                                <td className="border border-gray-200 px-2 py-3 text-center text-sm font-medium text-gray-900">
                                  {match.match_number}
                                </td>
                                <td className="border border-gray-200 px-4 py-3 text-center text-sm text-blue-700">
                                  {match.team1_player1.name}({match.team1_player1.skill_level.toUpperCase()}),<br />
                                  {match.team1_player2.name}({match.team1_player2.skill_level.toUpperCase()})
                                </td>
                                <td className="border border-gray-200 px-4 py-3 text-center text-sm text-red-700">
                                  {match.team2_player1.name}({match.team2_player1.skill_level.toUpperCase()}),<br />
                                  {match.team2_player2.name}({match.team2_player2.skill_level.toUpperCase()})
                                </td>
                                <td className="border border-gray-200 px-2 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    match.is_scheduled 
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {match.is_scheduled ? '배정완료' : '미배정'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 일괄 배정 버튼 */}
                      {selectedMatches.size > 0 && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                              <p className="text-sm text-blue-800">
                                <strong>{selectedMatches.size}개 경기</strong>를 선택된 날짜로 배정합니다.
                              </p>
                              {selectedAssignDate && (
                                <p className="text-xs text-blue-600 mt-1">
                                  배정 날짜: {new Date(selectedAssignDate).toLocaleDateString('ko-KR')} |
                                  참여자: {selectedMatches.size * 4}명
                                </p>
                              )}
                            </div>
                            <button
                              onClick={handleBulkAssign}
                              disabled={loading || !selectedAssignDate || selectedMatches.size === 0}
                              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                            >
                              {loading ? '배정 중...' : '일괄 배정'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 인증 필요 래핑
export default function ProtectedPlayersPage() {
  return (
    <RequireAuth>
      <PlayersPage />
    </RequireAuth>
  );
}
