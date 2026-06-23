ALTER TABLE public.level_info
ADD COLUMN IF NOT EXISTS score NUMERIC(6,2);

UPDATE public.level_info
SET
  name = source.name,
  description = source.description,
  score = source.score
FROM (
  VALUES
    ('A1', '캐비어', '캐비어 1단계', 89.00),
    ('A2', '캐비어', '캐비어 2단계', 92.00),
    ('A3', '캐비어', '캐비어 3단계', 95.00),
    ('B1', '랍스터', '랍스터 1단계', 80.00),
    ('B2', '랍스터', '랍스터 2단계', 83.00),
    ('B3', '랍스터', '랍스터 3단계', 86.00),
    ('C1', '소갈비', '소갈비 1단계', 71.00),
    ('C2', '소갈비', '소갈비 2단계', 74.00),
    ('C3', '소갈비', '소갈비 3단계', 77.00),
    ('D1', '양갈비', '양갈비 1단계', 62.00),
    ('D2', '양갈비', '양갈비 2단계', 65.00),
    ('D3', '양갈비', '양갈비 3단계', 68.00),
    ('E1', '돼지갈비', '돼지갈비 1단계', 53.00),
    ('E2', '돼지갈비', '돼지갈비 2단계', 56.00),
    ('E3', '돼지갈비', '돼지갈비 3단계', 59.00),
    ('N1', '닭갈비', '닭갈비 1단계', 44.00),
    ('N2', '닭갈비', '닭갈비 2단계', 47.00),
    ('N3', '닭갈비', '닭갈비 3단계', 50.00)
) AS source(code, name, description, score)
WHERE public.level_info.code = source.code;

INSERT INTO public.level_info (code, name, description, score)
SELECT source.code, source.name, source.description, source.score
FROM (
  VALUES
    ('A1', '캐비어', '캐비어 1단계', 89.00),
    ('A2', '캐비어', '캐비어 2단계', 92.00),
    ('A3', '캐비어', '캐비어 3단계', 95.00),
    ('B1', '랍스터', '랍스터 1단계', 80.00),
    ('B2', '랍스터', '랍스터 2단계', 83.00),
    ('B3', '랍스터', '랍스터 3단계', 86.00),
    ('C1', '소갈비', '소갈비 1단계', 71.00),
    ('C2', '소갈비', '소갈비 2단계', 74.00),
    ('C3', '소갈비', '소갈비 3단계', 77.00),
    ('D1', '양갈비', '양갈비 1단계', 62.00),
    ('D2', '양갈비', '양갈비 2단계', 65.00),
    ('D3', '양갈비', '양갈비 3단계', 68.00),
    ('E1', '돼지갈비', '돼지갈비 1단계', 53.00),
    ('E2', '돼지갈비', '돼지갈비 2단계', 56.00),
    ('E3', '돼지갈비', '돼지갈비 3단계', 59.00),
    ('N1', '닭갈비', '닭갈비 1단계', 44.00),
    ('N2', '닭갈비', '닭갈비 2단계', 47.00),
    ('N3', '닭갈비', '닭갈비 3단계', 50.00)
) AS source(code, name, description, score)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.level_info target
  WHERE target.code = source.code
);

UPDATE public.profiles
SET skill_level = CASE upper(trim(coalesce(skill_level, '')))
  WHEN 'A' THEN 'A2'
  WHEN 'B' THEN 'B2'
  WHEN 'C' THEN 'C2'
  WHEN 'D' THEN 'D2'
  WHEN 'E' THEN 'E2'
  WHEN 'N' THEN 'N1'
  WHEN '' THEN 'N1'
  ELSE upper(trim(skill_level))
END
WHERE skill_level IS NULL
   OR trim(coalesce(skill_level, '')) = ''
   OR upper(trim(skill_level)) IN ('A', 'B', 'C', 'D', 'E', 'N')
   OR upper(trim(skill_level)) <> skill_level;

DELETE FROM public.level_info
WHERE code NOT IN (
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3',
  'E1', 'E2', 'E3',
  'N1', 'N2', 'N3'
);

COMMENT ON COLUMN public.level_info.score
IS '팀 밸런싱용 레벨 점수. profiles.skill_level -> level_info.code 매칭 후 사용';
