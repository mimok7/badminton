'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  X
} from 'lucide-react';

type TabType = 'dashboard' | 'exchange' | 'scoreboard' | 'register' | 'profile';

export default function ManualPage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: '대시보드 & 출석', icon: Calendar, color: 'text-blue-500 bg-blue-50 hover:bg-blue-100/70' },
    { id: 'exchange', label: '코인 & 상품교환', icon: Coins, color: 'text-amber-500 bg-amber-50 hover:bg-amber-100/70' },
    { id: 'scoreboard', label: '실시간 점수판', icon: Tv, color: 'text-rose-500 bg-rose-50 hover:bg-rose-100/70' },
    { id: 'register', label: '경기 참가신청', icon: ClipboardList, color: 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100/70' },
    { id: 'profile', label: '프로필 & 레벨', icon: User, color: 'text-purple-500 bg-purple-50 hover:bg-purple-100/70' },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-gray-50 to-blue-50/30 pb-16">
      {/* 프리미엄 헤더 영역 */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-8 px-6 shadow-md select-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-black/10 rounded-full blur-2xl -ml-20 -mb-20"></div>
        
        <div className="relative max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 bg-white/20 w-fit px-3 py-0.5 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur-sm">
              <Sparkles className="size-3" /> SYSTEM GUIDE
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              🏸 배드민턴 시스템 안내서
            </h1>
          </div>
          <Link 
            href="/dashboard" 
            className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-full px-4 py-2 text-xs font-semibold tracking-wide border border-white/20 backdrop-blur-sm transition-all shadow-sm shrink-0 w-fit"
          >
            <ArrowLeft className="size-3.5" /> 대시보드로 돌아가기
          </Link>
        </div>
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
          현재: {menuItems.find(item => item.id === activeTab)?.label}
        </span>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 가이드 목차 (PC에서는 상시 노출, 모바일에서는 토글 상태에 따라 노출) */}
          <div className={`lg:col-span-4 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2.5 sticky top-20 z-30 lg:z-10 ${
            isMenuOpen ? 'block' : 'hidden lg:block'
          }`}>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">가이드 목차</h2>
            <div className="space-y-1">
              {menuItems.map((item) => {
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

          </div>

        </div>
      </div>
    </div>
  );
}
