export type MenuItem = { label: string; href: string; icon?: string };
export type MenuSection = { title: string; items: MenuItem[]; color: string };

export const SECTIONS: MenuSection[] = [
  {
    title: '🏸 경기 관리',
    items: [
      { label: '경기 일정', href: '/match-schedule', icon: '📅' },
      { label: '오늘 경기', href: '/admin/players-today', icon: '⚡' },
      { label: '예정 경기', href: '/admin/players-scheduled', icon: '⏳' },
      { label: '경기 결과', href: '/match-results', icon: '🏆' },
    ],
    color: 'blue',
  },
  {
    title: '🏆 대회 관리',
    items: [
      { label: '팀 관리', href: '/team-management', icon: '🤝' },
      { label: '대회 경기', href: '/admin/tournament-matches', icon: '🎪' },
      { label: '대진표', href: '/tournament-bracket', icon: '📊' },
    ],
    color: 'purple',
  },
  {
    title: '👥 회원 관리',
    items: [
      { label: '회원 관리', href: '/admin/members', icon: '👥' },
      { label: '출석 관리', href: '/admin/attendance', icon: '✅' },
      { label: '전체 출석', href: '/attendance-all-test', icon: '🧪' },
    ],
    color: 'green',
  },
  {
    title: '�️ 클럽 운영',
    items: [
      { label: '정기모임', href: '/recurring-matches', icon: '🔄' },
      { label: '공지사항', href: '/admin/notifications', icon: '📢' },
      { label: '코트 관리', href: '/admin/courts', icon: '🏟️' },
    ],
    color: 'orange',
  },
  {
    title: '⚙️ 시스템 관리',
    items: [
      { label: '시스템', href: '/database-test', icon: '🔧' },
    ],
    color: 'orange',
  },
];
