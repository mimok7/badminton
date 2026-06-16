'use client';

import React, { useState } from 'react';
import { GeneratedMatch, MatchSession } from '../types';

interface RegisteredScheduleSummary {
  id: string;
  match_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  status: string;
  current_participants: number | null;
  max_participants: number | null;
}

interface MatchSessionStatusProps {
  matchSessions: MatchSession[];
  registeredSchedules?: RegisteredScheduleSummary[];
  title?: string;
}

export default function MatchSessionStatus({
  matchSessions,
  registeredSchedules = [],
  title = '📅 오늘의 경기 일정',
}: MatchSessionStatusProps) {
  const hasRegisteredSchedules = registeredSchedules.length > 0;
  const hasMatchSessions = matchSessions.length > 0;
  const [selectedSession, setSelectedSession] = useState<MatchSession | null>(null);
  const [sessionMatches, setSessionMatches] = useState<GeneratedMatch[]>([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string>('');

  const closeModal = () => {
    setSelectedSession(null);
    setSessionMatches([]);
    setModalError('');
    setLoadingSessionId(null);
  };

  const openSessionMatches = async (session: MatchSession) => {
    try {
      setLoadingSessionId(session.id);
      setModalError('');

      const response = await fetch(`/api/admin/match-sessions/${session.id}/matches`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '배정내역 조회 실패');
      }

      setSelectedSession(session);
      setSessionMatches(payload?.matches || []);
    } catch (error) {
      console.error('세션 경기 조회 오류:', error);
      setModalError(error instanceof Error ? error.message : '배정내역을 불러오지 못했습니다.');
      setSelectedSession(session);
      setSessionMatches([]);
    } finally {
      setLoadingSessionId(null);
    }
  };

  return (
    <>
      <div className="mb-6 p-4 border border-blue-300 rounded bg-blue-50">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        {!hasRegisteredSchedules && !hasMatchSessions ? (
          <div className="text-gray-600 text-center py-4">
            <p className="mb-2">📋 아직 생성된 경기 일정이 없습니다</p>
            <p className="text-sm">아래 버튼으로 경기를 생성하면 자동으로 경기 일정이 만들어집니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasRegisteredSchedules && (
              <div>
                <div className="mb-2 text-sm font-medium text-blue-900">등록된 오늘 원본 일정</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {registeredSchedules.map((schedule) => (
                    <div key={schedule.id} className="p-3 bg-white rounded border">
                      <div className="font-medium text-gray-800">
                        {schedule.start_time} - {schedule.end_time}
                      </div>
                      <div className="text-sm text-gray-600">{schedule.location || '장소 미정'}</div>
                      <div className="text-sm text-gray-600">
                        인원: {schedule.current_participants ?? 0} / {schedule.max_participants ?? 0}명
                      </div>
                      <div className="text-xs text-gray-500">상태: {schedule.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasMatchSessions && (
              <div>
                <div className="mb-2 text-sm font-medium text-blue-900">생성된 경기 세션</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matchSessions.map((session) => (
                    <div key={session.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-white rounded border gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{session.session_name}</div>
                        <div className="text-sm text-gray-600">
                          총 {session.total_matches}경기 | 배정 완료: {session.assigned_matches}경기 | 
                          남은 경기: {session.total_matches - session.assigned_matches}경기
                        </div>
                        <div className="text-xs text-gray-500">
                          생성일시: {new Date(session.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openSessionMatches(session)}
                          disabled={loadingSessionId === session.id}
                          className="rounded border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingSessionId === session.id ? '불러오는 중...' : '배정보기'}
                        </button>
                        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          session.assigned_matches === session.total_matches 
                            ? 'bg-green-100 text-green-800' 
                            : session.assigned_matches > 0 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {session.assigned_matches === session.total_matches 
                            ? '배정완료' 
                            : session.assigned_matches > 0 
                            ? '부분배정'
                            : '미배정'
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">배정내역 보기</h4>
                <p className="text-sm text-gray-600">{selectedSession.session_name}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100"
              >
                닫기
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              {modalError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              ) : sessionMatches.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  표시할 배정내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionMatches.map((match) => (
                    <div key={match.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                          #{match.match_number}
                        </span>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${
                          match.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : match.status === 'in_progress'
                            ? 'bg-amber-100 text-amber-800'
                            : match.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {match.status}
                        </span>
                        {match.is_scheduled && (
                          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                            사용자 노출중
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded border border-blue-100 bg-white px-3 py-3">
                          <div className="mb-1 text-xs font-semibold text-blue-700">라켓팀</div>
                          <div className="text-sm text-gray-800">
                            {match.team1_player1.name} ({match.team1_player1.skill_level.toUpperCase()})
                          </div>
                          <div className="text-sm text-gray-800">
                            {match.team1_player2.name} ({match.team1_player2.skill_level.toUpperCase()})
                          </div>
                        </div>
                        <div className="rounded border border-rose-100 bg-white px-3 py-3">
                          <div className="mb-1 text-xs font-semibold text-rose-700">셔틀팀</div>
                          <div className="text-sm text-gray-800">
                            {match.team2_player1.name} ({match.team2_player1.skill_level.toUpperCase()})
                          </div>
                          <div className="text-sm text-gray-800">
                            {match.team2_player2.name} ({match.team2_player2.skill_level.toUpperCase()})
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
