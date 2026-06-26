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

async function checkPolicies() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'match_schedules' });
  if (error) {
    // If RPC doesn't exist, let's query pg_policies directly
    const { data: policies, error: dbError } = await supabase.from('pg_policies').select('*').eq('tablename', 'match_schedules');
    console.log('Policies for match_schedules:', policies);
    if (dbError) {
      console.error('Cannot read pg_policies directly (maybe REST API does not expose it):', dbError);
    }
  } else {
    console.log(data);
  }
}

checkPolicies();
