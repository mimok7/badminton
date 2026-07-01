'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const dynamic = 'force-dynamic';

interface ProfileOption {
  username: string;
  skill_level: string;
  skill_label: string;
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nameOptions, setNameOptions] = useState<ProfileOption[]>([]);

  // 이름 목록 불러오기 (새로운 RPC 함수 사용)
  const fetchNames = async () => {
    try {
      const { data, error } = await supabase.rpc('get_available_profiles');
      
      if (error) {
        console.error('이름 목록 조회 오류:', error);
        // 실패 시 기존 방식으로 fallback
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('username, user_id, skill_level')
          .order('username', { ascending: true });
        
        if (!fallbackError && fallbackData) {
          setNameOptions(fallbackData
            .filter((row: any) => !row.user_id && row.username)
            .map((row: any) => ({
              username: row.username,
              skill_level: row.skill_level || 'E2',
              skill_label: row.skill_level || 'E2급'
            }))
          );
        }
      } else if (data) {
        setNameOptions(data);
      }
    } catch (error) {
      console.error('이름 목록 조회 중 오류:', error);
    }
  };

  useEffect(() => {
    fetchNames();
  }, []);

 const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!name) {
    alert('이름을 선택해주세요.');
    return;
  }

  try {
    // 1. 먼저 선택한 이름이 아직 사용 가능한지 재확인
    const { data: nameCheck, error: nameError } = await supabase
      .from('profiles')
      .select('id, user_id, username')
      .eq('username', name)
      .maybeSingle();

    if (nameError) {
      console.error('이름 확인 오류:', nameError);
      alert('이름 확인 중 오류가 발생했습니다.');
      return;
    }

    if (!nameCheck) {
      alert('선택한 이름이 존재하지 않습니다. 페이지를 새로고침해주세요.');
      return;
    }

    if (nameCheck.user_id) {
      alert('선택한 이름이 이미 다른 사용자에게 연결되어 있습니다. 다른 이름을 선택해주세요.');
      // 이름 목록 새로고침
      await fetchNames();
      return;
    }

    // 2. 회원가입 시도
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    console.log('회원가입 응답:', { data, error });

    if (error) {
      alert('회원가입 실패: ' + error.message);
      return;
    }

    if (!data.user) {
      alert('회원가입 응답에 사용자 정보가 없습니다.');
      return;
    }

    const user = data.user;
    console.log('새 사용자 ID:', user.id);
    console.log('선택한 프로필 ID:', nameCheck.id);

    // 3. 기존 프로필에 user_id 연결
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        user_id: user.id,
        email: user.email
      })
      .eq('id', nameCheck.id);

    if (updateError) {
      console.error('프로필 업데이트 오류:', updateError);
      alert('프로필 연결 중 오류가 발생했습니다: ' + updateError.message);
      return;
    }

    console.log('✅ 프로필 연결 성공');
    alert('회원가입이 완료되었습니다! 선택한 프로필과 연결되었습니다.');
    router.push('/profile');

  } catch (error) {
    console.error('회원가입 처리 중 오류:', error);
    alert('회원가입 처리 중 오류가 발생했습니다.');
  }
};

  return (
    <div className="max-w-sm mx-auto mt-16 p-4 bg-white shadow rounded text-gray-800">
      <h2 className="text-2xl font-bold mb-6 text-center">📝 회원가입</h2>
      <form onSubmit={handleSignup} className="space-y-4">
        <input
          type="email"
          placeholder="이메일"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select
          className="w-full border p-2 rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        >
          <option value="">이름을 선택하세요</option>
          {nameOptions.map((option) => (
            <option key={option.username} value={option.username}>
              {option.username} ({option.skill_label})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-green-500 text-white w-full py-2 rounded hover:bg-green-600 transition"
        >
          회원가입
        </button>
      </form>
    </div>
  );
}
