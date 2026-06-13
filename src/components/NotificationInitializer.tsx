'use client';

import { useEffect } from 'react';
import { initializeNotificationSystem } from '@/utils/notification-service';

let hasInitializedNotificationSystem = false;

export default function NotificationInitializer() {
  useEffect(() => {
    if (hasInitializedNotificationSystem) {
      return;
    }
    
    // 앱 로드 시 한 번만 알림 시스템 초기화
    const init = async () => {
      try {
        hasInitializedNotificationSystem = true;
        await initializeNotificationSystem();
      } catch (error) {
        hasInitializedNotificationSystem = false;
        console.error('알림 시스템 초기화 실패:', error);
      }
    };

    init();
  }, []);

  return null; // 렌더링할 UI 없음
}
