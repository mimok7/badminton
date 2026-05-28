// Auth 사용자 생성 테스트 (에러 메시지 출력)
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
          resolve({ status: res.statusCode, data: parsed, rawData: data });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, rawData: data });
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

async function testAuthCreation() {
  console.log('🧪 Auth 사용자 생성 테스트\n');

  try {
    const testEmail = `test_user_${Date.now()}@badminton.club`;
    const testPassword = 'TestPassword123@2026';

    console.log(`📧 테스트 이메일: ${testEmail}`);
    console.log(`🔐 테스트 비밀번호: ${testPassword}\n`);

    console.log('🔗 /auth/v1/admin/users로 POST 요청 중...\n');

    const res = await makeRequest('POST', '/auth/v1/admin/users', {
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: '테스트 사용자'
      }
    });

    console.log(`상태 코드: ${res.status}`);
    console.log(`\n응답 데이터:`);
    console.log(JSON.stringify(res.data, null, 2));
    
    if (res.rawData) {
      console.log(`\n원본 응답:\n${res.rawData}`);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

testAuthCreation();
