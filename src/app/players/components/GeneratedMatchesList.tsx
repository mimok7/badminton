'use client';

import React from 'react';
import { Match } from '@/types';

interface GeneratedMatchesListProps {
  matches: Match[];
  playerGameCounts: Record<string, number>;
  assignType: 'today' | 'scheduled';
  setAssignType: (type: 'today' | 'scheduled') => void;
  loading: boolean;
  onClearMatches: () => void;
  onAssignMatches: () => void;
}

export default function GeneratedMatchesList({
  matches,
  playerGameCounts,
  assignType,
  setAssignType,
  loading,
  onClearMatches,
  onAssignMatches
}: GeneratedMatchesListProps) {
  if (matches.length === 0) {
    return null;
  }

  const getPlayerName = (player: any) => {
    if (typeof player === 'object' && player.name) {
      const level = player.skill_level || 'E2';
      return `${player.name}(${level.toUpperCase()})`;
    }
    return String(player);
  };

  return (
    <div className="mt-6">
      {/* 경기 목록 테이블 */}
      <h3 className="text-lg font-semibold mb-3">생성된 경기 ({matches.length}경기)</h3>
      <div className="overflow-x-auto mb-6">
        <table className="w-full border-collapse border border-gray-300 bg-white">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">회차</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">라켓팀</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">셔틀팀</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => (
              <tr key={match.id || `match-${index}`} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-2 py-2 text-center font-medium text-sm">
                  {index + 1}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-center text-blue-600 text-xs">
                  {getPlayerName(match.team1.player1)}, {getPlayerName(match.team1.player2)}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-center text-red-600 text-xs">
                  {getPlayerName(match.team2.player1)}, {getPlayerName(match.team2.player2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 1인당 게임수 표시 */}
      {Object.keys(playerGameCounts).length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold mb-3">1인당 총 게임수</h4>
          <div className="bg-gray-50 p-4 rounded border">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
              {Object.entries(playerGameCounts)
                .sort(([, a], [, b]) => b - a) // 게임수 많은 순으로 정렬
                .map(([playerName, gameCount]) => (
                  <div key={playerName} className="flex justify-between bg-white p-2 rounded border">
                    <span className="font-medium truncate mr-2">{playerName}</span>
                    <span className="text-blue-600 font-bold flex-shrink-0">{gameCount}</span>
                  </div>
                ))}
            </div>
            <div className="mt-3 text-xs text-gray-600">
              <div className="flex flex-wrap gap-4">
                <span>총 선수: {Object.keys(playerGameCounts).length}명</span>
                <span>총 경기: {matches.length}경기</span>
                <span>평균 경기수: {Object.keys(playerGameCounts).length > 0 
                  ? (Object.values(playerGameCounts).reduce((a, b) => a + b, 0) / Object.keys(playerGameCounts).length).toFixed(1)
                  : '0'
                }경기/인</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 배정 옵션 섹션 */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="text-lg font-semibold mb-4 text-gray-800">🎯 경기 배정하기</h4>
        <p className="text-sm text-gray-600 mb-4">
          생성된 {matches.length}개의 경기를 어떻게 배정하시겠습니까?
        </p>
        
        <div className="space-y-3 mb-4">
          <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-white cursor-pointer">
            <input
              type="radio"
              name="assignType"
              value="today"
              checked={assignType === 'today'}
              onChange={(e) => setAssignType(e.target.value as 'today' | 'scheduled')}
              className="form-radio text-green-500 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-green-700">🔥 오늘 바로 배정</span>
              <p className="text-sm text-gray-600">회원들이 지금 바로 경기할 수 있도록 배정합니다</p>
            </div>
          </label>
          
          <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-white cursor-pointer">
            <input
              type="radio"
              name="assignType"
              value="scheduled"
              checked={assignType === 'scheduled'}
              onChange={(e) => setAssignType(e.target.value as 'today' | 'scheduled')}
              className="form-radio text-blue-500 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-blue-700">📅 예정 경기로 저장</span>
              <p className="text-sm text-gray-600">나중에 경기 배정 관리에서 일정을 배정합니다</p>
            </div>
          </label>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClearMatches}
            className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition-colors"
            disabled={loading}
          >
            경기 초기화
          </button>
          <button
            onClick={onAssignMatches}
            disabled={loading || matches.length === 0}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-all shadow-lg"
          >
            {loading ? '배정 중...' : '✨ 배정하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
