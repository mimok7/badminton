import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getKoreaDate } from '@/lib/date';
import type { ScheduledMatchView } from '@/lib/scheduled-matches';

type ProfileRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
};

const getProfileName = (profile?: Pick<ProfileRow, 'username' | 'full_name'> | null, fallback = '선수') =>
  profile?.full_name || profile?.username || fallback;

export async function GET(request: Request) {
  try {
    const serverSupabase = await getSupabaseServerClient();
    const adminSupabase = getSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const date = requestUrl.searchParams.get('date') || getKoreaDate();
    const userId = requestUrl.searchParams.get('userId') || '';

    const { data: schedules, error: schedulesError } = await adminSupabase
      .from('match_schedules')
      .select('id, generated_match_id, match_date, scheduled_time, start_time, court_number, status')
      .eq('match_date', date)
      .eq('status', 'scheduled')
      .order('court_number', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .order('start_time', { ascending: true });

    if (schedulesError) {
      console.error('Scheduled matches schedules error:', schedulesError);
      return NextResponse.json({ error: 'Failed to load scheduled matches' }, { status: 500 });
    }

    const scheduleRows = (schedules || []).filter((schedule): schedule is {
      id: string;
      generated_match_id: number | null;
      match_date: string | null;
      scheduled_time: string | null;
      start_time: string | null;
      court_number: number | null;
      status: string;
    } => Boolean(schedule.id));

    if (scheduleRows.length === 0) {
      return NextResponse.json({ matches: [] satisfies ScheduledMatchView[] });
    }

    const generatedMatchIds = Array.from(
      new Set(
        scheduleRows
          .map((schedule) => schedule.generated_match_id)
          .filter((id): id is number => typeof id === 'number')
      )
    );

    if (generatedMatchIds.length === 0) {
      return NextResponse.json({ matches: [] satisfies ScheduledMatchView[] });
    }

    const { data: generatedMatches, error: generatedMatchesError } = await adminSupabase
      .from('generated_matches')
      .select('id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
      .in('id', generatedMatchIds);

    if (generatedMatchesError) {
      console.error('Scheduled matches generated matches error:', generatedMatchesError);
      return NextResponse.json({ error: 'Failed to load generated matches' }, { status: 500 });
    }

    const generatedMatchesById = new Map<number, {
      id: number;
      team1_player1_id: string | null;
      team1_player2_id: string | null;
      team2_player1_id: string | null;
      team2_player2_id: string | null;
    }>();

    (generatedMatches || []).forEach((match) => {
      generatedMatchesById.set(match.id, match);
    });

    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('id, user_id, username, full_name');

    if (profilesError) {
      console.error('Scheduled matches profiles error:', profilesError);
      return NextResponse.json({ error: 'Failed to load player profiles' }, { status: 500 });
    }

    const profileMap = new Map<string, ProfileRow>();
    (profiles || []).forEach((profile) => {
      if (profile.id) profileMap.set(profile.id, profile);
      if (profile.user_id) profileMap.set(profile.user_id, profile);
    });

    const filterIds = userId
      ? Array.from(
          new Set(
            (profiles || [])
              .flatMap((profile) => (profile.id === userId || profile.user_id === userId ? [profile.id, profile.user_id] : []))
              .filter((value): value is string => Boolean(value))
          )
        )
      : [];

    const visibleSchedules = filterIds.length > 0
      ? scheduleRows.filter((schedule) => {
          const match = typeof schedule.generated_match_id === 'number'
            ? generatedMatchesById.get(schedule.generated_match_id)
            : null;

          return Boolean(
            match &&
              filterIds.some((filterId) =>
                [
                  match.team1_player1_id,
                  match.team1_player2_id,
                  match.team2_player1_id,
                  match.team2_player2_id,
                ].includes(filterId)
              )
          );
        })
      : scheduleRows;

    const matches: ScheduledMatchView[] = visibleSchedules.map((schedule) => {
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

    return NextResponse.json({ matches });
  } catch (error) {
    console.error('Scheduled matches route unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}