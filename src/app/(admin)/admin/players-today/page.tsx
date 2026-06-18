'use client';

import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import { LEVEL_LABELS } from '@/app/(admin)/players/types';
import AttendanceStatus from '@/app/(admin)/players/components/AttendanceStatus';
import MatchSessionStatus from '@/app/(admin)/players/components/MatchSessionStatus';
import MatchGenerationControls from '@/app/(admin)/players/components/MatchGenerationControls';
import GeneratedMatchesList from '@/app/(admin)/players/components/GeneratedMatchesList';
import { ExtendedPlayer, MatchSession } from '@/app/(admin)/players/types';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchTodayPlayers, fetchRegisteredPlayersForDate, calculatePlayerGameCounts, normalizeLevel } from '@/app/(admin)/players/utils';
import { Match } from '@/types';
import { getKoreaDate } from '@/lib/date';
import { getAdminLevelDisplay } from '@/lib/level-display';
import { fetchLevelInfoMap, getLevelScoreFromCode, type LevelInfoMap } from '@/lib/level-info';
import { getLevelScore } from '@/utils/match-helpers';

interface MemberOption {
  id: string;
  name: string;
  skill_level: string;
  skill_label: string;
  score?: number;
  gender: string;
  skill_code: string;
}

export default function PlayersTodayPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [memberPlayers, setMemberPlayers] = useState<MemberOption[]>([]);
  const [manualPlayers, setManualPlayers] = useState<ExtendedPlayer[]>([]);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Array<{
    id: string;
    match_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    status: string;
    current_participants: number | null;
    max_participants: number | null;
  }>>([]);
  const [levelInfoMap, setLevelInfoMap] = useState<LevelInfoMap>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  const [sessionMode, setSessionMode] = useState<'레벨' | '랜덤' | '혼복' | '수동'>('레벨');
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const effectiveTodayPlayers = useMemo(() => {
    if (todayPlayers === null) {
      return null;
    }

    const merged = new Map<string, ExtendedPlayer>();
    [...todayPlayers, ...manualPlayers].forEach((player) => {
      merged.set(player.id, player);
    });

    return Array.from(merged.values());
  }, [manualPlayers, todayPlayers]);
  const availableMembersToAdd = useMemo(() => {
    const existingIds = new Set((effectiveTodayPlayers || []).map((player) => player.id));
    return memberPlayers
      .filter((member) => !existingIds.has(member.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' }));
  }, [effectiveTodayPlayers, memberPlayers]);

  // 로컬(KST) 기준 YYYY-MM-DD 반환 (타임존 문제 해결)
  const getTodayLocal = () => {
    return getKoreaDate();
  };

  const getAccurateScore = (skillLevel?: string | null) => {
    const mappedScore = getLevelScoreFromCode(levelInfoMap, skillLevel, Number.NaN);
    if (!Number.isNaN(mappedScore)) {
      return mappedScore;
    }
    return getLevelScore(skillLevel || 'E2');
  };

  const attachScores = <T extends ExtendedPlayer | MemberOption>(players: T[]) =>
    players.map((player) => ({
      ...player,
      score: getAccurateScore(player.skill_level),
    }));

  const attachScoresWithMap = <T extends ExtendedPlayer | MemberOption>(
    players: T[],
    map: LevelInfoMap
  ) =>
    players.map((player) => ({
      ...player,
      score: getLevelScoreFromCode(map, player.skill_level, getLevelScore(player.skill_level || 'E2')),
    }));

  const ensureLevelInfoMap = async () => {
    if (Object.keys(levelInfoMap).length > 0) {
      return levelInfoMap;
    }

    const nextLevelInfoMap = await fetchLevelInfoMap(supabase);
    setLevelInfoMap(nextLevelInfoMap);
    return nextLevelInfoMap;
  };

  const fetchMemberPlayers = async () => {
    try {
      const [{ data, error }, nextLevelInfoMap] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, full_name, skill_level, gender')
          .order('full_name', { ascending: true }),
        fetchLevelInfoMap(supabase),
      ]);

      if (error) {
        throw error;
      }

      setLevelInfoMap(nextLevelInfoMap);

      const normalizedMembers = (data || []).map((profile: any) => {
        const normalizedLevel = normalizeLevel('', profile.skill_level || 'e2');
        const name = profile.full_name || profile.username || `선수-${String(profile.id).slice(0, 4)}`;
        return {
          id: profile.id,
          name,
          skill_level: normalizedLevel,
          skill_label: getAdminLevelDisplay(normalizedLevel),
          score: getLevelScoreFromCode(nextLevelInfoMap, normalizedLevel, getLevelScore(normalizedLevel)),
          gender: profile.gender || '',
          skill_code: '',
        } as MemberOption;
      });

      setMemberPlayers(normalizedMembers);
    } catch (error) {
      console.error('회원 목록 조회 오류:', error);
      setMemberPlayers([]);
    }
  };

  // 출석 데이터 갱신 함수
  const refreshAttendanceData = async () => {
    const today = getTodayLocal();
    console.log('출석 데이터 갱신 시작 - 날짜:', today);

    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();

      // 오늘 경기 참가자 조회
      const participants = await fetchRegisteredPlayersForDate(today);
      console.log('참가자 데이터 조회 결과:', participants);

      // 오늘 출석 데이터 조회
      const { data: attendanceRows, error: attErr } = await supabase
        .from('attendances')
        .select('user_id, status')
        .eq('attended_at', today);
        
      if (attErr) {
        console.error('출석 조회 오류:', attErr);
        // 출석 조회 실패해도 참가자는 absent 상태로 표시
        const absentPlayers = (participants || []).map((p) => ({
          ...p,
          score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, getLevelScore(p.skill_level)),
          status: 'absent' as const,
        }));
        setTodayPlayers(absentPlayers);
        setManualPlayers([]);
        return;
      }

      console.log('출석 데이터 조회 결과:', attendanceRows);

      // 참가자와 출석 데이터 결합
      const attendanceMap = new Map(
        (attendanceRows || []).map((row: any) => [row.user_id, row.status as ExtendedPlayer['status']])
      );
      const participantIds = new Set((participants || []).map((player) => player.id));
      const attendanceOnlyUserIds = Array.from(attendanceMap.keys()).filter((userId) => !participantIds.has(userId));
      let attendanceOnlyPlayers: ExtendedPlayer[] = [];

      if (attendanceOnlyUserIds.length > 0) {
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('id, username, full_name, skill_level, gender')
          .in('id', attendanceOnlyUserIds);

        if (profileErr) {
          console.error('출석 전용 사용자 프로필 조회 오류:', profileErr);
        } else {
          attendanceOnlyPlayers = (profiles || []).map((profile: any) => {
            const raw = (profile.skill_level || '').toString().toLowerCase();
            const normalized = normalizeLevel('', raw);
            const label = getAdminLevelDisplay(normalized);
            const name = profile.full_name || profile.username || `선수-${String(profile.id).slice(0, 4)}`;
            return {
              id: profile.id,
              name,
              skill_level: normalized,
              skill_label: label,
              score: getLevelScoreFromCode(currentLevelInfoMap, normalized, getLevelScore(normalized)),
              gender: profile.gender || '',
              skill_code: '',
              status: (attendanceMap.get(profile.id) || 'present') as ExtendedPlayer['status'],
            } as ExtendedPlayer;
          });
        }
      }

      const combinedPlayers = (participants || []).map(p => ({
        ...p,
        score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, getLevelScore(p.skill_level)),
        status: (attendanceMap.get(p.id) || 'absent') as ExtendedPlayer['status']
      })) as ExtendedPlayer[];

      const mergedPlayersMap = new Map<string, ExtendedPlayer>();
      combinedPlayers.forEach((player) => mergedPlayersMap.set(player.id, player));
      attendanceOnlyPlayers.forEach((player) => mergedPlayersMap.set(player.id, player));

      const mergedPlayers = Array.from(mergedPlayersMap.values());

      console.log('최종 결합된 플레이어 데이터:', mergedPlayers);
      setTodayPlayers(mergedPlayers);
      setManualPlayers(attendanceOnlyPlayers);

    } catch (error) {
      console.error('출석 데이터 갱신 오류:', error);
      // 오류 발생 시에도 참가자 데이터는 absent 상태로 표시
      try {
        const currentLevelInfoMap = await ensureLevelInfoMap();
        const participants = await fetchRegisteredPlayersForDate(today);
        const absentPlayers = participants.map(p => ({
          ...p,
          score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, getLevelScore(p.skill_level)),
          status: 'absent' as const,
        }));
        setTodayPlayers(absentPlayers);
        setManualPlayers([]);
      } catch (fallbackError) {
        console.error('참가자 데이터 조회 실패:', fallbackError);
        setTodayPlayers([]);
        setManualPlayers([]);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      console.log('페이지 초기 로딩 시작');
      await fetchMemberPlayers();
      await refreshAttendanceData();
      await fetchMatchSessions();
      await fetchTodaySchedules();
      console.log('페이지 초기 로딩 완료');
    };
    init();
  }, []);

  useEffect(() => {
    if (matches.length === 0 || Object.keys(levelInfoMap).length === 0) {
      return;
    }

    setMatches((prevMatches) =>
      prevMatches.map((match) => ({
        ...match,
        team1: {
          player1: {
            ...match.team1.player1,
            score: getLevelScoreFromCode(levelInfoMap, match.team1.player1.skill_level, getLevelScore(match.team1.player1.skill_level)),
          },
          player2: {
            ...match.team1.player2,
            score: getLevelScoreFromCode(levelInfoMap, match.team1.player2.skill_level, getLevelScore(match.team1.player2.skill_level)),
          },
        },
        team2: {
          player1: {
            ...match.team2.player1,
            score: getLevelScoreFromCode(levelInfoMap, match.team2.player1.skill_level, getLevelScore(match.team2.player1.skill_level)),
          },
          player2: {
            ...match.team2.player2,
            score: getLevelScoreFromCode(levelInfoMap, match.team2.player2.skill_level, getLevelScore(match.team2.player2.skill_level)),
          },
        },
      }))
    );
  }, [levelInfoMap]);

  // 포커스 시 갱신: 오늘 세션/일정/팀 구성 재조회
  useEffect(() => {
    const onFocus = () => {
      console.log('페이지 포커스 - 데이터 갱신');
      refreshAttendanceData().catch(err => console.error('포커스 갱신 오류:', err));
      fetchMatchSessions();
      fetchTodaySchedules();
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

      if (error) {
        throw error;
      }

      setMatchSessions((data || []) as MatchSession[]);
    } catch (e) {
      console.error('세션 조회 오류:', e);
      setMatchSessions([]);
    }
  };

  const fetchTodaySchedules = async () => {
    try {
      const today = getTodayLocal();
      const { data, error } = await supabase
        .from('match_schedules')
        .select('id, match_date, start_time, end_time, location, status, current_participants, max_participants, generated_match_id, schedule_source')
        .eq('match_date', today)
        .or('schedule_source.eq.recurring,generated_match_id.is.null')
        .order('start_time', { ascending: true });

      if (error) {
        throw error;
      }

      setTodaySchedules((data || []).map((schedule) => ({
        id: schedule.id,
        match_date: schedule.match_date,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        location: schedule.location,
        status: schedule.status,
        current_participants: schedule.current_participants,
        max_participants: schedule.max_participants,
      })));
    } catch (e) {
      console.error('오늘 경기 일정 조회 오류:', e);
      setTodaySchedules([]);
    }
  };

  const handleAssignByLevel = async () => {
    if (!effectiveTodayPlayers) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = effectiveTodayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) {
        alert('최소 4명의 출석자가 필요합니다.');
        return;
      }
      const playersForMatch = attachScoresWithMap(
        present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }))
        ,
        currentLevelInfoMap
      );
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
    if (!effectiveTodayPlayers) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = effectiveTodayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
      // normalize levels for scoring
      const playersForMatch = attachScoresWithMap(
        present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }))
        ,
        currentLevelInfoMap
      );
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
    if (!effectiveTodayPlayers) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = effectiveTodayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
      const playersForMatch = attachScoresWithMap(
        present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }))
        ,
        currentLevelInfoMap
      );
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
    if (!effectiveTodayPlayers) return;
    const present = effectiveTodayPlayers.filter(p => p.status === 'present');
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

  const handleManualMatchesCreate = (manualMatches: Match[]) => {
    setMatches(manualMatches);
    setSessionMode('수동');
    setPlayerGameCounts(calculatePlayerGameCounts(manualMatches));
    console.log(`✅ 수동 배정: ${manualMatches.length}개 경기 생성 완료`);
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const toggleSelectAllMembers = () => {
    if (selectedMemberIds.length === availableMembersToAdd.length) {
      setSelectedMemberIds([]);
      return;
    }

    setSelectedMemberIds(availableMembersToAdd.map((member) => member.id));
  };

  const applyAttendanceStatusLocally = (memberIds: string[], status: ExtendedPlayer['status']) => {
    if (memberIds.length === 0) {
      return;
    }

    const memberIdSet = new Set(memberIds);

    setTodayPlayers((prev) => {
      if (prev === null) {
        return prev;
      }

      return prev.map((player) =>
        memberIdSet.has(player.id)
          ? {
              ...player,
              status,
            }
          : player
      );
    });

    setManualPlayers((prev) =>
      prev.map((player) =>
        memberIdSet.has(player.id)
          ? {
              ...player,
              status,
            }
          : player
      )
    );
  };

  const saveAttendanceStatuses = async (memberIds: string[], status: ExtendedPlayer['status']) => {
    if (memberIds.length === 0) {
      return;
    }

    applyAttendanceStatusLocally(memberIds, status);

    const attendedAt = getTodayLocal();

    try {
      const response = await fetch('/api/admin/attendance', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds: memberIds,
          status,
          attendedAt,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn('관리자 출석 API 실패, 클라이언트 저장으로 fallback:', payload);
        const { error } = await supabase
          .from('attendances')
          .upsert(
            memberIds.map((userId) => ({
              user_id: userId,
              attended_at: attendedAt,
              status,
            })),
            { onConflict: 'user_id,attended_at' }
          );

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      console.error('출석 저장 fallback 실패:', error);
      throw error;
    }

    await refreshAttendanceData();
  };

  const handleAttendanceStatusChange = async (memberId: string, status: ExtendedPlayer['status']) => {
    setAttendanceLoading(true);
    try {
      await saveAttendanceStatuses([memberId], status);
    } catch (error) {
      console.error('개별 출석 저장 오류:', error);
      alert('출석 상태 저장 중 오류가 발생했습니다.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleBulkAttendanceChange = async (memberIds: string[], status: ExtendedPlayer['status']) => {
    setAttendanceLoading(true);
    try {
      await saveAttendanceStatuses(memberIds, status);
    } catch (error) {
      console.error('일괄 출석 저장 오류:', error);
      alert('출석 상태 일괄 저장 중 오류가 발생했습니다.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const addSelectedMembersToAttendance = async () => {
    if (selectedMemberIds.length === 0) {
      return;
    }

    try {
      await saveAttendanceStatuses(selectedMemberIds, 'present');

      setSelectedMemberIds([]);
      setShowMemberModal(false);
      alert('선택한 회원이 오늘 출석자에 추가되었습니다.');
    } catch (error) {
      console.error('회원 출석 추가 중 오류:', error);
      alert('회원 추가 중 오류가 발생했습니다.');
    }
  };

  const removeManualPlayer = async (playerId: string) => {
    try {
      const today = getTodayLocal();
      const { error } = await supabase
        .from('attendances')
        .delete()
        .eq('user_id', playerId)
        .eq('attended_at', today);

      if (error) {
        console.error('수동 추가 회원 제거 오류:', error);
        alert('수동 추가 회원 제거 중 오류가 발생했습니다.');
        return;
      }

      await refreshAttendanceData();
    } catch (error) {
      console.error('수동 추가 회원 제거 중 오류:', error);
      alert('수동 추가 회원 제거 중 오류가 발생했습니다.');
    }
  };

  const deleteTodaySession = async (sessionId: string) => {
    if (!confirm('이 배정된 경기 세션을 삭제하시겠습니까? 세션에 포함된 경기들도 함께 삭제됩니다.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/match-sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error('배정 세션 삭제 오류:', payload);
        alert(payload?.error || '배정 세션 삭제 중 오류가 발생했습니다.');
        return;
      }

      await fetchTodaySchedules();
      await fetchMatchSessions();
      alert('배정 세션이 삭제되었습니다.');
    } catch (error) {
      console.error('배정 세션 삭제 중 오류:', error);
      alert('배정 세션 삭제 중 오류가 발생했습니다.');
    }
  };

  const deleteAllTodaySessions = async () => {
    if (matchSessions.length === 0) {
      alert('삭제할 배정된 세션이 없습니다.');
      return;
    }

    if (!confirm(`오늘 배정된 세션 ${matchSessions.length}개를 모두 삭제하시겠습니까? 세션 내 경기들도 함께 삭제됩니다.`)) {
      return;
    }

    try {
      let deletedCount = 0;
      for (const session of [...matchSessions]) {
        const response = await fetch('/api/admin/match-sessions', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: session.id }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          console.error('배정 세션 전체 삭제 오류:', payload);
          alert(payload?.error || '배정 세션 전체 삭제 중 오류가 발생했습니다.');
          return;
        }

        deletedCount += 1;
      }

      await fetchTodaySchedules();
      await fetchMatchSessions();
      await refreshAttendanceData();
      alert(`오늘 배정된 세션 ${deletedCount}개가 모두 삭제되었습니다.`);
    } catch (error) {
      console.error('배정 세션 전체 삭제 중 오류:', error);
      alert('배정 세션 전체 삭제 중 오류가 발생했습니다.');
    }
  };

  const deleteSessionMatch = async (sessionId: string, matchId: string) => {
    if (!confirm('이 세션의 개별 경기를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/match-sessions/${sessionId}/matches`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('개별 경기 삭제 오류:', payload);
        alert(payload?.error || '개별 경기 삭제 중 오류가 발생했습니다.');
        return;
      }

      await fetchMatchSessions();
      await fetchTodaySchedules();
      alert('개별 경기가 삭제되었습니다.');
    } catch (error) {
      console.error('개별 경기 삭제 중 오류:', error);
      alert('개별 경기 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) { alert('배정할 경기가 없습니다.'); return; }
    const today = getTodayLocal();
    setLoading(true);
    try {
      const response = await fetch('/api/admin/match-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_date: today,
          mode: sessionMode,
          matches,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '배정 저장 실패');
      }

      alert(
        `✅ ${matches.length}개 경기가 오늘 경기로 배정되었습니다.\n` +
        `세션: ${payload?.session_name || '생성 완료'}\n` +
        `사용자 화면 노출용 일정 연결: ${payload?.scheduled_count ?? 0}건`
      );
      setMatches([]);
      setPlayerGameCounts({});
      await fetchMatchSessions();
      await fetchTodaySchedules();
    } catch (e) {
      console.error('배정 오류:', e);
      alert(`배정 중 오류가 발생했습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally { setLoading(false); }
  };

  return (
    <RequireAdmin>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">오늘 경기 생성/배정</h1>
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          오늘 경기에서 생성 후 배정하면 사용자 대시보드와 나의 일정에 바로 보이도록 자동 처리됩니다.
        </div>
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-amber-900">관리자 수동 출석자 추가</h3>
              <p className="text-sm text-amber-800">
                오늘 참가 신청자 외에도 관리자가 원하는 회원을 출석자에 직접 추가해 경기 생성에 포함할 수 있습니다.
              </p>
            </div>
            <div className="text-sm text-amber-900">추가됨 {manualPlayers.length}명</div>
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <button
              type="button"
              onClick={() => setShowMemberModal(true)}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              회원추가
            </button>
            <span className="text-sm text-amber-800">추가한 회원은 출석 상태로 즉시 반영되고 경기 생성 대상에 포함됩니다.</span>
          </div>
          {manualPlayers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {manualPlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => removeManualPlayer(player.id)}
                  className="rounded-full border border-amber-500 bg-amber-500 px-3 py-1 text-sm text-white transition-colors hover:bg-amber-600"
                >
                  제거 · {player.name} ({player.skill_label || player.skill_level})
                </button>
              ))}
            </div>
          )}
        </div>
        <AttendanceStatus
          todayPlayers={effectiveTodayPlayers}
          onStatusChange={handleAttendanceStatusChange}
          onBulkStatusChange={handleBulkAttendanceChange}
          disabled={attendanceLoading}
        />
        
        <MatchSessionStatus
          matchSessions={matchSessions}
          registeredSchedules={todaySchedules}
          onDeleteSession={deleteTodaySession}
          onDeleteSessionMatch={deleteSessionMatch}
          onDeleteAllSessions={deleteAllTodaySessions}
        />

        <MatchGenerationControls
          todayPlayers={effectiveTodayPlayers}
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
          levelInfoMap={levelInfoMap}
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
          presentPlayers={effectiveTodayPlayers?.filter(p => p.status === 'present') || []}
          onManualMatchChange={handleManualMatchChange}
        />
      </div>
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">출석자에 회원 추가</h2>
                <p className="text-sm text-gray-500">추가할 회원을 여러 명 선택한 뒤 확인을 누르세요.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMemberModal(false);
                  setSelectedMemberIds([]);
                }}
                className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                닫기
              </button>
            </div>
            <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-3 text-sm">
              <span className="text-gray-600">추가 가능 회원 {availableMembersToAdd.length}명</span>
              <button
                type="button"
                onClick={toggleSelectAllMembers}
                className="rounded-md border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white"
              >
                {selectedMemberIds.length === availableMembersToAdd.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              {availableMembersToAdd.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  추가 가능한 회원이 없습니다.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  {availableMembersToAdd.map((member) => {
                    const checked = selectedMemberIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          checked ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-amber-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMemberSelection(member.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-900">{member.name}</div>
                          <div className="mt-1 text-sm text-gray-500">
                            {member.skill_label || member.skill_level} · {member.gender || '성별 미지정'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowMemberModal(false);
                  setSelectedMemberIds([]);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={addSelectedMembersToAttendance}
                disabled={selectedMemberIds.length === 0}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-200"
              >
                선택한 회원 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireAdmin>
  );
}
