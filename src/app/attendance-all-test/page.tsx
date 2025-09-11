'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';

export default function AttendanceAllTestPage() {
  const supabase = createClientComponentClient();
  const [members, setMembers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'register' | 'present' | 'cancel' | 'attendance'>('register');
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const { data: membersData, error: membersError } = await supabase
          .from('profiles')
          .select('*')
          .order('username');
        if (membersError) {
          console.error('회원 조회 오류:', membersError);
        } else {
          setMembers(membersData || []);
        }
        
        // 오늘 이후 일정만 조회 (가까운 날짜부터)
        const today = new Date().toISOString().split('T')[0];
        const { data: schedulesData, error: schedulesError } = await supabase
          .from('match_schedules')
          .select('id, match_date, location')
          .gte('match_date', today)
          .order('match_date', { ascending: true });
        if (schedulesError) {
          console.error('경기 일정 조회 오류:', schedulesError);
        } else {
          setSchedules(schedulesData || []);
        }
      } catch (error) {
        console.error('데이터 로딩 오류:', error);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, []);

  // 경기 일정 선택 시 회원별 참가 상태 조회
  useEffect(() => {
    const fetchAttendanceStatus = async () => {
      if (!selectedSchedule) {
        setAttendanceStatus({});
        return;
      }
      const { data, error } = await supabase
        .from('match_participants')
        .select('user_id, status')
        .eq('match_schedule_id', selectedSchedule);
      if (error) {
        setAttendanceStatus({});
        return;
      }
      const statusMap: Record<string, string> = {};
      (data || []).forEach(row => {
        statusMap[row.user_id] = row.status;
      });
      setAttendanceStatus(statusMap);
    };
    fetchAttendanceStatus();
  }, [selectedSchedule, loading]);

  // 탭 변경 시 선택된 일정 초기화
  useEffect(() => {
    setSelectedSchedule('');
    setAttendanceStatus({});
  }, [activeTab]);

  // 등록 가능한 회원 필터링 (등록되지 않은 회원)
  const getAvailableMembers = () => {
    if (!selectedSchedule) return members;
    return members.filter(m => {
      const uid = m.user_id || m.id;
      const status = attendanceStatus[uid];
      return !status || status === 'cancelled';
    });
  };

  // 등록된 회원 필터링 (참가 또는 등록된 회원)
  const getRegisteredMembers = () => {
    if (!selectedSchedule) return [];
    return members.filter(m => {
      const uid = m.user_id || m.id;
      const status = attendanceStatus[uid];
      return status === 'registered' || status === 'attended';
    });
  };

  // 참가 신청(registered)만 필터링 → 출석 처리 대상
  const getAppliedMembers = () => {
    if (!selectedSchedule) return [];
    return members.filter(m => {
      const uid = m.user_id || m.id;
      const status = attendanceStatus[uid];
      return status === 'registered';
    });
  };

  // 회원별 참가 등록
  const handleAttendanceMember = async (memberId: string) => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    setLoading(true);
    try {
      await supabase.from('match_participants').upsert({
        match_schedule_id: selectedSchedule,
        user_id: memberId,
        status: 'registered',
        registered_at: new Date().toISOString()
      }, { onConflict: 'match_schedule_id,user_id' });
      
      // 참가자 수 갱신
      const { count } = await supabase
        .from('match_participants')
        .select('*', { count: 'exact', head: true })
        .eq('match_schedule_id', selectedSchedule)
        .in('status', ['registered', 'attended']);
      await supabase
        .from('match_schedules')
        .update({ current_participants: count || 0 })
        .eq('id', selectedSchedule);
      
      // 상태 즉시 업데이트 및 등록 가능한 회원 목록에서 제거
      setAttendanceStatus(prev => {
        const updated = { ...prev, [memberId]: 'registered' };
        return updated;
      });
      // 등록 가능한 회원 목록에서 즉시 제거 (useEffect로 자동 반영)
      alert('참가 등록 완료!');
    } catch (error) {
      console.error('회원 참가 등록 오류:', error);
      alert('회원 참가 등록 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // 회원별 출석 처리 (registered → attended)
  const handleMarkPresentMember = async (memberId: string) => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    setLoading(true);
    try {
      await supabase
        .from('match_participants')
        .update({ status: 'attended' })
        .eq('match_schedule_id', selectedSchedule)
        .eq('user_id', memberId)
        .eq('status', 'registered');

      // 참가자 수 갱신 (registered + attended)
      const { count } = await supabase
        .from('match_participants')
        .select('*', { count: 'exact', head: true })
        .eq('match_schedule_id', selectedSchedule)
        .in('status', ['registered', 'attended']);
      await supabase
        .from('match_schedules')
        .update({ current_participants: count || 0 })
        .eq('id', selectedSchedule);

      // 상태 즉시 업데이트
      setAttendanceStatus(prev => ({ ...prev, [memberId]: 'attended' }));
      alert('출석 처리 완료!');
    } catch (error) {
      console.error('출석 처리 오류:', error);
      alert('출석 처리 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // 회원별 참가 취소
  const handleCancelAttendanceMember = async (memberId: string) => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    setLoading(true);
    try {
      await supabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .eq('match_schedule_id', selectedSchedule)
        .eq('user_id', memberId);
      
      // 참가자 수 갱신
      const { count } = await supabase
        .from('match_participants')
        .select('*', { count: 'exact', head: true })
        .eq('match_schedule_id', selectedSchedule)
        .in('status', ['registered', 'attended']);
      await supabase
        .from('match_schedules')
        .update({ current_participants: count || 0 })
        .eq('id', selectedSchedule);
      
      // 상태 즉시 업데이트
      setAttendanceStatus(prev => ({
        ...prev,
        [memberId]: 'cancelled'
      }));
      
      alert('참가 취소 완료!');
    } catch (error) {
      console.error('회원 참가 취소 오류:', error);
      alert('회원 참가 취소 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceAll = async () => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    
    const selectedScheduleInfo = schedules.find(s => s.id === selectedSchedule);
    const targetMembers = activeTab === 'register'
      ? getAvailableMembers()
      : activeTab === 'present'
        ? getAppliedMembers()
        : getRegisteredMembers();
    
    if (activeTab === 'register') {
      if (!confirm(`정말로 "${selectedScheduleInfo?.match_date} ${selectedScheduleInfo?.location}" 경기에 등록 가능한 회원(${targetMembers.length}명)을 참가자로 등록하시겠습니까?`)) {
        return;
      }
    } else if (activeTab === 'cancel') {
      if (!confirm(`정말로 "${selectedScheduleInfo?.match_date} ${selectedScheduleInfo?.location}" 경기에 등록된 회원(${targetMembers.length}명)의 참가을 취소하시겠습니까?`)) {
        return;
      }
    } else {
      if (!confirm(`정말로 "${selectedScheduleInfo?.match_date} ${selectedScheduleInfo?.location}" 경기에 참가 신청 회원(${targetMembers.length}명)을 출석 처리하시겠습니까?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const member of targetMembers) {
        try {
      if (activeTab === 'register') {
            await supabase.from('match_participants').upsert({
              match_schedule_id: selectedSchedule,
              user_id: member.user_id || member.id,
        status: 'registered',
              registered_at: new Date().toISOString()
            }, { onConflict: 'match_schedule_id,user_id' });
          } else if (activeTab === 'cancel') {
            await supabase
              .from('match_participants')
              .update({ status: 'cancelled' })
              .eq('match_schedule_id', selectedSchedule)
              .eq('user_id', member.user_id || member.id);
          } else {
            await supabase
              .from('match_participants')
              .update({ status: 'attended' })
              .eq('match_schedule_id', selectedSchedule)
              .eq('user_id', member.user_id || member.id)
              .eq('status', 'registered');
          }
          successCount++;
        } catch (error) {
          console.error(`회원 ${member.username || member.full_name} 처리 오류:`, error);
          errorCount++;
        }
      }

      // 경기 일정의 current_participants 수 업데이트
      try {
        const { count } = await supabase
          .from('match_participants')
          .select('*', { count: 'exact', head: true })
          .eq('match_schedule_id', selectedSchedule)
          .in('status', ['registered', 'attended']);
        await supabase
          .from('match_schedules')
          .update({ current_participants: count || 0 })
          .eq('id', selectedSchedule);
      } catch (updateError) {
        console.error('참가자 수 업데이트 오류:', updateError);
      }
      
  const action = activeTab === 'register' ? '참가 등록' : (activeTab === 'cancel' ? '참가 취소' : '출석 처리');
      alert(`${action} 처리 완료!\n성공: ${successCount}명\n실패: ${errorCount}명`);
    } catch (error) {
      console.error('처리 중 오류:', error);
      alert('처리 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAttendanceAll = async () => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    const selectedScheduleInfo = schedules.find(s => s.id === selectedSchedule);
    if (!confirm(`정말로 "${selectedScheduleInfo?.match_date} ${selectedScheduleInfo?.location}" 경기에 모든 회원의 참가을 취소하시겠습니까?`)) {
      return;
    }
    setLoading(true);
    try {
      // match_participants에서 해당 경기 일정의 모든 회원 status를 'cancelled'로 변경
      const { error: updateError } = await supabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .eq('match_schedule_id', selectedSchedule)
        .in('user_id', members.map(m => m.user_id || m.id));

      if (updateError) {
        console.error('참가 취소 처리 오류:', updateError);
        alert('참가 취소 처리 중 오류 발생');
      } else {
        // 참가자 수 0으로 업데이트
        await supabase
          .from('match_schedules')
          .update({ current_participants: 0 })
          .eq('id', selectedSchedule);
        alert('참가 취소 처리 완료!');
      }
    } catch (error) {
      console.error('참가 취소 처리 중 오류:', error);
      alert('참가 취소 처리 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-4">회원 참가 관리</h1>
      
      {/* 탭 메뉴 */}
      <div className="mb-6">
        <div className="flex border-b">
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'register' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('register')}
          >
            참가 등록
          </button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'present' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('present')}
          >
            참가 → 출석
          </button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'cancel' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('cancel')}
          >
            참가 취소
          </button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'attendance' ? 'border-b-2 border-purple-500 text-purple-600' : 'text-gray-600'}`}
            onClick={() => {
              setActiveTab('attendance');
              router.push('/test-attendance-all');
            }}
          >
            출석관리
          </button>
        </div>
      </div>
      
      {dataLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600">데이터 로딩 중...</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label className="block mb-2 font-semibold">
              경기 일정 선택 ({schedules.length}개 일정 - 오늘 이후)
            </label>
            <select
              value={selectedSchedule}
              onChange={e => setSelectedSchedule(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">-- 경기 일정 선택 --</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>
                  {s.match_date} / {s.location}
                </option>
              ))}
            </select>
            {schedules.length === 0 && (
              <p className="text-red-500 text-sm mt-2">등록된 향후 경기 일정이 없습니다.</p>
            )}
          </div>
          
          <div className="mb-6">
            {activeTab === 'register' && (
              <>
                <label className="block mb-2 font-semibold">
                  등록 가능한 회원 목록 ({getAvailableMembers().length}명)
                </label>
                <div className="max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 150px)', justifyContent: 'start' }}>
                    {getAvailableMembers().map(m => {
                      const uid = m.user_id || m.id;
                      const status = attendanceStatus[uid];
                      let statusText = '';
                      if (status === 'cancelled') statusText = '취소됨';
                      else statusText = '미등록';
                      return (
                        <div key={uid} className="flex flex-col items-start gap-2 p-2 border rounded bg-gray-50 w-[150px]">
                          <div className="w-full flex items-center justify-between">
                            <div className="text-sm font-medium text-blue-600 truncate">{m.username || m.full_name || uid}</div>
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600">{statusText}</span>
                          </div>
                          <div className="w-full">
                            <Button
                              size="sm"
                              className="bg-green-300 hover:bg-green-400 text-green-800 w-full"
                              disabled={loading || !selectedSchedule}
                              onClick={() => handleAttendanceMember(uid)}
                            >
                              참가등록
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {getAvailableMembers().length === 0 && selectedSchedule && (
                  <p className="text-gray-500 text-sm mt-2">등록 가능한 회원이 없습니다.</p>
                )}
              </>
            )}
            {activeTab === 'present' && (
              <>
                <label className="block mb-2 font-semibold">
                  참가 신청 회원 목록 ({getAppliedMembers().length}명)
                </label>
                <div className="max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 150px)', justifyContent: 'start' }}>
                    {getAppliedMembers().map(m => {
                      const uid = m.user_id || m.id;
                      return (
                        <div key={uid} className="flex flex-col items-start gap-2 p-2 border rounded bg-gray-50 w-[150px]">
                          <div className="w-full flex items-center justify-between">
                            <div className="text-sm font-medium text-blue-600 truncate">{m.username || m.full_name || uid}</div>
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">신청</span>
                          </div>
                          <div className="w-full">
                            <Button
                              size="sm"
                              className="bg-green-300 hover:bg-green-400 text-green-800 w-full"
                              disabled={loading || !selectedSchedule}
                              onClick={() => handleMarkPresentMember(uid)}
                            >
                              출석 처리
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {getAppliedMembers().length === 0 && selectedSchedule && (
                  <p className="text-gray-500 text-sm mt-2">출석 처리할 참가 신청 회원이 없습니다.</p>
                )}
              </>
            )}
            
            {activeTab === 'cancel' && (
              <>
                <label className="block mb-2 font-semibold">
                  등록된 회원 목록 ({getRegisteredMembers().length}명)
                </label>
                <div className="max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 150px)', justifyContent: 'start' }}>
                    {getRegisteredMembers().map(m => {
                      const uid = m.user_id || m.id;
                      const status = attendanceStatus[uid];
                      let statusText = '';
                      if (status === 'registered') statusText = '등록됨';
                      else if (status === 'attended') statusText = '참가';
                      return (
                        <div key={uid} className="flex flex-col items-start gap-2 p-2 border rounded bg-gray-50 w-[150px]">
                          <div className="w-full flex items-center justify-between">
                            <div className="text-sm font-medium text-blue-600 truncate">{m.username || m.full_name || uid}</div>
                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600">{statusText}</span>
                          </div>
                          <div className="w-full">
                            <Button
                              size="sm"
                              className="bg-red-300 hover:bg-red-400 text-red-800 w-full"
                              disabled={loading || !selectedSchedule}
                              onClick={() => handleCancelAttendanceMember(uid)}
                            >
                              참가취소
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {getRegisteredMembers().length === 0 && selectedSchedule && (
                  <p className="text-gray-500 text-sm mt-2">등록된 회원이 없습니다.</p>
                )}
              </>
            )}
            
            {!selectedSchedule && (
              <p className="text-gray-500 text-sm">경기 일정을 먼저 선택해 주세요.</p>
            )}
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">⚠️ 주의사항</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
        {activeTab === 'register' ? (
                <>
                  <li>• 선택한 경기에 등록 가능한 회원들이 참가자로 등록됩니다.</li>
                  <li>• 이미 등록된 회원은 중복 등록되지 않습니다.</li>
          <li>• 참가 상태는 'registered'로 저장됩니다.</li>
                </>
              ) : activeTab === 'cancel' ? (
                <>
                  <li>• 선택한 경기에 등록된 회원들의 참가이 취소됩니다.</li>
                  <li>• 취소된 회원은 다시 등록할 수 있습니다.</li>
                  <li>• 실제 참가 데이터에 영향을 주므로 신중하게 사용하세요.</li>
                </>
              ) : (
                <>
                  <li>• 선택한 경기에 참가 신청(registered)한 회원들을 출석(attended)으로 변경합니다.</li>
                  <li>• 이미 출석 처리된 회원은 대상에서 제외됩니다.</li>
                  <li>• 처리 후 참가자 수(current_participants)가 자동 반영됩니다.</li>
                </>
              )}
            </ul>
          </div>
          
          {activeTab === 'register' && (
            <Button 
              onClick={handleAttendanceAll} 
              disabled={loading || !selectedSchedule || getAvailableMembers().length === 0} 
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              {loading ? '처리 중...' : `등록 가능한 회원 ${getAvailableMembers().length}명을 모두 참가 등록`}
            </Button>
          )}
          {activeTab === 'present' && (
            <Button
              onClick={handleAttendanceAll}
              disabled={loading || !selectedSchedule || getAppliedMembers().length === 0}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              {loading ? '처리 중...' : `참가 신청 회원 ${getAppliedMembers().length}명을 모두 출석 처리`}
            </Button>
          )}
          
          {activeTab === 'cancel' && (
            <Button
              onClick={handleAttendanceAll}
              disabled={loading || !selectedSchedule || getRegisteredMembers().length === 0}
              className="bg-red-600 hover:bg-red-700 w-full"
            >
              {loading ? '처리 중...' : `등록된 회원 ${getRegisteredMembers().length}명을 모두 참가 취소`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
