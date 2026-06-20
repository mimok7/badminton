'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, LogOut, Shield, Swords, Target, Trophy, UserCircle2, Zap } from 'lucide-react';

import MatchNotifications from '@/components/MatchNotifications';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { DEFAULT_MATCH_WAGER, MAX_MATCH_WAGER } from '@/lib/coins';
import { getUserLevelDisplay } from '@/lib/level-display';
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
    title: '경기 제안',
    description: '완료된 선수들과 다음 경기를 제안합니다.',
    icon: Zap,
  },
  {
    href: '/today-matches',
    title: '오늘 경기',
    description: '배정된 경기와 코트를 확인합니다.',
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
    title: '내 경기',
    description: '내 일정과 기록을 한 번에 봅니다.',
    icon: CalendarDays,
  },
  {
    href: '/profile',
    title: '프로필',
    description: '내 정보와 레벨을 관리합니다.',
    icon: UserCircle2,
  },
  {
    href: '/tournament-bracket',
    title: '대진표',
    description: '토너먼트 대진표를 확인합니다.',
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
  const [topMatchStartSaving, setTopMatchStartSaving] = useState(false);

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
        ]);

        const attendancePayload = await attendanceResponse.json().catch(() => null);

        setTodayPlayersCount(playersCount || 0);
        setTodayMatchesCount(matchCount || 0);
        setTodayAssignedMatches(myMatches);
        setTodayAllMatches(allMatches);

        if (attendanceResponse.ok) {
          setMyAttendanceStatus(normalizeAttendanceStatus(attendancePayload?.status));
        } else {
          setMyAttendanceStatus(null);
        }
      } catch (error) {
        console.error('대시보드 조회 오류:', error);
        setTodayPlayersCount(0);
        setTodayMatchesCount(0);
        setMyAttendanceStatus(null);
        setTodayAssignedMatches([]);
        setTodayAllMatches([]);
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
  const levelLabel = getUserLevelDisplay(profile?.skill_level);
  const prioritizedAssignedMatches = [...todayAssignedMatches].sort((left, right) => {
    const statusDiff = getMatchStatusPriority(left.status) - getMatchStatusPriority(right.status);
    if (statusDiff !== 0) return statusDiff;
    return (left.court_number || 0) - (right.court_number || 0);
  });
  const topMatch = prioritizedAssignedMatches[0];
  const topMatchOrder = topMatch
    ? todayAllMatches.findIndex((match) => match.id === topMatch.id) + 1
    : 0;
  const topMatchStatusMeta = getMatchStatusMeta(topMatch?.status);
  const hasEditableTopMatch = Boolean(
    topMatch?.generated_match_id &&
      user?.id &&
      topMatch.status !== 'completed' &&
      topMatch.status !== 'cancelled',
  );

  useEffect(() => {
    if (!topMatch?.generated_match_id) {
      setTopMatchBet(DEFAULT_MATCH_WAGER);
      setTopMatchResult(null);
      setTopMatchScore1('');
      setTopMatchScore2('');
      return;
    }

    const loadTopMatchState = async () => {
      try {
        const [betResponse, resultResponse] = await Promise.all([
          fetch(`/api/match-bets?match_id=${topMatch.generated_match_id}`, { credentials: 'include' }),
          fetch(`/api/match-results?match_id=${topMatch.generated_match_id}`, { credentials: 'include' }),
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
        } else {
          setTopMatchResult(null);
          setTopMatchScore1('');
          setTopMatchScore2('');
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
          match_id: topMatch.generated_match_id,
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

      await refreshTopMatchSummary();
    } catch (error) {
      console.error('상단 경기 결과 저장 오류:', error);
      alert(error instanceof Error ? error.message : '점수 저장 중 오류가 발생했습니다.');
    } finally {
      setTopMatchResultSaving(false);
    }
  };

  const handleTopMatchStart = async () => {
    if (!topMatch?.generated_match_id) return;

    try {
      setTopMatchStartSaving(true);
      const response = await fetch('/api/match-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: topMatch.generated_match_id,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '경기 시작 실패');
      }

      await refreshTopMatchSummary();
    } catch (error) {
      console.error('상단 경기 시작 오류:', error);
      alert(error instanceof Error ? error.message : '경기 시작 중 오류가 발생했습니다.');
    } finally {
      setTopMatchStartSaving(false);
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

      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-3">
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
              <h2 className="mt-1 text-lg font-semibold text-slate-900">내 경기</h2>
            </div>
            <Link href="/today-matches" className="text-sm font-medium text-slate-700">
              전체 보기
            </Link>
          </div>

          {topMatch ? (
            <div className="mt-4 rounded-[20px] bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-800">
                {topMatchOrder > 0 && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {topMatchOrder}번째 경기
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${topMatchStatusMeta.chipClass}`}>
                  {topMatchStatusMeta.label}
                </span>
                <span className="font-medium text-slate-900">코트 {topMatch.court_number || '미정'}</span>
                <span className="text-slate-400">·</span>
                  <span>{topMatch.match_time || '시간 미정'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-blue-100 bg-white px-3 py-3 text-left">
                  <div className="text-sm leading-6 text-slate-800">
                    <div className="font-medium text-slate-900">
                      {formatNameWithCoins(topMatch.team1_player1_name, topMatch.team1_player1_coin_balance)}
                    </div>
                    <div className="font-medium text-slate-900">
                      {formatNameWithCoins(topMatch.team1_player2_name, topMatch.team1_player2_coin_balance)}
                    </div>
                  </div>
                  {hasEditableTopMatch && (
                    <div className="mt-3">
                      <input
                        type="number"
                        min={0}
                        value={topMatchScore1}
                        onChange={(event) => setTopMatchScore1(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-center text-base font-semibold text-slate-900"
                      />
                    </div>
                  )}
                  {!hasEditableTopMatch && topMatch.match_result?.team1_score !== undefined && (
                    <div className="mt-3 text-center text-2xl font-bold text-blue-700">
                      {topMatch.match_result.team1_score}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-right">
                  <div className="text-sm leading-6 text-slate-800">
                    <div className="font-medium text-slate-900">
                      {formatNameWithCoins(topMatch.team2_player1_name, topMatch.team2_player1_coin_balance)}
                    </div>
                    <div className="font-medium text-slate-900">
                      {formatNameWithCoins(topMatch.team2_player2_name, topMatch.team2_player2_coin_balance)}
                    </div>
                  </div>
                  {hasEditableTopMatch && (
                    <div className="mt-3">
                      <input
                        type="number"
                        min={0}
                        value={topMatchScore2}
                        onChange={(event) => setTopMatchScore2(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-center text-base font-semibold text-slate-900"
                      />
                    </div>
                  )}
                  {!hasEditableTopMatch && topMatch.match_result?.team2_score !== undefined && (
                    <div className="mt-3 text-center text-2xl font-bold text-emerald-700">
                      {topMatch.match_result.team2_score}
                    </div>
                  )}
                </div>
              </div>
              {hasEditableTopMatch && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
                    경기 시작 {topMatchScore1 || '0'} : {topMatchScore2 || '0'}
                  </div>
                  {topMatch.status === 'scheduled' ? (
                    <Button
                      onClick={() => {
                        void handleTopMatchStart();
                      }}
                      disabled={topMatchStartSaving}
                      className="ml-auto rounded-xl"
                    >
                      {topMatchStartSaving ? '시작 중...' : '경기 시작'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        void handleTopMatchResultSave();
                      }}
                      disabled={topMatchResultSaving}
                      className="ml-auto rounded-xl"
                    >
                      {topMatchResultSaving ? '저장 중...' : '점수 저장'}
                    </Button>
                  )}
                </div>
              )}
              {hasEditableTopMatch && topMatch.status === 'scheduled' && (
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
              {topMatchResult?.score && (
                <div className="mt-3">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    저장됨 {topMatchResult.score}
                  </span>
                </div>
              )}
              {topMatchResult?.winner && (
                <p className="mt-2 text-xs text-slate-600">
                  결과: {topMatchResult.winner === 'team1' ? '왼쪽 팀 승리' : '오른쪽 팀 승리'}
                  {typeof topMatchResult.total_losing_pool === 'number' && ` · 패자 총 배팅 ${topMatchResult.total_losing_pool}코인 분배`}
                </p>
              )}
              {todayAssignedMatches.length > 1 && (
                <p className="mt-3 text-xs text-slate-500">
                  추가로 {todayAssignedMatches.length - 1}경기가 더 있습니다.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-5 text-sm text-slate-600">
              아직 내 경기 배정이 없습니다. 전체 경기나 참가 신청부터 확인해보세요.
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
