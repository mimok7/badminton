const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Connecting to:', supabaseUrl);

  // 1. Check surveys table
  const { data: surveys, error: surveyError } = await supabase
    .from('surveys')
    .select('*')
    .limit(1);
  
  if (surveyError) {
    console.error('Error fetching surveys table:', surveyError);
  } else {
    console.log('Surveys table exists. Columns in first record or empty:', surveys);
  }

  // 2. Check notifications table columns
  const { data: notifs, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .limit(1);

  if (notifError) {
    console.error('Error fetching notifications table:', notifError);
  } else {
    console.log('Notifications table columns:', notifs.length > 0 ? Object.keys(notifs[0]) : 'No records to extract column list from');
  }

  // Get first user profile to test insertion with a real user_id
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, id')
    .limit(1);

  if (profileError || !profiles || profiles.length === 0) {
    console.error('Could not fetch any user profile:', profileError);
    return;
  }
  
  const testUserId = profiles[0].user_id || profiles[0].id;
  console.log(`Using test user_id: ${testUserId}`);

  // Try to insert a survey notification
  const testPayload = {
    user_id: testUserId,
    title: '설문조사 테스트',
    message: '설문조사 알림 테스트입니다.',
    type: 'survey',
    survey_id: null
  };

  const { data: insertResult, error: insertError } = await supabase
    .from('notifications')
    .insert(testPayload)
    .select();

  if (insertError) {
    console.error('❌ Insert test failed:', insertError);
  } else {
    console.log('✅ Insert test succeeded:', insertResult);
    // Delete the test notification
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', insertResult[0].id);
    if (deleteError) console.error('Failed to cleanup test notification:', deleteError);
  }
}

check();
