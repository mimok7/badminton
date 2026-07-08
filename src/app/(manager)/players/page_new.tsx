'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { createMixedDoublesMatches } from '@/utils/match-utils';

type AttendanceStatus = 'present' | 'lesson' | 'absent';

interface ExtendedPlayer {
  id: string;
  name: string;
  skill_level: string;
  skill_label: string;
  gender: string;
  skill_code: string;
  status: AttendanceStatus;
}

interface Match {
  id: string;
  team1: { 
    player1: { id: string; name: string; skill_level?: string; }; 
    player2: { id: string; name: string; skill_level?: string; }; 
  };
  team2: { 
    player1: { id: string; name: string; skill_level?: string; }; 
    player2: { id: string; name: string; skill_level?: string; }; 
  };
  court: number;
}

export default function PlayersPage() {
  const supabase = getSupabaseClient();
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [perPlayerMinGames, setPerPlayerMinGames] = useState(1);

  const LEVEL_LABELS: Record<string, string> = {
    a: '랍스터',
    b: 'B (상)',
    c: 'C (중)',
    d: 'D (하)',
    e: 'E (초보)',
    n: 'N (미지정)',
  };

  // 대시보드에서 성공한 방식을 재사용한 프로필 조회 함수
  const fetchProfilesByUserIds = async (userIds: string[]) => {
    try {
      console.log('🔍 프로필 조회 함수 시작 - 요청 ID 수:', userIds.length);
      
      // 대시보드에서 성공했던 방식 사용: 전체 프로필 조회 후 필터링
      const { data: allProfilesData, error: allProfilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, skill_level, gender, role');
        
      console.log('📊 전체 프로필 조회 결과:', { 
        총프로필수: allProfilesData?.length || 0, 
        오류: allProfilesError 
      });
      
      if (allProfilesError) {
        console.error('❌ 전체 프로필 조회 오류:', allProfilesError);
        return [];
      }
      
      if (!allProfilesData || allProfilesData.length === 0) {
        console.log('⚠️ 프로필 데이터가 전혀 없습니다');
        return [];
      }
      
      // 요청된 사용자 ID들과 일치하는 프로필만 필터링
      const matchingProfiles = allProfilesData.filter(profile => 
        userIds.includes(profile.id)
      );
      
      console.log('✅ 매칭된 프로필:', {
        요청한사용자: userIds.length,
        찾은프로필: matchingProfiles.length,
        매칭률: `${Math.round(matchingProfiles.length / userIds.length * 100)}%`
      });
      
      return matchingProfiles;
    } catch (error) {
      console.error('❌ 프로필 조회 함수 오류:', error);
      return [];
    }
  };

  function normalizeLevel(skill_code: string | null | undefined, skill_level?: string | null | undefined): string {
    const code = (skill_code || '').toLowerCase();
    if (code) {
      if (code.startsWith('a')) return 'a';
      if (code.startsWith('b')) return 'b';
      if (code.startsWith('c')) return 'c';
      if (code.startsWith('d')) return 'd';
      if (code.startsWith('e')) return 'e';
      return code;
    }
    const level = (skill_level || '').toLowerCase();
    if (["a","b","c","d","e"].includes(level)) return level;
    return "n";
  }

  useEffect(() => {
    async function fetchPlayers() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        console.log("🔍 Fetching attendance data for date:", today);
        
        // 출석 데이터 조회
        const { data: attendanceData, error } = await supabase
          .from('attendances')
          .select('id, user_id, status, attended_at')
          .eq('attended_at', today);
          
        console.log("📊 Raw attendance query result:", { 
          data: attendanceData, 
          error: error,
          dataLength: attendanceData?.length,
          today: today 
        });
        
        if (error) {
          console.error('❌ 출석자 조회 오류:', error);
          setTodayPlayers([]);
          return;
        }
        
        if (!attendanceData || attendanceData.length === 0) {
          console.log("⚠️ 오늘(" + today + ") 출석 데이터가 없습니다");
          setTodayPlayers([]);
          return;
        }
      
        console.log("✅ Attendance data:", attendanceData);
        
        // 사용자 ID 추출 후 프로필 데이터 조회
        const userIds = attendanceData.map(a => a.user_id).filter(Boolean);
        console.log("User IDs from attendance:", userIds);
        
        if (userIds.length === 0) {
          console.log("❌ 유효한 사용자 ID가 없습니다");
          setTodayPlayers([]);
          return;
        }
        
        // 새로운 프로필 조회 함수 사용
        const profilesData = await fetchProfilesByUserIds(userIds);
        
        // 레벨 정보 가져오기
        const { data: levelData, error: levelError } = await supabase
          .from('level_info')
          .select('code, name');
          
        console.log("Level info data:", levelData);
        
        // 레벨 정보를 객체로 변환
        const levelMap: Record<string, string> = {};
        if (levelData) {
          levelData.forEach((level: any) => {
            if (level.code) {
              levelMap[level.code.toLowerCase()] = level.name || '';
            }
          });
        }
        console.log("Level map:", levelMap);
        
        if (profilesData && profilesData.length > 0) {
          console.log("✅ 프로필 데이터 발견:", profilesData.length, "명");
          
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
                skill_label = LEVEL_LABELS[normalizedLevel] || 'N (미지정)';
              }
              
              // 이름 설정
              const playerName = profile.full_name || profile.username || `선수-${profile.id.substring(0, 4)}`;
              
              // 해당 사용자의 출석 상태 찾기
              const attendance = attendanceData?.find((a: any) => a.user_id === userId);
              const status: AttendanceStatus = attendance?.status || 'present';
              
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
            const status: AttendanceStatus = attendance?.status || 'present';
            
            return {
              id: userId,
              name: `선수-${userId.substring(0, 8)}`,
              skill_level: 'n',
              skill_label: 'N (미지정)',
              gender: '',
              skill_code: '',
              status,
            };
          });
          
          // 모든 선수 데이터 결합
          const allPlayers = [...playersWithProfiles, ...playersWithoutProfiles];
          console.log("📊 최종 선수 목록:", {
            프로필있음: playersWithProfiles.length,
            프로필없음: playersWithoutProfiles.length,
            총계: allPlayers.length
          });
          
          setTodayPlayers(allPlayers);
        } else {
          console.log("❌ 프로필 조회 실패 - 폴백 모드로 전환");
          const fallbackPlayers = attendanceData.map((attendance: any) => {
            const attendance_status: AttendanceStatus = attendance.status || 'present';
            return {
              id: attendance.user_id,
              name: `선수-${attendance.user_id.substring(0, 8)}`,
              skill_level: 'n',
              skill_label: 'N (미지정)',
              gender: '',
              skill_code: '',
              status: attendance_status,
            };
          });
          
          console.log("🔧 폴백 선수 데이터 생성:", fallbackPlayers.length, "명");
          setTodayPlayers(fallbackPlayers);
        }
      } catch (fetchError) {
        console.error('❌ 데이터 조회 중 오류:', fetchError);
        alert('데이터 조회 중 오류가 발생했습니다. 다시 시도해주세요.');
        setTodayPlayers([]);
      }
    }
    
    fetchPlayers();
  }, []);

  // 랜덤 경기 생성 함수 (간소화)
  function assignMatchesRandomly() {
    try {
      if (!todayPlayers || todayPlayers.length === 0) {
        alert('출석한 선수가 없습니다.');
        return;
      }
      
      const activePlayers = todayPlayers.filter(player => player.status === 'present');
      
      if (activePlayers.length < 4) {
        alert(`게임 생성을 위해 최소 4명의 선수가 필요합니다. 현재 출석자: ${activePlayers.length}명`);
        return;
      }
      
      console.log('🎮 랜덤 경기 생성 시작:', activePlayers.length, '명');
      
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const newMatches: Match[] = [];
      
      for (let i = 0; i < shuffled.length - 3; i += 4) {
        const match: Match = {
          id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          team1: { 
            player1: { id: shuffled[i].id, name: shuffled[i].name, skill_level: shuffled[i].skill_level }, 
            player2: { id: shuffled[i + 1].id, name: shuffled[i + 1].name, skill_level: shuffled[i + 1].skill_level }
          },
          team2: { 
            player1: { id: shuffled[i + 2].id, name: shuffled[i + 2].name, skill_level: shuffled[i + 2].skill_level }, 
            player2: { id: shuffled[i + 3].id, name: shuffled[i + 3].name, skill_level: shuffled[i + 3].skill_level }
          },
          court: Math.floor(i / 4) + 1
        };
        newMatches.push(match);
      }
      
      console.log('✅ 랜덤 경기 생성 완료:', newMatches.length, '개 경기');
      setMatches(newMatches);
    } catch (error) {
      console.error('❌ 랜덤 경기 생성 오류:', error);
      alert('경기 생성 중 오류가 발생했습니다.');
    }
  }

  // 혼합복식 경기 생성 함수 (간소화)
  const handleAssignMixedDoubles = () => {
    try {
      if (!todayPlayers || todayPlayers.length === 0) {
        alert('출석한 선수가 없습니다.');
        return;
      }
      
      const activePlayers = todayPlayers.filter(player => player.status === 'present');
      
      if (activePlayers.length < 4) {
        alert(`혼복 게임 생성을 위해 최소 4명의 선수가 필요합니다. 현재 출석자: ${activePlayers.length}명`);
        return;
      }
      
      const playersWithoutGender = activePlayers.filter(player => !player.gender);
      if (playersWithoutGender.length > 0) {
        alert(`다음 선수들의 성별 정보가 없습니다: ${playersWithoutGender.map(p => p.name).join(', ')}`);
        return;
      }
      
      console.log('💑 혼복 경기 생성 시작:', activePlayers.length, '명');
      
      const players = activePlayers.map(player => ({
        id: player.id,
        name: player.name,
        gender: player.gender,
        skill_code: player.skill_code,
        skill_level: player.skill_level,
        skill_label: player.skill_label,
        status: player.status
      }));
      
      // 남/녀 인원수 체크
      const femaleCount = players.filter(p => ['f', 'female', 'woman'].includes((p.gender || '').toLowerCase())).length;
      const maleCount = players.filter(p => ['m', 'male', 'man'].includes((p.gender || '').toLowerCase())).length;
      
      if (femaleCount < 2 || maleCount < 2) {
        alert(`혼복 경기를 생성하려면 최소 여성 2명, 남성 2명이 필요합니다.\n현재: 여성 ${femaleCount}명, 남성 ${maleCount}명`);
        return;
      }
      
      const matches = createMixedDoublesMatches(players, 2);
      
      if (!matches || matches.length === 0) {
        alert('혼복 경기를 생성할 수 없습니다. 선수 구성을 확인해주세요.');
        return;
      }
      
      console.log('✅ 혼복 경기 생성 성공:', matches.length, '개 경기');
      setMatches(matches);
      setPlayerGameCounts({});
    } catch (error) {
      console.error('❌ 혼복 경기 생성 중 오류:', error);
      alert(`혼복 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  return (
    <div className="w-full mt-10 p-6 bg-white shadow rounded">
      <h2 className="text-2xl font-bold mb-4 text-center">참가 선수 및 경기 생성</h2>
      
      {/* 데이터 로딩 중 표시 */}
      {todayPlayers === null ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">출석 데이터 로딩 중...</span>
        </div>
      ) : todayPlayers.length === 0 ? (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6">
          <p>오늘 등록된 출석자가 없습니다.</p>
          <p className="text-sm mt-2">관리자에게 문의하거나 출석 체크를 먼저 진행해 주세요.</p>
        </div>
      ) : (
        <div className="mb-6">
          {/* 출석자 요약 */}
          <div className="mb-4">
            <span className="font-semibold">오늘 출석자: </span>
            <span className="text-blue-600 font-bold">{todayPlayers.length}명</span>
          </div>

          {/* 출석 상태별 현황 */}
          <div className="flex gap-2 mb-3 text-sm">
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
          
          {/* 선수 목록 (간소화) */}
          <div className="mt-3 border rounded p-3 max-h-48 overflow-y-auto">
            <h4 className="font-semibold mb-2">선수 목록</h4>
            {todayPlayers.map((player, index) => (
              <div key={player.id} className="flex justify-between items-center py-1 border-b last:border-b-0">
                <span className="text-sm">
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
      )}

      {/* 경기 생성 버튼들 */}
      {todayPlayers && todayPlayers.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
            onClick={assignMatchesRandomly}
          >
            랜덤 경기 생성
          </button>
          <button 
            className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded"
            onClick={handleAssignMixedDoubles}
          >
            혼합복식 경기 생성
          </button>
        </div>
      )}

      {/* 생성된 경기 목록 */}
      {matches.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">생성된 경기 ({matches.length}경기)</h3>
          <div className="space-y-2">
            {matches.map((match, index) => (
              <div key={match.id} className="border rounded p-3 bg-gray-50">
                <div className="font-semibold mb-1">경기 {index + 1} (코트 {match.court})</div>
                <div className="text-sm">
                  <div className="text-blue-600">
                    팀1: {match.team1.player1.name} & {match.team1.player2.name}
                  </div>
                  <div className="text-red-600">
                    팀2: {match.team2.player1.name} & {match.team2.player2.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
