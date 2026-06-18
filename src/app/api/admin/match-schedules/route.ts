import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { isUserAdmin } from '@/lib/auth';
import { getKoreaDate } from '@/lib/date';
import {
  decorateDescriptionForScheduleSource,
  inferScheduleSource,
  normalizeScheduleSource,
} from '@/lib/match-schedule-source';

type ParticipantProfile = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  full_name?: string | null;
};

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

  if (!(await isUserAdmin(supabase, user))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase, adminSupabase, user };
}

export async function GET(request: Request) {
  try {
    const adminContext = await requireAdmin();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { adminSupabase } = adminContext;

    const requestUrl = new URL(request.url);
    const dateParam = requestUrl.searchParams.get('date');
    const fromDateParam = requestUrl.searchParams.get('from_date');
    const statusParam = requestUrl.searchParams.get('status');
    const scheduleSourceParam = requestUrl.searchParams.get('schedule_source');
    const profilesQueryParam = requestUrl.searchParams.get('profiles_query');
    const profilesAllParam = requestUrl.searchParams.get('profiles_all');

    const todayDate = getKoreaDate();
    const exactDate = dateParam === 'today' ? todayDate : dateParam;
    const fromDate = fromDateParam === 'today' || !fromDateParam ? todayDate : fromDateParam;
    const shouldFetchAllProfiles = profilesAllParam === '1' || profilesAllParam === 'true';

    const scheduleSource = scheduleSourceParam ? normalizeScheduleSource(scheduleSourceParam) : null;

    if (profilesQueryParam !== null) {
      const normalizedQuery = profilesQueryParam.trim();

      let profilesQuery = adminSupabase
        .from('profiles')
        .select('id, user_id, username, full_name')
        .not('user_id', 'is', null)
        .limit(shouldFetchAllProfiles ? 500 : 20);

      if (normalizedQuery.length > 0) {
        const escapedQuery = normalizedQuery.replace(/[%_,]/g, (value) => `\\${value}`);
        profilesQuery = profilesQuery.or(
          `username.ilike.%${escapedQuery}%,full_name.ilike.%${escapedQuery}%`
        );
      } else {
        profilesQuery = profilesQuery.order('full_name', { ascending: true }).order('username', { ascending: true });
      }

      const { data: profilesData, error: profilesError } = await profilesQuery;

      if (profilesError) {
        console.error('Admin profiles search error:', profilesError);
        return NextResponse.json({ error: 'Failed to search profiles' }, { status: 500 });
      }

      const profiles = (profilesData || []).map((profile) => ({
        id: profile.id,
        user_id: profile.user_id,
        username: profile.username,
        full_name: profile.full_name,
      }));

      return NextResponse.json({ profiles });
    }

    const buildSchedulesQuery = (includeScheduleSourceFilter: boolean) => {
      let query = adminSupabase
        .from('match_schedules')
        .select('*')
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (exactDate) {
        query = query.eq('match_date', exactDate);
      } else {
        query = query.gte('match_date', fromDate);
      }

      if (statusParam) {
        query = query.eq('status', statusParam);
      }

      if (includeScheduleSourceFilter && scheduleSource) {
        query = query.eq('schedule_source', scheduleSource);
      }

      return query;
    };

    let { data: schedulesData, error: schedulesError } = await buildSchedulesQuery(true);

    if (schedulesError?.code === '42703') {
      const fallback = await buildSchedulesQuery(false);
      schedulesData = fallback.data;
      schedulesError = fallback.error;
    }

    if (schedulesError) {
      console.error('Admin match schedules query error:', schedulesError);
      return NextResponse.json({ error: 'Failed to load match schedules' }, { status: 500 });
    }

    const filteredSchedules = (schedulesData || [])
      .map((schedule) => ({
        ...schedule,
        schedule_source: inferScheduleSource(schedule),
      }))
      .filter((schedule) => !scheduleSource || schedule.schedule_source === scheduleSource);

    if (filteredSchedules.length === 0) {
      return NextResponse.json({ schedules: [] });
    }

    const scheduleIds = filteredSchedules.map((schedule) => schedule.id);

    const { data: participantsData, error: participantsError } = await adminSupabase
      .from('match_participants')
      .select('id, match_schedule_id, user_id, registered_at, status')
      .in('match_schedule_id', scheduleIds)
      .in('status', ['registered', 'attended']);

    if (participantsError) {
      console.error('Admin match participants query error:', participantsError);
      return NextResponse.json({ error: 'Failed to load match participants' }, { status: 500 });
    }

    const participantUserIds = Array.from(
      new Set((participantsData || []).map((participant) => participant.user_id).filter(Boolean))
    );

    let profilesMap: Record<string, ParticipantProfile> = {};

    if (participantUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await adminSupabase
        .from('profiles')
        .select('id, user_id, username, full_name')
        .or(
          participantUserIds
            .map((participantUserId) => `id.eq.${participantUserId},user_id.eq.${participantUserId}`)
            .join(',')
        );

      if (profilesError) {
        console.warn('Admin participant profiles query error:', profilesError);
      } else {
        profilesMap = (profilesData || []).reduce<Record<string, ParticipantProfile>>((acc, profile) => {
          const mappedProfile = {
            id: profile.id,
            user_id: profile.user_id,
            username: profile.username,
            full_name: profile.full_name,
          };
          if (profile.id) acc[profile.id] = mappedProfile;
          if (profile.user_id) acc[profile.user_id] = mappedProfile;
          return acc;
        }, {});
      }
    }

    const participantsBySchedule = (participantsData || []).reduce<Record<string, Array<Record<string, unknown>>>>(
      (acc, participant) => {
        const scheduleId = participant.match_schedule_id;
        if (!acc[scheduleId]) {
          acc[scheduleId] = [];
        }

        acc[scheduleId].push({
          ...participant,
          profiles: profilesMap[participant.user_id]
            ? {
                username: profilesMap[participant.user_id].username ?? undefined,
                full_name: profilesMap[participant.user_id].full_name ?? undefined,
              }
            : undefined,
        });

        return acc;
      },
      {}
    );

    const schedules = filteredSchedules.map((schedule) => {
      const participants = participantsBySchedule[schedule.id] || [];

      return {
        ...schedule,
        participants,
        current_participants: participants.length,
      };
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error('Admin match schedules API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminContext = await requireAdmin();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { adminSupabase, user } = adminContext;
    const body = await request.json();

    const scheduleId = typeof body?.id === 'string' ? body.id : '';

    if (!scheduleId) {
      return NextResponse.json({ error: 'Schedule id is required' }, { status: 400 });
    }

    const payload = {
      match_date: typeof body?.match_date === 'string' ? body.match_date : null,
      start_time: typeof body?.start_time === 'string' ? body.start_time : null,
      end_time: typeof body?.end_time === 'string' ? body.end_time : null,
      location: typeof body?.location === 'string' ? body.location : null,
      max_participants: typeof body?.max_participants === 'number' ? body.max_participants : null,
      schedule_source: normalizeScheduleSource(body?.schedule_source),
      description: typeof body?.description === 'string' ? body.description : null,
      updated_by: user.id,
    };

    const { data, error } = await adminSupabase
      .from('match_schedules')
      .update(payload)
      .eq('id', scheduleId)
      .select('*')
      .single();

    if (error) {
      console.error('Admin match schedule update error:', error);
      return NextResponse.json({ error: 'Failed to update match schedule' }, { status: 500 });
    }

    return NextResponse.json({
      schedule: {
        ...data,
        schedule_source: inferScheduleSource(data),
      },
    });
  } catch (error) {
    console.error('Admin match schedule PATCH API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdmin();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { adminSupabase, user } = adminContext;
    const body = await request.json().catch(() => null);
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action === 'create_schedule') {
      const matchDate = typeof body?.match_date === 'string' ? body.match_date : '';
      const startTime = typeof body?.start_time === 'string' ? body.start_time : '';
      const endTime = typeof body?.end_time === 'string' ? body.end_time : '';
      const location = typeof body?.location === 'string' ? body.location.trim() : '';
      const maxParticipants =
        typeof body?.max_participants === 'number' && Number.isFinite(body.max_participants)
          ? Math.max(1, Math.floor(body.max_participants))
          : 20;
      const scheduleSource = normalizeScheduleSource(body?.schedule_source);
      const rawDescription = typeof body?.description === 'string' ? body.description : '';

      if (!matchDate || !startTime || !endTime || !location) {
        return NextResponse.json({ error: 'Required fields are missing' }, { status: 400 });
      }

      const { data: existingSlot, error: existingSlotError } = await adminSupabase
        .from('match_schedules')
        .select('id')
        .eq('match_date', matchDate)
        .eq('start_time', startTime)
        .eq('end_time', endTime)
        .eq('location', location)
        .limit(1)
        .maybeSingle();

      if (existingSlotError) {
        console.error('Admin schedule duplicate check error:', existingSlotError);
        return NextResponse.json({ error: 'Failed to validate duplicate schedule' }, { status: 500 });
      }

      if (existingSlot) {
        return NextResponse.json({ error: 'Duplicate slot already exists' }, { status: 409 });
      }

      const basePayload = {
        match_date: matchDate,
        start_time: startTime,
        end_time: endTime,
        location,
        max_participants: maxParticipants,
        current_participants: 0,
        status: 'scheduled',
        description: decorateDescriptionForScheduleSource(rawDescription, scheduleSource),
        created_by: user.id,
        updated_by: user.id,
      };

      let insertResult = await adminSupabase
        .from('match_schedules')
        .insert({
          ...basePayload,
          schedule_source: scheduleSource,
        })
        .select('*')
        .single();

      if ((insertResult.error as { code?: string } | null)?.code === '42703') {
        insertResult = await adminSupabase
          .from('match_schedules')
          .insert(basePayload)
          .select('*')
          .single();
      }

      if (insertResult.error) {
        const insertError = insertResult.error as { code?: string; message?: string };

        if (insertError.code === '23505') {
          return NextResponse.json({ error: 'Duplicate slot already exists' }, { status: 409 });
        }

        console.error('Admin schedule create error:', insertResult.error);
        return NextResponse.json({ error: 'Failed to create match schedule' }, { status: 500 });
      }

      return NextResponse.json({
        schedule: {
          ...insertResult.data,
          schedule_source: inferScheduleSource(insertResult.data),
        },
      });
    }

    const scheduleId = typeof body?.scheduleId === 'string' ? body.scheduleId : '';
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : user.id;

    if (!['join', 'add_participant'].includes(action) || !scheduleId || !targetUserId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: existingParticipant, error: existingParticipantError } = await adminSupabase
      .from('match_participants')
      .select('id, status, registered_at')
      .eq('match_schedule_id', scheduleId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (existingParticipantError) {
      console.error('Admin match participant lookup error:', existingParticipantError);
      return NextResponse.json({ error: 'Failed to check participation' }, { status: 500 });
    }

    if (existingParticipant?.status === 'registered') {
      return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    }

    let participant;

    if (existingParticipant) {
      const { data, error } = await adminSupabase
        .from('match_participants')
        .update({
          status: 'registered',
          registered_at: new Date().toISOString(),
        })
        .eq('id', existingParticipant.id)
        .select('id, match_schedule_id, user_id, registered_at, status')
        .single();

      if (error) {
        console.error('Admin match participant re-register error:', error);
        return NextResponse.json({ error: 'Failed to register for match' }, { status: 500 });
      }

      participant = data;
    } else {
      const { data, error } = await adminSupabase
        .from('match_participants')
        .insert({
          match_schedule_id: scheduleId,
          user_id: targetUserId,
          status: 'registered',
        })
        .select('id, match_schedule_id, user_id, registered_at, status')
        .single();

      if (error) {
        console.error('Admin match participant insert error:', error);
        return NextResponse.json({ error: 'Failed to register for match' }, { status: 500 });
      }

      participant = data;
    }

    const { data: participantProfile } = await adminSupabase
      .from('profiles')
      .select('id, user_id, username, full_name')
      .or(`id.eq.${targetUserId},user_id.eq.${targetUserId}`)
      .limit(1)
      .maybeSingle();

    const { count, error: countError } = await adminSupabase
      .from('match_participants')
      .select('*', { count: 'exact', head: true })
      .eq('match_schedule_id', scheduleId)
      .in('status', ['registered', 'attended']);

    if (countError) {
      console.error('Admin match participant count error:', countError);
      return NextResponse.json({ error: 'Failed to update participant count' }, { status: 500 });
    }

    await adminSupabase
      .from('match_schedules')
      .update({ current_participants: count || 0 })
      .eq('id', scheduleId);

    return NextResponse.json({
      participant: {
        ...participant,
        profiles: participantProfile
          ? {
              username: participantProfile.username ?? undefined,
              full_name: participantProfile.full_name ?? undefined,
            }
          : undefined,
      },
      currentParticipants: count || 0,
    });
  } catch (error) {
    console.error('Admin match schedules POST API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminContext = await requireAdmin();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { adminSupabase, user } = adminContext;
    const body = await request.json().catch(() => null);
    const scheduleId = typeof body?.scheduleId === 'string' ? body.scheduleId : '';
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : user.id;

    if (!scheduleId || !targetUserId) {
      return NextResponse.json({ error: 'Schedule id is required' }, { status: 400 });
    }

    const { error } = await adminSupabase
      .from('match_participants')
      .update({ status: 'cancelled' })
      .eq('match_schedule_id', scheduleId)
      .eq('user_id', targetUserId);

    if (error) {
      console.error('Admin match participant cancel error:', error);
      return NextResponse.json({ error: 'Failed to cancel participation' }, { status: 500 });
    }

    const { count, error: countError } = await adminSupabase
      .from('match_participants')
      .select('*', { count: 'exact', head: true })
      .eq('match_schedule_id', scheduleId)
      .in('status', ['registered', 'attended']);

    if (countError) {
      console.error('Admin match participant recount error:', countError);
      return NextResponse.json({ error: 'Failed to update participant count' }, { status: 500 });
    }

    await adminSupabase
      .from('match_schedules')
      .update({ current_participants: count || 0 })
      .eq('id', scheduleId);

    return NextResponse.json({ currentParticipants: count || 0 });
  } catch (error) {
    console.error('Admin match schedules DELETE API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
