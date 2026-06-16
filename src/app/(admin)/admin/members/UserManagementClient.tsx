'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { AdminUser } from '@/types';
import { createMember, deleteUser, updateUser, updateUsersBulk } from './actions';
import type { UpdateUserPayload } from './actions';
import { useRouter } from 'next/navigation';

type LevelOption = {
    code: string;
    description: string | null;
    score: number | null;
};

function formatAdminLevelLabel(option?: LevelOption) {
    if (!option) {
        return '';
    }

    return option.description?.trim() || option.code;
}

function findEtcLevelOption(levelOptions: LevelOption[]) {
    return levelOptions.find((option) => {
        const code = String(option.code || '').trim().toUpperCase();
        return code === 'O' || code === 'ETC';
    });
}

const UNASSIGNED_LEVEL_KEY = '__UNASSIGNED__';

function normalizeEditableRole(value?: string | null): 'user' | 'manager' {
    return String(value || '').trim().toLowerCase() === 'manager' ? 'manager' : 'user';
}

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
    const [draftsByUserId, setDraftsByUserId] = useState<Record<string, UpdateUserPayload & { email?: string | null }>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [memberList, setMemberList] = useState<AdminUser[]>(users);
    const [newMember, setNewMember] = useState({
        full_name: '',
        skill_level: levelOptionsFromDb[0]?.code || '',
        gender: '',
        role: 'user',
    });
    const levelOptions = useMemo(
        () => levelOptionsFromDb.length > 0
            ? levelOptionsFromDb
                .map((item) => item.code)
            : [],
        [levelOptionsFromDb]
    );
    const hasSearchQuery = searchQuery.trim().length > 0;
    const etcLevelOption = useMemo(
        () => findEtcLevelOption(levelOptionsFromDb),
        [levelOptionsFromDb]
    );

    useEffect(() => {
        setMemberList(users);
    }, [users]);

    useEffect(() => {
        const nextDrafts = users.reduce<Record<string, UpdateUserPayload & { email?: string | null }>>((acc, user) => {
            acc[user.id] = {
                full_name: user.full_name ?? '',
                email: user.email ?? '',
                skill_level: normalizeSkillLevel(user.skill_level) || levelOptionsFromDb[0]?.code || '',
                gender: user.gender ?? '',
                role: user.role === 'admin' ? 'admin' : normalizeEditableRole(user.role),
            };
            return acc;
        }, {});

        setDraftsByUserId(nextDrafts);
    }, [users, levelOptionsFromDb]);

    useEffect(() => {
        setNewMember((prev) => (
            prev.skill_level || levelOptionsFromDb.length === 0
                ? prev
                : { ...prev, skill_level: levelOptionsFromDb[0].code }
        ));
    }, [levelOptionsFromDb]);

    const normalizeSkillLevel = (value?: string | null) => String(value || '').trim().toUpperCase();

    const getLevelOptionMeta = (levelCode: string) => {
        const normalizedCode = normalizeSkillLevel(levelCode);
        return levelOptionsFromDb.find((item) => item.code === normalizedCode);
    };

    const sortLevelCodes = (a: string, b: string) => {
        const aScore = getLevelOptionMeta(a)?.score;
        const bScore = getLevelOptionMeta(b)?.score;

        if (typeof aScore === 'number' && typeof bScore === 'number' && aScore !== bScore) {
            return bScore - aScore;
        }

        return a.localeCompare(b);
    };

    const normalizeLevelKey = (value?: string | null) => {
        const normalized = (value || '').trim().toUpperCase();
        return normalized || UNASSIGNED_LEVEL_KEY;
    };

    const formatLevelGroupLabel = (levelCode: string) => {
        if (levelCode === UNASSIGNED_LEVEL_KEY) {
            return formatAdminLevelLabel(etcLevelOption) || '기타';
        }

        const option = getLevelOptionMeta(levelCode);
        return formatAdminLevelLabel(option) || levelCode;
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

    const getDraft = (user: AdminUser) => {
        return draftsByUserId[user.id] ?? {
            full_name: user.full_name ?? '',
            email: user.email ?? '',
            skill_level: normalizeSkillLevel(user.skill_level) || levelOptionsFromDb[0]?.code || '',
            gender: user.gender ?? '',
            role: user.role === 'admin' ? 'admin' : normalizeEditableRole(user.role),
        };
    };

    const updateDraft = (userId: string, patch: Partial<UpdateUserPayload & { email?: string | null }>) => {
        setDraftsByUserId((prev) => ({
            ...prev,
            [userId]: {
                ...(prev[userId] || {}),
                ...patch,
            },
        }));
    };

    const hasPendingChanges = (user: AdminUser) => {
        const draft = getDraft(user);
        const currentRole = user.role === 'admin' ? 'admin' : normalizeEditableRole(user.role);

        return (
            (draft.full_name ?? '') !== (user.full_name ?? '')
            || normalizeSkillLevel(draft.skill_level) !== normalizeSkillLevel(user.skill_level)
            || (draft.gender ?? '') !== (user.gender ?? '')
            || ((draft.role === 'admin' ? 'admin' : normalizeEditableRole(draft.role)) !== currentRole)
        );
    };

    const saveEdit = (user: AdminUser) => {
        const draft = getDraft(user);

        startTransition(async () => {
            const payload: UpdateUserPayload = {
                full_name: draft.full_name,
                username: draft.full_name,
                skill_level: normalizeSkillLevel(draft.skill_level),
                gender: draft.gender,
                role: draft.role === 'admin' ? 'admin' : normalizeEditableRole(draft.role),
            };
            const res = await updateUser(user.id, payload);
            if (res?.error) {
                alert(`수정 실패: ${res.error}`);
            } else {
                setMemberList((prev) => prev.map((item) => item.id === user.id ? ({
                    ...item,
                    full_name: draft.full_name ?? undefined,
                    username: draft.full_name ?? undefined,
                    skill_level: normalizeSkillLevel(draft.skill_level),
                    skill_label: getLevelOptionMeta(normalizeSkillLevel(draft.skill_level))?.description ?? item.skill_label,
                    gender: draft.gender ?? undefined,
                    role: draft.role === 'admin' ? 'admin' : normalizeEditableRole(draft.role),
                }) : item));
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
                skill_level: normalizeSkillLevel(newMember.skill_level),
                gender: newMember.gender || null,
                role: newMember.role as 'user' | 'admin',
            });

            if (result?.error) {
                alert(`회원 추가 실패: ${result.error}`);
                return;
            }

            setNewMember({
                full_name: '',
                skill_level: levelOptionsFromDb[0]?.code || '',
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
                normalizeSkillLevel(user.skill_level),
                getLevelOptionMeta(normalizeSkillLevel(user.skill_level))?.description,
                user.gender,
                user.role,
            ];

            return values.some((value) => (value || '').toString().toLowerCase().includes(keyword));
        });
    }, [memberList, searchQuery, levelOptionsFromDb]);

    const dirtyUserIds = useMemo(
        () => memberList.filter((user) => hasPendingChanges(user)).map((user) => user.id),
        [memberList, draftsByUserId]
    );

    const dirtyCount = dirtyUserIds.length;

    const levelSummary = useMemo(() => {
        const counts = new Map<string, { total: number; male: number; female: number }>();

        for (const user of memberList) {
            const levelKey = normalizeLevelKey(normalizeSkillLevel(user.skill_level));
            const current = counts.get(levelKey) || { total: 0, male: 0, female: 0 };
            current.total += 1;
            if (user.gender === 'M') current.male += 1;
            if (user.gender === 'F') current.female += 1;
            counts.set(levelKey, current);
        }

        const orderedLevelKeys = [
            ...levelOptions.filter((level) => counts.has(level)),
            ...Array.from(counts.keys())
                .filter((level) => !levelOptions.includes(level))
                .sort(sortLevelCodes),
        ];

        return orderedLevelKeys.map((level) => ({
            level,
            count: counts.get(level) || { total: 0, male: 0, female: 0 },
        }));
    }, [memberList, levelOptions]);

    const saveAllEdits = () => {
        if (dirtyCount === 0) {
            alert('저장할 수정 내용이 없습니다.');
            return;
        }

        const items = memberList
            .filter((user) => dirtyUserIds.includes(user.id))
            .map((user) => {
                const draft = getDraft(user);
                return {
                    userId: user.id,
                    updates: {
                        full_name: draft.full_name,
                        username: draft.full_name,
                        skill_level: normalizeSkillLevel(draft.skill_level),
                        gender: draft.gender,
                        role: draft.role === 'admin' ? 'admin' : normalizeEditableRole(draft.role),
                    } satisfies UpdateUserPayload,
                };
            });

        startTransition(async () => {
            const res = await updateUsersBulk(items);
            if (res?.error) {
                alert(`전체 저장 실패: ${res.error}`);
                return;
            }

            setMemberList((prev) => prev.map((item) => {
                const dirtyUser = memberList.find((user) => user.id === item.id);
                if (!dirtyUser || !dirtyUserIds.includes(item.id)) {
                    return item;
                }

                const draft = getDraft(dirtyUser);
                return {
                    ...item,
                    full_name: draft.full_name ?? undefined,
                    username: draft.full_name ?? undefined,
                    skill_level: normalizeSkillLevel(draft.skill_level),
                    skill_label: getLevelOptionMeta(normalizeSkillLevel(draft.skill_level))?.description ?? item.skill_label,
                    gender: draft.gender ?? undefined,
                    role: draft.role === 'admin' ? 'admin' : normalizeEditableRole(draft.role),
                };
            }));
            router.refresh();
        });
    };

    const groupedUsers = useMemo(() => {
        const groups = new Map<string, AdminUser[]>();

        for (const user of filteredUsers) {
            const levelKey = normalizeLevelKey(normalizeSkillLevel(user.skill_level));

            if (!groups.has(levelKey)) {
                groups.set(levelKey, []);
            }

            groups.get(levelKey)!.push(user);
        }

        const orderedLevelKeys = [
            ...levelOptions.filter((level) => groups.has(level)),
            ...Array.from(groups.keys())
                .filter((level) => !levelOptions.includes(level))
                .sort(sortLevelCodes),
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
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-lg bg-blue-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-blue-800">👥 총 회원수</h3>
                    <p className="text-sm md:text-lg font-bold text-blue-600">{memberList.length}명</p>
                </div>
                <div className="rounded-lg bg-green-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-green-800">🛡️ 관리자</h3>
                    <p className="text-sm md:text-lg font-bold text-green-600">{memberList.filter((u) => u.role === 'admin').length}명</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-emerald-800">📋 매니저</h3>
                    <p className="text-sm md:text-lg font-bold text-emerald-600">{memberList.filter((u) => u.role === 'manager').length}명</p>
                </div>
                <div className="rounded-lg bg-purple-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-purple-800">🙂 일반회원</h3>
                    <p className="text-sm md:text-lg font-bold text-purple-600">{memberList.filter((u) => u.role === 'user').length}명</p>
                </div>
                <div className="rounded-lg bg-sky-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-sky-800">👨 남성</h3>
                    <p className="text-sm md:text-lg font-bold text-sky-600">{memberList.filter((u) => u.gender === 'M').length}명</p>
                </div>
                <div className="rounded-lg bg-rose-50 px-2.5 py-2">
                    <h3 className="text-[11px] md:text-xs font-semibold text-rose-800">👩 여성</h3>
                    <p className="text-sm md:text-lg font-bold text-rose-600">{memberList.filter((u) => u.gender === 'F').length}명</p>
                </div>
            </div>

            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="mb-3 text-sm font-semibold text-slate-700">🏷️ 급수별 통계</div>
                <div className="flex flex-wrap gap-2.5">
                    {levelSummary.map((item) => (
                        <div
                            key={item.level}
                            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 shadow-sm"
                        >
                            <span className="font-semibold">{formatLevelGroupLabel(item.level)}</span>
                            <span className="ml-1.5 text-slate-500">{item.count.total}명</span>
                            <span className="ml-2 text-sky-600">남 {item.count.male}</span>
                            <span className="ml-1.5 text-rose-600">여 {item.count.female}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3">
                    <h3 className="text-lg font-semibold text-amber-900">➕ 회원 추가</h3>
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
                    <label htmlFor="member-search" className="mb-2 block text-sm font-medium text-gray-700">
                        🔎 회원 검색
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

            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-sm font-semibold text-blue-900">💾 일괄 저장</div>
                    <div className="text-sm text-blue-700">
                        {dirtyCount > 0 ? `${dirtyCount}명의 수정 내용이 저장 대기 중입니다.` : '현재 저장 대기 중인 수정 내용이 없습니다.'}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={saveAllEdits}
                    disabled={isPending || dirtyCount === 0}
                    className="rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                    전체저장
                </button>
            </div>

            <div className="space-y-8">
                <div className="text-sm font-medium text-gray-600">
                    {hasSearchQuery ? '검색된 회원만 표시 중입니다.' : '전체 회원을 급수별로 표시 중입니다.'}
                </div>
                {groupedUsers.map((group) => (
                    <section key={group.level}>
                        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                                🏷️ {formatLevelGroupLabel(group.level)}
                            </h3>
                            <span className="text-sm text-gray-500">{group.users.length}명</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {group.users.map((user) => {
                                const draft = getDraft(user);
                                const isDirty = hasPendingChanges(user);
                                return (
                                    <div key={user.id} className="bg-white rounded shadow p-3 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold text-gray-900 break-words">
                                                        <input value={draft.full_name ?? ''} onChange={(e) => updateDraft(user.id, { full_name: e.target.value })} className="border rounded px-2 py-1 w-full" placeholder="풀네임" />
                                                    </div>
                                                </div>
                                                {user.role === 'admin' ? (
                                                    <span className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs text-white">
                                                        admin
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={normalizeEditableRole(draft.role)}
                                                        onChange={(e) => updateDraft(user.id, { role: e.target.value as 'user' | 'manager' })}
                                                        className="text-xs border rounded px-2 py-1 shrink-0"
                                                    >
                                                        <option value="user">user</option>
                                                        <option value="manager">manager</option>
                                                    </select>
                                                )}
                                            </div>

                                            <div className="mt-2 text-sm text-gray-700">
                                                <select
                                                    value={normalizeSkillLevel(draft.skill_level) || levelOptionsFromDb[0]?.code || ''}
                                                    onChange={(e) => updateDraft(user.id, { skill_level: e.target.value })}
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
                                            </div>
                                            <div className="mt-2 text-sm text-gray-700">
                                                <select value={draft.gender ?? ''} onChange={(e) => updateDraft(user.id, { gender: e.target.value })} className="border rounded px-2 py-1 w-full">
                                                    <option value="">선택</option>
                                                    <option value="M">남성</option>
                                                    <option value="F">여성</option>
                                                    <option value="O">기타</option>
                                                </select>
                                            </div>
                                            <div className="mt-2 text-sm text-gray-500 break-all">{user.email}</div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between gap-2">
                                            <button
                                                onClick={() => saveEdit(user)}
                                                disabled={isPending || !isDirty}
                                                className="text-green-600 disabled:text-gray-400"
                                            >
                                                저장
                                            </button>
                                            <button onClick={() => handleDelete(user)} disabled={isPending || user.id === myUserId} className="text-red-500">삭제</button>
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
