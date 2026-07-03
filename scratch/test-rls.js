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
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Use anon key to test RLS!
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const selectedScheduleId = '1cf44b26-7acf-4862-8e78-784226fd8ba9';

  console.log('Testing with ANON KEY (simulating browser without login):');
  
  const { data: participants, error: pError } = await supabase
    .from('match_participants')
    .select('user_id')
    .eq('match_schedule_id', selectedScheduleId);
    
  console.log('Participants count:', participants ? participants.length : 0);
  if (pError) console.error('Participants error:', pError);

  if (participants && participants.length > 0) {
    const userIds = participants.map(p => p.user_id);
    const { data: profiles, error: prError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
      
    console.log('Profiles returned with anon key:', profiles ? profiles.length : 0);
    if (prError) console.error('Profiles error:', prError);
  }
}

run();
