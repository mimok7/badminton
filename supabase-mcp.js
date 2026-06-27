const { spawn } = require('child_process');

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error('SUPABASE_ACCESS_TOKEN 환경변수가 필요합니다.');
}

const child = spawn('npx', ['-y', '@supabase/mcp-server-supabase'], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});
