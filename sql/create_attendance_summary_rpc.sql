-- 사용자별 출석 요약 RPC 함수 생성
-- 이 함수는 `attendances` 테이블에서 사용자별 총 출석 횟수와 최근 30일 이내의 출석 횟수, 그리고 최근 출석일을 집계하여 반환합니다.
-- 프론트엔드에서 테이블 전체를 로드하는 Full Table Scan 성능 병목을 해결하기 위해 만들어졌습니다.

CREATE OR REPLACE FUNCTION get_attendance_summary()
RETURNS TABLE (
  user_id UUID,
  total_count BIGINT,
  last30_count BIGINT,
  last_attended_at DATE
) AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  RETURN QUERY
  SELECT 
    a.user_id,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE a.attended_at >= cutoff_date) AS last30_count,
    MAX(a.attended_at) AS last_attended_at
  FROM attendances a
  WHERE a.status = 'present'
  GROUP BY a.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 부여
GRANT EXECUTE ON FUNCTION get_attendance_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_summary() TO service_role;

-- 확인을 위한 쿼리
-- SELECT * FROM get_attendance_summary();
