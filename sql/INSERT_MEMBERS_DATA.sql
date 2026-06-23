-- 배드민턴 클럽 멤버 데이터 입력 스크립트
-- 레벨: A(캐비어) > B(랍스터) > C(소갈비) > D(양갈비) > E(돼지갈비) > N(닭갈비)

-- 1. skill_level 제약조건 업데이트 (E 레벨 추가)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check 
  CHECK (skill_level IN ('A', 'B', 'C', 'D', 'E', 'N'));

-- 2. 임시 테이블로 멤버 데이터 준비 (주의: auth.users와 연결되지 않은 테스트용 데이터)
-- 실제 운영 시에는 각 사용자가 가입한 후 프로필이 자동 생성되어야 합니다.

-- 소갈비 팀 (C 레벨) - 공동리더: 이민석
INSERT INTO profiles (id, username, full_name, skill_level, role) 
VALUES 
  (gen_random_uuid(), 'lee_minseok', '이민석', 'C', 'user'),
  (gen_random_uuid(), 'kim_jinho', '김진호', 'C', 'user'),
  (gen_random_uuid(), 'kwon_youngSoon', '권영순', 'C', 'user'),
  (gen_random_uuid(), 'park_bokgyun', '박복균', 'C', 'user'),
  (gen_random_uuid(), 'park_heesoo', '박희수', 'C', 'user'),
  (gen_random_uuid(), 'yang_hoeyouk', '양회욱', 'C', 'user'),
  (gen_random_uuid(), 'yeo_wonmi', '여원미', 'C', 'user'),
  (gen_random_uuid(), 'yeom_cheongseob', '염청섭', 'C', 'user'),
  (gen_random_uuid(), 'im_hyunsu', '임현수', 'C', 'user'),
  (gen_random_uuid(), 'jeon_cheolmin', '전철민', 'C', 'user'),
  (gen_random_uuid(), 'jo_donggyun', '조동균', 'C', 'user'),
  (gen_random_uuid(), 'ju_dongseok', '주동석', 'C', 'user'),
  (gen_random_uuid(), 'ju_seongmo', '주성모', 'C', 'user')
ON CONFLICT (username) DO NOTHING;

-- 캐비어 팀 (A 레벨) - 리더: 김성곤
INSERT INTO profiles (id, username, full_name, skill_level, role)
VALUES
  (gen_random_uuid(), 'kim_seonggon', '김성곤', 'A', 'user'),
  (gen_random_uuid(), 'jo_youngjae', '조영재', 'A', 'user'),
  (gen_random_uuid(), 'choi_shinwoong', '최신웅', 'A', 'user')
ON CONFLICT (username) DO NOTHING;

-- 닭갈비 팀 (N 레벨)
INSERT INTO profiles (id, username, full_name, skill_level, role)
VALUES
  (gen_random_uuid(), 'kang_sora', '강솔라', 'N', 'user'),
  (gen_random_uuid(), 'kang_jiyeon', '강지연', 'N', 'user'),
  (gen_random_uuid(), 'kim_euneok', '김은옥', 'N', 'user'),
  (gen_random_uuid(), 'park_giwouk', '박기욱', 'N', 'user'),
  (gen_random_uuid(), 'park_soyoung', '박소영', 'N', 'user'),
  (gen_random_uuid(), 'seo_minhee', '서민희', 'N', 'user'),
  (gen_random_uuid(), 'shim_hyunchul', '심현철', 'N', 'user'),
  (gen_random_uuid(), 'yeo_hyunseo', '여현서', 'N', 'user'),
  (gen_random_uuid(), 'jeong_gyumin', '정규민', 'N', 'user'),
  (gen_random_uuid(), 'jeong_sujeong', '정수정', 'N', 'user'),
  (gen_random_uuid(), 'jo_ingyu', '조인규', 'N', 'user'),
  (gen_random_uuid(), 'choi_yunsil', '최윤실', 'N', 'user')
ON CONFLICT (username) DO NOTHING;

