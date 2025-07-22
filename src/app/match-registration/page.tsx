'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/AuthGuard';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';

interface MatchSchedule {
  id: string;
  match_date: string;
  start_time: string;
  end_time: string;
  location: string;
  max_participants: number;
  current_participants: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  description: string | null;
}

interface MatchParticipant {
  id: string;
  match_schedule_id: string;
  user_id: string;
  status: 'registered' | 'cancelled' | 'attended' | 'absent';
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
    username: string;
    full_name: string;
    skill_level: string | null;
    status: string;
  }>;
}

export default function MatchRegistrationPage() {
  const { user, profile } = useUser();
  const supabase = createClientComponentClient();
  const [schedules, setSchedules] = useState<MatchSchedule[]>([]);
  const [userMatches, setUserMatches] = useState<UserMatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState<string | null>(null);

  // 경기 일정과 사용자 참가 정보 조회
  const fetchSchedulesAndParticipation = async () => {
    try {
      setLoading(true);
      
      // 예정된 경기 일정만 조회
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('match_schedules')
        .select('*')
        .eq('status', 'scheduled')
        .gte('match_date', new Date().toISOString().split('T')[0])
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (schedulesError) {
        console.error('경기 일정 조회 오류:', schedulesError);
        return;
      }

      const schedulesList = schedulesData || [];
      setSchedules(schedulesList);

      if (!user || schedulesList.length === 0) {
        setUserMatches([]);
        return;
      }

      // 사용자의 참가 정보 조회
      const { data: participationsData, error: participationsError } = await supabase
        .from('match_participants')
        .select('*')
        .eq('user_id', user.id)
        .in('match_schedule_id', schedulesList.map(s => s.id));

      if (participationsError) {
        console.error('참가 정보 조회 오류:', participationsError);
        return;
      }

      // 각 경기별 모든 참가자 정보 조회
      const allParticipantsPromises = schedulesList.map(async (schedule) => {
        try {
          console.log(`🔍 경기 ${schedule.id} 참가자 조회 시작...`);
          
          // 먼저 간단한 쿼리로 참가자 수만 확인
          const { data: simpleCount, error: countError } = await supabase
            .from('match_participants')
            .select('id')
            .eq('match_schedule_id', schedule.id)
            .eq('status', 'registered');

          console.log(`📊 경기 ${schedule.id} 간단 참가자 수:`, simpleCount?.length || 0);

          // 상세 참가자 정보 조회 - 조인 방식 변경
          const { data: participants, error } = await supabase
            .from('match_participants')
            .select(`
              id,
              user_id,
              status,
              registered_at
            `)
            .eq('match_schedule_id', schedule.id)
            .eq('status', 'registered');

          if (error) {
            console.error(`❌ 경기 ${schedule.id} 참가자 조회 오류:`, error);
            // 에러가 있어도 빈 배열로 계속 진행
            return { scheduleId: schedule.id, participants: [] };
          }

          console.log(`📋 경기 ${schedule.id} 참가자 데이터:`, participants);

          if (!participants || participants.length === 0) {
            console.log(`⚠️ 경기 ${schedule.id}에 참가자가 없습니다.`);
            return { scheduleId: schedule.id, participants: [] };
          }

          // 각 참가자의 프로필 정보를 별도로 조회
          const participantsWithProfiles = await Promise.all(
            participants.map(async (participant) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('username, full_name, skill_level')
                .eq('user_id', participant.user_id)
                .single();

              return {
                id: participant.id,
                user_id: participant.user_id,
                username: profile?.username || '',
                full_name: profile?.full_name || '',
                skill_level: profile?.skill_level || null,
                status: participant.status
              };
            })
          );

          console.log(`✅ 경기 ${schedule.id} 포맷된 참가자 (${participantsWithProfiles.length}명):`, participantsWithProfiles);

          return { scheduleId: schedule.id, participants: participantsWithProfiles };
        } catch (err) {
          console.error(`💥 경기 ${schedule.id} 처리 중 오류:`, err);
          return { scheduleId: schedule.id, participants: [] };
        }
      });

      const allParticipantsData = await Promise.all(allParticipantsPromises);
      const participantsBySchedule = allParticipantsData.reduce((acc, data) => {
        acc[data.scheduleId] = data.participants;
        return acc;
      }, {} as Record<string, any[]>);

      // 경기 일정과 참가 정보 결합
      const userMatchesInfo: UserMatchInfo[] = schedulesList.map(schedule => {
        const participation = (participationsData || []).find(p => p.match_schedule_id === schedule.id);
        const participants = participantsBySchedule[schedule.id] || [];
        
        console.log(`경기 ID ${schedule.id}: 참가자 수 = ${participants.length}`, participants);
        
        return {
          schedule,
          participation: participation || null,
          isRegistered: participation?.status === 'registered',
          actualParticipantCount: participants.length,
          participants
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
        const { error } = await supabase
          .from('match_participants')
          .insert({
            match_schedule_id: scheduleId,
            user_id: user.id,
            status: 'registered'
          });

        if (error) {
          console.error('❌ 참가 신청 오류:', error);
          alert('참가 신청 중 오류가 발생했습니다.');
          return;
        }
      }

      console.log('✅ 참가 신청 완료! 데이터 새로고침 중...');
      alert('참가 신청이 완료되었습니다!');
      
      // 데이터 새로고침
      await fetchSchedulesAndParticipation();
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

      console.log('✅ 참가 취소 완료! 데이터 새로고침 중...');
      alert('참가가 취소되었습니다.');
      
      // 데이터 새로고침
      await fetchSchedulesAndParticipation();
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
              {profile?.username || profile?.full_name || '회원'}님
            </span>
            <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
              레벨: {profile?.skill_level_name || 'E2급'}
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
                          {new Date(matchInfo.schedule.match_date).toLocaleDateString('ko-KR', {
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
                        
                        {matchInfo.actualParticipantCount > 0 && (
                          <Button
                            onClick={() => setShowParticipants(showParticipants === matchInfo.schedule.id ? null : matchInfo.schedule.id)}
                            variant="outline"
                            className="text-xs px-2 py-1 h-7"
                          >
                            {showParticipants === matchInfo.schedule.id ? '참가자 숨기기' : `참가자 확인 (${matchInfo.actualParticipantCount})`}
                          </Button>
                        )}
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
                                  {participant.username || participant.full_name || `사용자-${participant.user_id.slice(0, 8)}`}
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
                            {new Date(matchInfo.schedule.match_date).toLocaleDateString('ko-KR', {
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
