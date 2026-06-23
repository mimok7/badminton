// 프로필의 email 필드 확인
const https = require('https');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      }
    };

    if (body && method !== 'GET') {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body && method !== 'GET') {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function checkEmailField() {
  console.log('📧 프로필의 email 필드 확인\n');
  console.log('='.repeat(70) + '\n');

  try {
    const res = await makeRequest('GET', '/rest/v1/profiles?select=full_name,email,username&limit=10');
    
    if (res.status === 200) {
      console.log('샘플 프로필:');
      console.log('─'.repeat(70));
      
      res.data.forEach(p => {
        const email = p.email || '없음';
        console.log(`이름: ${p.full_name}`);
        console.log(`  └─ username: ${p.username}`);
        console.log(`  └─ email: ${email}`);
        console.log();
      });

      // 이메일이 있는지 없는지 통계
      const withEmail = res.data.filter(p => p.email).length;
      const withoutEmail = res.data.filter(p => !p.email).length;

      console.log('─'.repeat(70));
      console.log(`\n📊 통계 (샘플 10개):`);
      console.log(`   • 이메일 있음: ${withEmail}명`);
      console.log(`   • 이메일 없음: ${withoutEmail}명\n`);

    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

checkEmailField();
