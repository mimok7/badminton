# Antigravity IDE 환경 설정 번역서

본 문서는 현재 사용 중이신 **Antigravity IDE**의 `settings.json` 구성 옵션 및 주요 설정값을 한글로 번역하여 정리한 문서입니다.

---

## 🔍 1. 현재 적용된 Antigravity IDE 설정

| 설정 키 (Settings Key) | 설정 값 | 한글 설명 |
| :--- | :--- | :--- |
| `editor.fontSize` | `18` | **에디터 본문의 글씨 크기**입니다. (눈 피로 방지를 위해 18로 확대 설정됨) |
| `window.zoomLevel` | `0.5` | **Antigravity 프로그램 전체 화면 배율(줌 레벨)**입니다. 에디터 본문뿐만 아니라 좌측 탐색기, 메뉴, 터미널, AI 채팅 패널 전체의 글씨 크기가 한 단계 커집니다. |
| `git.autofetch` | `true` | 원격 저장소의 최신 변경 내역을 주기적으로 자동 페치(Fetch)해옵니다. |
| `security.promptForLocalFileProtocolHandling` | `false` | 로컬 파일 프로토콜 처리 시 보안 경고 팝업창을 띄우지 않도록 설정합니다. |

---

## ⚙️ 설정 변경 및 조정 방법

### 방법 A: 설정 UI 사용 (가장 간단함)
1. **Antigravity IDE** 화면에서 단축키 `Ctrl + ,` (쉼표)를 눌러 설정 창을 엽니다.
2. 상단 검색창에 `font size` 또는 `zoom level`을 검색합니다.
3. 수치 값을 본인의 눈에 가장 편안한 크기로 조절합니다. (예: 줌 레벨을 `1`로 변경)

### 방법 B: `settings.json` 직접 편집
1. 단축키 `Ctrl + Shift + P`를 눌러 명령 창을 엽니다.
2. `Preferences: Open User Settings (JSON)`을 검색하여 선택합니다.
3. 열린 JSON 설정 파일에서 각 키의 값을 변경한 후 저장(`Ctrl + S`)하면 실시간으로 반영됩니다.
   * **파일 저장 경로:** `C:\Users\tvxqc\AppData\Roaming\Antigravity IDE\User\settings.json`
