type SessionMatchRow = {
  id: number;
  match_number: number | null;
  status: string | null;
};

type SessionScheduleRow = {
  generated_match_id: number | null;
  court_number: number | null;
  scheduled_time?: string | null;
  description?: string | null;
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

function parseGeneratedDescriptionOrder(description?: string | null) {
  const normalized = description?.replace(/^\[일반 경기\]\s*/u, '').trim() || '';
  const matched = normalized.match(/^(?:\d{4}-\d{2}-\d{2}[_\s]+)?(\d+)-(\d+)$/u);
  if (!matched) {
    return { batch: 9999, order: 9999 };
  }
  return {
    batch: Number(matched[1]),
    order: Number(matched[2]),
  };
}

export async function syncSessionMatchFlow(
  adminSupabase: any,
  sessionId: string,
  options?: {
    completedMatchId?: number | null;
    initialize?: boolean;
    capacityOverride?: number | null;
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
    .select('generated_match_id, court_number, scheduled_time, description')
    .in('generated_match_id', matchIds);

  if (scheduleRowsError) {
    throw new Error(scheduleRowsError.message);
  }

  const schedules = (scheduleRows || []) as SessionScheduleRow[];

  // Sort matches in-memory strictly by scheduled_time (match_time) first, then match_number, then description order
  // This aligns the flow scheduler order with the UI's optimized order!
  const scheduleByMatchId = new Map<number, SessionScheduleRow>();
  schedules.forEach((row) => {
    if (row.generated_match_id) {
      scheduleByMatchId.set(row.generated_match_id, row);
    }
  });

  matches.sort((left, right) => {
    const leftSched = scheduleByMatchId.get(left.id);
    const rightSched = scheduleByMatchId.get(right.id);

    const leftTime = leftSched?.scheduled_time || '';
    const rightTime = rightSched?.scheduled_time || '';
    const timeDiff = leftTime.localeCompare(rightTime, 'ko');
    if (timeDiff !== 0) return timeDiff;

    const leftNum = left.match_number ?? 9999;
    const rightNum = right.match_number ?? 9999;
    const numDiff = leftNum - rightNum;
    if (numDiff !== 0) return numDiff;

    const leftOrder = parseGeneratedDescriptionOrder(leftSched?.description);
    const rightOrder = parseGeneratedDescriptionOrder(rightSched?.description);
    const batchDiff = leftOrder.batch - rightOrder.batch;
    if (batchDiff !== 0) return batchDiff;
    return leftOrder.order - rightOrder.order;
  });

  const completedOrCancelled = new Set(
    matches
      .filter((match) => match.status === 'completed' || match.status === 'cancelled')
      .map((match) => match.id)
  );

  // If initializing, assign court numbers 1 to K in round-robin order for incomplete matches
  if (options?.initialize) {
    // 1. Determine K (capacity)
    const initialCourtNumbers = getDistinctCourtNumbers(
      schedules.filter((row) => row.generated_match_id && !completedOrCancelled.has(row.generated_match_id))
    );
    const defaultCapacity = Math.max(1, initialCourtNumbers.length || 1);
    const k = (typeof options?.capacityOverride === 'number' && options.capacityOverride > 0)
      ? options.capacityOverride
      : defaultCapacity;

    const matchIdToCourt = new Map<number, number>();
    const incompleteMatches = matches.filter((match) => !completedOrCancelled.has(match.id));
    
    const updatePromises = incompleteMatches.map((match, idx) => {
      const courtNumber = (idx % k) + 1;
      matchIdToCourt.set(match.id, courtNumber);
      return adminSupabase
        .from('match_schedules')
        .update({ court_number: courtNumber })
        .eq('generated_match_id', match.id);
    });
    await Promise.all(updatePromises);
    
    schedules.forEach((row) => {
      if (row.generated_match_id && matchIdToCourt.has(row.generated_match_id)) {
        row.court_number = matchIdToCourt.get(row.generated_match_id) ?? null;
      }
    });
  }

  // Calculate court numbers using ALL schedules to keep the active capacity correct
  // This ensures capacity doesn't shrink when a court finishes all its matches
  const courtNumbers = getDistinctCourtNumbers(schedules);

  const courtByMatchId = new Map<number, number | null>(
    schedules
      .filter((row): row is { generated_match_id: number; court_number: number | null } => typeof row.generated_match_id === 'number')
      .map((row) => [row.generated_match_id, row.court_number])
  );

  const capacity = Math.max(1, courtNumbers.length || 1);
  const activeMatches = matches.filter((match) => match.status === 'in_progress');

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
