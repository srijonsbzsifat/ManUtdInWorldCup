"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/players", label: "Players" },
  { href: "/matches", label: "Matches" },
  { href: "/groups", label: "Groups" },
  { href: "/news", label: "News" },
  { href: "/live", label: "Live" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-united-dark/85 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-14 h-14 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Image src="/manutd-crest.png" alt="Manchester United" width={44} height={44} className="object-contain w-auto h-9" />
          </div>
          <div className="leading-tight">
            <div className="text-sm sm:text-base font-semibold">
              Manchester United
            </div>
            <div className="text-[10px] sm:text-xs text-white/50 -mt-0.5">
              @ World Cup
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
