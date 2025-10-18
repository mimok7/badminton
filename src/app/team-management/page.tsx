'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchRegisteredPlayersForDate } from '@/app/players/utils';

interface TeamAssignment {
  id: string;
  round_number: number; // 회차
  player_name: string;
  team_type: 'racket' | 'shuttle'; // 라켓팀 또는 셔틀팀
  created_at: string;
  assignment_date?: string;
  round_title?: string;
}

interface RoundSummary {
  round: number;
  racket_team: string[];
  shuttle_team: string[];
  team1?: string[];
  team2?: string[];
  team3?: string[];
  team4?: string[];
  pairs_data?: Record<string, string[]>;
  total_players: number;
  title?: string;
  assignment_date?: string;
  team_type?: string;
}

type TeamConfigType = '2teams' | '3teams' | '4teams' | 'pairs' | 'custom';
type TeamName = 'racket' | 'shuttle' | 'team1' | 'team2' | 'team3' | 'team4' | string; // pairs는 pair1, pair2, ... 무제한

interface TeamConfig {
  type: TeamConfigType;
  numTeams?: number;
  playersPerTeam?: number;
  numLevelGroups?: number; // pairs 모드용: 2, 3, 4 그룹으로 분할
}

interface FourTeamsAssignment {
  team1: string[];
  team2: string[];
  team3: string[];
  team4: string[];
}

