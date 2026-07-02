'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Gift, LogOut, Shield, Swords, Target, Trophy, UserCircle2, Zap, Bell, BookOpen } from 'lucide-react';

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
    href: '/notifications',
    title: '공지사항/알림',
    description: '새로운 공지와 내 알림을 확인합니다.',
    icon: Bell,
  },
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
  {
    href: '/products/exchange',
    title: '상품 교환',
    description: '코인을 사용하여 상품으로 교환합니다.',
    icon: Gift,
  },
  {
    href: '/manual',
    title: '사용자 설명서',
    description: '시스템 기능 및 이용 안내 가이드를 확인합니다.',
    icon: BookOpen,
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
  const [topMatchResultSaving, setTopMatchResultSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const fetchTodaySummary = async () => {
      try {
        setLoading(true);
        const today = getKoreaDate();

        const [
          { count: playersCount },
          { count: matchCount },
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
          fetchScheduledMatchesForDate(supabase, today),
          fetch(`/api/attendance/status?date=${today}`),
        ]);

        // Filter user's matches client-side instead of making a second API call
        const myMatches = allMatches.filter(match =>
          [match.team1_player1, match.team1_player2, match.team2_player1, match.team2_player2].includes(userId)
        );

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

  const rawDisplayName = profile?.full_name || profile?.username || email.split('@')[0];
  const displayName = rawDisplayName;
  const levelLabel = profile?.skill_level_name || getLevelNameFromCode(levelInfoMap, profile?.skill_level, profile?.skill_level || '미지정');

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
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon className="mt-0.5 size-4 shrink-0 text-slate-700" />
                      <h3 className="break-keep text-sm font-semibold text-slate-900">{item.title}</h3>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-2 break-keep text-xs leading-5 text-slate-500">{item.description}</p>
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
