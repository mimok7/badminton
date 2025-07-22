'use client';

import { useEffect } from 'react';
import { initializeNotificationSystem } from '@/utils/notification-service';

export default function NotificationInitializer() {
  useEffect(() => {
    // 앱 로드 시 한 번만 알림 시스템 초기화
    initializeNotificationSystem();
  }, []);

  return null; // 렌더링할 UI 없음
}
