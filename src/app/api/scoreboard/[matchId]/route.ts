import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';

type RouteContext = { params: Promise<{ matchId: string }> };

// referee_id / referee_name 은 마이그레이션으로 추가된 컬럼이라
// Supabase 생성 타입에 아직 반영되지 않았을 수 있으므로 확장 타입 사용
type MatchRow = Record<string, unknown>;

// GET: 매치 정보 조회
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;

    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const adminSupabase = getSupabaseAdminClient();

    const { data: rawMatch, error } = await adminSupabase
      .from('tournament_matches')
      .select('*')
      .eq('id', matchId)
      .single();
    const match = rawMatch as MatchRow | null;

    if (error || !match) {
      return NextResponse.json(
        { error: 'Match not found', details: error?.message },
        { status: 404 }
      );
    }

    // 현재 로그인 사용자 확인
    let currentUserId: string | null = null;
    let currentUserRole: string | null = null;
    let currentUserName: string | null = null;

    try {
      const serverSupabase = await getSupabaseServerClient();
      const { data: { user } } = await serverSupabase.auth.getUser();

      if (user) {
        currentUserId = user.id;
        currentUserRole = await getUserRole(serverSupabase, user);

        const { data: profile } = await adminSupabase
          .from('profiles')
          .select('full_name')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();

        currentUserName = profile?.full_name || null;
      }
    } catch {
      // 비로그인 사용자도 조회 가능
    }

    const matchRefereeId = (match as MatchRow).referee_id as string | null;
    const matchRefereeName = (match as MatchRow).referee_name as string | null;
    const isReferee =
      currentUserId != null &&
      (matchRefereeId === currentUserId || matchRefereeName === currentUserName);
    const isAdmin = currentUserRole === 'admin' || currentUserRole === 'manager';
    const canEdit = isReferee || isAdmin;

    return NextResponse.json({
      match: {
        id: match.id,
        tournament_id: match.tournament_id,
        round: match.round,
        match_number: match.match_number,
        team1: match.team1,
        team2: match.team2,
        court: match.court,
        status: match.status,
        score_team1: (match.score_team1 as number | null) ?? 0,
        score_team2: (match.score_team2 as number | null) ?? 0,
        winner: match.winner,
        referee_id: matchRefereeId,
        referee_name: matchRefereeName,
      },
      canEdit,
      isReferee,
      isAdmin,
      currentUserName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PATCH: 점수 업데이트 (심판 또는 관리자만)
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;

    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const serverSupabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = getSupabaseAdminClient();

    // 현재 매치 확인
    const { data: rawMatch, error: matchError } = await adminSupabase
      .from('tournament_matches')
      .select('*')
      .eq('id', matchId)
      .single();
    const match = rawMatch as MatchRow | null;

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // 권한 확인
    const userRole = await getUserRole(serverSupabase, user);
    const isAdmin = userRole === 'admin' || userRole === 'manager';

    // 사용자 프로필 조회
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('full_name')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    const currentUserName = profile?.full_name || null;
    const matchRefereeId = (match as MatchRow).referee_id as string | null;
    const matchRefereeName = (match as MatchRow).referee_name as string | null;
    const isReferee =
      matchRefereeId === user.id || matchRefereeName === currentUserName;

    if (!isReferee && !isAdmin) {
      return NextResponse.json(
        { error: '심판 또는 관리자만 점수를 입력할 수 있습니다.' },
        { status: 403 }
      );
    }

    const payload = await request.json().catch(() => null);
    const scoreTeam1 = typeof payload?.score_team1 === 'number' ? payload.score_team1 : null;
    const scoreTeam2 = typeof payload?.score_team2 === 'number' ? payload.score_team2 : null;

    if (scoreTeam1 == null || scoreTeam2 == null) {
      return NextResponse.json({ error: 'Invalid score payload' }, { status: 400 });
    }

    // 점수 업데이트 (경기 진행 중 상태로)
    const updateData: Record<string, unknown> = {
      score_team1: scoreTeam1,
      score_team2: scoreTeam2,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    };

    const { data: updatedMatch, error: updateError } = await adminSupabase
      .from('tournament_matches')
      .update(updateData)
      .eq('id', matchId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update score', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, match: updatedMatch });
  } catch (error) {
    return NextResponse.json(
      { error: 'Server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST: 경기 완료 처리
export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;

    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const serverSupabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = getSupabaseAdminClient();

    // 현재 매치 확인
    const { data: rawMatch, error: matchError } = await adminSupabase
      .from('tournament_matches')
      .select('*')
      .eq('id', matchId)
      .single();
    const match = rawMatch as MatchRow | null;

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // 권한 확인
    const userRole = await getUserRole(serverSupabase, user);
    const isAdmin = userRole === 'admin' || userRole === 'manager';

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('full_name')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    const currentUserName = profile?.full_name || null;
    const matchRefereeId = (match as MatchRow).referee_id as string | null;
    const matchRefereeName = (match as MatchRow).referee_name as string | null;
    const isReferee =
      matchRefereeId === user.id || matchRefereeName === currentUserName;

    if (!isReferee && !isAdmin) {
      return NextResponse.json(
        { error: '심판 또는 관리자만 경기를 완료할 수 있습니다.' },
        { status: 403 }
      );
    }

    const payload = await request.json().catch(() => null);
    const finalScore1 = typeof payload?.score_team1 === 'number' ? payload.score_team1 : ((match.score_team1 as number | null) ?? 0);
    const finalScore2 = typeof payload?.score_team2 === 'number' ? payload.score_team2 : ((match.score_team2 as number | null) ?? 0);

    const winner =
      finalScore1 > finalScore2 ? 'team1' : finalScore2 > finalScore1 ? 'team2' : 'draw';

    const { data: updatedMatch, error: updateError } = await adminSupabase
      .from('tournament_matches')
      .update({
        score_team1: finalScore1,
        score_team2: finalScore2,
        winner,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to complete match', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, match: updatedMatch, winner });
  } catch (error) {
    return NextResponse.json(
      { error: 'Server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
