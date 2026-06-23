// level_info 테이블에 레벨 정보 추가
const https = require('https');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

const levels = [
  { code: 'A', name: '캐비어', description: '최상급 실력' },
  { code: 'B', name: '랍스터', description: '상급 실력' },
  { code: 'C', name: '소갈비', description: '중급 실력' },
  { code: 'D', name: '양갈비', description: '중하급 실력' },
  { code: 'E', name: '돼지갈비', description: '하급 실력' },
  { code: 'N', name: '닭갈비', description: '최하급 실력' },
  { code: 'E2', name: '신입', description: '신입 또는 미정' },
];

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
        'Prefer': 'resolution=merge-duplicates'
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
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
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

async function setupLevels() {
  console.log('🚀 레벨 정보 설정 시작...\n');

  try {
    // 1. 기존 레벨 확인
    console.log('📊 기존 레벨 정보 확인 중...');
    const checkResponse = await makeRequest('GET', '/rest/v1/level_info?select=code,name');
    
    if (checkResponse.status === 200) {
      const existingLevels = checkResponse.data;
      console.log(`✅ 기존 레벨 확인됨: ${existingLevels.map(l => l.code).join(', ')}\n`);
    }

    // 2. 새 레벨 추가
    console.log(`📥 ${levels.length}개의 레벨 정보 추가 중...\n`);
    
    const response = await makeRequest('POST', '/rest/v1/level_info', levels);

    if (response.status === 201 || response.status === 200) {
      console.log(`✅ 레벨 정보 추가 완료!\n`);
      
      // 3. 전체 레벨 목록 확인
      console.log('📊 전체 레벨 목록:');
      const allLevels = await makeRequest('GET', '/rest/v1/level_info?order=code');
      if (allLevels.status === 200) {
        allLevels.data.forEach(level => {
          console.log(`  ├─ [${level.code}] ${level.name}: ${level.description}`);
        });
      }
      console.log('\n✨ 레벨 설정 완료!\n');
    } else {
      console.error(`❌ 추가 실패 (상태: ${response.status}):`, response.data);
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

setupLevels();
