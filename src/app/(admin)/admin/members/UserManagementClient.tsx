'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { AdminUser } from '@/types';
import { createMember, deleteUser, updateUser, updateUsersBulk } from './actions';
import type { UpdateUserPayload } from './actions';
import { useRouter } from 'next/navigation';
import { Activity, Filter, Save, Search, Shield, Trash2, UserPlus, Users } from 'lucide-react';

type LevelOption = {
    code: string;
    description: string | null;
    score: number | null;
};

type AttendanceSummary = Record<
    string,
    {
        total: number;
        last30: number;
        lastAttended: string | null;
    }
>;

type TabKey = 'overview' | 'members' | 'attendance' | 'create';

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
    attendanceSummary,
    initialTab,
}: {
    users: AdminUser[];
    myUserId: string;
    levelOptions: LevelOption[];
    attendanceSummary: AttendanceSummary;
    initialTab: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [draftsByUserId, setDraftsByUserId] = useState<Record<string, UpdateUserPayload & { email?: string | null }>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTab, setSelectedTab] = useState<TabKey>('overview');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'manager' | 'user'>('all');
    const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F' | 'O' | 'unset'>('all');
    const [levelFilter, setLevelFilter] = useState<string>('all');
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
        if (initialTab === 'members' || initialTab === 'attendance' || initialTab === 'create' || initialTab === 'overview') {
            setSelectedTab(initialTab);
        }
    }, [initialTab]);

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

        return memberList.filter((user) => {
            const normalizedRole = user.role === 'admin' ? 'admin' : normalizeEditableRole(user.role);
            const normalizedLevel = normalizeSkillLevel(user.skill_level);
            const normalizedGender = (user.gender || '').toUpperCase();

            if (roleFilter !== 'all' && normalizedRole !== roleFilter) {
                return false;
            }

            if (levelFilter !== 'all' && normalizedLevel !== levelFilter) {
                return false;
            }

            if (genderFilter === 'unset' && normalizedGender) {
                return false;
            }

            if (genderFilter !== 'all' && genderFilter !== 'unset' && normalizedGender !== genderFilter) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            const values = [
                user.full_name,
                user.email,
                user.username,
                user.skill_label,
                normalizeSkillLevel(user.skill_level),
                getLevelOptionMeta(normalizeSkillLevel(user.skill_level))?.description,
                user.gender,
                user.role,
            ];

            return values.some((value) => (value || '').toString().toLowerCase().includes(keyword));
        });
    }, [genderFilter, levelFilter, memberList, roleFilter, searchQuery, levelOptionsFromDb]);

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

    const attendanceRows = useMemo(() => {
        return filteredUsers
            .map((user) => ({
                ...user,
                attendance: attendanceSummary[user.id] || {
                    total: 0,
                    last30: 0,
                    lastAttended: null,
                },
            }))
            .sort((left, right) => {
                if (right.attendance.total !== left.attendance.total) {
                    return right.attendance.total - left.attendance.total;
                }

                return (left.full_name || left.username || left.email).localeCompare(right.full_name || right.username || right.email);
            });
    }, [attendanceSummary, filteredUsers]);

    const overview = useMemo(() => {
        const adminCount = memberList.filter((user) => user.role === 'admin').length;
        const managerCount = memberList.filter((user) => user.role === 'manager').length;
        const linkedCount = memberList.filter((user) => Boolean(user.email)).length;
        const topAttendance = [...memberList]
            .map((user) => ({
                ...user,
                attendance: attendanceSummary[user.id] || { total: 0, last30: 0, lastAttended: null },
            }))
            .sort((left, right) => right.attendance.total - left.attendance.total)
            .slice(0, 5);

        return {
            adminCount,
            managerCount,
            linkedCount,
            topAttendance,
        };
    }, [attendanceSummary, memberList]);

    const tabButtonClass = (tab: TabKey) =>
        `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            selectedTab === tab
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`;

    const renderMemberTable = () => (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold">회원</th>
                            <th className="px-4 py-3 text-left font-semibold">역할</th>
                            <th className="px-4 py-3 text-left font-semibold">급수</th>
                            <th className="px-4 py-3 text-left font-semibold">성별</th>
                            <th className="px-4 py-3 text-left font-semibold">이메일</th>
                            <th className="px-4 py-3 text-right font-semibold">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {filteredUsers.map((user) => {
                            const draft = getDraft(user);
                            const isDirty = hasPendingChanges(user);
                            const normalizedRole = user.role === 'admin' ? 'admin' : normalizeEditableRole(user.role);

                            return (
                                <tr key={user.id} className={isDirty ? 'bg-amber-50/60' : 'bg-white'}>
                                    <td className="px-4 py-3 align-top">
                                        <div className="space-y-2">
                                            <input
                                                value={draft.full_name ?? ''}
                                                onChange={(e) => updateDraft(user.id, { full_name: e.target.value })}
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                                placeholder="회원 이름"
                                            />
                                            <div className="text-xs text-slate-500">
                                                {user.username || '-'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        {normalizedRole === 'admin' ? (
                                            <span className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                                                admin
                                            </span>
                                        ) : (
                                            <select
                                                value={normalizeEditableRole(draft.role)}
                                                onChange={(e) => updateDraft(user.id, { role: e.target.value as 'user' | 'manager' })}
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                            >
                                                <option value="user">user</option>
                                                <option value="manager">manager</option>
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <select
                                            value={normalizeSkillLevel(draft.skill_level) || levelOptionsFromDb[0]?.code || ''}
                                            onChange={(e) => updateDraft(user.id, { skill_level: e.target.value })}
                                            disabled={isPending}
                                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <select
                                            value={draft.gender ?? ''}
                                            onChange={(e) => updateDraft(user.id, { gender: e.target.value })}
                                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">미지정</option>
                                            <option value="M">남성</option>
                                            <option value="F">여성</option>
                                            <option value="O">기타</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 align-top text-slate-500">
                                        <div className="max-w-[240px] break-all">{user.email}</div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => saveEdit(user)}
                                                disabled={isPending || !isDirty}
                                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-40"
                                            >
                                                <Save className="size-3.5" />
                                                저장
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(user)}
                                                disabled={isPending || user.id === myUserId}
                                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-40"
                                            >
                                                <Trash2 className="size-3.5" />
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#f7fafc_0%,#eef6ff_100%)] px-6 py-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="text-sm font-medium text-slate-500">Member Console</div>
                            <h1 className="mt-1 text-3xl font-semibold text-slate-900">회원 운영 센터</h1>
                            <p className="mt-2 max-w-3xl text-sm text-slate-600">
                                회원 정보, 권한, 급수, 출석 흐름을 한 화면에서 정리하도록 묶었습니다.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs uppercase tracking-wide text-slate-500">전체 회원</div>
                                <div className="mt-1 text-2xl font-semibold text-slate-900">{memberList.length}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs uppercase tracking-wide text-slate-500">관리자</div>
                                <div className="mt-1 text-2xl font-semibold text-slate-900">{overview.adminCount}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs uppercase tracking-wide text-slate-500">매니저</div>
                                <div className="mt-1 text-2xl font-semibold text-slate-900">{overview.managerCount}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs uppercase tracking-wide text-slate-500">연결 완료</div>
                                <div className="mt-1 text-2xl font-semibold text-slate-900">{overview.linkedCount}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setSelectedTab('overview')} className={tabButtonClass('overview')}>
                            <Users className="size-4" />
                            개요
                        </button>
                        <button type="button" onClick={() => setSelectedTab('members')} className={tabButtonClass('members')}>
                            <Shield className="size-4" />
                            회원 관리
                        </button>
                        <button type="button" onClick={() => setSelectedTab('attendance')} className={tabButtonClass('attendance')}>
                            <Activity className="size-4" />
                            출석 현황
                        </button>
                        <button type="button" onClick={() => setSelectedTab('create')} className={tabButtonClass('create')}>
                            <UserPlus className="size-4" />
                            회원 추가
                        </button>
                    </div>
                </div>
                <div className="px-6 py-5">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="이름, 이메일, 급수, 역할 검색"
                                className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm"
                            />
                        </label>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
                        >
                            <option value="all">전체 역할</option>
                            <option value="admin">admin</option>
                            <option value="manager">manager</option>
                            <option value="user">user</option>
                        </select>
                        <select
                            value={levelFilter}
                            onChange={(e) => setLevelFilter(e.target.value)}
                            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
                        >
                            <option value="all">전체 급수</option>
                            {levelOptions.map((levelCode) => (
                                <option key={levelCode} value={levelCode}>
                                    {formatAdminLevelLabel(getLevelOptionMeta(levelCode)) || levelCode}
                                </option>
                            ))}
                        </select>
                        <select
                            value={genderFilter}
                            onChange={(e) => setGenderFilter(e.target.value as typeof genderFilter)}
                            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
                        >
                            <option value="all">전체 성별</option>
                            <option value="M">남성</option>
                            <option value="F">여성</option>
                            <option value="O">기타</option>
                            <option value="unset">미지정</option>
                        </select>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                        <div className="inline-flex items-center gap-2">
                            <Filter className="size-4" />
                            현재 표시 {filteredUsers.length}명
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setRoleFilter('all');
                                setGenderFilter('all');
                                setLevelFilter('all');
                            }}
                            className="rounded-md border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50"
                        >
                            필터 초기화
                        </button>
                    </div>
                </div>
            </section>

            {selectedTab === 'overview' && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                    <section className="rounded-lg border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-semibold text-slate-900">급수 분포</h2>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {levelSummary.map((item) => (
                                <div key={item.level} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="text-sm font-semibold text-slate-900">{formatLevelGroupLabel(item.level)}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{item.count.total}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                        남 {item.count.male} / 여 {item.count.female}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="rounded-lg border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-semibold text-slate-900">출석 상위</h2>
                        <div className="mt-4 space-y-3">
                            {overview.topAttendance.map((user, index) => (
                                <div key={user.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                            {index + 1}. {user.full_name || user.username || user.email}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            최근 30일 {user.attendance.last30}회
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-semibold text-slate-900">{user.attendance.total}</div>
                                        <div className="text-xs text-slate-500">누적</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {selectedTab === 'members' && (
                <div className="space-y-4">
                    <section className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-sm font-semibold text-sky-900">변경 대기</div>
                            <div className="text-sm text-sky-700">
                                {dirtyCount > 0 ? `${dirtyCount}명의 수정 내용이 아직 저장되지 않았습니다.` : '현재 저장 대기 중인 수정 내용이 없습니다.'}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={saveAllEdits}
                            disabled={isPending || dirtyCount === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            <Save className="size-4" />
                            전체 저장
                        </button>
                    </section>
                    {renderMemberTable()}
                </div>
            )}

            {selectedTab === 'attendance' && (
                <section className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <h2 className="text-lg font-semibold text-slate-900">회원별 출석 현황</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">회원</th>
                                    <th className="px-4 py-3 text-right font-semibold">누적 출석</th>
                                    <th className="px-4 py-3 text-right font-semibold">최근 30일</th>
                                    <th className="px-4 py-3 text-left font-semibold">마지막 출석</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {attendanceRows.map((user) => (
                                    <tr key={user.id}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{user.full_name || user.username || user.email}</div>
                                            <div className="text-xs text-slate-500">{formatLevelGroupLabel(normalizeLevelKey(user.skill_level))}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{user.attendance.total}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-700">{user.attendance.last30}</td>
                                        <td className="px-4 py-3 text-slate-500">{user.attendance.lastAttended || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {selectedTab === 'create' && (
                <section className="rounded-lg border border-amber-200 bg-[linear-gradient(135deg,#fffaf0_0%,#fff5d6_100%)] p-5">
                    <div className="max-w-4xl">
                        <h2 className="text-lg font-semibold text-amber-900">새 회원 등록</h2>
                        <p className="mt-1 text-sm text-amber-800">
                            회원을 먼저 프로필로 등록하고, 로그인 연결은 이후 auth 계정 생성 또는 회원가입에서 이어집니다.
                        </p>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                        <input
                            type="text"
                            value={newMember.full_name}
                            onChange={(e) => setNewMember((prev) => ({ ...prev, full_name: e.target.value }))}
                            placeholder="회원 이름"
                            className="h-11 rounded-md border border-amber-300 bg-white px-3 text-sm"
                        />
                        <select
                            value={newMember.skill_level}
                            onChange={(e) => setNewMember((prev) => ({ ...prev, skill_level: e.target.value }))}
                            className="h-11 rounded-md border border-amber-300 bg-white px-3 text-sm"
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
                            className="h-11 rounded-md border border-amber-300 bg-white px-3 text-sm"
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
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            <UserPlus className="size-4" />
                            회원 추가
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
