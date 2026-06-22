'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';

import { RequireAuth } from '@/components/AuthGuard';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { getKoreaDate } from '@/lib/date';
import { getUserLevelDisplay } from '@/lib/level-display';
import { formatCurrentUserNameWithCoins } from '@/lib/player-display';
import { getSupabaseClient } from '@/lib/supabase';

interface MatchSchedule {
  id: string;
  generated_match_id: number | null;
  schedule_source: string | null;
  match_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  max_participants: number;
  current_participants: number;
  status: string;
  description: string | null;
}

interface MatchParticipant {
  id: string;
  match_schedule_id: string;
  user_id: string;
  status: string;
  registered_at: string;
}

interface UserMatchInfo {
  schedule: MatchSchedule;
  participation: MatchParticipant | null;
  isRegistered: boolean;
  actualParticipantCount: number;
  participants: Array<{
    id: string;
    user_id: string;
    username: string | null;
    full_name: string | null;
    skill_level: string | null;
    status: string;
  }>;
}

function formatMatchDate(value: string | null, options: Intl.DateTimeFormatOptions) {
  return value ? new Date(value).toLocaleDateString('ko-KR', options) : '날짜 미정';
}

export default function MatchRegistrationPage() {
  const { user, profile } = useUser();
  const supabase = getSupabaseClient();
  const participantProfileId = profile?.id ?? null;
  const participantKeys = useMemo(
    () => Array.from(new Set([user?.id, participantProfileId].filter((value): value is string => Boolean(value)))),
    [user?.id, participantProfileId]
  );

  const [schedules, setSchedules] = useState<MatchSchedule[]>([]);
  const [userMatches, setUserMatches] = useState<UserMatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState<string | null>(null);

  const fetchSchedulesAndParticipation = useCallback(async () => {
    try {
      setLoading(true);
      const todayStr = getKoreaDate();
      let schedulesList: MatchSchedule[] = [];

      const { data: schedulesData, error: schedulesError } = await supabase
        .from('match_schedules')
        .select('id, generated_match_id, schedule_source, match_date, start_time, end_time, location, max_participants, status, description, current_participants')
        .eq('status', 'scheduled')
        .gte('match_date', todayStr)
        .is('generated_match_id', null)
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(100);

      if (schedulesError) {
        console.error('경기 일정 조회 오류:', schedulesError);
        setSchedules([]);
        setUserMatches([]);
        return;
      }

      const filteredSchedules: MatchSchedule[] = (schedulesData || [])
        .filter((schedule) => {
          const description = schedule.description || '';
          return schedule.generated_match_id == null
            && schedule.schedule_source !== 'generated'
            && !description.includes('자동 배정된 경기');
        })
        .map((schedule) => ({
          ...schedule,
          status: schedule.status || 'scheduled',
        }));
      const visibleDates = new Set<string>();
      schedulesList = filteredSchedules.filter((schedule) => {
        if (!schedule.match_date) {
          return false;
        }

        if (visibleDates.has(schedule.match_date)) {
          return true;
        }

        if (visibleDates.size >= 5) {
          return false;
        }

        visibleDates.add(schedule.match_date);
        return true;
      });

      setSchedules(schedulesList);

      if (schedulesList.length === 0) {
        setUserMatches([]);
        return;
      }

      const scheduleIds = schedulesList.map((schedule) => schedule.id);

      const participationsRes = participantKeys.length > 0
        ? await supabase
            .from('match_participants')
            .select('id, match_schedule_id, user_id, status, registered_at')
            .in('user_id', participantKeys)
            .in('match_schedule_id', scheduleIds)
        : { data: [], error: null };

      const participantsRes = await supabase
        .from('match_participants')
        .select('id, user_id, status, registered_at, match_schedule_id')
        .in('match_schedule_id', scheduleIds)
        .eq('status', 'registered');

      if (participationsRes.error) {
        console.error('참가 정보 조회 오류:', participationsRes.error);
      }

      if (participantsRes.error) {
        console.error('참가자 목록 조회 오류:', participantsRes.error);
      }

      const participationsData = (participationsRes.data || []) as MatchParticipant[];
      const participantsAll = (participantsRes.data || []) as Array<{
        id: string;
        user_id: string;
        status: string;
        registered_at: string;
        match_schedule_id: string;
      }>;

      const uniqueUserIds = Array.from(new Set(participantsAll.map((participant) => participant.user_id).filter(Boolean)));
      let profilesById: Record<string, { username?: string; full_name?: string; skill_level?: string | null }> = {};

      if (uniqueUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, user_id, username, full_name, skill_level')
          .or(uniqueUserIds.map((id) => `id.eq.${id},user_id.eq.${id}`).join(','));

        if (profilesError) {
          console.error('프로필 조회 오류:', profilesError);
        } else {
          profilesById = (profilesData || []).reduce((acc: Record<string, any>, row: any) => {
            const info = {
              username: row.username,
              full_name: row.full_name,
              skill_level: row.skill_level ?? null,
            };

            if (row.id) acc[row.id] = info;
            if (row.user_id) acc[row.user_id] = info;
            return acc;
          }, {});
        }
      }

      const participantsBySchedule = participantsAll.reduce((acc: Record<string, any[]>, participant) => {
        const key = participant.match_schedule_id;
        const profileInfo = profilesById[participant.user_id] || {};
        const formattedParticipant = {
          id: participant.id,
          user_id: participant.user_id,
          username: profileInfo.username || null,
          full_name: profileInfo.full_name || null,
          skill_level: profileInfo.skill_level ?? null,
          status: participant.status,
        };

        if (!acc[key]) acc[key] = [];
        acc[key].push(formattedParticipant);
        return acc;
      }, {});

      const nextUserMatches = schedulesList.map((schedule) => {
        const participation =
          participationsData.find((item) => item.match_schedule_id === schedule.id && item.status === 'registered') ||
          participationsData.find((item) => item.match_schedule_id === schedule.id) ||
          null;
        const participants = participantsBySchedule[schedule.id] || [];

        return {
          schedule,
          participation,
          isRegistered: participation?.status === 'registered',
          actualParticipantCount: participants.length,
          participants,
        };
      });

      setUserMatches(nextUserMatches);
    } catch (error) {
      console.error('데이터 조회 중 오류:', error);
      setSchedules([]);
      setUserMatches([]);
    } finally {
      setLoading(false);
    }
  }, [participantKeys, supabase]);

  const registerForMatch = async (scheduleId: string) => {
    if (!user) return;

    if (participantKeys.length === 0) {
      alert('프로필 정보가 없습니다. 먼저 프로필 연결 상태를 확인해주세요.');
      return;
    }

    try {
      setRegistering(scheduleId);

      const { data: existingParticipations, error: checkError } = await supabase
        .from('match_participants')
        .select('id, user_id, status, registered_at')
        .eq('match_schedule_id', scheduleId)
        .in('user_id', participantKeys);

      if (checkError) {
        console.error('참가 확인 오류:', checkError);
        alert('참가 확인 중 오류가 발생했습니다.');
        return;
      }

      const existingParticipation =
        (existingParticipations || []).find((item) => item.status === 'registered') ||
        (existingParticipations || [])[0] ||
        null;

      if (existingParticipation?.status === 'registered') {
        alert('이미 이 경기에 참가 신청하셨습니다.');
        return;
      }

      if (existingParticipation?.status === 'cancelled') {
        const { error: updateError } = await supabase
          .from('match_participants')
          .update({ status: 'registered' })
          .eq('id', existingParticipation.id);

        if (updateError) {
          console.error('참가 상태 변경 오류:', updateError);
          alert('참가 신청 중 오류가 발생했습니다.');
          return;
        }
      } else {
        let insertError: { message?: string } | null = null;
        let insertedWithKey: string | null = null;

        for (const participantKey of participantKeys) {
          const { error } = await supabase
            .from('match_participants')
            .insert({
              match_schedule_id: scheduleId,
              user_id: participantKey,
              status: 'registered',
            });

          if (!error) {
            insertedWithKey = participantKey;
            insertError = null;
            break;
          }

          insertError = error;

          if (error.code === '23505') {
            const { error: restoreError } = await supabase
              .from('match_participants')
              .update({ status: 'registered' })
              .eq('match_schedule_id', scheduleId)
              .eq('user_id', participantKey);

            if (!restoreError) {
              insertedWithKey = participantKey;
              insertError = null;
              break;
            }

            insertError = restoreError;
          }
        }

        if (insertError || !insertedWithKey) {
          console.error('참가 신청 오류:', insertError);
          alert(`참가 신청 중 오류가 발생했습니다: ${insertError?.message || '알 수 없는 오류'}`);
          return;
        }
      }

      setUserMatches((previous) =>
        previous.map((matchInfo) => {
          if (matchInfo.schedule.id !== scheduleId || matchInfo.isRegistered) {
            return matchInfo;
          }

          const tempParticipantId = `temp-${participantKeys[0]}-${Date.now()}`;
          return {
            ...matchInfo,
            isRegistered: true,
            participation: {
              id: tempParticipantId,
              match_schedule_id: scheduleId,
              user_id: participantKeys[0],
              status: 'registered',
              registered_at: new Date().toISOString(),
            },
            actualParticipantCount: matchInfo.actualParticipantCount + 1,
            participants: [
              ...matchInfo.participants,
              {
                id: tempParticipantId,
                user_id: participantKeys[0],
                username: profile?.username || '',
                full_name: profile?.full_name || '',
                skill_level: profile?.skill_level || null,
                status: 'registered',
              },
            ],
          };
        })
      );

      setTimeout(fetchSchedulesAndParticipation, 300);
      alert('참가 신청이 완료되었습니다.');
    } catch (error) {
      console.error('참가 신청 중 오류:', error);
      alert('참가 신청 중 오류가 발생했습니다.');
    } finally {
      setRegistering(null);
    }
  };

  const cancelRegistration = async (scheduleId: string) => {
    if (!user || participantKeys.length === 0 || !confirm('참가를 취소하시겠습니까?')) {
      return;
    }

    try {
      setRegistering(scheduleId);

      const { data: existingParticipations, error: lookupError } = await supabase
        .from('match_participants')
        .select('id, user_id, status')
        .eq('match_schedule_id', scheduleId)
        .in('user_id', participantKeys);

      if (lookupError) {
        console.error('참가 취소 대상 조회 오류:', lookupError);
        alert('참가 취소 대상을 찾는 중 오류가 발생했습니다.');
        return;
      }

      const targetParticipation =
        (existingParticipations || []).find((item) => item.status === 'registered') ||
        (existingParticipations || [])[0] ||
        null;

      if (!targetParticipation) {
        alert('취소할 참가 신청 정보를 찾지 못했습니다.');
        return;
      }

      const { error } = await supabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .eq('id', targetParticipation.id);

      if (error) {
        console.error('참가 취소 오류:', error);
        alert('참가 취소 중 오류가 발생했습니다.');
        return;
      }

      setUserMatches((previous) =>
        previous.map((matchInfo) => {
          if (matchInfo.schedule.id !== scheduleId || !matchInfo.isRegistered) {
            return matchInfo;
          }

          return {
            ...matchInfo,
            isRegistered: false,
            participation: matchInfo.participation
              ? { ...matchInfo.participation, status: 'cancelled' }
              : null,
            actualParticipantCount: Math.max(matchInfo.actualParticipantCount - 1, 0),
            participants: matchInfo.participants.filter((participant) => !participantKeys.includes(participant.user_id)),
          };
        })
      );

      setTimeout(fetchSchedulesAndParticipation, 300);
      alert('참가가 취소되었습니다.');
    } catch (error) {
      console.error('참가 취소 중 오류:', error);
      alert('참가 취소 중 오류가 발생했습니다.');
    } finally {
      setRegistering(null);
    }
  };

  useEffect(() => {
    fetchSchedulesAndParticipation();
  }, [fetchSchedulesAndParticipation]);

  useEffect(() => {
    const onFocus = () => {
      fetchSchedulesAndParticipation();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSchedulesAndParticipation();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchSchedulesAndParticipation]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-match-registration')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants' }, fetchSchedulesAndParticipation)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_schedules' }, fetchSchedulesAndParticipation)
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // noop
      }
    };
  }, [fetchSchedulesAndParticipation, supabase]);

  const registeredMatches = userMatches.filter((match) => match.isRegistered);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
          <section className="rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-300">경기 신청</p>
                <h1 className="mt-1 text-2xl font-semibold">참가 가능한 경기를 확인하세요</h1>
              </div>
              <Link
                href="/dashboard"
                className="rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                홈
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">
                {formatCurrentUserNameWithCoins(profile?.full_name || profile?.username || '회원', profile?.coin_balance)}님
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">
                레벨 {getUserLevelDisplay(profile?.skill_level)}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              원하는 일정에 바로 참가 신청하고, 신청한 경기 수와 현재 참가 인원을 한 화면에서 확인할 수 있습니다.
            </p>
          </section>

          <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">예정 일정</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">참가 신청 목록</h2>
              </div>
              <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                대시보드
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">목록을 불러오는 중입니다.</div>
            ) : schedules.length === 0 ? (
              <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-5 text-sm text-slate-600">
                참가 가능한 경기가 없습니다. 새 일정이 등록되면 여기에서 바로 신청할 수 있습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {userMatches.map((matchInfo) => {
                  const isFull = matchInfo.actualParticipantCount >= matchInfo.schedule.max_participants;
                  const participantsVisible = showParticipants === matchInfo.schedule.id;

                  return (
                    <article key={matchInfo.schedule.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {formatMatchDate(matchInfo.schedule.match_date, {
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short',
                            })}
                          </p>
                          <div className="mt-2 space-y-1.5 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="size-4 text-slate-400" />
                              <span>{matchInfo.schedule.start_time || '시간 미정'} - {matchInfo.schedule.end_time || '시간 미정'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="size-4 text-slate-400" />
                              <span>{matchInfo.schedule.location || '장소 미정'}</span>
                            </div>
                          </div>
                        </div>

                        {matchInfo.schedule.description && (
                          <p className="text-sm leading-6 text-slate-600">
                            {matchInfo.schedule.description.replace(/\s*-\s*정기모임\s*\([^)]+\)/, '')}
                          </p>
                        )}

                        <div className="flex items-center justify-between rounded-[18px] bg-white px-3 py-3">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Users className="size-4 text-slate-400" />
                            <span>
                              {matchInfo.actualParticipantCount} / {matchInfo.schedule.max_participants}명
                            </span>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isFull ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {isFull ? '마감' : '신청 가능'}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => setShowParticipants(matchInfo.schedule.id)}
                            variant="outline"
                            className="h-10 flex-1 rounded-full border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                          >
                            참가자 {matchInfo.actualParticipantCount}명
                          </Button>

                          {matchInfo.isRegistered ? (
                            <Button
                              onClick={() => cancelRegistration(matchInfo.schedule.id)}
                              disabled={registering === matchInfo.schedule.id}
                              variant="outline"
                              className="h-10 flex-1 rounded-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                            >
                              {registering === matchInfo.schedule.id ? '처리 중...' : '참가 취소'}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => registerForMatch(matchInfo.schedule.id)}
                              disabled={registering === matchInfo.schedule.id || isFull}
                              className="h-10 flex-1 rounded-full bg-slate-950 text-white hover:bg-slate-800"
                            >
                              {registering === matchInfo.schedule.id ? '신청 중...' : '참가 신청'}
                            </Button>
                          )}
                        </div>

                        {matchInfo.participation?.registered_at && matchInfo.isRegistered && (
                          <p className="text-xs text-slate-500">
                            신청일시 {new Date(matchInfo.participation.registered_at).toLocaleString('ko-KR')}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {registeredMatches.length > 0 && (
            <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">내 현황</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">신청한 경기</h2>
              <div className="mt-4 space-y-3">
                {registeredMatches.map((matchInfo) => (
                  <div key={`my-${matchInfo.schedule.id}`} className="rounded-[20px] bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatMatchDate(matchInfo.schedule.match_date, {
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{matchInfo.schedule.start_time || '시간 미정'} · {matchInfo.schedule.location || '장소 미정'}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        참가 확정
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showParticipants && (() => {
            const activeMatch = userMatches.find((matchInfo) => matchInfo.schedule.id === showParticipants);

            if (!activeMatch) {
              return null;
            }

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="participant-modal-title"
                onClick={() => setShowParticipants(null)}
              >
                <div
                  className="w-full max-w-4xl rounded-[28px] bg-white p-4 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">참가자 목록</p>
                      <h3 id="participant-modal-title" className="mt-1 text-lg font-semibold text-slate-900">
                        {formatMatchDate(activeMatch.schedule.match_date, {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })} · {activeMatch.schedule.start_time || '시간 미정'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {activeMatch.schedule.location || '장소 미정'} · {activeMatch.actualParticipantCount} / {activeMatch.schedule.max_participants}명
                      </p>
                    </div>

                    <Button
                      onClick={() => setShowParticipants(null)}
                      variant="outline"
                      className="h-9 rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      닫기
                    </Button>
                  </div>

                  <div className="mt-4 max-h-[70vh] overflow-y-auto">
                    {activeMatch.participants.length > 0 ? (
                      <div className="grid grid-cols-4 gap-2">
                        {activeMatch.participants.map((participant, index) => (
                          <div
                            key={participant.id || `${participant.user_id}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                          >
                            <div className="flex flex-col items-center gap-1 text-center">
                              <span className="font-medium text-slate-900">
                                {participant.full_name || participant.username || '이름 없음'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        아직 참가자가 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </RequireAuth>
  );
}
