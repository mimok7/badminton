'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';

interface MatchAssignmentNotification {
  id: string;
  created_at: string;
  message: string;
  type: 'match_assigned' | 'match_updated' | 'match_cancelled';
  is_read: boolean;
}

export default function MatchNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<MatchAssignmentNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!user) return;

    const checkForNewMatches = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        
        // 오늘 배정된 경기 중 내가 참여한 경기가 있는지 확인
        const { data: todayMatches, error } = await supabase
          .from('match_schedules')
          .select('id, created_at, status')
          .eq('match_date', today)
          .eq('status', 'scheduled')
          .or(`team1_player1.eq.${user.id},team1_player2.eq.${user.id},team2_player1.eq.${user.id},team2_player2.eq.${user.id}`)
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // 최근 5분 내

        if (!error && todayMatches && todayMatches.length > 0) {
          // 새로운 경기 배정 알림 생성
          const newNotifications = todayMatches.map(match => ({
            id: `match_${match.id}`,
            created_at: match.created_at,
            message: '새로운 경기가 배정되었습니다! 대시보드에서 확인하세요.',
            type: 'match_assigned' as const,
            is_read: false
          }));

          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const uniqueNew = newNotifications.filter(n => !existingIds.has(n.id));
            return [...prev, ...uniqueNew];
          });

          if (newNotifications.length > 0) {
            setShowNotifications(true);
          }
        }
      } catch (error) {
        console.error('경기 알림 확인 오류:', error);
      }
    };

    // 초기 확인
    checkForNewMatches();

    // 30초마다 새 경기 확인
    const interval = setInterval(checkForNewMatches, 30000);

    return () => clearInterval(interval);
  }, [user, supabase]);

  const markAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
  };

  const dismissAll = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setShowNotifications(false);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (unreadCount === 0) {
    return null;
  }

  return (
    <>
      {/* 알림 버튼 */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative bg-yellow-500 hover:bg-yellow-600 text-white p-3 rounded-full shadow-lg transition-colors"
        >
          <span className="text-xl">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* 알림 패널 */}
      {showNotifications && (
        <div className="fixed top-16 right-4 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">📢 경기 알림</h3>
              <button
                onClick={dismissAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                모두 읽음
              </button>
            </div>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {notifications
              .filter(n => !n.is_read)
              .map(notification => (
                <div
                  key={notification.id}
                  className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl">
                      {notification.type === 'match_assigned' ? '🏆' : '📋'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(notification.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
          
          {notifications.filter(n => !n.is_read).length === 0 && (
            <div className="p-4 text-center text-gray-500">
              새로운 알림이 없습니다.
            </div>
          )}
        </div>
      )}
    </>
  );
}
