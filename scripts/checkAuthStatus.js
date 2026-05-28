// Supabase 인증 시스템과 프로필 연결 상태 확인
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

async function checkAuthStatus() {
  console.log('🔍 Supabase 인증 및 프로필 연결 상태 확인\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. auth.users 조회
    console.log('👤 [1] Auth Users 확인\n');
    
    const authRes = await makeRequest('GET', '/auth/v1/admin/users');
    
    if (authRes.status === 200) {
      const authUsers = authRes.data.users || [];
      console.log(`✅ 인증된 사용자: ${authUsers.length}명\n`);
      
      if (authUsers.length > 0) {
        console.log('   샘플 사용자:');
        authUsers.slice(0, 3).forEach(user => {
          console.log(`   • ${user.email} (ID: ${user.id.substring(0, 8)}...)`);
        });
      }
    } else {
      console.log(`❌ Auth 조회 실패 (상태: ${authRes.status})`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 2. profiles 테이블 확인
    console.log('📋 [2] Profiles 테이블 확인\n');
    
    const profileRes = await makeRequest('GET', '/rest/v1/profiles?select=id,user_id,full_name,email,role&limit=10');
    
    if (profileRes.status === 200) {
      const profiles = profileRes.data;
      console.log(`✅ 프로필 레코드: ${profiles.length}개 (샘플)\n`);
      
      if (profiles.length > 0) {
        console.log('   샘플 프로필:');
        profiles.forEach(p => {
          const hasAuth = p.user_id ? '✅' : '❌';
          console.log(`   ${hasAuth} ${p.full_name} (user_id: ${p.user_id ? p.user_id.substring(0, 8) + '...' : '없음'})`);
        });
      }
    } else {
      console.log(`❌ 프로필 조회 실패 (상태: ${profileRes.status})`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 3. 연결 상태 분석
    console.log('🔗 [3] 연결 상태 분석\n');
    
    const allProfilesRes = await makeRequest('GET', '/rest/v1/profiles?select=id,user_id&count=exact');
    const connectedRes = await makeRequest('GET', '/rest/v1/profiles?user_id=not.is.null&select=count()');
    const disconnectedRes = await makeRequest('GET', '/rest/v1/profiles?user_id=is.null&select=count()');

    const totalProfiles = allProfilesRes.data[0]?.count || allProfilesRes.data.length || 0;
    const connected = connectedRes.data[0]?.count || 0;
    const disconnected = disconnectedRes.data[0]?.count || 0;

    console.log(`📊 연결 상태:`);
    console.log(`   • 총 프로필: ${totalProfiles}명`);
    console.log(`   • Auth 연결됨: ${connected}명 ✅`);
    console.log(`   • Auth 미연결: ${disconnected}명 ❌`);

    if (disconnected > 0) {
      console.log(`\n⚠️  ${disconnected}명의 프로필이 Auth와 연결되지 않았습니다.`);
      console.log(`   이들은 로그인할 수 없습니다.`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📌 현재 상태:\n');

    if (authRes.status === 200) {
      const authCount = authRes.data.users ? authRes.data.users.length : 0;
      console.log(`   • Auth 사용자: ${authCount}명`);
      console.log(`   • 프로필 사용자: ${totalProfiles}명`);
      
      if (authCount === 0) {
        console.log(`\n❌ 문제: Auth에 사용자가 등록되지 않았습니다!`);
        console.log(`   프로필만 있고 로그인 정보가 없습니다.`);
        console.log(`\n💡 해결 방법:`);
        console.log(`   1. Auth 사용자 생성 스크립트 실행`);
        console.log(`   2. 또는 Supabase 웹 콘솔에서 수동 등록`);
      } else if (authCount === disconnected) {
        console.log(`\n⚠️  모든 프로필이 Auth와 미연결 상태입니다.`);
        console.log(`   프로필의 user_id를 Auth 사용자와 연결해야 합니다.`);
      } else if (connected === totalProfiles) {
        console.log(`\n✅ 모든 프로필이 Auth와 연결되었습니다!`);
        console.log(`   사용자들이 로그인할 수 있습니다.`);
      }
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

checkAuthStatus();
