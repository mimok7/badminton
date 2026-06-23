'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { isAdminOrManagerRole } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  redirectTo?: string;
}

export default function AuthGuard({ 
  children, 
  requireAuth = false, 
  requireAdmin = false,
  redirectTo = '/login'
}: AuthGuardProps) {
  const { user, profile, loading, isAdmin } = useUser();
  const router = useRouter();
  const canAccessAdmin = isAdmin || isAdminOrManagerRole(profile?.role);

  useEffect(() => {
    if (loading) return;

    // 인증이 필요한 페이지인데 로그인하지 않은 경우
    if (requireAuth && !user) {
      console.log('🚫 인증 필요: 로그인 페이지로 리다이렉트');
      router.replace(redirectTo);
      return;
    }

    // 관리자 권한이 필요한 페이지인데 관리자가 아닌 경우
    if (requireAdmin && (!user || !canAccessAdmin)) {
      console.log('🚫 관리자 권한 필요: 접근 거부');
      router.replace('/unauthorized');
      return;
    }
  }, [user, loading, isAdmin, canAccessAdmin, requireAuth, requireAdmin, router, redirectTo]);

  // 로딩 중일 때
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="text-gray-600">사용자 정보 확인 중...</p>
        </div>
      </div>
    );
  }

  // 인증이 필요한데 로그인하지 않은 경우
  if (requireAuth && !user) {
    return null; // 리다이렉트 중이므로 아무것도 렌더링하지 않음
  }

  // 관리자 권한이 필요한데 관리자가 아닌 경우
  if (requireAdmin && (!user || !canAccessAdmin)) {
    return null; // 리다이렉트 중이므로 아무것도 렌더링하지 않음
  }

  return <>{children}</>;
}

// 로그인이 필요한 페이지 래퍼
export function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={true}>
      {children}
    </AuthGuard>
  );
}

// 관리자 권한이 필요한 페이지 래퍼
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={true} requireAdmin={true}>
      {children}
    </AuthGuard>
  );
}
