'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Swords, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { formatCurrentUserNameWithCoins, formatNameWithCoins } from '@/lib/player-display';

type EligiblePlayer = {
  id: string;
  name: string;
  coin_balance: number | null;
  skill_level: string;
  today_match_count: number;
};

type ChallengePerson = {
  id: string;
  name: string;
  coin_balance: number | null;
  response?: string;
};

type ChallengeItem = {
  id: string;
  challenge_date: string;
  status: string;
  note: string | null;
  created_at: string;
  responded_at: string | null;
  challenger: ChallengePerson | null;
  partner: ChallengePerson | null;
  opponents: ChallengePerson[];
  my_response: string | null;
  can_respond: boolean;
};

type ChallengePayload = {
  currentProfile: {
    id: string;
    name: string;
    coin_balance: number;
    eligible: boolean;
    ineligible_reason?: 'in_progress_match' | 'challenge_pending_or_accepted' | null;
  };
  eligiblePlayers: EligiblePlayer[];
  incomingChallenges: ChallengeItem[];
  outgoingChallenges: ChallengeItem[];
};

function getStatusChip(status: string) {
  if (status === 'accepted') return 'bg-emerald-100 text-emerald-700';
  if (status === 'held') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function getResponseLabel(status?: string | null) {
  if (status === 'accepted') return '수락';
  if (status === 'held') return '보류';
  return '대기';
}

export default function ChallengePage() {
  const { profile } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [payload, setPayload] = useState<ChallengePayload | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [opponent1Id, setOpponent1Id] = useState('');
  const [opponent2Id, setOpponent2Id] = useState('');
  const [note, setNote] = useState('');

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/challenges', { credentials: 'include' });
      const nextPayload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(nextPayload?.error || '도전 데이터를 불러오지 못했습니다.');
      }

      setPayload(nextPayload);
    } catch (error) {
      console.error('challenge load error', error);
      alert(error instanceof Error ? error.message : '도전 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChallenges();
  }, []);

  const eligiblePlayers = payload?.eligiblePlayers || [];

  const partnerOptions = useMemo(
    () => eligiblePlayers.filter((player) => player.id !== opponent1Id && player.id !== opponent2Id),
    [eligiblePlayers, opponent1Id, opponent2Id],
  );
  const opponent1Options = useMemo(
    () => eligiblePlayers.filter((player) => player.id !== partnerId && player.id !== opponent2Id),
    [eligiblePlayers, partnerId, opponent2Id],
  );
  const opponent2Options = useMemo(
    () => eligiblePlayers.filter((player) => player.id !== partnerId && player.id !== opponent1Id),
    [eligiblePlayers, partnerId, opponent1Id],
  );

  const handleCreateChallenge = async () => {
    if (!partnerId || !opponent1Id || !opponent2Id) {
      alert('파트너 1명과 상대 2명을 모두 선택해주세요.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          partner_id: partnerId,
          opponent1_id: opponent1Id,
          opponent2_id: opponent2Id,
          note,
        }),
      });

      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(nextPayload?.error || '도전 요청 생성에 실패했습니다.');
      }

      setPartnerId('');
      setOpponent1Id('');
      setOpponent2Id('');
      setNote('');
      await loadChallenges();
    } catch (error) {
      console.error('challenge create error', error);
      alert(error instanceof Error ? error.message : '도전 생성 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleRespond = async (challengeId: string, responseStatus: 'accepted' | 'held') => {
    try {
      setRespondingId(challengeId);
      const response = await fetch('/api/challenges/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challenge_id: challengeId,
          response: responseStatus,
        }),
      });

      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(nextPayload?.error || '도전 응답 저장에 실패했습니다.');
      }

      await loadChallenges();
    } catch (error) {
      console.error('challenge respond error', error);
      alert(error instanceof Error ? error.message : '도전 응답 중 오류가 발생했습니다.');
    } finally {
      setRespondingId(null);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          게임 제안 페이지를 불러오는 중입니다
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">Challenge Match</p>
              <h1 className="mt-1 text-2xl font-semibold">게임 제안</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                오늘 참가 선수 중 현재 대기나 진행중 게임이 없는 선수에게 게임 제안을 할 수 있습니다.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              홈
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">
              {formatCurrentUserNameWithCoins(payload?.currentProfile.name || profile?.full_name || profile?.username || '회원', payload?.currentProfile.coin_balance ?? profile?.coin_balance)}
            </span>
            <span className={`rounded-full px-2.5 py-1 ${payload?.currentProfile.eligible ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}>
              {payload?.currentProfile.eligible ? '제안 가능' : '제안 불가'}
            </span>
          </div>
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">새 게임 제안</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">파트너와 상대 선택</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                후보 {eligiblePlayers.length}명
              </span>
              <button
                type="button"
                onClick={() => {
                  void loadChallenges();
                }}
                disabled={loading}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '갱신 중' : '새로고침'}
              </button>
            </div>
          </div>

          {payload && !payload.currentProfile.eligible ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {payload.currentProfile.ineligible_reason === 'challenge_pending_or_accepted'
                ? '현재 대기 또는 수락 상태의 게임 제안에 포함되어 있어 지금은 새 게임 제안을 만들 수 없습니다. (보류 상태가 되면 다시 후보에 표시됩니다.)'
                : '현재 대기 또는 진행중인 배정 게임에 포함되어 있어 지금은 게임 제안을 할 수 없습니다.'}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3">
                <label className="text-sm font-medium text-slate-700">
                  내 파트너
                  <select
                    value={partnerId}
                    onChange={(event) => setPartnerId(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">선수를 선택하세요</option>
                    {partnerOptions.map((player) => (
                      <option key={player.id} value={player.id}>
                        {formatNameWithCoins(player.name, player.coin_balance)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  상대 1
                  <select
                    value={opponent1Id}
                    onChange={(event) => setOpponent1Id(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">선수를 선택하세요</option>
                    {opponent1Options.map((player) => (
                      <option key={player.id} value={player.id}>
                        {formatNameWithCoins(player.name, player.coin_balance)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  상대 2
                  <select
                    value={opponent2Id}
                    onChange={(event) => setOpponent2Id(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">선수를 선택하세요</option>
                    {opponent2Options.map((player) => (
                      <option key={player.id} value={player.id}>
                        {formatNameWithCoins(player.name, player.coin_balance)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  한마디
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="예: 다음 코트 비면 바로 붙어요."
                    className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm"
                  />
                </label>
              </div>

              <Button onClick={handleCreateChallenge} disabled={saving} className="h-12 w-full rounded-2xl">
                {saving ? '게임 제안 보내는 중...' : '게임 제안 보내기'}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">받은 게임 제안</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">수락 또는 보류</h2>
            </div>
            <Users className="size-4 text-slate-400" />
          </div>

          <div className="mt-4 space-y-3">
            {(payload?.incomingChallenges || []).length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                받은 게임 제안이 없습니다.
              </div>
            ) : (
              payload?.incomingChallenges.map((challenge) => (
                <article key={challenge.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {challenge.challenger?.name}님의 게임 제안
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusChip(challenge.status)}`}>
                      {getResponseLabel(challenge.status)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div>우리 팀: {formatNameWithCoins(challenge.challenger?.name || '선수', challenge.challenger?.coin_balance)} + {formatNameWithCoins(challenge.partner?.name || '선수', challenge.partner?.coin_balance)}</div>
                    <div>
                      상대 팀: {challenge.opponents.map((player) => formatNameWithCoins(player.name, player.coin_balance)).join(' + ')}
                    </div>
                    {challenge.note && <div className="text-slate-500">메모: {challenge.note}</div>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      onClick={() => {
                        void handleRespond(challenge.id, 'accepted');
                      }}
                      disabled={!challenge.can_respond || respondingId === challenge.id}
                      className="h-10 flex-1 rounded-xl"
                    >
                      수락
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void handleRespond(challenge.id, 'held');
                      }}
                      disabled={!challenge.can_respond || respondingId === challenge.id}
                      className="h-10 flex-1 rounded-xl"
                    >
                      보류
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">보낸 게임 제안</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">응답 상태 확인</h2>
            </div>
            <Swords className="size-4 text-slate-400" />
          </div>

          <div className="mt-4 space-y-3">
            {(payload?.outgoingChallenges || []).length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                아직 보낸 게임 제안이 없습니다.
              </div>
            ) : (
              payload?.outgoingChallenges.map((challenge) => (
                <article key={challenge.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {challenge.partner?.name} 파트너 게임 제안
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusChip(challenge.status)}`}>
                      {getResponseLabel(challenge.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <div className="rounded-xl bg-white px-3 py-2">
                      파트너: {formatNameWithCoins(challenge.partner?.name || '선수', challenge.partner?.coin_balance)} · {getResponseLabel(challenge.partner?.response)}
                    </div>
                    {challenge.opponents.map((opponent) => (
                      <div key={opponent.id} className="rounded-xl bg-white px-3 py-2">
                        상대: {formatNameWithCoins(opponent.name, opponent.coin_balance)} · {getResponseLabel(opponent.response)}
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <Link href="/dashboard" className="inline-flex items-center justify-center gap-1 text-sm font-medium text-slate-700">
          대시보드로 돌아가기
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
