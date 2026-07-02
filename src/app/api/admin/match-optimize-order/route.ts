import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getKoreaDate } from '@/lib/date';
import { isAdminOrManagerRole } from '@/lib/auth';

function addMinutesToTimeString(time: string | null | undefined, minutesToAdd: number) {
  if (!time) return null;
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const totalMinutes = hour * 60 + minute + minutesToAdd;
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nextHour = Math.floor(normalizedMinutes / 60);
  const nextMinute = normalizedMinutes % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}:00`;
}

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const adminSupabase = getSupabaseAdminClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!isAdminOrManagerRole((profile as any)?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const targetDate = body.date || getKoreaDate();

    // 1. Fetch today's scheduled matches
    const { data: schedules, error: schedulesError } = await adminSupabase
      .from('match_schedules')
      .select('id, generated_match_id, court_number, description, scheduled_time, start_time')
      .eq('match_date', targetDate)
      .eq('status', 'scheduled');

    if (schedulesError) throw schedulesError;
    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ message: 'No matches to optimize' });
    }

    // 2. Fetch corresponding generated_matches to get players
    const generatedMatchIds = schedules
      .map((s) => s.generated_match_id)
      .filter((id): id is number => typeof id === 'number');

    const { data: generatedMatches, error: generatedError } = await adminSupabase
      .from('generated_matches')
      .select('id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
      .in('id', generatedMatchIds);

    if (generatedError) throw generatedError;

    const matchMap = new Map<number, { id: number; team1_player1_id: string | null; team1_player2_id: string | null; team2_player1_id: string | null; team2_player2_id: string | null; }>();
    generatedMatches?.forEach((gm) => matchMap.set(gm.id, gm));

    // 3. Fetch today's attendances
    const { data: attendances, error: attendanceError } = await adminSupabase
      .from('attendances')
      .select('user_id, status')
      .eq('attended_at', targetDate);

    if (attendanceError) throw attendanceError;

    const presentUserIds = new Set(
      (attendances || [])
        .filter((a) => a.status === 'present' || a.status === 'lesson')
        .map((a) => a.user_id)
    );

    // 4. Determine latecomers
    const schedulesWithLatecomers = schedules.map((schedule) => {
      const gm = schedule.generated_match_id ? matchMap.get(schedule.generated_match_id) : null;
      let hasLatecomer = false;

      if (gm) {
        const players = [
          gm.team1_player1_id,
          gm.team1_player2_id,
          gm.team2_player1_id,
          gm.team2_player2_id,
        ].filter((id): id is string => Boolean(id));

        hasLatecomer = players.some((playerId) => !presentUserIds.has(playerId));
      }

      return {
        ...schedule,
        hasLatecomer,
      };
    });

    const normalMatches = schedulesWithLatecomers.filter(m => !m.hasLatecomer);
    const latecomerMatches = schedulesWithLatecomers.filter(m => m.hasLatecomer);

    // 5. Fetch active courts
    const { data: courts, error: courtsError } = await supabase
      .from('courts')
      .select('order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true, nullsFirst: true });
      
    if (courtsError) throw courtsError;
    
    const courtNumbers = courts && courts.length > 0 
      ? (courts as any[]).map((c, idx) => c.order_index ?? idx + 1)
      : [1, 2, 3, 4];
      
    const N = courtNumbers.length;

    // 6. Slot-based Match Assigner
    const orderedMatches: Array<{ match: typeof schedulesWithLatecomers[0]; slotIdx: number }> = [];
    const playerLastSlot = new Map<string, number>();

    const assignMatches = (matchesToAssign: typeof schedulesWithLatecomers) => {
       const courtsMap = new Map<number, typeof schedulesWithLatecomers>();
       matchesToAssign.forEach(match => {
          const court = match.court_number || 1;
          if (!courtsMap.has(court)) courtsMap.set(court, []);
          courtsMap.get(court)!.push(match);
       });
       
       const activeCourts = Array.from(courtsMap.keys()).sort((a,b) => a-b);
       const maxMatches = Math.max(0, ...activeCourts.map(c => courtsMap.get(c)!.length));
       
       const currentMaxSlot = playerLastSlot.size > 0 ? Math.max(...Array.from(playerLastSlot.values())) : -1;
       
       for (let slotIdx = 0; slotIdx < maxMatches; slotIdx++) {
          const absoluteSlot = currentMaxSlot + 1 + slotIdx;
          
          // Track which players are already assigned this round (across courts)
          const thisRoundPlayers = new Set<string>();
          
          for (const court of activeCourts) {
             const unassigned = courtsMap.get(court)!;
             if (unassigned.length === 0) continue;
             
             let bestMatchIdx = 0;
             let bestScore = -Infinity;
             
             for (let i = 0; i < unassigned.length; i++) {
                const match = unassigned[i];
                let score = 0;
                const gm = match.generated_match_id ? matchMap.get(match.generated_match_id) : null;
                if (gm) {
                   const players = [
                     gm.team1_player1_id,
                     gm.team1_player2_id,
                     gm.team2_player1_id,
                     gm.team2_player2_id,
                   ].filter(Boolean) as string[];
                   
                   for (const p of players) {
                      // Hard block: same round, different court (same time)
                      if (thisRoundPlayers.has(p)) {
                         score -= 100000000;
                         continue;
                      }
                      
                      const lastSlot = playerLastSlot.get(p);
                      if (lastSlot !== undefined) {
                         const distance = absoluteSlot - lastSlot;
                         if (distance === 0) {
                            score -= 100000000; // Same time slot
                         } else if (distance === 1) {
                            score -= 1000000; // Back-to-back (no rest)
                         } else {
                            score += distance * 10; // Encourage longer rest
                         }
                      } else {
                         score += 10000; // Never played
                      }
                   }
                }
                
                if (score > bestScore) {
                   bestScore = score;
                   bestMatchIdx = i;
                }
             }
             
             const selectedMatch = unassigned.splice(bestMatchIdx, 1)[0];
             orderedMatches.push({ match: selectedMatch, slotIdx: absoluteSlot });
             
             const gm = selectedMatch.generated_match_id ? matchMap.get(selectedMatch.generated_match_id) : null;
             if (gm) {
                const players = [
                  gm.team1_player1_id,
                  gm.team1_player2_id,
                  gm.team2_player1_id,
                  gm.team2_player2_id,
                ].filter(Boolean) as string[];
                players.forEach(p => {
                  playerLastSlot.set(p, absoluteSlot);
                  thisRoundPlayers.add(p);
                });
             }
          }
       }
    };

    assignMatches(normalMatches);
    assignMatches(latecomerMatches);

    const existingTimes = schedulesWithLatecomers
      .map(s => s.scheduled_time || s.start_time)
      .filter((t): t is string => Boolean(t && t.trim() !== ''))
      .sort();

    const baseTime = existingTimes[0] || "17:00:00";

    // 7. Build updates — use slotIdx for time so all courts in the same round share the same time
    // This ensures a player CANNOT be in two different courts at the same time
    const allResults = orderedMatches;
    
    const updates = allResults.map(({ match: schedule, slotIdx }) => {
      // slotIdx is the absolute round index — same for all courts in the same round
      const matchTime = addMinutesToTimeString(baseTime, slotIdx * 10);

      return {
        id: schedule.id,
        scheduled_time: matchTime,
      };
    });

    // 8. Update match_schedules.scheduled_time only — safe, no unique constraint
    for (const update of updates) {
      const { error: updateError } = await adminSupabase
        .from('match_schedules')
        .update({ scheduled_time: update.scheduled_time })
        .eq('id', update.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true, count: updates.length });
  } catch (error) {
    console.error('Match optimize order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
