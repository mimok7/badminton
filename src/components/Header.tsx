'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <nav className="mx-auto flex h-12 w-full max-w-[1600px] items-center px-3 sm:px-4 lg:px-6">
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center hover:opacity-80">
            <Image 
              src="/badminton.png" 
              alt="Badminton Logo" 
              width={28} 
              height={28}
              sizes="28px"
              priority
            />
            <span className="ml-2 text-sm font-semibold leading-none w-max">라켓 뚱보단</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
