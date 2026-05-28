'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { useCallback, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Header() {
  const { user, profile, isAdmin, loading } = useUser();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
          href="/tournament-bracket" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          대진표
        </Link>
        
        <Link 
          href="/my-tournament-matches" 
          className="text-sm font-medium hover:text-blue-600 transition-colors"
        >
          내 대회
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
            <span className="ml-2 font-semibold w-max">라켓 뚱보단</span>
          </Link>
        </div>
        
        {/* 사용자 정보 및 메뉴 */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* 로딩 중이 아닐 때만 메뉴 표시 */}
          {!loading && (
            <>
              {/* 네비게이션 메뉴 (데스크톱) */}
              <div className="hidden md:flex items-center space-x-4">
                {navigationMenu}
              </div>

              {/* 사용자 정보 및 로그인/로그아웃 */}
              <div className="flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-2 sm:gap-3">
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

              {/* 모바일 햄버거 토글 버튼 */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex md:hidden items-center justify-center p-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-blue-100/50 transition-colors focus:outline-none"
                aria-label="메뉴 토글"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
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

      {/* 모바일 네비게이션 드로어 */}
      {isMobileMenuOpen && !loading && (
        <div className="md:hidden border-t bg-blue-50/95 duration-200 animate-in fade-in slide-in-from-top-4">
          <nav className="flex flex-col p-4 space-y-3">
            {/* 메뉴 항목 */}
            {user ? (
              <>
                <Link 
                  href="/dashboard" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  📈 대시보드
                </Link>
                <Link 
                  href="/match-schedule" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  📅 경기 일정
                </Link>
                <Link 
                  href="/match-results" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  🏆 배정현황
                </Link>
                <Link 
                  href="/tournament-bracket" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  📊 대진표
                </Link>
                <Link 
                  href="/my-tournament-matches" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  🎪 내 대회
                </Link>
                <Link 
                  href="/my-schedule" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  🏸 나의 일정
                </Link>
                <Link 
                  href="/profile" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                >
                  👤 프로필
                </Link>
                {isAdmin && (
                  <Link 
                    href="/admin" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-base font-bold text-red-600 hover:text-red-700 border-b border-blue-100 pb-2 transition-colors"
                  >
                    ⚙️ 관리자 페이지
                  </Link>
                )}
                {/* 모바일 전용 사용자 정보 패널 */}
                <div className="bg-white p-3 rounded-lg border border-blue-100 mt-2">
                  <div className="text-sm font-semibold text-gray-800">
                    {profile?.username || profile?.full_name || '사용자'}님
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {isAdmin ? '관리자' : '일반 회원'} • 등급: {profile?.skill_level?.toUpperCase() || 'E2'}
                  </div>
                </div>
              </>
            ) : (
              <Link 
                href="/match-schedule" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-base font-semibold text-gray-700 hover:text-blue-600 transition-colors"
              >
                📅 경기 일정
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}