export default function TeamManagementPage() {
  const supabase = getSupabaseClient();
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [todayPlayers, setTodayPlayers] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<Array<{id: string; start_time: string; end_time: string; location: string; match_date: string}>>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, TeamName>>({});
  const [loading, setLoading] = useState(true);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>({ type: '2teams' });
  const [customTeams, setCustomTeams] = useState<string[][]>([]);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [selectedRoundForModal, setSelectedRoundForModal] = useState<RoundSummary | null>(null);
  const [pairGroups, setPairGroups] = useState<{groupName: string; players: string[]}[]>([]);
  const [showGroupPlayers, setShowGroupPlayers] = useState(false);

  // 오늘 출석한 선수들 조회
  const fetchTodayPlayers = async () => {
    try {
      // 우선: 선택된 스케줄이 있으면 해당 스케줄의 등록자(registered)를 사용
      if (selectedScheduleId) {
        // 스케줄에서 match_date를 가져와서 날짜 기반 등록자 조회
        const { data: schedule } = await supabase.from('match_schedules').select('match_date').eq('id', selectedScheduleId).single();
        const date = schedule?.match_date || new Date().toISOString().slice(0,10);
        const regs = await fetchRegisteredPlayersForDate(date);
        const names = regs.map(r => `${r.name}(${(r.skill_level || '').toUpperCase()})`);
        setTodayPlayers(names);
        return;
      }

      // 선택된 스케줄이 없으면 기존 출석 데이터를 사용
      const today = new Date().toISOString().slice(0, 10);
      const { data: attendanceData, error } = await supabase
        .from('attendances')
        .select('user_id, status')
        .eq('attended_at', today)
        .eq('status', 'present'); // 출석한 선수만

      if (error) {
        console.error('출석 데이터 조회 오류:', error);
        setTodayPlayers([]);
        return;
      }

      if (!attendanceData || attendanceData.length === 0) {
        console.log('오늘 출석한 선수가 없습니다.');
        setTodayPlayers([]);
        return;
      }

      const userIds = attendanceData.map(a => a.user_id);
      const { data: profilesData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, full_name, skill_level')
        .in('id', userIds);

      if (profileError) {
        console.error('프로필 조회 오류:', profileError);
        setTodayPlayers([]);
        return;
      }

      const playerNamesWithLevel = profilesData?.map(p => {
        const playerName = p.username || p.full_name || `선수-${p.id.substring(0, 4)}`;
        const skillLevel = p.skill_level ? String(p.skill_level).toLowerCase() : 'n';
        const levelCode = skillLevel.toUpperCase();
        return `${playerName}(${levelCode})`;
      }) || [];

      setTodayPlayers(playerNamesWithLevel);
    } catch (error) {
      console.error('선수 조회 중 오류:', error);
      setTodayPlayers([]);
    }
  };

  // 스케줄 목록을 불러와 선택할 수 있게 함
  const fetchSchedulesList = async () => {
    try {
      const today = new Date().toISOString().slice(0,10);
      const { data, error } = await supabase
        .from('match_schedules')
        .select('id, match_date, start_time, end_time, location')
        .gte('match_date', today)
        .order('match_date', { ascending: true });

      if (error) {
        console.error('일정 목록 조회 오류:', error);
        return;
      }

      setSchedules(data || []);
      if (data && data.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(data[0].id);
      }
    } catch (e) {
      console.error('일정 조회 실패:', e);
    }
  };

  // 기존 회차 데이터 조회
  const fetchRoundsData = async () => {
    try {
      // team_assignments 테이블에서 조회 (새로운 JSONB 구조)
      console.log('📋 회차 데이터 로드 시작...');
      
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .order('assignment_date', { ascending: false })
        .order('round_number', { ascending: true });
        
      if (error) {
        console.error('❌ 회차 데이터 조회 오류:', error.message || error.code || '알 수 없는 오류');
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          console.log('team_assignments 테이블이 없습니다.');
          setRounds([]);
          return;
        }
        setRounds([]);
        return;
      }
      
      console.log('✅ 회차 데이터 로드 완료:', data);
      console.log('📊 로드된 회차 개수:', data?.length || 0);
      
      if (data && data.length > 0) {
        // 새로운 구조: 각 row가 하나의 회차
        const roundsArray: RoundSummary[] = data.map((row: any) => {
          const roundSummary: RoundSummary = {
            round: row.round_number,
            racket_team: row.racket_team || [],
            shuttle_team: row.shuttle_team || [],
            team1: row.team1 || [],
            team2: row.team2 || [],
            team3: row.team3 || [],
            team4: row.team4 || [],
            pairs_data: row.pairs_data || {},
            total_players: 0,
            title: row.title,
            assignment_date: row.assignment_date,
            team_type: row.team_type
          };

          // 총 인원 계산
          if (row.team_type === '2teams') {
            roundSummary.total_players = (row.racket_team?.length || 0) + (row.shuttle_team?.length || 0);
          } else if (row.team_type === '3teams') {
            roundSummary.total_players = (row.team1?.length || 0) + (row.team2?.length || 0) + (row.team3?.length || 0);
          } else if (row.team_type === '4teams') {
            roundSummary.total_players = (row.team1?.length || 0) + (row.team2?.length || 0) + (row.team3?.length || 0) + (row.team4?.length || 0);
          } else if (row.team_type === 'pairs' && row.pairs_data) {
            roundSummary.total_players = Object.values(row.pairs_data).reduce((sum: number, pair: any) => sum + (pair?.length || 0), 0);
          }

          console.log(`🏆 회차 ${row.round_number}:`, {
            title: row.title,
            type: row.team_type,
            date: row.assignment_date,
            totalPlayers: roundSummary.total_players
          });

          return roundSummary;
        });
        
        setRounds(roundsArray);
        
        // 다음 회차 번호 설정
        const maxRound = Math.max(...roundsArray.map(r => r.round), 0);
        setCurrentRound(maxRound + 1);
        console.log(`✅ ${roundsArray.length}개 회차 로드 완료`);
      } else {
        console.log('⚠️ 회차 데이터가 없습니다.');
        setRounds([]);
      }
    } catch (error) {
      console.error('데이터 조회 중 오류:', error instanceof Error ? error.message : String(error));
      setRounds([]);
    } finally {
      setLoading(false);
    }
  };

  // 팀 배정 저장 (DB 우선, 실패 시 로컬 스토리지)
  const saveTeamAssignments = async () => {
    try {
      if (Object.keys(assignments).length === 0) {
        alert('팀 배정을 먼저 해주세요.');
        return;
      }
      
      // 날짜 결정
      let titleDate = new Date().toISOString().slice(0,10);
      if (selectedScheduleId) {
        const { data: schedule } = await supabase.from('match_schedules').select('match_date').eq('id', selectedScheduleId).single();
        if (schedule?.match_date) titleDate = schedule.match_date;
      }

      // 팀 구성 방식 라벨 생성
      const getTeamTypeLabel = (type: string) => {
        switch(type) {
          case '2teams': return '2팀';
          case '3teams': return '3팀';
          case '4teams': return '4팀';
          case 'pairs': return '페어';
          case 'custom': return '사용자정의';
          default: return '2팀';
        }
      };

      const roundTitle = `라뚱대회 ${titleDate} ${getTeamTypeLabel(teamConfig.type)}`;

      // 팀별로 분리
      let racketPlayers: string[] = [];
      let shuttlePlayers: string[] = [];
      let team1Players: string[] = [];
      let team2Players: string[] = [];
      let team3Players: string[] = [];
      let team4Players: string[] = [];

      if (teamConfig.type === '3teams' || teamConfig.type === '4teams') {
        // 3팀, 4팀 모드 - team1, team2, team3, team4 사용
        team1Players = Object.entries(assignments)
          .filter(([_, team]) => team === 'team1')
          .map(([name, _]) => name);
        team2Players = Object.entries(assignments)
          .filter(([_, team]) => team === 'team2')
          .map(([name, _]) => name);
        team3Players = Object.entries(assignments)
          .filter(([_, team]) => team === 'team3')
          .map(([name, _]) => name);
        
        if (teamConfig.type === '4teams') {
          team4Players = Object.entries(assignments)
            .filter(([_, team]) => team === 'team4')
            .map(([name, _]) => name);
        }
      } else if (teamConfig.type === 'pairs') {
        // pairs 모드 - 동적으로 페어 저장 (team1~team4는 사용 안 함)
        // 전체 assignments를 JSON으로 저장
      } else {
        // 2팀 모드 (기본)
        racketPlayers = Object.entries(assignments)
          .filter(([_, team]) => team === 'racket')
          .map(([name, _]) => name);
        shuttlePlayers = Object.entries(assignments)
          .filter(([_, team]) => team === 'shuttle')
          .map(([name, _]) => name);
      }

      // DB에 저장 시도
      try {
        const insertData: any = {
          assignment_date: titleDate,
          round_number: currentRound,
          title: roundTitle,
          team_type: teamConfig.type
        };

        // 팀 타입에 따라 적절한 필드 추가
        if (teamConfig.type === 'pairs') {
          // pairs 모드: 페어 데이터를 JSON으로 저장
          const pairsData: Record<string, string[]> = {};
          Object.entries(assignments).forEach(([player, team]) => {
            if (!pairsData[team]) pairsData[team] = [];
            pairsData[team].push(player);
          });
          insertData.pairs_data = pairsData;
        } else if (teamConfig.type === '3teams') {
          insertData.team1 = team1Players;
          insertData.team2 = team2Players;
          insertData.team3 = team3Players;
        } else if (teamConfig.type === '4teams') {
          insertData.team1 = team1Players;
          insertData.team2 = team2Players;
          insertData.team3 = team3Players;
          insertData.team4 = team4Players;
        } else {
          insertData.racket_team = racketPlayers;
          insertData.shuttle_team = shuttlePlayers;
        }

        console.log('📥 DB에 저장할 데이터:', insertData);
        
        const { data, error } = await supabase
          .from('team_assignments')
          .insert([insertData])
          .select();

        if (error) {
          console.error('❌ DB 저장 오류:', error);
          throw error;
        }
        
        console.log('✅ DB에 저장 성공:', data);
      } catch (dbError) {
        console.warn('⚠️ DB 저장 실패, 로컬 스토리지에 저장합니다:', dbError);
        
        // 로컬 스토리지에 저장 (폴백)
        const assignmentData = Object.entries(assignments).map(([playerName, teamType]) => ({
          round_number: currentRound,
          player_name: playerName,
          team_type: teamType,
          created_at: new Date().toISOString(),
          round_title: roundTitle,
          assignment_date: titleDate
        }));
        
        const existingData = JSON.parse(localStorage.getItem('badminton_team_assignments') || '[]');
        const newData = [...existingData, ...assignmentData];
        localStorage.setItem('badminton_team_assignments', JSON.stringify(newData));
      }
      
      // 상태 업데이트
      const newRound: RoundSummary = {
        round: currentRound,
        racket_team: racketPlayers,
        shuttle_team: shuttlePlayers,
        total_players: Object.keys(assignments).length,
        title: roundTitle,
        assignment_date: titleDate,
        team_type: teamConfig.type
      };
      
      setRounds([...rounds, newRound]);
      setCurrentRound(currentRound + 1);
      setAssignments({});
      
      // 저장 후 데이터 다시 로드
      console.log('📊 저장 후 데이터 재로드...');
      await fetchRoundsData();
      
      alert(`${roundTitle} 팀 배정이 저장되었습니다.`);
    } catch (error) {
      console.error('❌ 저장 중 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // 팀 배정 삭제
  const deleteTeamAssignment = async (roundNumber: number, assignmentDate: string) => {
    if (!confirm(`${roundNumber}회차 팀 구성을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      console.log(`삭제 시도: round_number=${roundNumber}, assignment_date=${assignmentDate}`);
      
      // DB에서 삭제 시도
      const { error, data } = await supabase
        .from('team_assignments')
        .delete()
        .eq('round_number', roundNumber)
        .eq('assignment_date', assignmentDate)
        .select();

      if (error) {
        console.error('DB 삭제 오류:', error);
        throw error;
      }

      console.log('✅ DB에서 삭제 성공:', data);
      
      // 로컬 스토리지에서도 삭제
      try {
        const localData = JSON.parse(localStorage.getItem('badminton_team_assignments') || '[]');
        const filteredData = localData.filter((item: TeamAssignment) => 
          !(item.round_number === roundNumber && item.assignment_date === assignmentDate)
        );
        localStorage.setItem('badminton_team_assignments', JSON.stringify(filteredData));
        console.log('✅ 로컬 스토리지에서도 삭제 완료');
      } catch (localError) {
        console.warn('로컬 스토리지 삭제 실패:', localError);
      }
      
      // 로컬 상태 즉시 업데이트
      setRounds(prev => prev.filter(r => 
        !(r.round === roundNumber && r.assignment_date === assignmentDate)
      ));
      
      alert(`${roundNumber}회차가 삭제되었습니다.`);
      
      // 데이터 다시 불러오기 (DB와 동기화)
      await fetchRoundsData();
    } catch (dbError) {
      console.error('삭제 실패:', dbError);
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  // 로컬 스토리지에서 데이터 불러오기
  const loadFromLocalStorage = () => {
    try {
      const data = JSON.parse(localStorage.getItem('badminton_team_assignments') || '[]');
      
      if (data.length === 0) {
        setRounds([]);
        return;
      }
      
      const roundsMap: Record<number, RoundSummary> = {};
      
      data.forEach((assignment: TeamAssignment) => {
        if (!roundsMap[assignment.round_number]) {
          roundsMap[assignment.round_number] = {
            round: assignment.round_number,
            racket_team: [],
            shuttle_team: [],
            total_players: 0
          };
        }
        
        if (assignment.team_type === 'racket') {
          roundsMap[assignment.round_number].racket_team.push(assignment.player_name);
        } else {
          roundsMap[assignment.round_number].shuttle_team.push(assignment.player_name);
        }
        roundsMap[assignment.round_number].total_players++;
        if (assignment.round_title) roundsMap[assignment.round_number].title = assignment.round_title;
      });
      
      const roundsArray = Object.values(roundsMap);
      setRounds(roundsArray);
      
      const maxRound = Math.max(...roundsArray.map(r => r.round), 0);
      setCurrentRound(maxRound + 1);
    } catch (error) {
      console.error('로컬 데이터 불러오기 오류:', error);
      setRounds([]);
    }
  };

  // 자동 팀 배정 (설정된 타입에 따라)
  const autoAssignTeams = () => {
    if (todayPlayers.length === 0) {
      alert('출석한 선수가 없습니다.');
      return;
    }
    
    const newAssignments: Record<string, TeamName> = {};
    
    switch (teamConfig.type) {
      case '2teams':
        // 2팀 균등 배정 (점수 기반)
        const sortedPlayers2 = [...todayPlayers].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
        sortedPlayers2.forEach((player, index) => {
          // 지그재그 배정: 강한 선수부터 번갈아가며 배정
          newAssignments[player] = index % 2 === 0 ? 'racket' : 'shuttle';
        });
        break;
        
      case '3teams':
        // 3팀 균등 배정 (점수 기반)
        const sortedPlayers3 = [...todayPlayers].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
        const teams3: string[][] = [[], [], []];
        const teamScores3 = [0, 0, 0];
        
        // 각 선수를 현재 점수가 가장 낮은 팀에 배정
        sortedPlayers3.forEach(player => {
          const playerScore = getPlayerScore(player);
          const minScoreIndex = teamScores3.indexOf(Math.min(...teamScores3));
          teams3[minScoreIndex].push(player);
          teamScores3[minScoreIndex] += playerScore;
        });
        
        teams3[0].forEach(player => newAssignments[player] = 'team1');
        teams3[1].forEach(player => newAssignments[player] = 'team2');
        teams3[2].forEach(player => newAssignments[player] = 'team3');
        
        console.log('3팀 배정 결과:', {
          team1: `${teams3[0].length}명, ${teamScores3[0].toFixed(1)}점`,
          team2: `${teams3[1].length}명, ${teamScores3[1].toFixed(1)}점`,
          team3: `${teams3[2].length}명, ${teamScores3[2].toFixed(1)}점`,
          차이: `${(Math.max(...teamScores3) - Math.min(...teamScores3)).toFixed(1)}점`
        });
        break;
        
      case '4teams':
        // 4팀 균등 배정 (점수 기반)
        const sortedPlayers4 = [...todayPlayers].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
        const teams4: string[][] = [[], [], [], []];
        const teamScores4 = [0, 0, 0, 0];
        
        // 각 선수를 현재 점수가 가장 낮은 팀에 배정
        sortedPlayers4.forEach(player => {
          const playerScore = getPlayerScore(player);
          const minScoreIndex = teamScores4.indexOf(Math.min(...teamScores4));
          teams4[minScoreIndex].push(player);
          teamScores4[minScoreIndex] += playerScore;
        });
        
        teams4[0].forEach(player => newAssignments[player] = 'team1');
        teams4[1].forEach(player => newAssignments[player] = 'team2');
        teams4[2].forEach(player => newAssignments[player] = 'team3');
        teams4[3].forEach(player => newAssignments[player] = 'team4');
        
        console.log('4팀 배정 결과:', {
          team1: `${teams4[0].length}명, ${teamScores4[0].toFixed(1)}점`,
          team2: `${teams4[1].length}명, ${teamScores4[1].toFixed(1)}점`,
          team3: `${teams4[2].length}명, ${teamScores4[2].toFixed(1)}점`,
          team4: `${teams4[3].length}명, ${teamScores4[3].toFixed(1)}점`,
          차이: `${(Math.max(...teamScores4) - Math.min(...teamScores4)).toFixed(1)}점`
        });
        break;
        
      case 'pairs':
        // 1단계: 전체 선수를 점수 기준으로 정렬 (높은 점수부터)
        const sortedByScore = [...todayPlayers].sort((a, b) => {
          return getPlayerScore(b) - getPlayerScore(a);
        });
        
        // 2단계: 선택한 그룹 수에 따라 범위 분할 (각 그룹은 짝수 인원)
        const numGroups = teamConfig.numLevelGroups || 2;
        const totalPlayers = sortedByScore.length;
        const groups: string[][] = [];
        const groupNames: string[] = [];
        
        if (numGroups === 2) {
          // 2그룹: 상위(1~절반), 하위(절반+1~끝)
          let midPoint = Math.ceil(totalPlayers / 2);
          // 상위 그룹이 홀수면 하나 추가하여 짝수로
          if (midPoint % 2 !== 0 && midPoint < totalPlayers) {
            midPoint++;
          }
          groups.push(sortedByScore.slice(0, midPoint));           // 상위
          groups.push(sortedByScore.slice(midPoint));              // 하위
          groupNames.push('상위 그룹', '하위 그룹');
          
        } else if (numGroups === 3) {
          // 3그룹: 상위(1~1/3), 중위(1/3+1~2/3), 하위(2/3+1~끝)
          let firstPoint = Math.ceil(totalPlayers / 3);
          let secondPoint = Math.ceil(totalPlayers * 2 / 3);
          
          // 각 그룹을 짝수로 조정
          if (firstPoint % 2 !== 0 && firstPoint < totalPlayers) {
            firstPoint++;
          }
          if ((secondPoint - firstPoint) % 2 !== 0 && secondPoint < totalPlayers) {
            secondPoint++;
          }
          
          groups.push(sortedByScore.slice(0, firstPoint));         // 상위
          groups.push(sortedByScore.slice(firstPoint, secondPoint)); // 중위
          groups.push(sortedByScore.slice(secondPoint));           // 하위
          groupNames.push('상위 그룹', '중위 그룹', '하위 그룹');
          
        } else if (numGroups === 4) {
          // 4그룹: 상위(1~1/4), 중상(1/4+1~2/4), 중하(2/4+1~3/4), 하위(3/4+1~끝)
          let firstPoint = Math.ceil(totalPlayers / 4);
          let secondPoint = Math.ceil(totalPlayers * 2 / 4);
          let thirdPoint = Math.ceil(totalPlayers * 3 / 4);
          
          // 각 그룹을 짝수로 조정
          if (firstPoint % 2 !== 0 && firstPoint < totalPlayers) {
            firstPoint++;
          }
          if ((secondPoint - firstPoint) % 2 !== 0 && secondPoint < totalPlayers) {
            secondPoint++;
          }
          if ((thirdPoint - secondPoint) % 2 !== 0 && thirdPoint < totalPlayers) {
            thirdPoint++;
          }
          
          groups.push(sortedByScore.slice(0, firstPoint));         // 상위
          groups.push(sortedByScore.slice(firstPoint, secondPoint)); // 중상
          groups.push(sortedByScore.slice(secondPoint, thirdPoint)); // 중하
          groups.push(sortedByScore.slice(thirdPoint));            // 하위
          groupNames.push('상위 그룹', '중상 그룹', '중하 그룹', '하위 그룹');
        }
        
        // 그룹 정보를 state에 저장
        const newPairGroups = groups.map((group, idx) => ({
          groupName: groupNames[idx],
          players: group
        }));
        setPairGroups(newPairGroups);
        
        // 3단계: 각 그룹 내에서 2명씩 페어 구성 (페어 간 점수 합계 균등화)
        let pairCounter = 1;
        groups.forEach((group, groupIdx) => {
          // 그룹 내에서 점수 정렬
          const sortedGroup = [...group].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
          
          const players = sortedGroup.map(p => ({
            name: p,
            score: getPlayerScore(p)
          }));
          
          const pairs: string[][] = [];
          
          // 방식: 상위와 하위를 매칭하여 페어 합계를 균등하게
          // 1위+마지막, 2위+마지막-1 방식이지만 약간의 랜덤성 추가
          const totalPlayers = players.length;
          
          // 상위 절반과 하위 절반으로 나누기
          const halfPoint = Math.ceil(totalPlayers / 2);
          const topHalf = players.slice(0, halfPoint);
          const bottomHalf = players.slice(halfPoint).reverse(); // 역순으로
          
          // 랜덤하게 섞되, 전체 점수 분포는 유지
          const shuffleWithBalance = (arr: typeof players) => {
            const shuffled = [...arr];
            // 작은 범위 내에서만 섞기 (인접한 2-3명 범위)
            for (let i = 0; i < shuffled.length - 1; i += 2) {
              if (Math.random() > 0.5 && i + 1 < shuffled.length) {
                [shuffled[i], shuffled[i + 1]] = [shuffled[i + 1], shuffled[i]];
              }
            }
            return shuffled;
          };
          
          const shuffledTop = shuffleWithBalance(topHalf);
          const shuffledBottom = shuffleWithBalance(bottomHalf);
          
          // 상위와 하위를 1:1 매칭
          const maxPairs = Math.max(shuffledTop.length, shuffledBottom.length);
          for (let i = 0; i < maxPairs; i++) {
            const pair: string[] = [];
            let pairScore = 0;
            
            if (i < shuffledTop.length) {
              pair.push(shuffledTop[i].name);
              pairScore += shuffledTop[i].score;
            }
            if (i < shuffledBottom.length) {
              pair.push(shuffledBottom[i].name);
              pairScore += shuffledBottom[i].score;
            }
            
            if (pair.length > 0) {
              pairs.push(pair);
              
              // 로그 출력
              if (pair.length === 2) {
                const score1 = i < shuffledTop.length ? shuffledTop[i].score : 0;
                const score2 = i < shuffledBottom.length ? shuffledBottom[i].score : 0;
                console.log(`  페어${pairCounter}: ${pair[0]}(${score1.toFixed(1)}) + ${pair[1]}(${score2.toFixed(1)}) = 합계 ${pairScore.toFixed(1)}`);
              } else {
                console.log(`  페어${pairCounter}: ${pair[0]}(${pairScore.toFixed(1)}) - 1명만 배정`);
              }
              
              // 페어에 배정
              pair.forEach(player => {
                newAssignments[player] = `pair${pairCounter}` as TeamName;
              });
              pairCounter++;
            }
          }
          
          // 그룹 통계 계산
          const pairScores = pairs
            .filter(p => p.length === 2)
            .map(p => {
              const p1Score = getPlayerScore(p[0]);
              const p2Score = getPlayerScore(p[1]);
              return p1Score + p2Score;
            });
          
          if (pairScores.length > 0) {
            const avgPairScore = (pairScores.reduce((a, b) => a + b, 0) / pairScores.length).toFixed(1);
            const maxPairScore = Math.max(...pairScores).toFixed(1);
            const minPairScore = Math.min(...pairScores).toFixed(1);
            const pairScoreRange = (Math.max(...pairScores) - Math.min(...pairScores)).toFixed(1);
            
            console.log(`그룹 ${groupIdx + 1} 총평: ${group.length}명 → ${pairs.length}개 페어`);
            console.log(`  페어 합계 - 평균: ${avgPairScore}, 범위: ${minPairScore}~${maxPairScore}, 편차: ${pairScoreRange}`);
          } else {
            console.log(`그룹 ${groupIdx + 1}: ${group.length}명 → ${pairs.length}개 페어`);
          }
        });
        
        console.log(`\n✅ ${numGroups}개 그룹으로 분할 후 총 ${pairCounter - 1}개 페어 구성 완료 (상위-하위 균등 매칭)`);
        break;
        
      case 'custom':
        // 사용자 정의 - 수동 편집 모드 활성화
        setShowCustomEditor(true);
        return;
        
      default:
        // 기본: 2팀 - 선수를 무작위로 섞어서 절반씩 배정
        const registeredPlayers = Object.keys(assignments);
        const shuffled = [...registeredPlayers].sort(() => Math.random() - 0.5);
        const defaultHalf = Math.ceil(shuffled.length / 2);
        shuffled.forEach((player, index) => {
          newAssignments[player] = index < defaultHalf ? 'racket' : 'shuttle';
        });
    }
    
    setAssignments(newAssignments);
    setShowCustomEditor(false);
  };

  // 팀 배정 변경
  const togglePlayerTeam = (playerName: string) => {
    if (teamConfig.type === '3teams') {
      // 3팀 모드: team1 → team2 → team3 → team1
      setAssignments(prev => {
        const current = prev[playerName];
        let next: TeamName;
        if (current === 'team1') next = 'team2';
        else if (current === 'team2') next = 'team3';
        else next = 'team1';
        return { ...prev, [playerName]: next };
      });
    } else if (teamConfig.type === '4teams') {
      // 4팀 모드: team1 → team2 → team3 → team4 → team1
      setAssignments(prev => {
        const current = prev[playerName];
        let next: TeamName;
        if (current === 'team1') next = 'team2';
        else if (current === 'team2') next = 'team3';
        else if (current === 'team3') next = 'team4';
        else next = 'team1';
        return { ...prev, [playerName]: next };
      });
    } else {
      // 2팀 모드: racket ↔ shuttle
      setAssignments(prev => ({
        ...prev,
        [playerName]: prev[playerName] === 'racket' ? 'shuttle' : 'racket'
      }));
    }
  };

  // 선수를 특정 팀으로 배정
  const assignPlayerToTeam = (playerName: string, team: TeamName) => {
    setAssignments(prev => ({
      ...prev,
      [playerName]: team
    }));
  };

  // 선수 이름에서 레벨 점수 추출
  const getPlayerScore = (playerName: string): number => {
    // 선수명(A1) 형식에서 레벨 추출
    const match = playerName.match(/\(([A-Za-z])(\d+)\)/);
    if (!match) return 0;
    
    const level = match[1].toUpperCase();
    const number = parseInt(match[2]);
    
    // 레벨별 기본 점수
    const levelScores: Record<string, number> = {
      'S': 10,
      'A': 8,
      'B': 6,
      'C': 4,
      'D': 2,
      'N': 0
    };
    
    const baseScore = levelScores[level] || 0;
    // 숫자가 작을수록 높은 실력 (A1 > A2 > A3)
    const adjustedScore = baseScore + (4 - Math.min(number, 3)) * 0.3;
    return Math.round(adjustedScore * 10) / 10;
  };

  // 팀 점수 합계 계산
  const getTeamScore = (teamName: TeamName): number => {
    const teamPlayers = Object.entries(assignments)
      .filter(([_, team]) => team === teamName)
      .map(([player, _]) => player);
    
    return teamPlayers.reduce((sum, player) => sum + getPlayerScore(player), 0);
  };

  // 선수 정렬 함수: 점수 높은 순 → 같으면 가나다순
  const sortPlayers = (players: string[]): string[] => {
    return [...players].sort((a, b) => {
      const scoreA = getPlayerScore(a);
      const scoreB = getPlayerScore(b);
      
      // 점수가 다르면 점수 높은 순
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      // 점수가 같으면 이름 가나다순
      return a.localeCompare(b, 'ko');
    });
  };

  // 참여자 모달 열기
  const openParticipantsModal = (round: RoundSummary) => {
    setSelectedRoundForModal(round);
  };

  // 참여자 모달 닫기
  const closeParticipantsModal = () => {
    setSelectedRoundForModal(null);
  };

  useEffect(() => {
    const initializeData = async () => {
      await fetchSchedulesList();
      await fetchTodayPlayers();
      await fetchRoundsData();
      // DB에서 실패한 경우 로컬 스토리지에서 불러오기
      loadFromLocalStorage();
    };
    
    initializeData();
  }, []);

  // 선택된 스케줄 변경 시 선수 목록 갱신
  useEffect(() => {
    fetchTodayPlayers();
  }, [selectedScheduleId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">데이터 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4 text-center">대회 팀 관리</h1>

      {/* 스케줄 선택 & 팀 구성 방식 - 한 행으로 배치 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* 왼쪽: 스케줄 선택 */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">📅 경기 일정</label>
            <select 
              value={selectedScheduleId || ''} 
              onChange={(e) => setSelectedScheduleId(e.target.value || null)}
              className="w-full border rounded-lg p-2 text-sm"
            >
              <option value="">(출석 기준)</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>{s.match_date} {s.start_time} · {s.location}</option>
              ))}
            </select>
          </div>

          {/* 오른쪽: 팀 구성 방식 선택 */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">🎯 팀 구성 방식</label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button
                onClick={() => {
                  setTeamConfig({ type: '2teams' });
                  setPairGroups([]);
                }}
                className={`p-3 rounded-lg border-2 transition-all ${
                  teamConfig.type === '2teams'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-300 hover:border-blue-300'
                }`}
              >
                <div className="text-2xl mb-1">🏸⚡</div>
                <div className="font-semibold text-sm">2팀</div>
                <div className="text-xs text-gray-600">라켓 vs 셔틀</div>
              </button>
              
              <button
                onClick={() => {
                  setTeamConfig({ type: '3teams' });
                  setPairGroups([]);
                }}
                className={`p-3 rounded-lg border-2 transition-all ${
                  teamConfig.type === '3teams'
                    ? 'border-teal-500 bg-teal-50 shadow-md'
                    : 'border-gray-300 hover:border-teal-300'
                }`}
              >
                <div className="text-2xl mb-1">🏸🏸⚡</div>
                <div className="font-semibold text-sm">3팀</div>
                <div className="text-xs text-gray-600">3개 팀</div>
              </button>
              
              <button
                onClick={() => {
                  setTeamConfig({ type: '4teams' });
                  setPairGroups([]);
                }}
                className={`p-3 rounded-lg border-2 transition-all ${
                  teamConfig.type === '4teams'
                    ? 'border-purple-500 bg-purple-50 shadow-md'
                    : 'border-gray-300 hover:border-purple-300'
                }`}
              >
                <div className="text-2xl mb-1">🏸🏸⚡⚡</div>
                <div className="font-semibold text-sm">4팀</div>
                <div className="text-xs text-gray-600">4개 팀</div>
              </button>
              
              <button
                onClick={() => setTeamConfig({ type: 'pairs', numLevelGroups: 2 })}
                className={`p-3 rounded-lg border-2 transition-all ${
                  teamConfig.type === 'pairs'
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-300 hover:border-green-300'
                }`}
              >
                <div className="text-2xl mb-1">👥</div>
                <div className="font-semibold text-sm">2명 팀</div>
                <div className="text-xs text-gray-600">레벨별 페어</div>
              </button>
              
              <button
                onClick={() => {
                  setTeamConfig({ type: 'custom' });
                  setPairGroups([]);
                }}
                className={`p-3 rounded-lg border-2 transition-all ${
                  teamConfig.type === 'custom'
                    ? 'border-orange-500 bg-orange-50 shadow-md'
                    : 'border-gray-300 hover:border-orange-300'
                }`}
              >
                <div className="text-2xl mb-1">✏️</div>
                <div className="font-semibold text-sm">사용자 정의</div>
                <div className="text-xs text-gray-600">직접 구성</div>
              </button>
            </div>
          </div>
        </div>

        {/* 2명 팀 모드일 때 그룹 수 선택 */}
        {teamConfig.type === 'pairs' && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="font-semibold text-green-900 mb-3">📊 레벨 그룹 분할 선택</h3>
            <div className="flex gap-3">
              {[2, 3, 4].map(num => {
                const isSelected = teamConfig.numLevelGroups === num;
                return (
                  <button
                    key={num}
                    onClick={() => {
                      setTeamConfig({ ...teamConfig, numLevelGroups: num });
                      // 그룹 수 변경 시 선수 목록 미리 표시 (각 그룹을 짝수로 조정)
                      if (todayPlayers.length > 0) {
                        const sortedByScore = [...todayPlayers].sort((a, b) => 
                          getPlayerScore(b) - getPlayerScore(a)
                        );
                        const totalPlayers = sortedByScore.length;
                        const groups: string[][] = [];
                        const groupNames: string[] = [];
                        
                        if (num === 2) {
                          let midPoint = Math.ceil(totalPlayers / 2);
                          // 상위 그룹이 홀수면 하나 추가하여 짝수로
                          if (midPoint % 2 !== 0 && midPoint < totalPlayers) {
                            midPoint++;
                          }
                          groups.push(sortedByScore.slice(0, midPoint));
                          groups.push(sortedByScore.slice(midPoint));
                          groupNames.push('상위 그룹', '하위 그룹');
                        } else if (num === 3) {
                          let firstPoint = Math.ceil(totalPlayers / 3);
                          let secondPoint = Math.ceil(totalPlayers * 2 / 3);
                          
                          // 각 그룹을 짝수로 조정
                          if (firstPoint % 2 !== 0 && firstPoint < totalPlayers) {
                            firstPoint++;
                          }
                          if ((secondPoint - firstPoint) % 2 !== 0 && secondPoint < totalPlayers) {
                            secondPoint++;
                          }
                          
                          groups.push(sortedByScore.slice(0, firstPoint));
                          groups.push(sortedByScore.slice(firstPoint, secondPoint));
                          groups.push(sortedByScore.slice(secondPoint));
                          groupNames.push('상위 그룹', '중위 그룹', '하위 그룹');
                        } else if (num === 4) {
                          let firstPoint = Math.ceil(totalPlayers / 4);
                          let secondPoint = Math.ceil(totalPlayers * 2 / 4);
                          let thirdPoint = Math.ceil(totalPlayers * 3 / 4);
                          
                          // 각 그룹을 짝수로 조정
                          if (firstPoint % 2 !== 0 && firstPoint < totalPlayers) {
                            firstPoint++;
                          }
                          if ((secondPoint - firstPoint) % 2 !== 0 && secondPoint < totalPlayers) {
                            secondPoint++;
                          }
                          if ((thirdPoint - secondPoint) % 2 !== 0 && thirdPoint < totalPlayers) {
                            thirdPoint++;
                          }
                          
                          groups.push(sortedByScore.slice(0, firstPoint));
                          groups.push(sortedByScore.slice(firstPoint, secondPoint));
                          groups.push(sortedByScore.slice(secondPoint, thirdPoint));
                          groups.push(sortedByScore.slice(thirdPoint));
                          groupNames.push('상위 그룹', '중상 그룹', '중하 그룹', '하위 그룹');
                        }
                        
                        const newPairGroups = groups.map((group, idx) => ({
                          groupName: groupNames[idx],
                          players: group
                        }));
                        setPairGroups(newPairGroups);
                      }
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                      isSelected
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-white text-green-700 border-2 border-green-300 hover:bg-green-100'
                    }`}
                  >
                    <div className="text-xl mb-1">{num}개 그룹</div>
                    <div className="text-xs opacity-80">
                      {num === 2 && '상위 / 하위'}
                      {num === 3 && '상위 / 중위 / 하위'}
                      {num === 4 && '상 / 중상 / 중하 / 하'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 현재 출석자 및 팀 배정 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">
          {currentRound}회차 팀 배정 
          <span className="text-sm text-gray-600 ml-2">
            (출석자: {todayPlayers.length}명)
          </span>
        </h2>
        
        {todayPlayers.length === 0 ? (
          <p className="text-gray-500">선택된 일정에 참가자가 없습니다.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <button
                onClick={autoAssignTeams}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
              >
                <span>🎲</span>
                <span>자동 배정</span>
              </button>
              <button
                onClick={saveTeamAssignments}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2"
                disabled={Object.keys(assignments).length === 0}
              >
                <span>💾</span>
                <span>배정 저장</span>
              </button>
              {Object.keys(assignments).length > 0 && (
                <button
                  onClick={() => setAssignments({})}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-2"
                >
                  <span>🔄</span>
                  <span>초기화</span>
                </button>
              )}
            </div>
            
            {/* 3팀 모드 */}
            {teamConfig.type === '3teams' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 팀 1 */}
                <div className="border rounded-lg p-4 bg-blue-50">
                  <h3 className="text-lg font-semibold mb-3 text-blue-700">
                    팀 1 ({Object.values(assignments).filter(t => t === 'team1').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team1').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team1' 
                            ? 'bg-blue-200 border-blue-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-blue-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team1')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 팀 2 */}
                <div className="border rounded-lg p-4 bg-green-50">
                  <h3 className="text-lg font-semibold mb-3 text-green-700">
                    팀 2 ({Object.values(assignments).filter(t => t === 'team2').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team2').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team2' 
                            ? 'bg-green-200 border-green-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-green-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team2')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 팀 3 */}
                <div className="border rounded-lg p-4 bg-purple-50">
                  <h3 className="text-lg font-semibold mb-3 text-purple-700">
                    팀 3 ({Object.values(assignments).filter(t => t === 'team3').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team3').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team3' 
                            ? 'bg-purple-200 border-purple-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-purple-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team3')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : teamConfig.type === 'pairs' ? (
              /* 2명 팀 모드 - 페어 구성 표시 */
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700 mb-2">
                    💡 <strong>2명 팀 모드:</strong> 2명씩 자동으로 페어를 구성합니다. 
                    (출석자 {todayPlayers.length}명 → {Math.ceil(todayPlayers.length / 2)}개 페어)
                  </p>
                </div>
                
                {/* 그룹별로 선수 표시 */}
                {pairGroups.length > 0 && (
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-800">📊 그룹별 참가자</h3>
                      <button
                        onClick={() => setShowGroupPlayers(!showGroupPlayers)}
                        className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors flex items-center gap-2"
                      >
                        {showGroupPlayers ? (
                          <>
                            <span>👁️</span>
                            <span>숨기기</span>
                          </>
                        ) : (
                          <>
                            <span>👁️‍🗨️</span>
                            <span>보기</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    {showGroupPlayers && (
                      <div className={`grid grid-cols-1 ${pairGroups.length === 2 ? 'md:grid-cols-2' : pairGroups.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4`}>
                        {pairGroups.map((group, idx) => {
                          const colorSchemes = [
                            { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', badge: 'bg-red-100' },
                            { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-100' },
                            { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', badge: 'bg-green-100' },
                            { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-100' }
                          ];
                          const colors = colorSchemes[idx % colorSchemes.length];
                          
                          return (
                            <div key={idx} className={`border-2 ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                              <h4 className={`font-semibold mb-3 ${colors.text} text-base`}>
                                {group.groupName} ({group.players.length}명)
                              </h4>
                              <div className="space-y-1.5">
                                {group.players.map((player, playerIdx) => (
                                  <div key={player} className={`p-2 rounded ${colors.badge} text-sm`}>
                                    {playerIdx + 1}. {player}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 그룹별로 페어 표시 */}
                {Object.keys(assignments).length > 0 && (() => {
                  // 페어별로 그룹화
                  const pairs: Record<string, string[]> = {};
                  Object.entries(assignments).forEach(([player, team]) => {
                    if (!pairs[team]) pairs[team] = [];
                    pairs[team].push(player);
                  });
                  
                  // 페어 번호로 정렬
                  const sortedPairs = Object.entries(pairs).sort((a, b) => {
                    const numA = parseInt(a[0].replace('pair', ''));
                    const numB = parseInt(b[0].replace('pair', ''));
                    return numA - numB;
                  });
                  
                  // 각 페어가 어느 그룹에 속하는지 확인
                  const getPairGroup = (players: string[]) => {
                    for (let i = 0; i < pairGroups.length; i++) {
                      if (players.some(p => pairGroups[i].players.includes(p))) {
                        return i;
                      }
                    }
                    return -1;
                  };
                  
                  // 그룹별로 페어 분류
                  const pairsByGroup: Record<number, Array<[string, string[]]>> = {};
                  sortedPairs.forEach(pair => {
                    const groupIdx = getPairGroup(pair[1]);
                    if (!pairsByGroup[groupIdx]) pairsByGroup[groupIdx] = [];
                    pairsByGroup[groupIdx].push(pair);
                  });
                  
                  return (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold text-gray-800">🤝 그룹별 페어 구성</h3>
                      {Object.entries(pairsByGroup).map(([groupIdxStr, groupPairs]) => {
                        const groupIdx = parseInt(groupIdxStr);
                        if (groupIdx < 0 || !pairGroups[groupIdx]) return null;
                        
                        const colorSchemes = [
                          { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', highlight: 'bg-red-100', title: 'bg-red-200' },
                          { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', highlight: 'bg-blue-100', title: 'bg-blue-200' },
                          { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-700', highlight: 'bg-green-100', title: 'bg-green-200' },
                          { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700', highlight: 'bg-purple-100', title: 'bg-purple-200' }
                        ];
                        const colors = colorSchemes[groupIdx % colorSchemes.length];
                        
                        return (
                          <div key={groupIdx} className={`border-2 ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                            <h4 className={`font-bold mb-3 ${colors.text} text-base ${colors.title} p-2 rounded`}>
                              {pairGroups[groupIdx].groupName} - {groupPairs.length}개 페어
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                              {groupPairs.map(([pairName, players]) => {
                                const pairNumber = pairName.replace('pair', '');
                                const pairScore = players.reduce((sum, player) => sum + getPlayerScore(player), 0);
                                
                                return (
                                  <div key={pairName} className={`border-2 ${colors.border} rounded-lg p-3 ${colors.highlight}`}>
                                    <h5 className={`text-sm font-semibold mb-2 ${colors.text}`}>
                                      👥 페어 {pairNumber} ({players.length}명)
                                      <span className="ml-1 text-xs font-normal">점수: {pairScore.toFixed(1)}</span>
                                    </h5>
                                    <div className="space-y-1">
                                      {players.map((player, idx) => (
                                        <div 
                                          key={player}
                                          className={`p-2 rounded border ${colors.border} bg-white font-medium text-xs`}
                                        >
                                          {idx + 1}. {player}
                                        </div>
                                      ))}
                                      {players.length === 1 && (
                                        <div className="p-2 rounded border border-dashed border-gray-300 bg-gray-50 text-gray-400 text-xs text-center">
                                          1명만 배정됨
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                
                {/* 미배정 선수 목록 */}
                {todayPlayers.filter(p => !assignments[p]).length > 0 && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h3 className="text-lg font-semibold mb-3 text-gray-700">
                      미배정 선수 ({todayPlayers.filter(p => !assignments[p]).length}명)
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {todayPlayers.filter(p => !assignments[p]).map(player => (
                        <div 
                          key={player}
                          className="p-2 rounded border bg-white text-sm text-center"
                        >
                          {player}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : teamConfig.type === '4teams' ? (
              /* 4팀 모드 */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 팀 1 */}
                <div className="border rounded-lg p-4 bg-blue-50">
                  <h3 className="text-lg font-semibold mb-3 text-blue-700">
                    팀 1 ({Object.values(assignments).filter(t => t === 'team1').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team1').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team1' 
                            ? 'bg-blue-200 border-blue-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-blue-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team1')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 팀 2 */}
                <div className="border rounded-lg p-4 bg-green-50">
                  <h3 className="text-lg font-semibold mb-3 text-green-700">
                    팀 2 ({Object.values(assignments).filter(t => t === 'team2').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team2').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team2' 
                            ? 'bg-green-200 border-green-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-green-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team2')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 팀 3 */}
                <div className="border rounded-lg p-4 bg-purple-50">
                  <h3 className="text-lg font-semibold mb-3 text-purple-700">
                    팀 3 ({Object.values(assignments).filter(t => t === 'team3').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team3').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team3' 
                            ? 'bg-purple-200 border-purple-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-purple-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team3')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 팀 4 */}
                <div className="border rounded-lg p-4 bg-orange-50">
                  <h3 className="text-lg font-semibold mb-3 text-orange-700">
                    팀 4 ({Object.values(assignments).filter(t => t === 'team4').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('team4').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors text-sm ${
                          assignments[player] === 'team4' 
                            ? 'bg-orange-200 border-orange-400 font-semibold' 
                            : assignments[player]
                            ? 'bg-gray-100 border-gray-300 text-gray-400'
                            : 'bg-white border-gray-200 hover:bg-orange-100'
                        }`}
                        onClick={() => assignPlayerToTeam(player, 'team4')}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* 2팀 모드 (기본) */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 라켓팀 */}
                <div className="border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-blue-600">
                    🏸 라켓팀 ({Object.values(assignments).filter(t => t === 'racket').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('racket').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors ${
                          assignments[player] === 'racket' 
                            ? 'bg-blue-100 border-blue-300' 
                            : assignments[player] === 'shuttle'
                            ? 'bg-gray-100 border-gray-300'
                            : 'bg-white border-gray-200 hover:bg-blue-50'
                        }`}
                        onClick={() => togglePlayerTeam(player)}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 셔틀팀 */}
                <div className="border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-purple-600">
                    🏃‍♂️ 셔틀팀 ({Object.values(assignments).filter(t => t === 'shuttle').length}명)
                    <span className="ml-2 text-sm font-normal">점수: {getTeamScore('shuttle').toFixed(1)}</span>
                  </h3>
                  <div className="space-y-2">
                    {sortPlayers(todayPlayers).map(player => (
                      <div 
                        key={player}
                        className={`p-2 rounded border cursor-pointer transition-colors ${
                          assignments[player] === 'shuttle' 
                            ? 'bg-purple-100 border-purple-300' 
                            : assignments[player] === 'racket'
                            ? 'bg-gray-100 border-gray-300'
                            : 'bg-white border-gray-200 hover:bg-purple-50'
                        }`}
                        onClick={() => togglePlayerTeam(player)}
                      >
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 회차별 히스토리 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-xl font-semibold">회차별 팀 구성 현황</h2>
          <button
            onClick={() => fetchRoundsData()}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>🔄</span>
            <span>새로고침</span>
          </button>
        </div>
        
        {rounds.length === 0 ? (
          <div className="p-6 text-center text-gray-500 bg-yellow-50 border border-yellow-200 m-6 rounded-lg">
            <p className="font-semibold text-yellow-900 mb-2">⚠️ 아직 저장된 회차가 없습니다</p>
            <p className="text-sm text-yellow-800">위의 "자동 배정" → "배정 저장" 버튼으로 회차를 생성하세요.</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {rounds.sort((a, b) => b.round - a.round).map((round) => {
              // 팀 타입에 따른 라벨
              const getTeamTypeLabel = (type?: string) => {
                switch(type) {
                  case '2teams': return '2팀 대결';
                  case '3teams': return '3팀 대결';
                  case '4teams': return '4팀 대결';
                  case 'pairs': return '2명 한팀';
                  default: return '2팀 대결';
                }
              };

              return (
                <div key={round.round} className="border rounded-lg p-5 hover:shadow-lg transition-shadow">
                  {/* 헤더 */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-900">
                          {round.title || `${round.round}회차`}
                        </h3>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {getTeamTypeLabel(round.team_type)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        총 {round.total_players}명 참여
                        {round.assignment_date && ` · ${round.assignment_date}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openParticipantsModal(round)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 px-3 py-1 rounded transition-colors font-medium"
                        title="참여자 보기"
                      >
                        👥 참여자
                      </button>
                      <button
                        onClick={() => deleteTeamAssignment(round.round, round.assignment_date || new Date().toISOString().slice(0,10))}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50 px-3 py-1 rounded transition-colors"
                        title="삭제"
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 참여자 모달 */}
      {selectedRoundForModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeParticipantsModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedRoundForModal.title || `${selectedRoundForModal.round}회차`}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {(() => {
                      switch(selectedRoundForModal.team_type) {
                        case '2teams': return '2팀 대결';
                        case '3teams': return '3팀 대결';
                        case '4teams': return '4팀 대결';
                        case 'pairs': return '2명 한팀';
                        default: return '2팀 대결';
                      }
                    })()}
                  </span>
                  <span className="text-sm text-gray-500">
                    총 {selectedRoundForModal.total_players}명 참여
                  </span>
                  {selectedRoundForModal.assignment_date && (
                    <span className="text-sm text-gray-500">
                      · {selectedRoundForModal.assignment_date}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={closeParticipantsModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {/* 모달 컨텐츠 */}
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {selectedRoundForModal.team_type === '2teams' && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="font-semibold text-blue-900 mb-3 flex items-center gap-2 text-lg">
                        🏸 라켓팀 
                        <span className="text-sm font-normal">({selectedRoundForModal.racket_team?.length || 0}명)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.racket_team?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-blue-200 text-blue-900 text-sm px-3 py-1.5 rounded-lg font-medium">
                            {player}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="font-semibold text-purple-900 mb-3 flex items-center gap-2 text-lg">
                        🏃‍♂️ 셔틀팀 
                        <span className="text-sm font-normal">({selectedRoundForModal.shuttle_team?.length || 0}명)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.shuttle_team?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-purple-200 text-purple-900 text-sm px-3 py-1.5 rounded-lg font-medium">
                            {player}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedRoundForModal.team_type === '3teams' && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="font-semibold text-blue-900 mb-3 text-lg">
                        팀 1 ({selectedRoundForModal.team1?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team1?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-blue-200 text-blue-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="font-semibold text-green-900 mb-3 text-lg">
                        팀 2 ({selectedRoundForModal.team2?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team2?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-green-200 text-green-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="font-semibold text-purple-900 mb-3 text-lg">
                        팀 3 ({selectedRoundForModal.team3?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team3?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-purple-200 text-purple-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedRoundForModal.team_type === '4teams' && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="font-semibold text-blue-900 mb-3 text-lg">
                        팀 1 ({selectedRoundForModal.team1?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team1?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-blue-200 text-blue-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="font-semibold text-green-900 mb-3 text-lg">
                        팀 2 ({selectedRoundForModal.team2?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team2?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-green-200 text-green-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="font-semibold text-purple-900 mb-3 text-lg">
                        팀 3 ({selectedRoundForModal.team3?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team3?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-purple-200 text-purple-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <div className="font-semibold text-orange-900 mb-3 text-lg">
                        팀 4 ({selectedRoundForModal.team4?.length || 0}명)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoundForModal.team4?.map((player, idx) => (
                          <span key={idx} className="inline-block bg-orange-200 text-orange-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedRoundForModal.team_type === 'pairs' && selectedRoundForModal.pairs_data && (
                  <>
                    {Object.entries(selectedRoundForModal.pairs_data).map(([pairName, players]: [string, any]) => (
                      <div key={pairName} className="bg-teal-50 rounded-lg p-4">
                        <div className="font-semibold text-teal-900 mb-3 text-lg">
                          👥 {pairName.replace('pair', '페어 ')} ({players?.length || 0}명)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {players?.map((player: string, idx: number) => (
                            <span key={idx} className="inline-block bg-teal-200 text-teal-900 text-sm px-3 py-1.5 rounded-lg font-medium">{player}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="border-t px-6 py-4 bg-gray-50">
              <button
                onClick={closeParticipantsModal}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
