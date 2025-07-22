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