-- 랍스터 팀 (B 레벨)
INSERT INTO profiles (id, username, full_name, skill_level, role)
VALUES
  (gen_random_uuid(), 'kim_gunryul', '김건율', 'B', 'user'),
  (gen_random_uuid(), 'kim_hyungjun', '김형준', 'B', 'user'),
  (gen_random_uuid(), 'park_kangho', '박강호', 'B', 'user'),
  (gen_random_uuid(), 'park_jiseop', '박지섭', 'B', 'user'),
  (gen_random_uuid(), 'yoo_sungjun', '유성준', 'B', 'user'),
  (gen_random_uuid(), 'lee_jeyoung', '이제영', 'B', 'user'),
  (gen_random_uuid(), 'lee_hyunho', '이현호', 'B', 'user')
ON CONFLICT (username) DO NOTHING;

-- 양갈비 팀 (D 레벨)
INSERT INTO profiles (id, username, full_name, skill_level, role)
VALUES
  (gen_random_uuid(), 'kim_giseung', '김기승', 'D', 'user'),
  (gen_random_uuid(), 'kim_dayoung', '김다영', 'D', 'user'),
  (gen_random_uuid(), 'kim_yeseul', '김예슬', 'D', 'user'),
  (gen_random_uuid(), 'kim_eunhee', '김은희', 'D', 'user'),
  (gen_random_uuid(), 'kim_hyeseon', '김혜선', 'D', 'user'),
  (gen_random_uuid(), 'yang_hyeyun', '양혜윤', 'D', 'user'),
  (gen_random_uuid(), 'lee_taehun', '이태훈', 'D', 'user'),
  (gen_random_uuid(), 'cha_songun', '차송운', 'D', 'user'),
  (gen_random_uuid(), 'choi_seoyeon', '최서연', 'D', 'user'),
  (gen_random_uuid(), 'choi_wonjeong', '최원정', 'D', 'user'),
  (gen_random_uuid(), 'han_jiyun', '한지윤', 'D', 'user'),
  (gen_random_uuid(), 'hwang_gyuyeon', '황규연', 'D', 'user')
ON CONFLICT (username) DO NOTHING;

-- 돼지갈비 팀 (E 레벨)
INSERT INTO profiles (id, username, full_name, skill_level, role)
VALUES
  (gen_random_uuid(), 'kim_minjeong', '김민정', 'E', 'user'),
  (gen_random_uuid(), 'kim_youngsoon', '김영순', 'E', 'user'),
  (gen_random_uuid(), 'seo_juyoung', '서주영', 'E', 'user'),
  (gen_random_uuid(), 'yang_yeonyouk', '양연욱', 'E', 'user'),
  (gen_random_uuid(), 'yong_hyunjeong', '용현정', 'E', 'user'),
  (gen_random_uuid(), 'lee_yeonwoo', '이연우', 'E', 'user'),
  (gen_random_uuid(), 'lee_woosung', '이우성', 'E', 'user'),
  (gen_random_uuid(), 'lee_eunmi', '이은미', 'E', 'user'),
  (gen_random_uuid(), 'lee_jeongchan', '이정찬', 'E', 'user'),
  (gen_random_uuid(), 'hwang_yongdam', '황용담', 'E', 'user')
ON CONFLICT (username) DO NOTHING;

-- 3. 입력된 데이터 확인 쿼리
-- 레벨별 인원 통계
SELECT 
  CASE 
    WHEN skill_level = 'A' THEN '1️⃣ 캐비어'
    WHEN skill_level = 'B' THEN '2️⃣ 랍스터'
    WHEN skill_level = 'C' THEN '3️⃣ 소갈비'
    WHEN skill_level = 'D' THEN '4️⃣ 양갈비'
    WHEN skill_level = 'E' THEN '5️⃣ 돼지갈비'
    WHEN skill_level = 'N' THEN '6️⃣ 닭갈비'
  END as 레벨,
  COUNT(*) as 인원수,
  STRING_AGG(full_name, ', ') as 멤버목록
FROM profiles 
WHERE skill_level IN ('A', 'B', 'C', 'D', 'E', 'N')
GROUP BY skill_level
ORDER BY skill_level;
