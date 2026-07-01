'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RequireAuth } from '@/components/AuthGuard';
import { Match } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

import { 
  ExtendedPlayer, 
  MatchSession, 
  GeneratedMatch, 
  AvailableDate,
  LEVEL_LABELS 
} from './types';

import { 
  supabase,
  getLevelScore,
  normalizeLevel,
  calculatePlayerGameCounts,
  fetchTodayPlayers 
} from './utils';

import AttendanceStatus from './components/AttendanceStatus';
import MatchSessionStatus from './components/MatchSessionStatus';
import MatchGenerationControls from './components/MatchGenerationControls';
import GeneratedMatchesList from './components/GeneratedMatchesList';
import MatchAssignmentManager from './components/MatchAssignmentManager';

function PlayersPage() {
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [perPlayerMinGames, setPerPlayerMinGames] = useState(1);
  
  // 배정 관련 상태
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [generatedMatches, setGeneratedMatches] = useState<GeneratedMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // 경기 배정 타입 상태
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  
  // 일정 관리를 위한 상태
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedAssignDate, setSelectedAssignDate] = useState<string>('');

  useEffect(() => {
    async function initializeData() {
      try {
        // 현재 사용자 정보 가져오기
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        // 출석자 데이터 조회
        const players = await fetchTodayPlayers();
        setTodayPlayers(players);

        // 경기 세션 및 배정 가능한 일정 조회
        await fetchMatchSessions();
        await fetchAvailableDates();
      } catch (error) {
        console.error('❌ 초기 데이터 조회 중 오류:', error);
        alert('데이터 조회 중 오류가 발생했습니다. 다시 시도해주세요.');
        setTodayPlayers([]);
      }
    }
    
    initializeData();
  }, []);

  // 경기 세션 조회 함수
  const fetchMatchSessions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: sessions, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('session_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMatchSessions(sessions || []);
    } catch (error) {
      console.error('경기 세션 조회 오류:', error);
    }
  };

  // 배정 가능한 일정 조회 함수
  const fetchAvailableDates = async () => {
    try {
      const { data: schedules, error } = await supabase
        .from('match_schedules')
        .select('match_date, location, start_time, end_time, max_participants, current_participants, status')
        .gte('match_date', new Date().toISOString().split('T')[0])
        .eq('status', 'scheduled')
        .order('match_date', { ascending: true });

      if (error) throw error;
      
      // 날짜별로 그룹화
      const dateGroups: Record<string, any[]> = {};
      schedules?.forEach(schedule => {
        const date = schedule.match_date;
        if (!dateGroups[date]) {
          dateGroups[date] = [];
        }
        dateGroups[date].push(schedule);
      });

      // 날짜별 요약 정보 생성
      const availableDatesList = Object.entries(dateGroups).map(([date, schedules]) => {
        const totalCapacity = schedules.reduce((sum, s) => sum + s.max_participants, 0);
        const currentParticipants = schedules.reduce((sum, s) => sum + s.current_participants, 0);
        const availableSlots = totalCapacity - currentParticipants;

        return {
          date,
          schedules,
          totalCapacity,
          currentParticipants,
          availableSlots,
          location: schedules[0]?.location || '장소 미정',
          timeRange: `${schedules[0]?.start_time || '시간'} - ${schedules[schedules.length - 1]?.end_time || '미정'}`
        };
      });

      setAvailableDates(availableDatesList);
    } catch (error) {
      console.error('일정 조회 오류:', error);
      setAvailableDates([]);
    }
  };

  // 선택된 세션의 생성된 경기 조회
  const fetchGeneratedMatches = async (sessionId: string) => {
    try {
      setLoading(true);
      const { data: matches, error } = await supabase
        .from('generated_matches')
        .select(`
          *,
          team1_player1:profiles!team1_player1_id(id, username, full_name, skill_level),
          team1_player2:profiles!team1_player2_id(id, username, full_name, skill_level),
          team2_player1:profiles!team2_player1_id(id, username, full_name, skill_level),
          team2_player2:profiles!team2_player2_id(id, username, full_name, skill_level),
          match_schedules(id)
        `)
        .eq('session_id', sessionId)
        .order('match_number', { ascending: true });

      if (error) throw error;

      const formattedMatches = matches?.map(match => ({
        id: match.id,
        session_id: match.session_id,
        match_number: match.match_number,
        status: match.status || 'scheduled',
        team1_player1: {
          name: match.team1_player1?.username || match.team1_player1?.full_name || '선수1',
          skill_level: match.team1_player1?.skill_level || 'E2'
        },
        team1_player2: {
          name: match.team1_player2?.username || match.team1_player2?.full_name || '선수2',
          skill_level: match.team1_player2?.skill_level || 'E2'
        },
        team2_player1: {
          name: match.team2_player1?.username || match.team2_player1?.full_name || '선수3',
          skill_level: match.team2_player1?.skill_level || 'E2'
        },
        team2_player2: {
          name: match.team2_player2?.username || match.team2_player2?.full_name || '선수4',
          skill_level: match.team2_player2?.skill_level || 'E2'
        },
        is_scheduled: match.match_schedules && match.match_schedules.length > 0
      }));

      setGeneratedMatches(formattedMatches || []);
    } catch (error) {
      console.error('생성된 경기 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 경기 생성 핸들러들
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

      // 경기 생성 로직 (from match-utils)
      const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
      const generatedMatches = createBalancedDoublesMatches(playersForMatch, 4); // 최대 코트 수
      
      if (generatedMatches.length === 0) {
        alert('균형잡힌 경기를 생성할 수 없습니다.');
        return;
      }

      // court 속성 추가
      const matchesWithCourt = generatedMatches.map((match, index) => ({
        ...match,
        court: index + 1
      }));

      setMatches(matchesWithCourt);
      setPlayerGameCounts(calculatePlayerGameCounts(generatedMatches));
      
      console.log(`✅ 레벨별 경기 생성 완료: ${generatedMatches.length}경기`);
    } catch (error) {
      console.error('❌ 레벨별 경기 생성 중 오류:', error);
      alert(`레벨별 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRandom = async () => {
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
            court: gameId,
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

  const handleAssignMixed = async () => {
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

      // 혼복 경기 생성 로직 (from match-utils)
      const { createMixedDoublesMatches } = await import('@/utils/match-utils');
      const generatedMatches = createMixedDoublesMatches(playersForMatch, 4); // 최대 코트 수
      
      if (generatedMatches.length === 0) {
        alert('혼합복식 경기를 생성할 수 없습니다. 남녀 선수 구성을 확인해주세요.');
        return;
      }

      // court 속성 추가
      const matchesWithCourt = generatedMatches.map((match, index) => ({
        ...match,
        court: index + 1
      }));

      setMatches(matchesWithCourt);
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
          session_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 개별 경기 데이터 생성 (배정 순서 유지)
      const matchData = matches.map((match, index) => ({
        session_id: sessionData.id,
        match_number: index + 1, // 배정 순서 그대로 경기 번호 부여
        team1_player1_id: match.team1.player1.id,
        team1_player2_id: match.team1.player2.id,
        team2_player1_id: match.team2.player1.id,
        team2_player2_id: match.team2.player2.id,
        status: 'scheduled', // 초기 상태는 예정
        created_at: new Date().toISOString()
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

  // 일괄 배정 함수
  const handleBulkAssign = async () => {
    if (selectedMatches.size === 0 || !selectedSessionId) {
      alert('배정할 경기를 선택해주세요.');
      return;
    }

    if (!selectedAssignDate) {
      alert('배정할 날짜를 선택해주세요.');
      return;
    }

    const matchesToAssign = generatedMatches.filter(match => 
      selectedMatches.has(match.id) && !match.is_scheduled
    );

    if (matchesToAssign.length === 0) {
      alert('배정할 수 있는 경기가 없습니다.');
      return;
    }

    try {
      setLoading(true);

      // 선택된 날짜의 일정 정보 가져오기
      const selectedDateInfo = availableDates.find(d => d.date === selectedAssignDate);
      if (!selectedDateInfo) {
        alert('선택된 날짜의 일정 정보를 찾을 수 없습니다.');
        return;
      }

      // 여유 공간 확인
      if (selectedDateInfo.availableSlots < matchesToAssign.length * 4) {
        const confirmed = confirm(
          `선택된 날짜의 여유 공간(${selectedDateInfo.availableSlots}명)이 ` +
          `배정할 경기 참가자 수(${matchesToAssign.length * 4}명)보다 부족합니다.\n\n` +
          `그래도 배정하시겠습니까?`
        );
        if (!confirmed) return;
      }

      // 스케줄 데이터 생성
      const scheduleInserts = matchesToAssign.map((match, index) => ({
        generated_match_id: match.id,
        match_date: selectedAssignDate,
        start_time: `${9 + index}:00`,
        end_time: `${10 + index}:00`,
        location: selectedDateInfo.location,
        max_participants: 4,
        current_participants: 0,
        status: 'scheduled',
        description: `자동 배정된 경기 #${match.match_number}`,
        created_by: currentUser?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('match_schedules')
        .insert(scheduleInserts);

      if (error) {
        console.error('일괄 배정 데이터베이스 오류:', error);
        throw error;
      }

      // 세션의 배정된 경기 수 업데이트
      const selectedSession = matchSessions.find(s => s.id === selectedSessionId);
      if (selectedSession) {
        const { error: updateError } = await supabase
          .from('match_sessions')
          .update({ assigned_matches: selectedSession.assigned_matches + scheduleInserts.length })
          .eq('id', selectedSessionId);

        if (updateError) throw updateError;
      }

      setSelectedMatches(new Set());
      await fetchGeneratedMatches(selectedSessionId);
      await fetchMatchSessions();
      await fetchAvailableDates();
      
      alert(
        `${scheduleInserts.length}개 경기가 ${new Date(selectedAssignDate).toLocaleDateString('ko-KR')} ` +
        `일정으로 성공적으로 배정되었습니다!`
      );
    } catch (error) {
      console.error('일괄 배정 오류:', error);
      alert('경기 배정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 단순화된 메인 렌더링 - 복잡한 경기 생성 로직은 별도로 처리
  
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">⚡ 경기 생성 관리</h1>
                <p className="text-blue-100 text-sm md:text-base mt-1">출석한 선수들로 균형잡힌 경기를 생성하세요</p>
              </div>
              <div className="mt-4 sm:mt-0 flex gap-2">
                <Link href="/match-results">
                  <Button variant="outline" className="bg-white text-blue-600 border-white hover:bg-blue-50">
                    📋 배정 결과 확인
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" className="bg-white text-blue-600 border-white hover:bg-blue-50">
                    🏠 대시보드
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <AttendanceStatus todayPlayers={todayPlayers} />
            
            <MatchSessionStatus matchSessions={matchSessions} />
            
            <MatchGenerationControls
              todayPlayers={todayPlayers}
              perPlayerMinGames={perPlayerMinGames}
              setPerPlayerMinGames={setPerPlayerMinGames}
              onGenerateByLevel={handleAssignByLevel}
              onGenerateRandom={handleAssignRandom}
              onGenerateMixed={handleAssignMixed}
            />
            
            <GeneratedMatchesList
              matches={matches}
              playerGameCounts={playerGameCounts}
              assignType={assignType}
              setAssignType={setAssignType}
              loading={loading}
              onClearMatches={() => {
                setMatches([]);
                setPlayerGameCounts({});
              }}
              onAssignMatches={handleDirectAssign}
            />
            
            <MatchAssignmentManager
              matchSessions={matchSessions}
              selectedSessionId={selectedSessionId}
              setSelectedSessionId={setSelectedSessionId}
              generatedMatches={generatedMatches}
              selectedMatches={selectedMatches}
              setSelectedMatches={setSelectedMatches}
              availableDates={availableDates}
              selectedAssignDate={selectedAssignDate}
              setSelectedAssignDate={setSelectedAssignDate}
              loading={loading}
              onFetchGeneratedMatches={fetchGeneratedMatches}
              onBulkAssign={handleBulkAssign}
            />
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
