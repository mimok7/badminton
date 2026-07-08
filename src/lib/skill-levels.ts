export const SKILL_LEVEL_CODES = [
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3',
  'E1', 'E2', 'E3'
] as const;

export type SkillLevelCode = (typeof SKILL_LEVEL_CODES)[number];

export const SKILL_LEVEL_DISPLAY_NAMES: Record<SkillLevelCode, string> = {
  A1: 'A1',
  A2: 'A2',
  A3: 'A3',
  B1: 'B1',
  B2: 'B2',
  B3: 'B3',
  C1: 'C1',
  C2: 'C2',
  C3: 'C3',
  D1: 'D1',
  D2: 'D2',
  D3: 'D3',
  E1: 'E1',
  E2: 'E2',
  E3: 'E3'
};

export const SKILL_LEVEL_SELECT_OPTIONS = SKILL_LEVEL_CODES.map((code) => ({
  code,
  name: SKILL_LEVEL_DISPLAY_NAMES[code],
}));

export const SKILL_LEVEL_GROUP_CODES = ['A1', 'B1', 'C1', 'D1', 'E1'] as const;

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
  E3: 'E1'
};

export function getSkillLevelGroupCode(skillLevel?: string | null, fallback: SkillLevelGroupCode = 'E1') {
  const normalized = String(skillLevel || '').trim().toUpperCase() as SkillLevelCode;

  if (normalized in SKILL_LEVEL_GROUP_REPRESENTATIVES) {
    return SKILL_LEVEL_GROUP_REPRESENTATIVES[normalized];
  }

  return fallback;
}
