"use client";

import { useState, useMemo, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useUser } from '@/hooks/useUser';

export default function TestAttendanceAllPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user, profile, isAdmin, loading } = useUser();

  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'bulk' | 'active'>('bulk');
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeMembers, setActiveMembers] = useState<Array<{ id: string; username?: string | null; full_name?: string | null; last_attended?: string }>>([]);

  const markAllPresent = async () => {
    if (!isAdmin || running) return;
    setRunning(true);
    setProcessed(0);
    setSucceeded(0);
    setFailed(0);
    setErrors([]);

    try {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id')
        .order('id', { ascending: true });

      if (profErr) throw profErr;
      if (!profiles || profiles.length === 0) {
        alert('프로파일이 없습니다.');
        setRunning(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      // process in small batches to avoid rate limits
      const batchSize = 20;
      for (let i = 0; i < profiles.length; i += batchSize) {
        const batch = profiles.slice(i, i + batchSize);
        await Promise.all(batch.map(async (p: any) => {
          const profileId = p.id;
          try {
            // 1) try update existing attendance for today
            const { data: updated, error: updateErr } = await supabase
              .from('attendances')
              .update({ status: 'present' })
              .eq('user_id', profileId)
              .eq('attended_at', today)
              .select('id');

            if (updateErr) {
              throw updateErr;
            }

            if (updated && updated.length > 0) {
              setSucceeded(s => s + 1);
            } else {
              // insert new record
              const { error: insertErr } = await supabase
                .from('attendances')
                .insert({ user_id: profileId, attended_at: today, status: 'present' });

              if (insertErr) throw insertErr;
              setSucceeded(s => s + 1);
            }
          } catch (e: any) {
            setFailed(f => f + 1);
            setErrors(arr => [...arr, `${profileId}: ${e?.message || e}`]);
          } finally {
            setProcessed(pCount => pCount + 1);
          }
        }));
      }

      alert(`처리 완료: 총 ${profiles.length}명 중 성공 ${succeeded + failed} (성공 ${succeeded}, 실패 ${failed})`);
    } catch (error: any) {
      console.error('전체 출석 등록 실패:', error);
      alert('전체 출석 등록 중 오류가 발생했습니다. 콘솔을 확인하세요.');
    } finally {
      setRunning(false);
    }
  };

  const fetchActiveMembers = async () => {
    setActiveLoading(true);
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const since = sevenDaysAgo.toISOString().slice(0, 10);

      const { data: attendanceRows, error: attErr } = await supabase
        .from('attendances')
        .select('user_id, attended_at')
        .gte('attended_at', since);

      if (attErr) throw attErr;

      const lastMap: Record<string, string> = {};
      (attendanceRows || []).forEach((r: any) => {
        const uid = r.user_id;
        const dt = r.attended_at;
        if (!uid) return;
        if (!lastMap[uid] || (dt > lastMap[uid])) lastMap[uid] = dt;
      });

      const userIds = Object.keys(lastMap);
      if (userIds.length === 0) {
        setActiveMembers([]);
        setActiveLoading(false);
        return;
      }

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .in('id', userIds);

      if (profErr) throw profErr;

      const members = (profiles || []).map((p: any) => ({
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        last_attended: lastMap[p.id]
      }));

      // sort by last_attended desc
      members.sort((a, b) => (b.last_attended || '').localeCompare(a.last_attended || ''));
      setActiveMembers(members);
    } catch (e) {
      console.error('활성 회원 조회 실패:', e);
      setActiveMembers([]);
    } finally {
      setActiveLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'active') fetchActiveMembers();
  }, [activeTab]);

  if (loading) return <LoadingSpinner fullScreen text="로딩 중..." />;

  if (!user || !isAdmin) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold mb-4">전체 출석 등록 (관리자 전용)</h2>
        <p>관리자 계정으로 로그인해야 사용 가능합니다.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">전체 출석 관리</h1>
        <p className="text-gray-600 mt-1">모든 회원의 출석을 일괄 등록하거나 활성 회원을 확인하세요</p>
      </div>

      {/* 탭 메뉴 */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'bulk' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('bulk')}
          >
            출석 일괄 등록
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'active' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('active')}
          >
            활성 회원
          </button>
        </div>
      </div>

      {activeTab === 'bulk' ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">모든 사용자 출석 등록</h2>
          <p className="text-gray-600 mb-6">오늘 날짜로 모든 프로필의 출석을 일괄 등록합니다.</p>
          
          <button
            onClick={markAllPresent}
            disabled={running}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? '처리 중...' : '모든 사용자 출석 등록 (오늘)'}
          </button>

          {(processed > 0 || succeeded > 0 || failed > 0) && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">처리 현황</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">처리:</span>
                  <span className="ml-2 font-medium">{processed}</span>
                </div>
                <div>
                  <span className="text-gray-500">성공:</span>
                  <span className="ml-2 font-medium text-green-600">{succeeded}</span>
                </div>
                <div>
                  <span className="text-gray-500">실패:</span>
                  <span className="ml-2 font-medium text-red-600">{failed}</span>
                </div>
              </div>
              
              {errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-red-700 mb-2">실패 목록:</h4>
                  <div className="max-h-32 overflow-y-auto">
                    {errors.map((error, idx) => (
                      <div key={idx} className="text-xs text-red-600 py-1">{error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">활성 회원 목록</h2>
          <p className="text-gray-600 mb-6">최근 7일간 출석한 회원들의 목록입니다.</p>
          
          {activeLoading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">불러오는 중...</div>
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500">활성 회원이 없습니다.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 출석</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activeMembers.map((member, idx) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {member.username || member.full_name || member.id.substring(0, 8)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{member.last_attended}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
