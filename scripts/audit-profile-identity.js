const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    return;
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

async function listAllAuthUsers(supabase) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const users = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to load auth users: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const pageUsers = payload.users || [];
    users.push(...pageUsers);

    if (pageUsers.length < 200) {
      break;
    }

    page += 1;
  }

  return users;
}

function printGroup(title, rows) {
  console.log(`\n[${title}] ${rows.length}건`);

  if (rows.length === 0) {
    console.log('  - 없음');
    return;
  }

  rows.forEach((row) => {
    console.log(`  - ${JSON.stringify(row)}`);
  });
}

async function main() {
  loadEnvFile();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const authUsers = await listAllAuthUsers(supabase);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, user_id, username, full_name, email, role, created_at, updated_at')
    .order('username', { ascending: true });

  if (profilesError) {
    throw profilesError;
  }

  const profilesByLinkedUserId = new Map();
  const profilesByEmail = new Map();
  const duplicateLinkedUsers = [];
  const duplicateEmails = [];

  for (const profile of profiles || []) {
    if (profile.user_id) {
      const existing = profilesByLinkedUserId.get(profile.user_id);
      if (existing) {
        duplicateLinkedUsers.push([existing, profile]);
      } else {
        profilesByLinkedUserId.set(profile.user_id, profile);
      }
    }

    if (profile.email) {
      const bucket = profilesByEmail.get(profile.email) || [];
      bucket.push(profile);
      profilesByEmail.set(profile.email, bucket);
    }
  }

  for (const [email, rows] of profilesByEmail.entries()) {
    if (rows.length > 1) {
      duplicateEmails.push({
        email,
        profile_ids: rows.map((row) => row.id),
      });
    }
  }

  const missingProfileLinks = authUsers
    .filter((user) => !profilesByLinkedUserId.has(user.id))
    .map((user) => ({
      auth_user_id: user.id,
      email: user.email || null,
      full_name: user.user_metadata?.full_name || null,
    }));

  const nullLinkedProfiles = (profiles || []).filter((profile) => !profile.user_id);
  const authUsersByEmail = new Map(
    authUsers
      .filter((user) => Boolean(user.email))
      .map((user) => [user.email, user])
  );

  const backfillCandidates = [];
  const placeholderProfiles = [];
  const conflicts = [];

  for (const profile of nullLinkedProfiles) {
    const matchedUser = profile.email ? authUsersByEmail.get(profile.email) : null;

    if (!matchedUser) {
      placeholderProfiles.push({
        profile_id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        email: profile.email,
      });
      continue;
    }

    const alreadyLinkedProfile = profilesByLinkedUserId.get(matchedUser.id);

    if (alreadyLinkedProfile) {
      conflicts.push({
        profile_id: profile.id,
        profile_name: profile.full_name || profile.username,
        profile_email: profile.email,
        auth_user_id: matchedUser.id,
        linked_profile_id: alreadyLinkedProfile.id,
        linked_profile_name: alreadyLinkedProfile.full_name || alreadyLinkedProfile.username,
      });
      continue;
    }

    backfillCandidates.push({
      profile_id: profile.id,
      profile_name: profile.full_name || profile.username,
      profile_email: profile.email,
      auth_user_id: matchedUser.id,
    });
  }

  console.log('\n=== Profile Identity Audit ===');
  console.log(`auth.users: ${authUsers.length}`);
  console.log(`profiles: ${(profiles || []).length}`);
  console.log(`linked profiles: ${(profiles || []).filter((profile) => profile.user_id).length}`);
  console.log(`placeholder profiles: ${nullLinkedProfiles.length}`);

  printGroup('미연결 auth 사용자', missingProfileLinks);
  printGroup('중복 연결된 user_id', duplicateLinkedUsers.map(([a, b]) => ({
    user_id: a.user_id,
    profile_ids: [a.id, b.id],
  })));
  printGroup('중복 이메일 프로필', duplicateEmails);
  printGroup('자동 백필 가능한 후보', backfillCandidates);
  printGroup('충돌로 수동 확인이 필요한 후보', conflicts);
  printGroup('정상 placeholder 프로필', placeholderProfiles);

  console.log('\n기준: profiles.id = 앱 내부 선수 ID, profiles.user_id = auth 연결 ID');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
