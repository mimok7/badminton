'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// 사용자를 삭제하려면 서비스 키를 사용하는 별도의 관리자 클라이언트가 필요합니다.
// 이 키는 절대로 노출되어서는 안 됩니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin() {
    const supabase = createServerActionClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

    return !error && profile?.role === 'admin';
}

export async function deleteUser(userId: string) {
    if (!(await isAdmin())) {
        return { error: '삭제 권한이 없습니다.' };
    }

    // auth.users에서 삭제하면 public.profiles에서도 자동으로 삭제됩니다 (foreign key가 cascade로 설정된 경우).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/admin/members');
    return { success: true };
}

export type UpdateUserPayload = {
    username?: string | null;
    role?: 'admin' | 'user' | null;
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