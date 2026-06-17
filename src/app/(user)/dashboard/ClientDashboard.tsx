'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, LogOut, Shield, Swords, Target, Trophy, UserCircle2 } from 'lucide-react';

import MatchNotifications from '@/components/MatchNotifications';
import { useUser } from '@/hooks/useUser';
import { getUserLevelDisplay } from '@/lib/level-display';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';

type AttendanceStatus = 'present' | 'lesson' | 'absent' | null;

const ATTENDANCE_OPTIONS: Array<{ value: Exclude<AttendanceStatus, null>; label: string; chip: string }> = [
  { value: 'present', label: '출석', chip: '출석' },
  { value: 'lesson', label: '레슨', chip: '레슨' },
  { value: 'absent', label: '퇴근', chip: '퇴근' },
];

const quickLinks = [
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

export default function ClientDashboard({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { profile, isAdmin: userIsAdmin } = useUser();

  const [loading, setLoading] = useState(true);
  const [todayPlayersCount, setTodayPlayersCount] = useState(0);
  const [todayMatchesCount, setTodayMatchesCount] = useState(0);
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<AttendanceStatus>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [todayAssignedMatches, setTodayAssignedMatches] = useState<ScheduledMatchView[]>([]);
  const [todayAllMatches, setTodayAllMatches] = useState<ScheduledMatchView[]>([]);

  useEffect(() => {
    if (!userId) return;

    const fetchTodaySummary = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);

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
            .eq('match_date', today)
            .eq('status', 'scheduled'),
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

  const displayName = profile?.full_name || profile?.username || email.split('@')[0];
  const levelLabel = getUserLevelDisplay(profile?.skill_level);
  const topMatch = todayAssignedMatches[0];
  const topMatchOrder = topMatch
    ? todayAllMatches.findIndex((match) => match.id === topMatch.id) + 1
    : 0;

  const handleAttendanceStatusChange = async (nextStatus: Exclude<AttendanceStatus, null>) => {
    if (statusSaving) return;

    const today = new Date().toISOString().slice(0, 10);

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

      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-4">
        <section className="rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">안녕하세요</p>
              <h1 className="mt-1 text-2xl font-semibold">{displayName}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">레벨 {levelLabel}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">출석 {getAttendanceLabel(myAttendanceStatus)}</span>
                {userIsAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-100 transition hover:bg-white/20"
                  >
                    <Shield className="size-3.5" />
                    관리자 홈
                  </Link>
                )}
              </div>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
              상태 {getAttendanceLabel(myAttendanceStatus)}
            </span>
          </div>

          <div className="mt-4 rounded-[22px] bg-white/8 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-200">오늘 상태 선택</p>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-white">
                {getAttendanceLabel(myAttendanceStatus)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
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
                    className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
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
                <span className="font-medium text-slate-900">코트 {topMatch.court_number || '미정'}</span>
                <span className="text-slate-400">·</span>
                <span>{topMatch.match_time || '시간 미정'}</span>
              </div>
              <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-sm leading-6 text-slate-800">
                <span className="font-medium text-slate-900">
                  {topMatch.team1_player1_name} · {topMatch.team1_player2_name}
                </span>
                <span className="mx-2 text-slate-400">|</span>
                <span>
                  {topMatch.team2_player1_name} · {topMatch.team2_player2_name}
                </span>
              </div>
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
                  <div className="flex items-center justify-between">
                    <Icon className="size-4 text-slate-700" />
                    <ArrowRight className="size-4 text-slate-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
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
