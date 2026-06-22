'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayPlayersCount, setTodayPlayersCount] = useState(0);
  const [todayMatchesCount, setTodayMatchesCount] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<'present' | 'lesson' | 'absent' | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // 오늘 요약 데이터를 가져오는 함수 (재사용 가능하도록 별도 정의)
  const fetchTodaySummary = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      
      // 전체 출석자 수 조회 - 더 상세한 로깅 추가
      console.log('🔍 오늘 출석 데이터 조회 시작:', today);
      
      const { count: playersCount, error: attErr } = await supabase
        .from('attendances')
        .select('*', { count: 'exact', head: true })
        .eq('attended_at', today);
        
      console.log('📊 출석자 수 조회 결과:', { count: playersCount, error: attErr });
      
      if (attErr) {
        console.error('❌ attendance fetch error:', attErr);
        // 406 오류인 경우 RLS 정책 문제로 간주하고 0으로 설정
        if (attErr.code === 'PGRST402' || attErr.message?.includes('406')) {
          console.log('⚠️ RLS 정책 또는 권한 문제로 인한 오류. 출석자 수를 0으로 설정합니다.');
          setTodayPlayersCount(0);
        }
      } else {
        console.log(`✅ 오늘 총 출석자: ${playersCount || 0}명`);
        setTodayPlayersCount(playersCount || 0);
      }
      
      // 내 출석 상태 조회
      const { data: myAttendance, error: myAttErr } = await supabase
        .from('attendances')
        .select('status')
        .eq('user_id', userId)
        .eq('attended_at', today)
        .single();
        
      if (myAttErr) {
        if (myAttErr.code === 'PGRST116') {
          console.log('👤 내 출석 기록 없음 (정상)');
        } else {
          console.error('❌ 내 출석 상태 조회 오류:', myAttErr);
        }
      }
      
      console.log('👤 내 출석 상태:', myAttendance?.status || '미설정');
      setMyAttendanceStatus(myAttendance?.status || null);
      setTodayMatchesCount(0);
    } catch (e) {
      console.error('fetchTodaySummary error:', e);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        console.log('🔐 세션 상태 확인:', { sessionData: !!sessionData.session, sessionErr });
        
        if (!sessionData.session) {
          console.log('⚠️ 세션이 없습니다. 로그인 페이지로 이동');
          router.push('/login');
          return;
        }
        
        console.log('✅ 세션 확인됨:', sessionData.session.user?.email);
      } catch (e) {
        console.error('세션 확인 오류:', e);
        router.push('/login');
      }
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchMenus = async () => {
      try {
        console.log('🔍 Fetching data for user:', userId, email);
        
        // 프로필 데이터 조회 - 더 안전한 방법
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('role, full_name, username')
          .eq('id', userId)
          .limit(1);
          
        console.log('📊 Raw profile query result:', { profileData, profileErr });
        
        // 메뉴 데이터 조회
        const { data: menuData, error: menuErr } = await supabase
          .from('dashboard_menus')
          .select('*')
          .order('display_order');
          
        console.log('📋 Raw menu query result:', { menuData, menuErr });
        
        if (profileErr) {
          console.error('profile fetch error:', profileErr);
        }
        
        if (menuErr) {
          console.error('menu fetch error:', menuErr);
        }

        // 프로필 데이터 처리
        let finalProfile = null;
        if (profileData && profileData.length > 0) {
          finalProfile = profileData[0];
          console.log('✅ 기존 프로필 발견:', finalProfile);
        } else {
          console.log('❌ 프로필이 없습니다. 새 프로필을 생성합니다.');
          // 새 프로필 생성
          const newProfile = {
            id: userId,
            role: 'user',
            username: email.split('@')[0],
            full_name: email.split('@')[0],
            email: email
          };
          
          const { data: createdProfile, error: createErr } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();
          
          if (createErr) {
            console.error('프로필 생성 오류:', createErr);
            // 생성 실패 시 기본값 사용
            finalProfile = newProfile;
          } else {
            console.log('✅ 새 프로필 생성됨:', createdProfile);
            finalProfile = createdProfile;
          }
        }

        // 사용자 정보 설정
        const isAdmin = finalProfile?.role === 'admin';
        const finalUsername = finalProfile?.username || finalProfile?.full_name || email.split('@')[0];
        
        console.log('👤 최종 사용자 설정:', {
          isAdmin,
          username: finalUsername,
          profile: finalProfile
        });
        
        setIsAdmin(isAdmin);
        setUsername(finalUsername);

        // 메뉴 필터링
        const currentRole = finalProfile?.role || 'user';
        const visibleMenus = (menuData || []).filter((menu) =>
          currentRole === 'admin' ? true : !menu.admin_only
        );
        setMenus(visibleMenus);
      } catch (e) {
        console.error('fetchMenus error:', e);
        // 오류 발생 시 기본값 설정
        setIsAdmin(false);
        setUsername(email.split('@')[0]);
      } finally {
        setLoading(false);
      }
    };

    // 프로필 생성이 완료된 후 출석 상태를 조회하도록 순서 보장
    const initializeData = async () => {
      await fetchMenus();
      await fetchTodaySummary();
    };

    initializeData();
  }, [userId]);

  // 내 출석 상태 업데이트 함수
  const updateMyAttendanceStatus = async (status: 'present' | 'lesson' | 'absent') => {
    if (isUpdatingStatus) return;
    
    setIsUpdatingStatus(true);
    
    try {
      // 먼저 로컬 상태를 즉시 업데이트
      setMyAttendanceStatus(status);
      
      // 프로필 존재 확인 및 생성
      const { data: existingProfile, error: profileCheckErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (!existingProfile && profileCheckErr?.code === 'PGRST116') {
        console.log('🔧 프로필이 없습니다. 프로필을 먼저 생성합니다.');
        const { error: createProfileErr } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            role: 'user',
            username: email.split('@')[0],
            full_name: email.split('@')[0],
            email: email
          });
        
        if (createProfileErr) {
          console.error('프로필 생성 실패:', createProfileErr);
          throw new Error('프로필 생성에 실패했습니다.');
        }
        
        console.log('✅ 프로필 생성 완료');
      }
      
      // 백그라운드에서 데이터베이스 업데이트
      const today = new Date().toISOString().slice(0, 10);
      
      // 기존 출석 기록 확인
      const { data: existingAttendance } = await supabase
        .from('attendances')
        .select('id')
        .match({ user_id: userId, attended_at: today })
        .single();
      
      let error;
      
      if (existingAttendance) {
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
        const { data: rollbackData } = await supabase
          .from('attendances')
          .select('status')
          .eq('user_id', userId)
          .eq('attended_at', today)
          .single();
        setMyAttendanceStatus(rollbackData?.status || null);
      } else {
        console.log(`✅ 내 상태가 ${status}(으)로 업데이트됨`);
        // 출석 상태 업데이트 성공 시 출석자 수도 다시 조회
        await fetchTodaySummary();
      }
    } catch (err) {
      console.error('업데이트 처리 중 오류:', err);
      // 오류 시 상태 롤백
      setMyAttendanceStatus(null);
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
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">
          안녕하세요, {username || email.split('@')[0]}님!
        </h1>
        <Button onClick={handleSignOut} variant="outline">
          로그아웃
        </Button>
      </div>

      {/* 오늘의 요약 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-800">오늘 출석자</h3>
          <p className="text-2xl font-bold text-blue-600">{todayPlayersCount}명</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800">오늘 경기</h3>
          <p className="text-2xl font-bold text-green-600">{todayMatchesCount}회</p>
        </div>
      </div>

      {/* 내 출석 상태 */}
      <div className="bg-blue-50 p-4 rounded-lg mb-8">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">내 출석 상태</h3>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded border transition-colors ${
              myAttendanceStatus === 'present'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
            }`}
            onClick={() => updateMyAttendanceStatus('present')}
            disabled={isUpdatingStatus}
          >
            출석
          </button>
          <button
            className={`px-4 py-2 rounded border transition-colors ${
              myAttendanceStatus === 'lesson'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
            }`}
            onClick={() => updateMyAttendanceStatus('lesson')}
            disabled={isUpdatingStatus}
          >
            레슨
          </button>
          <button
            className={`px-4 py-2 rounded border transition-colors ${
              myAttendanceStatus === 'absent'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
            }`}
            onClick={() => updateMyAttendanceStatus('absent')}
            disabled={isUpdatingStatus}
          >
            불참
          </button>
        </div>
        {myAttendanceStatus && (
          <p className="text-sm text-blue-700 mt-2">
            현재 상태: <span className="font-medium">
              {myAttendanceStatus === 'present' ? '출석' : 
               myAttendanceStatus === 'lesson' ? '레슨' : '불참'}
            </span>
          </p>
        )}
      </div>

      {/* 메뉴 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {menus.map((menu) => (
          <Link key={menu.id} href={menu.path}>
            <div className="bg-white p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold mb-2">{menu.name}</h3>
              {menu.description && (
                <p className="text-gray-600 text-sm">{menu.description}</p>
              )}
              {menu.admin_only && isAdmin && (
                <span className="inline-block mt-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                  관리자 전용
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold">관리자 권한</h3>
          <p className="text-red-700 text-sm">관리자 전용 기능에 접근할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
