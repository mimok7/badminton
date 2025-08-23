'use client';

import { useEffect, useRef } from 'react';
import { initializeNotificationSystem } from '@/utils/notification-service';

export default function NotificationInitializer() {
  const initialized = useRef(false);

  useEffect(() => {
    // 중복 초기화 방지
    if (initialized.current) return;
    
    // 앱 로드 시 한 번만 알림 시스템 초기화
    const init = async () => {
      try {
        await initializeNotificationSystem();
        initialized.current = true;
      } catch (error) {
        console.error('알림 시스템 초기화 실패:', error);
      }
    };

    init();
  }, []);

  return null; // 렌더링할 UI 없음
}
