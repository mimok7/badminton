'use client';

import React from 'react';
import { getTeamScore } from '@/utils/match-utils';
import { Match } from '@/types';

interface GeneratedMatchesListProps {
  matches: Match[];
  playerGameCounts: Record<string, number>;
  assignType: 'today' | 'scheduled';
  setAssignType: (type: 'today' | 'scheduled') => void;
  loading: boolean;
  onClearMatches: () => void;
  onAssignMatches: () => void;
  isManualMode?: boolean;
  presentPlayers?: any[];
  onManualMatchChange?: (matches: any[]) => void;
}

export default function GeneratedMatchesList({
  matches,
  playerGameCounts,
  assignType,
  setAssignType,
  loading,
  onClearMatches,
  onAssignMatches,
  isManualMode = false,
  presentPlayers = [],
  onManualMatchChange
}: GeneratedMatchesListProps) {
  if (matches.length === 0) {
    return null;
  }

  const getPlayerName = (player: any) => {
    if (!player) return '미지정';
    if (typeof player === 'object' && player.name) {
      const level = player.skill_level || 'E2';
      return `${player.name}(${level.toUpperCase()})`;
    }
    return String(player);
  };

  const handlePlayerSelect = (matchIdx: number, team: 'team1' | 'team2', slot: 'player1' | 'player2', playerId: string) => {
    if (!onManualMatchChange) return;
    const player = presentPlayers.find(p => p.id === playerId) || null;
    const updatedMatches = matches.map((m, idx) => {
      if (idx !== matchIdx) return m;
      const newMatch = JSON.parse(JSON.stringify(m));
      newMatch[team][slot] = player;
      return newMatch;
    });
    onManualMatchChange(updatedMatches);
  };

  const isSelectedInMatch = (match: any, playerId: string) => {
    if (!playerId) return false;
    const ids = [] as string[];
    if (match.team1?.player1?.id) ids.push(match.team1.player1.id);
    if (match.team1?.player2?.id) ids.push(match.team1.player2.id);
    if (match.team2?.player1?.id) ids.push(match.team2.player1.id);
    if (match.team2?.player2?.id) ids.push(match.team2.player2.id);
    return ids.includes(playerId);
  };

  const getAvailablePlayers = (match: any) => {
    const selectedIds = new Set<string>();
    if (match.team1?.player1?.id) selectedIds.add(match.team1.player1.id);
    if (match.team1?.player2?.id) selectedIds.add(match.team1.player2.id);
    if (match.team2?.player1?.id) selectedIds.add(match.team2.player1.id);
    if (match.team2?.player2?.id) selectedIds.add(match.team2.player2.id);
    return presentPlayers.filter(p => !selectedIds.has(p.id));
  };

  return (
    <div className="mt-6">
      {/* 경기 목록 테이블 */}
      <h3 className="text-lg font-semibold mb-3">
        {isManualMode ? '✋ 수동 배정 - 선수 선택' : '생성된 경기'} ({matches.length}경기)
      </h3>
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
                {isManualMode ? (
                  <>
                    <td className="border border-gray-300 px-2 py-2 text-center text-xs">
                      <div className="flex items-center gap-2 p-2">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select 
                            value={match.team1?.player1?.id || ''} 
                            onChange={(e) => handlePlayerSelect(index, 'team1', 'player1', e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                          >
                            <option value="">선수 선택</option>
                            {match.team1?.player1 && (
                              <option key={match.team1.player1.id} value={match.team1.player1.id}>
                                {match.team1.player1.name} ({(match.team1.player1.skill_level || '').toUpperCase()})
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()})
                              </option>
                            ))}
                          </select>
                          <select 
                            value={match.team1?.player2?.id || ''} 
                            onChange={(e) => handlePlayerSelect(index, 'team1', 'player2', e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                          >
                            <option value="">선수 선택</option>
                            {match.team1?.player2 && (
                              <option key={match.team1.player2.id} value={match.team1.player2.id}>
                                {match.team1.player2.name} ({(match.team1.player2.skill_level || '').toUpperCase()})
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()})
                              </option>
                            ))}
                          </select>
                        </div>
                        {(match.team1?.player1 || match.team1?.player2) && (
                          <div className="text-xs font-bold text-blue-600 whitespace-nowrap px-2">
                            ({getTeamScore(match.team1)})
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center text-xs">
                      <div className="flex items-center gap-2 p-2">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select 
                            value={match.team2?.player1?.id || ''} 
                            onChange={(e) => handlePlayerSelect(index, 'team2', 'player1', e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                          >
                            <option value="">선수 선택</option>
                            {match.team2?.player1 && (
                              <option key={match.team2.player1.id} value={match.team2.player1.id}>
                                {match.team2.player1.name} ({(match.team2.player1.skill_level || '').toUpperCase()})
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()})
                              </option>
                            ))}
                          </select>
                          <select 
                            value={match.team2?.player2?.id || ''} 
                            onChange={(e) => handlePlayerSelect(index, 'team2', 'player2', e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                          >
                            <option value="">선수 선택</option>
                            {match.team2?.player2 && (
                              <option key={match.team2.player2.id} value={match.team2.player2.id}>
                                {match.team2.player2.name} ({(match.team2.player2.skill_level || '').toUpperCase()})
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()})
                              </option>
                            ))}
                          </select>
                        </div>
                        {(match.team2?.player1 || match.team2?.player2) && (
                          <div className="text-xs font-bold text-red-600 whitespace-nowrap px-2">
                            ({getTeamScore(match.team2)})
                          </div>
                        )}
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border border-gray-300 px-2 py-2 text-center text-blue-600 text-xs">
                      {getPlayerName(match.team1.player1)}, {getPlayerName(match.team1.player2)}
                      <span className="text-xs text-gray-500 ml-2">({getTeamScore(match.team1)})</span>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center text-red-600 text-xs">
                      {getPlayerName(match.team2.player1)}, {getPlayerName(match.team2.player2)}
                      <span className="text-xs text-gray-500 ml-2">({getTeamScore(match.team2)})</span>
                    </td>
                  </>
                )}
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
            <div className="grid gap-2 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', justifyContent: 'start' }}>
              {Object.entries(playerGameCounts)
                .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'ko', { sensitivity: 'base' })) // 한글 사전(ㄱㄴㄷ) 순 정렬
                .map(([playerName, gameCount]) => (
                  <div key={playerName} className="flex justify-between bg-white p-2 rounded border" style={{ width: '120px', minWidth: '120px' }}>
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
        {/* 세션명은 자동 생성됩니다. */}
        
        <div className="mb-4">
          <div className="p-3 border rounded-lg bg-white">
            <div className="font-medium text-green-700">🔥 오늘 바로 배정</div>
            <p className="text-sm text-gray-600">이 페이지는 항상 오늘 바로 배정으로 작동합니다. 생성된 경기는 즉시 배정됩니다.</p>
          </div>
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
            onClick={() => {
              if (isManualMode) {
                const incomplete = matches.some(m => !m.team1?.player1 || !m.team1?.player2 || !m.team2?.player1 || !m.team2?.player2);
                if (incomplete) {
                  alert('모든 회차의 4명 슬롯을 채워주세요.');
                  return;
                }
              }
              onAssignMatches();
            }}
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
