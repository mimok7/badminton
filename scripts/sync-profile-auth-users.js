const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function buildUserMetadata(profile) {
  return {
    full_name: profile.full_name || profile.username || '',
    username: profile.username || '',
    role: profile.role || 'user',
  };
}

function makeTempPassword() {
  return `Tmp!${crypto.randomBytes(12).toString('base64url')}9a`;
}

async function createAuthUser(supabase, profile) {
  if (!profile.email) {
    throw new Error(`프로필 ${profile.id} 에 email 이 없어 auth 계정을 생성할 수 없습니다.`);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: profile.email,
    password: makeTempPassword(),
    email_confirm: true,
    user_metadata: buildUserMetadata(profile),
  });

  if (error) {
    throw error;
  }

  return data.user;
}

async function updateAuthMetadata(supabase, authUserId, profile) {
  const { error } = await supabase.auth.admin.updateUserById(authUserId, {
    email: profile.email || undefined,
    user_metadata: buildUserMetadata(profile),
  });

  if (error) {
    throw error;
  }
}

async function updateProfileLink(supabase, profileId, authUserId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      user_id: authUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }
}

async function clearProfileLink(supabase, profileId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }
}

async function main() {
  loadEnvFile();

  const apply = process.argv.includes('--apply');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const authUsers = await listAllAuthUsers(supabase);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, user_id, username, full_name, email, role')
    .order('username', { ascending: true });

  if (profilesError) {
    throw profilesError;
  }

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const authByEmail = new Map(
    authUsers
      .filter((user) => Boolean(user.email))
      .map((user) => [user.email, user])
  );

  const profileByLinkedUserId = new Map(
    (profiles || [])
      .filter((profile) => Boolean(profile.user_id))
      .map((profile) => [profile.user_id, profile])
  );
  const nullProfileByEmail = new Map(
    (profiles || [])
      .filter((profile) => !profile.user_id && profile.email)
      .map((profile) => [profile.email, profile])
  );

  const actions = [];

  for (const profile of profiles || []) {
    if (!profile.email) {
      continue;
    }

    if (profile.user_id) {
      const linkedAuth = authById.get(profile.user_id) || null;
      const authWithProfileEmail = authByEmail.get(profile.email) || null;

      if (!linkedAuth) {
        actions.push({
          type: authWithProfileEmail ? 'relink-missing-auth' : 'create-auth-for-linked-profile',
          profile,
          targetAuthUser: authWithProfileEmail,
        });
        continue;
      }

      if (linkedAuth.email !== profile.email) {
        const displacedPlaceholder =
          linkedAuth.email && nullProfileByEmail.get(linkedAuth.email)
            ? nullProfileByEmail.get(linkedAuth.email)
            : null;

        actions.push({
          type:
            displacedPlaceholder
              ? 'swap-mismatched-auth'
              : authWithProfileEmail
                ? 'relink-mismatched-auth'
                : 'create-auth-for-mismatched-profile',
          profile,
          currentAuthUser: linkedAuth,
          targetAuthUser: authWithProfileEmail,
          displacedPlaceholder,
        });
        continue;
      }

      actions.push({
        type: 'refresh-auth-metadata',
        profile,
        currentAuthUser: linkedAuth,
      });
      continue;
    }

    const authWithProfileEmail = authByEmail.get(profile.email) || null;
    if (authWithProfileEmail) {
      const alreadyLinkedProfile = profileByLinkedUserId.get(authWithProfileEmail.id) || null;
      actions.push({
        type: alreadyLinkedProfile ? 'relink-conflict-placeholder' : 'link-placeholder-to-existing-auth',
        profile,
        targetAuthUser: authWithProfileEmail,
        conflictProfile: alreadyLinkedProfile,
      });
      continue;
    }

    actions.push({
      type: 'create-auth-for-placeholder',
      profile,
    });
  }

  const actionableTypes = new Set([
    'relink-missing-auth',
    'create-auth-for-linked-profile',
    'relink-mismatched-auth',
    'swap-mismatched-auth',
    'create-auth-for-mismatched-profile',
    'link-placeholder-to-existing-auth',
    'relink-conflict-placeholder',
    'create-auth-for-placeholder',
  ]);

  const report = [];

  for (const action of actions) {
    if (!actionableTypes.has(action.type)) {
      if (action.type === 'refresh-auth-metadata' && apply) {
        await updateAuthMetadata(supabase, action.currentAuthUser.id, action.profile);
      }

      report.push({
        type: action.type,
        profile_name: action.profile.full_name || action.profile.username,
        profile_email: action.profile.email,
        auth_user_id: action.currentAuthUser?.id || null,
      });
      continue;
    }

    if (!apply) {
      report.push({
        type: action.type,
        profile_name: action.profile.full_name || action.profile.username,
        profile_email: action.profile.email,
        current_auth_user_id: action.currentAuthUser?.id || null,
        target_auth_user_id: action.targetAuthUser?.id || null,
        conflict_profile_name: action.conflictProfile?.full_name || action.conflictProfile?.username || null,
        displaced_placeholder_name:
          action.displacedPlaceholder?.full_name || action.displacedPlaceholder?.username || null,
      });
      continue;
    }

    let targetUser = action.targetAuthUser || null;

    if (action.type === 'swap-mismatched-auth') {
      await clearProfileLink(supabase, action.profile.id);
      await updateProfileLink(supabase, action.displacedPlaceholder.id, action.currentAuthUser.id);
      await updateAuthMetadata(supabase, action.currentAuthUser.id, action.displacedPlaceholder);
      profileByLinkedUserId.set(action.currentAuthUser.id, action.displacedPlaceholder);
      nullProfileByEmail.delete(action.displacedPlaceholder.email);
      targetUser = null;
    }

    if (
      action.type === 'create-auth-for-linked-profile' ||
      action.type === 'create-auth-for-mismatched-profile' ||
      action.type === 'create-auth-for-placeholder'
    ) {
      targetUser = await createAuthUser(supabase, action.profile);
      authById.set(targetUser.id, targetUser);
      authByEmail.set(targetUser.email, targetUser);
    }

    if (
      action.type === 'relink-missing-auth' ||
      action.type === 'relink-mismatched-auth' ||
      action.type === 'swap-mismatched-auth' ||
      action.type === 'create-auth-for-linked-profile' ||
      action.type === 'create-auth-for-mismatched-profile' ||
      action.type === 'link-placeholder-to-existing-auth' ||
      action.type === 'relink-conflict-placeholder' ||
      action.type === 'create-auth-for-placeholder'
    ) {
      if (action.type !== 'swap-mismatched-auth') {
        await updateProfileLink(supabase, action.profile.id, targetUser.id);
        profileByLinkedUserId.set(targetUser.id, action.profile);
      }
    }

    if (action.type === 'swap-mismatched-auth') {
      const createdUser = await createAuthUser(supabase, action.profile);
      await updateAuthMetadata(supabase, createdUser.id, action.profile);
      await updateProfileLink(supabase, action.profile.id, createdUser.id);
      profileByLinkedUserId.set(createdUser.id, action.profile);
      targetUser = createdUser;
    } else {
      await updateAuthMetadata(supabase, targetUser.id, action.profile);
    }

    report.push({
      type: action.type,
      profile_name: action.profile.full_name || action.profile.username,
      profile_email: action.profile.email,
      auth_user_id: targetUser.id,
    });
  }

  console.log(JSON.stringify({ apply, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
