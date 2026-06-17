'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { getUserLevelDisplay } from '@/lib/level-display';

export const dynamic = 'force-dynamic';

interface ProfileOption {
  id: string;
  username: string;
  skill_level: string;
  skill_label: string;
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [nameOptions, setNameOptions] = useState<ProfileOption[]>([]);

  // 가입 가능한 placeholder 프로필만 조회한다.
  const fetchNames = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, user_id, skill_level')
        .is('user_id', null)
        .not('username', 'is', null)
        .order('username', { ascending: true });

      if (error) {
        console.error('이름 목록 조회 오류:', error);
        return;
      }

      setNameOptions(
        (data || [])
          .map((row) => {
            if (typeof row.id !== 'string' || typeof row.username !== 'string' || row.user_id) {
              return null;
            }

            return {
              id: row.id,
              username: row.username,
              skill_level: row.skill_level || 'E2',
              skill_label: getUserLevelDisplay(row.skill_level),
            };
          })
          .filter((row): row is ProfileOption => row !== null)
      );
    } catch (error) {
      console.error('이름 목록 조회 중 오류:', error);
    }
  };

  useEffect(() => {
    fetchNames();
  }, []);

 const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!selectedProfileId) {
    alert('이름을 선택해주세요.');
    return;
  }

  try {
    // 1. 선택한 placeholder 프로필이 아직 비어 있는지 재확인
    const { data: nameCheck, error: nameError } = await supabase
      .from('profiles')
      .select('id, user_id, username')
      .eq('id', selectedProfileId)
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

    // 3. 기존 placeholder 프로필에 auth user_id 연결
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        user_id: user.id,
        email: user.email
      })
      .eq('id', nameCheck.id)
      .is('user_id', null)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('프로필 업데이트 오류:', updateError);
      alert('프로필 연결 중 오류가 발생했습니다: ' + updateError.message);
      return;
    }

    if (!updatedProfile) {
      alert('선택한 프로필이 방금 다른 사용자와 연결되었습니다. 다시 선택해주세요.');
      await fetchNames();
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
          value={selectedProfileId}
          onChange={(e) => setSelectedProfileId(e.target.value)}
          required
        >
          <option value="">이름을 선택하세요</option>
          {nameOptions.map((option) => (
            <option key={option.id} value={option.id}>
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
