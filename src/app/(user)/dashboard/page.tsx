'use client';

import { useUser } from '@/hooks/useUser';
import ClientDashboard from './ClientDashboard';

export default function DashboardPage() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-700">로그인이 필요합니다.</p>
          <a href="/login" className="text-blue-600 hover:underline">
            로그인하기
          </a>
        </div>
      </div>
    );
  }

  return <ClientDashboard userId={user.id} email={user.email || ''} />;
}
