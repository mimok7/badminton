'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { getKoreaDate } from '@/lib/date';
import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

interface Match {
  id?: string;
  tournament_id?: string;
  round: number;
  match_number: number;
  team1: string[];
  team2: string[];
  court: string;
  scheduled_time?: string | null;
  status: string;
  score_team1?: number | null;
  score_team2?: number | null;
  winner?: 'team1' | 'team2' | 'draw' | null;
  referee_id?: string | null;
  referee_name?: string | null;
}

interface Tournament {
  id: string;
  title: string;
  tournament_date: string;
  round_number: number;
  team_assignment_id?: string;
  match_type: string;
  team_type: string;
  total_teams: number;
  matches_per_player: number;
  created_at: string;
}

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
  pair_groups?: PairGroupDefinition[];
}

type PairGroupDefinition = {
  groupName: string;
  pairNames: string[];
};

type ScoreDraft = {
  score1: string;
  score2: string;
};

type AdminTournamentTab = 'overview' | 'results' | string;
type UserTournamentTab = 'bracket' | 'results' | string;

type TournamentBracketViewProps = {
  adminMode?: boolean;
};

type TournamentMetrics = {
  matchCount: number;
  teamCount: number;
  playerCount: number;
  roundCount: number;
};

type TeamAssignmentMap = Record<string, TeamAssignment | null>;

type MatchGroupSection = {
  groupName: string;
  matches: Match[];
};

function extractPairGroupLabel(court: string) {
  const match = court.trim().match(/^\[(.+?)\]\s*Court\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

function formatCourtLabel(court: string) {
  const trimmedCourt = court.trim();

  if (!trimmedCourt) {
    return '코트 미정';
  }

  const groupedCourtMatch = trimmedCourt.match(/^\[(.+?)\]\s*Court\s*(.+)$/i);
  if (groupedCourtMatch?.[2]) {
    return `코트 ${groupedCourtMatch[2].trim()}`;
  }

  const courtNumberMatch = trimmedCourt.match(/^Court\s*(.+)$/i);
  if (courtNumberMatch?.[1]) {
    return `코트 ${courtNumberMatch[1].trim()}`;
  }

  if (trimmedCourt.startsWith('코트')) {
    return trimmedCourt;
  }

  return `코트 ${trimmedCourt}`;
}

function formatTournamentTitle(title: string) {
  return title.replace(/^라뚱\s*대회|^대회경기/u, '대회 경기').replace(/\s*\([^)]*\)\s*$/, '');
}

function getMatchTypeLabel(matchType: string) {
  if (matchType === 'level_based') return '레벨';
  if (matchType === 'mixed_doubles') return '혼복';
  return '랜덤';
}

function getTournamentDisplayRound(tournament?: Tournament | null) {
  return tournament?.round_number || 1;
}

function getDisplayMatchNumber(match: Match, fallbackIndex: number) {
  return match.match_number > 0 ? match.match_number : fallbackIndex + 1;
}

function getResolvedWinner(match: Match): Match['winner'] {
  if (typeof match.score_team1 === 'number' && typeof match.score_team2 === 'number') {
    if (match.score_team1 > match.score_team2) return 'team1';
    if (match.score_team2 > match.score_team1) return 'team2';
    return 'draw';
  }

  return match.winner ?? null;
}

function isResultMatch(match: Match) {
  return typeof match.score_team1 === 'number' && typeof match.score_team2 === 'number';
}

function getTeamKey(players: string[]) {
  return [...players].map((player) => player.trim()).sort((left, right) => left.localeCompare(right, 'ko-KR')).join(' / ');
}

function getAssignmentTeamGroups(teamAssignment: TeamAssignment) {
  if (teamAssignment.team_type === 'pairs') {
    const pairMap = new Map(Object.entries(teamAssignment.pairs_data || {}));

    if (teamAssignment.pair_groups && teamAssignment.pair_groups.length > 0) {
      return teamAssignment.pair_groups
        .map((group) => ({
          label: group.groupName,
          players: group.pairNames.flatMap((pairName) => pairMap.get(pairName) || []),
        }))
        .filter((group) => group.players.length > 0);
    }

    return Object.entries(teamAssignment.pairs_data || {})
      .map(([label, players]) => ({ label, players }))
      .filter((group) => group.players.length > 0);
  }

  if (teamAssignment.team_type === '2teams') {
    return [
      { label: '라켓팀', players: (teamAssignment.racket_team && teamAssignment.racket_team.length > 0 ? teamAssignment.racket_team : teamAssignment.team1) || [] },
      { label: '셔틀팀', players: (teamAssignment.shuttle_team && teamAssignment.shuttle_team.length > 0 ? teamAssignment.shuttle_team : teamAssignment.team2) || [] },
    ].filter((group) => group.players.length > 0);
  }

  return [
    { label: '1팀', players: teamAssignment.team1 || [] },
    { label: '2팀', players: teamAssignment.team2 || [] },
    { label: '3팀', players: teamAssignment.team3 || [] },
    { label: '4팀', players: teamAssignment.team4 || [] },
  ].filter((group) => group.players.length > 0);
}

function toStringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toPairsRecord(value: Json | null | undefined): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const rawPairs = (value as { pairs?: Json | null }).pairs;
  const source =
    rawPairs && typeof rawPairs === 'object' && !Array.isArray(rawPairs)
      ? rawPairs
      : value;

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => /^pair\d+$/i.test(key))
      .map(([key, raw]) => [
        key,
        Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [],
      ])
  );
}

function toPairGroups(value: Json | null | undefined): PairGroupDefinition[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  const rawGroups = (value as { groups?: Json | null }).groups;
  if (!Array.isArray(rawGroups)) return [];

  return rawGroups
    .map((group) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        return null;
      }

      const groupName = String((group as { groupName?: unknown }).groupName || '').trim();
      const pairNames = Array.isArray((group as { pairNames?: unknown }).pairNames)
        ? (group as { pairNames: unknown[] }).pairNames
            .filter((item): item is string => typeof item === 'string')
            .map((pairName) => pairName.trim())
            .filter(Boolean)
        : [];

      if (!groupName || pairNames.length === 0) {
        return null;
      }

      return { groupName, pairNames };
    })
    .filter((group): group is PairGroupDefinition => Boolean(group));
}

function mapTeamAssignmentRow(team: {
  id: string;
  round_number: number;
  assignment_date: string;
  title: string;
  team_type: string;
  racket_team?: Json | null;
  shuttle_team?: Json | null;
  team1?: Json | null;
  team2?: Json | null;
  team3?: Json | null;
  team4?: Json | null;
  pairs_data?: Json | null;
}): TeamAssignment {
  return {
    id: team.id,
    round_number: team.round_number,
    assignment_date: team.assignment_date,
    title: team.title,
    team_type: (team.team_type as TeamAssignment['team_type']) || '2teams',
    racket_team: toStringArray(team.racket_team),
    shuttle_team: toStringArray(team.shuttle_team),
    team1: toStringArray(team.team1),
    team2: toStringArray(team.team2),
    team3: toStringArray(team.team3),
    team4: toStringArray(team.team4),
    pairs_data: toPairsRecord(team.pairs_data),
    pair_groups: toPairGroups(team.pairs_data),
  };
}

function mapTeamAssignmentMap(value: unknown): TeamAssignmentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([tournamentId, teamAssignment]) => {
      if (!teamAssignment || typeof teamAssignment !== 'object' || Array.isArray(teamAssignment)) {
        return [tournamentId, null];
      }

      return [tournamentId, mapTeamAssignmentRow(teamAssignment as Parameters<typeof mapTeamAssignmentRow>[0])];
    })
  );
}

function groupMatchesByPairGroup(matches: Match[]): MatchGroupSection[] {
  const grouped = new Map<string, Match[]>();

  matches.forEach((match) => {
    const groupName = extractPairGroupLabel(match.court) || '기타 그룹';
    const current = grouped.get(groupName) || [];
    current.push(match);
    grouped.set(groupName, current);
  });

  return Array.from(grouped.entries()).map(([groupName, groupedMatches]) => ({
    groupName,
    matches: groupedMatches,
  }));
}

function getHeadToHeadWinner(teamAKey: string, teamBKey: string, matches: Match[]): number {
  let teamAWins = 0;
  let teamBWins = 0;

  matches.forEach((match) => {
    if (!isResultMatch(match)) return;

    const t1Key = getTeamKey(match.team1);
    const t2Key = getTeamKey(match.team2);

    const isT1A = t1Key === teamAKey;
    const isT2B = t2Key === teamBKey;
    const isT1B = t1Key === teamBKey;
    const isT2A = t2Key === teamAKey;

    if ((isT1A && isT2B) || (isT1B && isT2A)) {
      const winner = getResolvedWinner(match);
      if (winner === 'team1') {
        if (isT1A) teamAWins += 1;
        else teamBWins += 1;
      } else if (winner === 'team2') {
        if (isT2A) teamAWins += 1;
        else teamBWins += 1;
      }
    }
  });

  if (teamAWins > teamBWins) return -1; // teamA가 이김 -> left가 상위
  if (teamBWins > teamAWins) return 1;  // teamB가 이김 -> right가 상위
  return 0; // 동률
}

