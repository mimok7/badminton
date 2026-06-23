'use client';

import { useEffect } from 'react';

export default function PerformanceMonitor() {
  useEffect(() => {
    const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true';

    if (!debugEnabled) {
      return;
    }

    // 페이지 로드 시간 측정
    const measurePageLoad = () => {
      if (typeof window !== 'undefined' && window.performance) {
        const navigationEntry = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

        if (!navigationEntry) {
          return;
        }

        const loadTime = Math.round(navigationEntry.loadEventEnd);
        const domContentLoaded = Math.round(navigationEntry.domContentLoadedEventEnd);

        console.log(`📊 성능 지표:
          - 페이지 로드 시간: ${loadTime}ms
          - DOM 콘텐츠 로드 시간: ${domContentLoaded}ms
          - 사용자 에이전트: ${navigator.userAgent.split(' ')[0]}
        `);
        
        // 로드 시간이 3초를 초과하면 경고
        if (loadTime > 3000) {
          console.warn('⚠️ 페이지 로드 시간이 3초를 초과했습니다. 성능 최적화가 필요할 수 있습니다.');
        }
      }
    };

    // DOM이 완전히 로드된 후 측정
    if (document.readyState === 'complete') {
      measurePageLoad();
    } else {
      window.addEventListener('load', measurePageLoad);
      return () => window.removeEventListener('load', measurePageLoad);
    }
  }, []);

  return null;
}
