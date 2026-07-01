'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAdmin } from '@/components/AuthGuard';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';

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
  created_at: string;
  created_by: string;
}

interface MatchParticipant {
  id: string;
  user_id: string;
  registered_at: string;
  status: 'registered' | 'cancelled' | 'attended' | 'absent';
  profiles?: {
    username: string;
    full_name: string;
  };
}

interface ScheduleWithParticipants extends MatchSchedule {
  participants: MatchParticipant[];
}

export default function MatchSchedulePage() {
  // 전체 경기 일괄 삭제
  const deleteAllSchedules = async () => {
    if (!confirm('정말로 모든 경기를 삭제하시겠습니까? 관련된 모든 참가 신청도 함께 삭제됩니다.')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('match_schedules')
        .delete()
        .neq('id', ''); // 모든 id가 ''이 아닌 row 삭제
      if (error) {
        console.error('전체 경기 삭제 오류:', error);
        alert('전체 경기 삭제 중 오류가 발생했습니다.');
        return;
      }
      await fetchSchedules();
      alert('모든 경기가 성공적으로 삭제되었습니다.');
    } catch (error) {
      console.error('전체 경기 삭제 중 오류:', error);
      alert('전체 경기 삭제 중 오류가 발생했습니다.');
    }
  };
  const { user } = useUser();
  const supabase = createClientComponentClient();
  const [schedules, setSchedules] = useState<ScheduleWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MatchSchedule | null>(null);
  const router = useRouter();

  // 새 경기 생성 폼 데이터
  const [newSchedule, setNewSchedule] = useState({
    match_date: '',
    start_time: '',
    end_time: '',
    location: '',
    max_participants: 20,
    description: ''
  });

  // 경기 일정 목록 조회
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const today = new Date();
      today.setHours(0,0,0,0);

      // 오늘 이후 일정만 조회하도록 필터링을 서버에서 처리
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('match_schedules')
        .select('*')
        .gte('match_date', today.toISOString().split('T')[0])
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (schedulesError) {
        console.error('경기 일정 조회 오류:', schedulesError);
        return;
      }

      if (!schedulesData || schedulesData.length === 0) {
        setSchedules([]);
        return;
      }

      // 각 경기의 참가자 정보를 병렬로 조회 (registered와 attended 상태 모두 포함)
      const participantPromises = schedulesData.map(schedule => 
        supabase
          .from('match_participants')
          .select(`
            *,
            profiles (
              username,
              full_name
            )
          `)
          .eq('match_schedule_id', schedule.id)
          .in('status', ['registered', 'attended'])
      );

      const participantResults = await Promise.allSettled(participantPromises);

      const schedulesWithParticipants = schedulesData.map((schedule, index) => {
        const participants = participantResults[index].status === 'fulfilled' 
          ? (participantResults[index].value.data || [])
          : [];
        
        return {
          ...schedule,
          participants,
          current_participants: participants.length // 실제 참가자 수로 업데이트
        };
      }) as ScheduleWithParticipants[];

      setSchedules(schedulesWithParticipants);

    } catch (error) {
      console.error('경기 일정 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  // 새 경기 생성
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    try {
      const { error } = await supabase
        .from('match_schedules')
        .insert({
          ...newSchedule,
          created_by: user.id,
          updated_by: user.id
        });

      if (error) {
        console.error('경기 생성 오류:', error);
        alert('경기 생성 중 오류가 발생했습니다.');
        return;
      }

      // 폼 초기화
      setNewSchedule({
        match_date: '',
        start_time: '',
        end_time: '',
        location: '',
        max_participants: 20,
        description: ''
      });
      setShowCreateForm(false);

      // 목록 새로고침
      await fetchSchedules();
      alert('새 경기가 성공적으로 생성되었습니다!');

    } catch (error) {
      console.error('경기 생성 중 오류:', error);
      alert('경기 생성 중 오류가 발생했습니다.');
    }
  };

  // 경기 상태 변경
  const updateScheduleStatus = async (scheduleId: string, newStatus: MatchSchedule['status']) => {
    try {
      const { error } = await supabase
        .from('match_schedules')
        .update({ 
          status: newStatus,
          updated_by: user?.id
        })
        .eq('id', scheduleId);

      if (error) {
        console.error('상태 업데이트 오류:', error);
        alert(`상태 업데이트 중 오류가 발생했습니다: ${error.message || JSON.stringify(error)}`);
        return;
      }

      await fetchSchedules();
      alert(`경기 상태가 "${getStatusText(newStatus)}"로 변경되었습니다.`);

    } catch (error) {
      console.error('상태 업데이트 중 오류:', error);
      alert('상태 업데이트 중 오류가 발생했습니다.');
    }
  };

  // 경기 참가 신청
  const joinMatch = async (scheduleId: string) => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      // 이미 참가 신청했는지 확인
      const { data: existingParticipant } = await supabase
        .from('match_participants')
        .select('id')
        .eq('match_schedule_id', scheduleId)
        .eq('user_id', user.id)
        .eq('status', 'registered')
        .single();

      if (existingParticipant) {
        alert('이미 참가 신청한 경기입니다.');
        return;
      }

      // 참가 신청 추가
      const { error } = await supabase
        .from('match_participants')
        .insert({
          match_schedule_id: scheduleId,
          user_id: user.id,
          status: 'registered'
        });

      if (error) {
        console.error('참가 신청 오류:', error);
        alert('참가 신청 중 오류가 발생했습니다.');
        return;
      }

      // 목록 새로고침
      await fetchSchedules();
      alert('참가 신청이 완료되었습니다!');

    } catch (error) {
      console.error('참가 신청 중 오류:', error);
      alert('참가 신청 중 오류가 발생했습니다.');
    }
  };

  // 참가 신청 취소
  const cancelJoinMatch = async (scheduleId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('match_participants')
        .delete()
        .eq('match_schedule_id', scheduleId)
        .eq('user_id', user.id);

      if (error) {
        console.error('참가 취소 오류:', error);
        alert('참가 취소 중 오류가 발생했습니다.');
        return;
      }

      // 목록 새로고침
      await fetchSchedules();
      alert('참가 신청이 취소되었습니다.');

    } catch (error) {
      console.error('참가 취소 중 오류:', error);
      alert('참가 취소 중 오류가 발생했습니다.');
    }
  };

  // 경기 삭제
  const deleteSchedule = async (scheduleId: string) => {
    if (!confirm('정말로 이 경기를 삭제하시겠습니까? 관련된 모든 참가 신청도 함께 삭제됩니다.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('match_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) {
        console.error('경기 삭제 오류:', error);
        alert('경기 삭제 중 오류가 발생했습니다.');
        return;
      }

      await fetchSchedules();
      alert('경기가 성공적으로 삭제되었습니다.');

    } catch (error) {
      console.error('경기 삭제 중 오류:', error);
      alert('경기 삭제 중 오류가 발생했습니다.');
    }
  };

  // 상태 텍스트 변환
  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return '예정';
      case 'ongoing': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  };

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'ongoing': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <RequireAdmin>
      <div className="max-w-7lg mx-auto mt-10 p-6">
        {/* 헤더 */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-lg font-bold text-gray-900 mb-2">
                경기 일정 관리 📅
              </h1>
              <p className="text-gray-600">관리자 전용 - 경기 일정을 생성하고 관리할 수 있습니다</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                새 경기 생성
              </Button>
              <Button
                onClick={() => router.push('/recurring-matches')}
                className="bg-green-600 hover:bg-green-700"
              >
                정기모임 생성
              </Button>
              <Button
                onClick={deleteAllSchedules}
                className="bg-red-600 hover:bg-red-700"
              >
                전체 경기 삭제
              </Button>
            </div>
          </div>
        </div>

        {/* 새 경기 생성 폼 */}
        {showCreateForm && (
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">새 경기 생성</h2>
            </div>
            <form onSubmit={handleCreateSchedule} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    경기 날짜 *
                  </label>
                  <input
                    type="date"
                    required
                    value={newSchedule.match_date}
                    onChange={(e) => setNewSchedule({ ...newSchedule, match_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    장소 *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="경기 장소"
                    value={newSchedule.location}
                    onChange={(e) => setNewSchedule({ ...newSchedule, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    시작 시간 *
                  </label>
                  <input
                    type="time"
                    required
                    value={newSchedule.start_time}
                    onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    종료 시간 *
                  </label>
                  <input
                    type="time"
                    required
                    value={newSchedule.end_time}
                    onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    최대 참가자 수
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newSchedule.max_participants}
                    onChange={(e) => setNewSchedule({ ...newSchedule, max_participants: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  경기 설명
                </label>
                <textarea
                  rows={3}
                  placeholder="경기에 대한 추가 정보나 안내사항"
                  value={newSchedule.description}
                  onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  경기 생성
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  취소
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* 경기 목록 */}
        {loading ? (
          <div className="bg-white shadow rounded-lg">
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">로딩 중...</span>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                등록된 경기 ({schedules.length}개)
              </h2>
            </div>
            <div className="p-6">
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>등록된 경기가 없습니다.</p>
                  <p className="text-sm mt-2">새 경기를 생성해보세요!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {new Date(schedule.match_date).toLocaleDateString('ko-KR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                weekday: 'long'
                              })}
                            </h3>
                            <span className={`px-3 py-1 rounded text-sm ${getStatusColor(schedule.status)}`}>
                              {getStatusText(schedule.status)}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
                            <div>
                              <p>🕐 {schedule.start_time} - {schedule.end_time}</p>
                              <p>📍 {schedule.location}</p>
                            </div>
                            <div>
                              <p>👥 참가자: {schedule.current_participants} / {schedule.max_participants}명</p>
                              <p>📅 생성일: {new Date(schedule.created_at).toLocaleDateString('ko-KR')}</p>
                            </div>
                          </div>
                          
                          {schedule.description && (
                            <p className="text-gray-600 mt-2 text-sm">
                              💬 {schedule.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 참가자 목록 */}
                      {schedule.participants.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-900 mb-2">참가자 목록:</h4>
                          <div className="flex flex-wrap gap-2">
                            {schedule.participants.map((participant) => (
                              <span
                                key={participant.id}
                                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                              >
                                {participant.profiles?.username || participant.profiles?.full_name || '알 수 없음'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 관리 버튼들 */}
                      <div className="flex flex-wrap gap-2">
                        {schedule.status === 'scheduled' && (
                          <>
                            <Button
                              onClick={() => updateScheduleStatus(schedule.id, 'ongoing')}
                              className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm"
                              size="sm"
                              disabled={schedule.current_participants === 0}
                            >
                              진행 시작
                            </Button>
                            <Button
                              onClick={() => updateScheduleStatus(schedule.id, 'cancelled')}
                              className="bg-red-600 hover:bg-red-700 text-white text-sm"
                              size="sm"
                            >
                              취소
                            </Button>
                          </>
                        )}
                        
                        {schedule.status === 'ongoing' && (
                          <Button
                            onClick={() => updateScheduleStatus(schedule.id, 'completed')}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm"
                            size="sm"
                          >
                            완료 처리
                          </Button>
                        )}
                        
                        {(schedule.status === 'cancelled' || schedule.status === 'completed') && (
                          <Button
                            onClick={() => updateScheduleStatus(schedule.id, 'scheduled')}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                            size="sm"
                          >
                            다시 예정으로
                          </Button>
                        )}

                        <Button
                          onClick={() => deleteSchedule(schedule.id)}
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 text-sm"
                          size="sm"
                        >
                          삭제
                        </Button>

                        {/* 참가자 신청/취소 버튼 - scheduled 또는 ongoing 상태에서 모두 노출 */}
                        {(schedule.status === 'scheduled' || schedule.status === 'ongoing') && user && (
                          (() => {
                            // 현재 사용자가 참가 신청했는지 확인
                            const isParticipant = schedule.participants.some(
                              participant => participant.user_id === user.id && 
                              participant.status === 'registered'
                            );
                            
                            return isParticipant ? (
                              <Button
                                onClick={() => cancelJoinMatch(schedule.id)}
                                className="bg-red-500 hover:bg-red-600 text-white text-sm"
                                size="sm"
                              >
                                참가 취소
                              </Button>
                            ) : (
                              <Button
                                onClick={() => joinMatch(schedule.id)}
                                className="bg-blue-500 hover:bg-blue-600 text-white text-sm"
                                size="sm"
                              >
                                참가 신청
                              </Button>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
