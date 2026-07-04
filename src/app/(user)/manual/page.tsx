'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  BookOpen, 
  Calendar, 
  Coins, 
  Tv, 
  ClipboardList, 
  User, 
  Info, 
  Sparkles,
  ChevronRight,
  Menu,
  X,
  Bell,
  Zap,
  Swords,
  CalendarDays,
  Trophy,
  MessageSquarePlus
} from 'lucide-react';

import { useUser } from '@/hooks/useUser';

type TabType = 'dashboard' | 'notifications' | 'challenge' | 'today-matches' | 'register' | 'my-schedule' | 'scoreboard' | 'profile' | 'tournament-bracket' | 'exchange' | 'app-request'
  | 'admin-players-today' | 'admin-match-results' | 'admin-team-management' | 'admin-tournament-matches' | 'admin-pair-tournament-settings' | 'admin-tournament-bracket' | 'admin-members' | 'admin-notifications';

export default function ManualPage() {
  const { profile } = useUser();
  const [guideMode, setGuideMode] = useState<'user' | 'admin'>('user');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';

  const menuItems = [
    { id: 'dashboard', label: '대시보드 & 출석', icon: Calendar, color: 'text-blue-500 bg-blue-50 hover:bg-blue-100/70' },
    { id: 'notifications', label: '공지사항 & 알림', icon: Bell, color: 'text-orange-500 bg-orange-50 hover:bg-orange-100/70' },
    { id: 'challenge', label: '게임 제안', icon: Zap, color: 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100/70' },
    { id: 'today-matches', label: '오늘 게임', icon: Swords, color: 'text-sky-500 bg-sky-50 hover:bg-sky-100/70' },
    { id: 'register', label: '경기 참가신청', icon: ClipboardList, color: 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100/70' },
    { id: 'my-schedule', label: '내 게임 (일정)', icon: CalendarDays, color: 'text-teal-500 bg-teal-50 hover:bg-teal-100/70' },
    { id: 'scoreboard', label: '실시간 점수판', icon: Tv, color: 'text-rose-500 bg-rose-50 hover:bg-rose-100/70' },
    { id: 'profile', label: '프로필 & 회원목록', icon: User, color: 'text-purple-500 bg-purple-50 hover:bg-purple-100/70' },
    { id: 'tournament-bracket', label: '대회 대진표', icon: Trophy, color: 'text-indigo-500 bg-indigo-50 hover:bg-indigo-100/70' },
    { id: 'exchange', label: '코인 & 상품교환', icon: Coins, color: 'text-amber-500 bg-amber-50 hover:bg-amber-100/70' },
    { id: 'app-request', label: '앱 수정 요청', icon: MessageSquarePlus, color: 'text-pink-500 bg-pink-50 hover:bg-pink-100/70' },
  ] as const;

  const adminMenuItems = [
    { id: 'admin-players-today', label: '⚡ 오늘 경기 관리', icon: Swords, color: 'text-sky-500 bg-sky-50 hover:bg-sky-100/70' },
    { id: 'admin-match-results', label: '🏆 게임 결과 조회', icon: Trophy, color: 'text-rose-500 bg-rose-50 hover:bg-rose-100/70' },
    { id: 'admin-team-management', label: '🤝 대회 팀 관리', icon: User, color: 'text-orange-500 bg-orange-50 hover:bg-orange-100/70' },
    { id: 'admin-tournament-matches', label: '🎪 대회 일정 관리', icon: CalendarDays, color: 'text-indigo-500 bg-indigo-50 hover:bg-indigo-100/70' },
    { id: 'admin-pair-tournament-settings', label: '👥 페어 대회 설정', icon: ClipboardList, color: 'text-teal-500 bg-teal-50 hover:bg-teal-100/70' },
    { id: 'admin-tournament-bracket', label: '📊 대회 대진표', icon: Tv, color: 'text-purple-500 bg-purple-50 hover:bg-purple-100/70' },
    { id: 'admin-members', label: '👥 회원 정보 운영', icon: User, color: 'text-blue-500 bg-blue-50 hover:bg-blue-100/70' },
    { id: 'admin-notifications', label: '📢 공지사항 발송', icon: Bell, color: 'text-pink-500 bg-pink-50 hover:bg-pink-100/70' },
  ] as const;

  const currentMenuItems = guideMode === 'admin' ? adminMenuItems : menuItems;

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-gray-50 to-blue-50/30 pb-16">
      {/* ── 다크 그라디언트 헤더 ── */}
      <div className="max-w-6xl mx-auto px-2.5 mt-0">
        <section className="relative overflow-hidden rounded-[24px] bg-[#0f172a] px-4 py-4 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between px-1">
            <div className="space-y-0.5 pl-2">
              <h1 className="text-xl font-bold tracking-tight">사용 설명서</h1>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">시스템 기능 및 이용 안내 가이드를 확인합니다.</p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" className="rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/15 border-0 flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                홈
              </Button>
            </Link>
          </div>
        </section>
      </div>

      {/* 모바일 전용 상단 메뉴 토글 바 */}
      <div className="lg:hidden bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-2.5 sticky top-0 z-40 shadow-sm flex items-center justify-between">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/60 transition-colors cursor-pointer"
        >
          {isMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          <span>목차 {isMenuOpen ? '닫기' : '열기'}</span>
        </button>
        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100/50">
          현재: {currentMenuItems.find(item => item.id === activeTab)?.label}
        </span>
      </div>

      <div className="max-w-6xl mx-auto px-2.5 mt-4 sm:mt-6">
        {isAdminOrManager && (
          <div className="flex bg-slate-200/60 p-0.5 rounded-xl max-w-[280px] mx-auto mb-4 border border-slate-300/30">
            <button
              onClick={() => {
                setGuideMode('user');
                setActiveTab('dashboard');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                guideMode === 'user'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👤 사용자 가이드
            </button>
            <button
              onClick={() => {
                setGuideMode('admin');
                setActiveTab('admin-players-today');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                guideMode === 'admin'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ⚙️ 관리자 가이드
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 가이드 목차 (PC에서는 상시 노출, 모바일에서는 토글 상태에 따라 노출) */}
          <div className={`lg:col-span-4 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2.5 sticky top-20 z-30 lg:z-10 ${
            isMenuOpen ? 'block' : 'hidden lg:block'
          }`}>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">가이드 목차</h2>
            <div className="space-y-1">
              {currentMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMenuOpen(false); // 항목 선택 시 모바일 메뉴 자동 숨김
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10 translate-x-1' 
                        : 'text-slate-600 hover:text-slate-900 ' + item.color
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-white/20 text-white' : ''}`}>
                        <Icon className="size-4" />
                      </div>
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className={`size-3.5 opacity-50 transition-transform ${isActive ? 'rotate-90 text-white' : ''}`} />
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <a 
                href="/user_manual.md" 
                download="user_manual.md"
                className="inline-flex items-center justify-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-semibold px-4 py-2 rounded-lg bg-blue-50/50 hover:bg-blue-50 transition-colors w-full"
              >
                📥 원본 마크다운 파일 받기
              </a>
            </div>
          </div>

          {/* 우측 가이드 상세 영역 */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* 1. 대시보드 및 출석 체크 */}
            {activeTab === 'dashboard' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Calendar className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-blue-600 font-semibold uppercase tracking-wider">SECTION 01</span>
                    <h3 className="text-2xl font-bold text-slate-800">대시보드 및 출석 체크</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  로그인 후 가장 먼저 만나는 화면으로, 오늘의 모임 현황을 확인하고 본인의 출석 상태를 신속히 업데이트할 수 있습니다.
                </p>

                <div className="space-y-4 mb-6">
                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="text-xl shrink-0">📊</span>
                    <div>
                      <h4 className="font-bold text-slate-800">실시간 출석 현황</h4>
                      <p className="text-sm text-slate-600 mt-1">오늘 참석하는 선수들의 전체 인원수와 레벨별 명단을 한눈에 볼 수 있습니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="text-xl shrink-0">✅</span>
                    <div>
                      <h4 className="font-bold text-slate-800">나의 출석 등록</h4>
                      <p className="text-sm text-slate-600 mt-1">오늘 모임에 대해 본인의 상태를 세 가지 중 하나로 선택할 수 있습니다.</p>
                      <div className="flex gap-2 mt-3.5">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">출석 (경기 참여)</span>
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">레슨 (코치 지도)</span>
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">퇴근/불참</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="text-xl shrink-0">⏰</span>
                    <div>
                      <h4 className="font-bold text-slate-800">오늘의 경기 알림</h4>
                      <p className="text-sm text-slate-600 mt-1">본인이 배정받은 경기가 생기면 대시보드 최상단에 배정 시간과 코트 번호가 포함된 매치 카드가 실시간으로 활성화됩니다.</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 text-blue-800 text-sm">
                  <Info className="size-5 shrink-0 text-blue-600 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>꿀팁:</strong> 출석 체크 상태는 언제든지 바꿀 수 있습니다. 공정한 경기 배정을 위해 모임 시작 전까지 반드시 상태를 출석이나 레슨 등으로 업데이트해 주세요!
                  </p>
                </div>
              </div>
            )}

            {/* 공지사항 & 알림 */}
            {activeTab === 'notifications' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                    <Bell className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-orange-600 font-semibold uppercase tracking-wider">SECTION 02</span>
                    <h3 className="text-2xl font-bold text-slate-800">공지사항 & 알림</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  관리자가 전하는 클럽의 중요 공지사항과 본인 계정에 전달된 실시간 활동 알림들을 신속하게 확인하는 메뉴입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📌 클럽 공지사항</h4>
                    <p className="text-sm text-slate-600 mt-1">대회 일정, 규칙 변경, 회비 안내 등 클럽 전체에 전파되는 포스트가 상단에 강조 표시됩니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🔔 내 개인 활동 알림</h4>
                    <p className="text-sm text-slate-600 mt-1">타 회원이 보낸 게임 제안, 나의 출석 배정 확인 등 본인과 직접 관련된 중요 알림의 히스토리가 기록됩니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 게임 제안 */}
            {activeTab === 'challenge' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-yellow-50 text-yellow-600 rounded-2xl">
                    <Zap className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-yellow-600 font-semibold uppercase tracking-wider">SECTION 03</span>
                    <h3 className="text-2xl font-bold text-slate-800">게임 제안</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  선수들과 짝을 이루어 상대 복식조에게 원하는 매치 조건을 실시간으로 제안하고 신청하는 화면입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">⚔️ 매치 메이킹</h4>
                    <p className="text-sm text-slate-600 mt-1">나와 함께 뛸 파트너 1명과 상대팀 복식조 2명을 지목해 경기 신청을 보냅니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">💬 드롭다운 한마디 메시지</h4>
                    <p className="text-sm text-slate-600 mt-1">"한판 붙으시죠!", "살살 부탁드립니다!" 등 자주 사용하는 매치 템플릿 문구를 드롭다운에서 선택해 빠른 메시지 전송이 가능합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🏷️ 상대방 응답 배지화</h4>
                    <p className="text-sm text-slate-600 mt-1">제안을 받은 상대방의 실시간 응답 상태(수락, 보류, 대기)가 이름 바로 옆에 알록달록한 전용 색상 배지 형태로 표시됩니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 오늘 게임 */}
            {activeTab === 'today-matches' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
                    <Swords className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-sky-600 font-semibold uppercase tracking-wider">SECTION 04</span>
                    <h3 className="text-2xl font-bold text-slate-800">오늘 게임</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  오늘 모임의 코트 배정 상태와 대기 중인 경기 스케줄을 실시간으로 확인하는 페이지입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🏟️ 코트별 매치 조회</h4>
                    <p className="text-sm text-slate-600 mt-1">1코트, 2코트 등 각 코트에서 어떤 매치가 대기 중인지 혹은 종료되었는지 목록을 일목요연하게 제공합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">👤 선수 정보 표기</h4>
                    <p className="text-sm text-slate-600 mt-1">대진표에 명시된 선수들의 이름과 함께, 현재 소지하고 있는 게임 코인 잔액 및 실력 등급이 실시간 갱신되어 보입니다.</p>
                  </div>
                </div>
              </div>
            ) /* Keep the original sections following this */}

            {/* 2. 사용자 코인 및 상품 교환 */}
            {activeTab === 'exchange' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                    <Coins className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-amber-600 font-semibold uppercase tracking-wider">SECTION 02</span>
                    <h3 className="text-2xl font-bold text-slate-800">사용자 코인 및 상품 교환</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  모임 참여와 코트 활동을 통해 획득한 코인을 사용하여 클럽에서 제공하는 실물 상품(그립, 양말 등)으로 직접 교환할 수 있습니다.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-5 border border-gray-100 rounded-2xl bg-slate-50/60">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🪙</span>
                      <h4 className="font-bold text-slate-800">코인 적립 & 조회</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      정기 모임 출석, 경기 승패 예측 참여, 혹은 관리자 보상 등을 통해 코인을 적립합니다. 대시보드 상단이나 프로필 영역에서 잔액을 실시간으로 확인해 보세요!
                    </p>
                  </div>

                  <div className="p-5 border border-gray-100 rounded-2xl bg-slate-50/60">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🎁</span>
                      <h4 className="font-bold text-slate-800">상품 교환 방법</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      메뉴에서 <strong>[상품 교환]</strong>으로 이동한 뒤, 원하는 상품 카드의 <strong>[교환 신청]</strong>을 누르면 코인이 차감됩니다. 수령 시 관리자에게 <strong>구매 이력</strong>을 보여주시면 됩니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 실시간 심판 점수판 및 관전 */}
            {activeTab === 'scoreboard' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                    <Tv className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-rose-600 font-semibold uppercase tracking-wider">SECTION 03</span>
                    <h3 className="text-2xl font-bold text-slate-800">실시간 심판 점수판 및 관전</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  경기의 실시간 스코어보드를 보거나 점수를 기입하는 시스템입니다. 매치 배정 상태에 맞춰 심판 권한 혹은 관전자 모드로 레이아웃이 자동 조정됩니다.
                </p>

                <div className="space-y-4">
                  <div className="p-5 border border-gray-100 rounded-2xl bg-slate-50">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded">JUDGE</span>
                      <h4 className="font-bold text-slate-800">심판 모드 (점수 입력)</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      본인이 경기의 <strong>심판(Referee)</strong>으로 지정되었거나 관리자 권한을 가졌다면 스코어를 탭하여 실시간으로 점수를 변경할 수 있는 전용 컨트롤러가 제공됩니다. 경기가 끝나고 저장하면 승패 기록이 통계에 자동 산출됩니다.
                    </p>
                  </div>

                  <div className="p-5 border border-gray-100 rounded-2xl bg-slate-50">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded">LIVE</span>
                      <h4 className="font-bold text-slate-800">관전 모드 (🔴 LIVE 보기)</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      심판이 아닌 일반 회원이 접속하면 자동으로 <strong>읽기 전용 관전 모드</strong>로 켜집니다. 실시간 통계 및 실시간 점수 변동(Supabase Realtime) 기술이 탑재되어, 심판이 입력하는 점수 현황이 초 단위로 본인 기기에 자동 갱신되어 관전할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. 경기 참가 신청 */}
            {activeTab === 'register' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <ClipboardList className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">SECTION 04</span>
                    <h3 className="text-2xl font-bold text-slate-800">경기 참가 신청</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  정기적 모임 이외에 특별 이벤트나 개별적으로 생성된 경기에 미리 참가 예약을 신청하는 메뉴입니다.
                </p>

                <div className="bg-slate-50 border border-gray-100 rounded-2xl p-5 mb-4">
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">🕹️ 참가 신청 흐름</h4>
                  <ol className="space-y-3 text-sm text-slate-600">
                    <li className="flex gap-2">
                      <span className="font-bold text-emerald-600">1.</span>
                      <span>메뉴 혹은 대시보드에서 <strong>참가 신청</strong>으로 이동합니다.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-emerald-600">2.</span>
                      <span>상세 정보(날짜, 시간, 장소, 정원 등)를 꼼꼼히 체크합니다.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-emerald-600">3.</span>
                      <span>원하는 일정 우측의 <strong>[참가 신청]</strong> 버튼을 누르면 접수 완료됩니다.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-emerald-600">4.</span>
                      <span>정원이 초과된 경우 자동으로 <strong>대기자</strong>로 넘어가며, 선순위 취소자가 나오면 참석자로 자동 변경됩니다.</span>
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* 내 게임 */}
            {activeTab === 'my-schedule' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
                    <CalendarDays className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-teal-600 font-semibold uppercase tracking-wider">SECTION 06</span>
                    <h3 className="text-2xl font-bold text-slate-800">내 게임 (일정)</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  오늘 내 게임의 현황을 보여주고 점수 입력 및 코인배팅을 진행하며, 본인의 과거 경기 기록과 개인 성적 지표를 대시보드 형태로 종합하여 조회하는 메뉴입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🔥 오늘 내 게임 현황 & 배팅</h4>
                    <p className="text-sm text-slate-600 mt-1">오늘 예정된 내 게임 일정을 실시간 확인하고, 직접 스코어 점수를 기입하거나 게임 코인 배팅을 걸어 매치를 더욱 흥미진진하게 즐길 수 있습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📈 개인 통계 요약</h4>
                    <p className="text-sm text-slate-600 mt-1">총 게임 횟수, 승률, 누적 승리 수 및 스코어 득실차를 종합 분석하여 통계 수치로 알려줍니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📜 과거 이력 목록</h4>
                    <p className="text-sm text-slate-600 mt-1">그동안 누구와 파트너가 되어 누구를 상대로 몇 대 몇으로 이겼거나 졌는지 타임라인 형태로 세세히 확인할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 5. 프로필 및 레벨 관리 */}
            {activeTab === 'profile' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                    <User className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-purple-600 font-semibold uppercase tracking-wider">SECTION 05</span>
                    <h3 className="text-2xl font-bold text-slate-800">프로필 및 레벨 관리</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  본인의 계정 및 배드민턴 실력 등급(Level)을 조회하고 업데이트하는 구간입니다.
                </p>

                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">🥩 클럽 실력 등급 체계</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🦞 최상위 등급</span>
                    <span className="text-sm font-bold text-slate-800">랍스터 (A1~A3)</span>
                  </div>
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🥩 상급 등급</span>
                    <span className="text-sm font-bold text-slate-800">소갈비 (B1~B3)</span>
                  </div>
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🐷 중상급 등급</span>
                    <span className="text-sm font-bold text-slate-800">돼지갈비 (C1~C3)</span>
                  </div>
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🐑 중급 등급</span>
                    <span className="text-sm font-bold text-slate-800">양갈비 (D1~D3)</span>
                  </div>
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🍳 초급 등급</span>
                    <span className="text-sm font-bold text-slate-800">닭갈비 (E1~E3)</span>
                  </div>
                  <div className="p-3 border border-purple-100 rounded-xl bg-purple-50/20 text-center">
                    <span className="text-xs text-purple-600 font-bold block mb-1">🐣 입문 & 미지정</span>
                    <span className="text-sm font-bold text-slate-800">미설정 (N1~N3)</span>
                  </div>
                </div>

                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex gap-3 text-purple-800 text-sm">
                  <Info className="size-5 shrink-0 text-purple-600 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>중요:</strong> 기재된 등급은 시스템 경기 매치메이킹 알고리즘이 팀 밸런스를 계산하는 중요한 기준이 됩니다. 승급 또는 등급의 오차가 있을 시 프로필 수정에서 즉시 반영해주셔야 원활한 밸런스로 경기가 배정됩니다.
                  </p>
                </div>
              </div>
            )}

            {/* 대회 대진표 */}
            {activeTab === 'tournament-bracket' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Trophy className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">SECTION 09</span>
                    <h3 className="text-2xl font-bold text-slate-800">대회 대진표</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  클럽에서 주최하는 공식/비공식 대회의 진행 흐름과 토너먼트 진출 현황을 파악하는 페이지입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🏆 토너먼트 브라켓 뷰</h4>
                    <p className="text-sm text-slate-600 mt-1">좌우 스크롤 구조로 결승전까지의 진출 라인을 그래픽 구조로 쉽게 볼 수 있습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">💥 실시간 경기 결과 반영</h4>
                    <p className="text-sm text-slate-600 mt-1">경기가 끝나는 대로 승리한 팀의 이름이 대진표 상위 브랜치로 자동 이동하고 결과 스코어가 표기됩니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 앱 수정 요청 */}
            {activeTab === 'app-request' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl">
                    <MessageSquarePlus className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-pink-600 font-semibold uppercase tracking-wider">SECTION 11</span>
                    <h3 className="text-2xl font-bold text-slate-800">앱 수정 요청</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  시스템 오작동 버그나 유용한 기능 건의 사항이 있을 때 관리자에게 피드백을 전달하는 소통 공간입니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📂 구체적 분류 및 대상 메뉴 지정</h4>
                    <p className="text-sm text-slate-600 mt-1">오류 종류와 해당되는 메뉴명을 드롭다운에서 정확하게 선택함으로써, 문제 위치를 명확하게 알릴 수 있습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📋 상세 내용 복사 버튼</h4>
                    <p className="text-sm text-slate-600 mt-1">상세내용 박스 우측 상단의 클립보드 아이콘을 탭하여, 기재된 텍스트 전체를 쉽게 복사하여 카카오톡 등에 전달할 수 있습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">⚡ 실시간 관리자 알림 자동 연동</h4>
                    <p className="text-sm text-slate-600 mt-1">작성을 완료하여 요청을 전송하면, 담당 개발자 겸 관리자 "김진호"님의 기기로 즉시 실시간 알림이 자동 전송되어 즉각적인 확인을 돕습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 12. 오늘 경기 관리 */}
            {activeTab === 'admin-players-today' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
                    <Swords className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-sky-600 font-semibold uppercase tracking-wider">ADMIN SECTION 01</span>
                    <h3 className="text-2xl font-bold text-slate-800">오늘 경기 생성 및 배정</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  오늘 정기 모임에 참석한 선수들의 출석 체크 데이터를 기반으로 게임을 유연하게 자동 또는 수동 생성 및 배정합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📊 1인당 목표 경기수 설정</h4>
                    <p className="text-sm text-slate-600 mt-1">1~3경기 중 원하는 게임 수를 지정하면 전원 고르게 게임을 돌 수 있도록 적합한 대진 알고리즘이 예상 경기수를 계산합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🎯 세분화된 경기 생성 방식</h4>
                    <p className="text-sm text-slate-600 mt-1"><strong>레벨별 경기:</strong> 동등한 수준의 파트너 매칭<br/><strong>랜덤 경기:</strong> 무작위 혼합 복식 구성<br/><strong>혼합복식:</strong> 성별 밸런스를 조정한 남녀 매칭<br/><strong>수동 배정:</strong> 직접 빈칸에 선수를 커스텀 배치</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">✨ 즉시 배정 및 초기화</h4>
                    <p className="text-sm text-slate-600 mt-1">대기 목록이 생성되면 하단의 버튼을 통해 실시간 코트 슬롯에 즉각 배정하거나, 맘에 안 들 경우 경기를 초기화하고 재배정할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 13. 게임 결과 조회 */}
            {activeTab === 'admin-match-results' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                    <Trophy className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-rose-600 font-semibold uppercase tracking-wider">ADMIN SECTION 02</span>
                    <h3 className="text-2xl font-bold text-slate-800">게임 결과 조회</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  오늘 배정되어 기록 완료된 경기들의 종합 및 세부 스코어 보드를 조회합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">👁️ 모바일 조회 전용 모드</h4>
                    <p className="text-sm text-slate-600 mt-1">모바일 화면의 번거로운 입력을 없애기 위해 결과 조회 전용 텍스트 방식으로 고안되었습니다. 모바일에서는 점수 수정이나 저장 버튼이 숨김 처리되어 데이터 안전성을 확보합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🔢 깔끔한 정수형 표기</h4>
                    <p className="text-sm text-slate-600 mt-1">불필요한 소수점을 제거하여 스코어판을 깔끔한 정수 형식으로만 한눈에 확인하도록 지원합니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 14. 대회 팀 관리 */}
            {activeTab === 'admin-team-management' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                    <User className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-orange-600 font-semibold uppercase tracking-wider">ADMIN SECTION 03</span>
                    <h3 className="text-2xl font-bold text-slate-800">대회 팀 관리</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  클럽 내 자체 대회나 토너먼트에 출전할 팀(복식 페어) 조합을 등록하고 관리합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">👥 페어 빌더 및 등록</h4>
                    <p className="text-sm text-slate-600 mt-1">두 명의 선수를 선택하여 하나의 고유 팀으로 등록합니다. 등록된 팀은 대회 경기 조편성이나 토너먼트 시드의 최소 단위가 됩니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🗑️ 팀 리스트 정비</h4>
                    <p className="text-sm text-slate-600 mt-1">등록된 복식 페어를 삭제하거나, 재구성 시 기존 팀 리스트를 정비할 수 있는 관리 도구입니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 15. 대회 일정 관리 */}
            {activeTab === 'admin-tournament-matches' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <CalendarDays className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">ADMIN SECTION 04</span>
                    <h3 className="text-2xl font-bold text-slate-800">대회 경기 및 일정 관리</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  토너먼트나 예선 리그 형식의 자체 대회를 개최하고, 회차별 일정을 코트에 투입하여 진행합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🏆 리그 / 토너먼트 셋업</h4>
                    <p className="text-sm text-slate-600 mt-1">대회 성격에 맞게 리그전이나 토너먼트 형식으로 단판 또는 다전제 매치들을 생성할 수 있습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🏟️ 코트 실시간 배정</h4>
                    <p className="text-sm text-slate-600 mt-1">생성된 경기 중 현재 빈 코트가 생기면 즉각 투입하여 실시간 상태를 '진행중'으로 변경하고 시간 및 점수를 모니터링합니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 16. 페어 대회 설정 */}
            {activeTab === 'admin-pair-tournament-settings' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
                    <ClipboardList className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-teal-600 font-semibold uppercase tracking-wider">ADMIN SECTION 05</span>
                    <h3 className="text-2xl font-bold text-slate-800">페어 대회 설정</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  선수들 간의 복식 페어를 조합하고 그룹화하여 레벨 격차가 없는 공정한 자체 대회를 조율합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">⚖️ 핸디캡 및 레벨 밸런싱</h4>
                    <p className="text-sm text-slate-600 mt-1">선수별 등급(A/B/C)이나 코인 가중치 데이터 등을 계산하여 복식 조합 간 팽팽한 대진이 나오도록 설정합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📅 조 편성 및 라운드 생성</h4>
                    <p className="text-sm text-slate-600 mt-1">대회 예선 진행을 위한 하위 그룹 조(A조, B조 등)를 신속하게 편성하고 경기 생성 마법사를 가동합니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 17. 대회 대진표 */}
            {activeTab === 'admin-tournament-bracket' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                    <Tv className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-purple-600 font-semibold uppercase tracking-wider">ADMIN SECTION 06</span>
                    <h3 className="text-2xl font-bold text-slate-800">대회 대진표 (브라켓)</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  현재 진행 중인 토너먼트의 전반적인 상황판 및 승자/패자조 흐름을 시각적 트리 형태로 한눈에 보여줍니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">📊 비주얼 브라켓 구성</h4>
                    <p className="text-sm text-slate-600 mt-1">16강, 8강, 준결승, 결승전으로 흐르는 토너먼트 트리를 렌더링하여 관중이나 대기 선수들이 진행률을 쉽게 인지하게 돕습니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🔄 실시간 스코어 연동</h4>
                    <p className="text-sm text-slate-600 mt-1">대회 경기가 끝나는 즉시 상위 시드로 자동 승자가 올라가며 대진 상태가 리프레시됩니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 18. 회원 정보 운영 */}
            {activeTab === 'admin-members' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <User className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-blue-600 font-semibold uppercase tracking-wider">ADMIN SECTION 07</span>
                    <h3 className="text-2xl font-bold text-slate-800">회원 정보 및 권한 운영</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  가입된 회원 리스트를 통합 관리하고 레벨 등 주요 정보 수정 및 새로운 회원을 등록합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🔑 등급(레벨) 및 정보 일체 변경</h4>
                    <p className="text-sm text-slate-600 mt-1">회원의 성별, 배드민턴 실력 등급(A1~N1) 정보를 수정합니다. 레벨은 경기 대진 생성 시 평균 밸런싱의 핵심 팩터로 동작하므로 주기적 관리가 중요합니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🛡️ 매니저 권한 이양</h4>
                    <p className="text-sm text-slate-600 mt-1">일반 회원(user)에게 매니저(manager) 지위를 할당하여 공동으로 대진표 생성 및 결과 관리를 수행하도록 역할을 양도할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 19. 공지사항 발송 */}
            {activeTab === 'admin-notifications' && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md animate-fadeIn">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                  <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl">
                    <Bell className="size-6" />
                  </div>
                  <div>
                    <span className="text-xs text-pink-600 font-semibold uppercase tracking-wider">ADMIN SECTION 08</span>
                    <h3 className="text-2xl font-bold text-slate-800">공지사항 및 알림 발송</h3>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">
                  클럽 소식 및 급한 공지를 전체 또는 대상 집단을 선별하여 발송하고, 읽음 여부를 실시간 추적합니다.
                </p>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🎯 다양한 알림 타겟팅</h4>
                    <p className="text-sm text-slate-600 mt-1">전체 회원, 남성 회원, 여성 회원 등 대상별 맞춤 발송을 지원하며, 일반 알림, 경기 결과, 시스템 알림 등으로 타입을 구분하여 시인성을 높입니다.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800">🗳️ 투표 및 설문조사 발송</h4>
                    <p className="text-sm text-slate-600 mt-1">의견을 수렴할 수 있는 선착순 제한 및 다지선다 형태의 설문을 즉각 구성하여 투표를 진행하고 CSV 형태로 투표결과를 다운로드할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
