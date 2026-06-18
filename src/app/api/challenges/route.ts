import { NextResponse } from 'next/server';
import { getProfileByUserId } from '@/lib/auth';
import { getKoreaDate } from '@/lib/date';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

type ProfileLite = {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  coin_balance: number | null;
  skill_level: string;
};

type ChallengeRow = {
  id: string;
  challenge_date: string;
  challenger_id: string;
  partner_id: string;
  opponent1_id: string;
  opponent2_id: string;
  status: string;
  partner_response: string;
  opponent1_response: string;
  opponent2_response: string;
  note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlayerEligibility = {
  id: string;
  name: string;
  coin_balance: number | null;
  skill_level: string;
  today_match_count: number;
};

function getProfileName(profile?: ProfileLite | null) {
  return profile?.full_name || profile?.username || '선수';
}

async function getTodayChallengePool(adminSupabase: ReturnType<typeof getSupabaseAdminClient>, today: string) {
  const { data: sessions, error: sessionsError } = await adminSupabase
    .from('match_sessions')
    .select('id')
    .eq('session_date', today);

  if (sessionsError) {
    throw new Error(sessionsError.message);
  }

  const sessionIds = (sessions || []).map((session) => session.id);

  if (sessionIds.length === 0) {
    return {
      eligibilityMap: new Map<string, PlayerEligibility>(),
      profilesById: new Map<string, ProfileLite>(),
    };
  }

  const { data: matches, error: matchesError } = await adminSupabase
    .from('generated_matches')
    .select('id, status, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
    .in('session_id', sessionIds);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const playerIds = Array.from(
    new Set(
      (matches || []).flatMap((match) =>
        [
          match.team1_player1_id,
          match.team1_player2_id,
          match.team2_player1_id,
          match.team2_player2_id,
        ].filter((value): value is string => Boolean(value)),
      ),
    ),
  );

  const { data: profiles, error: profilesError } = await adminSupabase
    .from('profiles')
    .select('id, user_id, username, full_name, coin_balance, skill_level')
    .in('id', playerIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesById = new Map<string, ProfileLite>();
  (profiles || []).forEach((profile) => {
    profilesById.set(profile.id, profile);
  });

  const progressMap = new Map<string, { total: number; blocked: boolean }>();

  (matches || []).forEach((match) => {
    const ids = [
      match.team1_player1_id,
      match.team1_player2_id,
      match.team2_player1_id,
      match.team2_player2_id,
    ].filter((value): value is string => Boolean(value));

    ids.forEach((profileId) => {
      const current = progressMap.get(profileId) || { total: 0, blocked: false };
      current.total += 1;

      if (match.status === 'scheduled' || match.status === 'in_progress') {
        current.blocked = true;
      }

      progressMap.set(profileId, current);
    });
  });

  const eligibilityMap = new Map<string, PlayerEligibility>();

  progressMap.forEach((progress, profileId) => {
    const profile = profilesById.get(profileId);
    if (!profile || progress.total <= 0 || progress.blocked) {
      return;
    }

    eligibilityMap.set(profileId, {
      id: profile.id,
      name: getProfileName(profile),
      coin_balance: profile.coin_balance ?? null,
      skill_level: profile.skill_level,
      today_match_count: progress.total,
    });
  });

  return {
    eligibilityMap,
    profilesById,
  };
}

function serializeChallenge(
  challenge: ChallengeRow,
  profilesById: Map<string, ProfileLite>,
  currentProfileId: string,
) {
  const challenger = profilesById.get(challenge.challenger_id) || null;
  const partner = profilesById.get(challenge.partner_id) || null;
  const opponent1 = profilesById.get(challenge.opponent1_id) || null;
  const opponent2 = profilesById.get(challenge.opponent2_id) || null;

  const myResponse =
    currentProfileId === challenge.partner_id
      ? challenge.partner_response
      : currentProfileId === challenge.opponent1_id
        ? challenge.opponent1_response
        : currentProfileId === challenge.opponent2_id
          ? challenge.opponent2_response
          : null;

  return {
    id: challenge.id,
    challenge_date: challenge.challenge_date,
    status: challenge.status,
    note: challenge.note,
    created_at: challenge.created_at,
    responded_at: challenge.responded_at,
    challenger: challenger
      ? { id: challenger.id, name: getProfileName(challenger), coin_balance: challenger.coin_balance ?? null }
      : null,
    partner: partner
      ? { id: partner.id, name: getProfileName(partner), coin_balance: partner.coin_balance ?? null, response: challenge.partner_response }
      : null,
    opponents: [opponent1, opponent2]
      .map((profile, index) =>
        profile
          ? {
              id: profile.id,
              name: getProfileName(profile),
              coin_balance: profile.coin_balance ?? null,
              response: index === 0 ? challenge.opponent1_response : challenge.opponent2_response,
            }
          : null,
      )
      .filter(Boolean),
    my_response: myResponse,
    can_respond: Boolean(myResponse && myResponse === 'pending'),
  };
}

export async function GET() {
  const serverSupabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);

  if (!currentProfile) {
    return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const today = getKoreaDate();
    const { eligibilityMap, profilesById } = await getTodayChallengePool(adminSupabase, today);

    const eligiblePlayers = Array.from(eligibilityMap.values())
      .filter((player) => player.id !== currentProfile.id)
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'));

    const { data: challengeRows, error: challengesError } = await adminSupabase
      .from('challenge_requests')
      .select('*')
      .eq('challenge_date', today)
      .or(
        [
          `challenger_id.eq.${currentProfile.id}`,
          `partner_id.eq.${currentProfile.id}`,
          `opponent1_id.eq.${currentProfile.id}`,
          `opponent2_id.eq.${currentProfile.id}`,
        ].join(','),
      )
      .order('created_at', { ascending: false });

    if (challengesError) {
      throw new Error(challengesError.message);
    }

    const serializedChallenges = (challengeRows || []).map((challenge) =>
      serializeChallenge(challenge as ChallengeRow, profilesById, currentProfile.id),
    );

    return NextResponse.json({
      currentProfile: {
        id: currentProfile.id,
        name: currentProfile.full_name || currentProfile.username || '회원',
        coin_balance: currentProfile.coin_balance ?? 0,
        eligible: eligibilityMap.has(currentProfile.id),
      },
      eligiblePlayers,
      incomingChallenges: serializedChallenges.filter((challenge) => challenge.challenger?.id !== currentProfile.id),
      outgoingChallenges: serializedChallenges.filter((challenge) => challenge.challenger?.id === currentProfile.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '도전 데이터를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
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

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);

  if (!currentProfile) {
    return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const partnerId = String(body?.partner_id || '').trim();
  const opponent1Id = String(body?.opponent1_id || '').trim();
  const opponent2Id = String(body?.opponent2_id || '').trim();
  const note = typeof body?.note === 'string' ? body.note.trim() : null;

  if (!partnerId || !opponent1Id || !opponent2Id) {
    return NextResponse.json({ error: '파트너와 상대 2명을 모두 선택해주세요.' }, { status: 400 });
  }

  const selectedIds = [partnerId, opponent1Id, opponent2Id];
  const uniqueIds = new Set([currentProfile.id, ...selectedIds]);

  if (uniqueIds.size !== 4) {
    return NextResponse.json({ error: '도전 멤버는 모두 다른 선수여야 합니다.' }, { status: 400 });
  }

  try {
    const today = getKoreaDate();
    const { eligibilityMap, profilesById } = await getTodayChallengePool(adminSupabase, today);

    if (!eligibilityMap.has(currentProfile.id)) {
      return NextResponse.json(
        { error: '현재 회원님은 아직 대기/진행중 경기가 있어 도전할 수 없습니다.' },
        { status: 400 },
      );
    }

    const invalidTarget = selectedIds.find((profileId) => !eligibilityMap.has(profileId));
    if (invalidTarget) {
      return NextResponse.json({ error: '선택한 선수 중 지금 도전할 수 없는 선수가 있습니다.' }, { status: 400 });
    }

    const { data: existingChallenge } = await adminSupabase
      .from('challenge_requests')
      .select('id')
      .eq('challenge_date', today)
      .eq('challenger_id', currentProfile.id)
      .eq('partner_id', partnerId)
      .eq('opponent1_id', opponent1Id)
      .eq('opponent2_id', opponent2Id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingChallenge) {
      return NextResponse.json({ error: '같은 구성의 대기 중인 도전이 이미 있습니다.' }, { status: 400 });
    }

    const { data: insertedChallenge, error: insertError } = await adminSupabase
      .from('challenge_requests')
      .insert({
        challenge_date: today,
        challenger_id: currentProfile.id,
        partner_id: partnerId,
        opponent1_id: opponent1Id,
        opponent2_id: opponent2Id,
        note,
      })
      .select('*')
      .single();

    if (insertError || !insertedChallenge) {
      throw new Error(insertError?.message || '도전 생성에 실패했습니다.');
    }

    const challengerName = currentProfile.full_name || currentProfile.username || '회원';
    const partnerName = getProfileName(profilesById.get(partnerId) || null);
    const opponentNames = [opponent1Id, opponent2Id]
      .map((profileId) => getProfileName(profilesById.get(profileId) || null))
      .join(', ');

    await adminSupabase.from('notifications').insert(
      [partnerId, opponent1Id, opponent2Id].map((profileId) => ({
        user_id: profileId,
        title: '새 도전 요청',
        message: `${challengerName}님이 ${partnerName}님과 함께 ${opponentNames}님에게 도전을 보냈습니다. 도전 페이지에서 수락 또는 보류를 선택해주세요.`,
        type: 'general',
        is_read: false,
      })),
    );

    return NextResponse.json({
      challenge: serializeChallenge(insertedChallenge as ChallengeRow, profilesById, currentProfile.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '도전 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
