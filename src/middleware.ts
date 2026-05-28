import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const pathname = req.nextUrl.pathname;
    
    // change-password 페이지는 언제나 접근 가능
    if (pathname === '/change-password') {
      return res;
    }

    const mustChangePassword = Boolean(session?.user?.user_metadata?.must_change_password);

    if (session && mustChangePassword) {
      const url = req.nextUrl.clone();
      url.pathname = '/change-password';
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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};