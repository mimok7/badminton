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

function getMatchStatusMeta(status?: string | null, options?: { isWaiting?: boolean }) {
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

  if (options?.isWaiting) {
    return {
      label: '대기',
      chipClass: 'bg-blue-100 text-blue-700',
    };
  }

  return {
    label: '배정',
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

  if (typeof match.match_number === 'number' && match.match_number > 0) {
    return `게임 #${match.match_number}`;
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

function getCourtKey(match: ScheduledMatchView) {
  const courtName = match.court_name?.trim();
  if (courtName) return courtName;
  if (typeof match.court_number === 'number' && match.court_number > 0) {
    return `court:${match.court_number}`;
  }

  return `match:${match.id}`;
}

export default function TodayMatches() {
  const { user, profile, loading: userLoading } = useUser();
  const [matches, setMatches] = useState<ScheduledMatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [startSaving, setStartSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { team1: string; team2: string }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = getSupabaseClient();

  const loadTodayMatches = async () => {
    if (!user) {
      setMatches([]);
      return;
    }

    const today = getKoreaDate();
    const todayMatches = await fetchScheduledMatchesForDate(supabase, today);
    setMatches(todayMatches);
    setScoreDrafts((current) => {
      const nextDrafts = { ...current };

      todayMatches.forEach((match) => {
        const existing = nextDrafts[match.id];
        const team1Score = match.match_result?.team1_score;
        const team2Score = match.match_result?.team2_score;

        nextDrafts[match.id] = {
          team1: existing?.team1 ?? (team1Score !== undefined ? String(team1Score) : ''),
          team2: existing?.team2 ?? (team2Score !== undefined ? String(team2Score) : ''),
        };
      });

      return nextDrafts;
    });
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

  const canManageMatches = isAdminOrManagerRole(profile?.role);

  const myParticipantIds = new Set(
    [user?.id, profile?.id, profile?.user_id].filter((value): value is string => Boolean(value))
  );

  const activeCourtKeys = new Set(
    matches.filter((match) => match.status === 'in_progress').map((match) => getCourtKey(match))
  );
  const waitingMatchIds = new Set<string>();

  activeCourtKeys.forEach((courtKey) => {
    const nextScheduledMatch = matches.find(
      (match) => match.status === 'scheduled' && getCourtKey(match) === courtKey
    );

    if (nextScheduledMatch) {
      waitingMatchIds.add(nextScheduledMatch.id);
    }
  });

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

  const getCourtLabel = (match: ScheduledMatchView) => match.court_name || `코트 ${match.court_number || '미정'}`;

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

  const updateScoreDraft = (matchId: string, team: 'team1' | 'team2', value: string) => {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: {
        team1: team === 'team1' ? value : current[matchId]?.team1 ?? '',
        team2: team === 'team2' ? value : current[matchId]?.team2 ?? '',
      },
    }));
  };

  const toggleScoreboard = () => {
    // Kept as dummy for compatibility if needed, but not used anymore.
  };

  const handleScoreInputFocus = async (match: ScheduledMatchView) => {
    // Auto-claim referee role when input is focused, if we haven't already and no one else has
    if (!match.referee_id) {
      try {
        const res = await fetch('/api/match-referee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedule_id: match.id, action: 'claim' })
        });
        if (res.ok) {
          await loadTodayMatches();
        } else {
          const payload = await res.json().catch(() => null);
          if (payload?.error === 'already_claimed') {
            alert('다른 관리자가 이미 점수를 입력 중입니다. 조회만 가능합니다.');
            await loadTodayMatches();
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleMatchResultSave = async (match: ScheduledMatchView) => {
    if (!match.generated_match_id) return;

    const team1Value = scoreDrafts[match.id]?.team1 ?? '';
    const team2Value = scoreDrafts[match.id]?.team2 ?? '';
    const team1Score = Number(team1Value);
    const team2Score = Number(team2Value);

    if (!Number.isFinite(team1Score) || !Number.isFinite(team2Score)) {
      alert('점수를 숫자로 입력해주세요.');
      return;
    }

    if (team1Score === team2Score) {
      alert('무승부는 저장할 수 없습니다.');
      return;
    }

    try {
      setSavingMatchId(match.id);
      const response = await fetch('/api/match-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: match.generated_match_id,
          winner_team1: team1Score > team2Score,
          team1_score: team1Score,
          team2_score: team2Score,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '점수 저장에 실패했습니다.');
      }

      await loadTodayMatches();
    } catch (error) {
      console.error('게임 결과 저장 오류:', error);
      alert(getFriendlyErrorMessage(error));
    } finally {
      setSavingMatchId(null);
      // Release referee role on save
      if (match.referee_id === profile?.id) {
        await fetch('/api/match-referee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedule_id: match.id, action: 'release' })
        }).catch(() => null);
      }
    }
  };

  const uniqueCourts = Array.from(
    new Map(
      matches.map(m => [m.court_number, m.court_name || `코트 ${m.court_number || '미정'}`])
    ).entries()
  )
    .filter(([num]) => num !== null && num > 0)
    .sort((a, b) => (a[0] || 0) - (b[0] || 0)) as [number, string][];

  const courtMatchCounts: Record<string, number> = {};
  const processedMatches = matches.map((match, index) => {
    const matchOrder = match.match_number ?? index + 1;
    const displayMatchLabel = getDisplayMatchLabel(match, matchOrder);
    
    const courtKey = match.court_name || String(match.court_number || '?');
    courtMatchCounts[courtKey] = (courtMatchCounts[courtKey] || 0) + 1;
    
    let courtPrefix = String(match.court_number || '?');
    if (match.court_name) {
      const numMatch = match.court_name.match(/\d+/);
      if (numMatch) {
        courtPrefix = numMatch[0];
      }
    }
    const displayMatchSequence = `${courtPrefix}-${courtMatchCounts[courtKey]}`;
    
    return {
      ...match,
      displayMatchLabel,
      displayMatchSequence,
    };
  });

  const filteredMatches = processedMatches;

  const renderMatchCard = (match: typeof filteredMatches[0]) => {
    const inMatch = isPlayerInMatch(match);
    const statusMeta = getMatchStatusMeta(match.status, {
      isWaiting: waitingMatchIds.has(match.id),
    });
    const team1Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team1');
    const team2Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team2');
    // Score input is fully editable if:
    // 1. The match is in_progress or scheduled AND
    // 2. No one else has claimed the referee role
    // Any attendee can become the referee by interacting with it first.
    const canBeReferee = Boolean(
      match.generated_match_id &&
      (match.status === 'in_progress' || match.status === 'scheduled')
    );
    const hasActiveRefereeLock = match.referee_id && match.referee_id !== profile?.id;
    const isEditable = canBeReferee && !hasActiveRefereeLock;
    
    const scoreDraft = scoreDrafts[match.id] ?? { team1: '', team2: '' };
    const canSaveScore =
      isEditable &&
      scoreDraft.team1.trim().length > 0 &&
      scoreDraft.team2.trim().length > 0;

    const displayMatchLabel = match.displayMatchLabel;
    const displayMatchSequence = match.displayMatchSequence;

    // Scoreboard values — show draft if entered (by referee), else saved result
    const sbTeam1 = scoreDraft.team1 !== '' ? scoreDraft.team1 : (match.match_result?.team1_score !== undefined ? String(match.match_result.team1_score) : '-');
    const sbTeam2 = scoreDraft.team2 !== '' ? scoreDraft.team2 : (match.match_result?.team2_score !== undefined ? String(match.match_result.team2_score) : '-');

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
                <span>🏟️ {getCourtLabel(match)}</span>
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
                점수판
              </Link>
              
              {isEditable && (
                <button
                  type="button"
                  onClick={() => { void handleMatchResultSave(match); }}
                  disabled={!canSaveScore || savingMatchId === match.id}
                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingMatchId === match.id ? '저장 중...' : '저장'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scoreboard — always visible */}
        <div className="mt-3 rounded-[18px] bg-slate-50 px-3 py-3">
          {hasActiveRefereeLock && (
            <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-700">
              🔒 다른 참석자가 점수를 입력 중입니다 (조회 전용)
            </div>
          )}
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

            {/* Score display / input */}
            <div className="flex flex-col items-center gap-1">
              {isEditable ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={scoreDraft.team1}
                    onFocus={() => { void handleScoreInputFocus(match); }}
                    onChange={(e) => updateScoreDraft(match.id, 'team1', e.target.value)}
                    className="h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-center text-xl font-bold text-blue-700 outline-none transition focus:border-blue-500"
                  />
                  <span className="text-lg font-bold text-slate-400">:</span>
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={scoreDraft.team2}
                    onFocus={() => { void handleScoreInputFocus(match); }}
                    onChange={(e) => updateScoreDraft(match.id, 'team2', e.target.value)}
                    className="h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-center text-xl font-bold text-emerald-700 outline-none transition focus:border-emerald-500"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold ${
                    match.match_result?.winner === 'team1' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {sbTeam1}
                  </div>
                  <span className="text-lg font-bold text-slate-400">:</span>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold ${
                    match.match_result?.winner === 'team2' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {sbTeam2}
                  </div>
                </div>
              )}
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
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 force-landscape-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 767px) and (orientation: portrait) {
          .force-landscape-container {
            transform: rotate(90deg) !important;
            transform-origin: top left !important;
            width: 100vh !important;
            height: 100vw !important;
            position: fixed !important;
            top: 0 !important;
            left: 100% !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          .force-landscape-container .grid-layout {
            display: grid !important;
            grid-template-columns: repeat(var(--cols-count, 2), minmax(0, 1fr)) !important;
          }
        }
      `}} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[24px] bg-[#0f172a] px-4 py-4 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold whitespace-nowrap">🏸 오늘의 게임</h1>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
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
              <div className="rounded-md bg-white/10 px-2 py-1">
                <span className="text-slate-300">코트 : </span>
                <span className="font-semibold text-white">
                  {matches.length > 0 ? Math.max(...matches.map((m) => m.court_number || 0)) : 0}
                </span>
              </div>
            </div>
          </div>

          {primaryMatch && (
            <div className="mt-4 rounded-[22px] bg-white/8 px-3 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-300 leading-normal">
                  {canManageMatches
                    ? '점수 입력과 게임 시작은 매니저 이상 권한으로 사용할 수 있습니다.'
                    : '모든 회원이 오늘 게임을 볼 수 있으며, 점수 입력과 게임 시작은 매니저 이상만 가능합니다.'}
                </div>
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
                      <span>🔄</span>
                      {optimizing ? '재배정...' : '지각 뒤로'}
                    </button>
                  )}
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
        ) : (() => {
          const unassignedMatches = filteredMatches.filter(m => !m.court_number || m.court_number === 0);
          const activeCourtsToRender = uniqueCourts;

          const showUnassigned = unassignedMatches.length > 0;
          const columnsCount = activeCourtsToRender.length + (showUnassigned ? 1 : 0);
          
          const gridClass = 
            columnsCount === 1 ? 'grid-cols-1' :
            columnsCount === 2 ? 'grid-cols-1 landscape:grid-cols-2 md:grid-cols-2' :
            columnsCount === 3 ? 'grid-cols-1 landscape:grid-cols-3 md:grid-cols-3' :
            'grid-cols-1 landscape:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

          return (
            <div 
              className={`grid gap-4 items-start ${gridClass} grid-layout`}
              style={{ '--cols-count': columnsCount } as React.CSSProperties}
            >
              {activeCourtsToRender.map(([num, name]) => {
                const courtMatches = filteredMatches.filter(m => m.court_number === num);
                if (courtMatches.length === 0) {
                  return (
                    <div key={num} className="rounded-[24px] border border-slate-200/80 bg-white/40 p-4 text-center">
                      <h2 className="text-sm font-bold text-slate-700 border-b pb-2 mb-3">
                        {name}
                      </h2>
                      <p className="text-xs text-slate-400 py-4">배정된 게임 없음</p>
                    </div>
                  );
                }

                return (
                  <div key={num} className="space-y-3">
                    <h2 className="text-sm font-bold text-slate-700 bg-white/80 border border-slate-200/60 rounded-xl py-2 px-3 shadow-xs">
                      {name}
                    </h2>
                    <div className="space-y-3">
                      {courtMatches.map(renderMatchCard)}
                    </div>
                  </div>
                );
              })}

              {showUnassigned && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 bg-white/80 border border-slate-200/60 rounded-xl py-2 px-3 shadow-xs">
                    코트 미정
                  </h2>
                  <div className="space-y-3">
                    {unassignedMatches.map(renderMatchCard)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
