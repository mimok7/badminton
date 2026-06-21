import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';
import { createBalancedDoublesMatches, createMixedAndSameSexDoublesMatches, createRandomBalancedDoublesMatches } from '@/utils/match-utils';
import type { Player } from '@/types';

type TeamAssignmentRow = {
  id: string;
  team_type: string | null;
  racket_team: unknown;
  shuttle_team: unknown;
  pairs_data: unknown;
};

type TournamentRow = {
  id: string;
  match_type: string | null;
  matches_per_player: number | null;
  team_assignment_id: string;
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

async function recoverTournamentMatches(
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>,
  tournament: TournamentRow
) {
  const { data: assignment, error: assignmentError } = await adminSupabase
    .from('team_assignments')
    .select('id, team_type, racket_team, shuttle_team, pairs_data')
    .eq('id', tournament.team_assignment_id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return { recovered: false, error: assignmentError?.message || 'Team assignment not found' };
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
    return { recovered: false, error: 'Not enough players to recover tournament matches' };
  }

  const players: Player[] = uniquePlayers.map((name, index) => ({
    id: `recover-${tournament.id}-${index}`,
    name,
    skill_level: extractSkillLevel(name),
    skill_label: extractSkillLevel(name).toUpperCase(),
    skill_code: extractSkillLevel(name),
    gender: 'mixed',
  }));

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
    return { recovered: false, error: 'Recovered match list is empty' };
  }

  const { error: insertError } = await adminSupabase
    .from('tournament_matches')
    .insert(matchesToInsert);

  if (insertError) {
    return { recovered: false, error: insertError.message };
  }

  return { recovered: true, error: null };
}

async function requireAdminOrManager() {
  const supabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const userRole = await getUserRole(supabase, user);
  if (!userRole || !['admin', 'manager'].includes(userRole)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminSupabase };
}

