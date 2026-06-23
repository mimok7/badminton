// 프로필 사용자를 Auth에 생성하고 연결
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

async function linkAuthToProfiles() {
  console.log('🔗 프로필 사용자를 Auth에 생성하고 연결\n');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. 프로필 조회
    console.log('📋 [1] 프로필 사용자 조회 중...\n');
    
    const profileRes = await makeRequest('GET', '/rest/v1/profiles?select=id,full_name,username,email,user_id');
    
    if (profileRes.status !== 200) {
      console.error('❌ 프로필 조회 실패');
      return;
    }

    const profiles = profileRes.data;
    console.log(`✅ 총 ${profiles.length}명의 프로필 조회됨\n`);

    // 2. 각 프로필에 대해 Auth 사용자 생성
    console.log('👤 [2] Auth 사용자 생성 및 연결 중...\n');
    
    let created = 0;
    let linked = 0;
    let failed = 0;

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      
      // 이미 user_id가 있으면 스킵
      if (profile.user_id) {
        console.log(`⏭️  ${String(i + 1).padStart(2, '0')} | ${profile.full_name} (이미 연결됨)`);
        linked++;
        continue;
      }

      // 이메일 생성 (없으면 생성)
      const email = profile.email || `${profile.username}@badminton.club`;
      
      // 임시 비밀번호 생성 (username 기반)
      const tempPassword = `BadmintonClub${profile.username}@2026`;

      // Auth 사용자 생성
      const createRes = await makeRequest('POST', '/auth/v1/admin/users', {
        email: email,
        password: tempPassword,
        email_confirm: true,  // 자동으로 이메일 인증 완료
        user_metadata: {
          full_name: profile.full_name,
          username: profile.username
        }
      });

      if (createRes.status === 201) {
        const authUserId = createRes.data.user.id;
        
        // 프로필의 user_id 업데이트
        const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${profile.id}`, {
          user_id: authUserId,
          email: email
        });

        if (updateRes.status === 200 || updateRes.status === 204) {
          console.log(`✅ ${String(i + 1).padStart(2, '0')} | ${profile.full_name} (${email})`);
          created++;
        } else {
          console.log(`⚠️  ${String(i + 1).padStart(2, '0')} | ${profile.full_name} (Auth는 생성, 프로필 연결 실패)`);
          failed++;
        }
      } else {
        console.log(`❌ ${String(i + 1).padStart(2, '0')} | ${profile.full_name} (실패)`);
        if (createRes.data.error_description) {
          console.log(`   → ${createRes.data.error_description}`);
        }
        failed++;
      }

      // API 속도 제한 방지
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n📊 결과:\n');
    console.log(`   ✅ 생성됨: ${created}명`);
    console.log(`   🔗 이미 연결됨: ${linked}명`);
    console.log(`   ❌ 실패: ${failed}명`);
    console.log(`   📈 총합: ${created + linked + failed}/${profiles.length}\n`);

    // 3. 최종 확인
    console.log('='.repeat(70));
    console.log('\n✅ [3] 최종 연결 상태 확인\n');

    const finalRes = await makeRequest('GET', '/rest/v1/profiles?user_id=not.is.null&select=count()');
    const connectedCount = finalRes.data[0]?.count || 0;

    console.log(`🔗 Auth와 연결된 프로필: ${connectedCount}/${profiles.length}명`);

    if (connectedCount === profiles.length) {
      console.log('\n🎉 모든 프로필이 Auth와 연결되었습니다!');
      console.log('✅ 사용자들이 이제 로그인할 수 있습니다.\n');
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

linkAuthToProfiles();
