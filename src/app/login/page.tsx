'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoFillMessage, setAutoFillMessage] = useState('');

  const handleNameChange = async (value: string) => {
    setFullName(value);
    
    if (!value.trim()) {
      setAutoFillMessage('');
      return;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('full_name', value.trim())
        .maybeSingle();

      if (data?.username) {
        setIdentifier(data.username);
        setAutoFillMessage(`✓ ${data.username}`);
      } else {
        setAutoFillMessage('이름을 찾을 수 없습니다.');
      }
    } catch (err) {
      console.error('프로필 조회 에러:', err);
    }
  };

  const resolveEmail = async (inputValue: string): Promise<string | null> => {
    try {
      let email = inputValue.trim();
      
      if (!email.includes('@')) {
        const { data } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', email)
          .single();

        if (!data?.email) {
          return null;
        }
        email = data.email;
      }

      return email;
    } catch (err) {
      return null;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const email = await resolveEmail(identifier);

      if (!email) {
        setError('입력한 이름 또는 이메일을 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        setLoading(false);
        return;
      }

      router.push('/');
    } catch (error) {
      setError('로그인 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  if (loading && !password) {
    // 로그인 중 - 폼이 여전히 표시되어야 함
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            로그인
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            라켓 뚱보단에 오신 것을 환영합니다! 🏸
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                한글 이름
              </label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="예: 김진호"
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                이름을 입력하면 아이디가 자동으로 채워집니다.
              </p>
              {autoFillMessage && (
                <p className={`mt-1 text-xs ${autoFillMessage.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                  {autoFillMessage}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                아이디 또는 이메일
              </label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username 또는 이메일 입력"
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                예: kim_jinho 또는 kim_jinho@badminton.local
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full"
              />
            </div>

            <div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? '로그인 중...' : '로그인'}
              </Button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                계정이 없으신가요?{' '}
                <Link 
                  href="/signup" 
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  회원가입
                </Link>
              </p>
            </div>
          </form>
        </div>

        <div className="text-center">
          <Link 
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
