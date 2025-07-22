'use client';

import React from 'react';
import { ExtendedPlayer, LEVEL_LABELS } from '../types';

interface AttendanceStatusProps {
  todayPlayers: ExtendedPlayer[] | null;
}

export default function AttendanceStatus({ todayPlayers }: AttendanceStatusProps) {
  if (todayPlayers === null) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600 text-lg">출석 데이터 로딩 중...</span>
      </div>
    );
  }

  if (todayPlayers.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 p-6 mb-8 rounded-r-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium">출석자가 없습니다</h3>
            <div className="mt-2 text-sm">
              <p>오늘 등록된 출석자가 없습니다.</p>
              <p>관리자에게 문의하거나 출석 체크를 먼저 진행해 주세요.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 레벨별 카운트 계산
  const levelCounts: Record<string, number> = {};
  const activePlayers = todayPlayers.filter(p => p.status === 'present');
  
  activePlayers.forEach(player => {
    const level = player.skill_level || 'n';
    const levelLabel = player.skill_label || LEVEL_LABELS[level] || 'E2 (초급)';
    levelCounts[levelLabel] = (levelCounts[levelLabel] || 0) + 1;
  });

  return (
    <div className="mb-6">
      {/* 출석자 요약 */}
      <div className="mb-4">
        <span className="font-semibold">오늘 출석자: </span>
        <span className="text-blue-600 font-bold">{todayPlayers.length}명</span>
      </div>

      {/* 레벨별 현황 */}
      <div className="mb-4">
        <div className="text-sm text-gray-700 mb-2">레벨별 현황:</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(levelCounts)
            .sort(([a], [b]) => {
              // 정렬 순서: 랍스터, 소갈비, 돼지갈비, 양갈비, 닭갈비, N
              const order = ['랍스터', '소갈비', '돼지갈비', '양갈비', '닭갈비', 'N (미지정)'];
              const indexA = order.indexOf(a);
              const indexB = order.indexOf(b);
              // 순서에 없는 항목은 맨 뒤로
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            })
            .map(([level, count]) => (
              <span key={level} className="bg-blue-50 text-blue-700 px-2 py-1 rounded border">
                {level}: {count}명
              </span>
            ))}
        </div>
      </div>

      {/* 출석 상태별 현황 */}
      <div className="flex gap-2 mb-3 text-sm">
        <div className="border rounded px-3 py-1 bg-green-50">
          <span className="font-medium">출석</span>: 
          <span className="ml-1 text-green-600 font-medium">{todayPlayers.filter(p => p.status === 'present').length}명</span>
        </div>
        <div className="border rounded px-3 py-1 bg-yellow-50">
          <span className="font-medium">레슨</span>: 
          <span className="ml-1 text-yellow-600 font-medium">{todayPlayers.filter(p => p.status === 'lesson').length}명</span>
        </div>
        <div className="border rounded px-3 py-1 bg-red-50">
          <span className="font-medium">불참</span>: 
          <span className="ml-1 text-red-600 font-medium">{todayPlayers.filter(p => p.status === 'absent').length}명</span>
        </div>
      </div>
      
      {/* 선수 목록 (간소화) */}
      <div className="mt-3 border rounded p-3 max-h-48 overflow-y-auto">
        <h4 className="font-semibold mb-2">선수 목록</h4>
        {todayPlayers.map((player, index) => (
          <div key={player.id} className="flex justify-between items-center py-1 border-b last:border-b-0">
            <span className="text-sm">
              {index + 1}. {player.name} ({player.skill_label})
            </span>
            <span className={`text-xs px-2 py-1 rounded ${
              player.status === 'present' ? 'bg-green-100 text-green-800' :
              player.status === 'lesson' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {player.status === 'present' ? '출석' : player.status === 'lesson' ? '레슨' : '불참'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
