const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
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

const plainNames = [
  '차송운', '박기욱', '이태훈', '서민희', '용현정', 
  '최서연', '유성준', '전철민', '박소영', '이우성', 
  '한지윤', '황규연', '최원정', '양연욱', '박복균', 
  '주성모', '여현서', '김형준', '이민석', '김성곤'
];

async function run() {
  const date = '2026-07-29';
  console.log(`Starting registration for ${date}...\n`);
  
  // 1. Get today's schedules
  const { data: schedules } = await supabase
    .from('match_schedules')
    .select('id')
    .eq('match_date', date)
    .eq('status', 'scheduled');
    
  if (!schedules || schedules.length === 0) {
    console.error('No scheduled match found for ' + date);
    return;
  }
  const scheduleId = schedules[0].id;
  console.log('Target schedule ID:', scheduleId);
  
  // 2. Get profile IDs
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', plainNames);
    
  if (!profiles || profiles.length === 0) {
    console.error('No profiles found');
    return;
  }
  
  console.log(`Found ${profiles.length} profiles.`);
  
  // 3. Upsert match_participants
  const participantsData = profiles.map(p => ({
    match_schedule_id: scheduleId,
    user_id: p.id,
    status: 'registered',
    registered_at: new Date().toISOString()
  }));
  
  const { error: partErr } = await supabase
    .from('match_participants')
    .upsert(participantsData, { onConflict: 'match_schedule_id,user_id' });
    
  if (partErr) {
    console.error('Error inserting participants:', partErr);
  } else {
    console.log('Successfully inserted participants!');
  }
  
  // 4. Upsert attendances
  const attendancesData = profiles.map(p => ({
    user_id: p.id,
    attended_at: date,
    status: 'present',
    match_schedule_id: scheduleId,
    updated_at: new Date().toISOString()
  }));
  
  const { error: attErr } = await supabase
    .from('attendances')
    .upsert(attendancesData, { onConflict: 'user_id,attended_at' });
    
  if (attErr) {
    console.error('Error inserting attendances:', attErr);
  } else {
    console.log('Successfully inserted attendances!');
  }
}

run();
