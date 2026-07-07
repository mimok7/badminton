const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function check() {
  const { data, error } = await supabase
    .from('attendances')
    .select('*')
    .limit(1);
  console.log("Error:", error);
  console.log("Columns present in return:", data ? Object.keys(data[0] || {}) : null);
}

check();
