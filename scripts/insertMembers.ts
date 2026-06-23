import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface MemberData {
  username: string;
  full_name: string;
  skill_level: 'A' | 'B' | 'C' | 'D' | 'E' | 'N';
  team: string;
}

const members: MemberData[] = [
  // 캐비어 팀 (A 레벨)
  { username: 'kim_seonggon', full_name: '김성곤', skill_level: 'A', team: '캐비어' },
  { username: 'jo_youngjae', full_name: '조영재', skill_level: 'A', team: '캐비어' },
  { username: 'choi_shinwoong', full_name: '최신웅', skill_level: 'A', team: '캐비어' },

  // 랍스터 팀 (B 레벨)
  { username: 'kim_gunryul', full_name: '김건율', skill_level: 'B', team: '랍스터' },
  { username: 'kim_hyungjun', full_name: '김형준', skill_level: 'B', team: '랍스터' },
  { username: 'park_kangho', full_name: '박강호', skill_level: 'B', team: '랍스터' },
  { username: 'park_jiseop', full_name: '박지섭', skill_level: 'B', team: '랍스터' },
  { username: 'yoo_sungjun', full_name: '유성준', skill_level: 'B', team: '랍스터' },
  { username: 'lee_jeyoung', full_name: '이제영', skill_level: 'B', team: '랍스터' },
  { username: 'lee_hyunho', full_name: '이현호', skill_level: 'B', team: '랍스터' },

  // 소갈비 팀 (C 레벨)
  { username: 'lee_minseok', full_name: '이민석', skill_level: 'C', team: '소갈비' },
  { username: 'kim_jinho', full_name: '김진호', skill_level: 'C', team: '소갈비' },
  { username: 'kwon_youngSoon', full_name: '권영순', skill_level: 'C', team: '소갈비' },
  { username: 'park_bokgyun', full_name: '박복균', skill_level: 'C', team: '소갈비' },
  { username: 'park_heesoo', full_name: '박희수', skill_level: 'C', team: '소갈비' },
  { username: 'yang_hoeyouk', full_name: '양회욱', skill_level: 'C', team: '소갈비' },
  { username: 'yeo_wonmi', full_name: '여원미', skill_level: 'C', team: '소갈비' },
  { username: 'yeom_cheongseob', full_name: '염청섭', skill_level: 'C', team: '소갈비' },
  { username: 'im_hyunsu', full_name: '임현수', skill_level: 'C', team: '소갈비' },
  { username: 'jeon_cheolmin', full_name: '전철민', skill_level: 'C', team: '소갈비' },
  { username: 'jo_donggyun', full_name: '조동균', skill_level: 'C', team: '소갈비' },
  { username: 'ju_dongseok', full_name: '주동석', skill_level: 'C', team: '소갈비' },
  { username: 'ju_seongmo', full_name: '주성모', skill_level: 'C', team: '소갈비' },

  // 양갈비 팀 (D 레벨)
  { username: 'kim_giseung', full_name: '김기승', skill_level: 'D', team: '양갈비' },
  { username: 'kim_dayoung', full_name: '김다영', skill_level: 'D', team: '양갈비' },
  { username: 'kim_yeseul', full_name: '김예슬', skill_level: 'D', team: '양갈비' },
  { username: 'kim_eunhee', full_name: '김은희', skill_level: 'D', team: '양갈비' },
  { username: 'kim_hyeseon', full_name: '김혜선', skill_level: 'D', team: '양갈비' },
  { username: 'yang_hyeyun', full_name: '양혜윤', skill_level: 'D', team: '양갈비' },
  { username: 'lee_taehun', full_name: '이태훈', skill_level: 'D', team: '양갈비' },
  { username: 'cha_songun', full_name: '차송운', skill_level: 'D', team: '양갈비' },
  { username: 'choi_seoyeon', full_name: '최서연', skill_level: 'D', team: '양갈비' },
  { username: 'choi_wonjeong', full_name: '최원정', skill_level: 'D', team: '양갈비' },
  { username: 'han_jiyun', full_name: '한지윤', skill_level: 'D', team: '양갈비' },
  { username: 'hwang_gyuyeon', full_name: '황규연', skill_level: 'D', team: '양갈비' },

  // 돼지갈비 팀 (E 레벨)
  { username: 'kim_minjeong', full_name: '김민정', skill_level: 'E', team: '돼지갈비' },
  { username: 'kim_youngsoon', full_name: '김영순', skill_level: 'E', team: '돼지갈비' },
  { username: 'seo_juyoung', full_name: '서주영', skill_level: 'E', team: '돼지갈비' },
  { username: 'yang_yeonyouk', full_name: '양연욱', skill_level: 'E', team: '돼지갈비' },
  { username: 'yong_hyunjeong', full_name: '용현정', skill_level: 'E', team: '돼지갈비' },
  { username: 'lee_yeonwoo', full_name: '이연우', skill_level: 'E', team: '돼지갈비' },
  { username: 'lee_woosung', full_name: '이우성', skill_level: 'E', team: '돼지갈비' },
  { username: 'lee_eunmi', full_name: '이은미', skill_level: 'E', team: '돼지갈비' },
  { username: 'lee_jeongchan', full_name: '이정찬', skill_level: 'E', team: '돼지갈비' },
  { username: 'hwang_yongdam', full_name: '황용담', skill_level: 'E', team: '돼지갈비' },

  // 닭갈비 팀 (N 레벨)
  { username: 'kang_sora', full_name: '강솔라', skill_level: 'N', team: '닭갈비' },
  { username: 'kang_jiyeon', full_name: '강지연', skill_level: 'N', team: '닭갈비' },
  { username: 'kim_euneok', full_name: '김은옥', skill_level: 'N', team: '닭갈비' },
  { username: 'park_giwouk', full_name: '박기욱', skill_level: 'N', team: '닭갈비' },
  { username: 'park_soyoung', full_name: '박소영', skill_level: 'N', team: '닭갈비' },
  { username: 'seo_minhee', full_name: '서민희', skill_level: 'N', team: '닭갈비' },
  { username: 'shim_hyunchul', full_name: '심현철', skill_level: 'N', team: '닭갈비' },
  { username: 'yeo_hyunseo', full_name: '여현서', skill_level: 'N', team: '닭갈비' },
  { username: 'jeong_gyumin', full_name: '정규민', skill_level: 'N', team: '닭갈비' },
  { username: 'jeong_sujeong', full_name: '정수정', skill_level: 'N', team: '닭갈비' },
  { username: 'jo_ingyu', full_name: '조인규', skill_level: 'N', team: '닭갈비' },
  { username: 'choi_yunsil', full_name: '최윤실', skill_level: 'N', team: '닭갈비' },
];

