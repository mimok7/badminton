'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ScheduleNewPage() {
  const router = useRouter();

  useEffect(() => {
    // /schedule-new로 접근한 사용자를 /match-schedule로 리다이렉트
    router.replace('/match-schedule');
  }, [router]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">경기일정 관리 페이지로 이동중...</p>
      </div>
    </div>
  );
}
