const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: genMatches, error: e1 } = await supabase
      .from('generated_matches')
      .select('id, match_number, session_id')
      .in('id', [315, 316, 317]);

    console.log("Matching generated_matches for 315, 316, 317:", genMatches);

    // schedules 에 generated_match_id가 null이 아닌 데이터를 5개 조회
    const { data: schedules } = await supabase
      .from('match_schedules')
      .select('id, generated_match_id, match_date, status')
      .not('generated_match_id', 'is', null)
      .limit(5);
    console.log("Schedules with match_id sample:", schedules);

    if (schedules && schedules.length > 0) {
      const ids = schedules.map(s => s.generated_match_id);
      const { data: matchedGen } = await supabase
        .from('generated_matches')
        .select('id, match_number')
        .in('id', ids);
      console.log("Corresponding generated_matches:", matchedGen);
    }
  } catch(e) {
    console.error("Unexpected error:", e);
  }
}

check();