async function insertMembers() {
  console.log('🚀 배드민턴 클럽 멤버 데이터 입력 시작...\n');

  try {
    // 1. skill_level 제약 조건 업데이트
    console.log('📝 DB 스키마 업데이트 중...');
    const { error: alterError } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_check;
        ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check 
          CHECK (skill_level IN ('A', 'B', 'C', 'D', 'E', 'N'));
      `,
    });

    if (alterError) {
      console.warn('⚠️  스키마 업데이트 경고 (이미 존재할 수 있음):', alterError.message);
    } else {
      console.log('✅ 스키마 업데이트 완료\n');
    }

    // 2. 멤버 데이터 삽입
    console.log('📥 멤버 데이터 삽입 중...');
    
    const { error: insertError, data } = await supabase
      .from('profiles')
      .insert(
        members.map(member => ({
          username: member.username,
          full_name: member.full_name,
          skill_level: member.skill_level,
          role: 'user',
        }))
      );

    if (insertError) {
      console.error('❌ 데이터 삽입 오류:', insertError.message);
      return;
    }

    console.log(`✅ ${members.length}명의 멤버 데이터 삽입 완료\n`);

    // 3. 데이터 검증 및 통계
    console.log('📊 레벨별 통계 조회 중...\n');
    
    const { data: stats, error: statsError } = await supabase
      .from('profiles')
      .select('skill_level, full_name')
      .in('skill_level', ['A', 'B', 'C', 'D', 'E', 'N']);

    if (statsError) {
      console.error('❌ 통계 조회 오류:', statsError.message);
      return;
    }

    const levelNames: Record<string, string> = {
      'A': '🥇 캐비어 (최상급)',
      'B': '🥈 랍스터',
      'C': '🥉 소갈비',
      'D': '👥 양갈비',
      'E': '👥 돼지갈비',
      'N': '👥 닭갈비 (최하급)',
    };

    const grouped: Record<string, string[]> = {};
    stats?.forEach(profile => {
      if (!grouped[profile.skill_level]) {
        grouped[profile.skill_level] = [];
      }
      grouped[profile.skill_level].push(profile.full_name);
    });

    for (const level of ['A', 'B', 'C', 'D', 'E', 'N']) {
      if (grouped[level]) {
        const count = grouped[level].length;
        console.log(`${levelNames[level]}: ${count}명`);
        console.log(`  └─ ${grouped[level].join(', ')}\n`);
      }
    }

    // 4. 최종 요약
    const totalCount = Object.values(grouped).flat().length;
    console.log(`\n✨ 최종 결과: 총 ${totalCount}명의 멤버 데이터 입력 완료!\n`);

  } catch (error) {
    console.error('❌ 예상치 못한 오류:', error);
  }
}

insertMembers();
