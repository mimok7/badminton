'use client';

import Link from 'next/link';
import { useUser } from '@/hooks/useUser';

export default function AdminPage() {
  const { profile } = useUser();

  return (
    <div className="px-1 py-2 sm:px-2">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">관리자 대시보드</h1>
        <p className="mt-1 hidden text-gray-600 sm:block">안녕하세요, {profile?.full_name || profile?.username || '관리자'}님</p>
      </div>

      <div>
        <h2 className="mb-3 text-base font-medium text-gray-900 sm:mb-4 sm:text-lg">빠른 액션</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <Link
            href="/admin/players-today"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-blue-400 hover:bg-blue-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">⚡ 오늘경기</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">오늘 경기 생성과 배정을 진행하세요</p>
          </Link>

          <Link
            href="/match-results"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-green-400 hover:bg-green-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">🏆 경기결과</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">경기 결과를 입력하고 확인하세요</p>
          </Link>

          <Link
            href="/team-management"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-orange-400 hover:bg-orange-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">🤝 팀관리</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">대회용 팀을 구성하고 관리하세요</p>
          </Link>

          <Link
            href="/admin/tournament-matches"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-amber-400 hover:bg-amber-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">🎪 대회경기</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">대회를 생성하고 경기 일정을 관리하세요</p>
          </Link>

          <Link
            href="/admin/members"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-purple-400 hover:bg-purple-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">👥 회원관리</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">회원 정보와 권한을 관리하세요</p>
          </Link>

          <Link
            href="/admin/tournament-bracket"
            className="rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-indigo-400 hover:bg-indigo-50 sm:p-4"
          >
            <h3 className="text-sm font-medium text-gray-900 sm:text-base">📊 대진표</h3>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">대진표와 결과 현황을 확인하세요</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
