'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import { LEVEL_LABELS } from '@/app/players/types';
import AttendanceStatus from '@/app/players/components/AttendanceStatus';
import MatchSessionStatus from '@/app/players/components/MatchSessionStatus';
import MatchGenerationControls from '@/app/players/components/MatchGenerationControls';
import GeneratedMatchesList from '@/app/players/components/GeneratedMatchesList';
import TeamBasedMatchGeneration from '@/app/players/components/TeamBasedMatchGeneration';
import { ExtendedPlayer, MatchSession } from '@/app/players/types';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchTodayPlayers, fetchRegisteredPlayersForDate, calculatePlayerGameCounts, normalizeLevel } from '@/app/players/utils';
import { Match } from '@/types';

const supabase = getSupabaseClient();

export default function PlayersTodayPage() {
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Array<{
    id: string;
    match_date: string;
    start_time: string;
    end_time: string;
    location: string;
    status: string;
    current_participants: number | null;
    max_participants: number | null;
  }>>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  const [sessionMode, setSessionMode] = useState<'레벨' | '랜덤' | '혼복' | '수동'>('레벨');
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Array<{round: number; title?: string; racket: string[]; shuttle: string[]}>>([]);
  const [selectedTeamRound, setSelectedTeamRound] = useState<number | null>(null);

  // 로컬(KST) 기준 YYYY-MM-DD 반환 (타임존 문제 해결)
  const getTodayLocal = () => {
    const now = new Date();
    // 로컬 타임존의 오늘 날짜를 정확히 계산
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 출석 데이터 갱신 함수
  const refreshAttendanceData = async () => {
    const today = getTodayLocal();
    console.log('출석 데이터 갱신 시작 - 날짜:', today);

    try {
      // 오늘 경기 참가자 조회
      const participants = await fetchRegisteredPlayersForDate(today);
      console.log('참가자 데이터 조회 결과:', participants);
      
      if (!participants || participants.length === 0) {
        console.log('오늘 등록된 참가자가 없습니다.');
        setTodayPlayers([]);
        return;
      }

      // 오늘 출석 데이터 조회
      const { data: attendancePresent, error: attErr } = await supabase
        .from('attendances')
        .select('user_id')
        .eq('attended_at', today)
        .eq('status', 'present');
        
      if (attErr) {
        console.error('출석 조회 오류:', attErr);
        // 출석 조회 실패해도 참가자는 absent 상태로 표시
        const absentPlayers = participants.map(p => ({ ...p, status: 'absent' as const }));
        setTodayPlayers(absentPlayers);
        return;
      }

      console.log('출석 데이터 조회 결과:', attendancePresent);

      // 참가자가 없고 출석 데이터만 있는 경우: 출석 데이터를 참가자로 변환
      if ((!participants || participants.length === 0) && attendancePresent && attendancePresent.length > 0) {
        console.log('참가자 데이터가 없어 출석 데이터를 참가자로 사용');

        // 출석한 사용자들의 프로필 조회
        const attendanceUserIds = attendancePresent.map((a: any) => a.user_id);
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('id, username, full_name, skill_level, gender')
          .in('id', attendanceUserIds);

        if (profileErr) {
          console.error('프로필 조회 오류:', profileErr);
          setTodayPlayers([]);
          return;
        }

        // 레벨 정보 조회
        const { data: levelData } = await supabase
          .from('level_info')
          .select('code, name');

        const levelMap: Record<string, string> = {};
        (levelData || []).forEach((lvl: any) => {
          if (lvl.code) levelMap[String(lvl.code).toLowerCase()] = lvl.name || '';
        });

        // 출석 데이터를 참가자 데이터로 변환
        const playersFromAttendance: ExtendedPlayer[] = (profiles || []).map((profile: any) => {
          const raw = (profile.skill_level || '').toString().toLowerCase();
          const normalized = normalizeLevel('', raw);
          const label = levelMap[normalized] || LEVEL_LABELS[normalized] || 'E2 (초급)';
          const name = profile.username || profile.full_name || `선수-${String(profile.id).slice(0, 4)}`;
          return {
            id: profile.id,
            name,
            skill_level: normalized,
            skill_label: label,
            gender: profile.gender || '',
            skill_code: '',
            status: 'present', // 출석 데이터이므로 present로 설정
          } as ExtendedPlayer;
        });

        console.log(`출석 데이터에서 ${playersFromAttendance.length}명 참가자 생성`);
        setTodayPlayers(playersFromAttendance);
        return;
      }

      // 참가자와 출석 데이터 결합
      const attendanceMap = new Map(attendancePresent?.map((a: any) => [a.user_id, true]) || []);
      const combinedPlayers = participants.map(p => ({
        ...p,
        status: attendanceMap.has(p.id) ? 'present' : 'absent'
      })) as ExtendedPlayer[];

      console.log('최종 결합된 플레이어 데이터:', combinedPlayers);
      setTodayPlayers(combinedPlayers);

    } catch (error) {
      console.error('출석 데이터 갱신 오류:', error);
      // 오류 발생 시에도 참가자 데이터는 absent 상태로 표시
      try {
        const participants = await fetchRegisteredPlayersForDate(today);
        const absentPlayers = participants.map(p => ({ ...p, status: 'absent' as const }));
        setTodayPlayers(absentPlayers);
      } catch (fallbackError) {
        console.error('참가자 데이터 조회 실패:', fallbackError);
        setTodayPlayers([]);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      console.log('페이지 초기 로딩 시작');
      await refreshAttendanceData();
      await fetchMatchSessions();
      await fetchTodaySchedules();
      await fetchTodayTeams();
      console.log('페이지 초기 로딩 완료');
    };
    init();
  }, []);

  // 포커스 시 갱신: 오늘 세션/일정/팀 구성 재조회
  useEffect(() => {
    const onFocus = () => {
      console.log('페이지 포커스 - 데이터 갱신');
      refreshAttendanceData().catch(err => console.error('포커스 갱신 오류:', err));
      fetchMatchSessions();
      fetchTodaySchedules();
      fetchTodayTeams();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 실시간 구독: 출석 데이터 변경 시 자동 갱신
  useEffect(() => {
    const today = getTodayLocal();
    
    console.log('실시간 구독 설정 - 오늘 날짜:', today);
    
    const attendanceChannel = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'attendances',
        filter: `attended_at=eq.${today}`
      }, (payload) => {
        console.log('출석 데이터 변경 감지:', payload);
        // 비동기 함수를 즉시 실행하여 상태 업데이트 보장
        refreshAttendanceData().catch(err => console.error('실시간 갱신 오류:', err));
      })
      .subscribe();

    const participantChannel = supabase
      .channel('participant_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_participants'
      }, (payload) => {
        console.log('참가자 데이터 변경 감지:', payload);
        // 비동기 함수를 즉시 실행하여 상태 업데이트 보장
        refreshAttendanceData().catch(err => console.error('실시간 갱신 오류:', err));
      })
      .subscribe();

    const scheduleChannel = supabase
      .channel('schedule_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_schedules',
        filter: `match_date=eq.${today}`
      }, (payload) => {
        console.log('경기 일정 변경 감지:', payload);
        // 경기 일정 변경 시 일정 목록도 갱신
        fetchTodaySchedules();
      })
      .subscribe();

    return () => {
      console.log('실시간 구독 해제');
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(scheduleChannel);
    };
  }, []);

  const fetchMatchSessions = async () => {
    try {
  const today = getTodayLocal();
      const { data, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('session_date', today)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMatchSessions(data || []);
    } catch (e) {
      console.error('세션 조회 오류:', e);
    }
  };

  const fetchTodayTeams = async () => {
    try {
      const today = getTodayLocal();
      console.log('🔍 팀 구성 조회 시작 - 날짜:', today);
      
      // 1. 먼저 DB에서 조회 시도 (새로운 JSONB 구조)
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .eq('assignment_date', today)
        .order('round_number', { ascending: true });

      let teamsData: any[] = [];

      if (error) {
        console.log('⚠️ DB 조회 오류:', error.message);
        console.log('📦 로컬 스토리지에서 조회 시도...');
      } else if (data && data.length > 0) {
        console.log('✅ DB에서', data.length, '건 조회됨 (JSONB 구조)');
        
        // JSONB 구조를 배열로 변환
        teamsData = data.map(row => ({
          round: row.round_number,
          title: row.title,
          racket: Array.isArray(row.racket_team) ? row.racket_team : [],
          shuttle: Array.isArray(row.shuttle_team) ? row.shuttle_team : [],
          team_type: row.team_type
        }));
      } else {
        console.log('📦 DB에 데이터 없음. 로컬 스토리지에서 조회 시도...');
      }

      // 2. DB에서 데이터가 없으면 로컬 스토리지에서 조회 (구 방식)
      if (teamsData.length === 0) {
        const localData = localStorage.getItem('badminton_team_assignments');
        if (localData) {
          try {
            const allAssignments = JSON.parse(localData);
            console.log('📦 로컬 스토리지 전체 데이터:', allAssignments.length, '건');
            
            // 오늘 날짜 데이터만 필터링
            const todayAssignments = allAssignments.filter((assignment: any) => {
              const assignmentDate = assignment.assignment_date || 
                                     assignment.created_at?.slice(0, 10) || 
                                     new Date(assignment.created_at).toISOString().slice(0, 10);
              return assignmentDate === today;
            });
            
            console.log('📦 오늘 날짜 데이터:', todayAssignments.length, '건 필터링됨');
            
            // 회차별로 그룹화 (구 방식)
            const teamsMap: Record<number, {round: number; title?: string; racket: string[]; shuttle: string[]}> = {};
            
            todayAssignments.forEach((assignment: any) => {
              if (!teamsMap[assignment.round_number]) {
                teamsMap[assignment.round_number] = {
                  round: assignment.round_number,
                  title: assignment.round_title,
                  racket: [],
                  shuttle: []
                };
              }
              
              if (assignment.team_type === 'racket') {
                teamsMap[assignment.round_number].racket.push(assignment.player_name);
              } else if (assignment.team_type === 'shuttle') {
                teamsMap[assignment.round_number].shuttle.push(assignment.player_name);
              }
            });
            
            teamsData = Object.values(teamsMap);
          } catch (parseError) {
            console.error('로컬 스토리지 파싱 오류:', parseError);
          }
        } else {
          console.log('📦 로컬 스토리지에도 데이터 없음');
        }
      }

      // 3. 최종 데이터 설정
      if (teamsData.length > 0) {
        setAvailableTeams(teamsData);
        console.log('✅ 최종 팀 구성:', teamsData.length, '개 회차');
        teamsData.forEach(team => {
          console.log(`  - ${team.round}회차 (${team.title}): 라켓팀 ${team.racket.length}명, 셔틀팀 ${team.shuttle.length}명`);
        });
      } else {
        console.log('❌ 오늘 날짜의 팀 구성이 없습니다.');
        setAvailableTeams([]);
      }
    } catch (e) {
      console.error('팀 구성 조회 실패:', e);
      setAvailableTeams([]);
    }
  };

  const fetchTodaySchedules = async () => {
    try {
      const today = getTodayLocal();
      const { data, error } = await supabase
        .from('match_schedules')
        .select('id, match_date, start_time, end_time, location, status, current_participants, max_participants')
        .eq('match_date', today)
        .order('start_time', { ascending: true });

      if (error) throw error;

      // 실제 참가자 수로 current_participants 업데이트
      if (data && data.length > 0) {
        for (const schedule of data) {
          // 해당 일정의 실제 참가자 수 조회
          const { count: actualCount, error: countError } = await supabase
            .from('match_participants')
            .select('*', { count: 'exact', head: true })
            .eq('match_schedule_id', schedule.id)
            .eq('status', 'registered');

          if (!countError && actualCount !== schedule.current_participants) {
            // current_participants가 실제 참가자 수와 다르면 업데이트
            await supabase
              .from('match_schedules')
              .update({ current_participants: actualCount || 0 })
              .eq('id', schedule.id);

            console.log(`경기 일정 ${schedule.id} 참가자 수 업데이트: ${schedule.current_participants} → ${actualCount || 0}`);
          }
        }

        // 업데이트된 데이터 다시 조회
        const { data: updatedData, error: refetchError } = await supabase
          .from('match_schedules')
          .select('id, match_date, start_time, end_time, location, status, current_participants, max_participants')
          .eq('match_date', today)
          .order('start_time', { ascending: true });

        if (!refetchError) {
          setTodaySchedules(updatedData || []);
        } else {
          setTodaySchedules(data || []);
        }
      } else {
        setTodaySchedules(data || []);
      }
    } catch (e) {
      console.error('오늘 경기 일정 조회 오류:', e);
    }
  };

  const handleAssignByLevel = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) {
        alert('최소 4명의 출석자가 필요합니다.');
        return;
      }
      const playersForMatch = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
      const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
      
      // 목표 경기수 계산
      const targetMatches = Math.ceil((playersForMatch.length * perPlayerMinGames) / 4);
      
      // 재시도 로직: 최대 4회 시도하며 코트 수를 점진적으로 증가
      let generated: any[] = [];
      let attempts = 0;
      let maxCourts = Math.max(4, Math.ceil(playersForMatch.length / 4));
      
      while (attempts < 4) {
        generated = createBalancedDoublesMatches(playersForMatch, maxCourts, perPlayerMinGames)
          .map((m: any, i: number) => ({ ...m, court: i + 1 }));
        
        const counts = calculatePlayerGameCounts(generated);
        const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
        
        // 목표 경기수를 만족하고 모든 선수가 최소 경기수를 채웠다면 성공
        if (generated.length >= targetMatches && missing.length === 0) {
          break;
        }
        
        attempts += 1;
        maxCourts = Math.min(playersForMatch.length, maxCourts + 2);
      }
      
      // 최종 검증: 모든 출석자가 포함되었는지 확인
      const finalCounts = calculatePlayerGameCounts(generated);
      const stillMissing = playersForMatch.filter(p => (finalCounts[p.id] || 0) < perPlayerMinGames);
      
      if (stillMissing.length > 0) {
        const missingNames = stillMissing.map(p => p.name).join(', ');
        console.warn(`⚠️ ${stillMissing.length}명의 선수가 목표 경기수에 도달하지 못했습니다:`, missingNames);
        console.warn(`생성된 경기: ${generated.length}개, 목표: ${targetMatches}개`);
      }
      
      // 전체 참가자 통계 출력
      console.log('📊 레벨별 경기 생성 완료:');
      console.log(`- 총 출석자: ${playersForMatch.length}명`);
      console.log(`- 생성된 경기: ${generated.length}개`);
      console.log(`- 목표 경기수: ${targetMatches}개`);
      console.log(`- 1인당 목표: ${perPlayerMinGames}경기`);
      
      // 경기 수 분포 출력
      const distribution: Record<number, number> = {};
      Object.values(finalCounts).forEach((count: any) => {
        distribution[count] = (distribution[count] || 0) + 1;
      });
      console.log('- 경기 수 분포:', distribution);
      
      setMatches(generated);
      setSessionMode('레벨');
      setPlayerGameCounts(finalCounts);
    } catch (e) {
      console.error('레벨별 경기 생성 중 오류:', e);
      alert('레벨별 경기 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRandom = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
      // normalize levels for scoring
      const playersForMatch = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
      const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
      const targetMatches = Math.ceil((playersForMatch.length * perPlayerMinGames) / 4);
      let generated: any[] = [];
      let attempts = 0;
      let maxCourts = Math.max(4, Math.ceil(playersForMatch.length / 4));
      while (attempts < 4) {
        generated = createRandomBalancedDoublesMatches(playersForMatch, maxCourts, perPlayerMinGames).map((m: any, i: number) => ({ ...m, court: i + 1 }));
        const counts = calculatePlayerGameCounts(generated);
        const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
        if (generated.length >= targetMatches && missing.length === 0) break;
        attempts += 1;
        maxCourts = Math.min(playersForMatch.length, maxCourts + 2);
      }
      const finalCounts = calculatePlayerGameCounts(generated);
      const stillMissing = playersForMatch.filter(p => (finalCounts[p.id] || 0) < perPlayerMinGames);
      if (stillMissing.length > 0) {
        console.warn(`${stillMissing.length}명의 선수가 목표 경기수에 도달하지 못했습니다. (생성된 경기 ${generated.length}개)`);
      }
      setMatches(generated);
      setSessionMode('랜덤');
      setPlayerGameCounts(calculatePlayerGameCounts(generated));
    } catch (e) {
      console.error(e);
      alert('랜덤 경기 생성 중 오류');
    } finally { setLoading(false); }
  };

  const handleAssignMixed = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
      const playersForMatch = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
      const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
      // target matches = ceil((players * perPlayerMinGames) / 4)
      const targetMatches = Math.ceil((playersForMatch.length * perPlayerMinGames) / 4);
      // try generation multiple times, expanding per-round courts if needed to improve coverage
      let generated: any[] = [];
      let attempts = 0;
      let maxCourts = Math.max(4, Math.ceil(playersForMatch.length / 4));
      while (attempts < 4) {
        generated = createMixedAndSameSexDoublesMatches(playersForMatch, maxCourts, perPlayerMinGames).map((m: any, i: number) => ({ ...m, court: i + 1 }));
        const counts = calculatePlayerGameCounts(generated);
        const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
        if (generated.length >= targetMatches && missing.length === 0) break;
        // try again with more courts to create more variety
        attempts += 1;
        maxCourts = Math.min(playersForMatch.length, maxCourts + 2);
      }
      // final check
      const finalCounts = calculatePlayerGameCounts(generated);
      const stillMissing = playersForMatch.filter(p => (finalCounts[p.id] || 0) < perPlayerMinGames);
      if (stillMissing.length > 0) {
        console.warn(`${stillMissing.length}명의 선수가 목표 경기수에 도달하지 못했습니다. (생성된 경기 ${generated.length}개)`);
      }
      setMatches(generated);
      setSessionMode('혼복');
      setPlayerGameCounts(calculatePlayerGameCounts(generated));
    } catch (e) { console.error(e); alert('혼복 경기 생성 중 오류'); }
    finally { setLoading(false); }
  };

  const handleManualAssign = () => {
    if (!todayPlayers) return;
    const present = todayPlayers.filter(p => p.status === 'present');
    if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }

    // target matches 계산 및 빈 슬롯 생성
    const targetMatches = Math.ceil((present.length * perPlayerMinGames) / 4);
    const emptyMatches: any[] = Array.from({ length: Math.max(1, targetMatches) }).map((_, i) => ({
      id: `manual-empty-${Date.now()}-${i}`,
      team1: { player1: null, player2: null },
      team2: { player1: null, player2: null },
      court: i + 1
    }));

    setMatches(emptyMatches);
    setSessionMode('수동');
    setPlayerGameCounts({});
    setIsManualEditing(true);
  };

  const handleManualMatchChange = (nextMatches: any[]) => {
    setMatches(nextMatches);
    // 실시간으로 경기 수 업데이트
    const counts = calculatePlayerGameCounts(nextMatches.filter(m => 
      m.team1?.player1 && m.team1?.player2 && m.team2?.player1 && m.team2?.player2
    ));
    setPlayerGameCounts(counts);
  };

  const handleTeamBasedGeneration = async () => {
    setLoading(true);
    try {
      let allPlayers: any[] = [];

      if (!selectedTeamRound) {
        // 팀 구성을 선택하지 않은 경우: 출석한 선수 전체로 생성
        if (!todayPlayers) {
          alert('출석 데이터를 불러오는 중입니다.');
          return;
        }
        
        const present = todayPlayers.filter(p => p.status === 'present');
        if (present.length < 4) {
          alert('최소 4명의 출석자가 필요합니다.');
          return;
        }

        allPlayers = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
        console.log('📊 팀 구분 없이 출석자 전체로 경기 생성:', allPlayers.length, '명');
      } else {
        // 팀 구성을 선택한 경우: 해당 팀의 선수들로 생성
        const selectedTeam = availableTeams.find(t => t.round === selectedTeamRound);
        if (!selectedTeam) {
          alert('선택한 팀 구성을 찾을 수 없습니다.');
          return;
        }

        // 팀 구성에서 선수 이름을 파싱하여 ExtendedPlayer 형태로 변환
        const parsePlayerName = (nameWithLevel: string) => {
          const match = nameWithLevel.match(/^(.+)\(([A-Z0-9]+)\)$/);
          if (match) {
            return { name: match[1], level: match[2].toLowerCase() };
          }
          return { name: nameWithLevel, level: 'e2' };
        };

        const racketPlayers = selectedTeam.racket.map((p, idx) => {
          const parsed = parsePlayerName(p);
          return {
            id: `racket-${idx}-${Date.now()}`,
            name: parsed.name,
            skill_level: parsed.level,
            skill_label: `${parsed.level.toUpperCase()} 레벨`,
            gender: '',
            skill_code: '',
            status: 'present' as const
          };
        });

        const shuttlePlayers = selectedTeam.shuttle.map((p, idx) => {
          const parsed = parsePlayerName(p);
          return {
            id: `shuttle-${idx}-${Date.now()}`,
            name: parsed.name,
            skill_level: parsed.level,
            skill_label: `${parsed.level.toUpperCase()} 레벨`,
            gender: '',
            skill_code: '',
            status: 'present' as const
          };
        });

        allPlayers = [...racketPlayers, ...shuttlePlayers];
        console.log('📊 선택한 팀 구성으로 경기 생성:', selectedTeam.round, '회차,', allPlayers.length, '명');
      }

      if (allPlayers.length < 4) {
        alert('최소 4명의 선수가 필요합니다.');
        return;
      }

      const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
      const targetMatches = Math.ceil((allPlayers.length * perPlayerMinGames) / 4);
      
      let generated: any[] = [];
      let attempts = 0;
      let maxCourts = Math.max(4, Math.ceil(allPlayers.length / 4));
      
      while (attempts < 4) {
        generated = createBalancedDoublesMatches(allPlayers, maxCourts, perPlayerMinGames)
          .map((m: any, i: number) => ({ ...m, court: i + 1 }));
        
        const counts = calculatePlayerGameCounts(generated);
        const missing = allPlayers.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
        
        if (generated.length >= targetMatches && missing.length === 0) {
          break;
        }
        
        attempts += 1;
        maxCourts = Math.min(allPlayers.length, maxCourts + 2);
      }
      
      const finalCounts = calculatePlayerGameCounts(generated);
      
      console.log('✅ 경기 생성 완료:');
      console.log(`- 총 선수: ${allPlayers.length}명`);
      console.log(`- 생성된 경기: ${generated.length}개`);
      console.log(`- 목표 경기수: ${targetMatches}개`);
      
      setMatches(generated);
      setSessionMode(selectedTeamRound ? '팀구성' as any : '레벨');
      setPlayerGameCounts(finalCounts);
    } catch (e) {
      console.error('팀 기반 경기 생성 중 오류:', e);
      alert('팀 기반 경기 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualMatchesCreate = (manualMatches: Match[]) => {
    setMatches(manualMatches);
    setSessionMode('수동');
    setPlayerGameCounts(calculatePlayerGameCounts(manualMatches));
    console.log(`✅ 수동 배정: ${manualMatches.length}개 경기 생성 완료`);
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) { alert('배정할 경기가 없습니다.'); return; }
  const today = getTodayLocal();
  const mode = sessionMode; // use generation mode (레벨/랜덤/혼복)
  const makeSessionName = async () => {
      // count today sessions to generate sequence
      const { data, error } = await supabase
        .from('match_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('session_date', today);
      const seq = (data as any)?.length ? (data as any).length + 1 : 1; // fallback if head returns no length
      // safer: do a separate count query
      const { count } = await supabase
        .from('match_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_date', today);
  const n = (count ?? seq) + 1;
  return `${today}_${mode}_${n}번째`;
    };
    const sessionName = await makeSessionName();
    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('match_sessions')
        .insert({ session_name: sessionName, total_matches: matches.length, assigned_matches: matches.length, session_date: today })
        .select()
        .single();
      if (sessionError) throw sessionError;

      const payload = matches.map((match, idx) => ({
        session_id: sessionData.id,
        match_number: idx + 1,
        team1_player1_id: match.team1.player1.id,
        team1_player2_id: match.team1.player2.id,
        team2_player1_id: match.team2.player1.id,
        team2_player2_id: match.team2.player2.id,
        status: 'scheduled',
        created_at: new Date().toISOString()
      }));
      const { error: insErr } = await supabase.from('generated_matches').insert(payload);
      if (insErr) throw insErr;
  alert(`✅ ${matches.length}개 경기가 오늘 순서대로 배정되었습니다. (세션: ${sessionName})`);
  setMatches([]); setPlayerGameCounts({});
  await fetchMatchSessions();
  await fetchTodaySchedules();
    } catch (e) {
      console.error('배정 오류:', e);
      alert('배정 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  return (
    <RequireAdmin>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">오늘 경기 생성/배정</h1>
        {/* 오늘의 등록된 경기 - 최상단으로 이동 */}
        <div className="mb-6 p-4 border border-purple-300 rounded bg-purple-50">
          <h3 className="text-lg font-semibold mb-3">🗓️ 오늘의 등록된 경기</h3>
          {todaySchedules.length === 0 ? (
            <div className="text-gray-600 text-sm">오늘 등록된 경기가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todaySchedules.map((s) => (
                <div key={s.id} className="bg-white rounded border p-3 text-sm">
                  <div className="font-medium text-gray-800">{s.start_time} - {s.end_time} · {s.location}</div>
                  <div className="text-gray-600 mt-1">
                    인원: {s.current_participants ?? 0} / {s.max_participants ?? 0}명
                  </div>
                  <div className="text-xs mt-1">
                    상태: <span className="font-medium">{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <AttendanceStatus todayPlayers={todayPlayers} />
        
        {/* 수동 갱신 버튼 */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => refreshAttendanceData().catch(err => console.error('수동 갱신 오류:', err))}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            disabled={loading}
          >
            🔄 데이터 수동 갱신
          </button>
          <button
            onClick={() => {
              fetchMatchSessions();
              fetchTodaySchedules();
            }}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            disabled={loading}
          >
            📅 경기 일정 갱신
          </button>
        </div>
        
        <MatchSessionStatus matchSessions={matchSessions} />
        
        {/* 팀 구성 기반 경기 생성 */}
        <TeamBasedMatchGeneration
          availableTeams={availableTeams}
          selectedTeamRound={selectedTeamRound}
          onTeamSelect={setSelectedTeamRound}
          onGenerateMatches={handleTeamBasedGeneration}
          perPlayerMinGames={perPlayerMinGames}
        />
        
        <MatchGenerationControls
          todayPlayers={todayPlayers}
          perPlayerMinGames={perPlayerMinGames}
          setPerPlayerMinGames={setPerPlayerMinGames}
          onGenerateByLevel={handleAssignByLevel}
          onGenerateRandom={handleAssignRandom}
          onGenerateMixed={handleAssignMixed}
          onManualAssign={handleManualAssign}
        />
        
        {/* 생성된 경기 목록 (수동 배정 모드 포함) */}
        <GeneratedMatchesList
          matches={matches}
          playerGameCounts={playerGameCounts}
          assignType={assignType}
          setAssignType={setAssignType}
          loading={loading}
          onClearMatches={() => { 
            setMatches([]); 
            setPlayerGameCounts({}); 
            setIsManualEditing(false); 
          }}
          onAssignMatches={handleDirectAssign}
          isManualMode={isManualEditing}
          presentPlayers={todayPlayers?.filter(p => p.status === 'present') || []}
          onManualMatchChange={handleManualMatchChange}
        />
      </div>
    </RequireAdmin>
  );
}
