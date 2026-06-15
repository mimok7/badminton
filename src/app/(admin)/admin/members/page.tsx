import { redirect } from 'next/navigation'
import type { AdminUser } from '@/types'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { isUserAdmin } from '@/lib/auth'
import UserManagementClient from './UserManagementClient'
import type { Database } from '@/types/supabase'

export const dynamic = 'force-dynamic'

export default async function AdminMembersPage() {
  const supabase = await getSupabaseServerClient()

  // 1) 세션 확인
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2) 관리자 권한 확인
  if (!(await isUserAdmin(supabase, user))) redirect('/unauthorized')

  // 3) 사용자 목록 조회 (RPC 우선, 실패 시 폴백)
  let users: AdminUser[] = []
  const rpc = await supabase.rpc('get_all_users')
  const rpcData = rpc.data as AdminUser[] | null
  if (!rpc.error && rpcData) {
  users = rpcData.slice()
  } else {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, user_id, username, full_name, role, skill_level, gender, email, updated_at')
      .order('updated_at', { ascending: false })
    if (error) {
      return (
        <div className="w-full mt-10 p-6 bg-white shadow rounded text-red-500">
          <h2 className="text-2xl font-bold mb-4 text-center">접근 불가</h2>
          <p className="text-center">이 페이지는 관리자만 접근할 수 있습니다.</p>
          <p className="text-center mt-2 text-sm text-gray-500">오류: {error.message}</p>
        </div>
      )
    }
    users = (profiles || []).map((p: any) => ({
      id: p.user_id ?? p.id,
      email: (p.email ?? '') as string,
      username: p.username ?? undefined,
      full_name: p.full_name ?? undefined,
      role: p.role ?? 'user',
      skill_level: p.skill_level ?? 'E2',
      skill_label: undefined,
      gender: p.gender ?? undefined,
      created_at: (p.updated_at ?? new Date().toISOString()) as string,
    })) as AdminUser[]
  }

  // ㄱㄴ 순 정렬: username 우선, 없으면 full_name, 없으면 email
  try {
    const collator = new Intl.Collator('ko');
    users.sort((a, b) => {
      const aKey = (a.username || a.full_name || a.email || '').toString();
      const bKey = (b.username || b.full_name || b.email || '').toString();
      return collator.compare(aKey, bKey);
    });
  } catch (e) {
    // Intl.Collator가 지원되지 않으면 기본 정렬
    users.sort((a, b) => ('' + (a.username || a.full_name || a.email)).localeCompare('' + (b.username || b.full_name || b.email)));
  }

  const { data: levelInfoRows } = await supabase
    .from('level_info')
    .select('code, name, description, score')
    .order('score', { ascending: false, nullsFirst: false })

  const levelOptions = ((levelInfoRows || []) as Array<Pick<Database['public']['Tables']['level_info']['Row'], 'code' | 'name' | 'description' | 'score'>>)
    .filter((row) => Boolean(row.code))
    .map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      score: row.score,
    }))

  // 4) 렌더
  return (
    <div className="w-full mt-10 p-6">
      <UserManagementClient users={users} myUserId={user.id} levelOptions={levelOptions} />
    </div>
  )
}
