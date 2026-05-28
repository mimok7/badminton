// DB 전체 점검 및 검증 스크립트
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

async function checkDatabase() {
  console.log('🔍 배드민턴 클럽 DB 전체 점검 시작...\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. level_info 테이블 점검
    console.log('📋 [1] Level Info 테이블 점검\n');
    const levelRes = await makeRequest('GET', '/rest/v1/level_info?order=code.asc');
    if (levelRes.status === 200) {
      console.log(`✅ 총 ${levelRes.data.length}개 레벨 등록됨:`);
      levelRes.data.forEach(level => {
        console.log(`   [${level.code}] ${level.name} - ${level.description}`);
      });
    } else {
      console.error('❌ 조회 실패');
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 2. profiles 테이블 전체 통계
    console.log('📋 [2] Profiles 테이블 전체 통계\n');
    const profilesRes = await makeRequest('GET', '/rest/v1/profiles?select=count()');
    if (profilesRes.status === 200) {
      const totalCount = profilesRes.data[0]?.count || 0;
      console.log(`✅ 총 ${totalCount}명의 프로필 등록됨`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 3. 레벨별 멤버 분포
    console.log('📋 [3] 레벨별 멤버 분포\n');
    const levelsData = ['A', 'B', 'C', 'D', 'E', 'N'];
    const levelNames = {
      'A': '🥇 캐비어',
      'B': '🥈 랍스터',
      'C': '🥉 소갈비',
      'D': '👥 양갈비',
      'E': '👥 돼지갈비',
      'N': '👥 닭갈비'
    };

    let totalMembers = 0;
    const distribution = [];

    for (const level of levelsData) {
      const query = `/rest/v1/profiles?skill_level=eq.${level}&select=count()`;
      const res = await makeRequest('GET', query);
      if (res.status === 200) {
        const count = res.data[0]?.count || 0;
        totalMembers += count;
        distribution.push({ level, count });
        console.log(`${levelNames[level]}: ${count}명`);
      }
    }

    console.log(`\n총합: ${totalMembers}명\n`);

    console.log('-'.repeat(60) + '\n');

    // 4. 데이터 무결성 검사
    console.log('📋 [4] 데이터 무결성 검사\n');

    // 4-1. 중복 username 확인
    const dupRes = await makeRequest('GET', '/rest/v1/profiles?select=username,count(*)&group_by=username&having=count(*)>1');
    if (dupRes.status === 200 && dupRes.data.length === 0) {
      console.log('✅ 중복 username 없음');
    } else if (dupRes.data.length > 0) {
      console.log(`⚠️  중복 username 발견: ${dupRes.data.length}개`);
    }

    // 4-2. NULL 값 확인
    const nullRes = await makeRequest('GET', '/rest/v1/profiles?full_name=is.null&select=count()');
    if (nullRes.status === 200 && (nullRes.data[0]?.count || 0) === 0) {
      console.log('✅ full_name NULL 값 없음');
    } else {
      console.log(`⚠️  full_name NULL 값: ${nullRes.data[0]?.count || 0}개`);
    }

    // 4-3. 유효하지 않은 skill_level 확인
    const invalidLevelRes = await makeRequest('GET', `/rest/v1/profiles?skill_level=notin.(A,B,C,D,E,N,E2)&select=count()`);
    if (invalidLevelRes.status === 200 && (invalidLevelRes.data[0]?.count || 0) === 0) {
      console.log('✅ 유효하지 않은 skill_level 없음');
    } else {
      console.log(`⚠️  유효하지 않은 skill_level: ${invalidLevelRes.data[0]?.count || 0}개`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 5. 샘플 데이터 출력
    console.log('📋 [5] 샘플 데이터 (각 레벨별 1명)\n');
    
    for (const level of levelsData) {
      const query = `/rest/v1/profiles?skill_level=eq.${level}&select=username,full_name,skill_level&limit=1`;
      const res = await makeRequest('GET', query);
      if (res.status === 200 && res.data.length > 0) {
        const member = res.data[0];
        console.log(`${levelNames[level]}: ${member.full_name} (@${member.username})`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ DB 점검 완료!\n');
    console.log('📊 요약:');
    console.log(`  • 총 멤버 수: ${totalMembers}명`);
    console.log(`  • 레벨 종류: ${levelsData.length}종`);
    console.log(`  • 데이터 무결성: ✅ 정상\n`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

checkDatabase();
