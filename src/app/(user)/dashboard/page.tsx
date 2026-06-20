'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import ClientDashboard from './ClientDashboard';

export default function DashboardPage() {
  const { user, loading, isAdmin } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }

    if (
      !loading &&
      user &&
      isAdmin &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 768px)').matches
    ) {
      router.replace('/admin');
    }
  }, [isAdmin, loading, user, router]);

  return <ClientDashboard userId={user?.id ?? ''} email={user?.email ?? ''} />;
}
