'use client';

import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { NotificationService } from '@/utils/notification-service';
import { MatchSession, GeneratedMatch, AvailableDate } from '../types';

interface MatchAssignmentManagerProps {
  matchSessions: MatchSession[];
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
  generatedMatches: GeneratedMatch[];
  selectedMatches: Set<string>;
  setSelectedMatches: (matches: Set<string>) => void;
  availableDates: AvailableDate[];
  selectedAssignDate: string;
  setSelectedAssignDate: (date: string) => void;
  loading: boolean;
  onFetchGeneratedMatches: (sessionId: string) => Promise<void>;
  onBulkAssign: () => Promise<void>;
}

export default function MatchAssignmentManager({
  matchSessions,
  selectedSessionId,
  setSelectedSessionId,
  generatedMatches,
  selectedMatches,
  setSelectedMatches,
  availableDates,
  selectedAssignDate,
  setSelectedAssignDate,
  loading,
  onFetchGeneratedMatches,
  onBulkAssign
}: MatchAssignmentManagerProps) {
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const supabase = createClientComponentClient();

  // 현재 사용자 정보 가져오기
  React.useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 사용자 프로필 정보도 함께 가져오기
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        setCurrentUser({ ...user, profile });
      }
    };
    getCurrentUser();
  }, []);

  // 상태 텍스트 반환 함수
  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return '예정';
      case 'in_progress': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소';
      default: return status;
    }
  };

  // 경기 상태 변경 및 알림 발송
  const handleMatchStatusChange = async (matchId: string, newStatus: 'scheduled' | 'in_progress' | 'completed' | 'cancelled', match: GeneratedMatch) => {
    setUpdatingStatus(matchId);

    try {
      // 먼저 현재 상태를 확인하여 중복 변경 방지
      const { data: currentMatch, error: checkError } = await supabase
        .from('generated_matches')
        .select('status')
        .eq('id', matchId)
        .single();

      if (checkError) {
        console.error('경기 상태 확인 실패:', checkError);
        alert('경기 상태 확인 중 오류가 발생했습니다.');
        return;
      }

      // 이미 같은 상태거나, 완료된 경기는 변경하지 않음
      if (currentMatch.status === newStatus) {
        const statusText = {
          'scheduled': '예정',
          'in_progress': '진행중',
          'completed': '완료',
          'cancelled': '취소'
        }[newStatus];
        alert(`이미 경기 #${match.match_number}이 "${statusText}" 상태입니다.`);
        return;
      }
      
      if (currentMatch.status === 'completed' && newStatus !== 'completed') {
        alert(`완료된 경기 #${match.match_number}의 상태는 변경할 수 없습니다.`);
        return;
      }

      // 진행중인 경기를 다른 사용자가 또 진행중으로 변경하려는 경우 방지
      if (currentMatch.status === 'in_progress' && newStatus === 'in_progress') {
        alert(`이미 경기 #${match.match_number}이 진행중입니다.`);
        return;
      }

      // 데이터베이스 상태 업데이트 (낙관적 잠금 적용)
      const { error } = await supabase
        .from('generated_matches')
        .update({ 
          status: newStatus,
          ...(newStatus === 'completed' && { completed_at: new Date().toISOString() })
        })
        .eq('id', matchId)
        .eq('status', currentMatch.status); // 현재 상태와 일치할 때만 업데이트

      if (error) {
        console.error('경기 상태 업데이트 실패:', error);
        alert('경기 상태 변경 중 오류가 발생했습니다.');
        return;
      }

      // '진행중'으로 변경 시 다음 경기 참가자들에게 알림 발송
      if (newStatus === 'in_progress') {
        await sendNextMatchNotification(match);
        
        alert(`경기 #${match.match_number}이 "진행중"으로 변경되었습니다! 🏸

📢 다음 경기 참가자들에게 준비 알림을 발송했습니다.
💡 참가자들에게 브라우저 알림과 소리로 알림이 전송되었습니다.`);
      } else {
        const statusText = {
          'scheduled': '예정',
          'completed': '완료', 
          'cancelled': '취소'
        }[newStatus];
        
        alert(`경기 #${match.match_number}이 "${statusText}"으로 변경되었습니다.`);
      }

      // 경기 목록 새로고침
      if (selectedSessionId) {
        await onFetchGeneratedMatches(selectedSessionId);
      }

    } catch (error) {
      console.error('경기 상태 변경 실패:', error);
      alert('경기 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // 다음 경기 참가자들에게 알림 발송
  const sendNextMatchNotification = async (currentMatch: GeneratedMatch) => {
    try {
      // 현재 경기와 같은 세션의 다음 경기들 찾기
      const { data: nextMatches, error } = await supabase
        .from('generated_matches')
        .select(`
          *,
          team1_player1:profiles!team1_player1_id(user_id, username, full_name),
          team1_player2:profiles!team1_player2_id(user_id, username, full_name),
          team2_player1:profiles!team2_player1_id(user_id, username, full_name),
          team2_player2:profiles!team2_player2_id(user_id, username, full_name)
        `)
        .eq('session_id', currentMatch.session_id)
        .gt('match_number', currentMatch.match_number)
        .eq('status', 'scheduled') // 아직 시작하지 않은 경기만
        .order('match_number', { ascending: true })
        .limit(2); // 다음 경기와 그 다음 경기까지

      if (error || !nextMatches || nextMatches.length === 0) {
        console.log('다음 예정된 경기가 없습니다.');
        return;
      }

      let totalNotifications = 0;
      const notifiedPlayers: string[] = [];

      // 각 다음 경기의 참가자들에게 알림 발송
      for (const match of nextMatches) {
        const participants = [
          match.team1_player1,
          match.team1_player2,
          match.team2_player1,
          match.team2_player2
        ].filter(p => p && p.user_id);

        // 참가자별로 알림 발송 (중복 발송 방지 포함)
        for (const participant of participants) {
          const playerName = participant.username || participant.full_name || '선수';
          
          // 중복 발송 방지: 이미 같은 경기에 대한 준비 알림이 발송되었는지 확인
          const { data: existingNotification } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', participant.user_id)
            .eq('type', 'match_preparation')
            .eq('related_match_id', match.id)
            .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // 30분 내
            .single();

          if (existingNotification) {
            console.log(`⚠️ 중복 발송 방지: ${playerName}에게 이미 경기 #${match.match_number} 알림 발송됨`);
            continue; // 이미 발송된 경우 스킵
          }
          
          console.log(`🔔 관리자 배정현황에서 알림 발송: ${playerName} (경기 #${match.match_number})`);
          
          // 실제 브라우저 알림 + 소리 발송
          await NotificationService.sendMatchPreparationNotification(
            match.match_number, 
            [playerName]
          );
          
          notifiedPlayers.push(`${playerName} (경기#${match.match_number})`);
          
          // 알림 히스토리 기록
          try {
            await supabase.from('notifications').insert({
              user_id: participant.user_id,
              title: '경기 준비 알림',
              message: `경기 #${match.match_number} 준비 알림입니다.\n\n빈 코트로 이동하여 경기를 시작해 주세요.\n진행중 선택 시 다음 참가자에게 준비 알림이 발송됩니다.\n\n부상 없이 즐거운 운동 하세요!`,
              type: 'match_preparation',
              related_match_id: match.id,
              is_read: false
            });
            totalNotifications++;
          } catch (notificationError) {
            console.error('알림 기록 저장 실패:', notificationError);
          }
        }
      }

      console.log(`✅ 관리자 배정현황에서 다음 ${nextMatches.length}경기의 ${totalNotifications}명에게 준비 알림을 발송했습니다.`);
      
    } catch (error) {
      console.error('다음 경기 알림 발송 실패:', error);
    }
  };

  // 선수 이름 표시 (현재 사용자는 노란색으로 강조)
  const getPlayerNameDisplay = (playerName: string, skillLevel: string) => {
    const currentUserName = currentUser?.profile?.username || currentUser?.profile?.full_name;
    const isCurrentUser = currentUserName && playerName === currentUserName;
    
    return (
      <span className={isCurrentUser ? 'bg-yellow-200 px-1 py-0.5 rounded font-bold text-yellow-900' : ''}>
        {playerName}({skillLevel.toUpperCase()})
      </span>
    );
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">📋 경기 배정 관리</h2>
      
      {/* 세션 선택 및 배정 관리 */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            생성된 경기 세션 선택:
          </label>
          <select
            value={selectedSessionId}
            onChange={async (e) => {
              setSelectedSessionId(e.target.value);
              if (e.target.value) {
                await onFetchGeneratedMatches(e.target.value);
              }
            }}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">세션을 선택하세요</option>
            {matchSessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.session_name} ({session.total_matches}경기, 배정완료: {session.assigned_matches}경기)
              </option>
            ))}
          </select>
        </div>

        {/* 배정할 날짜 선택 */}
        {selectedSessionId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              배정할 날짜 선택:
            </label>
            <select
              value={selectedAssignDate}
              onChange={(e) => setSelectedAssignDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">날짜를 선택하세요</option>
              {availableDates.map(dateInfo => (
                <option key={dateInfo.date} value={dateInfo.date}>
                  {new Date(dateInfo.date).toLocaleDateString('ko-KR')} 
                  ({dateInfo.location} | 여유: {dateInfo.availableSlots}명 | {dateInfo.timeRange})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 생성된 경기 목록 */}
        {generatedMatches.length > 0 && (
          <div className="mt-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
              <h3 className="text-lg font-semibold text-gray-900">
                생성된 경기 목록 ({generatedMatches.length}경기)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const unassignedMatches = generatedMatches.filter(m => !m.is_scheduled);
                    if (unassignedMatches.length === 0) {
                      alert('배정 가능한 경기가 없습니다.');
                      return;
                    }
                    const newSelection = new Set(unassignedMatches.map(m => m.id));
                    setSelectedMatches(newSelection);
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                >
                  미배정 모두 선택
                </button>
                <button
                  onClick={() => setSelectedMatches(new Set())}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  선택 초기화
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                      선택
                    </th>
                    <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                      경기번호
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      팀1
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      팀2
                    </th>
                    <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                      경기상태
                    </th>
                    <th className="border border-gray-200 px-2 py-3 text-center text-sm font-semibold text-gray-700">
                      배정상태
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {generatedMatches.map(match => (
                    <tr key={match.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedMatches.has(match.id)}
                          onChange={(e) => {
                            const newSelection = new Set(selectedMatches);
                            if (e.target.checked) {
                              if (!match.is_scheduled) { // 배정되지 않은 경기만 선택 가능
                                newSelection.add(match.id);
                              }
                            } else {
                              newSelection.delete(match.id);
                            }
                            setSelectedMatches(newSelection);
                          }}
                          disabled={match.is_scheduled}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="border border-gray-200 px-2 py-3 text-center text-sm font-medium text-gray-900">
                        {match.match_number}
                      </td>
                      <td className="border border-gray-200 px-4 py-3 text-center text-sm text-blue-700">
                        {getPlayerNameDisplay(match.team1_player1.name, match.team1_player1.skill_level)},<br />
                        {getPlayerNameDisplay(match.team1_player2.name, match.team1_player2.skill_level)}
                      </td>
                      <td className="border border-gray-200 px-4 py-3 text-center text-sm text-red-700">
                        {getPlayerNameDisplay(match.team2_player1.name, match.team2_player1.skill_level)},<br />
                        {getPlayerNameDisplay(match.team2_player2.name, match.team2_player2.skill_level)}
                      </td>
                      <td className="border border-gray-200 px-2 py-3 text-center">
                        {/* 4명 선수 개별 상태 표시 */}
                        <div className="space-y-1 text-xs mb-3">
                          <div className="flex justify-between items-center gap-1">
                            <span className="truncate flex-1 text-left">{getPlayerNameDisplay(match.team1_player1.name, match.team1_player1.skill_level)}</span>
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                              match.status === 'completed' ? 'bg-green-100 text-green-700' :
                              match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              match.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {getStatusText(match.status)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-1">
                            <span className="truncate flex-1 text-left">{getPlayerNameDisplay(match.team1_player2.name, match.team1_player2.skill_level)}</span>
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                              match.status === 'completed' ? 'bg-green-100 text-green-700' :
                              match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              match.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {getStatusText(match.status)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-1">
                            <span className="truncate flex-1 text-left">{getPlayerNameDisplay(match.team2_player1.name, match.team2_player1.skill_level)}</span>
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                              match.status === 'completed' ? 'bg-green-100 text-green-700' :
                              match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              match.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {getStatusText(match.status)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-1">
                            <span className="truncate flex-1 text-left">{getPlayerNameDisplay(match.team2_player2.name, match.team2_player2.skill_level)}</span>
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                              match.status === 'completed' ? 'bg-green-100 text-green-700' :
                              match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              match.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {getStatusText(match.status)}
                            </span>
                          </div>
                        </div>
                        
                        {/* 전체 경기 상태 변경 드롭다운 */}
                        <div className="pt-2 border-t border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">전체 상태:</div>
                          <select
                            value={match.status || 'scheduled'}
                            onChange={(e) => handleMatchStatusChange(match.id, e.target.value as any, match)}
                            disabled={updatingStatus === match.id}
                            className={`w-full px-2 py-1 text-xs font-medium rounded border focus:ring-2 focus:ring-blue-500 ${
                              match.status === 'scheduled' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                              match.status === 'in_progress' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                              match.status === 'completed' ? 'bg-green-50 text-green-800 border-green-200' :
                              match.status === 'cancelled' ? 'bg-red-50 text-red-800 border-red-200' :
                              'bg-gray-50 text-gray-800 border-gray-200'
                            } ${updatingStatus === match.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <option value="scheduled">예정</option>
                            <option value="in_progress">진행중</option>
                            <option value="completed">완료</option>
                            <option value="cancelled">취소</option>
                          </select>
                          {updatingStatus === match.id && (
                            <div className="text-xs text-gray-500 mt-1">업데이트 중...</div>
                          )}
                        </div>
                      </td>
                      <td className="border border-gray-200 px-2 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          match.is_scheduled 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {match.is_scheduled ? '배정완료' : '미배정'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 일괄 배정 버튼 */}
            {selectedMatches.size > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <p className="text-sm text-blue-800">
                      <strong>{selectedMatches.size}개 경기</strong>를 선택된 날짜로 배정합니다.
                    </p>
                    {selectedAssignDate && (
                      <p className="text-xs text-blue-600 mt-1">
                        배정 날짜: {new Date(selectedAssignDate).toLocaleDateString('ko-KR')} |
                        참여자: {selectedMatches.size * 4}명
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onBulkAssign}
                    disabled={loading || !selectedAssignDate || selectedMatches.size === 0}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    {loading ? '배정 중...' : '일괄 배정'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
