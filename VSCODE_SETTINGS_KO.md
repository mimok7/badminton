# VS Code / Antigravity 환경 설정 번역서

본 문서는 현재 설정된 `settings.json`의 구성 옵션을 한글로 번역하여 정리한 문서입니다.

---

## 🔍 1. 핵심 에디터 및 UI 설정

| 설정 키 (Settings Key) | 설정 값 | 한글 설명 |
| :--- | :--- | :--- |
| `editor.fontSize` | `18` | **에디터 본문의 글씨 크기**입니다. (기존 16에서 눈 피로 방지를 위해 18로 상향됨) |
| `window.zoomLevel` | `0.5` | **에디터 전체 화면 배율(줌 레벨)**입니다. 사이드바, 메뉴, 채팅창 등의 전반적인 폰트 및 요소가 한 단계 확대됩니다. |
| `files.autoSave` | `"afterDelay"` | **파일 자동 저장 방식**입니다. 수정 후 일정 시간이 지나면 자동으로 저장합니다. |
| `workbench.editor.enablePreview` | `false` | **파일 미리보기 모드 비활성화**입니다. 클릭한 파일이 탭에 항상 유지되어 열리도록 합니다. |
| `workbench.colorTheme` | `"Dark Modern"` | **에디터 색상 테마**입니다. 현재 다크 테마인 `Dark Modern`이 적용되어 있습니다. |
| `workbench.secondarySideBar.defaultVisibility` | `"hidden"` | **우측 보조 사이드바의 기본 표시 상태**를 숨김(`"hidden"`)으로 설정합니다. |

---

## 🛠️ 2. Git 및 버전 관리 설정

| 설정 키 (Settings Key) | 설정 값 | 한글 설명 |
| :--- | :--- | :--- |
| `git.enableSmartCommit` | `true` | 스테이징된 변경 사항이 없을 때, 커밋 시 자동으로 모든 변경 사항을 스테이징하여 커밋합니다. |
| `git.autofetch` | `true` | 원격 저장소의 최신 변경 내역을 주기적으로 자동 페치(Fetch)해옵니다. |
| `git.confirmSync` | `false` | 원격 저장소와의 동기화(Sync) 작업을 실행할 때 확인창을 띄우지 않습니다. |
| `git.openRepositoryInParentFolders` | `"never"` | 상위 폴더에 있는 Git 리포지토리를 열지 않도록 제어합니다. |

---

## 🤖 3. AI 및 Copilot 에이전트 설정

| 설정 키 (Settings Key) | 설정 값 | 한글 설명 |
| :--- | :--- | :--- |
| `github.copilot.nextEditSuggestions.enabled` | `true` | GitHub Copilot의 다음 편집 자동 추천 제안 기능을 활성화합니다. |
| `chat.agent.maxRequests` | `250` | AI 에이전트 대화당 요청 가능한 최대 횟수 제한(250회)을 설정합니다. |
| `geminicodeassist.agentYoloMode` | `true` | Gemini Code Assist의 욜로(Yolo) 모드를 활성화하여 추가 확인 단계를 건너뛰고 신속히 실행합니다. |
| `chat.mcp.gallery.enabled` | `true` | MCP(Model Context Protocol) 도구의 갤러리 탐색 기능을 활성화합니다. |
| `chat.viewSessions.orientation` | `"stacked"` | 에이전트 대화 목록 뷰의 정렬 형태를 스택(Stacked) 형식으로 배치합니다. |
| `github.copilot.enable` | `{"*": true, "plaintext": false...}` | 특정 언어/파일 포맷별로 GitHub Copilot의 활성화 여부를 세부 정의합니다. |

---

## 💻 4. 터미널 및 자동 실행 설정

| 설정 키 (Settings Key) | 설정 값 | 한글 설명 |
| :--- | :--- | :--- |
| `task.allowAutomaticTasks` | `"on"` | 프로젝트 폴더가 열렸을 때 정의된 자동 태스크(스크립트 등)를 사용자 확인 없이 자동으로 실행하도록 허용합니다. |
| `explorer.confirmDelete` | `false` | 파일 탐색기에서 파일을 휴지통에 버리거나 삭제할 때 경고 팝업창을 띄우지 않습니다. |
| `chat.tools.terminal.autoApprove` | `{...}` | AI 에이전트가 터미널에서 `git`, `npm install` 등 지정된 도구 명령어를 실행할 때 확인 단계 없이 자동으로 승인하는 목록 설정입니다. |

---

## ⚙️ 설정 변경 방법

### 방법 A: 설정 UI 사용 (권장)
1. 단축키 `Ctrl + ,` (쉼표)를 눌러 **설정** 창을 엽니다.
2. 검색창에 원하는 항목(예: `font size` 혹은 `zoom level`)을 입력합니다.
3. 편리하게 UI 슬라이더나 수치 값을 조절합니다.

### 방법 B: `settings.json` 파일 직접 편집
1. 단축키 `Ctrl + Shift + P`를 눌러 명령 팔레트를 엽니다.
2. `Preferences: Open User Settings (JSON)`을 검색하여 선택합니다.
3. 열린 JSON 설정 파일에서 각 키의 값을 변경한 뒤 저장(`Ctrl + S`)합니다.
   * 예: 에디터 폰트 크기를 더 키우고 싶은 경우 `"editor.fontSize": 20`과 같이 수정합니다.
