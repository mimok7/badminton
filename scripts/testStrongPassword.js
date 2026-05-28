const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzgxMDYsImV4cCI6MjA2ODIxNDEwNn0.rwVKBc2mwY6SVeFhM3N5N5xOLEdFyXdveuqtVHmHxIE';
const supabase = createClient('https://htniaydnybggrdbylswa.supabase.co', ANON_KEY);

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'htniaydnybggrdbylswa.supabase.co',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    };

    if (body) {
      const raw = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(raw);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const usersRes = await request('GET', '/auth/v1/admin/users?per_page=1');
  const user = usersRes.data.users[0];
  console.log('target', user.email);

  const updateRes = await request('PUT', `/auth/v1/admin/users/${user.id}`, {
    password: 'Bad123!!',
    email_confirm: true,
    user_metadata: { test_strong: true },
  });
  console.log('update', JSON.stringify(updateRes, null, 2));

  const login = await supabase.auth.signInWithPassword({
    email: user.email,
    password: 'Bad123!!',
  });
  console.log('login', JSON.stringify({
    user: login.data.user ? { email: login.data.user.email } : null,
    error: login.error,
  }, null, 2));
})();
