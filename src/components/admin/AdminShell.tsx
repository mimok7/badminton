"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireAdmin } from '@/components/AuthGuard';
import { useUser } from '@/hooks/useUser';
import { SECTIONS } from './menuConfig';

function getGroupColors(color: string) {
  const colorMap: Record<string, { bg: string; border: string; text: string; active: string }> = {
    blue: { 
      bg: 'bg-blue-50', 
      border: 'border-l-4 border-blue-400', 
      text: 'text-blue-600',
      active: 'bg-blue-100 text-blue-800 border-l-4 border-blue-600'
    },
    green: { 
      bg: 'bg-green-50', 
      border: 'border-l-4 border-green-400', 
      text: 'text-green-600',
      active: 'bg-green-100 text-green-800 border-l-4 border-green-600'
    },
    purple: { 
      bg: 'bg-purple-50', 
      border: 'border-l-4 border-purple-400', 
      text: 'text-purple-600',
      active: 'bg-purple-100 text-purple-800 border-l-4 border-purple-600'
    },
    orange: { 
      bg: 'bg-orange-50', 
      border: 'border-l-4 border-orange-400', 
      text: 'text-orange-600',
      active: 'bg-orange-100 text-orange-800 border-l-4 border-orange-600'
    }
  };
  return colorMap[color] || colorMap.blue;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useUser();

  const isActive = (href: string) => {
    try {
      return pathname === href || pathname?.startsWith(href + '/');
    } catch {
      return false;
    }
  };

  return (
    <RequireAdmin>
      <div className="min-h-screen grid grid-cols-[10rem_1fr] bg-gray-50">
        <aside className="w-40 shrink-0 border-r border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto z-30">
          <div className="p-3 border-b border-gray-100">
            <Link href="/admin" className="block text-sm font-semibold text-gray-900">⚙️ 관리자</Link>
            <div className="mt-1 text-[11px] text-gray-500">{profile?.username || profile?.full_name || '관리자'}님</div>
          </div>

          <nav className="p-2 space-y-1">
            {SECTIONS.map((section) => {
              const colors = getGroupColors(section.color);
              return (
                <div key={section.title} className={`mb-4 rounded-lg ${colors.bg} p-2`}>
                  <div className={`px-2 mb-1 text-[11px] font-medium uppercase tracking-wider ${colors.text}`}>
                    {section.title}
                  </div>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive(item.href)
                              ? colors.active
                              : 'text-gray-600 hover:bg-white hover:bg-opacity-50 hover:text-gray-900'
                          }`}
                        >
                          <span className="w-4 text-center">{item.icon ?? '•'}</span>
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <div className="px-2 mt-6 pt-4 border-t border-gray-200">
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">빠른 이동</div>
              <div className="space-y-1">
                <Link href="/dashboard" className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900">
                  <span>📊</span> 대시보드
                </Link>
                <Link href="/" className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900">
                  <span>🏠</span> 홈으로
                </Link>
              </div>
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
            <div className="text-sm text-gray-500">관리자 영역</div>
          </header>
          <main className="bg-gray-50 min-h-screen relative z-0">{children}</main>
        </div>
      </div>
    </RequireAdmin>
  );
}
