'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import Link from 'next/link';

interface Stats {
  totalUsers: number;
  todayAttendance: number;
  totalMatches: number;
  upcomingMatches: number;
  totalTournaments: number;
  activeTournaments: number;
}

export default function AdminPage() {
  const { profile } = useUser();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    todayAttendance: 0,
    totalMatches: 0,
    upcomingMatches: 0,
    totalTournaments: 0,
    activeTournaments: 0
  });
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        const [
          { count: totalUsers },
          { count: todayAttendance },
          { count: totalMatches },
          { count: upcomingMatches },
          { count: totalTournaments },
          { data: tournaments }
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('attendances').select('*', { count: 'exact', head: true }).eq('attended_at', today),
          supabase.from('match_schedules').select('*', { count: 'exact', head: true }),
          supabase.from('match_schedules').select('*', { count: 'exact', head: true }).gte('match_date', today).eq('status', 'scheduled'),
          supabase.from('tournaments').select('*', { count: 'exact', head: true }),
          supabase.from('tournaments').select('id, tournament_date').gte('tournament_date', today)
        ]);

        setStats({
          totalUsers: totalUsers || 0,
          todayAttendance: todayAttendance || 0,
          totalMatches: totalMatches || 0,
          upcomingMatches: upcomingMatches || 0,
          totalTournaments: totalTournaments || 0,
          activeTournaments: tournaments?.length || 0
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
        <p className="text-gray-600 mt-1">안녕하세요, {profile?.full_name || profile?.username || '관리자'}님</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <span className="text-pink-600">🎪</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">총 대회</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.totalTournaments}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span className="text-indigo-600">📊</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">진행 대회</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '...' : stats.activeTournaments}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">빠른 액션</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link 
            href="/match-schedule"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">📅 새 경기 생성</h3>
            <p className="text-sm text-gray-500 mt-1">경기 일정을 추가하고 관리하세요</p>
          </Link>
          
          <Link 
            href="/admin/members"
            className="p-4 border border-gray-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">👥 회원 관리</h3>
            <p className="text-sm text-gray-500 mt-1">회원 정보와 권한을 관리하세요</p>
          </Link>
          
          <Link 
            href="/admin/attendance"
            className="p-4 border border-gray-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">✅ 출석 현황</h3>
            <p className="text-sm text-gray-500 mt-1">출석 통계와 현황을 확인하세요</p>
          </Link>
          
          <Link 
            href="/team-management"
            className="p-4 border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">🤝 팀 관리</h3>
            <p className="text-sm text-gray-500 mt-1">대회 팀을 구성하고 관리하세요</p>
          </Link>
          
          <Link 
            href="/admin/tournament-matches"
            className="p-4 border border-gray-200 rounded-lg hover:border-pink-400 hover:bg-pink-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">🎪 대회 경기</h3>
            <p className="text-sm text-gray-500 mt-1">대회를 생성하고 경기를 관리하세요</p>
          </Link>
          
          <Link 
            href="/tournament-bracket"
            className="p-4 border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">📊 대진표 확인</h3>
            <p className="text-sm text-gray-500 mt-1">전체 대회 대진표와 결과를 확인하세요</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
