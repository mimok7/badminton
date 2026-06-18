'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isAppInstalled() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function AppInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setInstalled(isAppInstalled());
    setDismissed(window.localStorage.getItem('badminton-install-prompt-dismissed') === 'true');

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      window.localStorage.removeItem('badminton-install-prompt-dismissed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    window.localStorage.setItem('badminton-install-prompt-dismissed', 'true');
  };

  const shouldShow = !installed && !dismissed;

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Smartphone className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">앱 설치를 권장합니다</p>
                <p className="mt-1 text-sm text-gray-600">
                  홈 화면에 추가하면 더 빠르게 접속할 수 있고, 앱처럼 바로 열 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="앱 설치 안내 닫기"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={handleInstall}
                disabled={!deferredPrompt}
                className={cn('w-full sm:w-auto')}
              >
                <Download className="size-4" />
                앱 설치
              </Button>
              <p className="text-xs text-gray-500">
                설치 버튼이 보이지 않으면 브라우저 메뉴에서 “홈 화면에 추가”를 사용해 주세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
