'use client';

import { useEffect, useState } from 'react';
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
}

type ScoreDraft = {
  score1: string;
  score2: string;
};

type AdminTournamentTab = 'overview' | 'results';

type TournamentBracketViewProps = {
  adminMode?: boolean;
};

type TournamentMetrics = {
  matchCount: number;
  teamCount: number;
  playerCount: number;
  roundCount: number;
};

function formatCourtLabel(court: string) {
  const trimmedCourt = court.trim();

  if (!trimmedCourt) {
    return '코트 미정';
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
  return title.replace(/^라뚱 대회/, '대회경기').replace(/\s*\([^)]*\)\s*$/, '');
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
    return Object.entries(teamAssignment.pairs_data || {})
      .map(([label, players]) => ({ label, players }))
      .filter((group) => group.players.length > 0);
  }

  if (teamAssignment.team_type === '2teams') {
    return [
      { label: '1팀', players: (teamAssignment.racket_team && teamAssignment.racket_team.length > 0 ? teamAssignment.racket_team : teamAssignment.team1) || [] },
      { label: '2팀', players: (teamAssignment.shuttle_team && teamAssignment.shuttle_team.length > 0 ? teamAssignment.shuttle_team : teamAssignment.team2) || [] },
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

  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [
      key,
      Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [],
    ])
  );
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
  };
}

