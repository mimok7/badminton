// Supabase에서 SQL 직접 실행 (pg_net 또는 RPC 사용)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const admins = ['김진호', '김성곤'];
const managers = ['박희수', '이민석', '조영재'];

async function setupRoles() {
  console.log('🔐 배드민턴 클럽 권한 체계 설정\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 관리자(admin) 권한 설정
    console.log('👨‍💼 [1] 관리자 권한 설정\n');
    
    for (const fullName of admins) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('full_name', fullName);

      if (error) {
        console.log(`  ❌ ${fullName} 실패:`, error.message);
      } else {
        console.log(`  ✅ ${fullName} → admin`);
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // 2. 매니저(manager) 권한 설정
    console.log('👤 [2] 매니저 권한 설정\n');
    
    for (const fullName of managers) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role: 'manager' })
        .eq('full_name', fullName);

      if (error) {
        console.log(`  ⚠️  ${fullName} 실패:`, error.message);
      } else {
        console.log(`  ✅ ${fullName} → manager`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // 3. 최종 확인
    console.log('📋 [3] 최종 권한 확인\n');

    const { data: adminList } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('role', 'admin')
      .order('full_name');

    const { data: managerList } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('role', 'manager')
      .order('full_name');

    const { data: userCountData, count: userCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user');

    if (adminList && adminList.length > 0) {
      console.log(`👨‍💼 관리자 (${adminList.length}명):`);
      adminList.forEach(u => console.log(`   • ${u.full_name}`));
    }

    if (managerList && managerList.length > 0) {
      console.log(`\n👤 매니저 (${managerList.length}명):`);
      managerList.forEach(u => console.log(`   • ${u.full_name}`));
    }

    console.log(`\n👥 일반 사용자 (${userCount || 0}명)`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ 권한 설정 완료!\n');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

setupRoles();
