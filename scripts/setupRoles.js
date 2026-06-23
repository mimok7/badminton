// role 컬럼 제약 업데이트 및 권한 설정
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
  console.log('🔐 배드민턴 클럽 권한 체계 설정 시작...\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. profiles 테이블 스키마 업데이트 - role 제약 수정
    console.log('🔧 [1] 데이터베이스 스키마 업데이트\n');
    
    // ALTER TABLE을 위한 SQL 실행 - 제약 제거 및 재생성
    const sqlQuery = `
      ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_role_check;
      
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check 
      CHECK (role IN ('admin', 'manager', 'user'));
    `;

    const schemaRes = await makeRequest('POST', '/rest/v1/rpc/exec_sql', { 
      sql: sqlQuery 
    });

    // RPC가 없으면 직접 PATCH로 시도
    if (schemaRes.status === 404 || schemaRes.status === 400) {
      console.log('  ℹ️  RPC 방식 시도 중...\n');
    } else if (schemaRes.status === 200) {
      console.log('  ✅ 스키마 업데이트 완료\n');
    }

    console.log('-'.repeat(60) + '\n');

    // 2. 관리자(admin) 권한 설정
    console.log('👨‍💼 [2] 관리자 권한 설정\n');
    
    let adminCount = 0;
    for (const fullName of admins) {
      const searchRes = await makeRequest('GET', `/rest/v1/profiles?full_name=eq.${encodeURIComponent(fullName)}&select=id,full_name,role`);
      
      if (searchRes.status === 200 && searchRes.data.length > 0) {
        const user = searchRes.data[0];
        
        if (user.role !== 'admin') {
          const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${user.id}`, { role: 'admin' });
          if (updateRes.status === 200 || updateRes.status === 204) {
            console.log(`  ✅ ${fullName} → admin`);
            adminCount++;
          }
        } else {
          console.log(`  ✅ ${fullName} → admin (이미 설정됨)`);
          adminCount++;
        }
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 3. 매니저(manager) 권한 설정
    console.log('👤 [3] 매니저 권한 설정\n');
    
    let managerCount = 0;
    for (const fullName of managers) {
      const searchRes = await makeRequest('GET', `/rest/v1/profiles?full_name=eq.${encodeURIComponent(fullName)}&select=id,full_name,role`);
      
      if (searchRes.status === 200 && searchRes.data.length > 0) {
        const user = searchRes.data[0];
        
        const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${user.id}`, { role: 'manager' });
        
        if (updateRes.status === 200 || updateRes.status === 204) {
          console.log(`  ✅ ${fullName} → manager`);
          managerCount++;
        } else {
          console.log(`  ⚠️  ${fullName} 설정 (상태: ${updateRes.status})`);
          if (updateRes.data && updateRes.data.message) {
            console.log(`     메시지: ${updateRes.data.message}`);
          }
          managerCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // 4. 최종 확인
    console.log('📋 [4] 최종 권한 확인\n');

    const adminRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.admin&select=full_name,skill_level&order=full_name`);
    const managerRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.manager&select=full_name,skill_level&order=full_name`);
    const userRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.user&select=count()`);

    if (adminRes.status === 200) {
      console.log(`👨‍💼 관리자 (${adminRes.data.length}명):`);
      adminRes.data.forEach(u => console.log(`   • ${u.full_name}`));
    }

    if (managerRes.status === 200 && managerRes.data.length > 0) {
      console.log(`\n👤 매니저 (${managerRes.data.length}명):`);
      managerRes.data.forEach(u => console.log(`   • ${u.full_name}`));
    }

    if (userRes.status === 200) {
      const userCount = userRes.data[0]?.count || 0;
      console.log(`\n👥 일반 사용자 (${userCount}명)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ 권한 설정 완료!\n');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

setupRoles();
