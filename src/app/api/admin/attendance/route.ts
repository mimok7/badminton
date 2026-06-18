import { NextResponse } from 'next/server';

import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';

type AttendanceStatus = 'present' | 'lesson' | 'absent';

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === 'present' || value === 'lesson' || value === 'absent';
}

function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const userRole = await getUserRole(supabase, user);
  if (!userRole || !['admin', 'manager'].includes(userRole)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminSupabase };
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdmin();
    if ('error' in adminContext) {
      return adminContext.error;
    }

    const body = await request.json().catch(() => null);
    const userIds = Array.isArray(body?.userIds) ? body.userIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '') : [];
    const status = body?.status;
    const attendedAt = typeof body?.attendedAt === 'string' && body.attendedAt ? body.attendedAt : getTodayLocal();

    if (!isAttendanceStatus(status)) {
      return NextResponse.json({ error: 'Invalid attendance status' }, { status: 400 });
    }

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'User ids are required' }, { status: 400 });
    }

    const rows = userIds.map((userId) => ({
      user_id: userId,
      attended_at: attendedAt,
      status,
    }));

    const { error } = await adminContext.adminSupabase
      .from('attendances')
      .upsert(rows, { onConflict: 'user_id,attended_at' });

    if (error) {
      console.error('Admin attendance save error:', error);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, attendedAt, status, count: rows.length });
  } catch (error) {
    console.error('Admin attendance POST unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}