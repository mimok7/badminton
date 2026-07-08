import { SKILL_LEVEL_DISPLAY_NAMES, type SkillLevelCode } from '@/lib/skill-levels';

const LEGACY_LEVEL_TO_CODE: Record<string, SkillLevelCode> = {
  A: 'A2',
  B: 'B2',
  C: 'C2',
  D: 'D2',
  E: 'E2',
  N: 'E2',
};

export function getNormalizedSkillCode(skillLevel?: string | null, fallback: SkillLevelCode = 'E2'): SkillLevelCode {
  const normalized = String(skillLevel || '').trim().toUpperCase();

  if (normalized in LEGACY_LEVEL_TO_CODE) {
    return LEGACY_LEVEL_TO_CODE[normalized];
  }

  if (normalized in SKILL_LEVEL_DISPLAY_NAMES) {
    return normalized as SkillLevelCode;
  }

  return fallback;
}

export function getUserLevelDisplay(skillLevel?: string | null, fallback = 'E2') {
  const code = getNormalizedSkillCode(skillLevel);
  return SKILL_LEVEL_DISPLAY_NAMES[code] || fallback;
}

export function getAdminLevelDisplay(skillLevel?: string | null, fallback = 'E2') {
  return getNormalizedSkillCode(skillLevel, fallback as SkillLevelCode);
}
