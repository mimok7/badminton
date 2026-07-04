---
name: badminton-user-app-design
description: 사용자 앱(src/app/(user)/*)의 UI/UX 디자인 일관성 유지 및 스타일 통일 지침
---

# 사용자 앱 디자인 통일 지침 (Badminton User App Design Guidelines)

이 스킬은 배드민턴 클럽 관리 시스템의 사용자 인터페이스([src/app/(user)](file:///C:/Users/tvxqc/Documents/antigravity/intelligent-mendel/src/app/(user)))를 개발하거나 수정할 때, **기존의 핵심 기능(로직)은 유지하면서 디자인과 레이아웃 스타일을 일관되게 통일**하기 위한 규칙을 정의합니다.

## 🎨 1. 핵심 디자인 시스템 및 클래스 표준

디자인 통일성을 위해 [globals.css](file:///C:/Users/tvxqc/Documents/antigravity/intelligent-mendel/src/app/globals.css)에 선언된 공통 레이아웃 클래스를 반드시 적용해야 합니다.

### 1-1. 페이지 레이아웃 클래스
- **전체 배경 (`.app-surface`)** - 페이지의 최상위 컨테이너에 적용하여 부드러운 블루 그라데이션 배경을 유지합니다.
  ```tsx
  <div className="app-surface">...</div>
  ```
- **페이지 규격 (`.app-page`, `.app-page-wide`)** - 가로폭 제한 및 패딩 규격을 일치시킵니다.
  ```tsx
  <div className="app-page app-page-wide">...</div>
  ```
- **헤더 카드 (`.app-page-header`)** - 페이지 상단 제목 영역에 블러 효과가 적용된 카드 배경을 사용합니다.
  - 제목은 `.app-page-title`을 사용합니다.
  - 설명글은 `.app-page-description`을 사용합니다.
- **섹션/콘텐츠 카드 (`.app-section-card`)** - 본문 내용을 담는 카드에 둥근 모서리(`rounded-[24px]`)와 부드러운 그림자를 설정합니다.

### 1-2. 공통 UI 컴포넌트
- **버튼 (`@/components/ui/button`)** - HTML 기본 `<button>` 대신 프로젝트에서 정의한 [Button](file:///C:/Users/tvxqc/Documents/antigravity/intelligent-mendel/src/components/ui/button.tsx) 컴포넌트를 사용하여 형태와 액션 스타일을 맞춥니다.
- **입력 폼 (`@/components/ui/input`)** - 사용자 입력창 스타일을 통일합니다.

---

## 📱 2. 모바일 최적화 규칙

이 앱은 모바일 기기에서의 사용성이 매우 중요합니다. 모바일 가독성을 극대화하기 위해 다음 규칙을 적용합니다.

- **컨테이너 패딩 최소화** - 모바일 화면(`max-width: 640px`)에서는 카드 내부 좌우 패딩을 줄여서 콘텐츠 노출 영역을 최대로 확보합니다.
- **컴팩트한 간격** - 모바일 화면에서 요소 간 마진/갭을 좁게 유지합니다 (`gap: 0.5rem` 또는 `space-y-2`).
- **터치 영역 보장** - 버튼 및 입력 필드의 최소 높이는 `2.5rem (40px)` 이상으로 설정하여 터치 오작동을 방지합니다.

---

## 🔒 3. 기능 보존 원칙 (Critical Rule)

디자인을 통일할 때 기존의 기능이 비활성화되거나 에러가 발생하는 것을 절대적으로 방지해야 합니다.

- **상태 관리 유지** - `useState`, `useEffect`, `useRouter`, `useUser` 등 기존 상태 관리와 페이지 로드 시의 데이터 호출(API 통신 및 Supabase 쿼리) 로직은 **원래 코드의 흐름을 100% 동일하게 유지**합니다.
- **의존성 배열 확인** - `useEffect`의 의존성 배열(`[]`)을 수정하여 불필요한 무한 렌더링이 발생하지 않도록 주의합니다.
- **액션 연결 유지** - 버튼의 `onClick`, `onSubmit` 핸들러 등의 바인딩이 누락되지 않도록 검증합니다.

---

## 🌐 4. 다국어 및 한글화 텍스트 규칙

- **100% 한국어 적용** - 사용자 앱에 노출되는 모든 라벨, 경고 메시지, 로딩 텍스트는 한국어를 최우선으로 적용합니다.
- **한국어 문장 종결 부호** - 한국어 문장 끝에는 콜론(`:`)을 사용하지 않으며, 반드시 마침표(`.`), 물음표(`?`), 느낌표(`!`)로 문장을 끝마칩니다.

---

## 🏛️ 5. 공통 헤더 카드 디자인 표준 (Header Card Standard)

사용자가 대시보드에서 각 메뉴로 진입했을 때 보여지는 상단의 **히어로/헤더 카드 영역은 통일된 레이아웃과 배치를 사용해야 합니다.** 이를 통해 전체적인 UI 흐름의 일치감과 프리미엄 느낌을 극대화합니다.

### 5-1. 헤더 카드 구조 및 CSS 클래스 정의
헤더 영역은 다음 규격의 다크 테마 카드 구조를 반드시 준수합니다.
```tsx
<section className="relative overflow-hidden rounded-[24px] bg-[#0f172a] px-4 py-4 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)]">
  {/* 배경 그라디언트 효과 */}
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
  
  <div className="relative z-10 flex items-center justify-between px-1">
    <div className="space-y-0.5 pl-2">
      {/* 뱃지 영역 - Lucide 아이콘과 한글 텍스트 결합 */}
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-0.5 text-[11px] font-semibold text-indigo-300">
        <Icon className="h-3.5 w-3.5" />
        {badgeLabel}
      </span>
      {/* 제목 및 설명 영역 */}
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{description}</p>
    </div>
    
    {/* 홈 버튼 - ArrowLeft 아이콘과 "홈" 텍스트 결합 */}
    <Link href="/dashboard">
      <Button 
        variant="outline" 
        className="rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/15 border-0 flex items-center gap-1.5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        홈
      </Button>
    </Link>
  </div>

  {/* 추가 정보가 있는 경우(예: 현재 사용자 스탯 등) 하단 보조 행으로 표시 */}
  {additionalRow && (
    <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-white/10 text-[11px]">
      {additionalRow}
    </div>
  )}