function getPairStats(
  sourceMatches: Match[],
  assignmentsByTournament: TeamAssignmentMap,
  fallbackTeamAssignment?: TeamAssignment | null
) {
  const pairStats: Record<
    string,
    {
      groupName: string;
      matches: number;
      wins: number;
      losses: number;
      draws: number;
      pointsWon: number;
      pointsLost: number;
    }
  > = {};

  const registerAllPairs = (assignment: TeamAssignment) => {
    const pairMap = new Map(Object.entries(assignment.pairs_data || {}));
    
    if (assignment.pair_groups && assignment.pair_groups.length > 0) {
      assignment.pair_groups.forEach((group) => {
        group.pairNames.forEach((pairName) => {
          const players = pairMap.get(pairName);
          if (players && players.length > 0) {
            const key = getTeamKey(players);
            pairStats[key] = {
              groupName: group.groupName,
              matches: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              pointsWon: 0,
              pointsLost: 0,
            };
          }
        });
      });
    } else {
      Object.entries(assignment.pairs_data || {}).forEach(([pairName, players]) => {
        if (players && players.length > 0) {
          const key = getTeamKey(players);
          pairStats[key] = {
            groupName: '페어 그룹',
            matches: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            pointsWon: 0,
            pointsLost: 0,
          };
        }
      });
    }
  };

  if (fallbackTeamAssignment) {
    registerAllPairs(fallbackTeamAssignment);
  }
  
  Object.values(assignmentsByTournament).forEach((assignment) => {
    if (assignment) registerAllPairs(assignment);
  });

  sourceMatches.forEach((match) => {
    if (!isResultMatch(match)) return;

    const team1Key = getTeamKey(match.team1);
    const team2Key = getTeamKey(match.team2);
    const resolvedWinner = getResolvedWinner(match);
    const groupName = extractPairGroupLabel(match.court) || '기타 그룹';

    if (!pairStats[team1Key]) {
      pairStats[team1Key] = { groupName, matches: 0, wins: 0, losses: 0, draws: 0, pointsWon: 0, pointsLost: 0 };
    }
    if (!pairStats[team2Key]) {
      pairStats[team2Key] = { groupName, matches: 0, wins: 0, losses: 0, draws: 0, pointsWon: 0, pointsLost: 0 };
    }

    pairStats[team1Key].matches += 1;
    pairStats[team2Key].matches += 1;

    if (groupName && groupName !== '기타 그룹') {
      pairStats[team1Key].groupName = groupName;
      pairStats[team2Key].groupName = groupName;
    }

    const score1 = match.score_team1 ?? 0;
    const score2 = match.score_team2 ?? 0;

    pairStats[team1Key].pointsWon += score1;
    pairStats[team1Key].pointsLost += score2;

    pairStats[team2Key].pointsWon += score2;
    pairStats[team2Key].pointsLost += score1;

    if (resolvedWinner === 'team1') {
      pairStats[team1Key].wins += 1;
      pairStats[team2Key].losses += 1;
    } else if (resolvedWinner === 'team2') {
      pairStats[team2Key].wins += 1;
      pairStats[team1Key].losses += 1;
    } else {
      pairStats[team1Key].draws += 1;
      pairStats[team2Key].draws += 1;
    }
  });

  return pairStats;
}

