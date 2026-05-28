const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzgxMDYsImV4cCI6MjA2ODIxNDEwNn0.rwVKBc2mwY6SVeFhM3N5N5xOLEdFyXdveuqtVHmHxIE'
);

(async () => {
  const email = `signup_${Date.now()}@badminton.local`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: 'bad123!'
  });
  console.log(JSON.stringify({ data, error }, null, 2));
})();
