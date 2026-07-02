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
  const matchScheduleId = 'c4cc2b1b-e20e-4bae-bcc7-733aeb640488'; // 7월 2일 매칭

  // 1. 경기 일정 존재 검증
  const { data: schedule, error: schedError } = await supabase
    .from('match_schedules')
    .select('id, match_date')
    .eq('id', matchScheduleId)
    .maybeSingle();

  if (schedError || !schedule) {
    console.error('7월 2일 일정을 찾을 수 없거나 에러 발생:', schedError || '일정 없음');
    return;
  }

  // 2. 선수 UUID 조회
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, full_name');

  if (profError) {
    console.error('선수 조회 에러:', profError);
    return;
  }

  const profileMap = new Map(profiles.map(p => [p.full_name, p.id]));
  const insertRows = [];
  const notFound = [];

  players.forEach(name => {
    const id = profileMap.get(name);
    if (id) {
      insertRows.push({
        match_schedule_id: matchScheduleId,
        user_id: id,
        status: 'registered'
      });
    } else {
      notFound.push(name);
    }
  });

  if (notFound.length > 0) {
    console.log('DB에 없는 선수 목록:', notFound);
  }

  if (insertRows.length === 0) {
    console.log('등록할 선수가 없습니다.');
    return;
  }

  // 3. match_participants에 삽입
  const { data, error: insertError } = await supabase
    .from('match_participants')
    .upsert(insertRows, { onConflict: 'match_schedule_id,user_id' })
    .select('id');

  if (insertError) {
    console.error('참가자 등록 에러:', insertError);
  } else {
    console.log(`성공적으로 ${insertRows.length}명의 선수를 7월 2일 경기에 등록하였습니다.`);
  }
}

run();
