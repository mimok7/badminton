'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { Bell } from 'lucide-react';

export default function Header() {
  const { user } = useUser();
  const supabase = getSupabaseClient();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/user/notifications');
        if (!res.ok) return;
        const { notifications } = await res.json();
        const count = (notifications || []).filter((n: any) => !n.is_read).length;
        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }
    };

    fetchUnread();

    // 실시간 구독 (알림 삽입/업데이트 시 카운트 갱신)
    const channel = supabase.channel('user-notifications-header')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <nav className="mx-auto flex h-12 w-full max-w-[1600px] items-center justify-between px-3 sm:px-4 lg:px-6">
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center hover:opacity-80">
            <Image 
              src="/badminton.png" 
              alt="Badminton Logo" 
              width={28} 
              height={28}
              sizes="28px"
              priority
              suppressHydrationWarning
            />
            <span className="ml-2 text-sm font-semibold leading-none w-max">라켓 뚱보단</span>
          </Link>
        </div>

        {user && (
          <Link href="/notifications" className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 transition-colors text-slate-600">
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        )}
      </nav>
    </header>
  );
}
