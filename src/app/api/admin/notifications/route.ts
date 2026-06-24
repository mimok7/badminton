import { NextResponse } from 'next/server';
import { getProfileByUserId, isAdminRole } from '@/lib/auth';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

async function requireAdmin() {
  const serverSupabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient() as any;
  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);
  if (!currentProfile || !isAdminRole(currentProfile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminSupabase };
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  if ('error' in context) return context.error;

  const { adminSupabase } = context;

  try {
    const body = await request.json();
    const { payloads } = body;

    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      return NextResponse.json({ error: 'Invalid payloads' }, { status: 400 });
    }

    const { data, error } = await adminSupabase
      .from('notifications')
      .insert(payloads)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err: any) {
    console.error('Failed to insert notifications:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
