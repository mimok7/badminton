'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { RequireAdmin } from '@/components/AuthGuard';
import { useUser } from '@/hooks/useUser';

// 관리자 메뉴 탭 인터페이스
interface AdminMenuCard {
  id: string;
  name: string;
  icon: string;
  path: string;
  description: string;
  category: 'match' | 'member' | 'club' | 'system';
  color: 'blue' | 'green' | 'purple' | 'orange';
  adminOnly: boolean;
}

// 관리자 전용 메뉴 데이터
const ADMIN_MENU_CARDS: AdminMenuCard[] = [
  // 경기 관리 카테고리
  { 
    id: 'match-schedule', 
    name: '경기 일정 관리', 
    icon: '📅', 
    path: '/match-schedule', 
    description: '새 경기 생성 및 기존 경기 일정 관리', 
    category: 'match',
    color: 'blue',
    adminOnly: true
  },
  { 
    id: 'match-creation', 
    name: '경기 생성 & 배정', 
    icon: '🏸', 
    path: '/players', 
    description: '참가자 기반 실시간 경기 배정 및 생성', 
    category: 'match',
    color: 'blue',
    adminOnly: true
  },
  { 
    id: 'match-results', 
    name: '경기 결과 관리', 
    icon: '🏆', 
    path: '/match-results', 
    description: '경기 결과 입력 및 통계 관리', 
    category: 'match',
    color: 'blue',
    adminOnly: true
  },
  { 
    id: 'match-assignment', 
    name: '경기 배정 관리', 
    icon: '🎯', 
    path: '/match-assignment', 
    description: '경기 배정 현황 확인 및 관리', 
    category: 'match',
    color: 'blue',
    adminOnly: true
  },

  // 회원 관리 카테고리
  { 
    id: 'member-management', 
    name: '회원 관리', 
    icon: '👥', 
    path: '/admin/members', 
    description: '회원 정보, 권한, 실력 수준 관리', 
    category: 'member',
    color: 'green',
    adminOnly: true
  },
  { 
    id: 'attendance-management', 
    name: '출석 관리', 
    icon: '✅', 
    path: '/admin/attendance', 
    description: '회원 출석 현황 관리 및 통계 확인', 
    category: 'member',
    color: 'green',
    adminOnly: true
  },
  { 
    id: 'team-management', 
    name: '팀 구성 관리', 
    icon: '👨‍👩‍👧‍👦', 
    path: '/team-management', 
    description: '라켓팀/셔틀팀 배정 및 균형 관리', 
    category: 'member',
    color: 'green',
    adminOnly: true
  },
  {
    id: 'attendance-all-test',
    name: '전체 회원 출석 테스트',
    icon: '🧪',
    path: '/attendance-all-test',
    description: '경기 일정 선택 후 모든 회원을 출석자로 일괄 등록',
    category: 'member',
    color: 'green',
    adminOnly: true
  },

  // 클럽 운영 카테고리
  { 
    id: 'regular-meeting', 
    name: '정기모임 관리', 
    icon: '🔄', 
    path: '/recurring-matches', 
    description: '정기모임 자동 생성 설정 및 관리', 
    category: 'club',
    color: 'purple',
    adminOnly: true
  },
  { 
    id: 'notification-management', 
    name: '공지사항 관리', 
    icon: '📢', 
    path: '/admin/notifications', 
    description: '클럽 공지사항 및 알림 관리', 
    category: 'club',
    color: 'purple',
    adminOnly: true
  },
  { 
    id: 'court-management', 
    name: '코트 관리', 
    icon: '🏟️', 
    path: '/admin/courts', 
    description: '배드민턴 코트 현황 및 예약 관리', 
    category: 'club',
    color: 'purple',
    adminOnly: true
  },

  // 시스템 관리 카테고리
  { 
    id: 'data-backup', 
    name: '데이터 백업', 
    icon: '💾', 
    path: '/admin/backup', 
    description: '시스템 데이터 백업 및 복원 관리', 
    category: 'system',
    color: 'orange',
    adminOnly: true
  },
  { 
    id: 'system-test', 
    name: '시스템 테스트', 
    icon: '🔧', 
    path: '/database-test', 
    description: '데이터베이스 연결 및 시스템 기능 테스트', 
    category: 'system',
    color: 'orange',
    adminOnly: true
  }
];