export default function TournamentBracketView({ adminMode = false }: TournamentBracketViewProps) {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentMetrics, setTournamentMetrics] = useState<Record<string, TournamentMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [availableTeams, setAvailableTeams] = useState<TeamAssignment[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamAssignment | null>(null);
  const [selectedTournamentAssignment, setSelectedTournamentAssignment] = useState<TeamAssignment | null>(null);
  const [showPlayerAssignments, setShowPlayerAssignments] = useState(!adminMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminActiveTab, setAdminActiveTab] = useState<AdminTournamentTab>('overview');

  const tournamentQueryId = searchParams.get('tournament');

  const matchTypeMeta: Record<string, { label: string; badge: string }> = {
    level_based: { label: '레벨', badge: 'bg-blue-100 text-blue-700' },
    mixed_doubles: { label: '혼복', badge: 'bg-rose-100 text-rose-700' },
    random: { label: '랜덤', badge: 'bg-emerald-100 text-emerald-700' },
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

        setMatches(normalizeMatches(Array.isArray(payload?.matches) ? payload.matches : []));
        setLoadError(null);
        return;
      }

      const { data, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true });

      if (error) throw error;

      setMatches(normalizeMatches((data || []) as Match[]));
      setLoadError(null);
    } catch (error) {
      console.error('경기 조회 오류:', error);
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
      setSelectedTournamentAssignment(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .eq('id', assignmentId)
        .single();

      if (error) throw error;

      setSelectedTournamentAssignment(mapTeamAssignmentRow(data));
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

      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('round_number', { ascending: true })
        .order('tournament_date', { ascending: true });

      if (error && error.code !== '42P01') throw error;

      const tournamentList = data || [];
      setTournaments(tournamentList);
      await fetchTournamentMetrics(tournamentList);

      if (tournamentList.length > 0) {
        const initialTournament = tournamentQueryId
          ? tournamentList.find((tournament) => tournament.id === tournamentQueryId) || tournamentList[0]
          : tournamentList[0];
        await handleSelectTournament(initialTournament);
      } else {
        setSelectedTournament(null);
        setSelectedTournamentAssignment(null);
        setMatches([]);
      }
    } catch (error) {
      console.error('대회 조회 오류:', error);
      setTournaments([]);
      setTournamentMetrics({});
      setSelectedTournament(null);
      setSelectedTournamentAssignment(null);
      setMatches([]);
      setLoadError(error instanceof Error ? error.message : '대회 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTeams = async () => {
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

    const players = uniquePlayers.map((name, index) => ({
      id: `player-${index}-${Date.now()}`,
      name,
      skill_level: 'e2',
      skill_label: 'E2 (초급)',
      skill_code: 'e2',
      gender: 'mixed' as const,
    }));

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
      const tournamentTitle = `대회경기 ${selectedTeam.round_number}회차 ${matchTypeLabel}`;
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

  const getPlayerStats = () => {
    const playerStats: Record<string, { matches: number; wins: number; losses: number; draws: number; teamLabel: string }> = {};
    const playerToTeamLabel = new Map<string, string>();

    if (selectedTournamentAssignment) {
      getAssignmentTeamGroups(selectedTournamentAssignment).forEach((group) => {
        group.players.forEach((player) => playerToTeamLabel.set(player.trim(), group.label));
      });
    }

    matches.forEach((match) => {
      if (!isResultMatch(match)) return;

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

  const getTeamStats = () => {
    const teamStats: Record<string, { matches: number; wins: number; losses: number; draws: number }> = {};
    const playerToTeamLabel = new Map<string, string>();
    const hasOriginalTeamMapping = Boolean(selectedTournamentAssignment);

    if (selectedTournamentAssignment) {
      const teamGroups = getAssignmentTeamGroups(selectedTournamentAssignment);

      teamGroups.forEach((group) => {
        teamStats[group.label] = { matches: 0, wins: 0, losses: 0, draws: 0 };
        group.players.forEach((player) => playerToTeamLabel.set(player.trim(), group.label));
      });
    }

    matches.forEach((match) => {
      if (!isResultMatch(match)) return;

      const resolvedWinner = getResolvedWinner(match);
      const team1Labels = [...new Set(match.team1.map((player) => playerToTeamLabel.get(player.trim())).filter(Boolean))] as string[];
      const team2Labels = [...new Set(match.team2.map((player) => playerToTeamLabel.get(player.trim())).filter(Boolean))] as string[];

      if (hasOriginalTeamMapping) {
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

  const playerStatsEntries = Object.entries(getPlayerStats()).sort(([leftName, left], [rightName, right]) => {
    const leftWinRate = left.matches > 0 ? left.wins / left.matches : 0;
    const rightWinRate = right.matches > 0 ? right.wins / right.matches : 0;
    if (rightWinRate !== leftWinRate) {
      return rightWinRate - leftWinRate;
    }

    return leftName.localeCompare(rightName, 'ko-KR');
  });
  const teamStatsEntries = Object.entries(getTeamStats()).sort(([, left], [, right]) => {
    const leftWinRate = left.matches > 0 ? left.wins / left.matches : 0;
    const rightWinRate = right.matches > 0 ? right.wins / right.matches : 0;
    return rightWinRate - leftWinRate;
  });

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${adminMode ? 'bg-gray-50' : 'bg-[#f5f7fb]'}`}>
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">대진표를 불러오는 중입니다</div>
      </div>
    );
  }

  const containerClassName = adminMode
    ? 'flex w-full max-w-none flex-col gap-6 px-1 py-2 2xl:px-3'
    : 'mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5';

  const title = adminMode ? '관리자 대진표' : '🏆 대회 대진표';
  const description = adminMode
    ? '관리자는 큰 화면에서 팀 구성, 대회 생성, 경기 결과를 한 번에 관리할 수 있습니다.'
    : '모바일에서도 대회 목록과 대진표만 빠르게 확인할 수 있도록 정리했습니다.';
  const homeHref = adminMode ? '/admin' : '/dashboard';
  const homeLabel = adminMode ? '관리자 홈' : '홈';
  const selectedTournamentMetrics = selectedTournament
    ? getTournamentMetrics(selectedTournament.id) || getTournamentMetricsFromMatches(matches)
    : null;

  return (
    <div className={`min-h-screen ${adminMode ? 'bg-gray-50 text-slate-900' : 'bg-[#f5f7fb] text-slate-900'}`}>
      <div className={containerClassName}>
        <section className={`${adminMode ? 'rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-sm' : 'rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>{adminMode ? 'Admin Tournament Center' : 'Tournament Center'}</p>
              <h1 className={`mt-1 ${adminMode ? 'text-3xl font-bold text-slate-900' : 'text-2xl font-semibold'}`}>{title}</h1>
              <p className={`mt-2 text-sm leading-6 ${adminMode ? 'max-w-3xl text-slate-600' : 'text-slate-300'}`}>{description}</p>
            </div>
            <Link
              href={homeHref}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${adminMode ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white/10 text-white hover:bg-white/15'}`}
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
                {[
                  { key: 'overview' as const, label: '대회 관리' },
                  { key: 'results' as const, label: '경기 결과' },
                ].map((tab) => (
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
                        <div className="grid gap-4 xl:grid-cols-4">
                          {matches.map((match, index) => {
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

                            return (
                              <article key={match.id || `match-view-${index}`} className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/70' : isPending ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70'}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{displayRound}회차 - {displayMatchNumber}경기</p>
                                    <p className="mt-1 text-xs text-slate-500">{formatCourtLabel(match.court)}</p>
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
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">새 대회 생성</h2>
                        </div>
                        {showPlayerAssignments ? (
                          <button
                            onClick={() => setShowPlayerAssignments(false)}
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                          >
                            숨기기
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowPlayerAssignments(true)}
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                          >
                            표시
                          </button>
                        )}
                      </div>

                      {showPlayerAssignments && (
                        <>
                          {availableTeams.length === 0 ? (
                            <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              오늘 등록된 팀 구성이 없습니다.
                            </div>
                          ) : (
                            <div className="mt-4 grid gap-3">
                              {availableTeams.map((team) => (
                                <button
                                  key={team.id}
                                  onClick={() => setSelectedTeam(team)}
                                  className={`w-full rounded-[24px] border p-4 text-left transition-all ${
                                    selectedTeam?.id === team.id
                                      ? 'border-emerald-500 bg-emerald-50 shadow-[0_14px_34px_-18px_rgba(16,185,129,0.55)]'
                                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-base font-semibold text-slate-900">{team.title}</div>
                                      <div className="mt-1 space-y-1 text-sm text-slate-600">
                                        <div>📅 {new Date(team.assignment_date).toLocaleDateString('ko-KR')}</div>
                                        <div>🔢 {team.round_number}회차</div>
                                      </div>
                                    </div>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                                      {team.team_type === 'pairs' ? `${Object.keys(team.pairs_data || {}).length}개 페어` : team.team_type.replace('teams', '팀')}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {selectedTeam && (
                            <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
                              <h3 className="text-base font-semibold text-slate-900">대회 설정</h3>
                              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">1인당 경기수</label>
                                  <input
                                    id="admin-matchesPerPlayer"
                                    type="number"
                                    min="1"
                                    max="10"
                                    defaultValue="3"
                                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">경기 타입</label>
                                  <select
                                    id="admin-matchType"
                                    defaultValue="random"
                                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                                  >
                                    <option value="level_based">🎯 레벨</option>
                                    <option value="random">🎲 랜덤</option>
                                    <option value="mixed_doubles">💑 혼복</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const matchesPerPlayer = parseInt((document.getElementById('admin-matchesPerPlayer') as HTMLInputElement)?.value || '3', 10);
                                  const matchType = (document.getElementById('admin-matchType') as HTMLSelectElement)?.value || 'random';
                                  void createTournamentWithMatches(matchesPerPlayer, matchType);
                                }}
                                className="mt-4 w-full rounded-2xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700"
                              >
                                대회 생성하기
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  </>
                ) : (
                  <section className="rounded-[24px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm" />
                )}
              </div>
            )}

            {adminActiveTab === 'results' && (
              <div className="space-y-6">
                {matches.length > 0 ? (
                  <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-slate-900">경기 결과</h2>
                      {selectedTournament && (
                        <p className="mt-1 text-sm text-slate-500">{formatTournamentTitle(selectedTournament.title)}</p>
                      )}
                    </div>

                    {teamStatsEntries.length === 0 && playerStatsEntries.length === 0 ? (
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
            <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
              <div className="mb-4">
                <p className="text-xs text-slate-500">대회 선택</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">저장된 대회</h2>
                <p className="mt-1 text-sm text-slate-500">선택하면 아래 대진표가 표시됩니다.</p>
              </div>

              {tournaments.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  진행 중인 대회가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {tournaments.map((tournament) => {
                    const metrics = getTournamentMetrics(tournament.id);

                    return (
                      <button
                        key={tournament.id}
                        onClick={() => {
                          void handleSelectTournament(tournament);
                        }}
                        className={`w-full rounded-[24px] border-2 p-4 text-left transition-all ${
                          selectedTournament?.id === tournament.id
                            ? 'border-blue-500 bg-blue-50 shadow-[0_14px_34px_-18px_rgba(59,130,246,0.45)]'
                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{formatTournamentTitle(tournament.title)}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              <div>📅 {new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</div>
                              <div>🎾 {metrics?.matchCount ?? tournament.total_teams}경기</div>
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
              <div className="space-y-6">
                <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                  <div className="mb-4">
                    <p className="text-xs text-slate-500">경기 일정</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">대진표 ({matches.length}경기)</h3>
                  </div>
                  {matches.length === 0 ? (
                    <p className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">경기가 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                        {matches.map((match, index) => {
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

                        return (
                          <article key={match.id || `match-view-${index}`} className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/70' : isPending ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{displayRound}회차 - {displayMatchNumber}경기</p>
                                <p className="mt-1 text-xs text-slate-500">{formatCourtLabel(match.court)}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-800' : isPending ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                                {isCompleted ? '완료' : isPending ? '대기중' : '진행중'}
                              </span>
                            </div>

                            <div className="mt-4 space-y-2 text-sm">
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
                                    : 'bg-[#0f172a] hover:bg-slate-800'
                                }`}
                              >
                                저장
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
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
