'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import AttendanceStatus from '@/app/players/components/AttendanceStatus';
import MatchSessionStatus from '@/app/players/components/MatchSessionStatus';
import MatchGenerationControls from '@/app/players/components/MatchGenerationControls';
import GeneratedMatchesList from '@/app/players/components/GeneratedMatchesList';
import { ExtendedPlayer, MatchSession } from '@/app/players/types';
import { supabase, fetchTodayPlayers, calculatePlayerGameCounts, normalizeLevel } from '@/app/players/utils';
import { Match } from '@/types';

export default function PlayersTodayPage() {
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  const [sessionMode, setSessionMode] = useState<'레벨' | '랜덤' | '혼복'>('레벨');
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);

  useEffect(() => {
    const init = async () => {
      const players = await fetchTodayPlayers();
      setTodayPlayers(players);
      await fetchMatchSessions();
    };
    init();
  }, []);

  const fetchMatchSessions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('session_date', today)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMatchSessions(data || []);
    } catch (e) {
      console.error('세션 조회 오류:', e);
    }
  };

  const handleAssignByLevel = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) {
        alert('최소 4명의 출석자가 필요합니다.');
        return;
      }
      const playersForMatch = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
    const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
  const generated = createBalancedDoublesMatches(playersForMatch, 4, perPlayerMinGames).map((m, i) => ({ ...m, court: i + 1 }));
      setMatches(generated);
  setSessionMode('레벨');
      setPlayerGameCounts(calculatePlayerGameCounts(generated));
    } catch (e) {
      console.error(e);
      alert('레벨별 경기 생성 중 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRandom = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
    const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
  const generated = createRandomBalancedDoublesMatches(present, 4, perPlayerMinGames).map((m: any, i: number) => ({ ...m, court: i + 1 }));
  setMatches(generated);
  setSessionMode('랜덤');
      setPlayerGameCounts(calculatePlayerGameCounts(generated));
    } catch (e) {
      console.error(e);
      alert('랜덤 경기 생성 중 오류');
    } finally { setLoading(false); }
  };

  const handleAssignMixed = async () => {
    if (!todayPlayers) return;
    setLoading(true);
    try {
      const present = todayPlayers.filter(p => p.status === 'present');
      if (present.length < 4) { alert('최소 4명의 출석자가 필요합니다.'); return; }
      const playersForMatch = present.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
    const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
  const generated = createMixedAndSameSexDoublesMatches(playersForMatch, 4, perPlayerMinGames).map((m: any, i: number) => ({ ...m, court: i + 1 }));
  setMatches(generated);
  setSessionMode('혼복');
      setPlayerGameCounts(calculatePlayerGameCounts(generated));
    } catch (e) { console.error(e); alert('혼복 경기 생성 중 오류'); }
    finally { setLoading(false); }
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) { alert('배정할 경기가 없습니다.'); return; }
    const today = new Date().toISOString().split('T')[0];
  const mode = sessionMode; // use generation mode (레벨/랜덤/혼복)
  const makeSessionName = async () => {
      // count today sessions to generate sequence
      const { data, error } = await supabase
        .from('match_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('session_date', today);
      const seq = (data as any)?.length ? (data as any).length + 1 : 1; // fallback if head returns no length
      // safer: do a separate count query
      const { count } = await supabase
        .from('match_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_date', today);
  const n = (count ?? seq) + 1;
  return `${today}_${mode}_${n}번째`;
    };
    const sessionName = await makeSessionName();
    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('match_sessions')
        .insert({ session_name: sessionName, total_matches: matches.length, assigned_matches: matches.length, session_date: today })
        .select()
        .single();
      if (sessionError) throw sessionError;

      const payload = matches.map((match, idx) => ({
        session_id: sessionData.id,
        match_number: idx + 1,
        team1_player1_id: match.team1.player1.id,
        team1_player2_id: match.team1.player2.id,
        team2_player1_id: match.team2.player1.id,
        team2_player2_id: match.team2.player2.id,
        status: 'scheduled',
        created_at: new Date().toISOString()
      }));
      const { error: insErr } = await supabase.from('generated_matches').insert(payload);
      if (insErr) throw insErr;
  alert(`✅ ${matches.length}개 경기가 오늘 순서대로 배정되었습니다. (세션: ${sessionName})`);
  setMatches([]); setPlayerGameCounts({});
      await fetchMatchSessions();
    } catch (e) {
      console.error('배정 오류:', e);
      alert('배정 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  return (
    <RequireAdmin>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">오늘 경기 생성/배정</h1>
        <AttendanceStatus todayPlayers={todayPlayers} />
        <MatchSessionStatus matchSessions={matchSessions} />
        <MatchGenerationControls
          todayPlayers={todayPlayers}
          perPlayerMinGames={1}
          setPerPlayerMinGames={() => {}}
          onGenerateByLevel={handleAssignByLevel}
          onGenerateRandom={handleAssignRandom}
          onGenerateMixed={handleAssignMixed}
        />
  <GeneratedMatchesList
          matches={matches}
          playerGameCounts={playerGameCounts}
          assignType={assignType}
          setAssignType={setAssignType}
          loading={loading}
          onClearMatches={() => { setMatches([]); setPlayerGameCounts({}); }}
          onAssignMatches={handleDirectAssign}
        />
      </div>
    </RequireAdmin>
  );
}
