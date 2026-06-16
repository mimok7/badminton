import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';

async function requireAdmin() {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const adminContext = await requireAdmin();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { sessionId } = await params;

    const { data: matches, error } = await adminContext.adminSupabase
      .from('generated_matches')
      .select('id, session_id, match_number, status, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
      .eq('session_id', sessionId)
      .order('match_number', { ascending: true });

    if (error) {
      console.error('Admin generated matches GET error:', error);
      return NextResponse.json({ error: 'Failed to load generated matches' }, { status: 500 });
    }

    const rows = matches || [];
    if (rows.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    const profileIds = Array.from(
      new Set(
        rows.flatMap((match) => [
          match.team1_player1_id,
          match.team1_player2_id,
          match.team2_player1_id,
          match.team2_player2_id,
        ]).filter((id): id is string => Boolean(id))
      )
    );

    const { data: profiles, error: profilesError } = await adminContext.adminSupabase
      .from('profiles')
      .select('id, username, full_name, skill_level')
      .in('id', profileIds);

    if (profilesError) {
      console.error('Admin profiles for generated matches GET error:', profilesError);
      return NextResponse.json({ error: 'Failed to load player profiles' }, { status: 500 });
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

    const { data: schedules, error: schedulesError } = await adminContext.adminSupabase
      .from('match_schedules')
      .select('generated_match_id')
      .in('generated_match_id', rows.map((match) => match.id));

    if (schedulesError) {
      console.error('Admin match schedules for generated matches GET error:', schedulesError);
      return NextResponse.json({ error: 'Failed to load schedule info' }, { status: 500 });
    }

    const scheduledIds = new Set(
      (schedules || [])
        .map((schedule) => schedule.generated_match_id)
        .filter((id): id is number => typeof id === 'number')
    );

    const getProfileName = (
      profile?: { username: string | null; full_name: string | null } | null,
      fallback = '선수'
    ) => profile?.full_name || profile?.username || fallback;

    const normalizedMatches = rows.map((match) => ({
      id: match.id,
      session_id: match.session_id,
      match_number: match.match_number,
      status: match.status || 'scheduled',
      team1_player1: {
        name: getProfileName(profileMap.get(match.team1_player1_id || '') || null, '선수1'),
        skill_level: profileMap.get(match.team1_player1_id || '')?.skill_level || 'E2',
      },
      team1_player2: {
        name: getProfileName(profileMap.get(match.team1_player2_id || '') || null, '선수2'),
        skill_level: profileMap.get(match.team1_player2_id || '')?.skill_level || 'E2',
      },
      team2_player1: {
        name: getProfileName(profileMap.get(match.team2_player1_id || '') || null, '선수3'),
        skill_level: profileMap.get(match.team2_player1_id || '')?.skill_level || 'E2',
      },
      team2_player2: {
        name: getProfileName(profileMap.get(match.team2_player2_id || '') || null, '선수4'),
        skill_level: profileMap.get(match.team2_player2_id || '')?.skill_level || 'E2',
      },
      is_scheduled: scheduledIds.has(match.id),
    }));

    return NextResponse.json({ matches: normalizedMatches });
  } catch (error) {
    console.error('Admin generated matches GET unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
