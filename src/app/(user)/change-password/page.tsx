'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { user, loading } = useUser();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true';

  const getPasswordErrorMessage = (message?: string) => {
    const normalized = message?.toLowerCase() ?? '';

    if (normalized.includes('same password')) {
      return '기존 비밀번호와 다른 새 비밀번호를 입력해주세요.';
    }

    if (
      normalized.includes('password should be at least') ||
      normalized.includes('password is too weak') ||
      normalized.includes('weak password') ||
      normalized.includes('password')
    ) {
      return '비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함하는 강한 비밀번호로 입력해주세요.';
    }

    return message || '비밀번호 변경 중 오류가 발생했습니다.';
  };

  useEffect(() => {
    let mounted = true;

    const ensureSession = async () => {
      if (loading) {
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!user && !data.session) {
        router.replace('/login');
        return;
      }

      setSessionChecked(true);
    };

    ensureSession();

    return () => {
      mounted = false;
    };
  }, [loading, user, router, supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('인증 세션이 없습니다. 다시 로그인해주세요.');
        router.replace('/login');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          ...(session.user.user_metadata || {}),
          must_change_password: false,
        },
      });

      if (updateError) {
        setError(getPasswordErrorMessage(updateError.message));
        return;
      }

      await supabase.auth.refreshSession();

      const {
        data: { user: updatedUser },
      } = await supabase.auth.getUser();

      const mustChangePassword =
        updatedUser?.user_metadata?.must_change_password === true ||
        updatedUser?.user_metadata?.must_change_password === 'true';

      if (mustChangePassword) {
        setError('비밀번호는 변경되었지만 세션 갱신이 완료되지 않았습니다. 다시 로그인해주세요.');
        await supabase.auth.signOut();
        window.location.replace('/login');
        return;
      }

      window.location.replace('/');
    } catch (err) {
      if (debugEnabled) {
        console.error('비밀번호 변경 에러:', err);
      }
      setError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb] p-4">
      <div className="w-full max-w-md rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">비밀번호 변경</h1>
          <p className="mt-2 text-sm text-slate-600">
            첫 로그인입니다. 새 비밀번호로 변경해 주세요.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              새 비밀번호
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="영문, 숫자, 특수문자 포함 8자 이상"
              className="w-full h-12 rounded-xl"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="confirmPassword">
              새 비밀번호 확인
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 다시 입력"
              className="w-full h-12 rounded-xl"
              required
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-semibold" disabled={saving}>
            {saving ? '변경 중...' : '비밀번호 변경'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline font-semibold">
            로그인 화면으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