function AdminMenuPage() {
  // 이미 상단에서 선언된 router를 사용
  const { profile } = useUser();
  const [activeTab, setActiveTab] = useState<'match' | 'member' | 'club' | 'system'>('match');
  const router = useRouter();

  // 카테고리별 제목 매핑
  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'match': return '🏸 경기 관리';
      case 'member': return '👥 회원 관리';
      case 'club': return '🏆 클럽 운영';
      case 'system': return '⚙️ 시스템 관리';
      default: return '기타';
    }
  };

  // 색상별 CSS 클래스 매핑
  const getColorClasses = (color: string) => {
    const colorMap: Record<string, {
      bg: string;
      hover: string;
      border: string;
      text: string;
      badge: string;
    }> = {
      blue: {
        bg: 'bg-blue-50',
        hover: 'hover:bg-blue-100',
        border: 'border-blue-200 hover:border-blue-300',
        text: 'text-blue-900',
        badge: 'bg-red-100 text-red-800'
      },
      green: {
        bg: 'bg-green-50',
        hover: 'hover:bg-green-100',
        border: 'border-green-200 hover:border-green-300',
        text: 'text-green-900',
        badge: 'bg-red-100 text-red-800'
      },
      purple: {
        bg: 'bg-purple-50',
        hover: 'hover:bg-purple-100',
        border: 'border-purple-200 hover:border-purple-300',
        text: 'text-purple-900',
        badge: 'bg-red-100 text-red-800'
      },
      orange: {
        bg: 'bg-orange-50',
        hover: 'hover:bg-orange-100',
        border: 'border-orange-200 hover:border-orange-300',
        text: 'text-orange-900',
        badge: 'bg-red-100 text-red-800'
      }
    };
    return colorMap[color] || colorMap.blue;
  };

  // 현재 활성 탭의 메뉴들 필터링
  const activeMenus = ADMIN_MENU_CARDS.filter(card => card.category === activeTab);


  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            ⚙️ 관리자 메뉴
          </h1>
          <div className="flex gap-2">
            <Link href="/dashboard" className="text-white hover:text-blue-100 transition-colors">
              📊 대시보드
            </Link>
            <Link href="/" className="text-white hover:text-blue-100 transition-colors">
              🏠 홈
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm mb-4">
          <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full">
            {profile?.username || profile?.full_name || '관리자'}님
          </span>
          <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
            관리자 권한
          </span>
        </div>
        <p className="text-blue-100">
          관리자 전용 기능들을 카테고리별로 정리했습니다. 탭을 클릭하여 원하는 기능을 선택하세요! 🛠️
        </p>
      </div>

      {/* 탭 메뉴 */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {(['match', 'member', 'club', 'system'] as const).map((category) => (
              <button
                key={category}
                onClick={() => setActiveTab(category)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === category
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {getCategoryTitle(category)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 메뉴 카드들 (클릭 시 해당 경로로 이동) */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">{getCategoryTitle(activeTab)}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeMenus.map((card) => {
            const colorClasses = getColorClasses(card.color);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => router.push(card.path)}
                className={`p-5 rounded-lg border-2 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer transform hover:scale-105 focus:outline-none ${
                  colorClasses.bg
                } ${colorClasses.hover} ${colorClasses.border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{card.icon}</div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${colorClasses.badge}`}>
                    관리자 전용
                  </div>
                </div>
                <h4 className={`text-base font-semibold mb-2 ${colorClasses.text}`}>{card.name}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 빠른 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-800">경기 관리</h3>
          <p className="text-lg font-bold text-blue-600">
            {ADMIN_MENU_CARDS.filter(m => m.category === 'match').length}개 기능
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="text-sm font-semibold text-green-800">회원 관리</h3>
          <p className="text-lg font-bold text-green-600">
            {ADMIN_MENU_CARDS.filter(m => m.category === 'member').length}개 기능
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <h3 className="text-sm font-semibold text-purple-800">클럽 운영</h3>
          <p className="text-lg font-bold text-purple-600">
            {ADMIN_MENU_CARDS.filter(m => m.category === 'club').length}개 기능
          </p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <h3 className="text-sm font-semibold text-orange-800">시스템 관리</h3>
          <p className="text-lg font-bold text-orange-600">
            {ADMIN_MENU_CARDS.filter(m => m.category === 'system').length}개 기능
          </p>
        </div>
      </div>

      {/* 관리자 권한 안내 */}
      <div className="p-6 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg shadow-sm">
        <div className="flex items-center mb-3">
          <div className="text-2xl mr-3">🛡️</div>
          <h3 className="text-red-800 font-semibold text-lg">관리자 권한 안내</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-red-700 text-sm">
          <div className="space-y-2">
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>경기 일정을 생성하고 관리할 수 있습니다</p>
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>회원 정보와 권한을 관리할 수 있습니다</p>
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>모든 경기 결과와 출석 현황을 확인할 수 있습니다</p>
          </div>
          <div className="space-y-2">
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>시스템의 모든 기능에 접근할 수 있습니다</p>
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>클럽 운영과 관련된 모든 데이터를 관리합니다</p>
            <p className="flex items-center"><span className="text-red-500 mr-2">•</span>각 카테고리별로 필요한 기능을 선택하여 사용하세요</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 관리자 권한 래핑
export default function ProtectedAdminPage() {
  return (
    <RequireAdmin>
      <AdminMenuPage />
    </RequireAdmin>
  );
}