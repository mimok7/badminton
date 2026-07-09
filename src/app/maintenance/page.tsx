'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Settings, ExternalLink, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-[#0b0f19] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full text-center space-y-8">
        {/* Under Construction Graphic */}
        <div className="relative mx-auto w-72 h-72 drop-shadow-[0_20px_50px_rgba(59,130,246,0.3)] animate-float">
          <Image
            src="/maintenance_badminton.png"
            alt="Badminton Under Maintenance"
            fill
            className="object-contain rounded-3xl"
            priority
          />
        </div>

        {/* Message Card */}
        <div className="bg-[#111827]/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Settings className="h-3.5 w-3.5 animate-spin" />
            System Maintenance
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              시스템 점검 중입니다
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              더 안정적이고 쾌적한 매칭 서비스를 제공하기 위해<br />
              현재 서버 점검을 진행하고 있습니다.
            </p>
          </div>

          {/* Naver Band Announcement */}
          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-emerald-400">
              📢 기존 네이버 밴드를 이용해 주세요!
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              경기 공지 확인 및 소통은 점검 기간 동안<br />
              기존 배드민턴 클럽 네이버 밴드를 통해 정상 진행됩니다.
            </p>
            <div className="pt-2">
              <a
                href="https://band.us"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
              >
                네이버 밴드로 바로가기
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a
            href="https://band.us"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-lg shadow-emerald-600/20 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer border-0">
              네이버 밴드 바로가기
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>

          <Link href="/login" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full h-12 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 hover:text-white text-slate-300 font-bold px-8 transition active:scale-95 flex items-center justify-center">
              로그인 (테스트)
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} Badminton Club. All rights reserved.
        </p>
      </div>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
