'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import AttendanceStatus from '@/app/players/components/AttendanceStatus';
import MatchSessionStatus from '@/app/players/components/MatchSessionStatus';
import MatchGenerationControls from '@/app/players/components/MatchGenerationControls';
import GeneratedMatchesList from '@/app/players/components/GeneratedMatchesList';
import { ExtendedPlayer, MatchSession } from '@/app/players/types';
import { supabase, fetchTodayPlayers, fetchRegisteredPlayersForDate, calculatePlayerGameCounts, normalizeLevel } from '@/app/players/utils';
import { Match } from '@/types';

export default function PlayersTodayPage() {
  const [todayPlayers, setTodayPlayers] = useState<ExtendedPlayer[] | null>(null);
  const [matchSessions, setMatchSessions] = useState<MatchSession[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Array<{
    id: string;
    match_date: string;
    start_time: string;
    end_time: string;
    location: string;
    status: string;
    current_participants: number | null;
    max_participants: number | null;
  }>>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerGameCounts, setPlayerGameCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [assignType, setAssignType] = useState<'today' | 'scheduled'>('today');
  const [sessionMode, setSessionMode] = useState<'레벨' | '랜덤' | '혼복'>('레벨');
  const [perPlayerMinGames, setPerPlayerMinGames] = useState<number>(1);

  // 로컬(KST) 기준 YYYY-MM-DD 반환
  const getTodayLocal = () => new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    const init = async () => {
      // 오늘 날짜 기준으로: "오늘 경기 참가자" ∩ "오늘 출석(present)" 교집합만 표시
  const today = getTodayLocal();
      const participants = await fetchRegisteredPlayersForDate(today);
      const { data: attendancePresent, error: attErr } = await supabase
        .from('attendances')
        .select('user_id')
        .eq('attended_at', today)
        .eq('status', 'present');
      if (attErr) {
        console.error('출석 조회 오류:', attErr);
        setTodayPlayers([]);
      } else {
        const presentSet = new Set((attendancePresent || []).map((a: any) => a.user_id));
        const filtered = (participants || [])
          .filter(p => presentSet.has(p.id))
          .map(p => ({ ...p, status: 'present' as const }));
        setTodayPlayers(filtered);
      }
      await fetchMatchSessions();
      await fetchTodaySchedules();
    };
  init();
  // 페이지 로딩 시에만 초기 데이터 로딩
  }, []);

  // 포커스 시 갱신: 오늘 세션/일정 재조회
  useEffect(() => {
    const onFocus = () => {
      fetchMatchSessions();
      fetchTodaySchedules();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const fetchMatchSessions = async () => {
    try {
  const today = getTodayLocal();
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

  const fetchTodaySchedules = async () => {
    try {
  const today = getTodayLocal();
      const { data, error } = await supabase
        .from('match_schedules')
        .select('id, match_date, start_time, end_time, location, status, current_participants, max_participants')
        .eq('match_date', today)
        .order('start_time', { ascending: true });
      if (error) throw error;
      setTodaySchedules(data || []);
    } catch (e) {
      console.error('오늘 경기 일정 조회 오류:', e);
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
  const today = getTodayLocal();
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
  await fetchTodaySchedules();
    } catch (e) {
      console.error('배정 오류:', e);
      alert('배정 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  return (
    <RequireAdmin>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">오늘 경기 생성/배정</h1>
        {/* 오늘의 등록된 경기 - 최상단으로 이동 */}
        <div className="mb-6 p-4 border border-purple-300 rounded bg-purple-50">
          <h3 className="text-lg font-semibold mb-3">🗓️ 오늘의 등록된 경기</h3>
          {todaySchedules.length === 0 ? (
            <div className="text-gray-600 text-sm">오늘 등록된 경기가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todaySchedules.map((s) => (
                <div key={s.id} className="bg-white rounded border p-3 text-sm">
                  <div className="font-medium text-gray-800">{s.start_time} - {s.end_time} · {s.location}</div>
                  <div className="text-gray-600 mt-1">
                    인원: {s.current_participants ?? 0} / {s.max_participants ?? 0}명
                  </div>
                  <div className="text-xs mt-1">
                    상태: <span className="font-medium">{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
