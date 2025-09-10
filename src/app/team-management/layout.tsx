"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type MenuItem = { label: string; href: string; icon?: string };
type MenuSection = { title: string; items: MenuItem[]; color: string };

const SECTIONS: MenuSection[] = [
  {
    title: '🏸 경기 관리',
    items: [
      { label: '경기 일정 관리', href: '/match-schedule', icon: '📅' },
      { label: '오늘 경기', href: '/admin/players-today', icon: '⚡' },
      { label: '예정 경기', href: '/admin/players-scheduled', icon: '⏳' },
      { label: '경기 결과 관리', href: '/match-results', icon: '🏆' },
      { label: '경기 배정 관리', href: '/match-assignment', icon: '🎯' },
    ],
    color: 'blue'
  },
  {
    title: '👥 회원 관리',
    items: [
      { label: '회원 관리', href: '/admin/members', icon: '👥' },
      { label: '출석 관리', href: '/admin/attendance', icon: '✅' },
      { label: '팀 구성 관리', href: '/team-management', icon: '👨‍👩‍👧‍👦' },
    ],
    color: 'green'
  },
  {
    title: '🏆 클럽 운영',
    items: [
      { label: '정기모임 관리', href: '/recurring-matches', icon: '🔄' },
      { label: '공지사항 관리', href: '/admin/notifications', icon: '📢' },
    ],
    color: 'purple'
  }
];

const getGroupColors = (color: string) => {
  const colorMap: Record<string, { bg: string; border: string; text: string; active: string }> = {
    blue: { bg: 'bg-blue-50', border: 'border-l-4 border-blue-400', text: 'text-blue-600', active: 'bg-blue-100 text-blue-800 border-l-4 border-blue-600' },
    green: { bg: 'bg-green-50', border: 'border-l-4 border-green-400', text: 'text-green-600', active: 'bg-green-100 text-green-800 border-l-4 border-green-600' },
    purple: { bg: 'bg-purple-50', border: 'border-l-4 border-purple-400', text: 'text-purple-600', active: 'bg-purple-100 text-purple-800 border-l-4 border-purple-600' },
  };
  return colorMap[color] || colorMap.blue;
};

export default function TeamManagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    try { return pathname === href || pathname?.startsWith(href + '/'); } catch { return false; }
  };

  return (
    <div className="min-h-screen grid grid-cols-[16rem_1fr] bg-gray-50">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto z-30">
        <div className="p-6 border-b border-gray-100">
          <Link href="/" className="block text-lg font-semibold text-gray-900">⚙️ 관리자</Link>
          <div className="mt-1 text-sm text-gray-500">사이트 메뉴</div>
        </div>

        <nav className="p-4 space-y-1">
          {SECTIONS.map((section) => {
            const colors = getGroupColors(section.color);
            return (
              <div key={section.title} className={`mb-6 rounded-lg ${colors.bg} p-3`}>
                <div className={`px-3 mb-3 text-xs font-medium uppercase tracking-wider ${colors.text}`}>{section.title}</div>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive(item.href) ? colors.active : 'text-gray-600 hover:bg-white hover:bg-opacity-50 hover:text-gray-900'}`}>
                        <span className="w-5 text-center">{item.icon ?? '•'}</span>
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <main className="bg-gray-50 min-h-screen relative z-0 p-6">{children}</main>
      </div>
    </div>
  );
}
