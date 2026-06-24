import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const serverSupabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const adminSupabase = getSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ notifications: data || [] });
  } catch (err: any) {
    console.error('알림 조회 실패:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const serverSupabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, markAll } = body;

    const adminSupabase = getSupabaseAdminClient();

    let query = adminSupabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (!markAll && Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids);
    } else {
      query = query.eq('is_read', false);
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('알림 읽음 처리 실패:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
