-- 1. 기존 데이터 중 25점을 넘는 점수가 있다면 25점으로 일괄 조정 (제약조건 위반 방지)

-- match_results
UPDATE match_results SET team1_score = 25 WHERE team1_score > 25;
UPDATE match_results SET team2_score = 25 WHERE team2_score > 25;

-- profile_coin_transactions
UPDATE profile_coin_transactions SET team1_score = 25 WHERE team1_score > 25;
UPDATE profile_coin_transactions SET team2_score = 25 WHERE team2_score > 25;

-- tournament_matches
UPDATE tournament_matches SET score_team1 = 25 WHERE score_team1 > 25;
UPDATE tournament_matches SET score_team2 = 25 WHERE score_team2 > 25;

-- generated_matches (JSONB 내 점수 수정)
UPDATE generated_matches 
SET match_result = jsonb_set(match_result, '{team1_score}', '25')
WHERE (match_result->>'team1_score')::int > 25;

UPDATE generated_matches 
SET match_result = jsonb_set(match_result, '{team2_score}', '25')
WHERE (match_result->>'team2_score')::int > 25;


-- 2. 각 테이블에 최대 점수를 25점으로 제한하는 CHECK 제약 조건 추가

-- match_results
ALTER TABLE match_results DROP CONSTRAINT IF EXISTS match_results_score_limit;
ALTER TABLE match_results ADD CONSTRAINT match_results_score_limit 
  CHECK (team1_score <= 25 AND team2_score <= 25);

-- profile_coin_transactions
ALTER TABLE profile_coin_transactions DROP CONSTRAINT IF EXISTS profile_coin_tx_score_limit;
ALTER TABLE profile_coin_transactions ADD CONSTRAINT profile_coin_tx_score_limit 
  CHECK (team1_score <= 25 AND team2_score <= 25);

-- tournament_matches
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_score_limit;
ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_score_limit 
  CHECK (score_team1 <= 25 AND score_team2 <= 25);

-- generated_matches (JSONB)
ALTER TABLE generated_matches DROP CONSTRAINT IF EXISTS generated_matches_score_limit;
ALTER TABLE generated_matches ADD CONSTRAINT generated_matches_score_limit 
  CHECK (
    match_result IS NULL OR (
      (match_result->>'team1_score')::int <= 25 AND 
      (match_result->>'team2_score')::int <= 25
    )
  );

-- 확인용 조회 쿼리 (선택)
-- SELECT * FROM match_results WHERE team1_score > 25 OR team2_score > 25;
