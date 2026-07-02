export interface ScheduledMatchView {
  id: string;
  generated_match_id: number | null;
  match_number?: number | null;
  description?: string | null;
  match_date: string | null;
  match_time: string | null;
  court_number: number | null;
  court_name?: string | null;
  location?: string | null;
  status: string;
  referee_id?: string | null;
  match_result?: {
    winner?: 'team1' | 'team2';
    score?: string;
    team1_score?: number;
    team2_score?: number;
    total_losing_pool?: number;
  } | null;
  team1_player1: string | null;
  team1_player2: string | null;
  team2_player1: string | null;
  team2_player2: string | null;
  team1_player1_name: string;
  team1_player2_name: string;
  team2_player1_name: string;
  team2_player2_name: string;
  team1_player1_skill_level?: string | null;
  team1_player2_skill_level?: string | null;
  team2_player1_skill_level?: string | null;
  team2_player2_skill_level?: string | null;
  team1_player1_skill_level_name?: string | null;
  team1_player2_skill_level_name?: string | null;
  team2_player1_skill_level_name?: string | null;
  team2_player2_skill_level_name?: string | null;
  team1_player1_coin_balance?: number | null;
  team1_player2_coin_balance?: number | null;
  team2_player1_coin_balance?: number | null;
  team2_player2_coin_balance?: number | null;
  team1_player1_gender?: string | null;
  team1_player2_gender?: string | null;
  team2_player1_gender?: string | null;
  team2_player2_gender?: string | null;
}

export async function fetchScheduledMatchesForDate(
  _supabase: unknown,
  date: string,
  userId?: string
): Promise<ScheduledMatchView[]> {
  const url = new URLSearchParams({ date });

  if (userId) {
    url.set('userId', userId);
  }

  const response = await fetch(`/api/scheduled-matches?${url.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load scheduled matches');
  }

  const payload = (await response.json().catch(() => null)) as { matches?: ScheduledMatchView[] } | null;
  return Array.isArray(payload?.matches) ? payload.matches : [];
}
