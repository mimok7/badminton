'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import Link from 'next/link';

const formSchema = z.object({
  username: z.string().min(2, { message: '닉네임은 2자 이상이어야 합니다.' }),
  skill_level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2']),
});

export default function ProfilePage() {
  const { user, profile, loading: userLoading } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseClient();

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
      const level = (profile.skill_level as
        | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D1' | 'D2' | 'E1' | 'E2'
        | undefined) ?? 'D1';
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
    
    const { error } = await supabase
      .from('profiles')
      .update(values)
      .eq('user_id', user.id);

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
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 상단 헤더 */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              👤 내 프로필
            </h1>
            <Link href="/" className="text-white hover:text-blue-100 transition-colors">
              🏠 홈
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm mb-4">
            <span className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full">
              {profile?.full_name || profile?.username || '회원'}님
            </span>
            <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
              프로필 수정
            </span>
          </div>
          <p className="text-blue-100">
            프로필 정보를 수정하고 관리하세요! ✏️
          </p>
        </div>

        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
          {/* 현재 역할 정보 표시 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h2 className="font-semibold text-lg text-gray-800 mb-3">📋 현재 계정 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-16">역할:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  profile?.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {profile?.role === 'admin' ? '관리자' : '일반 회원'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-16">성별:</span>
                <span className="text-gray-800">
                  {profile?.gender === 'male' || profile?.gender === 'M'
                    ? '남성'
                    : profile?.gender === 'female' || profile?.gender === 'F'
                    ? '여성'
                    : '미설정'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-16">현재급수:</span>
                <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
                  {profile?.skill_level ? `${profile.skill_level}급` : 'D1급'}
                </span>
              </div>
            </div>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField 
                control={form.control} 
                name="skill_level" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">급수</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="급수를 선택하세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="A1">A1급 (최상급)</SelectItem>
                        <SelectItem value="A2">A2급 (최상급)</SelectItem>
                        <SelectItem value="B1">B1급 (상급)</SelectItem>
                        <SelectItem value="B2">B2급 (상급)</SelectItem>
                        <SelectItem value="C1">C1급 (중상급)</SelectItem>
                        <SelectItem value="C2">C2급 (중상급)</SelectItem>
                        <SelectItem value="D1">D1급 (중급)</SelectItem>
                        <SelectItem value="D2">D2급 (중급)</SelectItem>
                        <SelectItem value="E1">E1급 (초급)</SelectItem>
                        <SelectItem value="E2">E2급 (초급)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 text-base">
                  {isSubmitting ? '업데이트 중...' : '✅ 프로필 업데이트'}
                </Button>
                <Link href="/" className="flex-1">
                  <Button variant="outline" type="button" className="w-full h-12 text-base">
                    🏠 홈으로
                  </Button>
                </Link>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
