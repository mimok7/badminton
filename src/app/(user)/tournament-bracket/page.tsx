import { Suspense } from 'react';
import TournamentBracketView from '@/components/tournament/TournamentBracketView';

export default function TournamentBracketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f5f7fb]" />}>
      <TournamentBracketView />
    </Suspense>
  );
}
