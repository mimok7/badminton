'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user, loading: userLoading } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 이미 로그인된 사용자는 홈페이지로 리다이렉트
  if (!userLoading && user) {
    router.push('/');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (loginError) {
        console.error('❌ 로그인 오류:', loginError);
        
        if (loginError.message.includes('rate limit')) {
          setError('너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요. (약 1분 대기)');
        } else if (loginError.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (loginError.message.includes('Email not confirmed')) {
          setError('이메일 인증이 완료되지 않았습니다. 이메일을 확인해주세요.');
        } else {
          setError('로그인 중 오류가 발생했습니다: ' + loginError.message);
        }
        setLoading(false);
        return;
      }

      router.push('/');
    } catch (error) {
      console.error('❌ 로그인 중 오류:', error);
      setError('로그인 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your-email@example.com"
                className="w-full"
              />
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
