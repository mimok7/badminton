const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local file not found.');
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
  console.error('❌ Missing environment variables in .env.local.');
  process.exit(1);
}

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

async function runMigration() {
  console.log('🚀 Running database migration for Guest system...');

  const sqlQuery = `
    -- 1. profiles 테이블에 is_guest 컬럼 추가
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE;

    -- 2. 만료된 게스트 자동 삭제 함수 정의 (SECURITY DEFINER로 auth.users 삭제 권한 확보)
    CREATE OR REPLACE FUNCTION delete_expired_guests()
    RETURNS void AS $$
    DECLARE
        guest_record RECORD;
    BEGIN
        FOR guest_record IN 
            SELECT id FROM public.profiles 
            WHERE is_guest = TRUE 
            AND created_at < CURRENT_DATE
        LOOP
            DELETE FROM auth.users WHERE id = guest_record.id;
        END LOOP;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- 3. pg_cron 스케줄러 등록 (지원되는 경우)
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM pg_extension 
            WHERE extname = 'pg_cron'
        ) THEN
            -- 기존 스케줄 제거
            PERFORM cron.unschedule('delete-guests-midnight');
            -- 매일 자정 실행
            PERFORM cron.schedule('delete-guests-midnight', '0 0 * * *', 'SELECT delete_expired_guests()');
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            NULL;
    END $$;
  `;

  try {
    const res = await makeRequest('POST', '/rest/v1/rpc/exec_sql', { sql: sqlQuery });
    console.log(`Response Status: ${res.status}`);
    console.log('Response Data:', res.data);

    if (res.status === 200) {
      console.log('✅ Migration successfully executed!');
    } else {
      console.error('❌ Migration failed.');
    }
  } catch (error) {
    console.error('❌ Exception occurred:', error.message);
  }
}

runMigration();
