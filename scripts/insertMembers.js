// 간단한 멤버 데이터 입력 스크립트 (Node.js)
const https = require('https');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

const members = [
  // 캐비어 팀 (A 레벨)
  { username: 'kim_seonggon', full_name: '김성곤', skill_level: 'A' },
  { username: 'jo_youngjae', full_name: '조영재', skill_level: 'A' },
  { username: 'choi_shinwoong', full_name: '최신웅', skill_level: 'A' },

  // 랍스터 팀 (B 레벨)
  { username: 'kim_gunryul', full_name: '김건율', skill_level: 'B' },
  { username: 'kim_hyungjun', full_name: '김형준', skill_level: 'B' },
  { username: 'park_kangho', full_name: '박강호', skill_level: 'B' },
  { username: 'park_jiseop', full_name: '박지섭', skill_level: 'B' },
  { username: 'yoo_sungjun', full_name: '유성준', skill_level: 'B' },
  { username: 'lee_jeyoung', full_name: '이제영', skill_level: 'B' },
  { username: 'lee_hyunho', full_name: '이현호', skill_level: 'B' },

  // 소갈비 팀 (C 레벨)
  { username: 'lee_minseok', full_name: '이민석', skill_level: 'C' },
  { username: 'kim_jinho', full_name: '김진호', skill_level: 'C' },
  { username: 'kwon_youngsoon', full_name: '권영순', skill_level: 'C' },
  { username: 'park_bokgyun', full_name: '박복균', skill_level: 'C' },
  { username: 'park_heesoo', full_name: '박희수', skill_level: 'C' },
  { username: 'yang_hoeyouk', full_name: '양회욱', skill_level: 'C' },
  { username: 'yeo_wonmi', full_name: '여원미', skill_level: 'C' },
  { username: 'yeom_cheongseob', full_name: '염청섭', skill_level: 'C' },
  { username: 'im_hyunsu', full_name: '임현수', skill_level: 'C' },
  { username: 'jeon_cheolmin', full_name: '전철민', skill_level: 'C' },
  { username: 'jo_donggyun', full_name: '조동균', skill_level: 'C' },
  { username: 'ju_dongseok', full_name: '주동석', skill_level: 'C' },
  { username: 'ju_seongmo', full_name: '주성모', skill_level: 'C' },

  // 양갈비 팀 (D 레벨)
  { username: 'kim_giseung', full_name: '김기승', skill_level: 'D' },
  { username: 'kim_dayoung', full_name: '김다영', skill_level: 'D' },
  { username: 'kim_yeseul', full_name: '김예슬', skill_level: 'D' },
  { username: 'kim_eunhee', full_name: '김은희', skill_level: 'D' },
  { username: 'kim_hyeseon', full_name: '김혜선', skill_level: 'D' },
  { username: 'yang_hyeyun', full_name: '양혜윤', skill_level: 'D' },
  { username: 'lee_taehun', full_name: '이태훈', skill_level: 'D' },
  { username: 'cha_songun', full_name: '차송운', skill_level: 'D' },
  { username: 'choi_seoyeon', full_name: '최서연', skill_level: 'D' },
  { username: 'choi_wonjeong', full_name: '최원정', skill_level: 'D' },
  { username: 'han_jiyun', full_name: '한지윤', skill_level: 'D' },
  { username: 'hwang_gyuyeon', full_name: '황규연', skill_level: 'D' },

  // 돼지갈비 팀 (E 레벨)
  { username: 'kim_minjeong', full_name: '김민정', skill_level: 'E' },
  { username: 'kim_youngsoon', full_name: '김영순', skill_level: 'E' },
  { username: 'seo_juyoung', full_name: '서주영', skill_level: 'E' },
  { username: 'yang_yeonyouk', full_name: '양연욱', skill_level: 'E' },
  { username: 'yong_hyunjeong', full_name: '용현정', skill_level: 'E' },
  { username: 'lee_yeonwoo', full_name: '이연우', skill_level: 'E' },
  { username: 'lee_woosung', full_name: '이우성', skill_level: 'E' },
  { username: 'lee_eunmi', full_name: '이은미', skill_level: 'E' },
  { username: 'lee_jeongchan', full_name: '이정찬', skill_level: 'E' },
  { username: 'hwang_yongdam', full_name: '황용담', skill_level: 'E' },

  // 닭갈비 팀 (N 레벨)
  { username: 'kang_sora', full_name: '강솔라', skill_level: 'N' },
  { username: 'kang_jiyeon', full_name: '강지연', skill_level: 'N' },
  { username: 'kim_euneok', full_name: '김은옥', skill_level: 'N' },
  { username: 'park_giwouk', full_name: '박기욱', skill_level: 'N' },
  { username: 'park_soyoung', full_name: '박소영', skill_level: 'N' },
  { username: 'seo_minhee', full_name: '서민희', skill_level: 'N' },
  { username: 'shim_hyunchul', full_name: '심현철', skill_level: 'N' },
  { username: 'yeo_hyunseo', full_name: '여현서', skill_level: 'N' },
  { username: 'jeong_gyumin', full_name: '정규민', skill_level: 'N' },
  { username: 'jeong_sujeong', full_name: '정수정', skill_level: 'N' },
  { username: 'jo_ingyu', full_name: '조인규', skill_level: 'N' },
  { username: 'choi_yunsil', full_name: '최윤실', skill_level: 'N' },
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

async function insertMembers() {
  console.log('🚀 배드민턴 클럽 멤버 데이터 입력 시작...\n');

  try {
    // 1. 멤버 데이터 삽입
    console.log(`📥 ${members.length}명의 멤버 데이터 삽입 중...\n`);
    
    const body = members.map(m => ({
      username: m.username,
      full_name: m.full_name,
      skill_level: m.skill_level,
      role: 'user'
    }));

    const response = await makeRequest('POST', '/rest/v1/profiles', body);

    if (response.status === 201 || response.status === 200) {
      console.log(`✅ 데이터 삽입 완료!\n`);
    } else {
      console.error(`❌ 삽입 실패 (상태: ${response.status}):`, response.data);
      return;
    }

    // 2. 데이터 검증 - 레벨별 통계
    console.log('📊 레벨별 통계 조회 중...\n');
    
    const queryResponse = await makeRequest('GET', '/rest/v1/profiles?skill_level=in.(A,B,C,D,E,N)&select=skill_level,full_name');

    if (queryResponse.status === 200) {
      const data = queryResponse.data;
      
      const levelNames = {
        'A': '🥇 캐비어 (최상급)',
        'B': '🥈 랍스터',
        'C': '🥉 소갈비',
        'D': '👥 양갈비',
        'E': '👥 돼지갈비',
        'N': '👥 닭갈비 (최하급)',
      };

      const grouped = {};
      data.forEach(profile => {
        if (!grouped[profile.skill_level]) {
          grouped[profile.skill_level] = [];
        }
        grouped[profile.skill_level].push(profile.full_name);
      });

      for (const level of ['A', 'B', 'C', 'D', 'E', 'N']) {
        if (grouped[level]) {
          const count = grouped[level].length;
          console.log(`${levelNames[level]}: ${count}명`);
          console.log(`  └─ ${grouped[level].join(', ')}\n`);
        }
      }

      const totalCount = Object.values(grouped).flat().length;
      console.log(`\n✨ 최종 결과: 총 ${totalCount}명의 멤버 데이터 입력 및 검증 완료!\n`);
    } else {
      console.error('❌ 데이터 조회 실패:', response.status, response.data);
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

insertMembers();
