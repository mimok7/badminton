'use client';

import React from 'react';
import { ExtendedPlayer } from '../types';

interface MatchGenerationControlsProps {
  todayPlayers: ExtendedPlayer[] | null;
  perPlayerMinGames: number;
  setPerPlayerMinGames: (games: number) => void;
  onGenerateByLevel: () => void;
  onGenerateRandom: () => void;
  onGenerateMixed: () => void;
  onManualAssign: () => void;
}

export default function MatchGenerationControls({
  todayPlayers,
  perPlayerMinGames,
  setPerPlayerMinGames,
  onGenerateByLevel,
  onGenerateRandom,
  onGenerateMixed,
  onManualAssign
}: MatchGenerationControlsProps) {
  if (!todayPlayers || todayPlayers.length === 0) {
    return null;
  }

  const presentPlayers = todayPlayers.filter(p => p.status === 'present').length;
  const expectedMatches = Math.ceil((presentPlayers * perPlayerMinGames) / 4);

  return (
    <div>
      {/* 1인당 경기수 설정 */}
      <div className="mb-4 p-4 bg-gray-50 rounded border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="font-medium text-gray-700">1인당 목표 경기수:</label>
          <input
            type="number"
            min="1"
            max="10"
            value={perPlayerMinGames}
            onChange={(e) => setPerPlayerMinGames(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
          />
          <span className="text-sm text-gray-600">경기</span>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          예상 총 경기수: {expectedMatches}경기 (전원 참여)
        </div>
      </div>

      {/* 경기 생성 버튼들 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">🎯 새로운 경기 일정 생성</h3>
        <p className="text-sm text-gray-600 mb-4">
          출석한 선수들로 경기를 생성합니다. 생성된 경기는 경기 일정에 추가되고, 
          <strong className="text-blue-600"> 경기 배정 관리</strong>에서 실제 진행할 경기를 선택할 수 있습니다.
        </p>
        
  {/* Tip and quick link removed as requested */}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <button 
            className="bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded font-medium transition-colors"
            onClick={onGenerateByLevel}
          >
            📊 레벨별 경기
          </button>
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded font-medium transition-colors"
            onClick={onGenerateRandom}
          >
            🎲 랜덤 경기
          </button>
          <button 
            className="bg-purple-500 hover:bg-purple-600 text-white py-3 px-4 rounded font-medium transition-colors"
            onClick={onGenerateMixed}
          >
            👫 혼합복식
          </button>
          <button 
            className="bg-orange-500 hover:bg-orange-600 text-white py-3 px-4 rounded font-medium transition-colors"
            onClick={onManualAssign}
          >
            ✋ 수동 배정
          </button>
        </div>
      </div>
    </div>
  );
}
