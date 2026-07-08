'use client';

import { useState, useTransition } from 'react';
import { updateLevelAliases } from './actions';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ClubSettingsClient({
    levelOptions,
    clubId,
}: {
    levelOptions: { code: string; alias: string }[];
    clubId: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [aliases, setAliases] = useState<Record<string, string>>(
        levelOptions.reduce((acc, opt) => ({ ...acc, [opt.code]: opt.alias }), {})
    );

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateLevelAliases(clubId, aliases);
            if (result.error) {
                alert(`저장 실패: ${result.error}`);
            } else {
                alert('저장되었습니다.');
                router.refresh();
            }
        });
    };

    return (
        <div className="space-y-8">
            <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">등급 별칭 설정</h2>
                <p className="text-sm text-slate-500 mb-6">
                    A3부터 E1까지의 등급별 별칭(표시 이름)을 클럽에 맞게 설정할 수 있습니다.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {levelOptions.map((opt) => (
                        <div key={opt.code} className="space-y-1">
                            <label className="text-xs font-medium text-slate-600 block">
                                {opt.code} 별칭
                            </label>
                            <input
                                type="text"
                                value={aliases[opt.code] || ''}
                                onChange={(e) => setAliases({ ...aliases, [opt.code]: e.target.value })}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder={opt.code}
                            />
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                    >
                        <Save className="size-4" />
                        {isPending ? '저장 중...' : '별칭 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
}
