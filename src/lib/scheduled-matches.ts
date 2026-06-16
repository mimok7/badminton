import type { Database } from '@/types/supabase';
import type { getSupabaseClient } from '@/lib/supabase';

type BrowserSupabaseClient = ReturnType<typeof getSupabaseClient>;
type MatchScheduleRow = Database['public']['Tables']['match_schedules']['Row'];
type GeneratedMatchRow = Database['public']['Tables']['generated_matches']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface ScheduledMatchView {
  id: string;
  generated_match_id: number | null;
  match_date: string | null;
  match_time: string | null;
  court_number: number | null;
  status: string;
  team1_player1: string | null;
  team1_player2: string | null;
  team2_player1: string | null;
  team2_player2: string | null;
  team1_player1_name: string;
  team1_player2_name: string;
  team2_player1_name: string;
  team2_player2_name: string;
}

const getProfileName = (profile?: Pick<ProfileRow, 'username' | 'full_name'> | null, fallback = '선수') =>
  profile?.full_name || profile?.username || fallback;

export async function fetchScheduledMatchesForDate(
  supabase: BrowserSupabaseClient,
  date: string,
  userId?: string
): Promise<ScheduledMatchView[]> {
  const { data: schedules, error: schedulesError } = await supabase
    .from('match_schedules')
    .select('id, generated_match_id, match_date, scheduled_time, start_time, court_number, status')
    .eq('match_date', date)
    .eq('status', 'scheduled')
    .order('court_number', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .order('start_time', { ascending: true });

  if (schedulesError) {
    throw schedulesError;
  }

  const validSchedules = (schedules || []).filter(
    (
      schedule
    ): schedule is Pick<
      MatchScheduleRow,
      'id' | 'generated_match_id' | 'match_date' | 'scheduled_time' | 'start_time' | 'court_number' | 'status'
    > => typeof schedule.id === 'string'
  );

  if (validSchedules.length === 0) {
    return [];
  }

  const generatedMatchIds = Array.from(
    new Set(
      validSchedules
        .map((schedule) => schedule.generated_match_id)
        .filter((id): id is number => typeof id === 'number')
    )
  );

  const generatedMatchesById = new Map<number, Pick<
    GeneratedMatchRow,
    'id' | 'team1_player1_id' | 'team1_player2_id' | 'team2_player1_id' | 'team2_player2_id'
  >>();

  if (generatedMatchIds.length > 0) {
    const { data: generatedMatches, error: generatedMatchesError } = await supabase
      .from('generated_matches')
      .select('id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
      .in('id', generatedMatchIds);

    if (generatedMatchesError) {
      throw generatedMatchesError;
    }

    (generatedMatches || []).forEach((match) => {
      generatedMatchesById.set(match.id, match);
    });
  }

  let filterProfileId: string | null = null;

  if (userId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id')
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    filterProfileId = profile?.id || userId;
  }

  const filteredSchedules = filterProfileId
    ? validSchedules.filter((schedule) => {
        const match = typeof schedule.generated_match_id === 'number'
          ? generatedMatchesById.get(schedule.generated_match_id)
          : null;

        return Boolean(
          match &&
            (match.team1_player1_id === filterProfileId ||
              match.team1_player2_id === filterProfileId ||
              match.team2_player1_id === filterProfileId ||
              match.team2_player2_id === filterProfileId)
        );
      })
    : validSchedules;

  if (filteredSchedules.length === 0) {
    return [];
  }

  const playerIds = Array.from(
    new Set(
      filteredSchedules
        .flatMap((schedule) => {
          const match = typeof schedule.generated_match_id === 'number'
            ? generatedMatchesById.get(schedule.generated_match_id)
            : null;

          return match
            ? [
                match.team1_player1_id,
                match.team1_player2_id,
                match.team2_player1_id,
                match.team2_player2_id,
              ]
            : [];
        })
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const profileMap = new Map<string, Pick<ProfileRow, 'id' | 'username' | 'full_name'>>();

  if (playerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', playerIds);

    if (profilesError) {
      throw profilesError;
    }

    (profiles || []).forEach((profile) => {
      profileMap.set(profile.id, profile);
    });
  }

  return filteredSchedules.map((schedule) => {
    const generatedMatch = typeof schedule.generated_match_id === 'number'
      ? generatedMatchesById.get(schedule.generated_match_id)
      : null;

    const team1Player1Id = generatedMatch?.team1_player1_id || null;
    const team1Player2Id = generatedMatch?.team1_player2_id || null;
    const team2Player1Id = generatedMatch?.team2_player1_id || null;
    const team2Player2Id = generatedMatch?.team2_player2_id || null;

    return {
      id: schedule.id,
      generated_match_id: schedule.generated_match_id,
      match_date: schedule.match_date,
      match_time: schedule.scheduled_time || schedule.start_time || null,
      court_number: schedule.court_number,
      status: schedule.status,
      team1_player1: team1Player1Id,
      team1_player2: team1Player2Id,
      team2_player1: team2Player1Id,
      team2_player2: team2Player2Id,
      team1_player1_name: getProfileName(profileMap.get(team1Player1Id || '') || null, '선수1'),
      team1_player2_name: getProfileName(profileMap.get(team1Player2Id || '') || null, '선수2'),
      team2_player1_name: getProfileName(profileMap.get(team2Player1Id || '') || null, '선수3'),
      team2_player2_name: getProfileName(profileMap.get(team2Player2Id || '') || null, '선수4'),
    };
  });
}
