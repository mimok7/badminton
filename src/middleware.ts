import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  ADMIN_ROUTE_PREFIXES,
  AUTH_ROUTE_PREFIXES,
  DEFAULT_ADMIN_REDIRECT,
  DEFAULT_USER_REDIRECT,
  matchesRoutePrefix,
} from '@/lib/route-access';
import { getUserRole, isAdminOrManagerRole, getRoleFromUser } from '@/lib/auth';

import type { NextRequest } from 'next/server';

function shouldRequirePasswordChange(value: unknown) {
  return value === true || value === 'true';
}

export async function middleware(req: NextRequest) {
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

  const pathname = req.nextUrl.pathname;
  const isAdminRoute = matchesRoutePrefix(pathname, ADMIN_ROUTE_PREFIXES);
  const isAuthRoute = matchesRoutePrefix(pathname, AUTH_ROUTE_PREFIXES);

  // 세션 쿠키 존재 여부 검사 (보통 sb-[project-ref]-auth-token 형식)
  const hasSessionCookie = req.cookies.getAll().some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  );

  // 세션 쿠키가 없고 관리자 경로가 아닌 경우, 인증 조회(getUser)를 스킵하고 바로 통과시킵니다.
  if (!hasSessionCookie && !isAdminRoute) {
    return res;
  }

  // 만약 세션 쿠키가 없고 관리자 경로라면, 바로 로그인으로 리다이렉트합니다.
  if (!hasSessionCookie && isAdminRoute) {
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
      url.pathname = isAdminOrManagerRole(role) ? DEFAULT_ADMIN_REDIRECT : DEFAULT_USER_REDIRECT;
      return NextResponse.redirect(url);
    }

    if (!isAdminRoute) {
      return res;
    }

    if (userError || !user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }

    const role = await getUserRole(supabase, user);

    if (!isAdminOrManagerRole(role)) {
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
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
