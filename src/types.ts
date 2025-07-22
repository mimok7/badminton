// 출석 상태 타입 정의
export type AttendanceStatus = 'present' | 'lesson' | 'absent';

export interface Player {
  id: string;
  name: string;
  skill_level: string;
  skill_label: string;
  gender?: 'M' | 'F' | 'O' | string;
  skill_code: string;
}

// Player에 출석 상태를 추가한 확장 인터페이스
export interface ExtendedPlayer extends Player {
  status: AttendanceStatus;
}

export interface Team {
  player1: Player;
  player2: Player;
}

export interface Match {
  id: string; // 경기 ID 추가
  court: number;
  team1: Team;
  team2: Team;
}

export interface MatchResult {
  id: string;
  match_id: string;
  winner_team1: boolean;
  team1_score: number;
  team2_score: number;
  created_at: string;
}

// ... 기타 타입 ...

export interface AdminUser {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  role: string;
  skill_level: string;
  skill_label?: string;
  gender?: string;
  created_at: string;
}

