import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { isUserAdmin } from '@/lib/auth';

type CreateRecurringTemplatePayload = {
  name?: string;
  description?: string;
  day_of_weeks?: number[];
  start_time?: string;
  end_time?: string;
  location?: string;
  max_participants?: number;
  advance_days?: number;
};

const VALID_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const adminSupabase = getSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await isUserAdmin(supabase, user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as CreateRecurringTemplatePayload;
    const name = body.name?.trim();
    const description = body.description?.trim() || null;
    const location = body.location?.trim();
    const startTime = body.start_time;
    const endTime = body.end_time;
    const maxParticipants = body.max_participants;
    const advanceDays = body.advance_days;
    const dayOfWeeks = Array.from(
      new Set((body.day_of_weeks || []).filter((day): day is number => VALID_DAYS.has(day)))
    ).sort((a, b) => a - b);

    if (!name || !location || !startTime || !endTime || dayOfWeeks.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const rows = dayOfWeeks.map((dayOfWeek) => ({
      name,
      description,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location,
      max_participants: maxParticipants ?? 20,
      advance_days: advanceDays ?? 7,
      created_by: user.id,
    }));

    const { error: insertError } = await adminSupabase
      .from('recurring_match_templates')
      .insert(rows);

    if (insertError) {
      console.error('Recurring template insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create templates' }, { status: 500 });
    }

    return NextResponse.json({ created: rows.length });
  } catch (error) {
    console.error('Recurring template API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
