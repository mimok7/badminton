'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RequireAuth } from '@/components/AuthGuard';

interface MatchSession {
  id: string;
  session_date: string;
  session_name: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  total_matches: number;
  assigned_matches: number;
}

interface GeneratedMatch {
  id: string;
  match_number: number;
  team1_player1: { id: string; name: string; skill_level: string; };
  team1_player2: { id: string; name: string; skill_level: string; };
  team2_player1: { id: string; name: string; skill_level: string; };
  team2_player2: { id: string; name: string; skill_level: string; };
  match_type: string;
  is_scheduled: boolean;
  schedule?: {
    id: string;
    court_number: number;
    scheduled_time: string;
    status: string;
  };
}

function ScheduleManagePage() {
  const supabase = createClientComponentClient();
  const [sessions, setSessions] = useState<MatchSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<MatchSession | null>(null);
  const [generatedMatches, setGeneratedMatches] = useState<GeneratedMatch[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkAssignMode, setBulkAssignMode] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [bulkStartTime, setBulkStartTime] = useState<string>('09:00');
  const [bulkCourtCount, setBulkCourtCount] = useState<number>(4);
  const [bulkMatchDuration, setBulkMatchDuration] = useState<number>(30);

  // 시간 슬롯 생성 (9:00 ~ 22:00, 30분 간격)
  useEffect(() => {
    const startHour = 9;
    const endHour = 22;
    const interval = 30;

    const slots = [];
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    setTimeSlots(slots);
  }, []);

  // 세션 목록 조회
  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('match_sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('세션 조회 오류:', error);
    }
  };

  // 선택된 세션의 생성된 경기 조회
  const fetchGeneratedMatches = async (sessionId: string) => {
    try {
      setLoading(true);
      
      const { data: matchesData, error } = await supabase
        .from('generated_matches')
        .select(`
          *,
          team1_player1:profiles!team1_player1_id(id, username, full_name, skill_level),
          team1_player2:profiles!team1_player2_id(id, username, full_name, skill_level),
          team2_player1:profiles!team2_player1_id(id, username, full_name, skill_level),
          team2_player2:profiles!team2_player2_id(id, username, full_name, skill_level),
          match_schedules(id, court_number, scheduled_time, status)
        `)
        .eq('session_id', sessionId)
        .order('match_number');

      if (error) throw error;

      const formattedMatches: GeneratedMatch[] = (matchesData || []).map(match => ({
        id: match.id,
        match_number: match.match_number,
        team1_player1: {
          id: match.team1_player1?.id || '',
          name: match.team1_player1?.username || match.team1_player1?.full_name || '선수1',
          skill_level: match.team1_player1?.skill_level || 'E2'
        },
        team1_player2: {
          id: match.team1_player2?.id || '',
          name: match.team1_player2?.username || match.team1_player2?.full_name || '선수2',
          skill_level: match.team1_player2?.skill_level || 'E2'
        },
        team2_player1: {
          id: match.team2_player1?.id || '',
          name: match.team2_player1?.username || match.team2_player1?.full_name || '선수3',
          skill_level: match.team2_player1?.skill_level || 'E2'
        },
        team2_player2: {
          id: match.team2_player2?.id || '',
          name: match.team2_player2?.username || match.team2_player2?.full_name || '선수4',
          skill_level: match.team2_player2?.skill_level || 'E2'
        },
        match_type: match.match_type,
        is_scheduled: match.match_schedules && match.match_schedules.length > 0,
        schedule: match.match_schedules?.[0] || undefined
      }));

      setGeneratedMatches(formattedMatches);
    } catch (error) {
      console.error('생성된 경기 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 일괄 배정 함수
  const handleBulkAssign = async () => {
    if (selectedMatches.size === 0) {
      alert('배정할 경기를 선택해주세요.');
      return;
    }

    if (!selectedSession) return;

    const matchesToAssign = generatedMatches.filter(match => 
      selectedMatches.has(match.id) && !match.is_scheduled
    );

    if (matchesToAssign.length === 0) {
      alert('배정할 수 있는 경기가 없습니다. (이미 배정된 경기는 제외됨)');
      return;
    }

    try {
      setLoading(true);
      const [hours, minutes] = bulkStartTime.split(':').map(Number);
      let currentTimeInMinutes = hours * 60 + minutes;
      const scheduleInserts = [];
      let assignedCount = 0;

      for (let i = 0; i < matchesToAssign.length; i++) {
        const match = matchesToAssign[i];
        const slotIndex = Math.floor(i / bulkCourtCount);
        const courtIndex = i % bulkCourtCount;
        const courtNumber = courtIndex + 1;
        const scheduleTime = currentTimeInMinutes + (slotIndex * bulkMatchDuration);
        const scheduleHours = Math.floor(scheduleTime / 60);
        const scheduleMinutes = scheduleTime % 60;
        
        if (scheduleHours >= 22) continue;

        const timeString = `${scheduleHours.toString().padStart(2, '0')}:${scheduleMinutes.toString().padStart(2, '0')}`;

        scheduleInserts.push({
          generated_match_id: match.id,
          court_number: courtNumber,
          scheduled_time: timeString,
          scheduled_date: selectedSession.session_date,
          status: 'scheduled'
        });

        assignedCount++;
      }

      if (scheduleInserts.length === 0) {
        alert('배정할 수 있는 시간대가 없습니다.');
        return;
      }

      const { error } = await supabase
        .from('match_schedules')
        .insert(scheduleInserts);

      if (error) throw error;

      const { error: updateError } = await supabase
        .from('match_sessions')
        .update({ assigned_matches: selectedSession.assigned_matches + assignedCount })
        .eq('id', selectedSession.id);

      if (updateError) throw updateError;

      setSelectedMatches(new Set());
      setBulkAssignMode(false);
      await fetchGeneratedMatches(selectedSession.id);
      await fetchSessions();
      
      alert(`${assignedCount}개 경기가 성공적으로 일괄 배정되었습니다!`);
    } catch (error) {
      console.error('일괄 배정 오류:', error);
      alert('일괄 배정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 전체 선택/해제
  const handleSelectAll = () => {
    const unscheduledMatches = generatedMatches.filter(match => !match.is_scheduled);
    if (selectedMatches.size === unscheduledMatches.length) {
      setSelectedMatches(new Set());
    } else {
      const allIds = new Set(unscheduledMatches.map(match => match.id));
      setSelectedMatches(allIds);
    }
  };

  // 개별 선택/해제
  const handleMatchSelect = (matchId: string) => {
    const newSelected = new Set(selectedMatches);
    if (newSelected.has(matchId)) {
      newSelected.delete(matchId);
    } else {
      newSelected.add(matchId);
    }
    setSelectedMatches(newSelected);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      fetchGeneratedMatches(selectedSession.id);
    }
  }, [selectedSession]);

  return (
    <div className="max-w-7xl mx-auto mt-10 p-6 bg-white shadow rounded">
      <h2 className="text-2xl font-bold mb-6 text-center">경기 일정 관리 - 일괄 배정</h2>

      {/* 세션 선택 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">경기 세션 선택</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedSession?.id === session.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedSession(session)}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{session.session_name}</h4>
              </div>
              <div className="text-sm text-gray-600">
                <div>날짜: {new Date(session.session_date).toLocaleDateString('ko-KR')}</div>
                <div>총 경기: {session.total_matches}경기</div>
                <div>배정된 경기: {session.assigned_matches}경기</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 생성된 경기 목록 및 일괄 배정 */}
      {selectedSession && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              경기 배정 - {selectedSession.session_name}
            </h3>
            <button
              onClick={() => setBulkAssignMode(!bulkAssignMode)}
              className={`px-4 py-2 rounded text-sm font-medium ${
                bulkAssignMode 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {bulkAssignMode ? '일괄배정 취소' : '일괄배정 모드'}
            </button>
          </div>

          {/* 일괄 배정 설정 패널 */}
          {bulkAssignMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                  <select
                    value={bulkStartTime}
                    onChange={(e) => setBulkStartTime(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    {timeSlots.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사용 코트 수</label>
                  <select
                    value={bulkCourtCount}
                    onChange={(e) => setBulkCourtCount(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6].map(num => (
                      <option key={num} value={num}>{num}개 코트</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">경기당 소요시간</label>
                  <select
                    value={bulkMatchDuration}
                    onChange={(e) => setBulkMatchDuration(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value={20}>20분</option>
                    <option value={25}>25분</option>
                    <option value={30}>30분</option>
                    <option value={35}>35분</option>
                    <option value={40}>40분</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                  >
                    전체선택
                  </button>
                  <button
                    onClick={handleBulkAssign}
                    disabled={selectedMatches.size === 0 || loading}
                    className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-400"
                  >
                    {loading ? '배정중...' : `${selectedMatches.size}개 경기 배정`}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                선택된 경기들이 {bulkStartTime}부터 {bulkCourtCount}개 코트를 사용해 {bulkMatchDuration}분 간격으로 배정됩니다.
              </div>
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2">경기 정보 로딩 중...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    {bulkAssignMode && (
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">선택</th>
                    )}
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">경기번호</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">팀1</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">팀2</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedMatches.map((match) => (
                    <tr key={match.id} className="hover:bg-gray-50">
                      {bulkAssignMode && (
                        <td className="border border-gray-300 px-3 py-2 text-center">
                          {!match.is_scheduled && (
                            <input
                              type="checkbox"
                              checked={selectedMatches.has(match.id)}
                              onChange={() => handleMatchSelect(match.id)}
                              className="w-4 h-4"
                            />
                          )}
                        </td>
                      )}
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {match.match_number}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-blue-600">
                        {match.team1_player1.name}({match.team1_player1.skill_level}), {match.team1_player2.name}({match.team1_player2.skill_level})
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-red-600">
                        {match.team2_player1.name}({match.team2_player1.skill_level}), {match.team2_player2.name}({match.team2_player2.skill_level})
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        <span className={`px-2 py-1 text-xs rounded ${match.is_scheduled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {match.is_scheduled ? '배정완료' : '대기중'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProtectedScheduleManagePage() {
  return (
    <RequireAuth>
      <ScheduleManagePage />
    </RequireAuth>
  );
}
