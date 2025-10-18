import { getSupabaseClient } from '@/lib/supabase';
import { ExtendedPlayer, LEVEL_LABELS } from './types';

export const supabase = getSupabaseClient();

// 레벨별 점수 매핑 (높은 숫자가 높은 실력)
export const getLevelScore = (level: string): number => {
  const scores: Record<string, number> = {
    'a1': 100, 'a2': 95,
    'b1': 90, 'b2': 85,
    'c1': 80, 'c2': 75,
    'd1': 70, 'd2': 65,
    'e1': 60, 'e2': 55,
    'n': 50
  };
  return scores[level.toLowerCase()] || 50;
};

export function normalizeLevel(skill_code: string | null | undefined, skill_level?: string | null | undefined): string {
  const code = (skill_code || '').toLowerCase();
  if (code) {
    // A1, A2, B1, B2, C1, C2, D1, D2, E1, E2 형태로 정확히 매칭
    if (['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2'].includes(code)) {
      return code;
    }
    // 기존 A, B, C, D, E 형태는 하위 레벨로 변환 (A -> A2, B -> B2 등)
    if (code.startsWith('a')) return 'a2';
    if (code.startsWith('b')) return 'b2';
    if (code.startsWith('c')) return 'c2';
    if (code.startsWith('d')) return 'd2';
    if (code.startsWith('e')) return 'e2';
    return code;
  }
  
  const level = (skill_level || '').toLowerCase();
  // 정확한 레벨 코드가 있으면 그대로 사용
  if (['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2'].includes(level)) {
    return level;
  }
  // 기존 단일 레벨은 하위 레벨로 변환
  if (level === 'a') return 'a2';
  if (level === 'b') return 'b2';
  if (level === 'c') return 'c2';
  if (level === 'd') return 'd2';
  if (level === 'e') return 'e2';
  
  return "e2"; // 기본값을 E2로 설정
}

// 대시보드에서 성공한 방식을 재사용한 프로필 조회 함수
export const fetchProfilesByUserIds = async (userIds: string[]) => {
  try {
    // 대시보드에서 성공했던 방식 사용: 전체 프로필 조회 후 필터링
    const { data: allProfilesData, error: allProfilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, skill_level, gender, role');
      
    if (allProfilesError) {
      return [];
    }
    
    if (!allProfilesData || allProfilesData.length === 0) {
      return [];
    }
    
    // 요청된 사용자 ID들과 일치하는 프로필만 필터링
    const matchingProfiles = allProfilesData.filter(profile => 
      userIds.includes(profile.id)
    );
    
    return matchingProfiles;
  } catch (error) {
    return [];
  }
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
    const today = new Date().toISOString().slice(0, 10);
    
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
    
    // 새로운 프로필 조회 함수 사용
    const profilesData = await fetchProfilesByUserIds(userIds);
    
    // 레벨 정보 가져오기
    const { data: levelData, error: levelError } = await supabase
      .from('level_info')
      .select('code, name');
      
    // 레벨 정보를 객체로 변환
    const levelMap: Record<string, string> = {};
    if (levelData) {
      levelData.forEach((level: any) => {
        if (level.code) {
          levelMap[level.code.toLowerCase()] = level.name || '';
        }
      });
    }
    
    if (profilesData && profilesData.length > 0) {
      // 프로필 데이터를 기반으로 선수 정보 생성
      const playersWithProfiles = profilesData
        .map((profile: any) => {
          const userId = profile.id;
          
          // 기본 skill_level 설정
          let skill_level = profile.skill_level ? String(profile.skill_level).toLowerCase() : 'n';
          
          // levelMap에서 해당 스킬 레벨에 맞는 레이블 찾기
          let skill_label = '';
          if (levelMap[skill_level]) {
            skill_label = levelMap[skill_level];
          }
          
          // skill_label이 없으면 LEVEL_LABELS에서 가져옴
          if (!skill_label) {
            const normalizedLevel = normalizeLevel('', skill_level);
            skill_label = LEVEL_LABELS[normalizedLevel] || 'E2 (초급)';
          }
          
          // 이름 설정
          const playerName = profile.username || profile.full_name || `선수-${profile.id.substring(0, 4)}`;
          
          // 해당 사용자의 출석 상태 찾기
          const attendance = attendanceData?.find((a: any) => a.user_id === userId);
          const status = attendance?.status ?? 'absent';
          
          return {
            id: profile.id,
            name: playerName,
            skill_level,
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
  const status = attendance?.status ?? 'absent';
        
        return {
          id: userId,
          name: `선수-${userId.substring(0, 8)}`,
          skill_level: 'e2',
          skill_label: 'E2 (초급)',
          gender: '',
          skill_code: '',
          status,
        };
      });
      
      // 모든 선수 데이터 결합
      return [...playersWithProfiles, ...playersWithoutProfiles];
    } else {
      const fallbackPlayers = attendanceData.map((attendance: any) => {
        const attendance_status = attendance.status ?? 'absent';
        return {
          id: attendance.user_id,
          name: `선수-${attendance.user_id.substring(0, 8)}`,
          skill_level: 'e2',
          skill_label: 'E2 (초급)',
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
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, skill_level, gender')
      .in('id', userIds);

    if (profilesError) {
      console.error('❌ 프로필 조회 오류:', profilesError);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      console.log('참가자들의 프로필을 찾을 수 없습니다.');
      return [];
    }

    // 4) 레벨 라벨 매핑용 level_info 조회
    const { data: levelData } = await supabase
      .from('level_info')
      .select('code, name');

    const levelMap: Record<string, string> = {};
    (levelData || []).forEach((lvl: any) => {
      if (lvl.code) levelMap[String(lvl.code).toLowerCase()] = lvl.name || '';
    });

    // 5) ExtendedPlayer 배열로 변환 (status는 absent로 초기화 - 실제 출석 데이터로 업데이트됨)
    const players: ExtendedPlayer[] = (profiles || []).map((profile: any) => {
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
