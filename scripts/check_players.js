const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local not found');
    process.exit(1);
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) return;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const players = [
  '김진호', '최신웅', '유성준', '김다영', '박지섭', 
  '여현서', '조인규', '이태훈', '황용담', '주성모', 
  '황규연', '서주영', '박희수', '이은미', '박소영', 
  '김예슬', '박강호', '조영재', '서민희', '한지윤'
];

async function run() {
  // 7월 2일 매치 일정 확인
  const { data: schedules, error: schedError } = await supabase
    .from('match_schedules')
    .select('id, match_date, description')
    .eq('match_date', '2026-07-02');
  
  if (schedError) {
    console.error('Schedule Error:', schedError);
  } else {
    console.log('--- 7월 2일 경기 일정 ---');
    console.log(schedules);
  }

  // 선수 프로필 조회
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, full_name, skill_level');
  
  if (profError) {
    console.error('Profiles Error:', profError);
  } else {
    const profileMap = new Map(profiles.map(p => [p.full_name, p]));
    console.log('\n--- 선수 매칭 상태 ---');
    players.forEach(name => {
      const match = profileMap.get(name);
      if (match) {
        console.log(`[존재] ${name} - ID: ${match.id}, Level: ${match.skill_level}`);
      } else {
        console.log(`[미존재] ${name}`);
      }
    });
  }
}

run();
