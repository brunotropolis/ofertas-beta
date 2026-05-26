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
    <aside
      className="w-64 min-h-screen flex flex-col sticky top-0 border-r border-orange-900/40"
      style={{
        background:
          "linear-gradient(180deg, #2b1207 0%, #1a0c05 70%, #150904 100%)",
      }}
    >
      <div className="px-5 py-6 border-b border-orange-900/30">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} label={label} icon={Icon} pathname={pathname} />
        ))}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-orange-900/30">
        <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} pathname={pathname} />
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  pathname: string;
}) {
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all",
        active
          ? "bg-zinc-950 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_4px_16px_-6px_rgba(0,0,0,0.6)]"
          : "text-orange-100/70 hover:text-white hover:bg-black/30"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] -ml-3.5 rounded-r-full bg-orange-500 shadow-[0_0_12px_rgba(255,107,53,0.7)]"
        />
      )}
      <Icon
        strokeWidth={1.5}
        className={cn(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active ? "text-orange-400" : "text-orange-200/60 group-hover:text-orange-300"
        )}
      />
      <span className="font-medium tracking-tight">{label}</span>
    </Link>
  );
}
