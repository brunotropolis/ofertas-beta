"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import {
  Megaphone,
  Tag,
  List,
  Clock,
  CalendarDays,
  CalendarClock,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  { href: "/campanhas",   label: "Campanhas",    icon: Megaphone },
  { href: "/ofertas",     label: "Ofertas",      icon: Tag },
  { href: "/publicacoes", label: "Publicações",  icon: List },
  { href: "/fila",        label: "Fila",         icon: Clock },
  { href: "/calendario",  label: "Calendário",   icon: CalendarDays },
  { href: "/agendamento", label: "Agendamento",  icon: CalendarClock },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-zinc-950/60 backdrop-blur-xl flex flex-col border-r border-zinc-900/80 sticky top-0">
      <div className="px-5 py-6">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                active
                  ? "bg-gradient-to-r from-orange-500/15 to-transparent text-white"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-orange-500 shadow-[0_0_10px_rgba(255,107,53,0.6)]"
                />
              )}
              <Icon
                strokeWidth={1.5}
                className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-colors",
                  active ? "text-orange-400" : "text-zinc-500 group-hover:text-zinc-300"
                )}
              />
              <span className={cn("font-medium tracking-tight", active && "text-white")}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <Link
          href="/dashboard"
          className={cn(
            "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
            pathname.startsWith("/dashboard")
              ? "bg-gradient-to-r from-orange-500/15 to-transparent text-white"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
          )}
        >
          {pathname.startsWith("/dashboard") && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-orange-500 shadow-[0_0_10px_rgba(255,107,53,0.6)]"
            />
          )}
          <LayoutDashboard
            strokeWidth={1.5}
            className={cn(
              "w-[18px] h-[18px] shrink-0",
              pathname.startsWith("/dashboard") ? "text-orange-400" : "text-zinc-500 group-hover:text-zinc-300"
            )}
          />
          <span className="font-medium tracking-tight">Dashboard</span>
        </Link>
      </div>
    </aside>
  );
}
