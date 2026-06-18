import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type LevelInfoRow = Pick<Database['public']['Tables']['level_info']['Row'], 'code' | 'name' | 'score'>;

export type LevelInfoMeta = {
  name: string;
  score: number;
};

export type LevelNameMap = Record<string, string>;
export type LevelInfoMap = Record<string, LevelInfoMeta>;

function normalizeLevelCode(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();

  switch (normalized) {
    case 'a':
      return 'a2';
    case 'b':
      return 'b2';
    case 'c':
      return 'c2';
    case 'd':
      return 'd2';
    case 'e':
      return 'e2';
    case 'n':
      return 'n1';
    default:
      return normalized;
  }
}

function toLevelInfoMap(rows: LevelInfoRow[]) {
  return (rows || []).reduce<LevelInfoMap>((acc, row) => {
    if (row.code) {
      acc[normalizeLevelCode(row.code)] = {
        name: row.name || row.code,
        score: Number(row.score ?? 0),
      };
    }
    return acc;
  }, {});
}

export async function fetchLevelNameMap(
  supabase: SupabaseClient<Database>
): Promise<LevelNameMap> {
  const levelInfoMap = await fetchLevelInfoMap(supabase);
  return Object.entries(levelInfoMap).reduce<LevelNameMap>((acc, [code, meta]) => {
    acc[code] = meta.name;
    return acc;
  }, {});
}

export async function fetchLevelInfoMap(
  supabase: SupabaseClient<Database>
): Promise<LevelInfoMap> {
  const { data, error } = await supabase
    .from('level_info')
    .select('code, name, score')
    .order('score', { ascending: false, nullsFirst: false });

  if (!error && data && data.length > 0) {
    return toLevelInfoMap(data as LevelInfoRow[]);
  }

  if (typeof window !== 'undefined') {
    const response = await fetch('/api/admin/level-info', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      if (error) {
        throw error;
      }
      throw new Error('Failed to load level info');
    }

    const payload = await response.json().catch(() => null);
    return toLevelInfoMap((payload?.levelInfo || []) as LevelInfoRow[]);
  }

  if (error) {
    throw error;
  }

  return {};
}

export function getLevelNameFromCode(
  levelMap: LevelInfoMap,
  skillLevel?: string | null,
  fallback = '미지정'
) {
  const normalized = normalizeLevelCode(skillLevel);
  return levelMap[normalized]?.name || fallback;
}

export function getLevelScoreFromCode(
  levelMap: LevelInfoMap,
  skillLevel?: string | null,
  fallback = 0
) {
  const normalized = normalizeLevelCode(skillLevel);
  return levelMap[normalized]?.score ?? fallback;
}

export function normalizeLevelCodeForDisplay(skillLevel?: string | null) {
  return normalizeLevelCode(skillLevel);
}
