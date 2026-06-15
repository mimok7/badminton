'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { AdminUser } from '@/types';
import { createMember, deleteUser, updateUser } from './actions';
import { useRouter } from 'next/navigation';

type LevelOption = {
    code: string;
    name: string;
    description: string | null;
    score: number | null;
};

function formatAdminLevelLabel(option?: LevelOption) {
    if (!option) {
        return '';
    }

    const stageMatch = option.code.match(/(\d+)$/);
    const stage = stageMatch ? `${stageMatch[1]}단계` : '';

    return `${option.code}-${option.name}${stage}`;
}

function compareAdminLevelCodes(a: string, b: string) {
    const aMatch = a.match(/^([A-Z]+)(\d+)$/);
    const bMatch = b.match(/^([A-Z]+)(\d+)$/);

    if (!aMatch || !bMatch) {
        return a.localeCompare(b);
    }

    const [, aPrefix, aStageText] = aMatch;
    const [, bPrefix, bStageText] = bMatch;
    const prefixCompare = aPrefix.localeCompare(bPrefix);

    if (prefixCompare !== 0) {
        return prefixCompare;
    }

    return Number(bStageText) - Number(aStageText);
}

const UNASSIGNED_LEVEL_KEY = '__UNASSIGNED__';

export default function UserManagementClient({
    users,
    myUserId,
    levelOptions: levelOptionsFromDb,
}: {
    users: AdminUser[];
    myUserId: string;
    levelOptions: LevelOption[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [memberList, setMemberList] = useState<AdminUser[]>(users);
    const [newMember, setNewMember] = useState({
        full_name: '',
        skill_level: 'N1',
        gender: '',
        role: 'user',
    });
    const levelOptions = useMemo(
        () => levelOptionsFromDb.length > 0
            ? levelOptionsFromDb
                .map((item) => item.code)
                .sort(compareAdminLevelCodes)
            : [],
        [levelOptionsFromDb]
    );
    const hasSearchQuery = searchQuery.trim().length > 0;

    useEffect(() => {
        setMemberList(users);
    }, [users]);

    const getLevelOptionMeta = (levelCode: string) =>
        levelOptionsFromDb.find((item) => item.code === levelCode);

    const normalizeLevelKey = (value?: string | null) => {
        const normalized = (value || '').trim().toUpperCase();
        return normalized || UNASSIGNED_LEVEL_KEY;
    };

    const formatLevelGroupLabel = (levelCode: string) => {
        if (levelCode === UNASSIGNED_LEVEL_KEY) {
            return '기타';
        }

        const option = getLevelOptionMeta(levelCode);
        return option?.description || formatAdminLevelLabel(option) || levelCode;
    };

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
            full_name: user.full_name ?? '',
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

    const handleQuickLevelChange = (user: AdminUser, nextLevel: string) => {
        const previousLevel = user.skill_level;
        setMemberList((prev) => prev.map((item) => item.id === user.id ? { ...item, skill_level: nextLevel } : item));

        startTransition(async () => {
            const res = await updateUser(user.id, { skill_level: nextLevel });
            if (res?.error) {
                setMemberList((prev) => prev.map((item) => item.id === user.id ? { ...item, skill_level: previousLevel } : item));
                alert(`레벨 수정 실패: ${res.error}`);
                return;
            }

            router.refresh();
        });
    };

    const saveEdit = (user: AdminUser) => {
        startTransition(async () => {
            const payload: any = {
                full_name: draft.full_name,
                username: draft.full_name,
                skill_level: draft.skill_level,
                gender: draft.gender,
                role: draft.role,
            };
            const res = await updateUser(user.id, payload);
            if (res?.error) {
                alert(`수정 실패: ${res.error}`);
            } else {
                setMemberList((prev) => prev.map((item) => item.id === user.id ? ({
                    ...item,
                    full_name: draft.full_name,
                    username: draft.full_name,
                    skill_level: draft.skill_level,
                    gender: draft.gender,
                    role: draft.role,
                }) : item));
                setEditingId(null);
                setDraft({});
                router.refresh();
            }
        });
    };

    const handleCreateMember = () => {
        if (!newMember.full_name.trim()) {
            alert('회원 이름을 입력해 주세요.');
            return;
        }

        startTransition(async () => {
            const result = await createMember({
                full_name: newMember.full_name,
                skill_level: newMember.skill_level,
                gender: newMember.gender || null,
                role: newMember.role as 'user' | 'admin',
            });

            if (result?.error) {
                alert(`회원 추가 실패: ${result.error}`);
                return;
            }

            setNewMember({
                full_name: '',
                skill_level: 'N1',
                gender: '',
                role: 'user',
            });
            router.refresh();
        });
    };

    const filteredUsers = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();

        if (!keyword) {
            return memberList;
        }

        return memberList.filter((user) => {
            const values = [
                user.full_name,
                user.email,
                user.skill_label,
                user.skill_level,
                user.gender,
                user.role,
            ];

            return values.some((value) => (value || '').toString().toLowerCase().includes(keyword));
        });
    }, [memberList, searchQuery]);

    const groupedUsers = useMemo(() => {
        const groups = new Map<string, AdminUser[]>();

        for (const user of filteredUsers) {
            const levelKey = normalizeLevelKey(user.skill_level);

            if (!groups.has(levelKey)) {
                groups.set(levelKey, []);
            }

            groups.get(levelKey)!.push(user);
        }

        const orderedLevelKeys = [
            ...levelOptions.filter((level) => groups.has(level)),
            ...Array.from(groups.keys())
                .filter((level) => !levelOptions.includes(level))
                .sort(compareAdminLevelCodes),
        ];

        return orderedLevelKeys
            .map((level) => ({
                level,
                users: groups.get(level)!,
            }));
    }, [filteredUsers, levelOptions]);

    return (
        <div>
            {/* 회원 통계 */}
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8">
                <div className="bg-blue-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-blue-800">총 회원수</h3>
                    <p className="text-lg md:text-2xl font-bold text-blue-600">{memberList.length}명</p>
                </div>
                <div className="bg-green-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-green-800">관리자</h3>
                    <p className="text-lg md:text-2xl font-bold text-green-600">{memberList.filter(u => u.role === 'admin').length}명</p>
                </div>
                <div className="bg-purple-50 p-2 md:p-4 rounded-lg">
                    <h3 className="text-sm md:text-lg font-semibold text-purple-800">일반회원</h3>
                    <p className="text-lg md:text-2xl font-bold text-purple-600">{memberList.filter(u => u.role === 'user').length}명</p>
                </div>
            </div>

            <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3">
                    <h3 className="text-lg font-semibold text-amber-900">회원 추가</h3>
                    <p className="text-sm text-amber-700">이메일은 자동 생성되며, 로그인 연결 전까지는 프로필 회원으로 등록됩니다.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <input
                        type="text"
                        value={newMember.full_name}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, full_name: e.target.value }))}
                        placeholder="회원 이름"
                        className="rounded border border-amber-300 px-3 py-2"
                    />
                    <select
                        value={newMember.skill_level}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, skill_level: e.target.value }))}
                        className="rounded border border-amber-300 px-3 py-2"
                    >
                        {levelOptions.map((levelCode) => {
                            const option = getLevelOptionMeta(levelCode);
                            return (
                                <option key={levelCode} value={levelCode}>
                                    {formatAdminLevelLabel(option) || levelCode}
                                </option>
                            );
                        })}
                    </select>
                    <select
                        value={newMember.gender}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, gender: e.target.value }))}
                        className="rounded border border-amber-300 px-3 py-2"
                    >
                        <option value="">성별 미지정</option>
                        <option value="M">남성</option>
                        <option value="F">여성</option>
                        <option value="O">기타</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleCreateMember}
                        disabled={isPending}
                        className="rounded bg-amber-500 px-4 py-2 font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
                    >
                        회원 추가
                    </button>
                </div>
            </div>

            <div className="mb-8">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <label htmlFor="member-search" className="block text-sm font-medium text-gray-700 mb-2">
                        회원 검색
                    </label>
                    <input
                        id="member-search"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="이름, 이메일, 급수, 역할로 검색"
                        className="w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm text-gray-500">
                        <span>
                            {hasSearchQuery ? `검색 결과: ${filteredUsers.length}명` : `전체 회원: ${memberList.length}명`}
                        </span>
                        {hasSearchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="text-blue-600 hover:text-blue-700"
                            >
                                검색 초기화
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                <div className="text-sm font-medium text-gray-600">
                    {hasSearchQuery ? '검색된 회원만 표시 중입니다.' : '전체 회원을 급수별로 표시 중입니다.'}
                </div>
                {groupedUsers.map((group) => (
                    <section key={group.level}>
                        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {formatLevelGroupLabel(group.level)}
                            </h3>
                            <span className="text-sm text-gray-500">{group.users.length}명</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {group.users.map((user) => {
                                const isEditing = editingId === user.id;
                                return (
                                    <div key={user.id} className="bg-white rounded shadow p-3 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold text-gray-900 break-words">
                                                        {isEditing ? (
                                                            <input value={draft.full_name ?? ''} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} className="border rounded px-2 py-1 w-full" placeholder="풀네임" />
                                                        ) : (
                                                            user.full_name || '풀네임 없음'
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-white bg-blue-600 px-2 py-0.5 rounded shrink-0">{user.role}</div>
                                            </div>

                                            <div className="mt-2 text-sm text-gray-700">
                                                {isEditing ? (
                                                    <select value={draft.skill_level ?? 'E2'} onChange={(e) => setDraft({ ...draft, skill_level: e.target.value })} className="border rounded px-2 py-1 w-full">
                                                        {levelOptions.map((levelCode) => {
                                                            const option = getLevelOptionMeta(levelCode);
                                                            return (
                                                                <option key={levelCode} value={levelCode}>
                                                                    {formatAdminLevelLabel(option) || levelCode}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                ) : (
                                                    <select
                                                        value={user.skill_level || 'N1'}
                                                        onChange={(e) => handleQuickLevelChange(user, e.target.value)}
                                                        disabled={isPending}
                                                        className="w-full rounded border border-gray-300 px-2 py-1"
                                                    >
                                                        {levelOptions.map((levelCode) => {
                                                            const option = getLevelOptionMeta(levelCode);
                                                            return (
                                                                <option key={levelCode} value={levelCode}>
                                                                    {formatAdminLevelLabel(option) || levelCode}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
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
                                            <div className="mt-2 text-sm text-gray-500 break-all">{user.email}</div>
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
                                );
                            })}
                        </div>
                    </section>
                ))}

                {groupedUsers.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                        검색 결과가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
}
