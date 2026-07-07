import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-server';
import { getKoreaDate } from '@/lib/date';

export async function GET() {
  try {
    const adminSupabase = getSupabaseAdminClient();
    const today = getKoreaDate();

    // 1. Fetch all profiles
    const { data: allProfiles } = await adminSupabase
      .from('profiles')
      .select('id, username, full_name, is_guest');

    // 2. Fetch today's attendances
    const { data: todayAttendances } = await adminSupabase
      .from('attendances')
      .select('*')
      .eq('attended_at', today);

    // 3. Fetch today's schedules
    const { data: todaySchedules } = await adminSupabase
      .from('match_schedules')
      .select('*')
      .eq('match_date', today);

    const scheduleIds = (todaySchedules || []).map(s => s.id);
    
    // 4. Fetch today's participants
    let todayParticipants = [];
    if (scheduleIds.length > 0) {
      const { data } = await adminSupabase
        .from('match_participants')
        .select('*')
        .in('match_schedule_id', scheduleIds);
      todayParticipants = data || [];
    }

    return NextResponse.json({
      today,
      profilesCount: allProfiles?.length || 0,
      allProfiles: allProfiles?.slice(0, 10),
      todayAttendances,
      todaySchedules,
      todayParticipants,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
