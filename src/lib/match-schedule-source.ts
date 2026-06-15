export const SCHEDULE_SOURCE_VALUES = ['recurring', 'tournament', 'generated'] as const;

export type MatchScheduleSource = (typeof SCHEDULE_SOURCE_VALUES)[number];

export const SCHEDULE_SOURCE_LABELS: Record<MatchScheduleSource, string> = {
  recurring: '정기모임',
  tournament: '대회 경기',
  generated: '일반 경기',
};

type ScheduleSourceLike = {
  schedule_source?: string | null;
  description?: string | null;
  generated_match_id?: number | null;
};

export function normalizeScheduleSource(value?: string | null): MatchScheduleSource {
  if (value === 'tournament' || value === 'generated') {
    return value;
  }

  return 'recurring';
}

export function getScheduleSourceLabel(value?: string | null): string {
  return SCHEDULE_SOURCE_LABELS[normalizeScheduleSource(value)];
}

export function inferScheduleSource(value?: ScheduleSourceLike | null): MatchScheduleSource {
  if (!value) {
    return 'recurring';
  }

  if (value.schedule_source === 'tournament' || value.schedule_source === 'generated') {
    return value.schedule_source;
  }

  const description = value.description?.trim() || '';

  if (description.startsWith('[대회 경기]')) {
    return 'tournament';
  }

  if (typeof value.generated_match_id === 'number') {
    return 'generated';
  }

  return 'recurring';
}

export function decorateDescriptionForScheduleSource(
  description: string | null | undefined,
  source: MatchScheduleSource
): string | null {
  const base = (description || '')
    .replace(/^\[(정기모임|대회 경기|일반 경기)\]\s*/u, '')
    .trim();

  if (source === 'tournament') {
    return base ? `[대회 경기] ${base}` : '[대회 경기]';
  }

  if (source === 'generated') {
    return base ? `[일반 경기] ${base}` : '[일반 경기]';
  }

  return base || null;
}
