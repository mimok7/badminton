// 직접 데이터 조회 테스트
const https = require('https');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

function request(path) {
  return new Promise((resolve) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.end();
  });
}

(async () => {
  console.log('🔍 직접 조회 테스트\n');
  
  // 방법 1: limit 사용
  const res1 = await request('/rest/v1/profiles?select=*&limit=5');
  console.log('첫 5명 멤버:', res1.map(p => p.full_name).join(', '));
  
  // 방법 2: 모든 멤버 조회
  const res2 = await request('/rest/v1/profiles?select=skill_level');
  console.log('총 조회된 멤버 수:', res2.length);
  
  // 방법 3: 레벨별 집계
  const levels = {};
  res2.forEach(p => {
    levels[p.skill_level] = (levels[p.skill_level] || 0) + 1;
  });
  
  console.log('\n📊 레벨별 집계:');
  ['A', 'B', 'C', 'D', 'E', 'N'].forEach(level => {
    console.log(`  ${level}: ${levels[level] || 0}명`);
  });
  
  const total = Object.values(levels).reduce((a, b) => a + b, 0);
  console.log(`\n✅ 총 ${total}명의 멤버 등록 완료!`);
})();
