const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length > 0) {
    env[key.trim()] = val.join('=').trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const selectedScheduleId = '1cf44b26-7acf-4862-8e78-784226fd8ba9'; // tournament on 2026-07-29

  const { data: participants, error: participantsError } = await supabase
    .from('match_participants')
    .select('user_id, status')
    .eq('match_schedule_id', selectedScheduleId)
    .in('status', ['registered', 'attended']); // Wait, check if there are other statuses

  console.log('Participants for schedule:', participants);

  const userIds = Array.from(new Set((participants || []).map((row) => row.user_id).filter(Boolean)));
  console.log('User IDs:', userIds);

  if (userIds.length > 0) {
    const profileMatchFilter = userIds
      .map((userId) => `id.eq.${userId},user_id.eq.${userId}`)
      .join(',');

    const { data: profilesData, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id, username, full_name, skill_level')
      .or(profileMatchFilter);

    console.log('Profiles returned:', profilesData);
  }
}

run();
