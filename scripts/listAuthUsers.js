// Auth 사용자 상세 정보 조회
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

async function listAuthUsers() {
  console.log('📋 Auth 사용자 상세 정보\n');
  console.log('='.repeat(70) + '\n');

  try {
    const authRes = await makeRequest('GET', '/auth/v1/admin/users?per_page=100');
    
    if (authRes.status === 200) {
      const users = authRes.data.users || [];
      
      console.log(`총 ${users.length}명의 Auth 사용자\n`);
      console.log('ID | 이메일 | 상태');
      console.log('-'.repeat(70));
      
      users.forEach((user, idx) => {
        const status = user.email_confirmed_at ? '✅ 인증' : '⏳ 미인증';
        console.log(`${String(idx + 1).padStart(2, '0')} | ${user.email.padEnd(30, ' ')} | ${status}`);
      });

      console.log('\n' + '='.repeat(70));
      console.log(`\n📝 참고:`);
      console.log(`   • 총 Auth 사용자: ${users.length}명`);
      console.log(`   • 이메일 형식: NNN@sujibad.com (NNN = 번호)`);
      console.log(`   • 프로필 사용자: 57명 (김진호, 김성곤, ... 등)`);
      console.log(`\n🔗 연결 방법:`);
      console.log(`   1️⃣  프로필의 user_id를 Auth 사용자 ID로 업데이트`);
      console.log(`   2️⃣  또는 프로필의 57명을 Auth에 새로 생성`);
      console.log(`\n💡 추천: 우선 57명을 Auth에 생성한 후 연결\n`);

    } else {
      console.log(`❌ Auth 조회 실패 (상태: ${authRes.status})`);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

listAuthUsers();
