'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalAlert() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalAlert = window.alert;

    // window.alert 재정의
    window.alert = (msg: any) => {
      setMessage(String(msg || ''));
      setIsOpen(true);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  if (!isOpen) return null;

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
          {message}
        </div>
        
        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 text-xs transition active:scale-95 border-0 focus:outline-none"
          >
            확인
          </Button>
        </div>
      </div>
    </div>
  );
}
