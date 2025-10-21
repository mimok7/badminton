'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { NotificationService } from '@/utils/notification-service';

export default function RealtimeNotifications() {
  const { user } = useUser();
  const supabase = getSupabaseClient();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!user) {
      // 사용자가 없으면 기존 채널 정리
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // 기존 채널이 있으면 정리
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // 실시간 알림 구독 설정
    channelRef.current = supabase.channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, async (payload) => {
        const notification = payload.new as any;
        
        console.log('🔔 실시간 알림 수신:', notification);
        
        try {
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
        } catch (error) {
          console.error('알림 처리 중 오류:', error);
        }
      })
      .subscribe();

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, supabase]);

  return null; // 렌더링할 UI 없음
}
