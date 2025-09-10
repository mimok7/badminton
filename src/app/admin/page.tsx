'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';

interface Stats {
  totalUsers: number;
  todayAttendance: number;
  totalMatches: number;
  upcomingMatches: number;
}

export default function AdminPage() {
  const { profile } = useUser();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    todayAttendance: 0,
    totalMatches: 0,
    upcomingMatches: 0
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        const [
          { count: totalUsers },
          { count: todayAttendance },
          { count: totalMatches },
          { count: upcomingMatches }
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('attendances').select('*', { count: 'exact', head: true }).eq('attended_at', today),
          supabase.from('match_schedules').select('*', { count: 'exact', head: true }),
          supabase.from('match_schedules').select('*', { count: 'exact', head: true }).gte('match_date', today).eq('status', 'scheduled')
        ]);

        setStats({
          totalUsers: totalUsers || 0,
          todayAttendance: todayAttendance || 0,
          totalMatches: totalMatches || 0,
          upcomingMatches: upcomingMatches || 0
        });
      } catch (error) {
        console.error('통계 조회 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [supabase]);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">관리자 대시보드</h1>
        <p className="text-gray-600 mt-1">안녕하세요, {profile?.username || profile?.full_name || '관리자'}님</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600">👥</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">총 회원</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600">✅</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">오늘 출석</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.todayAttendance}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600">🏆</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">총 경기</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalMatches}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-orange-600">📅</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">예정 경기</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.upcomingMatches}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">빠른 액션</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <h3 className="font-medium text-gray-900">📅 새 경기 생성</h3>
            <p className="text-sm text-gray-500 mt-1">경기 일정을 추가하고 관리하세요</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <h3 className="font-medium text-gray-900">👥 회원 관리</h3>
            <p className="text-sm text-gray-500 mt-1">회원 정보와 권한을 관리하세요</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <h3 className="font-medium text-gray-900">✅ 출석 현황</h3>
            <p className="text-sm text-gray-500 mt-1">출석 통계와 현황을 확인하세요</p>
          </div>
        </div>
      </div>
    </div>
  );
}