// 프로필에 이메일 추가 및 Auth와 연결
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

async function setupAuthConnection() {
  console.log('🔗 프로필에 이메일 추가 및 Auth와 연결\n');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. 프로필 조회
    console.log('📋 [1] 프로필 사용자 조회 중...\n');
    
    const profileRes = await makeRequest('GET', '/rest/v1/profiles?select=id,full_name,username');
    
    if (profileRes.status !== 200) {
      console.error('❌ 프로필 조회 실패');
      return;
    }

    const profiles = profileRes.data;
    console.log(`✅ 총 ${profiles.length}명의 프로필 조회됨\n`);

    // 2. 각 프로필에 이메일 추가
    console.log('📧 [2] 프로필에 이메일 추가 및 Auth와 연결 중...\n');
    
    let emailAdded = 0;
    let authConnected = 0;
    let failed = 0;

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const email = `${profile.username}@badminton.local`;
      
      // 프로필 업데이트 (이메일 추가)
      const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${profile.id}`, {
        email: email
      });

      if (updateRes.status === 200 || updateRes.status === 204) {
        console.log(`✅ ${String(i + 1).padStart(2, '0')} | ${profile.full_name}: ${email}`);
        emailAdded++;
      } else {
        console.log(`❌ ${String(i + 1).padStart(2, '0')} | ${profile.full_name} (실패)`);
        failed++;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n📊 결과:\n');
    console.log(`   ✅ 이메일 추가: ${emailAdded}명`);
    console.log(`   ❌ 실패: ${failed}명\n`);

    console.log('='.repeat(70));
    console.log('\n💡 다음 단계:\n');
    console.log('1️⃣  로그인 페이지에서 username으로도 로그인 가능하도록 수정');
    console.log('2️⃣  또는 사용자에게 임시 비밀번호와 함께 이메일 전송');
    console.log('3️⃣  또는 Supabase 웹 콘솔에서 수동으로 Auth 사용자 생성\n');

    console.log('🎯 추천: 커스텀 로그인 구현');
    console.log('   username 또는 email로 프로필 조회 → 비밀번호 검증 로직\n');

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

setupAuthConnection();
