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

async function checkGetQuery() {
  const { data, error } = await supabase
    .from('match_wager_proposals')
    .select('*, profiles!proposed_by(name)')
    .eq('match_id', 577)
    .single();
  if (error) {
    console.error('Error fetching GET query:', error);
  } else {
    console.log('Query result:', data);
  }
}

checkGetQuery();
