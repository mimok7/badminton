import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getKoreaDate } from '@/lib/date';
import type { ScheduledMatchView } from '@/lib/scheduled-matches';
import { getLevelNameFromCode, type LevelInfoMap } from '@/lib/level-info';

type ProfileRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  skill_level: string | null;
  gender: string | null;
  coin_balance: number | null;
};

const getProfileName = (profile?: Pick<ProfileRow, 'username' | 'full_name'> | null, fallback = '선수') =>
  profile?.full_name || profile?.username || fallback;

const getProfileGender = (profile?: Pick<ProfileRow, 'gender'> | null) => profile?.gender || null;

function normalizeMatchResult(value: unknown): ScheduledMatchView['match_result'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const winner = record.winner === 'team1' || record.winner === 'team2' ? record.winner : undefined;
  const score = typeof record.score === 'string' ? record.score : undefined;
  const team1Score = typeof record.team1_score === 'number' ? record.team1_score : undefined;
  const team2Score = typeof record.team2_score === 'number' ? record.team2_score : undefined;
  const totalLosingPool =
    typeof record.total_losing_pool === 'number' ? record.total_losing_pool : undefined;

  return {
    winner,
    score,
    team1_score: team1Score,
    team2_score: team2Score,
    total_losing_pool: totalLosingPool,
  };
}

