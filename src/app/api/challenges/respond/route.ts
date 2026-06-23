import { NextResponse } from 'next/server';
import { getProfileByUserId } from '@/lib/auth';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

type ChallengeRow = {
  id: string;
  challenger_id: string;
  partner_id: string;
  opponent1_id: string;
  opponent2_id: string;
  status: string;
  partner_response: string;
  opponent1_response: string;
  opponent2_response: string;
};

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
  const challengeId = String(body?.challenge_id || '').trim();
  const responseStatus = String(body?.response || '').trim();

  if (!challengeId || !['accepted', 'held'].includes(responseStatus)) {
    return NextResponse.json({ error: '응답 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const { data: challenge, error: challengeError } = await adminSupabase
    .from('challenge_requests')
    .select('*')
    .eq('id', challengeId)
    .single<ChallengeRow>();

  if (challengeError || !challenge) {
    return NextResponse.json({ error: '도전 요청을 찾을 수 없습니다.' }, { status: 404 });
  }

  let updateField: 'partner_response' | 'opponent1_response' | 'opponent2_response' | null = null;

  if (challenge.partner_id === currentProfile.id) updateField = 'partner_response';
  if (challenge.opponent1_id === currentProfile.id) updateField = 'opponent1_response';
  if (challenge.opponent2_id === currentProfile.id) updateField = 'opponent2_response';

  if (!updateField) {
    return NextResponse.json({ error: '이 도전 요청에 응답할 권한이 없습니다.' }, { status: 403 });
  }

  const nextResponses = {
    partner_response: updateField === 'partner_response' ? responseStatus : challenge.partner_response,
    opponent1_response: updateField === 'opponent1_response' ? responseStatus : challenge.opponent1_response,
    opponent2_response: updateField === 'opponent2_response' ? responseStatus : challenge.opponent2_response,
  };

  const allAccepted = Object.values(nextResponses).every((value) => value === 'accepted');
  const anyHeld = Object.values(nextResponses).some((value) => value === 'held');
  const overallStatus = allAccepted ? 'accepted' : anyHeld ? 'held' : 'pending';

  const { error: updateError } = await adminSupabase
    .from('challenge_requests')
    .update({
      ...nextResponses,
      status: overallStatus,
      responded_at: overallStatus === 'pending' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', challengeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const responderName = currentProfile.full_name || currentProfile.username || '회원';
  const statusLabel = responseStatus === 'accepted' ? '수락' : '보류';

  await adminSupabase.from('notifications').insert({
    user_id: challenge.challenger_id,
    title: '도전 응답 도착',
    message: `${responderName}님이 도전 요청에 ${statusLabel} 응답을 남겼습니다.`,
    type: 'general',
    is_read: false,
  });

  return NextResponse.json({
    success: true,
    status: overallStatus,
  });
}
