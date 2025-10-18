'use client';

import React from 'react';

interface TeamBasedMatchGenerationProps {
  availableTeams: Array<{round: number; title?: string; racket: string[]; shuttle: string[]}>;
  selectedTeamRound: number | null;
  onTeamSelect: (round: number | null) => void;
  onGenerateMatches: () => void;
  perPlayerMinGames: number;
}

export default function TeamBasedMatchGeneration({
  availableTeams,
  selectedTeamRound,
  onTeamSelect,
  onGenerateMatches,
  perPlayerMinGames
}: TeamBasedMatchGenerationProps) {
  const selectedTeam = availableTeams.find(t => t.round === selectedTeamRound);

  return (
    <div className="mb-6 p-4 border border-green-300 rounded bg-green-50">
      <h3 className="text-lg font-semibold mb-3">👥 팀 구성 기반 경기 생성</h3>
      
      {availableTeams.length === 0 ? (
        <div className="text-sm text-gray-600">
          <p className="mb-2">오늘 생성된 팀 구성이 없습니다.</p>
          <p className="text-xs text-blue-600">
            💡 팀 구성은 <a href="/team-management" className="underline hover:text-blue-800">/team-management</a> 페이지에서 생성할 수 있습니다.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">
            오늘 생성된 팀 구성을 선택하여 경기를 생성합니다. 
            선택한 회차의 라켓팀과 셔틀팀 선수들이 번갈아가며 경기를 합니다.
          </p>

          {/* 팀 구성 선택 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              오늘 배정된 팀 구성 선택:
            </label>
            <select
              value={selectedTeamRound || ''}
              onChange={(e) => onTeamSelect(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">팀 구성 없이 생성 (일반 경기)</option>
              {availableTeams.map(team => (
                <option key={team.round} value={team.round}>
                  {team.round}회차{team.title ? ` - ${team.title}` : ''} 
                  (라켓팀 {team.racket.length}명, 셔틀팀 {team.shuttle.length}명)
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* 선택된 팀 정보 표시 */}
      {selectedTeam && (
        <div className="mb-4 p-3 bg-white rounded border">
          <h4 className="font-semibold mb-2">
            {selectedTeam.round}회차{selectedTeam.title ? ` - ${selectedTeam.title}` : ''}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-medium text-blue-600 mb-1">라켓팀 ({selectedTeam.racket.length}명)</div>
              <div className="flex flex-wrap gap-1">
                {selectedTeam.racket.map((player, idx) => (
                  <span key={idx} className="px-2 py-1 bg-blue-100 rounded text-xs">
                    {player}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium text-red-600 mb-1">셔틀팀 ({selectedTeam.shuttle.length}명)</div>
              <div className="flex flex-wrap gap-1">
                {selectedTeam.shuttle.map((player, idx) => (
                  <span key={idx} className="px-2 py-1 bg-red-100 rounded text-xs">
                    {player}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 경기 생성 버튼 */}
      {availableTeams.length > 0 && (
        <>
          <button
            onClick={onGenerateMatches}
            className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
          >
            {selectedTeamRound 
              ? `🏸 선택한 팀으로 경기 생성 (1인당 ${perPlayerMinGames}경기)`
              : `🏸 팀 구분 없이 경기 생성 (1인당 ${perPlayerMinGames}경기)`
            }
          </button>

          <div className="mt-2 text-xs text-gray-600">
            {selectedTeamRound 
              ? '💡 선택한 팀 구성의 선수들로 경기를 생성합니다.'
              : '💡 출석한 모든 선수를 대상으로 일반 경기를 생성합니다.'
            }
          </div>
        </>
      )}
    </div>
  );
}
