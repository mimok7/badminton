const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length > 0) {
    env[key.trim()] = val.join('=').trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const plainNames = [
  '차송운', '박기욱', '이태훈', '서민희', '용현정', 
  '최서연', '유성준', '전철민', '박소영', '이우성', 
  '한지윤', '황규연', '최원정', '양연욱', '박복균', 
  '주성모', '여현서', '김형준', '이민석', '김성곤'
];

async function checkPlainProfiles() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', plainNames);
    
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }
  
  const foundNames = new Set(profiles.map(p => p.full_name));
  const missing = plainNames.filter(n => !foundNames.has(n));
  
  console.log(`Profiles found: ${profiles.length} / ${plainNames.length}`);
  if (missing.length > 0) {
    console.log('Missing profiles:', missing);
  } else {
    console.log('All profiles found!');
  }
}

checkPlainProfiles();
