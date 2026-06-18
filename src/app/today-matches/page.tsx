'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { formatNameWithCoins } from '@/lib/player-display';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';

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

export default function TodayMatches() {
  const { user, loading: userLoading } = useUser();
  const [matches, setMatches] = useState<ScheduledMatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (userLoading) return;
    
    const fetchTodayMatches = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        // 오늘의 모든 배정된 경기 조회
        const todayMatches = await fetchScheduledMatchesForDate(supabase, today);
        setMatches(todayMatches);
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
              const statusMeta = getMatchStatusMeta(match.status);
              const team1Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team1');
              const team2Outcome = getMatchOutcomeMeta(match.status, match.match_result?.winner ?? null, 'team2');

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
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.chipClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[18px] bg-slate-50 px-3 py-3 text-left">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-900">
                          {getPlayerIcon(match.team1_player1_gender)} {formatNameWithCoins(match.team1_player1_name, match.team1_player1_coin_balance)}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {getPlayerIcon(match.team1_player2_gender)} {formatNameWithCoins(match.team1_player2_name, match.team1_player2_coin_balance)}
                        </div>
                      </div>
                      {team1Outcome && (
                        <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${team1Outcome.chipClass}`}>
                          <span>{team1Outcome.icon}</span>
                          <span>{team1Outcome.label}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[18px] bg-slate-50 px-3 py-3 text-right">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-900">
                          {getPlayerIcon(match.team2_player1_gender)} {formatNameWithCoins(match.team2_player1_name, match.team2_player1_coin_balance)}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {getPlayerIcon(match.team2_player2_gender)} {formatNameWithCoins(match.team2_player2_name, match.team2_player2_coin_balance)}
                        </div>
                      </div>
                      {team2Outcome && (
                        <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${team2Outcome.chipClass}`}>
                          <span>{team2Outcome.icon}</span>
                          <span>{team2Outcome.label}</span>
                        </div>
                      )}
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
