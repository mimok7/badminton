'use client';

import { useState, useTransition } from 'react';
import { Plus, Settings, Users, Calendar, X, Save } from 'lucide-react';
import { createClub, getClubLevelAliases, updateClubLevelAliases } from './actions';
import { SKILL_LEVEL_CODES } from '@/lib/skill-levels';
import { useRouter } from 'next/navigation';

interface Club {
    id: string;
    name: string;
    code: string;
    description: string | null;
    created_at: string;
    member_count: number;
}

export default function ClubManagementClient({ initialClubs }: { initialClubs: Club[] }) {
    const router = useRouter();
    const [clubs, setClubs] = useState<Club[]>(initialClubs);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
    const [selectedClub, setSelectedClub] = useState<Club | null>(null);
    const [aliases, setAliases] = useState<Record<string, string>>({});
    
    // Create Club state
    const [newClub, setNewClub] = useState({ name: '', code: '', description: '' });
    
    const [isPending, startTransition] = useTransition();

    const handleCreateClub = () => {
        if (!newClub.name.trim() || !newClub.code.trim()) {
            alert('클럽 이름과 코드를 모두 입력해 주세요.');
            return;
        }

        startTransition(async () => {
            const result = await createClub(newClub);
            if (result.error) {
                alert(`클럽 생성 실패: ${result.error}`);
            } else {
                alert('클럽이 성공적으로 생성되었습니다.');
                setIsCreateModalOpen(false);
                setNewClub({ name: '', code: '', description: '' });
                router.refresh();
            }
        });
    };

    const handleOpenAliases = (club: Club) => {
        setSelectedClub(club);
        startTransition(async () => {
            const result = await getClubLevelAliases(club.id);
            if (result.error) {
                alert(`설정을 불러오는 중 오류가 발생했습니다: ${result.error}`);
            } else {
                const aliasMap = (result.aliases || []).reduce(
                    (acc: Record<string, string>, item: any) => ({ ...acc, [item.level_code]: item.alias }),
                    {} as Record<string, string>
                );
                
                // Fill missing with defaults
                const fullAliases = SKILL_LEVEL_CODES.reduce(
                    (acc: Record<string, string>, code: string) => ({ ...acc, [code]: aliasMap[code] || code }),
                    {} as Record<string, string>
                );
                
                setAliases(fullAliases);
                setIsAliasModalOpen(true);
            }
        });
    };

    const handleSaveAliases = () => {
        if (!selectedClub) return;

        startTransition(async () => {
            const result = await updateClubLevelAliases(selectedClub.id, aliases);
            if (result.error) {
                alert(`설정 저장 실패: ${result.error}`);
            } else {
                alert('등급 별칭이 저장되었습니다.');
                setIsAliasModalOpen(false);
                router.refresh();
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">클럽 관리</h1>
                    <p className="text-sm text-slate-500">배드민턴 매치 메이커 서비스에 등록된 모든 클럽을 관리합니다.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
                >
                    <Plus className="size-4" />
                    새 클럽 추가
                </button>
            </div>

            {/* Clubs Grid/Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">클럽 이름</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">클럽 코드</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">설명</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">회원 수</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">생성일</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">설정</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {clubs.map((club) => (
                            <tr key={club.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-6 py-4">
                                    <span className="font-semibold text-slate-900">{club.name}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                                        {club.code}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm max-w-xs truncate">
                                    {club.description || '-'}
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="size-4 text-slate-400" />
                                        <span>{club.member_count} 명</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="size-4 text-slate-400" />
                                        <span>{new Date(club.created_at).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleOpenAliases(club)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                    >
                                        <Settings className="size-3.5 text-slate-400" />
                                        등급 별칭 설정
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Club Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 p-6">
                            <h2 className="text-lg font-bold text-slate-900">새 클럽 추가</h2>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 transition"
                            >
                                <X className="size-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">클럽 이름</label>
                                <input
                                    type="text"
                                    value={newClub.name}
                                    onChange={(e) => setNewClub({ ...newClub, name: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder="예: 강남 배드민턴 클럽"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">클럽 코드 (중복 불가)</label>
                                <input
                                    type="text"
                                    value={newClub.code}
                                    onChange={(e) => setNewClub({ ...newClub, code: e.target.value.toUpperCase() })}
                                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder="예: GANGNAM (영문 대문자)"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">설명 (선택)</label>
                                <textarea
                                    value={newClub.description}
                                    onChange={(e) => setNewClub({ ...newClub, description: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none"
                                    placeholder="클럽에 대한 짧은 설명을 적어주세요."
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleCreateClub}
                                disabled={isPending}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                                {isPending ? '생성 중...' : '클럽 생성'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Level Alias Modal */}
            {isAliasModalOpen && selectedClub && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 p-6">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">[{selectedClub.name}] 등급 별칭 설정</h2>
                                <p className="text-xs text-slate-500 mt-0.5">클럽에 맞춰 각 등급의 표시 이름을 설정합니다.</p>
                            </div>
                            <button
                                onClick={() => setIsAliasModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 transition"
                            >
                                <X className="size-5" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto grid gap-4 sm:grid-cols-2">
                            {SKILL_LEVEL_CODES.map((code) => (
                                <div key={code} className="space-y-1">
                                    <label className="text-xs font-bold text-slate-600">
                                        {code} 별칭
                                    </label>
                                    <input
                                        type="text"
                                        value={aliases[code] || ''}
                                        onChange={(e) => setAliases({ ...aliases, [code]: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        placeholder={code}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                onClick={() => setIsAliasModalOpen(false)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSaveAliases}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                                <Save className="size-4" />
                                {isPending ? '저장 중...' : '별칭 저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
