"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { getSupabaseClient } from "@/lib/supabase";
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  Home,
  Filter,
  BellOff,
} from "lucide-react";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

type FilterMode = "unread" | "all";

const TYPE_LABELS: Record<string, string> = {
  general: "일반 알림",
  match_preparation: "경기 준비",
  match_result: "경기 결과",
  schedule_change: "일정 변경",
  system: "시스템 알림",
  challenge: "도전 알림",
};

const TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-100 text-slate-700",
  match_preparation: "bg-indigo-100 text-indigo-700",
  match_result: "bg-emerald-100 text-emerald-700",
  schedule_change: "bg-amber-100 text-amber-700",
  system: "bg-purple-100 text-purple-700",
  challenge: "bg-rose-100 text-rose-700",
};

/** 마침표 뒤에 줄바꿈을 삽입하여 가독성을 높임 */
function formatMessageWithBreaks(message: string): React.ReactNode {
  // 마침표(.), 느낌표(!), 물음표(?) 뒤에 공백이 아닌 문자가 오면 줄바꿈
  const segments = message.split(/([.!?])\s+/g);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "." || seg === "!" || seg === "?") {
      current += seg;
      lines.push(current.trim());
      current = "";
    } else {
      current += seg;
    }
  }
  if (current.trim()) lines.push(current.trim());

  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx} className="block leading-relaxed">
          {line}
        </span>
      ))}
    </>
  );
}

export default function NotificationsPage() {
  const { user, loading } = useUser();
  const supabase = getSupabaseClient();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("unread");

  const fetchNotifications = async () => {
    if (!user) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/user/notifications");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
      }
      const { notifications: data } = await res.json();
      setNotifications(data || []);
    } catch (e: any) {
      setError(e.message || "알림을 불러오는 데 실패했습니다.");
    } finally {
      setFetching(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (e) {
      console.error("읽음 처리 실패:", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      console.error("전체 읽음 처리 실패:", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const channel = supabase
      .channel("user-notifications-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
          <span className="text-slate-600 font-medium text-sm">불러오는 중...</span>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayed =
    filter === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 pb-16">
      {/* ── 다크 그라디언트 헤더 ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 px-4 py-7 text-white shadow-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="mx-auto max-w-3xl flex flex-col gap-4 relative z-10">
          {/* 상단 네비 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">
                <Bell className="h-3 w-3" />
                알림 센터
              </span>
              <h1 className="text-2xl font-bold tracking-tight">
                공지사항 및 알림
              </h1>
            </div>
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition"
            >
              <Home className="h-3.5 w-3.5" />
              홈으로
            </Link>
          </div>

          {/* 미읽음 요약 카드 */}
          <div className="flex items-center justify-between rounded-2xl bg-white/10 border border-white/10 p-4 backdrop-blur-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-indigo-200 font-medium">
                읽지 않은 알림
              </span>
              <div className="flex items-center gap-1.5">
                <Bell className="h-5 w-5 text-amber-400" />
                <span className="text-2xl font-black text-amber-300">
                  {unreadCount}
                </span>
                <span className="text-sm font-semibold text-slate-200">개</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-2 text-xs font-semibold text-white transition"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  모두 읽음
                </button>
              )}
              <button
                onClick={fetchNotifications}
                disabled={fetching}
                className="flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className="mx-auto max-w-3xl px-4 py-5 space-y-4">
        {/* 오류 배너 */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
            <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* 필터 탭 */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex rounded-xl bg-white border border-slate-200 p-1 gap-1 shadow-sm">
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
                filter === "unread"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              읽지 않음
              {unreadCount > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    filter === "unread"
                      ? "bg-white/20 text-white"
                      : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
                filter === "all"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              전체
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filter === "all"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {notifications.length}
              </span>
            </button>
          </div>
        </div>

        {/* 로딩 */}
        {fetching && (
          <div className="text-center py-8 text-slate-400 text-sm">
            불러오는 중...
          </div>
        )}

        {/* 알림 없음 */}
        {!fetching && displayed.length === 0 && (
          <div className="rounded-2xl bg-white border border-slate-200/50 p-10 text-center shadow-sm">
            <BellOff className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-500">
              {filter === "unread"
                ? "읽지 않은 알림이 없습니다."
                : "알림이 없습니다."}
            </p>
            {filter === "unread" && notifications.length > 0 && (
              <button
                onClick={() => setFilter("all")}
                className="mt-3 text-xs text-indigo-600 font-semibold hover:underline"
              >
                전체 알림 보기 →
              </button>
            )}
          </div>
        )}

        {/* 알림 목록 */}
        {!fetching && displayed.length > 0 && (
          <div className="flex flex-col gap-3">
            {displayed.map((n) => {
              const typeLabel = TYPE_LABELS[n.type] ?? n.type;
              const typeColor =
                TYPE_COLORS[n.type] ?? "bg-slate-100 text-slate-600";

              return (
                <div
                  key={n.id}
                  className={`rounded-2xl border p-4 transition-all duration-200 ${
                    n.is_read
                      ? "bg-white border-slate-200"
                      : "bg-indigo-50/60 border-indigo-200 shadow-sm"
                  }`}
                >
                  {/* 헤더: 타입 뱃지 + 날짜 */}
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${typeColor}`}
                    >
                      <Bell className="h-3 w-3" />
                      {typeLabel}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {new Date(n.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>

                  {/* 제목 */}
                  <h3
                    className={`font-bold text-sm mb-1.5 ${
                      n.is_read ? "text-slate-700" : "text-indigo-900"
                    }`}
                  >
                    {n.title}
                  </h3>

                  {/* 내용 — 마침표 뒤 줄바꿈 */}
                  <div className="text-sm text-slate-600 space-y-0.5">
                    {formatMessageWithBreaks(n.message)}
                  </div>

                  {/* 읽음 버튼 */}
                  {!n.is_read && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition"
                      >
                        <Check className="h-3.5 w-3.5" />
                        읽음 처리
                      </button>
                    </div>
                  )}

                  {/* 읽은 상태 표시 */}
                  {n.is_read && (
                    <div className="mt-2 flex justify-end">
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <CheckCheck className="h-3.5 w-3.5" />
                        읽음
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
