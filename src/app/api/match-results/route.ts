import { NextResponse } from 'next/server';
import { getProfileByUserId, isAdminOrManagerRole } from '@/lib/auth';
import { readCoinSettings } from '@/lib/coin-settings';
import { DEFAULT_MATCH_WAGER, MAX_MATCH_WAGER, type CoinSettlementMode } from '@/lib/coins';
import { notifyWaitingMatchesForSession } from '@/lib/match-preparation-notifications';
import { syncSessionMatchFlow } from '@/lib/match-session-flow';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

type MatchParticipantRow = {
  id: number;
  session_id?: string | null;
  match_number?: number | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
  match_result: unknown;
};

type CoinTransactionRow = {
  profile_id: string;
  delta: number;
  transaction_type: string;
  wager_amount: number;
};

function getFriendlyErrorMessage(message: string): string {
  if (message.includes('score_limit')) {
    return '점수는 25점을 초과할 수 없습니다.';
  }
  return message;
}

function allocateWinningPool(winningWagers: number[], losingTotal: number) {
  const winningTotal = winningWagers.reduce((sum, wager) => sum + wager, 0);

  if (winningTotal <= 0) {
    throw new Error('배팅 코인 합계가 올바르지 않습니다.');
  }

  const gains: number[] = [];
  let allocated = 0;

  winningWagers.forEach((wager) => {
    const gain = Math.floor((losingTotal * wager) / winningTotal);
    gains.push(gain);
    allocated += gain;
  });

  let remainder = losingTotal - allocated;
  let index = 0;
  while (remainder > 0 && gains.length > 0) {
    gains[index] += 1;
    remainder -= 1;
    index = (index + 1) % gains.length;
  }

  return gains;
}

function buildCoinDeltas(params: {
  mode: CoinSettlementMode;
  winnerTeam1: boolean;
  team1Wagers: number[];
  team2Wagers: number[];
  fixedWinnerReward: number;
}) {
  const { mode, winnerTeam1, team1Wagers, team2Wagers, fixedWinnerReward } = params;
  const losingWagers = winnerTeam1 ? team2Wagers : team1Wagers;
  const losingTotal = losingWagers.reduce((sum, wager) => sum + wager, 0);
  const winningWagers = winnerTeam1 ? team1Wagers : team2Wagers;

  const zeroSumWinningGains = allocateWinningPool(winningWagers, losingTotal);

  if (mode === 'zero_sum') {
    return {
      team1: winnerTeam1 ? zeroSumWinningGains : team1Wagers.map((wager) => -wager),
      team2: winnerTeam1 ? team2Wagers.map((wager) => -wager) : zeroSumWinningGains,
      totalLosingPool: losingTotal,
    };
  }

  if (mode === 'winner_only_pool') {
    return {
      team1: winnerTeam1 ? zeroSumWinningGains : team1Wagers.map(() => 0),
      team2: winnerTeam1 ? team2Wagers.map(() => 0) : zeroSumWinningGains,
      totalLosingPool: losingTotal,
    };
  }

  return {
    team1: winnerTeam1 ? team1Wagers.map(() => fixedWinnerReward) : team1Wagers.map(() => 0),
    team2: winnerTeam1 ? team2Wagers.map(() => 0) : team2Wagers.map(() => fixedWinnerReward),
    totalLosingPool: losingTotal,
  };
}

