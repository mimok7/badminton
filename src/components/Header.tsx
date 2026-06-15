'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { useCallback, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { getAdminLevelDisplay, getUserLevelDisplay } from '@/lib/level-display';

const USER_NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드', mobileLabel: '📈 대시보드' },
  { href: '/tournament-bracket', label: '대진표', mobileLabel: '📊 대진표' },
  { href: '/my-tournament-matches', label: '내 대회', mobileLabel: '🎪 내 대회' },
  { href: '/my-schedule', label: '나의 일정', mobileLabel: '🏸 나의 일정' },
  { href: '/profile', label: '프로필', mobileLabel: '👤 프로필' },
];

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
      return null;
    }

    return (
      <>
        {USER_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-sm font-medium hover:text-blue-600 transition-colors"
          >
            {item.label}
          </Link>
        ))}
        
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
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <nav className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Link href="/" className="flex items-center hover:opacity-80">
            <Image 
              src="/badminton.png" 
              alt="Badminton Logo" 
              width={40} 
              height={40}
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
                        {profile?.full_name || profile?.username || '사용자'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {isAdmin ? '관리자' : '회원'} | {isAdmin ? getAdminLevelDisplay(profile?.skill_level) : getUserLevelDisplay(profile?.skill_level)}
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
        <div className="md:hidden border-t border-slate-200/80 bg-white/95 duration-200 animate-in fade-in slide-in-from-top-4">
          <nav className="flex flex-col p-4 space-y-3">
            {/* 메뉴 항목 */}
            {user ? (
              <>
                {USER_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-base font-semibold text-gray-700 hover:text-blue-600 border-b border-blue-100 pb-2 transition-colors"
                  >
                    {item.mobileLabel}
                  </Link>
                ))}
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
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-gray-800">
                    {profile?.full_name || profile?.username || '사용자'}님
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {isAdmin ? '관리자' : '일반 회원'} • 등급: {isAdmin ? getAdminLevelDisplay(profile?.skill_level) : getUserLevelDisplay(profile?.skill_level)}
                  </div>
                </div>
              </>
            ) : null}
          </nav>
        </div>
      )}
    </header>
  );
}
