'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getLevelScore } from '@/utils/match-helpers';
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
  onDeleteSession?: (sessionId: string) => void;
  onDeleteSessionMatch?: (sessionId: string, matchId: string) => void;
  onDeleteAllSessions?: () => void;
  deletingAllSessions?: boolean;
  deletingSessionIds?: Record<string, boolean>;
  deletingMatchIds?: Record<string, boolean>;
}

export default function MatchSessionStatus({
  matchSessions,
  registeredSchedules = [],
  title = '📅 오늘의 경기 일정',
  onDeleteSession,
  onDeleteSessionMatch,
  onDeleteAllSessions,
  deletingAllSessions = false,
  deletingSessionIds = {},
  deletingMatchIds = {},
}: MatchSessionStatusProps) {
  const hasRegisteredSchedules = registeredSchedules.length > 0;
  const hasMatchSessions = matchSessions.length > 0;
  const [selectedSession, setSelectedSession] = useState<MatchSession | null>(null);
  const [sessionMatches, setSessionMatches] = useState<GeneratedMatch[]>([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string>('');
  const detailsRef = useRef<HTMLDivElement | null>(null);

  const closeDetails = () => {
    setSelectedSession(null);
    setSessionMatches([]);
    setDetailError('');
    setLoadingSessionId(null);
  };

  const openSessionMatches = async (session: MatchSession) => {
    if (selectedSession?.id === session.id) {
      closeDetails();
      return;
    }

    try {
      setLoadingSessionId(session.id);
      setDetailError('');

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
      setDetailError(error instanceof Error ? error.message : '배정내역을 불러오지 못했습니다.');
      setSelectedSession(session);
      setSessionMatches([]);
    } finally {
      setLoadingSessionId(null);
    }
  };

  useEffect(() => {
    if (!selectedSession || !detailsRef.current) {
      return;
    }

    detailsRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [selectedSession, sessionMatches.length]);

  const detailRows = useMemo(() => {
    return sessionMatches.map((match) => {
      const team1Player1Score = getLevelScore(match.team1_player1.skill_level);
      const team1Player2Score = getLevelScore(match.team1_player2.skill_level);
      const team2Player1Score = getLevelScore(match.team2_player1.skill_level);
      const team2Player2Score = getLevelScore(match.team2_player2.skill_level);
      const team1Score = team1Player1Score + team1Player2Score;
      const team2Score = team2Player1Score + team2Player2Score;

      return {
        match,
        team1Player1Score,
        team1Player2Score,
        team2Player1Score,
        team2Player2Score,
        team1Score,
        team2Score,
        diff: Math.abs(team1Score - team2Score),
      };
    });
  }, [sessionMatches]);

  const averageScoreDiff = detailRows.length > 0
    ? detailRows.reduce((sum, row) => sum + row.diff, 0) / detailRows.length
    : 0;

  const maxScoreDiff = detailRows.length > 0
    ? Math.max(...detailRows.map((row) => row.diff))
    : 0;

  const playerGameCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    detailRows.forEach(({ match }) => {
      [
        match.team1_player1,
        match.team1_player2,
        match.team2_player1,
        match.team2_player2,
      ].forEach((player) => {
        const level = (player.skill_level || 'E2').toUpperCase();
        const key = `${player.name}(${level})`;
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    return counts;
  }, [detailRows]);

  const totalPlayerGames = Object.values(playerGameCounts).reduce((sum, count) => sum + count, 0);
  const totalPlayers = Object.keys(playerGameCounts).length;

  const renderPlayerLine = (name: string, skillLevel: string, score: number) => (
    <div className="text-sm text-gray-800">
      {name} <span className="font-medium">({(skillLevel || 'E2').toUpperCase()})</span>{' '}
      <span className="text-gray-500">{score.toFixed(1)}점</span>
    </div>
  );

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
                      <div className="mt-1 text-xs text-gray-500">상태: {schedule.status}</div>
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
                          {loadingSessionId === session.id
                            ? '불러오는 중...'
                            : selectedSession?.id === session.id
                            ? '배정닫기'
                            : '배정보기'}
                        </button>
                        {onDeleteSession && (
                          <button
                            type="button"
                            onClick={() => onDeleteSession(session.id)}
                            disabled={Boolean(deletingSessionIds[session.id])}
                            className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingSessionIds[session.id] ? '삭제 중...' : '세션 삭제'}
                          </button>
                        )}
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
        <div
          ref={detailsRef}
          className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">배정내역 보기</h4>
              <p className="text-sm text-gray-600">{selectedSession.session_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                총 {selectedSession.total_matches}경기
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                배정 완료 {selectedSession.assigned_matches}경기
              </span>
              {onDeleteSession && (
                <button
                  type="button"
                  onClick={() => onDeleteSession(selectedSession.id)}
                  disabled={Boolean(deletingSessionIds[selectedSession.id])}
                  className="rounded border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingSessionIds[selectedSession.id] ? '세션 삭제 중...' : '세션 삭제'}
                </button>
              )}
              <button
                type="button"
                onClick={closeDetails}
                className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100"
              >
                닫기
              </button>
            </div>
          </div>

          <div className="px-6 py-5">
            {detailError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {detailError}
              </div>
            ) : sessionMatches.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                표시할 배정내역이 없습니다.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h5 className="text-lg font-semibold text-gray-900">
                    ✋ 수동 배정 - 선수 선택 ({sessionMatches.length}경기)
                  </h5>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
                      평균 팀 점수 차이: <span className="font-bold">{averageScoreDiff.toFixed(1)}점</span>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                      최대 팀 점수 차이: <span className="font-bold">{maxScoreDiff.toFixed(1)}점</span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-gray-300 bg-white">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold">회차</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold">라켓팀</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold">셔틀팀</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold">점수 차이</th>
                        {onDeleteSessionMatch && (
                          <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold">삭제</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row) => {
                        const isWorstMatch = row.diff === maxScoreDiff && maxScoreDiff > 0;

                        return (
                          <tr
                            key={row.match.id}
                            className={isWorstMatch ? 'bg-rose-50' : 'hover:bg-gray-50'}
                          >
                            <td className="border border-gray-300 px-2 py-3 text-center text-sm font-medium">
                              {row.match.match_number}
                            </td>
                            <td className="border border-gray-300 px-3 py-3">
                              <div className="space-y-1">
                                {renderPlayerLine(row.match.team1_player1.name, row.match.team1_player1.skill_level, row.team1Player1Score)}
                                {renderPlayerLine(row.match.team1_player2.name, row.match.team1_player2.skill_level, row.team1Player2Score)}
                                <div className="pt-1 text-sm font-semibold text-blue-700">
                                  ({row.team1Score.toFixed(1)})
                                </div>
                              </div>
                            </td>
                            <td className="border border-gray-300 px-3 py-3">
                              <div className="space-y-1">
                                {renderPlayerLine(row.match.team2_player1.name, row.match.team2_player1.skill_level, row.team2Player1Score)}
                                {renderPlayerLine(row.match.team2_player2.name, row.match.team2_player2.skill_level, row.team2Player2Score)}
                                <div className="pt-1 text-sm font-semibold text-rose-700">
                                  ({row.team2Score.toFixed(1)})
                                </div>
                              </div>
                            </td>
                            <td className={`border border-gray-300 px-2 py-3 text-center text-sm font-semibold ${isWorstMatch ? 'text-rose-700' : 'text-gray-700'}`}>
                              <div>{row.diff.toFixed(1)}점</div>
                              {isWorstMatch && (
                                <div className="mt-1 text-xs font-medium text-rose-600">최대 편차</div>
                              )}
                            </td>
                            {onDeleteSessionMatch && (
                              <td className="border border-gray-300 px-2 py-3 text-center text-sm">
                                <button
                                  type="button"
                                  onClick={() => onDeleteSessionMatch(selectedSession.id, row.match.id)}
                                  disabled={Boolean(deletingMatchIds[row.match.id])}
                                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingMatchIds[row.match.id] ? '삭제 중...' : '삭제'}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h5 className="mb-3 text-lg font-semibold text-gray-900">1인당 총 게임수</h5>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div
                      className="grid gap-2 text-sm"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
                    >
                      {Object.entries(playerGameCounts)
                        .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'ko', { sensitivity: 'base' }))
                        .map(([playerName, gameCount]) => (
                          <div
                            key={playerName}
                            className="flex justify-between rounded border bg-white p-2"
                          >
                            <span className="mr-2 truncate font-medium text-gray-800">{playerName}</span>
                            <span className="font-bold text-blue-600">{gameCount}</span>
                          </div>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
                      <span>총 선수: {totalPlayers}명</span>
                      <span>총 경기: {sessionMatches.length}경기</span>
                      <span>
                        평균 경기수: {totalPlayers > 0 ? (totalPlayerGames / totalPlayers).toFixed(1) : '0'}경기/인
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
