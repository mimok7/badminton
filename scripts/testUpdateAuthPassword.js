const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'
);

async function main() {
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('listError', listError);
    return;
  }

  const firstUser = listData.users[0];
  console.log('target', firstUser.id, firstUser.email);

  const { data, error } = await supabase.auth.admin.updateUserById(firstUser.id, {
    password: 'bad123!',
    email_confirm: true,
  });

  console.log(JSON.stringify({ data, error }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
