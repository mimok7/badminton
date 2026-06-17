export const SKILL_LEVEL_CODES = [
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3',
  'E1', 'E2', 'E3',
  'N1', 'N2', 'N3',
] as const;

export type SkillLevelCode = (typeof SKILL_LEVEL_CODES)[number];

export const SKILL_LEVEL_DISPLAY_NAMES: Record<SkillLevelCode, string> = {
  A1: '캐비어',
  A2: '캐비어',
  A3: '캐비어',
  B1: '랍스터',
  B2: '랍스터',
  B3: '랍스터',
  C1: '소갈비',
  C2: '소갈비',
  C3: '소갈비',
  D1: '양갈비',
  D2: '양갈비',
  D3: '양갈비',
  E1: '돼지갈비',
  E2: '돼지갈비',
  E3: '돼지갈비',
  N1: '닭갈비',
  N2: '닭갈비',
  N3: '닭갈비',
};

export const SKILL_LEVEL_SELECT_OPTIONS = SKILL_LEVEL_CODES.map((code) => ({
  code,
  name: SKILL_LEVEL_DISPLAY_NAMES[code],
}));

export const SKILL_LEVEL_GROUP_CODES = ['A1', 'B1', 'C1', 'D1', 'E1', 'N1'] as const;

export type SkillLevelGroupCode = (typeof SKILL_LEVEL_GROUP_CODES)[number];

export const SKILL_LEVEL_GROUP_SELECT_OPTIONS = SKILL_LEVEL_GROUP_CODES.map((code) => ({
  code,
  name: SKILL_LEVEL_DISPLAY_NAMES[code],
}));

const SKILL_LEVEL_GROUP_REPRESENTATIVES: Record<SkillLevelCode, SkillLevelGroupCode> = {
  A1: 'A1',
  A2: 'A1',
  A3: 'A1',
  B1: 'B1',
  B2: 'B1',
  B3: 'B1',
  C1: 'C1',
  C2: 'C1',
  C3: 'C1',
  D1: 'D1',
  D2: 'D1',
  D3: 'D1',
  E1: 'E1',
  E2: 'E1',
  E3: 'E1',
  N1: 'N1',
  N2: 'N1',
  N3: 'N1',
};

export function getSkillLevelGroupCode(skillLevel?: string | null, fallback: SkillLevelGroupCode = 'N1') {
  const normalized = String(skillLevel || '').trim().toUpperCase() as SkillLevelCode;

  if (normalized in SKILL_LEVEL_GROUP_REPRESENTATIVES) {
    return SKILL_LEVEL_GROUP_REPRESENTATIVES[normalized];
  }

  return fallback;
}
