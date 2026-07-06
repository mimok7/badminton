'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type DialogState = {
  type: 'alert' | 'confirm';
  message: string;
  onResolve: (value: boolean) => void;
};

export default function GlobalAlert() {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;

    window.alert = (msg: any) => {
      return new Promise<void>((resolve) => {
        setDialog({
          type: 'alert',
          message: String(msg || ''),
          onResolve: () => {
            setDialog(null);
            resolve();
          }
        });
      }) as any;
    };

    window.confirm = (msg: any) => {
      return new Promise<boolean>((resolve) => {
        setDialog({
          type: 'confirm',
          message: String(msg || ''),
          onResolve: (val) => {
            setDialog(null);
            resolve(val);
          }
        });
      }) as any;
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, []);

  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm transition-all duration-300">
      <div className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.3)] border border-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            🏸 즐거운 배드민턴 경기
          </span>
        </div>
        
        {/* Content */}
        <div className="text-[14px] text-slate-600 whitespace-pre-wrap leading-relaxed px-1">
          {dialog.message}
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-1">
          {dialog.type === 'confirm' ? (
            <>
              <Button
                type="button"
                onClick={() => dialog.onResolve(false)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold px-4 py-2 text-xs transition active:scale-95"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => dialog.onResolve(true)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 text-xs transition active:scale-95 border-0 focus:outline-none"
              >
                확인
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={() => dialog.onResolve(true)}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 text-xs transition active:scale-95 border-0 focus:outline-none"
            >
              확인
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
