'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/AuthGuard';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';

interface MatchSchedule {
  id: string;
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

export default function MatchRegistrationPage() {
  const { user, profile } = useUser();
  const supabase = getSupabaseClient();
  const [schedules, setSchedules] = useState<MatchSchedule[]>([]);
  const [userMatches, setUserMatches] = useState<UserMatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState<string | null>(null);
  const formatMatchDate = (value: string | null, options: Intl.DateTimeFormatOptions) =>
    value ? new Date(value).toLocaleDateString('ko-KR', options) : '날짜 미정';

  // 경기 일정과 사용자 참가 정보 조회 (고속화: 일괄 조회 + 조인)
  const fetchSchedulesAndParticipation = async () => {
    try {
      setLoading(true);

      const todayStr = new Date().toISOString().split('T')[0];

      // 1) 예정된 경기 일정만 조회 (필요 컬럼만)
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('match_schedules')
        .select('id, match_date, start_time, end_time, location, max_participants, status, description, current_participants')
        .eq('status', 'scheduled')
        .gte('match_date', todayStr)
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (schedulesError) {
        console.error('경기 일정 조회 오류:', schedulesError);
        setSchedules([]);
        setUserMatches([]);
        return;
      }

      const schedulesList: MatchSchedule[] = (schedulesData || []).map((schedule) => ({
        ...schedule,
        status: schedule.status || 'scheduled',
      }));
      setSchedules(schedulesList);

      if (schedulesList.length === 0) {
        setUserMatches([]);
        return;
      }

      const scheduleIds = schedulesList.map((s) => s.id);

      // 2) 쿼리들 병렬 수행
      let participationsRes;
      if (user) {
        participationsRes = await supabase
          .from('match_participants')
          .select('match_schedule_id, status, registered_at')
          .eq('user_id', user.id)
          .in('match_schedule_id', scheduleIds);
      } else {
        participationsRes = { data: [], error: null };
      }

      // 참가자(순수 행) 조회
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

      const participationsData = (participationsRes?.data || []) as Array<{ match_schedule_id: string; status: string; registered_at: string }>;
      const participantsAll = (participantsRes?.data || []) as Array<any>;

      // 참가자 user_id로 프로필 일괄 조회 (username/full_name/skill_level)
      const uniqueUserIds = Array.from(new Set(participantsAll.map((p: any) => p.user_id)));
      let profilesById: Record<string, { username?: string; full_name?: string; skill_level?: string | null }> = {};
      if (uniqueUserIds.length > 0) {
        // profiles 테이블은 auth.users.id를 profiles.user_id 컬럼에 저장하는 경우가 일반적이므로
        // participant.user_id(auth.users.id)로 프로필을 조회해야 합니다.
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, user_id, username, full_name, skill_level')
          .in('user_id', uniqueUserIds);
        if (profilesError) {
          console.error('프로필 조회 오류:', profilesError);
        } else {
          profilesById = (profilesData || []).reduce((acc: Record<string, any>, row: any) => {
            // 매핑 키를 profiles.user_id로 사용
            acc[row.user_id] = {
              username: row.username,
              full_name: row.full_name,
              skill_level: row.skill_level ?? null,
            };
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // 3) 스케줄별 참가자 그룹핑
      const participantsBySchedule = participantsAll.reduce((acc: Record<string, any[]>, row: any) => {
        const key = row.match_schedule_id;
        const p = profilesById[row.user_id] || {};
        const formatted = {
          id: row.id,
          user_id: row.user_id,
          username: p.full_name || p.username || '',
          full_name: p.full_name || '',
          skill_level: p.skill_level ?? null,
          status: row.status,
        };
        if (!acc[key]) acc[key] = [];
        acc[key].push(formatted);
        return acc;
      }, {} as Record<string, any[]>);

      // 4) 최종 매핑
      const userMatchesInfo: UserMatchInfo[] = schedulesList.map((schedule) => {
        const participation = user
          ? (participationsData || []).find((p) => p.match_schedule_id === schedule.id)
          : null;
        const participants = participantsBySchedule[schedule.id] || [];

        return {
          schedule,
          participation: participation as any,
          isRegistered: participation?.status === 'registered',
          actualParticipantCount: participants.length,
          participants,
        };
      });

      setUserMatches(userMatchesInfo);
    } catch (error) {
      console.error('데이터 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 경기 참가 신청
  const registerForMatch = async (scheduleId: string) => {
    if (!user) return;

    try {
      setRegistering(scheduleId);

      console.log(`🎯 경기 ${scheduleId}에 참가 신청 시작...`);

      // 먼저 이미 참가했는지 확인
      const { data: existingParticipation, error: checkError } = await supabase
        .from('match_participants')
        .select('status')
        .eq('match_schedule_id', scheduleId)
        .eq('user_id', user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ 참가 확인 오류:', checkError);
        alert('참가 확인 중 오류가 발생했습니다.');
        return;
      }

      if (existingParticipation) {
        if (existingParticipation.status === 'registered') {
          alert('이미 이 경기에 참가 신청하셨습니다.');
          return;
        } else if (existingParticipation.status === 'cancelled') {
          // 취소된 상태라면 상태를 다시 registered로 변경
          const { error: updateError } = await supabase
            .from('match_participants')
            .update({ status: 'registered' })
            .eq('match_schedule_id', scheduleId)
            .eq('user_id', user.id);

          if (updateError) {
            console.error('❌ 참가 상태 변경 오류:', updateError);
            alert('참가 신청 중 오류가 발생했습니다.');
            return;
          }
        }
      } else {
        // 새로운 참가 신청
        console.log(`📝 새로운 참가 신청 데이터:`, {
          match_schedule_id: scheduleId,
          user_id: user.id,
          status: 'registered'
        });

        const { data: insertedData, error } = await supabase
          .from('match_participants')
          .insert({
            match_schedule_id: scheduleId,
            user_id: user.id,
            status: 'registered'
          })
          .select('*');

        console.log(`📤 참가 신청 결과:`, { data: insertedData, error });

        if (error) {
          console.error('❌ 참가 신청 오류:', error);
          console.error('❌ 참가 신청 상세 오류:', JSON.stringify(error, null, 2));
          alert(`참가 신청 중 오류가 발생했습니다: ${error.message || error.details || '알 수 없는 오류'}`);
          return;
        }

        console.log('✅ 참가 신청 DB 저장 성공:', insertedData);
      }

      console.log('✅ 참가 신청 완료! 낙관적 UI 반영...');

      // 낙관적 UI 업데이트: 해당 경기의 참가자 수 증가 및 버튼 전환
      setUserMatches((prev) =>
        prev.map((m) => {
          if (m.schedule.id !== scheduleId) return m;
          // 이미 등록 상태면 그대로 반환
          if (m.isRegistered) return m;

          const me = {
            id: `temp-${user.id}-${Date.now()}`,
            user_id: user.id,
            username: profile?.full_name || profile?.username || '',
            full_name: profile?.full_name || '',
            skill_level: profile?.skill_level || null,
            status: 'registered'
          } as any;

          return {
            ...m,
            isRegistered: true,
            participation: {
              id: `temp-${user.id}-${Date.now()}`,
              match_schedule_id: scheduleId,
              user_id: user.id,
              status: 'registered',
              registered_at: new Date().toISOString()
            } as any,
            actualParticipantCount: (m.actualParticipantCount || 0) + 1,
            participants: [...m.participants, me]
          };
        })
      );

      // 데이터 새로고침(백그라운드)으로 정확한 데이터 동기화
      setTimeout(async () => {
        console.log('🔄 참가 신청 후 데이터 새로고침 시작...');
        await fetchSchedulesAndParticipation();
        console.log('🔄 참가 신청 후 데이터 새로고침 완료!');
      }, 300);

      alert('참가 신청이 완료되었습니다!');
    } catch (error) {
      console.error('💥 참가 신청 중 오류:', error);
      alert('참가 신청 중 오류가 발생했습니다.');
    } finally {
      setRegistering(null);
    }
  };

  // 경기 참가 취소
  const cancelRegistration = async (scheduleId: string) => {
    if (!user || !confirm('참가를 취소하시겠습니까?')) return;

    try {
      setRegistering(scheduleId);

      console.log(`❌ 경기 ${scheduleId} 참가 취소 시작...`);

      const { error } = await supabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .eq('match_schedule_id', scheduleId)
        .eq('user_id', user.id);

      if (error) {
        console.error('❌ 참가 취소 오류:', error);
        alert('참가 취소 중 오류가 발생했습니다.');
        return;
      }

      console.log('✅ 참가 취소 완료! 낙관적 UI 반영...');

      // 낙관적 UI 업데이트: 해당 경기의 참가자 수 감소 및 버튼 전환
      setUserMatches((prev) =>
        prev.map((m) => {
          if (m.schedule.id !== scheduleId) return m;
          if (!m.isRegistered) return m;
          return {
            ...m,
            isRegistered: false,
            participation: m.participation
              ? { ...m.participation, status: 'cancelled' as any }
              : null,
            actualParticipantCount: Math.max((m.actualParticipantCount || 0) - 1, 0),
            participants: m.participants.filter((p) => p.user_id !== user.id)
          };
        })
      );

      // 데이터 새로고침(백그라운드)
      setTimeout(async () => {
        console.log('🔄 참가 취소 후 데이터 새로고침 시작...');
        await fetchSchedulesAndParticipation();
        console.log('🔄 참가 취소 후 데이터 새로고침 완료!');
      }, 300);

      alert('참가가 취소되었습니다.');
    } catch (error) {
      console.error('💥 참가 취소 중 오류:', error);
      alert('참가 취소 중 오류가 발생했습니다.');
    } finally {
      setRegistering(null);
    }
  };

  useEffect(() => {
    fetchSchedulesAndParticipation();
  }, [user]);

  // 실시간 참가자 변화 감지(다른 회원의 신청/취소도 자동 반영)
  useEffect(() => {
    // Realtime: match_participants 테이블의 INSERT/UPDATE/DELETE 변경 구독
    const channel = supabase
      .channel('realtime-match-participants')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_participants' },
        () => {
          // 변경 발생 시 최신 데이터로 동기화
          fetchSchedulesAndParticipation();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (_) {
        // noop
      }
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'ongoing': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return '참가 가능';
      case 'ongoing': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto mt-10 p-6">
        {/* 상단 인사말 섹션 */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-8 text-white">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              🎯 경기 참가 신청
            </h1>
            <Link href="/" className="text-white hover:text-blue-100 transition-colors">
              🏠 홈
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm mb-4">
            <span className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full">
              {profile?.full_name || profile?.username || '회원'}님
            </span>
            <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
              레벨: {(profile?.skill_level ? `${profile.skill_level}급` : 'E2급')}
            </span>
          </div>
          <p className="text-blue-100">
            예정된 경기에 참가 신청하고 나의 참가 현황을 확인하세요! 🙋‍♂️
          </p>
        </div>

        <div className="bg-white shadow rounded-lg">

          <div className="p-6">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-gray-600">로딩 중...</span>
              </div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>참가 가능한 경기가 없습니다.</p>
                <p className="text-sm mt-2">관리자가 새로운 경기 일정을 등록할 때까지 기다려주세요.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {userMatches.map((matchInfo) => (
                  <div
                    key={matchInfo.schedule.id}
                    className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {formatMatchDate(matchInfo.schedule.match_date, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long'
                          })}
                        </h3>
                        <p className="text-gray-600 mt-1">
                          🕐 {matchInfo.schedule.start_time} - {matchInfo.schedule.end_time}
                        </p>
                        <p className="text-gray-600">
                          📍 {matchInfo.schedule.location}
                        </p>
                        {matchInfo.schedule.description && (
                          <p className="text-gray-600 mt-2 text-sm">
                            💬 {matchInfo.schedule.description.replace(/\s*-\s*정기모임\s*\([^)]+\)/, '')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <div className={`px-3 py-1 rounded text-sm ${
                          matchInfo.actualParticipantCount >= matchInfo.schedule.max_participants 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          참가자: {matchInfo.actualParticipantCount} / {matchInfo.schedule.max_participants}
                        </div>
                        
                        <Button
                          onClick={() => setShowParticipants(showParticipants === matchInfo.schedule.id ? null : matchInfo.schedule.id)}
                          variant="outline"
                          className="text-xs px-2 py-1 h-7"
                        >
                          {showParticipants === matchInfo.schedule.id ? '참가자 숨기기' : `참가자 확인 (${matchInfo.actualParticipantCount})`}
                        </Button>
                      </div>

                      <div className="space-x-2 flex flex-col items-end">
                        {matchInfo.isRegistered ? (
                          <Button
                            onClick={() => cancelRegistration(matchInfo.schedule.id)}
                            disabled={registering === matchInfo.schedule.id}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 text-xs px-3 py-1 h-7"
                          >
                            {registering === matchInfo.schedule.id ? '처리 중...' : '참가 취소'}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => registerForMatch(matchInfo.schedule.id)}
                            disabled={
                              registering === matchInfo.schedule.id ||
                              matchInfo.actualParticipantCount >= matchInfo.schedule.max_participants
                            }
                            className="bg-blue-300 hover:bg-blue-400 text-blue-900 text-xs px-3 py-1 h-7"
                          >
                            {registering === matchInfo.schedule.id ? '신청 중...' : '참가 신청'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 참가자 목록 표시 */}
                    {showParticipants === matchInfo.schedule.id && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          참가자 목록 ({matchInfo.participants.length}명)
                        </h4>
                        {matchInfo.participants.length > 0 ? (
                          <div className="grid grid-cols-3 gap-1">
                            {matchInfo.participants.map((participant, index) => (
                              <div
                                key={participant.id || `participant-${index}`}
                                className="flex items-center text-xs text-gray-700 py-1"
                              >
                                <span className="text-gray-400 mr-1">{index + 1}.</span>
                                <span className="truncate flex-1">
                                  {participant.full_name || participant.username || '이름 없음'}
                                  {participant.user_id === user?.id && (
                                    <span className="text-green-600 ml-1">*</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-gray-500 text-xs">
                            아직 참가자가 없습니다.
                          </div>
                        )}
                      </div>
                    )}

                    {matchInfo.participation && matchInfo.participation.registered_at && (
                      <div className="mt-3 text-xs text-gray-500">
                        신청일시: {new Date(matchInfo.participation.registered_at).toLocaleString('ko-KR')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 나의 참가 현황 섹션 */}
        {userMatches.some(m => m.isRegistered) && (
          <div className="bg-white shadow rounded-lg mt-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                나의 참가 경기 📋
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {userMatches
                  .filter(m => m.isRegistered)
                  .map((matchInfo) => (
                    <div
                      key={`my-${matchInfo.schedule.id}`}
                      className="border rounded-lg p-4 bg-blue-50"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {formatMatchDate(matchInfo.schedule.match_date, {
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short'
                            })}
                            {' '}
                            {matchInfo.schedule.start_time}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {matchInfo.schedule.location}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-blue-600 font-medium">참가 확정</div>
                          <div className="text-gray-500">
                            {matchInfo.actualParticipantCount}명 참가 예정
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