function parseGeneratedDescriptionOrder(description?: string | null) {
  const normalized = description?.replace(/^\[일반 경기\]\s*/u, '').trim() || '';
  const matched = normalized.match(/^(?:\d{4}-\d{2}-\d{2}[_\s]+)?(\d+)-(\d+)$/u);

  if (!matched) {
    return { batch: 9999, order: 9999 };
  }

  return {
    batch: Number(matched[1]),
    order: Number(matched[2]),
  };
}

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
      .select('id, generated_match_id, match_date, scheduled_date, scheduled_time, start_time, court_number, location, description, status, match_result')
      .or(`match_date.eq.${date},scheduled_date.eq.${date}`)
      .order('court_number', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .order('start_time', { ascending: true });

    if (schedulesError) {
      console.error('Scheduled matches schedules error:', schedulesError);
      return NextResponse.json({ error: 'Failed to load scheduled matches' }, { status: 500 });
    }

    const scheduleRows = (schedules || []).filter((schedule) => Boolean(schedule.id));

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
      .select('id, match_number, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
      .in('id', generatedMatchIds);

    if (generatedMatchesError) {
      console.error('Scheduled matches generated matches error:', generatedMatchesError);
      return NextResponse.json({ error: 'Failed to load generated matches' }, { status: 500 });
    }

    const generatedMatchesById = new Map<number, {
      id: number;
      match_number: number | null;
      team1_player1_id: string | null;
      team1_player2_id: string | null;
      team2_player1_id: string | null;
      team2_player2_id: string | null;
    }>();

    (generatedMatches || []).forEach((match) => {
      generatedMatchesById.set(match.id, match);
    });

    const playerIds = new Set<string>();
    if (userId) {
      playerIds.add(userId);
    }
    (generatedMatches || []).forEach((match) => {
      if (match.team1_player1_id) playerIds.add(match.team1_player1_id);
      if (match.team1_player2_id) playerIds.add(match.team1_player2_id);
      if (match.team2_player1_id) playerIds.add(match.team2_player1_id);
      if (match.team2_player2_id) playerIds.add(match.team2_player2_id);
    });

    const targetPlayerIds = Array.from(playerIds);
    let profiles: ProfileRow[] = [];

    if (targetPlayerIds.length > 0) {
      const { data: profilesData, error: profilesError } = await adminSupabase
        .from('profiles')
        .select('id, user_id, username, full_name, skill_level, gender, coin_balance')
        .in('id', targetPlayerIds);

      if (profilesError) {
        console.error('Scheduled matches profiles error:', profilesError);
        return NextResponse.json({ error: 'Failed to load player profiles' }, { status: 500 });
      }
      profiles = (profilesData || []) as ProfileRow[];
    }

    const profileMap = new Map<string, ProfileRow>();
    profiles.forEach((profile) => {
      if (profile.id) profileMap.set(profile.id, profile);
      if (profile.user_id) profileMap.set(profile.user_id, profile);
    });

    const { data: levelRows, error: levelRowsError } = await adminSupabase
      .from('level_info')
      .select('code, name, score');

    if (levelRowsError) {
      console.error('Scheduled matches level info error:', levelRowsError);
      return NextResponse.json({ error: 'Failed to load level info' }, { status: 500 });
    }

    const levelInfoMap = (levelRows || []).reduce<LevelInfoMap>((acc, row: any) => {
      if (row.code) {
        acc[String(row.code).trim().toLowerCase()] = {
          name: row.name || row.code,
          score: Number(row.score ?? 0),
        };
      }
      return acc;
    }, {});

    const filterIds = userId
      ? Array.from(
          new Set(
            (profiles || [])
              .flatMap((profile) => (profile.id === userId || profile.user_id === userId ? [profile.id, profile.user_id] : []))
              .filter((value): value is string => Boolean(value))
          )
        )
      : [];

    const { data: activeCourts, error: activeCourtsError } = await adminSupabase
      .from('courts')
      .select('name, location, order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (activeCourtsError) {
      console.error('Scheduled matches active courts error:', activeCourtsError);
    }

    const courtByNumber = new Map<number, { name: string | null; location: string | null }>();
    (activeCourts || []).forEach((court, index) => {
      courtByNumber.set(index + 1, {
        name: court.name || null,
        location: court.location || null,
      });
    });

    const generatedScheduleRows = scheduleRows.filter((schedule) => {
      if (typeof schedule.generated_match_id !== 'number') {
        return false;
      }

      return generatedMatchesById.has(schedule.generated_match_id);
    });

    const visibleSchedules = filterIds.length > 0
      ? generatedScheduleRows.filter((schedule) => {
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
      : generatedScheduleRows;

    const matches: ScheduledMatchView[] = visibleSchedules.map((schedule) => {
      const generatedMatch = typeof schedule.generated_match_id === 'number'
        ? generatedMatchesById.get(schedule.generated_match_id)
        : null;
      const configuredCourt =
        typeof schedule.court_number === 'number' ? courtByNumber.get(schedule.court_number) : null;

      const team1Player1Id = generatedMatch?.team1_player1_id || null;
      const team1Player2Id = generatedMatch?.team1_player2_id || null;
      const team2Player1Id = generatedMatch?.team2_player1_id || null;
      const team2Player2Id = generatedMatch?.team2_player2_id || null;

      return {
        id: schedule.id,
        generated_match_id: schedule.generated_match_id,
        match_number: generatedMatch?.match_number ?? null,
        description: schedule.description || null,
        match_date: schedule.match_date || schedule.scheduled_date || date,
        match_time: schedule.scheduled_time || schedule.start_time || null,
        court_number: schedule.court_number,
        court_name: configuredCourt?.name || null,
        location: schedule.location || configuredCourt?.location || null,
        status: schedule.status,
        match_result: normalizeMatchResult(schedule.match_result),
        team1_player1: team1Player1Id,
        team1_player2: team1Player2Id,
        team2_player1: team2Player1Id,
        team2_player2: team2Player2Id,
        team1_player1_name: getProfileName(profileMap.get(team1Player1Id || '') || null, '선수1'),
        team1_player2_name: getProfileName(profileMap.get(team1Player2Id || '') || null, '선수2'),
        team2_player1_name: getProfileName(profileMap.get(team2Player1Id || '') || null, '선수3'),
        team2_player2_name: getProfileName(profileMap.get(team2Player2Id || '') || null, '선수4'),
        team1_player1_skill_level: profileMap.get(team1Player1Id || '')?.skill_level ?? null,
        team1_player2_skill_level: profileMap.get(team1Player2Id || '')?.skill_level ?? null,
        team2_player1_skill_level: profileMap.get(team2Player1Id || '')?.skill_level ?? null,
        team2_player2_skill_level: profileMap.get(team2Player2Id || '')?.skill_level ?? null,
        team1_player1_skill_level_name: getLevelNameFromCode(levelInfoMap, profileMap.get(team1Player1Id || '')?.skill_level, null),
        team1_player2_skill_level_name: getLevelNameFromCode(levelInfoMap, profileMap.get(team1Player2Id || '')?.skill_level, null),
        team2_player1_skill_level_name: getLevelNameFromCode(levelInfoMap, profileMap.get(team2Player1Id || '')?.skill_level, null),
        team2_player2_skill_level_name: getLevelNameFromCode(levelInfoMap, profileMap.get(team2Player2Id || '')?.skill_level, null),
        team1_player1_coin_balance: profileMap.get(team1Player1Id || '')?.coin_balance ?? null,
        team1_player2_coin_balance: profileMap.get(team1Player2Id || '')?.coin_balance ?? null,
        team2_player1_coin_balance: profileMap.get(team2Player1Id || '')?.coin_balance ?? null,
        team2_player2_coin_balance: profileMap.get(team2Player2Id || '')?.coin_balance ?? null,
        team1_player1_gender: getProfileGender(profileMap.get(team1Player1Id || '') || null),
        team1_player2_gender: getProfileGender(profileMap.get(team1Player2Id || '') || null),
        team2_player1_gender: getProfileGender(profileMap.get(team2Player1Id || '') || null),
        team2_player2_gender: getProfileGender(profileMap.get(team2Player2Id || '') || null),
      };
    });

    matches.sort((left, right) => {
      const leftOrder = parseGeneratedDescriptionOrder(left.description);
      const rightOrder = parseGeneratedDescriptionOrder(right.description);

      const batchDiff = leftOrder.batch - rightOrder.batch;
      if (batchDiff !== 0) {
        return batchDiff;
      }

      const orderDiff = leftOrder.order - rightOrder.order;
      if (orderDiff !== 0) {
        return orderDiff;
      }

      const matchNumberDiff = (left.match_number ?? 9999) - (right.match_number ?? 9999);
      if (matchNumberDiff !== 0) {
        return matchNumberDiff;
      }

      const courtDiff = (left.court_number ?? 999) - (right.court_number ?? 999);
      if (courtDiff !== 0) {
        return courtDiff;
      }

      return (left.match_time || '').localeCompare(right.match_time || '', 'ko');
    });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error('Scheduled matches route unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
