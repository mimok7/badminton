import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  ADMIN_ROUTE_PREFIXES,
  MANAGER_ROUTE_PREFIXES,
  AUTH_ROUTE_PREFIXES,
  DEFAULT_ADMIN_REDIRECT,
  DEFAULT_USER_REDIRECT,
  matchesRoutePrefix,
} from '@/lib/route-access';
import { getUserRole, isAdminOrManagerRole, getRoleFromUser } from '@/lib/auth';
import { getClubRole } from '@/lib/club-auth';

import type { NextRequest } from 'next/server';

function shouldRequirePasswordChange(value: unknown) {
  return value === true || value === 'true';
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  req.headers.set('x-pathname', pathname);

  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // 빌드 타임 프리렌더링 시 미들웨어 리다이렉션으로 인해 번들 수집이 실패하는 문제를 방지합니다.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const isAdminRoute = matchesRoutePrefix(pathname, ADMIN_ROUTE_PREFIXES);
  const isManagerRoute = matchesRoutePrefix(pathname, MANAGER_ROUTE_PREFIXES);
  const isProtectedPath = isAdminRoute || isManagerRoute;
  const isAuthRoute = matchesRoutePrefix(pathname, AUTH_ROUTE_PREFIXES);

  // 세션 쿠키 존재 여부 검사 (보통 sb-[project-ref]-auth-token 형식)
  const hasSessionCookie = req.cookies.getAll().some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  );

  // 세션 쿠키가 없고 관리자 경로가 아닌 경우, 인증 조회(getUser)를 스킵하고 바로 통과시킵니다.
  if (!hasSessionCookie && !isProtectedPath) {
    return res;
  }

  // 만약 세션 쿠키가 없고 보호된 경로라면, 바로 로그인으로 리다이렉트합니다.
  if (!hasSessionCookie && isProtectedPath) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    
    // change-password 페이지는 언제나 접근 가능
    if (pathname === '/change-password') {
      return res;
    }

    const mustChangePassword = shouldRequirePasswordChange(
      user?.user_metadata?.must_change_password
    );

    if (user && mustChangePassword) {
      const url = req.nextUrl.clone();
      url.pathname = '/change-password';
      return NextResponse.redirect(url);
    }

    if (user && isAuthRoute) {
      const role = getRoleFromUser(user);
      const url = req.nextUrl.clone();
      if (role === 'admin') {
        url.pathname = DEFAULT_ADMIN_REDIRECT;
      } else if (role === 'manager') {
        url.pathname = '/manager'; // DEFAULT_MANAGER_REDIRECT
      } else {
        url.pathname = DEFAULT_USER_REDIRECT;
      }
      return NextResponse.redirect(url);
    }

    if (!isProtectedPath) {
      return res;
    }

    if (userError || !user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }

    const role = await getUserRole(supabase, user);
    const isGlobalAdmin = role === 'admin';

    // 1. 관리자 전용 라우트 접근 시
    if (isAdminRoute) {
      if (!isGlobalAdmin) {
        const url = req.nextUrl.clone();
        url.pathname = '/unauthorized';
        return NextResponse.redirect(url);
      }
      // 시스템 관리자이고 관리자 라우트면 클럽 쿠키가 없어도 접근 허용 (프리패스)
      return res;
    }

    // 일반 및 매니저 라우트의 경우 클럽 쿠키가 있는지 확인
    const hasClubCookie = req.cookies.has('active_club_id');
    if (user && !hasClubCookie && pathname !== '/select-club') {
      const url = req.nextUrl.clone();
      url.pathname = '/select-club';
      if (pathname !== '/') {
        url.searchParams.set('redirectTo', pathname);
      }
      return NextResponse.redirect(url);
    }

    // 2. 매니저 전용 라우트 접근 시
    if (isManagerRoute) {
      // 시스템 관리자는 프리패스
      if (isGlobalAdmin) return res;

      const activeClubId = req.cookies.get('active_club_id')?.value;
      if (!activeClubId) {
        const url = req.nextUrl.clone();
        url.pathname = '/select-club';
        url.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(url);
      }

      const clubRole = await getClubRole(supabase, user.id, activeClubId);
      if (!clubRole || !['owner', 'admin', 'manager'].includes(clubRole)) {
        const url = req.nextUrl.clone();
        url.pathname = '/unauthorized';
        return NextResponse.redirect(url);
      }
    }
  } catch (error) {
    console.error('Middleware error:', error);
  }

  return res;
}

export const config = {
  matcher: [
    // Match all request paths except for the ones starting with:
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
