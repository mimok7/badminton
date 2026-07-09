'use client';

import { useEffect, useState } from 'react';
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
  const { user, profile, loading: userLoading, isAdmin } = useUser();
  const router = useRouter();
  
  const [clubRole, setClubRole] = useState<string | null>(null);
  const [isCheckingClub, setIsCheckingClub] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    // 관리자 권한이 필요하지만 글로벌 관리자가 아닌 경우 클럽 내 역할 확인
    // 무한루프 방지를 위해 clubRole이 이미 확인되었거나 확인 중이면 실행하지 않음
    if (requireAdmin && userId && !isAdmin && !isAdminOrManagerRole(profile?.role) && clubRole === null && !isCheckingClub) {
      let isMounted = true;
      setIsCheckingClub(true);
      fetch('/api/user/active-club')
        .then(res => res.json())
        .then(data => {
          if (isMounted) {
            setClubRole(data.clubRole || 'none');
            setIsCheckingClub(false);
          }
        })
        .catch(err => {
          console.error('Error fetching club role in AuthGuard:', err);
          if (isMounted) {
            setClubRole('error');
            setIsCheckingClub(false);
          }
        });
      return () => { isMounted = false; };
    }
  }, [requireAdmin, userId, isAdmin, profile?.role, clubRole, isCheckingClub]);

  const loading = userLoading || isCheckingClub;
  const isClubManager = clubRole === 'manager' || clubRole === 'admin';
  const canAccessAdmin = isAdmin || isAdminOrManagerRole(profile?.role) || isClubManager;

  useEffect(() => {
    if (loading) return;

    // 인증이 필요한 페이지인데 로그인하지 않은 경우
    if (requireAuth && !user) {
      console.log('🚫 인증 필요: 로그인 페이지로 리다이렉트');
      router.replace(redirectTo);
      return;
    }

    // 관리자 권한이 필요한 페이지인데 관리자가 아닌 경우
    if (requireAdmin && (!userId || !canAccessAdmin)) {
      console.log('🚫 관리자 권한 필요: 접근 거부');
      router.replace('/unauthorized');
      return;
    }
  }, [userId, loading, isAdmin, canAccessAdmin, requireAuth, requireAdmin, router, redirectTo]);

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
  if (requireAdmin && (!userId || !canAccessAdmin)) {
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
