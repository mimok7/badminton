type SessionMatchRow = {
  id: number;
  match_number: number | null;
  status: string | null;
};

type SessionScheduleRow = {
  generated_match_id: number | null;
  court_number: number | null;
};

function getDistinctCourtNumbers(rows: SessionScheduleRow[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.court_number)
        .filter((courtNumber): courtNumber is number => typeof courtNumber === 'number' && courtNumber > 0)
    )
  ).sort((left, right) => left - right);
}

export async function syncSessionMatchFlow(
  adminSupabase: any,
  sessionId: string,
  options?: {
    completedMatchId?: number | null;
    initialize?: boolean;
  }
) {
  const { data: sessionMatches, error: sessionMatchesError } = await adminSupabase
    .from('generated_matches')
    .select('id, match_number, status')
    .eq('session_id', sessionId)
    .order('match_number', { ascending: true });

  if (sessionMatchesError) {
    throw new Error(sessionMatchesError.message);
  }

  const matches = (sessionMatches || []) as SessionMatchRow[];
  if (matches.length === 0) {
    return {
      capacity: 0,
      activatedMatchIds: [] as number[],
      activeMatchIds: [] as number[],
    };
  }

  const matchIds = matches.map((match) => match.id);
  const { data: scheduleRows, error: scheduleRowsError } = await adminSupabase
    .from('match_schedules')
    .select('generated_match_id, court_number')
    .in('generated_match_id', matchIds);

  if (scheduleRowsError) {
    throw new Error(scheduleRowsError.message);
  }

  const schedules = (scheduleRows || []) as SessionScheduleRow[];
  const courtNumbers = getDistinctCourtNumbers(schedules);
  const courtByMatchId = new Map<number, number | null>(
    schedules
      .filter((row): row is { generated_match_id: number; court_number: number | null } => typeof row.generated_match_id === 'number')
      .map((row) => [row.generated_match_id, row.court_number])
  );

  const capacity = Math.max(1, courtNumbers.length || 1);
  const activeMatches = matches.filter((match) => match.status === 'in_progress');
  const completedOrCancelled = new Set(
    matches
      .filter((match) => match.status === 'completed' || match.status === 'cancelled')
      .map((match) => match.id)
  );

  const updateStatus = async (ids: number[], status: 'scheduled' | 'in_progress') => {
    if (ids.length === 0) return;

    await adminSupabase
      .from('generated_matches')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids);

    await adminSupabase
      .from('match_schedules')
      .update({ status, updated_at: new Date().toISOString() })
      .in('generated_match_id', ids);
  };

  if (options?.initialize) {
    const activatedMatchIds: number[] = [];

    if (courtNumbers.length > 0) {
      for (const courtNumber of courtNumbers) {
        const firstMatchForCourt = matches.find((match) => {
          if (completedOrCancelled.has(match.id)) return false;
          return courtByMatchId.get(match.id) === courtNumber;
        });

        if (firstMatchForCourt && !activatedMatchIds.includes(firstMatchForCourt.id)) {
          activatedMatchIds.push(firstMatchForCourt.id);
        }
      }
    }

    if (activatedMatchIds.length < capacity) {
      const remainingMatches = matches
        .filter((match) => !completedOrCancelled.has(match.id) && !activatedMatchIds.includes(match.id))
        .slice(0, capacity - activatedMatchIds.length)
        .map((match) => match.id);

      activatedMatchIds.push(...remainingMatches);
    }

    const waitingMatchIds = matches
      .filter((match) => !completedOrCancelled.has(match.id) && !activatedMatchIds.includes(match.id))
      .map((match) => match.id);

    const staleActiveMatchIds = activeMatches
      .filter((match) => !activatedMatchIds.includes(match.id))
      .map((match) => match.id);

    await updateStatus(Array.from(new Set([...waitingMatchIds, ...staleActiveMatchIds])), 'scheduled');
    await updateStatus(activatedMatchIds, 'in_progress');

    return {
      capacity,
      activatedMatchIds,
      activeMatchIds: activatedMatchIds,
    };
  }

  const activeMatchIds = activeMatches.map((match) => match.id);
  const availableSlots = Math.max(0, capacity - activeMatchIds.length);
  if (availableSlots === 0) {
    return {
      capacity,
      activatedMatchIds: [] as number[],
      activeMatchIds,
    };
  }

  const completedCourtNumber = typeof options?.completedMatchId === 'number'
    ? courtByMatchId.get(options.completedMatchId) ?? null
    : null;

  const pendingMatches = matches.filter((match) => match.status === 'scheduled');
  const prioritizedPendingMatches = completedCourtNumber
    ? [
        ...pendingMatches.filter((match) => courtByMatchId.get(match.id) === completedCourtNumber),
        ...pendingMatches.filter((match) => courtByMatchId.get(match.id) !== completedCourtNumber),
      ]
    : pendingMatches;

  const activatedMatchIds = prioritizedPendingMatches
    .slice(0, availableSlots)
    .map((match) => match.id);

  await updateStatus(activatedMatchIds, 'in_progress');

  return {
    capacity,
    activatedMatchIds,
    activeMatchIds: [...activeMatchIds, ...activatedMatchIds],
  };
}
