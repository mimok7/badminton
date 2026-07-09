import { redirect } from 'next/navigation';
import { getUserClubs } from '@/lib/club';
import ClubSelectorClient from './ClubSelectorClient';
import { setActiveClubAction as setServerActiveClub } from '@/app/actions/club';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';

export default async function SelectClubPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  const role = await getUserRole(supabase, user);
  const isGlobalAdminOrManager = role === 'admin' || role === 'manager';

  let clubs: any[] = [];
  if (isGlobalAdminOrManager) {
    // 관리자/매니저는 가입 여부와 상관없이 모든 클럽 조회 가능
    const { data: allClubs, error } = await supabase
      .from('clubs')
      .select('id, name, code')
      .order('name');
    
    if (!error && allClubs) {
      clubs = allClubs.map((club: any) => ({
        club_id: club.id,
        role: 'admin',
        status: 'active',
        clubs: club,
      }));
    }
  } else {
    clubs = (await getUserClubs()) as any[];
  }

  const resolvedSearchParams = await searchParams;
  const redirectTo = resolvedSearchParams?.redirectTo || '/';

  // 가입된 클럽이 1개뿐이라면 자동으로 선택하고 리다이렉트
  if (clubs.length === 1) {
    const club = Array.isArray(clubs[0].clubs) ? clubs[0].clubs[0] : clubs[0].clubs;
    if (club) {
      await setServerActiveClub(club.id);
      redirect(redirectTo);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        <ClubSelectorClient clubs={clubs as any} isGlobalAdmin={isGlobalAdminOrManager} />
      </div>
    </div>
  );
}
