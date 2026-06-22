import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

type TeamAssignmentRow = {
  id: string;
  assignment_date: string;
  round_number: number;
  title: string;
  team_type: string | null;
  racket_team: unknown;
  shuttle_team: unknown;
  team1: unknown;
  team2: unknown;
  team3: unknown;
  team4: unknown;
  pairs_data: unknown;
};

type TournamentRow = {
  id: string;
  title: string;
  tournament_date: string;
  round_number: number;
  team_assignment_id: string | null;
  match_type: string | null;
  team_type: string | null;
  total_teams: number | null;
  matches_per_player: number | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round: number;
  match_number: number;
  team1: string[] | null;
  team2: string[] | null;
  court: string | null;
  scheduled_time: string | null;
  status: string | null;
  score_team1: number | null;
  score_team2: number | null;
  winner: 'team1' | 'team2' | 'draw' | null;
};

type TournamentMetrics = {
  matchCount: number;
  teamCount: number;
  playerCount: number;
  roundCount: number;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toPairsRecord = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, toStringArray(raw)])
  );
};

const extractSkillLevel = (nameWithLevel: string) => {
  const match = nameWithLevel.match(/\(([^)]+)\)(?!.*\()$/);
  return match ? match[1].toLowerCase().trim() : 'e2';
};

const getTeamKey = (players: string[]) =>
  [...players].map((player) => player.trim()).sort((left, right) => left.localeCompare(right, 'ko-KR')).join(' / ');

function isResultMatch(match: MatchRow) {
  return typeof match.score_team1 === 'number' && typeof match.score_team2 === 'number';
}

function normalizeMatches(data: MatchRow[]) {
  return (data || [])
    .map((match) => ({
      ...match,
      team1: toStringArray(match.team1),
      team2: toStringArray(match.team2),
      court: match.court || '',
      scheduled_time: match.scheduled_time || null,
      status: isResultMatch(match) ? 'completed' : match.status || 'pending',
      score_team1: match.score_team1 ?? null,
      score_team2: match.score_team2 ?? null,
      winner:
        typeof match.score_team1 === 'number' && typeof match.score_team2 === 'number'
          ? match.score_team1 > match.score_team2
            ? 'team1'
            : match.score_team2 > match.score_team1
              ? 'team2'
              : 'draw'
          : match.winner ?? null,
    }))
    .sort((left, right) => {
      const roundDiff = (left.round || 0) - (right.round || 0);
      if (roundDiff !== 0) {
        return roundDiff;
      }

      return (left.match_number || 0) - (right.match_number || 0);
    });
}

function getTournamentMetricsFromMatches(tournamentMatches: MatchRow[]): TournamentMetrics {
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
      uniqueTeams.add(getTeamKey(team1));
      team1.forEach((player) => uniquePlayers.add(player));
    }

    if (team2.length > 0) {
      uniqueTeams.add(getTeamKey(team2));
      team2.forEach((player) => uniquePlayers.add(player));
    }
  });

  return {
    matchCount: normalizedMatches.length,
    teamCount: uniqueTeams.size,
    playerCount: uniquePlayers.size,
    roundCount: uniqueRounds.size,
  };
}

async function fetchTeamAssignment(assignmentId: string | null | undefined) {
  if (!assignmentId) {
    return null;
  }

  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from('team_assignments')
    .select('id, assignment_date, round_number, title, team_type, racket_team, shuttle_team, team1, team2, team3, team4, pairs_data')
    .eq('id', assignmentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...data,
    racket_team: toStringArray(data.racket_team),
    shuttle_team: toStringArray(data.shuttle_team),
    team1: toStringArray(data.team1),
    team2: toStringArray(data.team2),
    team3: toStringArray(data.team3),
    team4: toStringArray(data.team4),
    pairs_data: toPairsRecord(data.pairs_data),
  };
}

async function fetchTeamAssignmentsByTournament(tournaments: TournamentRow[]) {
  const entries = await Promise.all(
    tournaments.map(async (tournament) => {
      const assignment = await fetchTeamAssignment(tournament.team_assignment_id);
      return [tournament.id, assignment] as const;
    })
  );

  return Object.fromEntries(entries);
}

