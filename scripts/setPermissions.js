// 관리자 및 매니저 권한 설정
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

async function setPermissions() {
  console.log('🔐 배드민턴 클럽 권한 설정 시작...\n');
  console.log('='.repeat(60) + '\n');

  try {
    let updated = 0;
    let failed = 0;

    // 1. 관리자(admin) 권한 설정
    console.log('👨‍💼 [1] 관리자 권한 설정\n');
    
    for (const fullName of admins) {
      // 사용자 조회
      const searchRes = await makeRequest('GET', `/rest/v1/profiles?full_name=eq.${encodeURIComponent(fullName)}&select=id,full_name,role`);
      
      if (searchRes.status === 200 && searchRes.data.length > 0) {
        const user = searchRes.data[0];
        
        // 권한 업데이트
        const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${user.id}`, { role: 'admin' });
        
        if (updateRes.status === 200) {
          console.log(`  ✅ ${fullName} → admin`);
          updated++;
        } else {
          console.log(`  ❌ ${fullName} 업데이트 실패 (상태: ${updateRes.status})`);
          failed++;
        }
      } else {
        console.log(`  ❌ ${fullName} 찾지 못함`);
        failed++;
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 2. 매니저(manager) 권한 설정
    console.log('👤 [2] 매니저 권한 설정\n');
    
    for (const fullName of managers) {
      // 사용자 조회
      const searchRes = await makeRequest('GET', `/rest/v1/profiles?full_name=eq.${encodeURIComponent(fullName)}&select=id,full_name,role`);
      
      if (searchRes.status === 200 && searchRes.data.length > 0) {
        const user = searchRes.data[0];
        
        // 권한 업데이트
        const updateRes = await makeRequest('PATCH', `/rest/v1/profiles?id=eq.${user.id}`, { role: 'manager' });
        
        if (updateRes.status === 200) {
          console.log(`  ✅ ${fullName} → manager`);
          updated++;
        } else {
          console.log(`  ❌ ${fullName} 업데이트 실패 (상태: ${updateRes.status})`);
          failed++;
        }
      } else {
        console.log(`  ❌ ${fullName} 찾지 못함`);
        failed++;
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 3. 최종 확인
    console.log('📋 [3] 권한 설정 최종 확인\n');

    const adminRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.admin&select=full_name,role`);
    const managerRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.manager&select=full_name,role`);
    const userRes = await makeRequest('GET', `/rest/v1/profiles?role=eq.user&select=count()`);

    if (adminRes.status === 200) {
      console.log(`👨‍💼 관리자 (${adminRes.data.length}명):`);
      adminRes.data.forEach(u => console.log(`   • ${u.full_name}`));
    }

    if (managerRes.status === 200) {
      console.log(`\n👤 매니저 (${managerRes.data.length}명):`);
      managerRes.data.forEach(u => console.log(`   • ${u.full_name}`));
    }

    if (userRes.status === 200) {
      const userCount = userRes.data[0]?.count || 0;
      console.log(`\n👥 일반 사용자 (${userCount}명)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ 권한 설정 완료!\n');
    console.log(`📊 결과: ${updated}명 업데이트 완료, ${failed}명 실패\n`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

setPermissions();
