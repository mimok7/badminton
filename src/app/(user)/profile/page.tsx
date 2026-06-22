'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SKILL_LEVEL_GROUP_SELECT_OPTIONS,
  SKILL_LEVEL_GROUP_CODES,
  getSkillLevelGroupCode,
  type SkillLevelGroupCode,
} from '@/lib/skill-levels';
import { getUserLevelDisplay } from '@/lib/level-display';
import { formatCurrentUserNameWithCoins } from '@/lib/player-display';

const formSchema = z.object({
  username: z.string().min(2, { message: '닉네임은 2자 이상이어야 합니다.' }),
  skill_level: z.enum(SKILL_LEVEL_GROUP_CODES),
});

export default function ProfilePage() {
  const { user, profile, loading: userLoading } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseClient();
  const displayName = formatCurrentUserNameWithCoins(profile?.full_name || profile?.username || '회원', profile?.coin_balance);
  const levelLabel = getUserLevelDisplay(profile?.skill_level);
  const roleLabel = profile?.role === 'admin' ? '관리자' : '일반 회원';
  const genderLabel =
    profile?.gender === 'male' || profile?.gender === 'M'
      ? '남성'
      : profile?.gender === 'female' || profile?.gender === 'F'
        ? '여성'
        : '미설정';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      skill_level: 'D1',
    },
  });

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login');
      return;
    }

    if (profile) {
      const level = getSkillLevelGroupCode(profile.skill_level) as SkillLevelGroupCode;
      form.reset({
        username: profile.username || '',
        skill_level: level,
      });
    }
  }, [user, profile, userLoading, router, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      alert('로그인이 필요합니다.');
      router.push('/login');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from('profiles').update(values).eq('user_id', user.id);

    setIsSubmitting(false);
    if (error) {
      console.error('프로필 업데이트 오류:', error);
      alert(`프로필 업데이트 실패: ${error.message}`);
    } else {
      alert('프로필이 성공적으로 업데이트되었습니다.');
    }
  }

  if (userLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          프로필을 불러오는 중입니다
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <section className="rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">안녕하세요</p>
              <h1 className="mt-1 text-2xl font-semibold">{displayName}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">레벨 {levelLabel}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{roleLabel}</span>
                <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-amber-100">코인 {profile?.coin_balance ?? 0}</span>
              </div>
            </div>
            <Link href="/dashboard" className="rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15">
              홈
            </Link>
          </div>

          <div className="mt-5 rounded-[22px] bg-white/8 px-4 py-4">
            <p className="text-sm text-slate-300">오늘의 상태</p>
            <p className="mt-1 text-lg font-semibold text-white">{genderLabel} · {levelLabel}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-white/8 px-2 py-3">
                <p className="text-[11px] text-slate-300">역할</p>
                <p className="mt-1 text-sm font-semibold text-white">{roleLabel}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-2 py-3">
                <p className="text-[11px] text-slate-300">성별</p>
                <p className="mt-1 text-sm font-semibold text-white">{genderLabel}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-2 py-3">
                <p className="text-[11px] text-slate-300">급수</p>
                <p className="mt-1 text-sm font-semibold text-white">{levelLabel}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-2 py-3">
                <p className="text-[11px] text-slate-300">코인</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.coin_balance ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-2 py-3">
                <p className="text-[11px] text-slate-300">승 / 패</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {profile?.coin_wins ?? 0} / {profile?.coin_losses ?? 0}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
          <div>
            <p className="text-xs text-slate-500">프로필 수정</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">급수 변경</h2>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-5">
              <FormField
                control={form.control}
                name="skill_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-slate-700">급수 선택</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-2xl border-slate-300 bg-white">
                          <SelectValue placeholder="급수를 선택하세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SKILL_LEVEL_GROUP_SELECT_OPTIONS.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 flex-1 rounded-2xl bg-[#0f172a] text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmitting ? '업데이트 중...' : '프로필 업데이트'}
                </Button>
                <Link href="/dashboard" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full rounded-2xl border-slate-300 text-base font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    대시보드로
                  </Button>
                </Link>
              </div>
            </form>
          </Form>
        </section>
      </div>
    </div>
  );
}
