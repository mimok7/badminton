'use client';

import { useEffect } from 'react';

export default function PerformanceMonitor() {
  useEffect(() => {
    // 페이지 로드 시간 측정
    const measurePageLoad = () => {
      if (typeof window !== 'undefined' && window.performance) {
        const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
        const domContentLoaded = window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart;
        
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
