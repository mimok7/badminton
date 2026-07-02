'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { isAdminOrManagerRole } from '@/lib/auth';
import { getKoreaDate } from '@/lib/date';
import { formatNameWithCoins } from '@/lib/player-display';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';
import { getFriendlyErrorMessage } from '@/lib/utils';

function getMatchStatusMeta(status?: string | null) {
  if (status === 'completed') {
    return {
      label: '완료',
      chipClass: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (status === 'in_progress') {
    return {
      label: '진행중',
      chipClass: 'bg-amber-100 text-amber-700',
    };
  }

  if (status === 'cancelled') {
    return {
      label: '취소',
      chipClass: 'bg-rose-100 text-rose-700',
    };
  }

  return {
    label: '대기',
    chipClass: 'bg-slate-100 text-slate-700',
  };
}

function getMatchOutcomeMeta(
  status?: string | null,
  winner?: 'team1' | 'team2' | null,
  team: 'team1' | 'team2' = 'team1',
) {
  if (status !== 'completed' || !winner) {
    return null;
  }

  const isWinner = winner === team;

  return isWinner
    ? { label: '승', icon: '🏆', chipClass: 'bg-emerald-100 text-emerald-700' }
    : { label: '패', icon: '✕', chipClass: 'bg-slate-100 text-slate-600' };
}

function getDisplayMatchLabel(match: ScheduledMatchView, fallbackOrder: number) {
  const description = match.description?.trim();
  if (description) {
    return description.replace(/^\[일반 경기\]\s*/u, '');
  }

  return `게임 #${fallbackOrder}`;
}

function getDisplayMatchSequence(match: ScheduledMatchView, fallbackOrder: number) {
  const description = match.description?.trim();
  if (description) {
    const normalized = description.replace(/^\[일반 경기\]\s*/u, '');
    const sequenceMatch = normalized.match(/(\d+-\d+)$/u);
    if (sequenceMatch?.[1]) {
      return sequenceMatch[1];
    }
  }

  if (typeof match.match_number === 'number' && match.match_number > 0) {
    return String(match.match_number);
  }

  return String(fallbackOrder);
}



export default function TodayMatches() {
  const { user, profile, loading: userLoading, isAdmin } = useUser();
  const [matches, setMatches] = useState<ScheduledMatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [startSaving, setStartSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadTodayMatches();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const loadTodayMatches = async () => {
    if (!user) {
      setMatches([]);
      return;
    }

    const today = getKoreaDate();
    const todayMatches = await fetchScheduledMatchesForDate(supabase, today);
    setMatches(todayMatches);
  };

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const fetchTodayMatches = async () => {
      try {
        await loadTodayMatches();
      } catch (error) {
        console.error('데이터 조회 중 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayMatches();
  }, [userLoading, user?.id, supabase]);

  if (userLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          오늘 게임을 불러오는 중입니다
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-6 text-center">
          <section className="w-full rounded-[24px] bg-white px-5 py-8 shadow-sm">
            <div className="text-5xl">🔐</div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">로그인이 필요합니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              오늘 배정된 게임을 보려면 먼저 로그인해 주세요.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="flex-1 rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                로그인
              </button>
              <Link
                href="/dashboard"
                className="flex-1 rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                홈
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const canManageMatches = isAdmin;

  const myParticipantIds = new Set(
    [user?.id, profile?.id, profile?.user_id].filter((value): value is string => Boolean(value))
  );

  const isPlayerInMatch = (match: ScheduledMatchView) => {
    return [
      match.team1_player1,
      match.team1_player2,
      match.team2_player1,
      match.team2_player2,
    ].some((participantId) => participantId ? myParticipantIds.has(participantId) : false);
  };

  const getPlayerTeam = (match: ScheduledMatchView) => {
    if ([match.team1_player1, match.team1_player2].some((participantId) => participantId ? myParticipantIds.has(participantId) : false)) {
      return 'team1';
    }
    if ([match.team2_player1, match.team2_player2].some((participantId) => participantId ? myParticipantIds.has(participantId) : false)) {
      return 'team2';
    }
    return null;
  };

  const primaryMatch = matches.find((match) => match.status === 'in_progress')
    || matches.find((match) => match.status === 'scheduled')
    || null;

  const canStartPrimaryMatch = Boolean(
    primaryMatch?.generated_match_id &&
    (primaryMatch.status === 'scheduled' || primaryMatch.status === 'in_progress') &&
    canManageMatches
  );

  const handlePrimaryMatchStart = async () => {
    if (!primaryMatch?.generated_match_id || !canStartPrimaryMatch) return;

    try {
      setStartSaving(true);
      const response = await fetch('/api/match-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: primaryMatch.generated_match_id,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '게임 시작에 실패했습니다.');
      }

      await loadTodayMatches();
    } catch (error) {
      console.error('오늘 게임 시작 오류:', error);
      alert(getFriendlyErrorMessage(error));
    } finally {
      setStartSaving(false);
    }
  };

  const handleOptimizeOrder = async () => {
    if (!canManageMatches) return;
    try {
      setOptimizing(true);
      const response = await fetch('/api/admin/match-optimize-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: getKoreaDate(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '순서 정렬에 실패했습니다.');
      }

      await loadTodayMatches();
      alert('출석자를 우선으로 순서가 정렬되었습니다.');
    } catch (error) {
      console.error('게임 순서 정렬 오류:', error);
      alert(getFriendlyErrorMessage(error));
    } finally {
      setOptimizing(false);
    }
  };

  const normalizeGender = (value?: string | null) => String(value || '').trim().toUpperCase();

  const getPlayerIcon = (gender?: string | null) => {
    const normalized = normalizeGender(gender);

    if (['M', 'MALE', 'MAN', '남', '남성'].includes(normalized)) {
      return '👨';
    }

    if (['F', 'FEMALE', 'WOMAN', 'W', '여', '여성'].includes(normalized)) {
      return '👩';
    }

    return '👤';
  };

  const processedMatches = matches.map((match, index) => {
    const matchOrder = match.match_number ?? index + 1;
    const displayMatchLabel = getDisplayMatchLabel(match, matchOrder);
    const displayMatchSequence = String(index + 1);
    
    return {
      ...match,
      displayMatchLabel,
      displayMatchSequence,
    };
  });

  const filteredMatches = processedMatches;

  const renderMatchCard = (match: typeof filteredMatches[0]) => {
    const inMatch = isPlayerInMatch(match);
    const statusMeta = getMatchStatusMeta(match.status);
    const team1Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team1');
    const team2Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team2');

    const displayMatchLabel = match.displayMatchLabel;
    const displayMatchSequence = match.displayMatchSequence;

    const sbTeam1 = match.match_result?.team1_score !== undefined ? String(match.match_result.team1_score) : '-';
    const sbTeam2 = match.match_result?.team2_score !== undefined ? String(match.match_result.team2_score) : '-';

    return (
      <article
        key={match.id}
        className={`rounded-[24px] border p-4 shadow-sm transition-all ${
          inMatch ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-white'
        }`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex min-w-[3rem] items-center justify-center rounded-full px-2 text-xs font-bold text-white ${inMatch ? 'bg-amber-500' : 'bg-slate-400'} h-9`}>
              {displayMatchSequence}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {displayMatchLabel}
                {inMatch && (
                  <span className="ml-2 rounded-full bg-amber-200 px-2 py-1 text-[11px] font-medium text-amber-800">
                    내 게임
                  </span>
                )}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>⏰ {match.match_time || '시간 미정'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.chipClass}`}>
              {statusMeta.label}
            </span>
            <div className="flex gap-2">
              <Link
                href={`/today-scoreboard/${match.id}`}
                className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                판
              </Link>
            </div>
          </div>
        </div>

        {/* Scoreboard — always visible */}
        <div className="mt-3 rounded-[18px] bg-slate-50 px-3 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* Team 1 */}
            <div className="text-left">
              <div className="truncate text-sm font-medium text-slate-900">
                {getPlayerIcon(match.team1_player1_gender)} {formatNameWithCoins(match.team1_player1_name, match.team1_player1_coin_balance)}
              </div>
              <div className="truncate text-sm font-medium text-slate-900">
                {getPlayerIcon(match.team1_player2_gender)} {formatNameWithCoins(match.team1_player2_name, match.team1_player2_coin_balance)}
              </div>
              {team1Outcome && (
                <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${team1Outcome.chipClass}`}>
                  <span>{team1Outcome.icon}</span><span>{team1Outcome.label}</span>
                </div>
              )}
            </div>

            {/* Score display */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold ${
                  match.match_result?.winner === 'team1' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {sbTeam1}
                </div>
                <span className="text-sm font-bold text-slate-400">:</span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold ${
                  match.match_result?.winner === 'team2' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {sbTeam2}
                </div>
              </div>
            </div>

            {/* Team 2 */}
            <div className="text-right">
              <div className="truncate text-sm font-medium text-slate-900">
                {formatNameWithCoins(match.team2_player1_name, match.team2_player1_coin_balance)} {getPlayerIcon(match.team2_player1_gender)}
              </div>
              <div className="truncate text-sm font-medium text-slate-900">
                {formatNameWithCoins(match.team2_player2_name, match.team2_player2_coin_balance)} {getPlayerIcon(match.team2_player2_gender)}
              </div>
              {team2Outcome && (
                <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${team2Outcome.chipClass}`}>
                  <span>{team2Outcome.icon}</span><span>{team2Outcome.label}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="w-full">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[24px] bg-[#0f172a] px-4 py-4 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div className="flex flex-col md:flex-row md:items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold whitespace-nowrap">🏸 오늘의 게임</h1>
              <span className="text-[11px] text-slate-400 font-normal leading-tight">
                {canManageMatches
                  ? '점수 입력과 게임 시작은 매니저 이상 권한으로 사용할 수 있습니다.'
                  : '모든 회원이 오늘 게임을 볼 수 있으며, 점수 입력과 게임 시작은 매니저 이상만 가능합니다.'}
              </span>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15 self-end sm:self-auto"
            >
              홈
            </Link>
          </div>
          
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className="text-slate-300 font-medium">
              {new Date().toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md bg-white/10 px-2 py-1">
                <span className="text-slate-300">총 게임 : </span>
                <span className="font-semibold text-white">{matches.length}</span>
              </div>
              <div className="rounded-md bg-white/10 px-2 py-1">
                <span className="text-slate-300">내 게임 : </span>
                <span className="font-semibold text-white">{matches.filter(isPlayerInMatch).length}</span>
              </div>
            </div>
          </div>

          {primaryMatch && (
            <div className="mt-4 rounded-[22px] bg-white/8 px-3 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {canManageMatches && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleOptimizeOrder();
                      }}
                      disabled={optimizing}
                      className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 shrink-0"
                    >
                      <span>⏳</span>
                      {optimizing ? '정렬 중...' : '순서정렬'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void handleRefresh(); }}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-60 shrink-0"
                  >
                    <span className={refreshing ? 'inline-block animate-spin' : ''}>🔄</span>
                    {refreshing ? '로딩...' : '새로고침'}
                  </button>
                  {canStartPrimaryMatch ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handlePrimaryMatchStart();
                      }}
                      disabled={startSaving}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60 shrink-0"
                    >
                      {startSaving
                        ? '처리 중...'
                        : primaryMatch.status === 'in_progress'
                          ? '진행중'
                          : '게임 시작'}
                    </button>
                  ) : (
                    <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-slate-200 shrink-0">
                      {primaryMatch.status === 'in_progress' ? '진행 중' : '자동 시작 대기'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {matches.length === 0 ? (
          <section className="rounded-[24px] bg-white px-4 py-10 text-center shadow-sm">
            <div className="text-5xl">🏸</div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">오늘 배정된 게임이 없습니다</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">관리자가 게임을 배정하면 여기에 표시됩니다.</p>
          </section>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMatches.map(renderMatchCard)}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
