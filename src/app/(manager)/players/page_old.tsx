"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Player, Match, AttendanceStatus, ExtendedPlayer } from '@/types';
import { createMixedDoublesMatches } from '@/utils/match-utils';
import MatchTable from './MatchTable';
import PlayerGameCountsTable from './PlayerGameCountsTable';

/**
 * 선수를 랜덤으로 섞는 함수 (Fisher-Yates Shuffle 알고리즘)
 * @param array - 섞을 배열
 */
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export default function PlayersPage() {
  // 프로필 테이블에서 참가 선수(이름+레벨+레벨코드) 목록 불러오기
  // null은 로딩 중, 빈 배열은 출석자 없음
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
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
      
      // 프로필이 없는 사용자 ID들 확인
      const foundUserIds = matchingProfiles.map(p => p.id);
      const missingUserIds = userIds.filter(id => !foundUserIds.includes(id));
      
      if (missingUserIds.length > 0) {
        console.log('⚠️ 프로필이 없는 사용자:', missingUserIds.length, '명');
        console.log('프로필 없는 사용자 ID 샘플:', missingUserIds.slice(0, 3));
      }
      
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
        const { data: attendanceData, error } = await supabase
          .from('attendances')
          .select('id, user_id, status, attended_at')
          .eq('attended_at', today);

        if (error) {
          console.error('출석자 조회 오류:', error);
          setTodayPlayers([]);
          return;
        }
        if (!attendanceData || attendanceData.length === 0) {
          setTodayPlayers([]);
          return;
        }

        const userIds = attendanceData.map(a => a.user_id).filter(Boolean);
        if (userIds.length === 0) {
          setTodayPlayers([]);
          return;
        }

        const profiles = await fetchProfilesByUserIds(userIds);

        const { data: levelData } = await supabase
          .from('level_info')
          .select('code, name');
        const levelMap: Record<string, string> = {};
        (levelData || []).forEach((level: any) => {
          if (level.code) levelMap[level.code.toLowerCase()] = level.name || '';
        });

        const profiledUserIds = new Set((profiles || []).map((p: any) => p.id));

        const playersWithProfiles = (profiles || []).map((profile: any) => {
          const userId = profile.id;
          const attendance = attendanceData.find((a: any) => a.user_id === userId);
          const status: AttendanceStatus = attendance?.status || 'present';
          const skill_code = '';
          const skill_level = profile.skill_level ? String(profile.skill_level).toLowerCase() : 'n';
          let skill_label = levelMap[skill_level] || '';
          if (!skill_label) {
            const normalizedLevel = normalizeLevel(skill_code, skill_level);
            skill_label = LEVEL_LABELS[normalizedLevel] || 'N (미지정)';
          }
          const name = profile.full_name || profile.username || `선수-${String(profile.id).substring(0, 4)}`;
          return {
            id: profile.id,
            name,
            skill_level,
            skill_label,
            gender: profile.gender || '',
            skill_code,
            status,
          };
        });

        const missingProfileUsers = userIds.filter(id => !profiledUserIds.has(id));
        const playersWithoutProfiles = missingProfileUsers.map(userId => {
          const attendance = attendanceData.find((a: any) => a.user_id === userId);
          const status: AttendanceStatus = attendance?.status || 'present';
          return {
            id: userId,
            name: `선수-${String(userId).substring(0, 8)}`,
            skill_level: 'n',
            skill_label: 'N (미지정)',
            gender: '',
            skill_code: '',
            status,
          };
        });

        const allPlayers = [...playersWithProfiles, ...playersWithoutProfiles];
        setTodayPlayers(allPlayers);
      } catch (fetchError) {
        console.error('데이터 조회 중 오류:', fetchError);
        setTodayPlayers([]);
      }
    }

    // 초기 로드 및 실시간 갱신 설정
    fetchPlayers();

    const attendanceChannel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendances',
        },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
    };
  }, []);
  
  // 1인당 최소 게임수로 명칭 변경
  const [perPlayerMinGames, setPerPlayerMinGames] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  useEffect(() => {
    async function fetchUserId() {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) setMyUserId(data.user.id);
    }
    fetchUserId();
  }, []);
  
  // 선수의 출석 상태 업데이트 함수
  const updatePlayerStatus = async (playerId: string, status: AttendanceStatus) => {
    if (!todayPlayers || isUpdatingStatus) return;
    
    setIsUpdatingStatus(true);
    
    try {
      // 먼저 로컬 상태를 즉시 업데이트하여 UI 반응성 향상
      const updatedPlayers = todayPlayers.map(player => {
        if (player.id === playerId) {
          return { ...player, status };
        }
        return player;
      });
      
      setTodayPlayers(updatedPlayers);
      
      // 백그라운드에서 데이터베이스 업데이트
      const today = new Date().toISOString().slice(0, 10);
      
      // 기존 출석 기록 확인
      const { data: existingAttendance } = await supabase
        .from('attendances')
        .select('id')
        .match({ user_id: playerId, attended_at: today })
        .single();
      
      let error;
      
      if (existingAttendance) {
        // 기존 출석 기록이 있으면 상태만 업데이트
        const result = await supabase
          .from('attendances')
          .update({ status })
          .match({ user_id: playerId, attended_at: today });
        
        error = result.error;
      } else {
        // 출석 기록이 없으면 새로 생성
        const result = await supabase
          .from('attendances')
          .insert({
            user_id: playerId,
            attended_at: today,
            status
          });
        
        error = result.error;
      }
      
      if (error) {
        console.error('상태 업데이트 오류:', error.message);
        // 오류 시 사용자에게 알리되, 페이지 흐름을 방해하지 않도록 조용히 처리
        console.error(`선수 ${playerId} 상태 업데이트 실패: ${error.message}`);
        
        // 오류 발생 시 원래 상태로 롤백 (선택적)
        /* 
        const originalPlayer = todayPlayers.find(p => p.id === playerId);
        if (originalPlayer) {
          const rolledBackPlayers = updatedPlayers.map(player => {
            if (player.id === playerId) {
              return { ...player, status: originalPlayer.status };
            }
            return player;
          });
          setTodayPlayers(rolledBackPlayers);
        }
        */
      } else {
        console.log(`선수 ${playerId} 상태가 ${status}(으)로 업데이트됨`);
      }
    } catch (err) {
      console.error('업데이트 처리 중 오류:', err);
      // 조용히 오류 로깅, 사용자에게는 알리지 않음
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 랜덤 방식 게임 배정 함수
  function assignMatchesRandomly() {
    try {
      // null 체크 추가
      if (!todayPlayers || todayPlayers.length === 0) {
        alert('출석한 선수가 없습니다.');
        return;
      }
      
      // 출석한 선수만 필터링 ('present' 상태의 선수만)
      const activePlayers = todayPlayers.filter(player => player.status === 'present');
      
      if (activePlayers.length === 0) {
        alert('게임 참여 가능한 선수가 없습니다.');
        return;
      }
      
      if (activePlayers.length < 4) {
        alert(`게임 생성을 위해 최소 4명의 선수가 필요합니다. 현재 출석자: ${activePlayers.length}명`);
        return;
      }
      
      console.log('🎮 랜덤 경기 생성 시작:', { 총선수: todayPlayers.length, 출석선수: activePlayers.length });
      
      const players = activePlayers.map((player) => ({ 
        id: player.id, 
        name: player.name, 
        skill_level: player.skill_level,
        skill_label: player.skill_label, 
        skill_code: player.skill_code,
        gender: player.gender,
        status: player.status
      }));
      
      if (players.length < 4) {
        setMatches([]);
        setPlayerGameCounts({});
        return;
      }
      
      function getAllTeams(pls: typeof players) {
        const teams: any[] = [];
        for (let i = 0; i < pls.length - 1; i++) {
          for (let j = i + 1; j < pls.length; j++) {
            teams.push({ player1: pls[i], player2: pls[j] });
          }
        }
        return teams;
      }
      
      function getAllMatches(teams: any[]): Match[] {
        const matches: Match[] = [];
        for (let i = 0; i < teams.length - 1; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            const ids = [teams[i].player1.id, teams[i].player2.id, teams[j].player1.id, teams[j].player2.id];
            const unique = new Set(ids);
            if (unique.size === 4) {
              matches.push({ 
                id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}_${j}`, // 더 고유한 ID 생성
                court: 0, 
                team1: teams[i], 
                team2: teams[j] 
              });
            }
          }
        }
        return matches;
      }
      
      const allTeams = getAllTeams(players);
      let allMatches = getAllMatches(allTeams);
      allMatches = shuffle(allMatches);
      const assignedMatches: Match[] = [];
      const playerGameCounts: Record<string, number> = {};
      players.forEach(p => { playerGameCounts[p.id] = 0; });
      
      // 모든 출석자가 최소 perPlayerMinGames번 이상 경기에 포함될 때까지 배정
      for (const m of allMatches) {
        const ids = [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
        const minGames = Math.min(...Object.values(playerGameCounts));
        if (minGames >= perPlayerMinGames) break;
        const tempCounts = { ...playerGameCounts };
        ids.forEach(id => tempCounts[id]++);
        const countsArr = Object.values(tempCounts);
        const min = Math.min(...countsArr);
        const max = Math.max(...countsArr);
        if (max - min <= 1) {
          assignedMatches.push(m);
          ids.forEach(id => playerGameCounts[id]++);
        }
      }
      
      assignedMatches.forEach((m, idx) => { 
        m.court = (idx % Math.max(1, Math.floor(assignedMatches.length / 2)) + 1); 
      });
      
      console.log('✅ 랜덤 경기 생성 완료:', { 경기수: assignedMatches.length });
      setMatches(assignedMatches);
      setPlayerGameCounts(playerGameCounts);
    } catch (error) {
      console.error('❌ 랜덤 경기 생성 오류:', error);
      alert('경기 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
      setMatches([]);
      setPlayerGameCounts({});
    }
  }
  
  // 레벨 코드 순서대로 4명씩 게임 배정 함수
  function assignMatchesByLevelOrder() {
    try {
      // null 체크 추가
      if (!todayPlayers || todayPlayers.length === 0) {
        alert('출석한 선수가 없습니다.');
        return;
      }
      
      // 출석한 선수만 필터링 ('present' 상태의 선수만)
      const activePlayers = todayPlayers.filter(player => player.status === 'present');
      
      if (activePlayers.length === 0) {
        alert('게임 참여 가능한 선수가 없습니다.');
        return;
      }
      
      if (activePlayers.length < 4) {
        alert(`게임 생성을 위해 최소 4명의 선수가 필요합니다. 현재 출석자: ${activePlayers.length}명`);
        return;
      }
      
      console.log('📊 레벨순 경기 생성 시작:', { 총선수: todayPlayers.length, 출석선수: activePlayers.length });
      
      // 모든 필요한 정보를 포함한 선수 목록
      const sortedPlayers = [...activePlayers].sort((a, b) => {
        const codeA = (a.skill_code || a.skill_level || 'n').toLowerCase();
        const codeB = (b.skill_code || b.skill_level || 'n').toLowerCase();
        const alphaA = codeA.replace(/[^a-z]/g, '');
        const alphaB = codeB.replace(/[^a-z]/g, '');
        if (alphaA !== alphaB) return alphaA.localeCompare(alphaB);
        const numA = parseInt(codeA.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(codeB.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      });
      
      const matches: Match[] = [];
      const playerGameCounts: Record<string, number> = {};
      sortedPlayers.forEach(p => { playerGameCounts[p.id] = 0; });
      
      let idx = 0;
      while (true) {
        let found = false;
        for (; idx + 3 < sortedPlayers.length; idx += 4) {
          const group = [sortedPlayers[idx], sortedPlayers[idx+1], sortedPlayers[idx+2], sortedPlayers[idx+3]];
          if (group.every(p => playerGameCounts[p.id] >= perPlayerMinGames)) continue;
          
          const team1 = { player1: group[0], player2: group[2] };
          const team2 = { player1: group[1], player2: group[3] };
          matches.push({ 
            id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${matches.length}`,  // 더 고유한 ID 생성
            court: matches.length + 1, 
            team1, 
            team2 
          });
        [group[0].id, group[1].id, group[2].id, group[3].id].forEach(id => playerGameCounts[id]++);
        found = true;
      }
      
      const remain = sortedPlayers.slice(idx).filter(p => playerGameCounts[p.id] < perPlayerMinGames);
      if (remain.length > 0 && remain.length < 4) {
        const mainLevel = remain[0]?.skill_code || remain[0]?.skill_level || 'n';
        const sameLevel = sortedPlayers.filter(p => ((p.skill_code || p.skill_level || 'n') === mainLevel));
        let fill = [...remain];
        
        if (fill.length < 4) {
          const recentMatches = matches.slice(-2);
          const recentPairs = new Set<string>();
          recentMatches.forEach(m => {
            const ids = [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
            for (let i = 0; i < ids.length; i++) {
              for (let j = i + 1; j < ids.length; j++) {
                recentPairs.add([ids[i], ids[j]].sort().join('-'));
              }
            }
          });
          const fillIds = fill.map(f => f.id);
          const candidate = sameLevel.filter(p => !fillIds.includes(p.id) && fill.every(f => !recentPairs.has([f.id, p.id].sort().join('-'))));
          for (const p of candidate) {
            if (fill.length < 4) fill.push(p);
          }
        }
        
        if (fill.length < 4) {
          const recentMatches = matches.slice(-2);
          const recentIds = new Set<string>();
          recentMatches.forEach(m => {
            [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2].forEach(p => {
              const orig = todayPlayers.find(tp => tp.id === p.id);
              if ((orig?.skill_code || orig?.skill_level || 'n') === mainLevel) recentIds.add(p.id);
            });
          });
          const recentFill = sameLevel.filter(p => recentIds.has(p.id) && !fill.find(f => f.id === p.id));
          for (const p of recentFill) {
            if (fill.length < 4) fill.push(p);
          }
        }
        
        if (fill.length < 4) {
          const others = sameLevel.filter(p => !fill.find(f => f.id === p.id));
          while (fill.length < 4 && others.length > 0) {
            const pickIdx = Math.floor(Math.random() * others.length);
            fill.push(others.splice(pickIdx, 1)[0]);
          }
        }
        
        if (fill.length === 4) {
          const team1 = { player1: fill[0], player2: fill[2] };
          const team2 = { player1: fill[1], player2: fill[3] };
          matches.push({ 
            id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${matches.length}`, // 더 고유한 ID 생성
            court: matches.length + 1, 
            team1, 
            team2 
          });
          fill.forEach(p => playerGameCounts[p.id]++);
          found = true;
        }
      }
      
      if (!found || Object.values(playerGameCounts).every(cnt => cnt >= perPlayerMinGames)) break;
      idx = 0;
    }
    
    console.log('✅ 레벨순 경기 생성 완료:', { 경기수: matches.length });
    setMatches(matches);
    setPlayerGameCounts(playerGameCounts);
  } catch (error) {
    console.error('❌ 레벨순 경기 생성 오류:', error);
    alert('레벨순 경기 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    setMatches([]);
    setPlayerGameCounts({});
  }
}
  // 핸들러 함수 (버튼에서 호출)
  const handleGenerateMatches = () => {
    assignMatchesRandomly();
  };
  const handleAssignByLevel = () => {
    assignMatchesByLevelOrder();
  };
  const handleAssignMixedDoubles = () => {
    try {
      // null 체크 추가
      if (!todayPlayers || todayPlayers.length === 0) {
        alert('출석한 선수가 없습니다.');
        return;
      }
      
      // 출석한 선수만 필터링 ('present' 상태의 선수만)
      const activePlayers = todayPlayers.filter(player => player.status === 'present');
      
      if (activePlayers.length === 0) {
        alert('게임 참여 가능한 선수가 없습니다.');
        return;
      }
      
      if (activePlayers.length < 4) {
        alert(`혼복 게임 생성을 위해 최소 4명의 선수가 필요합니다. 현재 출석자: ${activePlayers.length}명`);
        return;
      }
      
      // 선수 정보에 성별 정보가 있는지 확인하고, 없는 경우 사용자에게 알림
      const playersWithoutGender = activePlayers.filter(player => !player.gender);
      
      if (playersWithoutGender.length > 0) {
        alert(`다음 선수들의 성별 정보가 없습니다: ${playersWithoutGender.map(p => p.name || p.id).join(', ')}.\n혼복 경기를 위해서는 모든 선수의 성별 정보가 필요합니다.`);
        return;
      }
      
      console.log('💑 혼복 경기 생성 시작:', { 총선수: todayPlayers.length, 출석선수: activePlayers.length });
      
      // 디버그: 성별 정보 확인
      console.log('혼복 경기용 선수 정보:', activePlayers.map(p => ({
        name: p.name,
        gender: p.gender,
        skill: p.skill_code || p.skill_level,
        status: p.status
      })));
      
      // 모든 필요한 정보를 포함
      const players = activePlayers.map(player => ({ 
        id: player.id, 
        name: player.name, 
        skill_level: player.skill_level,
        skill_label: player.skill_label,
        skill_code: player.skill_code, 
        gender: player.gender || '', // 빈 문자열로 설정하여 함수에서 올바르게 필터링되도록 함
        status: player.status
      }));
      
      // 남녀 플레이어 수 확인
      const femaleCount = players.filter(p => ['f', 'female', 'woman', 'w'].includes((p.gender || '').toLowerCase())).length;
      const maleCount = players.filter(p => ['m', 'male', 'man'].includes((p.gender || '').toLowerCase())).length;
      
      console.log('💑 성별 인원 체크:', { 여성: femaleCount, 남성: maleCount });
      
      if (femaleCount < 2 || maleCount < 2) {
        alert(`혼복 경기를 생성하려면 최소 여성 2명, 남성 2명이 필요합니다.\n현재: 여성 ${femaleCount}명, 남성 ${maleCount}명`);
        return;
      }
      
      const matches = createMixedDoublesMatches(players, 2);
      
      if (!matches || matches.length === 0) {
        console.log('❌ 혼복 경기 생성 실패: 경기가 생성되지 않음');
        alert('혼복 경기를 생성할 수 없습니다. 선수 구성이나 성별 정보를 확인해주세요.');
        return;
      }
      
      console.log('✅ 혼복 경기 생성 성공:', matches.length, '개 경기 생성');
      setMatches(matches);
      setPlayerGameCounts({});
    } catch (error) {
      console.error('❌ 혼복 경기 생성 중 오류 발생:', error);
      alert(`혼복 경기 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };
  // 1. 함수 추가 (PlayersPage 함수 안에 선언해도 되고, 바깥에 선언해도 됨)
  async function saveMatchResult({ userId, matchNo, win, score }: { userId: string, matchNo: number, win: boolean, score: string }) {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('match_result')
      .upsert(
        {
          user_id: userId,
          attended_at: today,
          match_no: matchNo,
          win,
          score,
        },
        { onConflict: 'user_id,attended_at,match_no' }
      );
    if (error) alert('저장 실패: ' + error.message);
    else alert('저장 완료!');
  }
  return (
    <div className="w-full mt-10 p-6 bg-white shadow rounded">
      <h2 className="text-2xl font-bold mb-4 text-center">참가 선수 및 경기 생성</h2>
      
      {/* 데이터 로딩 중 표시 및 출석자 없음 메시지 */}
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
          {/* 레벨별 출석자 수 요약 (레벨명 기준 그룹화) */}
          <div className="mb-4">
            <span className="font-semibold">오늘 출석자: </span>
            <span className="text-blue-600 font-bold">{todayPlayers.length}명</span>
            <div className="mt-1 text-sm flex flex-wrap gap-2">
              {(() => {
                // skill_label(한글명) 기준으로 합산
                const labelMap: Record<string, number> = {};
                todayPlayers.forEach(p => {
                  // console.log('Player level info:', p.name, p.skill_level, p.skill_label, p.skill_code);
                  const label = p.skill_label || LEVEL_LABELS[p.skill_level] || 'N (미지정)';
                  if (!labelMap[label]) labelMap[label] = 0;
                  labelMap[label]++;
                });
                // 디버깅용 로그
                // console.log('Label Map:', labelMap);
                const labelOrder = Object.keys(labelMap).sort();
                return labelOrder.map(label => (
                  <span key={label} className="mr-4 flex items-center">
                    <span className="font-medium">{label}:</span> {labelMap[label]}명
                  </span>
                ));
              })()}
            </div>
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
          
          {/* 선수 목록과 상태 변경 UI */}
          <div className="mt-3 border rounded overflow-hidden">
            <h3 className="px-3 py-2 bg-gray-100 font-medium">출석자 상태 관리</h3>
            <div className="max-h-48 overflow-y-auto">
              {todayPlayers.map(player => {
                // 본인 여부 확인
                const isMe = myUserId === player.id;
                
                return (
                <div 
                  key={player.id} 
                  className={`px-3 py-2 flex items-center justify-between border-t hover:bg-gray-50 ${isMe ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center">
                    <span className={`mr-2 font-medium ${isMe ? 'text-blue-700' : ''}`}>
                      {player.name}
                      {isMe && <span className="ml-1 text-xs text-blue-500">(나)</span>}
                    </span>
                    <span className="text-xs text-gray-500">{player.skill_label || player.skill_level}</span>
                    {player.status === 'present' && (
                      <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>출석</span>
                    )}
                    {player.status === 'lesson' && (
                      <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>레슨</span>
                    )}
                    {player.status === 'absent' && (
                      <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>불참</span>
                    )}
                  </div>
                  <div className="flex gap-1 text-xs">
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        player.status === 'present' 
                          ? isMe 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-green-600 text-white border-green-600' 
                          : isMe 
                            ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' 
                            : 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(player.id, 'present');
                      }}
                    >출석</button>
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        player.status === 'lesson' 
                          ? isMe 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-yellow-600 text-white border-yellow-600' 
                          : isMe 
                            ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' 
                            : 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(player.id, 'lesson');
                      }}
                    >레슨</button>
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        player.status === 'absent' 
                          ? isMe 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-red-600 text-white border-red-600' 
                          : isMe 
                            ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' 
                            : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(player.id, 'absent');
                      }}
                    >불참</button>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>
      )}
      {/* 회원별 게임수 요약 (상단 요약 제거, 하단 표로 이동) */}

      {/* 내 상태 표시 */}
      {todayPlayers && todayPlayers.length > 0 && myUserId && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded">
          {(() => {
            // 내 정보 찾기
            const myInfo = todayPlayers.find(p => p.id === myUserId);
            
            if (!myInfo) {
              return (
                <div className="font-medium text-blue-800">
                  로그인하셨지만 오늘 출석 목록에 없습니다.
                </div>
              );
            }
            
            // 상태에 따른 색상 및 메시지
            let statusColor = "text-blue-800";
            let statusBg = "bg-blue-200";
            let statusMessage = "";
            
            if (myInfo.status === 'present') {
              statusMessage = "현재 출석 상태입니다. 게임에 참여할 수 있습니다.";
              statusColor = "text-green-800";
              statusBg = "bg-green-200";
            } else if (myInfo.status === 'lesson') {
              statusMessage = "현재 레슨 상태입니다. 게임에 참여할 수 없습니다.";
              statusColor = "text-yellow-800";
              statusBg = "bg-yellow-200";
            } else if (myInfo.status === 'absent') {
              statusMessage = "현재 불참 상태입니다. 게임에 참여할 수 없습니다.";
              statusColor = "text-red-800";
              statusBg = "bg-red-200";
            }
            
            return (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-blue-800 mb-1">
                      <span className="text-blue-700 font-bold">{myInfo.name}</span>님의 상태
                    </div>
                    <div className={`inline-block px-3 py-1 rounded ${statusBg} ${statusColor} font-medium`}>
                      {myInfo.status === 'present' ? '출석' : myInfo.status === 'lesson' ? '레슨' : '불참'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        myInfo.status === 'present' 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(myUserId, 'present');
                      }}
                    >출석</button>
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        myInfo.status === 'lesson' 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(myUserId, 'lesson');
                      }}
                    >레슨</button>
                    <button 
                      type="button"
                      className={`px-2 py-1 rounded border transition-colors ${
                        myInfo.status === 'absent' 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerStatus(myUserId, 'absent');
                      }}
                    >불참</button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-blue-700">
                  {statusMessage}
                </div>
              </>
            );
          })()}
        </div>
      )}
      
      {/* 게임 참여 가능 인원 요약 */}
      {todayPlayers && todayPlayers.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="font-medium text-blue-800 mb-2">게임 참여 가능 인원: 
            <span className="text-blue-600 ml-1 font-bold">
              {todayPlayers.filter(p => p.status === 'present').length}명
            </span>
          </div>
          
          {/* 1인당 최소 게임 수 입력 */}
          <div className="flex items-center gap-2">
            <label className="mr-2">1인당 최소 게임수:</label>
            <input
              type="number"
              value={perPlayerMinGames}
              min={1}
              onChange={(e) => setPerPlayerMinGames(Number(e.target.value))}
              className="border p-1 rounded w-16"
            />
          </div>
        </div>
      )}

      {/* 버튼 컨테이너: 혼복 오른쪽 끝, 나머지 가운데 */}
      {todayPlayers && todayPlayers.length > 0 && (
        <div className="flex justify-between items-center mb-4 space-x-2">
          {/* 레벨, 랜덤 버튼 */}
          <div className="flex space-x-2">
            <button
              className="bg-green-500 text-white px-4 py-2 rounded transition-colors cursor-pointer hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={handleAssignByLevel}
              disabled={!todayPlayers || todayPlayers.filter(p => p.status === 'present').length < 4}
              type="button"
              title={todayPlayers && todayPlayers.filter(p => p.status === 'present').length < 4 
                ? "최소 4명 이상의 출석자(참여 가능)가 필요합니다" 
                : "레벨별로 게임 배정"}
            >레벨</button>
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded transition-colors cursor-pointer hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={handleGenerateMatches}
              disabled={!todayPlayers || todayPlayers.filter(p => p.status === 'present').length < 4}
              type="button"
              title={todayPlayers && todayPlayers.filter(p => p.status === 'present').length < 4 
                ? "최소 4명 이상의 출석자(참여 가능)가 필요합니다" 
                : "무작위로 게임 배정"}
            >랜덤</button>
          </div>
          {/* 혼복 버튼 */}
          <button
            className="bg-yellow-500 text-white px-4 py-2 rounded transition-colors cursor-pointer hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            onClick={handleAssignMixedDoubles}
            disabled={!todayPlayers || todayPlayers.filter(p => p.status === 'present').length < 4}
            type="button"
            title={todayPlayers && todayPlayers.filter(p => p.status === 'present').length < 4 
              ? "최소 4명 이상의 출석자(참여 가능)가 필요합니다" 
              : "혼합 복식 경기 배정"}
          >혼복</button>
        </div>
      )}
      {/* 경기 결과 테이블 */}
      {matches.length > 0 && todayPlayers && (
        <MatchTable
          matches={matches}
          todayPlayers={todayPlayers as any} // ExtendedPlayer[]를 Player[]로 전달 (MatchTable이 Player[]를 기대하므로)
          myUserId={myUserId}
        />
      )}

      {/* 회원별 게임수 표 */}
      {Object.keys(playerGameCounts).length > 0 && todayPlayers && (
        <PlayerGameCountsTable
          todayPlayers={todayPlayers as any} // ExtendedPlayer[]를 Player[]로 전달
          playerGameCounts={playerGameCounts}
          myUserId={myUserId}
          matches={matches}
        />
      )}

      {/* 본인 경기만 별도 표시 */}
      {myUserId && matches.length > 0 && todayPlayers && (
        <div className="mb-2">
          <h4 className="font-semibold mb-1">내 경기 목록</h4>
          <ul className="text-sm space-y-1">
            {matches.map((m, idx) => {
              const isMine = [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id].includes(myUserId);
              if (!isMine) return null;
              const getPlayerLabel = (player: Player) => {
                const getShortLabel = (label: string) => (label ? label[0] : '');
                
                // 이미 player 객체에 이름이 있으면 그대로 사용
                if (player && player.name) {
                  const shortLabel = player.skill_label ? getShortLabel(player.skill_label) : 
                                    player.skill_code ? getShortLabel(player.skill_code) : 
                                    player.skill_level ? getShortLabel(player.skill_level) : '';
                  
                  return shortLabel ? `${player.name}(${shortLabel})` : player.name;
                }
                
                // todayPlayers에서 해당 ID로 검색 (todayPlayers는 null이 아님이 보장됨)
                // ExtendedPlayer에서 Player 정보만 추출
                const p = todayPlayers.find(tp => String(tp.id).trim() === String(player.id).trim());
                if (p && p.name) {
                  const shortLabel = p.skill_label ? getShortLabel(p.skill_label) : 
                                    p.skill_code ? getShortLabel(p.skill_code) : 
                                    p.skill_level ? getShortLabel(p.skill_level) : '';
                  
                  return shortLabel ? `${p.name}(${shortLabel})` : p.name;
                }
                
                // 정보가 없는 경우 ID 반환 (fallback)
                return `선수-${player.id.substring(0, 4)}`;
              };
              return (
                <li key={`my-match-${idx}`} className="bg-blue-100 rounded px-2 py-1">
                  <span className="font-medium">경기 코드:</span> <span className="text-blue-700 font-mono">{m.court}</span> <span className="mx-2">|</span>
                  <span className="font-medium">팀1:</span> {getPlayerLabel(m.team1.player1)} / {getPlayerLabel(m.team1.player2)} <span className="mx-2">|</span>
                  <span className="font-medium">팀2:</span> {getPlayerLabel(m.team2.player1)} / {getPlayerLabel(m.team2.player2)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
