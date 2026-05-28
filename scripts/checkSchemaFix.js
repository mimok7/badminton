// SQL 실행을 위한 대체 방법 - HTTP를 통한 직접 쿼리
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

async function fixSchema() {
  console.log('🔧 데이터베이스 스키마 수정 시도\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 방법 1: pg_net 또는 내장 함수 사용 시도
    console.log('방법 1️⃣: 직접 제약 조건 삭제 및 재생성\n');

    // 각 단계별로 실행
    const steps = [
      {
        name: '현재 제약 조건 확인',
        body: { 
          full_name: '★★관리자테스트용★★',
          role: 'admin'
        }
      }
    ];

    // 매니저 역할로 직접 INSERT 시도해서 에러 확인
    console.log('📝 manager 역할 테스트 INSERT 시도...\n');
    
    const testRes = await makeRequest('POST', '/rest/v1/profiles', {
      username: 'test_manager_check',
      full_name: 'Test Manager',
      role: 'manager',
      skill_level: 'N'
    });

    if (testRes.status === 400) {
      console.log('❌ manager 역할이 현재 허용되지 않음');
      console.log(`   에러: ${testRes.data.message}\n`);
      console.log('📌 해결 방법: Supabase 웹 콘솔에서 SQL 직접 실행\n');
      console.log('   1. https://supabase.com/dashboard 접속');
      console.log('   2. 프로젝트 선택 → SQL Editor');
      console.log('   3. 다음 SQL 복사 후 실행:\n');
      console.log('   ┌─────────────────────────────────────────────────────┐');
      console.log('   │ ALTER TABLE public.profiles                         │');
      console.log('   │ DROP CONSTRAINT profiles_role_check;                │');
      console.log('   │                                                     │');
      console.log('   │ ALTER TABLE public.profiles                         │');
      console.log('   │ ADD CONSTRAINT profiles_role_check                  │');
      console.log('   │ CHECK (role IN (\'admin\', \'manager\', \'user\')); │');
      console.log('   └─────────────────────────────────────────────────────┘\n');
      console.log('   4. SQL 실행 후 해당 파일을 저장하세요.');
      console.log('   5. 저장된 파일: c:\\SHT-DATA\\badminton\\sql\\UPDATE_ROLE_CONSTRAINT.sql\n');
      return;
    } else if (testRes.status === 201 || testRes.status === 200) {
      console.log('✅ manager 역할이 허용됨! 테스트 레코드 삭제...\n');
      
      // 테스트 레코드 삭제
      const res = await makeRequest('GET', '/rest/v1/profiles?username=eq.test_manager_check&select=id');
      if (res.status === 200 && res.data.length > 0) {
        const testId = res.data[0].id;
        await makeRequest('DELETE', `/rest/v1/profiles?id=eq.${testId}`);
      }
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

fixSchema();
