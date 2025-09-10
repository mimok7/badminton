"use client";

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';

type Court = {
  id: string;
  name: string;
  is_active: boolean;
  order_index?: number | null;
  location?: string | null;
};

export default function AdminCourtsPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user, isAdmin, loading } = useUser();
  const [rows, setRows] = useState<Court[]>([]);
  const [form, setForm] = useState<{ name: string; location: string; is_active: boolean }>({ name: '', location: '', is_active: true });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState<boolean>(false);

  const fetchCourts = async () => {
    setError(null);
    setTableMissing(false);
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, is_active, order_index, location')
        .order('order_index', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true });
      if (error) {
        // PostgreSQL undefined table
        if ((error as any).code === '42P01') {
          setTableMissing(true);
          setRows([]);
          return;
        }
        throw error;
      }
      setRows((data as any) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error('fetch courts error', e);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchCourts();
  }, [user, isAdmin]);

  const createCourt = async () => {
    if (!form.name.trim()) {
      alert('코트 이름을 입력하세요.');
      return;
    }
    startTransition(async () => {
      try {
        const nextOrder = (rows.reduce((max, r) => Math.max(max, r.order_index || 0), 0) || 0) + 1;
        const payload: any = {
          name: form.name.trim(),
          is_active: form.is_active,
          order_index: nextOrder,
        };
        if (form.location.trim()) payload.location = form.location.trim();
        const { error } = await supabase.from('courts').insert(payload);
        if (error) throw error;
        setForm({ name: '', location: '', is_active: true });
        await fetchCourts();
      } catch (e: any) {
        alert(`생성 실패: ${e?.message || e}`);
      }
    });
  };

  const toggleActive = async (court: Court) => {
    startTransition(async () => {
      const { error } = await supabase
        .from('courts')
        .update({ is_active: !court.is_active })
        .eq('id', court.id);
      if (error) alert(`변경 실패: ${error.message}`);
      else await fetchCourts();
    });
  };

  const remove = async (court: Court) => {
    if (!confirm(`'${court.name}' 코트를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const { error } = await supabase.from('courts').delete().eq('id', court.id);
      if (error) alert(`삭제 실패: ${error.message}`);
      else await fetchCourts();
    });
  };

  const move = async (court: Court, dir: -1 | 1) => {
    // 간단한 재정렬: 현재 목록 기준 인덱스 스왑
    const list = [...rows];
    const idx = list.findIndex((r) => r.id === court.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const a = list[idx];
    const b = list[target];
    const aOrder = a.order_index || 0;
    const bOrder = b.order_index || 0;
    startTransition(async () => {
      const { error } = await supabase
        .from('courts')
        .upsert([
          { id: a.id, order_index: bOrder },
          { id: b.id, order_index: aOrder },
        ]);
      if (error) alert(`정렬 변경 실패: ${error.message}`);
      else await fetchCourts();
    });
  };

  if (loading) return <div className="p-6">로딩 중...</div>;
  if (!isAdmin) return <div className="p-6 text-red-600">관리자만 접근 가능합니다.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">코트 관리</h1>
        <p className="text-gray-500 text-sm mt-1">코트 생성, 활성/비활성, 정렬 및 삭제를 관리합니다.</p>
      </div>

      {tableMissing && (
        <div className="p-4 rounded border border-yellow-200 bg-yellow-50 text-yellow-800">
          courts 테이블이 존재하지 않습니다. Supabase에서 다음 스키마로 생성해 주세요:
          <pre className="mt-2 text-xs whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS public.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  order_index int4 NULL,
  location text NULL,
  created_at timestamptz DEFAULT now()
);
-- 필요 시 RLS 및 정책을 추가하세요.`}</pre>
        </div>
      )}

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>
      )}

      {/* 생성 폼 */}
      <div className="bg-white rounded border p-4">
        <h2 className="font-semibold mb-3">새 코트 추가</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="코트 이름"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="위치(선택)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            활성화
          </label>
          <button
            onClick={createCourt}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-2"
          >
            추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">코트 목록</h2>
          <button onClick={fetchCourts} className="text-sm px-3 py-2 rounded border">새로고침</button>
        </div>
        {rows.length === 0 ? (
          <div className="text-gray-500">등록된 코트가 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((c) => (
              <div key={c.id} className="border rounded p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.location || '위치 미지정'}</div>
                  </div>
                  <div className="text-xs text-gray-500">{c.order_index ?? '-'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.is_active ? '활성' : '비활성'}
                  </span>
                  <button onClick={() => toggleActive(c)} className="text-xs px-2 py-1 rounded border">토글</button>
                  <button onClick={() => move(c, -1)} className="text-xs px-2 py-1 rounded border">▲</button>
                  <button onClick={() => move(c, 1)} className="text-xs px-2 py-1 rounded border">▼</button>
                  <button onClick={() => remove(c)} className="ml-auto text-xs px-2 py-1 rounded bg-red-100 text-red-700">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
