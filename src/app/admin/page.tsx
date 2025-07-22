'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RequireAdmin } from '@/components/AuthGuard';
import { useUser } from '@/hooks/useUser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// This would be a new component you create for the add/edit form dialog
// For now, we'll just have a placeholder button

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  path: string;
  icon: string | null;
  is_active: boolean;
  display_order: number;
}

function MenuAdminPage() {
  const router = useRouter();
  const { profile } = useUser();
  const [loading, setLoading] = useState(true);
  const [menus, setMenus] = useState<MenuItem[]>([]);

  const checkAdmin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return false;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
    if (profile?.role !== 'admin') {
      alert('관리자만 접근할 수 있습니다.');
      router.push('/dashboard');
      return false;
    }
    return true;
  }, [router]);

  const fetchMenus = useCallback(async () => {
    const { data, error } = await supabase
      .from('dashboard_menus')
      .select('*')
      .order('display_order');

    if (error) {
      alert('메뉴 목록을 불러오는데 실패했습니다: ' + error.message);
    } else {
      setMenus(data || []);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const isAdmin = await checkAdmin();
      if (isAdmin) {
        await fetchMenus();
      }
      setLoading(false);
    };
    init();
  }, [checkAdmin, fetchMenus]);

  const handleActiveChange = async (menuId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('dashboard_menus')
      .update({ is_active: !currentStatus })
      .eq('id', menuId);

    if (error) {
      alert('상태 변경에 실패했습니다: ' + error.message);
    } else {
      // Refresh local state
      setMenus(menus.map(m => m.id === menuId ? { ...m, is_active: !currentStatus } : m));
    }
  };
  
  // TODO: Implement Add, Edit, Delete functions

  if (loading) {
    return <div className="flex justify-center items-center h-screen">로딩 중...</div>;
  }

  return (
    <div className="container mx-auto py-10">
      {/* 상단 인사말 섹션 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            ⚙️ 관리자 대시보드
          </h1>
          <Link href="/" className="text-white hover:text-blue-100 transition-colors">
            🏠 홈
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm mb-4">
          <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full">
            {profile?.username || profile?.full_name || '관리자'}님
          </span>
          <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
            관리자 권한
          </span>
        </div>
        <p className="text-blue-100">
          시스템을 효율적으로 관리하고 운영하세요! 🛠️
        </p>
      </div>

      {/* 관리자 통계 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8">
        <div className="bg-red-50 p-2 md:p-4 rounded-lg">
          <h3 className="text-sm md:text-lg font-semibold text-red-800">총 메뉴</h3>
          <p className="text-lg md:text-2xl font-bold text-red-600">{menus.length}개</p>
        </div>
        <div className="bg-green-50 p-2 md:p-4 rounded-lg">
          <h3 className="text-sm md:text-lg font-semibold text-green-800">활성 메뉴</h3>
          <p className="text-lg md:text-2xl font-bold text-green-600">{menus.filter(m => m.is_active).length}개</p>
        </div>
        <div className="bg-purple-50 p-2 md:p-4 rounded-lg">
          <h3 className="text-sm md:text-lg font-semibold text-purple-800">비활성 메뉴</h3>
          <p className="text-lg md:text-2xl font-bold text-purple-600">{menus.filter(m => !m.is_active).length}개</p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">대시보드 메뉴 관리</h2>
        <div>
          <Button onClick={() => alert('TODO: 메뉴 추가 기능 구현')}>+ 새 메뉴 추가</Button>
          <Button onClick={() => router.push('/dashboard')} variant="outline" className="ml-2">
            대시보드로 돌아가기
          </Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>순서</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>경로</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>활성화</TableHead>
              <TableHead>작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menus.map(menu => (
              <TableRow key={menu.id}>
                <TableCell>{menu.display_order}</TableCell>
                <TableCell className="font-medium">{menu.icon} {menu.name}</TableCell>
                <TableCell>{menu.path}</TableCell>
                <TableCell>{menu.description}</TableCell>
                <TableCell>
                  <Switch
                    checked={menu.is_active}
                    onCheckedChange={() => handleActiveChange(menu.id, menu.is_active)}
                  />
                </TableCell>
                <TableCell>
                   <Button variant="ghost" size="sm" onClick={() => alert('TODO: 수정 기능')}>수정</Button>
                   <Button variant="ghost" size="sm" className="text-red-500" onClick={() => alert('TODO: 삭제 기능')}>삭제</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// 관리자 권한 래핑
export default function ProtectedAdminPage() {
  return (
    <RequireAdmin>
      <MenuAdminPage />
    </RequireAdmin>
  );
}