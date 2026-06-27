const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function check() {
  const userId = 'c664a224-4a60-4179-9594-e22c78cc57be';
  const myProfileId = userId;
  const participantIds = [userId];
  
  const participantMatchFilter = participantIds
    .map((participantId) =>
      [
        `team1_player1_id.eq.${participantId}`,
        `team1_player2_id.eq.${participantId}`,
        `team2_player1_id.eq.${participantId}`,
        `team2_player2_id.eq.${participantId}`,
      ].join(',')
    )
    .join(',');

  const { data: completedMatches, error: completedError } = await supabase
    .from('generated_matches')
    .select(`
      id,
      match_number,
      match_result,
      status,
      team1_player1:profiles!team1_player1_id(id, user_id, username, full_name, coin_balance, skill_level),
      team1_player2:profiles!team1_player2_id(id, user_id, username, full_name, coin_balance, skill_level),
      team2_player1:profiles!team2_player1_id(id, user_id, username, full_name, coin_balance, skill_level),
      team2_player2:profiles!team2_player2_id(id, user_id, username, full_name, coin_balance, skill_level),
      match_sessions(session_date)
    `)
    .or(participantMatchFilter)
    .eq('status', 'completed')
    .not('match_result', 'is', null)
    .order('match_number', { ascending: false });

  if (completedError) {
    console.error(completedError);
    return;
  }

  const records = [];

  completedMatches.forEach((match) => {
    try {
      if (!match.match_result) return;

      const result = match.match_result;
      const session = Array.isArray(match.match_sessions) ? match.match_sessions[0] : match.match_sessions;
      const sessionDate = session?.session_date || new Date().toISOString().split('T')[0];
      
      const team1_player1 = Array.isArray(match.team1_player1) ? match.team1_player1[0] : match.team1_player1;
      const team1_player2 = Array.isArray(match.team1_player2) ? match.team1_player2[0] : match.team1_player2;
      const team2_player1 = Array.isArray(match.team2_player1) ? match.team2_player1[0] : match.team2_player1;
      const team2_player2 = Array.isArray(match.team2_player2) ? match.team2_player2[0] : match.team2_player2;

      const isTeam1 = team1_player1?.id === myProfileId || team1_player2?.id === myProfileId;
      const myTeamWon = (isTeam1 && result.winner === 'team1') || (!isTeam1 && result.winner === 'team2');

      const team1Players = [team1_player1, team1_player2].filter(Boolean);
      const team2Players = [team2_player1, team2_player2].filter(Boolean);

      let teammates = [];
      let opponents = [];

      if (isTeam1) {
        teammates = team1Players;
        opponents = team2Players;
      } else {
        teammates = team2Players;
        opponents = team1Players;
      }

      const getPlayerNames = (players) => 
        players
          .filter(p => p && p.user_id !== userId) // 나 제외
          .map(p => `${p.username || p.full_name || '미정'}(${p.coin_balance})`);

      records.push({
        id: String(match.id),
        matchNumber: match.match_number,
        date: sessionDate,
        result: myTeamWon ? 'win' : 'loss',
        score: result.score || '',
        teammates: getPlayerNames(teammates),
        opponents: getPlayerNames(opponents),
        isUserTeam1: isTeam1
      });
    } catch (error) {
      console.error("Match error:", match.id, error);
    }
  });

  console.log("Records length:", records.length);
  console.log("Records:", JSON.stringify(records, null, 2));
}

check();
