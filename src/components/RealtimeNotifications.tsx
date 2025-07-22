'use client';

import { useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { NotificationService } from '@/utils/notification-service';

export default function RealtimeNotifications() {
  const { user } = useUser();
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!user) return;

    // 실시간 알림 구독 설정
    const channel = supabase.channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, async (payload) => {
        const notification = payload.new as any;
        
        console.log('🔔 실시간 알림 수신:', notification);
        
        // 경기 준비 알림인 경우 소리와 함께 표시
        if (notification.type === 'match_preparation') {
          await NotificationService.sendNotification(
            notification.title,
            notification.message,
            {
              playSound: true,
              showBrowserNotification: true,
              icon: '🏸'
            }
          );
        } else {
          // 일반 알림
          await NotificationService.sendNotification(
            notification.title,
            notification.message,
            {
              playSound: false,
              showBrowserNotification: true
            }
          );
        }
      })
      .subscribe();

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null; // 렌더링할 UI 없음
}