export async function POST(request: Request) {
  const serverSupabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const normalizedMatchId = Number(body?.match_id);
  const normalizedTeam1Score = Number(body?.team1_score);
  const normalizedTeam2Score = Number(body?.team2_score);
  const winnerTeam1 = body?.winner_team1;

  if (
    !Number.isFinite(normalizedMatchId) ||
    typeof winnerTeam1 !== 'boolean' ||
    !Number.isFinite(normalizedTeam1Score) ||
    !Number.isFinite(normalizedTeam2Score)
  ) {
    return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
  }

  if (normalizedTeam1Score < 0 || normalizedTeam2Score < 0) {
    return NextResponse.json({ error: '점수는 0 이상이어야 합니다.' }, { status: 400 });
  }

  if (normalizedTeam1Score === normalizedTeam2Score) {
    return NextResponse.json({ error: '무승부 결과는 저장할 수 없습니다.' }, { status: 400 });
  }

  if ((normalizedTeam1Score > normalizedTeam2Score) !== winnerTeam1) {
    return NextResponse.json({ error: '승리 팀과 점수가 일치하지 않습니다.' }, { status: 400 });
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);
  const coinSettings = await readCoinSettings();

  if (!currentProfile) {
    return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: matchRow, error: matchError } = await adminSupabase
    .from('generated_matches')
    .select('id, session_id, match_number, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_result')
    .eq('id', normalizedMatchId)
    .single<MatchParticipantRow>();

  if (matchError || !matchRow) {
    return NextResponse.json({ error: '경기 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const canManage = isAdminOrManagerRole(currentProfile.role);

  if (!canManage) {
    return NextResponse.json({ error: '점수 저장은 관리자 또는 매니저만 가능합니다.' }, { status: 403 });
  }

  const { data: betRows, error: betError } = await adminSupabase
    .from('match_coin_bets')
    .select('profile_id, wager_amount')
    .eq('match_id', normalizedMatchId);

  if (betError) {
    return NextResponse.json({ error: betError.message }, { status: 500 });
  }

  const team1Bets = [matchRow.team1_player1_id, matchRow.team1_player2_id]
    .filter((value): value is string => Boolean(value))
    .map((profileId) => (betRows || []).find((row) => row.profile_id === profileId)?.wager_amount ?? DEFAULT_MATCH_WAGER);
  const team2Bets = [matchRow.team2_player1_id, matchRow.team2_player2_id]
    .filter((value): value is string => Boolean(value))
    .map((profileId) => (betRows || []).find((row) => row.profile_id === profileId)?.wager_amount ?? DEFAULT_MATCH_WAGER);

  const hasRaisedBet = [...team1Bets, ...team2Bets].some((wager) => wager > DEFAULT_MATCH_WAGER);
  const symmetricRaisedBet =
    team1Bets.length > 0 &&
    team2Bets.length > 0 &&
    team1Bets.every((wager) => wager === team1Bets[0]) &&
    team2Bets.every((wager) => wager === team2Bets[0]) &&
    team1Bets[0] === team2Bets[0];

  if (hasRaisedBet && !symmetricRaisedBet) {
    return NextResponse.json(
      { error: '한 팀이 1코인 이상 올렸다면 상대팀도 동일한 코인으로 배팅해야 경기를 시작할 수 있습니다.' },
      { status: 400 }
    );
  }

  const team1Ids = [matchRow.team1_player1_id, matchRow.team1_player2_id].filter((value): value is string => Boolean(value));
  const team2Ids = [matchRow.team2_player1_id, matchRow.team2_player2_id].filter((value): value is string => Boolean(value));
  const existingTransactions = new Map<string, CoinTransactionRow>(
    ((await adminSupabase
      .from('profile_coin_transactions')
      .select('profile_id, delta, transaction_type, wager_amount')
      .eq('match_id', normalizedMatchId)).data || []).map((row) => [row.profile_id, row as CoinTransactionRow])
  );

  const deltas = buildCoinDeltas({
    mode: coinSettings.settlementMode,
    winnerTeam1,
    team1Wagers: team1Bets,
    team2Wagers: team2Bets,
    fixedWinnerReward: coinSettings.fixedWinnerReward,
  });

  // 4명의 선수 프로필 정보 일괄 쿼리
  const allParticipantIds = [...team1Ids, ...team2Ids];
  const { data: participantProfiles, error: participantProfilesError } = await adminSupabase
    .from('profiles')
    .select('id, coin_balance, coin_wins, coin_losses')
    .in('id', allParticipantIds);

  if (participantProfilesError || !participantProfiles) {
    return NextResponse.json({ error: '참여 선수의 코인 정보를 조회할 수 없습니다.' }, { status: 500 });
  }

  const profileRowMap = new Map(
    participantProfiles.map((row: any) => [row.id, row])
  );

  if (coinSettings.settlementMode === 'zero_sum') {
    const losingIds = winnerTeam1 ? team2Ids : team1Ids;
    const losingWagers = winnerTeam1 ? team2Bets : team1Bets;

    for (let index = 0; index < losingIds.length; index += 1) {
      const profileId = losingIds[index];
      const profileRow = profileRowMap.get(profileId);

      if (!profileRow) {
        return NextResponse.json({ error: '정산할 사용자 코인을 찾을 수 없습니다.' }, { status: 500 });
      }

      const priorDelta = existingTransactions.get(profileId)?.delta ?? 0;
      const nextBalance = (profileRow.coin_balance ?? 0) + priorDelta - losingWagers[index];
      if (nextBalance < 0) {
        return NextResponse.json({ error: '패배 팀 선수의 코인이 부족하여 정산할 수 없습니다.' }, { status: 400 });
      }
    }
  }

  const matchResultPayload = {
    winner: winnerTeam1 ? 'team1' : 'team2',
    score: `${normalizedTeam1Score}:${normalizedTeam2Score}`,
    team1_score: normalizedTeam1Score,
    team2_score: normalizedTeam2Score,
    total_losing_pool: deltas.totalLosingPool,
    team1_bets: team1Bets,
    team2_bets: team2Bets,
    settlement_mode: coinSettings.settlementMode,
    fixed_winner_reward: coinSettings.fixedWinnerReward,
    completed_at: new Date().toISOString(),
    recorded_by: currentProfile.id,
  };

  const { error: matchResultError } = await adminSupabase
    .from('match_results')
    .upsert({
      match_id: normalizedMatchId,
      winner_team1: winnerTeam1,
      team1_score: normalizedTeam1Score,
      team2_score: normalizedTeam2Score,
    }, { onConflict: 'match_id' });

  if (matchResultError) {
    return NextResponse.json({ error: getFriendlyErrorMessage(matchResultError.message) }, { status: 500 });
  }

  const teamUpdates = [
    { ids: team1Ids, wagers: team1Bets, deltas: deltas.team1, teamSide: 'team1' as const },
    { ids: team2Ids, wagers: team2Bets, deltas: deltas.team2, teamSide: 'team2' as const },
  ];

  const updateProfilePromises = [];
  const transactionsToInsert = [];

  for (const team of teamUpdates) {
    for (let index = 0; index < team.ids.length; index += 1) {
      const profileId = team.ids[index];
      const nextDelta = team.deltas[index] ?? 0;
      const transactionType = nextDelta > 0 ? 'win' : 'loss';
      const previousTransaction = existingTransactions.get(profileId);
      const profileRow = profileRowMap.get(profileId);

      if (!profileRow) {
        return NextResponse.json({ error: '사용자 코인 정보를 찾을 수 없습니다.' }, { status: 500 });
      }

      const nextCoinBalance = Math.max(0, (profileRow.coin_balance ?? 0) + nextDelta - (previousTransaction?.delta ?? 0));
      const nextWins =
        (profileRow.coin_wins ?? 0)
        + (transactionType === 'win' ? 1 : 0)
        - (previousTransaction?.transaction_type === 'win' ? 1 : 0);
      const nextLosses =
        (profileRow.coin_losses ?? 0)
        + (transactionType === 'loss' ? 1 : 0)
        - (previousTransaction?.transaction_type === 'loss' ? 1 : 0);

      updateProfilePromises.push(
        adminSupabase
          .from('profiles')
          .update({
            coin_balance: nextCoinBalance,
            coin_wins: nextWins,
            coin_losses: nextLosses,
            coin_updated_at: new Date().toISOString(),
          })
          .eq('id', profileId)
      );

      transactionsToInsert.push({
        profile_id: profileId,
        match_id: normalizedMatchId,
        transaction_type: transactionType,
        delta: nextDelta,
        wager_amount: team.wagers[index] ?? DEFAULT_MATCH_WAGER,
        team_side: team.teamSide,
        team1_score: normalizedTeam1Score,
        team2_score: normalizedTeam2Score,
        recorded_by: currentProfile.id,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 프로필 정보 업데이트 병렬 실행
  const updateResults = await Promise.all(updateProfilePromises);
  const failedUpdate = updateResults.find((r) => r.error);
  if (failedUpdate) {
    return NextResponse.json({ error: failedUpdate.error?.message || '프로필 업데이트 실패' }, { status: 500 });
  }

  // 트랜잭션 기록 배치 처리로 일괄 삽입
  const { error: transactionError } = await adminSupabase
    .from('profile_coin_transactions')
    .upsert(transactionsToInsert, { onConflict: 'match_id,profile_id' });

  if (transactionError) {
    return NextResponse.json({ error: getFriendlyErrorMessage(transactionError.message) }, { status: 500 });
  }

  const { error: updateGeneratedMatchError } = await adminSupabase
    .from('generated_matches')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      match_result: matchResultPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedMatchId);

  if (updateGeneratedMatchError) {
    return NextResponse.json({ error: getFriendlyErrorMessage(updateGeneratedMatchError.message) }, { status: 500 });
  }

  await adminSupabase
    .from('match_schedules')
    .update({
      status: 'completed',
      match_result: matchResultPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('generated_match_id', normalizedMatchId);

  let autoStartedMatchIds: number[] = [];
  let waitingMatchIds: number[] = [];

  if (matchRow.session_id) {
    try {
      const flowResult = await syncSessionMatchFlow(adminSupabase, matchRow.session_id, {
        completedMatchId: normalizedMatchId,
      });
      autoStartedMatchIds = flowResult.activatedMatchIds;
      const notificationResult = await notifyWaitingMatchesForSession(adminSupabase, matchRow.session_id);
      waitingMatchIds = notificationResult.waitingMatchIds;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '다음 경기 진행 처리에 실패했습니다.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      data: matchResultPayload,
      auto_started_match_ids: autoStartedMatchIds,
      waiting_match_ids: waitingMatchIds,
      coinRules: {
        defaultWager: DEFAULT_MATCH_WAGER,
        maxWager: MAX_MATCH_WAGER,
        settlementMode: coinSettings.settlementMode,
        fixedWinnerReward: coinSettings.fixedWinnerReward,
        initialCoinBalance: coinSettings.initialCoinBalance,
      },
    },
    { status: 200 }
  );
}

export async function GET(request: Request) {
  const adminSupabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const matchId = Number(searchParams.get('match_id'));

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Missing match_id' }, { status: 400 });
  }

  const [{ data: resultRow, error: resultError }, { data: generatedMatch, error: generatedError }] = await Promise.all([
    adminSupabase
      .from('match_results')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle(),
    adminSupabase
      .from('generated_matches')
      .select('status, match_result, completed_at')
      .eq('id', matchId)
      .maybeSingle(),
  ]);

  if (resultError || generatedError) {
    return NextResponse.json(
      { error: resultError?.message || generatedError?.message || 'Failed to load match result' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      match_result: generatedMatch?.match_result || null,
      status: generatedMatch?.status || null,
      completed_at: generatedMatch?.completed_at || null,
      row: resultRow || null,
    },
    coinRules: {
      defaultWager: DEFAULT_MATCH_WAGER,
      maxWager: MAX_MATCH_WAGER,
    },
  });
}
