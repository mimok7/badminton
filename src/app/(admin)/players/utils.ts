export { supabase } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { getKoreaDate } from '@/lib/date';
import { AvailableDate, ExtendedPlayer, GeneratedMatch } from './types';
import type { Database } from '@/types/supabase';
import { getAdminLevelDisplay, getNormalizedSkillCode } from '@/lib/level-display';
import { fetchLevelInfoMap, getLevelScoreFromCode } from '@/lib/level-info';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type GeneratedMatchRow = Database['public']['Tables']['generated_matches']['Row'];
type MatchScheduleRow = Database['public']['Tables']['match_schedules']['Row'];
const normalizeAttendanceStatus = (value: string | null | undefined): ExtendedPlayer['status'] =>
  value === 'present' || value === 'lesson' || value === 'absent' ? value : 'absent';

export function normalizeLevel(skill_code: string | null | undefined, skill_level?: string | null | undefined): string {
  const normalized = getNormalizedSkillCode(skill_code || skill_level || undefined, 'E2');
  return normalized.toLowerCase();
}

// 대시보드에서 성공한 방식을 재사용한 프로필 조회 함수
export const fetchProfilesByUserIds = async (userIds: string[]) => {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  try {
    // ID 중복 제거
    const uniqueIds = Array.from(new Set(userIds));

    // Supabase URL 길이 제한 방지를 위해 청크로 분할 (50개씩)
    const CHUNK_SIZE = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
    }

    const allProfiles: any[] = [];

    for (const chunk of chunks) {
      // id 또는 user_id로 필터링하여 필요한 프로필만 조회
      const [byId, byUserId] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, user_id, username, full_name, skill_level, gender, role')
          .in('id', chunk),
        supabase
          .from('profiles')
          .select('id, user_id, username, full_name, skill_level, gender, role')
          .in('user_id', chunk),
      ]);

      const merged = new Map<string, any>();
      (byId.data || []).forEach(p => merged.set(p.id, p));
      (byUserId.data || []).forEach(p => {
        if (!merged.has(p.id)) merged.set(p.id, p);
      });

      allProfiles.push(...merged.values());
    }

    // 요청된 사용자 ID들과 일치하는 프로필만 반환
    const idSet = new Set(uniqueIds);
    return allProfiles.filter(profile =>
      idSet.has(profile.id) || (profile.user_id ? idSet.has(profile.user_id) : false)
    );
  } catch (error) {
    return [];
  }
};

const getProfileName = (profile?: Pick<ProfileRow, 'username' | 'full_name'> | null, fallback = '선수') =>
  profile?.full_name || profile?.username || fallback;

export const fetchAvailableScheduleDates = async (): Promise<AvailableDate[]> => {
  const { data: schedules, error } = await supabase
    .from('match_schedules')
    .select('match_date, location, start_time, end_time, max_participants, current_participants, status')
    .gte('match_date', getKoreaDate())
    .eq('status', 'scheduled')
    .order('match_date', { ascending: true });

  if (error) {
    throw error;
  }

  const validSchedules = (schedules || []).filter(
    (schedule): schedule is Pick<
      MatchScheduleRow,
      'match_date' | 'location' | 'start_time' | 'end_time' | 'max_participants' | 'current_participants' | 'status'
    > & { match_date: string } => Boolean(schedule.match_date)
  );

  const dateGroups: Record<string, AvailableDate['schedules']> = {};

  validSchedules.forEach((schedule) => {
    const date = schedule.match_date;
    if (!dateGroups[date]) {
      dateGroups[date] = [];
    }
    dateGroups[date].push(schedule);
  });

  return Object.entries(dateGroups).map(([date, groupedSchedules]) => {
    const totalCapacity = groupedSchedules.reduce((sum, schedule) => sum + (schedule.max_participants || 0), 0);
    const currentParticipants = groupedSchedules.reduce((sum, schedule) => sum + (schedule.current_participants || 0), 0);

    return {
      date,
      schedules: groupedSchedules,
      totalCapacity,
      currentParticipants,
      availableSlots: totalCapacity - currentParticipants,
      location: groupedSchedules[0]?.location || '장소 미정',
      timeRange: `${groupedSchedules[0]?.start_time || '시간'} - ${groupedSchedules[groupedSchedules.length - 1]?.end_time || '미정'}`,
    };
  });
};

