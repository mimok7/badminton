import { redirect } from 'next/navigation';
import { getUserClubs } from '@/lib/club';
import ClubSelectorClient from './ClubSelectorClient';

// Note: setActiveClubAction is in @/app/actions/club.ts
// But since we are in a server component, we should import the action from there.
import { setActiveClubAction as setServerActiveClub } from '@/app/actions/club';

export default async function SelectClubPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const clubs = await getUserClubs() as any[];
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
        <ClubSelectorClient clubs={clubs as any} />
      </div>
    </div>
  );
}
