'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useUser } from '@/hooks/useUser';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function HomePage() {
  const { user, profile, isAdmin, loading } = useUser();
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<'present' | 'lesson' | 'absent' | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const supabase = useMemo(() => createClientComponentClient(), []);

  // 내 출석 상태 가져오기 (메모이제이션)
  const fetchMyAttendanceStatus = useCallback(async () => {
    if (!user) return;
    
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: myAttendance, error: myAttErr } = await supabase
        .from('attendances')
        .select('status')
        .eq('user_id', user.id)
        .eq('attended_at', today)
        .single();
        
      if (myAttErr && myAttErr.code !== 'PGRST116') {
        console.error('내 출석 상태 조회 오류:', myAttErr);
        setMyAttendanceStatus(null);
      } else {
        setMyAttendanceStatus(myAttendance?.status || null);
      }
    } catch (error) {
      console.error('출석 상태 조회 실패:', error);
    }
  }, [user, supabase]);

  // 내 출석 상태 업데이트 함수 (메모이제이션)
  const updateMyAttendanceStatus = useCallback(async (status: 'present' | 'lesson' | 'absent') => {
    if (!user || isUpdatingStatus) return;

    setIsUpdatingStatus(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      
      const { error } = await supabase
        .from('attendances')
        .upsert({
          user_id: user.id,
          attended_at: today,
          status: status,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,attended_at'
        });

      if (error) {
        console.error('출석 상태 업데이트 오류:', error);
        alert('출석 상태 업데이트에 실패했습니다.');
      } else {
        setMyAttendanceStatus(status);
        const statusText = status === 'present' ? '출석' : status === 'lesson' ? '레슨' : '불참';
        alert(`출석 상태가 "${statusText}"로 업데이트되었습니다.`);
      }
    } catch (error) {
      console.error('출석 상태 업데이트 실패:', error);
      alert('출석 상태 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [user, isUpdatingStatus, supabase]);

  useEffect(() => {
    if (user) {
      fetchMyAttendanceStatus();
    }
  }, [user, fetchMyAttendanceStatus]);

  if (loading) {
    return <LoadingSpinner fullScreen text="애플리케이션 로딩 중..." />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="text-center max-w-3xl">

        {!user ? (
          /* 비로그인 사용자 */
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-semibold mb-4">환영합니다!</h2>
              <p className="text-gray-600 mb-6">
                라켓 뚱보단 배드민턴 클럽에 오신 것을 환영합니다.<br />
                로그인하여 다양한 기능을 이용해보세요.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button className="w-full sm:w-auto px-8 py-3 text-lg font-semibold">
                  로그인
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" className="w-full sm:w-auto px-8 py-3 text-lg font-semibold">
                  회원가입
                </Button>
              </Link>
            </div>

            <div className="mt-8">
              <Link href="/match-registration" className="text-blue-600 hover:text-blue-500">
                경기 일정 보기 →
              </Link>
            </div>
          </div>
        ) : (
          /* 로그인 사용자 */
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-semibold mb-2">
                안녕하세요, {profile?.username || profile?.full_name || '회원'}님! 👋
              </h2>
              <div className="flex items-center justify-center gap-4 text-sm mb-4">
                <span className={`px-3 py-1 rounded-full ${
                  isAdmin ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'
                }`}>
                  {isAdmin ? '관리자' : '회원'}
                </span>
                <span className="bg-gray-200 text-gray-800 px-3 py-1 rounded-full">
                  현재급수: {profile?.skill_level ? `${profile.skill_level}급` : 'E2급'}
                </span>
              </div>
              <p className="text-gray-600">
                오늘도 즐거운 배드민턴 하세요! 🏸
              </p>
            </div>

            {/* 내 출석 상태 카드 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-lg font-semibold mb-4 text-center">✅ 오늘의 출석 상태</h3>
              
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  className={`flex-1 min-w-[100px] px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                    myAttendanceStatus === 'present'
                      ? 'bg-green-500 text-white border-green-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-green-300 hover:shadow-sm'
                  } ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                  onClick={() => updateMyAttendanceStatus('present')}
                  disabled={isUpdatingStatus}
                >
                  <div className="text-center">
                    <div className="text-xl mb-1">✅</div>
                    <div>출석</div>
                  </div>
                </button>
                
                <button
                  className={`flex-1 min-w-[100px] px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                    myAttendanceStatus === 'lesson'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:shadow-sm'
                  } ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                  onClick={() => updateMyAttendanceStatus('lesson')}
                  disabled={isUpdatingStatus}
                >
                  <div className="text-center">
                    <div className="text-xl mb-1">📚</div>
                    <div>레슨</div>
                  </div>
                </button>
                
                <button
                  className={`flex-1 min-w-[100px] px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                    myAttendanceStatus === 'absent'
                      ? 'bg-red-500 text-white border-red-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:shadow-sm'
                  } ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                  onClick={() => updateMyAttendanceStatus('absent')}
                  disabled={isUpdatingStatus}
                >
                  <div className="text-center">
                    <div className="text-xl mb-1">❌</div>
                    <div>불참</div>
                  </div>
                </button>
              </div>
              
              {!myAttendanceStatus && (
                <p className="text-center text-sm text-gray-500 mt-3">
                  💡 오늘의 출석 상태를 선택해주세요
                </p>
              )}
              
              {isUpdatingStatus && (
                <p className="text-center text-sm text-blue-600 mt-3">
                  🔄 상태를 업데이트하고 있습니다...
                </p>
              )}
            </div>

            {/* 주요 기능 메뉴 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
             

              <Link href="/match-registration">
                <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center">
                  <div className="text-3xl mb-2">📝</div>
                  <h3 className="font-medium text-sm">참가 신청</h3>
                </div>
              </Link>

              <Link href="/my-schedule">
                <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center">
                  <div className="text-3xl mb-2">🏸</div>
                  <h3 className="font-medium text-sm">경기 현황</h3>
                </div>
              </Link>

              <Link href="/dashboard">
                <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center">
                  <div className="text-3xl mb-2">🏆</div>
                  <h3 className="font-medium text-sm">통계 현황</h3>
                </div>
              </Link>

              <Link href="/profile">
                <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center">
                  <div className="text-3xl mb-2">👤</div>
                  <h3 className="font-medium text-sm">내 프로필</h3>
                </div>
              </Link>
 
            </div>

            {/* 관리자 전용 메뉴 */}
            {isAdmin && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-center mb-4 text-red-600">관리자 전용 기능</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Link href="/players">
                    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center border-l-4 border-red-500">
                      <div className="text-3xl mb-2">👥</div>
                      <h3 className="font-medium text-sm">선수 관리</h3>
                    </div>
                  </Link>

                  <Link href="/match-schedule">
                    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center border-l-4 border-red-500">
                      <div className="text-3xl mb-2">⚙️</div>
                      <h3 className="font-medium text-sm">경기 관리</h3>
                    </div>
                  </Link>

                  <Link href="/admin/members">
                    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer text-center border-l-4 border-red-500">
                      <div className="text-3xl mb-2">🔧</div>
                      <h3 className="font-medium text-sm">회원 관리</h3>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
