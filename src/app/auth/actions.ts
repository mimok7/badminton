'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function handleSignOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
