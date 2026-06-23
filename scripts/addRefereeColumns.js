const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local file not found');
    process.exit(1);
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables in .env.local');
  process.exit(1);
}

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const bodyStr = JSON.stringify({ sql: sql });
    
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/rpc/exec',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data });
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log('🚀 Running database migration to add referee columns using exec RPC...');
  
  const sql = `
    ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS referee_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS referee_name TEXT;
  `;
  
  try {
    const res = await runSql(sql);
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Data: ${res.data}`);
    if (res.status === 200) {
      console.log('✅ referee_id and referee_name columns added successfully.');
    } else {
      console.error('❌ Failed to add columns. Check response error.');
    }
  } catch (error) {
    console.error('❌ Error executing SQL:', error);
  }
}

run();
