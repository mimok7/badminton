'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, LogOut, Shield, Swords, Target, Trophy, UserCircle2, Zap } from 'lucide-react';

import MatchNotifications from '@/components/MatchNotifications';
import { Button } from '@/components/ui/button';
import { useLevelInfoMap } from '@/hooks/useLevelInfoMap';
import { useUser } from '@/hooks/useUser';
import type { CoinSettlementMode } from '@/lib/coins';
import { DEFAULT_MATCH_WAGER, MAX_MATCH_WAGER } from '@/lib/coins';
import { getLevelNameFromCode } from '@/lib/level-info';
import { formatCurrentUserNameWithCoins, formatNameWithCoins } from '@/lib/player-display';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';
import { getKoreaDate } from '@/lib/date';

type AttendanceStatus = 'present' | 'lesson' | 'absent' | null;

const ATTENDANCE_OPTIONS: Array<{ value: Exclude<AttendanceStatus, null>; label: string; chip: string }> = [
  { value: 'present', label: '출석', chip: '출석' },
  { value: 'lesson', label: '레슨', chip: '레슨' },
  { value: 'absent', label: '퇴근', chip: '퇴근' },
];

const quickLinks = [
  {
    href: '/challenge',
    title: '게임 제안',
    description: '완료된 선수들과 다음 게임을 제안합니다.',
    icon: Zap,
  },
  {
    href: '/today-matches',
    title: '오늘 게임',
    description: '배정된 게임과 코트를 확인합니다.',
    icon: Swords,
  },
  {
    href: '/match-registration',
    title: '참가 신청',
    description: '예정 경기 참가 여부를 등록합니다.',
    icon: Target,
  },
  {
    href: '/my-schedule',
    title: '내 게임',
    description: '내 일정과 게임 기록을 한 번에 봅니다.',
    icon: CalendarDays,
  },
  {
    href: '/profile',
    title: '회원 목록',
    description: '회원 목록과 내 정보를 관리합니다.',
    icon: UserCircle2,
  },
  {
    href: '/tournament-bracket',
    title: '대회 대진표',
    description: '대회 대진표를 확인합니다.',
    icon: Trophy,
  },
];

function normalizeAttendanceStatus(value: string | null | undefined): AttendanceStatus {
  if (value === 'present' || value === 'lesson' || value === 'absent') {
    return value;
  }

  return null;
}

function getAttendanceLabel(status: AttendanceStatus) {
  if (status === 'present') return '출석';
  if (status === 'lesson') return '레슨';
  if (status === 'absent') return '퇴근';
  return '미설정';
}

function getMatchStatusPriority(status: string) {
  if (status === 'in_progress') return 0;
  if (status === 'scheduled') return 1;
  if (status === 'completed') return 2;
  if (status === 'cancelled') return 3;
  return 4;
}

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

function getCourtLabel(match: ScheduledMatchView) {
  return match.court_name || `코트 ${match.court_number || '미정'}`;
}

type MatchResultSummary = {
  winner?: 'team1' | 'team2';
  score?: string;
  team1_score?: number;
  team2_score?: number;
  total_losing_pool?: number;
};

