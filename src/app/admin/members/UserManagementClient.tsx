'use client';

import { useMemo, useState, useTransition } from 'react';
import type { AdminUser } from '@/types';
import { deleteUser, updateUser } from './actions';

export default function UserManagementClient({ users, myUserId }: { users: AdminUser[]; myUserId: string }) {
    const [isPending, startTransition] = useTransition();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const levelOptions = useMemo(() => ['E2','E1','D2','D1','C2','C1','B2','B1','A2','A1'], []);
    const roleOptions = useMemo(() => ['user','admin'], []);

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

    const startEdit = (user: AdminUser) => {
        setEditingId(user.id);
        setDraft({
            username: user.username ?? '',
            email: user.email ?? '',
            skill_level: user.skill_level ?? 'E2',
            gender: user.gender ?? '',
            role: user.role ?? 'user',
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft({});
    };

    const saveEdit = (user: AdminUser) => {
        startTransition(async () => {
            const payload: any = {
                username: draft.username,
                full_name: draft.full_name,
                skill_level: draft.skill_level,
                gender: draft.gender,
                role: draft.role,
            };
            const res = await updateUser(user.id, payload);
            if (res?.error) {
                alert(`수정 실패: ${res.error}`);
            } else {
                setEditingId(null);
                setDraft({});
            }
        });
    };

    return (
        <div>

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

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                {users.map((user) => {
                    const isEditing = editingId === user.id;
                    return (
                        <div key={user.id} className="bg-white rounded shadow p-3 flex flex-col justify-between">
                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="font-semibold text-gray-900">
                                                                        {isEditing ? (
                                                                                <input value={draft.username ?? ''} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className="border rounded px-2 py-1 w-full" />
                                                                        ) : (
                                                                                user.username || '-' 
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs text-white bg-blue-600 px-2 py-0.5 rounded">{user.role}</div>
                                                                </div>

                                <div className="mt-2 text-sm text-gray-700">
                                    {isEditing ? (
                                        <select value={draft.skill_level ?? 'E2'} onChange={(e) => setDraft({ ...draft, skill_level: e.target.value })} className="border rounded px-2 py-1 w-full">
                                            {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    ) : (
                                        <span className="inline-block px-2 py-1 bg-gray-100 rounded">{user.skill_label || user.skill_level || '미지정'}</span>
                                    )}
                                </div>
                                <div className="mt-2 text-sm text-gray-700">{isEditing ? (
                                    <select value={draft.gender ?? ''} onChange={(e) => setDraft({ ...draft, gender: e.target.value })} className="border rounded px-2 py-1 w-full">
                                        <option value="">선택</option>
                                        <option value="M">남성</option>
                                        <option value="F">여성</option>
                                        <option value="O">기타</option>
                                    </select>
                                ) : (user.gender === 'M' ? '남성' : user.gender === 'F' ? '여성' : '기타')} </div>
                                <div className="mt-2 text-sm text-gray-500">{user.email}</div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                                {isEditing ? (
                                    <>
                                        <button onClick={() => saveEdit(user)} disabled={isPending} className="text-green-600">저장</button>
                                        <button onClick={cancelEdit} disabled={isPending} className="text-gray-600">취소</button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => startEdit(user)} className="text-blue-600">수정</button>
                                        <button onClick={() => handleDelete(user)} disabled={isPending || user.id === myUserId} className="text-red-500">삭제</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}