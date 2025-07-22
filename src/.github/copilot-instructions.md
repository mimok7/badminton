
# Copilot Instructions for Badminton App

## Overview
This is a Next.js 15 project using the App Router, TypeScript, and Supabase for authentication and data. UI is built with custom components in `components/ui/`. Main logic is under `src/app/` with route-based folders for each page (e.g., `login`, `signup`, `dashboard`, `profile`, `players`, `admin`).

## Architecture & Patterns
- **Pages**: Each route (e.g., `/login`, `/signup`, `/dashboard`, `/players`, `/admin`) is a folder in `src/app/` with a `page.tsx` file as the entry point.
- **UI Components**: Shared form elements (`Button`, `Input`, `Select`, `Form` etc.) are in `components/ui/` and imported using the `@/components/ui/` alias.
- **Authentication**: Uses Supabase (`lib/supabase.ts`) for sign up, login, and session management. Auth logic is handled in each page (see `login/page.tsx`, `signup/page.tsx`).
- **Admin**: Only admins can register new members (see `/admin`). Members log in with email and password, and can update their profile after login.
- **Profile**: Users can update their nickname and skill level in `/profile` (see `profile/page.tsx`).
- **Players/Matchmaking**: `/players` allows for attendance check and random match generation, using local state and custom logic.
- **Navigation**: Uses Next.js `useRouter` for navigation and session refresh after login/signup.
- **Styling**: Tailwind CSS utility classes are used throughout for styling.

## Developer Workflows
- **Build**: Standard Next.js build (`next build`).
- **Dev**: Start with `next dev` or `npm run dev` from the project root.
- **Supabase**: All auth and user management is via the Supabase client in `lib/supabase.ts`.
- **Component Usage**: Always use the custom UI components from `components/ui/` for forms and buttons to ensure consistent styling.
- **Admin Flow**: Admins can manage menus and members in `/admin` (see `admin/page.tsx`).

## Project Conventions
- **File Naming**: Page components are always named `page.tsx` inside their route folder.
- **Client Components**: Use `'use client'` at the top of files that use React hooks or browser APIs.
- **Import Aliases**: Use `@/lib/` and `@/components/ui/` for imports.
- **Error Handling**: Show user-facing errors with `alert()` in page components.
- **Navigation After Auth**: After successful login/signup, always redirect to `/dashboard` and call `router.refresh()` to update session state.
- **Profile/Skill Level**: User profile includes nickname and skill level (A/B/C/D/N), editable in `/profile`.
- **Player Grade**: For admin/member registration, grade options are "랍스타", "소갈비", "양갈비", "돼지갈비", "닭갈비".

## Example: Login & Signup Flow
- `src/app/login/page.tsx`:
  - Uses `supabase.auth.signInWithPassword` for login.
  - On success: `alert('로그인 성공!')`, then `router.push('/dashboard')` and `router.refresh()`.
- `src/app/signup/page.tsx`:
  - Uses `supabase.auth.signUp` for registration.
  - On success: `alert('회원가입이 완료되었습니다!')`, then `router.push('/profile')`.

## Key Files & Directories
- `src/app/` — Main app routes and logic
- `components/ui/` — Shared UI components (Button, Input, Form, Select, etc.)
- `lib/supabase.ts` — Supabase client setup

## Integration Points
- **Supabase**: All authentication and user data flows through the Supabase client.
- **Next.js Router**: Used for all navigation and session refreshes after auth events.
- **Profiles Table**: User profile data (nickname, skill level, role) is stored in the `profiles` table in Supabase.
- **Admin Table**: Menu and member management is handled via `dashboard_menus` and (optionally) a members table.


## Database Table Reference (Key Columns)

### profiles (사용자/회원)
| 컬럼명           | 타입         | 설명                        |
|------------------|-------------|-----------------------------|
| id               | uuid/string | 고유 식별자 (PK)            |
| username         | string      | 닉네임                      |
| email            | string      | 이메일(로그인용, unique)    |
| password_hash    | string      | 비밀번호 해시               |
| skill_level      | string      | 급수(A/B/C/D/N)             |
| grade            | string      | 등급(랍스타/소갈비/...)     |
| role             | string      | 'admin' or 'member'         |
| is_temp_password | boolean     | 임시 비밀번호 여부          |
| created_at       | timestamp   | 가입일                      |
| updated_at       | timestamp   | 정보 수정일                 |

### dashboard_menus (관리자 메뉴)
| 컬럼명         | 타입       | 설명                |
|----------------|-----------|---------------------|
| id             | uuid      | 고유 식별자 (PK)    |
| name           | string    | 메뉴명              |
| path           | string    | 라우트 경로         |
| description    | string    | 설명                |
| icon           | string    | 아이콘              |
| is_active      | boolean   | 활성화 여부         |
| display_order  | int       | 정렬 순서           |

---
테이블 구조는 실제 Supabase DB와 동기화되어야 하며, 컬럼명/타입이 다를 경우 실제 DB를 우선 참고하세요.

---

If you add new UI elements, place them in `components/ui/` and use the same export pattern as existing components. For new pages, follow the folder and file structure in `src/app/`.

---
**항상 데이터 모델 작업 시 `src/.github/table-schema.csv` 파일의 테이블/컬럼 구조를 참고하세요.**
