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

async function syncAutoLinkedScheduleParticipants(params: {
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>;
  attendedAt: string;
  userIds: string[];
  status: AttendanceStatus;
}) {
  const { adminSupabase, attendedAt, userIds, status } = params;

  const { data: baseSchedules, error: schedulesError } = await adminSupabase
    .from('match_schedules')
    .select('id')
    .eq('match_date', attendedAt)
    .is('generated_match_id', null)
    .order('start_time', { ascending: true });

  if (schedulesError) {
    console.error('Admin attendance schedule sync lookup error:', schedulesError);
    return { autoLinkedScheduleId: null as string | null };
  }

  if (!baseSchedules || baseSchedules.length !== 1) {
    return { autoLinkedScheduleId: null as string | null };
  }

  const autoLinkedScheduleId = baseSchedules[0].id;

  const { data: existingParticipants, error: existingParticipantsError } = await adminSupabase
    .from('match_participants')
    .select('id, user_id, status')
    .eq('match_schedule_id', autoLinkedScheduleId)
    .in('user_id', userIds);

  if (existingParticipantsError) {
    console.error('Admin attendance participant sync lookup error:', existingParticipantsError);
    return { autoLinkedScheduleId };
  }

  const existingByUserId = new Map((existingParticipants || []).map((participant) => [participant.user_id, participant]));

  if (status === 'present' || status === 'lesson') {
    const missingUserIds = userIds.filter((userId) => !existingByUserId.has(userId));

    if (missingUserIds.length > 0) {
      const { error: insertError } = await adminSupabase
        .from('match_participants')
        .insert(
          missingUserIds.map((userId) => ({
            match_schedule_id: autoLinkedScheduleId,
            user_id: userId,
            status: 'registered',
          }))
        );

      if (insertError) {
        console.error('Admin attendance participant sync insert error:', insertError);
      }
    }

    const reactivateParticipantIds = (existingParticipants || [])
      .filter((participant) => participant.status !== 'registered' && participant.status !== 'attended')
      .map((participant) => participant.id);

    if (reactivateParticipantIds.length > 0) {
      const { error: reactivateError } = await adminSupabase
        .from('match_participants')
        .update({
          status: 'registered',
          registered_at: new Date().toISOString(),
        })
        .in('id', reactivateParticipantIds);

      if (reactivateError) {
        console.error('Admin attendance participant sync reactivate error:', reactivateError);
      }
    }
  } else {
    const activeParticipantIds = (existingParticipants || [])
      .filter((participant) => participant.status === 'registered' || participant.status === 'attended')
      .map((participant) => participant.id);

    if (activeParticipantIds.length > 0) {
      const { error: cancelError } = await adminSupabase
        .from('match_participants')
        .update({ status: 'cancelled' })
        .in('id', activeParticipantIds);

      if (cancelError) {
        console.error('Admin attendance participant sync cancel error:', cancelError);
      }
    }
  }

  const { count, error: countError } = await adminSupabase
    .from('match_participants')
    .select('*', { count: 'exact', head: true })
    .eq('match_schedule_id', autoLinkedScheduleId)
    .in('status', ['registered', 'attended']);

  if (countError) {
    console.error('Admin attendance participant sync recount error:', countError);
    return { autoLinkedScheduleId };
  }

  const { error: scheduleUpdateError } = await adminSupabase
    .from('match_schedules')
    .update({ current_participants: count || 0 })
    .eq('id', autoLinkedScheduleId);

  if (scheduleUpdateError) {
    console.error('Admin attendance schedule count update error:', scheduleUpdateError);
  }

  return { autoLinkedScheduleId };
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdmin();
    if ('error' in adminContext) {
      return adminContext.error;
    }

    const body = await request.json().catch(() => null);
    const userIds: string[] = Array.isArray(body?.userIds)
      ? body.userIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '')
      : [];
    const status = body?.status;
    const attendedAt = typeof body?.attendedAt === 'string' && body.attendedAt ? body.attendedAt : getTodayLocal();

    if (!isAttendanceStatus(status)) {
      return NextResponse.json({ error: 'Invalid attendance status' }, { status: 400 });
    }

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'User ids are required' }, { status: 400 });
    }

    const { autoLinkedScheduleId } = await syncAutoLinkedScheduleParticipants({
      adminSupabase: adminContext.adminSupabase,
      attendedAt,
      userIds,
      status,
    });

    const rows = userIds.map((userId: string) => ({
      user_id: userId,
      attended_at: attendedAt,
      status,
      match_schedule_id: status === 'present' || status === 'lesson' ? autoLinkedScheduleId : null,
    }));

    const { error } = await adminContext.adminSupabase
      .from('attendances')
      .upsert(rows, { onConflict: 'user_id,attended_at' });

    if (error) {
      console.error('Admin attendance save error:', error);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      attendedAt,
      status,
      count: rows.length,
      autoLinkedScheduleId,
    });
  } catch (error) {
    console.error('Admin attendance POST unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
