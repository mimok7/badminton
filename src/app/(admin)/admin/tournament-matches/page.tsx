'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

interface TeamAssignment {
  id: string;
  round_number: number;
  assignment_date: string;
  title: string;
  team_type: '2teams' | '3teams' | '4teams' | 'pairs';
  racket_team?: string[];
  shuttle_team?: string[];
  team1?: string[];
  team2?: string[];
  team3?: string[];
  team4?: string[];
  pairs_data?: Record<string, string[]>;
}

const isValidTeamType = (value: string): value is TeamAssignment['team_type'] => {
  return value === '2teams' || value === '3teams' || value === '4teams' || value === 'pairs';
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const toPairsData = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, players]) => [key, toStringArray(players)])
  );
};

const normalizeTeamAssignment = (assignment: any): TeamAssignment => ({
  id: assignment.id,
  round_number: assignment.round_number,
  assignment_date: assignment.assignment_date,
  title: assignment.title,
  team_type: isValidTeamType(assignment.team_type) ? assignment.team_type : '2teams',
  racket_team: toStringArray(assignment.racket_team),
  shuttle_team: toStringArray(assignment.shuttle_team),
  team1: toStringArray(assignment.team1),
  team2: toStringArray(assignment.team2),
  team3: toStringArray(assignment.team3),
  team4: toStringArray(assignment.team4),
  pairs_data: toPairsData(assignment.pairs_data),
});

interface Match {
  id?: string;
  tournament_id: string;
  round: number;
  match_number: number;
  team1: string[];
  team2: string[];
  team1_levels?: number[];  // 각 선수의 레벨
  team2_levels?: number[];  // 각 선수의 레벨
  court: string;
  scheduled_time?: string;
  status: 'pending' | 'in_progress' | 'completed';
  score_team1?: number;
  score_team2?: number;
  winner?: 'team1' | 'team2' | 'draw';
}

interface Tournament {
  id: string;
  title: string;
  tournament_date: string;
  round_number: number;
  match_type: string;
  team_assignment_id: string;
  team_type: string;
  total_teams: number;
  matches_per_player: number;
  created_at: string;
  matches?: Match[];
}

