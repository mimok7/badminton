"use client";

import React from 'react';
import { Match, Player } from '@/types';
import { cn } from '@/lib/utils';

interface MatchTableProps {
  matches: Match[];
  todayPlayers: Player[];
  myUserId: string | null;
}

export default function MatchTable({ matches, todayPlayers, myUserId }: MatchTableProps) {
  // 상세 디버깅을 위한 로그
  console.log("===== MatchTable Component =====");
  console.log("todayPlayers:", todayPlayers);
  console.log("matches[0]:", matches.length > 0 ? matches[0] : "No matches");
  console.log("================================");
  const getPlayerLabel = (player: { id: string, name?: string, skill_level?: string, skill_label?: string, skill_code?: string }) => {
    // 디버깅용 로그 - 플레이어 정보의 모든 필드 확인
    console.log("Player data in MatchTable:", JSON.stringify(player, null, 2));
    
    // 1단계: 플레이어 객체에 이름이 있는지 확인
    if (player && player.name && player.name.trim() !== '') {
      const shortLabel = player.skill_label ? player.skill_label.charAt(0).toUpperCase() : 
                         player.skill_code ? player.skill_code.charAt(0).toUpperCase() : 
                         player.skill_level ? player.skill_level.charAt(0).toUpperCase() : '';
      
      console.log(`Using existing name: ${player.name}, Label: ${shortLabel}`);
      return shortLabel ? `${player.name}(${shortLabel})` : player.name;
    }
    
    // 2단계: todayPlayers에서 ID로 선수 찾기
    // 여러 형태의 ID 비교를 시도 (문자열, UUID 형식 차이 등)
    const fullPlayer = todayPlayers.find(p => {
      const playerId = String(player.id || '').trim();
      const todayPlayerId = String(p.id || '').trim();
      
      return playerId === todayPlayerId ||
             playerId.replace(/-/g, '') === todayPlayerId.replace(/-/g, '') ||
             playerId.includes(todayPlayerId) ||
             todayPlayerId.includes(playerId);
    });
    
    // 찾은 선수 정보를 사용
    if (fullPlayer) {
      console.log("Found player in todayPlayers:", fullPlayer.name);
      
      if (!fullPlayer.name || fullPlayer.name.trim() === '') {
        console.warn("Player found but has no name:", fullPlayer);
      }
      
      // 찾은 선수 정보에서 이름과 레벨 라벨 사용
      const shortLabel = fullPlayer.skill_label ? fullPlayer.skill_label.charAt(0).toUpperCase() : 
                        fullPlayer.skill_code ? fullPlayer.skill_code.charAt(0).toUpperCase() : 
                        fullPlayer.skill_level ? fullPlayer.skill_level.charAt(0).toUpperCase() : '';
      
      return shortLabel ? `${fullPlayer.name}(${shortLabel})` : fullPlayer.name || `선수-${player.id.substring(0, 4)}`;
    } else {
      console.warn("Player not found in todayPlayers:", player.id);
      
      // 마지막 수단: ID에서 짧은 식별자 사용
      const shortId = player.id.substring(0, 4);
      return `선수-${shortId}`;
    }
  };

  // 전체 매치 배열 디버깅
  console.log('All matches data:', matches);
  if (matches.length > 0) {
    const firstMatch = matches[0];
    console.log('First match sample:', firstMatch);
    console.log('Team 1 player 1:', firstMatch.team1.player1);
    console.log('Team 1 player 2:', firstMatch.team1.player2);
  }
  
  return (
    <div className="mt-6">
      <h3 className="text-xl font-bold mb-2 text-center">경기 대진표</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3">코트</th>
              <th scope="col" className="px-4 py-3">팀 1</th>
              <th scope="col" className="px-4 py-3">팀 2</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => {
              const team1PlayerIds = [match.team1.player1.id, match.team1.player2.id];
              const team2PlayerIds = [match.team2.player1.id, match.team2.player2.id];
              const isMyMatch = myUserId && [...team1PlayerIds, ...team2PlayerIds].includes(myUserId);

              return (
                <tr key={index} className={cn("border-b", isMyMatch ? "bg-blue-100 font-semibold" : "bg-white")}>
                  <td className="px-4 py-3 text-center font-mono">{match.court}</td>
                  <td className="px-4 py-3">{getPlayerLabel(match.team1.player1)} / {getPlayerLabel(match.team1.player2)}</td>
                  <td className="px-4 py-3">{getPlayerLabel(match.team2.player1)} / {getPlayerLabel(match.team2.player2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

