const https = require('https');

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

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
  const userId = 'c664a224-4a60-4179-9594-e22c78cc57be';
  const res = await request('PUT', `/auth/v1/admin/users/${userId}`, {
    password: 'bad123!',
    email_confirm: true,
    user_metadata: { test_raw: true },
  });
  console.log(JSON.stringify(res, null, 2));
})();
