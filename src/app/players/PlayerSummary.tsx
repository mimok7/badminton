import React from 'react';
import { Player } from '@/types';

interface PlayerSummaryProps {
  players: Player[];
}

const PlayerSummary: React.FC<PlayerSummaryProps> = ({ players }) => {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2">참가 선수 목록</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map((player) => (
          <div key={player.id} className="p-2 bg-gray-100 rounded text-sm">
            <span className="font-medium">{player.name}</span>
            {player.skill_label && (
              <span className="ml-2 text-gray-600">({player.skill_label})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayerSummary;
