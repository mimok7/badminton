export type MenuItem = { label: string; href: string; icon?: string };
export type MenuSection = { title: string; items: MenuItem[]; color: string };

export const SECTIONS: MenuSection[] = [
  {
    title: '⚙️ 시스템 관리',
    items: [
      { label: '클럽 관리', href: '/admin', icon: '🏢' },
    ],
    color: 'blue',
  },
];
