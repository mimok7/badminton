'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 개발환경에서도 어드레스바의 PWA 설치 아이콘을 띄우기 위해 항상 서비스워커를 등록합니다.
    // sw.js는 Network-First 정책을 사용하므로 개발 시 파일 수정사항 노출에 방해를 주지 않습니다.
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failures in unsupported or locked-down browsers.
    });
  }, []);

  return null;
}
