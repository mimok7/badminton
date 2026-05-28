const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://htniaydnybggrdbylswa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzgxMDYsImV4cCI6MjA2ODIxNDEwNn0.rwVKBc2mwY6SVeFhM3N5N5xOLEdFyXdveuqtVHmHxIE'
);

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: '136@sujibad.com',
    password: 'bad123!'
  });

  console.log('data:', JSON.stringify(data, null, 2));
  console.log('error:', JSON.stringify(error, null, 2));
})();