export const fetchGeneratedMatchesBySession = async (sessionId: string): Promise<GeneratedMatch[]> => {
  const { data: matches, error } = await supabase
    .from('generated_matches')
    .select('id, session_id, match_number, status, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
    .eq('session_id', sessionId)
    .order('match_number', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (matches || []) as Pick<
    GeneratedMatchRow,
    'id' | 'session_id' | 'match_number' | 'status' | 'team1_player1_id' | 'team1_player2_id' | 'team2_player1_id' | 'team2_player2_id'
  >[];

  if (rows.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(
      rows.flatMap((match) => [
        match.team1_player1_id,
        match.team1_player2_id,
        match.team2_player1_id,
        match.team2_player2_id,
      ]).filter((id): id is string => Boolean(id))
    )
  );

  const [profiles, levelInfoMap] = await Promise.all([
    fetchProfilesByUserIds(profileIds),
    fetchLevelInfoMap(supabase),
  ]);
  const profileMap = new Map<string, any>();
  (profiles || []).forEach((profile: any) => {
    if (profile.id) profileMap.set(profile.id, profile);
    if (profile.user_id) profileMap.set(profile.user_id, profile);
  });

  const { data: schedules, error: schedulesError } = await supabase
    .from('match_schedules')
    .select('generated_match_id')
    .in('generated_match_id', rows.map((match) => match.id));

  if (schedulesError) {
    throw schedulesError;
  }

  const scheduledIds = new Set(
    (schedules || [])
      .map((schedule) => schedule.generated_match_id)
      .filter((id): id is number => typeof id === 'number')
  );

  return rows.map((match) => ({
    id: match.id,
    session_id: match.session_id,
    match_number: match.match_number,
    status: (match.status as GeneratedMatch['status']) || 'scheduled',
    team1_player1: {
      name: getProfileName(profileMap.get(match.team1_player1_id || '') || null, '선수1'),
      skill_level: profileMap.get(match.team1_player1_id || '')?.skill_level || 'E2',
      score: getLevelScoreFromCode(levelInfoMap, profileMap.get(match.team1_player1_id || '')?.skill_level, 0),
    },
    team1_player2: {
      name: getProfileName(profileMap.get(match.team1_player2_id || '') || null, '선수2'),
      skill_level: profileMap.get(match.team1_player2_id || '')?.skill_level || 'E2',
      score: getLevelScoreFromCode(levelInfoMap, profileMap.get(match.team1_player2_id || '')?.skill_level, 0),
    },
    team2_player1: {
      name: getProfileName(profileMap.get(match.team2_player1_id || '') || null, '선수3'),
      skill_level: profileMap.get(match.team2_player1_id || '')?.skill_level || 'E2',
      score: getLevelScoreFromCode(levelInfoMap, profileMap.get(match.team2_player1_id || '')?.skill_level, 0),
    },
    team2_player2: {
      name: getProfileName(profileMap.get(match.team2_player2_id || '') || null, '선수4'),
      skill_level: profileMap.get(match.team2_player2_id || '')?.skill_level || 'E2',
      score: getLevelScoreFromCode(levelInfoMap, profileMap.get(match.team2_player2_id || '')?.skill_level, 0),
    },
    is_scheduled: scheduledIds.has(match.id),
  }));
};


// 게임수 계산 함수
export const calculatePlayerGameCounts = (matches: any[]) => {
  const counts: Record<string, number> = {};
  
  matches.forEach(match => {
    // Player 객체에서 이름과 레벨 추출
    const extractPlayerInfo = (player: any) => {
      // player가 객체인 경우 name과 skill_level 속성 사용
      if (typeof player === 'object' && player.name) {
        const level = player.skill_level || 'E2';
        return `${player.name}(${level.toUpperCase()})`;
      }
      if (typeof player === 'string') {
        // 이미 형식화된 문자열인 경우 그대로 사용
        return player;
      }
      return String(player);
    };
    
    const player1 = extractPlayerInfo(match.team1.player1);
    const player2 = extractPlayerInfo(match.team1.player2);
    const player3 = extractPlayerInfo(match.team2.player1);
    const player4 = extractPlayerInfo(match.team2.player2);
    
    counts[player1] = (counts[player1] || 0) + 1;
    counts[player2] = (counts[player2] || 0) + 1;
    counts[player3] = (counts[player3] || 0) + 1;
    counts[player4] = (counts[player4] || 0) + 1;
  });
  
  return counts;
};

// 오늘 출석자 데이터 조회 함수
export const fetchTodayPlayers = async (): Promise<ExtendedPlayer[]> => {
  try {
    const today = getKoreaDate();
    
    // 출석 데이터 조회
    const { data: attendanceData, error } = await supabase
      .from('attendances')
      .select('id, user_id, status, attended_at')
      .eq('attended_at', today);
      
    if (error) {
      console.error('❌ 출석자 조회 오류:', error);
      return [];
    }
    
    if (!attendanceData || attendanceData.length === 0) {
      return [];
    }
    
    // 사용자 ID 추출 후 프로필 데이터 조회
    const userIds = attendanceData.map(a => a.user_id).filter(Boolean);
    
    if (userIds.length === 0) {
      return [];
    }
    
    // 프로필 데이터와 레벨 정보를 병렬로 조회
    const [profilesData, levelInfoMap] = await Promise.all([
      fetchProfilesByUserIds(userIds),
      fetchLevelInfoMap(supabase),
    ]);
      
    // 레벨 정보를 객체로 변환
    const levelMap: Record<string, string> = {};
    Object.entries(levelInfoMap).forEach(([code, meta]) => {
      levelMap[code] = meta.name || '';
    });
    
    if (profilesData && profilesData.length > 0) {
      // 프로필 데이터를 기반으로 선수 정보 생성
      const playersWithProfiles = profilesData
        .map((profile: any) => {
          const userId = profile.id;
          
          // 기본 skill_level 설정
          let skill_level = profile.skill_level ? String(profile.skill_level).toLowerCase() : 'n';
          
          const normalizedLevel = normalizeLevel('', skill_level);
          const skill_label = getAdminLevelDisplay(normalizedLevel);
          
          // 이름 설정
          const playerName = profile.full_name || profile.username || `선수-${profile.id.substring(0, 4)}`;
          
          // 해당 사용자의 출석 상태 찾기
          const attendance = attendanceData?.find((a: any) => a.user_id === userId);
          const status = normalizeAttendanceStatus(attendance?.status);
          
          return {
            id: profile.id,
            name: playerName,
            skill_level: normalizedLevel,
            skill_label,
            gender: profile.gender || '',
            skill_code: '',
            status,
          };
        })
        .filter((p: any) => p.id);
      
      // 프로필이 없는 출석자들을 위한 기본 선수 정보 생성
      const profiledUserIds = playersWithProfiles.map(p => p.id);
      const missingProfileUsers = userIds.filter(id => !profiledUserIds.includes(id));
      
      const playersWithoutProfiles = missingProfileUsers.map(userId => {
        const attendance = attendanceData?.find((a: any) => a.user_id === userId);
        const status = normalizeAttendanceStatus(attendance?.status);
        
        return {
          id: userId,
          name: `선수-${userId.substring(0, 8)}`,
          skill_level: 'e2',
          skill_label: getAdminLevelDisplay('e2'),
          gender: '',
          skill_code: '',
          status,
        };
      });
      
      // 모든 선수 데이터 결합
      return [...playersWithProfiles, ...playersWithoutProfiles];
    } else {
      const fallbackPlayers = attendanceData.map((attendance: any) => {
        const attendance_status = normalizeAttendanceStatus(attendance.status);
        return {
          id: attendance.user_id,
          name: `선수-${attendance.user_id.substring(0, 8)}`,
          skill_level: 'e2',
          skill_label: getAdminLevelDisplay('e2'),
          gender: '',
          skill_code: '',
          status: attendance_status,
        };
      });
      
      return fallbackPlayers;
    }
  } catch (fetchError) {
    console.error('❌ 데이터 조회 중 오류:', fetchError);
    return [];
  }
};

// 선택한 날짜의 신청자(registered)만 불러오는 함수
export const fetchRegisteredPlayersForDate = async (date: string): Promise<ExtendedPlayer[]> => {
  try {
    const target = date;
    console.log(`참가자 조회 시작: 날짜 ${target}`);

    // 1) 해당 날짜의 스케줄 조회 (예정/진행중 위주)
    const { data: schedules, error: schedulesError } = await supabase
      .from('match_schedules')
      .select('id')
      .eq('match_date', target);

    if (schedulesError) {
      console.error('❌ 일정 조회 오류:', schedulesError);
      return [];
    }

    if (!schedules || schedules.length === 0) {
      console.log(`해당 날짜(${target})에 등록된 경기가 없습니다.`);
      return [];
    }

    const scheduleIds = (schedules || []).map((s: any) => s.id);
    console.log(`경기 일정 ${scheduleIds.length}개 발견:`, scheduleIds);

    // 2) 해당 스케줄들의 참가자 중 registered 상태만
    const { data: participants, error: participantsError } = await supabase
      .from('match_participants')
      .select('user_id, status')
      .in('match_schedule_id', scheduleIds)
      .eq('status', 'registered');

    if (participantsError) {
      console.error('❌ 참가자 조회 오류:', participantsError);
      return [];
    }

    if (!participants || participants.length === 0) {
      console.log(`해당 경기들에 등록된 참가자가 없습니다.`);
      return [];
    }

    const userIds = Array.from(new Set((participants || []).map((p: any) => p.user_id).filter(Boolean)));
    console.log(`참가자 ${userIds.length}명 발견:`, userIds);

    if (userIds.length === 0) return [];

    // 3) 프로필 조회 (id 기준 매칭)
    const profiles = await fetchProfilesByUserIds(userIds);

    if (!profiles || profiles.length === 0) {
      console.log('참가자들의 프로필을 찾을 수 없습니다.');
      return [];
    }

    // 5) ExtendedPlayer 배열로 변환 (status는 absent로 초기화 - 실제 출석 데이터로 업데이트됨)
    const players: ExtendedPlayer[] = (profiles || []).map((profile: any) => {
      const raw = (profile.skill_level || '').toString().toLowerCase();
      const normalized = normalizeLevel('', raw);
      const label = getAdminLevelDisplay(normalized);
      const name = profile.full_name || profile.username || `선수-${String(profile.id).slice(0, 4)}`;
      return {
        id: profile.user_id || profile.id,
        name,
        skill_level: normalized,
        skill_label: label,
        gender: profile.gender || '',
        skill_code: '',
        status: 'absent', // 초기 상태는 absent, 실제 출석 데이터로 업데이트됨
      } as ExtendedPlayer;
    });

    console.log(`최종 참가자 데이터 ${players.length}명 생성 완료`);
    return players;
  } catch (error) {
    console.error('❌ 날짜별 참가자 조회 중 오류:', error);
    return [];
  }
};
