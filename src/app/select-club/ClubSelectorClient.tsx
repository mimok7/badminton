'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setActiveClubAction } from '@/app/actions/club';

type Club = {
  club_id: string;
  role: string;
  status: string;
  clubs: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export default function ClubSelectorClient({ clubs }: { clubs: Club[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (clubId: string) => {
    setLoading(clubId);
    try {
      await setActiveClubAction(clubId);
      router.push(redirectTo);
    } catch (error) {
      console.error('Failed to set club:', error);
      setLoading(null);
    }
  };

  if (clubs.length === 0) {
    return (
      <div className="text-center p-8 bg-slate-800 rounded-xl border border-slate-700">
        <h2 className="text-xl font-bold mb-4 text-white">가입된 클럽이 없습니다</h2>
        <p className="text-slate-400 mb-6">초대 코드를 통해 클럽에 가입하거나 관리자에게 문의하세요.</p>
        <Button variant="outline" onClick={() => router.push('/login')}>
          로그인 페이지로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center text-white mb-6">입장할 클럽을 선택하세요</h2>
      <div className="grid gap-4">
        {clubs.map((c) => {
          const club = Array.isArray(c.clubs) ? c.clubs[0] : c.clubs;
          if (!club) return null;
          
          return (
            <button
              key={club.id}
              onClick={() => handleSelect(club.id)}
              disabled={loading !== null}
              className={`p-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all text-left flex items-center justify-between group ${
                loading === club.id ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              <div>
                <h3 className="text-xl font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                  {club.name}
                </h3>
                <p className="text-sm text-slate-400 mt-1">권한: {c.role === 'admin' ? '관리자' : '일반 회원'}</p>
              </div>
              <div className="text-slate-500 group-hover:text-emerald-400 transition-colors">
                {loading === club.id ? (
                  <span className="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  '입장하기 →'
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
