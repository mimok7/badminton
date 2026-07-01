'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import type { AdminUser } from '@/types';
import { deleteUser } from './actions';
import { useUser } from '@/hooks/useUser';

export default function UserManagementClient({ users, myUserId }: { users: AdminUser[]; myUserId: string }) {
    const [isPending, startTransition] = useTransition();
    const { profile } = useUser();

    const handleDelete = (user: AdminUser) => {
        if (user.id === myUserId) {
            alert("자기 자신은 삭제할 수 없습니다.");
            return;
        }
        if (window.confirm(`정말로 '${user.username || user.email}'님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
            startTransition(async () => {
                const result = await deleteUser(user.id);
                if (result?.error) {
                    alert(`사용자 삭제 실패: ${result.error}`);
                } else {
                    alert('사용자가 성공적으로 삭제되었습니다.');
                }
            });
        }
    };

    return (
        <div>
            {/* 상단 인사말 섹션 */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-8 text-white">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        👥 회원 관리
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
                        회원 관리 권한
                    </span>
                </div>
                <p className="text-blue-100">
                    클럽 회원들을 효율적으로 관리하고 운영하세요! 👨‍👩‍👧‍👦
                </p>
            </div>

            {/* 회원 통계 */}
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8">
                <div className="bg-blue-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-blue-800">총 회원수</h3>
                    <p className="text-lg md:text-2xl font-bold text-blue-600">{users.length}명</p>
                </div>
                <div className="bg-green-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-green-800">관리자</h3>
                    <p className="text-lg md:text-2xl font-bold text-green-600">{users.filter(u => u.role === 'admin').length}명</p>
                </div>
                <div className="bg-purple-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-purple-800">일반회원</h3>
                    <p className="text-lg md:text-2xl font-bold text-purple-600">{users.filter(u => u.role === 'user').length}명</p>
                </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                        <th scope="col" className="px-4 py-3">이름</th>
                        <th scope="col" className="px-4 py-3">이메일</th>
                        <th scope="col" className="px-4 py-3">레벨</th>
                        <th scope="col" className="px-4 py-3">성별</th>
                        <th scope="col" className="px-4 py-3">역할</th>
                        <th scope="col" className="px-4 py-3">작업</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.id} className="border-b bg-white hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                            <td className="px-4 py-3">{user.email}</td>
                            <td className="px-4 py-3">{user.skill_label || user.skill_level || '미지정'}</td>
                            <td className="px-4 py-3">{user.gender === 'M' ? '남성' : user.gender === 'F' ? '여성' : '기타'}</td>
                            <td className="px-4 py-3">{user.role}</td>
                            <td className="px-4 py-3">
                                <button onClick={() => handleDelete(user)} disabled={isPending || user.id === myUserId}
                                    className="text-red-500 hover:underline disabled:text-gray-400 disabled:no-underline">
                                    {isPending ? '삭제중...' : '삭제'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        </div>
    );
}