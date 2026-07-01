import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminUser } from '@/types';
import UserManagementClient from './UserManagementClient';

export const dynamic = 'force-dynamic';

export default async function AdminMembersPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: users, error } = await supabase.rpc('get_all_users');

  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-10 p-6 bg-white shadow rounded text-red-500">
        <h2 className="text-2xl font-bold mb-4 text-center">접근 불가</h2>
        <p className="text-center">이 페이지는 관리자만 접근할 수 있습니다.</p>
        <p className="text-center mt-2 text-sm text-gray-500">오류: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-10 p-6">
      <UserManagementClient users={users as AdminUser[]} myUserId={session.user.id} />
    </div>
  );
}