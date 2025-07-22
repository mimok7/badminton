-- 출석 테이블 생성 (attendance)
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  attended_at date not null default current_date
);

-- 오늘 로그인 시 출석 자동 체크: 로그인 성공 시 attendance에 insert
-- (Next.js API 또는 클라이언트에서 로그인 성공 후 아래 쿼리 실행)
-- insert into attendance (user_id, attended_at) values ('로그인한유저id', current_date)
