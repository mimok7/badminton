'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface MatchSchedule {
  id: string;
  match_date: string;
  start_time: string;
  end_time: string;
  location: string;
  max_participants: number;
  current_participants: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  description?: string;
}

interface Participant {
  id: string;
  user_id: string;
  status: 'registered' | 'cancelled' | 'attended' | 'absent';
  registered_at: string;
  profile?: {
    username?: string;
    full_name?: string;
    skill_level?: string;
  };
}

interface MatchRegistrationProps {
  schedule: MatchSchedule;
  currentUserId?: string;
  onRegistrationChange?: () => void;
}

export default function MatchRegistration({ 
  schedule, 
  currentUserId, 
  onRegistrationChange 
}: MatchRegistrationProps) {
  const supabase = createClientComponentClient();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [userRegistration, setUserRegistration] = useState<Participant | null>(null);

  // 참가자 목록 조회
  const fetchParticipants = async () => {
    try {
      console.log('👥 참가자 목록 조회:', schedule.id);

      const { data, error } = await supabase
        .from('match_participants')
        .select(`
          *,
          profile:profiles(username, full_name, skill_level)
        `)
        .eq('match_schedule_id', schedule.id)
        .eq('status', 'registered')
        .order('registered_at', { ascending: true });

      if (error) {
        console.error('❌ 참가자 조회 오류:', error);
        return;
      }

      console.log('✅ 참가자 조회 완료:', data?.length || 0, '명');
      setParticipants(data || []);

      // 현재 사용자의 등록 상태 확인
      if (currentUserId) {
        const userParticipant = data?.find(p => p.user_id === currentUserId);
        setUserRegistration(userParticipant || null);
      }
    } catch (error) {
      console.error('❌ 참가자 조회 중 오류:', error);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, [schedule.id, currentUserId]);

  // 경기 참가 신청
  const handleRegister = async () => {
    if (!currentUserId) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (schedule.current_participants >= schedule.max_participants) {
      alert('참가 인원이 마감되었습니다.');
      return;
    }

    if (schedule.status !== 'scheduled') {
      alert('참가 신청이 불가능한 경기입니다.');
      return;
    }

    try {
      setLoading(true);
      console.log('📝 경기 참가 신청:', schedule.id, currentUserId);

      // 먼저 이미 등록되어 있는지 확인
      const { data: existingData, error: checkError } = await supabase
        .from('match_participants')
        .select('id')
        .eq('match_schedule_id', schedule.id)
        .eq('user_id', currentUserId)
        .eq('status', 'registered')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ 등록 확인 오류:', checkError);
        alert('등록 확인 중 오류가 발생했습니다.');
        return;
      }

      if (existingData) {
        alert('이미 참가 신청하셨습니다.');
        return;
      }

      // 등록 진행
      const { error } = await supabase
        .from('match_participants')
        .insert([{
          match_schedule_id: schedule.id,
          user_id: currentUserId,
          status: 'registered'
        }]);

      if (error) {
        console.error('❌ 참가 신청 오류:', error);
        if (error.code === '23505') { // unique constraint violation
          alert('이미 참가 신청하셨습니다.');
        } else {
          alert('참가 신청 중 오류가 발생했습니다.');
        }
        return;
      }

      console.log('✅ 참가 신청 완료');
      alert('참가 신청이 완료되었습니다.');
      
      await fetchParticipants();
      onRegistrationChange?.();
    } catch (error) {
      console.error('❌ 참가 신청 중 오류:', error);
      alert('참가 신청 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 경기 참가 취소
  const handleCancel = async () => {
    if (!userRegistration) return;

    if (!confirm('참가 신청을 취소하시겠습니까?')) return;

    try {
      setLoading(true);
      console.log('❌ 경기 참가 취소:', userRegistration.id);

      const { error } = await supabase
        .from('match_participants')
        .delete()
        .eq('id', userRegistration.id);

      if (error) {
        console.error('❌ 참가 취소 오류:', error);
        alert('참가 취소 중 오류가 발생했습니다.');
        return;
      }

      console.log('✅ 참가 취소 완료');
      alert('참가 신청이 취소되었습니다.');
      
      await fetchParticipants();
      onRegistrationChange?.();
    } catch (error) {
      console.error('❌ 참가 취소 중 오류:', error);
      alert('참가 취소 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 날짜가 지났는지 확인
  const isPastDate = new Date(schedule.match_date) < new Date();

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">
            {new Date(schedule.match_date).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </h3>
          <p className="text-gray-600 mt-1">
            {schedule.start_time} - {schedule.end_time}
          </p>
          <p className="text-gray-600">
            📍 {schedule.location}
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-sm text-gray-500">참가자</div>
          <div className="text-lg font-semibold">
            <span className={participants.length >= schedule.max_participants ? 'text-red-600' : 'text-blue-600'}>
              {participants.length}
            </span>
            <span className="text-gray-400">/{schedule.max_participants}</span>
          </div>
          
          {/* 참가율 바 */}
          <div className="w-24 bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className={`h-2 rounded-full ${
                participants.length >= schedule.max_participants ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ 
                width: `${Math.min(100, (participants.length / schedule.max_participants) * 100)}%` 
              }}
            />
          </div>
        </div>
      </div>

      {schedule.description && (
        <div className="bg-gray-50 rounded p-3 mb-4">
          <p className="text-sm text-gray-700">{schedule.description}</p>
        </div>
      )}

      {/* 참가 신청/취소 버튼 */}
      {currentUserId && schedule.status === 'scheduled' && !isPastDate && (
        <div className="mb-4">
          {userRegistration ? (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-6 py-2 rounded font-medium w-full"
            >
              {loading ? '처리중...' : '참가 취소'}
            </button>
          ) : (
            <button
              onClick={handleRegister}
              disabled={loading || participants.length >= schedule.max_participants}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-6 py-2 rounded font-medium w-full"
            >
              {loading ? '처리중...' : 
               participants.length >= schedule.max_participants ? '참가 마감' : '참가 신청'}
            </button>
          )}
        </div>
      )}

      {/* 상태 메시지 */}
      {isPastDate && (
        <div className="bg-gray-100 text-gray-600 p-3 rounded mb-4 text-center">
          지난 경기입니다.
        </div>
      )}

      {schedule.status === 'cancelled' && (
        <div className="bg-red-100 text-red-600 p-3 rounded mb-4 text-center">
          취소된 경기입니다.
        </div>
      )}

      {schedule.status === 'completed' && (
        <div className="bg-green-100 text-green-600 p-3 rounded mb-4 text-center">
          완료된 경기입니다.
        </div>
      )}

      {/* 참가자 목록 */}
      {participants.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">참가자 목록</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {participants.map((participant, index) => (
              <div key={participant.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500 w-6">
                    {index + 1}.
                  </span>
                  <span className="font-medium">
                    {participant.profile?.username || participant.profile?.full_name || '이름 없음'}
                  </span>
                  {participant.profile?.skill_level && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {participant.profile.skill_level.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(participant.registered_at).toLocaleDateString('ko-KR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {participants.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          아직 참가자가 없습니다.
        </div>
      )}
    </div>
  );
}
