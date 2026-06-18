import { NextResponse } from 'next/server';
import { getProfileByUserId, isAdminRole } from '@/lib/auth';
import { DEFAULT_MATCH_WAGER, MAX_MATCH_WAGER } from '@/lib/coins';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

type MatchRow = {
  id: number;
  status: string;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};

async function getAuthorizedContext(matchId: number) {
  const serverSupabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();
  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);

  if (!currentProfile) {
    return { error: NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 }) };
  }

  const { data: match, error: matchError } = await adminSupabase
    .from('generated_matches')
    .select('id, status, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
    .eq('id', matchId)
    .single<MatchRow>();

  if (matchError || !match) {
    return { error: NextResponse.json({ error: '경기를 찾을 수 없습니다.' }, { status: 404 }) };
  }

  const participantIds = [
    match.team1_player1_id,
    match.team1_player2_id,
    match.team2_player1_id,
    match.team2_player2_id,
  ].filter((value): value is string => Boolean(value));

  const isParticipant = participantIds.includes(currentProfile.id);

  if (!isParticipant && !isAdminRole(currentProfile.role)) {
    return { error: NextResponse.json({ error: '이 경기의 참가자 또는 관리자만 접근할 수 있습니다.' }, { status: 403 }) };
  }

  return {
    adminSupabase,
    currentProfile,
    match,
    participantIds,
  };
}

export async function GET(request: Request) {
  const matchId = Number(new URL(request.url).searchParams.get('match_id'));

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Missing match_id' }, { status: 400 });
  }

  const context = await getAuthorizedContext(matchId);
  if ('error' in context) return context.error;

  const { adminSupabase, currentProfile, participantIds } = context;

  const { data: betRows, error } = await adminSupabase
    .from('match_coin_bets')
    .select('profile_id, wager_amount')
    .eq('match_id', matchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bets = participantIds.map((profileId) => {
    const row = (betRows || []).find((item) => item.profile_id === profileId);
    return {
      profile_id: profileId,
      wager_amount: row?.wager_amount ?? DEFAULT_MATCH_WAGER,
    };
  });

  return NextResponse.json({
    match_id: matchId,
    my_profile_id: currentProfile.id,
    defaultWager: DEFAULT_MATCH_WAGER,
    maxWager: MAX_MATCH_WAGER,
    bets,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const matchId = Number(body?.match_id);
  const wagerAmount = Number(body?.wager_amount);

  if (!Number.isFinite(matchId) || !Number.isInteger(wagerAmount)) {
    return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
  }

  if (wagerAmount < DEFAULT_MATCH_WAGER || wagerAmount > MAX_MATCH_WAGER) {
    return NextResponse.json({ error: `배팅 코인은 ${DEFAULT_MATCH_WAGER}~${MAX_MATCH_WAGER}개만 가능합니다.` }, { status: 400 });
  }

  const context = await getAuthorizedContext(matchId);
  if ('error' in context) return context.error;

  const { adminSupabase, currentProfile, match } = context;

  if (match.status === 'in_progress' || match.status === 'completed' || match.status === 'cancelled') {
    return NextResponse.json({ error: '진행중이거나 완료된 경기에는 배팅을 변경할 수 없습니다.' }, { status: 400 });
  }

  if ((currentProfile.coin_balance ?? 0) < wagerAmount) {
    return NextResponse.json({ error: '보유 코인보다 큰 배팅은 설정할 수 없습니다.' }, { status: 400 });
  }

  const { error } = await adminSupabase
    .from('match_coin_bets')
    .upsert(
      {
        match_id: matchId,
        profile_id: currentProfile.id,
        wager_amount: wagerAmount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id,profile_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    match_id: matchId,
    profile_id: currentProfile.id,
    wager_amount: wagerAmount,
  });
}
