import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  ADMIN_ROUTE_PREFIXES,
  AUTH_ROUTE_PREFIXES,
  DEFAULT_ADMIN_REDIRECT,
  DEFAULT_USER_REDIRECT,
  matchesRoutePrefix,
} from '@/lib/route-access';
import { getUserRole, isAdminOrManagerRole } from '@/lib/auth';

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

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const isAdminRoute = matchesRoutePrefix(pathname, ADMIN_ROUTE_PREFIXES);
    const isAuthRoute = matchesRoutePrefix(pathname, AUTH_ROUTE_PREFIXES);
    
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
      const role = await getUserRole(supabase, user);
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