export default function ClientDashboard({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { user, profile, isAdmin: userIsAdmin } = useUser();
  const levelInfoMap = useLevelInfoMap();

  const [loading, setLoading] = useState(true);
  const [todayPlayersCount, setTodayPlayersCount] = useState(0);
  const [todayMatchesCount, setTodayMatchesCount] = useState(0);
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<AttendanceStatus>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [todayAssignedMatches, setTodayAssignedMatches] = useState<ScheduledMatchView[]>([]);
  const [todayAllMatches, setTodayAllMatches] = useState<ScheduledMatchView[]>([]);
  const [topMatchBet, setTopMatchBet] = useState(DEFAULT_MATCH_WAGER);
  const [topMatchBetSaving, setTopMatchBetSaving] = useState(false);
  const [topMatchResult, setTopMatchResult] = useState<MatchResultSummary | null>(null);
  const [topMatchScore1, setTopMatchScore1] = useState('');
  const [topMatchScore2, setTopMatchScore2] = useState('');
  const [topMatchResultSaving, setTopMatchResultSaving] = useState(false);
  const [topMatchDraftSaving, setTopMatchDraftSaving] = useState(false);
  const [coinSettlementMode, setCoinSettlementMode] = useState<CoinSettlementMode | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchTodaySummary = async () => {
      try {
        setLoading(true);
        const today = getKoreaDate();

        const [
          { count: playersCount },
          { count: matchCount },
          myMatches,
          allMatches,
          attendanceResponse,
          coinSettingsResponse,
        ] = await Promise.all([
          supabase
            .from('attendances')
            .select('*', { count: 'exact', head: true })
            .eq('attended_at', today),
          supabase
            .from('match_schedules')
            .select('*', { count: 'exact', head: true })
            .eq('match_date', today),
          fetchScheduledMatchesForDate(supabase, today, userId),
          fetchScheduledMatchesForDate(supabase, today),
          fetch(`/api/attendance/status?date=${today}`),
          fetch('/api/coin-settings', { credentials: 'include' }),
        ]);

        const attendancePayload = await attendanceResponse.json().catch(() => null);
        const coinSettingsPayload = await coinSettingsResponse.json().catch(() => null);

        setTodayPlayersCount(playersCount || 0);
        setTodayMatchesCount(matchCount || 0);
        setTodayAssignedMatches(myMatches);
        setTodayAllMatches(allMatches);

        if (attendanceResponse.ok) {
          setMyAttendanceStatus(normalizeAttendanceStatus(attendancePayload?.status));
        } else {
          setMyAttendanceStatus(null);
        }

        if (coinSettingsResponse.ok) {
          setCoinSettlementMode(coinSettingsPayload?.coinSettings?.settlementMode || null);
        }
      } catch (error) {
        console.error('대시보드 조회 오류:', error);
        setTodayPlayersCount(0);
        setTodayMatchesCount(0);
        setMyAttendanceStatus(null);
        setTodayAssignedMatches([]);
        setTodayAllMatches([]);
        setCoinSettlementMode(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTodaySummary();
  }, [supabase, userId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const rawDisplayName = profile?.full_name || profile?.username || email.split('@')[0];
  const displayName = rawDisplayName;
  const levelLabel = profile?.skill_level_name || getLevelNameFromCode(levelInfoMap, profile?.skill_level, profile?.skill_level || '미지정');
  const prioritizedAssignedMatches = [...todayAssignedMatches].sort((left, right) => {
    const statusDiff = getMatchStatusPriority(left.status) - getMatchStatusPriority(right.status);
    if (statusDiff !== 0) return statusDiff;
    const matchNumberDiff = (left.match_number ?? 9999) - (right.match_number ?? 9999);
    if (matchNumberDiff !== 0) return matchNumberDiff;
    return (left.court_number || 0) - (right.court_number || 0);
  });
  const topMatch = prioritizedAssignedMatches[0];
  const topMatchOrder = topMatch
    ? topMatch.match_number ?? (todayAllMatches.findIndex((match) => match.id === topMatch.id) + 1)
    : 0;
  const hasEditableTopMatch = Boolean(
    topMatch?.generated_match_id &&
      user?.id &&
      topMatch.status !== 'completed' &&
      topMatch.status !== 'cancelled',
  );
  const canSaveTopMatchDraft = topMatchScore1.trim().length > 0 && topMatchScore2.trim().length > 0;
  const canCompleteTopMatch = canSaveTopMatchDraft;
  const showTopMatchBetCard = hasEditableTopMatch && topMatch?.status === 'scheduled' && coinSettlementMode === 'zero_sum';
  const getTopMatchDraftKey = (matchId: number) => `dashboard-top-match-draft:${matchId}`;

  useEffect(() => {
    if (!topMatch?.generated_match_id) {
      setTopMatchBet(DEFAULT_MATCH_WAGER);
      setTopMatchResult(null);
      setTopMatchScore1('');
      setTopMatchScore2('');
      return;
    }

    const matchId = topMatch.generated_match_id;

    const loadTopMatchState = async () => {
      try {
        const [betResponse, resultResponse] = await Promise.all([
          fetch(`/api/match-bets?match_id=${matchId}`, { credentials: 'include' }),
          fetch(`/api/match-results?match_id=${matchId}`, { credentials: 'include' }),
        ]);

        const betPayload = await betResponse.json().catch(() => null);
        const resultPayload = await resultResponse.json().catch(() => null);

        if (betResponse.ok) {
          const myBet = (betPayload?.bets || []).find((item: { profile_id: string; wager_amount: number }) => item.profile_id === profile?.id);
          setTopMatchBet(myBet?.wager_amount ?? DEFAULT_MATCH_WAGER);
        } else {
          setTopMatchBet(DEFAULT_MATCH_WAGER);
        }

        if (resultResponse.ok && resultPayload?.data?.match_result) {
          const result = resultPayload.data.match_result as MatchResultSummary;
          setTopMatchResult(result);
          setTopMatchScore1(String(result.team1_score ?? ''));
          setTopMatchScore2(String(result.team2_score ?? ''));
          window.localStorage.removeItem(getTopMatchDraftKey(matchId));
        } else {
          setTopMatchResult(null);
          const savedDraft = window.localStorage.getItem(getTopMatchDraftKey(matchId));
          if (savedDraft) {
            try {
              const parsed = JSON.parse(savedDraft) as { team1Score?: string; team2Score?: string };
              setTopMatchScore1(parsed.team1Score ?? '');
              setTopMatchScore2(parsed.team2Score ?? '');
            } catch {
              setTopMatchScore1('');
              setTopMatchScore2('');
            }
          } else {
            setTopMatchScore1('');
            setTopMatchScore2('');
          }
        }
      } catch (error) {
        console.error('상단 경기 상태 조회 오류:', error);
      }
    };

    loadTopMatchState();
  }, [topMatch?.generated_match_id, profile?.id]);

  const handleAttendanceStatusChange = async (nextStatus: Exclude<AttendanceStatus, null>) => {
    if (statusSaving) return;

    const today = getKoreaDate();

    try {
      setStatusSaving(true);

      const response = await fetch('/api/attendance/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          attendedAt: today,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save attendance status');
      }

      setMyAttendanceStatus(nextStatus);
    } catch (error) {
      console.error('출석 상태 저장 오류:', error);
      alert('상태 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setStatusSaving(false);
    }
  };

  const refreshTopMatchSummary = async () => {
      const today = getKoreaDate();
    const [myMatches, allMatches] = await Promise.all([
      fetchScheduledMatchesForDate(supabase, today, userId),
      fetchScheduledMatchesForDate(supabase, today),
    ]);
    setTodayAssignedMatches(myMatches);
    setTodayAllMatches(allMatches);
  };

  const handleTopMatchBetSave = async (wagerAmount: number) => {
    if (!topMatch?.generated_match_id) return;

    try {
      setTopMatchBetSaving(true);
      const response = await fetch('/api/match-bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: topMatch.generated_match_id,
          wager_amount: wagerAmount,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '배팅 저장 실패');
      }

      setTopMatchBet(payload.wager_amount ?? wagerAmount);
    } catch (error) {
      console.error('상단 경기 배팅 저장 오류:', error);
      alert(error instanceof Error ? error.message : '배팅 저장 중 오류가 발생했습니다.');
    } finally {
      setTopMatchBetSaving(false);
    }
  };

  const handleTopMatchResultSave = async () => {
    if (!topMatch?.generated_match_id) return;
    const matchId = topMatch.generated_match_id;

    const team1Score = Number(topMatchScore1);
    const team2Score = Number(topMatchScore2);

    if (!Number.isFinite(team1Score) || !Number.isFinite(team2Score)) {
      alert('점수를 숫자로 입력해주세요.');
      return;
    }

    if (team1Score === team2Score) {
      alert('무승부는 저장할 수 없습니다.');
      return;
    }

    try {
      setTopMatchResultSaving(true);
      const response = await fetch('/api/match-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: matchId,
          winner_team1: team1Score > team2Score,
          team1_score: team1Score,
          team2_score: team2Score,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '점수 저장 실패');
      }

      setTopMatchResult({
        winner: team1Score > team2Score ? 'team1' : 'team2',
        score: `${team1Score}:${team2Score}`,
        team1_score: team1Score,
        team2_score: team2Score,
        total_losing_pool: payload?.data?.total_losing_pool,
      });
      window.localStorage.removeItem(getTopMatchDraftKey(matchId));

      await refreshTopMatchSummary();
    } catch (error) {
      console.error('상단 경기 결과 저장 오류:', error);
      alert(error instanceof Error ? error.message : '점수 저장 중 오류가 발생했습니다.');
    } finally {
      setTopMatchResultSaving(false);
    }
  };

  const handleTopMatchDraftSave = async () => {
    if (!topMatch?.generated_match_id) return;
    const matchId = topMatch.generated_match_id;

    try {
      setTopMatchDraftSaving(true);
      window.localStorage.setItem(
        getTopMatchDraftKey(matchId),
        JSON.stringify({
          team1Score: topMatchScore1,
          team2Score: topMatchScore2,
        }),
      );
    } catch (error) {
      console.error('상단 경기 임시 저장 오류:', error);
      alert('점수 임시 저장 중 오류가 발생했습니다.');
    } finally {
      setTopMatchDraftSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          대시보드를 불러오는 중입니다
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <MatchNotifications />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[24px] bg-[#0f172a] px-4 py-3 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-300">안녕하세요</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold leading-tight">{displayName}</h1>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-100">
                  승 {profile?.coin_wins ?? 0}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-100">
                  패 {profile?.coin_losses ?? 0}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-100">레벨 {levelLabel}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-100">
                  코인 {profile?.coin_balance ?? 0}
                </span>
                {userIsAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-slate-100 transition hover:bg-white/20"
                  >
                    <Shield className="size-3.5" />
                    관리자 홈
                  </Link>
                )}
              </div>
              <div className="mt-2 text-[12px] text-slate-300">
                상태: <span className="font-medium text-white">{getAttendanceLabel(myAttendanceStatus)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-[18px] bg-white/8 px-2.5 py-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {ATTENDANCE_OPTIONS.map((option) => {
                const isActive = myAttendanceStatus === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={statusSaving}
                    onClick={() => {
                      void handleAttendanceStatusChange(option.value);
                    }}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                      isActive
                        ? 'bg-white text-slate-900'
                        : 'bg-white/10 text-slate-100 hover:bg-white/20'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

          </div>

        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">오늘의 핵심</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">내 게임</h2>
            </div>
            <Link href="/today-matches" className="text-sm font-medium text-slate-700">
              전체 보기
            </Link>
          </div>

          {topMatch ? (
            <div className="mt-4 space-y-3">
              {prioritizedAssignedMatches.map((match) => {
                const matchOrder = match.match_number ?? (todayAllMatches.findIndex((item) => item.id === match.id) + 1);
                const statusMeta = getMatchStatusMeta(match.status);
                const isCurrentEditableMatch =
                  topMatch.id === match.id && hasEditableTopMatch && match.status === 'in_progress';
                const showBetCardForMatch =
                  topMatch.id === match.id && showTopMatchBetCard;

                return (
                  <div key={match.id} className="rounded-[20px] bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-800">
                      {matchOrder > 0 && (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {matchOrder}번째 게임
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.chipClass}`}>
                        {statusMeta.label}
                      </span>
                      <span className="font-medium text-slate-900">{getCourtLabel(match)}</span>
                      <span className="text-slate-400">·</span>
                      <span>{match.match_time || '시간 미정'}</span>
                    </div>

                    {isCurrentEditableMatch ? (
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                        <div className="rounded-[16px] border border-blue-100 bg-white px-2.5 py-2.5 text-left">
                          <div className="text-sm leading-6 text-slate-800">
                            <div className="truncate font-medium text-slate-900">
                              {formatNameWithCoins(match.team1_player1_name, match.team1_player1_coin_balance)}
                            </div>
                            <div className="truncate font-medium text-slate-900">
                              {formatNameWithCoins(match.team1_player2_name, match.team1_player2_coin_balance)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 px-0.5">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={topMatchScore1}
                            onChange={(event) => setTopMatchScore1(event.target.value)}
                            className="h-9 w-11 rounded-lg border border-slate-300 bg-white px-1 text-center text-sm font-bold text-slate-900 outline-none transition focus:border-slate-900"
                          />
                          <span className="text-[11px] font-semibold text-slate-400">:</span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={topMatchScore2}
                            onChange={(event) => setTopMatchScore2(event.target.value)}
                            className="h-9 w-11 rounded-lg border border-slate-300 bg-white px-1 text-center text-sm font-bold text-slate-900 outline-none transition focus:border-slate-900"
                          />
                        </div>

                        <div className="rounded-[16px] border border-emerald-100 bg-white px-2.5 py-2.5 text-right">
                          <div className="text-sm leading-6 text-slate-800">
                            <div className="truncate font-medium text-slate-900">
                              {formatNameWithCoins(match.team2_player1_name, match.team2_player1_coin_balance)}
                            </div>
                            <div className="truncate font-medium text-slate-900">
                              {formatNameWithCoins(match.team2_player2_name, match.team2_player2_coin_balance)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-blue-100 bg-white px-3 py-3 text-left">
                          <div className="text-sm leading-6 text-slate-800">
                            <div className="font-medium text-slate-900">
                              {formatNameWithCoins(match.team1_player1_name, match.team1_player1_coin_balance)}
                            </div>
                            <div className="font-medium text-slate-900">
                              {formatNameWithCoins(match.team1_player2_name, match.team1_player2_coin_balance)}
                            </div>
                          </div>
                          {match.match_result?.team1_score !== undefined ? (
                            <div className="mt-3 text-center text-2xl font-bold text-blue-700">
                              {match.match_result.team1_score}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-center text-xs text-slate-500">
                              {match.status === 'scheduled' ? '게임 완료 후 입력' : '점수 대기'}
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-right">
                          <div className="text-sm leading-6 text-slate-800">
                            <div className="font-medium text-slate-900">
                              {formatNameWithCoins(match.team2_player1_name, match.team2_player1_coin_balance)}
                            </div>
                            <div className="font-medium text-slate-900">
                              {formatNameWithCoins(match.team2_player2_name, match.team2_player2_coin_balance)}
                            </div>
                          </div>
                          {match.match_result?.team2_score !== undefined ? (
                            <div className="mt-3 text-center text-2xl font-bold text-emerald-700">
                              {match.match_result.team2_score}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-center text-xs text-slate-500">
                              {match.status === 'scheduled' ? '게임 완료 후 입력' : '점수 대기'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isCurrentEditableMatch && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                          현재 점수 {topMatchScore1 || '0'} : {topMatchScore2 || '0'}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            void handleTopMatchDraftSave();
                          }}
                          disabled={topMatchDraftSaving || !canSaveTopMatchDraft}
                          className="ml-auto h-8 rounded-xl px-3 text-xs"
                        >
                          {topMatchDraftSaving ? '저장 중...' : '저장'}
                        </Button>
                        <Button
                          onClick={() => {
                            void handleTopMatchResultSave();
                          }}
                          disabled={topMatchResultSaving || !canCompleteTopMatch}
                          className="h-8 rounded-xl px-3 text-xs"
                        >
                          {topMatchResultSaving ? '완료 처리 중...' : '완료'}
                        </Button>
                      </div>
                    )}

                    {showBetCardForMatch && (
                      <div className="mt-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-amber-900">코인 배팅</p>
                            <p className="text-xs text-amber-800">
                              기본 {DEFAULT_MATCH_WAGER}코인, 최대 {MAX_MATCH_WAGER}코인
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-700">
                            현재 {topMatchBet}코인
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {Array.from({ length: MAX_MATCH_WAGER }, (_, index) => {
                            const wager = index + 1;
                            const isActive = topMatchBet === wager;
                            return (
                              <button
                                key={wager}
                                type="button"
                                disabled={topMatchBetSaving || (profile?.coin_balance ?? 0) < wager}
                                onClick={() => {
                                  void handleTopMatchBetSave(wager);
                                }}
                                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                  isActive
                                    ? 'bg-amber-500 text-white'
                                    : 'border border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                              >
                                {wager}코인
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-5 text-sm text-slate-600">
              아직 내 게임 배정이 없습니다. 전체 게임이나 참가 신청부터 확인해보세요.
            </div>
          )}
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div>
            <p className="text-xs text-slate-500">바로가기</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">자주 쓰는 메뉴</h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-4 transition hover:bg-slate-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="size-4 shrink-0 text-slate-700" />
                      <h3 className="truncate text-sm font-semibold text-slate-900">{item.title}</h3>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">계정</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">추가 동작</h2>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="size-4" />
              로그아웃
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