export default function TournamentBracketView({ adminMode = false }: TournamentBracketViewProps) {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allTournamentMatches, setAllTournamentMatches] = useState<Match[]>([]);
  const [teamAssignmentsByTournament, setTeamAssignmentsByTournament] = useState<TeamAssignmentMap>({});
  const [tournamentMetrics, setTournamentMetrics] = useState<Record<string, TournamentMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [availableTeams, setAvailableTeams] = useState<TeamAssignment[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamAssignment | null>(null);
  const [selectedTournamentAssignment, setSelectedTournamentAssignment] = useState<TeamAssignment | null>(null);
  const [showPlayerAssignments, setShowPlayerAssignments] = useState(!adminMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminActiveTab, setAdminActiveTab] = useState<AdminTournamentTab>('overview');
  const [userActiveTab, setUserActiveTab] = useState<UserTournamentTab>('bracket');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [submittedPlayerSearchQuery, setSubmittedPlayerSearchQuery] = useState('');
  const [refereeDrafts, setRefereeDrafts] = useState<Record<string, string>>({});
  const [rankingCriteria, setRankingCriteria] = useState<string[]>([
    'winRate',
    'pointsDiff',
    'h2h',
  ]);

  useEffect(() => {
    if (selectedTournament?.match_type) {
      const matchType = selectedTournament.match_type;
      if (matchType.startsWith('pairs_custom:')) {
        const criteriaParts = matchType.split(':')[1]?.split(',').filter(Boolean);
        if (criteriaParts && criteriaParts.length === 3) {
          setRankingCriteria(criteriaParts);
          return;
        }
      }
    }
    setRankingCriteria(['winRate', 'pointsDiff', 'h2h']);
  }, [selectedTournament]);

  const handleCriteriaChange = (index: number, value: string) => {
    const next = [...rankingCriteria];
    const prevVal = next[index];
    const duplicateIndex = next.indexOf(value);
    if (duplicateIndex !== -1) {
      next[duplicateIndex] = prevVal;
    }
    next[index] = value;
    setRankingCriteria(next);
  };

  const saveRankingCriteria = async () => {
    if (!selectedTournament) return;
    try {
      const nextMatchType = `pairs_custom:${rankingCriteria.join(',')}`;
      const { error } = await supabase
        .from('tournaments')
        .update({ match_type: nextMatchType })
        .eq('id', selectedTournament.id);

      if (error) throw error;

      setSelectedTournament((prev) => (prev ? { ...prev, match_type: nextMatchType } : null));
      alert('순위 결정 기준이 영구 저장되었습니다!');
    } catch (error) {
      console.error('순위 기준 저장 실패:', error);
      alert('순위 결정 기준 저장에 실패했습니다.');
    }
  };


  const tournamentQueryId = searchParams.get('tournament');

  const matchTypeMeta: Record<string, { label: string; badge: string }> = {
    level_based: { label: '레벨', badge: 'bg-blue-100 text-blue-700' },
    mixed_doubles: { label: '혼복', badge: 'bg-rose-100 text-rose-700' },
    random: { label: '랜덤', badge: 'bg-emerald-100 text-emerald-700' },
    pairs_custom: { label: '페어전', badge: 'bg-amber-100 text-amber-700' },
  };

  const getTodayLocal = () => getKoreaDate();

  const getTournamentMetricsFromMatches = (tournamentMatches: Match[]): TournamentMetrics => {
    const normalizedMatches = normalizeMatches(tournamentMatches);
    const uniqueTeams = new Set<string>();
    const uniquePlayers = new Set<string>();
    const uniqueRounds = new Set<number>();

    normalizedMatches.forEach((match) => {
      if (match.round) {
        uniqueRounds.add(match.round);
      }

      const team1 = match.team1.filter(Boolean);
      const team2 = match.team2.filter(Boolean);

      if (team1.length > 0) {
        uniqueTeams.add(team1.join(' / '));
        team1.forEach((player) => uniquePlayers.add(player));
      }

      if (team2.length > 0) {
        uniqueTeams.add(team2.join(' / '));
        team2.forEach((player) => uniquePlayers.add(player));
      }
    });

    return {
      matchCount: normalizedMatches.length,
      teamCount: uniqueTeams.size,
      playerCount: uniquePlayers.size,
      roundCount: uniqueRounds.size,
    };
  };

  const fetchTournamentMetrics = async (tournamentList: Tournament[]) => {
    if (!adminMode) {
      return;
    }

    if (tournamentList.length === 0) {
      setTournamentMetrics({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select('tournament_id, round, match_number, team1, team2, court, scheduled_time, status, score_team1, score_team2, winner');

      if (error && error.code !== '42P01') {
        throw error;
      }

      const groupedMatches = new Map<string, Match[]>();
      ((data || []) as Match[]).forEach((match) => {
        if (!match.tournament_id) return;
        const current = groupedMatches.get(match.tournament_id) || [];
        current.push(match);
        groupedMatches.set(match.tournament_id, current);
      });

      const nextMetrics = Object.fromEntries(
        tournamentList.map((tournament) => {
          const tournamentMatches = groupedMatches.get(tournament.id) || [];
          return [tournament.id, getTournamentMetricsFromMatches(tournamentMatches)];
        })
      );

      setTournamentMetrics(nextMetrics);
    } catch (error) {
      console.error('대회 통계 조회 오류:', error);
      setTournamentMetrics({});
    }
  };

  const fetchMatches = async (tournamentId: string) => {
    try {
      if (adminMode) {
        const params = new URLSearchParams({
          include_matches: '1',
          tournament_id: tournamentId,
        });

        const response = await fetch(`/api/admin/tournaments?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || '관리자 경기 데이터를 불러오지 못했습니다.');
        }

        if (payload?.selectedTournament) {
          setSelectedTournament(payload.selectedTournament);
        }

        setSelectedTournamentAssignment(
          payload?.selectedTeamAssignment ? mapTeamAssignmentRow(payload.selectedTeamAssignment) : null
        );
        setMatches(normalizeMatches(Array.isArray(payload?.matches) ? payload.matches : []));
        setLoadError(null);
        return;
      }

      const params = new URLSearchParams({
        include_matches: '1',
        tournament_id: tournamentId,
      });

      const response = await fetch(`/api/tournaments?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '대회 데이터를 불러오지 못했습니다.');
      }

      if (payload?.selectedTournament) {
        setSelectedTournament(payload.selectedTournament);
      }

      setSelectedTournamentAssignment(payload?.selectedTeamAssignment || null);
      setTeamAssignmentsByTournament(mapTeamAssignmentMap(payload?.teamAssignmentsByTournament));
      setAllTournamentMatches(normalizeMatches(Array.isArray(payload?.allMatches) ? payload.allMatches : []));
      setMatches(normalizeMatches(Array.isArray(payload?.matches) ? payload.matches : []));
      setLoadError(null);
    } catch (error) {
      console.error('경기 조회 오류:', error);
      setTeamAssignmentsByTournament({});
      setAllTournamentMatches([]);
      setMatches([]);
      setLoadError(error instanceof Error ? error.message : '경기 데이터를 불러오지 못했습니다.');
    }
  };

  const normalizeMatches = (data: Match[]) =>
    (data || [])
      .map((match) => ({
        ...match,
        scheduled_time: match.scheduled_time || null,
        status: isResultMatch(match) ? 'completed' : match.status || 'pending',
        score_team1: match.score_team1 ?? null,
        score_team2: match.score_team2 ?? null,
        winner: getResolvedWinner(match),
      }))
      .sort((left, right) => {
        const roundDiff = (left.round || 0) - (right.round || 0);
        if (roundDiff !== 0) {
          return roundDiff;
        }
        return (left.match_number || 0) - (right.match_number || 0);
      });

  const getTournamentMetrics = (tournamentId?: string | null) => {
    if (!tournamentId) {
      return null;
    }

    return tournamentMetrics[tournamentId] || null;
  };

  const getTeamCountFromAssignment = (teamAssignment: TeamAssignment) => {
    if (teamAssignment.team_type === 'pairs') {
      return Object.keys(teamAssignment.pairs_data || {}).length;
    }

    const groups = [
      teamAssignment.racket_team,
      teamAssignment.shuttle_team,
      teamAssignment.team1,
      teamAssignment.team2,
      teamAssignment.team3,
      teamAssignment.team4,
    ];

    return groups.filter((group) => Array.isArray(group) && group.length > 0).length;
  };

  const fetchSelectedTournamentAssignment = async (tournament: Tournament | null) => {
    const assignmentId = tournament?.team_assignment_id;

    if (!assignmentId) {
      setSelectedTournamentAssignment(null);
      return;
    }

    const cachedAssignment = availableTeams.find((team) => team.id === assignmentId);
    if (cachedAssignment) {
      setSelectedTournamentAssignment(cachedAssignment);
      return;
    }

    if (adminMode) {
      return;
    }

    try {
      const params = new URLSearchParams({
        include_matches: '1',
        tournament_id: tournament?.id || '',
      });

      const response = await fetch(`/api/tournaments?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '팀 구성을 불러오지 못했습니다.');
      }

      setSelectedTournamentAssignment(payload?.selectedTeamAssignment || null);
    } catch (error) {
      console.error('선택 대회 팀 구성 조회 실패:', error);
      setSelectedTournamentAssignment(null);
    }
  };

  const handleSelectTournament = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    await fetchSelectedTournamentAssignment(tournament);
    await fetchMatches(tournament.id);
  };

  const fetchTournaments = async () => {
    try {
      setLoadError(null);

      if (adminMode) {
        const params = new URLSearchParams({ include_matches: '1' });
        if (tournamentQueryId) {
          params.set('tournament_id', tournamentQueryId);
        }

        const response = await fetch(`/api/admin/tournaments?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || '관리자 대회 데이터를 불러오지 못했습니다.');
        }

        const tournamentList = Array.isArray(payload?.tournaments) ? payload.tournaments : [];
        const selected = payload?.selectedTournament || null;
        const selectedAssignment = payload?.selectedTeamAssignment
          ? mapTeamAssignmentRow(payload.selectedTeamAssignment)
          : null;
        const nextMatches = Array.isArray(payload?.matches) ? payload.matches : [];

        setTournaments(tournamentList);
        setSelectedTournament(selected);
        setSelectedTournamentAssignment(selectedAssignment);
        setMatches(normalizeMatches(nextMatches));
        await fetchTournamentMetrics(tournamentList);
        return;
      }

      const params = new URLSearchParams({ include_matches: '1' });
      if (tournamentQueryId) {
        params.set('tournament_id', tournamentQueryId);
      }

      const response = await fetch(`/api/tournaments?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '대회 데이터를 불러오지 못했습니다.');
      }

      setTournaments(Array.isArray(payload?.tournaments) ? payload.tournaments : []);
      setTournamentMetrics(payload?.metricsByTournament && typeof payload.metricsByTournament === 'object' ? payload.metricsByTournament : {});
      setSelectedTournament(payload?.selectedTournament || null);
      setSelectedTournamentAssignment(payload?.selectedTeamAssignment || null);
      setTeamAssignmentsByTournament(mapTeamAssignmentMap(payload?.teamAssignmentsByTournament));
      setAllTournamentMatches(normalizeMatches(Array.isArray(payload?.allMatches) ? payload.allMatches : []));
      setMatches(normalizeMatches(Array.isArray(payload?.matches) ? payload.matches : []));
    } catch (error) {
      console.error('대회 조회 오류:', error);
      setTournaments([]);
      setTournamentMetrics({});
      setSelectedTournament(null);
      setSelectedTournamentAssignment(null);
      setTeamAssignmentsByTournament({});
      setAllTournamentMatches([]);
      setMatches([]);
      setLoadError(error instanceof Error ? error.message : '대회 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTeams = async () => {
    if (!adminMode) {
      setAvailableTeams([]);
      return;
    }

    try {
      const today = getTodayLocal();
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .eq('assignment_date', today)
        .order('round_number', { ascending: false });

      if (error) throw error;

      setAvailableTeams((data || []).map((team) => mapTeamAssignmentRow(team)));
    } catch (error) {
      console.error('팀 구성 조회 실패:', error);
      setAvailableTeams([]);
    }
  };

  useEffect(() => {
    void fetchTournaments();
    void fetchAvailableTeams();
  }, [tournamentQueryId]);

  useEffect(() => {
    if (!adminMode) return;
    setAdminActiveTab('overview');
  }, [adminMode, tournamentQueryId]);

  // Realtime 구독 - 점수 실시간 갱신
  useEffect(() => {
    if (!selectedTournament?.id) return;
    if (!supabase || !supabase.channel) return;

    const channel = supabase
      .channel(`tournament-scores-${selectedTournament.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournament_matches',
          filter: `tournament_id=eq.${selectedTournament.id}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (!updated?.id) return;
          setMatches((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    score_team1: updated.score_team1 ?? m.score_team1,
                    score_team2: updated.score_team2 ?? m.score_team2,
                    status: updated.status ?? m.status,
                    winner: updated.winner ?? m.winner,
                    referee_name: updated.referee_name ?? m.referee_name,
                    referee_id: updated.referee_id ?? m.referee_id,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTournament?.id, supabase]);

  // 심판 배정 함수
  const assignReferee = async (matchId: string, refereeName: string) => {
    try {
      const response = await fetch('/api/admin/tournaments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          referee_name: refereeName || null,
        }),
      });

      if (!response.ok) {
        throw new Error('심판 배정에 실패했습니다.');
      }

      // 로컬 상태 업데이트
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, referee_name: refereeName || null } : m
        )
      );
    } catch (error) {
      console.error('심판 배정 오류:', error);
      alert('심판 배정에 실패했습니다.');
    }
  };

  useEffect(() => {
    setScoreDrafts(
      Object.fromEntries(
        matches
          .filter((match): match is Match & { id: string } => Boolean(match.id))
          .map((match) => [
            match.id,
            {
              score1: match.score_team1 != null ? String(match.score_team1) : '',
              score2: match.score_team2 != null ? String(match.score_team2) : '',
            },
          ])
      )
    );
  }, [matches]);

  const generateMatchesFromTeam = async (teamAssignment: TeamAssignment, matchesPerPlayer: number, matchType: string) => {
    if (!teamAssignment) return [] as Match[];

    const playerList: string[] = [];

    if (teamAssignment.team_type === 'pairs' && teamAssignment.pairs_data) {
      Object.values(teamAssignment.pairs_data).forEach((players) => {
        playerList.push(...(Array.isArray(players) ? players : []));
      });
    } else if (teamAssignment.racket_team && teamAssignment.shuttle_team) {
      playerList.push(...(Array.isArray(teamAssignment.racket_team) ? teamAssignment.racket_team : []));
      playerList.push(...(Array.isArray(teamAssignment.shuttle_team) ? teamAssignment.shuttle_team : []));
    }

    const uniquePlayers = [...new Set(playerList)]
      .filter((player) => player && typeof player === 'string')
      .map((player) => player.trim());

    if (uniquePlayers.length < 4) {
      alert('최소 4명의 선수가 필요합니다.');
      return [];
    }

    const players = uniquePlayers.map((name, index) => {
      const extractedLevelMatch = name.match(/\(([^)]+)\)(?!.*\()$/);
      const extractedLevel = extractedLevelMatch?.[1]?.trim().toLowerCase() || 'e2';

      return {
        id: `player-${index}-${Date.now()}`,
        name,
        skill_level: extractedLevel,
        skill_label: extractedLevel.toUpperCase(),
        skill_code: extractedLevel,
        gender: 'mixed' as const,
      };
    });

    let generatedMatches: any[] = [];

    try {
      if (matchType === 'level_based') {
        const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createBalancedDoublesMatches(players, 4, 1);
      } else if (matchType === 'mixed_doubles') {
        const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createMixedAndSameSexDoublesMatches(players, 4, 1);
      } else {
        const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createRandomBalancedDoublesMatches(players, 4, 1);
      }
    } catch (error) {
      console.error('경기 생성 함수 로드 오류:', error);
      return [];
    }

    const finalMatches: Match[] = [];
    const maxRounds = Math.max(1, matchesPerPlayer);
    let currentMatchNumber = 1;
    let roundIndex = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
      const matchesPerRound = Math.ceil(uniquePlayers.length / 4);

      for (let index = 0; index < matchesPerRound; index += 1) {
        if (roundIndex >= generatedMatches.length) {
          const shuffled = [...uniquePlayers].sort(() => Math.random() - 0.5);

          for (let shuffleIndex = 0; shuffleIndex < shuffled.length - 3; shuffleIndex += 4) {
            const group = shuffled.slice(shuffleIndex, shuffleIndex + 4);
            if (group.length !== 4) continue;

            const team1 = [group[0], group[1]];
            const team2 = [group[2], group[3]];
            const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

            finalMatches.push({
              round,
              match_number: currentMatchNumber,
              team1,
              team2,
              court: `Court ${courtNumber}`,
              status: 'pending',
            });
            currentMatchNumber += 1;
          }

          break;
        }

        const match = generatedMatches[roundIndex];
        const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

        finalMatches.push({
          round,
          match_number: currentMatchNumber,
          team1: match.team1.map((player: any) => player.name || player),
          team2: match.team2.map((player: any) => player.name || player),
          court: `Court ${courtNumber}`,
          status: 'pending',
        });

        currentMatchNumber += 1;
        roundIndex += 1;
      }
    }

    return finalMatches;
  };

  const createTournamentWithMatches = async (matchesPerPlayer: number, matchType: string) => {
    if (!selectedTeam) {
      alert('팀 구성을 선택해주세요.');
      return;
    }

    try {
      const generatedMatches = await generateMatchesFromTeam(selectedTeam, matchesPerPlayer, matchType);

      if (generatedMatches.length === 0) {
        alert('생성할 경기가 없습니다.');
        return;
      }

      const matchTypeLabel = getMatchTypeLabel(matchType);
      const tournamentTitle = `대회 경기 ${selectedTeam.round_number}회차 ${matchTypeLabel}`;
      const teamCount = getTeamCountFromAssignment(selectedTeam);
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({
          title: tournamentTitle,
          tournament_date: selectedTeam.assignment_date,
          round_number: selectedTeam.round_number || 1,
          match_type: matchType,
          team_assignment_id: selectedTeam.id,
          team_type: selectedTeam.team_type,
          total_teams: teamCount,
          matches_per_player: matchesPerPlayer,
        })
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      const matchesToInsert = generatedMatches.map((match) => ({
        ...match,
        tournament_id: tournamentData.id,
      }));

      const { error: matchesError } = await supabase.from('tournament_matches').insert(matchesToInsert);
      if (matchesError) throw matchesError;

      alert(`대회가 생성되었습니다! (${generatedMatches.length}개 경기)`);
      await fetchTournaments();
      setSelectedTeam(null);
    } catch (error) {
      console.error('대회 생성 오류:', error);
      alert('대회 생성 중 오류가 발생했습니다.');
    }
  };

  const updateMatchScore = async (matchId: string, scoreTeam1: number, scoreTeam2: number) => {
    try {
      if (adminMode) {
        const response = await fetch('/api/admin/tournaments', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            match_id: matchId,
            score_team1: scoreTeam1,
            score_team2: scoreTeam2,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || '점수 저장에 실패했습니다.');
        }
      } else {
        const winner = scoreTeam1 > scoreTeam2 ? 'team1' : scoreTeam2 > scoreTeam1 ? 'team2' : 'draw';

        const { error } = await supabase
          .from('tournament_matches')
          .update({
            score_team1: scoreTeam1,
            score_team2: scoreTeam2,
            winner,
            status: 'completed',
          })
          .eq('id', matchId);

        if (error) throw error;
      }

      if (selectedTournament) {
        await fetchMatches(selectedTournament.id);
      }

      alert('점수가 저장되었습니다!');
    } catch (error) {
      console.error('점수 저장 오류:', error);
      alert('점수 저장 중 오류가 발생했습니다.');
    }
  };

  const getPlayerStats = (sourceMatches: Match[], assignmentsByTournament: TeamAssignmentMap, fallbackTeamAssignment?: TeamAssignment | null) => {
    const playerStats: Record<string, { matches: number; wins: number; losses: number; draws: number; teamLabel: string }> = {};

    sourceMatches.forEach((match) => {
      if (!isResultMatch(match)) return;

      const playerToTeamLabel = new Map<string, string>();
      const teamAssignment =
        (match.tournament_id ? assignmentsByTournament[match.tournament_id] : null) ||
        fallbackTeamAssignment ||
        null;

      if (teamAssignment) {
        getAssignmentTeamGroups(teamAssignment).forEach((group) => {
          group.players.forEach((player) => playerToTeamLabel.set(player.trim(), group.label));
        });
      }

      const resolvedWinner = getResolvedWinner(match);

      match.team1.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = {
            matches: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            teamLabel: playerToTeamLabel.get(player.trim()) || '미지정',
          };
        }
        playerStats[player].matches += 1;
        if (resolvedWinner === 'team1') playerStats[player].wins += 1;
        else if (resolvedWinner === 'team2') playerStats[player].losses += 1;
        else playerStats[player].draws += 1;
      });

      match.team2.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = {
            matches: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            teamLabel: playerToTeamLabel.get(player.trim()) || '미지정',
          };
        }
        playerStats[player].matches += 1;
        if (resolvedWinner === 'team2') playerStats[player].wins += 1;
        else if (resolvedWinner === 'team1') playerStats[player].losses += 1;
        else playerStats[player].draws += 1;
      });
    });

    return playerStats;
  };

  const getTeamStats = (sourceMatches: Match[], assignmentsByTournament: TeamAssignmentMap, fallbackTeamAssignment?: TeamAssignment | null) => {
    const teamStats: Record<string, { matches: number; wins: number; losses: number; draws: number }> = {};

    sourceMatches.forEach((match) => {
      if (!isResultMatch(match)) return;

      const playerToTeamLabel = new Map<string, string>();
      const teamAssignment =
        (match.tournament_id ? assignmentsByTournament[match.tournament_id] : null) ||
        fallbackTeamAssignment ||
        null;
      const hasOriginalTeamMapping = Boolean(teamAssignment);

      if (teamAssignment) {
        const teamGroups = getAssignmentTeamGroups(teamAssignment);

        teamGroups.forEach((group) => {
          if (!teamStats[group.label]) {
            teamStats[group.label] = { matches: 0, wins: 0, losses: 0, draws: 0 };
          }
          group.players.forEach((player) => playerToTeamLabel.set(player.trim(), group.label));
        });
      }

      const resolvedWinner = getResolvedWinner(match);
      const team1Labels = [...new Set(match.team1.map((player) => playerToTeamLabel.get(player.trim())).filter(Boolean))] as string[];
      const team2Labels = [...new Set(match.team2.map((player) => playerToTeamLabel.get(player.trim())).filter(Boolean))] as string[];

      if (hasOriginalTeamMapping) {
        if (team1Labels.length !== 1 || team2Labels.length !== 1) {
          return;
        }

        team1Labels.forEach((label) => {
          if (!teamStats[label]) {
            teamStats[label] = { matches: 0, wins: 0, losses: 0, draws: 0 };
          }

          teamStats[label].matches += 1;
          if (resolvedWinner === 'team1') teamStats[label].wins += 1;
          else if (resolvedWinner === 'team2') teamStats[label].losses += 1;
          else teamStats[label].draws += 1;
        });

        team2Labels.forEach((label) => {
          if (!teamStats[label]) {
            teamStats[label] = { matches: 0, wins: 0, losses: 0, draws: 0 };
          }

          teamStats[label].matches += 1;
          if (resolvedWinner === 'team2') teamStats[label].wins += 1;
          else if (resolvedWinner === 'team1') teamStats[label].losses += 1;
          else teamStats[label].draws += 1;
        });

        return;
      }

      const team1Key = getTeamKey(match.team1);
      const team2Key = getTeamKey(match.team2);

      if (!teamStats[team1Key]) {
        teamStats[team1Key] = { matches: 0, wins: 0, losses: 0, draws: 0 };
      }

      if (!teamStats[team2Key]) {
        teamStats[team2Key] = { matches: 0, wins: 0, losses: 0, draws: 0 };
      }

      teamStats[team1Key].matches += 1;
      teamStats[team2Key].matches += 1;

      if (resolvedWinner === 'team1') {
        teamStats[team1Key].wins += 1;
        teamStats[team2Key].losses += 1;
      } else if (resolvedWinner === 'team2') {
        teamStats[team2Key].wins += 1;
        teamStats[team1Key].losses += 1;
      } else {
        teamStats[team1Key].draws += 1;
        teamStats[team2Key].draws += 1;
      }
    });

    return teamStats;
  };
  const resultsSourceMatches = adminMode ? matches : allTournamentMatches;
  const resultsTeamAssignment = selectedTournamentAssignment;
  const resultsAssignmentsByTournament = adminMode
    ? (selectedTournament?.id ? { [selectedTournament.id]: selectedTournamentAssignment } : {})
    : teamAssignmentsByTournament;
  const playerStatsEntries = Object.entries(getPlayerStats(resultsSourceMatches, resultsAssignmentsByTournament, resultsTeamAssignment)).sort(([leftName, left], [rightName, right]) => {
    const leftWinRate = left.matches > 0 ? left.wins / left.matches : 0;
    const rightWinRate = right.matches > 0 ? right.wins / right.matches : 0;
    if (rightWinRate !== leftWinRate) {
      return rightWinRate - leftWinRate;
    }

    return leftName.localeCompare(rightName, 'ko-KR');
  });
  const teamStatsEntries = Object.entries(getTeamStats(resultsSourceMatches, resultsAssignmentsByTournament, resultsTeamAssignment)).sort(([, left], [, right]) => {
    const leftWinRate = left.matches > 0 ? left.wins / left.matches : 0;
    const rightWinRate = right.matches > 0 ? right.wins / right.matches : 0;
    return rightWinRate - leftWinRate;
  });

  const pairStats = useMemo(() => {
    return getPairStats(resultsSourceMatches, resultsAssignmentsByTournament, resultsTeamAssignment);
  }, [resultsSourceMatches, resultsAssignmentsByTournament, resultsTeamAssignment]);

  const pairGroupsList = useMemo(() => {
    const groups = new Set<string>();
    Object.values(pairStats).forEach((stat) => {
      if (stat.groupName) groups.add(stat.groupName);
    });
    return Array.from(groups).sort((left, right) => left.localeCompare(right, 'ko-KR'));
  }, [pairStats]);

  const sortedPairStatsEntries = useMemo(() => {
    return Object.entries(pairStats)
      .map(([pairKey, stats]) => ({
        pairKey,
        ...stats,
        winRate: stats.matches > 0 ? stats.wins / stats.matches : 0,
        pointsDiff: stats.pointsWon - stats.pointsLost,
      }))
      .sort((left, right) => {
        for (const criterion of rankingCriteria) {
          if (criterion === 'winRate') {
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
          } else if (criterion === 'pointsDiff') {
            if (right.pointsDiff !== left.pointsDiff) return right.pointsDiff - left.pointsDiff;
          } else if (criterion === 'h2h') {
            const h2h = getHeadToHeadWinner(left.pairKey, right.pairKey, resultsSourceMatches);
            if (h2h !== 0) return h2h;
          }
        }

        // 경기수가 더 많은 팀 우선
        if (right.matches !== left.matches) return right.matches - left.matches;
        
        return left.pairKey.localeCompare(right.pairKey, 'ko-KR');
      });
  }, [pairStats, resultsSourceMatches, rankingCriteria]);

  const filteredPairStats = useMemo(() => {
    const activeTab = adminMode ? adminActiveTab : userActiveTab;
    if (activeTab.startsWith('group_')) {
      const groupName = activeTab.replace('group_', '');
      return sortedPairStatsEntries.filter((entry) => entry.groupName === groupName);
    }
    return sortedPairStatsEntries;
  }, [sortedPairStatsEntries, adminActiveTab, userActiveTab, adminMode]);

  const normalizedPlayerSearchQuery = submittedPlayerSearchQuery.trim().toLocaleLowerCase('ko-KR');
  const filteredPlayerStatsEntries = normalizedPlayerSearchQuery
    ? playerStatsEntries.filter(([player]) => player.toLocaleLowerCase('ko-KR').includes(normalizedPlayerSearchQuery))
    : [];
  const hasResultData = teamStatsEntries.length > 0 || playerStatsEntries.length > 0;

  const isPairCustomTournament = selectedTournament?.match_type
    ? selectedTournament.match_type.startsWith('pairs_custom')
    : false;
  const groupedMatchSections = isPairCustomTournament ? groupMatchesByPairGroup(matches) : [];
  const adminTabs = useMemo(() => {
    const tabs = [{ key: 'overview', label: '대회 관리' }];
    if (selectedTournament) {
      if (isPairCustomTournament) {
        tabs.push({ key: 'results', label: '종합 순위' });
        pairGroupsList.forEach((group) => {
          tabs.push({ key: `group_${group}`, label: `${group} 순위` });
        });
      } else {
        tabs.push({ key: 'results', label: '경기 결과' });
      }
    } else {
      tabs.push({ key: 'results', label: '경기 결과' });
    }
    return tabs;
  }, [selectedTournament, isPairCustomTournament, pairGroupsList]);

  const userTabs = useMemo(() => {
    const tabs = [{ key: 'bracket', label: '대진표' }];
    if (selectedTournament) {
      if (isPairCustomTournament) {
        tabs.push({ key: 'results', label: '종합 순위' });
        pairGroupsList.forEach((group) => {
          tabs.push({ key: `group_${group}`, label: `${group} 순위` });
        });
      } else {
        tabs.push({ key: 'results', label: '경기결과' });
      }
    } else {
      tabs.push({ key: 'results', label: '경기결과' });
    }
    return tabs;
  }, [selectedTournament, isPairCustomTournament, pairGroupsList]);

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${adminMode ? 'bg-gray-50' : 'bg-[#f5f7fb]'}`}>
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">대진표를 불러오는 중입니다</div>
      </div>
    );
  }

  const containerClassName = adminMode
    ? 'flex w-full max-w-none flex-col gap-6 px-1 py-2 2xl:px-3'
    : 'mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5';

  const title = adminMode ? '관리자 대진표' : '대회 대진표';
  const description = adminMode
    ? '관리자는 큰 화면에서 팀 구성, 대회 생성, 경기 결과를 한 번에 관리할 수 있습니다.'
    : '경기 대진표와 경기결과 확인';
  const homeHref = adminMode ? '/admin' : '/dashboard';
  const homeLabel = adminMode ? '관리자 홈' : '홈';
  const selectedTournamentMetrics = selectedTournament
    ? getTournamentMetrics(selectedTournament.id) || getTournamentMetricsFromMatches(matches)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      <div className={containerClassName}>
        <section className={`${adminMode ? 'rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-sm' : 'rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>{adminMode ? 'Admin Tournament Center' : 'Tournament Center'}</p>
              <h1 className={`mt-1 ${adminMode ? 'text-3xl font-bold text-slate-900' : 'text-2xl font-semibold text-white'}`}>{title}</h1>
              <p className={`mt-2 text-sm leading-6 ${adminMode ? 'max-w-3xl text-slate-600' : 'max-w-2xl text-slate-300'}`}>{description}</p>
            </div>
            <Link
              href={homeHref}
              className={adminMode
                ? 'rounded-full bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800'
                : 'rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15'}
            >
              {homeLabel}
            </Link>
          </div>
        </section>

        {loadError && (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
            {loadError}
          </section>
        )}
        {adminMode ? (
          <div className="space-y-6">
            <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
              <div className="flex flex-wrap gap-2">
                {adminTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAdminActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      adminActiveTab === tab.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </section>

            {adminActiveTab === 'overview' && (
              <div className="space-y-6">
                <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">대회 회차와 대진표</h2>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {tournaments.length}개 대회
                    </div>
                  </div>

                  {tournaments.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      저장된 대회가 없습니다.
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {tournaments.map((tournament) => {
                        const metrics = getTournamentMetrics(tournament.id);

                        return (
                          <button
                            key={tournament.id}
                            onClick={() => {
                              void handleSelectTournament(tournament);
                            }}
                            className={`w-full rounded-[18px] border px-3 py-2.5 text-left transition-all ${
                              selectedTournament?.id === tournament.id
                                ? 'border-blue-500 bg-blue-50 shadow-[0_14px_34px_-18px_rgba(59,130,246,0.45)]'
                                : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{formatTournamentTitle(tournament.title)}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                                  <span>{new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</span>
                                  <span>{tournament.round_number}회차</span>
                                  <span>{metrics?.matchCount ?? tournament.total_teams}경기</span>
                                </div>
                              </div>
                              {tournament.match_type && (
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${matchTypeMeta[tournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                                  {matchTypeMeta[tournament.match_type]?.label || tournament.match_type}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {selectedTournament ? (
                  <>
                    <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">대진표 ({matches.length}경기)</h3>
                      </div>
                      {matches.length === 0 ? (
                        <p className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">경기가 없습니다.</p>
                      ) : (
                        <div className="space-y-6">
                          {(isPairCustomTournament ? groupedMatchSections : [{ groupName: '', matches }]).map((section) => (
                            <section key={section.groupName || 'all-matches'} className="space-y-3">
                              {section.groupName && (
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                  <div>
                                    <p className="text-sm font-semibold text-amber-900">{section.groupName}</p>
                                    <p className="text-xs text-amber-700">{section.matches.length}경기</p>
                                  </div>
                                </div>
                              )}
                              <div className="grid gap-4 xl:grid-cols-4">
                                {section.matches.map((match, index) => {
                                  const isCompleted = match.status === 'completed';
                                  const isPending = match.status === 'pending';
                                  const displayRound = getTournamentDisplayRound(selectedTournament);
                                  const displayMatchNumber = getDisplayMatchNumber(match, index);
                                  const draft = match.id ? scoreDrafts[match.id] : undefined;
                                  const score1Value = draft?.score1 ?? (match.score_team1 != null ? String(match.score_team1) : '');
                                  const score2Value = draft?.score2 ?? (match.score_team2 != null ? String(match.score_team2) : '');
                                  const hasBothScores = score1Value.trim() !== '' && score2Value.trim() !== '';
                                  const parsedScore1 = hasBothScores ? parseInt(score1Value, 10) || 0 : null;
                                  const parsedScore2 = hasBothScores ? parseInt(score2Value, 10) || 0 : null;
                                  const hasScoreChanged =
                                    parsedScore1 !== match.score_team1 ||
                                    parsedScore2 !== match.score_team2 ||
                                    match.status !== 'completed';
                                  const pairGroupLabel = extractPairGroupLabel(match.court);

                                  return (
                                    <article key={match.id || `match-view-${section.groupName || 'all'}-${index}`} className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/70' : isPending ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70'}`}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-900">{displayRound}회차 - {displayMatchNumber}경기</p>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            {pairGroupLabel && (
                                              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{pairGroupLabel}</span>
                                            )}
                                            <span>{formatCourtLabel(match.court)}</span>
                                          </div>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-800' : isPending ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                                          {isCompleted ? '완료' : isPending ? '대기중' : '진행중'}
                                        </span>
                                      </div>

                                      <div className="mt-4 grid grid-cols-2 items-stretch gap-3 text-sm">
                                        <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                                          <span className="text-xs font-medium text-blue-600">팀1</span>
                                          <div className="mt-1 font-medium">{match.team1.join(', ')}</div>
                                        </div>
                                        <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                                          <span className="text-xs font-medium text-rose-600">팀2</span>
                                          <div className="mt-1 font-medium">{match.team2.join(', ')}</div>
                                        </div>
                                      </div>

                                      <div className="mt-4 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5">
                                        <input
                                          type="number"
                                          min="0"
                                          value={score1Value}
                                          onChange={(event) => {
                                            if (!match.id) return;
                                            setScoreDrafts((prev) => ({
                                              ...prev,
                                              [match.id!]: {
                                                score1: event.target.value,
                                                score2: prev[match.id!]?.score2 ?? score2Value,
                                              },
                                            }));
                                          }}
                                          className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                                        />
                                        <span className="text-sm font-bold text-slate-500">vs</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={score2Value}
                                          onChange={(event) => {
                                            if (!match.id) return;
                                            setScoreDrafts((prev) => ({
                                              ...prev,
                                              [match.id!]: {
                                                score1: prev[match.id!]?.score1 ?? score1Value,
                                                score2: event.target.value,
                                              },
                                            }));
                                          }}
                                          className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                                        />
                                        <button
                                          onClick={() => {
                                            if (!match.id || parsedScore1 == null || parsedScore2 == null) return;
                                            void updateMatchScore(match.id, parsedScore1, parsedScore2);
                                          }}
                                          disabled={!hasBothScores || !hasScoreChanged}
                                          className={`ml-auto rounded-xl px-3 py-1.5 text-sm font-medium text-white ${
                                            !hasBothScores || !hasScoreChanged
                                              ? 'cursor-not-allowed bg-slate-300'
                                              : 'bg-emerald-600 hover:bg-emerald-700'
                                          }`}
                                        >
                                          저장
                                        </button>
                                      </div>

                                      {/* 심판 배정 + 점수판 링크 */}
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <div className="flex flex-1 items-center gap-1.5">
                                          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">심판:</span>
                                          <select
                                            value={refereeDrafts[match.id!] ?? match.referee_name ?? ''}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              if (match.id) {
                                                setRefereeDrafts((prev) => ({ ...prev, [match.id!]: value }));
                                                void assignReferee(match.id, value);
                                              }
                                            }}
                                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none"
                                          >
                                            <option value="">선택 안함</option>
                                            {(() => {
                                              const allPlayers = new Set<string>();
                                              matches.forEach((m) => {
                                                m.team1.forEach((p) => allPlayers.add(p.replace(/\([^)]*\)$/, '').trim()));
                                                m.team2.forEach((p) => allPlayers.add(p.replace(/\([^)]*\)$/, '').trim()));
                                              });
                                              return Array.from(allPlayers).sort((a, b) => a.localeCompare(b, 'ko-KR')).map((player) => (
                                                <option key={player} value={player}>{player}</option>
                                              ));
                                            })()}
                                          </select>
                                        </div>
                                        {match.id && (
                                          <Link
                                            href={`/scoreboard/${match.id}`}
                                            target="_blank"
                                            className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                                          >
                                            📋 점수판
                                          </Link>
                                        )}
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </section>

                  </>
                ) : (
                  <section className="rounded-[24px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm" />
                )}
              </div>
            )}

            {(adminActiveTab === 'results' || adminActiveTab.startsWith('group_')) && (
              <div className="space-y-6">
                {matches.length > 0 ? (
                  <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-slate-900">
                        {isPairCustomTournament
                          ? adminActiveTab.startsWith('group_')
                            ? `${adminActiveTab.replace('group_', '')} 순위`
                            : '페어별 종합 순위'
                          : '경기 결과'}
                      </h2>
                      {selectedTournament && (
                        <p className="mt-1 text-sm text-slate-500">{formatTournamentTitle(selectedTournament.title)}</p>
                      )}
                    </div>

                    {isPairCustomTournament ? (
                      <div className="space-y-6">
                        {adminMode && (
                          <div className="rounded-[20px] border border-amber-200 bg-amber-50/50 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-amber-900">순위 결정 기준 우선순위 설정</p>
                                <p className="text-xs text-amber-700">각 페어들의 최종 순위를 결정할 때 가중치 우선순위를 지정할 수 있습니다.</p>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-amber-800">1순위</span>
                                  <select
                                    value={rankingCriteria[0]}
                                    onChange={(e) => handleCriteriaChange(0, e.target.value)}
                                    className="rounded-xl border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none"
                                  >
                                    <option value="winRate">승률</option>
                                    <option value="pointsDiff">득실차</option>
                                    <option value="h2h">승자승</option>
                                  </select>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-amber-800">2순위</span>
                                  <select
                                    value={rankingCriteria[1]}
                                    onChange={(e) => handleCriteriaChange(1, e.target.value)}
                                    className="rounded-xl border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none"
                                  >
                                    <option value="winRate">승률</option>
                                    <option value="pointsDiff">득실차</option>
                                    <option value="h2h">승자승</option>
                                  </select>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-amber-800">3순위</span>
                                  <select
                                    value={rankingCriteria[2]}
                                    onChange={(e) => handleCriteriaChange(2, e.target.value)}
                                    className="rounded-xl border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none"
                                  >
                                    <option value="winRate">승률</option>
                                    <option value="pointsDiff">득실차</option>
                                    <option value="h2h">승자승</option>
                                  </select>
                                </div>

                                <button
                                  type="button"
                                  onClick={saveRankingCriteria}
                                  className="rounded-xl bg-amber-600 px-3.5 py-1 text-xs font-bold text-white transition hover:bg-amber-700 shadow-sm"
                                >
                                  기준 저장
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-slate-900">
                              {adminActiveTab.startsWith('group_')
                                ? `${adminActiveTab.replace('group_', '')} 결과`
                                : '종합 순위'}
                            </h3>
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              {filteredPairStats.length}개 페어
                            </span>
                          </div>

                          {filteredPairStats.length === 0 ? (
                            <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              결과가 등록된 경기가 없습니다.
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              {filteredPairStats.map((entry, index) => (
                                <article key={entry.pairKey} className="relative rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50/40 to-orange-50/40 px-5 py-5 shadow-sm">
                                  <div className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white shadow-sm">
                                    {index + 1}
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-base font-bold text-slate-900 truncate pr-6">{entry.pairKey}</p>
                                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200/50">
                                          {entry.groupName}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-600">
                                          승률 {entry.matches > 0 ? `${((entry.wins / entry.matches) * 100).toFixed(1)}%` : '0%'}
                                        </span>
                                        <span className="text-xs text-slate-300">|</span>
                                        <span className={`text-xs font-bold ${entry.pointsDiff > 0 ? 'text-blue-600' : entry.pointsDiff < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                          득실차 {entry.pointsDiff > 0 ? `+${entry.pointsDiff}` : entry.pointsDiff}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-xs">
                                    <div className="rounded-xl bg-white/80 px-1 py-2 border border-amber-100">
                                      <p className="text-[10px] text-slate-500">경기</p>
                                      <p className="mt-0.5 font-bold text-slate-700">{entry.matches}</p>
                                    </div>
                                    <div className="rounded-xl bg-emerald-50 px-1 py-2">
                                      <p className="text-[10px] text-emerald-700">승</p>
                                      <p className="mt-0.5 font-bold text-emerald-700">{entry.wins}</p>
                                    </div>
                                    <div className="rounded-xl bg-rose-50 px-1 py-2">
                                      <p className="text-[10px] text-rose-700">패</p>
                                      <p className="mt-0.5 font-bold text-rose-700">{entry.losses}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 px-1 py-2">
                                      <p className="text-[10px] text-slate-500">무</p>
                                      <p className="mt-0.5 font-bold text-slate-700">{entry.draws}</p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : teamStatsEntries.length === 0 && playerStatsEntries.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        저장된 경기 결과가 아직 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {teamStatsEntries.length > 0 && (
                          <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h3 className="text-base font-semibold text-slate-900">팀 구성별 결과</h3>
                              <span className="text-xs text-slate-500">{teamStatsEntries.length}개 팀</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              {teamStatsEntries.map(([teamName, stats]) => (
                                <article key={teamName} className="rounded-[24px] border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 px-5 py-5 shadow-sm">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-lg font-semibold text-slate-900">{teamName}</p>
                                      <p className="mt-1 text-sm text-slate-600">승률 {stats.matches > 0 ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%` : '0%'}</p>
                                    </div>
                                    <div className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm">{stats.matches}경기</div>
                                  </div>
                                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                                    <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                                      <p className="text-[11px] text-emerald-700">승</p>
                                      <p className="mt-1 font-semibold text-emerald-700">{stats.wins}</p>
                                    </div>
                                    <div className="rounded-2xl bg-rose-50 px-2 py-3">
                                      <p className="text-[11px] text-rose-700">패</p>
                                      <p className="mt-1 font-semibold text-rose-700">{stats.losses}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-2 py-3">
                                      <p className="text-[11px] text-slate-500">무</p>
                                      <p className="mt-1 font-semibold text-slate-700">{stats.draws}</p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}

                        {playerStatsEntries.length > 0 && (
                          <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h3 className="text-base font-semibold text-slate-900">선수별 결과</h3>
                              <span className="text-xs text-slate-500">{playerStatsEntries.length}명</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
                              {playerStatsEntries.map(([player, stats]) => (
                                <article key={player} className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-3 py-3 shadow-sm">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="text-base font-semibold text-slate-900">{player}</p>
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
                                          {stats.teamLabel}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">승률 {stats.matches > 0 ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%` : '0%'}</p>
                                    </div>
                                    <div className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">{stats.matches}경기</div>
                                  </div>
                                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-sm">
                                    <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                                      <p className="text-[11px] text-emerald-700">승</p>
                                      <p className="mt-1 font-semibold text-emerald-700">{stats.wins}</p>
                                    </div>
                                    <div className="rounded-2xl bg-rose-50 px-2 py-3">
                                      <p className="text-[11px] text-rose-700">패</p>
                                      <p className="mt-1 font-semibold text-rose-700">{stats.losses}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-2 py-3">
                                      <p className="text-[11px] text-slate-500">무</p>
                                      <p className="mt-1 font-semibold text-slate-700">{stats.draws}</p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="rounded-[24px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm" />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {selectedTournament ? (
              <div className="space-y-6">
                <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                  <div className="flex flex-wrap gap-2">
                    {userTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setUserActiveTab(tab.key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          userActiveTab === tab.key
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </section>

                {userActiveTab === 'bracket' && (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                    <div className="mb-4">
                      <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-slate-500">대회 선택</p>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">대회 회차와 대진표</h3>
                            <p className="mt-1 text-xs text-slate-500">원하는 대회를 선택하면 같은 형식으로 경기 데이터를 확인할 수 있습니다.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">{tournaments.length}개 대회</span>
                        </div>

                        {tournaments.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                            진행 중인 대회가 없습니다.
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            {tournaments.map((tournament) => {
                              const metrics = getTournamentMetrics(tournament.id);

                              return (
                                <button
                                  key={tournament.id}
                                  onClick={() => {
                                    void handleSelectTournament(tournament);
                                  }}
                                  className={`w-full rounded-[18px] border px-3 py-3 text-left transition-all ${
                                    selectedTournament?.id === tournament.id
                                      ? 'border-blue-500 bg-blue-50 shadow-[0_14px_34px_-18px_rgba(59,130,246,0.45)]'
                                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate font-semibold text-slate-900">{formatTournamentTitle(tournament.title)}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                                        <span>{new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</span>
                                        <span>{tournament.round_number}회차</span>
                                        <span>{metrics?.matchCount ?? 0}경기</span>
                                      </div>
                                    </div>
                                    {tournament.match_type && (
                                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${matchTypeMeta[tournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                                        {matchTypeMeta[tournament.match_type]?.label || tournament.match_type}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {matches.length === 0 ? (
                      <p className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">경기가 없습니다.</p>
                    ) : (
                      <div className="space-y-6">
                        {(isPairCustomTournament ? groupedMatchSections : [{ groupName: '', matches }]).map((section) => (
                          <section key={section.groupName || 'all-user-matches'} className="space-y-3">
                            {section.groupName && (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="text-sm font-semibold text-amber-900">{section.groupName}</p>
                                <p className="text-xs text-amber-700">{section.matches.length}경기</p>
                              </div>
                            )}
                            <div className="grid gap-4">
                              {section.matches.map((match, index) => {
                                const isCompleted = match.status === 'completed';
                                const isPending = match.status === 'pending';
                                const displayRound = getTournamentDisplayRound(selectedTournament);
                                const displayMatchNumber = getDisplayMatchNumber(match, index);
                                const pairGroupLabel = extractPairGroupLabel(match.court);
                                return (
                                  <article key={match.id || `match-view-${section.groupName || 'all'}-${index}`} className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/70' : isPending ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{displayRound}회차-{displayMatchNumber}경기</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                          {pairGroupLabel && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{pairGroupLabel}</span>
                                          )}
                                          <span>{formatCourtLabel(match.court)}</span>
                                        </div>
                                      </div>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-800' : isPending ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                                        {isCompleted ? '완료' : isPending ? '대기중' : '진행중'}
                                      </span>
                                    </div>

                                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)] items-stretch gap-2 sm:gap-3">
                                      <div className="flex min-w-0 flex-col justify-center rounded-2xl bg-white px-3 py-4 text-left text-slate-800">
                                        <span className="text-xs font-medium text-blue-600">팀1</span>
                                        <div className="mt-1 whitespace-pre-line text-sm font-medium leading-6 sm:text-base">{match.team1.join('\n')}</div>
                                      </div>
                                      <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-900 px-2 py-4 text-center text-white">
                                        <div className="text-[11px] font-medium text-slate-300">{isCompleted ? '점수' : '매치'}</div>
                                        <div className="mt-1 text-lg font-semibold sm:text-xl">
                                          {isCompleted ? `${match.score_team1 ?? 0} : ${match.score_team2 ?? 0}` : 'VS'}
                                        </div>
                                      </div>
                                      <div className="flex min-w-0 flex-col justify-center rounded-2xl bg-white px-3 py-4 text-right text-slate-800">
                                        <span className="text-xs font-medium text-rose-600">팀2</span>
                                        <div className="mt-1 whitespace-pre-line text-sm font-medium leading-6 sm:text-base">{match.team2.join('\n')}</div>
                                      </div>
                                    </div>

                                    {!isCompleted && (
                                      <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-3">
                                        <span className="text-sm text-slate-500">
                                          {match.status === 'in_progress' ? (
                                            <span className="flex items-center gap-1.5">
                                              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                                              <span className="font-medium text-slate-700">실시간 진행중 {match.score_team1 ?? 0} : {match.score_team2 ?? 0}</span>
                                            </span>
                                          ) : (
                                            '점수 등록 전입니다.'
                                          )}
                                        </span>
                                        {match.id && (
                                          <Link
                                            href={`/scoreboard/${match.id}`}
                                            className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                                          >
                                            {match.status === 'in_progress' ? '🔴 LIVE 보기' : '📋 점수판'}
                                          </Link>
                                        )}
                                      </div>
                                    )}
                                    {match.referee_name && (
                                      <div className="mt-2 text-xs text-slate-400 text-center">
                                        심판: <span className="font-medium text-slate-600">{match.referee_name}</span>
                                      </div>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(userActiveTab === 'results' || userActiveTab.startsWith('group_')) && (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {isPairCustomTournament
                          ? userActiveTab.startsWith('group_')
                            ? `${userActiveTab.replace('group_', '')} 순위`
                            : '페어별 종합 순위'
                          : '전체 경기결과'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {isPairCustomTournament
                          ? '대회에 등록된 페어별 경기 결과를 순위별로 표시합니다.'
                          : '선택된 회차와 관계없이 등록된 모든 경기 결과를 통합해 표시합니다.'}
                      </p>
                    </div>
                    {!hasResultData ? (
                      <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        입력된 경기 결과가 아직 없습니다.
                      </div>
                    ) : isPairCustomTournament ? (
                      <div className="space-y-6">
                        <div>
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-slate-900">
                              {userActiveTab.startsWith('group_')
                                ? `${userActiveTab.replace('group_', '')} 결과`
                                : '종합 순위'}
                            </h3>
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              {filteredPairStats.length}개 페어
                            </span>
                          </div>

                          {filteredPairStats.length === 0 ? (
                            <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              결과가 등록된 경기가 없습니다.
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                              {filteredPairStats.map((entry, index) => (
                                <article key={entry.pairKey} className="relative rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50/40 to-orange-50/40 px-5 py-5 shadow-sm">
                                  {/* 순위 표시 뱃지 */}
                                  <div className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white shadow-sm">
                                    {index + 1}
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-base font-bold text-slate-900 truncate pr-6">{entry.pairKey}</p>
                                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200/50">
                                          {entry.groupName}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-600">
                                          승률 {entry.matches > 0 ? `${((entry.wins / entry.matches) * 100).toFixed(1)}%` : '0%'}
                                        </span>
                                        <span className="text-xs text-slate-300">|</span>
                                        <span className={`text-xs font-bold ${entry.pointsDiff > 0 ? 'text-blue-600' : entry.pointsDiff < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                          득실차 {entry.pointsDiff > 0 ? `+${entry.pointsDiff}` : entry.pointsDiff}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-xs">
                                    <div className="rounded-xl bg-white/80 px-1 py-2 border border-amber-100">
                                      <p className="text-[10px] text-slate-500">경기</p>
                                      <p className="mt-0.5 font-bold text-slate-700">{entry.matches}</p>
                                    </div>
                                    <div className="rounded-xl bg-emerald-50 px-1 py-2">
                                      <p className="text-[10px] text-emerald-700">승</p>
                                      <p className="mt-0.5 font-bold text-emerald-700">{entry.wins}</p>
                                    </div>
                                    <div className="rounded-xl bg-rose-50 px-1 py-2">
                                      <p className="text-[10px] text-rose-700">패</p>
                                      <p className="mt-0.5 font-bold text-rose-700">{entry.losses}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 px-1 py-2">
                                      <p className="text-[10px] text-slate-500">무</p>
                                      <p className="mt-0.5 font-bold text-slate-700">{entry.draws}</p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {teamStatsEntries.length > 0 && (
                          <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h3 className="text-base font-semibold text-slate-900">팀별 결과</h3>
                              <span className="text-xs text-slate-500">{teamStatsEntries.length}개 팀</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              {teamStatsEntries.map(([teamName, stats]) => (
                                <article key={teamName} className="rounded-[24px] border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 px-5 py-5 shadow-sm">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-lg font-semibold text-slate-900">{teamName}</p>
                                      <p className="mt-1 text-sm text-slate-600">승률 {stats.matches > 0 ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%` : '0%'}</p>
                                    </div>
                                    <div className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm">{stats.matches}경기</div>
                                  </div>
                                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                                    <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                                      <p className="text-[11px] text-emerald-700">승</p>
                                      <p className="mt-1 font-semibold text-emerald-700">{stats.wins}</p>
                                    </div>
                                    <div className="rounded-2xl bg-rose-50 px-2 py-3">
                                      <p className="text-[11px] text-rose-700">패</p>
                                      <p className="mt-1 font-semibold text-rose-700">{stats.losses}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-2 py-3">
                                      <p className="text-[11px] text-slate-500">무</p>
                                      <p className="mt-1 font-semibold text-slate-700">{stats.draws}</p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-slate-900">선수별 검색</h3>
                            <span className="text-xs text-slate-500">검색으로만 확인</span>
                          </div>
                          <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                type="text"
                                value={playerSearchQuery}
                                onChange={(event) => setPlayerSearchQuery(event.target.value)}
                                placeholder="선수 이름을 입력하세요"
                                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                              />
                              <button
                                type="button"
                                onClick={() => setSubmittedPlayerSearchQuery(playerSearchQuery)}
                                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:min-w-24"
                              >
                                검색
                              </button>
                            </div>
                            {!normalizedPlayerSearchQuery ? (
                              <p className="mt-3 text-sm text-slate-500">선수 이름을 검색하면 개인 경기 결과를 확인할 수 있습니다.</p>
                            ) : filteredPlayerStatsEntries.length === 0 ? (
                              <p className="mt-3 text-sm text-slate-500">검색된 선수가 없습니다.</p>
                            ) : (
                              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {filteredPlayerStatsEntries.map(([player, stats]) => (
                                  <article key={player} className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <p className="text-base font-semibold text-slate-900">{player}</p>
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                            {stats.teamLabel}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">승률 {stats.matches > 0 ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%` : '0%'}</p>
                                      </div>
                                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{stats.matches}경기</div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-sm">
                                      <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                                        <p className="text-[11px] text-emerald-700">승</p>
                                        <p className="mt-1 font-semibold text-emerald-700">{stats.wins}</p>
                                      </div>
                                      <div className="rounded-2xl bg-rose-50 px-2 py-3">
                                        <p className="text-[11px] text-rose-700">패</p>
                                        <p className="mt-1 font-semibold text-rose-700">{stats.losses}</p>
                                      </div>
                                      <div className="rounded-2xl bg-slate-50 px-2 py-3">
                                        <p className="text-[11px] text-slate-500">무</p>
                                        <p className="mt-1 font-semibold text-slate-700">{stats.draws}</p>
                                      </div>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            ) : (
              <section className="rounded-[24px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
