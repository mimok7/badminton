export type AttendanceStatus = 'present' | 'lesson' | 'absent';

export interface ExtendedPlayer {
  id: string;
  name: string;
  skill_level: string;
  skill_label: string;
  gender: string;
  skill_code: string;
  status: AttendanceStatus;
}

export interface MatchSession {
  id: string;
  session_name: string;
  session_date: string;
  status: string;
  total_matches: number;
  assigned_matches: number;
  created_at: string;
}

export interface GeneratedMatch {
  id: string;
  session_id: string;
  match_number: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  team1_player1: {
    name: string;
    skill_level: string;
  };
  team1_player2: {
    name: string;
    skill_level: string;
  };
  team2_player1: {
    name: string;
    skill_level: string;
  };
  team2_player2: {
    name: string;
    skill_level: string;
  };
  is_scheduled: boolean;
}

export interface AvailableDate {
  date: string;
  schedules: any[];
  totalCapacity: number;
  currentParticipants: number;
  availableSlots: number;
  location: string;
  timeRange: string;
}

export const LEVEL_LABELS: Record<string, string> = {
  a1: 'A1 (최상급)',
  a2: 'A2 (최상급)',
  b1: 'B1 (상급)',
  b2: 'B2 (상급)',
  c1: 'C1 (중상급)',
  c2: 'C2 (중상급)',
  d1: 'D1 (중급)',
  d2: 'D2 (중급)',
  e1: 'E1 (초급)',
  e2: 'E2 (초급)',
};
