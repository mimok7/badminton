const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val.length) acc[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRLS() {
  console.log('Using Service Role Key');
  const { data: schedules, error } = await supabase.from('match_schedules').select('*').not('generated_match_id', 'is', null).limit(5);
  console.log('Schedules with generated_match_id:', schedules?.length);
  if (error) console.error('Error fetching schedules:', error);
  
  console.log('Using Anon Key');
  const anonSupabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: anonSchedules, error: anonError } = await anonSupabase.from('match_schedules').select('*').not('generated_match_id', 'is', null).limit(5);
  console.log('Schedules fetched with anon key:', anonSchedules?.length);
  if (anonError) console.error('Anon Error:', anonError);
}

checkRLS();
