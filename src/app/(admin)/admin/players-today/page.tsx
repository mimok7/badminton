'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Swords } from 'lucide-react';
import { RequireAdmin } from '@/components/AuthGuard';
import AttendanceStatus from '@/app/(admin)/players/components/AttendanceStatus';
import MatchSessionStatus from '@/app/(admin)/players/components/MatchSessionStatus';
import MatchGenerationControls from '@/app/(admin)/players/components/MatchGenerationControls';
import GeneratedMatchesList from '@/app/(admin)/players/components/GeneratedMatchesList';
import { ExtendedPlayer, MatchSession } from '@/app/(admin)/players/types';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchTodayPlayers, fetchRegisteredPlayersForDate, calculatePlayerGameCounts, fetchProfilesByUserIds, normalizeLevel } from '@/app/(admin)/players/utils';
import { Match } from '@/types';
import { getKoreaDate } from '@/lib/date';
import { getAdminLevelDisplay } from '@/lib/level-display';
import { fetchLevelInfoMap, getLevelScoreFromCode, type LevelInfoMap } from '@/lib/level-info';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';

type AssignedScheduleDetail = ScheduledMatchView & {
  session_id: string | null;
  match_number: number;
  team1_player1_skill_level: string;
  team1_player2_skill_level: string;
  team2_player1_skill_level: string;
  team2_player2_skill_level: string;
  team1_player1_score: number;
  team1_player2_score: number;
  team2_player1_score: number;
  team2_player2_score: number;
  team1_total_score: number;
  team2_total_score: number;
};

interface MemberOption {
  id: string;
  name: string;
  skill_level: string;
  skill_label: string;
  score?: number;
  gender: string;
  skill_code: string;
}

interface ActiveCourtOption {
  id: string;
  name: string;
  location?: string | null;
  order_index?: number | null;
}

