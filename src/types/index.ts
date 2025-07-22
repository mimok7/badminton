export interface Player {
  id: string;
  name: string;
  skill_level?: string;
  skill_label?: string;
  skill_code?: string;
  gender?: 'M' | 'F' | string;
}

export interface Team {
  player1: Player;
  player2: Player;
}

export interface Match {
  id?: string;
  court: number;
  team1: Team;
  team2: Team;
}

export interface MatchResult {
  userId: string;
  matchNo: number;
  win: boolean;
  score: string;
}

export interface MatchSession {
  id: string;
  session_date: string;
  session_name: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  total_matches: number;
  assigned_matches: number;
  created_at: string;
  created_by: string;
}

export interface GeneratedMatch {
  id: string;
  session_id: string;
  match_number: number;
  team1_player1_id: string;
  team1_player2_id: string;
  team2_player1_id: string;
  team2_player2_id: string;
  match_type: 'doubles' | 'mixed_doubles';
  team1_expected_score: number;
  team2_expected_score: number;
  created_at: string;
}

export interface MatchSchedule {
  id: string;
  generated_match_id: string;
  court_number: number;
  scheduled_time: string;
  scheduled_date: string;
  estimated_duration: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'postponed' | 'cancelled';
  assigned_at: string;
  assigned_by: string;
}

export interface MatchResultData {
  id: string;
  match_schedule_id: string;
  team1_score1: number;
  team1_score2: number;
  team1_score3?: number;
  team2_score1: number;
  team2_score2: number;
  team2_score3?: number;
  winner_team: 1 | 2;
  total_sets: number;
  match_duration?: number;
  started_at?: string;
  completed_at: string;
  recorded_by: string;
  notes?: string;
}
