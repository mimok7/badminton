-- team_assignments RLS 정책 수정
-- 목적:
-- 1) 관리자/매니저는 team_assignments 조회/삽입/수정/삭제 가능
-- 2) 일반 사용자는 접근 불가

ALTER TABLE public.team_assignments ENABLE ROW LEVEL SECURITY;

-- 기존 정책 정리
DROP POLICY IF EXISTS "Anyone can read team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Anyone can insert team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Anyone can update team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Anyone can delete team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Admins can read team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Admins can insert team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Admins can update team assignments" ON public.team_assignments;
DROP POLICY IF EXISTS "Admins can delete team assignments" ON public.team_assignments;

-- 관리자/매니저 권한 체크 공통 조건
-- profiles.user_id = auth.uid()를 기준으로 role 확인

CREATE POLICY "Admins can read team assignments"
ON public.team_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Admins can insert team assignments"
ON public.team_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Admins can update team assignments"
ON public.team_assignments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Admins can delete team assignments"
ON public.team_assignments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'manager')
  )
);

SELECT 'team_assignments RLS 정책 적용 완료 (admin/manager)' AS status;