export async function GET(request: Request) {
  try {
    const adminContext = await requireAdminOrManager();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const requestUrl = new URL(request.url);
    const tournamentId = requestUrl.searchParams.get('tournament_id');
    const includeMatches = requestUrl.searchParams.get('include_matches');

    const { data, error } = await adminContext.adminSupabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ tournaments: [] });
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch tournaments',
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    const tournaments = data || [];

    if (includeMatches === '1' || includeMatches === 'true') {
      const selectedTournament =
        (tournamentId ? tournaments.find((tournament) => tournament.id === tournamentId) : null) ||
        tournaments[0] ||
        null;
      const targetTournamentId = selectedTournament?.id || null;

      if (!targetTournamentId) {
        return NextResponse.json({ tournaments, selectedTournament: null, matches: [] });
      }

      const { data: matchesData, error: matchesError } = await adminContext.adminSupabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', targetTournamentId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true });

      if (matchesError) {
        return NextResponse.json(
          {
            error: 'Failed to fetch tournament matches',
            code: matchesError.code,
            message: matchesError.message,
            details: matchesError.details,
            hint: matchesError.hint,
          },
          { status: 500 }
        );
      }

      let normalizedMatches = matchesData || [];

      if (normalizedMatches.length === 0 && selectedTournament?.team_assignment_id) {
        const recoveryResult = await recoverTournamentMatches(
          adminContext.adminSupabase,
          selectedTournament as TournamentRow
        );

        if (recoveryResult.recovered) {
          const { data: recoveredMatches, error: recoveredMatchesError } = await adminContext.adminSupabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', targetTournamentId)
            .order('round', { ascending: true })
            .order('match_number', { ascending: true });

          if (recoveredMatchesError) {
            return NextResponse.json(
              {
                error: 'Failed to fetch recovered tournament matches',
                code: recoveredMatchesError.code,
                message: recoveredMatchesError.message,
                details: recoveredMatchesError.details,
                hint: recoveredMatchesError.hint,
              },
              { status: 500 }
            );
          }

          normalizedMatches = recoveredMatches || [];
        }
      }

      return NextResponse.json({
        tournaments,
        selectedTournament,
        matches: normalizedMatches,
      });
    }

    return NextResponse.json({ tournaments });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdminOrManager();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const payload = await request.json().catch(() => null);
    const tournament = payload?.tournament;
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];

    if (!tournament || typeof tournament !== 'object') {
      return NextResponse.json({ error: 'Invalid tournament payload' }, { status: 400 });
    }

    const tournamentToInsert = {
      title: typeof tournament.title === 'string' ? tournament.title : '',
      tournament_date: typeof tournament.tournament_date === 'string' ? tournament.tournament_date : '',
      round_number: typeof tournament.round_number === 'number' ? tournament.round_number : 1,
      match_type: typeof tournament.match_type === 'string' ? tournament.match_type : 'random',
      team_assignment_id: typeof tournament.team_assignment_id === 'string' ? tournament.team_assignment_id : '',
      team_type: typeof tournament.team_type === 'string' ? tournament.team_type : '',
      total_teams: typeof tournament.total_teams === 'number' ? tournament.total_teams : 0,
      matches_per_player: typeof tournament.matches_per_player === 'number' ? tournament.matches_per_player : 1,
    };

    if (!tournamentToInsert.title || !tournamentToInsert.tournament_date || !tournamentToInsert.team_assignment_id || !tournamentToInsert.team_type) {
      return NextResponse.json({ error: 'Invalid tournament payload' }, { status: 400 });
    }

    const { data: createdTournament, error: tournamentError } = await adminContext.adminSupabase
      .from('tournaments')
      .insert(tournamentToInsert)
      .select()
      .single();

    if (tournamentError) {
      return NextResponse.json(
        {
          error: 'Failed to create tournament',
          code: tournamentError.code,
          message: tournamentError.message,
          details: tournamentError.details,
          hint: tournamentError.hint,
        },
        { status: 500 }
      );
    }

    if (matches.length > 0) {
      const matchesToSave = matches.map((match: any) => ({
        tournament_id: createdTournament.id,
        round: typeof match?.round === 'number' ? match.round : 1,
        match_number: typeof match?.match_number === 'number' ? match.match_number : 0,
        team1: Array.isArray(match?.team1) ? match.team1.filter((value: unknown): value is string => typeof value === 'string') : [],
        team2: Array.isArray(match?.team2) ? match.team2.filter((value: unknown): value is string => typeof value === 'string') : [],
        court: typeof match?.court === 'string' ? match.court : '',
        scheduled_time: typeof match?.scheduled_time === 'string' ? match.scheduled_time : null,
        status:
          match?.status === 'in_progress' || match?.status === 'completed'
            ? match.status
            : 'pending',
        score_team1: typeof match?.score_team1 === 'number' ? match.score_team1 : null,
        score_team2: typeof match?.score_team2 === 'number' ? match.score_team2 : null,
        winner:
          match?.winner === 'team1' || match?.winner === 'team2' || match?.winner === 'draw'
            ? match.winner
            : null,
      }));

      const hasInvalidMatch = matchesToSave.some(
        (match: {
          match_number: number;
          team1: string[];
          team2: string[];
          court: string;
        }) => match.match_number <= 0 || match.team1.length === 0 || match.team2.length === 0 || !match.court
      );

      if (hasInvalidMatch) {
        return NextResponse.json({ error: 'Invalid tournament matches payload' }, { status: 400 });
      }

      const { error: matchesError } = await adminContext.adminSupabase
        .from('tournament_matches')
        .insert(matchesToSave as any);

      if (matchesError) {
        return NextResponse.json(
          {
            error: 'Failed to save tournament matches',
            code: matchesError.code,
            message: matchesError.message,
            details: matchesError.details,
            hint: matchesError.hint,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, tournament: createdTournament });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const adminContext = await requireAdminOrManager();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const payload = await request.json().catch(() => null);
    const matchId = typeof payload?.match_id === 'string' ? payload.match_id : '';
    const scoreTeam1 = typeof payload?.score_team1 === 'number' ? payload.score_team1 : null;
    const scoreTeam2 = typeof payload?.score_team2 === 'number' ? payload.score_team2 : null;

    if (!matchId || scoreTeam1 == null || scoreTeam2 == null) {
      return NextResponse.json({ error: 'Invalid score payload' }, { status: 400 });
    }

    const winner = scoreTeam1 > scoreTeam2 ? 'team1' : scoreTeam2 > scoreTeam1 ? 'team2' : 'draw';

    const { data, error } = await adminContext.adminSupabase
      .from('tournament_matches')
      .update({
        score_team1: scoreTeam1,
        score_team2: scoreTeam2,
        winner,
        status: 'completed',
      })
      .eq('id', matchId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: 'Failed to update tournament match score',
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, match: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
