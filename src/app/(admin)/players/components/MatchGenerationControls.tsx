'use client';

import React, { useState } from 'react';
import { ExtendedPlayer } from '../types';
import { Users, X, Info, Target } from 'lucide-react';

interface MatchGenerationControlsProps {
  todayPlayers: ExtendedPlayer[] | null;
  perPlayerMinGames: number;
  setPerPlayerMinGames: (games: number) => void;
  onGenerateByLevel: () => void;
  onGenerateRandom: () => void;
  onGenerateMixed: () => void;
  onManualAssign: () => void;
  assignTarget: 'attendees' | 'participants';
  setAssignTarget: (target: 'attendees' | 'participants') => void;
}

export default function MatchGenerationControls({
  todayPlayers,
  perPlayerMinGames,
  setPerPlayerMinGames,
  onGenerateByLevel,
  onGenerateRandom,
  onGenerateMixed,
  onManualAssign,
  assignTarget,
  setAssignTarget
}: MatchGenerationControlsProps) {
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);

  if (!todayPlayers || todayPlayers.length === 0) {
    return null;
  }

  const presentPlayersList = todayPlayers;
  const presentPlayers = presentPlayersList.length;
  const expectedMatches = Math.ceil((presentPlayers * perPlayerMinGames) / 4);

  return (
    <div>
      {/* 배정 대상 설정 */}
      <div className="mb-3 flex bg-slate-100 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setAssignTarget('attendees')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            assignTarget === 'attendees'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          출석자로 게임배정
        </button>
        <button
          type="button"
          onClick={() => setAssignTarget('participants')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            assignTarget === 'participants'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          참가자로 게임배정
        </button>
      </div>

      {/* 1인당 경기수 설정 */}
      <div className="mb-4 p-4 bg-gray-50 rounded border">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-500 shrink-0" />
            <label className="font-semibold text-gray-700 text-sm sm:text-base">1인당 목표 경기수:</label>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPerPlayerMinGames(val)}
                  className={`w-9 h-8 font-bold text-sm rounded-lg border transition-all ${
                    perPlayerMinGames === val
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
            <span className="text-sm font-medium text-gray-600 ml-0.5">경기</span>
          </div>

          <button
            type="button"
            onClick={() => setShowParticipantsModal(true)}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-2xs"
          >
            <Users className="h-4 w-4 text-indigo-500" />
            <span>참가자 ({presentPlayers}명)</span>
          </button>
        </div>
        
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <Info className="h-3.5 w-3.5 text-slate-400" />
          <span>예상 총 경기수: {expectedMatches}경기 (전원 참여)</span>
        </div>
      </div>

      {/* 참가자 팝업 모달 */}
      {showParticipantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-100 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">오늘의 참가 선수 목록</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="px-4 py-2 bg-slate-50 border-b text-xs font-semibold text-slate-500">
              참가자: {presentPlayers}명
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {presentPlayers === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">
                  현재 등록된 참가자가 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {presentPlayersList.map((player) => (
                    <div 
                      key={player.id} 
                      className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-center transition-all hover:bg-white hover:border-indigo-100 hover:shadow-2xs"
                    >
                      <div className="font-bold text-slate-800 text-xs truncate" title={player.name}>
                        {player.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {player.skill_label || player.skill_level}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="border-t p-3 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-xs"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 경기 생성 버튼들 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">🎯 새로운 경기 일정 생성</h3>
        <p className="text-sm text-gray-600 mb-4">
          참가자들로 경기를 생성합니다. 생성된 경기는 경기 일정에 추가되고, 
          <strong className="text-blue-600"> 경기 배정 관리</strong>에서 실제 진행할 경기를 선택할 수 있습니다.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            className="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 py-3 px-4 rounded-xl font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5"
            onClick={onManualAssign}
          >
            ✋ 수동 배정
          </button>
          <button 
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-3 px-4 rounded-xl font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5"
            onClick={onGenerateByLevel}
          >
            📊 레벨별 경기
          </button>
          <button 
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-3 px-4 rounded-xl font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5"
            onClick={onGenerateRandom}
          >
            🎲 랜덤 경기
          </button>
          <button 
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 py-3 px-4 rounded-xl font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5"
            onClick={onGenerateMixed}
          >
            👫 혼합복식
          </button>
        </div>
      </div>
    </div>
  );
}
