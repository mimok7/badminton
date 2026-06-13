"use client";

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export const dynamic = 'force-dynamic';

export default function AdminAttendancePage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { user, profile, isAdmin, loading } = useUser();

  const [loadingData, setLoadingData] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [{ data: profs, error: profErr }, { data: attends, error: attErr }] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, email').order('username', { ascending: true }),
        supabase.from('attendances').select('user_id, attended_at, status').order('attended_at', { ascending: true })
      ]);

      if (profErr) throw profErr;
      if (attErr) throw attErr;

      setProfiles(profs || []);
      setAttendanceRows(attends || []);
    } catch (e: any) {
      console.error('attendance fetch error', e);
      setError(e?.message || String(e));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) return;
    fetchData();
  }, [user, isAdmin]);
  // aggregate stats
  const stats = useMemo(() => {
    const countsAll: Record<string, number> = {};
    const counts30: Record<string, number> = {};
    const lastAtt: Record<string, string> = {};

    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    attendanceRows.forEach((r: any) => {
      const uid = r.user_id;
      if (!uid) return;
      countsAll[uid] = (countsAll[uid] || 0) + 1;
      const attendedAt = (r.attended_at || '').toString();
      if (attendedAt >= cutoffIso) counts30[uid] = (counts30[uid] || 0) + 1;
      if (!lastAtt[uid] || (attendedAt > lastAtt[uid])) lastAtt[uid] = attendedAt;
    });

    const rows = profiles.map(p => ({
      id: p.id,
      name: p.full_name || p.username || p.email || p.id,
      email: p.email,
      total: countsAll[p.id] || 0,
      last30: counts30[p.id] || 0,
      last_attended: lastAtt[p.id] || null
    }));

  const sorted = [...rows].sort((a, b) => b.total - a.total);
    const top3 = sorted.slice(0, 3);
    return { rows, sorted, top3 };
  }, [profiles, attendanceRows]);

  if (loading) return <LoadingSpinner fullScreen text="로딩 중..." />;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">출석 관리</h1>
          <p className="text-gray-600 mt-1">회원별 출석 현황과 통계를 확인하세요</p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loadingData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingData ? '새로고침...' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">데이터 로드 오류: {error}</p>
        </div>
      )}

      {/* Top 3 출석왕 */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">🏆 출석왕 TOP 3</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.top3.map((member: any, idx: number) => (
            <div key={member.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                <span className="text-sm text-gray-500">#{idx + 1}</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{member.name}</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>누적 출석:</span>
                  <span className="font-medium">{member.total}회</span>
                </div>
                <div className="flex justify-between">
                  <span>최근 30일:</span>
                  <span className="font-medium">{member.last30}회</span>
                </div>
              </div>
              {member.last_attended && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">마지막 출석: {member.last_attended}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 전체 출석 통계 - 카드 그리드 (5열) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-gray-900">전체 회원 출석 현황</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {stats.sorted.map((member: any, idx: number) => (
            <div key={member.id} className="bg-white rounded-lg shadow border border-gray-100 p-4">
              <div>
                <div className="mt-1 font-semibold text-gray-900">{member.name}</div>
                <div className="text-sm text-gray-500">{member.email || '-'}</div>
              </div>
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>누적 출석</span>
                  <span className="font-medium">{member.total}회</span>
                </div>
                <div className="flex justify-between">
                  <span>최근 30일</span>
                  <span className="font-medium">{member.last30}회</span>
                </div>
                <div className="flex justify-between">
                  <span>마지막 출석</span>
                  <span className="text-gray-500">{member.last_attended || '-'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
