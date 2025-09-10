'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '@/hooks/useUser';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useCallback, useMemo } from 'react';

export default function Header() {
  const { user, profile, isAdmin, loading } = useUser();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const handleLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ 로그아웃 오류:', error);
        alert('로그아웃 중 오류가 발생했습니다.');
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('❌ 로그아웃 중 오류:', error);
    }
  }, [supabase]);

  // 네비게이션 메뉴 메모이제이션
  const navigationMenu = useMemo(() => {
    if (loading) return null;

    if (!user) {
      return (
        <Link 
          href="/match-schedule" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          경기 일정
        </Link>
      );
    }

    return (
      <>
        <Link 
          href="/dashboard" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          대시보드
        </Link>
        <Link 
          href="/match-schedule" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          경기 일정
        </Link>
        
        <Link 
          href="/match-results" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          배정현황
        </Link>
        
        <Link 
          href="/my-schedule" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          나의 일정
        </Link>
        
        <Link 
          href="/profile" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          프로필
        </Link>
        
        {/* 관리자 전용 메뉴 */}
        {isAdmin && (
          <Link 
            href="/admin" 
            className="text-sm font-medium hover:text-blue-600 transition-colors border-l pl-4 ml-2"
          >
            관리자
          </Link>
        )}
      </>
    );
  }, [user, isAdmin, loading]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-blue-50 backdrop-blur supports-[backdrop-filter]:bg-blue-50/90">
      <nav className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center">
          <Link href="/" className="flex items-center hover:opacity-80">
            <Image 
              src="/badminton.png" 
              alt="Badminton Logo" 
              width={40} 
              height={40}
              priority
              sizes="40px"
            />
            <span className="ml-2 font-semibold">라켓 뚱보단</span>
          </Link>
        </div>
        
        {/* 사용자 정보 및 메뉴 */}
        <div className="flex items-center gap-4">
          {/* 로딩 중이 아닐 때만 메뉴 표시 */}
          {!loading && (
            <>
              {/* 네비게이션 메뉴 */}
              <div className="hidden md:flex items-center space-x-4">
                {navigationMenu}
              </div>

              {/* 사용자 정보 및 로그인/로그아웃 */}
              <div className="flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-3">
                    {/* 사용자 정보 */}
                    <div className="hidden sm:flex flex-col text-right">
                      <div className="text-sm font-medium">
                        {profile?.username || profile?.full_name || '사용자'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {isAdmin ? '관리자' : '회원'} | {profile?.skill_level?.toUpperCase() || 'N'}
                      </div>
                    </div>
                    
                    {/* 로그아웃 버튼 */}
                    <button
                      onClick={handleLogout}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                    >
                      로그아웃
                    </button>
                  </div>
                ) : (
                  /* 로그인 버튼 */
                  <Link 
                    href="/login"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    로그인
                  </Link>
                )}
              </div>
            </>
          )}

          {/* 로딩 중일 때 */}
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-sm text-gray-600">로딩 중...</span>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}