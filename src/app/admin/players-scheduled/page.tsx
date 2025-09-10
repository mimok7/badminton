'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import GeneratedMatchesList from '@/app/players/components/GeneratedMatchesList';
import MatchSessionStatus from '@/app/players/components/MatchSessionStatus';
import { ExtendedPlayer, MatchSession, AvailableDate } from '@/app/players/types';
import { supabase, fetchRegisteredPlayersForDate, calculatePlayerGameCounts, normalizeLevel } from '@/app/players/utils';
import { Match } from '@/types';

export default function PlayersScheduledPage() {
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [players, setPlayers] = useState<ExtendedPlayer[]>([]);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);

  useEffect(() => {
    fetchAvailableDates();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!selectedDate) { setPlayers([]); setMatchSessions([]); return; }
      const p = await fetchRegisteredPlayersForDate(selectedDate);
      setPlayers(p);
      await fetchMatchSessions(selectedDate);
    };
    load();
  }, [selectedDate]);

  const fetchAvailableDates = async () => {
    try {
      const { data: schedules, error } = await supabase
        .from('match_schedules')
        .select('match_date, location, start_time, end_time, max_participants, current_participants, status')
        .gte('match_date', new Date().toISOString().split('T')[0])
        .eq('status', 'scheduled')
        .order('match_date', { ascending: true });
      if (error) throw error;

      const groups: Record<string, any[]> = {};
      (schedules || []).forEach(s => { (groups[s.match_date] ||= []).push(s); });
      const list: AvailableDate[] = Object.entries(groups).map(([date, arr]) => {
        const totalCapacity = arr.reduce((a: number, s: any) => a + s.max_participants, 0);
        const currentParticipants = arr.reduce((a: number, s: any) => a + s.current_participants, 0);
        return {
          date,
          schedules: arr,
          totalCapacity,
          currentParticipants,
          availableSlots: totalCapacity - currentParticipants,
          location: arr[0]?.location || '장소 미정',
          timeRange: `${arr[0]?.start_time || '시간'} - ${arr[arr.length - 1]?.end_time || '미정'}`
        } as AvailableDate;
      });
      setAvailableDates(list);
    } catch (e) {
      console.error('일정 로드 오류:', e);
      setAvailableDates([]);
    }
  };

  const fetchMatchSessions = async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('session_date', date)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMatchSessions(data || []);
    } catch (e) { console.error('세션 조회 오류:', e); }
  };

  const generateBy = async (mode: 'level' | 'random' | 'mixed') => {
    if (!selectedDate) { alert('날짜를 선택하세요.'); return; }
    if (players.length < 4) { alert('최소 4명의 신청자가 필요합니다.'); return; }
    setLoading(true);
    try {
      let generated: any[] = [];
      if (mode === 'level') {
        const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
        const normalized = players.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
        generated = createBalancedDoublesMatches(normalized, 4, perPlayerMinGames);
      } else if (mode === 'random') {
        const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
        generated = createRandomBalancedDoublesMatches(players, 4, perPlayerMinGames);
      } else {
        const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
        const normalized = players.map(p => ({ ...p, skill_level: normalizeLevel(p.skill_level) }));
        generated = createMixedAndSameSexDoublesMatches(normalized, 4, perPlayerMinGames);
      }
      const withCourt = generated.map((m, i) => ({ ...m, court: i + 1 }));
      setMatches(withCourt);
      setPlayerGameCounts(calculatePlayerGameCounts(withCourt));
    } catch (e) {
      console.error('생성 오류:', e);
      alert('경기 생성 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  const handleDirectAssign = async () => {
    if (matches.length === 0) { alert('배정할 경기가 없습니다.'); return; }
    if (!selectedDate) { alert('날짜를 선택해주세요.'); return; }
    const mode = '예정';
    const makeSessionName = async () => {
      const { count } = await supabase
        .from('match_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_date', selectedDate);
  const n = (count ?? 0) + 1;
  return `${selectedDate}_${mode}_${n}번째`;
    };
    const sessionName = await makeSessionName();
    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('match_sessions')
        .insert({ session_name: sessionName, total_matches: matches.length, assigned_matches: 0, session_date: selectedDate })
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
  alert(`✅ ${matches.length}개 경기가 ${new Date(selectedDate).toLocaleDateString('ko-KR')} 일정으로 배정되었습니다. (세션: ${sessionName})`);
  setMatches([]); setPlayerGameCounts({});
      await fetchMatchSessions(selectedDate);
    } catch (e) { console.error('배정 오류:', e); alert('배정 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  return (
    <RequireAdmin>
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">예정 일정 기반 경기 생성/배정</h1>
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">경기 날짜 선택</label>
          <select className="border rounded px-3 py-2 text-sm" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
            <option value="">날짜를 선택하세요</option>
            {availableDates.map(d => (
              <option key={d.date} value={d.date}>
                {new Date(d.date).toLocaleDateString('ko-KR')} — 신청 {d.currentParticipants} / {d.totalCapacity}명, 장소 {d.location}
              </option>
            ))}
          </select>
        </div>

        <MatchSessionStatus matchSessions={matchSessions} />

        <div className="flex gap-2">
          <button className="px-3 py-2 border rounded" onClick={() => generateBy('level')}>레벨별 생성</button>
          <button className="px-3 py-2 border rounded" onClick={() => generateBy('random')}>랜덤 생성</button>
          <button className="px-3 py-2 border rounded" onClick={() => generateBy('mixed')}>혼합 생성</button>
        </div>

  <GeneratedMatchesList
          matches={matches}
          playerGameCounts={playerGameCounts}
          assignType={'scheduled'}
          setAssignType={() => {}}
          loading={loading}
          onClearMatches={() => { setMatches([]); setPlayerGameCounts({}); }}
          onAssignMatches={handleDirectAssign}
        />
      </div>
    </RequireAdmin>
  );
}
