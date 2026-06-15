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
