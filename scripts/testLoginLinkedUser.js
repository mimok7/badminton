const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzgxMDYsImV4cCI6MjA2ODIxNDEwNn0.rwVKBc2mwY6SVeFhM3N5N5xOLEdFyXdveuqtVHmHxIE'
);

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'kim_jinho@badminton.local',
    password: 'bad123!'
  });

  console.log(JSON.stringify({ user: data?.user ? {
    id: data.user.id,
    email: data.user.email,
    must_change_password: data.user.user_metadata?.must_change_password,
    username: data.user.user_metadata?.username,
  } : null, error }, null, 2));
})();
