import type { Database } from '@/types/supabase';
import type { getSupabaseClient } from '@/lib/supabase';

type BrowserSupabaseClient = ReturnType<typeof getSupabaseClient>;
type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentMatchRow = Database['public']['Tables']['tournament_matches']['Row'];

export interface MyTournamentMatchView {
  id: string;
  tournament_id: string;
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
  tournament_title?: string;
  tournament_date?: string | null;
  match_type?: string | null;
}

export const normalizeTournamentPlayerName = (value?: string | null) =>
  String(value || '')
    .replace(/\s+/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

export async function fetchMyTournamentMatches(
  supabase: BrowserSupabaseClient,
  profile?: {
    username?: string | null;
    full_name?: string | null;
  } | null
): Promise<{
  allTournamentMatchCount: number;
  matches: MyTournamentMatchView[];
}> {
  const searchNames = [profile?.username, profile?.full_name]
    .map((value) => normalizeTournamentPlayerName(value))
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

  if (searchNames.length === 0) {
    return {
      allTournamentMatchCount: 0,
      matches: [],
    };
  }

  const { data: allMatches, error: matchesError } = await supabase
    .from('tournament_matches')
    .select('*')
    .order('scheduled_time', { ascending: true });

  if (matchesError) {
    throw matchesError;
  }

  const filteredMatches = ((allMatches || []) as TournamentMatchRow[]).filter((match) => {
    const team1Names = (match.team1 || []).map((name) => normalizeTournamentPlayerName(name));
    const team2Names = (match.team2 || []).map((name) => normalizeTournamentPlayerName(name));
    return searchNames.some((name) => team1Names.includes(name) || team2Names.includes(name));
  });

  const tournamentIds = Array.from(
    new Set(filteredMatches.map((match) => match.tournament_id).filter((id): id is string => Boolean(id)))
  );

  let tournamentMap = new Map<string, Pick<TournamentRow, 'title' | 'tournament_date' | 'match_type'>>();

  if (tournamentIds.length > 0) {
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id, title, tournament_date, match_type')
      .in('id', tournamentIds);

    if (tournamentsError) {
      throw tournamentsError;
    }

    tournamentMap = new Map(
      (tournaments || []).map((tournament) => [
        tournament.id,
        {
          title: tournament.title,
          tournament_date: tournament.tournament_date,
          match_type: tournament.match_type,
        },
      ])
    );
  }

  const matches: MyTournamentMatchView[] = filteredMatches.map((match) => {
    const tournament = tournamentMap.get(match.tournament_id);
    return {
      ...match,
      winner: (match.winner as MyTournamentMatchView['winner']) ?? null,
      tournament_title: tournament?.title || '대회',
      tournament_date: tournament?.tournament_date || null,
      match_type: tournament?.match_type || null,
    };
  });

  return {
    allTournamentMatchCount: allMatches?.length || 0,
    matches,
  };
}