async function recoverTournamentMatches(tournament: TournamentRow) {
  if (!tournament.team_assignment_id) {
    return { recovered: false };
  }

  const adminSupabase = getSupabaseAdminClient();
  const { data: assignment, error: assignmentError } = await adminSupabase
    .from('team_assignments')
    .select('id, assignment_date, round_number, title, team_type, racket_team, shuttle_team, team1, team2, team3, team4, pairs_data')
    .eq('id', tournament.team_assignment_id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return { recovered: false };
  }

  const assignmentRow = assignment as TeamAssignmentRow;
  const playerList: string[] = [];

  if (assignmentRow.team_type === 'pairs') {
    Object.values(toPairsRecord(assignmentRow.pairs_data)).forEach((players) => {
      playerList.push(...players);
    });
  } else {
    playerList.push(...toStringArray(assignmentRow.racket_team));
    playerList.push(...toStringArray(assignmentRow.shuttle_team));
  }

  const uniquePlayers = [...new Set(playerList)]
    .filter((player) => player && typeof player === 'string')
    .map((player) => player.trim());

  if (uniquePlayers.length < 4) {
    return { recovered: false };
  }

  const players = uniquePlayers.map((name, index) => ({
    id: `recover-${tournament.id}-${index}`,
    name,
    skill_level: extractSkillLevel(name),
    skill_label: extractSkillLevel(name).toUpperCase(),
    skill_code: extractSkillLevel(name),
    gender: 'mixed' as const,
  }));

  const { createBalancedDoublesMatches, createMixedAndSameSexDoublesMatches, createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
  const numberOfCourts = 4;
  const minGamesPerPlayer = Math.max(1, tournament.matches_per_player || 1);

  let generatedMatches;
  if (tournament.match_type === 'level_based') {
    generatedMatches = createBalancedDoublesMatches(players, numberOfCourts, minGamesPerPlayer);
  } else if (tournament.match_type === 'mixed_doubles') {
    generatedMatches = createMixedAndSameSexDoublesMatches(players, numberOfCourts, minGamesPerPlayer);
  } else {
    generatedMatches = createRandomBalancedDoublesMatches(players, numberOfCourts, minGamesPerPlayer);
  }

  const matchesToInsert = generatedMatches.map((match, index) => ({
    tournament_id: tournament.id,
    round: 1,
    match_number: index + 1,
    team1: [match.team1.player1.name, match.team1.player2.name],
    team2: [match.team2.player1.name, match.team2.player2.name],
    court: `Court ${match.court || ((index % numberOfCourts) + 1)}`,
    status: 'pending' as const,
    scheduled_time: null,
    score_team1: null,
    score_team2: null,
    winner: null,
  }));

  if (matchesToInsert.length === 0) {
    return { recovered: false };
  }

  const { error: insertError } = await adminSupabase.from('tournament_matches').insert(matchesToInsert);
  return { recovered: !insertError };
}

export async function GET(request: Request) {
  try {
    const serverSupabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = getSupabaseAdminClient();
    const requestUrl = new URL(request.url);
    const tournamentId = requestUrl.searchParams.get('tournament_id');
    const includeMatches = requestUrl.searchParams.get('include_matches');

    const { data, error } = await adminSupabase
      .from('tournaments')
      .select('*')
      .order('round_number', { ascending: true })
      .order('tournament_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ tournaments: [], metricsByTournament: {} });
      }

      return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
    }

    const tournaments = (data || []) as TournamentRow[];
    const { data: allMatchesData, error: allMatchesError } = await adminSupabase
      .from('tournament_matches')
      .select('*');

    if (allMatchesError && allMatchesError.code !== '42P01') {
      return NextResponse.json({ error: 'Failed to fetch tournament metrics' }, { status: 500 });
    }

    const groupedMatches = new Map<string, MatchRow[]>();
    ((allMatchesData || []) as MatchRow[]).forEach((match) => {
      const current = groupedMatches.get(match.tournament_id) || [];
      current.push(match);
      groupedMatches.set(match.tournament_id, current);
    });

    const metricsByTournament = Object.fromEntries(
      tournaments.map((tournament) => [tournament.id, getTournamentMetricsFromMatches(groupedMatches.get(tournament.id) || [])])
    );
    const teamAssignmentsByTournament = await fetchTeamAssignmentsByTournament(tournaments);

    if (includeMatches === '1' || includeMatches === 'true') {
      const selectedTournament =
        (tournamentId ? tournaments.find((tournament) => tournament.id === tournamentId) : null) ||
        tournaments[0] ||
        null;

      if (!selectedTournament) {
        return NextResponse.json({
          tournaments,
          metricsByTournament,
          teamAssignmentsByTournament,
          selectedTournament: null,
          selectedTeamAssignment: null,
          matches: [],
          allMatches: normalizeMatches((allMatchesData || []) as MatchRow[]),
        });
      }

      let matches = groupedMatches.get(selectedTournament.id) || [];

      if (matches.length === 0 && selectedTournament.team_assignment_id) {
        const recoveryResult = await recoverTournamentMatches(selectedTournament);
        if (recoveryResult.recovered) {
          const { data: recoveredMatches } = await adminSupabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', selectedTournament.id)
            .order('round', { ascending: true })
            .order('match_number', { ascending: true });

          matches = (recoveredMatches || []) as MatchRow[];
        }
      }

      const selectedTeamAssignment = await fetchTeamAssignment(selectedTournament.team_assignment_id);

      return NextResponse.json({
        tournaments,
        metricsByTournament,
        teamAssignmentsByTournament,
        selectedTournament,
        selectedTeamAssignment,
        matches: normalizeMatches(matches),
        allMatches: normalizeMatches((allMatchesData || []) as MatchRow[]),
      });
    }

    return NextResponse.json({ tournaments, metricsByTournament, teamAssignmentsByTournament });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unexpected server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