</section>
```

### 5-2. 세부 통일 지침
1. **중복된 텍스트 금지** - 뱃지(`badgeLabel`), 제목(`title`), 설명(`description`)에서 서로 중복되거나 무의미하게 반복되는 단어는 제거하여 핵심만 간결하게 표시합니다.
2. **홈 버튼 통일** - 모든 서브 페이지의 헤더 오른쪽 영역에는 대시보드로 복귀하는 **"홈"** 버튼을 고정 배치합니다. 버튼은 항상 `ArrowLeft` 아이콘을 앞에 배치하고 라벨은 `"홈"`으로 통일합니다 (`"대시보드"`, `"대시보드로 돌아가기"` 등 다른 텍스트 사용 금지).
3. **일관된 폰트 크기** - 제목은 `text-xl font-bold`, 뱃지는 `text-[11px] font-semibold`, 설명은 `text-xs text-slate-400`을 사용하여 페이지가 바뀌어도 시각적 균형이 깨지지 않도록 합니다.
4. **모바일 설명글 숨김 (공간 절약)** - 모바일 기기에서의 상단 헤더 세로폭을 줄이기 위해, 설명글 단락(`<p className="...">`)에는 반드시 `hidden sm:block` 클래스를 추가하여 모바일 환경에서는 노출되지 않도록 가려줍니다.
5. **모바일/컴팩트 화면 공간 절약 (인라인 괄호 표기)** - 경기 수 및 시간 정보가 제목/코트명 아래에 여러 줄로 표시되어 모바일 화면을 낭비하는 현상을 막기 위해, 코트 헤더의 경기 수는 `1코트(13경기)` 형식으로, 개별 매치의 일정/시간 정보는 `1코트(오후 01:30)` 형식과 같이 줄바꿈 및 아이콘(⏰) 없이 **인라인 괄호 표기법**으로 통일해 공간을 혁신적으로 절약합니다.
6. **제목 영역 좌측 여백 추가** - 히어로 카드 내부의 제목 및 배지가 카드 왼쪽 경계에 너무 바짝 밀착하여 답답하게 보이는 현상을 방지하기 위해, 제목 컬럼인 `<div className="space-y-0.5">` 컨테이너에는 반드시 `pl-2` 클래스를 추가하여 적절한 내부 여백을 확보합니다.
7. **상단 불필요한 공백 제거 (헤더와 히어로 카드 결합)** - 웹 앱의 상단 헤더(Header) 바와 히어로 카드(Hero Card) 사이의 빈 공간을 제거하여 시각적으로 바로 이어붙도록 만듭니다. 이를 위해 각 페이지의 가장 최상단 내부 레이아웃 컨테이너(`div`)의 padding-top 또는 margin-top 속성은 반드시 `pt-0` 또는 `mt-0`으로 설정합니다 (기존 `py-4`, `py-6`, `mt-6` 등 상단 패딩/마진이 존재하던 부분을 `pt-0 pb-4` 또는 `mt-0` 등으로 수정).
8. **모바일 화면 여백 최소화 (데이터 밀도 향상)** - 모바일 기기의 제한된 화면 공간에 최대한 많은 정보를 표시하고 답답하지 않도록 좌우/상하 여백을 최소화합니다.
   - 최상단 외부 레이아웃 컨테이너(`div`)의 좌우 패딩을 모바일에서는 `px-2.5`로 축소하고, 데스크탑에서만 `sm:px-5` 또는 `sm:px-6`을 적용합니다.
   - 각 콘텐츠 섹션 카드(`<section className="...">`)의 모바일 패딩을 `px-3 py-3`으로 통일하여 여백을 아낍니다.
   - 대시보드의 각 메뉴 카드 패딩은 모바일에서 `px-2.5 py-3` 또는 `px-3 py-3` 수준으로 낮추고, 텍스트 간 세로 간격(`mt-2` -> `mt-1` 등)을 함께 줄여 한 화면에 더 많은 메뉴 카드가 노출될 수 있도록 합니다.






