const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function main() {
  const email = `test_${Date.now()}@badminton.local`;
  const password = 'bad123!';

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test: true },
  });

  console.log(JSON.stringify({ data, error }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
