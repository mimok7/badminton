const https = require('https');

const TEMP_PASSWORD = 'bad123!';
const PRIORITY_NAMES = ['김진호', '김성곤', '박희수', '이민석', '조영재'];

function sortProfiles(profiles) {
  return [...profiles].sort((a, b) => {
    const aPriority = PRIORITY_NAMES.includes(a.full_name) ? PRIORITY_NAMES.indexOf(a.full_name) : 999;
    const bPriority = PRIORITY_NAMES.includes(b.full_name) ? PRIORITY_NAMES.indexOf(b.full_name) : 999;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return (a.full_name || '').localeCompare(b.full_name || '');
  });
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'htniaydnybggrdbylswa.supabase.co',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo'}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo',
      },
    };

    if (body && method !== 'GET') {
      const rawBody = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(rawBody);
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
    if (body && method !== 'GET') {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log('🔗 Auth-프로필 동기화 시작...\n');

  const usersResponse = await makeRequest('GET', '/auth/v1/admin/users?per_page=100');
  if (usersResponse.status !== 200) {
    console.error('Auth 사용자 조회 실패:', usersResponse.data);
    process.exit(1);
  }

  const usersData = usersResponse.data;

  const profilesResponse = await makeRequest('GET', '/rest/v1/profiles?select=id,full_name,username,email,user_id&order=full_name.asc');
  if (profilesResponse.status !== 200) {
    console.error('프로필 조회 실패:', profilesResponse.data);
    process.exit(1);
  }

  const users = usersData.users || [];
  const profiles = sortProfiles(profilesResponse.data || []);
  const pairCount = Math.min(users.length, profiles.length);

  console.log(`Auth 사용자: ${users.length}명`);
  console.log(`프로필: ${profiles.length}명`);
  console.log(`연결 대상: ${pairCount}명\n`);

  let success = 0;
  let failed = 0;

  for (let index = 0; index < pairCount; index++) {
    const user = users[index];
    const profile = profiles[index];

    const authUpdateResponse = await makeRequest('PUT', `/auth/v1/admin/users/${user.id}`, {
      email: profile.email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: profile.full_name,
        username: profile.username,
        must_change_password: true,
      },
    });

    if (authUpdateResponse.status !== 200) {
      console.log(`❌ ${profile.full_name} / ${user.email}: ${JSON.stringify(authUpdateResponse.data)}`);
      failed++;
      continue;
    }

    const profileUpdateResponse = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${profile.id}`, {
      user_id: user.id,
      email: user.email,
    });

    if (profileUpdateResponse.status !== 200 && profileUpdateResponse.status !== 204) {
      console.log(`⚠️  ${profile.full_name}: Auth는 연결했지만 프로필 업데이트 실패 - ${JSON.stringify(profileUpdateResponse.data)}`);
      failed++;
      continue;
    }

    console.log(`✅ ${profile.full_name} -> ${profile.email}`);
    success++;
  }

  const unlinked = profiles.slice(pairCount);

  console.log('\n=== 요약 ===');
  console.log(`성공: ${success}명`);
  console.log(`실패: ${failed}명`);

  if (unlinked.length > 0) {
    console.log(`\n미연결 프로필 ${unlinked.length}명:`);
    unlinked.forEach((profile) => {
      console.log(`- ${profile.full_name} (${profile.username})`);
    });
  }

  console.log('\n설정 완료. 모든 연결된 계정의 초기 비밀번호는 bad123! 입니다.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
