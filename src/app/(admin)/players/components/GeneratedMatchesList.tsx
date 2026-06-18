'use client';

import React from 'react';
import { Match } from '@/types';
import { getLevelScoreFromCode, type LevelInfoMap } from '@/lib/level-info';

interface GeneratedMatchesListProps {
  matches: Match[];
  playerGameCounts: Record<string, number>;
  levelInfoMap?: LevelInfoMap;
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
  levelInfoMap = {},
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
      return `${player.name}(${level.toUpperCase()}) ${getAccuratePlayerScore(player).toFixed(1)}점`;
    }
    return String(player);
  };

  const getAccuratePlayerScore = (player: any) => {
    if (!player || typeof player !== 'object') {
      return 0;
    }

    if (typeof player.score === 'number' && Number.isFinite(player.score)) {
      return player.score;
    }

    const skillLevel = String(player.skill_level || 'E2');
    return getLevelScoreFromCode(levelInfoMap, skillLevel, 0);
  };

  const getAccurateTeamScore = (team: any) => {
    if (!team?.player1 || !team?.player2) {
      return 0;
    }

    return getAccuratePlayerScore(team.player1) + getAccuratePlayerScore(team.player2);
  };

  const matchScoreDiffs = matches.map((match) => {
    const team1Score = getAccurateTeamScore(match.team1);
    const team2Score = getAccurateTeamScore(match.team2);
    return {
      matchId: match.id || '',
      team1Score,
      team2Score,
      diff: Math.abs(team1Score - team2Score),
    };
  });

  const maxScoreDiff = matchScoreDiffs.length > 0
    ? Math.max(...matchScoreDiffs.map((item) => item.diff))
    : 0;

  const averageScoreDiff = matchScoreDiffs.length > 0
    ? matchScoreDiffs.reduce((sum, item) => sum + item.diff, 0) / matchScoreDiffs.length
    : 0;
  const playerCountEntries = Object.entries(playerGameCounts);
  const averageGameCount = playerCountEntries.length > 0
    ? Object.values(playerGameCounts).reduce((sum, count) => sum + count, 0) / playerCountEntries.length
    : 0;

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
    return presentPlayers
      .filter((player) => !selectedIds.has(player.id))
      .slice()
      .sort((left, right) => {
        const scoreDiff = getAccuratePlayerScore(right) - getAccuratePlayerScore(left);
        if (Math.abs(scoreDiff) > 0.0001) {
          return scoreDiff;
        }

        const nameDiff = (left.name || '').localeCompare(right.name || '', 'ko', { sensitivity: 'base' });
        if (nameDiff !== 0) {
          return nameDiff;
        }

        return String(left.id || '').localeCompare(String(right.id || ''), 'ko', { sensitivity: 'base' });
      });
  };

  return (
    <div className="mt-6">
      {/* 경기 목록 테이블 */}
      <h3 className="text-lg font-semibold mb-3">
        {isManualMode ? '✋ 수동 배정 - 선수 선택' : '생성된 경기'} ({matches.length}경기)
      </h3>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
          평균 팀 점수 차이: <span className="font-bold">{averageScoreDiff.toFixed(1)}점</span>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          최대 팀 점수 차이: <span className="font-bold">{maxScoreDiff.toFixed(1)}점</span>
        </div>
      </div>
      <div className="overflow-x-auto mb-6">
        <table className="w-full border-collapse border border-gray-300 bg-white">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">회차</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">라켓팀</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">셔틀팀</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-semibold text-sm">점수 차이</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => {
              const scoreDiffEntry = matchScoreDiffs[index];
              const isWorstMatch = scoreDiffEntry && scoreDiffEntry.diff === maxScoreDiff && maxScoreDiff > 0;

              return (
              <tr
                key={match.id || `match-${index}`}
                className={`${isWorstMatch ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-gray-50'}`}
              >
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
                                {match.team1.player1.name} ({(match.team1.player1.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(match.team1.player1).toFixed(1)}점
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(p).toFixed(1)}점
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
                                {match.team1.player2.name} ({(match.team1.player2.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(match.team1.player2).toFixed(1)}점
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(p).toFixed(1)}점
                              </option>
                            ))}
                          </select>
                        </div>
                        {(match.team1?.player1 || match.team1?.player2) && (
                          <div className="text-xs font-bold text-blue-600 whitespace-nowrap px-2">
                            ({getAccurateTeamScore(match.team1).toFixed(1)})
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
                                {match.team2.player1.name} ({(match.team2.player1.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(match.team2.player1).toFixed(1)}점
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(p).toFixed(1)}점
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
                                {match.team2.player2.name} ({(match.team2.player2.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(match.team2.player2).toFixed(1)}점
                              </option>
                            )}
                            {getAvailablePlayers(match).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({(p.skill_level || '').toUpperCase()}) {getAccuratePlayerScore(p).toFixed(1)}점
                              </option>
                            ))}
                          </select>
                        </div>
                        {(match.team2?.player1 || match.team2?.player2) && (
                          <div className="text-xs font-bold text-red-600 whitespace-nowrap px-2">
                            ({getAccurateTeamScore(match.team2).toFixed(1)})
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={`border border-gray-300 px-2 py-2 text-center text-xs font-semibold ${isWorstMatch ? 'text-rose-700' : 'text-gray-700'}`}>
                      {scoreDiffEntry.diff.toFixed(1)}점
                      {isWorstMatch && (
                        <div className="mt-1 text-[11px] font-medium text-rose-600">최대 편차</div>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border border-gray-300 px-2 py-2 text-center text-blue-600 text-xs">
                      {getPlayerName(match.team1.player1)}, {getPlayerName(match.team1.player2)}
                      <span className="text-xs text-gray-500 ml-2">({getAccurateTeamScore(match.team1).toFixed(1)})</span>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center text-red-600 text-xs">
                      {getPlayerName(match.team2.player1)}, {getPlayerName(match.team2.player2)}
                      <span className="text-xs text-gray-500 ml-2">({getAccurateTeamScore(match.team2).toFixed(1)})</span>
                    </td>
                    <td className={`border border-gray-300 px-2 py-2 text-center text-xs font-semibold ${isWorstMatch ? 'bg-rose-100 text-rose-700' : 'text-gray-700'}`}>
                      {scoreDiffEntry.diff.toFixed(1)}점
                      {isWorstMatch && (
                        <div className="mt-1 text-[11px] font-medium text-rose-600">최대 편차</div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* 1인당 게임수 표시 */}
      {playerCountEntries.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold mb-3">1인당 총 게임수</h4>
          <div className="bg-gray-50 p-4 rounded border">
            <div className="grid gap-2 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', justifyContent: 'start' }}>
              {playerCountEntries
                .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'ko', { sensitivity: 'base' })) // 한글 사전(ㄱㄴㄷ) 순 정렬
                .map(([playerName, gameCount]) => (
                  <div key={playerName} className="flex justify-between bg-white p-2 rounded border" style={{ width: '120px', minWidth: '120px' }}>
                    <span className="truncate mr-2 font-medium">{playerName}</span>
                    <span className={`flex-shrink-0 font-bold ${gameCount > averageGameCount ? 'text-xl text-red-600' : 'text-blue-600'}`}>{gameCount}</span>
                  </div>
                ))}
            </div>
            <div className="mt-3 text-xs text-gray-600">
              <div className="flex flex-wrap gap-4">
                <span>총 선수: {playerCountEntries.length}명</span>
                <span>총 경기: {matches.length}경기</span>
                <span>평균 경기수: {averageGameCount.toFixed(1)}경기/인</span>
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
