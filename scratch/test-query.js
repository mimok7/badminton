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
  const { data: schedules } = await supabase
    .from('match_schedules')
    .select('id, match_date, schedule_source, description, status');
  
  console.log('--- ALL SCHEDULES ---');
  console.log(schedules);

  for (const s of schedules || []) {
    const { count } = await supabase
      .from('match_participants')
      .select('*', { count: 'exact', head: true })
      .eq('match_schedule_id', s.id);
    
    const { count: regCount } = await supabase
      .from('match_participants')
      .select('*', { count: 'exact', head: true })
      .eq('match_schedule_id', s.id)
      .eq('status', 'registered');

    const { count: attCount } = await supabase
      .from('match_participants')
      .select('*', { count: 'exact', head: true })
      .eq('match_schedule_id', s.id)
      .eq('status', 'attended');

    console.log(`Schedule: ${s.match_date} (${s.description}) - ID: ${s.id}`);
    console.log(`  Total Participants: ${count}, Registered: ${regCount}, Attended: ${attCount}`);
  }

  const { data: attendances } = await supabase
    .from('attendances')
    .select('id, user_id, status, attended_at');
  
  console.log('--- ALL ATTENDANCES ---');
  console.log(attendances);
}

run();
