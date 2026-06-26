import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type LevelInfoRow = Pick<Database['public']['Tables']['level_info']['Row'], 'code' | 'name' | 'score'>;

export type LevelInfoMeta = {
  name: string;
  score: number;
};

export type LevelNameMap = Record<string, string>;
export type LevelInfoMap = Record<string, LevelInfoMeta>;

export function normalizeLevelCode(value?: string | null) {
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

// 모듈 수준 캐시: fetchLevelInfoMap 중복 호출 방지
let _cachedLevelInfoMap: LevelInfoMap | null = null;
let _cachedLevelInfoMapTimestamp = 0;
let _pendingLevelInfoFetch: Promise<LevelInfoMap> | null = null;
const LEVEL_INFO_CACHE_TTL = 5 * 60 * 1000; // 5분

export async function fetchLevelInfoMap(
  supabase: SupabaseClient<Database>
): Promise<LevelInfoMap> {
  const now = Date.now();

  // 캐시가 유효하면 즉시 반환
  if (_cachedLevelInfoMap && Object.keys(_cachedLevelInfoMap).length > 0 && now - _cachedLevelInfoMapTimestamp < LEVEL_INFO_CACHE_TTL) {
    return _cachedLevelInfoMap;
  }

  // 이미 진행중인 fetch가 있으면 동일한 Promise 반환 (동시 호출 중복 방지)
  if (_pendingLevelInfoFetch) {
    return _pendingLevelInfoFetch;
  }

  _pendingLevelInfoFetch = (async () => {
    try {
      const { data, error } = await supabase
        .from('level_info')
        .select('code, name, score')
        .order('score', { ascending: false, nullsFirst: false });

      if (!error && data && data.length > 0) {
        _cachedLevelInfoMap = toLevelInfoMap(data as LevelInfoRow[]);
        _cachedLevelInfoMapTimestamp = Date.now();
        return _cachedLevelInfoMap;
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
        _cachedLevelInfoMap = toLevelInfoMap((payload?.levelInfo || []) as LevelInfoRow[]);
        _cachedLevelInfoMapTimestamp = Date.now();
        return _cachedLevelInfoMap;
      }

      if (error) {
        throw error;
      }

      return {};
    } finally {
      _pendingLevelInfoFetch = null;
    }
  })();

  return _pendingLevelInfoFetch;
}

export function getLevelNameFromCode(
  levelMap: LevelInfoMap,
  skillLevel?: string | null,
  fallback: string | null = '미지정'
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

export function compareLevelCodes(
  levelMap: LevelInfoMap,
  left?: string | null,
  right?: string | null
) {
  const normalizedLeft = normalizeLevelCode(left);
  const normalizedRight = normalizeLevelCode(right);
  const leftScore = levelMap[normalizedLeft]?.score ?? Number.NEGATIVE_INFINITY;
  const rightScore = levelMap[normalizedRight]?.score ?? Number.NEGATIVE_INFINITY;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return normalizedLeft.localeCompare(normalizedRight, 'ko', { sensitivity: 'base' });
}

export function getLevelDisplayText(
  levelMap: LevelInfoMap,
  skillLevel?: string | null,
  fallback = '미지정'
) {
  const normalized = normalizeLevelCode(skillLevel);

  if (!normalized) {
    return fallback;
  }

  const code = normalized.toUpperCase();
  const name = levelMap[normalized]?.name;

  return name ? `${code} · ${name}` : code;
}
