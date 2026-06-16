'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import MatchNotifications from '@/components/MatchNotifications';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getUserLevelDisplay } from '@/lib/level-display';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  path: string;
  icon: string | null;
  admin_only: boolean;
}

export default function ClientDashboard({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { profile, isAdmin: userIsAdmin } = useUser(); // useUser 훅 사용
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayPlayersCount, setTodayPlayersCount] = useState(0);
  const [todayMatchesCount, setTodayMatchesCount] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<'present' | 'lesson' | 'absent' | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [todayAssignedMatches, setTodayAssignedMatches] = useState<ScheduledMatchView[]>([]);

  const normalizeAttendanceStatus = (
    value: string | null | undefined
  ): 'present' | 'lesson' | 'absent' | null => {
    if (value === 'present' || value === 'lesson' || value === 'absent') {
      return value;
    }
    return null;
  };

  // 인증 상태는 useUser 훅에서 관리하므로 중복 체크 제거
  // useEffect를 제거하여 Rate Limit 방지

  const fetchTodaySummary = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      
      // Rate limit 방지를 위해 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 전체 출석자 수 조회
      const { count: playersCount, error: attErr } = await supabase
        .from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('attended_at', today);
        
      if (attErr) {
        console.error('출석자 수 조회 오류:', attErr);
        setTodayPlayersCount(0);
      } else {
        setTodayPlayersCount(playersCount || 0);
      }
      
      // Rate limit 방지를 위해 추가 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 내 출석 상태 조회
      const { data: myAttendance, error: myAttErr } = await supabase
        .from('attendances')
        .select('status')
        .eq('user_id', userId)
        .eq('attended_at', today)
        .maybeSingle();
        
      if (myAttErr && myAttErr.code !== 'PGRST116') {
        console.error('내 출석 상태 조회 오류:', myAttErr);
        setMyAttendanceStatus(null);
      } else {
        setMyAttendanceStatus(normalizeAttendanceStatus(myAttendance?.status));
      }
      
      // 오늘 배정된 경기 수 조회
      const { count: matchCount, error: matchErr } = await supabase
        .from('match_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('match_date', today)
        .eq('status', 'scheduled');
        
      if (matchErr) {
        console.error('경기 수 조회 오류:', matchErr);
        setTodayMatchesCount(0);
      } else {
        setTodayMatchesCount(matchCount || 0);
      }

      // 오늘의 배정된 경기 상세 조회 (내가 참여한 경기만)
      const myMatches = await fetchScheduledMatchesForDate(supabase, today, userId);
      setTodayAssignedMatches(myMatches);
    } catch (e) {
      console.error('오늘 요약 조회 오류:', e);
      // Rate limit 오류 시 기본값 설정
      setTodayPlayersCount(0);
      setMyAttendanceStatus(null);
      setTodayMatchesCount(0);
    }
  };

  useEffect(() => {
    // useUser 훅에서 이미 프로필을 관리하므로 간단한 설정만
    const initializeSimpleData = async () => {
      try {
        setLoading(true);
        
        // 사용자 이름 설정 (profile이 있으면 사용, 없으면 이메일 기반)
        const displayName = profile?.full_name || profile?.username || email.split('@')[0];
        setUsername(displayName);
        
        // Rate limit 방지를 위해 지연 후 출석 데이터만 조회
        await new Promise(resolve => setTimeout(resolve, 300));
        await fetchTodaySummary();
        
      } catch (error) {
        console.error('데이터 초기화 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeSimpleData();
  }, [userId, profile]); // profile 의존성 추가

  // 내 출석 상태 업데이트 함수
  const updateMyAttendanceStatus = async (status: 'present' | 'lesson' | 'absent') => {
    if (isUpdatingStatus) return;
    
    setIsUpdatingStatus(true);
    
    try {
      // 먼저 로컬 상태를 즉시 업데이트
      setMyAttendanceStatus(status);
      
      // Rate limit 방지를 위해 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const today = new Date().toISOString().slice(0, 10);
      
      // 기존 출석 기록 확인
      const { data: existingAttendance, error: checkErr } = await supabase
        .from('attendances')
        .select('id')
        .match({ user_id: userId, attended_at: today })
        .single();
      
      // Rate limit 방지를 위해 추가 지연
      await new Promise(resolve => setTimeout(resolve, 200));
      
      let error;
      
      if (existingAttendance && !checkErr) {
        // 기존 출석 기록이 있으면 상태만 업데이트
        const result = await supabase
          .from('attendances')
          .update({ status })
          .match({ user_id: userId, attended_at: today });
        
        error = result.error;
      } else {
        // 출석 기록이 없으면 새로 생성
        const result = await supabase
          .from('attendances')
          .insert({
            user_id: userId,
            attended_at: today,
            status
          });
        
        error = result.error;
      }
      
      if (error) {
        console.error('상태 업데이트 오류:', error.message);
        // 오류 시 이전 상태로 롤백
        if (error.message.includes('rate limit')) {
          // Rate limit인 경우 로컬 상태 유지
        } else {
          // 다른 오류인 경우에만 롤백
          setMyAttendanceStatus(null);
        }
      } else {
        // 상태 업데이트 성공
      }
    } catch (err) {
      console.error('업데이트 처리 중 오류:', err);
      if (err instanceof Error && err.message.includes('rate limit')) {
        // Rate limit 오류 처리
      } else {
        setMyAttendanceStatus(null);
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_48%,#f1f5f9_100%)]">
      {/* 경기 배정 알림 */}
      <MatchNotifications />
      
      {/* 상단 네비게이션 탭 바 */}
      <nav className="bg-gradient-to-r from-blue-500 to-purple-600 border-b border-blue-700 sticky top-0 z-50">
        {/* 상단 사용자 정보 바 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 border-b border-blue-800">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex justify-between items-center h-10">
              {/* 관리자 메뉴 (헤더 왼쪽) */}
              {userIsAdmin && (
                <div className="flex items-center space-x-3">
                  <Link href="/players" className="text-sm text-blue-100 hover:text-white hover:underline transition-colors">
                    👥 선수 관리
                  </Link>
                  <Link href="/match-schedule" className="text-sm text-blue-100 hover:text-white hover:underline transition-colors">
                    📅 경기일정
                  </Link>
                  <Link href="/admin/members" className="text-sm text-blue-100 hover:text-white hover:underline transition-colors">
                    📝 회원 관리
                  </Link>
                  <Link href="/admin" className="text-sm text-blue-100 hover:text-white hover:underline transition-colors">
                    ⚙️ 관리자
                  </Link>
                </div>
              )}
              
              {/* 사용자 정보 (헤더 오른쪽) */}
              <div className="flex items-center space-x-4">
                <span className="text-sm text-blue-100">
                  {username || email.split('@')[0]}님
                  {userIsAdmin && <span className="ml-1 px-2 py-1 bg-red-200 text-red-800 text-xs rounded-full">관리자</span>}
                </span>
                <Button onClick={handleSignOut} variant="outline" size="sm" className="border-blue-300 text-blue-100 hover:bg-blue-400 hover:text-white">
                  로그아웃
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-center h-16">
            {/* 대시보드 타이틀 */}
            <h1 className="text-xl font-semibold text-white">
              📊 배드민턴 클럽 대시보드
            </h1>
          </div>
        </div>
      </nav>

      {/* 메인 컨텐츠 */}
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {/* 상단 인사말 섹션 */}
        <div className="mb-5 overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_30px_80px_-35px_rgba(15,23,42,0.65)]">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.38),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.22),_transparent_28%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_52%,#312e81_100%)] p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold flex items-center gap-2 tracking-tight">
              📊 대시보드
            </h1>
            <Link href="/" className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/15">
              홈
            </Link>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 text-white">
              {profile?.full_name || profile?.username || '회원'}님
            </span>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-50">
              레벨: {getUserLevelDisplay(profile?.skill_level)}
            </span>
            {userIsAdmin && (
              <span className="rounded-full bg-red-300/20 px-3 py-1 text-red-50">
                관리자
              </span>
            )}
          </div>
          <p className="text-sm text-blue-100/85 sm:text-[15px]">
            출석 현황과 개인 통계를 확인하고 관리하세요! 📈
          </p>
          </div>
        </div>

      {/* 오늘의 요약 */}
      <div className="mb-5 grid grid-cols-3 gap-2 md:gap-4">
        <div className="rounded-[20px] border border-blue-100 bg-blue-50/90 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 md:text-sm">오늘 출석자</h3>
          <p className="mt-2 text-xl font-bold text-blue-600 md:text-2xl">{todayPlayersCount}명</p>
        </div>
        <div className="rounded-[20px] border border-green-100 bg-green-50/90 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-green-700 md:text-sm">오늘 경기</h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xl font-bold text-green-600 md:text-2xl">{todayMatchesCount}회</p>
            {todayMatchesCount > 0 && (
              <Link href="/today-matches">
                <button className="rounded-full bg-green-500 px-2.5 py-1 text-xs text-white transition-colors hover:bg-green-600 md:px-3">
                  보기
                </button>
              </Link>
            )}
          </div>
        </div>
        <div className="rounded-[20px] border border-purple-100 bg-purple-50/90 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-purple-700 md:text-sm">나의 참여</h3>
          <p className="mt-2 text-xl font-bold text-purple-600 md:text-2xl">{todayAssignedMatches.length}경기</p>
        </div>
      </div>

      {/* 출석 상태는 홈화면으로 이동되었습니다 */}
      <div className="mb-5 rounded-[24px] border border-blue-200 bg-blue-50/90 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-800 mb-1">📊 출석 현황</h3>
            <p className="text-sm text-blue-600">
              출석 상태 변경은 <Link href="/" className="underline font-medium hover:text-blue-700">홈 화면</Link>에서 가능합니다.
            </p>
          </div>
          {myAttendanceStatus && (
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <span className="text-sm text-gray-600">오늘 상태:</span>
              <span className={`ml-2 px-2 py-1 rounded text-sm font-medium ${
                myAttendanceStatus === 'present' ? 'bg-green-100 text-green-800' :
                myAttendanceStatus === 'lesson' ? 'bg-blue-100 text-blue-800' :
                'bg-red-100 text-red-800'
              }`}>
                {myAttendanceStatus === 'present' ? '✅ 출석' : 
                 myAttendanceStatus === 'lesson' ? '📚 레슨' : '❌ 불참'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 오늘의 배정된 경기 */}
      {todayAssignedMatches.length > 0 && (
        <div className="mb-5 rounded-[24px] border border-yellow-200 bg-yellow-50/90 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-yellow-800">🏆 오늘의 나의 경기</h3>
            <Link href="/today-matches">
              <button className="rounded-full bg-yellow-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-600">
                전체 경기 보기
              </button>
            </Link>
          </div>
          <div className="space-y-3">
            {todayAssignedMatches.map((match, index) => (
              <div key={match.id} className="rounded-[20px] border border-yellow-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="font-semibold text-yellow-900">
                    경기 #{index + 1} - 코트 {match.court_number || '미정'}
                  </div>
                  <div className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
                    {match.match_time || '시간 미정'}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-blue-50 p-3">
                    <div className="text-sm font-medium text-blue-800 mb-1">팀 1</div>
                    <div className="text-blue-700">
                      {match.team1_player1_name} + {match.team1_player2_name}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-red-50 p-3">
                    <div className="text-sm font-medium text-red-800 mb-1">팀 2</div>
                    <div className="text-red-700">
                      {match.team2_player1_name} + {match.team2_player2_name}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    match.team1_player1 === userId || match.team1_player2 === userId 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {match.team1_player1 === userId || match.team1_player2 === userId ? '팀 1 소속' : '팀 2 소속'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오늘 경기가 없을 때도 전체 경기 확인 버튼 표시 */}
      {todayAssignedMatches.length === 0 && todayMatchesCount > 0 && (
        <div className="mb-5 rounded-[24px] border border-slate-200 bg-white/80 p-4 text-center">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">📋 오늘의 경기 일정</h3>
          <p className="text-gray-600 mb-4">오늘 총 {todayMatchesCount}개의 경기가 배정되어 있습니다.</p>
          <Link href="/today-matches">
            <button className="rounded-full bg-blue-500 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-600">
              오늘의 전체 경기 확인하기
            </button>
          </Link>
        </div>
      )}

      {/* 메뉴 */}
      <div className="space-y-6">
        {/* 새로운 경기 관리 메뉴 */}
        <div>
          <h3 className="mb-4 text-xl font-semibold text-gray-900">🎯 경기 관련</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link href="/today-matches">
              <div className="rounded-[24px] border-2 border-yellow-200 bg-yellow-50 p-5 transition-colors hover:bg-yellow-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">🏆</div>
                </div>
                <h4 className="text-lg font-semibold text-yellow-900 mb-2">오늘의 경기</h4>
                <p className="text-sm text-yellow-700">오늘 배정된 모든 경기 일정을 확인하세요</p>
              </div>
            </Link>
            
            <Link href="/match-registration">
              <div className="rounded-[24px] border-2 border-blue-200 bg-blue-50 p-5 transition-colors hover:bg-blue-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">🎯</div>
                </div>
                <h4 className="text-lg font-semibold text-blue-900 mb-2">경기 참가 신청</h4>
                <p className="text-sm text-blue-700">예정된 경기에 참가 신청하고 현황을 확인하세요</p>
              </div>
            </Link>
            
            <Link href="/my-schedule">
              <div className="rounded-[24px] border-2 border-green-200 bg-green-50 p-5 transition-colors hover:bg-green-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">📋</div>
                </div>
                <h4 className="text-lg font-semibold text-green-900 mb-2">내 경기 센터</h4>
                <p className="text-sm text-green-700">예정 경기, 완료 기록, 대회 경기를 한 번에 확인하세요</p>
              </div>
            </Link>
            
            <Link href="/profile">
              <div className="rounded-[24px] border-2 border-purple-200 bg-purple-50 p-5 transition-colors hover:bg-purple-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">👤</div>
                </div>
                <h4 className="text-lg font-semibold text-purple-900 mb-2">내 프로필</h4>
                <p className="text-sm text-purple-700">내 정보 및 설정을 관리합니다</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {userIsAdmin && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold">관리자 권한 ✓</h3>
          <p className="text-red-700 text-sm">관리자 전용 기능에 접근할 수 있습니다.</p>
          <div className="mt-2 text-xs text-red-600">
            <p>Profile Role: {profile?.role}</p>
            <p>Is Admin: {userIsAdmin ? 'YES' : 'NO'}</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
