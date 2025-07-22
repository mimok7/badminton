'use client';

import Link from 'next/link';
import { useUser } from '@/hooks/useUser';

export default function UnauthorizedPage() {
  const { user, profile, isAdmin } = useUser();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-600 mb-4">
            이 페이지에 접근하려면 관리자 권한이 필요합니다.
          </p>
        </div>

        {/* 사용자 정보 표시 */}
        {user && profile && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-gray-900 mb-2">현재 로그인 정보</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">사용자:</span> {profile.username || profile.full_name || '이름 없음'}</p>
              <p><span className="font-medium">권한:</span> {isAdmin ? '관리자' : '일반 사용자'}</p>
              <p><span className="font-medium">레벨:</span> {profile.skill_level?.toUpperCase() || 'N'}</p>
            </div>
          </div>
        )}

        {!user && (
          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              로그인이 필요합니다. 먼저 로그인해주세요.
            </p>
          </div>
        )}

        {/* 행동 버튼들 */}
        <div className="space-y-3">
          <Link 
            href="/dashboard"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded font-medium inline-block transition-colors"
          >
            대시보드로 이동
          </Link>
          
          {!user && (
            <Link 
              href="/login"
              className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium inline-block transition-colors"
            >
              로그인하기
            </Link>
          )}

          <Link 
            href="/"
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded font-medium inline-block transition-colors"
          >
            홈으로 이동
          </Link>
        </div>

        {/* 관리자 권한 요청 안내 */}
        {user && !isAdmin && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800 text-sm">
              <strong>관리자 권한이 필요하신가요?</strong><br />
              클럽 관리자에게 문의하여 권한 승급을 요청하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
