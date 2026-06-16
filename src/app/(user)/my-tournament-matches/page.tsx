'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MyTournamentMatchesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/my-schedule?tab=tournaments');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">🏆</div>
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">내 경기 센터로 이동 중</h1>
        <p className="mb-6 text-sm text-gray-600">
          대회 경기는 이제 내 경기 센터의 대회 탭에서 함께 확인할 수 있습니다.
        </p>
        <Link
          href="/my-schedule?tab=tournaments"
          className="inline-flex rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
        >
          바로 이동
        </Link>
      </div>
    </div>
  );
}
