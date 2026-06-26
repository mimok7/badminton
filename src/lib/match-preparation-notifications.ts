type NotificationParticipant = {
  user_id?: string | null;
  username?: string | null;
  full_name?: string | null;
};

type MatchScheduleInfo = {
  court_number?: number | null;
  location?: string | null;
  scheduled_time?: string | null;
  start_time?: string | null;
};

type SessionMatchWithSchedule = {
  id: number;
  match_number?: number | null;
  status?: string | null;
  team1_player1?: NotificationParticipant | null;
  team1_player2?: NotificationParticipant | null;
  team2_player1?: NotificationParticipant | null;
  team2_player2?: NotificationParticipant | null;
  match_schedules?: MatchScheduleInfo[] | null;
};

function getCourtKey(schedule?: MatchScheduleInfo | null) {
  const location = schedule?.location?.trim();
  if (location && typeof schedule?.court_number === 'number' && schedule.court_number > 0) {
    return `${location}::${schedule.court_number}`;
  }
  if (typeof schedule?.court_number === 'number' && schedule.court_number > 0) {
    return `court:${schedule.court_number}`;
  }

  return 'court:unknown';
}

function getCourtLabel(schedule?: MatchScheduleInfo | null) {
  const location = schedule?.location?.trim();
  if (location && typeof schedule?.court_number === 'number' && schedule.court_number > 0) {
    return `${location} ${schedule.court_number}코트`;
  }
  if (location) return location;
  if (typeof schedule?.court_number === 'number' && schedule.court_number > 0) {
    return `코트 ${schedule.court_number}`;
  }

  return '코트 미정';
}

function getMatchTimeLabel(schedule?: MatchScheduleInfo | null) {
  return schedule?.scheduled_time?.trim() || schedule?.start_time?.trim() || '시간 미정';
}

function getParticipantName(participant?: NotificationParticipant | null) {
  return participant?.full_name?.trim() || participant?.username?.trim() || null;
}

export async function notifyWaitingMatchesForSession(adminSupabase: any, sessionId: string) {
  const { data, error } = await adminSupabase
    .from('generated_matches')
    .select(`
      id,
      match_number,
      status,
      match_schedules (
        court_number,
        location,
        scheduled_time,
        start_time
      ),
      team1_player1:profiles!team1_player1_id (
        user_id,
        username,
        full_name
      ),
      team1_player2:profiles!team1_player2_id (
        user_id,
        username,
        full_name
      ),
      team2_player1:profiles!team2_player1_id (
        user_id,
        username,
        full_name
      ),
      team2_player2:profiles!team2_player2_id (
        user_id,
        username,
        full_name
      )
    `)
    .eq('session_id', sessionId)
    .order('match_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const matches = ((data || []) as SessionMatchWithSchedule[]).sort(
    (left, right) => (left.match_number ?? Number.MAX_SAFE_INTEGER) - (right.match_number ?? Number.MAX_SAFE_INTEGER)
  );

  const activeCourtKeys = new Set(
    matches
      .filter((match) => match.status === 'in_progress')
      .map((match) => getCourtKey(match.match_schedules?.[0]))
  );

  const waitingMatches: SessionMatchWithSchedule[] = [];

  for (const courtKey of activeCourtKeys) {
    const nextMatch = matches.find(
      (match) => match.status === 'scheduled' && getCourtKey(match.match_schedules?.[0]) === courtKey
    );

    if (nextMatch) {
      waitingMatches.push(nextMatch);
    }
  }

  if (waitingMatches.length === 0) {
    return {
      waitingMatchIds: [] as number[],
      notificationCount: 0,
    };
  }

  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // 대기 중인 경기 ID와 선수 ID 수집
  const waitingMatchIds = waitingMatches.map((m) => m.id);
  const allParticipantUserIds = waitingMatches
    .flatMap((match) => [
      match.team1_player1?.user_id,
      match.team1_player2?.user_id,
      match.team2_player1?.user_id,
      match.team2_player2?.user_id,
    ])
    .filter((id): id is string => Boolean(id));

  // 이미 발송된 알림 데이터 일괄 쿼리
  const sentSet = new Set<string>();
  if (allParticipantUserIds.length > 0) {
    const { data: existingNotifications, error: existingNotificationsError } = await adminSupabase
      .from('notifications')
      .select('user_id, related_match_id')
      .in('user_id', allParticipantUserIds)
      .in('related_match_id', waitingMatchIds)
      .eq('type', 'match_preparation')
      .gte('created_at', recentCutoff);

    if (existingNotificationsError) {
      throw new Error(existingNotificationsError.message);
    }

    (existingNotifications || []).forEach((n: any) => {
      sentSet.add(`${n.user_id}_${n.related_match_id}`);
    });
  }

  const notificationsToInsert: any[] = [];

  for (const match of waitingMatches) {
    const schedule = match.match_schedules?.[0];
    const courtLabel = getCourtLabel(schedule);
    const timeLabel = getMatchTimeLabel(schedule);
    const participants = [
      match.team1_player1,
      match.team1_player2,
      match.team2_player1,
      match.team2_player2,
    ].filter((participant): participant is NotificationParticipant => Boolean(participant?.user_id));
    const playerNames = participants.map((participant) => getParticipantName(participant)).filter(Boolean) as string[];

    for (const participant of participants) {
      const isAlreadySent = sentSet.has(`${participant.user_id}_${match.id}`);
      if (isAlreadySent) {
        continue;
      }

      notificationsToInsert.push({
        user_id: participant.user_id,
        title: '경기 준비 알림',
        message: [
          '경기 준비 알림',
          '',
          `${courtLabel} · ${timeLabel}`,
          `선수: ${playerNames.join(', ') || '참가 선수 확인 필요'}`,
          '',
          '곧 경기가 시작됩니다. 미리 코트로 이동해 준비해 주세요.',
        ].join('\n'),
        type: 'match_preparation',
        related_match_id: match.id,
        is_read: false,
      });
    }
  }

  if (notificationsToInsert.length > 0) {
    const { error: insertError } = await adminSupabase
      .from('notifications')
      .insert(notificationsToInsert);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return {
    waitingMatchIds: waitingMatches.map((match) => match.id),
    notificationCount: notificationsToInsert.length,
  };
}
