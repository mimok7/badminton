'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAdmin } from '@/components/AuthGuard';
import {
  decorateDescriptionForScheduleSource,
  getScheduleSourceLabel,
  inferScheduleSource,
  normalizeScheduleSource,
  type MatchScheduleSource,
} from '@/lib/match-schedule-source';
import { getSupabaseClient } from '@/lib/supabase';
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
  schedule_source: MatchScheduleSource;
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
      // 1) 참가 신청 전체 삭제 (외래키 제약 회피)
      const { error: delParticipantsErr } = await supabase
        .from('match_participants')
        .delete()
        .not('match_schedule_id', 'is', null);
      if (delParticipantsErr) {
        console.error('전체 참가자 삭제 오류:', delParticipantsErr);
        alert('전체 참가자 삭제 중 오류가 발생했습니다.');
        return;
      }

      // 2) 경기 전체 삭제 (id not null)
      const { error: delSchedulesErr } = await supabase
        .from('match_schedules')
        .delete()
        .not('id', 'is', null);
      if (delSchedulesErr) {
        console.error('전체 경기 삭제 오류:', delSchedulesErr);
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
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [schedules, setSchedules] = useState<ScheduleWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MatchSchedule | null>(null);
  const [editForm, setEditForm] = useState<{
    match_date: string;
    start_time: string;
    end_time: string;
    location: string;
    max_participants: number;
    schedule_source: MatchScheduleSource;
    description: string | null;
  } | null>(null);
  const router = useRouter();
  // 상세보기 토글 상태: 스케줄별로 참가자 이름 목록 표시 여부
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 새 경기 생성 폼 데이터
  const [newSchedule, setNewSchedule] = useState({
    match_date: '',
    start_time: '',
    end_time: '',
    location: '',
    max_participants: 20,
    schedule_source: 'recurring' as MatchScheduleSource,
    description: ''
  });

  // 경기 일정 목록 조회 (배치 조회: 일정 -> 참가자 -> 프로필)
  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/match-schedules', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.error('경기 일정 조회 오류:', payload);
        setSchedules([]);
        return;
      }

      const payload = (await response.json()) as { schedules?: ScheduleWithParticipants[] };
      const schedulesData = (payload.schedules || []).map((schedule) => ({
        ...schedule,
        schedule_source: inferScheduleSource(schedule),
      }));

      if (!schedulesData || schedulesData.length === 0) {
        setSchedules([]);
        return;
      }

      setSchedules(schedulesData);

    } catch (error) {
      console.error('경기 일정 조회 중 오류:', error);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    const handleWindowFocus = () => {
      fetchSchedules();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSchedules();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSchedules]);

  // 참가자 변화 실시간 반영: Realtime 구독으로 자동 새로고침
  useEffect(() => {
    const channel = supabase
      .channel('match_participants_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants' }, () => {
        fetchSchedules();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_schedules' }, () => {
        fetchSchedules();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSchedules, supabase]);

  // 새 경기 생성
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      // 세션 확인
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('세션 오류:', sessionError);
        alert('세션이 만료되었습니다. 다시 로그인해주세요.');
        window.location.href = '/login';
        return;
      }

      const scheduleSource = normalizeScheduleSource(newSchedule.schedule_source);
      const basePayload = {
        ...newSchedule,
        description: decorateDescriptionForScheduleSource(newSchedule.description, scheduleSource),
        created_by: user.id,
        updated_by: user.id
      };

      let { error } = await supabase
        .from('match_schedules')
        .insert({
          ...basePayload,
          schedule_source: scheduleSource,
        });

      if (error?.code === '42703') {
        const retry = await supabase
          .from('match_schedules')
          .insert(basePayload);
        error = retry.error;
      }

      if (error) {
        console.error('경기 생성 오류:', error);
        
        // 401 Unauthorized 처리
        if (error.message.includes('JWT') || error.message.includes('401')) {
          alert('세션이 만료되었습니다. 다시 로그인해주세요.');
          window.location.href = '/login';
          return;
        }
        
        alert('경기 생성 중 오류가 발생했습니다: ' + error.message);
        return;
      }

      // 폼 초기화
      setNewSchedule({
        match_date: '',
        start_time: '',
        end_time: '',
        location: '',
        max_participants: 20,
        schedule_source: 'recurring',
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

  // 경기 수정 열기
  const openEdit = (schedule: MatchSchedule) => {
    setEditingSchedule(schedule);
    setEditForm({
      match_date: schedule.match_date || '',
      start_time: schedule.start_time || '',
      end_time: schedule.end_time || '',
      location: schedule.location || '',
      max_participants: schedule.max_participants ?? 20,
      schedule_source: inferScheduleSource(schedule),
      description: schedule.description ?? ''
    });
  };

  // 경기 수정 저장
  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule || !editForm) return;

    const payload = {
      id: editingSchedule.id,
      match_date: editForm.match_date,
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      location: editForm.location,
      max_participants: editForm.max_participants,
      description: decorateDescriptionForScheduleSource(editForm.description, normalizeScheduleSource(editForm.schedule_source)),
      updated_by: user?.id
    } as any;

    try {
      const response = await fetch('/api/admin/match-schedules', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          schedule_source: normalizeScheduleSource(editForm.schedule_source),
        }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        console.error('경기 수정 API 오류:', responseBody);
        alert('경기 수정 중 오류가 발생했습니다.');
        return;
      }

      setEditingSchedule(null);
      setEditForm(null);
      await fetchSchedules();
      alert('경기 정보가 수정되었습니다.');
    } catch (err) {
      console.error('경기 수정 중 오류:', err);
      alert('경기 수정 중 오류가 발생했습니다.');
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
        // 체크 제약 위반(예: 23514) 시, DB가 'in_progress'를 요구하는 환경일 수 있어 호환값으로 재시도
        const code = (error as any)?.code || '';
        const msg = (error as any)?.message || '';
        const isCheckViolation = code === '23514' || String(msg).includes('match_schedules_status_check');

        if (isCheckViolation && newStatus === 'ongoing') {
          const fallback = 'in_progress';
          const { error: retryError } = await supabase
            .from('match_schedules')
            .update({ status: fallback as any, updated_by: user?.id })
            .eq('id', scheduleId);

          if (retryError) {
            console.error('상태 업데이트 재시도 실패:', retryError);
            alert(`상태 업데이트 중 오류가 발생했습니다: ${retryError.message || JSON.stringify(retryError)}`);
            return;
          }

          await fetchSchedules();
          alert('경기 상태가 "진행중"으로 변경되었습니다. (DB 호환 상태값 사용)');
          return;
        }

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
      const response = await fetch('/api/admin/match-schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'join',
          scheduleId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        if (response.status === 409) {
          alert('이미 참가 신청한 경기입니다.');
          await fetchSchedules();
          return;
        }

        console.error('참가 신청 오류:', payload);
        alert(payload?.error || '참가 신청 중 오류가 발생했습니다.');
        return;
      }

      const payload = await response.json();
      const insertedData = payload?.participant;
      const currentParticipants =
        typeof payload?.currentParticipants === 'number' ? payload.currentParticipants : null;

      setSchedules((prev) => prev.map((s) => {
        if (s.id !== scheduleId) return s;
        const alreadyJoined = s.participants.some(
          (participant) => participant.user_id === user.id && participant.status === 'registered'
        );
        if (alreadyJoined) return s;

        const newParticipant = {
          id: insertedData?.id || `temp-${Date.now()}`,
          user_id: user.id,
          registered_at: insertedData?.registered_at || new Date().toISOString(),
          status: 'registered',
          profiles: {
            username: (user as any)?.user_metadata?.username || (user as any)?.email || '',
            full_name: (user as any)?.user_metadata?.full_name || undefined,
          }
        } as MatchParticipant;

        return {
          ...s,
          participants: [...s.participants, newParticipant],
          current_participants:
            currentParticipants ?? Math.max((s.current_participants || 0) + 1, s.participants.length + 1),
        };
      }));

      fetchSchedules();
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
      const response = await fetch('/api/admin/match-schedules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scheduleId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.error('참가 취소 오류:', payload);
        alert(payload?.error || '참가 취소 중 오류가 발생했습니다.');
        return;
      }

      const payload = await response.json().catch(() => null);
      const currentParticipants =
        typeof payload?.currentParticipants === 'number' ? payload.currentParticipants : null;

      setSchedules((prev) => prev.map((s) => {
        if (s.id !== scheduleId) return s;
        const filtered = s.participants.filter(p => p.user_id !== user.id);
        return {
          ...s,
          participants: filtered,
          current_participants: currentParticipants ?? filtered.length
        };
      }));

      fetchSchedules();
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
  case 'ongoing':
  case 'in_progress': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  };

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
  case 'ongoing':
  case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScheduleSourceBadgeClass = (source: MatchScheduleSource) => {
    switch (source) {
      case 'tournament':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'generated':
        return 'bg-sky-100 text-sky-800 border border-sky-200';
      case 'recurring':
      default:
        return 'bg-violet-100 text-violet-800 border border-violet-200';
    }
  };

  return (
    <RequireAdmin>
      <div className="w-full mt-10 p-6">
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
                  경기 유형
                </label>
                <select
                  value={newSchedule.schedule_source}
                  onChange={(e) => setNewSchedule({
                    ...newSchedule,
                    schedule_source: normalizeScheduleSource(e.target.value),
                  })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="recurring">정기모임</option>
                  <option value="tournament">대회 경기</option>
                  <option value="generated">일반 경기</option>
                </select>
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
                <div className="grid grid-cols-1 gap-6">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
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
                            <span className={`px-3 py-1 rounded text-sm font-semibold ${getScheduleSourceBadgeClass(schedule.schedule_source)}`}>
                              {schedule.schedule_source === 'tournament' ? '🏆 대회 경기' : `${getScheduleSourceLabel(schedule.schedule_source)}`}
                            </span>
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
                              💬 {schedule.description.replace(/^\[(정기모임|대회 경기|일반 경기)\]\s*/u, '')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 참가자 상세보기 토글 + 목록 */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-gray-900">참가자</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpanded((prev) => ({ ...prev, [schedule.id]: !prev[schedule.id] }))}
                          >
                            {expanded[schedule.id] ? '닫기' : `상세보기 (${schedule.participants.length}명)`}
                          </Button>
                        </div>
                        {expanded[schedule.id] && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {schedule.participants.length === 0 ? (
                              <span className="text-gray-500 text-sm">아직 참가자가 없습니다.</span>
                            ) : (
                              schedule.participants.map((participant) => {
                                const baseName = (participant.profiles?.username && String(participant.profiles.username))
                                  || (participant.profiles?.full_name && String(participant.profiles.full_name))
                                  || '이름 없음';
                                const isMe = participant.user_id === user?.id; // auth.uid()
                                return (
                                  <span
                                    key={participant.id}
                                    title={baseName}
                                    className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm cursor-default"
                                  >
                                    {baseName}
                                    {isMe && <span className="text-green-700 ml-1">*</span>}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>

                      {/* 관리 버튼들 */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => openEdit(schedule)}
                          variant="outline"
                          className="text-sm"
                          size="sm"
                        >
                          수정
                        </Button>
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

      {/* 수정 모달 */}
      {editingSchedule && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">경기 수정</h3>
              <button
                onClick={() => { setEditingSchedule(null); setEditForm(null); }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="close"
              >×</button>
            </div>
            <form onSubmit={handleUpdateSchedule} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">경기 날짜 *</label>
                  <input
                    type="date"
                    required
                    value={editForm.match_date}
                    onChange={(e) => setEditForm({ ...editForm, match_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">장소 *</label>
                  <input
                    type="text"
                    required
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간 *</label>
                  <input
                    type="time"
                    required
                    value={editForm.start_time}
                    onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간 *</label>
                  <input
                    type="time"
                    required
                    value={editForm.end_time}
                    onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">최대 참가자 수</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editForm.max_participants}
                    onChange={(e) => setEditForm({ ...editForm, max_participants: Number(e.target.value) || 1 })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">경기 유형</label>
                <select
                  value={editForm.schedule_source}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    schedule_source: normalizeScheduleSource(e.target.value),
                  })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="recurring">정기모임</option>
                  <option value="tournament">대회 경기</option>
                  <option value="generated">일반 경기</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">경기 설명</label>
                <textarea
                  rows={3}
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEditingSchedule(null); setEditForm(null); }}
                >
                  취소
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">저장</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </RequireAdmin>
  );
}
