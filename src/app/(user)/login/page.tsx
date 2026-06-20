'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_ADMIN_REDIRECT,
  DEFAULT_USER_REDIRECT,
  isSafeRedirectPath,
} from '@/lib/route-access';
import { getProfileByUserId, isAdminRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const INITIAL_TEMP_PASSWORD = 'bad123!';
const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

export default function LoginPage() {
  const supabase = getSupabaseClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoFillMessage, setAutoFillMessage] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true';
  const shouldRequirePasswordChange = (value: unknown) => value === true || value === 'true';

  const findProfileByName = async (value: string, signal?: AbortSignal) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    const response = await fetch(`/api/auth/profile-email?fullName=${encodeURIComponent(trimmedValue)}`, {
      method: 'GET',
      cache: 'no-store',
      signal,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Profile lookup failed');
    }

    const payload = await response.json();
    return payload;
  };

  const getLoginErrorMessage = (message?: string) => {
    const normalized = message?.toLowerCase() ?? '';

    if (
      normalized.includes('invalid login credentials') ||
      normalized.includes('email not confirmed') ||
      normalized.includes('invalid email or password')
    ) {
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }

    if (normalized.includes('email rate limit exceeded')) {
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
    }

    return message || '로그인 중 오류가 발생했습니다.';
  };

  const getLookupErrorMessage = (message?: string) => {
    const normalized = message?.toLowerCase() ?? '';

    if (normalized.includes('multiple profiles found')) {
      return '같은 한글 이름의 계정이 2개 이상 있습니다. 관리자에게 문의해주세요.';
    }

    if (normalized.includes('supabase server configuration is missing')) {
      return '서버 설정이 올바르지 않습니다. 관리자에게 문의해주세요.';
    }

    if (normalized.includes('no profile found')) {
      return '등록된 한글 이름을 찾지 못했습니다.';
    }

    return '이메일 조회 중 문제가 발생했습니다.';
  };

  const shouldRedirectAdminToAdminDashboard = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  };

  const handleNameSearch = async () => {
    const trimmedFullName = fullName.trim();

    setError('');

    if (!trimmedFullName) {
      setAutoFillMessage('한글 이름을 입력해주세요.');
      setEmail('');
      return;
    }

    if (trimmedFullName.length < 2) {
      setAutoFillMessage('이름을 두 글자 이상 입력해주세요.');
      setEmail('');
      return;
    }

    try {
      setLookupLoading(true);
      const data = await findProfileByName(trimmedFullName);

      if (data?.email) {
        const normalizedEmail = data.email.trim().toLowerCase();
        setEmail(normalizedEmail);
        setAutoFillMessage(`✓ 등록된 이메일을 찾았습니다.${data.username ? ` (${data.username})` : ''}`);
      } else {
        setEmail('');
        setAutoFillMessage('등록된 한글 이름을 찾지 못했습니다.');
      }
    } catch (err) {
      setEmail('');
      const message = err instanceof Error ? err.message : undefined;
      setAutoFillMessage(getLookupErrorMessage(message));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const trimmedFullName = fullName.trim();
      const trimmedPassword = password.trim();

      if (!trimmedFullName) {
        setError('한글 이름을 입력해주세요.');
        return;
      }

      if (!trimmedPassword) {
        setError('비밀번호를 입력해주세요.');
        return;
      }

      let resolvedEmail = email.trim().toLowerCase();

      if (!resolvedEmail) {
        const profileLookup = await findProfileByName(trimmedFullName);

        if (!profileLookup?.email) {
          setError('입력한 한글 이름에 연결된 이메일을 찾을 수 없습니다.');
          return;
        }

        resolvedEmail = profileLookup.email.trim().toLowerCase();
        setEmail(resolvedEmail);
      }

      if (!resolvedEmail.includes('@')) {
        setError('로그인에 사용할 이메일 정보를 찾을 수 없습니다.');
        return;
      }

      const { data: signInData, error: loginError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password: trimmedPassword
      });

      if (loginError) {
        if (debugEnabled) {
          console.error('로그인 실패:', loginError);
        }
        setError(getLoginErrorMessage(loginError.message));
        return;
      }

      const userId = signInData.user?.id ?? signInData.session?.user?.id ?? null;
      let mustChangePassword = shouldRequirePasswordChange(
        signInData.user?.user_metadata?.must_change_password ??
        signInData.session?.user?.user_metadata?.must_change_password
      );

      if (mustChangePassword && trimmedPassword !== INITIAL_TEMP_PASSWORD) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            ...(signInData.user?.user_metadata || signInData.session?.user?.user_metadata || {}),
            must_change_password: false,
          },
        });

        if (metadataError) {
          if (debugEnabled) {
            console.error('초기 비밀번호 플래그 해제 실패:', metadataError);
          }
        } else {
          await supabase.auth.refreshSession();
          mustChangePassword = false;
        }
      }

      let nextPath = mustChangePassword ? '/change-password' : DEFAULT_USER_REDIRECT;

      if (userId && !mustChangePassword) {
        const profile = await getProfileByUserId(supabase, userId);
        const isAdmin = isAdminRole(profile?.role);
        nextPath = isAdmin
          ? (shouldRedirectAdminToAdminDashboard() ? '/admin' : DEFAULT_ADMIN_REDIRECT)
          : DEFAULT_USER_REDIRECT;
      }

      const redirectTo =
        typeof window === 'undefined'
          ? null
          : new URLSearchParams(window.location.search).get('redirectTo');

      if (redirectTo && isSafeRedirectPath(redirectTo)) {
        nextPath = redirectTo;
      }

      window.location.replace(nextPath);
    } catch (error) {
      if (debugEnabled) {
        console.error('로그인 처리 중 예외:', error);
      }
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
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
          <div className="mb-5 flex justify-center">
            <div className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <Image
                src="/badminton.png"
                alt="라켓 뚱보단 로고"
                width={128}
                height={128}
                className="h-28 w-28 object-contain sm:h-32 sm:w-32"
              />
            </div>
          </div>
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
              <div className="flex gap-2">
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setEmail('');
                    setError('');
                    setAutoFillMessage('');
                  }}
                  placeholder="예: 김진호"
                  className="w-full"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNameSearch}
                  disabled={lookupLoading}
                  className="shrink-0"
                >
                  {lookupLoading ? '검색 중...' : '검색'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                이름 입력 후 검색 버튼을 누르면 등록된 계정을 확인합니다.
              </p>
              {autoFillMessage && (
                <p className={`mt-1 text-xs ${autoFillMessage.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>
                  {autoFillMessage}
                </p>
              )}
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
