'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import { LEVEL_LABELS } from '@/app/players/types';
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

  // 로컬(KST) 기준 YYYY-MM-DD 반환 (타임존 문제 해결)
  const getTodayLocal = () => {
    const now = new Date();
    // 로컬 타임존의 오늘 날짜를 정확히 계산
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 출석 데이터 갱신 함수
  const refreshAttendanceData = async () => {
    const today = getTodayLocal();
    console.log('출석 데이터 갱신 시작 - 날짜:', today);

    try {
      // 오늘 경기 참가자 조회
      const participants = await fetchRegisteredPlayersForDate(today);
      console.log('참가자 데이터 조회 결과:', participants);
      
      if (!participants || participants.length === 0) {
        console.log('오늘 등록된 참가자가 없습니다.');
        setTodayPlayers([]);
        return;
      }

      // 오늘 출석 데이터 조회
      const { data: attendancePresent, error: attErr } = await supabase
        .from('attendances')
        .select('user_id')
        .eq('attended_at', today)
        .eq('status', 'present');
        
      if (attErr) {
        console.error('출석 조회 오류:', attErr);
        // 출석 조회 실패해도 참가자는 absent 상태로 표시
        const absentPlayers = participants.map(p => ({ ...p, status: 'absent' as const }));
        setTodayPlayers(absentPlayers);
        return;
      }

      console.log('출석 데이터 조회 결과:', attendancePresent);

      // 참가자가 없고 출석 데이터만 있는 경우: 출석 데이터를 참가자로 변환
      if ((!participants || participants.length === 0) && attendancePresent && attendancePresent.length > 0) {
        console.log('참가자 데이터가 없어 출석 데이터를 참가자로 사용');

        // 출석한 사용자들의 프로필 조회
        const attendanceUserIds = attendancePresent.map((a: any) => a.user_id);
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('id, username, full_name, skill_level, gender')
          .in('id', attendanceUserIds);

        if (profileErr) {
          console.error('프로필 조회 오류:', profileErr);
          setTodayPlayers([]);
          return;
        }

        // 레벨 정보 조회
        const { data: levelData } = await supabase
          .from('level_info')
          .select('code, name');

        const levelMap: Record<string, string> = {};
        (levelData || []).forEach((lvl: any) => {
          if (lvl.code) levelMap[String(lvl.code).toLowerCase()] = lvl.name || '';
        });

        // 출석 데이터를 참가자 데이터로 변환
        const playersFromAttendance: ExtendedPlayer[] = (profiles || []).map((profile: any) => {
          const raw = (profile.skill_level || '').toString().toLowerCase();
          const normalized = normalizeLevel('', raw);
          const label = levelMap[normalized] || LEVEL_LABELS[normalized] || 'E2 (초급)';
          const name = profile.username || profile.full_name || `선수-${String(profile.id).slice(0, 4)}`;
          return {
            id: profile.id,
            name,
            skill_level: normalized,
            skill_label: label,
            gender: profile.gender || '',
            skill_code: '',
            status: 'present', // 출석 데이터이므로 present로 설정
          } as ExtendedPlayer;
        });

        console.log(`출석 데이터에서 ${playersFromAttendance.length}명 참가자 생성`);
        setTodayPlayers(playersFromAttendance);
        return;
      }

      // 참가자와 출석 데이터 결합
      const attendanceMap = new Map(attendancePresent?.map((a: any) => [a.user_id, true]) || []);
      const combinedPlayers = participants.map(p => ({
        ...p,
        status: attendanceMap.has(p.id) ? 'present' : 'absent'
      })) as ExtendedPlayer[];

      console.log('최종 결합된 플레이어 데이터:', combinedPlayers);
      setTodayPlayers(combinedPlayers);

    } catch (error) {
      console.error('출석 데이터 갱신 오류:', error);
      // 오류 발생 시에도 참가자 데이터는 absent 상태로 표시
      try {
        const participants = await fetchRegisteredPlayersForDate(today);
        const absentPlayers = participants.map(p => ({ ...p, status: 'absent' as const }));
        setTodayPlayers(absentPlayers);
      } catch (fallbackError) {
        console.error('참가자 데이터 조회 실패:', fallbackError);
        setTodayPlayers([]);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      console.log('페이지 초기 로딩 시작');
      await refreshAttendanceData();
      await fetchMatchSessions();
      await fetchTodaySchedules();
      console.log('페이지 초기 로딩 완료');
    };
    init();
  }, []);

  // 포커스 시 갱신: 오늘 세션/일정 재조회
  useEffect(() => {
    const onFocus = () => {
      console.log('페이지 포커스 - 데이터 갱신');
      refreshAttendanceData().catch(err => console.error('포커스 갱신 오류:', err));
      fetchMatchSessions();
      fetchTodaySchedules();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 실시간 구독: 출석 데이터 변경 시 자동 갱신
  useEffect(() => {
    const today = getTodayLocal();
    
    console.log('실시간 구독 설정 - 오늘 날짜:', today);
    
    const attendanceChannel = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'attendances',
        filter: `attended_at=eq.${today}`
      }, (payload) => {
        console.log('출석 데이터 변경 감지:', payload);
        // 비동기 함수를 즉시 실행하여 상태 업데이트 보장
        refreshAttendanceData().catch(err => console.error('실시간 갱신 오류:', err));
      })
      .subscribe();

    const participantChannel = supabase
      .channel('participant_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_participants'
      }, (payload) => {
        console.log('참가자 데이터 변경 감지:', payload);
        // 비동기 함수를 즉시 실행하여 상태 업데이트 보장
        refreshAttendanceData().catch(err => console.error('실시간 갱신 오류:', err));
      })
      .subscribe();

    const scheduleChannel = supabase
      .channel('schedule_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_schedules',
        filter: `match_date=eq.${today}`
      }, (payload) => {
        console.log('경기 일정 변경 감지:', payload);
        // 경기 일정 변경 시 일정 목록도 갱신
        fetchTodaySchedules();
      })
      .subscribe();

    return () => {
      console.log('실시간 구독 해제');
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(scheduleChannel);
    };
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

      // 실제 참가자 수로 current_participants 업데이트
      if (data && data.length > 0) {
        for (const schedule of data) {
          // 해당 일정의 실제 참가자 수 조회
          const { count: actualCount, error: countError } = await supabase
            .from('match_participants')
            .select('*', { count: 'exact', head: true })
            .eq('match_schedule_id', schedule.id)
            .eq('status', 'registered');

          if (!countError && actualCount !== schedule.current_participants) {
            // current_participants가 실제 참가자 수와 다르면 업데이트
            await supabase
              .from('match_schedules')
              .update({ current_participants: actualCount || 0 })
              .eq('id', schedule.id);

            console.log(`경기 일정 ${schedule.id} 참가자 수 업데이트: ${schedule.current_participants} → ${actualCount || 0}`);
          }
        }

        // 업데이트된 데이터 다시 조회
        const { data: updatedData, error: refetchError } = await supabase
          .from('match_schedules')
          .select('id, match_date, start_time, end_time, location, status, current_participants, max_participants')
          .eq('match_date', today)
          .order('start_time', { ascending: true });

        if (!refetchError) {
          setTodaySchedules(updatedData || []);
        } else {
          setTodaySchedules(data || []);
        }
      } else {
        setTodaySchedules(data || []);
      }
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
        
        {/* 수동 갱신 버튼 */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => refreshAttendanceData().catch(err => console.error('수동 갱신 오류:', err))}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            disabled={loading}
          >
            🔄 데이터 수동 갱신
          </button>
          <button
            onClick={() => {
              fetchMatchSessions();
              fetchTodaySchedules();
            }}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            disabled={loading}
          >
            📅 경기 일정 갱신
          </button>
        </div>
        
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
