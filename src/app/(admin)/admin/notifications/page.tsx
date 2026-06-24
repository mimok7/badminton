"use client";

import { useEffect, useMemo, useState, useTransition } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'general' | 'match_preparation' | 'match_result' | 'schedule_change' | 'system' | string;
  related_match_id?: string | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
};

export default function AdminNotificationsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { user, isAdmin, loading } = useUser();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [users, setUsers] = useState<{ id: string; label: string; gender: string }[]>([]);
  const [form, setForm] = useState<{ user_id: string; title: string; message: string; type: string }>({ user_id: '', title: '', message: '', type: 'general' });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setError(null);
    try {
      // 최근순 알림
      const { data: nData, error: nErr } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, type, related_match_id, is_read, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (nErr) throw nErr;

      // 사용자 라벨용 프로필
      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .select('id, user_id, username, full_name, email, gender');
      if (pErr) throw pErr;
      
      const userOptions = (pData || [])
        .map((p: any) => ({ 
          id: p.user_id || p.id, 
          label: p.full_name || p.username || p.email || (p.user_id || p.id),
          gender: (p.gender || '').toLowerCase()
        }))
        .sort((a: any, b: any) => a.label.localeCompare(b.label, 'ko-KR'));

      setRows((nData as any) || []);
      setUsers(userOptions);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error('notifications fetch error', e);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchAll();
  }, [user, isAdmin]);

  const createNotification = async () => {
    if (!form.user_id || !form.title || !form.message) {
      alert('대상 사용자, 제목, 내용을 입력하세요.');
      return;
    }
    startTransition(async () => {
      try {
        let targetUserIds: string[] = [];
        if (form.user_id === 'ALL') {
          targetUserIds = users.map(u => u.id);
        } else if (form.user_id === 'MALE') {
          targetUserIds = users.filter(u => ['m', 'male', 'man', '남', '남성'].includes(u.gender)).map(u => u.id);
        } else if (form.user_id === 'FEMALE') {
          targetUserIds = users.filter(u => ['f', 'female', 'woman', 'w', '여', '여성'].includes(u.gender)).map(u => u.id);
        } else {
          targetUserIds = [form.user_id];
        }

        if (targetUserIds.length === 0) {
          alert('발송 대상자가 없습니다.');
          return;
        }

        const payloads = targetUserIds.map(id => ({
          user_id: id,
          title: form.title,
          message: form.message,
          type: form.type || 'general',
        }));

        const res = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payloads }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || '알림 발송에 실패했습니다.');
        }
        
        alert(`총 ${data.count || targetUserIds.length}명에게 알림이 발송되었습니다.`);
        setForm({ user_id: '', title: '', message: '', type: 'general' });
        await fetchAll();
      } catch (e: any) {
        alert(`생성 실패: ${e?.message || e}`);
      }
    });
  };

  const markAsRead = async (id: string) => {
    startTransition(async () => {
      const { error: upErr } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (upErr) {
        alert(`읽음 처리 실패: ${upErr.message}`);
      } else {
        await fetchAll();
      }
    });
  };

  const remove = async (id: string) => {
    if (!confirm('해당 알림을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const { error: delErr } = await supabase.from('notifications').delete().eq('id', id);
      if (delErr) {
        alert(`삭제 실패: ${delErr.message}`);
      } else {
        await fetchAll();
      }
    });
  };

  if (loading) {
    return <div className="p-6">로딩 중...</div>;
  }
  if (!isAdmin) {
    return <div className="p-6 text-red-600">관리자만 접근 가능합니다.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">공지사항/알림 관리</h1>
        <p className="text-gray-500 text-sm mt-1">사용자에게 보낼 알림을 생성하고, 읽음/삭제를 관리합니다.</p>
      </div>

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>
      )}

      {/* 생성 폼 */}
      <div className="bg-white rounded border p-4">
        <h2 className="font-semibold mb-3">새 알림 생성</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            className="border rounded px-2 py-2"
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
          >
            <option value="">대상 사용자 선택</option>
            <option value="ALL">전체 회원 발송</option>
            <option value="MALE">남성 회원 전체 발송</option>
            <option value="FEMALE">여성 회원 전체 발송</option>
            <optgroup label="개별 회원">
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </optgroup>
          </select>
          <input
            className="border rounded px-2 py-2"
            placeholder="알림 제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select
            className="border rounded px-2 py-2"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {[
              { value: 'general', label: '일반 알림' },
              { value: 'match_preparation', label: '경기 준비' },
              { value: 'match_result', label: '경기 결과' },
              { value: 'schedule_change', label: '일정 변경' },
              { value: 'system', label: '시스템 알림' },
            ].map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={createNotification}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded px-3 py-2"
          >
            발송하기
          </button>
        </div>
        <textarea
          className="border rounded px-2 py-2 w-full mt-3"
          placeholder="알림 상세 내용"
          rows={3}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
      </div>

      {/* 목록 */}
      <div className="bg-white rounded border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">알림 목록</h2>
          <button onClick={fetchAll} className="text-sm px-3 py-2 rounded border">새로고침</button>
        </div>
        {rows.length === 0 ? (
          <div className="text-gray-500">등록된 알림이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((n) => {
              let typeLabel = n.type;
              switch(n.type) {
                case 'general': typeLabel = '일반 알림'; break;
                case 'match_preparation': typeLabel = '경기 준비'; break;
                case 'match_result': typeLabel = '경기 결과'; break;
                case 'schedule_change': typeLabel = '일정 변경'; break;
                case 'system': typeLabel = '시스템 알림'; break;
              }
              return (
              <div key={n.id} className="border rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mb-1">{typeLabel}</div>
                    <div className="font-bold text-slate-800">{n.title}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-line">{n.message}</div>
                <div className="mt-3 flex items-center gap-2">
                  {!n.is_read && (
                    <button onClick={() => markAsRead(n.id)} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">읽음</button>
                  )}
                  <button onClick={() => remove(n.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">삭제</button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
