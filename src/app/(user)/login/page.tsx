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
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [skillLevel, setSkillLevel] = useState('A3');
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

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestLoading) return;
    setGuestLoading(true);
    setGuestError('');

    try {
      const response = await fetch('/api/auth/register-guest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullName: guestName, skillLevel }),
      });

      const data = await response.json();

      if (!response.ok) {
        setGuestError(data.error || '게스트 등록에 실패했습니다.');
        setGuestLoading(false);
        return;
      }

      // 게스트 등록 성공 -> 받은 임시 정보로 로그인 시도
      const { email: guestEmail, password: guestPassword, matchDescription } = data;
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: guestEmail,
        password: guestPassword,
      });

      if (loginError) {
        setGuestError('로그인 처리 중 문제가 발생했습니다: ' + loginError.message);
        setGuestLoading(false);
        return;
      }

      alert(`게스트 등록 및 참가 신청이 완료되었습니다!\n신청된 경기: ${matchDescription}`);
      setShowGuestModal(false);
      window.location.replace(DEFAULT_USER_REDIRECT);
    } catch (err) {
      console.error(err);
      setGuestError('게스트 신청 처리 중 오류가 발생했습니다.');
    } finally {
      setGuestLoading(false);
    }
  };

  if (loading && !password) {
    // 로그인 중 - 폼이 여전히 표시되어야 함
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb] p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="mb-5 flex justify-center">
            <div className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
              <Image
                src="/badminton.png"
                alt="라켓 뚱보단 로고"
                width={128}
                height={128}
                className="h-28 w-28 object-contain sm:h-32 sm:w-32"
              />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900">
            로그인
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            라켓 뚱보단에 오신 것을 환영합니다! 🏸
          </p>
        </div>

        <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 shadow-sm">
          <form className="space-y-4" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
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
                  className="w-full h-12 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNameSearch}
                  disabled={lookupLoading}
                  className="shrink-0 h-12 rounded-xl border-slate-200 bg-white hover:bg-slate-50 font-semibold px-4 text-xs"
                >
                  {lookupLoading ? '검색 중...' : '검색'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                이름 입력 후 검색 버튼을 누르면 등록된 계정을 확인합니다.
              </p>
              {autoFillMessage && (
                <p className={`text-[11px] font-semibold ${autoFillMessage.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>
                  {autoFillMessage}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
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
                className="w-full h-12 rounded-xl"
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-semibold shadow-lg shadow-indigo-600/10"
              >
                {loading ? '로그인 중...' : '로그인'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowGuestModal(true);
                  setGuestName('');
                  setGuestError('');
                }}
                className="w-full h-12 rounded-xl border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50/50 font-semibold"
              >
                👤 일일 게스트 신청 (비회원)
              </Button>
            </div>
          </form>
        </div>

        <div className="text-center flex flex-col gap-2.5 pt-2">
          <div>
            <Link 
              href="/manual" 
              className="text-sm text-indigo-600 hover:underline font-semibold"
            >
              📖 사용자 설명서 보기
            </Link>
          </div>
          <div>
            <Link 
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
            >
              ← 홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>

      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 shadow-2xl max-w-sm w-full space-y-4 relative animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900">🏸 일일 게스트 신청</h3>
              <p className="text-xs text-slate-500 mt-1">오늘 경기 참가를 위한 임시 게스트 등록</p>
            </div>
            
            {guestError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3.5 py-2.5 rounded-xl text-xs">
                {guestError}
              </div>
            )}

            <form onSubmit={handleGuestSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="guestName" className="text-xs font-semibold text-slate-600">
                  게스트 한글 이름
                </label>
                <Input
                  id="guestName"
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full h-11 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="skillLevel" className="text-xs font-semibold text-slate-600">
                  실력 수준 (등급)
                </label>
                <select
                  id="skillLevel"
                  value={skillLevel}
                  onChange={(e) => setSkillLevel(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-900"
                >
                  <option value="A3">캐비어 3단계 (상급)</option>
                  <option value="A2">캐비어 2단계</option>
                  <option value="A1">캐비어 1단계</option>
                  <option value="B3">랍스터 3단계</option>
                  <option value="B2">랍스터 2단계</option>
                  <option value="B1">랍스터 1단계</option>
                  <option value="C3">소갈비 3단계</option>
                  <option value="C2">소갈비 2단계</option>
                  <option value="C1">소갈비 1단계</option>
                  <option value="D3">양갈비 3단계</option>
                  <option value="D2">양갈비 2단계</option>
                  <option value="D1">양갈비 1단계</option>
                  <option value="E3">돼지갈비 3단계</option>
                  <option value="E2">돼지갈비 2단계</option>
                  <option value="E1">돼지갈비 1단계</option>
                  <option value="N3">닭갈비 3단계</option>
                  <option value="N2">닭갈비 2단계</option>
                  <option value="N1">닭갈비 1단계 (초급)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  ※ 게임 배정을 위해 정확한 본인의 실력 수준을 선택해 주세요.
                </p>
                <div className="text-[10px] text-slate-400 space-y-1 mt-2">
                  <p>※ 오늘 경기에 정원이 미달한 경우에만 신청이 가능합니다. 경기가 끝난 후 계정은 삭제됩니다.</p>
                  <p>초기비밀번호는 : bad123! 입니다.</p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGuestModal(false)}
                  disabled={guestLoading}
                  className="w-1/2 h-11 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-sm"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={guestLoading}
                  className="w-1/2 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/10"
                >
                  {guestLoading ? '신청 중...' : '신청하기'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
