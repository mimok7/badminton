'use server';

import { cookies } from 'next/headers';
import { CLUB_COOKIE_NAME } from '@/lib/club';

export async function setActiveClubAction(clubId: string) {
  const cookieStore = await cookies();
  
  // 쿠키를 30일간 유지하도록 설정
  cookieStore.set(CLUB_COOKIE_NAME, clubId, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  return { success: true };
}

export async function clearActiveClubAction() {
  const cookieStore = await cookies();
  cookieStore.delete(CLUB_COOKIE_NAME);
  return { success: true };
}
