// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://htniaydnybggrdbylswa.supabase.co'; // ✅ 이 값 OK
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzgxMDYsImV4cCI6MjA2ODIxNDEwNn0.rwVKBc2mwY6SVeFhM3N5N5xOLEdFyXdveuqtVHmHxIE'; // 🔑 anon public 키 필요

export const supabase = createClient(supabaseUrl, supabaseKey);