export default function PlayersTodayPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [memberPlayers, setMemberPlayers] = useState<MemberOption[]>([]);
  const [activeCourts, setActiveCourts] = useState<ActiveCourtOption[]>([]);
  const [manualPlayers, setManualPlayers] = useState<ExtendedPlayer[]>([]);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Array<{
    id: string;
    generated_match_id?: number | null;
    schedule_source?: string | null;
    match_date: string | null;
    start_time: string | null;
    end_time: string | null;
    scheduled_time?: string | null;
    court_number?: number | null;
    description?: string | null;
    location: string | null;
    court_name?: string | null;
    status: string;
    current_participants: number | null;
    max_participants: number | null;
  }>>([]);
  const [assignedScheduleDetails, setAssignedScheduleDetails] = useState<Record<string, AssignedScheduleDetail>>({});
  const [levelInfoMap, setLevelInfoMap] = useState<LevelInfoMap>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [deletingAllSessions, setDeletingAllSessions] = useState(false);
  const [deletingSessionIds, setDeletingSessionIds] = useState<Record<string, boolean>>({});
  const [deletingMatchIds, setDeletingMatchIds] = useState<Record<string, boolean>>({});
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  const [sessionMode, setSessionMode] = useState<'레벨' | '랜덤' | '혼복' | '수동'>('레벨');
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [assignTarget, setAssignTarget] = useState<'attendees' | 'participants'>('attendees');

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

  const targetPlayersForMatch = useMemo(() => {
    if (!effectiveTodayPlayers) return null;
    if (assignTarget === 'attendees') {
      return effectiveTodayPlayers.filter(p => p.status === 'present');
    }
    return effectiveTodayPlayers;
  }, [effectiveTodayPlayers, assignTarget]);

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
    return getLevelScoreFromCode(levelInfoMap, skillLevel, 0);
  };

  const formatScore = (score?: number) => {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return '0.0';
    }

    return score.toFixed(1);
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
      score: getLevelScoreFromCode(map, player.skill_level, 0),
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
          score: getLevelScoreFromCode(nextLevelInfoMap, normalizedLevel, 0),
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

  const fetchActiveCourts = async () => {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, location, order_index')
        .eq('is_active', true)
        .order('order_index', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setActiveCourts((data || []) as ActiveCourtOption[]);
    } catch (error) {
      console.error('활성 코트 조회 오류:', error);
      setActiveCourts([]);
    }
  };

  // 출석 데이터 갱신 함수
  const refreshAttendanceData = async () => {
    const today = getTodayLocal();
    console.log('출석 데이터 갱신 시작 - 날짜:', today);

    try {
      const [currentLevelInfoMap, participants, { data: attendanceRows, error: attErr }] = await Promise.all([
        ensureLevelInfoMap(),
        fetchRegisteredPlayersForDate(today),
        supabase
          .from('attendances')
          .select('user_id, status')
          .eq('attended_at', today)
      ]);

      console.log('참가자 데이터 조회 결과:', participants);
        
      if (attErr) {
        console.error('출석 조회 오류:', attErr);
        // 출석 조회 실패해도 참가자는 absent 상태로 표시
        const absentPlayers = (participants || []).map((p) => ({
          ...p,
          score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, 0),
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
        try {
          const profiles = await fetchProfilesByUserIds(attendanceOnlyUserIds);
          attendanceOnlyPlayers = (profiles || []).map((profile: any) => {
            const raw = (profile.skill_level || '').toString().toLowerCase();
            const normalized = normalizeLevel('', raw);
            const label = getAdminLevelDisplay(normalized);
            const playerId = profile.user_id || profile.id;
            const name = profile.full_name || profile.username || `선수-${String(playerId).slice(0, 4)}`;
            return {
              id: playerId,
              name,
              skill_level: normalized,
              skill_label: label,
              score: getLevelScoreFromCode(currentLevelInfoMap, normalized, 0),
              gender: profile.gender || '',
              skill_code: '',
              status: (attendanceMap.get(playerId) || 'present') as ExtendedPlayer['status'],
            } as ExtendedPlayer;
          });
        } catch (profileErr) {
          console.error('출석 전용 사용자 프로필 조회 오류:', profileErr);
        }
      }

      const combinedPlayers = (participants || []).map(p => ({
        ...p,
        score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, 0),
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
          score: getLevelScoreFromCode(currentLevelInfoMap, p.skill_level, 0),
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
      // 독립적인 데이터 조회들을 병렬로 실행하여 로딩 속도 개선
      await Promise.all([
        fetchMemberPlayers(),
        fetchActiveCourts(),
        refreshAttendanceData(),
        fetchMatchSessions(),
        fetchTodaySchedules(),
      ]);
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
            score: getLevelScoreFromCode(levelInfoMap, match.team1.player1.skill_level, 0),
          },
          player2: {
            ...match.team1.player2,
            score: getLevelScoreFromCode(levelInfoMap, match.team1.player2.skill_level, 0),
          },
        },
        team2: {
          player1: {
            ...match.team2.player1,
            score: getLevelScoreFromCode(levelInfoMap, match.team2.player1.skill_level, 0),
          },
          player2: {
            ...match.team2.player2,
            score: getLevelScoreFromCode(levelInfoMap, match.team2.player2.skill_level, 0),
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
      const [{ data, error }, { count: activeAttendanceCount, error: attendanceCountError }] = await Promise.all([
        supabase
          .from('match_schedules')
          .select('id, generated_match_id, schedule_source, match_date, start_time, end_time, scheduled_time, court_number, location, status, current_participants, max_participants, description')
          .eq('match_date', today)
          .order('generated_match_id', { ascending: true })
          .order('start_time', { ascending: true })
          .order('scheduled_time', { ascending: true }),
        supabase
          .from('attendances')
          .select('*', { count: 'exact', head: true })
          .eq('attended_at', today)
          .in('status', ['present', 'lesson']),
      ]);

      if (error) {
        throw error;
      }

      if (attendanceCountError) {
        console.error('오늘 출석 인원 수 조회 오류:', attendanceCountError);
      }

      const originalSchedules = (data || []).filter((schedule) => schedule.generated_match_id == null);
      const shouldApplyAttendanceFallback = originalSchedules.length === 1;
      const originalScheduleId = shouldApplyAttendanceFallback ? originalSchedules[0]?.id : null;
      const activeCourtNameByNumber = new Map(
        activeCourts.map((court, index) => [index + 1, court.name || null] as const)
      );
      setTodaySchedules((data || []).map((schedule) => ({
        id: schedule.id,
        generated_match_id: schedule.generated_match_id,
        schedule_source: schedule.schedule_source,
        match_date: schedule.match_date,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        scheduled_time: schedule.scheduled_time,
        court_number: schedule.court_number,
        description: schedule.description,
        location: schedule.location,
        court_name:
          typeof schedule.court_number === 'number'
            ? activeCourtNameByNumber.get(schedule.court_number) ?? null
            : null,
        status: schedule.status,
        current_participants:
          shouldApplyAttendanceFallback &&
          schedule.id === originalScheduleId &&
          (schedule.current_participants || 0) < (activeAttendanceCount || 0)
            ? activeAttendanceCount || 0
            : schedule.current_participants,
        max_participants: schedule.max_participants,
      })));

      const hasGeneratedSchedules = (data || []).some((schedule) => typeof schedule.generated_match_id === 'number');

      if (!hasGeneratedSchedules) {
        setAssignedScheduleDetails({});
        return;
      }
      const currentLevelInfoMap =
        Object.keys(levelInfoMap).length > 0 ? levelInfoMap : await fetchLevelInfoMap(supabase);
      const scheduledMatches = await fetchScheduledMatchesForDate(supabase, today);
      const generatedMatchIds = scheduledMatches
        .map((match) => match.generated_match_id)
        .filter((id): id is number => typeof id === 'number');
      const { data: generatedMatchRows, error: generatedMatchRowsError } = generatedMatchIds.length > 0
        ? await supabase
            .from('generated_matches')
            .select('id, session_id, match_number')
            .in('id', generatedMatchIds)
        : { data: [], error: null };

      if (generatedMatchRowsError) {
        throw generatedMatchRowsError;
      }

      const generatedMatchInfoById = new Map(
        (generatedMatchRows || []).map((row: any) => [
          String(row.id),
          {
            session_id: row.session_id || null,
            match_number: typeof row.match_number === 'number' ? row.match_number : 0,
          },
        ])
      );

      const profileIds = Array.from(
        new Set(
          scheduledMatches
            .flatMap((match) => [
              match.team1_player1,
              match.team1_player2,
              match.team2_player1,
              match.team2_player2,
            ])
            .filter((id): id is string => Boolean(id))
        )
      );

      const profileRows = profileIds.length > 0
        ? await fetchProfilesByUserIds(profileIds)
        : [];

      const profileSkillById = new Map<string, string>();
      (profileRows || []).forEach((row: any) => {
        const normalizedLevel = normalizeLevel('', row.skill_level || 'e2');
        if (row.id) profileSkillById.set(row.id, normalizedLevel);
        if (row.user_id) profileSkillById.set(row.user_id, normalizedLevel);
      });

      const nextAssignedScheduleDetails = scheduledMatches.reduce<Record<string, AssignedScheduleDetail>>((acc, match) => {
        if (match.generated_match_id != null) {
          const team1Player1SkillLevel = profileSkillById.get(match.team1_player1 || '') || 'E2';
          const team1Player2SkillLevel = profileSkillById.get(match.team1_player2 || '') || 'E2';
          const team2Player1SkillLevel = profileSkillById.get(match.team2_player1 || '') || 'E2';
          const team2Player2SkillLevel = profileSkillById.get(match.team2_player2 || '') || 'E2';
          const team1Player1Score = getLevelScoreFromCode(currentLevelInfoMap, team1Player1SkillLevel, 0);
          const team1Player2Score = getLevelScoreFromCode(currentLevelInfoMap, team1Player2SkillLevel, 0);
          const team2Player1Score = getLevelScoreFromCode(currentLevelInfoMap, team2Player1SkillLevel, 0);
          const team2Player2Score = getLevelScoreFromCode(currentLevelInfoMap, team2Player2SkillLevel, 0);

          acc[String(match.generated_match_id)] = {
            ...match,
            session_id: generatedMatchInfoById.get(String(match.generated_match_id))?.session_id || null,
            match_number: generatedMatchInfoById.get(String(match.generated_match_id))?.match_number || 0,
            team1_player1_skill_level: team1Player1SkillLevel,
            team1_player2_skill_level: team1Player2SkillLevel,
            team2_player1_skill_level: team2Player1SkillLevel,
            team2_player2_skill_level: team2Player2SkillLevel,
            team1_player1_score: team1Player1Score,
            team1_player2_score: team1Player2Score,
            team2_player1_score: team2Player1Score,
            team2_player2_score: team2Player2Score,
            team1_total_score: team1Player1Score + team1Player2Score,
            team2_total_score: team2Player1Score + team2Player2Score,
          };
        }
        return acc;
      }, {});

      setAssignedScheduleDetails(nextAssignedScheduleDetails);
    } catch (e) {
      console.error('오늘 경기 일정 조회 오류:', e);
      setTodaySchedules([]);
      setAssignedScheduleDetails({});
    }
  };

  const handleAssignByLevel = async () => {
    if (!targetPlayersForMatch) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = targetPlayersForMatch;
      if (present.length < 4) {
        alert('최소 4명의 참가자가 필요합니다.');
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
      
      let generated: any[] = [];
      let attempts = 0;
      
      while (attempts < 4) {
        generated = await Promise.resolve(createBalancedDoublesMatches(playersForMatch, perPlayerMinGames));
        
        const counts = calculatePlayerGameCounts(generated);
        const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
        
        // 목표 경기수를 만족하고 모든 선수가 최소 경기수를 채웠다면 성공
        if (generated.length >= targetMatches && missing.length === 0) {
          break;
        }
        
        attempts += 1;
      }
      
      // 최종 검증: 모든 참가자가 포함되었는지 확인
      const finalCounts = calculatePlayerGameCounts(generated);
      const stillMissing = playersForMatch.filter(p => (finalCounts[p.id] || 0) < perPlayerMinGames);
      
      if (stillMissing.length > 0) {
        const missingNames = stillMissing.map(p => p.name).join(', ');
        console.warn(`⚠️ ${stillMissing.length}명의 선수가 목표 경기수에 도달하지 못했습니다:`, missingNames);
        console.warn(`생성된 경기: ${generated.length}개, 목표: ${targetMatches}개`);
      }
      
      // 전체 참가자 통계 출력
      console.log('📊 레벨별 경기 생성 완료:');
      console.log(`- 총 참가자: ${playersForMatch.length}명`);
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
    if (!targetPlayersForMatch) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = targetPlayersForMatch;
      if (present.length < 4) { alert('최소 4명의 참가자가 필요합니다.'); return; }
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
        while (attempts < 4) {
          generated = await Promise.resolve(createRandomBalancedDoublesMatches(playersForMatch, perPlayerMinGames));
          const counts = calculatePlayerGameCounts(generated);
          const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
          if (generated.length >= targetMatches && missing.length === 0) break;
          attempts += 1;
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
    if (!targetPlayersForMatch) return;
    setLoading(true);
    try {
      const currentLevelInfoMap = await ensureLevelInfoMap();
      const present = targetPlayersForMatch;
      if (present.length < 4) { alert('최소 4명의 참가자가 필요합니다.'); return; }
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
        while (attempts < 4) {
          generated = await Promise.resolve(createMixedAndSameSexDoublesMatches(playersForMatch, perPlayerMinGames));
          const counts = calculatePlayerGameCounts(generated);
          const missing = playersForMatch.filter(p => (counts[p.id] || 0) < perPlayerMinGames);
          if (generated.length >= targetMatches && missing.length === 0) break;
          attempts += 1;
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
    if (!targetPlayersForMatch) return;
    const present = targetPlayersForMatch;
    if (present.length < 4) { alert('최소 4명의 참가자가 필요합니다.'); return; }

    // target matches 계산 및 빈 슬롯 생성
    const targetMatches = Math.ceil((present.length * perPlayerMinGames) / 4);

    const emptyMatches: any[] = Array.from({ length: Math.max(1, targetMatches) }).map((_, i) => ({
      id: `manual-empty-${Date.now()}-${i}`,
      team1: { player1: null, player2: null },
      team2: { player1: null, player2: null },
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
    if (!confirm('이 배정된 게임 세션을 삭제하시겠습니까? 세션에 포함된 게임들도 함께 삭제됩니다.')) {
      return;
    }

    try {
      setDeletingSessionIds((current) => ({ ...current, [sessionId]: true }));
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
    } finally {
      setDeletingSessionIds((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    }
  };

  const deleteAllTodaySessions = async () => {
    let sessionIdsToDelete = matchSessions.length > 0
      ? matchSessions.map((session) => session.id)
      : Array.from(
          new Set(
            Object.values(assignedScheduleDetails)
              .map((detail) => detail.session_id)
              .filter((sessionId): sessionId is string => Boolean(sessionId))
          )
        );

    if (sessionIdsToDelete.length === 0) {
      try {
        const response = await fetch('/api/admin/match-sessions?date=today', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        if (response.ok && Array.isArray(payload?.sessions)) {
          sessionIdsToDelete = payload.sessions
            .map((session: { id?: string | null }) => session?.id)
            .filter((sessionId: string | null | undefined): sessionId is string => Boolean(sessionId));
        }
      } catch (error) {
        console.error('전체 삭제용 세션 재조회 오류:', error);
      }
    }

    if (sessionIdsToDelete.length === 0) {
      alert('삭제할 배정된 세션이 없습니다.');
      return;
    }

    if (!confirm(`오늘 배정된 세션 ${sessionIdsToDelete.length}개를 모두 삭제하시겠습니까? 세션 내 게임들도 함께 삭제됩니다.`)) {
      return;
    }

    try {
      setDeletingAllSessions(true);
      let deletedCount = 0;
      for (const sessionId of sessionIdsToDelete) {
        const response = await fetch('/api/admin/match-sessions', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
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
    } finally {
      setDeletingAllSessions(false);
    }
  };

  const deleteSessionMatch = async (sessionId: string, matchId: string) => {
    if (!confirm('이 세션의 개별 경기를 삭제하시겠습니까?')) {
      return;
    }

    try {
      setDeletingMatchIds((current) => ({ ...current, [matchId]: true }));
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
    } finally {
      setDeletingMatchIds((current) => {
        const next = { ...current };
        delete next[matchId];
        return next;
      });
    }
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) { alert('배정할 게임이 없습니다.'); return; }
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
        `✅ ${matches.length}개 게임이 오늘 경기로 배정되었습니다.\n` +
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
      <div className="p-1 md:p-6">
        <section className="relative overflow-hidden rounded-[24px] bg-[#0f172a] px-4 py-4 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] mb-4 sm:mb-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between px-1">
            <div className="space-y-0.5 pl-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-0.5 text-[11px] font-semibold text-indigo-300">
                <Swords className="h-3.5 w-3.5" />
                오늘경기
              </span>
              <h1 className="text-xl font-bold tracking-tight">오늘 게임 생성/배정</h1>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">오늘 출석 선수를 확인하고 실시간 게임 배정을 진행합니다.</p>
            </div>
            <Link href="/admin">
              <Button variant="outline" className="rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/15 border-0 flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                관리자 홈
              </Button>
            </Link>
          </div>
        </section>
        
        <div className="hidden md:block mb-4 sm:mb-6">
          <AttendanceStatus
            todayPlayers={effectiveTodayPlayers}
            onStatusChange={handleAttendanceStatusChange}
            onBulkStatusChange={handleBulkAttendanceChange}
            disabled={attendanceLoading}
            headerActions={
              <button
                type="button"
                onClick={() => setShowMemberModal(true)}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
              >
                회원추가
              </button>
            }
          />
        </div>
        
        <div className="mb-4 sm:mb-6">
          <MatchSessionStatus
            matchSessions={matchSessions}
            registeredSchedules={todaySchedules}
            assignedScheduleDetails={assignedScheduleDetails}
            levelInfoMap={levelInfoMap}
            onDeleteSession={deleteTodaySession}
            onDeleteSessionMatch={deleteSessionMatch}
            onDeleteAllSessions={deleteAllTodaySessions}
            deletingAllSessions={deletingAllSessions}
            deletingSessionIds={deletingSessionIds}
            deletingMatchIds={deletingMatchIds}
          />
        </div>

        <MatchGenerationControls
          todayPlayers={targetPlayersForMatch}
          allPlayers={effectiveTodayPlayers}
          perPlayerMinGames={perPlayerMinGames}
          setPerPlayerMinGames={setPerPlayerMinGames}
          assignTarget={assignTarget}
          setAssignTarget={setAssignTarget}
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
          presentPlayers={effectiveTodayPlayers || []}
          onManualMatchChange={handleManualMatchChange}
        />
      </div>
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 sm:text-lg">출석자에 회원 추가</h2>
                <p className="hidden text-sm text-gray-500 sm:block">추가할 회원을 여러 명 선택한 뒤 확인을 누르세요.</p>
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
            <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm">
              <span className="text-gray-600">추가 가능 회원 {availableMembersToAdd.length}명</span>
              <button
                type="button"
                onClick={toggleSelectAllMembers}
                className="rounded-md border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white"
              >
                {selectedMemberIds.length === availableMembersToAdd.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
              {availableMembersToAdd.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  추가 가능한 회원이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 sm:gap-3">
                  {availableMembersToAdd.map((member) => {
                    const checked = selectedMemberIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors sm:gap-3 sm:p-3 ${
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
                            {member.skill_label || member.skill_level} · {formatScore(member.score)}점 · {member.gender || '성별 미지정'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
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
