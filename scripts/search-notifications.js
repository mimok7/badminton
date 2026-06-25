const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, type')
    .or('message.ilike.%http%,message.ilike.%.co%,message.ilike.%.kr%');

  if (error) {
    console.error('Error querying notifications:', error);
  } else {
    console.log(`Found ${data.length} notifications with URL-like content:`);
    data.forEach(n => {
      console.log(`- ID: ${n.id}, Type: ${n.type}`);
      console.log(`  Title: ${n.title}`);
      console.log(`  Message: ${n.message}`);
    });
  }
}

check();
