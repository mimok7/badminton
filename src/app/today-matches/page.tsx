'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';

type AttendanceStatus = 'present' | 'lesson' | 'absent';

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string; chip: string }> = [
  { value: 'present', label: '출석', chip: '출석' },
  { value: 'lesson', label: '레슨', chip: '레슨' },
  { value: 'absent', label: '퇴근', chip: '퇴근' },
];

export default function TodayMatches() {
  const { user, loading: userLoading } = useUser();
  const [matches, setMatches] = useState<ScheduledMatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (userLoading) return;
    
    const fetchTodayMatches = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        // 오늘의 모든 배정된 경기 조회
        const todayMatches = await fetchScheduledMatchesForDate(supabase, today);
        setMatches(todayMatches);

        if (user?.id) {
          const response = await fetch(`/api/attendance/status?date=${today}`);
          const payload = await response.json().catch(() => null);

          if (!response.ok) {
            console.error('출석 상태 조회 오류:', payload);
          } else {
            const normalized = payload?.status;
            if (normalized === 'present' || normalized === 'lesson' || normalized === 'absent') {
              setAttendanceStatus(normalized);
            } else {
              setAttendanceStatus(null);
            }
          }
        }
      } catch (error) {
        console.error('데이터 조회 중 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayMatches();
  }, [userLoading, user?.id, supabase]);

  const handleAttendanceStatusChange = async (nextStatus: AttendanceStatus) => {
    if (!user?.id || statusSaving) {
      alert('로그인 상태를 확인한 뒤 다시 시도해주세요.');
      return;
    }

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

      setAttendanceStatus(nextStatus);
    } catch (error) {
      console.error('출석 상태 저장 오류:', error);
      alert('상태 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setStatusSaving(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          오늘 경기를 불러오는 중입니다
        </div>
      </div>
    );
  }

  const isPlayerInMatch = (match: ScheduledMatchView) => {
    return match.team1_player1 === user?.id || 
           match.team1_player2 === user?.id || 
           match.team2_player1 === user?.id || 
           match.team2_player2 === user?.id;
  };

  const getPlayerTeam = (match: ScheduledMatchView) => {
    if (match.team1_player1 === user?.id || match.team1_player2 === user?.id) {
      return 'team1';
    }
    if (match.team2_player1 === user?.id || match.team2_player2 === user?.id) {
      return 'team2';
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">Today Matches</p>
              <h1 className="mt-1 text-2xl font-semibold">🏸 오늘의 경기</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {new Date().toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              홈
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/8 px-2 py-3">
              <p className="text-[11px] text-slate-300">총 경기</p>
              <p className="mt-1 text-lg font-semibold">{matches.length}</p>
            </div>
            <div className="rounded-2xl bg-white/8 px-2 py-3">
              <p className="text-[11px] text-slate-300">내 경기</p>
              <p className="mt-1 text-lg font-semibold">{matches.filter(isPlayerInMatch).length}</p>
            </div>
            <div className="rounded-2xl bg-white/8 px-2 py-3">
              <p className="text-[11px] text-slate-300">코트</p>
              <p className="mt-1 text-lg font-semibold">
                {matches.length > 0 ? Math.max(...matches.map((m) => m.court_number || 0)) : 0}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] bg-white/8 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-200">오늘 상태</p>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-white">
                {attendanceStatus
                  ? ATTENDANCE_OPTIONS.find((option) => option.value === attendanceStatus)?.chip
                  : '미선택'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {ATTENDANCE_OPTIONS.map((option) => {
                const isActive = attendanceStatus === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!user?.id || statusSaving}
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

        {matches.length === 0 ? (
          <section className="rounded-[24px] bg-white px-4 py-10 text-center shadow-sm">
            <div className="text-5xl">🏸</div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">오늘 배정된 경기가 없습니다</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">관리자가 경기를 배정하면 여기에 표시됩니다.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {matches.map((match, index) => {
              const inMatch = isPlayerInMatch(match);
              const team = getPlayerTeam(match);

              return (
                <article
                  key={match.id}
                  className={`rounded-[24px] border p-4 shadow-sm transition-all ${
                    inMatch ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ${inMatch ? 'bg-amber-500' : 'bg-slate-400'}`}>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          경기 #{index + 1}
                          {inMatch && (
                            <span className="ml-2 rounded-full bg-amber-200 px-2 py-1 text-[11px] font-medium text-amber-800">
                              내 경기
                            </span>
                          )}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>⏰ {match.match_time || '시간 미정'}</span>
                          <span>🏟️ 코트 {match.court_number || '미정'}</span>
                        </div>
                      </div>
                    </div>
                    {team && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${team === 'team1' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                        내 팀
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className={`rounded-[20px] p-4 ${team === 'team1' ? 'border-2 border-blue-300 bg-blue-50' : 'bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-blue-800">팀 1</span>
                        {team === 'team1' && <span className="rounded-full bg-blue-200 px-2 py-1 text-[11px] font-medium text-blue-800">내 팀</span>}
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-blue-700">
                        <div className={`${match.team1_player1 === user?.id ? 'font-semibold text-blue-900 underline' : 'font-medium'}`}>👤 {match.team1_player1_name}</div>
                        <div className={`${match.team1_player2 === user?.id ? 'font-semibold text-blue-900 underline' : 'font-medium'}`}>👤 {match.team1_player2_name}</div>
                      </div>
                    </div>

                    <div className={`rounded-[20px] p-4 ${team === 'team2' ? 'border-2 border-rose-300 bg-rose-50' : 'bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-rose-800">팀 2</span>
                        {team === 'team2' && <span className="rounded-full bg-rose-200 px-2 py-1 text-[11px] font-medium text-rose-800">내 팀</span>}
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-rose-700">
                        <div className={`${match.team2_player1 === user?.id ? 'font-semibold text-rose-900 underline' : 'font-medium'}`}>👤 {match.team2_player1_name}</div>
                        <div className={`${match.team2_player2 === user?.id ? 'font-semibold text-rose-900 underline' : 'font-medium'}`}>👤 {match.team2_player2_name}</div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
