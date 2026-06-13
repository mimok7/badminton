'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { RequireAdmin } from '@/components/AuthGuard';
import { AvailableDate, GeneratedMatch, MatchSession } from '../players/types';
import { fetchAvailableScheduleDates, fetchGeneratedMatchesBySession } from '../players/utils';

function MatchAssignmentPage() {
  const supabase = getSupabaseClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 배정 관련 상태
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [generatedMatches, setGeneratedMatches] = useState<GeneratedMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());

  // 일정 관리를 위한 상태
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedAssignDate, setSelectedAssignDate] = useState<string>('');

  useEffect(() => {
    async function initializeData() {
      try {
        // 현재 사용자 정보 가져오기
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        setCurrentUser(user);

        await fetchMatchSessions();
        await fetchAvailableDates();
      } catch (error) {
        console.error('초기화 오류:', error);
      }
    }

    initializeData();
  }, []);

  // 경기 세션 조회 함수
  const fetchMatchSessions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: sessions, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('session_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMatchSessions(sessions || []);
    } catch (error) {
      console.error('경기 세션 조회 오류:', error);
    }
  };

  // 배정 가능한 일정 조회 함수
  const fetchAvailableDates = async () => {
    try {
      setAvailableDates(await fetchAvailableScheduleDates());
    } catch (error) {
      console.error('일정 조회 오류:', error);
      setAvailableDates([]);
    }
  };

  // 선택된 세션의 생성된 경기 조회
  const fetchGeneratedMatches = async (sessionId: string) => {
    try {
      setLoading(true);
      setGeneratedMatches(await fetchGeneratedMatchesBySession(sessionId));
    } catch (error) {
      console.error('생성된 경기 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 경기 배정 함수 (날짜 선택 지원)
  const handleBulkAssign = async () => {
    if (selectedMatches.size === 0 || !selectedSessionId) {
      alert('배정할 경기를 선택해주세요.');
      return;
    }

    if (!selectedAssignDate) {
      alert('배정할 날짜를 선택해주세요.');
      return;
    }

    const matchesToAssign = generatedMatches.filter(match =>
      selectedMatches.has(match.id) && !match.is_scheduled
    );

    if (matchesToAssign.length === 0) {
      alert('배정할 수 있는 경기가 없습니다.');
      return;
    }

    try {
      setLoading(true);

      // 선택된 날짜의 일정 정보 가져오기
      const selectedDateInfo = availableDates.find(d => d.date === selectedAssignDate);
      if (!selectedDateInfo) {
        alert('선택된 날짜의 일정 정보를 찾을 수 없습니다.');
        return;
      }

      // 여유 공간 확인
      if (selectedDateInfo.availableSlots < matchesToAssign.length * 4) {
        const confirmed = confirm(
          `선택된 날짜의 여유 공간(${selectedDateInfo.availableSlots}명)이 ` +
          `배정할 경기 참가자 수(${matchesToAssign.length * 4}명)보다 부족합니다.\n\n` +
          `그래도 배정하시겠습니까?`
        );
        if (!confirmed) return;
      }

      // 스케줄 데이터 생성 (선택된 날짜에 배정)
      const scheduleInserts = matchesToAssign.map((match, index) => ({
        generated_match_id: match.id,
        match_date: selectedAssignDate,
        start_time: `${9 + index}:00`, // 기본 시작 시간 설정 (9:00부터 순차적으로)
        end_time: `${10 + index}:00`, // 종료 시간 (시작 시간 + 1시간)
        location: selectedDateInfo.location,
        max_participants: 4,
        current_participants: 0, // 초기값 0
        status: 'scheduled',
        description: `자동 배정된 경기 #${match.match_number}`,
        created_by: currentUser?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('match_schedules')
        .insert(scheduleInserts as any);

      if (error) {
        console.error('일괄 배정 데이터베이스 오류:', error);
        throw error;
      }

      // 세션의 배정된 경기 수 업데이트
      const selectedSession = matchSessions.find(s => s.id === selectedSessionId);
      if (selectedSession) {
        const { error: updateError } = await supabase
          .from('match_sessions')
          .update({ assigned_matches: selectedSession.assigned_matches + scheduleInserts.length })
          .eq('id', selectedSessionId);

        if (updateError) throw updateError;
      }

      setSelectedMatches(new Set());
      await fetchGeneratedMatches(selectedSessionId);
      await fetchMatchSessions();
      await fetchAvailableDates(); // 일정 정보 새로고침
      
      alert(
        `${scheduleInserts.length}개 경기가 ${new Date(selectedAssignDate).toLocaleDateString('ko-KR')} ` +
        `일정으로 성공적으로 배정되었습니다!`
      );
    } catch (error) {
      console.error('일괄 배정 오류:', error);
      alert('경기 배정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen p-6 bg-white">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-800">⚡ 경기 배정 관리</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">📋 사용 안내</h3>
        <p className="text-blue-700 text-sm">
          생성된 경기 일정에서 실제 진행할 경기들을 선택하여 특정 날짜로 배정할 수 있습니다. 
          배정된 경기만 대시보드와 개인 경기 조회에서 확인할 수 있습니다.
        </p>
      </div>
      
      {/* 오늘의 경기 일정 현황 */}
      <div className="mb-8 p-6 border border-blue-300 rounded-lg bg-blue-50">
        <h3 className="text-xl font-semibold mb-4 text-blue-800">📅 오늘의 경기 일정</h3>
        {matchSessions.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg font-medium mb-2">생성된 경기 일정이 없습니다</p>
            <p className="text-sm mb-4">먼저 경기 생성 페이지에서 경기를 생성해주세요.</p>
            <a
              href="/players"
              className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              📝 경기 생성하러 가기
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchSessions.map(session => (
              <div key={session.id} className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold text-lg text-gray-800 mb-2">{session.session_name}</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <span className="font-medium">총 경기:</span>
                        <span className="ml-1 text-blue-600 font-bold">{session.total_matches}경기</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">배정 완료:</span>
                        <span className="ml-1 text-green-600 font-bold">{session.assigned_matches}경기</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">남은 경기:</span>
                        <span className="ml-1 text-orange-600 font-bold">{session.total_matches - session.assigned_matches}경기</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      생성일시: {new Date(session.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center space-x-3">
                    {/* 진행률 표시 */}
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round((session.assigned_matches / session.total_matches) * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">진행률</div>
                    </div>
                    {/* 상태 배지 */}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      session.assigned_matches === session.total_matches 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : session.assigned_matches > 0 
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        : 'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}>
                      {session.assigned_matches === session.total_matches 
                        ? '✅ 배정완료' 
                        : session.assigned_matches > 0 
                        ? '🟡 부분배정'
                        : '⚪ 미배정'
                      }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 경기 배정 섹션 */}
      {matchSessions.length > 0 && (
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">🎯 경기 배정하기</h3>
          
          {/* 세션 선택 */}
          <div className="mb-6">
            <label className="block font-medium text-gray-700 mb-3">배정할 경기 일정 선택:</label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                if (e.target.value) {
                  fetchGeneratedMatches(e.target.value);
                } else {
                  setGeneratedMatches([]);
                  setSelectedMatches(new Set());
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- 경기 일정을 선택하세요 --</option>
              {matchSessions.map(session => (
                <option key={session.id} value={session.id}>
                  {session.session_name} (총 {session.total_matches}경기 | 배정완료: {session.assigned_matches}경기)
                </option>
              ))}
            </select>
          </div>

          {/* 배정할 날짜 선택 */}
          {selectedSessionId && (
            <div className="mb-6">
              <label className="block font-medium text-gray-700 mb-3">배정할 경기 날짜 선택:</label>
              {availableDates.length === 0 ? (
                <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-center text-yellow-800">
                    <div className="text-4xl mb-3">📅</div>
                    <p className="font-bold text-lg mb-2">배정 가능한 일정이 없습니다</p>
                    <p className="text-sm mb-4">
                      경기를 배정하려면 먼저 <strong>경기일정 관리</strong> 메뉴에서 일정을 등록해주세요.
                    </p>
                    <a 
                      href="/match-schedule" 
                      target="_blank"
                      className="inline-block px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium"
                    >
                      📅 일정 등록하러 가기
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    value={selectedAssignDate}
                    onChange={(e) => setSelectedAssignDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- 배정할 날짜를 선택하세요 --</option>
                    {availableDates.map(dateInfo => (
                      <option key={dateInfo.date} value={dateInfo.date}>
                        {new Date(dateInfo.date).toLocaleDateString('ko-KR')} - {dateInfo.location} 
                        ({dateInfo.timeRange}) | 여유공간: {dateInfo.availableSlots}명
                      </option>
                    ))}
                  </select>
                  
                  {/* 선택된 날짜 정보 표시 */}
                  {selectedAssignDate && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      {(() => {
                        const dateInfo = availableDates.find(d => d.date === selectedAssignDate);
                        if (!dateInfo) return null;
                        
                        return (
                          <div className="text-sm">
                            <div className="font-bold text-green-800 mb-3 text-lg">
                              📅 {new Date(dateInfo.date).toLocaleDateString('ko-KR')} 배정 정보
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-green-700">
                              <div className="flex items-center">
                                <span className="font-medium">📍 장소:</span>
                                <span className="ml-2">{dateInfo.location}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="font-medium">🕒 시간:</span>
                                <span className="ml-2">{dateInfo.timeRange}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="font-medium">👥 현재 참가자:</span>
                                <span className="ml-2 font-bold">{dateInfo.currentParticipants}명 / {dateInfo.totalCapacity}명</span>
                              </div>
                              <div className="flex items-center">
                                <span className="font-medium">✨ 여유 공간:</span>
                                <span className="ml-2 font-bold text-lg">{dateInfo.availableSlots}명</span>
                              </div>
                            </div>
                            {selectedMatches.size > 0 && (
                              <div className="mt-4 pt-3 border-t border-green-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="flex items-center">
                                    <span className="font-medium">🎯 선택된 경기:</span>
                                    <span className="ml-2 font-bold">{selectedMatches.size}경기</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="font-medium">🏃‍♂️ 필요한 참가자:</span>
                                    <span className="ml-2 font-bold">{selectedMatches.size * 4}명</span>
                                  </div>
                                </div>
                                {dateInfo.availableSlots < selectedMatches.size * 4 && (
                                  <div className="mt-3 p-3 bg-orange-100 border border-orange-200 rounded">
                                    <div className="text-orange-700 font-bold">
                                      ⚠️ 여유 공간이 부족합니다! 일부 경기는 대기 상태로 배정될 수 있습니다.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 생성된 경기 목록 */}
          {selectedSessionId && generatedMatches.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-lg text-gray-700">생성된 경기 목록</h4>
                <div className="text-sm text-gray-600 bg-white px-3 py-1 rounded border">
                  선택된 경기: <span className="font-bold text-blue-600">{selectedMatches.size}개</span> / 
                  전체: <span className="font-bold">{generatedMatches.length}개</span>
                </div>
              </div>
              
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {generatedMatches.map(match => (
                    <div key={match.id} className={`flex items-center p-4 border-b hover:bg-gray-50 transition-colors ${
                      match.is_scheduled ? 'opacity-50' : ''
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedMatches.has(match.id)}
                        disabled={match.is_scheduled}
                        onChange={(e) => {
                          const newSelected = new Set(selectedMatches);
                          if (e.target.checked) {
                            newSelected.add(match.id);
                          } else {
                            newSelected.delete(match.id);
                          }
                          setSelectedMatches(newSelected);
                        }}
                        className="w-5 h-5 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1 ml-4">
                        <div className="flex items-center mb-2">
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                            #{match.match_number}
                          </span>
                          {match.is_scheduled && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">
                              ✅ 배정완료
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center">
                            <span className="text-blue-600 font-medium">🎾 팀1:</span>
                            <span className="ml-2">
                              {match.team1_player1.name}({match.team1_player1.skill_level.toUpperCase()}), 
                              {match.team1_player2.name}({match.team1_player2.skill_level.toUpperCase()})
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-red-600 font-medium">🏸 팀2:</span>
                            <span className="ml-2">
                              {match.team2_player1.name}({match.team2_player1.skill_level.toUpperCase()}), 
                              {match.team2_player2.name}({match.team2_player2.skill_level.toUpperCase()})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 전체 선택/해제 버튼 */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    const unscheduledMatches = generatedMatches.filter(m => !m.is_scheduled);
                    setSelectedMatches(new Set(unscheduledMatches.map(m => m.id)));
                  }}
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg font-medium transition-colors"
                  disabled={loading}
                >
                  전체 선택
                </button>
                <button
                  onClick={() => setSelectedMatches(new Set())}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                  disabled={loading}
                >
                  선택 해제
                </button>
              </div>
            </div>
          )}

          {/* 배정 버튼 */}
          {selectedMatches.size > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-bold text-lg text-gray-800 mb-4">🎯 최종 배정</h4>
              
              {!selectedAssignDate ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 font-medium">
                    ⚠️ 경기를 배정하려면 먼저 배정할 날짜를 선택해주세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-blue-800">
                      <div className="font-bold text-lg mb-2">
                        📋 배정 요약
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div><strong>배정 경기 수:</strong> {selectedMatches.size}개</div>
                        <div><strong>배정 날짜:</strong> {new Date(selectedAssignDate).toLocaleDateString('ko-KR')}</div>
                        <div><strong>필요한 참가자:</strong> {selectedMatches.size * 4}명</div>
                        <div><strong>배정 장소:</strong> {availableDates.find(d => d.date === selectedAssignDate)?.location}</div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleBulkAssign}
                    disabled={loading || !selectedAssignDate}
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 disabled:bg-gray-400 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-3"></div>
                        배정 중...
                      </div>
                    ) : (
                      `✨ ${selectedMatches.size}개 경기 배정하기`
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProtectedMatchAssignmentPage() {
  return (
    <RequireAdmin>
      <MatchAssignmentPage />
    </RequireAdmin>
  );
}
