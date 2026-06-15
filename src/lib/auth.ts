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
  | 'created_at'
  | 'updated_at'
>;

type ProfileLookupClient = Pick<SupabaseClient<Database, any, any>, 'from'>;

const ADMIN_ROLE_ALIASES = new Set(['admin', 'administrator', '관리자']);
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

  if (USER_ROLE_ALIASES.has(normalized)) {
    return 'user';
  }

  return normalized;
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'admin';
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
    .select('id, user_id, username, full_name, email, role, skill_level, gender, created_at, updated_at')
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Profile lookup error:', error);
    return null;
  }

  return (data as AppProfile | null) ?? null;
}

export async function getUserRole(
  supabase: ProfileLookupClient,
  user: User | null | undefined
): Promise<string | null> {
  if (!user) {
    return null;
  }

  const profile = await getProfileByUserId(supabase, user.id);
  return normalizeRole(profile?.role) ?? getRoleFromUser(user);
}

export async function isUserAdmin(
  supabase: ProfileLookupClient,
  user: User | null | undefined
): Promise<boolean> {
  return isAdminRole(await getUserRole(supabase, user));
}