export default function TournamentMatchesPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  // 레벨을 점수로 변환 (레벨맵 사용)
  const getLevelScore = (levelStr: string | undefined): number => {
    if (!levelStr) return 1; // 기본값 E2
    const level = (levelStr || '').toString().toLowerCase().trim();
    return levelMap[level] || 1;
  };

  // 선수 이름에서 레벨 추출 (예: "김민정(E2)" → "e2")
  const extractLevelFromName = (nameWithLevel: string): string => {
    // 마지막 괄호에서 레벨 코드 추출
    const match = nameWithLevel.match(/\(([^)]+)\)(?!.*\()$/);
    if (match) {
      return match[1].toLowerCase().trim();
    }
    return 'e2'; // 기본값
  };

  // 선수 이름에서 레벨 제거 (예: "김민정(E2)" → "김민정")
  const getPlayerName = (nameWithLevel: string): string => {
    // 마지막 괄호 부분만 제거
    return nameWithLevel.replace(/\s*\([^)]*\)\s*$/, '').trim();
  };

  // 선수 점수 계산 (team-management에서 참고)
  // 형식: "선수명(A1)" → A=8, 1은 세분수 → 8 + (4-1)*0.3 = 8.9점
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

  // 경기 점수 차이 최소화를 위한 팀 재배치 함수 (모든 경기가 1점 이하가 될 때까지 반복)
  const optimizeMatchBalancing = (matches: Match[]): Match[] => {
    const MAX_ITERATIONS = 100000; // 최대 반복 횟수 (충분히 큼)
    let currentMatches = JSON.parse(JSON.stringify(matches));
    let bestMatches = JSON.parse(JSON.stringify(matches));
    let bestScore = calculateMaxScoreDifference(currentMatches);
    const initialScore = bestScore;

    console.log(`🔄 최적화 시작: 초기 최대 차이 = ${bestScore}점, 경기 수 = ${matches.length}개`);
    console.log(`🎯 목표: 모든 경기의 팀 점수 차이를 1점 이하로 만들기`);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // 모든 경기의 팀 점수 차이 확인
      const matchDifferences = currentMatches.map((match: Match, idx: number) => {
        const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
        const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
        return { idx, diff: Math.abs(team1Score - team2Score) };
      });

      // 2점 이상 차이가 있는 경기들 찾기
      const badMatches = matchDifferences.filter((m: any) => m.diff >= 2);
      const onePointMatches = matchDifferences.filter((m: any) => m.diff === 1);

      // 목표 달성 확인: 모든 경기가 1점 이하
      if (badMatches.length === 0) {
        console.log(`✅ 목표 달성: 모든 경기의 팀 점수 차이가 1점 이하 (${iteration}회차 반복)`);
        break;
      }

      // 2점 이상 차이 경기 우선 처리
      if (badMatches.length > 0) {
        // 차이가 가장 큰 경기 선택 (100% 확률)
        const sortedBadMatches = badMatches.sort((a: any, b: any) => b.diff - a.diff);
        const targetMatch = sortedBadMatches[0];
        const matchToFix = currentMatches[targetMatch.idx];

        // 같은 경기 내에서 최적의 팀 조합 찾기
        const players = [...matchToFix.team1, ...matchToFix.team2];
        let bestCombination = null;
        let bestDiff = targetMatch.diff;

        // 모든 가능한 2대2 조합 시도
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            const team1Candidates = [players[i], players[j]];
            const team2Candidates = players.filter((_, idx: number) => idx !== i && idx !== j);

            const team1Score = team1Candidates.reduce((sum: number, name: string) =>
              sum + getLevelScore(extractLevelFromName(name)), 0);
            const team2Score = team2Candidates.reduce((sum: number, name: string) =>
              sum + getLevelScore(extractLevelFromName(name)), 0);
            const diff = Math.abs(team1Score - team2Score);

            if (diff < bestDiff) {
              bestDiff = diff;
              bestCombination = { team1: team1Candidates, team2: team2Candidates };
            }
          }
        }

        // 최적 조합이 있으면 적용
        if (bestCombination && bestDiff < targetMatch.diff) {
          matchToFix.team1 = bestCombination.team1;
          matchToFix.team2 = bestCombination.team2;
          matchToFix.team1_levels = matchToFix.team1.map((name: string) =>
            getLevelScore(extractLevelFromName(name))
          );
          matchToFix.team2_levels = matchToFix.team2.map((name: string) =>
            getLevelScore(extractLevelFromName(name))
          );
        }
      }

      // 2점 이상 차이가 없을 때만 1점 차이 경기 개선 시도 (경기 간 교환)
      if (badMatches.length === 0 && onePointMatches.length > 0 && matchDifferences.length >= 2) {
        // 1점 차이 경기 중 2개 선택하여 선수 교환 시도
        const match1Idx = onePointMatches[Math.floor(Math.random() * onePointMatches.length)].idx;
        let match2Idx = onePointMatches[Math.floor(Math.random() * onePointMatches.length)].idx;

        while (match2Idx === match1Idx && onePointMatches.length > 1) {
          match2Idx = onePointMatches[Math.floor(Math.random() * onePointMatches.length)].idx;
        }

        if (match1Idx !== match2Idx) {
          const match1 = currentMatches[match1Idx];
          const match2 = currentMatches[match2Idx];

          // 각 경기에서 무작위로 한 명씩 선택하여 교환
          const team1Or2_m1 = Math.random() < 0.5 ? 'team1' : 'team2';
          const team1Or2_m2 = Math.random() < 0.5 ? 'team1' : 'team2';
          const playerIdx1 = Math.floor(Math.random() * 2);
          const playerIdx2 = Math.floor(Math.random() * 2);

          const player1 = match1[team1Or2_m1][playerIdx1];
          const player2 = match2[team1Or2_m2][playerIdx2];

          // 교환 수행
          match1[team1Or2_m1][playerIdx1] = player2;
          match1[team1Or2_m1 === 'team1' ? 'team1_levels' : 'team2_levels']![playerIdx1] =
            getLevelScore(extractLevelFromName(player2));

          match2[team1Or2_m2][playerIdx2] = player1;
          match2[team1Or2_m2 === 'team1' ? 'team1_levels' : 'team2_levels']![playerIdx2] =
            getLevelScore(extractLevelFromName(player1));
        }
      }

      // 현재 최고 점수차이 계산
      const currentMaxDiff = calculateMaxScoreDifference(currentMatches);

      // 더 나은 배치면 유지
      if (currentMaxDiff < bestScore) {
        bestScore = currentMaxDiff;
        bestMatches = JSON.parse(JSON.stringify(currentMatches));
      }

      // 진행 상황 로깅 (매 1000회차마다)
      if ((iteration + 1) % 1000 === 0) {
        console.log(`🔄 최적화 진행중: ${iteration + 1}/${MAX_ITERATIONS}, 현재 최대 차이 = ${bestScore}점`);
      }

      // 300회 이상 동안 개선이 없으면 현재 상태가 최고이므로 종료
      if (iteration > 300 && calculateMaxScoreDifference(currentMatches) === calculateMaxScoreDifference(bestMatches)) {
        const stagnationCheck = matchDifferences.every((m: any) => m.diff <= 1);
        if (stagnationCheck) {
          console.log(`✅ 모든 경기가 1점 이하로 유지됨 (${iteration}회차에서 종료)`);
          break;
        }
      }
    }

    // 최종 결과 로깅
    const finalMaxDiff = calculateMaxScoreDifference(bestMatches);
    const finalAvgDiff = calculateAverageScoreDifference(bestMatches);
    console.log(`📊 최적화 완료: 최대 차이 = ${finalMaxDiff}점, 평균 차이 = ${finalAvgDiff.toFixed(1)}점`);
    console.log(`📈 개선율: ${initialScore}점 → ${finalMaxDiff}점`);

    return bestMatches;
  };

  // 평균 팀 점수 차이 계산
  const calculateAverageScoreDifference = (matches: Match[]): number => {
    let totalDifference = 0;

    matches.forEach(match => {
      const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
      const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
      totalDifference += Math.abs(team1Score - team2Score);
    });

    return matches.length > 0 ? totalDifference / matches.length : 0;
  };

  // 최대 팀 점수 차이 계산 (가장 큰 차이)
  const calculateMaxScoreDifference = (matches: Match[]): number => {
    let maxDifference = 0;

    matches.forEach(match => {
      const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
      const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
      maxDifference = Math.max(maxDifference, Math.abs(team1Score - team2Score));
    });

    return maxDifference;
  };

  const [loading, setLoading] = useState(true);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<TeamAssignment | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [generatedMatches, setGeneratedMatches] = useState<Match[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);
  const [matchesPerPlayer, setMatchesPerPlayer] = useState(0);
  const [tournamentDate, setTournamentDate] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [matchType, setMatchType] = useState<'level_based' | 'random' | 'mixed_doubles'>('random');
  const [numberOfCourts, setNumberOfCourts] = useState(4);
  const [levelMap, setLevelMap] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchTeamAssignments();
    fetchTournaments();
    fetchLevelMap();
  }, []);

  const formatSupabaseError = (error: any) => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return [
      error.message,
      error.code ? `code=${error.code}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
    ].filter(Boolean).join(' | ') || JSON.stringify(error);
  };

  // DB에서 레벨 정보 조회
  const fetchLevelMap = async () => {
    try {
      const { data, error } = await supabase
        .from('level_info')
        .select('code, name')
        .order('code', { ascending: true });

      if (error) {
        console.error('❌ 레벨 정보 조회 오류:', formatSupabaseError(error));
        // 조회 실패 시 기본값 사용
        setLevelMap({
          'e2': 1, 'e1': 2, 'd': 3, 'c': 4, 'b': 5, 'a1': 10, 'a2': 10
        });
        return;
      }

      // DB 코드 기준으로 점수 맵 생성
      const map: Record<string, number> = {};
      if (data && data.length > 0) {
        data.forEach((level: any) => {
          const code = (level.code || '').toLowerCase().trim();
          const scoreByCode: Record<string, number> = {
            e2: 1,
            e1: 2,
            d: 3,
            c: 4,
            b: 5,
            a: 6,
            a1: 10,
            a2: 10,
            n: 0,
          };
          const score = scoreByCode[code] ?? 1;
          map[code] = score;
        });
        console.log('✅ 레벨 정보 로드 (DB에서):', map);
      } else {
        console.warn('⚠️ level_info 테이블에 데이터가 없습니다. 기본값 사용');
        map['e2'] = 1;
        map['e1'] = 2;
        map['d'] = 3;
        map['c'] = 4;
        map['b'] = 5;
        map['a1'] = 10;
        map['a2'] = 10;
      }

      setLevelMap(map);
    } catch (error) {
      console.error('❌ 레벨 정보 로드 중 오류:', formatSupabaseError(error));
      // 에러 발생 시 기본값 사용
      setLevelMap({
        'e2': 1, 'e1': 2, 'd': 3, 'c': 4, 'b': 5, 'a1': 10, 'a2': 10
      });
    }
  };

  // 팀 구성 데이터 가져오기
  const fetchTeamAssignments = async () => {
    try {
      setLoading(true);
      console.log('📋 팀 구성 데이터 로드 시작...');
      
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .order('assignment_date', { ascending: false });

      if (error) {
        console.error('❌ 팀 구성 조회 오류:', error);
        throw error;
      }

      console.log('✅ 팀 구성 데이터 로드 완료:', data);
      console.log('📊 로드된 팀 구성 개수:', data?.length || 0);
      
      // 각 팀 구성의 상세 정보 출력
      data?.forEach((assignment, idx) => {
        const teams = getTeamsFromAssignment(assignment as TeamAssignment);
        console.log(`🏆 팀 구성 ${idx + 1}:`, {
          title: assignment.title,
          type: assignment.team_type,
          date: assignment.assignment_date,
          teams: teams.length,
          totalPlayers: teams.reduce((sum, t) => sum + t.players.length, 0)
        });
      });

      setTeamAssignments((data || []).map(normalizeTeamAssignment));
    } catch (error) {
      console.error('팀 구성 조회 중 오류:', error);
      setTeamAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  // 대회 목록 가져오기
  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      setTournaments(data || []);
    } catch (error) {
      console.error('대회 조회 오류:', error);
    }
  };

  // 팀 목록 추출
  const getTeamsFromAssignment = (assignment: TeamAssignment): { name: string; players: string[] }[] => {
    const teams: { name: string; players: string[] }[] = [];

    if (assignment.team_type === '2teams') {
      if (assignment.racket_team && assignment.racket_team.length > 0) {
        teams.push({ name: '라켓팀', players: assignment.racket_team });
      }
      if (assignment.shuttle_team && assignment.shuttle_team.length > 0) {
        teams.push({ name: '셔틀팀', players: assignment.shuttle_team });
      }
    } else if (assignment.team_type === '3teams') {
      if (assignment.team1 && assignment.team1.length > 0) {
        teams.push({ name: '팀1', players: assignment.team1 });
      }
      if (assignment.team2 && assignment.team2.length > 0) {
        teams.push({ name: '팀2', players: assignment.team2 });
      }
      if (assignment.team3 && assignment.team3.length > 0) {
        teams.push({ name: '팀3', players: assignment.team3 });
      }
    } else if (assignment.team_type === '4teams') {
      if (assignment.team1 && assignment.team1.length > 0) {
        teams.push({ name: '팀1', players: assignment.team1 });
      }
      if (assignment.team2 && assignment.team2.length > 0) {
        teams.push({ name: '팀2', players: assignment.team2 });
      }
      if (assignment.team3 && assignment.team3.length > 0) {
        teams.push({ name: '팀3', players: assignment.team3 });
      }
      if (assignment.team4 && assignment.team4.length > 0) {
        teams.push({ name: '팀4', players: assignment.team4 });
      }
    } else if (assignment.team_type === 'pairs' && assignment.pairs_data) {
      Object.entries(assignment.pairs_data).forEach(([pairName, players]) => {
        if (players && players.length > 0) {
          teams.push({ name: pairName, players });
        }
      });
    }

    return teams;
  };

  // 경기 일정 생성 (1인당 경기수 기반) - 4명씩 나누어 생성
  const generateMatches = (teams: { name: string; players: string[] }[], teamType: string, matchesPerPlayer: number) => {
    const matches: Match[] = [];
    let matchNumber = 1;

    // 모든 선수를 추출
    const allPlayers = teams.flatMap(team => team.players);
    
    if (allPlayers.length < 4) {
      console.warn('최소 4명의 선수가 필요합니다.');
      return [];
    }

    // 4명씩 그룹화하여 경기 생성
    const playerMatchCount: Record<string, number> = {};
    allPlayers.forEach(p => playerMatchCount[p] = 0);

    // 목표 경기 수: (선수 수 * 1인당 경기수) / 4
    const targetMatches = Math.ceil((allPlayers.length * matchesPerPlayer) / 4);
    let attempts = 0;
    const maxAttempts = 100;

    // 모든 선수가 최소 경기를 할 때까지 반복
    while (attempts < maxAttempts) {
      const needsMore = allPlayers.some(p => (playerMatchCount[p] || 0) < matchesPerPlayer);
      if (!needsMore) break;

      // 선수 목록을 섞고 4명씩 그룹화
      const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffled.length - 3; i += 4) {
        const group = shuffled.slice(i, i + 4);
        if (group.length !== 4) continue;

        // 앞 2명 vs 뒤 2명으로 팀 구성
        const team1 = [group[0], group[1]];
        const team2 = [group[2], group[3]];

        const courtNumber = ((matchNumber - 1) % 4) + 1;
        matches.push({
          tournament_id: '',
          round: 1,
          match_number: matchNumber++,
          team1,
          team2,
          court: `Court ${courtNumber}`,
          status: 'pending'
        });

        // 경기 수 업데이트
        team1.forEach(p => playerMatchCount[p]++);
        team2.forEach(p => playerMatchCount[p]++);
      }

      attempts++;
    }

    // 0회 경기한 선수 처리 (강제 포함)
    let zeroAttempts = 0;
    const maxZeroAttempts = 50;

    while (zeroAttempts < maxZeroAttempts) {
      const zeroPlayers = allPlayers.filter(p => (playerMatchCount[p] || 0) === 0);
      if (zeroPlayers.length === 0) break;

      const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
      for (let i = 0; i <= shuffled.length - 4; i += 4) {
        const group = shuffled.slice(i, i + 4);
        if (group.length !== 4) continue;

        // 0회 선수가 포함되었는지 확인
        const hasZeroPlayer = group.some(p => (playerMatchCount[p] || 0) === 0);
        if (!hasZeroPlayer) continue;

        const team1 = [group[0], group[1]];
        const team2 = [group[2], group[3]];

        const courtNumber = ((matchNumber - 1) % 4) + 1;
        matches.push({
          tournament_id: '',
          round: 1,
          match_number: matchNumber++,
          team1,
          team2,
          court: `Court ${courtNumber}`,
          status: 'pending'
        });

        team1.forEach(p => playerMatchCount[p]++);
        team2.forEach(p => playerMatchCount[p]++);
      }

      zeroAttempts++;
    }

    return matches;
  };

  // 대회 생성 및 경기 저장
  const createTournament = async () => {
    if (!selectedAssignment) {
      alert('팀 구성을 선택해주세요.');
      return;
    }

    try {
      const teams = getTeamsFromAssignment(selectedAssignment);
      if (teams.length === 0) {
        alert('선택한 구성에 팀이 없습니다.');
        return;
      }

      const matches = generateMatches(teams, selectedAssignment.team_type, matchesPerPlayer);
      
      // 경기 타입에 따른 대회 제목 생성
      const matchTypeLabel = matchType === 'level_based' ? '레벨별' : matchType === 'mixed_doubles' ? '혼복' : '랜덤';
      const tournamentTitle = `라뚱 대회 ${tournamentDate} ${roundNumber}회차 (${matchTypeLabel})`;
      
      // 대회 정보 저장
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert([
          {
            title: tournamentTitle,
            tournament_date: tournamentDate,
            round_number: roundNumber,
            match_type: matchType,
            team_assignment_id: selectedAssignment.id,
            team_type: selectedAssignment.team_type,
            total_teams: teams.length,
            matches_per_player: matchesPerPlayer,
          }
        ])
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      // 경기 일정 저장
      const matchesToSave = matches.map(m => ({
        ...m,
        tournament_id: tournament.id
      }));

      const { error: matchesError } = await supabase
        .from('tournament_matches')
        .insert(matchesToSave);

      if (matchesError) throw matchesError;

      alert('대회가 생성되었습니다!');
      setShowCreateModal(false);
      setSelectedAssignment(null);
      fetchTournaments();
    } catch (error: any) {
      console.error('대회 생성 오류:', error);
      if (error.code === '42P01') {
        alert('tournaments 또는 tournament_matches 테이블이 없습니다. 데이터베이스 스키마를 확인해주세요.');
      } else {
        alert('대회 생성 중 오류가 발생했습니다: ' + error.message);
      }
    }
  };

  // 경기 미리보기
  const handlePreviewMatches = (assignment: TeamAssignment) => {
    setSelectedAssignment(assignment);
    // 팀 구성의 날짜를 자동으로 설정
    setTournamentDate(assignment.assignment_date || '');
    setMatchesPerPlayer(0);
    setRoundNumber(1);
    setMatchType('random');
    setNumberOfCourts(4); // 기본 코트 개수
    setGeneratedMatches([]);
    setShowCreateModal(true);
  };

  // 경기 재생성 (값 변경 후) - match-utils 함수 사용 + matchType 지원
  const handleRegenerateMatches = async () => {
    if (!selectedAssignment) return;
    if (matchesPerPlayer <= 0) {
      alert('1인당 경기수를 선택해주세요.');
      return;
    }

    try {
      // 선수 데이터 추출
      const teams = getTeamsFromAssignment(selectedAssignment);
      const allPlayerNames = teams.flatMap(team => team.players);

      if (allPlayerNames.length < 4) {
        alert('최소 4명의 선수가 필요합니다.');
        return;
      }

      // 점수 기반 정렬: 선수들의 점수를 계산하여 내림차순 정렬
      const playersWithScores = allPlayerNames.map(name => ({
        name,
        score: getPlayerScore(name)
      })).sort((a, b) => b.score - a.score);

      console.log('📈 선수 점수 순위:');
      playersWithScores.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.name}: ${p.score}점`);
      });

      // Player 형태로 변환 (match-utils 호환) - 점수 정렬 순서 유지
      const playersForMatch = playersWithScores.map((p, idx) => {
        const extractedLevel = extractLevelFromName(p.name);
        return {
          id: `player-${Date.now()}-${idx}`,
          name: p.name,
          skill_level: extractedLevel,  // 실제 레벨 사용
          skill_label: `${extractedLevel.toUpperCase()} 레벨`,
          gender: '',
          skill_code: ''
        };
      });

      // matchType에 따라 적절한 함수 선택
      let importedFunc: any;
      
      if (matchType === 'level_based') {
        const module = await import('@/utils/match-utils');
        importedFunc = module.createBalancedDoublesMatches;
      } else if (matchType === 'random') {
        const module = await import('@/utils/match-utils');
        importedFunc = module.createRandomBalancedDoublesMatches;
      } else if (matchType === 'mixed_doubles') {
        const module = await import('@/utils/match-utils');
        importedFunc = module.createMixedAndSameSexDoublesMatches;
      } else {
        const module = await import('@/utils/match-utils');
        importedFunc = module.createBalancedDoublesMatches;
      }

      // 목표 경기 수 계산
      const targetMatches = Math.ceil((playersForMatch.length * matchesPerPlayer) / 4);

      // 재시도 로직: 최대 4회 시도하며 코트 수를 점진적으로 증가
      let utilitiesMatches: any[] = [];
      let attempts = 0;
      let maxCourts = numberOfCourts > 0 ? numberOfCourts : Math.max(4, Math.ceil(playersForMatch.length / 4));

      while (attempts < 4) {
        utilitiesMatches = importedFunc(playersForMatch, maxCourts, matchesPerPlayer)
          .map((m: any, i: number) => ({ ...m, court: i + 1 }));

        // 경기 수 확인
        const playerMatchCount: Record<string, number> = {};
        playersForMatch.forEach(p => playerMatchCount[p.id] = 0);
        utilitiesMatches.forEach(match => {
          playerMatchCount[match.team1.player1.id] = (playerMatchCount[match.team1.player1.id] || 0) + 1;
          playerMatchCount[match.team1.player2.id] = (playerMatchCount[match.team1.player2.id] || 0) + 1;
          playerMatchCount[match.team2.player1.id] = (playerMatchCount[match.team2.player1.id] || 0) + 1;
          playerMatchCount[match.team2.player2.id] = (playerMatchCount[match.team2.player2.id] || 0) + 1;
        });

        const missing = playersForMatch.filter(p => (playerMatchCount[p.id] || 0) < matchesPerPlayer);

        // 조건: 목표 경기 이상 + 모든 선수가 최소 경기 달성
        if (utilitiesMatches.length >= targetMatches && missing.length === 0) {
          break;
        }

        attempts += 1;
        maxCourts = Math.min(playersForMatch.length, maxCourts + 2);
      }

      // 최종 검증: 모든 선수가 포함되었는지 확인
      const finalPlayerMatchCount: Record<string, number> = {};
      playersForMatch.forEach(p => finalPlayerMatchCount[p.id] = 0);
      utilitiesMatches.forEach(match => {
        finalPlayerMatchCount[match.team1.player1.id] = (finalPlayerMatchCount[match.team1.player1.id] || 0) + 1;
        finalPlayerMatchCount[match.team1.player2.id] = (finalPlayerMatchCount[match.team1.player2.id] || 0) + 1;
        finalPlayerMatchCount[match.team2.player1.id] = (finalPlayerMatchCount[match.team2.player1.id] || 0) + 1;
        finalPlayerMatchCount[match.team2.player2.id] = (finalPlayerMatchCount[match.team2.player2.id] || 0) + 1;
      });
      
      const stillMissing = playersForMatch.filter(p => (finalPlayerMatchCount[p.id] || 0) < matchesPerPlayer);
      
      if (stillMissing.length > 0) {
        const missingNames = stillMissing.map(p => p.name).join(', ');
        console.warn(`⚠️ ${stillMissing.length}명의 선수가 목표 경기수에 도달하지 못했습니다:`, missingNames);
        console.warn(`생성된 경기: ${utilitiesMatches.length}개, 목표: ${targetMatches}개`);
      }

      // match-utils의 Match를 tournament-matches의 Match로 변환
      const convertedMatches: Match[] = utilitiesMatches.map((m: any, idx: number) => {
        // 선수 이름에서 레벨 추출 후 점수로 변환
        const team1Levels = [
          getLevelScore(extractLevelFromName(m.team1.player1.name)),
          getLevelScore(extractLevelFromName(m.team1.player2.name))
        ];
        const team2Levels = [
          getLevelScore(extractLevelFromName(m.team2.player1.name)),
          getLevelScore(extractLevelFromName(m.team2.player2.name))
        ];

        return {
          tournament_id: '',
          round: roundNumber,
          match_number: idx + 1,
          team1: [m.team1.player1.name, m.team1.player2.name],
          team2: [m.team2.player1.name, m.team2.player2.name],
          team1_levels: team1Levels,
          team2_levels: team2Levels,
          court: `Court ${m.court || ((idx % 4) + 1)}`,
          status: 'pending' as const
        };
      });

      // 🎯 createBalancedDoublesMatches가 이미 팀 점수 균등을 고려하므로
      // 추가 최적화 없이 결과 사용 (players-today 방식과 동일)
      const optimizedMatches = convertedMatches;
      
      // 최종 점수 차이 분석
      const avgDiffAfter = calculateAverageScoreDifference(optimizedMatches);
      console.log(`✅ 경기 생성 완료: 평균 점수차이 ${avgDiffAfter.toFixed(1)}점`);

      // 팀 점수 기반 균등 배정 검증 및 로깅
      const teamScores: Record<string, { players: string[], totalScore: number }> = {};
      optimizedMatches.forEach((match) => {
        const team1Key = `Team1-${match.team1.join(',')}`;
        const team2Key = `Team2-${match.team2.join(',')}`;
        
        if (!teamScores[team1Key]) {
          const score = (match.team1_levels || []).reduce((sum, s) => sum + s, 0);
          teamScores[team1Key] = { players: match.team1, totalScore: score };
        }
        if (!teamScores[team2Key]) {
          const score = (match.team2_levels || []).reduce((sum, s) => sum + s, 0);
          teamScores[team2Key] = { players: match.team2, totalScore: score };
        }
      });

      // 팀 점수 분포 분석
      const allTeamScores = Object.values(teamScores).map(t => t.totalScore);
      const maxScore = Math.max(...allTeamScores);
      const minScore = Math.min(...allTeamScores);
      const avgScore = allTeamScores.reduce((a, b) => a + b, 0) / allTeamScores.length;

      // 경기별 점수 차이 분석
      const matchScoreDifferences = optimizedMatches.map((match, idx) => {
        const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
        const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
        return {
          matchNum: idx + 1,
          team1: team1Score,
          team2: team2Score,
          diff: Math.abs(team1Score - team2Score)
        };
      });

      const avgMatchDiff = calculateAverageScoreDifference(optimizedMatches);
      const maxMatchDiff = calculateMaxScoreDifference(optimizedMatches);
      const badMatchesCount = matchScoreDifferences.filter((m: any) => m.diff >= 2).length;
      const perfectMatchCount = matchScoreDifferences.filter((m: any) => m.diff === 0).length;

      // 전체 참가자 통계 출력
      console.log('📊 경기 생성 완료:');
      console.log(`- 타입: ${matchType}`);
      console.log(`- 총 선수: ${playersForMatch.length}명`);
      console.log(`- 생성된 경기: ${optimizedMatches.length}개`);
      console.log(`- 목표 경기수: ${targetMatches}개`);
      console.log(`- 1인당 목표: ${matchesPerPlayer}경기`);
      
      // 경기 수 분포 출력
      const distribution: Record<number, number> = {};
      Object.values(finalPlayerMatchCount).forEach((count: number) => {
        distribution[count] = (distribution[count] || 0) + 1;
      });
      console.log('- 경기 수 분포:', distribution);
      
      // 팀 점수 분포 출력
      console.log('📈 팀 점수 분석:');
      console.log(`- 평균 팀 점수: ${avgScore.toFixed(1)}점`);
      console.log(`- 최고 팀 점수: ${maxScore}점`);
      console.log(`- 최저 팀 점수: ${minScore}점`);
      console.log(`- 팀 점수 범위: ${(maxScore - minScore).toFixed(1)}점`);
      console.log(`- 점수 차이 비율: ${((maxScore - minScore) / avgScore * 100).toFixed(1)}%`);

      // 경기별 점수 차이 분석 출력
      console.log('⚖️ 경기별 점수 차이 분석:');
      console.log(`- 평균 경기 점수차: ${avgMatchDiff.toFixed(1)}점`);
      console.log(`- 최대 경기 점수차: ${maxMatchDiff}점`);
      console.log(`- 차이 0점 경기: ${perfectMatchCount}개`);
      console.log(`- 차이 1점 경기: ${matchScoreDifferences.filter((m: any) => m.diff === 1).length}개`);
      console.log(`- 차이 2점 이상 경기: ${badMatchesCount}개 ${badMatchesCount > 0 ? '⚠️' : '✅'}`);
      
      if (badMatchesCount > 0) {
        const badMatches = matchScoreDifferences.filter((m: any) => m.diff >= 2);
        console.warn(`⚠️ 경기 점수 차이 2점 이상인 경기들:`, badMatches);
      }

      setGeneratedMatches(optimizedMatches);
    } catch (error) {
      console.error('경기 생성 오류:', error);
      alert('경기 생성 중 오류가 발생했습니다.');
    }
  };

  // 경기 관리 - 대진표 페이지로 이동
  const handleManageMatches = async (tournament: Tournament) => {
    // 대진표 페이지로 이동하면서 tournament ID를 전달
    router.push(`/admin/tournament-bracket?tournament=${tournament.id}`);
  };

  // 경기 삭제
  const deleteTournament = async (tournamentId: string) => {
    if (!confirm('이 대회를 삭제하시겠습니까? 모든 경기 정보가 함께 삭제됩니다.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);

      if (error) throw error;

      alert('대회가 삭제되었습니다.');
      fetchTournaments();
    } catch (error) {
      console.error('대회 삭제 오류:', error);
      alert('대회 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">🏆 대회 경기 관리</h1>
        <p className="text-gray-600 mt-2">팀 구성을 선택하여 대회 경기 일정을 생성하고 관리합니다</p>
      </div>

      {/* 팀 구성 선택 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📋 팀 구성 선택</h2>
          <button
            onClick={() => fetchTeamAssignments()}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>🔄</span>
            <span>새로고침</span>
          </button>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">데이터 로딩 중...</span>
          </div>
        ) : teamAssignments.length === 0 ? (
          <div className="text-center py-8 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
            <p className="mb-3 font-semibold text-yellow-900 text-lg">⚠️ 등록된 팀 구성이 없습니다</p>
            <p className="text-sm text-yellow-800 mb-4">먼저 "팀 관리" 메뉴에서 팀을 구성해주세요.</p>
            <details className="text-left inline-block text-sm text-gray-700 bg-white p-3 rounded border border-gray-300">
              <summary className="cursor-pointer font-semibold mb-2">📱 확인 사항</summary>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>/team-management 페이지에서 팀 구성 후 저장</li>
                <li>Supabase team_assignments 테이블 데이터 확인</li>
                <li>브라우저 콘솔(F12)에서 로그 확인</li>
              </ul>
            </details>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamAssignments.map((assignment) => {
              const teams = getTeamsFromAssignment(assignment);
              const teamTypeLabel = {
                '2teams': '2팀전',
                '3teams': '3팀전',
                '4teams': '4팀전',
                'pairs': '페어전'
              }[assignment.team_type] || assignment.team_type;

              return (
                <div
                  key={assignment.id}
                  className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{assignment.title}</h3>
                      <p className="text-sm text-gray-600">{assignment.assignment_date}</p>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                      {teamTypeLabel}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-3">
                    <div>👥 총 {teams.length}팀</div>
                    <div>🎯 예상 경기: {matchesPerPlayer > 0 ? Math.ceil((teams.reduce((sum, t) => sum + t.players.length, 0) * matchesPerPlayer) / 4) : 0}경기</div>
                  </div>

                  <button
                    onClick={() => handlePreviewMatches(assignment)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    대회 생성
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 대회 생성 폼 (모달 제거, 페이지에 표시) */}
      {showCreateModal && selectedAssignment && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-blue-300">
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">대회 생성</h2>
            <p className="text-gray-600 mt-1">{selectedAssignment.title}</p>
          </div>

          <div>
              {/* 대회 정보 입력 */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-4 text-blue-900">📋 대회 정보</h3>
                
                {/* 경기 타입 선택 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    경기 타입
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'level_based' 
                        ? 'border-blue-500 bg-blue-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="level_based"
                        checked={matchType === 'level_based'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">🎯 레벨별</div>
                        <div className="text-xs text-gray-600">실력별 그룹 매칭</div>
                      </div>
                    </label>
                    
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'random' 
                        ? 'border-green-500 bg-green-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="random"
                        checked={matchType === 'random'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">🎲 랜덤</div>
                        <div className="text-xs text-gray-600">무작위 매칭</div>
                      </div>
                    </label>
                    
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'mixed_doubles' 
                        ? 'border-pink-500 bg-pink-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="mixed_doubles"
                        checked={matchType === 'mixed_doubles'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">💑 혼복</div>
                        <div className="text-xs text-gray-600">남녀 혼합 복식</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 안내 메시지 */}
                {matchesPerPlayer === 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                      ⚠️ <strong>1인당 경기수</strong>를 입력하고 "경기 생성/재생성" 버튼을 클릭하세요. (대회 날짜는 자동 설정)
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg text-sm text-blue-800">
                      <div className="font-semibold mb-2">📊 레벨별 점수 시스템 (DB 참고)</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                        {Object.entries(levelMap)
                          .sort((a, b) => a[1] - b[1])
                          .map(([code, score]) => (
                            <div key={code}>
                              {code.toUpperCase()}: {score}점
                            </div>
                          ))}
                      </div>
                      <div className="mt-2">💡 팀 점수 = 각 선수의 레벨 점수 합계 (균형잡힌 경기 배정에 사용)</div>
                    </div>
                    <div className="p-3 bg-green-50 border border-green-300 rounded-lg text-sm text-green-800">
                      <div className="font-semibold mb-1">⚖️ 점수 기반 균등 배정</div>
                      <div className="text-xs">선수 점수(레벨 기반)를 계산하여 각 팀의 총 점수가 비슷하도록 경기를 배정합니다. team-management 페이지와 동일한 알고리즘 적용.</div>
                    </div>
                  </div>
                )}

                {/* 회차, 코트, 인당경기수 선택 버튼 */}
                <div className="flex gap-6 items-center mt-4">
                  {/* 회차 선택 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">회차:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setRoundNumber(num)}
                          className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                            roundNumber === num
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 코트 개수 선택 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">코트:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setNumberOfCourts(num)}
                          className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                            numberOfCourts === num
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 1인당 경기수 선택 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">경기수:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setMatchesPerPlayer(num)}
                          className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                            matchesPerPlayer === num
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-blue-800">
                  💡 대회명: <strong>라뚱 대회 {tournamentDate} {roundNumber}회차 ({matchType === 'level_based' ? '레벨별' : matchType === 'mixed_doubles' ? '혼복' : '랜덤'})</strong>
                </div>
              </div>

              {/* 팀 목록 */}
              {matchesPerPlayer > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">참가 팀</h3>
                <div className="grid grid-cols-1 gap-2">
                  {getTeamsFromAssignment(selectedAssignment).map((team, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-2">
                      <div className="font-semibold text-gray-900 text-sm mb-1">{team.name}</div>
                      <div className="text-xs text-gray-600">
                        {team.players.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* 경기 생성/재생성 버튼 */}
              <div className="mb-6">
                <div className="text-xs text-gray-500 mb-2 p-2 bg-gray-100 rounded">
                  상태: 경기수={matchesPerPlayer}, 날짜={tournamentDate || '(미설정)'}, 생성된 경기={generatedMatches.length}
                </div>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleRegenerateMatches}
                    disabled={matchesPerPlayer === 0}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      matchesPerPlayer === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    🔄 경기 생성/재생성
                  </button>
                </div>
              </div>

              {/* 경기 일정 */}
              {matchesPerPlayer > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">생성될 경기 ({generatedMatches.length}경기)</h3>
                {generatedMatches.length === 0 ? (
                  <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-yellow-800">위의 "경기 생성/재생성" 버튼을 클릭하여 경기를 생성해주세요.</p>
                  </div>
                ) : (
                <>
                  {/* 팀 점수 통계 요약 */}
                  {generatedMatches.length > 0 && (() => {
                    const allTeamScores: number[] = [];
                    generatedMatches.forEach(match => {
                      const team1Score = (match.team1_levels || []).reduce((sum, l) => sum + l, 0);
                      const team2Score = (match.team2_levels || []).reduce((sum, l) => sum + l, 0);
                      allTeamScores.push(team1Score, team2Score);
                    });
                    
                    const avgScore = allTeamScores.reduce((a, b) => a + b, 0) / allTeamScores.length;
                    const maxScore = Math.max(...allTeamScores);
                    const minScore = Math.min(...allTeamScores);
                    const scoreDiff = maxScore - minScore;
                    const scoreDiffPercent = (scoreDiff / avgScore * 100).toFixed(1);

                    // 차이 2점 이상인 경기 찾기
                    const badMatches: number[] = [];
                    generatedMatches.forEach((match, idx) => {
                      const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
                      const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
                      const diff = Math.abs(team1Score - team2Score);
                      if (diff >= 2) {
                        badMatches.push(idx + 1);
                      }
                    });

                    return (
                      <div className="mb-4 p-3 bg-purple-50 border border-purple-300 rounded-lg text-sm text-purple-900">
                        <div className="font-semibold mb-2">⚖️ 팀 점수 균등 배정 분석</div>
                        <div className="text-xs space-x-8">
                          {(() => {
                            // 점수 차이별 경기 개수 계산
                            const diffDistribution: Record<number, number> = {};
                            generatedMatches.forEach((match) => {
                              const team1Score = (match.team1_levels || []).reduce((sum: number, l: number) => sum + l, 0);
                              const team2Score = (match.team2_levels || []).reduce((sum: number, l: number) => sum + l, 0);
                              const diff = Math.abs(team1Score - team2Score);
                              diffDistribution[diff] = (diffDistribution[diff] || 0) + 1;
                            });

                            // 점수 분포를 색상별로 구분하여 표시
                            return Object.keys(diffDistribution)
                              .sort((a, b) => parseInt(a) - parseInt(b))
                              .map(diff => {
                                const count = diffDistribution[parseInt(diff)];
                                const diffNum = parseInt(diff);
                                let statusIcon = '';
                                let colorClass = '';
                                
                                if (diffNum === 0) {
                                  statusIcon = '✅';
                                  colorClass = 'text-green-600 font-semibold';
                                } else if (diffNum === 1) {
                                  statusIcon = '🟡';
                                  colorClass = 'text-yellow-600 font-semibold';
                                } else if (diffNum === 2) {
                                  statusIcon = '⚠️';
                                  colorClass = 'text-orange-600 font-semibold';
                                } else {
                                  statusIcon = '🔴';
                                  colorClass = 'text-red-600 font-semibold';
                                }
                                
                                return (
                                  <span key={diff} className={colorClass}>
                                    {statusIcon} {diff}점: {count}경기
                                  </span>
                                );
                              });
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full border-collapse border border-gray-300 bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">경기</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">코트</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">팀1</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">팀1 점수</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">팀2</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">팀2 점수</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold">차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedMatches.map((match, idx) => {
                        const team1Score = (match.team1_levels || []).reduce((sum, l) => sum + l, 0);
                        const team2Score = (match.team2_levels || []).reduce((sum, l) => sum + l, 0);
                        const scoreDifference = Math.abs(team1Score - team2Score);
                        const differenceColor = 
                          scoreDifference === 0 ? 'bg-green-100 text-green-800' :
                          scoreDifference <= 1 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-orange-100 text-orange-800';
                        return (
                          <tr key={idx} className="hover:bg-blue-50">
                            <td className="border border-gray-300 px-3 py-2 text-center font-medium">{match.match_number}</td>
                            <td className="border border-gray-300 px-3 py-2 text-center text-xs">{match.court}</td>
                            <td className="border border-gray-300 px-3 py-2 text-left text-xs">
                              <div className="font-medium text-blue-700">
                                {match.team1.map((name, i) => {
                                  const playerName = getPlayerName(name);
                                  const level = extractLevelFromName(name);
                                  return `${playerName}(${level.toUpperCase()})`;
                                }).join(', ')}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-center text-xs">
                              <span className="inline-block px-2 py-1 bg-blue-100 rounded font-semibold text-blue-800">{team1Score}</span>
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-left text-xs">
                              <div className="font-medium text-red-700">
                                {match.team2.map((name, i) => {
                                  const playerName = getPlayerName(name);
                                  const level = extractLevelFromName(name);
                                  return `${playerName}(${level.toUpperCase()})`;
                                }).join(', ')}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-center text-xs">
                              <span className="inline-block px-2 py-1 bg-red-100 rounded font-semibold text-red-800">{team2Score}</span>
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-center text-xs">
                              <span className={`inline-block px-2 py-1 rounded font-semibold ${differenceColor}`}>
                                {scoreDifference}점
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
                )}
              </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                  }}
                  className="px-6 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={createTournament}
                  disabled={generatedMatches.length === 0}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    generatedMatches.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  대회 생성
                </button>
              </div>
            </div>
        </div>
      )}

      {/* 생성된 대회 목록 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📊 생성된 대회</h2>
        
        {tournaments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">🏆</div>
            <p>아직 생성된 대회가 없습니다.</p>
            <p className="text-sm mt-2">위에서 팀 구성을 선택하여 대회를 생성하세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900">{tournament.title}</h3>
                    <div className="text-sm text-gray-600 mt-1 space-y-1">
                      <div>📅 {new Date(tournament.created_at).toLocaleDateString('ko-KR')}</div>
                      <div>👥 {tournament.total_teams}팀 참가</div>
                      <div>🎯 {tournament.team_type}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleManageMatches(tournament)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      경기 관리
                    </button>
                    <button
                      onClick={() => deleteTournament(tournament.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 사용 방법</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. 팀 관리 메뉴에서 팀을 구성합니다</li>
          <li>2. 위 목록에서 원하는 팀 구성을 선택하고 "대회 생성" 버튼을 클릭합니다</li>
          <li>3. 생성될 경기를 미리보기로 확인한 후 대회를 생성합니다</li>
          <li>4. 생성된 대회의 "경기 관리" 버튼을 클릭하면 대진표 페이지로 이동합니다</li>
          <li>5. 대진표에서 경기 결과를 입력하고 관리할 수 있습니다</li>
        </ul>
      </div>
    </div>
  );
}
