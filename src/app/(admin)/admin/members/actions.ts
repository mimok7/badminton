'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { isUserAdmin } from '@/lib/auth';

// 사용자를 삭제하려면 서비스 키를 사용하는 별도의 관리자 클라이언트가 필요합니다.
// 이 키는 절대로 노출되어서는 안 됩니다.
const supabaseAdmin = getSupabaseAdminClient();

async function isAdmin() {
    const supabase = await getSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    return isUserAdmin(supabase, user);
}

export async function deleteUser(userId: string) {
    try {
        if (!(await isAdmin())) {
            return { error: '삭제 권한이 없습니다.' };
        }

        const profileLookup = await supabaseAdmin
            .from('profiles')
            .select('id, user_id, updated_at')
            .or(`user_id.eq.${userId},id.eq.${userId}`)
            .order('updated_at', { ascending: false });

        if (profileLookup.error) {
            return { error: profileLookup.error.message };
        }

        const matchedProfiles = (profileLookup.data || []) as Array<{ id: string; user_id: string | null }>;
        const targetProfile =
            matchedProfiles.find((profile) => profile.user_id === userId) ||
            matchedProfiles.find((profile) => profile.id === userId) ||
            matchedProfiles[0];

        if (!targetProfile) {
            return { error: '대상 사용자를 찾을 수 없습니다.' };
        }

        let warning: string | null = null;

        if (targetProfile.user_id) {
            // auth.users 삭제가 가능한 경우에는 auth 쪽을 먼저 지웁니다.
            const authDelete = await supabaseAdmin.auth.admin.deleteUser(targetProfile.user_id);

            if (authDelete.error) {
                warning = authDelete.error.message;

                // auth 삭제가 막힌 경우에도 관리자 화면에서는 확실히 제거되도록
                // 프로필을 직접 삭제하는 fallback을 수행합니다.
                const fallbackDelete = await supabaseAdmin
                    .from('profiles')
                    .delete()
                    .eq('id', targetProfile.id);

                if (fallbackDelete.error) {
                    return { error: fallbackDelete.error.message };
                }
            }
        } else {
            const { error } = await supabaseAdmin
                .from('profiles')
                .delete()
                .eq('id', targetProfile.id);

            if (error) {
                return { error: error.message };
            }
        }

        revalidatePath('/admin/members');
        return warning ? { success: true, warning } : { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '사용자 삭제 중 알 수 없는 오류가 발생했습니다.';
        return { error: message };
    }
}

export type UpdateUserPayload = {
    username?: string | null;
    full_name?: string | null;
    role?: 'admin' | 'manager' | 'user' | null;
    skill_level?: string | null;
    gender?: 'M' | 'F' | 'O' | string | null;
}

export async function updateUser(userId: string, updates: UpdateUserPayload) {
    if (!(await isAdmin())) {
        return { error: '수정 권한이 없습니다.' };
    }

    // 정리: 빈 문자열은 null로 보정
    const payload: Record<string, any> = {}
    if (updates.username !== undefined) payload.username = updates.username || null
    if (updates.full_name !== undefined) payload.full_name = updates.full_name || null
    if (updates.role !== undefined) payload.role = updates.role || 'user'
    if (updates.skill_level !== undefined) payload.skill_level = updates.skill_level || null
    if (updates.gender !== undefined) payload.gender = updates.gender || null

    // 1차: user_id 기준 업데이트
    const first = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('user_id', userId)
        .select('id')

    if (first.error) {
        return { error: first.error.message }
    }

    // 변경 행이 없는 경우 id 기준으로 재시도 (스키마 차이 대응)
    if (!first.data || first.data.length === 0) {
        const second = await supabaseAdmin
            .from('profiles')
            .update(payload)
            .eq('id', userId)
            .select('id')

        if (second.error) {
            return { error: second.error.message }
        }

        if (!second.data || second.data.length === 0) {
            return { error: '대상 사용자를 찾을 수 없습니다.' }
        }
    }

    revalidatePath('/admin/members')
    return { success: true }
}

export async function updateUsersBulk(
    items: Array<{ userId: string; updates: UpdateUserPayload }>
) {
    if (!(await isAdmin())) {
        return { error: '수정 권한이 없습니다.' };
    }

    if (!Array.isArray(items) || items.length === 0) {
        return { success: true, updatedCount: 0 };
    }

    for (const item of items) {
        const userId = item?.userId;
        const updates = item?.updates;

        if (!userId || !updates) {
            return { error: '잘못된 전체 저장 요청입니다.' };
        }

        const payload: Record<string, any> = {};
        if (updates.username !== undefined) payload.username = updates.username || null;
        if (updates.full_name !== undefined) payload.full_name = updates.full_name || null;
        if (updates.role !== undefined) payload.role = updates.role || 'user';
        if (updates.skill_level !== undefined) payload.skill_level = updates.skill_level || null;
        if (updates.gender !== undefined) payload.gender = updates.gender || null;

        const first = await supabaseAdmin
            .from('profiles')
            .update(payload)
            .eq('user_id', userId)
            .select('id');

        if (first.error) {
            return { error: first.error.message };
        }

        if (!first.data || first.data.length === 0) {
            const second = await supabaseAdmin
                .from('profiles')
                .update(payload)
                .eq('id', userId)
                .select('id');

            if (second.error) {
                return { error: second.error.message };
            }

            if (!second.data || second.data.length === 0) {
                return { error: '대상 사용자 중 일부를 찾을 수 없습니다.' };
            }
        }
    }

    revalidatePath('/admin/members');
    return { success: true, updatedCount: items.length };
}

function buildAutoEmail(fullName: string) {
    const normalized = fullName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'member';

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return `${normalized}-${suffix}@member.local`;
}

export type CreateMemberPayload = {
    full_name: string;
    skill_level?: string | null;
    gender?: 'M' | 'F' | 'O' | string | null;
    role?: 'admin' | 'manager' | 'user' | null;
};

export async function createMember(payload: CreateMemberPayload) {
    if (!(await isAdmin())) {
        return { error: '추가 권한이 없습니다.' };
    }

    const fullName = payload.full_name.trim();

    if (!fullName) {
        return { error: '이름을 입력해 주세요.' };
    }

    const insertPayload = {
        username: fullName,
        full_name: fullName,
        email: buildAutoEmail(fullName),
        role: payload.role || 'user',
        skill_level: payload.skill_level || 'N1',
        gender: payload.gender || null,
    };

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert(insertPayload)
        .select('id, user_id, username, full_name, role, skill_level, gender, email, updated_at')
        .single();

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/admin/members');
    return { success: true, member: data };
}
