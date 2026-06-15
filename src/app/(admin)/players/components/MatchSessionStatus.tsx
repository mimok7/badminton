'use client';

import React from 'react';
import { MatchSession } from '../types';

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

  return (
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
              <div className="mb-2 text-sm font-medium text-blue-900">등록된 오늘 경기</div>
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
                    <div className="flex-shrink-0">
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
  );
}
