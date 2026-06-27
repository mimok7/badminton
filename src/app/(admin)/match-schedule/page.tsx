'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAdmin } from '@/components/AuthGuard';
import {
  decorateDescriptionForScheduleSource,
  inferScheduleSource,
  getScheduleSourceLabel,
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

interface ParticipantSearchProfile {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
}

interface ScheduleWithParticipants extends MatchSchedule {
  participants: MatchParticipant[];
}

interface ScheduleGroup {
  matchDate: string;
  schedules: ScheduleWithParticipants[];
}

export default function MatchSchedulePage() {
  // 전체 경기 일괄 삭제
  const deleteAllSchedules = async () => {
    if (!confirm('정말로 모든 경기를 삭제하시겠습니까? 관련된 모든 참가 신청도 함께 삭제됩니다.')) {
      return;
    }
    try {
      // 1) 모든 세션 및 예정 게임 삭제 (완료된 경기 제외)
      const { data: allSessions } = await supabase
        .from('match_sessions')
        .select('id');

      if (allSessions && allSessions.length > 0) {
        const sessionIds = allSessions.map(s => s.id);
        
        // 완료된 경기 조회
        const { data: completedMatches } = await supabase
          .from('generated_matches')
          .select('id, session_id')
          .eq('status', 'completed');
          
        const completedSessionIds = new Set(completedMatches?.map(m => m.session_id) || []);
        
        for (const sessionId of sessionIds) {
          if (completedSessionIds.has(sessionId)) {
            // 완료된 경기가 있는 세션: 완료되지 않은 경기만 개별 삭제
            await supabase
              .from('generated_matches')
              .delete()
              .eq('session_id', sessionId)
              .neq('status', 'completed');
          } else {
            // 완료된 경기가 없는 세션: 세션 전체 삭제
            await supabase
              .from('match_sessions')
              .delete()
              .eq('id', sessionId);
          }
        }
      }

      // 2) 참가 신청 전체 삭제 (외래키 제약 회피)
      const { error: delParticipantsErr } = await supabase
        .from('match_participants')
        .delete()
        .not('match_schedule_id', 'is', null);
      if (delParticipantsErr) {
        console.error('전체 참가자 삭제 오류:', delParticipantsErr);
        alert('전체 참가자 삭제 중 오류가 발생했습니다.');
        return;
      }

      // 3) 경기 전체 삭제 (id not null)
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
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenerateEnabled, setAutoGenerateEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
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
  const [participantActionLoading, setParticipantActionLoading] = useState<Record<string, boolean>>({});
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [participantModalScheduleId, setParticipantModalScheduleId] = useState<string | null>(null);
  const [participantModalProfiles, setParticipantModalProfiles] = useState<ParticipantSearchProfile[]>([]);
  const [participantModalLoading, setParticipantModalLoading] = useState(false);
  const [participantModalSubmitting, setParticipantModalSubmitting] = useState(false);
  const [selectedModalParticipantIds, setSelectedModalParticipantIds] = useState<string[]>([]);

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
      const schedulesData = (payload.schedules || [])
        .map((schedule) => ({
          ...schedule,
          schedule_source: inferScheduleSource(schedule),
        }))
        .filter((schedule) => schedule.schedule_source === 'recurring' || schedule.schedule_source === 'tournament');

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

  // 주말(토, 일)을 제외한 경기 5일 자동 생성
  const handleAutoGenerateSchedules = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!confirm('오늘 기준으로 주말(토, 일)을 제외한 5일 치 경기를 자동 생성하시겠습니까?\n(기존에 일정이 있는 날은 건너뜁니다.)')) {
      return;
    }

    try {
      setAutoGenerating(true);
      const response = await fetch('/api/admin/match-schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'auto_generate',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        alert(`경기 자동 생성 실패: ${payload?.error || '알 수 없는 오류'}`);
        return;
      }

      const result = await response.json();
      await fetchSchedules();
      
      alert(
        `경기 자동 생성 완료!\n` +
        `- 생성된 일정: ${result.created_count}개\n` +
        `- 건너뛴 일정: ${result.skipped_dates?.length || 0}개`
      );
    } catch (err) {
      console.error('경기 자동 생성 중 오류:', err);
      alert('경기 자동 생성 중 오류가 발생했습니다.');
    } finally {
      setAutoGenerating(false);
    }
  };

  // 자동 생성 설정 조회
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setSettingsLoading(true);
        const response = await fetch('/api/admin/match-settings');
        if (response.ok) {
          const data = await response.json();
          setAutoGenerateEnabled(data.autoGenerateEnabled);
        }
      } catch (err) {
        console.error('Failed to fetch match settings:', err);
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // 자동 생성 설정 변경 토글
  const handleToggleAutoGenerate = async () => {
    try {
      const nextValue = !autoGenerateEnabled;
      const response = await fetch('/api/admin/match-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autoGenerateEnabled: nextValue }),
      });

      if (response.ok) {
        setAutoGenerateEnabled(nextValue);
        alert(`자동 경기 생성이 ${nextValue ? '켜졌습니다 (ON)' : '꺼졌습니다 (OFF)'}.`);
      } else {
        alert('설정 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to update match settings:', err);
      alert('설정을 변경하는 중 오류가 발생했습니다.');
    }
  };

  // 새 경기 생성
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
          action: 'create_schedule',
          match_date: newSchedule.match_date,
          start_time: newSchedule.start_time,
          end_time: newSchedule.end_time,
          location: newSchedule.location,
          max_participants: newSchedule.max_participants,
          schedule_source: newSchedule.schedule_source,
          description: newSchedule.description,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        if (response.status === 401) {
          alert('세션이 만료되었습니다. 다시 로그인해주세요.');
          window.location.href = '/login';
          return;
        }

        if (response.status === 409) {
          alert('동일한 날짜/시간/장소의 경기가 이미 등록되어 있습니다.');
          return;
        }

        console.error('경기 생성 API 오류:', payload);
        alert(payload?.error || '경기 생성 중 오류가 발생했습니다.');
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
      description: decorateDescriptionForScheduleSource(editForm.description, editForm.schedule_source),
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
          schedule_source: editForm.schedule_source,
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
      const scheduleToDelete = schedules.find((s) => s.id === scheduleId);

      // 1) 해당 날짜의 세션/예정 게임 삭제 (완료된 경기 제외)
      if (scheduleToDelete?.match_date) {
        const { data: sessions } = await supabase
          .from('match_sessions')
          .select('id')
          .eq('session_date', scheduleToDelete.match_date);

        if (sessions && sessions.length > 0) {
          const sessionIds = sessions.map(s => s.id);
          
          // 해당 세션들의 완료된 경기 조회
          const { data: completedMatches } = await supabase
            .from('generated_matches')
            .select('id, session_id')
            .in('session_id', sessionIds)
            .eq('status', 'completed');
            
          const completedSessionIds = new Set(completedMatches?.map(m => m.session_id) || []);
          
          for (const sessionId of sessionIds) {
            if (completedSessionIds.has(sessionId)) {
              // 완료된 경기가 있는 세션: 완료되지 않은 경기만 개별 삭제
              await supabase
                .from('generated_matches')
                .delete()
                .eq('session_id', sessionId)
                .neq('status', 'completed');
            } else {
              // 완료된 경기가 없는 세션: 세션 전체 삭제 (ON DELETE CASCADE로 경기들도 자동 삭제)
              await supabase
                .from('match_sessions')
                .delete()
                .eq('id', sessionId);
            }
          }
        }
      }

      // 2) 경기 삭제
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

  const fetchAvailableProfilesForSchedule = async (scheduleId: string) => {
    try {
      setParticipantModalLoading(true);
      const response = await fetch('/api/admin/match-schedules?profiles_query=&profiles_all=1', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('참가자 조회 오류:', payload);
        alert(payload?.error || '회원 목록 조회 중 오류가 발생했습니다.');
        return;
      }

      const currentSchedule = schedules.find((schedule) => schedule.id === scheduleId);
      const registeredUserIds = new Set(
        (currentSchedule?.participants || [])
          .filter((participant) => participant.status === 'registered' || participant.status === 'attended')
          .map((participant) => participant.user_id)
      );

      const availableProfiles = ((payload?.profiles || []) as ParticipantSearchProfile[])
        .filter((profile) => profile.user_id && !registeredUserIds.has(profile.user_id))
        .sort((left, right) => {
          const leftName = (left.full_name || left.username || '').trim();
          const rightName = (right.full_name || right.username || '').trim();
          return leftName.localeCompare(rightName, 'ko', { sensitivity: 'base' });
        });

      setParticipantModalProfiles(availableProfiles);
      setSelectedModalParticipantIds([]);
    } catch (error) {
      console.error('참가자 목록 조회 중 오류:', error);
      alert('회원 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setParticipantModalLoading(false);
    }
  };

  const removeParticipantFromSchedule = async (scheduleId: string, targetUserId: string) => {
    if (!confirm('이 참가자를 경기에서 제거하시겠습니까?')) {
      return;
    }

    try {
      setParticipantActionLoading((prev) => ({ ...prev, [scheduleId]: true }));
      const response = await fetch('/api/admin/match-schedules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId,
          targetUserId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('관리자 참가자 제거 오류:', payload);
        alert(payload?.error || '참가자 제거 중 오류가 발생했습니다.');
        return;
      }

      const currentParticipants =
        typeof payload?.currentParticipants === 'number' ? payload.currentParticipants : null;

      setSchedules((prev) =>
        prev.map((schedule) => {
          if (schedule.id !== scheduleId) return schedule;
          const participants = schedule.participants.filter((participant) => participant.user_id !== targetUserId);
          return {
            ...schedule,
            participants,
            current_participants: currentParticipants ?? participants.length,
          };
        })
      );

      alert('참가자가 제거되었습니다.');
      fetchSchedules();
    } catch (error) {
      console.error('관리자 참가자 제거 중 오류:', error);
      alert('참가자 제거 중 오류가 발생했습니다.');
    } finally {
      setParticipantActionLoading((prev) => ({ ...prev, [scheduleId]: false }));
    }
  };

  const openParticipantModal = async (scheduleId: string) => {
    setParticipantModalScheduleId(scheduleId);
    setShowParticipantModal(true);
    await fetchAvailableProfilesForSchedule(scheduleId);
  };

  const closeParticipantModal = () => {
    setShowParticipantModal(false);
    setParticipantModalScheduleId(null);
    setParticipantModalProfiles([]);
    setSelectedModalParticipantIds([]);
  };

  const toggleModalParticipantSelection = (profileId: string) => {
    setSelectedModalParticipantIds((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
  };

  const toggleSelectAllModalParticipants = () => {
    if (selectedModalParticipantIds.length === participantModalProfiles.length) {
      setSelectedModalParticipantIds([]);
      return;
    }

    setSelectedModalParticipantIds(participantModalProfiles.map((profile) => profile.id));
  };

  const addSelectedParticipantsToSchedule = async () => {
    if (!participantModalScheduleId || selectedModalParticipantIds.length === 0) {
      return;
    }

    const selectedProfiles = participantModalProfiles.filter(
      (profile) => selectedModalParticipantIds.includes(profile.id) && profile.user_id
    );

    if (selectedProfiles.length === 0) {
      alert('추가할 참가자를 선택해주세요.');
      return;
    }

    const targetUserIds = selectedProfiles.map((p) => p.user_id).filter(Boolean) as string[];

    try {
      setParticipantModalSubmitting(true);
      setParticipantActionLoading((prev) => ({ ...prev, [participantModalScheduleId]: true }));

      const response = await fetch('/api/admin/match-schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_participants',
          scheduleId: participantModalScheduleId,
          targetUserIds,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.error('참가자 일괄 추가 오류:', payload);
        alert(payload?.error || '참가자 추가 중 오류가 발생했습니다.');
        return;
      }

      const payload = await response.json();
      const addedParticipants = payload?.participants || [];
      const currentParticipants = payload?.currentParticipants ?? null;

      // 로컬 상태 업데이트
      setSchedules((prevSchedules) =>
        prevSchedules.map((s) => {
          if (s.id !== participantModalScheduleId) return s;

          const updatedParticipants = [...s.participants];
          addedParticipants.forEach((newP: any) => {
            const alreadyExists = updatedParticipants.some((p) => p.user_id === newP.user_id);
            if (!alreadyExists) {
              updatedParticipants.push({
                id: newP.id,
                user_id: newP.user_id,
                registered_at: newP.registered_at,
                status: newP.status,
                profiles: newP.profiles,
              } as MatchParticipant);
            }
          });

          return {
            ...s,
            participants: updatedParticipants,
            current_participants: currentParticipants ?? updatedParticipants.length,
          };
        })
      );

      closeParticipantModal();
      await fetchSchedules();
      alert(`선택한 참가자 ${addedParticipants.length}명이 추가되었습니다.`);
    } catch (error) {
      console.error('참가자 일괄 추가 중 오류:', error);
      alert('참가자 추가 중 오류가 발생했습니다.');
    } finally {
      setParticipantModalSubmitting(false);
      if (participantModalScheduleId) {
        setParticipantActionLoading((prev) => ({ ...prev, [participantModalScheduleId]: false }));
      }
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

  const groupedSchedules = useMemo<ScheduleGroup[]>(() => {
    const groupMap = schedules.reduce<Record<string, ScheduleWithParticipants[]>>((acc, schedule) => {
      const dateKey = schedule.match_date;

      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }

      acc[dateKey].push(schedule);
      return acc;
    }, {});

    return Object.entries(groupMap)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([matchDate, dateSchedules]) => ({
        matchDate,
        schedules: [...dateSchedules].sort((left, right) => {
          const leftTime = `${left.start_time || ''}-${left.end_time || ''}`;
          const rightTime = `${right.start_time || ''}-${right.end_time || ''}`;
          return leftTime.localeCompare(rightTime);
        }),
      }));
  }, [schedules]);

  return (
    <RequireAdmin>
      <div className="w-full px-2 py-2 sm:p-6">
        {/* 헤더 */}
        <div className="mb-4 rounded-lg bg-white shadow sm:mb-6">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div>
              <h1 className="mb-1 text-base font-bold text-gray-900 sm:mb-2 sm:text-lg flex items-center gap-2">
                📅 경기 일정 관리
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${autoGenerateEnabled ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                  자동 생성: {autoGenerateEnabled ? '켜짐' : '꺼짐'}
                </span>
              </h1>
              <p className="hidden text-gray-600 sm:block">관리자 전용 - 경기 일정을 생성하고 관리할 수 있습니다</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 mr-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md">
                <span className="text-xs font-semibold text-slate-700">하루 단위 자동 생성</span>
                <button
                  type="button"
                  onClick={handleToggleAutoGenerate}
                  disabled={settingsLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${autoGenerateEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoGenerateEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold"
              >
                새 경기 생성
              </Button>
              <Button
                onClick={handleAutoGenerateSchedules}
                disabled={autoGenerating}
                className="bg-[#f3e8ff] text-[#6b21a8] hover:bg-[#e9d5ff] border border-[#d8b4fe] font-semibold disabled:opacity-50"
              >
                {autoGenerating ? '생성 중...' : '자동 경기 생성 (5일)'}
              </Button>
              <Button
                onClick={() => router.push('/recurring-matches')}
                className="bg-[#e8f5e9] text-[#1b5e20] hover:bg-[#c8e6c9] border border-[#a5d6a7] font-semibold"
              >
                정기모임 생성
              </Button>
              <Button
                onClick={deleteAllSchedules}
                className="bg-[#ffebee] text-[#c62828] hover:bg-[#ffcdd2] border border-[#ef9a9a] font-semibold"
              >
                전체 경기 삭제
              </Button>
            </div>
          </div>
        </div>

        {/* 새 경기 생성 폼 */}
        {showCreateForm && (
          <div className="mb-4 rounded-lg bg-white shadow sm:mb-6">
            <div className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="text-lg font-bold text-gray-900">새 경기 생성</h2>
            </div>
            <form onSubmit={handleCreateSchedule} className="space-y-3 p-4 sm:space-y-4 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    경기 구분 *
                  </label>
                  <select
                    value={newSchedule.schedule_source}
                    onChange={(e) => setNewSchedule({ ...newSchedule, schedule_source: e.target.value as MatchScheduleSource })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="recurring">정기모임</option>
                    <option value="tournament">대회 경기</option>
                  </select>
                </div>
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

              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
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

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                이 페이지에서는 경기 일정만 관리합니다. 게임은 표시하지 않습니다.
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

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Button type="submit" className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold">
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
            <div className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="text-lg font-bold text-gray-900">
                등록된 경기 ({schedules.length}개)
              </h2>
            </div>
            <div className="p-4 sm:p-6">
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>등록된 경기가 없습니다.</p>
                  <p className="text-sm mt-2">새 경기를 생성해보세요!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:gap-6">
                  {groupedSchedules.map((group) => (
                    <section key={group.matchDate} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:p-4 md:p-6">
                      <div className="mb-3 sm:mb-4">
                        <h3 className="text-base font-bold text-gray-900 sm:text-lg">
                          {new Date(group.matchDate).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long',
                          })}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">총 {group.schedules.length}경기</p>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        {group.schedules.map((schedule) => (
                          <div key={schedule.id} className="rounded-lg border bg-white p-3 transition-shadow hover:shadow-md sm:p-6">
                            <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex-1">
                                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                  <h4 className="text-base font-semibold text-gray-900 sm:text-lg">
                                    🕐 {schedule.start_time} - {schedule.end_time}
                                  </h4>
                                  <span className={`px-3 py-1 rounded text-sm font-semibold ${getScheduleSourceBadgeClass(schedule.schedule_source)}`}>
                                    {getScheduleSourceLabel(schedule.schedule_source)}
                                  </span>
                                  <span className={`px-3 py-1 rounded text-sm ${getStatusColor(schedule.status)}`}>
                                    {getStatusText(schedule.status)}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:gap-4 md:grid-cols-2">
                                  <div>
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
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="font-semibold text-gray-900">참가자</h4>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold"
                                    onClick={() => openParticipantModal(schedule.id)}
                                    disabled={participantActionLoading[schedule.id] || participantModalSubmitting}
                                  >
                                    참가자 추가
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setExpanded((prev) => ({ ...prev, [schedule.id]: !prev[schedule.id] }))}
                                  >
                                    {expanded[schedule.id] ? '닫기' : `상세보기 (${schedule.participants.length}명)`}
                                  </Button>
                                </div>
                              </div>
                              {expanded[schedule.id] && (
                                <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                              {schedule.participants.length === 0 ? (
                                <span className="text-gray-500 text-sm">아직 참가자가 없습니다.</span>
                              ) : (
                                schedule.participants.map((participant) => {
                                  const baseName = (participant.profiles?.username && String(participant.profiles.username))
                                    || (participant.profiles?.full_name && String(participant.profiles.full_name))
                                    || '이름 없음';
                                  const isMe = participant.user_id === user?.id;
                                  return (
                                    <div
                                      key={participant.id}
                                      title={baseName}
                                      className="flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                                    >
                                      <span>
                                        {baseName}
                                        {isMe && <span className="ml-1 text-green-700">*</span>}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeParticipantFromSchedule(schedule.id, participant.user_id)}
                                        className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-white"
                                        disabled={participantActionLoading[schedule.id]}
                                      >
                                        제거
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
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
                                    className="bg-[#fffbeb] text-[#b45309] hover:bg-[#fef3c7] border border-[#fde68a] font-semibold text-xs"
                                    size="sm"
                                    disabled={schedule.current_participants === 0}
                                  >
                                    진행 시작
                                  </Button>
                                  <Button
                                    onClick={() => updateScheduleStatus(schedule.id, 'cancelled')}
                                    className="bg-[#ffebee] text-[#c62828] hover:bg-[#ffcdd2] border border-[#ef9a9a] font-semibold text-xs"
                                    size="sm"
                                  >
                                    취소
                                  </Button>
                                </>
                              )}

                              {schedule.status === 'ongoing' && (
                                <Button
                                  onClick={() => updateScheduleStatus(schedule.id, 'completed')}
                                  className="bg-[#e8f5e9] text-[#1b5e20] hover:bg-[#c8e6c9] border border-[#a5d6a7] font-semibold text-xs"
                                  size="sm"
                                >
                                  완료 처리
                                </Button>
                              )}

                              {(schedule.status === 'cancelled' || schedule.status === 'completed') && (
                                <Button
                                  onClick={() => updateScheduleStatus(schedule.id, 'scheduled')}
                                  className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold text-xs"
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
                                      className="bg-[#ffebee] text-[#c62828] hover:bg-[#ffcdd2] border border-[#ef9a9a] font-semibold text-xs"
                                      size="sm"
                                    >
                                      참가 취소
                                    </Button>
                                  ) : (
                                    <Button
                                      onClick={() => joinMatch(schedule.id)}
                                      className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold text-xs"
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
                    </section>
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
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
              <h3 className="text-lg font-bold">경기 수정</h3>
              <button
                onClick={() => { setEditingSchedule(null); setEditForm(null); }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="close"
              >×</button>
            </div>
            <form onSubmit={handleUpdateSchedule} className="space-y-3 p-4 sm:space-y-4 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">경기 구분 *</label>
                  <select
                    value={editForm.schedule_source}
                    onChange={(e) => setEditForm({ ...editForm, schedule_source: e.target.value as MatchScheduleSource })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="recurring">정기모임</option>
                    <option value="tournament">대회 경기</option>
                  </select>
                </div>
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
              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
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
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                이 페이지에서는 경기 일정만 관리/수정합니다. 게임은 표시하지 않습니다.
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEditingSchedule(null); setEditForm(null); }}
                >
                  취소
                </Button>
                <Button type="submit" className="bg-[#e6f0ff] text-[#0044cc] hover:bg-[#cce0ff] border border-[#cce0ff] font-semibold">저장</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 참가자 추가 모달 */}
      {showParticipantModal && participantModalScheduleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">경기 참가자 추가</h2>
                <p className="hidden text-sm text-gray-500 sm:block">회원을 선택한 뒤 일괄 추가를 누르세요.</p>
              </div>
              <button
                type="button"
                onClick={closeParticipantModal}
                className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                닫기
              </button>
            </div>
            <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm">
              <span className="text-gray-600">추가 가능 회원 {participantModalProfiles.length}명</span>
              <button
                type="button"
                onClick={toggleSelectAllModalParticipants}
                disabled={participantModalProfiles.length === 0 || participantModalLoading}
                className="rounded-md border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {participantModalProfiles.length > 0 && selectedModalParticipantIds.length === participantModalProfiles.length
                  ? '전체 해제'
                  : '전체 선택'}
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
              {participantModalLoading ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  회원 목록을 불러오는 중입니다...
                </div>
              ) : participantModalProfiles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  추가 가능한 회원이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 sm:gap-3">
                  {participantModalProfiles.map((profile) => {
                    const checked = selectedModalParticipantIds.includes(profile.id);
                    const displayName = profile.full_name || profile.username || '이름 없음';
                    const secondaryName =
                      profile.full_name && profile.username && profile.full_name !== profile.username
                        ? profile.username
                        : null;

                    return (
                      <label
                        key={profile.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModalParticipantSelection(profile.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-900">{displayName}</div>
                          {secondaryName && (
                            <div className="mt-1 text-sm text-gray-500">{secondaryName}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={closeParticipantModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={addSelectedParticipantsToSchedule}
                disabled={selectedModalParticipantIds.length === 0 || participantModalSubmitting || participantModalLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {participantModalSubmitting ? '추가 중...' : '선택한 회원 추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireAdmin>
  );
}
