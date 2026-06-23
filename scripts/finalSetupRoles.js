// Supabase SQL 직접 실행 (GraphQL을 통한 우회)
const https = require('https');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

const admins = ['김진호', '김성곤'];
const managers = ['박희수', '이민석', '조영재'];

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

async function setupRoles() {
  console.log('🔐 배드민턴 클럽 권한 체계 설정\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 먼저 모든 사용자 조회
    console.log('📋 [준비] 전체 사용자 조회 중...\n');
    
    const allUsersRes = await makeRequest('GET', '/rest/v1/profiles?select=id,full_name,role');
    
    if (allUsersRes.status !== 200) {
      console.error('❌ 사용자 조회 실패');
      return;
    }

    const allUsers = allUsersRes.data;
    const userMap = {};
    allUsers.forEach(u => {
      userMap[u.full_name] = u.id;
    });

    // 1. 관리자(admin) 권한 설정
    console.log('👨‍💼 [1] 관리자 권한 설정\n');
    
    let adminSuccess = 0;
    for (const fullName of admins) {
      if (!userMap[fullName]) {
        console.log(`  ❌ ${fullName} 찾지 못함`);
        continue;
      }

      const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${userMap[fullName]}`, { role: 'admin' });
      
      if (updateRes.status === 200 || updateRes.status === 204) {
        console.log(`  ✅ ${fullName} → admin`);
        adminSuccess++;
      } else {
        console.log(`  ❌ ${fullName} 실패 (상태: ${updateRes.status})`);
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 2. 매니저(manager) 권한 설정  
    console.log('👤 [2] 매니저 권한 설정 시도\n');
    
    let managerSuccess = 0;
    let managerFail = 0;
    
    for (const fullName of managers) {
      if (!userMap[fullName]) {
        console.log(`  ❌ ${fullName} 찾지 못함`);
        continue;
      }

      const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${userMap[fullName]}`, { role: 'manager' });
      
      if (updateRes.status === 200 || updateRes.status === 204) {
        console.log(`  ✅ ${fullName} → manager`);
        managerSuccess++;
      } else {
        console.log(`  ⚠️  ${fullName} 실패 (상태: ${updateRes.status})`);
        if (updateRes.data.message) {
          console.log(`     → ${updateRes.data.message}`);
        }
        managerFail++;
      }
    }

    if (managerFail > 0) {
      console.log(`\n⚠️  참고: manager 역할 설정이 실패했습니다.`);
      console.log(`   이는 DB 스키마에서 manager 역할이 아직 허용되지 않기 때문입니다.`);
      console.log(`\n   해결 방법 1) Supabase 웹 콘솔 → SQL 에디터에서 다음 실행:`);
      console.log(`   ─────────────────────────────────────────────────────`);
      console.log(`   ALTER TABLE public.profiles`);
      console.log(`   DROP CONSTRAINT profiles_role_check;`);
      console.log(`   ALTER TABLE public.profiles`);
      console.log(`   ADD CONSTRAINT profiles_role_check `);
      console.log(`   CHECK (role IN ('admin', 'manager', 'user'));`);
      console.log(`   ─────────────────────────────────────────────────────\n`);
    }

    console.log('='.repeat(60) + '\n');

    // 3. 최종 확인
    console.log('📋 [3] 현재 권한 상태\n');

    const finalRes = await makeRequest('GET', '/rest/v1/profiles?select=full_name,role&order=role.desc,full_name');
    
    if (finalRes.status === 200) {
      const byRole = {
        admin: [],
        manager: [],
        user: []
      };

      finalRes.data.forEach(u => {
        if (byRole[u.role]) {
          byRole[u.role].push(u.full_name);
        }
      });

      if (byRole.admin.length > 0) {
        console.log(`👨‍💼 관리자 (${byRole.admin.length}명):`);
        byRole.admin.forEach(name => console.log(`   • ${name}`));
      }

      if (byRole.manager.length > 0) {
        console.log(`\n👤 매니저 (${byRole.manager.length}명):`);
        byRole.manager.forEach(name => console.log(`   • ${name}`));
      }

      console.log(`\n👥 일반 사용자 (${byRole.user.length}명)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ 권한 설정 완료!\n');
    console.log(`📊 결과: 관리자 ${adminSuccess}명, 매니저 ${managerSuccess}명\n`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

setupRoles();
