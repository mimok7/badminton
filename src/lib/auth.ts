import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type AppProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'user_id'
  | 'username'
  | 'full_name'
  | 'email'
  | 'role'
  | 'skill_level'
  | 'gender'
  | 'avatar_url'
  | 'created_at'
  | 'updated_at'
  | 'coin_balance'
  | 'coin_wins'
  | 'coin_losses'
  | 'coin_updated_at'
> & {
  skill_level_name?: string | null;
};

type ProfileLookupClient = Pick<SupabaseClient<Database, any, any>, 'from'>;

const ADMIN_ROLE_ALIASES = new Set(['admin', 'administrator', '관리자']);
const MANAGER_ROLE_ALIASES = new Set(['manager', '매니저', '운영자']);
const USER_ROLE_ALIASES = new Set(['user', 'member', '일반 사용자', '일반회원']);

export function normalizeRole(role: unknown): string | null {
  if (typeof role !== 'string') {
    return null;
  }

  const normalized = role.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (ADMIN_ROLE_ALIASES.has(normalized)) {
    return 'admin';
  }

  if (MANAGER_ROLE_ALIASES.has(normalized)) {
    return 'manager';
  }

  if (USER_ROLE_ALIASES.has(normalized)) {
    return 'user';
  }

  return normalized;
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'admin';
}

export function isManagerRole(role: unknown): boolean {
  return normalizeRole(role) === 'manager';
}

export function isAdminOrManagerRole(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'manager';
}

export function getRoleFromUser(user: User | null | undefined): string | null {
  if (!user) {
    return null;
  }

  return normalizeRole(user.app_metadata?.role ?? user.user_metadata?.role);
}

export async function getProfileByUserId(
  supabase: ProfileLookupClient,
  userId: string
): Promise<AppProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      user_id,
      username,
      full_name,
      email,
      role,
      skill_level,
      gender,
      avatar_url,
      created_at,
      updated_at,
      coin_balance,
      coin_wins,
      coin_losses,
      coin_updated_at,
      level_info:level_info!skill_level(name)
    `)
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Profile lookup error:', error);
    return null;
  }

  const profiles = Array.isArray(data)
    ? (data as any[]).map((profile) => ({
        ...profile,
        skill_level_name: profile?.level_info?.name || null,
      })) as AppProfile[]
    : data
      ? [{
          ...(data as any),
          skill_level_name: (data as any)?.level_info?.name || null,
        } as AppProfile]
      : [];

  if (profiles.length === 0) {
    return null;
  }

  if (profiles.length > 1) {
    console.warn('Multiple profiles matched the same user id, selecting the best candidate.', {
      userId,
      profileIds: profiles.map((profile) => profile.id),
    });
  }

  const rankedProfiles = [...profiles].sort((left, right) => {
    const score = (profile: AppProfile) => {
      let value = 0;

      if (profile.user_id === userId) value += 4;
      if (profile.id === userId) value += 2;
      if (isAdminRole(profile.role)) value += 1;

      return value;
    };

    return score(right) - score(left);
  });

  return rankedProfiles[0] ?? null;
}

export async function getUserRole(
  supabase: ProfileLookupClient,
  user: User | null | undefined
): Promise<string | null> {
  if (!user) {
    return null;
  }

  const profile = await getProfileByUserId(supabase, user.id);
  const profileRole = normalizeRole(profile?.role);
  const userRole = getRoleFromUser(user);

  if (isAdminRole(profileRole) || isAdminRole(userRole)) {
    return 'admin';
  }

  if (isManagerRole(profileRole) || isManagerRole(userRole)) {
    return 'manager';
  }

  return profileRole ?? userRole;
}

export async function isUserAdmin(
  supabase: ProfileLookupClient,
  user: User | null | undefined
): Promise<boolean> {
  return isAdminRole(await getUserRole(supabase, user));
}
