const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function check() {
  const { data, error } = await supabase
    .from('generated_matches')
    .select('*')
    .eq('status', 'completed')
    .limit(5);
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}

check();
