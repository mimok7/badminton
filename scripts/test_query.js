const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function check() {
  // Use a known profile ID from the previous output: 'c664a224-4a60-4179-9594-e22c78cc57be'
  const participantId = 'c664a224-4a60-4179-9594-e22c78cc57be';
  const participantIds = [participantId];
  
  const participantMatchFilter = participantIds
    .map((pid) =>
      [
        `team1_player1_id.eq.${pid}`,
        `team1_player2_id.eq.${pid}`,
        `team2_player1_id.eq.${pid}`,
        `team2_player2_id.eq.${pid}`,
      ].join(',')
    )
    .join(',');

  console.log("Filter:", participantMatchFilter);

  const { data, error } = await supabase
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

  console.log("Error:", error);
  console.log("Data count:", data?.length);
  if (data?.length > 0) {
    console.log("First row:", JSON.stringify(data[0], null, 2));
  }
}

check();
