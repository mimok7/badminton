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
  const [attendanceData, setAttendanceData] = useState<Record<string, string>>({});
  const [attendanceCheckMembers, setAttendanceCheckMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'register' | 'attendance' | 'cancel'>('register');
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
        
        // 오늘 날짜의 경기 일정만 조회
        const today = new Date().toISOString().split('T')[0];
        const { data: schedulesData, error: schedulesError } = await supabase
          .from('match_schedules')
          .select('id, match_date, location')
          .eq('match_date', today)  // 오늘 날짜만
          .order('start_time', { ascending: true });
        if (schedulesError) {
          console.error('경기 일정 조회 오류:', schedulesError);
        } else {
          setSchedules(schedulesData || []);
          // 오늘 경기 일정이 있으면 자동 선택
          if (schedulesData && schedulesData.length > 0) {
            setSelectedSchedule(schedulesData[0].id);
            console.log('오늘 경기 일정 자동 선택:', schedulesData[0].id);
          }
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
  const fetchAttendanceStatus = async () => {
    if (!selectedSchedule) {
      setAttendanceStatus({});
      return;
    }
    
    console.log('참가 상태 조회 시작 - schedule_id:', selectedSchedule);
    
    const { data, error } = await supabase
      .from('match_participants')
      .select('user_id, status')
      .eq('match_schedule_id', selectedSchedule);
    
    if (error) {
      console.error('참가 상태 조회 오류:', error);
      setAttendanceStatus({});
      return;
    }
    
    console.log('조회된 참가 데이터:', data);
    
    // match_participants.user_id가 이미 profiles.id이므로 직접 매핑
    const statusMap: Record<string, string> = {};
    (data || []).forEach(row => {
      statusMap[row.user_id] = row.status;
      console.log(`참가자: user_id=${row.user_id}, status=${row.status}`);
    });
    
    console.log('최종 참가 상태 맵:', statusMap);
    setAttendanceStatus(statusMap);

    // 출석 체크 대상 회원 목록 업데이트 (참가 신청했지만 출석 체크하지 않은 회원)
    const appliedMembers = members.filter(m => {
      const uid = m.id;
      const status = statusMap[uid];
      return status === 'registered';
    });
    
    // 출석 데이터도 함께 조회해서 출석 체크 대상 필터링
    const today = new Date().toISOString().split('T')[0];
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendances')
      .select('user_id')
      .eq('attended_at', today);
    
    if (attendanceError) {
      console.error('출석 데이터 조회 오류:', attendanceError);
    }
    
    // 출석 기록이 있는 회원들의 ID 목록
    const checkedUserIds = new Set((attendanceData || []).map(row => row.user_id));
    
    // 출석 체크하지 않은 회원들만 필터링
    const uncheckedMembers = appliedMembers.filter(m => !checkedUserIds.has(m.id));
    
    console.log('출석 체크 대상 회원 계산:', {
      총_참가신청: appliedMembers.length,
      출석_체크됨: checkedUserIds.size,
      출석_미체크: uncheckedMembers.length
    });
    setAttendanceCheckMembers(uncheckedMembers);

    // 출석 데이터도 함께 갱신
    await fetchAttendanceData();
  };

  useEffect(() => {
    fetchAttendanceStatus();
  }, [selectedSchedule]);

  useEffect(() => {
    console.log('activeTab 변경됨:', activeTab);
  }, [activeTab]);

  // 등록 가능한 회원 필터링 (등록되지 않은 회원)
  const getAvailableMembers = () => {
    if (!selectedSchedule) return members;
    return members.filter(m => {
      const uid = m.id; // profiles.id 사용
      const status = attendanceStatus[uid];
      return !status || status === 'cancelled';
    });
  };

  // 등록된 회원 필터링 (참가 또는 등록된 회원)
  const getRegisteredMembers = () => {
    if (!selectedSchedule) return [];
    return members.filter(m => {
      const uid = m.id; // profiles.id 사용
      const status = attendanceStatus[uid];
      return status === 'registered' || status === 'attended';
    });
  };

  // 참가 신청(registered)만 필터링 → 출석 체크 대상
  const getAppliedMembers = () => {
    if (!selectedSchedule) return [];
    return members.filter(m => {
      const uid = m.id; // profiles.id 사용
      const status = attendanceStatus[uid];
      return status === 'registered';
    });
  };

  // 출석 체크 대상 회원 필터링 (참가 신청했지만 아직 출석 체크하지 않은 회원)
  const getAttendanceCheckMembers = async () => {
    if (!selectedSchedule) return [];

    // 먼저 참가 신청한 회원들 가져오기
    const appliedMembers = getAppliedMembers();

    // 출석 데이터 가져오기
    const attendanceData = await fetchAttendanceData();

    // 아직 출석 체크하지 않은 회원들만 필터링
    return appliedMembers.filter(m => {
      const uid = m.id;
      const attendanceStatus = attendanceData[uid];
      return !attendanceStatus; // 출석 상태가 없는 회원만
    });
  };

  // 출석 상태 조회 (attendances 테이블)
  const fetchAttendanceData = async () => {
    if (!selectedSchedule) {
      setAttendanceData({});
      return {};
    }

    const today = new Date().toISOString().split('T')[0];
    console.log('출석 데이터 조회 시작 - 날짜:', today);

    const { data, error } = await supabase
      .from('attendances')
      .select('user_id, status')
      .eq('attended_at', today);

    if (error) {
      console.error('출석 데이터 조회 오류:', error);
      setAttendanceData({});
      return {};
    }

    console.log('조회된 출석 데이터:', data);

    // attendances.user_id가 이미 profiles.id이므로 직접 매핑
    const attendanceMap: Record<string, string> = {};
    (data || []).forEach(row => {
      attendanceMap[row.user_id] = row.status;
      console.log(`출석 데이터: user_id=${row.user_id}, status=${row.status}`);
    });

    console.log('최종 출석 상태 맵:', attendanceMap);
    setAttendanceData(attendanceMap);
    return attendanceMap;
  };

  // 회원별 참가 등록
  const handleAttendanceMember = async (memberId: string) => {
    if (!selectedSchedule) {
      alert('경기 일정을 선택하세요.');
      return;
    }
    setLoading(true);
    try {
      const member = members.find(m => m.id === memberId);
      if (!member) {
        alert('회원을 찾을 수 없습니다.');
        return;
      }
      
      console.log('참가 등록 시도:', {
        match_schedule_id: selectedSchedule,
        user_id: member.id, // profiles.id 사용 (일관성 유지)
        member_id: member.id,
        member_username: member.username
      });
      
      const { data, error } = await supabase.from('match_participants').upsert({
        match_schedule_id: selectedSchedule,
        user_id: member.id, // profiles.id 사용 (일관성 유지)
        status: 'registered',
        registered_at: new Date().toISOString()
      }, { onConflict: 'match_schedule_id,user_id' });
      
      if (error) {
        console.error('참가 등록 DB 오류:', error);
        alert(`참가 등록 중 DB 오류: ${error.message}`);
        return;
      }
      
      console.log('참가 등록 성공:', data);
      
      // 저장된 데이터 확인
      const { data: verifyData, error: verifyError } = await supabase
        .from('match_participants')
        .select('*')
        .eq('match_schedule_id', selectedSchedule)
        .eq('user_id', member.id);
      
      if (verifyError) {
        console.error('저장된 데이터 확인 오류:', verifyError);
      } else {
        console.log('저장된 참가 데이터:', verifyData);
      }
      
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
      
      // 최신 참가 상태 다시 조회
      await fetchAttendanceStatus();
      
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
      const member = members.find(m => m.id === memberId);
      if (!member) {
        alert('회원을 찾을 수 없습니다.');
        return;
      }
      
      console.log('출석 처리 시도:', {
        match_schedule_id: selectedSchedule,
  user_id: member.id,
        member_id: member.id
      });
      
      const { error } = await supabase
        .from('match_participants')
        .update({ status: 'attended' })
        .eq('match_schedule_id', selectedSchedule)
        .eq('user_id', member.id)
        .eq('status', 'registered');

      if (error) {
        console.error('출석 처리 DB 오류:', error);
        alert(`출석 처리 중 DB 오류: ${error.message}`);
        return;
      }

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

      // 최신 참가 상태 다시 조회
      await fetchAttendanceStatus();

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
      const member = members.find(m => m.id === memberId);
      if (!member) {
        alert('회원을 찾을 수 없습니다.');
        return;
      }
      
      console.log('참가 취소 시도:', {
        match_schedule_id: selectedSchedule,
  user_id: member.id,
        member_id: member.id
      });
      
      const { error } = await supabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .eq('match_schedule_id', selectedSchedule)
        .eq('user_id', member.id);
      
      if (error) {
        console.error('참가 취소 DB 오류:', error);
        alert(`참가 취소 중 DB 오류: ${error.message}`);
        return;
      }

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
      
      // 최신 참가 상태 다시 조회
      await fetchAttendanceStatus();
      
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
      : activeTab === 'attendance'
        ? attendanceCheckMembers
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
      if (!confirm(`정말로 "${selectedScheduleInfo?.match_date} ${selectedScheduleInfo?.location}" 경기에 참가 신청 회원(${targetMembers.length}명)의 출석을 체크하시겠습니까?`)) {
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
      console.log('참가 등록 시도:', {
        match_schedule_id: selectedSchedule,
  user_id: member.id,
        member_id: member.id
      });
      
      const { error: insertError } = await supabase.from('match_participants').upsert({
        match_schedule_id: selectedSchedule,
  user_id: member.id, // profiles.id 사용
        status: 'registered',
        registered_at: new Date().toISOString()
      }, { onConflict: 'match_schedule_id,user_id' });
            
            if (insertError) {
              console.error(`회원 ${member.username || member.full_name} 등록 오류:`, insertError);
              errorCount++;
            } else {
              successCount++;
            }
          } else if (activeTab === 'cancel') {
            console.log('일괄 참가 취소 시도:', {
              match_schedule_id: selectedSchedule,
              user_id: member.id,
              member_id: member.id
            });
            
            const { error: cancelError } = await supabase
              .from('match_participants')
              .update({ status: 'cancelled' })
              .eq('match_schedule_id', selectedSchedule)
              .eq('user_id', member.id); // profiles.id 사용 (일관성 유지)
            
            if (cancelError) {
              console.error(`회원 ${member.username || member.full_name} 취소 오류:`, cancelError);
              errorCount++;
            } else {
              successCount++;
            }
          } else {
            console.log('일괄 출석 체크 시도:', {
              attended_at: new Date().toISOString().split('T')[0],
              user_id: member.id, // profiles.id 사용
              member_id: member.id
            });
            
            const { error: attendError } = await supabase.from('attendances').upsert({
              user_id: member.id, // profiles.id 사용
              attended_at: new Date().toISOString().split('T')[0],
              status: 'present'
            }, { onConflict: 'user_id,attended_at' });
            
            if (attendError) {
              console.error(`회원 ${member.username || member.full_name} 출석 체크 오류:`, attendError);
              errorCount++;
            } else {
              successCount++;
            }
          }
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
      
      // 최신 참가 상태 다시 조회
      await fetchAttendanceStatus();
      
      // 출석 체크인 경우 출석 데이터도 갱신
      if (activeTab === 'attendance') {
        await fetchAttendanceData();
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
        .in('user_id', members.map(m => m.id)); // profiles.id 사용 (일관성 유지)

      if (updateError) {
        console.error('참가 취소 처리 오류:', updateError);
        alert('참가 취소 처리 중 오류 발생');
      } else {
        // 참가자 수 0으로 업데이트
        await supabase
          .from('match_schedules')
          .update({ current_participants: 0 })
          .eq('id', selectedSchedule);
        
        // 최신 참가 상태 다시 조회
        await fetchAttendanceStatus();
        
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
            onClick={() => {
              console.log('참가 등록 탭 클릭됨');
              setActiveTab('register');
              console.log('activeTab 변경됨:', 'register');
            }}
          >
            참가 등록
          </button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'attendance' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-600'}`}
            onClick={() => {
              console.log('출석 체크 탭 클릭됨');
              setActiveTab('attendance');
              console.log('activeTab 변경됨:', 'attendance');
            }}
          >
            출석 체크
          </button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === 'cancel' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('cancel')}
          >
            참가 취소
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
              경기 일정 선택 ({schedules.length}개 일정 - 오늘 일정 자동 선택됨)
            </label>
            <select
              value={selectedSchedule}
              onChange={e => setSelectedSchedule(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">-- 경기 일정 선택 --</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>
                  {s.match_date} / {s.location} {s.match_date === new Date().toISOString().split('T')[0] ? '(오늘)' : ''}
                </option>
              ))}
            </select>
            {schedules.length === 0 && (
              <p className="text-red-500 text-sm mt-2">등록된 오늘 경기 일정이 없습니다.</p>
            )}
            {selectedSchedule && (
              <p className="text-green-600 text-sm mt-2">
                선택된 일정: {schedules.find(s => s.id === selectedSchedule)?.match_date} {schedules.find(s => s.id === selectedSchedule)?.location}
              </p>
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
                      const uid = m.id; // profiles.id 사용
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
            {activeTab === 'attendance' && (
              <>
                <label className="block mb-2 font-semibold">
                  출석 체크 대상 회원 목록 ({attendanceCheckMembers.length}명)
                </label>
                <div className="max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 150px)', justifyContent: 'start' }}>
                    {attendanceCheckMembers.map((m) => {
                      const uid = m.id; // profiles.id 사용
                      // 출석 상태 확인 (동기적으로 상태 사용)
                      const attendanceStatus = attendanceData[uid];
                      
                      let statusText = '';
                      let statusColor = '';
                      if (attendanceStatus === 'present') {
                        statusText = '출석';
                        statusColor = 'bg-green-50 text-green-700';
                      } else if (attendanceStatus === 'absent') {
                        statusText = '결석';
                        statusColor = 'bg-red-50 text-red-700';
                      } else {
                        statusText = '미체크';
                        statusColor = 'bg-gray-50 text-gray-600';
                      }
                      
                      return (
                        <div key={uid} className="flex flex-col items-start gap-2 p-2 border rounded bg-gray-50 w-[150px]">
                          <div className="w-full flex items-center justify-between">
                            <div className="text-sm font-medium text-blue-600 truncate">{m.username || m.full_name || uid}</div>
                            <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>{statusText}</span>
                          </div>
                          <div className="w-full flex gap-1">
                            <Button
                              size="sm"
                              className="bg-green-300 hover:bg-green-400 text-green-800 flex-1 text-xs"
                              disabled={loading || !selectedSchedule}
                              onClick={async () => {
                                const today = new Date().toISOString().split('T')[0];
                                console.log('출석 체크 시도:', {
                                  user_id: m.id, // profiles.id 사용
                                  attended_at: today
                                });

                                const { error } = await supabase.from('attendances').upsert({
                                  user_id: m.id, // profiles.id 사용
                                  attended_at: today,
                                  status: 'present'
                                }, { onConflict: 'user_id,attended_at' });                                if (error) {
                                  console.error('출석 체크 DB 오류:', error);
                                  alert(`출석 체크 중 DB 오류: ${error.message}`);
                                } else {
                                  alert('출석 체크 완료!');
                                  // 출석 데이터와 참가 상태 모두 갱신
                                  await fetchAttendanceData();
                                  await fetchAttendanceStatus();
                                }
                              }}
                            >
                              출석
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-300 hover:bg-red-400 text-red-800 flex-1 text-xs"
                              disabled={loading || !selectedSchedule}
                              onClick={async () => {
                                const today = new Date().toISOString().split('T')[0];
                                console.log('결석 체크 시도:', {
                                  user_id: m.id, // profiles.id 사용
                                  attended_at: today
                                });

                                const { error } = await supabase.from('attendances').upsert({
                                  user_id: m.id, // profiles.id 사용
                                  attended_at: today,
                                  status: 'absent'
                                }, { onConflict: 'user_id,attended_at' });                                if (error) {
                                  console.error('결석 체크 DB 오류:', error);
                                  alert(`결석 체크 중 DB 오류: ${error.message}`);
                                } else {
                                  alert('결석 체크 완료!');
                                  // 출석 데이터와 참가 상태 모두 갱신
                                  await fetchAttendanceData();
                                  await fetchAttendanceStatus();
                                }
                              }}
                            >
                              결석
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {attendanceCheckMembers.length === 0 && selectedSchedule && (
                  <p className="text-gray-500 text-sm mt-2">출석 체크할 참가 신청 회원이 없습니다.</p>
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
                      const uid = m.id; // profiles.id 사용
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
          {activeTab === 'attendance' && (
            <Button
              onClick={handleAttendanceAll}
              disabled={loading || !selectedSchedule || attendanceCheckMembers.length === 0}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              {loading ? '처리 중...' : `참가 신청 회원 ${attendanceCheckMembers.length}명을 모두 출석 처리`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
